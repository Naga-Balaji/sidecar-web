import type {LlmMessage} from './llm';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Model routed to when Chat is in Cloud mode. To try another OpenRouter model,
// just change this string — no other code needs to move.
// Alternatives worth trying:
//   'deepseek/deepseek-chat-v3.1:free'        (free, fast, capable)
//   'deepseek/deepseek-r1:free'               (free, slower but reasoning)
//   'meta-llama/llama-3.2-3b-instruct:free'   (matches local, for A/B)
//   'anthropic/claude-3.5-sonnet'             (paid, top-tier)
export const OR_MODEL = 'deepseek/deepseek-chat-v3.1';
const KEY_STORAGE = 'sidecar.openrouter_key';

export const cloudKey = {
  get(): string {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  },
  set(v: string) {
    if (v) localStorage.setItem(KEY_STORAGE, v.trim());
    else localStorage.removeItem(KEY_STORAGE);
  },
  has(): boolean {
    return !!this.get();
  },
};

export const cloudLlm = {
  async complete(messages: LlmMessage[]): Promise<string> {
    const res = await fetch(OR_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({model: OR_MODEL, messages, stream: false}),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  },

  async stream(messages: LlmMessage[], onToken: (t: string) => void): Promise<string> {
    const res = await fetch(OR_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({model: OR_MODEL, messages, stream: true}),
    });
    if (!res.ok || !res.body) {
      throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return full;
        try {
          const evt = JSON.parse(payload);
          const delta = evt?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            onToken(delta);
          }
        } catch {
          // Ignore incomplete JSON — will retry on next chunk.
        }
      }
    }
    return full;
  },
};

function headers(): Record<string, string> {
  const key = cloudKey.get();
  if (!key) throw new Error('OpenRouter API key not set — paste one in the chat header.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': location.origin,
    'X-Title': 'Sidecar',
  };
}
