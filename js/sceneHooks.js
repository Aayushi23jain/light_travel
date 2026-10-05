// Scene-specific hooks using the custom hooks system
import { useState, useEffect, useCallback, useRef } from './hooks.js';

// Hook for managing animation state
export function useAnimationState() {
  const [currentAnimation, setCurrentAnimation] = useState(null);
  const animationRef = useRef(null);
  
  const startAnimation = useCallback((name, clock) => {
    const animState = name ? { name, t0: clock.elapsedTime } : null;
    setCurrentAnimation(animState);
    animationRef.current = animState;
    return animState;
  }, []);
  
  const stopAnimation = useCallback((clock) => {
    if (animationRef.current && animationRef.current.end == null) {
      animationRef.current.end = clock.elapsedTime;
      setCurrentAnimation({ ...animationRef.current });
    }
  }, []);
  
  return { currentAnimation, startAnimation, stopAnimation, animationRef };
}

// Hook for managing camera tween state
export function useCameraTween() {
  const [tween, setTween] = useState(null);
  
  const startTween = useCallback((camera, controls, pos, tgt, ms = 900) => {
    const newTween = { 
      p0: camera.position.clone(), 
      t0: controls.target.clone(), 
      p1: pos.clone(), 
      t1: tgt.clone(), 
      s: performance.now(), 
      ms 
    };
    setTween(newTween);
    return newTween;
  }, []);
  
  const clearTween = useCallback(() => {
    setTween(null);
  }, []);
  
  return { tween, startTween, clearTween };
}

// Hook for managing scene theme
export function useSceneTheme(initialDark = true) {
  const [isDark, setIsDark] = useState(initialDark);
  
  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);
  
  const setTheme = useCallback((dark) => {
    setIsDark(dark);
  }, []);
  
  return { isDark, toggleTheme, setTheme };
}

// Hook for managing sitting/standing state
export function usePoseState(initialSitting = true) {
  const [isSitting, setIsSitting] = useState(initialSitting);
  const [sitTween, setSitTween] = useState(null);
  
  const sitTo = useCallback((value, ms = 1600) => {
    setSitTween({ from: isSitting ? 1 : 0, to: value, s: performance.now(), ms });
    setIsSitting(value === 1);
  }, [isSitting]);
  
  const standUp = useCallback(() => {
    if (isSitting) {
      sitTo(0, 1800);
    }
  }, [isSitting, sitTo]);
  
  return { isSitting, sitTween, sitTo, standUp };
}

// Hook for managing visibility state
export function useVisibilityState(initialState = {}) {
  const [visibility, setVisibility] = useState(initialState);
  
  const setItemVisibility = useCallback((key, visible) => {
    setVisibility(prev => ({ ...prev, [key]: visible }));
  }, []);
  
  const setMultipleVisibility = useCallback((updates) => {
    setVisibility(prev => ({ ...prev, ...updates }));
  }, []);
  
  const resetVisibility = useCallback(() => {
    setVisibility(initialState);
  }, [initialState]);
  
  return { visibility, setItemVisibility, setMultipleVisibility, resetVisibility };
}

// Hook for managing frame callbacks
export function useFrameCallback() {
  const [callback, setCallback] = useState(null);
  
  const setFrameCallback = useCallback((fn) => {
    setCallback(() => fn);
  }, []);
  
  const clearFrameCallback = useCallback(() => {
    setCallback(null);
  }, []);
  
  return { callback, setFrameCallback, clearFrameCallback };
}

// Hook for managing material state
export function useMaterialState() {
  const [materials, setMaterials] = useState({});
  
  const setMaterial = useCallback((key, material) => {
    setMaterials(prev => ({ ...prev, [key]: material }));
  }, []);
  
  const updateMaterial = useCallback((key, updates) => {
    setMaterials(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates }
    }));
  }, []);
  
  return { materials, setMaterial, updateMaterial };
}
