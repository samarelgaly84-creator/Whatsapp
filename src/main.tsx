import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TigerProvider } from './context/TigerContext.tsx';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <TigerProvider>
      <App />
    </TigerProvider>
  </ErrorBoundary>
);
