// App flow for "Light Travels in a Straight Line":
// Start screen -> student flow -> tour (once) -> Introduction -> Activity (candle + pipe)
// -> Experiment (torch + cardboards + screen) -> Quiz -> Summary.
// Every screen is rebuilt when the language changes (see setLang).
import { state, later, clearTimers, setMode, setRedo, setScore, setSummaryOff } from './state.js';
import { LANGS } from './i18n.js';
import { t, say, stopAudio } from './audio.js';
import { $, E, banner, panel, btn } from './dom.js';
import * as sc from './scene.js';
import { Tour } from './tour.js';
import { startStudentFlow } from './studentFlow.js';

let tour = null;

const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-img globe-icon"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
export function renderLangButton() {
  const b = $('#langb'); b.innerHTML = GLOBE;
  b.setAttribute('aria-label', 'Language: ' + LANGS.find(x => x[0] === state.lang)[1]); b.setAttribute('aria-haspopup', 'dialog');
}
export function setLang(l) {
  stopAudio();
  state.lang = l; document.documentElement.lang = l; document.body.dataset.l = l;
  document.title = t('title');
  const loadText = $('#loadText'); if (loadText) loadText.textContent = t('loading');
  renderLangButton(); updateButtonTitles();
  if (state.redo) { state.langSwitch = true; try { state.redo(); } finally { state.langSwitch = false; } }
  if (tour && tour.active) tour.render();
}
export function updateButtonTitles() {
  $('#langb').setAttribute('title', t('btnLang'));
  $('#theme').setAttribute('title', t('btnTheme'));
  $('#fs').setAttribute('title', t('btnFullscreen'));
  $('#replay').setAttribute('title', t('btnReplay'));
  const prev = $('#prev'), next = $('#next');
  if (prev) { prev.setAttribute('title', t('previous')); prev.setAttribute('aria-label', t('previous')); if (!prev.hidden) prev.textContent = t('previous'); }
  if (next) { next.setAttribute('title', t('next')); next.setAttribute('aria-label', t('next')); if (!next.hidden) next.textContent = t('next'); }
}

export function wireChrome() {
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  const COMPRESS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
  const REPLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  $('#theme').innerHTML = MOON; $('#fs').innerHTML = EXPAND; $('#replay').innerHTML = REPLAY;
  $('#theme').onclick = () => { const light = document.documentElement.dataset.theme !== 'light'; document.documentElement.dataset.theme = light ? 'light' : 'dark'; $('#theme').innerHTML = light ? SUN : MOON; sc.setTheme(!light); };
  $('#fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
  document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; $('#fs').innerHTML = on ? COMPRESS : EXPAND; });
  $('#replay').onclick = () => replayStudentFlow();
  ['#langb', '#theme', '#fs', '#prev', '#next', '#replay'].forEach(sel => {
    const b = $(sel); if (!b) return;
    let tm; b.addEventListener('click', () => { b.classList.add('flash-gold'); clearTimeout(tm); tm = setTimeout(() => b.classList.remove('flash-gold'), 1000); });
  });
  updateButtonTitles();
}

// ---------------------------------------------------------------------------------------------------------------
let hots = [];
let flowId = 0;                       // bumped on every screen change so late animation callbacks can be ignored
function clearAll() {
  flowId++; clearTimers(); stopAudio(); banner(); panel(); if (state.summaryOff) { state.summaryOff(); state.summaryOff = null; }
  hots.forEach(h => h.el.remove()); hots = []; sc.onFrame.fn = null;
  sc.showActivity(false); sc.showExperiment(false); sc.lightCandle(false); sc.setPipeBent(false); sc.setTorchOn(false); sc.setCardOffsets([0, 0, 0]); sc.placePipe(false, 0); sc.enableCardDrag(false);
  setNav(null, null);
}
function enter(mode, fn, homeMs) {
  clearAll(); setMode(mode); setRedo(() => enter(mode, fn)); fn(); sc.home(homeMs ?? 500);
  sc.lockCamera(mode === 'activity' || mode === 'experiment');
}
function setNav(prevFn, nextFn) {
  const pb = $('#prev'), nb = $('#next');
  const configure = (b, fn, label) => { if (!b) return; b.hidden = !fn; b.textContent = fn ? t(label) : ''; b.setAttribute('aria-label', fn ? t(label) : ''); b.title = fn ? t(label) : ''; b.onclick = fn ? () => { stopAudio(); fn(); } : null; };
  configure(pb, prevFn, 'previous'); configure(nb, nextFn, 'next');
}
// a pulsing click target pinned to a 3D anchor
function hot(anchorFn, label, onclick) {
  const el = E('button', 'hot', $('#labels')); el.setAttribute('aria-label', label); el.onclick = onclick;
  const h = { el, anchorFn }; hots.push(h); return h;
}
function pinHots() {
  sc.onFrame.fn = () => hots.forEach(h => { const p = sc.project(h.anchorFn()); h.el.style.display = p.vis ? '' : 'none'; h.el.style.left = p.x + 'px'; h.el.style.top = p.y + 'px'; });
}

