import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeatTile } from './seat-tile.js';

/**
 * NFR-11: Seat tile. It announces the student, the seat and the state (05,
 * Accessibility), and an offline or empty seat still answers a click so the
 * screen can say why nothing happens.
 */

describe('NFR-11 Seat tile', () => {
  it('announces the seat, the student and the state', () => {
    render(<SeatTile seatCode="A1" studentName="Ayesha Khan" state="online" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'A1, Ayesha Khan, online' })).toBeInTheDocument();
  });

  it('adds a raised hand to what it announces and shows', () => {
    render(
      <SeatTile
        seatCode="B4"
        studentName="Bilal Ahmed"
        state="online"
        handRaised
        onSelect={() => {}}
      />,
    );

    const tile = screen.getByRole('button', { name: 'B4, Bilal Ahmed, online, hand raised' });
    expect(tile).toHaveTextContent('Hand raised');
  });

  it('names an empty seat and an offline PC', () => {
    render(
      <>
        <SeatTile seatCode="C2" state="empty" onSelect={() => {}} />
        <SeatTile seatCode="C3" state="offline" onSelect={() => {}} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'C2, empty seat' })).toHaveClass('bg-empty');
    expect(screen.getByRole('button', { name: 'C3, PC offline' })).toHaveClass(
      'bg-muted',
      'border-dashed',
    );
  });

  it('shows the state in words, never by colour alone', () => {
    render(
      <>
        <SeatTile seatCode="A1" studentName="Ayesha Khan" state="online" onSelect={() => {}} />
        <SeatTile seatCode="A2" state="offline" onSelect={() => {}} />
      </>,
    );

    expect(screen.getByRole('button', { name: /^A1/ })).toHaveTextContent('Online');
    expect(screen.getByRole('button', { name: /^A2/ })).toHaveTextContent('Offline');
  });

  it('is selected with a click, Enter or Space, and says when it is selected', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <SeatTile seatCode="A1" studentName="Ayesha Khan" state="online" onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button'));
    await user.keyboard('{Enter} ');
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <SeatTile
        seatCode="A1"
        studentName="Ayesha Khan"
        state="online"
        selected
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button')).toHaveClass('bg-selected', 'border-primary');
  });

  it('still answers on an offline or empty seat, so the screen can explain', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SeatTile seatCode="E6" state="offline" onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('prints the seat code in the mono font', () => {
    render(<SeatTile seatCode="D5" state="empty" onSelect={() => {}} />);

    expect(screen.getByText('D5')).toHaveClass('font-mono');
  });
});
