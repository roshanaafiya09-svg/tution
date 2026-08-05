// Deliberately NOT 'use client' — buttonVariants is a plain string-building
// function (no hooks, no refs) that Server Components need to call directly
// (e.g. styling an <a> the same as <Button>). Keeping it out of button.tsx
// (which is 'use client') matters: Next.js wraps every export of a client
// module as an opaque client-reference when imported by a Server Component,
// so calling it there throws "buttonVariants is not a function".
import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 dark:bg-brand-500 dark:hover:bg-brand-400 dark:active:bg-brand-300 dark:text-neutral-950',
        accent:
          'bg-accent-500 text-brand-950 shadow-xs hover:bg-accent-400 active:bg-accent-600',
        secondary:
          'border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-surface dark:text-neutral-200 dark:hover:bg-neutral-800',
        ghost:
          'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/70',
        danger:
          'border border-error/30 text-error hover:bg-error/5 dark:border-error/40 dark:text-error-dark dark:hover:bg-error/10',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6 text-[0.9rem]',
        icon: 'h-9 w-9 shrink-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
