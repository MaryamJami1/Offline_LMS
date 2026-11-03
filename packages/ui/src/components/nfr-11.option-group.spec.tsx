import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OptionGroup, type OptionMark } from './option-group.js';

/**
 * NFR-11: Option buttons (A/B/C), one answer of a question. A radio group, so
 * the arrow keys move between options; after marking, right and wrong are
 * said in words as well as colour.
 */

const OPTIONS = [
  { value: 'o1', text: 'at the library' },
  { value: 'o2', text: 'in the park' },
  { value: 'o3', text: 'at home' },
];

function Question({ marks, disabled }: { marks?: Record<string, OptionMark>; disabled?: boolean }) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <OptionGroup
      label="Where did Sara meet Ali?"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
      marks={marks}
      disabled={disabled}
    />
  );
}

describe('NFR-11 Option buttons', () => {
  it('is a radio group named by its question, with lettered options', () => {
    render(<Question />);

    expect(
      screen.getByRole('radiogroup', { name: 'Where did Sara meet Ali?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A at the library' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'C at home' })).toBeInTheDocument();
  });

  it('is chosen with a click, and only one at a time', async () => {
    const user = userEvent.setup();
    render(<Question />);

    await user.click(screen.getByRole('radio', { name: /in the park/ }));
    await user.click(screen.getByRole('radio', { name: /at home/ }));

    expect(screen.getByRole('radio', { name: /at home/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /in the park/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /at home/ })).toHaveClass(
      'data-[state=checked]:bg-selected',
    );
  });

  it('moves between options with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Question />);

    await user.tab();
    expect(screen.getByRole('radio', { name: /library/ })).toHaveFocus();
    // Held, as a finger does: Radix moves focus a moment after the key goes down.
    await user.keyboard('{ArrowDown>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: /park/ })).toHaveFocus());
    await user.keyboard('{/ArrowDown}');

    expect(screen.getByRole('radio', { name: /park/ })).toBeChecked();
  });

  it('says which answer was right and which was wrong, in words', () => {
    render(<Question marks={{ o1: 'right', o2: 'wrong' }} disabled />);

    expect(screen.getByRole('radio', { name: 'A at the library, Correct' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /library/ })).toHaveTextContent('Correct');
    expect(screen.getByRole('radio', { name: /library/ })).toHaveClass('bg-success-tint');
    expect(screen.getByRole('radio', { name: /park/ })).toHaveTextContent('Wrong');
    expect(screen.getByRole('radio', { name: /park/ })).toHaveClass('bg-live-tint');
    expect(screen.getByRole('radio', { name: /home/ })).not.toHaveTextContent(/Correct|Wrong/);
  });

  it('cannot be changed once marked', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <OptionGroup label="Q" options={OPTIONS} value="o1" onValueChange={onValueChange} disabled />,
    );

    await user.click(screen.getByRole('radio', { name: /park/ }));

    expect(onValueChange).not.toHaveBeenCalled();
  });
});
