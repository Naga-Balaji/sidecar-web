import {getPersona} from '../core/persona';
import * as legal from './legalPrompts';
import * as general from './generalPrompts';

// Dispatch layer: every flow imports from here. At call time we read the
// current persona and pick the matching prompt set. Callers don't know or care.

export function clauseReviewPrompt(text: string) {
  return getPersona() === 'legal' ? legal.clausePrompt(text) : general.clausePrompt(text);
}

export function docQaPrompt(
  question: string,
  excerpts: {source: string; text: string}[],
) {
  return getPersona() === 'legal'
    ? legal.docQaPrompt(question, excerpts)
    : general.docQaPrompt(question, excerpts);
}

export function voicePrompt(question: string) {
  return getPersona() === 'legal' ? legal.voicePrompt(question) : general.voicePrompt(question);
}

export function chatSystem() {
  return getPersona() === 'legal' ? legal.SYSTEM_CHAT : general.SYSTEM_CHAT;
}
