import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { createHttpAdminApi } from './api/admin-api.js';
import { createApiClient } from './api/client.js';
import { AdminApp, adminRoutes } from './app.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('index.html has no #root');
}

// The panel is served by the institute's server, so /api is the same address.
const api = createHttpAdminApi(
  createApiClient({ onSessionEnded: () => window.location.assign('/login') }),
);

createRoot(root).render(
  <StrictMode>
    <AdminApp api={api} router={createBrowserRouter(adminRoutes)} />
  </StrictMode>,
);
