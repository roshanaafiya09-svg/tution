import { ShieldCheck, MessageCircleMore } from 'lucide-react';

export function TrustSection() {
  return (
    <section className="border-y border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto grid max-w-3xl gap-10 px-6 py-14 sm:grid-cols-2">
        <div>
          <ShieldCheck className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden />
          <h3 className="mt-3 font-semibold text-neutral-900 dark:text-neutral-50">
            Verified before day one
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            Every tutor&apos;s ID and qualifications are checked by hand before a single student
            can join.
          </p>
        </div>
        <div>
          <MessageCircleMore className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden />
          <h3 className="mt-3 font-semibold text-neutral-900 dark:text-neutral-50">
            Sign in with your email
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            A one-time code, no password to forget.
          </p>
        </div>
      </div>
    </section>
  );
}
