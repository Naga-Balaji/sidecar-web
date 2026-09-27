import {Icon} from './Icon';

export type Status = 'idle' | 'running' | 'ok' | 'error';
export type FlowColor = 'blue' | 'purple' | 'green' | 'orange';
export type FlowIcon = 'clipboard' | 'doc' | 'mic' | 'camera';

export function FlowTile(props: {
  color: FlowColor;
  icon: FlowIcon;
  title: string;
  subtitle: string;
  status: Status;
  onClick?: () => void;
}) {
  const {color, icon, title, subtitle, status, onClick} = props;
  const showPill = status !== 'idle';
  return (
    <div className={`flow-tile ${color}`} onClick={onClick} role="button" tabIndex={0}>
      {showPill && <span className="flow-tile-pill">{status.toUpperCase()}</span>}
      <div className="flow-tile-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="flow-tile-title">{title}</div>
      <div className="flow-tile-sub">{subtitle}</div>
      <div className="flow-tile-cta">
        <div className="flow-tile-arrow">
          <Icon name="arrow" size={14} />
        </div>
      </div>
    </div>
  );
}
