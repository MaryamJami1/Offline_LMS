import { useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the dialog. */
  title: string;
  /** Read when the dialog opens. */
  description?: string;
  children?: ReactNode;
  /** The buttons along the bottom. */
  footer?: ReactNode;
}

/**
 * A dialog over the screen. Focus moves in and stays in until it closes;
 * Escape and the Close button close it; focus then returns to the opener.
 */
export function Modal({ open, onOpenChange, title, description, children, footer }: ModalProps) {
  // Radix gives focus back only to its own Trigger; screens open a modal from
  // any button, so remember whatever had focus when it opened.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          // With no description, say so; Radix otherwise points at one that is not there.
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-border bg-surface p-5 text-ink shadow-xl"
        >
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
              {description !== undefined && (
                <Dialog.Description className="text-sm text-ink-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className={cn(
                'ml-auto flex size-10 flex-none cursor-pointer items-center justify-center rounded-control text-ink-muted hover:bg-bg',
                FOCUS_RING,
              )}
            >
              <span aria-hidden="true">×</span>
            </Dialog.Close>
          </div>
          {children}
          {footer !== undefined && <div className="flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
