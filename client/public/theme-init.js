// Runs before the app bundle so the saved theme applies without a flash of the wrong colors.
(function () {
  var theme;
  try {
    theme = localStorage.getItem('vd-theme');
  } catch (e) {}
  if (theme !== 'dark' && theme !== 'light' && theme !== 'lite' && theme !== 'simple') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var lang;
  try {
    lang = localStorage.getItem('vd-lang');
  } catch (e) {}
  document.documentElement.lang = lang === 'en' ? 'en' : 'ru';
  var font;
  try {
    font = localStorage.getItem('vd-font');
  } catch (e) {}
  if (font === 'dyslexia') document.documentElement.setAttribute('data-font', 'dyslexia');

  var installed =
    (window.matchMedia &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches)) ||
    window.navigator.standalone === true;
  if (!installed) return;
  var path = location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/' && path !== '/home') return;
  var next = navigator.onLine === false ? '/offline' : '/upload';
  history.replaceState(null, '', next + location.search + location.hash);
})();
