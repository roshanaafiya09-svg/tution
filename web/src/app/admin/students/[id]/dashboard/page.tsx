'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BookMarked, CalendarClock, Award, ClipboardCheck, CalendarCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { impersonationStore } from '@/lib/impersonation';
import type { ImpersonationTarget } from '@/lib/impersonation';
import type { Me, ProgressSummary, Session, Batch } from '@/lib/types';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import {
  PageHeader,
  PageLoading,
  ErrorState,
  EmptyState,
  StatusBadge,
  StatCard,
  TableContainer,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@/components/ui';

/**
 * Students have no web dashboard of their own (mobile-only, by existing
 * design) — this is a minimal, read-only admin view assembled from the
 * same backend endpoints the mobile app already uses (/progress/me,
 * /sessions/upcoming, /batches/enrolled), reached only via the
 * impersonation token minted for this exact student. Every call below
 * runs with that token, whose `sub` is the student's own id, so each
 * endpoint returns their real data with zero backend changes.
 */
export default function AdminStudentDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = impersonationStore.target;
    if (!current || current.id !== params.id) {
      // Landed here directly (refresh, back/forward nav) without an
      // active impersonation session for this exact student — nothing
      // to show, so send the admin back to pick a student again.
      router.replace('/admin/students');
      return;
    }
    setTarget(current);

    Promise.all([
      api.get<Me>('/auth/me'),
      api.get<ProgressSummary>('/progress/me'),
      api.get<Session[]>('/sessions/upcoming'),
      api.get<Batch[]>('/batches/enrolled'),
    ])
      .then(([, progressRes, sessionsRes, batchesRes]) => {
        setProgress(progressRes);
        setSessions(sessionsRes);
        setBatches(batchesRes);
      })
      .catch(async (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          await impersonationStore.stop();
          router.replace('/admin');
        } else {
          setError("Could not load this student's dashboard.");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!target) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner target={target} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader
          title={target.displayName ?? 'Student dashboard'}
          description={target.email ?? target.phoneE164}
          back={{ href: '/admin/students', label: 'Back to Students' }}
        />

        {error ? (
          <ErrorState description={error} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={CalendarCheck}
                label="Attendance"
                value={
                  progress?.summary.overallAttendanceRate != null
                    ? `${progress.summary.overallAttendanceRate}%`
                    : '—'
                }
              />
              <StatCard
                icon={ClipboardCheck}
                label="Assignments completed"
                value={
                  progress?.summary.overallAssignmentCompletionRate != null
                    ? `${progress.summary.overallAssignmentCompletionRate}%`
                    : '—'
                }
              />
              <StatCard
                icon={Award}
                label="Quiz average"
                value={
                  progress?.summary.overallQuizAverageScorePercent != null
                    ? `${progress.summary.overallQuizAverageScorePercent}%`
                    : '—'
                }
              />
            </div>

            <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              <BookMarked className="h-4 w-4" aria-hidden />
              Enrolled batches
            </h2>
            {batches === null ? (
              <PageLoading />
            ) : batches.length === 0 ? (
              <EmptyState icon={BookMarked} title="No batches" description="Not enrolled in any batch yet." />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <TR>
                      <TH>Batch</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {batches.map((batch) => (
                      <TR key={batch.id}>
                        <TD className="font-medium text-neutral-900 dark:text-neutral-50">{batch.title}</TD>
                        <TD>
                          <StatusBadge status={batch.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}

            <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              <CalendarClock className="h-4 w-4" aria-hidden />
              Upcoming sessions
            </h2>
            {sessions === null ? (
              <PageLoading />
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No upcoming sessions"
                description="Nothing scheduled in the next two weeks."
              />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <TR>
                      <TH>Batch</TH>
                      <TH>When</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {sessions.map((session) => (
                      <TR key={session.id}>
                        <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                          {session.batch_title}
                        </TD>
                        <TD>{new Date(session.scheduled_start_utc).toLocaleString()}</TD>
                        <TD>
                          <StatusBadge status={session.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </main>
    </div>
  );
}
