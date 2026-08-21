import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { AttendanceHistoryEntry, AttendanceSummary } from '@/lib/types';
import { StatusBadge } from '@/components/ui';
import { AcademicCard, AttendanceCalendar, ProgressRing, SectionHeader } from '@/components/student';

export interface HistoryRowWithBatch extends AttendanceHistoryEntry {
  batch_title: string;
}

function ringTone(rate: number): 'success' | 'warning' | 'error' {
  if (rate >= 90) return 'success';
  if (rate >= 75) return 'warning';
  return 'error';
}

/** Overall ring + present/late/absent counts + by-batch breakdown + history
 *  list — shared by the global Attendance page (all batches) and each batch
 *  workspace's Attendance tab (one batch's summary/history already
 *  pre-filtered by the caller). The "By batch" section only renders when
 *  more than one batch is present in the history, so it naturally
 *  disappears in the single-batch workspace view without any extra prop. */
export function AttendanceDetail({ summary, history }: { summary: AttendanceSummary; history: HistoryRowWithBatch[] }) {
  const byBatch = new Map<string, { present: number; total: number }>();
  for (const row of history) {
    const entry = byBatch.get(row.batch_title) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (row.status === 'present' || row.status === 'late') entry.present += 1;
    byBatch.set(row.batch_title, entry);
  }

  return (
    <div className="space-y-8">
      <AcademicCard>
        <div className="flex flex-wrap items-center gap-8">
          <ProgressRing value={summary.rate} tone={summary.rate !== null ? ringTone(summary.rate) : 'brand'}>
            <p className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
              {summary.rate !== null ? `${summary.rate}%` : '—'}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">overall</p>
          </ProgressRing>

          <div className="flex flex-1 flex-wrap gap-6">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-success dark:text-success-dark" aria-hidden />
              <div>
                <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">{summary.present}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Present</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-warning dark:text-warning-dark" aria-hidden />
              <div>
                <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">{summary.late}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Late</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <XCircle className="h-4 w-4 text-error dark:text-error-dark" aria-hidden />
              <div>
                <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">{summary.absent}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Absent</p>
              </div>
            </div>
          </div>
        </div>
      </AcademicCard>

      <AttendanceCalendar history={history} />

      {byBatch.size > 1 && (
        <section>
          <SectionHeader title="By batch" />
          <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {Array.from(byBatch.entries()).map(([title, stat]) => (
              <div key={title} className="flex items-center justify-between gap-3 px-6 py-3.5">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {Math.round((stat.present / stat.total) * 100)}% · {stat.present} of {stat.total}
                </p>
              </div>
            ))}
          </AcademicCard>
        </section>
      )}

      <section>
        <SectionHeader title="History" />
        <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {history.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{row.batch_title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {new Date(row.scheduled_start_utc).toLocaleString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <StatusBadge status={row.status} />
            </div>
          ))}
        </AcademicCard>
      </section>
    </div>
  );
}
