import {useEffect, useRef, useState} from 'react';
import type {LlmMessage} from '../../core/llm';
import {router} from '../../core/router';
import {getMode, onModeChange} from '../../core/mode';
import type {Mode} from '../../core/mode';
import {cloudKey} from '../../core/cloud';
import {chatSystem} from '../../prompts/systemPrompts';
import {getPersona, onPersonaChange} from '../../core/persona';
import type {Persona} from '../../core/persona';
import {Icon} from './Icon';

export function Chat({localReady}: {localReady: boolean}) {
  const [messages, setMessages] = useState<LlmMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<Mode>(getMode());
  const [persona, setPersona] = useState<Persona>(getPersona());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => onModeChange(setMode), []);
  useEffect(() => onPersonaChange(setPersona), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior: 'smooth'});
  }, [messages, streaming]);

  // Legal persona forces local, even if the user picked Cloud.
  const effective: 'local' | 'cloud' =
    persona === 'legal' ? 'local' : mode;
  const disabled = effective === 'local' ? !localReady : !cloudKey.has();

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || disabled) return;
    setInput('');
    const nextHistory: LlmMessage[] = [
      ...messages,
      {role: 'user', content: text},
      {role: 'assistant', content: ''},
    ];
    setMessages(nextHistory);
    setStreaming(true);
    const modeAtSend = getMode();

    const appendToken = (token: string) => {
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {...last, content: last.content + token};
        return copy;
      });
    };
    const setFinal = (full: string) => {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {role: 'assistant', content: full};
        return copy;
      });
    };

    try {
      const system: LlmMessage = {role: 'system', content: chatSystem()};
      const full = await router.stream([system, ...nextHistory.slice(0, -1)], appendToken);
      setFinal(full);
    } catch (e: any) {
      setFinal(`error (${modeAtSend}): ${e?.message ?? e}`);
    } finally {
      setStreaming(false);
    }
  };

  const clear = () => {
    if (streaming) return;
    setMessages([]);
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-title">
          <Icon name="chat" size={16} /> Chat
          <span className="chat-mode-hint">
            · {effective}
            {persona === 'legal' ? ' · legal (forced local)' : ''}
          </span>
        </span>
        <button
          className="chat-clear"
          onClick={clear}
          disabled={streaming || !messages.length}
        >
          Clear
        </button>
      </div>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            {mode === 'local'
              ? localReady
                ? 'Ask anything — runs entirely on your device.'
                : 'Pick a .gguf above to enable local chat.'
              : cloudKey.has()
                ? 'Chatting via cloud — the toggle above routes every flow.'
                : 'Add your OpenRouter key in the toggle above.'}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              <div className="chat-role">{m.role}</div>
              <div className="chat-content">
                {m.content || (streaming && i === messages.length - 1 ? '▍' : '')}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={
            disabled
              ? mode === 'local'
                ? 'load a .gguf to chat locally'
                : 'add an API key to chat via cloud'
              : 'Type a message…'
          }
          disabled={disabled || streaming}
        />
        <button onClick={send} disabled={disabled || streaming || !input.trim()}>
          {streaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
