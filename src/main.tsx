import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import '@carbon/react/index.scss';
import './app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker with reliable auto-update on new deployments
if ('serviceWorker' in navigator) {
  // controllerchange fires when a new SW takes control — most reliable reload trigger
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      // If a new SW is already waiting (installed but not yet active),
      // tell it to skip waiting immediately — handles the "revisit" case.
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // Once installed, skip waiting so it activates and triggers controllerchange
          if (newWorker.state === 'installed') {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // Poll for updates every 60 s — catches long-lived sessions
      setInterval(() => reg.update(), 60_000);
    });
  });
}
