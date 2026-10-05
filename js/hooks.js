// Custom hooks system - lightweight state management without React
// This provides useState and useEffect-like functionality for vanilla JS

// WeakMap to store state for each hook instance
const stateStore = new WeakMap();
const effectStore = new WeakMap();
let hookId = 0;

// Create a unique ID for hook instances
function getHookId() {
  return ++hookId;
}

// useState hook - manages state with optional setter callback
export function useState(initialValue) {
  const id = getHookId();
  
  if (!stateStore.has(id)) {
    stateStore.set(id, {
      value: typeof initialValue === 'function' ? initialValue() : initialValue,
      listeners: new Set()
    });
  }
  
  const state = stateStore.get(id);
  
  const setState = (newValue) => {
    const resolvedValue = typeof newValue === 'function' ? newValue(state.value) : newValue;
    if (state.value !== resolvedValue) {
      state.value = resolvedValue;
      // Notify all listeners
      state.listeners.forEach(listener => listener(resolvedValue));
    }
  };
  
  // Subscribe to state changes
  const subscribe = (listener) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  };
  
  return [state.value, setState, subscribe];
}

// useEffect hook - runs side effects with dependency tracking
export function useEffect(callback, deps = []) {
  const id = getHookId();
  
  if (!effectStore.has(id)) {
    effectStore.set(id, {
      prevDeps: null,
      cleanup: null
    });
  }
  
  const effect = effectStore.get(id);
  
  // Check if dependencies changed
  const hasChanged = !effect.prevDeps || 
    deps.length !== effect.prevDeps.length ||
    deps.some((dep, i) => dep !== effect.prevDeps[i]);
  
  if (hasChanged) {
    // Run cleanup if exists
    if (effect.cleanup) {
      effect.cleanup();
      effect.cleanup = null;
    }
    
    // Run effect and store cleanup
    effect.cleanup = callback();
    effect.prevDeps = deps;
  }
}

// useMemo hook - memoizes computed values
export function useMemo(factory, deps = []) {
  const id = getHookId();
  
  if (!stateStore.has(id)) {
    stateStore.set(id, {
      value: null,
      prevDeps: null
    });
  }
  
  const memo = stateStore.get(id);
  
  const hasChanged = !memo.prevDeps || 
    deps.length !== memo.prevDeps.length ||
    deps.some((dep, i) => dep !== memo.prevDeps[i]);
  
  if (hasChanged) {
    memo.value = factory();
    memo.prevDeps = deps;
  }
  
  return memo.value;
}

// useCallback hook - memoizes functions
export function useCallback(callback, deps = []) {
  return useMemo(() => callback, deps);
}

// useRef hook - creates a mutable ref object
export function useRef(initialValue) {
  const id = getHookId();
  
  if (!stateStore.has(id)) {
    stateStore.set(id, {
      current: initialValue
    });
  }
  
  return stateStore.get(id);
}

// useReducer hook - state management with reducer function
export function useReducer(reducer, initialState) {
  const [state, setState, subscribe] = useState(initialState);
  
  const dispatch = (action) => {
    setState(prevState => reducer(prevState, action));
  };
  
  return [state, dispatch, subscribe];
}

// Cleanup function to reset hooks (useful for testing or re-initialization)
export function resetHooks() {
  stateStore.forEach((value, key) => {
    value.listeners.clear();
  });
  effectStore.forEach((value, key) => {
    if (value.cleanup) {
      value.cleanup();
      value.cleanup = null;
    }
  });
  hookId = 0;
}
