import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../lib/cn.js';

export interface SideNavProps {
  /** Names the navigation landmark for screen readers. */
  label: string;
  /** Above the items: the software name and logo, read from the branding. */
  header?: ReactNode;
  /** Pushed to the bottom: who is logged in, Log out. */
  footer?: ReactNode;
  children: ReactNode;
}

/** The dark side bar of the admin panel (A-01 to A-11). */
export function SideNav({ label, header, footer, children }: SideNavProps) {
  return (
    <aside className="flex min-h-screen w-60 shrink-0 flex-col gap-5 bg-ink px-3.5 py-5 text-on-primary">
      {header !== undefined && <div className="px-1.5">{header}</div>}
      <nav aria-label={label}>
        <ul className="flex flex-col gap-0.5">{children}</ul>
      </nav>
      {footer !== undefined && <div className="mt-auto px-1.5">{footer}</div>}
    </aside>
  );
}

export interface SideNavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The open section: said as the current page, and drawn in the main colour. */
  current?: boolean;
  /** Render the child (a router link) instead of a button. */
  asChild?: boolean;
}

export const SideNavItem = forwardRef<HTMLButtonElement, SideNavItemProps>(function SideNavItem(
  { current = false, asChild = false, className, ...props },
  ref,
) {
  const Item = asChild ? Slot : 'button';
  return (
    <li>
      <Item
        ref={ref}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex min-h-10 w-full items-center rounded-control px-3 text-left text-sm font-medium text-on-primary',
          // The main colour's ring would vanish on the dark bar; white shows.
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-on-primary',
          current ? 'bg-primary font-semibold' : 'hover:bg-ink-muted',
          className,
        )}
        {...props}
      />
    </li>
  );
});
