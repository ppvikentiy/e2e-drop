import Window from '../components/Window.jsx';
import Icon from '../components/Icon.jsx';
import { Link } from '../router.jsx';
import { useLocale, useT } from '../locale.js';
import { useSimple } from '../theme.js';
import { isStandalone } from '../pwa.js';
import { FAQ_SECTIONS, faqText } from './faqContent.js';

function Answer({ text }) {
  const parts = Array.isArray(text) ? text : [text];
  return parts.filter(Boolean).map((part) => <p key={part}>{part}</p>);
}

export default function FaqPage() {
  const t = useT();
  const locale = useLocale();
  const simple = useSimple();

  return (
    <Window className="policy faq" title={t.faq}>
      <div className="policy-doc">
        <header className="page-heading">
          <h1>{t.faqHomeTitle}</h1>
          <Link to={isStandalone() ? '/upload' : '/home'} className="btn btn-secondary">
            <Icon name="home" size={18} />
            {t.home}
          </Link>
        </header>
        <p className="policy-kicker">{t.faqHomeLead}</p>
        <nav className="faq-toc" aria-label={t.faq}>
          {FAQ_SECTIONS.map((section) => (
            <a key={section.id} href={`#faq-${section.id}`}>
              {faqText(section.title, locale, simple)}
            </a>
          ))}
        </nav>
        {FAQ_SECTIONS.map((section) => (
          <section key={section.id} id={`faq-${section.id}`} className="faq-section">
            <h2>{faqText(section.title, locale, simple)}</h2>
            <div className="term-list">
              {section.items.map((item) => (
                <details key={faqText(item.q, 'ru', false)}>
                  <summary>{faqText(item.q, locale, simple)}</summary>
                  <Answer text={faqText(item.a, locale, simple)} />
                  {item.to && (
                    <p>
                      <Link to={item.to}>{t.policyLink}</Link>
                    </p>
                  )}
                  {item.href && (
                    <p>
                      <a href={item.href} target="_blank" rel="noreferrer">
                        {faqText(item.hrefLabel, locale, simple)}
                      </a>
                    </p>
                  )}
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Window>
  );
}
