import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeviceStatus, ListUsersQuery } from '@lingualab/shared';
import { useAdminApi } from './api-context.js';

/**
 * Server data the screens share, cached by TanStack Query (02). A change on
 * one screen calls `refresh` with the keys it touched, so every screen that
 * shows the same thing updates.
 */
export const keys = {
  users: (query: Partial<ListUsersQuery>) => ['users', query] as const,
  allUsers: ['users'] as const,
  classes: ['classes'] as const,
  batches: ['batches'] as const,
  labs: ['labs'] as const,
  labSeats: (labId: string) => ['labs', labId, 'seats'] as const,
  devices: (status?: DeviceStatus) => ['devices', status ?? 'all'] as const,
  allDevices: ['devices'] as const,
};

export function useUsers(query: Partial<ListUsersQuery>) {
  const api = useAdminApi();
  return useQuery({ queryKey: keys.users(query), queryFn: () => api.listUsers(query) });
}

export function useClasses() {
  const api = useAdminApi();
  return useQuery({ queryKey: keys.classes, queryFn: () => api.listClasses() });
}

export function useBatches() {
  const api = useAdminApi();
  return useQuery({ queryKey: keys.batches, queryFn: () => api.listBatches() });
}

/** Asked again every 30 seconds, so the side menu notices the server stopping. */
export function useServerStatus() {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['server-status'],
    queryFn: () => api.serverAnswers().then(() => true),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useLabs() {
  const api = useAdminApi();
  return useQuery({ queryKey: keys.labs, queryFn: () => api.listLabs() });
}

export function useLabSeats(labId: string | undefined) {
  const api = useAdminApi();
  return useQuery({
    queryKey: keys.labSeats(labId ?? ''),
    queryFn: () => api.labSeats(labId ?? ''),
    enabled: labId !== undefined,
  });
}

/** The seat maps of several labs at once, for the dashboard. */
export function useAllLabSeats(labIds: readonly string[]) {
  const api = useAdminApi();
  return useQueries({
    queries: labIds.map((labId) => ({
      queryKey: keys.labSeats(labId),
      queryFn: () => api.labSeats(labId),
    })),
  });
}

export function useDevices(status?: DeviceStatus) {
  const api = useAdminApi();
  return useQuery({ queryKey: keys.devices(status), queryFn: () => api.listDevices(status) });
}

/** After a change: fetch again whatever shows what changed. */
export function useRefresh() {
  const queryClient = useQueryClient();
  return (...touched: (readonly unknown[])[]) =>
    Promise.all(touched.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
