import { GraduationCap, BookOpen, Home, Building2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const AUDIENCES = [
  {
    id: 'audience-teacher',
    icon: GraduationCap,
    role: 'Teacher',
    hook: 'Teach with less admin.',
    body: 'Organise your batches, students, schedules and learning materials in one place.',
    rotate: '-rotate-1',
    vignette: (
      <div className="space-y-1.5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-400">
          Batch B &middot; Physics
        </p>
        <div className="flex items-center justify-between rounded border border-dotted border-neutral-300 px-2 py-1.5 text-xs">
          <span className="font-medium text-neutral-700">Karthik S.</span>
          <span className="text-brand-600">✓ Present</span>
        </div>
        <div className="flex items-center justify-between rounded border border-dotted border-neutral-300 px-2 py-1.5 text-xs">
          <span className="font-medium text-neutral-700">Meera V.</span>
          <span className="font-semibold text-warning">Fee due</span>
        </div>
      </div>
    ),
  },
  {
    id: 'audience-student',
    icon: BookOpen,
    role: 'Student',
    hook: 'Know what to learn and when.',
    body: 'See your classes, assignments, materials and learning activity, all in one feed.',
    rotate: 'rotate-1',
    vignette: (
      <div className="space-y-1.5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-400">
          This week
        </p>
        <div className="flex items-center justify-between rounded border border-dotted border-neutral-300 px-2 py-1.5 text-xs">
          <span className="font-medium text-neutral-700">Physics worksheet</span>
          <span className="font-semibold text-warning">Due Fri</span>
        </div>
        <div className="flex items-center justify-between rounded border border-dotted border-neutral-300 px-2 py-1.5 text-xs">
          <span className="font-medium text-neutral-700">Math quiz</span>
          <span className="font-semibold text-success">Submitted</span>
        </div>
      </div>
    ),
  },
  {
    id: 'audience-parent',
    icon: Home,
    role: 'Parent',
    hook: "Stay connected to your child's learning.",
    body: 'Get visibility into attendance, fees and updates from your child’s tuition.',
    rotate: '-rotate-1',
    vignette: (
      <div className="space-y-1.5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-400">
          Update
        </p>
        <div className="rounded border border-dotted border-neutral-300 px-2 py-1.5 text-xs text-neutral-700">
          Meera attended today&apos;s Physics class — 4:00 PM
        </div>
        <div className="rounded border border-dotted border-neutral-300 px-2 py-1.5 text-xs text-neutral-700">
          New homework posted &middot; Chemistry
        </div>
      </div>
    ),
  },
  {
    id: 'audience-academy',
    icon: Building2,
    role: 'Academy',
    hook: 'Manage your academy in one place.',
    body: 'Organise your teachers, students, batches and day-to-day operations together.',
    rotate: 'rotate-1',
    vignette: (
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded border border-dotted border-neutral-300 px-1 py-2">
          <p className="font-display text-base font-semibold text-brand-700">12</p>
          <p className="text-[0.6rem] text-neutral-500">teachers</p>
        </div>
        <div className="rounded border border-dotted border-neutral-300 px-1 py-2">
          <p className="font-display text-base font-semibold text-brand-700">34</p>
          <p className="text-[0.6rem] text-neutral-500">batches</p>
        </div>
        <div className="rounded border border-dotted border-neutral-300 px-1 py-2">
          <p className="font-display text-base font-semibold text-brand-700">210</p>
          <p className="text-[0.6rem] text-neutral-500">students</p>
        </div>
      </div>
    ),
  },
] as const;

export function AudiencesSection() {
  return (
    <section className="bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          One platform, four experiences.
        </h2>
        <p className="mt-3 max-w-xl text-neutral-600 dark:text-neutral-400">
          Everyone involved in tuition gets a view built for them — connected to the same
          batches, attendance and updates underneath.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <div
              key={a.id}
              id={a.id}
              className="scroll-mt-24 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs transition-shadow duration-base hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <a.icon className="h-[18px] w-[18px]" aria-hidden />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-400">
                {a.role}
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                {a.hook}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {a.body}
              </p>

              <div
                className={cn(
                  'mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 shadow-xs',
                  a.rotate,
                )}
              >
                {a.vignette}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
