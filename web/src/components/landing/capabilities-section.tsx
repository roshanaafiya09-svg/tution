import { CalendarClock, ClipboardCheck, FileText, Megaphone } from 'lucide-react';

const CAPABILITIES = [
  {
    title: 'Classes & Batches',
    body: 'Organise classes, batches and schedules without relying on scattered notebooks or messages.',
    icon: CalendarClock,
  },
  {
    title: 'Attendance & Learning',
    body: 'One tap on “Join” records who showed up — nothing to reconcile from memory at month-end.',
    icon: ClipboardCheck,
  },
  {
    title: 'Assignments & Materials',
    body: 'Share materials and homework once; submissions come back the same way, ready to grade.',
    icon: FileText,
  },
  {
    title: 'Communication & Updates',
    body: 'Keep everyone involved in tuition connected — one message reaches the whole batch.',
    icon: Megaphone,
  },
] as const;

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="scroll-mt-24 bg-white dark:bg-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          Everything tuition needs, nothing it doesn&apos;t.
        </h2>
        <p className="mt-3 max-w-xl text-neutral-600 dark:text-neutral-400">
          A few focused tools, built around what actually happens every week — not one crowded
          inbox.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 transition-shadow duration-base hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60"
            >
              <div className="h-1 bg-accent-500" />
              <div className="p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  <c.icon className="h-[18px] w-[18px]" aria-hidden />
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
