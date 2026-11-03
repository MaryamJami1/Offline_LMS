import { cn } from '../lib/cn.js';
import { clamp } from '../lib/clamp.js';

const SEGMENTS = 10;

export interface LevelMeterProps {
  /** Whose sound it is, for screen readers ("Talk level", "Mic"). */
  label: string;
  /** From 0, silence, to 1, full. */
  level: number;
}

/**
 * A row of ten segments that light with the sound level (T-03 intercom, the
 * student's recorder). Read out as a meter from 0 to 100.
 */
export function LevelMeter({ label, level }: LevelMeterProps) {
  const percent = Math.round(clamp(level, 0, 1) * 100);
  const lit = Math.ceil((percent / 100) * SEGMENTS);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="flex h-3 items-stretch gap-0.5"
    >
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <span
          key={index}
          data-lit={index < lit}
          className={cn('w-2 rounded-sm', index < lit ? 'bg-success' : 'bg-muted')}
        />
      ))}
    </div>
  );
}
