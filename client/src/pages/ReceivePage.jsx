import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { checkPairCode, createPairing, deletePairing, getPairingStatus } from '../api.js';
import Window from '../components/Window.jsx';
import ErrorText from '../components/ErrorText.jsx';
import Icon from '../components/Icon.jsx';
import { Link, navigate } from '../router.jsx';
import { useSimple } from '../theme.js';
import { isStandalone } from '../pwa.js';
import { useT } from '../locale.js';
import { formatPairCode, formatSize, normalizePairCode } from '../utils.js';

const STORE_KEY = 'vd-pairing';
const POLL_MS = 2000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const CAMERA = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

let zxingReady;
function ensureZxing() {
  zxingReady ??= prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  return zxingReady;
}

const readStored = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeStored = (value) => {
  try {
    if (value) sessionStorage.setItem(STORE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    // private mode: reloading the page simply asks for a new code
  }
};

function cameraError(e, t) {
  if (!window.isSecureContext) return t.cameraHttps;
  if (!navigator.mediaDevices?.getUserMedia) return t.cameraUnsupported;
  if (e?.name === 'NotAllowedError') return t.cameraDenied;
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return t.cameraMissing;
  if (e?.name === 'NotReadableError') return t.cameraBusy;
  return t.cameraFailed;
}

/** Turn a scanned or typed value into a route, a pair code without a key, or an error code. */
function resolveEntry(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { error: 'empty' };
  const asUrl = /^https?:\/\//i.test(text) || text.startsWith('/');
  if (asUrl) {
    let url;
    try {
      url = new URL(text, window.location.origin);
    } catch {
      return { error: 'bad' };
    }
    if (url.origin !== window.location.origin) return { error: 'bad' };
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const hash = url.hash.replace(/^#/, '');
    const pair = /^\/p\/([^/]+)$/.exec(path);
    if (pair) {
      const code = normalizePairCode(decodeURIComponent(pair[1]));
      if (!code) return { error: 'bad' };
      if (!hash) return { pairOnly: code };
      return { to: `/upload?pair=${code}#${hash}` };
    }
    const token = decodeURIComponent(path.slice(1));
    if (TOKEN_RE.test(token)) return { to: `/${token}${hash ? `#${hash}` : ''}` };
    return { error: 'bad' };
  }
  const code = normalizePairCode(text);
  if (code) return { pairOnly: code };
  if (TOKEN_RE.test(text)) return { to: `/${text}` };
  return { error: 'bad' };
}

function errorText(code, t) {
  if (code === 'empty') return t.codeEmpty;
  return t.codeBad;
}

async function openPairOnly(code, t, setError) {
  try {
    await checkPairCode(code);
    setError(t.needQrKey);
  } catch (e) {
    setError(e.status === 404 ? t.codeExpired : e.message);
  }
}

export default function ReceivePage() {
  const t = useT();
  const [mode, setMode] = useState('get');

  return (
    <Window title={mode === 'get' ? t.receiveWindow : t.sendWindow}>
      <div className="theme-switch receive-choice" role="tablist" aria-label={t.receiveChoice}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'get'}
          className={`theme-option${mode === 'get' ? ' active' : ''}`}
          onClick={() => setMode('get')}
        >
          <Icon name="scan" size={18} />
          {t.receive}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'send'}
          className={`theme-option${mode === 'send' ? ' active' : ''}`}
          onClick={() => setMode('send')}
        >
          <Icon name="upload" size={18} />
          {t.send}
        </button>
      </div>
      {mode === 'get' ? <ReceiveScan /> : <ReceiveOffer />}
    </Window>
  );
}

function ReceiveScan() {
  const t = useT();
  const simple = useSimple();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [camError, setCamError] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const text = await readFrame(video, canvasRef);
        if (stopped) return;
        const found = text ? resolveEntry(text) : null;
        if (found?.to) {
          stopped = true;
          stopCamera();
          navigate(found.to);
          return;
        }
      }
      timer = window.setTimeout(tick, 280);
    };
    (async () => {
      setCamError('');
      try {
        await ensureZxing();
        if (stopped) return;
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        timer = window.setTimeout(tick, 280);
      } catch (e) {
        if (!stopped) setCamError(cameraError(e, t));
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stopCamera();
    };
    // Camera starts with this screen. Language changes should not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const found = resolveEntry(code);
    if (found.error) {
      setError(errorText(found.error, t));
      return;
    }
    if (found.pairOnly) {
      setBusy(true);
      setError('');
      await openPairOnly(found.pairOnly, t, setError);
      setBusy(false);
      return;
    }
    navigate(found.to);
  }

  return (
    <>
      <header className="page-heading">
        <h1>{t.receive}</h1>
        <Link to={isStandalone() ? '/upload' : '/home'} className="btn btn-secondary">
          <Icon name="back" />
          {t.back}
        </Link>
      </header>
      {simple ? (
        <ol className="guide">
          <li className="guide-step">
            <span className="step-badge">{t.step1}</span>
            <p className="guide-title">{t.qrFrameTitle}</p>
            <p>{t.scanLead}</p>
          </li>
          <li className="guide-step">
            <span className="step-badge">{t.step2}</span>
            <p className="guide-title">{t.typeCodeTitle}</p>
            <p>{t.typeCodeText}</p>
          </li>
        </ol>
      ) : (
        <p className="muted">{t.scanLead}</p>
      )}
      {camError ? (
        <div className="alert alert-error" role="alert">
          <ErrorText text={camError} />
        </div>
      ) : (
        <div className="qr-viewfinder">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="qr-corners" aria-hidden="true" />
          <div className="scan-status">{t.scanning}</div>
        </div>
      )}
      <form className="code-entry" onSubmit={submit}>
        <label className="setting-label" htmlFor="receive-code">
          {t.codeLabel}
        </label>
        <div className="code-entry-row">
          <input
            id="receive-code"
            className="input mono"
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            placeholder={t.codePlaceholder}
            onChange={(e) => {
              setCode(e.target.value);
              setError('');
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t.openCode}
          </button>
        </div>
      </form>
      {error && (
        <div className="alert alert-error" role="alert">
          <ErrorText text={error} />
        </div>
      )}
    </>
  );
}

async function readFrame(video, canvasRef) {
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  let canvas = canvasRef.current;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvasRef.current = canvas;
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const found = await readBarcodes(ctx.getImageData(0, 0, w, h), {
    formats: ['QRCode'],
    maxNumberOfSymbols: 1,
    tryHarder: true,
  });
  const symbol = found.find((item) => item.isValid && item.text);
  return symbol?.text || '';
}

function ReceiveOffer() {
  const simple = useSimple();
  const t = useT();
  const [pairing, setPairing] = useState(null);
  const [status, setStatus] = useState({ state: 'waiting' });
  const [error, setError] = useState('');
  const pairingRef = useRef(null);
  const failures = useRef(0);

  const start = useCallback(async () => {
    setError('');
    setStatus({ state: 'waiting' });
    failures.current = 0;
    try {
      const { code, secret } = await createPairing();
      const { generateLinkKey, keyToString } = await import('../crypto/vde2.js');
      const key = keyToString(generateLinkKey());
      const next = { code, secret, key };
      writeStored(next);
      pairingRef.current = next;
      setPairing(next);
    } catch (e) {
      setError(e.message);
      setPairing(null);
    }
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      pairingRef.current = stored;
      setPairing(stored);
    } else {
      start();
    }
    return () => {
      const p = pairingRef.current;
      if (p) {
        writeStored(null);
        deletePairing(p.code, p.secret).catch(() => {});
      }
    };
  }, [start]);

  useEffect(() => {
    if (!pairing) return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const s = await getPairingStatus(pairing.code, pairing.secret);
        if (stopped) return;
        failures.current = 0;
        setStatus(s);
        if (s.state === 'ready') {
          await deletePairing(pairing.code, pairing.secret).catch(() => {});
          writeStored(null);
          pairingRef.current = null;
          navigate(`/${s.token}${pairing.key ? `#${pairing.key}` : ''}`);
        }
      } catch (e) {
        if (stopped) return;
        if (e.status === 404) {
          writeStored(null);
          pairingRef.current = null;
          setPairing(null);
          setStatus({ state: 'expired' });
        } else if (++failures.current >= 3) {
          setError(e.message);
        }
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pairing]);

  const link = pairing ? `${window.location.origin}/p/${pairing.code}${pairing.key ? `#${pairing.key}` : ''}` : '';
  const uploading = status.state === 'uploading';
  const percent = uploading && status.totalSize > 0 ? Math.floor((status.uploadedBytes / status.totalSize) * 100) : 0;

  return (
    <>
      <header className="page-heading">
        <h1>{t.receiveFromPhone}</h1>
        <Link to={isStandalone() ? '/upload' : '/home'} className="btn btn-secondary">
          <Icon name="back" />
          {t.back}
        </Link>
      </header>
      <div>
        {simple ? (
          <ol className="guide">
            <li className="guide-step">
              <span className="step-badge">{t.step1}</span>
              <p className="guide-title">{t.receiveFromPhone}</p>
              <p>{t.receiveFromPhoneLead}</p>
            </li>
            <li className="guide-step">
              <span className="step-badge">{t.step2}</span>
              <p className="guide-title">{t.pointCamera}</p>
            </li>
            <li className="guide-step">
              <span className="step-badge">{t.step3}</span>
              <p className="guide-title">{t.keepOpen}</p>
            </li>
          </ol>
        ) : (
          <p className="muted">{t.receiveFromPhoneLead}</p>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <ErrorText text={error} />
        </div>
      )}

      {uploading ? (
        <div className="upload-progress" role="status">
          <div className="section-title">{t.phoneSending}</div>
          <div className="upload-stats">
            <span className="upload-percent">{percent}%</span>
            <span className="muted">
              {formatSize(status.uploadedBytes)} / {formatSize(status.totalSize)} · {status.fileCount}
            </span>
          </div>
          <div className="progress">
            <div className="progress-bar active" style={{ width: `${percent}%` }} />
          </div>
          <p className="hint">{t.keepOpen}</p>
        </div>
      ) : pairing ? (
        <div className="pair-box">
          <div className="pair-qr" aria-label="QR">
            <QRCodeSVG value={link} size={176} marginSize={2} />
          </div>
          <div className="pair-code-block">
            <div className="muted">{t.codeCheck}</div>
            <div className="pair-code">{formatPairCode(pairing.code)}</div>
            <div className="hint">
              {t.pointCamera}
              {status.secondsLeft != null &&
                status.state === 'waiting' &&
                ` · ${Math.floor(status.secondsLeft / 60)}:${String(status.secondsLeft % 60).padStart(2, '0')}`}
            </div>
          </div>
        </div>
      ) : (
        status.state === 'expired' && (
          <div className="alert" role="status">
            <ErrorText text={t.codeExpiredBanner} />
          </div>
        )
      )}

      {!pairing && !uploading && (
        <button type="button" className="btn btn-primary important" onClick={start}>
          {t.newCode}
        </button>
      )}
    </>
  );
}
