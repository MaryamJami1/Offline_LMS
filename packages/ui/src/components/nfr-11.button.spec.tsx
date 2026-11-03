import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button.js';
import { FOCUS_RING } from '../lib/focus.js';

/** NFR-11: Button, in the four forms of docs/docs/05-screens-and-ux.md. */

describe('NFR-11 Button', () => {
  it('is a real button that never submits a form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('can still be a submit button when asked', () => {
    render(<Button type="submit">Log in</Button>);

    expect(screen.getByRole('button', { name: 'Log in' })).toHaveAttribute('type', 'submit');
  });

  it('is pressed with the mouse, Enter or Space', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Lock all</Button>);

    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('shows the focus ring when reached with Tab', async () => {
    const user = userEvent.setup();
    render(<Button>Next</Button>);

    await user.tab();

    expect(screen.getByRole('button')).toHaveFocus();
    expect(screen.getByRole('button')).toHaveClass(...FOCUS_RING.split(' '));
  });

  it('is skipped by Tab and not pressed while disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Button disabled onClick={onClick}>
          Send
        </Button>
        <Button>Cancel</Button>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.tab();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('comes as default, primary and danger, each in the design colours', () => {
    render(
      <>
        <Button>Default</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="danger">End class</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass(
      'bg-surface',
      'text-ink',
      'border-border-strong',
    );
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass(
      'bg-primary',
      'text-on-primary',
      'hover:bg-primary-hover',
    );
    expect(screen.getByRole('button', { name: 'End class' })).toHaveClass(
      'bg-live',
      'text-on-primary',
      'hover:bg-live-hover',
    );
  });

  it('is never smaller than the 40 px touch target, even when small', () => {
    render(
      <>
        <Button>Normal</Button>
        <Button size="small">Small</Button>
        <Button size="large">Start class</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Normal' })).toHaveClass('min-h-10');
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('min-h-10', 'text-[13px]');
    expect(screen.getByRole('button', { name: 'Start class' })).toHaveClass('min-h-11');
  });

  it('can dress a link as a button', () => {
    render(
      <Button asChild variant="primary">
        <a href="/lessons">Open lessons</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Open lessons' })).toHaveClass('bg-primary');
    expect(screen.getByRole('link')).not.toHaveAttribute('type');
  });

  it('needs a label when it shows only an icon', () => {
    render(
      <Button aria-label="Close">
        <svg aria-hidden="true" />
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
