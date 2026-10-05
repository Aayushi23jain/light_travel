// State management using custom hooks pattern
import { useState, useEffect, useCallback } from './hooks.js';

// One shared, mutable state object (modules mutate properties, never reassign).
// Extended with hooks pattern for reactive updates
export const state = { 
  S: null, A: null, lang: 'en', muted: false, cur: null, timers: [], 
  mode: '', startDone: false, welcomed: false, recalled: false, seen: new Set(),
  redo: null, langSwitch: false, tourDone: false, score: 0, summaryOff: null 
};

// State listeners for reactive updates
const stateListeners = new Set();

// Subscribe to state changes
export const subscribeToState = (listener) => {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
};

// Notify listeners of state changes
const notifyStateChange = () => {
  stateListeners.forEach(listener => listener({ ...state }));
};

// Timer management
export const later = (fn, ms) => state.timers.push(setTimeout(fn, ms));
export const clearTimers = () => { state.timers.forEach(clearTimeout); state.timers = []; };

// Hook-like interface for reactive state management
export function useAppState(selector) {
  const [localState, setLocalState] = useState(() => selector ? selector(state) : state);
  
  useEffect(() => {
    const unsubscribe = subscribeToState((newState) => {
      setLocalState(selector ? selector(newState) : newState);
    });
    return unsubscribe;
  }, [selector]);
  
  return localState;
}

// Specific state setters with notification
export const setLanguage = (lang) => { state.lang = lang; notifyStateChange(); };
export const setMode = (mode) => { state.mode = mode; notifyStateChange(); };
export const setMuted = (muted) => { state.muted = muted; notifyStateChange(); };
export const setRedo = (redoFn) => { state.redo = redoFn; notifyStateChange(); };
export const setScore = (score) => { state.score = score; notifyStateChange(); };
export const setSummaryOff = (cleanupFn) => { state.summaryOff = cleanupFn; notifyStateChange(); };
