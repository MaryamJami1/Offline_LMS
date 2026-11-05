import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { AdminApp, adminRoutes } from '../app.js';
import type { AdminApi } from '../api/admin-api.js';

/** The whole panel at one address, against a fake API, with no retries to wait for. */
export function renderAdmin(api: AdminApi, path = '/') {
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const view = render(<AdminApp api={api} router={router} queryClient={queryClient} />);
  return { ...view, router, user };
}
