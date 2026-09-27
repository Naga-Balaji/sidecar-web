import {useEffect, useState} from 'react';
import {ByteCounterOverlay} from './components/ByteCounterOverlay';
import {Conversation} from './components/Conversation';
import {Icon} from './components/Icon';
import {ModeToggle} from './components/ModeToggle';
import {startClipboardFlow} from '../flows/clipboardFlow';
import type {FlowEvent} from '../flows/clipboardFlow';
import {pickFiles, armGlobalImagePaste} from '../bridge/files';
import {getLlm} from '../core/llm';
import type {LlmProgress} from '../core/llm';
import {getMode, onModeChange} from '../core/mode';
import type {Mode} from '../core/mode';
import {getPersona, onPersonaChange} from '../core/persona';
import type {Persona} from '../core/persona';

type ClipState = {status: 'idle' | 'running' | 'ok' | 'error'; text?: string; latencyMs?: number};

export function HomeScreen() {
  const [clip, setClip] = useState<ClipState>({status: 'idle'});
  const [modelProg, setModelProg] = useState<LlmProgress | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [mode, setMode] = useState<Mode>(getMode());
  const [persona, setPersona] = useState<Persona>(getPersona());

  useEffect(() => onModeChange(setMode), []);
  useEffect(() => onPersonaChange(setPersona), []);
  useEffect(() => {
    (async () => {
      const ok = await getLlm().ready(p => setModelProg(p));
      setModelReady(ok);
    })();
    const stopClip = startClipboardFlow((e: FlowEvent) => {
      if (e.kind === 'input') setClip({status: 'running'});
      if (e.kind === 'answer') setClip({status: 'ok', text: e.text, latencyMs: e.latencyMs});
      if (e.kind === 'error') setClip({status: 'error', text: e.error});
    });
    const stopPaste = armGlobalImagePaste();
    return () => {
      stopClip();
      stopPaste();
    };
  }, []);

  const onPickModel = async () => {
    const files = await pickFiles('.gguf');
    if (!files.length) return;
    const ok = await getLlm().loadFromFile(files[0], p => setModelProg(p));
    setModelReady(ok);
  };

  const progPct = modelProg?.loaded ? modelProg.loaded * 100 : 0;
  const modelBadge = modelReady ? 'Ready' : progPct > 0 && progPct < 100 ? 'Loading' : 'None';
  const modelBadgeClass = modelReady ? 'ready' : progPct > 0 ? 'load' : 'empty';

  // touch the vars so lint doesn't complain when we don't render them
  void mode;
  void persona;

  return (
    <div className="app">
      <ByteCounterOverlay />

      <div className="wrap">
        <>
          <div className="brand-row">
              <div className="brand-glyph">
                <Icon name="spark" size={26} />
              </div>
              <div className="brand-title-wrap">
                <h1 className="brand">
                  Side<span className="brand-accent">car</span>
                </h1>
                <p className="brand-sub">Your Private AI Co-Processor</p>
              </div>
              <div className="brand-gear" onClick={onPickModel} title="Load model">
                <Icon name="gear" size={18} />
              </div>
            </div>

            <div className="model-card" onClick={onPickModel} role="button">
              <div className="model-icon">
                <Icon name="chip" size={22} />
              </div>
              <div className="model-info">
                <div className="model-label">Local AI Model</div>
                <div className="model-name-row">
                  <span className="model-name">
                    {modelReady ? 'Llama / Qwen (GGUF)' : 'No model loaded'}
                  </span>
                  <span className={`model-badge ${modelBadgeClass}`}>{modelBadge}</span>
                </div>
                <div className="model-detail">
                  {modelReady
                    ? 'Model loaded · On-device inference · No internet'
                    : modelProg?.text
                      ? modelProg.text
                      : 'Tap to pick a .gguf from phone storage'}
                </div>
                {progPct > 0 && progPct < 100 && (
                  <div className="model-progress-bar">
                    <div className="model-progress-fill" style={{width: `${progPct}%`}} />
                  </div>
                )}
              </div>
              {!modelReady && progPct === 0 && (
                <button className="model-load-btn" onClick={onPickModel}>
                  Load
                </button>
              )}
            </div>

            <ModeToggle localReady={modelReady} />

            {clip.status !== 'idle' && (
              <div className="clipboard-strip">
                <div className="clipboard-head">
                  <Icon name="clipboard" size={14} />
                  <span>
                    Clipboard auto-reviewer
                    {clip.status === 'running' ? ' · analysing…' : ''}
                    {clip.status === 'ok' && clip.latencyMs ? ` · ${clip.latencyMs} ms` : ''}
                  </span>
                </div>
                {clip.text && <div className="clipboard-body">{clip.text}</div>}
              </div>
            )}

          <Conversation localReady={modelReady} />
        </>

        <p className="foot">Zero cloud calls in Local mode · airplane-mode ready</p>
      </div>
    </div>
  );
}
