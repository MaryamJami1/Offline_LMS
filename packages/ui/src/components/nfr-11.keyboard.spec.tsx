import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button.js';
import { ControlButton } from './control-button.js';
import { OptionGroup } from './option-group.js';
import { SeatTile } from './seat-tile.js';
import { TabRail } from './tab-rail.js';
import { TextField } from './form-fields.js';
import { FOCUS_RING } from '../lib/focus.js';

/**
 * T-NFR-11b: every control is reached with Tab, in reading order, and shows
 * the same visible focus ring (05, Accessibility).
 */

describe('T-NFR-11b keyboard use across the kit', () => {
  function Screen() {
    return (
      <>
        <TabRail
          label="Sections"
          tabs={[
            { value: 'seats', label: 'Seats' },
            { value: 'groups', label: 'Groups' },
          ]}
          value="seats"
          onValueChange={() => {}}
        />
        <ControlButton label="Broadcast" running={false} onToggle={() => {}} />
        <SeatTile seatCode="A1" studentName="Ayesha Khan" state="online" onSelect={() => {}} />
        <TextField label="Message" />
        <OptionGroup
          label="Pick one"
          options={[
            { value: 'a', text: 'yes' },
            { value: 'b', text: 'no' },
          ]}
          value={undefined}
          onValueChange={() => {}}
        />
        <Button variant="primary">Send</Button>
      </>
    );
  }

  it('reaches each control in turn with Tab', async () => {
    const user = userEvent.setup();
    render(<Screen />);

    const order = [
      screen.getByRole('tab', { name: 'Seats' }),
      screen.getByRole('button', { name: 'Broadcast' }),
      screen.getByRole('button', { name: /^A1/ }),
      screen.getByRole('textbox', { name: 'Message' }),
      screen.getByRole('radio', { name: /yes/ }),
      screen.getByRole('button', { name: 'Send' }),
    ];

    for (const element of order) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });

  it('draws the same focus ring on every one of them', () => {
    render(<Screen />);

    const focusable = [
      screen.getByRole('tab', { name: 'Seats' }),
      screen.getByRole('button', { name: 'Broadcast' }),
      screen.getByRole('button', { name: /^A1/ }),
      screen.getByRole('textbox', { name: 'Message' }),
      screen.getByRole('radio', { name: /yes/ }),
      screen.getByRole('button', { name: 'Send' }),
    ];

    for (const element of focusable) {
      expect(element).toHaveClass(...FOCUS_RING.split(' '));
    }
  });
});
