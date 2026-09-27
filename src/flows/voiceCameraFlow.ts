import {getAsr} from '../core/asr';
import {getOcr} from '../core/ocr';
import {getTts} from '../core/tts';
import {router} from '../core/router';
import {voicePrompt, clauseReviewPrompt} from '../prompts/systemPrompts';
import {writeAnswer} from '../bridge/clipboard';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

let state: VoiceState = 'idle';
let partial = '';
const listeners = new Set<(s: VoiceState) => void>();
const partialListeners = new Set<(t: string) => void>();

function setState(s: VoiceState) {
  state = s;
  for (const l of listeners) l(s);
}

export function onVoiceState(fn: (s: VoiceState) => void) {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export function onVoicePartial(fn: (t: string) => void) {
  partialListeners.add(fn);
  fn(partial);
  return () => {
    partialListeners.delete(fn);
  };
}

export async function startVoice() {
  if (state !== 'idle') return;
  const asr = getAsr();
  if (!asr.supported()) throw new Error('Voice not supported in this browser');
  partial = '';
  setState('listening');
  await asr.start(
    t => {
      partial = t;
      for (const l of partialListeners) l(t);
    },
    async final => {
      if (!final.trim()) {
        setState('idle');
        return;
      }
      setState('thinking');
      const answer = await router.complete(voicePrompt(final));
      const trimmed = answer.trim();
      await writeAnswer(trimmed);
      setState('speaking');
      getTts().speak(trimmed);
      setState('idle');
    },
  );
}

export function stopVoice() {
  getAsr().stop();
}

export async function analyseCameraShot(file: File): Promise<string> {
  setState('thinking');
  try {
    const text = await getOcr().recognize(file);
    if (!text.trim()) return 'No text detected.';
    const answer = await router.complete(clauseReviewPrompt(text));
    const trimmed = answer.trim();
    await writeAnswer(trimmed);
    return trimmed;
  } finally {
    setState('idle');
  }
}
