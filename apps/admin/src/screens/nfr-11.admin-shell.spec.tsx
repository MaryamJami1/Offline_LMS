import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { buildWorld, loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * NFR-11 and ADM-07 (branding) for the admin panel's frame: a named side
 * navigation with the sections built so far, the open one said in words, every
 * item reached with Tab, and the software name read from the branding.
 */

describe('NFR-11 the admin panel frame', () => {
  it('has a side navigation with the five sections built so far, in the prototype order', async () => {
    renderAdmin(loggedInAsAdmin());

    const nav = await screen.findByRole('navigation', { name: 'Admin sections' });

    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Dashboard', 'Students', 'Teachers', 'Classes', 'Lab and seats']);
  });

  it('marks the open section as the current page', async () => {
    renderAdmin(loggedInAsAdmin(), '/teachers');

    const nav = await screen.findByRole('navigation', { name: 'Admin sections' });

    expect(within(nav).getByRole('link', { name: 'Teachers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('opens a section from the keyboard', async () => {
    const view = renderAdmin(loggedInAsAdmin());
    const nav = await screen.findByRole('navigation', { name: 'Admin sections' });

    within(nav).getByRole('link', { name: 'Dashboard' }).focus();
    await view.user.tab();
    expect(within(nav).getByRole('link', { name: 'Students' })).toHaveFocus();
    await view.user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Students', level: 1 })).toBeInTheDocument();
  });

  it('shows the software name and the institute from the branding, and who is logged in', async () => {
    const world = buildWorld();
    world.branding = {
      ...world.branding,
      softwareName: 'Speak Lab',
      instituteName: 'Model Town Campus',
    };
    renderAdmin(loggedInAsAdmin(world));

    const bar = await screen.findByRole('complementary');

    expect(await within(bar).findByText('Speak Lab')).toBeInTheDocument();
    expect(within(bar).getByText('Model Town Campus')).toBeInTheDocument();
    expect(within(bar).getByText('Lab Admin')).toBeInTheDocument();
  });

  it('heads the side menu with the logo square, the software name and "Admin", as the prototype does', async () => {
    renderAdmin(loggedInAsAdmin());

    const bar = await screen.findByRole('complementary');

    expect(await within(bar).findByText('LinguaLab')).toBeInTheDocument();
    expect(within(bar).getByText('Admin')).toBeInTheDocument();
    const mark = bar.querySelector('[data-brand-mark]');
    expect(mark).toHaveClass('size-8', 'bg-primary');
    expect(mark?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it("puts the institute's own logo in the square when the branding has one", async () => {
    const world = buildWorld();
    world.branding = { ...world.branding, logoUrl: '/api/settings/logo' };
    renderAdmin(loggedInAsAdmin(world));

    const bar = await screen.findByRole('complementary');

    await waitFor(() =>
      expect(bar.querySelector('[data-brand-mark] img')).toHaveAttribute(
        'src',
        '/api/settings/logo',
      ),
    );
  });

  it('says at the foot of the menu that the server is running, offline, and keeps Log out', async () => {
    renderAdmin(loggedInAsAdmin());

    const bar = await screen.findByRole('complementary');

    expect(await within(bar).findByText('Server running · offline mode')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('says so when the server stops answering', async () => {
    const api = loggedInAsAdmin();
    api.world.serverUp = false;
    renderAdmin(api);

    const bar = await screen.findByRole('complementary');

    expect(await within(bar).findByText('Server not answering')).toBeInTheDocument();
    expect(within(bar).queryByText('Server running · offline mode')).not.toBeInTheDocument();
  });

  it('answers an address it does not know with a page that leads back', async () => {
    renderAdmin(loggedInAsAdmin(), '/reports');

    expect(
      await screen.findByRole('heading', { name: 'Not here yet', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
