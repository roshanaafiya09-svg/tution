import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in — Scholar',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="font-display text-2xl font-semibold italic text-brand-800">
            Scholar
          </Link>
          <p className="mt-2 text-sm text-neutral-500">Sign in to run your classes</p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-neutral-400">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
