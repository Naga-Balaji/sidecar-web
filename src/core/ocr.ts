import {CONFIG} from '../config';

const MAX_DIMENSION = 1600; // pixels — bigger → slower OCR, no accuracy gain

export interface Ocr {
  warm(): Promise<void>;
  recognize(source: File | Blob): Promise<string>;
  terminate(): Promise<void>;
}

class TesseractOcr implements Ocr {
  private worker: any = null;
  private warming: Promise<any> | null = null;

  private async ensure() {
    if (this.worker) return this.worker;
    if (this.warming) return this.warming;
    this.warming = (async () => {
      const {createWorker, PSM, OEM}: any = await import('tesseract.js');
      const worker = await createWorker(CONFIG.ocr.lang, OEM?.LSTM_ONLY ?? 1);
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM?.AUTO ?? 3,
          preserve_interword_spaces: '1',
        });
      } catch {
        // param bag may not exist on some builds; safe to ignore
      }
      this.worker = worker;
      return worker;
    })();
    try {
      return await this.warming;
    } finally {
      this.warming = null;
    }
  }

  /** Kick off the worker init in the background so first snap doesn't pay it. */
  async warm() {
    void this.ensure();
  }

  async recognize(source: File | Blob): Promise<string> {
    const worker = await this.ensure();
    // Downscale first — huge wall-clock win for 8-24 MP phone photos.
    const scaled = await downscale(source);
    const {data} = await worker.recognize(scaled);
    return data?.text ?? '';
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * Load the image, draw it onto a canvas that caps the largest side at
 * MAX_DIMENSION, and return the resulting Blob. If we can't load the image
 * (SVG, unknown format), we return the original untouched — Tesseract will
 * either handle it or throw and the caller surfaces the error.
 */
async function downscale(source: File | Blob): Promise<Blob> {
  try {
    const url = URL.createObjectURL(source);
    try {
      const img = await loadImage(url);
      const {width, height} = img;
      const max = Math.max(width, height);
      if (max <= MAX_DIMENSION) return source;
      const scale = MAX_DIMENSION / max;
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return source;
      ctx.drawImage(img, 0, 0, w, h);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
          'image/jpeg',
          0.9,
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return source;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image ${src}`));
    img.src = src;
  });
}

let singleton: Ocr | null = null;
export function getOcr(): Ocr {
  singleton ??= new TesseractOcr();
  return singleton;
}
