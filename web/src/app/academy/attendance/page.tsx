'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, CheckCircle2, ClipboardList, Search, Users, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AcademyActiveTeacher,
  AcademyAttendanceRow,
  AcademyAttendanceTodaySummary,
  AcademyManagedBatch,
  AcademyManagedEnrollment,
  AcademyStudentAttendance,
} from '@/lib/types';
import { cancellationReasonLabel } from '@/lib/session-labels';
import { CardSkeleton, Dialog, DialogContent, EmptyState, ErrorState, Input, Select, StatCard, StatusBadge } from '@/components/ui';
import { AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AcademyAttendancePage() {
  const { hasAcademy } = useAcademyDashboard();
  const [summary, setSummary] = useState<AcademyAttendanceTodaySummary | null>(null);
  const [rows, setRows] = useState<AcademyAttendanceRow[] | null>(null);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [loadError, setLoadError] = useState(false);

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(isoDate(weekAgo));
  const [to, setTo] = useState(isoDate(today));
  const [batchId, setBatchId] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [status, setStatus] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>('');
  const [studentDetail, setStudentDetail] = useState<AcademyStudentAttendance | null>(null);

  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<AcademyManagedEnrollment[]>([]);
  const studentSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTable = useCallback(
    async (filters: { from: string; to: string; batchId: string; tutorId: string; status: string }) => {
      if (hasAcademy === false) {
        setRows([]);
        return;
      }
      setLoadError(false);
      try {
        const params = new URLSearchParams();
        if (filters.from) params.set('from', new Date(filters.from).toISOString());
        if (filters.to) params.set('to', new Date(new Date(filters.to).getTime() + 24 * 60 * 60 * 1000).toISOString());
        if (filters.batchId) params.set('batchId', filters.batchId);
        if (filters.tutorId) params.set('tutorId', filters.tutorId);
        if (filters.status) params.set('status', filters.status);
        setRows(await api.get<AcademyAttendanceRow[]>(`/academy/me/attendance?${params.toString()}`));
      } catch {
        setLoadError(true);
      }
    },
    [hasAcademy],
  );

  useEffect(() => {
    if (hasAcademy === false) {
      setSummary({
        classesToday: 0,
        classesCompleted: 0,
        studentsExpected: 0,
        present: 0,
        absent: 0,
        attendancePercent: null,
        teachersToday: [],
      });
      return;
    }
    Promise.all([
      api.get<AcademyAttendanceTodaySummary>('/academy/me/attendance/today').catch(() => null),
      api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
      api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
    ]).then(([s, t, b]) => {
      setSummary(s);
      setTeachers(t);
      setBatches(b);
    });
  }, [hasAcademy]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadTable({ from, to, batchId, tutorId, status });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, batchId, tutorId, status, hasAcademy]);

  useEffect(() => {
    if (studentSearchDebounce.current) clearTimeout(studentSearchDebounce.current);
    if (!studentQuery.trim()) {
      setStudentResults([]);
      return;
    }
    studentSearchDebounce.current = setTimeout(() => {
      void api
        .get<AcademyManagedEnrollment[]>(`/academy/me/students?q=${encodeURIComponent(studentQuery)}&status=all`)
        .then(setStudentResults)
        .catch(() => setStudentResults([]));
    }, 250);
    return () => {
      if (studentSearchDebounce.current) clearTimeout(studentSearchDebounce.current);
    };
  }, [studentQuery]);

  async function openStudent(studentIdToOpen: string, name: string) {
    setStudentId(studentIdToOpen);
    setStudentName(name);
    setStudentDetail(null);
    try {
      setStudentDetail(await api.get<AcademyStudentAttendance>(`/academy/me/attendance/student/${studentIdToOpen}`));
    } catch {
      setStudentDetail(null);
    }
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Attendance"
        description="Monitor attendance across every batch in your academy."
      />

      <div className="mt-8">
        {!summary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard icon={CalendarCheck} label="Today's classes" value={summary.classesToday} />
            <StatCard icon={Users} label="Students expected" value={summary.studentsExpected} />
            <StatCard icon={CheckCircle2} label="Present" value={summary.present} />
            <StatCard icon={XCircle} label="Absent" value={summary.absent} />
            <StatCard
              icon={ClipboardList}
              label="Attendance %"
              value={summary.attendancePercent == null ? '—' : `${summary.attendancePercent}%`}
            />
          </div>
        )}
      </div>

      <div className="relative mt-8 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <Input
          value={studentQuery}
          onChange={(e) => setStudentQuery(e.target.value)}
          placeholder="Find a student's attendance"
          className="pl-9"
        />
        {studentResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md dark:border-neutral-800 dark:bg-surface-raised">
            {studentResults.slice(0, 6).map((s) => (
              <button
                key={s.studentId}
                type="button"
                onClick={() => {
                  void openStudent(s.studentId, s.displayName ?? s.phoneE164);
                  setStudentQuery('');
                  setStudentResults([]);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span>{s.displayName ?? s.phoneE164}</span>
                <span className="text-xs text-neutral-400">{s.batchTitle}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </Select>
        <Select value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
          <option value="">All teachers</option>
          {teachers.map((t) => (
            <option key={t.tutorId} value={t.tutorId}>
              {t.displayName ?? 'Teacher'}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="scheduled">Scheduled</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <div className="mt-4">
        {loadError ? (
          <ErrorState description="Could not load attendance records. Check your connection and try again." onRetry={() => void loadTable({ from, to, batchId, tutorId, status })} />
        ) : rows === null ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No attendance records yet"
            description="Attendance will appear here after your first completed class."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Batch</th>
                  <th className="px-4 py-2.5">Teacher</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Present</th>
                  <th className="px-4 py-2.5">Absent</th>
                  <th className="px-4 py-2.5">%</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {rows.map((r) => (
                  <tr key={r.sessionId} className="bg-white dark:bg-surface">
                    <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                      {new Date(r.scheduledStartUtc).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/academy/batches/${r.batchId}`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                        {r.batchTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.tutorDisplayName ?? 'Teacher'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.totalStudents}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.present}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.absent}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.attendancePercent == null ? '—' : `${r.attendancePercent}%`}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.status === 'cancelled' ? (cancellationReasonLabel(r)?.toLowerCase() ?? 'cancelled') : r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={studentId !== null} onOpenChange={(open) => !open && setStudentId(null)}>
        <DialogContent title={studentName || 'Student attendance'}>
          {!studentDetail ? (
            <CardSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{studentDetail.summary.present}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Present</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{studentDetail.summary.absent}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Absent</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {studentDetail.summary.rate == null ? '—' : `${studentDetail.summary.rate}%`}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Rate</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {studentDetail.history.slice(0, 10).map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {new Date(h.scheduled_start_utc).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <StatusBadge status={h.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
