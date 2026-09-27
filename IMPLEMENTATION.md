# Sidecar — Implementation Summary

**iQOO Hackathon 2026 · Team Edge Runner · Bengaluru Battle**

A private on-device AI co-processor that turns your iQOO 15 into a laptop-side inference plane over vivo Office Kit's clipboard bridge. Airplane-mode ready, cloud-optional, legal-mode as a specialised skill.

---

## What Sidecar does, in one line

**Copy a clause on your work laptop → risk summary is on your clipboard in ~2 seconds, model ran on your phone, zero bytes left the desk.**

---

## The four input flows + chat

| # | Flow | How it works | Runs on |
|---|---|---|---|
| 1 | **Clipboard Clause Reviewer** | Poll `navigator.clipboard` → detect new text → run through selected persona prompt → write answer back to clipboard | wllama (local) or OpenRouter (cloud) |
| 2 | **Document Q&A** | Drop or pick a PDF/image → pdfjs text extraction (or Tesseract OCR fallback) → keyword-ranked excerpts → answer grounded in doc | Local or Cloud |
| 3 | **Voice Input** | Web Speech Recognition → transcribed question → LLM → answer via `speechSynthesis` + clipboard | Local or Cloud |
| 4 | **Camera OCR** | `<input capture="environment">` opens rear camera → snap → Tesseract.js → LLM analyses text | Local or Cloud |
| 5 | **Chat** | Multi-turn streaming, full history retained, token-by-token render, persona-aware system prompt | Local or Cloud |

---

## Three orthogonal toggles

```
   ┌─────────────────────────────────────────────────────┐
   │  Inference · ready · on device                      │
   │                                                     │
   │            [ ⚖ Legal ]   [ Local  |  Cloud ]        │
   └─────────────────────────────────────────────────────┘
```

### 1. Local ↔ Cloud (backend switch)

- **Local** → wllama (llama.cpp compiled to WebAssembly), reads a `.gguf` file the user picks from phone storage.
- **Cloud** → OpenRouter, currently routed to `deepseek/deepseek-chat-v3.1` (BYOK, key pasted into UI, stored in localStorage per-origin).
- Toggle affects **every flow and chat** via a single `router` module — flows never call the LLM directly.

### 2. General ↔ Legal (persona switch, ⚖ Legal pill)

- **General** — plain helpful assistant. Handles any topic (coding, questions, casual chat).
- **Legal** — specialised prompts: clause reviewer, risk-first phrasing, cite-only-from-source doc Q&A. UI turns amber-tinted when armed.
- Prompts live in `src/prompts/generalPrompts.ts` and `src/prompts/legalPrompts.ts`; `systemPrompts.ts` dispatches on `getPersona()` at call time.

### 3. Airplane-mode enforcement

- `networkGuard.ts` monkey-patches `fetch()` and `XMLHttpRequest` to **throw** on any non-whitelisted URL.
- Only `localhost`, model-loading CDNs, and (when Cloud is on) OpenRouter are allowed through.
- A live "AIRPLANE · 0 bytes" pill at the top turns red the moment a real byte moves. It's proof, not a claim.

---

## Architecture

```
                    ┌───────────── Persona ──────────────┐
                    │  general  |  legal                 │
                    │  (prompts dispatch layer)          │
                    └──────────────┬─────────────────────┘
                                   │
   ┌── ModeToggle (top of page) ──┤
   │  Local | Cloud + Legal pill  │
   └──────────────┬───────────────┘
                  ▼
   ┌───────── router.ts ──────────┐
   │  reads getMode() + persona   │
   └──────┬─────────────────┬─────┘
          │                 │
          ▼                 ▼
   wllama (WASM)     OpenRouter API
   local .gguf        (BYOK)
          │                 │
          └────────┬────────┘
                   ▼
   All 5 features (clipboard, PDF, voice, camera, chat)
                   │
                   ▼
             User's clipboard
             (Office Kit sync → laptop)
```

---

## What lives where in the code

