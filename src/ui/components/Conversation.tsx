import {useEffect, useRef, useState} from 'react';
import {router} from '../../core/router';
import type {LlmMessage} from '../../core/llm';
import {getMode, onModeChange} from '../../core/mode';
import type {Mode} from '../../core/mode';
import {getPersona, onPersonaChange} from '../../core/persona';
import type {Persona} from '../../core/persona';
import {cloudKey} from '../../core/cloud';
import {chatSystem} from '../../prompts/systemPrompts';
import {getOcr} from '../../core/ocr';
import {isPdf, isImage, captureImage, pickFiles} from '../../bridge/files';
import {getAsr} from '../../core/asr';
import {extractAlarms, downloadIcs, googleCalendarUrl, schedulePhoneAlarm} from '../../core/alarms';
import type {Alarm} from '../../core/alarms';
import {Icon} from './Icon';

type Attachment = {
  id: string;
  file: File;
  kind: 'image' | 'pdf' | 'text';
  previewUrl?: string;
};

type Msg =
  | {kind: 'user'; text: string; attachments: Attachment[]; timestamp: number}
  | {kind: 'assistant'; text: string; timestamp: number; streaming?: boolean; mode: string}
  | {kind: 'alarms'; alarms: Alarm[]; timestamp: number}
  | {kind: 'system'; text: string; timestamp: number};

