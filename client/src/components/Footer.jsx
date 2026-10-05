import { useState } from 'react';
import Icon from './Icon.jsx';
import { useInstall } from '../pwa.js';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { Link } from '../router.jsx';

const SOURCE_URL = 'https://github.com/ppvikentiy/e2e-drop';

/* global __APP_VERSION__, __BUILD_TYPE__, __BUILD_NUMBER__, __BUILD_COMMIT__ */
const BUILD = {
  version: __APP_VERSION__,
  type: __BUILD_TYPE__,
  number: __BUILD_NUMBER__,
  commit: __BUILD_COMMIT__,
};

function BuildInfo({ simple }) {
  const title = `Версия ${BUILD.version}, тип сборки ${BUILD.type}, билд ${BUILD.number}${BUILD.commit ? `, коммит ${BUILD.commit}` : ''}`;
  if (simple) {
    return (
      <span className="build-info" title={title}>
        Версия {BUILD.version} · {BUILD.type} · билд {BUILD.number}
      </span>
    );
  }
  return (
    <span className="build-info" title={title}>
      v{BUILD.version} · {BUILD.type} · билд {BUILD.number}
      {BUILD.commit ? ` · ${BUILD.commit}` : ''}
    </span>
  );
}

export default function Footer() {
  const simple = useSimple();
  const t = useT();
  const install = useInstall();
  const [iosOpen, setIosOpen] = useState(false);

  return (
    <footer className="footer">
      <div className="footer-main">
        <span className="footer-tag">{t.footerTag}</span>
        <div className="footer-end">
          <BuildInfo simple={simple} />
          <a className="footer-github" href={SOURCE_URL} target="_blank" rel="noreferrer" aria-label="Исходный код на GitHub">
            <Icon name="github" size={18} />
          </a>
        </div>
      </div>
      <div className="footer-actions">
        <Link to="/policy" className="btn btn-secondary footer-policy">
          {t.policyLink}
        </Link>
        {install.canPrompt && (
          <button type="button" className="footer-link" onClick={install.prompt}>
            {t.installApp}
          </button>
        )}
        {install.iosHint && (
          <button type="button" className="footer-link" aria-expanded={iosOpen} onClick={() => setIosOpen((v) => !v)}>
            {t.installApp}
          </button>
        )}
      </div>
      {iosOpen && (
        <div className="footer-hint" role="note">
          {t.iosInstall}
        </div>
      )}
    </footer>
  );
}
