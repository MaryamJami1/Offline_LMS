import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-11 and ADM-01 on the Students screen (A-02): the admin resets a
 * student's password after saying yes, and sees the new first password once.
 * The reset also ends a lockout (04).
 */

function resetButtonOf(name: string): HTMLElement {
  const row = screen.getByRole('cell', { name }).closest('tr');
  if (row === null) {
    throw new Error(`no row for ${name}`);
  }
  return within(row).getByRole('button', { name: `Reset password for ${name}` });
}

describe("ADM-11 resetting a student's password (A-02)", () => {
  it('asks first, then shows the new first password once', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/students');
    await screen.findByRole('table', { name: 'Students' });

    await view.user.click(resetButtonOf('Ayesha Khan'));
    const dialog = screen.getByRole('dialog', { name: "Reset Ayesha Khan's password?" });
    expect(dialog).toHaveAccessibleDescription(
      'Their logins end at once, and they must choose a new password at the next login.',
    );
    await view.user.click(within(dialog).getByRole('button', { name: 'Reset password' }));

    expect(await within(dialog).findByText('Moon-7314-desk')).toHaveClass('font-mono');
    expect(within(dialog).getByText(/shown only this once/)).toBeInTheDocument();
  });

  it('changes nothing when the admin says no', async () => {
    const api = loggedInAsAdmin();
    const reset = vi.spyOn(api, 'resetPassword');
    const view = renderAdmin(api, '/students');
    await screen.findByRole('table', { name: 'Students' });

    await view.user.click(resetButtonOf('Ayesha Khan'));
    await view.user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it('unlocks a locked account, and the list says so', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/students');
    await screen.findByRole('table', { name: 'Students' });

    await view.user.click(resetButtonOf('Hira Malik'));
    const dialog = screen.getByRole('dialog');
    await view.user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    await within(dialog).findByText('Moon-7314-desk');
    await view.user.click(within(dialog).getByRole('button', { name: 'Done' }));

    const row = (await screen.findByRole('cell', { name: 'Hira Malik' })).closest(
      'tr',
    ) as HTMLElement;
    expect(await within(row).findByText('First login')).toBeInTheDocument();
    expect(within(row).queryByText('Locked')).not.toBeInTheDocument();
  });
});
