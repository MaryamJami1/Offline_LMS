import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { PLACE, createFakeBridge, renderStudent } from './test/fake-bridge.js';

/**
 * STU-06: Ctrl+Alt+Shift+Q, caught by the main process, opens a PIN dialog on
 * any screen. Nothing on screen points to it: it is in the admin guide only
 * (10). The PIN is sent to the main process, which asks the server.
 */

const LOGIN = { screen: 'login', place: PLACE } as const;

async function openDialog() {
  const fake = createFakeBridge(LOGIN);
  const view = renderStudent(fake);
  await screen.findByRole('heading', { name: 'Log in to Lab' });
  fake.requestExit();
  const dialog = await screen.findByRole('dialog', { name: 'Close the student app' });
  return { fake, view, dialog };
}

describe('STU-06 the PIN dialog', () => {
  it('is not on screen, and nothing on screen mentions it', async () => {
    renderStudent(createFakeBridge(LOGIN));
    await screen.findByRole('heading', { name: 'Log in to Lab' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/PIN|Ctrl\+Alt/);
  });

  it('opens on the shortcut and sends the PIN', async () => {
    const { fake, view, dialog } = await openDialog();

    const pin = within(dialog).getByLabelText('Admin PIN');
    expect(pin).toHaveAttribute('type', 'password');
    expect(pin).toHaveAttribute('inputmode', 'numeric');
    expect(pin).toHaveAttribute('autocomplete', 'off');
    expect(pin).toHaveFocus();
    await view.user.type(pin, '204816');
    await view.user.click(within(dialog).getByRole('button', { name: 'Close app' }));

    expect(fake.bridge.exit).toHaveBeenCalledWith('204816');
  });

  it('shows what the server said, and clears the PIN', async () => {
    const { fake, view, dialog } = await openDialog();
    fake.bridge.exit.mockResolvedValueOnce({
      ok: false,
      problem: { field: 'pin', message: 'Wrong PIN. 4 tries left.' },
    });

    await view.user.type(within(dialog).getByLabelText('Admin PIN'), '000000{Enter}');

    expect(await within(dialog).findByText('Wrong PIN. 4 tries left.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Admin PIN')).toHaveValue('');
  });

  it('can be cancelled, leaving the app as it was', async () => {
    const { fake, view, dialog } = await openDialog();

    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fake.bridge.exit).not.toHaveBeenCalled();
  });
});
