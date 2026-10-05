import { useEffect, useRef, useState } from 'react';
import Window from '../components/Window.jsx';
import ErrorText from '../components/ErrorText.jsx';
import Icon from '../components/Icon.jsx';
import { Link, setNavigationBlock } from '../router.jsx';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { safeFileName, useWakeLock } from '../offline/wakeLock.js';
import { formatDuration, formatSize, formatSpeed } from '../utils.js';

const CAMERA = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  },
};

function cameraError(e, t) {
  if (!window.isSecureContext) return t.cameraHttps;
  if (!navigator.mediaDevices?.getUserMedia) return t.cameraUnsupported;
  if (e?.name === 'NotAllowedError') return t.cameraDenied;
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return t.cameraMissing;
  if (e?.name === 'NotReadableError') return t.cameraBusy;
  return t.cameraFailed;
}

export default function QrReceivePage() {
  const simple = useSimple();
  const t = useT();
  const [phase, setPhase] = useState('idle'); // idle | scanning | paused | complete
  const [status, setStatus] = useState(null);
  const [storage, setStorage] = useState(null);
  const [maxSize, setMaxSize] = useState(null);
  const [error, setError] = useState('');
  const [rate, setRate] = useState({ fps: 0, bytes: 0 });
  const [result, setResult] = useState(null);
  const [password, setPassword] = useState(''); // memory only: never stored
  const [askPassword, setAskPassword] = useState('');
  const videoRef = useRef(null);
  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const historyRef = useRef([]);

  useWakeLock(phase === 'scanning');

  useEffect(() => {
    const active = (phase === 'scanning' || phase === 'paused') && status?.manifest;
    setNavigationBlock(active ? 'Прервать приём? Полученное сохранится, продолжить можно позже.' : null);
    return () => setNavigationBlock(null);
  }, [phase, status?.manifest]);

  // Worker lifetime = page lifetime.
  useEffect(() => {
    const worker = new Worker(new URL('../offline/scanner.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'ready') {
        setStorage(msg.storage);
        setMaxSize(msg.maxFileSize);
      }
      else if (msg.type === 'status') setStatus(msg);
      else if (msg.type === 'error') setError('Кадр не разобрался. [[Держите QR целиком в рамке]].');
      else if (msg.type === 'complete') {
        setStatus(msg);
        setResult({ file: msg.file, name: safeFileName(msg.name), mime: msg.mime });
        setPassword('');
        setAskPassword('');
        setPhase('complete');
      }
    };
    worker.onerror = () => setError('Распознавание не запустилось. [[Обновите страницу]].');
    worker.postMessage({ type: 'init' });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  const start = async () => {
    setError('');
    if (password) workerRef.current?.postMessage({ type: 'password', password });
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      // Android: ask for continuous autofocus where supported; ignored elsewhere.
      track.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      setPhase('scanning');
    } catch (e) {
      setError(cameraError(e, t));
    }
  };

  // Feed frames to the worker, one at a time (the worker answers "idle" when it can take the next one).
  useEffect(() => {
    if (phase !== 'scanning') return undefined;
    const video = videoRef.current;
    const worker = workerRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    let busy = false;
    let stopped = false;
    let handle = 0;
    const onIdle = (event) => {
      if (event.data.type === 'idle') busy = false;
    };
    worker.addEventListener('message', onIdle);
    const schedule = () => {
      if (stopped) return;
      handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(pump) : requestAnimationFrame(pump);
    };
    const pump = async () => {
      if (!busy && video.readyState >= 2 && video.videoWidth > 0) {
        busy = true;
        try {
          const bitmap = await createImageBitmap(video);
          worker.postMessage({ type: 'frame', bitmap }, [bitmap]);
        } catch {
          busy = false;
        }
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      worker.removeEventListener('message', onIdle);
    };
  }, [phase]);

  // Throughput over the last few seconds.
  useEffect(() => {
    if (!status) return;
    const now = performance.now();
    const h = historyRef.current;
    // Bytes of the file, not of the code: with compression one frame carries more than blockLen of the file.
    h.push({ t: now, decoded: status.decoded, bytes: status.progress * (status.manifest?.size || 0) });
    while (h.length > 2 && now - h[0].t > 4000) h.shift();
    const first = h[0];
    const dt = (now - first.t) / 1000;
    if (dt > 0.5) setRate({ fps: (status.decoded - first.decoded) / dt, bytes: (h[h.length - 1].bytes - first.bytes) / dt });
  }, [status]);

  useEffect(() => {
    if (phase === 'complete') stopCamera();
  }, [phase]);

  const save = async () => {
    const { file, name, mime } = result;
    const asFile = new File([file], name, { type: mime || 'application/octet-stream' });
    // iPhone: the share sheet is the way to "Save to Files"; elsewhere a plain download.
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && navigator.canShare?.({ files: [asFile] })) {
      try {
        await navigator.share({ files: [asFile] });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(asFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const again = (discard) => {
    workerRef.current?.postMessage({ type: 'reset', discard });
    setPassword('');
    setAskPassword('');
    historyRef.current = [];
    setResult(null);
    setStatus(null);
    setPhase('idle');
  };

  const m = status?.manifest;
  const remaining = m ? m.size * (1 - status.progress) : 0;

  if (phase === 'complete' && result) {
    return (
      <Window title={t.qrReceiveDone}>
        <h1>{t.qrReceiveDone}</h1>
        <p>
          <strong>{result.name}</strong> · {formatSize(m?.size ?? result.file.size)}
        </p>
        <p className="muted">{simple ? t.fileChecked : 'Целостность проверена по SHA-256 каждого фрагмента.'}</p>
        <button type="button" className="btn btn-primary btn-block important" onClick={save}>
          {simple ? t.saveFile : 'Сохранить файл'}
        </button>
        <div className="qr-actions">
          <button type="button" className="btn btn-secondary" onClick={() => again(true)}>
            {storage === 'opfs' ? 'Удалить с устройства и принять другой' : 'Принять другой файл'}
          </button>
        </div>
      </Window>
    );
  }

  return (
    <Window title={t.qrReceiveWindow}>
      <header className="page-heading">
        <h1>{t.qrReceiveTitle}</h1>
        <Link to="/offline" className="btn btn-secondary">
          <Icon name="back" />
          {t.back}
        </Link>
      </header>
      {phase === 'idle' && (
        <>
          {simple ? (
            <ol className="guide">
              <li className="guide-step">
                <span className="step-badge">{t.step1}</span>
                <p className="guide-title">{t.qrAimTitle}</p>
                <p>{t.qrAimText}</p>
              </li>
              <li className="guide-step">
                <span className="step-badge">{t.step2}</span>
                <p className="guide-title">{t.qrFrameTitle}</p>
                <p>{t.qrFrameText}</p>
              </li>
              <li className="guide-step">
                <span className="step-badge">{t.step3}</span>
                <p className="guide-title">{t.qrWaitTitle}</p>
                <p>{t.qrWaitText}</p>
              </li>
            </ol>
          ) : (
            <p className="muted">
              Наведите камеру на экран отправителя так, чтобы код целиком был в рамке. Можно начинать с любого
              момента и прерываться{storage === 'opfs' ? ' — полученные кадры сохраняются на устройстве' : ''}.
            </p>
          )}
          <div className="setting">
            <label className="setting-label" htmlFor="qr-password">
              {t.qrPasswordIfAny}
            </label>
            <input
              id="qr-password"
              className="input"
              type="password"
              autoComplete="off"
              value={password}
              placeholder={t.qrPasswordPlaceholder}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="hint">{t.qrPasswordReceiveHint}</div>
          </div>
          <button type="button" className="btn btn-primary btn-block important" onClick={start} disabled={!storage}>
            {storage ? (simple ? t.turnCameraOn : 'Включить камеру') : simple ? t.cameraLoading : 'Загрузка распознавателя…'}
          </button>
          {storage === 'memory' && (
            <p className="hint">Этот браузер не даёт хранилище OPFS: файл собирается в памяти, поэтому принимается до {formatSize(maxSize || 0)}.</p>
          )}
        </>
      )}

      {(phase === 'scanning' || phase === 'paused') && (
        <>
          <div className={`qr-viewfinder${phase === 'paused' ? ' paused' : ''}`}>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="qr-corners" aria-hidden="true" />
            {phase === 'scanning' ? (
              <div className={`scan-status${status?.qrVisible ? ' seen' : ''}`} role="status">
                {status?.qrVisible ? t.qrSeen : t.qrMissing}
              </div>
            ) : (
              <div className="qr-paused-overlay" role="status">
                <Icon name="pause" size={28} />
                <span>Сканирование на паузе</span>
              </div>
            )}
          </div>
          <div className="qr-receive-status">
            {m ? (
              <>
                <div className="qr-file">
                  <strong>{m.encrypted && !m.unlocked ? t.qrLockedFile : safeFileName(m.name)}</strong> · {formatSize(m.size)}
                </div>
                {m.encrypted && !m.unlocked && (
                  <form
                    className="code-entry"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (askPassword) workerRef.current?.postMessage({ type: 'password', password: askPassword });
                    }}
                  >
                    <label className="setting-label" htmlFor="qr-ask-password">
                      {t.qrPasswordNeeded}
                    </label>
                    <div className="code-entry-row">
                      <input
                        id="qr-ask-password"
                        className="input"
                        type="password"
                        autoComplete="off"
                        value={askPassword}
                        onChange={(e) => setAskPassword(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary" disabled={!askPassword}>
                        {t.qrPasswordOpen}
                      </button>
                    </div>
                    {status.password?.result === 'wrong-password' && (
                      <p className="hint error">
                        <ErrorText text={t.qrPasswordWrong} />
                      </p>
                    )}
                    {status.password?.result === 'decrypt-failed' && (
                      <p className="hint error">
                        <ErrorText text={t.qrDecryptFailed} />
                      </p>
                    )}
                  </form>
                )}
                {status.password?.ignored && <p className="hint">{t.qrPasswordIgnored}</p>}
                <div className="upload-stats">
                  <span className="upload-percent">{Math.floor(status.progress * 100)}%</span>
                  <span className="muted">
                    {formatSpeed(rate.bytes)}
                    {rate.bytes > 0 && ` · осталось ≈ ${formatDuration(remaining / rate.bytes)}`}
                  </span>
                </div>
                <div className="progress">
                  <div className="progress-bar active" style={{ width: `${status.progress * 100}%` }} />
                </div>
                {status.segmentsDone.length > 1 && (
                  <div className="qr-segments" aria-hidden="true">
                    {status.segmentsDone.map((d, i) => (
                      <i key={i} className={d ? 'done' : ''} />
                    ))}
                  </div>
                )}
              </>
            ) : null}
            {status?.unsupportedVersion != null && (
              <p className="hint error">
                <ErrorText
                  text={
                    status.unsupportedVersion < 2
                      ? 'Отправитель использует старую версию приложения. [[Попросите его обновить страницу]].'
                      : 'Отправитель использует более новую версию формата. [[Обновите приложение]].'
                  }
                />
              </p>
            )}
            {status?.colour?.active && (status.colour.quality === 'crosstalk' || status.colour.quality === 'contrast') && (
              <p className="hint error">
                <ErrorText text={status.colour.quality === 'contrast' ? t.colourDim : t.colourPoor} />
              </p>
            )}
            {status?.badManifest && !m && (
              <p className="hint error">
                <ErrorText
                  text={
                    status.badManifest.noSpace
                      ? t.qrNoSpace
                      : status.badManifest.tooLarge
                      ? `Файл слишком большой для этого браузера: без хранилища OPFS принимается до ${formatSize(maxSize || 0)}. [[Откройте страницу в Chrome, Safari или Firefox последней версии]].`
                      : 'Отправитель показывает повреждённое описание файла. [[Попросите начать показ заново]].'
                  }
                />
              </p>
            )}
            {!simple && status && (
              <div className="qr-stats">
                {status.colour?.active && `${t.colourOn} · `}
                распознано {rate.fps.toFixed(1)} к/с · кадров {status.decoded}/{status.frames}
                {status.hashFailures > 0 && ` · перепроверено фрагментов: ${status.hashFailures}`}
              </div>
            )}
          </div>
          <div className="qr-actions">
            {phase === 'scanning' ? (
              <button type="button" className="btn btn-secondary" onClick={() => setPhase('paused')}>
                <Icon name="pause" />
                Пауза
              </button>
            ) : (
              <button type="button" className="btn btn-primary important" onClick={() => setPhase('scanning')}>
                <Icon name="play" />
                Продолжить
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                stopCamera();
                setPhase('idle');
              }}
            >
              <Icon name="stop" />
              Остановить
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="hint error">
          <ErrorText text={error} />
        </p>
      )}
    </Window>
  );
}
