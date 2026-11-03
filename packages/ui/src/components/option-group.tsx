import * as RadioGroup from '@radix-ui/react-radio-group';
import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

export interface Option {
  value: string;
  text: string;
}

/** How an option was marked: the right answer, or the wrong one the student chose. */
export type OptionMark = 'right' | 'wrong';

export interface OptionGroupProps {
  /** The question; it names the group. */
  label: string;
  options: Option[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  /** After marking: which options to show as right and wrong. */
  marks?: Record<string, OptionMark>;
  /** Once answered and marked, the choice cannot change. */
  disabled?: boolean;
}

const LETTERS = 'ABCDEFGHIJ';

const MARK_TEXT: Record<OptionMark, string> = { right: 'Correct', wrong: 'Wrong' };

const MARK_CLASS: Record<OptionMark, string> = {
  right: 'border-success bg-success-tint inset-ring inset-ring-success',
  wrong: 'border-live bg-live-tint inset-ring inset-ring-live',
};

/**
 * The answers of a multiple-choice question, lettered A, B, C (S-03, S-04,
 * S-08 quiz). A radio group: Tab reaches it, the arrow keys move and choose.
 */
export function OptionGroup({
  label,
  options,
  value,
  onValueChange,
  marks = {},
  disabled = false,
}: OptionGroupProps) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value ?? ''}
      onValueChange={onValueChange}
      disabled={disabled}
      className="flex flex-col gap-2"
    >
      {options.map((option, index) => {
        const mark = marks[option.value];
        const letter = LETTERS[index] ?? '';
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            aria-label={[`${letter} ${option.text}`, mark && MARK_TEXT[mark]]
              .filter(Boolean)
              .join(', ')}
            className={cn(
              'flex min-h-[46px] w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-3.5 py-2.5 text-left text-[15px] text-ink',
              'hover:border-border-hover disabled:cursor-default',
              'data-[state=checked]:border-primary data-[state=checked]:bg-selected data-[state=checked]:inset-ring data-[state=checked]:inset-ring-primary',
              FOCUS_RING,
              mark !== undefined && MARK_CLASS[mark],
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-7 flex-none items-center justify-center rounded-full border border-border-strong font-mono text-[13px] font-semibold"
            >
              {letter}
            </span>
            <span>{option.text}</span>
            {mark !== undefined && (
              <span className="ml-auto text-[13px] font-semibold">{MARK_TEXT[mark]}</span>
            )}
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