// ---------------------------------------------------------------------------------------------------------------
function choose(p, labels, correct, okTxt, noTxt, done, explanationKey) {
  let sel = -1, locked = false;
  const btns = [], fb = E('p', 'fb', p); fb.hidden = true;
  const sub = btn(p, t('submit'), () => {
    locked = true; btns.forEach(x => { x.disabled = true; x.classList.remove('sel'); });
    const ok = sel === correct; btns[sel].classList.add(ok ? 'ok' : 'no'); if (!ok) btns[correct].classList.add('ok');
    fb.hidden = false; fb.className = 'fb ' + (ok ? 'ok' : 'no'); fb.textContent = ok ? okTxt : noTxt;
    const a = say(ok ? 'correct' : 'incorrect');
    sub.remove();
    const next = btn(p, t('cont'), () => done(ok));
    if (explanationKey) {
      let explained = false;
      const playExplanation = () => { if (explained) return; explained = true; say(explanationKey); };
      if (a) { a.addEventListener('ended', playExplanation, { once: true }); a.addEventListener('error', playExplanation, { once: true }); } else playExplanation();
    }
  });
  sub.disabled = true;
  labels.forEach((txt, n) => {
    const b = E('button', 'opt', p, txt); p.insertBefore(b, fb); btns.push(b);
    b.onclick = () => { if (locked) return; sel = n; btns.forEach((x, i) => x.classList.toggle('sel', i === n)); sub.disabled = false; };
  });
}

export const replayStudentFlow = () => {
  if (tour && tour.active) { tour.onEnd = null; tour.end(); }   // replay never runs the guided tour
  clearAll(); setMode(''); setRedo(null); sc.lockCamera(false); sc.showIntro(true);
  startStudentFlow(() => explore());
};
export const startFlow = () => startStudentFlow(() => {
  tour = tour || new Tour();
  setRedo(null);
  tour.onEnd = () => { state.tourDone = true; explore(); };
  tour.start();
});

// "Let us explore": the torch model first (demo.mp4), then the Introduction
function explore() {
  setNav(null, null); sc.showIntro(true);
  setRedo(explore);
  panel(p => {
    p.classList.add('tp'); E('h3', '', p, t('exploreTitle')); E('p', '', p, t('exploreText'));
    btn(p, t('next'), () => { banner(); setRedo(intro); intro(); });
  });
  say('summaryIntro');
}
function intro() {
  setNav(null, null); sc.showIntro(false); sc.home(600);
  panel(p => {
    p.classList.add('intro', 'tp'); E('h3', '', p, t('intro'));
    const ul = E('ul', '', p); t('introText').split('|').forEach(s => E('li', '', ul).innerHTML = s);   // all points are bullets
    btn(p, t('cont'), () => enter('activity', activity));
  });
  setRedo(intro);
  say('intro');
}

