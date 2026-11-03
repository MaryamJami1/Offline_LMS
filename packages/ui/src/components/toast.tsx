import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { cn } from '../lib/cn.js';

/** How long a toast stays, from 05: "bottom centre, 3 seconds". */
export const TOAST_MS = 3000;

export type ToastTone = 'info' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export type ShowToast = (message: string, options?: { tone?: ToastTone }) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * Shows short confirmations of what just happened on the server ("Screens
 * locked for 30 students"). Wrap each app once; call useToast() anywhere.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ShowToast>((message, options) => {
    setToasts((current) => [
      ...current,
      { id: Date.now() + Math.random(), message, tone: options?.tone ?? 'info' },
    ]);
  }, []);

  const remove = (id: number) => setToasts((current) => current.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={show}>
      <Toast.Provider duration={TOAST_MS} label="Notifications">
        {children}
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            // Background toasts are announced politely, after what the user is doing.
            type="background"
            onOpenChange={(open) => {
              if (!open) {
                remove(toast.id);
              }
            }}
            className={cn(
              'rounded-control px-4 py-2.5 text-sm font-semibold text-on-primary shadow-lg',
              toast.tone === 'error' ? 'bg-live' : 'bg-ink',
            )}
          >
            <Toast.Description>
              {toast.tone === 'error' && 'Error: '}
              {toast.message}
            </Toast.Description>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 outline-none" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (show === null) {
    throw new Error('useToast() needs a ToastProvider above it');
  }
  return show;
}
