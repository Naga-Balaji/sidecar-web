import type {LlmMessage} from './llm';
import {getLlm} from './llm';
import {cloudLlm, cloudKey} from './cloud';
import {getMode} from './mode';
import {getPersona} from './persona';

/**
 * Single entry point every flow uses for inference. Reads the current mode +
 * persona at call time.
 *
 * HARD RULE: Legal persona ALWAYS runs on the local model, regardless of the
 * Local/Cloud toggle. Legal content must never leave the device. If the user
 * picks Legal + Cloud, we override to local and the UI reflects it.
 */
export const router = {
  async complete(messages: LlmMessage[]): Promise<string> {
    if (shouldUseCloud()) return cloudLlm.complete(messages);
    return getLlm().complete(messages);
  },

  async stream(messages: LlmMessage[], onToken: (t: string) => void): Promise<string> {
    if (shouldUseCloud()) return cloudLlm.stream(messages, onToken);
    return getLlm().stream(messages, onToken);
  },

  /** Effective backend right now, after applying Legal-override. */
  effectiveBackend(): 'local' | 'cloud' {
    return shouldUseCloud() ? 'cloud' : 'local';
  },

  /** True if Legal is forcing us onto local even though the user picked cloud. */
  legalOverride(): boolean {
    return getPersona() === 'legal' && getMode() === 'cloud';
  },
};

function shouldUseCloud(): boolean {
  if (getPersona() === 'legal') return false; // hard override
  return getMode() === 'cloud' && cloudKey.has();
}
