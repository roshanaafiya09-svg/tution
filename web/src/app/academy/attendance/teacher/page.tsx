'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, CheckCircle2, ClipboardList, Users, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AcademyActiveTeacher,
  AcademyManagedBatch,
  AcademyTeacherAttendance,
  AcademyTeacherAttendanceRow,
  AcademyTeacherAttendanceTodaySummary,
} from '@/lib/types';
import { CardSkeleton, Dialog, DialogContent, EmptyState, ErrorState, Input, Select, StatCard, StatusBadge } from '@/components/ui';
import { AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AcademyTeacherAttendancePage() {
  const { hasAcademy } = useAcademyDashboard();
  const [summary, setSummary] = useState<AcademyTeacherAttendanceTodaySummary | null>(null);
  const [rows, setRows] = useState<AcademyTeacherAttendanceRow[] | null>(null);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(isoDate(weekAgo));
  const [to, setTo] = useState(isoDate(today));
  const [teacherId, setTeacherId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailName, setDetailName] = useState('');
  const [detail, setDetail] = useState<AcademyTeacherAttendance | null>(null);

  const loadTable = useCallback(
    async (filters: { from: string; to: string; teacherId: string; batchId: string; status: string }) => {
      if (hasAcademy === false) {
        setRows([]);
        return;
      }
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        if (filters.from) params.set('from', new Date(filters.from).toISOString());
        if (filters.to) params.set('to', new Date(new Date(filters.to).getTime() + 24 * 60 * 60 * 1000).toISOString());
        if (filters.teacherId) params.set('teacherId', filters.teacherId);
        if (filters.batchId) params.set('batchId', filters.batchId);
        if (filters.status) params.set('status', filters.status);
        setRows(await api.get<AcademyTeacherAttendanceRow[]>(`/academy/me/attendance/teachers?${params.toString()}`));
      } catch (err: unknown) {
        setLoadError(err ?? true);
      }
    },
    [hasAcademy],
  );

  useEffect(() => {
    if (hasAcademy === false) {
      setSummary({
        classesToday: 0,
        teachersExpected: 0,
        present: 0,
        absent: 0,
        onLeave: 0,
        attendancePercent: null,
      });
      return;
    }
    Promise.all([
      api.get<AcademyTeacherAttendanceTodaySummary>('/academy/me/attendance/teachers/today'),
      api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active'),
      api.get<AcademyManagedBatch[]>('/academy/me/batches'),
    ]).then(([s, t, b]) => {
      setSummary(s);
      setTeachers(t);
      setBatches(b);
    });
  }, [hasAcademy]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadTable({ from, to, teacherId, batchId, status });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, teacherId, batchId, status, hasAcademy]);

  const openTeacher = useCallback(
    async (teacherIdToOpen: string, name: string) => {
      setDetailId(teacherIdToOpen);
      setDetailName(name);
      setDetail(null);
      try {
        const params = new URLSearchParams();
        if (from) params.set('from', new Date(from).toISOString());
        if (to) params.set('to', new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());
        setDetail(await api.get<AcademyTeacherAttendance>(`/academy/me/attendance/teachers/${teacherIdToOpen}?${params.toString()}`));
      } catch {
        setDetail(null);
      }
    },
    [from, to],
  );

  async function markSession(sessionId: string, markStatus: 'present' | 'absent') {
    if (!detailId) return;
    try {
      await api.post('/academy/me/attendance/teachers', { sessionId, status: markStatus });
      await openTeacher(detailId, detailName);
      void loadTable({ from, to, teacherId, batchId, status });
    } catch {
      // Best-effort — the dialog simply keeps its previous state if this fails.
    }
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Teacher Attendance"
        description="Monitor teacher attendance across your academy."
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
            <StatCard icon={Users} label="Teachers expected" value={summary.teachersExpected} />
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

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">All teachers</option>
          {teachers.map((t) => (
            <option key={t.tutorId} value={t.tutorId}>
              {t.displayName ?? 'Teacher'}
            </option>
          ))}
        </Select>
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="approved_leave">Approved Leave</option>
        </Select>
      </div>

      <div className="mt-4">
        {loadError ? (
          <ErrorState
            error={loadError} what="teacher attendance records"
            onRetry={() => void loadTable({ from, to, teacherId, batchId, status })}
          />
        ) : rows === null ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No teacher attendance recorded yet"
            description="Teacher attendance is recorded by your Academy Admin from each teacher's class history — open a teacher below once classes have run."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Teacher</th>
                  <th className="px-4 py-2.5">Classes</th>
                  <th className="px-4 py-2.5">Present</th>
                  <th className="px-4 py-2.5">Absent</th>
                  <th className="px-4 py-2.5">Leave</th>
                  <th className="px-4 py-2.5">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {rows.map((r) => (
                  <tr key={`${r.date}::${r.teacherId}`} className="bg-white dark:bg-surface">
                    <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                      {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => void openTeacher(r.teacherId, r.teacherDisplayName ?? 'Teacher')}
                        className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {r.teacherDisplayName ?? 'Teacher'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{r.scheduledClasses}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.present}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.absent}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.approvedLeave}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.attendancePercent == null ? '—' : `${r.attendancePercent}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent title={detailName || 'Teacher attendance'}>
          {!detail ? (
            <CardSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{detail.summary.present}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Present</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{detail.summary.absent}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Absent</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{detail.summary.approvedLeave}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Leave</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {detail.summary.attendancePercent == null ? '—' : `${detail.summary.attendancePercent}%`}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Rate</p>
                </div>
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {detail.history.slice(0, 20).map((h) => (
                  <div key={h.sessionId} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-neutral-700 dark:text-neutral-300">
                        {new Date(h.scheduledStartUtc).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                      <p className="truncate text-xs text-neutral-400">{h.batchTitle}</p>
                    </div>
                    {h.status === 'not_recorded' ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void markSession(h.sessionId, 'present')}
                          className="rounded-md bg-success-bg px-2 py-1 text-xs font-medium text-success hover:opacity-80 dark:bg-success/15 dark:text-success-dark"
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          onClick={() => void markSession(h.sessionId, 'absent')}
                          className="rounded-md bg-error-bg px-2 py-1 text-xs font-medium text-error hover:opacity-80 dark:bg-error/15 dark:text-error-dark"
                        >
                          Absent
                        </button>
                      </div>
                    ) : (
                      <StatusBadge status={h.status} />
                    )}
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
