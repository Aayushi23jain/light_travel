// Guided tour (logic taken from the Sublimation project): a dark mask with a "spotlight" cut-out around the UI
// element of the current step, plus a tooltip card explaining it. Texts come from i18n.js (en, gu, hi, mr).
import { t, stopAudio } from './audio.js';

const STEPS = [
  { target: null, title: () => t('tWelcome'), body: () => t('tWelcomeB') },
  { target: '#c', shape: 'full', title: () => t('tExplore'), body: () => t('tExploreB') },
  { target: '#langb', title: () => t('tLang'), body: () => t('tLangB') },
  { target: '#theme', title: () => t('tTheme'), body: () => t('tThemeB') },
  { target: '#fs', title: () => document.fullscreenElement ? t('tNormal') : t('tFs'),
    body: () => document.fullscreenElement ? t('tFsExitB') : t('tFsB') },
  { target: '#replay', title: () => t('tReplay'), body: () => t('tReplayB') },
  { target: null, title: () => t('tAllSet'), body: () => t('tAllSetB') }
];

export class Tour {
  constructor() {
    this.overlay    = document.getElementById('tourOverlay');
    this.spotlight  = document.getElementById('tourSpotlight');
    this.tooltip    = document.getElementById('tourTooltip');
    this.progressEl = document.getElementById('tourProgress');
    this.titleEl    = document.getElementById('tourTitle');
    this.bodyEl     = document.getElementById('tourBody');
    this.backBtn    = document.getElementById('tourBackBtn');
    this.nextBtn    = document.getElementById('tourNextBtn');
    this.skipBtn    = document.getElementById('tourSkipBtn');

    this.index = 0;
    this.active = false;
    this.onEnd = null; // one-shot callback, fired when the tour closes

    this.backBtn.onclick = () => { stopAudio(); this.prev(); };
    this.nextBtn.onclick = () => { stopAudio(); this.next(); };
    this.skipBtn.onclick = () => { stopAudio(); this.end(); };

    // Keep the spotlight/tooltip glued to their target across resizes.
    let resizeTimeout;
    addEventListener('resize', () => {
      if (this.active) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => this.render(), 50);
      }
    });

    // Live-swap the fullscreen step's wording if the student toggles
    // fullscreen while looking at that step.
    document.addEventListener('fullscreenchange', () => {
      if (this.active && STEPS[this.index].target === '#fs') {
        this.render();
      }
    });
  }

  start() {
    this.index = 0;
    this.active = true;
    document.body.classList.add('tour-active'); // un-dims locked buttons (menu/sound) so they highlight like the rest
    this.overlay.hidden = false;
    this.render();
  }

  end() {
    const wasActive = this.active;
    this.active = false;
    document.body.classList.remove('tour-active');
    this.overlay.hidden = true;
    const cb = this.onEnd;
    this.onEnd = null;
    if (wasActive && cb) cb();
  }

  next() {
    if (this.index >= STEPS.length - 1) { this.end(); return; }
    this.index++;
    this.render();
  }

  prev() {
    if (this.index === 0) return;
    this.index--;
    this.render();
  }

  render() {
    const step = STEPS[this.index];

    // Skip replay step if button is not visible
    if (step.target === '#replay' && !document.getElementById('replay').classList.contains('visible')) {
      this.next();
      return;
    }

    this.progressEl.textContent = `${this.index + 1} / ${STEPS.length}`;
    this.titleEl.textContent = typeof step.title === 'function' ? step.title() : step.title;
    this.bodyEl.textContent = typeof step.body === 'function' ? step.body() : step.body;

    this.backBtn.style.visibility = this.index === 0 ? 'hidden' : 'visible';
    this.backBtn.textContent = t('tBack');
    this.nextBtn.textContent = this.index === STEPS.length - 1 ? t('tDone') : t('tNext');
    this.skipBtn.textContent = t('tSkip');
    this.skipBtn.style.visibility = this.index === STEPS.length - 1 ? 'hidden' : 'visible';

    const targetEl = step.target ? document.querySelector(step.target) : null;

    if (targetEl && step.shape !== 'full') {
      this.positionSpotlightOn(targetEl);
      this.positionTooltipNear(targetEl.getBoundingClientRect());
    } else if (targetEl && step.shape === 'full') {
      // Frame the whole area (canvas / labels overlay) rather than one small element.
      this.spotlight.style.opacity = '1';
      this.spotlight.style.top = '8px';
      this.spotlight.style.left = '8px';
      this.spotlight.style.width = 'calc(100% - 16px)';
      this.spotlight.style.height = 'calc(100% - 16px)';
      this.spotlight.style.borderRadius = '16px';
      this.centerTooltip();
    } else {
      this.spotlight.style.opacity = '0';
      this.centerTooltip();
    }
  }

  positionSpotlightOn(el) {
    const r = el.getBoundingClientRect();
    // The highlight ring must stay inside the gap between neighbouring buttons,
    // otherwise it also lights up part of the next button. So the padding is
    // derived from the real gap of the button row (#tl / #bl), which changes per
    // screen size (mobile / tablet / desktop): at most half the gap, minus 1px.
    const row = el.closest('#tl, #bl');
    const gap = row ? (parseFloat(getComputedStyle(row).columnGap) || 0) : 0;
    const pad = row ? Math.max(1, Math.min(6, gap / 2 - 1)) : 10;
    this.spotlight.style.opacity = '1';
    this.spotlight.style.top = (r.top - pad) + 'px';
    this.spotlight.style.left = (r.left - pad) + 'px';
    this.spotlight.style.width = (r.width + pad * 2) + 'px';
    this.spotlight.style.height = (r.height + pad * 2) + 'px';
    const br = getComputedStyle(el).borderRadius;
    this.spotlight.style.borderRadius = br.includes('%') ? br : (Math.max(parseFloat(br) || 12, 10) + pad) + 'px';
  }

  positionTooltipNear(rect) {
    this.tooltip.style.transform = 'none';
    const tw = this.tooltip.offsetWidth || 300;
    const th = this.tooltip.offsetHeight || 180;
    const margin = 16;

    let top = rect.bottom + margin;
    let left = rect.left;

    // Not enough room below — place above instead.
    if (top + th > innerHeight - margin) top = rect.top - th - margin;
    // Still nowhere good vertically (very small screen) — just center.
    if (top < margin) { this.centerTooltip(); return; }

    if (left + tw > innerWidth - margin) left = innerWidth - tw - margin;
    if (left < margin) left = margin;

    this.tooltip.style.top = top + 'px';
    this.tooltip.style.left = left + 'px';
  }

  centerTooltip() {
    this.tooltip.style.top = '50%';
    this.tooltip.style.left = '50%';
    this.tooltip.style.transform = 'translate(-50%, -50%)';
  }
}