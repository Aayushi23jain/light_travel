// Student intro flow: Step 1 = a hook question, Step 2 = the concept (straight vs bent beam).
// Runs once after "Let's start", then the guided tour opens.
import { state } from './state.js';
import { t, say, stopAudio } from './audio.js';
import { E } from './dom.js';

const MODES = ['straight', 'bent'];
const CYCLE_MS = 3000;
let root = null, onDone = null, step = 0, pick = -1, timer = 0;

export function startStudentFlow(done) {
  if (root) { clearInterval(timer); stopAudio(); root.remove(); root = null; }
  document.getElementById('replay').classList.add('visible');
  onDone = done; step = 0; pick = -1;
  root = E('div', '', document.body); root.id = 'sf';
  state.redo = render;
  render(true);
}

function finish() {
  clearInterval(timer); stopAudio();
  root && root.remove(); root = null; state.redo = null;
  const cb = onDone; onDone = null; cb && cb();
}

function render(fresh) {
  clearInterval(timer);
  if (fresh !== false) say(step === 0 ? 'studentFlow1' : 'concept');
  root.innerHTML = '';
  const card = E('div', 'sf-card', root), dots = E('div', 'sf-dots', card);
  [0, 1].forEach(i => E('span', i === step ? 'on' : i < step ? 'done' : '', dots));
  if (step === 0) hook(card); else concept(card);
}

// Step 1: story + question (first option is the right one; any pick shows a response, then Next unlocks)
function hook(card) {
  E('h2', 'sf-title', card, t('sfTitle'));
  const g = E('div', 'sf-grid', card), art = E('div', 'sf-art', g);
  art.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true">'
    + '<rect x="20" y="150" width="160" height="12" rx="6" fill="#20242c"/>'
    + '<rect x="86" y="96" width="16" height="56" rx="6" fill="#e8e2d4"/>'
    + '<ellipse class="sf-flame" cx="94" cy="86" rx="9" ry="16" fill="#ffb347"/>'
    + '<g class="sf-pipe"><rect x="112" y="112" width="64" height="14" rx="7" fill="#c9a06a"/></g>'
    + '<line class="sf-beam" x1="100" y1="88" x2="176" y2="88" stroke="#ffe066" stroke-width="4" stroke-linecap="round"/>'
    + '</svg>';
  const side = E('div', 'sf-side', g);
  E('p', 'sf-story', side, t('sfStory')); E('h3', 'sf-q', side, t('sfQ'));
  const opts = E('div', 'sf-opts', side);
  t('sfO').forEach((txt, i) => {
    const b = E('button', 'sf-opt' + (i === pick ? ' on' : ''), opts, txt); b.type = 'button';
    b.onclick = () => { pick = i; render(false); };
  });
  if (pick >= 0) E('p', 'sf-resp', side, t(pick === 0 ? 'sfRespOk' : 'sfRespNo'));
  const next = E('button', 'btn sf-next', side, t('tNext')); next.type = 'button'; next.disabled = pick < 0;
  next.onclick = () => { stopAudio(); step = 1; render(); };
}

// Step 2: straight vs bent beam demo
function concept(card) {
  E('h2', 'sf-title', card, t('sfCTitle'));
  const g = E('div', 'sf-grid two', card), left = E('div', 'sf-card2', g), tiles = [];
  const grid = E('div', 'sj-types', left);
  MODES.forEach((k, i) => { const d = E('div', 'sj-type', grid); E('b', '', d, t('sfS')[i]); tiles.push(d); });
  E('p', 'sf-expl', left, t('sfCExpl')); E('p', 'sf-depo', left, t('sfCFoot'));
  const right = E('div', 'sf-card2', g); E('p', 'sf-head', right, t('sfCHead'));
  const box = E('div', 'sf-pbox', right), stage = E('div', 'sj-stage', box);
  stage.innerHTML = '<svg viewBox="0 0 200 120" aria-hidden="true">'
    + '<circle cx="26" cy="60" r="10" fill="#fff2b0"/>'
    + '<g class="sj-pipebox"><rect x="60" y="52" width="80" height="16" rx="8" fill="#c9a06a"/></g>'
    + '<line class="sj-beam" x1="36" y1="60" x2="180" y2="60" stroke="#ffe066" stroke-width="5" stroke-linecap="round"/>'
    + '<circle class="sj-eye" cx="184" cy="60" r="7" fill="#ffd27a"/>'
    + '</svg>';
  const label = E('p', 'sf-phase', right); let n = 0;
  const show = () => { const k = MODES[n % 2]; stage.dataset.k = k; label.textContent = t('sfS')[n % 2]; tiles.forEach((d, i) => d.classList.toggle('on', i === n % 2)); };
  show(); timer = setInterval(() => { n++; show(); }, CYCLE_MS);
  const go = E('button', 'btn sf-start', card, t('cont')); go.type = 'button'; go.onclick = finish;
}
