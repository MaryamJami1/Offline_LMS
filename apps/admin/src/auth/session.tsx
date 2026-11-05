import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { may, type AuthUser } from '@lingualab/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminApi } from '../api/api-context.js';

/**
 * Who is logged in to the panel. The panel is for whoever the shared
 * permissions table lets manage users, which is the admin; anyone else is
 * logged out again at once, and the server would refuse them anyway.
 */

export type SessionState =
  { status: 'checking' } | { status: 'out'; notice?: string } | { status: 'in'; user: AuthUser };

interface Session {
  state: SessionState;
  logIn(username: string, password: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  logOut(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export const NOT_FOR_THIS_PANEL = 'This panel is for the admin. Teachers use the teacher console.';

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>(() =>
    api.hasSession() ? { status: 'checking' } : { status: 'out' },
  );

  const admit = useCallback(
    async (user: AuthUser) => {
      if (may(user.role, 'manageUsers')) {
        setState({ status: 'in', user });
        return;
      }
      await api.logout().catch(() => undefined);
      setState({ status: 'out', notice: NOT_FOR_THIS_PANEL });
    },
    [api],
  );

  // Resumed once when the panel opens. A refresh token sent twice ends every
  // login of the account (06), so React's development double run of effects
  // must not send it again.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !api.hasSession()) {
      return;
    }
    resumed.current = true;
    api.resumeSession().then(
      (me) => admit(me.user),
      () => setState({ status: 'out' }),
    );
  }, [api, admit]);

  const session = useMemo<Session>(
    () => ({
      state,
      logIn: async (username, password) => {
        const login = await api.login(username, password);
        await admit(login.user);
      },
      changePassword: async (currentPassword, newPassword) => {
        const login = await api.changePassword(currentPassword, newPassword);
        await admit(login.user);
      },
      logOut: async () => {
        await api.logout().catch(() => undefined);
        queryClient.clear();
        setState({ status: 'out' });
      },
    }),
    [api, admit, queryClient, state],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession() needs <SessionProvider> above it');
  }
  return session;
}

/** The logged-in admin; only for screens inside the panel. */
export function useAdmin(): AuthUser {
  const { state } = useSession();
  if (state.status !== 'in') {
    throw new Error('useAdmin() outside the logged-in panel');
  }
  return state.user;
}
