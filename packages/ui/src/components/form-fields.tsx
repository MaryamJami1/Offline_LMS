import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

interface FieldText {
  label: string;
  /** Read with the field, under it. */
  hint?: string;
  /** Shown next to the field and read with it; the field is marked invalid. */
  error?: string;
}

const CONTROL = cn(
  'w-full rounded-control border bg-surface px-3 text-sm text-ink',
  'disabled:cursor-not-allowed disabled:opacity-60',
  FOCUS_RING,
);

function controlBorder(error: string | undefined): string {
  return error === undefined ? 'border-border-strong' : 'border-live';
}

/** Ids of the hint and error, and the label around them. */
function useField({ hint, error }: FieldText) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter((part) => part !== undefined).join(' ');
  return {
    id,
    hintId,
    errorId,
    aria: {
      'aria-invalid': error === undefined ? undefined : true,
      'aria-describedby': describedBy === '' ? undefined : describedBy,
    },
  };
}

function FieldFrame({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: FieldText & { id: string; hintId?: string; errorId?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p id={hintId} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-[13px] font-semibold text-live">
          {error}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = FieldText & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

/**
 * A labelled input. Uncontrolled unless given a value, so what was typed stays
 * when the screen re-renders with an error (05, forms keep what was typed).
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, ...props },
  ref,
) {
  const field = useField({ label, hint, error });
  return (
    <FieldFrame {...field} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={field.id}
        className={cn(CONTROL, 'min-h-10', controlBorder(error), className)}
        {...field.aria}
        {...props}
      />
    </FieldFrame>
  );
});

export type TextAreaFieldProps = FieldText &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, hint, error, className, ...props }, ref) {
    const field = useField({ label, hint, error });
    return (
      <FieldFrame {...field} label={label} hint={hint} error={error}>
        <textarea
          ref={ref}
          id={field.id}
          className={cn(CONTROL, 'min-h-24 py-2', controlBorder(error), className)}
          {...field.aria}
          {...props}
        />
      </FieldFrame>
    );
  },
);
