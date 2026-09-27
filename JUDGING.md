# Sidecar — Judging Rubric Map

**Total: 100 pts** · scored across six dimensions per the iQOO Hackathon 2026 playbook.

---

## End Product · **30 pts**

Working, demoable, non-trivial.

- ✅ **Five live features** — Clipboard reviewer, Document Q&A, Voice, Camera OCR, Chat.
- ✅ **On-device inference** of Llama 3.2 3B (Q4_K_M GGUF) loaded from the phone's own storage.
- ✅ **Cloud fallback** via OpenRouter with in-app BYOK, transparent byte counter, and a legal-mode hard override that forces local.
- ✅ **Airplane mode enforced by code** — `networkGuard.ts` throws on any non-whitelisted URL.
- ✅ End-to-end path: copy on laptop → answer on laptop clipboard, in ~2 seconds.

---

## Novelty · **20 pts**

New shape, not a repackage.

- The phone as a **private inference plane for the laptop** — not the usual "AI chat app on phone" shape.
- **Office Kit clipboard sync as transport**, not a UI feature. The laptop never opens a network connection to do the AI part.
- **Legal-mode hard override**: turning on Legal disables cloud at the router layer, not just the UI. Compliance-by-code.
- **Byte counter as a live trust signal** — a demo primitive, not decoration.

---

## Creative Phone Use · **15 pts**

Every scored input channel on the phone lights up.

- 📎 Clipboard — poller + writer via `navigator.clipboard`
- 📄 File drop / picker — drag-anywhere + tap-to-pick
- 🎤 Microphone — Web Speech Recognition streaming
- 📸 Rear camera — `<input capture="environment">` opens the camera directly for OCR
- 🔊 Speaker — TTS reply on voice queries
- 💾 Phone-local storage — user-picked `.gguf` mmapped into WASM sandbox

Remove any one and a demo beat breaks — none are decorative.

---

## Technical Depth · **15 pts**

Non-trivial engineering under the surface.

- **llama.cpp compiled to WebAssembly** (wllama) — model runs inside the browser sandbox on the phone's CPU cores. Custom chat-template formatting, GGUF magic-byte validation, streaming token callback wiring.
- **Router pattern** — flows never call the LLM directly; a single dispatcher picks Local vs Cloud at call time. Backend swap is one variable.
- **Persona dispatch at call time** — General/Legal switches instantly without reload; prompts are chosen when the request is built.
- **Legal-persona forces local at the transport layer** — cannot be bypassed by the UI. `router.shouldUseCloud()` short-circuits to `false`.
- **Network guard monkey-patches** `fetch` + `XMLHttpRequest`. Any dep phoning home crashes visibly.
- **Sentinel prefix on clipboard writes** (`::sidecar::`) prevents self-triggering loops.
- **PDF text extraction pinned to pdfjs-dist 4.10.38** — v6 requires Node-only `Math.sumPrecise`; we detected and downgraded.
- **Excerpt backfill** in doc Q&A — if no keyword matches, we still send leading chunks so the LLM has context.

---

## Office Kit Use · **10 pts**

Not decorative — load-bearing.

- **Clipboard sync = the hero flow's entire transport.** Copy on Mac → Office Kit relays to phone → app reads, answers, writes back → Office Kit relays reply to Mac. Verified end-to-end.
- **File Manager** = alternate PDF ingest path (user can drop docs from Mac to phone via Office Kit and pick them in-app).
- **Phone Mirroring** = the demo projection surface — judges see the phone screen on the presenter's display, so the "on-device" claim is visible.

---

## Demo · **10 pts**

Three minutes, one unforgettable image.

- **Byte counter pinned to the top** the entire demo, reading `AIRPLANE · 0 bytes` in green.
- **Copy → paste beat** — silent 2 seconds, then the risk summary lands. Physical, tangible, immediate.
- **Legal-mode reveal** — flip the amber pill, Cloud button greys out, chat header switches to `· local · legal (forced local)`. Live proof of code-level compliance.
- **Fallback playbook** — if a flow hiccups, byte counter is still the pitch. Never apologise for a hiccup.

---

## The single line to leave in a judge's head

> **"The AI that reads your client contracts, without your client contracts ever leaving your desk."**
