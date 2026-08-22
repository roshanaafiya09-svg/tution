import { buttonVariants } from '@/components/ui';

const students = [
  { name: 'Aditi R.', mon: true, tue: true, wed: true, thu: false, fri: true, sat: true, fee: 'paid' },
  { name: 'Karthik S.', mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, fee: 'paid' },
  { name: 'Meera V.', mon: true, tue: false, wed: true, thu: true, fri: true, sat: false, fee: 'due' },
  { name: 'Yusuf A.', mon: true, tue: true, wed: false, thu: true, fri: true, sat: true, fee: 'paid' },
  { name: 'Priya N.', mon: false, tue: true, wed: true, thu: true, fri: false, sat: true, fee: 'due' },
] as const;

const days = ['M', 'T', 'W', 'T', 'F', 'S'] as const;

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-brand-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div className="motion-safe:animate-fade-up">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.14em] text-accent-400">
            Chennai &amp; Tamil Nadu &middot; built for tutors
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.1] text-neutral-50 sm:text-5xl lg:text-[3.4rem]">
            Your batches, your students, your fees —{' '}
            <em className="font-normal italic text-accent-400">off WhatsApp</em> and out of the
            notebook.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-300">
            Scholar is where tutors run batches, mark attendance, share materials, and track
            who&apos;s paid — so none of it lives in a group chat anymore. One place for
            teachers, students, parents, and academies.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#trial" className={buttonVariants({ variant: 'accent', size: 'lg' })}>
              Start your free 90-day trial
            </a>
            <a
              href="#capabilities"
              className="text-sm font-semibold text-neutral-200 underline decoration-neutral-500 underline-offset-4 transition-colors hover:text-neutral-50"
            >
              Explore the platform
            </a>
          </div>
          <p className="mt-5 text-xs text-neutral-400">No card required. Full access for 90 days.</p>
        </div>

        {/* Signature: the ledger card */}
        <div className="motion-safe:animate-fade-up [animation-delay:150ms] lg:justify-self-end">
          <div className="relative w-full max-w-md rotate-[-2deg] rounded-lg border border-neutral-200 bg-neutral-50 p-6 shadow-lg transition-transform duration-300 will-change-transform sm:p-7 motion-safe:hover:rotate-0 motion-safe:hover:-translate-y-1">
            <div
              aria-hidden
              className="absolute -right-4 -top-4 flex h-16 w-16 rotate-[10deg] items-center justify-center rounded-full border-2 border-dashed border-error/70 text-center font-display text-[0.55rem] font-semibold uppercase leading-tight tracking-wide text-error/80"
            >
              Verified
              <br />
              Tutor
            </div>

            <div className="mb-4 flex items-baseline justify-between border-b border-neutral-300 pb-3">
              <div>
                <p className="font-display text-lg font-semibold text-neutral-900">
                  Grade 10 &middot; Physics
                </p>
                <p className="text-xs text-neutral-500">Batch B &middot; 5 students</p>
              </div>
              <span className="rounded bg-success-bg px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-success">
                This week
              </span>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-neutral-400">
                  <th className="pb-2 font-medium">Student</th>
                  {days.map((d, i) => (
                    <th key={i} className="pb-2 text-center font-medium">
                      {d}
                    </th>
                  ))}
                  <th className="pb-2 text-right font-medium">Fee</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {students.map((s) => (
                  <tr key={s.name} className="border-t border-dotted border-neutral-300">
                    <td className="py-1.5 pr-2 font-medium text-neutral-800">{s.name}</td>
                    {[s.mon, s.tue, s.wed, s.thu, s.fri, s.sat].map((present, i) => (
                      <td key={i} className="py-1.5 text-center">
                        <span className={present ? 'text-brand-600' : 'text-neutral-300'}>
                          {present ? '✓' : '–'}
                        </span>
                      </td>
                    ))}
                    <td className="py-1.5 text-right">
                      <span
                        className={
                          s.fee === 'paid' ? 'font-semibold text-success' : 'font-semibold text-warning'
                        }
                      >
                        {s.fee === 'paid' ? 'Paid' : 'Due'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
