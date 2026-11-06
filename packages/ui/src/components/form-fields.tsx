import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
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
  /**
   * Keeps the label for screen readers but out of view, where the screen
   * already says what the field is for (the search box and filter on A-02).
   */
  hideLabel?: boolean;
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
  hideLabel = false,
  children,
}: FieldText & { id: string; hintId?: string; errorId?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cn('text-[13px] font-semibold text-ink', hideLabel && 'sr-only')}
      >
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
  { label, hint, error, hideLabel, className, ...props },
  ref,
) {
  const field = useField({ label, hint, error });
  return (
    <FieldFrame {...field} label={label} hint={hint} error={error} hideLabel={hideLabel}>
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

export type SelectFieldProps = FieldText & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>;

/** A labelled native select: the browser's own list works with the keyboard and screen readers. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, hideLabel, className, children, ...props },
  ref,
) {
  const field = useField({ label, hint, error });
  return (
    <FieldFrame {...field} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <select
        ref={ref}
        id={field.id}
        className={cn(CONTROL, 'min-h-10', controlBorder(error), className)}
        {...field.aria}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
});

export interface CheckboxChoice {
  value: string;
  label: string;
}

export interface CheckboxGroupProps {
  legend: string;
  options: readonly CheckboxChoice[];
  /** The values ticked now. */
  value: readonly string[];
  /** The values ticked after the change, in the order of the options. */
  onChange: (value: string[]) => void;
  error?: string;
}

/** Several choices under one legend, such as a class's days (A-04). */
export function CheckboxGroup({ legend, options, value, onChange, error }: CheckboxGroupProps) {
  const id = useId();
  const errorId = error === undefined ? undefined : `${id}-error`;
  const ticked = new Set(value);

  function toggle(choice: string): void {
    const next = new Set(ticked);
    if (next.has(choice)) {
      next.delete(choice);
    } else {
      next.add(choice);
    }
    onChange(options.map((option) => option.value).filter((option) => next.has(option)));
  }

  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={errorId}>
      <legend className="mb-1.5 text-[13px] font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-x-4">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink"
          >
            <input
              type="checkbox"
              className={cn('size-4 accent-primary', FOCUS_RING)}
              checked={ticked.has(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error !== undefined && (
        <p id={errorId} className="text-[13px] font-semibold text-live">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export type TextAreaFieldProps = FieldText &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, hint, error, hideLabel, className, ...props }, ref) {
    const field = useField({ label, hint, error });
    return (
      <FieldFrame {...field} label={label} hint={hint} error={error} hideLabel={hideLabel}>
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
