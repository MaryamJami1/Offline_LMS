import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouteObject, type createBrowserRouter } from 'react-router';
import { BrandingProvider, ToastProvider } from '@lingualab/ui';
import type { AdminApi } from './api/admin-api.js';
import { AdminApiProvider } from './api/api-context.js';
import { ApiError } from './api/client.js';
import { SessionProvider } from './auth/session.js';
import { PanelLayout } from './layout/panel-layout.js';
import { ClassesScreen } from './screens/classes.js';
import { DashboardScreen } from './screens/dashboard.js';
import { LabAndSeatsScreen } from './screens/lab-and-seats.js';
import { LoginScreen } from './screens/login.js';
import { NotFoundScreen } from './screens/not-found.js';
import { StudentsScreen } from './screens/students.js';
import { TeachersScreen } from './screens/teachers.js';

/** The admin panel's addresses: screens A-01 to A-04 and A-07 (05). */
export const adminRoutes: RouteObject[] = [
  { path: '/login', element: <LoginScreen /> },
  {
    path: '/',
    element: <PanelLayout />,
    children: [
      { index: true, element: <DashboardScreen /> },
      { path: 'students', element: <StudentsScreen /> },
      { path: 'teachers', element: <TeachersScreen /> },
      { path: 'classes', element: <ClassesScreen /> },
      { path: 'lab', element: <LabAndSeatsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];

/** A refused call is not worth repeating; a dropped connection is, once. */
function retryOnce(failures: number, error: unknown): boolean {
  return failures < 1 && !(error instanceof ApiError);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryOnce, staleTime: 10_000 },
      mutations: { retry: false },
    },
  });
}

export interface AdminAppProps {
  api: AdminApi;
  router: ReturnType<typeof createBrowserRouter>;
  queryClient?: QueryClient;
}

export function AdminApp({ api, router, queryClient }: AdminAppProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <AdminApiProvider api={api}>
      <QueryClientProvider client={client}>
        <BrandingProvider fetchBranding={api.branding}>
          <ToastProvider>
            <SessionProvider>
              <RouterProvider router={router} />
            </SessionProvider>
          </ToastProvider>
        </BrandingProvider>
      </QueryClientProvider>
    </AdminApiProvider>
  );
}
