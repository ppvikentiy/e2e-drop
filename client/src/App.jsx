import { useEffect, useRef, useState } from 'react';
import HomePage from './pages/HomePage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import DropPage from './pages/DropPage.jsx';
import OfflinePage from './pages/OfflinePage.jsx';
import ReceivePage from './pages/ReceivePage.jsx';
import QrSendPage from './pages/QrSendPage.jsx';
import QrReceivePage from './pages/QrReceivePage.jsx';
import PolicyPage from './pages/PolicyPage.jsx';
import FaqPage from './pages/FaqPage.jsx';
import Window from './components/Window.jsx';
import Icon from './components/Icon.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import Kw from './components/Kw.jsx';
import Footer from './components/Footer.jsx';
import ConsentBar from './components/ConsentBar.jsx';
import SiteLogin from './components/SiteLogin.jsx';
import { useSiteGate } from './siteGate.js';
import { Link, ensureBaseBeneath } from './router.jsx';
import { isStill, useTheme } from './theme.js';
import { useT } from './locale.js';
import { isStandalone, useOnline } from './pwa.js';
import { setConsent, useConsent } from './consent.js';
import useNavDrag from './useNavDrag.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function currentPath() {
  let path = window.location.pathname.replace(/\/+$/, '') || '/';
  const standalone = isStandalone();
  // The site opens on the landing page. The installed app has no landing page: send, receive, and QR only.
  if (path === '/' || path === '/home') {
    const next = standalone ? '/upload' : '/home';
    if (path !== next) window.history.replaceState(null, '', next + window.location.search + window.location.hash);
    path = next;
  }
  // A pairing QR/link (/p/CODE#key) opens the upload page in "send to the computer" mode. The key
  // stays in the fragment so it never reaches the server.
  const pair = /^\/p\/([^/]+)$/.exec(path);
  if (pair) {
    window.history.replaceState(null, '', `/upload?pair=${pair[1]}${window.location.hash}`);
    return '/upload';
  }
  // Installed app opened with no network: link upload cannot work, QR transfer can.
  if (isStandalone() && navigator.onLine === false && !path.startsWith('/offline')) {
    const shared = new URLSearchParams(window.location.search).has('shared');
    if (!shared) {
      window.history.replaceState(null, '', '/offline');
      return '/offline';
    }
  }
  return path;
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const theme = useTheme();
  const simple = theme === 'simple';
  const t = useT();
  const online = useOnline();
  const consent = useConsent();
  const [site, siteUnlocked] = useSiteGate();
  const standalone = isStandalone();
  const navRef = useRef(null);
  // Dragging the current section sideways switches sections: installed app only, not in the Simple/Accessible themes.
  useNavDrag(navRef, standalone && !isStill(theme));
  const logoSrc = theme === 'dark' ? '/icons/logo-white.png' : '/icons/logo-black.png';
  const blocked = !isStandalone() && consent === 'declined' && isTransferPath(path);
  const showConsent = !isStandalone() && consent !== 'accepted';

  useEffect(() => {
    ensureBaseBeneath();
    setPath(currentPath());
    const onPop = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Soft cursor-following highlight on cards (.spot reads --mx/--my).
  useEffect(() => {
    if (isStill(theme)) return undefined;
    const onMove = (e) => {
      const el = e.target instanceof Element ? e.target.closest('.spot') : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [theme]);

  const segment = decodeURIComponent(path.slice(1));
  let page;
  if (path === '/home' && !standalone) page = <HomePage />;
  else if (path === '/upload' || path === '/home') page = <UploadPage />;
  else if (path === '/receive') page = <ReceivePage />;
  else if (path === '/offline') page = <OfflinePage />;
  else if (path === '/offline/send') page = <QrSendPage />;
  else if (path === '/offline/receive') page = <QrReceivePage />;
  else if (path === '/policy') page = <PolicyPage />;
  else if (path === '/faq') page = <FaqPage />;
  else if (TOKEN_RE.test(segment)) page = <DropPage key={segment} token={segment} />;
  else page = <NotFound path={path} />;
  // The site password (if the operator set one) closes everything except the texts about the service.
  const siteOpenPath = path === '/policy' || path === '/faq';
  if (!siteOpenPath && site === 'locked') page = <SiteLogin onUnlocked={siteUnlocked} />;
  else if (!siteOpenPath && site === 'checking') page = null;

  return (
    <div className={`app${standalone ? ' app-pwa' : ''}${showConsent ? ' has-consent' : ''}`}>
      {!online && (
        <div className="offline-banner" role="status">
          {t.offlineBanner} <Link to="/offline">{t.offlineBannerLink}</Link>.
        </div>
      )}
      <div className={`shell${path === '/home' || path === '/upload' || path === '/receive' ? ' shell-wide' : ''}`}>
        <aside className="rail">
          <Link to={standalone ? '/upload' : '/home'} className="logo">
            <img className="logo-mark" src={logoSrc} width="44" height="44" alt="" />
            <span className="logo-text">e2e-drop</span>
          </Link>
          <nav ref={navRef} className="nav" aria-label={t.home}>
            {!standalone && (
              <Link to="/home" className={`nav-home${path === '/home' ? ' active' : ''}`}>
                <Icon name="home" size={20} />
                <span>{t.home}</span>
              </Link>
            )}
            <Link to="/upload" className={path === '/upload' ? 'active' : ''}>
              <Icon name="upload" size={20} />
              <span>{t.send}</span>
            </Link>
            <Link to="/receive" className={path === '/receive' ? 'active' : ''}>
              <Icon name="download" size={20} />
              <span>{simple ? t.receive : t.navReceive}</span>
            </Link>
            <Link to="/offline" className={path.startsWith('/offline') ? 'active' : ''}>
              <Icon name="qr" size={20} />
              <span>{t.offline}</span>
            </Link>
            <Link to="/faq" className={`nav-faq${path === '/faq' ? ' active' : ''}`}>
              <Icon name="help" size={20} />
              <span>{t.faq}</span>
            </Link>
          </nav>
          <button type="button" className="settings-btn" aria-label={t.settings} onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={20} />
            <span className="settings-label">{t.settings}</span>
          </button>
        </aside>
        <div className="stage">
          <main key={path} className="main">
            {blocked ? <ConsentBlocked /> : page}
          </main>
          <Footer />
        </div>
      </div>
      <ConsentBar />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function isTransferPath(path) {
  if (path === '/upload' || path === '/receive' || path.startsWith('/offline')) return true;
  return TOKEN_RE.test(decodeURIComponent(path.slice(1)));
}

function ConsentBlocked() {
  const t = useT();
  return (
    <Window title={t.disabled}>
      <h1>{t.disabled}</h1>
      <p>{t.disabledLead}</p>
      <div className="consent-actions">
        <button type="button" className="btn btn-primary" onClick={() => setConsent('accepted')}>
          {t.accept}
        </button>
        <Link to="/policy" className="btn btn-secondary footer-policy">
          {t.policyLink}
        </Link>
      </div>
    </Window>
  );
}

function NotFound({ path }) {
  const t = useT();
  return (
    <Window title={t.errorWindow}>
      <h1>{t.notFound}</h1>
      <p>
        <Kw>{t.checkLink}</Kw>
        {path ? ` · ${path}` : ''}
      </p>
      <Link className="btn btn-primary important" to="/upload">
        <Icon name="upload" size={18} />
        {t.sendFiles}
      </Link>
    </Window>
  );
}
