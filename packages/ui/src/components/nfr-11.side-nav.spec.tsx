import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SideNav, SideNavItem } from './side-nav.js';

/**
 * NFR-11: the admin panel's side navigation (A-01 to A-11). It is a named
 * navigation landmark, says which section is open in words for screen readers
 * as well as by colour, and every item is reached with Tab.
 */

function Nav({ current, onPick }: { current: string; onPick?: (section: string) => void }) {
  return (
    <SideNav
      label="Admin sections"
      header={<span>Lab</span>}
      footer={<span>Logged in as admin</span>}
    >
      {['Dashboard', 'Students', 'Teachers'].map((section) => (
        <SideNavItem key={section} current={section === current} asChild>
          <a
            href={`#${section}`}
            onClick={(event) => {
              event.preventDefault();
              onPick?.(section);
            }}
          >
            {section}
          </a>
        </SideNavItem>
      ))}
    </SideNav>
  );
}

describe('NFR-11 Side navigation', () => {
  it('is a navigation landmark named by its label, with a header and a footer', () => {
    render(<Nav current="Dashboard" />);

    const nav = screen.getByRole('navigation', { name: 'Admin sections' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Lab')).toBeInTheDocument();
    expect(screen.getByText('Logged in as admin')).toBeInTheDocument();
  });

  it('marks the open section as the current page, not by colour alone', () => {
    render(<Nav current="Students" />);

    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Students' })).toHaveClass(
      'bg-primary',
      'text-on-primary',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('reaches every item with Tab, shows the focus ring, and opens one with Enter', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Nav current="Dashboard" onPick={onPick} />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Students' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onPick).toHaveBeenCalledWith('Students');
    expect(screen.getByRole('link', { name: 'Students' })).toHaveClass(
      'focus-visible:outline-on-primary',
      'min-h-10',
    );
  });

  it('works as a plain button when not given a link', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <SideNav label="Sections">
        <SideNavItem onClick={onClick}>Reports</SideNavItem>
      </SideNav>,
    );

    await user.click(screen.getByRole('button', { name: 'Reports' }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
