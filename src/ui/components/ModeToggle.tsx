import {useEffect, useState} from 'react';
import {getMode, onModeChange, setMode} from '../../core/mode';
import type {Mode} from '../../core/mode';
import {getPersona, onPersonaChange, setPersona} from '../../core/persona';
import type {Persona} from '../../core/persona';
import {cloudKey, OR_MODEL} from '../../core/cloud';
import {Icon} from './Icon';

export function ModeToggle({localReady}: {localReady: boolean}) {
  const [mode, setLocalMode] = useState<Mode>(getMode());
  const [persona, setLocalPersona] = useState<Persona>(getPersona());
  const [hasKey, setHasKey] = useState(cloudKey.has());
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => onModeChange(setLocalMode), []);
  useEffect(() => onPersonaChange(setLocalPersona), []);

  const pickMode = (m: Mode) => {
    if (m === 'cloud' && !cloudKey.has()) {
      setShowKey(true);
      setMode(m);
      return;
    }
    setMode(m);
  };

  const togglePersona = () => {
    setPersona(persona === 'legal' ? 'general' : 'legal');
  };

  const saveKey = () => {
    cloudKey.set(keyInput);
    setHasKey(cloudKey.has());
    setKeyInput('');
    setShowKey(false);
  };
  const clearKey = () => {
    cloudKey.set('');
    setHasKey(false);
  };

  const status =
    mode === 'local'
      ? localReady
        ? 'ready · on device'
        : 'load a .gguf'
      : hasKey
        ? OR_MODEL
        : 'paste an API key';

  return (
    <div className={`mode-bar ${persona === 'legal' ? 'legal-armed' : ''}`}>
      <div className="mode-bar-head">
        <div className="mode-bar-label">
          <Icon name={mode === 'local' ? 'shield' : 'spark'} size={14} />
          <span>Inference · {status}</span>
        </div>
        <div className="mode-controls">
          <button
            className={`legal-pill ${persona === 'legal' ? 'on' : ''}`}
            onClick={togglePersona}
            title="Switch to specialised legal / clause-review prompts"
          >
            ⚖ Legal
          </button>
          <div className="mode-toggle-lg" role="radiogroup" aria-label="Inference mode">
            <button
              className={mode === 'local' ? 'on' : ''}
              onClick={() => pickMode('local')}
              title="On-device via wllama · zero cloud calls"
            >
              Local
            </button>
            <button
              className={mode === 'cloud' ? 'on' : ''}
              onClick={() => pickMode('cloud')}
              disabled={persona === 'legal'}
              title={
                persona === 'legal'
                  ? 'Legal mode forces local inference. Turn Legal off to enable Cloud.'
                  : 'Route to OpenRouter · breaks airplane-mode'
              }
            >
              Cloud
            </button>
          </div>
        </div>
      </div>

      {persona === 'legal' ? (
        <div className="mode-bar-legal-note">
          <Icon name="shield" size={12} />
          Legal mode · <strong>always runs on-device</strong>. Cloud is disabled while active. Answers are risk-first and source-grounded.
        </div>
      ) : null}

      {mode === 'cloud' && (!hasKey || showKey) ? (
        <div className="mode-bar-keyrow">
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="sk-or-v1-… (OpenRouter key)"
            onKeyDown={e => e.key === 'Enter' && saveKey()}
          />
          <button onClick={saveKey} disabled={!keyInput.trim()}>Save</button>
        </div>
      ) : null}

      {mode === 'cloud' && hasKey && !showKey ? (
        <div className="mode-bar-keyrow-saved">
          <span>Key saved · all flows route through cloud</span>
          <button onClick={() => setShowKey(true)}>Change</button>
          <button onClick={clearKey}>Clear</button>
        </div>
      ) : null}
    </div>
  );
}
