import { useEffect, useState } from 'react';
import { getDrop, unlockDrop } from '../api.js';
import { downloadEncrypted } from '../download.js';
import FileList from '../components/FileList.jsx';
import Window from '../components/Window.jsx';
import Kw from '../components/Kw.jsx';
import ErrorText from '../components/ErrorText.jsx';
import { Link } from '../router.jsx';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { downloadsLabel, filesLabel, formatDate, formatSize } from '../utils.js';

// The link key travels in the link fragment (…#key); the browser keeps it out of every request, so
// the server never receives it.
function readKey() {
  const raw = window.location.hash.replace(/^#/, '');
  return raw || null;
}

const loadVde = () => import('../crypto/vde2.js');

// Opens the sealed manifest with the master key (AES-GCM authenticates it), then parses it. Returns the
// ready state, or null if the link key (or password) does not match or the server changed anything.
async function openManifest(data, master, kdf) {
  const vde = await loadVde();
  let sealed;
  try {
    sealed = vde.base64ToBytes(data.manifest);
  } catch {
    return null;
  }
  const bytes = await vde.openManifest(master, data.dropId, sealed);
  if (!bytes) return null;
  let manifest;
  try {
    manifest = vde.parseManifest(bytes, data.dropId);
  } catch {
    return null;
  }
  // The password parameters used must be the ones the sender signed.
  if (kdf ? !manifest.kdf || manifest.kdf.salt !== kdf.salt || manifest.kdf.iterations !== kdf.iterations : manifest.kdf !== null) {
    return null;
  }
  // The server knows only how much ciphertext each file has: it must agree with the sealed sizes.
  const stored = Array.isArray(data.files) ? data.files : [];
  if (stored.length !== manifest.files.length || manifest.files.some((f, i) => vde.ciphertextLength(f.size) !== stored[i].size)) {
    return null;
  }
  const files = await Promise.all(
    manifest.files.map(async (f, index) => ({
      index,
      id: f.id,
      name: f.name,
      type: f.type || 'application/octet-stream',
      size: f.size,
      thumb: f.thumb ? await vde.decryptThumb(master, data.dropId, f.id, f.thumb) : null,
    })),
  );
  return {
    status: 'ready',
    info: { files, totalSize: files.reduce((s, f) => s + f.size, 0), expiresAt: data.expiresAt, downloadsLeft: data.downloadsLeft },
    accessKey: data.accessKey,
    dropId: data.dropId,
    master: vde.keyToString(master),
  };
}

export default function DropPage({ token }) {
  const simple = useSimple();
  const t = useT();
  const [state, setState] = useState({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [busy, setBusy] = useState(null); // { progress } while decrypting in-memory (fallback)
  const title = t.dropWindow;
  const linkKey = readKey();

  useEffect(() => {
    let alive = true;
    (async () => {
      let data;
      try {
        data = await getDrop(token);
      } catch (err) {
        if (alive) setState({ status: 'error', message: err.message });
        return;
      }
      const vde = await loadVde();
      const key = vde.keyFromString(linkKey);
      // A missing, cut or mistyped key and a key that does not match look the same to the user.
      if (!key) return alive && setState({ status: 'decrypt', withPassword: Boolean(data.requiresPassword) });
      if (data.requiresPassword) {
        if (!vde.validKdf(data.kdf)) return alive && setState({ status: 'decrypt', withPassword: true });
        return alive && setState({ status: 'locked', dropId: data.dropId, kdf: data.kdf });
      }
      const opened = await openManifest(data, await vde.deriveMaster(key, data.dropId), null).catch(() => null);
      if (alive) setState(opened ?? { status: 'decrypt', withPassword: false });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The password never leaves the browser: it is mixed into the master key, and only a gate token
  // derived from that key is shown to the server, which limits wrong attempts.
  async function unlock(e) {
    e.preventDefault();
    if (!password || unlocking) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      const vde = await loadVde();
      const { dropId, kdf } = state;
      const master = await vde.deriveMaster(vde.keyFromString(linkKey), dropId, { password, ...kdf });
      let data;
      try {
        data = await unlockDrop(token, await vde.gateToken(master, dropId));
      } catch (err) {
        if (err.status === 404) return setState({ status: 'error', message: err.message });
        return setUnlockError(err.status === 401 ? t.decryptErrorPw : err.message);
      }
      const opened = await openManifest(data, master, kdf).catch(() => null);
      if (opened) setState(opened);
      else setUnlockError(t.decryptErrorPw);
    } finally {
      setUnlocking(false);
    }
  }

  function onDownload() {
    setState((s) => (s.started ? s : { ...s, started: true, info: { ...s.info, downloadsLeft: s.info.downloadsLeft - 1 } }));
  }

  // The whole drop (ZIP for several files) or one file, decrypted in this browser.
  async function startDownload(only) {
    const { info, accessKey, dropId, master } = state;
    const chosen = only != null ? [info.files[only]] : info.files;
    const plan = {
      token,
      accessKey,
      dropId,
      master,
      files: chosen.map((f) => ({ index: f.index, id: f.id, name: f.name, type: f.type, plainSize: f.size })),
      zipName: only == null && info.files.length > 1 ? `e2e-drop-${token.slice(0, 8)}.zip` : undefined,
    };
    onDownload();
    setBusy({ progress: 0 });
    setState((s) => ({ ...s, downloadError: null, outcome: 'running' }));
    try {
      const { outcome } = await downloadEncrypted(plan, { onProgress: (p) => setBusy({ progress: p }) });
      setBusy(null);
      // outcome null: an older service worker started the download but cannot tell when it ends
      setState((s) => ({ ...s, outcome: outcome ?? 'started' }));
    } catch (err) {
      setBusy(null);
      setState((s) => ({ ...s, outcome: null, downloadError: err.message || t.decryptError }));
    }
  }

  if (state.status === 'loading') {
    return (
      <Window title={title}>
        <div className="term-line muted">
          {simple ? t.loading : 'загрузка'}
          <span className="cursor" aria-label="Загрузка" />
        </div>
      </Window>
    );
  }

  if (state.status === 'error') {
    return (
      <Window title={title}>
        <h1>{simple ? t.filesGone : 'Файлы недоступны'}</h1>
        <div className="alert alert-error">
          <ErrorText text={state.message} />
        </div>
        {simple && <p>{t.askNewLink}</p>}
        <Link className="btn btn-primary" to="/upload">
          {simple ? t.sendOwn : 'Загрузить свои файлы'}
        </Link>
      </Window>
    );
  }

  if (state.status === 'decrypt') {
    return (
      <Window title={title}>
        <h1>{state.withPassword ? t.decryptErrorPw : t.decryptError}</h1>
        <Link className="btn btn-primary" to="/upload">
          {simple ? t.sendOwn : 'Отправить свои файлы'}
        </Link>
      </Window>
    );
  }

  if (state.status === 'locked') {
    return (
      <Window as="form" title={title} onSubmit={unlock}>
        <div className="lock-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="5" y="11" width="14" height="9" rx="2.5" />
            <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="center-text">
          <h1>{simple ? t.needPassword : 'Раздача защищена паролем'}</h1>
          <p className="muted">{simple ? t.needPasswordText : 'Введите пароль, чтобы увидеть и расшифровать файлы.'}</p>
        </div>
        <input
          className={`input${unlockError ? ' invalid shake' : ''}`}
          key={unlockError}
          type="password"
          placeholder="Пароль"
          aria-label="Пароль"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {unlockError && (
          <div className="hint error" role="alert">
            <ErrorText text={unlockError} />
          </div>
        )}
        <button className={`btn btn-primary btn-block${simple ? ' important' : ''}`} disabled={!password || unlocking}>
          {unlocking ? 'Проверка…' : 'Открыть'}
        </button>
      </Window>
    );
  }

  const { info, started } = state;
  const multiple = info.files.length > 1;
  const canDownload = info.downloadsLeft > 0 || started;
  const left = Math.max(info.downloadsLeft, 0);

  const fileEntry = (f, i) => ({
    key: i,
    name: f.name,
    size: f.size,
    thumb: f.thumb,
    href: null,
    onClick: multiple && canDownload ? () => startDownload(i) : null,
    onDownload,
  });

  return (
    <Window title={title}>
      <div>
        <h1>{multiple ? (simple ? t.youGotFiles : 'Вам отправили файлы') : simple ? t.youGotFile : 'Вам отправили файл'}</h1>
        <p className="muted">
          {filesLabel(info.files.length)} · {formatSize(info.totalSize)}
          {simple ? '' : ' · зашифровано'}
        </p>
      </div>

      <FileList files={info.files.map(fileEntry)} />

      {simple ? (
        <ul className="plain-list">
          <li>
            {t.validUntil} <Kw>{formatDate(info.expiresAt)}</Kw>
          </li>
          <li>
            {t.downloadsLeft}: <Kw>{left}</Kw>
          </li>
        </ul>
      ) : (
        <div className="meta-row">
          <span>
            <span className="muted">до</span> {formatDate(info.expiresAt)}
          </span>
          <span>
            <span className="muted">осталось</span> {downloadsLabel(left)}
          </span>
        </div>
      )}

      {canDownload ? (
        <button
          type="button"
          className={`btn btn-primary btn-block${simple ? ' important' : ''}`}
          disabled={busy != null}
          onClick={() => startDownload(null)}
        >
          {busy != null
            ? `${simple ? t.downloading : 'Скачивание'}… ${Math.floor((busy.progress || 0) * 100)}%`
            : multiple
              ? simple
                ? t.downloadAll
                : 'Скачать всё одним ZIP'
              : simple
                ? t.downloadOne
                : 'Скачать'}
        </button>
      ) : (
        <div className="alert">{simple ? t.downloadsUsed : 'Лимит скачиваний исчерпан — ссылка больше не активна.'}</div>
      )}

      {state.downloadError && (
        <div className="hint error" role="alert">
          <ErrorText text={state.downloadError} />
        </div>
      )}

      {!simple && <div className="hint center-text">Файлы расшифровываются прямо в вашем браузере. Сервер их содержимого не видит.</div>}

      {started && !state.downloadError && state.outcome && state.outcome !== 'running' && (
        <div className="hint center-text fade-in" role="status">
          {state.outcome === 'cancelled' ? (
            simple ? t.downloadCancelled : 'Скачивание отменено.'
          ) : (
            <>
              <span className="ok">✓</span>{' '}
              {state.outcome === 'done'
                ? simple
                  ? t.downloadDone
                  : multiple
                    ? 'архив скачан'
                    : 'файл скачан'
                : simple
                  ? t.downloadStarted
                  : 'скачивание началось'}
              {!simple && (info.downloadsLeft <= 0 ? ' — это было последнее скачивание.' : '.')}
            </>
          )}
        </div>
      )}
    </Window>
  );
}
