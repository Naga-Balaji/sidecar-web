import {useEffect, useState} from 'react';
import {getBytes} from '../../bridge/networkGuard';

export function ByteCounterOverlay() {
  const [b, setB] = useState(getBytes());
  useEffect(() => {
    const t = setInterval(() => setB(getBytes()), 250);
    return () => clearInterval(t);
  }, []);
  const zero = b.bytesOut === 0;
  return (
    <div className={`overlay ${zero ? 'ok' : 'bad'}`}>
      <span className="dot" />
      <span className="txt">
        {zero ? 'On-device · 0 bytes out' : `Leaked · ${b.bytesOut}B out`}
      </span>
    </div>
  );
}
