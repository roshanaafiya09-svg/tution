import type { Metadata } from 'next';
import Link from 'next/link';
import { Smartphone } from 'lucide-react';
import { Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Get the app — Scholar',
};

export default function GetTheAppPage() {
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
        </div>

        <Card className="p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <Smartphone className="h-6 w-6" aria-hidden />
          </div>

          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            You&apos;re signed in — nice.
          </p>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Scholar for students is a mobile app. Batches, homework, quizzes, and the doubt
            solver all live there — download it to keep going.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <div className="flex h-10 items-center justify-center rounded-md border border-neutral-300 text-sm font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Download on the App Store
            </div>
            <div className="flex h-10 items-center justify-center rounded-md border border-neutral-300 text-sm font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Get it on Google Play
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