```
sidecar-web/
├── src/
│   ├── config.ts                       knobs (model file, context size, polling)
│   ├── core/
│   │   ├── llm.ts                      wllama adapter (GGUF magic check, chat template, streaming)
│   │   ├── cloud.ts                    OpenRouter adapter (SSE stream parser, key storage)
│   │   ├── router.ts                   single entry point every flow uses
│   │   ├── mode.ts                     local|cloud state + subscribe API
│   │   ├── persona.ts                  general|legal state + subscribe API
│   │   ├── ocr.ts                      Tesseract.js wrapper
│   │   ├── asr.ts                      Web Speech Recognition wrapper
│   │   ├── tts.ts                      speechSynthesis wrapper
│   │   └── embeddings.ts               (placeholder — PDF uses keyword ranking for now)
│   ├── bridge/
│   │   ├── clipboard.ts                poller + writer, sentinel-prefix to prevent self-loops
│   │   ├── files.ts                    drop-zone + pickFiles + captureImage (rear camera)
│   │   └── networkGuard.ts             hard fetch/XHR block for non-whitelisted URLs
│   ├── flows/
│   │   ├── clipboardFlow.ts            clipboard → router → answer
│   │   ├── pdfFlow.ts                  file drop → text extract → ranked ask
│   │   └── voiceCameraFlow.ts          voice + camera OCR flows
│   ├── prompts/
│   │   ├── legalPrompts.ts             clause reviewer, doc QA, legal chat system
│   │   ├── generalPrompts.ts           plain helpful assistant variants
│   │   └── systemPrompts.ts            dispatch layer — reads getPersona()
│   └── ui/
│       ├── HomeScreen.tsx              top-level layout, tab bar, brand row, model card
│       └── components/
│           ├── ModeToggle.tsx          top mode-bar with Local/Cloud + Legal pill + key input
│           ├── FlowTile.tsx            2x2 gradient tiles (blue, purple, green, orange)
│           ├── Chat.tsx                streaming chat, persona-aware, uses router
│           ├── ByteCounterOverlay.tsx  airplane pill (green/red)
│           ├── TabBar.tsx              bottom nav (Home, Chat, Docs, History)
│           └── Icon.tsx                inline SVG icon set
```

---

## Tech stack shipped

| Layer | What we chose | Notes |
|---|---|---|
| Framework | React 18 + Vite 8 + TypeScript | HMR, fast reloads on both Mac and phone |
| LLM runtime | **wllama** (llama.cpp → WASM) | Loads user's `.gguf` from phone storage; no cache, no network |
| Model | Llama 3.2 3B Instruct · Q4_K_M | Any llama.cpp-compatible GGUF works — user-swappable |
| OCR | Tesseract.js | Runs in-browser, ~10 MB traineddata cached after first use |
| PDF text | pdfjs-dist 4.10.38 | Locked to browser-compatible version (v6 uses Node-only `Math.sumPrecise`) |
| ASR | Web Speech Recognition | Browser-native, no download |
| TTS | `speechSynthesis` | Browser-native, immediate |
| Cloud fallback | OpenRouter · deepseek/deepseek-chat-v3.1 | BYOK; key in localStorage |
| Transport | vivo Office Kit clipboard sync | Verified working end-to-end |
| Dev server | Vite HTTPS via `@vitejs/plugin-basic-ssl` | Required for Clipboard API + camera + WebGPU on LAN |

---

## Non-obvious engineering wins

1. **GGUF magic-byte check** in `llm.ts` — surfaces "you picked the wrong file" *before* wllama crashes with a cryptic "invalid magic number" from C++.
2. **Prompt dispatch at call time** — persona switch is instant and applies to the *next* request; no reload or re-init.
3. **Router pattern** — flows import `router.stream()` not `getLlm().stream()`. Backend swap is one variable change.
4. **Sentinel prefix on clipboard writes** — `::sidecar::` marker prevents the poller from feeding our own outputs back through the reviewer (would otherwise loop forever).
5. **Excerpt backfill in PDF Q&A** — if no keyword matches, we don't send empty context; we backfill with leading chunks so the LLM always gets *something* to answer from.
6. **`capture="environment"`** on Camera OCR — one attribute switches the file picker to the rear camera on mobile without any Camera API code.
7. **Network guard is a hard throw, not a warning** — dependencies that try to phone home crash visibly instead of silently ruining the "zero cloud" claim.

---

## What we consciously did NOT ship

- On-device vector embeddings for PDF Q&A (keyword ranking is fine for demo docs; adding MiniLM WASM is a Sunday-morning stretch).
- Office Kit file-drop integration (user picks files via the browser picker instead; same UX).
- Persistent document library / chat history (`Documents` and `History` tabs are placeholders).
- APK / native Android build (we pivoted to web at hour 4 when gradle + venue Wi-Fi wouldn't cooperate).

---

## Original plan vs shipped

| Requirement | Original plan | What we're actually using | Match |
|---|---|---|---|
| Mobile app | React Native | React (Vite web app) served from Mac to phone Chrome | ❌ Pivoted |
| LLM | Llama 3.2 3B | Llama 3.2 3B Q4_K_M (GGUF, loaded from phone storage) | ✅ |
| AI runtime | ExecuTorch | wllama (llama.cpp WASM) | ❌ Swapped |
| Alt LLM | llama.rn | dropped with RN pivot | ❌ Dropped |
| Speech → Text | Whisper | Web Speech Recognition API | ❌ Swapped |
| OCR | ML Kit | Tesseract.js WASM | ❌ Swapped |
| Embeddings | On-device | Keyword ranking (temporary) | ⚠️ Missing |
| NPU | Snapdragon Hexagon | CPU via WASM | ❌ Dropped |
| Laptop ↔ Phone | Office Kit | Office Kit clipboard sync — working | ✅ Partial |

---

## The pitch line

> **"The AI that reads your client contracts, without your client contracts ever leaving your desk."**
>
> Local mode = airplane mode + your GGUF + zero bytes.
> Legal mode = specialist prompts on top of any backend.
> Cloud toggle = escape hatch when you need bigger, transparent about it.
