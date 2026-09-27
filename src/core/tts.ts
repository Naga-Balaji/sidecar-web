export interface Tts {
  speak(text: string): void;
  stop(): void;
}

class SynthTts implements Tts {
  speak(text: string) {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.lang = 'en-IN';
    speechSynthesis.speak(u);
  }
  stop() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
}

let singleton: Tts | null = null;
export function getTts(): Tts {
  singleton ??= new SynthTts();
  return singleton;
}
