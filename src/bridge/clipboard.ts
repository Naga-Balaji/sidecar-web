import {CONFIG} from '../config';

type Handler = (text: string) => void | Promise<void>;

const handlers = new Set<Handler>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastSeen = '';

export function onClipboardChange(fn: Handler): () => void {
  handlers.add(fn);
  ensurePolling();
  return () => {
    handlers.delete(fn);
    if (handlers.size === 0) stopPolling();
  };
}

function ensurePolling() {
  if (timer) return;
  timer = setInterval(async () => {
    if (!document.hasFocus()) return;
    try {
      const current = await navigator.clipboard.readText();
      if (
        current &&
        current !== lastSeen &&
        !current.startsWith(CONFIG.bridge.sentinelPrefix)
      ) {
        lastSeen = current;
        for (const h of handlers) await h(current);
      }
    } catch (e) {
      // Clipboard permission may not be granted yet — quietly skip.
    }
  }, CONFIG.bridge.clipboardPollMs);
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function writeAnswer(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    lastSeen = text;
  } catch (e) {
    console.warn('[clipboard] writeText failed:', e);
  }
}