// --- ACTIVITY (same order as demo.mp4): light candle -> pipe in front of candle -> Q -> bend -> Q -> explanation ----
const noHots = () => { hots.forEach(h => h.el.remove()); hots = []; sc.onFrame.fn = null; };
const yesNo = (qKey, correct, next) => panel(p => { p.classList.add('tp'); E('p', '', p, t(qKey)); choose(p, t('yn'), correct, t(qKey + 'ok'), t(qKey + 'no'), next); });
function activity() {
  setNav(() => enter('intro', intro), () => enter('experiment', experiment));
  sc.showActivity(true); sc.frameActivity(700);
  stepMatch();
}
function stepMatch() {
  banner(t('clickMatch2')); say('lightCandle'); pinHots();
  hot(sc.ANCHOR.matchbox, t('clickMatch2'), () => {
    noHots(); banner(); const id = flowId;
    sc.lightCandle(true).then(() => {                       // tray slides out, stick is struck, lights the candle, lies down again (camera moves inside)
      if (id !== flowId) return;
      later(stepPipeStraight, 500);
    });
  });
}
function stepPipeStraight() {
  banner(t('clickPipe2')); say('placePipe'); pinHots();
  hot(sc.ANCHOR.pipe, t('clickPipe2'), () => {
    noHots(); banner(); const id = flowId;
    sc.framePipeOut(1000);
    sc.placePipe(true, 1300).then(() => {                   // pipe now sits in front of the candle
      if (id !== flowId) return;
      sc.framePipeInside(1500).then(() => {                 // eye at the pipe end: look THROUGH the straight pipe
        if (id !== flowId) return;
        say('pipeStraightObservation');
        const a = state.cur;
        if (a) a.addEventListener('ended', () => say('pipeStraight'), { once: true });
        yesNo('qFlame1', 0, () => { panel(); stepPipeBend(); });
      });
    });
  });
}
function stepPipeBend() {
  const id = flowId;
  sc.framePipeOut(1400).then(() => {
    if (id !== flowId) return;
    banner(t('actPipe')); say('bendPipe'); pinHots();
    hot(sc.ANCHOR.pipe, t('actPipe'), () => {
      noHots(); banner();
      sc.setPipeBent(true, 1300).then(() => {
        if (id !== flowId) return;
        sc.framePipeInside(1500).then(() => {               // same eye position, the bent pipe now blocks the view
          if (id !== flowId) return;
          say('pipeStraightObservation');
          const a = state.cur;
          if (a) a.addEventListener('ended', () => say('pipeStraight'), { once: true });
          yesNo('qFlame2', 1, () => panel(p => {
            p.classList.add('tp'); E('p', '', p, t('actExplain'));
            say('activityObservation');
            btn(p, t('ok'), () => {
              panel(); sc.placePipe(false, 1000); sc.frameActivity(1000);
              banner(t('actDone')); say('activityComplete'); later(() => enter('experiment', experiment), 3600);
            });
          }));
        });
      });
    });
  });
}

// --- EXPERIMENT (demo.mp4): torch -> beam stops -> Q -> drag cardboards -> aligned -> move up/down -> done ---------
const MIS = [0, 0, 0.5];          // start (up/down): cardboard 1 aligned (the light passes it), 2 aligned vertically, 3 up
const PART2 = [0.55, -0.55, 0.5]; // part 2 (static): cardboard 1 up, 2 down, 3 up
const MISX = [0, 0.35, 0];        // start (sideways): cardboard 2 is shifted LEFT (the card is 1.22 wide, so it still stands in the beam and stops it; the beam cannot reach 3)
function experiment() {
  setNav(() => enter('activity', activity), () => enter('quiz', quiz));
  sc.showExperiment(true); sc.setCardOffsets(MIS, MISX); sc.frameExperiment(700);
  stepTorch();
}
function stepTorch() {
  banner(t('clickTorch')); say('clickTorch'); pinHots();
  hot(sc.ANCHOR.torch, t('clickTorch'), () => {
    noHots(); sc.setTorchOn(true); banner();
    later(() => { say('holesNotAligned'); panel(p => { p.classList.add('tp'); E('p', '', p, t('qBeam')); choose(p, t('yn'), 1, t('qBeamok'), t('qBeamno'), () => { panel(); stepAlign(); }); }); }, 1200);
  });
}
function stepAlign() {
  banner(t('expAdjust2')); say('adjustCardboard'); sc.frame3q(900);
  let done = false;
  sc.enableCardDrag(true, fin => { if (fin && !done && sc.aligned()) { done = true; onAligned(); } }, [0, 1, 2]);   // all three can be moved (card 2 starts shifted left, card 3 starts up)
}
function onAligned() {
  banner(); say('holesAligned');
  panel(p => {
    p.classList.add('tp'); E('p', '', p, t('expAlignedOk'));
    btn(p, t('ok'), () => {
      panel(); banner(t('expMove2')); say('moveUpDown');
      let done2 = false;                                   // part 2: the moment the light reaches the screen -> "experiment complete" banner + voice, then the quiz
      sc.enableCardDrag(true, () => {
        if (done2 || !sc.aligned()) return;
        done2 = true; banner(t('expDone')); say('experimentComplete');
        later(() => { sc.enableCardDrag(false); enter('quiz', quiz); }, 3200);
      }, [0, 1, 2]);
      sc.moveCards(PART2);                                 // the cardboards stand still, 1 up / 2 down / 3 up (they can still be dragged)
    });
  });
}

