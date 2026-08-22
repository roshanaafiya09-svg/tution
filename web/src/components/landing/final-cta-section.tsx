import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';

export function FinalCtaSection() {
  return (
    <section id="trial" className="scroll-mt-24 bg-brand-950">
      <div className="relative mx-auto max-w-4xl overflow-hidden px-6 py-24 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-accent-500/20 blur-3xl"
        />

        <div className="relative">
          <h2 className="text-balance font-display text-4xl font-semibold text-neutral-50 sm:text-5xl">
            Ready to make tuition simpler?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-300">
            Bring your classes, students, learning and tuition management into one organised
            platform.
          </p>

          <div className="mx-auto mt-12 flex max-w-2xl flex-col divide-y divide-dotted divide-white/15 rounded-xl border border-white/10 bg-white/5 text-center sm:flex-row sm:divide-x sm:divide-y-0">
            <div className="flex-1 px-6 py-5">
              <p className="font-display text-3xl font-semibold tabular-nums text-accent-400">41</p>
              <p className="mt-1 text-sm text-neutral-400">classes run</p>
            </div>
            <div className="flex-1 px-6 py-5">
              <p className="font-display text-3xl font-semibold tabular-nums text-accent-400">380</p>
              <p className="mt-1 text-sm text-neutral-400">attendances marked</p>
            </div>
            <div className="flex-1 px-6 py-5">
              <p className="font-display text-3xl font-semibold tabular-nums text-accent-400">
                &#8377;62,000
              </p>
              <p className="mt-1 text-sm text-neutral-400">in fees tracked</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            An illustrative example of what a 90-day trial recap looks like.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a href="/login" className={buttonVariants({ variant: 'accent', size: 'lg' })}>
              Start Your 90-Day Free Trial →
            </a>
            <a
              href="#capabilities"
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'border-white/20 bg-transparent text-neutral-100 hover:bg-white/10')}
            >
              Explore the Platform
            </a>
          </div>
          <p className="mt-6 text-sm text-neutral-400">
            Free for 90 days. No card, no catch. After your trial, it&apos;s &#8377;499/month for
            up to 25 students.
          </p>
        </div>
      </div>
    </section>
  );
}
