import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n';

const isProdDomain =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'www.mytiktak.com' ||
    window.location.hostname === 'mytiktak.com' ||
    window.location.hostname === 'tiktak2026.web.app' ||
    window.location.hostname === 'tiktak2026.firebaseapp.com');

const shouldRedirectToStaging =
  isProdDomain &&
  (window.location.href.includes('env=stg') ||
    window.location.href.includes('env%3Dstg'));

if (shouldRedirectToStaging) {
  window.location.replace(
    `https://tiktak-stg.web.app${window.location.pathname}${window.location.search}${window.location.hash}`
  );
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}