// --- QUIZ + SUMMARY ---------------------------------------------------------------------------------------
const QZ = [['q1', 1, 'q1e'], ['q2', 0, 'q2e'], ['q3', 1, 'q3e'], ['q4', 1, 'q4e']];
function quiz() { setScore(0); setNav(() => enter('experiment', experiment), null); sc.showExperiment(true); sc.frameExperiment(700); ask(0); }
function ask(i) {
  if (i >= QZ.length) { summary(); return; }
  setRedo(() => ask(i));
  const [q, c, e] = QZ[i];
  panel(p => {
    p.classList.add('tp');
    E('h3', '', p, t('question') + ' ' + (i + 1) + '/' + QZ.length); E('p', '', p, t(q));
    choose(p, t(q + 'o'), c, t(q + 'ok'), t(q + 'no'), ok => { if (ok) setScore(state.score + 1); ask(i + 1); }, e);
  });
  stopAudio(); say(q);
}
function summary() {
  panel(); banner(); setNav(null, null); if (state.summaryOff) { state.summaryOff(); setSummaryOff(null); } setRedo(summary);
  const total = QZ.length, ok = state.score, bad = total - ok, pct = Math.round(ok / total * 100), stars = Math.floor(ok / total * 5);
  const ov = E('div', 'qs-overlay', document.body), card = E('div', 'qs-card', ov);
  const off = () => { ov.remove(); if (state.redo === summary) setRedo(null); };
  setSummaryOff(off);
  E('h3', '', card, t('qzSummary'));
  const st = E('div', 'qs-stars', card); for (let s = 0; s < 5; s++) E('span', s < stars ? 'on' : '', st, '★');
  const row = E('div', 'qs-row', card), ring = E('div', 'qs-ring', row); ring.style.background = 'conic-gradient(#4fa8ff ' + pct + '%, #33333d ' + pct + '% 100%)';
  const inner = E('div', '', ring); E('b', '', inner, pct + '%'); E('small', '', inner, t('qzAccuracy'));
  const stats = E('div', 'qs-stats', row);
  [['#22c55e', '✓', ok, 'qzCorrect'], ['#ef4444', '✗', bad, 'qzIncorrect']].forEach(([col, sym, n, key]) => {
    const d = E('div', '', stats), ic = E('span', '', d, sym); ic.style.cssText = 'border-color:' + col + ';color:' + col;
    const tx = E('div', '', d); E('b', '', tx, String(n).padStart(2, '0')); E('small', '', tx, t(key));
  });
  const go = E('button', 'qs-btn', card, t('cont'));
  go.onclick = () => { stopAudio(); off(); setSummaryOff(null); topicSummary(); };
}
function topicSummary() {
  panel(); banner(); setNav(null, null);
  if (state.summaryOff) { state.summaryOff(); setSummaryOff(null); }
  setRedo(topicSummary);
  const ov = E('div', 'qs-overlay', document.body), card = E('div', 'qs-card', ov);
  const off = () => { ov.remove(); if (state.redo === topicSummary) setRedo(null); };
  setSummaryOff(off);
  E('h3', '', card, t('qzSummary'));
  E('p', 'qs-topic-summary', card, t('topicSummary'));
  say('topicSummaryAudio');
}