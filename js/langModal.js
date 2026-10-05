// Centered "Choose your language" dialog, opened by the globe button (#langb).
//  - dimmed + blurred backdrop, card in the middle of the screen (all sizes)
//  - close (X), custom dropdown, Cancel / Apply
//  - Apply is only enabled once a different language is picked
//  - after Apply a short "Language selected!" confirmation, then it closes
import { state } from './state.js';
import { E, $ } from './dom.js';
import { t } from './audio.js';
import { LANGS } from './i18n.js';
import { setLang } from './router.js';

// strings.json indices appended for this dialog
const S = { TITLE: 'langTitle', SUB: 'langSub', CANCEL: 'cancel', APPLY: 'apply', DONE_T: 'langDoneT', DONE_B: 'langDoneB' };

const TRANSLATE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h9"/><path d="M8.5 3v2"/><path d="M6 5c.5 3 2.5 5.5 5.5 7"/><path d="M12 5c-.6 3-3 6-7.5 8"/><path d="M12.5 20l4-9 4 9"/><path d="M14 17h5"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
const CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

let overlay = null, doneTimer = null;

export function closeLangModal() {
  clearTimeout(doneTimer);
  document.removeEventListener('keydown', onKey, true);
  if (overlay) { overlay.remove(); overlay = null; }
  const b = $('#langb');
  if (b) b.classList.remove('open');
}

function onKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeLangModal(); }
}

export function openLangModal() {
  if (overlay) return;
  let pending = state.lang;
  let done = false; // true while the "Language selected!" confirmation is showing

  overlay = E('div', 'lm-overlay', document.body);
  // Backdrop tap closes the dialog; while the confirmation is showing, a tap
  // anywhere closes it. (pointerdown, not click, so the Apply click that
  // creates the confirmation can't also dismiss it.)
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay || done) closeLangModal(); });
  document.addEventListener('keydown', onKey, true);
  $('#langb').classList.add('open');

  const card = E('div', 'lm-card', overlay);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;

  const render = (listOpen = false) => {
    card.innerHTML = '';

    const head = E('div', 'lm-head', card);
    E('h2', 'lm-title', head, t(S.TITLE));
    const x = E('button', 'lm-x', head);
    x.innerHTML = CLOSE_SVG;
    x.setAttribute('aria-label', t(S.CANCEL));
    x.onclick = closeLangModal;

    E('p', 'lm-sub', card, t(S.SUB));

    // --- custom select ---------------------------------------------------
    const sel = E('div', 'lm-select', card);
    const toggle = E('button', 'lm-toggle' + (listOpen ? ' open' : ''), sel);
    toggle.type = 'button';
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.setAttribute('aria-expanded', String(listOpen));
    E('span', 'lm-ico', toggle).innerHTML = TRANSLATE_SVG;
    const val = E('span', 'lm-val', toggle, LANGS.find(l => l[0] === pending)[1]);
    val.dataset.l = pending; // script-specific font, see custom.css
    E('span', 'lm-chev', toggle).innerHTML = CHEVRON_SVG;
    toggle.onclick = (e) => { e.stopPropagation(); render(!listOpen); };

    if (listOpen) {
      const list = E('div', 'lm-list', sel);
      list.setAttribute('role', 'listbox');
      LANGS.forEach(([code, name]) => {
        const it = E('button', 'lm-item' + (code === pending ? ' on' : ''), list, name);
        it.type = 'button';
        it.setAttribute('role', 'option');
        it.dataset.l = code;
        it.onclick = (e) => { e.stopPropagation(); pending = code; render(false); };
      });
      const on = list.querySelector('.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    }
    card.onclick = (e) => { if (listOpen && !sel.contains(e.target)) render(false); };

    // --- actions ---------------------------------------------------------
    const row = E('div', 'lm-actions', card);
    const cancel = E('button', 'lm-btn lm-cancel', row, t(S.CANCEL));
    cancel.type = 'button';
    cancel.onclick = closeLangModal;
    const apply = E('button', 'lm-btn lm-apply', row, t(S.APPLY));
    apply.type = 'button';
    apply.disabled = pending === state.lang;
    apply.onclick = () => { if (!apply.disabled) applyLang(); };
  };

  const applyLang = () => {
    setLang(pending); // re-renders the app (and voice-over) in the new language
    card.innerHTML = '';
    card.classList.add('done');
    E('h2', 'lm-title', card, t(S.DONE_T));
    const name = LANGS.find(l => l[0] === pending)[1];
    const p = E('p', 'lm-sub lm-done-msg', card);
    const [a, b = ''] = t(S.DONE_B).split('{lang}');
    p.append(a);
    E('strong', 'lm-hl', p, name);
    p.append(b);
    done = true;
    doneTimer = setTimeout(closeLangModal, 1800);
  };

  render(false);
  card.focus({ preventScroll: true });
}
