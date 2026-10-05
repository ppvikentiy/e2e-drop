import { useEffect, useRef, useState } from 'react';
import { checkPairCode, claimFinalize, createDrop, getUploadStatus, putManifest, uploadEncryptedFile } from '../api.js';
import { canBackgroundUpload, getBackgroundRegistration, startBackgroundFetch, watchBackgroundFetch, writeCipherFile } from '../bgUpload.js';
import { removeCipherDir } from '../bgFiles.js';
import { deleteSession, listSessions, markReady, saveSession, updateFileProgress } from '../uploadStore.js';
import FileList from '../components/FileList.jsx';
import Kw from '../components/Kw.jsx';
import ErrorText from '../components/ErrorText.jsx';
import ResumePrompt from '../components/ResumePrompt.jsx';
import SharePanel from '../components/SharePanel.jsx';
import Window from '../components/Window.jsx';
import { setNavigationBlock } from '../router.jsx';
import { consumeQueuedFiles } from '../pendingFiles.js';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { makeThumbnail } from '../thumbnail.js';
import { takeSharedFiles, useOnline } from '../pwa.js';
import {
  DOWNLOAD_OPTIONS,
  EXPIRY_OPTIONS,
  MAX_DOWNLOADS,
  MAX_FILES,
  MAX_FILE_SIZE,
  filesLabel,
  formatDuration,
  formatSize,
  formatPairCode,
  formatSpeed,
  normalizePairCode,
  renamePasted,
} from '../utils.js';

let nextId = 1;
const SPEED_WINDOW_MS = 4000;
// The password takes part in encryption (VDE2), so a short one is easy to guess offline.
const MIN_PASSWORD = 8;
const passwordLength = (value) => [...value.normalize('NFKC')].length;

function resultFrom(session, final) {
  const files = session.files || [];
  return {
    token: final.token,
    expiresAt: final.expiresAt,
    maxDownloads: final.maxDownloads,
    fileCount: files.length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    hasPassword: Boolean(session.hasPassword),
    sentToComputer: Boolean(session.pair),
    key: session.key || undefined,
  };
}

function Step({ n, simple, flag, label, simpleLabel, badge, children }) {
  return (
    <div className="setting">
      <div className="setting-label">
        {simple ? (
          <>
            <span className="step-badge">{badge}</span> {simpleLabel}
          </>
        ) : (
          <>
            <span className="flag">{flag}</span> {label}
          </>
        )}
      </div>
      {children}
    </div>
  );
}

