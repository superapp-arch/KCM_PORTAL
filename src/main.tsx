import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Disable the browser's native "scroll wheel / two-finger trackpad scroll
// changes the value" behavior on every <input type="number"> app-wide
// (2026-09-08 direct request) - the visible up/down spinner was already
// removed globally via index.css, but scrolling over a focused number input
// still silently changed rate/amount/quantity fields, which nobody wants;
// every numeric field in this app is manual-entry only. Same "global, not
// opt-in" reasoning as that CSS rule - ~100 number inputs across every
// module, no shared numeric input component to funnel them through, so one
// document-level listener (registered once, here, rather than 100 individual
// onWheel props) is what actually reaches all of them, including any added
// later. Blurring the focused input during the capture phase - before the
// input's own default wheel handling runs - is the standard, reliable fix
// for this (blur alone, not preventDefault, since preventDefault on a wheel
// listener would also block the page's own scroll).
document.addEventListener('wheel', () => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && el.type === 'number') {
    el.blur();
  }
}, { capture: true, passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
