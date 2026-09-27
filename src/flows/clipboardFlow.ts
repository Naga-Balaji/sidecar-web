import {router} from '../core/router';
import {onClipboardChange, writeAnswer} from '../bridge/clipboard';
import {clauseReviewPrompt} from '../prompts/systemPrompts';

export type FlowEvent =
  | {kind: 'input'; text: string}
  | {kind: 'token'; token: string}
  | {kind: 'answer'; text: string; latencyMs: number}
  | {kind: 'error'; error: string};

export function startClipboardFlow(onEvent: (e: FlowEvent) => void): () => void {
  let busy = false;
  return onClipboardChange(async text => {
    if (busy) return;
    if (text.length < 40) return;
    busy = true;
    const t0 = performance.now();
    onEvent({kind: 'input', text});
    try {
      let full = '';
      await router.stream(clauseReviewPrompt(text), token => {
        full += token;
        onEvent({kind: 'token', token});
      });
      await writeAnswer(full.trim());
      onEvent({kind: 'answer', text: full.trim(), latencyMs: Math.round(performance.now() - t0)});
    } catch (e: any) {
      onEvent({kind: 'error', error: e?.message ?? String(e)});
    } finally {
      busy = false;
    }
  });
}
