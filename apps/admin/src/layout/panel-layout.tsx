import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { may, type Action } from '@lingualab/shared';
import { Button, SideNav, SideNavItem, useBranding } from '@lingualab/ui';
import { useServerStatus } from '../api/queries.js';
import { useAdmin, useSession } from '../auth/session.js';
import { ChangePasswordScreen } from '../screens/change-password.js';

/**
 * The sections built so far, in the prototype's order. Content, Reports,
 * Backups and Settings join the list as their screens are built (05). Each
 * is shown by the row of the shared permissions table it belongs to.
 */
const SECTIONS: readonly { to: string; label: string; action: Action }[] = [
  { to: '/', label: 'Dashboard', action: 'manageUsers' },
  { to: '/students', label: 'Students', action: 'manageUsers' },
  { to: '/teachers', label: 'Teachers', action: 'manageUsers' },
  { to: '/classes', label: 'Classes', action: 'manageOrganisation' },
  { to: '/lab', label: 'Lab and seats', action: 'manageLabs' },
];

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  const current = useMatch({ path: to, end: to === '/' }) !== null;
  return (
    <SideNavItem current={current} asChild>
      <Link to={to}>{children}</Link>
    </SideNavItem>
  );
}

/** A headset, the mark the prototype draws when the institute has no logo of its own. */
function HeadsetIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
    </svg>
  );
}

/** The logo square in the main colour, the software name, and "Admin" under it (05, A-01). */
function Brand() {
  const { softwareName, logoUrl } = useBranding();
  return (
    <div className="flex items-center gap-2.5">
      <span
        data-brand-mark
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-control bg-primary text-on-primary"
      >
        {logoUrl === null ? <HeadsetIcon /> : <img src={logoUrl} alt="" className="size-full" />}
      </span>
      <div className="flex flex-col">
        <span className="font-bold">{softwareName}</span>
        <span className="text-[13px] text-on-primary">Admin</span>
      </div>
    </div>
  );
}

/** "Server running · offline mode" while the server answers its health check. */
function ServerStatus() {
  const status = useServerStatus();
  if (status.isPending) {
    return null;
  }
  const running = status.isSuccess;
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={running ? 'size-2 rounded-full bg-success' : 'size-2 rounded-full bg-live'}
      />
      {running ? 'Server running · offline mode' : 'Server not answering'}
    </span>
  );
}

function PanelFrame() {
  const admin = useAdmin();
  const { logOut } = useSession();
  const { instituteName } = useBranding();
  return (
    <div className="flex min-h-screen bg-bg">
      <SideNav
        label="Admin sections"
        header={<Brand />}
        footer={
          <div className="flex flex-col gap-2 rounded-[10px] bg-ink-raised p-3 text-[13px]">
            <ServerStatus />
            {instituteName !== '' && <span>{instituteName}</span>}
            <span>
              Logged in as <span className="font-semibold">{admin.fullName}</span>
            </span>
            <Button size="small" onClick={() => void logOut()}>
              Log out
            </Button>
          </div>
        }
      >
        {SECTIONS.filter((section) => may(admin.role, section.action)).map((section) => (
          <NavItem key={section.to} to={section.to}>
            {section.label}
          </NavItem>
        ))}
      </SideNav>
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-7 pb-12">
        <Outlet />
      </main>
    </div>
  );
}

/** Only the logged-in admin gets past here; a first-login account changes its password first. */
export function PanelLayout() {
  const { state } = useSession();
  const location = useLocation();
  if (state.status === 'checking') {
    return (
      <p role="status" className="p-8 text-sm text-ink-muted">
        Opening the panel…
      </p>
    );
  }
  if (state.status === 'out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (state.user.mustChangePassword) {
    return <ChangePasswordScreen />;
  }
  return <PanelFrame />;
}
