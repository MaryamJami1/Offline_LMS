import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentApp } from './app.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('index.html has no #root');
}

// window.lingualab comes from the preload script; it is the screens' only way out.
createRoot(root).render(
  <StrictMode>
    <StudentApp bridge={window.lingualab} />
  </StrictMode>,
);
