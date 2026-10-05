import { state } from './state.js';
export const t = k => (state.S[state.lang][k] ?? state.S.en[k] ?? '');

export const stopAudio = () => {
  if (state.cur) { try { state.cur.pause(); state.cur.currentTime = 0; } catch (e) {} state.cur = null; }
};

export const say = k => {
  state.muted = false;
  stopAudio();
  const f = state.A[state.lang] && state.A[state.lang][k];
  if (!f) return null;
  const src = 'assets/audio/' + f;
  console.log('[audio]', k, '->', src);
  const a = state.cur = new Audio(src);
  a.muted = false;
  a.play().catch(() => {
    const retry = () => { if (state.cur === a) a.play().catch(() => {}); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, retry, { once: true, capture: true }));
  });
  return a;
};
