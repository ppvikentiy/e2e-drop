import { useEffect, useRef, useState } from 'react';
import { MAX_FILE_SIZE, MIN_PASSWORD_LENGTH, createScreenStream, createSender, fromBlob, passwordLength } from 'vqd';
import Window from '../components/Window.jsx';
import ErrorText from '../components/ErrorText.jsx';
import Icon from '../components/Icon.jsx';
import { Link, setNavigationBlock } from '../router.jsx';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { PROFILES, drawScreen } from '../offline/qr.js';
import { useWakeLock } from '../offline/wakeLock.js';
import { formatDuration, formatSize, formatSpeed } from '../utils.js';

const RATES = [5, 10, 15, 20, 30];

export default function QrSendPage() {
  const simple = useSimple();
  const t = useT();
  const [file, setFile] = useState(null);
  const [profileId, setProfileId] = useState('max');
  const [fps, setFps] = useState(10);
  const [colour, setColour] = useState(false);
  const [warn, setWarn] = useState(false);
  const [password, setPassword] = useState(''); // memory only: never stored
  const passwordTooShort = password !== '' && passwordLength(password) < MIN_PASSWORD_LENGTH;
  const [phase, setPhase] = useState('select'); // select | preparing | sending
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [shown, setShown] = useState(0);
  const senderRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const profile = PROFILES.find((p) => p.id === profileId);

  useWakeLock(phase === 'sending' && !paused);

  useEffect(() => {
    setNavigationBlock(phase === 'sending' ? 'Остановить показ QR-кодов?' : null);
    return () => setNavigationBlock(null);
  }, [phase]);

  const pick = (f) => {
    setError('');
    if (!f) return;
    if (f.size === 0) return setError('Файл пустой. [[Выберите другой]].');
    if (f.size > MAX_FILE_SIZE) return setError(`Файл больше ${formatSize(MAX_FILE_SIZE)}. [[Через QR его не передать]] — отправьте ссылкой.`);
    setFile(f);
  };

  const start = async () => {
    setPhase('preparing');
    setError('');
    try {
      senderRef.current = await createSender({
        source: fromBlob(file),
        name: file.name,
        mime: file.type || 'application/octet-stream',
        frameBytes: profile.frameBytes,
        password: password || null,
      });
      // Same frames in both modes: switching colour on or off keeps what the receiver already has.
      streamRef.current = createScreenStream(senderRef.current, { colour });
      setShown(0);
      setPaused(false);
      setPhase('sending');
    } catch (e) {
      setError('Файл не подготовился к показу. [[Выберите его ещё раз]].');
      setPhase('select');
    }
  };

  // Accessible theme: warn about flicker before the first code appears.
  const begin = () => (simple ? setWarn(true) : start());

  const stop = () => {
    senderRef.current = null;
    streamRef.current = null;
    setPassword('');
    setPhase('select');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  // Frame loop: one QR code every 1/fps seconds.
  useEffect(() => {
    if (phase !== 'sending' || paused) return undefined;
    const stream = streamRef.current;
    let cancelled = false;
    let timer = 0;
    let due = performance.now();
    let count = 0;
    const tick = async () => {
      if (cancelled) return;
      const screen = await stream.nextScreen();
      if (cancelled || !canvasRef.current) return;
      drawScreen(canvasRef.current, screen, profile.version);
      count++;
      if (count % 5 === 0) setShown((n) => n + 5);
      due += 1000 / fps;
      const now = performance.now();
      if (due < now) due = now; // fell behind: do not try to catch up with a burst
      timer = setTimeout(tick, due - now);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, paused, fps, profile.version, colour]);

  const switchColour = (next) => {
    setColour(next);
    if (senderRef.current) streamRef.current = createScreenStream(senderRef.current, { colour: next });
  };

  const colourSetting = (
    <div className="setting">
      <div className="setting-label">
        {simple && phase !== 'sending' && <span className="step-badge">{t.step3}</span>}
        {t.colourMode}
      </div>
      <div className="chips">
        {[false, true].map((c) => (
          <button key={String(c)} type="button" className={`chip${c === colour ? ' active' : ''}`} onClick={() => switchColour(c)}>
            {c ? t.colourColour : t.colourMono}
          </button>
        ))}
      </div>
      <div className="hint">{colour ? t.colourHint : t.colourMonoHint}</div>
    </div>
  );

  const fullscreen = () => {
    const el = stageRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  if (phase === 'sending') {
    const s = senderRef.current;
    // Compressed segments need fewer blocks, so the file moves faster than fps × blockLen;
    // a colour screen carries three blocks.
    const screens = s.totalBlocks / (colour ? 3 : 1);
    const rate = (fps * s.manifest.fileSize) / screens;
    const blocks = screens;
    return (
      <div className="qr-send">
        <div className="qr-stage" ref={stageRef} onDoubleClick={fullscreen}>
          <canvas ref={canvasRef} className="qr-canvas" aria-label="Анимированный QR-код с файлом" />
        </div>
        <div className="qr-send-info">
          <div className="qr-file">
            <strong>{file.name}</strong> · {formatSize(file.size)}
          </div>
          <div className="muted">
            {simple ? (
              t.qrHoldScreen
            ) : (
              <>
                {fps} кадров/с · {formatSpeed(rate)} · минимум ≈ {formatDuration(blocks / fps)} · показано кадров: {shown}
              </>
            )}
          </div>
          <div className="chips" role="group" aria-label="Скорость">
            {RATES.map((r) => (
              <button key={r} type="button" className={`chip${r === fps ? ' active' : ''}`} onClick={() => setFps(r)}>
                {r} к/с
              </button>
            ))}
          </div>
          {colourSetting}
          <div className="qr-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPaused((p) => !p)}>
              <Icon name={paused ? 'play' : 'pause'} />
              {paused ? 'Продолжить' : 'Пауза'}
            </button>
            {document.fullscreenEnabled && (
              <button type="button" className="btn btn-secondary" onClick={fullscreen}>
                <Icon name="maximize" />
                Во весь экран
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={stop}>
              <Icon name="stop" />
              Остановить
            </button>
          </div>
          <p className="hint">
            {simple
              ? t.qrSlowHint
              : `Если получатель долго не набирает прогресс — уменьшите скорость или выберите плотность «${PROFILES[2].label}».`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Window title={t.qrSendWindow}>
      <header className="page-heading">
        <h1>{t.qrSendTitle}</h1>
        <Link to="/offline" className="btn btn-secondary">
          <Icon name="back" />
          {t.back}
        </Link>
      </header>
      {simple ? (
        <div className="guide-step">
          <span className="step-badge">{t.step1}</span>
          <p className="guide-title">{t.qrPickTitle}</p>
          <p>{t.qrPickText}</p>
        </div>
      ) : (
        <p className="muted">
          Один файл до {formatSize(MAX_FILE_SIZE)}. Получателю нужно открыть «Принять через QR» в Drop на своём телефоне.
        </p>
      )}
      <button
        type="button"
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="dropzone-title">{file ? file.name : simple ? t.pickOneFile : 'Выбрать файл'}</div>
        <div className="muted">{file ? formatSize(file.size) : simple ? t.tapTheBox : 'или перетащите сюда'}</div>
      </button>
      <input ref={inputRef} type="file" hidden onChange={(e) => pick(e.target.files?.[0])} />

      <div className="setting">
        <div className="setting-label">
          {simple && <span className="step-badge">{t.step2}</span>}
          {t.density}
        </div>
        <div className="chips">
          {PROFILES.map((p) => (
            <button key={p.id} type="button" className={`chip${p.id === profileId ? ' active' : ''}`} onClick={() => setProfileId(p.id)}>
              {simple ? { max: t.codeSmall, mid: t.codeMid, low: t.codeLarge }[p.id] : p.label}
            </button>
          ))}
        </div>
        <div className="hint">
          {simple ? { max: t.codeSmallHint, mid: t.codeMidHint, low: t.codeLargeHint }[profile.id] : profile.hint}
        </div>
      </div>

      {colourSetting}

      <div className="setting">
        <label className="setting-label" htmlFor="qr-send-password">
          {simple && <span className="step-badge">{t.step4}</span>}
          {t.qrPasswordOptional}
        </label>
        <input
          id="qr-send-password"
          className={`input${passwordTooShort ? ' invalid' : ''}`}
          type="password"
          autoComplete="new-password"
          value={password}
          placeholder={t.qrPasswordPlaceholder}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className={`hint${passwordTooShort ? ' error' : ''}`}>
          {passwordTooShort ? t.qrPasswordShort.replace('{n}', MIN_PASSWORD_LENGTH) : t.qrPasswordSendHint}
        </div>
      </div>

      <div className="setting">
        <div className="setting-label">
          {simple && <span className="step-badge">{t.step5}</span>}
          {t.speed}
        </div>
        <div className="chips">
          {RATES.map((r) => (
            <button key={r} type="button" className={`chip${r === fps ? ' active' : ''}`} onClick={() => setFps(r)}>
              {r}
            </button>
          ))}
        </div>
        {simple && <div className="hint">{t.speedPlain}</div>}
        {file && !simple && (
          <div className="hint">
            ≈ {formatSpeed(fps * (profile.frameBytes - 18) * (colour ? 3 : 1))}, не дольше{' '}
            {formatDuration(file.size / (fps * (profile.frameBytes - 18) * (colour ? 3 : 1)))} при идеальном приёме; сжимаемые файлы
            быстрее
          </div>
        )}
      </div>

      {simple && (
        <div className="guide-step">
          <span className="step-badge">{t.step6}</span>
          <p className="guide-title">{t.showCodes}</p>
          <p>{t.qrHoldScreen}</p>
        </div>
      )}
      {error && (
        <p className="hint error">
          <ErrorText text={error} />
        </p>
      )}
      <button type="button" className="btn btn-primary btn-block important" disabled={!file || phase === 'preparing' || passwordTooShort} onClick={begin}>
        {phase === 'preparing' ? (simple ? t.preparing : 'Подготовка…') : simple ? t.showCodes : 'Показать QR-коды'}
      </button>
      {warn && (
        <div className="modal-backdrop" onClick={() => setWarn(false)}>
          <div
            className="modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="flash-title"
            aria-describedby="flash-text"
            onClick={(e) => e.stopPropagation()}
          >
            <Window title={t.flashTitle}>
              <h1 id="flash-title">{t.flashTitle}</h1>
              <p id="flash-text">{t.flashText}</p>
              <div className="consent-actions">
                <button
                  type="button"
                  className="btn btn-primary important"
                  onClick={() => {
                    setWarn(false);
                    start();
                  }}
                >
                  {t.flashGo}
                </button>
                <button type="button" className="btn btn-secondary" autoFocus onClick={() => setWarn(false)}>
                  {t.flashCancel}
                </button>
              </div>
            </Window>
          </div>
        </div>
      )}
    </Window>
  );
}