export function Conversation({localReady}: {localReady: boolean}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [mode, setMode] = useState<Mode>(getMode());
  const [persona, setPersona] = useState<Persona>(getPersona());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => onModeChange(setMode), []);
  useEffect(() => onPersonaChange(setPersona), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior: 'smooth'});
  }, [messages, busy]);

  const effective: 'local' | 'cloud' = persona === 'legal' ? 'local' : mode;
  const backendReady = effective === 'local' ? localReady : cloudKey.has();
  const canSend = !busy && (input.trim().length > 0 || attachments.length > 0);

  const addAttachments = (files: File[]) => {
    const next = files.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      kind: (isImage(f) ? 'image' : isPdf(f) ? 'pdf' : 'text') as Attachment['kind'],
      previewUrl: isImage(f) ? URL.createObjectURL(f) : undefined,
    }));
    setAttachments(a => [...a, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(a => {
      const dead = a.find(x => x.id === id);
      if (dead?.previewUrl) URL.revokeObjectURL(dead.previewUrl);
      return a.filter(x => x.id !== id);
    });
  };

  const onAttach = async () => {
    const files = await pickFiles();
    if (files.length) addAttachments(files);
  };

  const onCamera = async () => {
    const files = await captureImage();
    if (files.length) addAttachments(files);
  };

  const onMic = async () => {
    if (voiceOn) {
      getAsr().stop();
      setVoiceOn(false);
      return;
    }
    const asr = getAsr();
    if (!asr.supported()) {
      pushSystem('Voice input not supported in this browser.');
      return;
    }
    setVoiceOn(true);
    try {
      await asr.start(
        partial => setInput(partial),
        final => {
          setInput(final);
          setVoiceOn(false);
          inputRef.current?.focus();
        },
      );
    } catch (e: any) {
      setVoiceOn(false);
      pushSystem(`Voice error: ${e?.message ?? e}`);
    }
  };

  const pushSystem = (text: string) => {
    setMessages(m => [...m, {kind: 'system', text, timestamp: Date.now()}]);
  };

  const send = async () => {
    if (!canSend) return;
    if (!backendReady) {
      pushSystem(
        effective === 'local'
          ? 'Load a .gguf model above to send.'
          : 'Add an OpenRouter API key above to use cloud mode.',
      );
      return;
    }

    const outgoing = input.trim();
    const outgoingAttachments = attachments;
    setInput('');
    setAttachments([]);
    setBusy(true);

    const userMsg: Msg = {
      kind: 'user',
      text: outgoing,
      attachments: outgoingAttachments,
      timestamp: Date.now(),
    };
    setMessages(m => [...m, userMsg]);

    // Extract text from each attachment (OCR for images, pdfjs for PDFs).
    // Cap each doc at ~4000 chars — WASM prefill is slow (~20-50 tok/s), so
    // shoving a 30-page PDF (~40k tokens) into the prompt means minutes
    // before the first token. If the user needs more, they can quote a
    // section in the input or ask a follow-up.
    const MAX_ATTACHMENT_CHARS = 4000;
    const contextParts: string[] = [];
    let anyTrimmed = false;
    for (const a of outgoingAttachments) {
      try {
        let text = '';
        if (a.kind === 'image') {
          pushSystem(`OCR: ${a.file.name}…`);
          text = await getOcr().recognize(a.file);
          contextParts.push(`## ${a.file.name} (image, OCR)\n${clip(text, MAX_ATTACHMENT_CHARS)}`);
        } else if (a.kind === 'pdf') {
          pushSystem(`Extracting text: ${a.file.name}…`);
          text = await extractPdf(a.file);
          contextParts.push(`## ${a.file.name} (pdf)\n${clip(text, MAX_ATTACHMENT_CHARS)}`);
        } else {
          text = await a.file.text();
          contextParts.push(`## ${a.file.name} (text)\n${clip(text, MAX_ATTACHMENT_CHARS)}`);
        }
        if (text.length > MAX_ATTACHMENT_CHARS) anyTrimmed = true;
      } catch (e: any) {
        pushSystem(`Failed to read ${a.file.name}: ${e?.message ?? e}`);
      }
    }
    if (anyTrimmed) {
      pushSystem(
        `Sent first ${MAX_ATTACHMENT_CHARS.toLocaleString()} chars of each attachment. Ask a follow-up to dive into other sections.`,
      );
    }

    const composed =
      contextParts.length > 0
        ? `${outgoing || 'Analyse the attached content and answer any question implied by it.'}\n\n---\n${contextParts.join('\n\n---\n')}`
        : outgoing;

    const conversationHistory: LlmMessage[] = [
      {role: 'system', content: chatSystem()},
      ...messages
        .filter(m => m.kind === 'user' || m.kind === 'assistant')
        .map(m => ({
          role: (m.kind === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content:
            m.kind === 'user'
              ? m.text + (m.attachments.length ? ` [${m.attachments.length} attachment(s)]` : '')
              : (m as any).text,
        })),
      {role: 'user', content: composed},
    ];

    // Placeholder assistant message we'll fill via streaming
    const assistantIdx = messages.length + 1;
    setMessages(m => [...m, {kind: 'assistant', text: '', timestamp: Date.now(), streaming: true, mode: effective}]);

    try {
      const full = await router.stream(conversationHistory, token => {
        setMessages(m => {
          const copy = [...m];
          const target = copy[copy.length - 1];
          if (target && target.kind === 'assistant' && target.streaming) {
            copy[copy.length - 1] = {...target, text: target.text + token};
          }
          return copy;
        });
      });
      setMessages(m => {
        const copy = [...m];
        const target = copy[copy.length - 1];
        if (target && target.kind === 'assistant') {
          copy[copy.length - 1] = {...target, text: full, streaming: false};
        }
        return copy;
      });

      // Auto-scan the composed text for dates → inline alarm card if found
      if (contextParts.length > 0 || outgoing.length > 100) {
        try {
          const found = await extractAlarms(composed);
          if (found.length > 0) {
            setMessages(m => [...m, {kind: 'alarms', alarms: found, timestamp: Date.now()}]);
          }
        } catch {
          // silent
        }
      }
    } catch (e: any) {
      setMessages(m => {
        const copy = [...m];
        const target = copy[copy.length - 1];
        if (target && target.kind === 'assistant') {
          copy[copy.length - 1] = {...target, text: `error: ${e?.message ?? e}`, streaming: false};
        }
        return copy;
      });
    } finally {
      setBusy(false);
      // ensure assistant idx is used (avoids unused var warning if TS strict)
      void assistantIdx;
    }
  };

  const clear = () => {
    if (busy) return;
    attachments.forEach(a => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setMessages([]);
    setAttachments([]);
  };

  return (
    <div className="conv">
      <div className="conv-head">
        <span className="conv-title">
          <Icon name="chat" size={16} /> Sidecar
          <span className="conv-mode-hint">
            · {effective}
            {persona === 'legal' ? ' · legal (forced local)' : ''}
          </span>
        </span>
        <button className="chat-clear" onClick={clear} disabled={busy || !messages.length}>
          Clear
        </button>
      </div>

      <div className="conv-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="conv-empty">
            <div className="conv-empty-title">Ask, attach, snap, or speak.</div>
            <div className="conv-empty-body">
              📎 Attach a doc · 📷 Snap a page · 🎤 Speak a question. Everything runs on your device.
            </div>
          </div>
        ) : (
          messages.map((m, i) => renderMessage(m, i))
        )}
        {busy && messages[messages.length - 1]?.kind !== 'assistant' && (
          <div className="conv-msg conv-msg-assistant">
            <div className="conv-bubble">Thinking…</div>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="conv-chips">
          {attachments.map(a => (
            <div className="conv-chip" key={a.id}>
              {a.previewUrl ? (
                <img src={a.previewUrl} alt={a.file.name} />
              ) : (
                <span className="conv-chip-icon">
                  <Icon name={a.kind === 'pdf' ? 'doc' : 'attach'} size={14} />
                </span>
              )}
              <span className="conv-chip-name">{a.file.name}</span>
              <button className="conv-chip-x" onClick={() => removeAttachment(a.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="conv-composer">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            voiceOn
              ? '🎤 Listening…'
              : backendReady
                ? 'Message Sidecar…'
                : 'Load a model or add a cloud key to start'
          }
        />
        <div className="conv-tools">
          <button className="conv-tool" onClick={onAttach} title="Attach a file">
            <Icon name="attach" size={18} />
          </button>
          <button className="conv-tool" onClick={onCamera} title="Snap a page">
            <Icon name="camera" size={18} />
          </button>
          <button
            className={`conv-tool ${voiceOn ? 'on' : ''}`}
            onClick={onMic}
            title="Voice input"
          >
            <Icon name="mic" size={18} />
          </button>
          <button className="conv-send" onClick={send} disabled={!canSend} title="Send">
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function renderMessage(m: Msg, i: number) {
  if (m.kind === 'user') {
    return (
      <div key={i} className="conv-msg conv-msg-user">
        {m.attachments.length > 0 && (
          <div className="conv-msg-attach">
            {m.attachments.map(a => (
              <div className="conv-attach-badge" key={a.id}>
                {a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.file.name} />
                ) : (
                  <span className="conv-attach-icon">
                    <Icon name={a.kind === 'pdf' ? 'doc' : 'attach'} size={12} />
                  </span>
                )}
                <span className="conv-attach-name">{a.file.name}</span>
              </div>
            ))}
          </div>
        )}
        {m.text ? <div className="conv-bubble">{m.text}</div> : null}
      </div>
    );
  }
  if (m.kind === 'assistant') {
    return (
      <div key={i} className="conv-msg conv-msg-assistant">
        <div className="conv-role">assistant · {m.mode}</div>
        <div className="conv-bubble">
          {m.text || (m.streaming ? '▍' : '')}
        </div>
      </div>
    );
  }
  if (m.kind === 'alarms') {
    return <AlarmCard key={i} alarms={m.alarms} />;
  }
  return (
    <div key={i} className="conv-msg conv-msg-system">
      <span>{m.text}</span>
    </div>
  );
}

function AlarmCard({alarms}: {alarms: Alarm[]}) {
  const [pings, setPings] = useState<Record<number, string>>({});
  const setPhone = async (i: number, a: Alarm) => {
    setPings(p => ({...p, [i]: '…scheduling'}));
    const res = await schedulePhoneAlarm(a);
    if (res.ok) {
      const when = new Date(res.firesAt).toLocaleString();
      setPings(p => ({...p, [i]: `🔔 alarm set for ${when}`}));
    } else {
      setPings(p => ({...p, [i]: `⚠ ${res.reason}`}));
    }
  };
  return (
    <div className="conv-msg conv-msg-assistant">
      <div className="conv-role">⏰ upcoming events found</div>
      <div className="conv-alarms">
        <ul className="conv-alarm-rows">
          {alarms.map((a, j) => (
            <li key={j} className="conv-alarm-row">
              <div className="conv-alarm-row-info">
                <div>
                  <strong>{a.date}</strong> {a.time ?? '09:00'}
                </div>
                <div className="conv-alarm-row-event">{a.event}</div>
                {pings[j] ? <div className="conv-alarm-row-ping">{pings[j]}</div> : null}
              </div>
              <div className="conv-alarm-row-actions">
                <a
                  className="conv-alarm-add"
                  href={googleCalendarUrl(a)}
                  target="_blank"
                  rel="noreferrer"
                  title="Add to Google Calendar"
                >
                  + Cal
                </a>
                <button
                  className="conv-alarm-phone"
                  onClick={() => setPhone(j, a)}
                  title="Set a device notification 30 min before"
                >
                  🔔
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="conv-alarm-footer">
          <button onClick={() => downloadIcs(alarms)} className="conv-alarm-btn-alt">
            Download all as .ics
          </button>
          <span className="conv-alarm-hint">
            +Cal = Google Calendar · 🔔 = phone alarm 30 min before (Chrome only)
          </span>
        </div>
      </div>
    </div>
  );
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `\n\n[…trimmed ${s.length - max} more chars…]`;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({data: buf}).promise;
  const parts: string[] = [];
  const pages = Math.min(doc.numPages, 40);
  for (let i = 1; i <= pages; i++) {
    const p = await doc.getPage(i);
    const c = await p.getTextContent();
    parts.push(c.items.map((it: any) => it.str ?? '').join(' '));
  }
  return parts.join('\n\n');
}