export default function UploadPage() {
  const simple = useSimple();
  const t = useT();
  const online = useOnline();
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [expiry, setExpiry] = useState('1d');
  const [downloadsMode, setDownloadsMode] = useState('1');
  const [customDownloads, setCustomDownloads] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState('select');
  const [progress, setProgress] = useState([]);
  const [rate, setRate] = useState(null);
  const [result, setResult] = useState(null);
  const [transport, setTransport] = useState(null);
  // Pair mode: the files go to a computer that is showing a QR code, not to a shareable link. The
  // computer put the encryption key in the QR's fragment; we read it here and never send it anywhere.
  const [pairCode, setPairCode] = useState(() => normalizePairCode(new URLSearchParams(window.location.search).get('pair')));
  const [pairKey] = useState(() => (window.location.hash ? window.location.hash.replace(/^#/, '') : null));
  const [pairError, setPairError] = useState('');
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  const phaseRef = useRef(phase);
  const samplesRef = useRef([]);
  itemsRef.current = items;
  phaseRef.current = phase;

  useEffect(() => {
    if (phase !== 'uploading' || transport === 'background') {
      setNavigationBlock(null);
      return;
    }
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    setNavigationBlock(
      transport === 'prep'
        ? 'Подготовка к отправке ещё идёт. Уйти со страницы?'
        : 'Загрузка ещё идёт. Прервать её и уйти со страницы?',
    );
    return () => {
      window.removeEventListener('beforeunload', warn);
      setNavigationBlock(null);
    };
  }, [phase, transport]);

  // Validate the scanned code before the person picks any files, then clear it from the address bar.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('pair')) return;
    window.history.replaceState(null, '', '/upload');
    if (!pairCode || !pairKey) {
      setPairCode(null);
      setPairError('Нет ключа в ссылке. [[Наведите камеру на QR-код]] на компьютере.');
      return;
    }
    checkPairCode(pairCode).catch((e) => {
      setPairCode(null);
      setPairError(e.status === 404 ? 'Код устарел или уже использован. [[Получите новый]] на компьютере.' : e.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList) {
    const problems = [];
    const next = [...itemsRef.current];
    const added = [];
    for (const file of fileList) {
      if (next.some((i) => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)) {
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        problems.push(`«${file.name}» больше 500 МБ. [[Выберите файл меньше]].`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        problems.push(`Максимум ${MAX_FILES} файлов. [[Уберите лишнее]] — «${file.name}» не добавлен.`);
        continue;
      }
      const item = { id: nextId++, file, thumb: null };
      next.push(item);
      added.push(item);
    }
    itemsRef.current = next;
    setItems(next);
    setErrors(problems);
    for (const item of added) {
      makeThumbnail(item.file).then((thumb) => {
        if (thumb) setItems((list) => list.map((i) => (i.id === item.id ? { ...i, thumb } : i)));
      });
    }
  }

  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;

  useEffect(() => {
    const files = consumeQueuedFiles();
    if (files?.length) addFilesRef.current(files);
  }, []);

  useEffect(() => {
    const onPaste = (e) => {
      if (phaseRef.current !== 'select') return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      addFilesRef.current(files.map(renamePasted));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Files shared from another app via the PWA Share Target (see sw.js).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('shared')) return;
    window.history.replaceState(null, '', '/upload');
    takeSharedFiles().then((files) => {
      if (files.length) addFilesRef.current(files.map(renamePasted));
    });
  }, []);

  function removeItem(id) {
    setItems(items.filter((i) => i.id !== id));
    setErrors([]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (phase === 'select') addFiles(e.dataTransfer.files);
  }

  const maxDownloads = downloadsMode === 'custom' ? Number(customDownloads) : Number(downloadsMode);
  const downloadsValid = Number.isInteger(maxDownloads) && maxDownloads >= 1 && maxDownloads <= MAX_DOWNLOADS;
  const passwordValid = pairCode || !usePassword || passwordLength(password) >= MIN_PASSWORD;
  const canShare = items.length > 0 && downloadsValid && passwordValid && online && phase === 'select';
  const totalSize = items.reduce((s, i) => s + i.file.size, 0);
  const uploaded = progress.reduce((s, v) => s + v, 0);

  useEffect(() => {
    if (phase !== 'uploading') return;
    const now = performance.now();
    const samples = samplesRef.current;
    samples.push({ t: now, bytes: uploaded });
    while (samples.length > 2 && now - samples[0].t > SPEED_WINDOW_MS) samples.shift();
    const first = samples[0];
    if (uploaded < first.bytes) {
      samplesRef.current = [{ t: now, bytes: uploaded }];
      return;
    }
    const elapsed = now - first.t;
    if (elapsed < 700) return;
    const speed = ((uploaded - first.bytes) / elapsed) * 1000;
    setRate((prev) => (prev && now - prev.at < 500 ? prev : { speed, at: now }));
  }, [uploaded, phase]);

  const [resumeOffer, setResumeOffer] = useState(null);
  const sessionRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const finishingRef = useRef(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function finishDrop(session) {
    const id = session.dropId;
    const existing = finishingRef.current.get(id);
    if (existing) return existing;
    const job = (async () => {
      const final = await claimFinalize(id, session.uploadSecret);
      await markReady(id, { token: final.token, expiresAt: final.expiresAt, maxDownloads: final.maxDownloads });
      await removeCipherDir(id);
      if (!mountedRef.current) return;
      setTransport(null);
      setResult(resultFrom(session, final));
      setPhase('done');
    })();
    finishingRef.current.set(id, job);
    try {
      await job;
    } finally {
      if (finishingRef.current.get(id) === job) finishingRef.current.delete(id);
    }
  }

  async function filesAlreadyUploaded(session) {
    for (const file of session.files) {
      try {
        const status = await getUploadStatus(session.dropId, file.id, session.uploadSecret);
        if (!status.uploaded) return false;
      } catch (err) {
        if (err.status === 404) {
          await deleteSession(session.dropId);
          throw Object.assign(new Error('Эту раздачу уже удалили. Начните заново.'), { status: 404 });
        }
        return false;
      }
    }
    return session.files.length > 0;
  }

  async function attachJob(session, job) {
    sessionRef.current = session;
    if (!mountedRef.current) return;
    setErrors([]);
    setResumeOffer(null);
    setTransport('background');
    setPhase('uploading');
    setItems(session.files.map((file) => ({ id: file.id, file: { name: file.name, size: file.size }, thumb: null })));
    setProgress(session.files.map((file) => file.uploadedBytes || 0));
    setRate(null);
    samplesRef.current = [];
    const { ciphertextLength } = await import('../crypto/vde2.js');
    const cipherSizes = session.files.map((file) => file.cipherSize || ciphertextLength(file.size));
    const plainSizes = session.files.map((file) => file.size);
    try {
      if (job.result !== 'success') {
        const result = await watchBackgroundFetch(job, {
          cipherSizes,
          plainSizes,
          onProgress: (plains) => {
            if (mountedRef.current) setProgress(plains);
          },
        });
        if (!mountedRef.current) return;
        if (result === 'failure') {
          setItems([]);
          setTransport(null);
          setPhase('select');
          setResumeOffer(session);
          return;
        }
      }
      await finishDrop(session);
    } catch (err) {
      setItems([]);
      if (err && err.status !== 404) err.keepSession = true;
      if (mountedRef.current) failUpload(err, session);
    }
  }

  // ctx = { master, dropId }: every file's key is derived from the master key and the file's id.
  async function uploadAll(drop, files, ctx) {
    const vde = await import('../crypto/vde2.js');
    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const serverFile = drop.files[idx];
      const common = {
        dropId: drop.dropId,
        fileId: serverFile.id,
        secret: drop.uploadSecret,
        file,
        signal: abortRef.current?.signal,
        onProgress: (loaded) => {
          setProgress((p) => (p[idx] === loaded ? p : p.map((v, j) => (j === idx ? loaded : v))));
          // Throttle IndexedDB writes to avoid thrashing on tiny progress events.
          const now = performance.now();
          const last = file.__lastSave || 0;
          if (loaded === file.size || now - last > 1500) {
            file.__lastSave = now;
            updateFileProgress(drop.dropId, serverFile.id, loaded).catch(() => {});
          }
        },
      };
      const cipher = await vde.fileCipher(ctx.master, ctx.dropId, serverFile.id, file.size);
      await uploadEncryptedFile({ ...common, cipher });
    }
  }

  // Encrypts to disk, then lets Chrome finish the upload after the app is closed.
  // Throws {fallback:true} when the background job never started, so the caller can use the page upload.
  async function sendViaBackground(reg, drop, files, ctx, session) {
    const vde = await import('../crypto/vde2.js');
    setTransport('prep');
    const parts = [];
    for (let idx = 0; idx < files.length; idx++) {
      const serverFile = drop.files[idx];
      let done = false;
      try {
        const status = await getUploadStatus(drop.dropId, serverFile.id, drop.uploadSecret);
        done = Boolean(status.uploaded);
      } catch (err) {
        if (err.status === 404) throw err;
      }
      if (done) {
        setProgress((current) => current.map((value, j) => (j === idx ? files[idx].size : value)));
        continue;
      }
      let body;
      try {
        body = await writeCipherFile({
          dropId: drop.dropId,
          fileId: serverFile.id,
          file: files[idx],
          cipher: await vde.fileCipher(ctx.master, ctx.dropId, serverFile.id, files[idx].size),
          signal: abortRef.current?.signal,
          onPlain: (loaded) => {
            setProgress((current) => (current[idx] === loaded ? current : current.map((value, j) => (j === idx ? loaded : value))));
          },
        });
      } catch (err) {
        if (!err.aborted && err.status !== 404) err.fallback = true;
        throw err;
      }
      parts.push({ id: serverFile.id, body });
    }
    if (parts.length === 0) {
      await finishDrop(session);
      return;
    }
    const bgSession = { ...session, bg: true };
    sessionRef.current = bgSession;
    let started = false;
    try {
      await saveSession(bgSession);
      const job = await startBackgroundFetch(reg, { dropId: drop.dropId, secret: drop.uploadSecret, parts });
      started = true;
      samplesRef.current = [];
      setTransport('background');
      const { ciphertextLength } = vde;
      const result = await watchBackgroundFetch(job, {
        cipherSizes: session.files.map((file) => file.cipherSize || ciphertextLength(file.size)),
        plainSizes: session.files.map((file) => file.size),
        onProgress: (plains) => {
          if (mountedRef.current) setProgress(plains);
        },
      });
      if (result === 'failure') {
        throw Object.assign(new Error('Отправка прервалась. Выберите те же файлы, чтобы продолжить.'), { keepSession: true });
      }
    } catch (err) {
      if (!started && !err.keepSession && err.status !== 404 && !err.aborted) err.fallback = true;
      throw err;
    }
    try {
      await finishDrop(session);
    } catch (err) {
      err.keepSession = true;
      throw err;
    }
  }

  async function sendFiles(drop, files, ctx, session) {
    const cipherTotal = session.files.reduce((sum, file) => sum + (file.cipherSize || file.size), 0);
    const reg = await canBackgroundUpload(cipherTotal);
    if (reg) {
      try {
        await sendViaBackground(reg, drop, files, ctx, session);
        return;
      } catch (err) {
        if (!err.fallback) throw err;
        if (mountedRef.current) setTransport(null);
        await removeCipherDir(drop.dropId);
        await saveSession({ ...session, bg: false });
      }
    }
    await uploadAll(drop, files, ctx);
    try {
      await finishDrop(session);
    } catch (err) {
      err.keepSession = true;
      throw err;
    }
  }

  function failUpload(err, session) {
    setTransport(null);
    setItems((list) => (list.some((item) => typeof item.file?.slice !== 'function') ? [] : list));
    if (err?.aborted) {
      setPhase('select');
      return;
    }
    if (err?.status === 404) {
      if (session) deleteSession(session.dropId).catch(() => {});
      setErrors(['Эту раздачу уже удалили. [[Начните заново]].']);
    } else if (err?.keepSession && session) {
      setResumeOffer(session);
      setErrors([err.message]);
    } else {
      setErrors([err.message || 'Файлы не отправились, причина неизвестна. [[Попробуйте ещё раз]].']);
    }
    setPhase('select');
  }

  async function share() {
    if (!canShare) return;
    setPhase('uploading');
    setErrors([]);
    setProgress(items.map(() => 0));
    setRate(null);
    samplesRef.current = [];
    abortRef.current = new AbortController();
    try {
      // VDE2: file contents are encrypted in the browser. In link mode a fresh link key is generated and
      // placed in the share link's fragment; in pair mode it comes from the computer's QR code. The
      // server never receives the link key or the password. VDE2-5pr: names, types and previews travel
      // only inside the sealed manifest; the server learns the number of files and their sizes.
      const vde = await import('../crypto/vde2.js');
      const linkKey = pairCode ? vde.keyFromString(pairKey) : vde.generateLinkKey();
      if (!linkKey) throw new Error('Код не подошёл. [[Отсканируйте QR-код]] на компьютере заново.');
      const keyString = pairCode ? null : vde.keyToString(linkKey); // pair mode: the computer already has it
      const withPassword = !pairCode && usePassword;
      const kdf = withPassword ? vde.newKdfParams() : null;
      const drop = await createDrop({
        files: items.map((i) => ({ size: i.file.size })),
        expiry,
        maxDownloads,
        ...(kdf ? { password: { salt: kdf.salt, iterations: kdf.iterations } } : {}),
        ...(pairCode ? { pairCode } : {}),
      });

      // The master key binds the link key (and the password, if any) to the id the server assigned.
      const master = await vde.deriveMaster(linkKey, drop.dropId, kdf ? { password, ...kdf } : null);
      const thumbs = await Promise.all(
        items.map((i, idx) => (i.thumb ? vde.encryptThumb(master, drop.dropId, drop.files[idx].id, i.thumb) : null)),
      );
      const manifest = vde.buildManifest({
        dropId: drop.dropId,
        kdf,
        files: drop.files.map((f, idx) => ({
          id: f.id,
          name: vde.cleanFileName(items[idx].file.name),
          type: vde.cleanFileType(items[idx].file.type),
          size: f.size,
          thumb: thumbs[idx],
        })),
      });
      await putManifest(drop.dropId, drop.uploadSecret, {
        sealed: vde.bytesToBase64(await vde.sealManifest(master, drop.dropId, vde.manifestBytes(manifest))),
        ...(kdf ? { gateHash: await vde.gateHash(await vde.gateToken(master, drop.dropId)) } : {}),
      });

      const session = {
        dropId: drop.dropId,
        uploadSecret: drop.uploadSecret,
        expiry,
        maxDownloads,
        hasPassword: withPassword,
        pair: Boolean(pairCode),
        key: keyString, // the link key, stored locally only, to show the link again
        // The derived master key, kept locally only while the upload is unfinished, so it can resume
        // after a reload without asking for the password again. The password itself is never stored.
        master: vde.keyToString(master),
        files: drop.files.map((f, idx) => ({
          id: f.id,
          name: items[idx].file.name, // the user's real names, to match re-picked files on resume
          size: items[idx].file.size, // plaintext size (matches the File blob)
          cipherSize: f.cipherSize,
          lastModified: items[idx].file.lastModified,
          uploadedBytes: 0,
        })),
      };
      sessionRef.current = session;
      await saveSession(session);
      await sendFiles(drop, items.map((item) => item.file), { master, dropId: drop.dropId }, session);
    } catch (err) {
      failUpload(err, sessionRef.current);
    }
  }

  async function resumeWith(files) {
    if (!resumeOffer) return;
    const session = resumeOffer;
    setResumeOffer(null);
    setPhase('uploading');
    setErrors([]);
    setProgress(session.files.map((f) => f.uploadedBytes || 0));
    setRate(null);
    samplesRef.current = [];
    abortRef.current = new AbortController();
    try {
      const drop = {
        dropId: session.dropId,
        uploadSecret: session.uploadSecret,
        files: session.files.map(({ id, name, size }) => ({ id, name, size })),
      };
      const vde = await import('../crypto/vde2.js');
      // A session from before VDE2 has no master key: its drop can no longer be finished.
      const master = session.master ? vde.keyFromString(session.master) : null;
      if (!master) {
        await deleteSession(session.dropId);
        throw new Error('Продолжить нечем: ключ этой раздачи потерян. [[Начните заново]].');
      }
      session.files = session.files.map((file) => ({ ...file, cipherSize: file.cipherSize || vde.ciphertextLength(file.size) }));
      sessionRef.current = session;
      await sendFiles(drop, files, { master, dropId: session.dropId }, session);
    } catch (err) {
      failUpload(err, session);
    }
  }

  async function dismissResume() {
    if (!resumeOffer) return;
    await deleteSession(resumeOffer.dropId);
    setResumeOffer(null);
    setErrors([]);
  }

  function reset() {
    setItems([]);
    setPassword('');
    setUsePassword(false);
    setResult(null);
    setProgress([]);
    setTransport(null);
    setPairCode(null); // a code serves one transfer
    setPhase('select');
  }

  const loadGen = useRef(0);
  useEffect(() => {
    const gen = ++loadGen.current;
    const alive = () => gen === loadGen.current && mountedRef.current;
    (async () => {
      const sessions = await listSessions();
      if (!alive()) return;
      const pending = sessions.find((session) => session.status !== 'ready');
      if (pending?.bg) {
        const reg = await getBackgroundRegistration();
        const job = reg && (await reg.backgroundFetch.get(pending.dropId));
        if (!alive()) return;
        if (job && job.result !== 'failure') {
          await attachJob(pending, job);
          return;
        }
        try {
          if (await filesAlreadyUploaded(pending)) {
            if (alive()) await finishDrop(pending);
            return;
          }
        } catch (err) {
          if (!alive()) return;
          if (err.status === 404) {
            setErrors([err.message]);
            return;
          }
        }
      }
      if (!alive()) return;
      if (pending) setResumeOffer(pending);
    })();
  }, []);

  useEffect(() => {
    const onMsg = (event) => {
      if (event.data?.type !== 'vd-bg-ready') return;
      const dropId = event.data.dropId;
      if (phaseRef.current === 'uploading' && sessionRef.current?.dropId === dropId) {
        finishDrop(sessionRef.current).catch((err) => failUpload(err, sessionRef.current));
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  if (phase === 'done' && result?.sentToComputer) {
    return (
      <Window title={t.uploaded}>
        <h1>Файлы отправлены на компьютер</h1>
        <p>
          {filesLabel(result.fileCount)} · {formatSize(result.totalSize)}. Страница на компьютере откроется сама.
        </p>
        <button type="button" className="btn btn-primary important" onClick={reset}>
          {simple ? t.sendMore : 'Отправить ещё файлы'}
        </button>
      </Window>
    );
  }

  if (phase === 'done' && result) {
    return (
      <SharePanel result={result} onReset={reset} />
    );
  }

  const uploading = phase === 'uploading';
  const fraction = totalSize > 0 ? Math.min(1, uploaded / totalSize) : 0;
  const percent = Math.floor(fraction * 100);
  const eta = rate && rate.speed > 0 ? (totalSize - uploaded) / rate.speed : null;
  const needFiles = items.length === 0;

  let blocker = null;
  if (!online) {
    blocker = (
      <>
        <Kw>Нет интернета</Kw>
      </>
    );
  } else if (needFiles) {
    blocker = (
      <>
        Сначала <Kw>выберите файлы</Kw>
      </>
    );
  } else if (!downloadsValid) {
    blocker = (
      <>
        Число скачиваний: <Kw>от 1 до {MAX_DOWNLOADS}</Kw>
      </>
    );
  } else if (!passwordValid) {
    blocker = (
      <>
        Пароль: <Kw>не короче {MIN_PASSWORD} символов</Kw>
      </>
    );
  }

  if (resumeOffer && phase === 'select') {
    return <ResumePrompt session={resumeOffer} onResume={resumeWith} onDismiss={dismissResume} />;
  }

  return (
    <Window title={t.send}>
      <div>
        <h1>{t.sendFiles}</h1>
        {!simple && (
          <p className="muted">До {MAX_FILES} файлов, каждый до 500 МБ. Несколько файлов скачиваются одним ZIP-архивом.</p>
        )}
      </div>

      {!uploading && pairCode && (
        <div className="pair-banner" role="status">
          <span>
            Файлы появятся на компьютере с кодом <strong className="mono">{formatPairCode(pairCode)}</strong>
          </span>
          <button type="button" className="btn btn-link" onClick={() => setPairCode(null)}>
            отмена
          </button>
        </div>
      )}

      {phase === 'select' && pairError && !pairCode && (
        <div className="alert alert-error">
          <ErrorText text={pairError} />
        </div>
      )}

      {simple && (
        <div className="setting-label">
          <span className="step-badge">{t.step1}</span> {t.simpleStep1}
        </div>
      )}

      {!uploading && items.length < MAX_FILES && (
        <div
          className={`dropzone${dragging ? ' dragging' : ''}${simple && needFiles ? ' important' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <div className="dropzone-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 16V5m0 0l-4.5 4.5M12 5l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 15v2.5A1.5 1.5 0 006.5 19h11a1.5 1.5 0 001.5-1.5V15" strokeLinecap="round" />
            </svg>
          </div>
          {simple ? (
            <>
              <div className="dropzone-title">
                <Kw>{items.length ? t.addFiles : t.pickFiles}</Kw>
              </div>
              <div className="muted">{t.fileLimits}</div>
            </>
          ) : (
            <>
              <div className="dropzone-title">Перетащите файлы сюда</div>
              <div className="muted small">
                или нажмите, чтобы выбрать
                <span className="paste-hint">
                  {' '}
                  · <kbd>Ctrl</kbd>+<kbd>V</kbd> — вставить из буфера
                </span>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {errors.length > 0 && (
        <div className="alert alert-error" role="alert">
          {errors.map((e) => (
            <div key={e}>
              <ErrorText text={e} />
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="setting">
          <div className="section-title">
            {simple ? `${t.chosen}: ` : ''}
            {filesLabel(items.length)} <span className="muted nowrap">· {formatSize(totalSize)}</span>
          </div>
          <FileList
            files={items.map((i, idx) => ({
              key: i.id,
              name: i.file.name,
              size: i.file.size,
              thumb: i.thumb,
              progress: uploading ? progress[idx] / Math.max(i.file.size, 1) : null,
              onRemove: uploading ? null : () => removeItem(i.id),
            }))}
          />
        </div>
      )}

      <fieldset className="settings" disabled={uploading}>
        <Step n={2} simple={simple} badge={t.step2} flag="--expire" label="срок хранения" simpleLabel={t.keepFor}>
          <div className="chips">
            {EXPIRY_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                aria-pressed={expiry === o.value}
                className={`chip${expiry === o.value ? ' active' : ''}`}
                onClick={() => setExpiry(o.value)}
              >
                {simple ? { '1d': t.oneDay, '3d': t.threeDays, '7d': t.sevenDays, '30d': t.thirtyDays }[o.value] : o.label}
              </button>
            ))}
          </div>
        </Step>

        <Step n={3} simple={simple} badge={t.step3} flag="--limit" label="количество скачиваний" simpleLabel={t.downloadTimes}>
          <div className="chips">
            {DOWNLOAD_OPTIONS.map((v) => (
              <button
                type="button"
                key={v}
                aria-pressed={downloadsMode === v}
                className={`chip${downloadsMode === v ? ' active' : ''}`}
                onClick={() => setDownloadsMode(v)}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={downloadsMode === 'custom'}
              className={`chip${downloadsMode === 'custom' ? ' active' : ''}`}
              onClick={() => setDownloadsMode('custom')}
            >
              {simple ? t.otherNumber : 'своё'}
            </button>
          </div>
          {downloadsMode === 'custom' && (
            <input
              className={`input input-small${customDownloads && !downloadsValid ? ' invalid' : ''}`}
              type="number"
              min="1"
              max={MAX_DOWNLOADS}
              placeholder="N"
              aria-label="Число скачиваний"
              value={customDownloads}
              autoFocus
              onChange={(e) => setCustomDownloads(e.target.value)}
            />
          )}
          {downloadsMode === 'custom' && customDownloads && !downloadsValid && (
            <div className="hint error">от 1 до {MAX_DOWNLOADS}</div>
          )}
        </Step>

        {!pairCode && (
        <Step n={4} simple={simple} badge={t.step4} flag="--password" label="пароль" simpleLabel={t.passwordOptional}>
          <label className="switch">
            <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span>{simple ? t.turnPasswordOn : 'защитить паролем'}</span>
          </label>
          {usePassword && (
            <input
              className="input reveal"
              type="password"
              placeholder="Пароль"
              aria-label="Пароль"
              maxLength={128}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          {usePassword && (
            <div className={`hint${password && !passwordValid ? ' error' : ''}`}>
              {t.passwordRule.replace('{n}', MIN_PASSWORD)}
            </div>
          )}
          {simple && usePassword && (
            <div className="hint">
              {t.passwordAside} <Kw>{t.passwordAsideEm}</Kw>
            </div>
          )}
        </Step>
        )}
      </fieldset>

      {uploading ? (
        <div className="upload-progress" role="status">
          <div className="upload-stats">
            <span className="upload-percent">{percent}%</span>
            <span className="muted">
              {formatSize(uploaded)} / {formatSize(totalSize)}
            </span>
          </div>
          <div className="progress">
            <div className="progress-bar active" style={{ width: `${fraction * 100}%` }} />
          </div>
          <div className="upload-stats muted small">
            <span>{rate ? formatSpeed(rate.speed) : 'измеряем скорость…'}</span>
            <span>{eta != null ? `осталось ~${formatDuration(eta)}` : ''}</span>
          </div>
          {transport === 'prep' && (
            <div className="hint">
              {simple ? (
                t.waitPrepare
              ) : (
                'Готовим файлы к отправке. Пока не закрывайте приложение.'
              )}
            </div>
          )}
          {transport === 'background' && (
            <div className="hint">
              {simple ? (
                t.canClose
              ) : (
                'Можно закрыть приложение — отправка продолжится. Ссылка появится здесь или при следующем открытии.'
              )}
            </div>
          )}
          {simple && transport !== 'background' && transport !== 'prep' && (
            <div className="hint">
              {t.keepPageOpen}
            </div>
          )}
        </div>
      ) : (
        <>
          <button className={`btn btn-primary btn-block${simple && !needFiles ? ' important' : ''}`} disabled={!canShare} onClick={share}>
            {pairCode ? t.sendToComputer : simple ? t.getLink : 'Поделиться'}
          </button>
          {blocker && (simple || !online) && <div className="hint">{blocker}</div>}
        </>
      )}
    </Window>
  );
}
