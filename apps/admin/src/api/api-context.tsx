import { createContext, useContext, type ReactNode } from 'react';
import type { AdminApi } from './admin-api.js';

const ApiContext = createContext<AdminApi | null>(null);

export function AdminApiProvider({ api, children }: { api: AdminApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/** The server, as the screens see it. */
export function useAdminApi(): AdminApi {
  const api = useContext(ApiContext);
  if (api === null) {
    throw new Error('useAdminApi() needs <AdminApiProvider> above it');
  }
  return api;
}
