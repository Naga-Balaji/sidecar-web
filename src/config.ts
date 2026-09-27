export const CONFIG = {
  llm: {
    modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    contextSize: 4096,
    maxOutputTokens: 512,
    temperature: 0.2,
  },
  ocr: {
    lang: 'eng',
  },
  bridge: {
    clipboardPollMs: 400,
    sentinelPrefix: '::sidecar::',
  },
  demo: {
    airplaneOnly: true,
    showByteCounter: true,
  },
} as const;

export type Config = typeof CONFIG;
