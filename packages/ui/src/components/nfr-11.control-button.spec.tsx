import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlButton } from './control-button.js';

/**
 * NFR-11: Control button, one of the teacher's eight controls. Pressing a
 * running control again stops it (05, Rules every screen follows).
 */

describe('NFR-11 Control button', () => {
  it('is a toggle button named after its control', () => {
    render(<ControlButton label="Broadcast" running={false} onToggle={() => {}} />);

    expect(screen.getByRole('button', { name: 'Broadcast' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('says it is running in words as well as colour, and stops on the next press', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ControlButton label="Broadcast" running onToggle={onToggle} />);

    const button = screen.getByRole('button', { name: /Broadcast/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Live');

    await user.click(button);

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('starts with Enter and Space as well', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ControlButton label="Intercom" running={false} onToggle={onToggle} />);

    await user.tab();
    await user.keyboard('{Enter} ');

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('is 44 px tall, as a primary control', () => {
    render(<ControlButton label="Quiz" running={false} onToggle={() => {}} />);

    expect(screen.getByRole('button')).toHaveClass('min-h-11');
  });

  it('shows its icon without reading it out', () => {
    render(
      <ControlButton
        label="Lock"
        icon={<svg data-testid="icon" />}
        running={false}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
  });
});
