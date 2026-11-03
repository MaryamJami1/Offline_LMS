import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider, useToast } from './toast.js';

/**
 * NFR-11: Toast. Every action that takes effect on the server says so in a
 * short toast, bottom centre, for 3 seconds (05), read out politely.
 */

let show: ReturnType<typeof useToast> = () => {};

function Catcher() {
  show = useToast();
  return null;
}

function renderToasts() {
  render(
    <ToastProvider>
      <Catcher />
    </ToastProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NFR-11 Toast', () => {
  it('shows a message and reads it out politely', async () => {
    renderToasts();

    act(() => show('Screens locked for 30 students'));

    expect(screen.getByText('Screens locked for 30 students')).toBeVisible();
    // Radix fills its announcement region on the next frame.
    await waitFor(() => {
      const said = screen
        .getAllByRole('status')
        .find((element) => element.textContent?.includes('Screens locked for 30 students'));
      expect(said).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('sits bottom centre', () => {
    renderToasts();

    act(() => show('Saved'));

    const region = screen.getByRole('region', { name: /notifications/i });
    expect(within(region).getByRole('list')).toHaveClass(
      'bottom-6',
      'left-1/2',
      '-translate-x-1/2',
    );
  });

  it('goes after 3 seconds', () => {
    vi.useFakeTimers();
    renderToasts();

    act(() => show('Saved'));
    act(() => vi.advanceTimersByTime(2900));
    expect(screen.queryByText('Saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows an error in the live colour, said in words', () => {
    renderToasts();

    act(() => show('Could not reach the server', { tone: 'error' }));

    const toast = screen.getByText(/Could not reach the server/);
    expect(toast).toHaveTextContent('Error: Could not reach the server');
    expect(toast.closest('li')).toHaveClass('bg-live');
  });

  it('refuses to be used outside its provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Catcher />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
