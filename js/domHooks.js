// DOM utilities using custom hooks pattern
import { useState, useEffect, useCallback, useRef } from './hooks.js';
import { stopAudio } from './audio.js';

// Hook for managing banner (top instruction strip)
export function useBanner() {
  const [bannerText, setBannerText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  
  const showBanner = useCallback((text) => {
    setBannerText(text || '');
    setIsVisible(!!text);
    
    const b = document.querySelector('#banner');
    if (b) {
      b.hidden = !text;
      b.textContent = text || '';
      
      // Close menu when banner is shown
      if (text) {
        document.querySelector('#menu').hidden = true;
        document.querySelector('#langs').hidden = true;
        document.querySelector('#dim').hidden = true;
        document.querySelector('#menub').dataset.open = 'false';
        
        const setMenuIcon = (open = false) => {
          const mb = document.querySelector('#menub');
          if (!mb) return;
          const MENU_SVG = {
            closed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
            open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
          };
          mb.innerHTML = open ? MENU_SVG.open : MENU_SVG.closed;
          mb.setAttribute('aria-label', 'Menu');
        };
        setMenuIcon(false);
      }
    }
  }, []);
  
  const hideBanner = useCallback(() => {
    showBanner('');
  }, [showBanner]);
  
  return { bannerText, isVisible, showBanner, hideBanner };
}

// Hook for managing panel (bottom content card)
export function usePanel() {
  const [isVisible, setIsVisible] = useState(false);
  const [skipCameraShift, setSkipCameraShift] = useState(false);
  const panelRef = useRef(null);
  
  const showPanel = useCallback((renderFn, skipShift = false) => {
    const p = document.querySelector('#panel');
    if (!p) return;
    
    p.innerHTML = '';
    p.className = '';
    p.hidden = !renderFn;
    setSkipCameraShift(skipShift);
    setIsVisible(!!renderFn);
    
    if (renderFn) {
      p.dataset.skipCameraShift = skipShift;
      renderFn(p);
    }
  }, []);
  
  const hidePanel = useCallback(() => {
    showPanel(null);
  }, [showPanel]);
  
  return { isVisible, skipCameraShift, showPanel, hidePanel };
}

// Hook for creating DOM elements
export function useDOMElements() {
  const createElement = useCallback((tag, className, parent, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    if (parent) parent.append(element);
    return element;
  }, []);
  
  const createButton = useCallback((parent, text, onClick) => {
    const button = createElement('button', 'btn', parent, text);
    button.onclick = (e) => { stopAudio(); onClick(e); };
    return button;
  }, [createElement]);
  
  return { createElement, createButton };
}

// Hook for managing menu icon state
export function useMenuIcon() {
  const [isOpen, setIsOpen] = useState(false);
  
  const setMenuIcon = useCallback((open = false) => {
    setIsOpen(open);
    const mb = document.querySelector('#menub');
    if (!mb) return;
    
    const MENU_SVG = {
      closed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
      open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
    };
    
    mb.innerHTML = open ? MENU_SVG.open : MENU_SVG.closed;
    mb.setAttribute('aria-label', 'Menu');
  }, []);
  
  return { isOpen, setMenuIcon };
}

// Hook for DOM queries
export function useDOMQuery() {
  const querySelector = useCallback((selector) => {
    return document.querySelector(selector);
  }, []);
  
  return { querySelector };
}
