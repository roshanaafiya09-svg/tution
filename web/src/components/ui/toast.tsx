'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  id: number;
  variant: ToastVariant;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'border-success/25 text-success dark:border-success/30 dark:text-success-dark',
  error: 'border-error/25 text-error dark:border-error/30 dark:text-error-dark',
  info: 'border-info/25 text-info dark:border-info/30 dark:text-info-dark',
  warning: 'border-warning/25 text-warning dark:border-warning/30 dark:text-warning-dark',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, variant: 'info', ...toast }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((t) => {
          const Icon = VARIANT_ICON[t.variant];
          return (
            <ToastPrimitive.Root
              key={t.id}
              onOpenChange={(open) => !open && dismiss(t.id)}
              className={cn(
                'grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border bg-surface-raised p-4 shadow-lg',
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
                VARIANT_CLASS[t.variant],
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <ToastPrimitive.Title className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                className="text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none sm:bottom-4 sm:right-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/** Fire-and-forget toast — e.g. toast({ title: 'Saved', variant: 'success' }). */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used within <ToastProvider>');
  return show;
}
