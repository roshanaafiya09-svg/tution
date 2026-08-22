'use client';

import { useState } from 'react';
import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Megaphone,
  Wallet,
  Users,
  BookOpen,
  Home,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/cn';

type PersonaId = 'teacher' | 'student' | 'parent' | 'academy';

const PERSONAS: Record<
  PersonaId,
  {
    tab: string;
    title: string;
    railIcons: typeof CalendarClock[];
    stats: { value: string; label: string }[];
    rows: { primary: string; secondary: string; tone: 'success' | 'warning' | 'neutral' }[];
  }
> = {
  teacher: {
    tab: 'Teacher Dashboard',
    title: 'Today',
    railIcons: [CalendarClock, ClipboardCheck, FileText, Wallet, Megaphone],
    stats: [
      { value: '3', label: 'classes today' },
      { value: '18', label: 'present' },
      { value: '₹4,200', label: 'fees due' },
    ],
    rows: [
      { primary: 'Grade 10 · Physics', secondary: '4:00 PM', tone: 'neutral' },
      { primary: 'Grade 8 · Math', secondary: '5:30 PM', tone: 'neutral' },
      { primary: 'Grade 12 · Chemistry', secondary: '6:45 PM', tone: 'neutral' },
    ],
  },
  student: {
    tab: 'Student Experience',
    title: 'This week',
    railIcons: [BookOpen, ClipboardCheck, FileText, Megaphone],
    stats: [
      { value: '5', label: 'classes' },
      { value: '2', label: 'due' },
      { value: '94%', label: 'attendance' },
    ],
    rows: [
      { primary: 'Physics worksheet', secondary: 'Due Fri', tone: 'warning' },
      { primary: 'Chemistry notes', secondary: 'New material', tone: 'neutral' },
      { primary: 'Math quiz', secondary: 'Submitted', tone: 'success' },
    ],
  },
  parent: {
    tab: 'Parent View',
    title: 'Updates',
    railIcons: [Home, ClipboardCheck, Wallet, Megaphone],
    stats: [
      { value: '3', label: 'updates this week' },
      { value: '96%', label: 'attendance' },
      { value: '1', label: 'fee reminder' },
    ],
    rows: [
      { primary: 'Attended Physics class', secondary: 'Mon, 4:00 PM', tone: 'success' },
      { primary: 'Fee due — ₹1,500', secondary: 'Reminder sent', tone: 'warning' },
      { primary: 'New homework posted', secondary: 'Chemistry', tone: 'neutral' },
    ],
  },
  academy: {
    tab: 'Academy Dashboard',
    title: 'Overview',
    railIcons: [Building2, Users, CalendarClock, Wallet],
    stats: [
      { value: '12', label: 'teachers' },
      { value: '34', label: 'batches' },
      { value: '210', label: 'students' },
    ],
    rows: [
      { primary: 'Priya N.', secondary: '6 batches', tone: 'neutral' },
      { primary: 'Arjun K.', secondary: '4 batches', tone: 'neutral' },
      { primary: 'Fathima S.', secondary: '5 batches', tone: 'neutral' },
    ],
  },
};

const ORDER: PersonaId[] = ['teacher', 'student', 'parent', 'academy'];

const toneClass: Record<'success' | 'warning' | 'neutral', string> = {
  success: 'font-semibold text-success',
  warning: 'font-semibold text-warning',
  neutral: 'text-neutral-500',
};

export function ProductPreviewSection() {
  const [active, setActive] = useState<PersonaId>('teacher');
  const persona = PERSONAS[active];

  return (
    <section className="bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          See it from where you sit.
        </h2>
        <p className="mt-3 max-w-xl text-neutral-600 dark:text-neutral-400">
          The same batches and updates, shown the way each person actually needs them.
        </p>

        <div
          role="tablist"
          aria-label="Dashboard preview by role"
          className="mt-10 flex flex-wrap gap-2"
        >
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active === id}
              onClick={() => setActive(id)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-fast',
                active === id
                  ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500 dark:text-neutral-950'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
              )}
            >
              {PERSONAS[id].tab}
            </button>
          ))}
        </div>

        <div
          key={active}
          className="mt-6 flex overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-md motion-safe:animate-fade-up dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex w-14 shrink-0 flex-col items-center gap-4 bg-brand-950 py-5">
            {persona.railIcons.map((Icon, i) => (
              <div
                key={i}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  i === 0 ? 'bg-accent-500 text-brand-950' : 'text-neutral-500',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </div>
            ))}
          </div>

          <div className="flex-1 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {persona.title}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
              {persona.stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 text-center dark:border-neutral-800 dark:bg-neutral-950/60"
                >
                  <p className="font-display text-xl font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                    {s.value}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] leading-tight text-neutral-500 dark:text-neutral-400">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 divide-y divide-dotted divide-neutral-200 border-t border-dotted border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {persona.rows.map((r) => (
                <div key={r.primary} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-neutral-800 dark:text-neutral-100">{r.primary}</span>
                  <span className={toneClass[r.tone]}>{r.secondary}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
