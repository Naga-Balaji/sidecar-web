import {CONFIG} from '../config';

export type LlmMessage = {role: 'system' | 'user' | 'assistant'; content: string};
export type LlmProgress = {loaded: number; total: number; text: string};

export interface Llm {
  ready(onProgress?: (p: LlmProgress) => void): Promise<boolean>;
  loadFromFile(file: File, onProgress?: (p: LlmProgress) => void): Promise<boolean>;
  complete(messages: LlmMessage[]): Promise<string>;
  stream(messages: LlmMessage[], onToken: (token: string) => void): Promise<string>;
}

class WllamaLlm implements Llm {
  private wllama: any = null;
  private loaded = false;
  private loading: Promise<boolean> | null = null;

  private async construct() {
    if (this.wllama) return this.wllama;
    const {Wllama} = await import('@wllama/wllama');
    const wasmUrl = (
      await import('@wllama/wllama/esm/wasm/wllama.wasm?url')
    ).default;
    this.wllama = new Wllama({default: wasmUrl});
    return this.wllama;
  }

  async ready(onProgress?: (p: LlmProgress) => void): Promise<boolean> {
    if (this.loaded) return true;
    onProgress?.({loaded: 0, total: 1, text: 'pick a .gguf from phone storage'});
    return false;
  }

  async loadFromFile(file: File, onProgress?: (p: LlmProgress) => void): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        onProgress?.({loaded: 0.02, total: 1, text: `verifying ${file.name}…`});

        // Fail fast if the file isn't a real GGUF. Saves the user a confusing
        // "Invalid magic number" from the C++ side by explaining it here.
        const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const magic = String.fromCharCode(...header);
        if (magic !== 'GGUF') {
          const preview = Array.from(header)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
          throw new Error(
            `Not a GGUF file. Got first 4 bytes: "${magic}" (${preview}). ` +
              `Sidecar needs a llama.cpp .gguf (Q4_K_M / Q3_K_M etc.), not an .mlc or .safetensors file.`,
          );
        }

        // If a previous model was loaded, tear it down. wllama's WASM Module
        // is single-instance; loadModel() throws "already initialized" if we
        // skip this step. exit() releases the model, then we rebuild.
        if (this.wllama) {
          onProgress?.({loaded: 0.05, total: 1, text: 'unloading previous model…'});
          try {
            await this.wllama.exit();
          } catch (e) {
            console.warn('[llm] exit() before reload failed (continuing)', e);
          }
          this.wllama = null;
          this.loaded = false;
        }

        const w = await this.construct();
        // Snapdragon 8 Elite has 8 cores. Multi-thread wllama scales roughly
        // linearly up to ~6-8 threads for small models. We cap at 8 so we
        // don't starve the UI thread.
        const threads = Math.min(navigator.hardwareConcurrency ?? 4, 8);
        onProgress?.({
          loaded: 0.2,
          total: 1,
          text: `mmapping ${prettyBytes(file.size)} into memory · ${threads} threads…`,
        });
        await w.loadModel([file], {
          n_ctx: CONFIG.llm.contextSize,
          n_threads: threads,
        });
        this.loaded = true;
        onProgress?.({loaded: 1, total: 1, text: 'ready'});
        return true;
      } catch (e: any) {
        console.warn('[llm] wllama load failed', e);
        this.loaded = false;
        onProgress?.({loaded: 0, total: 1, text: `failed: ${e?.message ?? String(e)}`});
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    if (!this.loaded) return '[llm not loaded — pick a .gguf first]';
    // createChatCompletion reads the chat template from the model's GGUF
    // metadata, so Llama/Qwen/Gemma/Phi all get their correct template
    // without us hand-formatting anything.
    const res = await this.wllama.createChatCompletion({
      messages,
      max_tokens: CONFIG.llm.maxOutputTokens,
      temperature: CONFIG.llm.temperature,
    });
    return (res?.choices?.[0]?.message?.content ?? '').trim();
  }

  async stream(messages: LlmMessage[], onToken: (token: string) => void): Promise<string> {
    if (!this.loaded) {
      onToken('[llm not loaded — pick a .gguf first]');
      return '[llm not loaded]';
    }
    let full = '';
    await this.wllama.createChatCompletion({
      messages,
      max_tokens: CONFIG.llm.maxOutputTokens,
      temperature: CONFIG.llm.temperature,
      stream: true,
      onData: (chunk: any) => {
        const delta = chunk?.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onToken(delta);
        }
      },
    });
    return full.trim();
  }
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

let singleton: Llm | null = null;
export function getLlm(): Llm {
  singleton ??= new WllamaLlm();
  return singleton;
}
