import { useState } from 'react';
import Window from './Window.jsx';
import ErrorText from './ErrorText.jsx';
import { useT } from '../locale.js';
import { useSimple } from '../theme.js';
import { siteLogin } from '../siteGate.js';

/** Shown instead of the page when the operator has set a site password and this browser has no session. */
export default function SiteLogin({ onUnlocked }) {
  const t = useT();
  const simple = useSimple();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const res = await siteLogin(password);
    setBusy(false);
    if (res.ok) {
      setPassword('');
      onUnlocked();
    } else if (res.network) setError(t.siteLockOffline);
    else if (res.status === 401) setError(t.siteLockWrong);
    else setError(res.error || t.siteLockFailed);
  }

  return (
    <Window as="form" title={t.siteLockTitle} onSubmit={submit}>
      <h1>{t.siteLockTitle}</h1>
      <p className="muted">{t.siteLockText}</p>
      <input
        className={`input${error ? ' invalid' : ''}`}
        type="password"
        autoComplete="current-password"
        autoFocus
        aria-label={t.siteLockField}
        placeholder={t.siteLockField}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <div className="hint error" role="alert">
          <ErrorText text={error} />
        </div>
      )}
      <button className={`btn btn-primary btn-block${simple ? ' important' : ''}`} disabled={!password || busy}>
        {busy ? t.siteLockChecking : t.siteLockButton}
      </button>
    </Window>
  );
}
