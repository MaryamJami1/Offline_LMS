import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

/** A word on its tint; the word carries the meaning, the colour only helps. */
export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-semibold',
  {
    variants: {
      tone: {
        live: 'bg-live-tint text-live',
        info: 'bg-primary-tint text-primary',
        ok: 'bg-success-tint text-success',
        warn: 'bg-warning-tint text-warning-text',
        muted: 'bg-muted text-ink-muted',
      },
    },
    defaultVariants: { tone: 'muted' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
