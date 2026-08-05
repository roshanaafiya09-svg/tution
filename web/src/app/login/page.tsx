import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in — Scholar',
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.08]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-semibold italic text-brand-800 dark:text-brand-200"
          >
            Scholar
          </Link>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Sign in to run your classes
          </p>
        </div>
        <Suspense
          fallback={
            <p className="text-center text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
