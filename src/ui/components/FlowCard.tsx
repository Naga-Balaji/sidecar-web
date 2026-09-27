import {Icon} from './Icon';

export type Status = 'idle' | 'running' | 'ok' | 'error';

export function FlowCard(props: {
  icon: 'clipboard' | 'doc' | 'mic' | 'camera';
  title: string;
  subtitle: string;
  status: Status;
  detail?: string;
  latencyMs?: number;
  action?: {label: string; onClick: () => void};
}) {
  const {icon, title, subtitle, status, detail, latencyMs, action} = props;
  const active = status === 'running' || status === 'ok';
  return (
    <div className={`card ${active ? 'active' : ''}`}>
      <div className="card-head">
        <div className="card-icon">
          <Icon name={icon} />
        </div>
        <div className="card-title-wrap">
          <span className="card-title">{title}</span>
          <div className="card-sub">{subtitle}</div>
        </div>
        <span className={`pill pill-${status}`}>{status.toUpperCase()}</span>
      </div>
      {detail ? <div className="card-detail">{detail}</div> : null}
      {latencyMs !== undefined ? (
        <div className="card-latency">{latencyMs} ms on device</div>
      ) : null}
      {action ? (
        <button className="card-action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
