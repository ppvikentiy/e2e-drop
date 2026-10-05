import { useRef, useState } from 'react';
import Window from './Window.jsx';
import ErrorText from './ErrorText.jsx';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { formatSize } from '../utils.js';

// Matches each remembered file to a File blob the user just picked. The browser can't give us the
// previous blobs back, so the user re-selects them; we match on name + size + lastModified so
// uploads continue from the exact byte offset.
function matchFiles(session, picked) {
  const used = new Set();
  const matched = [];
  for (const want of session.files) {
    let found = -1;
    for (let i = 0; i < picked.length; i++) {
      if (used.has(i)) continue;
      const f = picked[i];
      if (f.name === want.name && f.size === want.size && f.lastModified === want.lastModified) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (let i = 0; i < picked.length; i++) {
        if (used.has(i)) continue;
        const f = picked[i];
        if (f.name === want.name && f.size === want.size) {
          found = i;
          break;
        }
      }
    }
    if (found < 0) return null;
    used.add(found);
    matched.push(picked[found]);
  }
  return matched;
}

export default function ResumePrompt({ session, onResume, onDismiss }) {
  const simple = useSimple();
  const t = useT();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const uploaded = session.files.reduce((s, f) => s + (f.uploadedBytes || 0), 0);
  const total = session.files.reduce((s, f) => s + f.size, 0);
  const percent = total > 0 ? Math.floor((uploaded / total) * 100) : 0;

  function pick(fileList) {
    setError('');
    const matched = matchFiles(session, [...fileList]);
    if (!matched) {
      setError(simple ? t.resumeSame : 'Выбранные файлы не совпадают с прерванной раздачей. [[Выберите те же файлы]].');
      return;
    }
    onResume(matched);
  }

  return (
    <Window title={t.resumeWindow}>
      <div>
        <h1>{simple ? t.resumeAsk : 'Прерванная загрузка'}</h1>
        {simple ? (
          <ol className="guide">
            <li className="guide-step">
              <span className="step-badge">{t.step1}</span>
              <p className="guide-title">{t.resumeAsk}</p>
              <p>
                {percent}%. {t.resumeLead}
              </p>
            </li>
          </ol>
        ) : (
          <p className="muted">
            Загрузка {percent}% ({formatSize(uploaded)} из {formatSize(total)}). Чтобы продолжить, выберите те же файлы — загрузка продолжится с того же места.
          </p>
        )}
      </div>
      <ul className="file-list">
        {session.files.map((f) => (
          <li key={f.id} className="file-item">
            <div className="file-info">
              <div className="file-name" title={f.name}>
                {f.name}
              </div>
              <div className="file-meta">
                {formatSize(f.size)}
                {f.uploadedBytes >= f.size ? (
                  <span className="ok"> · ✓ загружен</span>
                ) : (
                  <span> · {Math.floor(((f.uploadedBytes || 0) / Math.max(f.size, 1)) * 100)}%</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <div className="alert alert-error">
          <ErrorText text={error} />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <button className={`btn btn-primary btn-block${simple ? ' important' : ''}`} onClick={() => inputRef.current?.click()}>
        {simple ? t.resumeGo : 'Выбрать файлы и продолжить'}
      </button>
      <button className="btn btn-link btn-block" onClick={onDismiss}>
        {simple ? t.resumeRestart : 'Отменить и начать заново'}
      </button>
    </Window>
  );
}
