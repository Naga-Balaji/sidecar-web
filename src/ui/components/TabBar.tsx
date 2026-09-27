import {Icon} from './Icon';

export type Tab = 'home' | 'chat' | 'documents' | 'history';

export function TabBar({active, onChange}: {active: Tab; onChange: (t: Tab) => void}) {
  return (
    <div className="tabbar">
      <button
        className={`tabbar-btn ${active === 'home' ? 'on' : ''}`}
        onClick={() => onChange('home')}
      >
        <Icon name="home" size={18} />
        Home
      </button>
    </div>
  );
}
