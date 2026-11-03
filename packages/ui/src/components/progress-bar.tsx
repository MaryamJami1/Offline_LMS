import { clamp } from '../lib/clamp.js';

export interface ProgressBarProps {
  /** What is progressing, for screen readers. */
  label: string;
  value: number;
  max?: number;
  /** Read out instead of the bare number, like "18 of 30 answered". */
  valueText?: string;
}

/** A thin track with a fill in the main colour (module progress, quiz answers). */
export function ProgressBar({ label, value, max = 100, valueText }: ProgressBarProps) {
  const now = clamp(value, 0, max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={valueText}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${(now / max) * 100}%` }} />
    </div>
  );
}
