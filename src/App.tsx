import {useEffect} from 'react';
import {HomeScreen} from './ui/HomeScreen';
import {armGuard} from './bridge/networkGuard';
import {getOcr} from './core/ocr';
import {CONFIG} from './config';
import './App.css';

export default function App() {
  useEffect(() => {
    if (CONFIG.demo.airplaneOnly) armGuard();
    // Pre-warm Tesseract in the background so first Camera / paste doesn't
    // pay the ~3-5s worker cold start. No await — kicks off, boots silently.
    void getOcr().warm();
  }, []);
  return <HomeScreen />;
}
