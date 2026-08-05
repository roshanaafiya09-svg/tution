import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-error dark:text-error-dark">{error}</span>
      ) : (
        hint && <span className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</span>
      )}
    </label>
  );
}

/** Legacy raw className string — kept for existing `<input className={inputClass}>`
 * call sites that predate the <Input> component below. Both stay visually identical. */
export const inputClass =
  'h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-xs transition-colors duration-fast placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 focus:outline-none focus-visible:shadow-focus-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-surface dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:hover:border-neutral-600';

const errorRingClass = 'border-error/50 focus:border-error dark:border-error/50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(inputClass, error && errorRingClass, className)}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(inputClass, 'h-auto min-h-[6rem] resize-y py-2', error && errorRingClass, className)}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(inputClass, 'appearance-none bg-[url(\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22none%22%3E%3Cpath d=%22M5 7.5L10 12.5L15 7.5%22 stroke=%22%23847B69%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E\')] bg-[right_0.6rem_center] bg-no-repeat pr-9', error && errorRingClass, className)}
      {...props}
    >
      {children}
    </select>
  );
});
