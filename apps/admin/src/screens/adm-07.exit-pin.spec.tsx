import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { NOW, buildWorld, loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-07 and STU-06: the admin PIN that closes the student app. The seed
 * gives a first PIN that the admin must change, so until they do the
 * dashboard (A-01) lists it under "Needs attention", with a way to change it
 * there. It moves to Settings (A-10) when that screen is built.
 */

const ITEM = 'The student app still has the first exit PIN';

async function openDialog() {
  const view = renderAdmin(loggedInAsAdmin());
  const attention = await screen.findByRole('region', { name: 'Needs attention' });
  await view.user.click(await within(attention).findByRole('button', { name: `Change: ${ITEM}` }));
  const dialog = await screen.findByRole('dialog', { name: 'Change the exit PIN' });
  return { view, attention, dialog };
}

describe('ADM-07 the exit PIN on the dashboard (A-01)', () => {
  it('needs attention while the seeded PIN is still in use', async () => {
    renderAdmin(loggedInAsAdmin());

    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    expect(await within(attention).findByText(ITEM)).toBeInTheDocument();
  });

  it('is not mentioned once the PIN has been changed', async () => {
    const world = buildWorld();
    world.devices = world.devices.filter((pc) => pc.status === 'online');
    world.exitPin = { pin: '204816', changedAt: NOW.toISOString() };
    renderAdmin(loggedInAsAdmin(world));

    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    expect(await within(attention).findByText('Nothing needs attention.')).toBeInTheDocument();
    expect(within(attention).queryByText(ITEM)).not.toBeInTheDocument();
  });

  it('changes the PIN with the admin password typed again, and stops asking', async () => {
    const { view, attention, dialog } = await openDialog();

    await view.user.type(within(dialog).getByLabelText('New PIN'), '204816');
    await view.user.type(within(dialog).getByLabelText('New PIN again'), '204816');
    await view.user.type(within(dialog).getByLabelText('Your password'), 'Admin-pass-2026');
    await view.user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));

    expect(await screen.findByText('The exit PIN has been changed.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(attention).queryByText(ITEM)).not.toBeInTheDocument();
  });

  it('keeps the PIN hidden while it is typed', async () => {
    const { dialog } = await openDialog();

    for (const label of ['New PIN', 'New PIN again']) {
      const field = within(dialog).getByLabelText(label);
      expect(field).toHaveAttribute('type', 'password');
      expect(field).toHaveAttribute('inputmode', 'numeric');
      expect(field).toHaveAttribute('autocomplete', 'off');
    }
  });

  it('asks for six digits before sending anything', async () => {
    const { view, dialog } = await openDialog();

    await view.user.type(within(dialog).getByLabelText('New PIN'), '1234');
    await view.user.type(within(dialog).getByLabelText('New PIN again'), '1234');
    await view.user.type(within(dialog).getByLabelText('Your password'), 'Admin-pass-2026');
    await view.user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));

    expect(await within(dialog).findByText('Use six digits')).toBeInTheDocument();
  });

  it('says when the two PINs are not the same', async () => {
    const { view, dialog } = await openDialog();

    await view.user.type(within(dialog).getByLabelText('New PIN'), '204816');
    await view.user.type(within(dialog).getByLabelText('New PIN again'), '204817');
    await view.user.type(within(dialog).getByLabelText('Your password'), 'Admin-pass-2026');
    await view.user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));

    expect(await within(dialog).findByText('The two PINs are not the same')).toBeInTheDocument();
  });

  it('says so when the password is wrong, and keeps the old PIN', async () => {
    const { view, dialog } = await openDialog();

    await view.user.type(within(dialog).getByLabelText('New PIN'), '204816');
    await view.user.type(within(dialog).getByLabelText('New PIN again'), '204816');
    await view.user.type(within(dialog).getByLabelText('Your password'), 'not-my-password');
    await view.user.click(within(dialog).getByRole('button', { name: 'Change PIN' }));

    expect(await within(dialog).findByText('The password is wrong')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Change the exit PIN' })).toBeInTheDocument();
  });
});
