import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './AppErrorBoundary';
import './styles.css';
import './workspace.css';
import './transaction-inspection.css';
import './transaction-comparison.css';
import './shell.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor de la aplicación.');
createRoot(root, {
  onCaughtError: () => {
    /* Recovery deliberately omits raw error details. */
  },
}).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
