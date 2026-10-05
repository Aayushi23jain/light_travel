// Tiny DOM helpers shared by every mode.
import { stopAudio } from './audio.js';

export const $ = s => document.querySelector(s);

export const E = (tag, cls, par, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  if (par) par.append(e);
  return e;
};

// Top instruction strip. Call with no argument (or '') to hide it.
export const banner = (s) => {
  const b = $('#banner');
  b.hidden = !s;
  b.textContent = s || '';
};

// Bottom content card. Pass a render function to show it, or nothing to hide it.
// Optional second parameter: skipCameraShift = true to prevent camera from shifting
export const panel = (fn, skipCameraShift = false) => {
  const p = $('#panel');
  p.innerHTML = '';
  p.className = ''; // clear any per-mode styling (e.g. the Introduction panel's full-height layout) left over from before
  p.hidden = !fn;
  if (fn) {
    p.dataset.skipCameraShift = skipCameraShift;
    fn(p);
  }
};

export const btn = (p, txt, fn) => {
  const b = E('button', 'btn', p, txt);
  // Any Continue / Next / Submit / Ok button silences the current voice-over
  // first; the handler may then start the next clip.
  b.onclick = (e) => { stopAudio(); fn(e); };
  return b;
};