import Window from '../components/Window.jsx';
import Icon from '../components/Icon.jsx';
import { Link } from '../router.jsx';
import { useInstall } from '../pwa.js';
import { useLocale, useT } from '../locale.js';
import { useSimple } from '../theme.js';

const NOTES = {
  ru: [
    'Один файл до 512 МБ; текст и документы сжимаются и идут быстрее.',
    'Скорость зависит от камеры и экрана: от десятков до сотен КБ/с.',
    'Пароль шифрует данные и имя файла. Без пароля всё, что видно на экране, может снять любая камера рядом.',
  ],
  en: [
    'One file up to 512 MB; text and documents are compressed and go faster.',
    'Speed depends on the camera and the screen: tens to hundreds of KB/s.',
    'A password encrypts the data and the file name. Without one, anything on the screen can be captured by a nearby camera.',
  ],
};

const PLAIN_NOTES = {
  ru: [
    'Один файл. Не больше 512 МБ.',
    'Это медленно. Удобнее файл до 150 МБ.',
    'Коды видно всем рядом. Поставьте пароль или не показывайте коды чужим людям.',
  ],
  en: [
    'One file. Not more than 512 MB.',
    'This is slow. A file under 150 MB is easier.',
    'People nearby can see the codes. Set a password, or do not show them to strangers.',
  ],
};

export default function OfflinePage() {
  const t = useT();
  const locale = useLocale();
  const simple = useSimple();
  const install = useInstall();
  const notes = (simple ? PLAIN_NOTES : NOTES)[locale];

  if (simple) {
    return (
      <Window title={t.offlineWindow}>
        <h1>{t.offlineTitle}</h1>
        <p>{t.offlineLead}</p>
        <ol className="guide">
          <li className="guide-step">
            <span className="step-badge">{t.step1}</span>
            <p className="guide-title">{t.offlinePickTitle}</p>
            <p>{t.offlinePickText}</p>
          </li>
          <li className="guide-step">
            <span className="step-badge">{t.step2}</span>
            <p className="guide-title">{t.offlineDoTitle}</p>
            <div className="guide-actions">
              <Link to="/offline/send" className="btn btn-primary btn-block">
                <Icon name="upload" size={18} />
                {t.qrSend}
              </Link>
              <p className="guide-note">{t.offlineSendHint}</p>
              <Link to="/offline/receive" className="btn btn-secondary btn-block">
                <Icon name="scan" size={18} />
                {t.qrReceive}
              </Link>
              <p className="guide-note">{t.offlineReceiveHint}</p>
            </div>
          </li>
          <li className="guide-step">
            <span className="step-badge">{t.step3}</span>
            <p className="guide-title">{t.offlineWaitTitle}</p>
            <ul className="plain-list">
              {notes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        </ol>
        {!install.standalone && <p className="hint">{t.offlineInstall}</p>}
      </Window>
    );
  }

  return (
    <Window title={t.offlineWindow}>
      <h1>{t.offlineTitle}</h1>
      <p className="muted">{t.offlineLead}</p>
      <div className="offline-choice">
        <Link to="/offline/send" className="btn btn-primary important">
          <Icon name="upload" size={18} />
          {t.qrSend}
        </Link>
        <Link to="/offline/receive" className="btn btn-secondary important">
          <Icon name="scan" size={18} />
          {t.qrReceive}
        </Link>
      </div>
      <ul className="offline-notes muted">
        {notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {!install.standalone && <p className="hint">{t.offlineInstall}</p>}
    </Window>
  );
}
