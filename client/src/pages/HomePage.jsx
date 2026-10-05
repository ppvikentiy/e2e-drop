import { useRef, useState } from 'react';
import { Link, navigate } from '../router.jsx';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';
import { queueFiles } from '../pendingFiles.js';
import Icon from '../components/Icon.jsx';

function QuickUpload() {
  const t = useT();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function openFiles(fileList) {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    queueFiles(files);
    navigate('/upload');
  }

  return (
    <div
      className={`quick-upload dropzone${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        openFiles(e.dataTransfer.files);
      }}
    >
      <button type="button" className="quick-upload-hit" onClick={() => inputRef.current?.click()}>
        <span className="dropzone-icon" aria-hidden="true">
          <Icon name="upload" size={22} />
        </span>
        <span className="dropzone-title">{t.quickUpload}</span>
        <span className="muted">{t.quickUploadHint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          openFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

const SOURCE = 'https://github.com/ppvikentiy/e2e-drop';

const FEATURES = [
  ['lock', 'featEncrypt', 'featEncryptText'],
  ['files', 'featCount', 'featCountText'],
  ['calendar', 'featExpiry', 'featExpiryText'],
  ['gauge', 'featDownloads', 'featDownloadsText'],
  ['key', 'featPassword', 'featPasswordText'],
  ['link', 'featShare', 'featShareText'],
  ['archive', 'featZip', 'featZipText'],
  ['images', 'featThumbs', 'featThumbsText'],
  ['devices', 'featPhone', 'featPhoneText'],
  ['qr', 'featQr', 'featQrText'],
  ['app', 'featApp', 'featAppText'],
  ['github', 'featSource', 'featSourceText', SOURCE],
];

const STEPS = [
  ['howStep1', 'howStep1Text'],
  ['howStep2', 'howStep2Text'],
  ['howStep3', 'howStep3Text'],
];

const LIMITS = [
  ['limitFiles', 'limitFilesValue'],
  ['limitSize', 'limitSizeValue'],
  ['limitDays', 'limitDaysValue'],
  ['limitDownloads', 'limitDownloadsValue'],
  ['limitPassword', 'limitPasswordValue'],
  ['limitMany', 'limitManyValue'],
];

const PRIVACY = [
  ['privToken', 'privTokenText'],
  ['privHash', 'privHashText'],
  ['privStore', 'privStoreText'],
  ['privAccount', 'privAccountText'],
  ['privCode', 'privCodeText', SOURCE],
];

function PolicyHome() {
  const t = useT();
  return (
    <section className="block policy-home">
      <h2>{t.policyHomeTitle}</h2>
      <ul className="policy-home-list">
        <li>{t.policyHomeEncrypt}</li>
        <li>{t.policyHomeNoAccount}</li>
        <li>{t.policyHomeIp}</li>
        <li>{t.policyHomeDelete}</li>
        <li>{t.policyHomeBrowser}</li>
      </ul>
      <Link to="/policy" className="btn btn-secondary">
        {t.policyLink}
      </Link>
    </section>
  );
}

function FaqHome() {
  const t = useT();
  return (
    <section className="block faq-home">
      <h2>{t.faqHomeTitle}</h2>
      <p>{t.faqHomeLead}</p>
      <Link to="/faq" className="btn btn-secondary">
        <Icon name="help" size={18} />
        {t.faqLink}
      </Link>
    </section>
  );
}

function SimpleHome() {
  const t = useT();
  return (
    <div className="simple-home">
      <h1>{t.simpleHomeTitle}</h1>
      <section className="simple-about">
        <h2>{t.simpleAboutTitle}</h2>
        <p>{t.simpleAboutLead}</p>
        <p>{t.simpleAboutPrivacy}</p>
        <p>{t.simpleAboutDelete}</p>
      </section>
      <ol className="guide">
        <li className="guide-step">
          <span className="step-badge">{t.step1}</span>
          <p className="guide-title">{t.simpleStep1}</p>
        </li>
        <li className="guide-step">
          <span className="step-badge">{t.step2}</span>
          <p className="guide-title">{t.simpleStep2}</p>
        </li>
        <li className="guide-step">
          <span className="step-badge">{t.step3}</span>
          <p className="guide-title">{t.simpleStep3}</p>
        </li>
      </ol>
      <Link to="/upload" className="btn btn-primary btn-block important">
        <Icon name="upload" size={18} />
        {t.sendFiles}
      </Link>
      <Link to="/receive" className="btn btn-secondary btn-block">
        <Icon name="download" size={18} />
        {t.receiveFiles}
      </Link>
      <Link to="/offline" className="btn btn-secondary btn-block">
        <Icon name="qr" size={18} />
        {t.offlineTitle}
      </Link>
      <Link to="/faq" className="btn btn-secondary btn-block">
        <Icon name="help" size={18} />
        {t.faqLink}
      </Link>
      <p>{t.simpleHomeFoot}</p>
    </div>
  );
}

export default function HomePage() {
  const simple = useSimple();
  const t = useT();
  if (simple) return <SimpleHome />;

  return (
    <div className="home">
      <header className="home-intro">
        <h1>Отправьте файлы одной ссылкой</h1>
        <p>
          До 10 файлов, срок хранения и лимит скачиваний. Ссылку или QR-код отдаёте сами. Когда срок выйдет, файлы
          исчезнут.
        </p>
      </header>

      <QuickUpload />

      <div className="tiles">
        <Link to="/upload" className="tile">
          <span className="tile-icon" aria-hidden="true">
            <Icon name="upload" size={22} />
          </span>
          <span className="tile-title">{t.sendFiles}</span>
          <span className="tile-text">Срок, лимит, ссылка или QR</span>
        </Link>
        <Link to="/receive" className="tile">
          <span className="tile-icon" aria-hidden="true">
            <Icon name="download" size={22} />
          </span>
          <span className="tile-title">{t.receiveFiles}</span>
          <span className="tile-text">Сканер кода или приём с телефона</span>
        </Link>
        <Link to="/offline" className="tile">
          <span className="tile-icon" aria-hidden="true">
            <Icon name="qr" size={22} />
          </span>
          <span className="tile-title">{t.offlineTitle}</span>
          <span className="tile-text">С экрана на камеру, без сети</span>
        </Link>
      </div>

      <section className="feature-section">
        <h2>{t.homeFeatures}</h2>
        <div className="feature-grid">
          {FEATURES.map(([icon, title, text, url]) => {
            const body = (
              <>
                <h3>
                  <Icon name={icon} size={18} />
                  {t[title]}
                </h3>
                <p>{t[text]}</p>
              </>
            );
            return url ? (
              <a className="feature-card" key={title} href={url} target="_blank" rel="noreferrer">
                {body}
              </a>
            ) : (
              <article className="feature-card" key={title}>
                {body}
              </article>
            );
          })}
        </div>
      </section>

      <section className="block" id="how">
        <h2>{t.howItWorks}</h2>
        <ol className="steps">
          {STEPS.map(([title, text], i) => (
            <li className="step" key={title}>
              <div className="step-num">{i + 1}</div>
              <div>
                <div className="step-title">{t[title]}</div>
                <div className="step-text">{t[text]}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="split">
        <section className="block">
          <h2>{t.homeLimits}</h2>
          <table className="term-table">
            <tbody>
              {LIMITS.map(([k, v]) => (
                <tr key={k}>
                  <td>{t[k]}</td>
                  <td>{t[v]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="block">
          <h2>{t.homePrivacy}</h2>
          <div className="term-list">
            {PRIVACY.map(([title, detail, url]) => (
              <details key={title}>
                <summary>{t[title]}</summary>
                <p>
                  {t[detail]}
                  {url && (
                    <>
                      {' '}
                      <a href={url} target="_blank" rel="noreferrer">
                        github.com/ppvikentiy/e2e-drop
                      </a>
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <div className="split">
        <PolicyHome />
        <FaqHome />
      </div>
    </div>
  );
}
