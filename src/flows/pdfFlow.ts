import {router} from '../core/router';
import {getOcr} from '../core/ocr';
import {onFileDropped, isPdf, isImage, readTextFile} from '../bridge/files';
import {writeAnswer} from '../bridge/clipboard';
import {docQaPrompt} from '../prompts/systemPrompts';

export type PdfEvent =
  | {kind: 'file'; name: string; chars: number; text: string}
  | {kind: 'answer'; question: string; text: string; latencyMs: number}
  | {kind: 'error'; error: string};

type Doc = {name: string; text: string};
const store: Doc[] = [];
const PDF_PAGE_CAP = 40;

export function currentDocCount() {
  return store.length;
}

export function currentDocText(): string {
  return store.map(d => `# ${d.name}\n${d.text}`).join('\n\n');
}

export function startPdfFlow(onEvent: (e: PdfEvent) => void): () => void {
  return onFileDropped(async file => {
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error(`no text extracted from ${file.name}`);
      store.push({name: file.name, text});
      onEvent({kind: 'file', name: file.name, chars: text.length, text});
    } catch (e: any) {
      onEvent({kind: 'error', error: e?.message ?? String(e)});
    }
  });
}

async function extractText(file: File): Promise<string> {
  if (isImage(file)) return getOcr().recognize(file);
  if (isPdf(file)) return extractPdfText(file);
  return readTextFile(file);
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs: any = await import('pdfjs-dist');
    const workerUrl = (
      await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({data: buf}).promise;
    const parts: string[] = [];
    const pages = Math.min(doc.numPages, PDF_PAGE_CAP);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it: any) => it.str ?? '').join(' '));
    }
    if (doc.numPages > PDF_PAGE_CAP) {
      parts.push(`\n[Sidecar: showed first ${PDF_PAGE_CAP} of ${doc.numPages} pages. Increase PDF_PAGE_CAP to index more.]`);
    }
    return parts.join('\n\n');
  } catch (e) {
    console.warn('[pdf] pdfjs failed, falling back to OCR of first page', e);
    return getOcr().recognize(file);
  }
}

export async function askDoc(question: string): Promise<{text: string; latencyMs: number}> {
  const t0 = performance.now();
  if (!store.length) {
    return {text: 'No documents indexed yet. Drop a PDF or image first.', latencyMs: 0};
  }
  const excerpts = pickExcerpts(question, 4);
  const answer = await router.complete(docQaPrompt(question, excerpts));
  const trimmed = (answer ?? '').trim();
  const outText = trimmed || 'No response from model.';
  await writeAnswer(outText);
  return {text: outText, latencyMs: Math.round(performance.now() - t0)};
}

export function clearDocs() {
  store.length = 0;
}

/** Score-and-fallback: prefer keyword-matched chunks, but always return
 *  something (leading chunks of the doc) so the LLM gets context. */
function pickExcerpts(question: string, k: number): {source: string; text: string}[] {
  const chunks = store.flatMap(d =>
    chunk(d.text, 800).map(t => ({source: d.name, text: t})),
  );
  if (!chunks.length) return [];
  const scored = chunks
    .map(c => ({c, score: scoreMatch(question, c.text)}))
    .sort((a, b) => b.score - a.score);
  const withMatches = scored.filter(s => s.score > 0).slice(0, k).map(s => s.c);
  if (withMatches.length >= k) return withMatches;
  // Backfill with the first chunks of each doc so LLM always has context
  const seen = new Set(withMatches.map(c => c.text));
  for (const {c} of scored) {
    if (withMatches.length >= k) break;
    if (!seen.has(c.text)) {
      withMatches.push(c);
      seen.add(c.text);
    }
  }
  return withMatches;
}

function chunk(text: string, size: number): string[] {
  const parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + '\n\n' + p).length > size && cur) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) out.push(cur);
  // Fallback: if no paragraph breaks, chunk by length
  if (out.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += size) {
      out.push(text.slice(i, i + size));
    }
  }
  return out;
}

function scoreMatch(q: string, text: string): number {
  const qTerms = q.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const t = text.toLowerCase();
  return qTerms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
}
