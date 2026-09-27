type FileHandler = (file: File) => void | Promise<void>;

const handlers = new Set<FileHandler>();

export function onFileDropped(fn: FileHandler): () => void {
  handlers.add(fn);
  return () => {
    handlers.delete(fn);
  };
}

export function armDropZone(el: HTMLElement) {
  const prevent = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  el.addEventListener('dragenter', prevent);
  el.addEventListener('dragover', prevent);
  el.addEventListener('drop', async e => {
    prevent(e);
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const f of files) {
      for (const h of handlers) await h(f);
    }
  });
}

export async function handlePickedFiles(files: File[]) {
  for (const f of files) {
    for (const h of handlers) await h(f);
  }
}

export async function pickFiles(
  accept = 'application/pdf,image/*,text/plain',
  opts: {capture?: 'environment' | 'user'; multiple?: boolean} = {},
): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = opts.multiple ?? true;
    if (opts.capture) {
      // `capture` tells mobile browsers to launch the camera/mic directly
      // instead of the file picker. environment = rear camera, user = front.
      input.setAttribute('capture', opts.capture);
      input.multiple = false;
    }
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export async function captureImage(): Promise<File[]> {
  return pickFiles('image/*', {capture: 'environment', multiple: false});
}

/**
 * Pull image blobs out of the OS clipboard. Requires user gesture on some
 * browsers. Returns [] silently if permission is denied or nothing image-y
 * is in the clipboard — caller should surface the empty case in the UI.
 */
export async function pasteImageFromClipboard(): Promise<File[]> {
  try {
    if (!navigator.clipboard || !('read' in navigator.clipboard)) return [];
    const items = await navigator.clipboard.read();
    const out: File[] = [];
    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith('image/')) continue;
        const blob = await item.getType(type);
        const ext = type.split('/')[1] || 'png';
        out.push(new File([blob], `pasted-${Date.now()}.${ext}`, {type}));
      }
    }
    return out;
  } catch (e) {
    console.warn('[clipboard-image] read failed', e);
    return [];
  }
}

/**
 * Hook a global `paste` event on the window that surfaces any pasted image
 * blob to the flow handlers. Returns the unsubscribe function.
 */
export function armGlobalImagePaste(): () => void {
  const onPaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (file) {
        const named = new File(
          [file],
          file.name && file.name !== 'image.png'
            ? file.name
            : `pasted-${Date.now()}.${item.type.split('/')[1] || 'png'}`,
          {type: item.type},
        );
        files.push(named);
      }
    }
    if (files.length) await handlePickedFiles(files);
  };
  window.addEventListener('paste', onPaste);
  return () => window.removeEventListener('paste', onPaste);
}

export async function readTextFile(file: File): Promise<string> {
  return file.text();
}

export function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function isImage(file: File) {
  return file.type.startsWith('image/');
}
