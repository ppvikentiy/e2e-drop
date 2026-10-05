import { useState } from 'react';
import { useSimple } from '../theme.js';
import { fileExtension, formatSize } from '../utils.js';

function FileThumb({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img className="file-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return <span className="file-thumb file-ext">{fileExtension(name)}</span>;
}

export default function FileList({ files }) {
  const simple = useSimple();
  return (
    <ul className="file-list">
      {files.map((f, i) => (
        <li key={f.key} className="file-item" style={{ '--i': i }}>
          <FileThumb key={f.thumb || 'none'} src={f.thumb} name={f.name} />
          <div className="file-info">
            <div className="file-name" title={f.name}>
              {f.name}
            </div>
            <div className="file-meta">
              {formatSize(f.size)}
              {f.progress != null && f.progress >= 1 && <span className="ok"> · ✓ загружен</span>}
              {f.progress != null && f.progress < 1 && <span> · {Math.floor(f.progress * 100)}%</span>}
            </div>
            {f.progress != null && f.progress < 1 && (
              <div className="progress progress-thin">
                <div className="progress-bar" style={{ width: `${f.progress * 100}%` }} />
              </div>
            )}
          </div>
          {(f.href || f.onClick) &&
            (f.onClick ? (
              <button type="button" className="file-action" onClick={f.onClick} aria-label={`Скачать ${f.name}`}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{simple ? 'Скачать' : 'скачать'}</span>
              </button>
            ) : (
              <a className="file-action" href={f.href} onClick={f.onDownload} aria-label={`Скачать ${f.name}`}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{simple ? 'Скачать' : 'скачать'}</span>
              </a>
            ))}
          {f.onRemove && (
            <button type="button" className="file-action file-remove" onClick={f.onRemove} aria-label={`Удалить ${f.name}`}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
              <span>{simple ? 'Убрать' : 'удалить'}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
