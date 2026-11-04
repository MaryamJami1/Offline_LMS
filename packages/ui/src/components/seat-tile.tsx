import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

/**
 * online has a student logged in; empty is a PC that is on with nobody at it;
 * no-pc is a seat no PC is bound to yet (the admin's seat map, A-07).
 */
export type SeatState = 'online' | 'offline' | 'empty' | 'no-pc';

export interface SeatTileProps {
  seatCode: string;
  /** The PC bound to the seat, shown on the admin's seat map (A-07). */
  hostname?: string;
  /** Only when the viewer may see who sits here (ADM-04). */
  studentName?: string;
  state: SeatState;
  handRaised?: boolean;
  selected?: boolean;
  /** Called on every seat, offline and empty ones too, so the screen can say why nothing happens. */
  onSelect: () => void;
}

const STATE_TEXT: Record<SeatState, { spoken: string; shown: string; dot: string }> = {
  online: { spoken: 'online', shown: 'Online', dot: 'bg-success' },
  offline: { spoken: 'PC offline', shown: 'Offline', dot: 'bg-offline' },
  empty: { spoken: 'empty seat', shown: 'Empty', dot: 'bg-offline' },
  'no-pc': { spoken: 'no PC', shown: 'No PC', dot: 'bg-offline' },
};

function labelText(state: SeatState, handRaised: boolean): string {
  if (handRaised) {
    return 'text-warning-text';
  }
  return state === 'online' ? 'text-success' : 'text-ink-muted';
}

/** One seat of the seat grid (T-02) and of the seat map (A-07). */
export function SeatTile({
  seatCode,
  hostname,
  studentName,
  state,
  handRaised = false,
  selected = false,
  onSelect,
}: SeatTileProps) {
  const text = STATE_TEXT[state];
  const spoken = [
    seatCode,
    hostname === undefined ? undefined : `PC ${hostname}`,
    state === 'online' ? studentName : undefined,
    text.spoken,
    handRaised ? 'hand raised' : undefined,
  ]
    .filter((part) => part !== undefined && part !== '')
    .join(', ');

  return (
    <button
      type="button"
      aria-label={spoken}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'relative flex h-[102px] w-[108px] cursor-pointer flex-col items-start gap-1 rounded-control border px-2.5 py-2 text-left',
        FOCUS_RING,
        state === 'online' && 'border-border bg-surface text-ink hover:border-border-hover',
        state === 'empty' && 'border-border bg-empty text-ink-muted',
        state === 'offline' && 'border-dashed border-border bg-muted text-ink-muted',
        state === 'no-pc' && 'border-dashed border-border bg-empty text-ink-muted',
        handRaised && 'border-warning inset-ring inset-ring-warning',
        selected && 'border-primary bg-selected inset-ring inset-ring-primary',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-2.5 right-2.5 size-2 rounded-full',
          handRaised ? 'bg-warning' : text.dot,
        )}
      />
      <span className="font-mono text-[13px] font-semibold">{seatCode}</span>
      {hostname !== undefined && (
        <span className="font-mono text-[13px] leading-tight text-ink-muted">{hostname}</span>
      )}
      {state === 'online' && studentName !== undefined && (
        <span className="text-[13px] leading-tight text-ink">{studentName}</span>
      )}
      <span className={cn('mt-auto text-[13px] font-semibold', labelText(state, handRaised))}>
        {handRaised ? 'Hand raised' : text.shown}
      </span>
    </button>
  );
}
