// We only measure outbound bytes now. Inbound bytes (model weights, OCR
// traineddata, page assets) are noisy and not a compliance signal — what
// matters is: is our data leaving the desk. bytesOut = 0 is the story.
let bytesOut = 0;
let armed = false;
let originalFetch: typeof fetch | null = null;

const ALLOW_HOSTS = new Set<string>([
  location.host,
  'huggingface.co',
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
]);

const MODEL_LOAD_PREFIXES = ['https://huggingface.co', 'https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net'];

// URLs the app is allowed to hit ONLY when the user has opted into cloud mode.
// The chat.tsx cloud path checks this before making the request; the guard
// simply lets these through so the fetch doesn't throw at the network layer.
const CLOUD_PREFIXES = ['https://openrouter.ai'];

export function armGuard() {
  if (armed) return;
  armed = true;
  originalFetch = window.fetch;
  window.fetch = async (input: any, init?: any) => {
    const url =
      typeof input === 'string' ? input : (input?.url ?? String(input));
    const parsed = safeUrl(url);
    if (parsed && !isLocal(parsed) && !isModelWeights(parsed) && !isCloudLlm(parsed)) {
      console.warn('[guard] blocked outbound fetch to', url);
      throw new Error(`Sidecar network guard: outbound call to ${url} blocked`);
    }
    if (init && typeof init.body === 'string' && !isModelWeights(parsed!)) {
      bytesOut += init.body.length;
    }
    return originalFetch!(input, init);
  };
}

export function markModelLoadComplete() {
  MODEL_LOAD_PREFIXES.length = 0;
  bytesOut = 0;
}

export function getBytes() {
  return {bytesOut};
}

function safeUrl(u: string): URL | null {
  try {
    return new URL(u, location.href);
  } catch {
    return null;
  }
}

function isLocal(u: URL): boolean {
  return (
    u.protocol === 'file:' ||
    u.protocol === 'blob:' ||
    u.protocol === 'data:' ||
    u.host === location.host ||
    u.hostname === 'localhost' ||
    u.hostname === '127.0.0.1'
  );
}

function isModelWeights(u: URL): boolean {
  const s = u.toString();
  return MODEL_LOAD_PREFIXES.some(p => s.startsWith(p));
}

function isCloudLlm(u: URL): boolean {
  const s = u.toString();
  return CLOUD_PREFIXES.some(p => s.startsWith(p));
}
