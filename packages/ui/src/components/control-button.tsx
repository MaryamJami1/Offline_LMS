import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

export interface ControlButtonProps {
  label: string;
  icon?: ReactNode;
  /** The control is live now; pressing again stops it. */
  running: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * One of the teacher console's controls (Broadcast, Lock, Quiz and the rest).
 * A toggle: aria-pressed tells a screen reader it is running, and a "Live"
 * label tells everyone else, so the state is never colour alone.
 */
export function ControlButton({ label, icon, running, onToggle, disabled }: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={running}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex min-h-11 w-full items-center justify-start gap-2 rounded-control border px-3.5 text-sm font-semibold',
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
        FOCUS_RING,
        running
          ? 'border-primary bg-primary-tint text-primary inset-ring inset-ring-primary'
          : 'border-border-strong bg-surface text-ink hover:border-border-hover',
      )}
    >
      {icon !== undefined && (
        <span aria-hidden="true" className="flex flex-none">
          {icon}
        </span>
      )}
      <span>{label}</span>
      {running && (
        <span className="ml-auto rounded-full bg-live-tint px-2 py-0.5 text-[13px] font-semibold text-live">
          Live
        </span>
      )}
    </button>
  );
}
