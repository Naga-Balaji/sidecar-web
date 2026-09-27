export type Mode = 'local' | 'cloud';

const STORAGE_KEY = 'sidecar.mode';
const listeners = new Set<(m: Mode) => void>();

function read(): Mode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'cloud' ? 'cloud' : 'local';
}

let current: Mode = typeof localStorage === 'undefined' ? 'local' : read();

export function getMode(): Mode {
  return current;
}

export function setMode(m: Mode) {
  if (m === current) return;
  current = m;
  localStorage.setItem(STORAGE_KEY, m);
  for (const l of listeners) l(m);
}

export function onModeChange(fn: (m: Mode) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
