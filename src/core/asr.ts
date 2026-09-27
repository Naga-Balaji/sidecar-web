type SpeechRecognitionCtor = new () => any;

export interface Asr {
  supported(): boolean;
  start(onPartial: (text: string) => void, onFinal: (text: string) => void): Promise<void>;
  stop(): void;
}

class WebSpeechAsr implements Asr {
  private recognition: any = null;
  private finalText = '';

  supported(): boolean {
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  }

  async start(onPartial: (text: string) => void, onFinal: (text: string) => void): Promise<void> {
    if (!this.supported()) throw new Error('SpeechRecognition not supported in this browser');
    const Ctor: SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN';
    this.finalText = '';
    this.recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) this.finalText += t;
        else interim += t;
      }
      onPartial((this.finalText + interim).trim());
    };
    this.recognition.onend = () => onFinal(this.finalText.trim());
    this.recognition.start();
  }

  stop() {
    this.recognition?.stop();
  }
}

let singleton: Asr | null = null;
export function getAsr(): Asr {
  singleton ??= new WebSpeechAsr();
  return singleton;
}
