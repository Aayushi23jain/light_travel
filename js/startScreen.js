// Start screen shown FIRST (then: mystery question, sublimation definition, tour, "Let's discuss"):
//   logo, title, tagline and a "Let's start" button (no language chooser).
//  - the language that is pre-selected comes from the URL (?lan= / ?lang= / ?lng=),
//    which main.js has already applied through setLang() before dialog() runs
//  - language is only decided at launch through the URL; the top-bar language button still works later
//  - works in dark + light theme (its own theme button drives the app's #theme toggle)
//  - responsive layout lives in css/startScreen.css (mobile / tablet / desktop)
import { E, $ } from './dom.js';
import { t } from './audio.js';

// strings.json indices (152 already existed for the language dialog)
const S = { TITLE: 'title', TAGLINE: 'tagline', START: 'start' };

const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

let root = null;

export function showStartScreen(onStart) {
  if (root) return;
  let leaving = false;

  root = E('div', 'ss-overlay', document.body);
  root.id = 'start';

  // --- theme button (drives the app's own #theme toggle, so the 3D scene follows) ---
  const themeBtn = E('button', 'ss-theme', root);
  themeBtn.type = 'button';
  const syncTheme = () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    themeBtn.innerHTML = dark ? MOON_SVG : SUN_SVG; // same convention as the top bar: current mode's icon
    themeBtn.title = t('theme');
    themeBtn.setAttribute('aria-label', t('theme'));
  };
  themeBtn.onclick = () => { $('#theme').click(); syncTheme(); };

  // --- card ---
  const card = E('main', 'ss-card', root);
  card.tabIndex = -1;

  const logo = E('div', 'ss-logo', card);
  const img = E('img', '', logo);
  img.src = 'assets/img/ConveGenius.Ai%20Logo1.webp';
  img.alt = 'ConveGenius.AI';
  img.draggable = false;

  const title = E('h1', 'ss-title', card);
  const tagline = E('p', 'ss-tag', card);
  const start = E('button', 'ss-start', card);
  start.type = 'button';

  // Everything that depends on the language / theme is (re)written here.
  function refresh() {
    title.textContent = t(S.TITLE);
    tagline.textContent = t(S.TAGLINE);
    start.textContent = t(S.START);
    syncTheme();
  }

  const finish = () => {
    if (leaving) return;
    leaving = true;
    root.classList.add('out');
    onStart && onStart();
    setTimeout(() => {
      if (root) { root.remove(); root = null; }
    }, 220);
  };
  start.onclick = finish;

  refresh();
  card.focus({ preventScroll: true });
}

export const startScreenOpen = () => !!root;
