import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabPanel, TabRail } from './tab-rail.js';

/** NFR-11: Tab rail, the console's column of sections, worked with the arrow keys. */

const TABS = [
  { value: 'seats', label: 'Seats' },
  { value: 'groups', label: 'Groups' },
  { value: 'quiz', label: 'Quiz bank' },
  { value: 'reports', label: 'Reports' },
];

function Rail({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('seats');
  return (
    <TabRail
      label="Console sections"
      tabs={TABS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    >
      {TABS.map((tab) => (
        <TabPanel key={tab.value} value={tab.value}>
          {tab.label} panel
        </TabPanel>
      ))}
    </TabRail>
  );
}

describe('NFR-11 Tab rail', () => {
  it('is a vertical tab list with a name, showing the chosen panel', () => {
    render(<Rail />);

    const list = screen.getByRole('tablist', { name: 'Console sections' });
    expect(list).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByRole('tab', { name: 'Seats' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Seats panel');
  });

  it('moves with the arrow keys, Home and End', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Rail onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Seats' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Groups' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Groups panel');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Seats' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('reports');
  });

  it('marks the chosen tab in the primary tint', () => {
    render(<Rail />);

    expect(screen.getByRole('tab', { name: 'Seats' })).toHaveClass(
      'data-[state=active]:bg-primary-tint',
      'data-[state=active]:text-primary',
    );
  });
});
