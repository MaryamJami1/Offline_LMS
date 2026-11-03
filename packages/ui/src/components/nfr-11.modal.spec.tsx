import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button.js';
import { Modal } from './modal.js';

/**
 * NFR-11: Modal. Focus goes in and stays in, Escape closes it, and focus
 * comes back to whatever opened it.
 */

function ResetPassword({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Reset password</Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
        title="Reset Ayesha's password?"
        description="Every login of this student ends."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Reset</Button>
          </>
        }
      >
        <p>A new password is shown once.</p>
      </Modal>
    </>
  );
}

describe('NFR-11 Modal', () => {
  it('is a dialog named by its title and described by its description', async () => {
    const user = userEvent.setup();
    render(<ResetPassword />);

    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    const dialog = screen.getByRole('dialog', { name: "Reset Ayesha's password?" });
    expect(dialog).toHaveAccessibleDescription('Every login of this student ends.');
    expect(dialog).toHaveTextContent('A new password is shown once.');
  });

  it('takes focus in, and keeps Tab inside', async () => {
    const user = userEvent.setup();
    render(<ResetPassword />);

    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes with Escape and gives focus back to what opened it', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ResetPassword onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset password' })).toHaveFocus();
  });

  it('has a close button with a name', async () => {
    const user = userEvent.setup();
    render(<ResetPassword />);

    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
