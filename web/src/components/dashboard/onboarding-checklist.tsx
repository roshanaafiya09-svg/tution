'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookMarked,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, TutorSubject, AvailabilityRule, TutorProfile, Enrollment } from '@/lib/types';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';

const DISMISS_KEY = 'scholar:onboarding-dismissed';

interface ChecklistItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  done: boolean;
}

/** "Set up your teaching profile" progress checklist, shown on Today for
 *  tutors who haven't finished onboarding. Fetches its own data so it can be
 *  dropped onto the page without bloating the Today page's own state. */
export function OnboardingChecklist({ batches }: { batches: Batch[] }) {
  const [subjects, setSubjects] = useState<TutorSubject[] | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [firstBatchStudentCount, setFirstBatchStudentCount] = useState(0);
  const [studentsChecked, setStudentsChecked] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    void api.get<TutorSubject[]>('/tutor-subjects/me').then(setSubjects);
    void api.get<AvailabilityRule[]>('/availability/me').then(setRules);
    void api
      .get<TutorProfile | null>('/profiles/tutor/me')
      .then(setProfile)
      .finally(() => setProfileLoaded(true));
  }, []);

  useEffect(() => {
    if (batches.length === 0) {
      setStudentsChecked(true);
      return;
    }
    void api
      .get<Enrollment[]>(`/batches/${batches[0].id}/students`)
      .then((rows) => setFirstBatchStudentCount(rows.filter((r) => r.status === 'active').length))
      .finally(() => setStudentsChecked(true));
  }, [batches]);

  const loaded = subjects !== null && rules !== null && profileLoaded && studentsChecked;
  if (!loaded || dismissed) return null;

  const items: ChecklistItem[] = [
    {
      key: 'subject',
      label: 'Add your first subject',
      href: '/dashboard/subjects',
      icon: BookMarked,
      done: (subjects?.length ?? 0) > 0,
    },
    {
      key: 'availability',
      label: 'Set your availability',
      href: '/dashboard/availability',
      icon: CalendarClock,
      done: (rules?.length ?? 0) > 0,
    },
    {
      key: 'batch',
      label: 'Create your first batch',
      href: '/dashboard/batches',
      icon: Layers,
      done: batches.length > 0,
    },
    {
      key: 'invite',
      label: 'Invite students',
      href: batches[0] ? `/dashboard/batches/${batches[0].id}` : '/dashboard/batches',
      icon: Users,
      done: firstBatchStudentCount > 0,
    },
    {
      key: 'verification',
      label: 'Complete verification',
      href: '/dashboard/verification',
      icon: ShieldCheck,
      done: profile?.verification_status === 'verified',
    },
  ];

  const completedCount = items.filter((item) => item.done).length;
  if (completedCount === items.length) return null;

  function dismiss() {
    if (typeof window !== 'undefined') window.localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <Card className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Set up your teaching profile
          </p>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {completedCount} of {items.length} completed
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-base dark:bg-brand-400"
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      {!collapsed && (
        <ul className="mt-4 space-y-0.5">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    item.done
                      ? 'border-success bg-success-bg text-success dark:border-success-dark/40 dark:bg-success/15 dark:text-success-dark'
                      : 'border-neutral-300 text-neutral-300 dark:border-neutral-700 dark:text-neutral-600',
                  )}
                >
                  {item.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <item.icon className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    item.done
                      ? 'text-neutral-400 line-through dark:text-neutral-600'
                      : 'font-medium text-neutral-700 dark:text-neutral-200',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
