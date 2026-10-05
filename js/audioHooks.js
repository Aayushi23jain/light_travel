// Audio management using custom hooks pattern
// These hooks provide a reactive interface for audio and translation state
// while maintaining backward compatibility with existing code

import { useState, useCallback, useRef } from './hooks.js';
import { state } from './state.js';

// Hook for managing audio state
export function useAudioState() {
  const [isMuted, setIsMuted] = useState(state.muted);
  const [currentAudio, setCurrentAudio] = useState(state.cur);
  const audioRef = useRef(null);
  
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    state.muted = newMuted;
    if (audioRef.current) {
      audioRef.current.muted = newMuted;
    }
  }, [isMuted]);
  
  const setMuted = useCallback((muted) => {
    setIsMuted(muted);
    state.muted = muted;
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, []);
  
  const playAudio = useCallback((audioElement) => {
    setCurrentAudio(audioElement);
    state.cur = audioElement;
    audioRef.current = audioElement;
    audioElement.muted = isMuted;
  }, [isMuted]);
  
  const stopAudio = useCallback(() => {
    if (state.cur) {
      try { state.cur.pause(); state.cur.currentTime = 0; } catch (e) {}
      state.cur = null;
    }
    setCurrentAudio(null);
    audioRef.current = null;
  }, []);
  
  return { isMuted, currentAudio, toggleMute, setMuted, playAudio, stopAudio };
}

// Hook for managing language translations
export function useTranslations() {
  const [lang, setLang] = useState(state.lang);
  const [strings, setStrings] = useState(state.S);
  
  const t = useCallback((key) => {
    if (!strings || !strings[lang]) return '';
    return strings[lang][key] ?? strings.en[key] ?? '';
  }, [strings, lang]);
  
  const changeLanguage = useCallback((newLang) => {
    setLang(newLang);
    state.lang = newLang;
  }, []);
  
  return { lang, strings, t, changeLanguage };
}
