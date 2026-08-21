'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, FileText, Megaphone, User } from 'lucide-react';
import { api, apiGetPublic, formatMinor } from '@/lib/api';
import type { AttendanceHistoryEntry, Batch, Material, Announcement, Session, Subject } from '@/lib/types';
import { CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { PageIntro, AcademicCard, NoBatchesEmptyState } from '@/components/student';
import { cn } from '@/lib/cn';

function formatSessionTime(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const SPINE_TONES = ['bg-brand-500', 'bg-accent-500', 'bg-info', 'bg-success', 'bg-warning'] as const;

function spineTone(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return SPINE_TONES[hash % SPINE_TONES.length];
}

export default function StudentBatchesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryEntry[] | null>(null);
  const [materialsCount, setMaterialsCount] = useState<Map<string, number> | null>(null);
  const [announcementsCount, setAnnouncementsCount] = useState<Map<string, number> | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatches(null);
    setSubjects(null);
    setSessions(null);
    setHistory(null);
    setMaterialsCount(null);
    setAnnouncementsCount(null);
    Promise.all([
      api.get<Batch[]>('/batches/enrolled'),
      apiGetPublic<Subject[]>('/catalog/subjects'),
      api.get<Session[]>('/sessions/upcoming'),
      api.get<AttendanceHistoryEntry[]>('/attendance/me/history'),
    ])
      .then(async ([b, s, sess, hist]) => {
        setBatches(b);
        setSubjects(s);
        setSessions(sess);
        setHistory(hist);

        const perBatch = await Promise.all(
          b.map((batch) =>
            Promise.all([
              api.get<Material[]>(`/materials/batch/${batch.id}`).catch(() => [] as Material[]),
              api.get<Announcement[]>(`/announcements/batch/${batch.id}`).catch(() => [] as Announcement[]),
            ]),
          ),
        );
        setMaterialsCount(new Map(b.map((batch, i) => [batch.id, perBatch[i][0].length])));
        setAnnouncementsCount(new Map(b.map((batch, i) => [batch.id, perBatch[i][1].length])));
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading =
    batches === null ||
    subjects === null ||
    sessions === null ||
    history === null ||
    materialsCount === null ||
    announcementsCount === null;

  const now = new Date();

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Your learning spaces" title="My Batches" description="Classes you're enrolled in." />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your batches. Check your connection and try again." onRetry={load} />
      ) : batches.length === 0 ? (
        <NoBatchesEmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((batch) => {
            const subject = subjects.find((s) => s.id === batch.subject_id)?.name_i18n.en;
            const nextSession = sessions
              .filter((s) => s.batch_id === batch.id && s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now)
              .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime())[0];
            const batchHistory = history.filter((h) => h.batch_id === batch.id);
            const present = batchHistory.filter((h) => h.status === 'present' || h.status === 'late').length;
            const attendanceRate =
              batchHistory.length > 0 ? Math.round((present / batchHistory.length) * 100) : null;

            return (
              <Link key={batch.id} href={`/student/batches/${batch.id}`}>
                <AcademicCard interactive className="overflow-hidden p-0">
                  <div className={cn('h-1.5', spineTone(batch.subject_id))} aria-hidden />
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                          {batch.title}
                        </p>
                        {subject && <p className="text-sm text-neutral-500 dark:text-neutral-400">{subject}</p>}
                      </div>
                      <StatusBadge status={batch.status} />
                    </div>

                    {batch.tutor_display_name && (
                      <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                        <User className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                        {batch.tutor_display_name}
                      </p>
                    )}

                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                      <CalendarDays className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                      {nextSession ? `Next: ${formatSessionTime(nextSession)}` : 'No upcoming class'}
                    </p>

                    {attendanceRate !== null && (
                      <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                        Attendance: {attendanceRate}% ({present}/{batchHistory.length})
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                        {materialsCount!.get(batch.id) ?? 0} materials
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                        {announcementsCount!.get(batch.id) ?? 0} announcements
                      </span>
                    </div>

                    <p className="mt-4 border-t border-neutral-100 pt-3.5 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                      {formatMinor(batch.fee_minor, batch.currency)} / {batch.fee_period.replace('_', ' ')}
                    </p>
                  </div>
                </AcademicCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
