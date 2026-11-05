import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { buildWorld, createFakeAdminApi, loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-01 and NFR-13 at the admin panel's door: the admin logs in, a first-login
 * account must change its password first, and anyone who is not the admin is
 * turned away by the shared permissions table, not by a role written here.
 * Errors sit next to the field and what was typed stays (05).
 */

async function logIn(view: ReturnType<typeof renderAdmin>, username: string, password: string) {
  await view.user.type(await screen.findByLabelText('Username'), username);
  await view.user.type(screen.getByLabelText('Password'), password);
  await view.user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('ADM-01 logging in to the admin panel', () => {
  it('shows the login with the software name from the branding, never a name written in the code', async () => {
    const world = buildWorld();
    world.branding = { ...world.branding, softwareName: 'Speak Lab' };
    renderAdmin(createFakeAdminApi(world));

    expect(await screen.findByRole('heading', { name: 'Log in to Speak Lab' })).toBeInTheDocument();
    expect(screen.queryByText(/LinguaLab/)).not.toBeInTheDocument();
  });

  it('opens the dashboard for the admin', async () => {
    const api = createFakeAdminApi();
    const view = renderAdmin(api);

    await logIn(view, 'admin', 'Admin-pass-2026');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/');
  });

  it('says a wrong password next to the password field and keeps the username', async () => {
    const view = renderAdmin(createFakeAdminApi());

    await logIn(view, 'admin', 'not-the-password');

    const password = screen.getByLabelText('Password');
    await waitFor(() => expect(password).toHaveAccessibleDescription('Wrong username or password'));
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Username')).toHaveValue('admin');
  });

  it('says when a locked account opens again, in Karachi time', async () => {
    const view = renderAdmin(createFakeAdminApi());

    await logIn(view, 'S-1003', 'Lab-pass-2026');

    expect(
      await screen.findByText('Too many wrong passwords. Try again after 14:15.'),
    ).toBeInTheDocument();
  });

  it('says a deactivated account cannot log in', async () => {
    const view = renderAdmin(createFakeAdminApi());

    await logIn(view, 'S-1004', 'Lab-pass-2026');

    expect(await screen.findByText('This account has been deactivated.')).toBeInTheDocument();
  });

  it('turns a teacher away and ends their login, since the table gives teachers none of these screens', async () => {
    const api = createFakeAdminApi();
    const view = renderAdmin(api);

    await logIn(view, 'sara.iqbal', 'Teacher-pass-2026');

    expect(
      await screen.findByText('This panel is for the admin. Teachers use the teacher console.'),
    ).toBeInTheDocument();
    expect(api.world.session).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument();
  });

  it('holds a first-login admin to changing the password, then opens the panel', async () => {
    const world = buildWorld();
    const admin = world.accounts.find((account) => account.role === 'admin');
    if (admin !== undefined) {
      admin.mustChangePassword = true;
    }
    const api = createFakeAdminApi(world);
    const view = renderAdmin(api);
    await logIn(view, 'admin', 'Admin-pass-2026');

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument();

    await view.user.type(screen.getByLabelText('Current password'), 'Admin-pass-2026');
    await view.user.type(screen.getByLabelText('New password'), 'Karachi-2026-lab');
    await view.user.type(screen.getByLabelText('New password again'), 'Karachi-2026-lap');
    await view.user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByLabelText('New password again')).toHaveAccessibleDescription(
      'The two new passwords are not the same',
    );

    await view.user.clear(screen.getByLabelText('New password again'));
    await view.user.type(screen.getByLabelText('New password again'), 'Karachi-2026-lab');
    await view.user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(admin?.password).toBe('Karachi-2026-lab');
  });

  it('sends a visitor to the login, then on to the page they asked for', async () => {
    const view = renderAdmin(createFakeAdminApi(), '/students');

    await logIn(view, 'admin', 'Admin-pass-2026');

    expect(await screen.findByRole('heading', { name: 'Students', level: 1 })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/students');
  });

  it('keeps the admin logged in after a reload', async () => {
    renderAdmin(loggedInAsAdmin());

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('logs out from the side bar and ends the login on the server', async () => {
    const api = loggedInAsAdmin();
    const view = renderAdmin(api);
    const nav = await screen.findByRole('complementary');

    await view.user.click(within(nav).getByRole('button', { name: 'Log out' }));

    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(api.world.session).toBeNull();
  });
});
