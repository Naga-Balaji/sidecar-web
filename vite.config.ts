import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {defineConfig} from 'vite';

// Sidecar dev server. Two things going on beyond the default:
//   1. host 0.0.0.0 + HTTPS via self-signed cert so the iQOO phone can reach
//      us over LAN with a secure context (clipboard + camera need it).
//   2. COOP/COEP headers so WebAssembly SharedArrayBuffer works — that's what
//      unlocks wllama's multi-thread mode. Without these, wllama silently
//      falls back to single-thread and inference is 3-4x slower.
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    headers: crossOriginHeaders,
  },
  preview: {
    headers: crossOriginHeaders,
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
});
