import { useEffect, useRef } from 'react';
import Window from './Window.jsx';
import ThemeSwitch from './ThemeSwitch.jsx';
import Icon from './Icon.jsx';
import { setLocale, useLocale, useT } from '../locale.js';
import { setDyslexia, useDyslexia } from '../font.js';
import { Link } from '../router.jsx';
import { isStandalone } from '../pwa.js';

export default function SettingsDialog({ onClose }) {
  const t = useT();
  const locale = useLocale();
  const dyslexia = useDyslexia();
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const visible = [...(dialogRef.current?.querySelectorAll('button') ?? [])].find((el) => el.offsetParent !== null);
    visible?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.settings}
        onClick={(e) => e.stopPropagation()}
      >
        <Window title={t.settings} onClose={onClose} closeLabel={t.close}>
          <div className="settings-head">
            <h1>{t.settings}</h1>
            <button type="button" className="window-close" onClick={onClose} aria-label={t.close}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="setting">
            <h2 className="setting-label" id="settings-language">{t.language}</h2>
            <div className="theme-switch" role="radiogroup" aria-labelledby="settings-language">
              <button
                type="button"
                role="radio"
                aria-checked={locale === 'ru'}
                className={`theme-option${locale === 'ru' ? ' active' : ''}`}
                onClick={() => setLocale('ru')}
              >
                Русский
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={locale === 'en'}
                className={`theme-option${locale === 'en' ? ' active' : ''}`}
                onClick={() => setLocale('en')}
              >
                English
              </button>
            </div>
          </div>
          <div className="setting">
            <h2 className="setting-label" id="settings-theme">{t.theme}</h2>
            <ThemeSwitch labelId="settings-theme" />
          </div>
          <div className="setting setting-inline">
            <div className="setting-copy">
              <h2 className="setting-label" id="settings-font">{t.dyslexiaFont}</h2>
              <p className="hint">{t.dyslexiaFontHint}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={dyslexia}
                aria-labelledby="settings-font"
                onChange={(e) => setDyslexia(e.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
          {isStandalone() && (
            <Link to="/faq" className="btn btn-secondary settings-faq" onClick={onClose}>
              <Icon name="help" size={18} />
              {t.faqLink}
            </Link>
          )}
        </Window>
      </div>
    </div>
  );
}
