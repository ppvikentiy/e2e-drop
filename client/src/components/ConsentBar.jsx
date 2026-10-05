import { Link } from '../router.jsx';
import { isStandalone } from '../pwa.js';
import { setConsent, useConsent } from '../consent.js';
import { useSimple } from '../theme.js';
import { useT } from '../locale.js';

export default function ConsentBar() {
  const choice = useConsent();
  const simple = useSimple();
  const t = useT();
  if (isStandalone() || choice === 'accepted') return null;
  const declined = choice === 'declined';

  return (
    <div className="consent" role="dialog" aria-label={simple ? t.policyLink : 'Политика обработки данных'}>
      <p>
        {simple ? (
          declined ? (
            t.consentOff
          ) : (
            <>
              {t.consentLead} <Link to="/policy">{t.policyLink}</Link>.
            </>
          )
        ) : declined ? (
          'Функции передачи файлов отключены, пока политика не принята.'
        ) : (
          <>
            Продолжая, вы подтверждаете, что ознакомились с{' '}
            <Link to="/policy">Политикой обработки данных</Link>.
          </>
        )}
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-primary" onClick={() => setConsent('accepted')}>
          {simple ? t.accept : 'Принять'}
        </button>
        {!declined && (
          <button type="button" className="btn btn-secondary" onClick={() => setConsent('declined')}>
            {simple ? t.consentReject : 'Отклонить'}
          </button>
        )}
      </div>
    </div>
  );
}
