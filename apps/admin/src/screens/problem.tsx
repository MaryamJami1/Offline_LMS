import type { ReactNode } from 'react';

/** A failure the whole screen depends on, read out as soon as it appears. */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-live-tint px-3 py-2 text-sm text-live">
      {children}
    </p>
  );
}
