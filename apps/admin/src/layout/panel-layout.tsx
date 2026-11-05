import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { may, type Action } from '@lingualab/shared';
import { Button, SideNav, SideNavItem, useBranding } from '@lingualab/ui';
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

function Brand() {
  const { softwareName, instituteName, logoUrl } = useBranding();
  return (
    <div className="flex items-center gap-2.5">
      {logoUrl !== null && <img src={logoUrl} alt="" className="size-8 rounded-control" />}
      <div className="flex flex-col">
        <span className="font-bold">{softwareName}</span>
        {instituteName !== '' && <span className="text-[13px]">{instituteName}</span>}
      </div>
    </div>
  );
}

function PanelFrame() {
  const admin = useAdmin();
  const { logOut } = useSession();
  return (
    <div className="flex min-h-screen bg-bg">
      <SideNav
        label="Admin sections"
        header={<Brand />}
        footer={
          <div className="flex flex-col gap-2 text-[13px]">
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
