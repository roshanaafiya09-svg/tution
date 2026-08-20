'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  ClipboardCheck,
  Download,
  FileText,
  Layers,
  MessagesSquare,
  Phone,
  Wallet,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { feeStatusOf, loadRoster, studentLabel, type RosterStudent } from '@/lib/teacher-roster';
import type { Material, Session, ThreadSummary } from '@/lib/types';
import {
  Button,
  buttonVariants,
  CardSkeleton,
  ErrorState,
  StatusBadge,
  useToast,
} from '@/components/ui';
import {
  TeacherPageHeader,
  AcademicCard,
  MetricCard,
  TabNav,
  TeacherEmptyState,
  type TabItem,
} from '@/components/dashboard';

type Tab = 'overview' | 'attendance' | 'fees' | 'classes' | 'materials' | 'messages';

function formatDateTime(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const toast = useToast();
  const [student, setStudent] = useState<RosterStudent | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    setStudent(undefined);
    Promise.all([loadRoster(), api.get<Session[]>('/sessions/me'), api.get<ThreadSummary[]>('/messages/mine')])
      .then(async ([roster, sessionRows, threadRows]) => {
        const match = roster.students.find((s) => s.studentId === studentId) ?? null;
        setStudent(match);
        setSessions(sessionRows);
        setThreads(threadRows.filter((t) => t.student_id === studentId));
        if (match) {
          const perBatch = await Promise.all(
            match.batches.map((batch) =>
              api.get<Material[]>(`/materials/batch/${batch.id}`).catch(() => [] as Material[]),
            ),
          );
          setMaterials(perBatch.flat());
        } else {
          setMaterials([]);
        }
      })
      .catch(() => setLoadError(true));
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaid(feeId: string, expectedMinor: number) {
    setRecordingId(feeId);
    try {
      await api.post(`/fees/${feeId}/record-payment`, { paidMinor: expectedMinor });
      load();
      toast({ title: 'Marked as paid', variant: 'success' });
    } catch {
      toast({ title: 'Could not record this payment', variant: 'error' });
    } finally {
      setRecordingId(null);
    }
  }

  const batchIds = useMemo(() => new Set(student?.batches.map((b) => b.id) ?? []), [student]);
  const upcoming = sessions.filter((s) => batchIds.has(s.batch_id) && s.status === 'scheduled');
  const batchTitles = new Map((student?.batches ?? []).map((b) => [b.id, b.title]));

  if (loadError) {
    return (
      <ErrorState description="Could not load this student. Check your connection and try again." onRetry={load} />
    );
  }

  if (student === undefined) {
    return (
      <div className="space-y-5">
        <CardSkeleton className="h-32 rounded-2xl" />
        <CardSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (student === null) {
    return (
      <div className="space-y-6">
        <TeacherPageHeader
          eyebrow="Student"
          title="Student not found"
          description="This student isn't enrolled in any of your batches."
          back={{ href: '/dashboard/students', label: 'All students' }}
        />
      </div>
    );
  }

  const feeStatus = feeStatusOf(student);
  const tabs: TabItem<Tab>[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'attendance', label: 'Attendance', count: student.attendance.total },
    { id: 'fees', label: 'Fees', count: student.fees.entries.length },
    { id: 'classes', label: 'Classes', count: upcoming.length },
    { id: 'materials', label: 'Materials', count: materials?.length },
    { id: 'messages', label: 'Messages', count: threads.length },
  ];

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Student"
        title={studentLabel(student)}
        description={`Joined ${formatDate(student.joinedAt)} · ${student.batches.length} batch${
          student.batches.length === 1 ? '' : 'es'
        }`}
        back={{ href: '/dashboard/students', label: 'All students' }}
        action={
          threads.length > 0 ? (
            <Link
              href={`/dashboard/messages/${threads[0].batch_id}/${student.studentId}`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
              Message
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={student.status} />
        <span className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {student.phoneE164}
        </span>
        {student.batches.map((batch) => (
          <Link
            key={batch.id}
            href={`/dashboard/batches/${batch.id}`}
            className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
          >
            <Layers className="h-3 w-3" aria-hidden />
            {batch.title}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ClipboardCheck}
          label="Attendance"
          value={student.attendance.rate === null ? '—' : `${student.attendance.rate}%`}
          hint={
            student.attendance.total === 0
              ? 'No classes marked yet'
              : `${student.attendance.present + student.attendance.late}/${student.attendance.total} classes`
          }
          tone={
            student.attendance.rate === null ? 'neutral' : student.attendance.rate >= 80 ? 'success' : 'warning'
          }
        />
        <MetricCard
          icon={Wallet}
          label="Fees outstanding"
          value={formatMinor(student.fees.outstandingMinor, student.fees.currency)}
          hint={feeStatus === 'none' ? 'No fees generated this month' : `This month · ${feeStatus}`}
          tone={student.fees.outstandingMinor > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          icon={CalendarDays}
          label="Upcoming classes"
          value={upcoming.length}
          hint={upcoming.length > 0 ? formatDateTime(upcoming[0].scheduled_start_utc, upcoming[0].timezone) : 'Next 14 days'}
        />
        <MetricCard
          icon={Layers}
          label="Batches"
          value={student.batches.length}
          hint={student.batches.map((b) => b.title).join(', ')}
        />
      </div>

      <TabNav tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AcademicCard>
            <p className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">Recent attendance</p>
            {student.attendanceHistory.length === 0 ? (
              <TeacherEmptyState
                icon={ClipboardCheck}
                title="No attendance marked yet"
                description="Mark attendance from a class to start building this record."
              />
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {student.attendanceHistory.slice(0, 5).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-700 dark:text-neutral-300">{row.batch_title}</p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        {formatDate(row.scheduled_start_utc)}
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                  </li>
                ))}
              </ul>
            )}
          </AcademicCard>

          <AcademicCard>
            <p className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">This month&apos;s fees</p>
            {student.fees.entries.length === 0 ? (
              <TeacherEmptyState
                icon={Wallet}
                title="No fee record this month"
                description="Generate this month's fees from the Fees page to track payment."
                action={
                  <Link href="/dashboard/fees" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Fees
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {student.fees.entries.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-700 dark:text-neutral-300">{entry.batch_title}</p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        {formatMinor(entry.expected_minor, entry.currency)} · {entry.period_label}
                      </p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </li>
                ))}
                {student.fees.entries.length > 5 && (
                  <li className="pt-2.5">
                    <button
                      type="button"
                      onClick={() => setTab('fees')}
                      className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      See all {student.fees.entries.length} fee records
                    </button>
                  </li>
                )}
              </ul>
            )}
          </AcademicCard>

          <AcademicCard className="lg:col-span-2">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Elsewhere in Scholar</p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Quiz attempts, homework submissions, and announcements are tracked per batch rather than per student —
              open the batch to review this student&apos;s work there.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {student.batches.map((batch) => (
                <Link
                  key={batch.id}
                  href={`/dashboard/batches/${batch.id}?tab=homework`}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  {batch.title}
                </Link>
              ))}
            </div>
          </AcademicCard>
        </div>
      )}

      {tab === 'attendance' && (
        <AcademicCard className="p-0">
          {student.attendanceHistory.length === 0 ? (
            <div className="p-5">
              <TeacherEmptyState
                icon={ClipboardCheck}
                title="No attendance marked yet"
                description="Every class you mark attendance for will be listed here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {student.attendanceHistory.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {row.batch_title}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {formatDateTime(row.scheduled_start_utc)} · marked{' '}
                      {row.method === 'join_tap' ? 'by join' : 'manually'}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </li>
              ))}
            </ul>
          )}
        </AcademicCard>
      )}

      {tab === 'fees' && (
        <AcademicCard className="p-0">
          {student.fees.entries.length === 0 ? (
            <div className="p-5">
              <TeacherEmptyState
                icon={Wallet}
                title="No fee records this month"
                description="Fee records appear once you generate them for the batch."
                action={
                  <Link href="/dashboard/fees" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Generate fees
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {student.fees.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {entry.batch_title}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {entry.period_label} · {formatMinor(entry.expected_minor, entry.currency)}
                      {entry.paid_at ? ` · paid ${formatDate(entry.paid_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={entry.status} />
                    {(entry.status === 'due' || entry.status === 'partial') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void markPaid(entry.id, entry.expected_minor)}
                        disabled={recordingId === entry.id}
                        loading={recordingId === entry.id}
                      >
                        Mark paid
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AcademicCard>
      )}

      {tab === 'classes' && (
        <AcademicCard className="p-0">
          {upcoming.length === 0 ? (
            <div className="p-5">
              <TeacherEmptyState
                icon={CalendarDays}
                title="No upcoming classes"
                description="Scheduled classes for this student's batches in the next 14 days show here."
                action={
                  <Link href="/dashboard/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Open calendar
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {upcoming.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {batchTitles.get(session.batch_id) ?? session.batch_title}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {formatDateTime(session.scheduled_start_utc, session.timezone)} · {session.duration_min} min
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/sessions/${session.id}`}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    View class
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AcademicCard>
      )}

      {tab === 'materials' && (
        <AcademicCard className="p-0">
          {materials === null ? (
            <div className="p-5">
              <CardSkeleton className="h-20" />
            </div>
          ) : materials.length === 0 ? (
            <div className="p-5">
              <TeacherEmptyState
                icon={FileText}
                title="No materials shared yet"
                description="Materials you upload to this student's batches are listed here."
                action={
                  <Link href="/dashboard/materials" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Materials
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {materials.map((material) => (
                <li key={material.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {material.title}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {batchTitles.get(material.batch_id) ?? 'Batch'} · {formatDate(material.created_at)}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/batches/${material.batch_id}?tab=materials`}
                    aria-label={`Open ${material.title}`}
                    className="text-neutral-400 transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AcademicCard>
      )}

      {tab === 'messages' && (
        <AcademicCard className="p-0">
          {threads.length === 0 ? (
            <div className="p-5">
              <TeacherEmptyState
                icon={MessagesSquare}
                title="No conversation yet"
                description="Start a monitored conversation with this student from any of their batches."
                action={
                  student.batches[0] ? (
                    <Link
                      href={`/dashboard/messages/${student.batches[0].id}/${student.studentId}`}
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      Start conversation
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {threads.map((thread) => (
                <li key={`${thread.batch_id}-${thread.student_id}`}>
                  <Link
                    href={`/dashboard/messages/${thread.batch_id}/${thread.student_id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {thread.batch_title}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        {thread.message_count} message{thread.message_count === 1 ? '' : 's'} · last{' '}
                        {formatDate(thread.last_message_at)}
                      </p>
                    </div>
                    <MessagesSquare className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AcademicCard>
      )}
    </div>
  );
}
