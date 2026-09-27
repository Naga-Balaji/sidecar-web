export type Persona = 'general' | 'legal';

const STORAGE_KEY = 'sidecar.persona';
const listeners = new Set<(p: Persona) => void>();

function read(): Persona {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'legal' ? 'legal' : 'general';
}

let current: Persona = typeof localStorage === 'undefined' ? 'general' : read();

export function getPersona(): Persona {
  return current;
}

export function setPersona(p: Persona) {
  if (p === current) return;
  current = p;
  localStorage.setItem(STORAGE_KEY, p);
  for (const l of listeners) l(p);
}

export function onPersonaChange(fn: (p: Persona) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
