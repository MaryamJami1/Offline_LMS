import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

/**
 * Button: default, primary, danger; small, normal, and large for primary
 * controls. Even small stays 40 px tall, the minimum touch target of 05; it
 * only narrows the padding and the text.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-control border font-semibold',
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
    FOCUS_RING,
  ],
  {
    variants: {
      variant: {
        default: 'bg-surface text-ink border-border-strong hover:border-border-hover',
        primary: 'bg-primary text-on-primary border-primary hover:bg-primary-hover',
        danger: 'bg-live text-on-primary border-live hover:bg-live-hover',
      },
      size: {
        small: 'min-h-10 px-2.5 text-[13px]',
        normal: 'min-h-10 px-3.5 text-sm',
        large: 'min-h-11 px-4 text-[15px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'normal' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Dress the one child (a link, say) as a button instead of rendering a button element. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, type, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return <Slot ref={ref} className={classes} {...props} />;
  }
  return <button ref={ref} type={type ?? 'button'} className={classes} {...props} />;
});
