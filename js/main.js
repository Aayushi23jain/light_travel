import { state } from './state.js';
import { STRINGS } from './i18n.js';
import { $ } from './dom.js';
import { showStartScreen } from './startScreen.js';
import { openLangModal } from './langModal.js';
import { setLang, wireChrome, startFlow } from './router.js';
import * as sc from './scene.js';

(async () => {
  state.S = STRINGS;
  state.A = await (await fetch('assets/audio/manifest.json')).json();
  // ?lang= / ?lan= / ?lng= picks the launch language (en, gu, hi, mr), like the Sublimation project
  const q = new URLSearchParams(location.search), l = (q.get('lang') || q.get('lan') || q.get('lng') || 'en').toLowerCase();
  document.documentElement.dataset.theme = 'dark';
  wireChrome(); setLang(STRINGS[l] ? l : 'en');
  $('#langb').onclick = openLangModal;
  await sc.init();
  $('#load').classList.add('h');
  showStartScreen(() => { state.startDone = true; startFlow(); });
})();
