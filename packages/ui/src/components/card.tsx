import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The small upper-case heading of the prototype's cards; it also names the region. */
  title?: ReactNode;
  children: ReactNode;
}

/** A white panel (radius 12, padding 16) that groups one thing on a screen. */
export function Card({ title, children, className, ...props }: CardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title === undefined ? undefined : headingId}
      className={cn(
        'flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 text-ink',
        className,
      )}
      {...props}
    >
      {title !== undefined && (
        <h2
          id={headingId}
          className="text-[13px] font-semibold tracking-[.06em] text-ink-muted uppercase"
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
