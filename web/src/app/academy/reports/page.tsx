'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Download,
  GraduationCap,
  MessageCircle,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AcademyActiveTeacher,
  AcademyAttendanceReport,
  AcademyBatchesReport,
  AcademyContactRequestsReport,
  AcademyHolidaysReport,
  AcademyLeaveReport,
  AcademyManagedBatch,
  AcademyManagedEnrollment,
  AcademyReportSummary,
  AcademySessionsReport,
  AcademyStudentsReport,
  AcademyTeachersReport,
} from '@/lib/types';
import { downloadCsv } from '@/lib/csv';
import { cancellationReasonLabel } from '@/lib/session-labels';
import { Button, CardSkeleton, EmptyState, ErrorState, Input, Select, StatCard, StatusBadge } from '@/components/ui';
import { AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { cn } from '@/lib/cn';
import { useAcademyDashboard } from '@/components/academy-shell';

type Category =
  | 'summary'
  | 'students'
  | 'teachers'
  | 'batches'
  | 'attendance'
  | 'sessions'
  | 'leave'
  | 'holidays'
  | 'contact-requests';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'batches', label: 'Batches' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'sessions', label: 'Classes' },
  { value: 'leave', label: 'Leave' },
  { value: 'holidays', label: 'Holidays' },
  { value: 'contact-requests', label: 'Contact Requests' },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string, timezone?: string): string {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80">
      <table className="w-full min-w-[720px] text-sm">{children}</table>
    </div>
  );
}

function Thead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
        {columns.map((c) => (
          <th key={c} className="px-4 py-2.5">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export default function AcademyReportsPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [category, setCategory] = useState<Category>('summary');
  const [loadError, setLoadError] = useState(false);

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(isoDate(monthAgo));
  const [to, setTo] = useState(isoDate(today));
  const [batchId, setBatchId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [students, setStudents] = useState<AcademyManagedEnrollment[]>([]);

  const [summary, setSummary] = useState<AcademyReportSummary | null>(null);
  const [studentsReport, setStudentsReport] = useState<AcademyStudentsReport | null>(null);
  const [teachersReport, setTeachersReport] = useState<AcademyTeachersReport | null>(null);
  const [batchesReport, setBatchesReport] = useState<AcademyBatchesReport | null>(null);
  const [attendanceReport, setAttendanceReport] = useState<AcademyAttendanceReport | null>(null);
  const [sessionsReport, setSessionsReport] = useState<AcademySessionsReport | null>(null);
  const [leaveReport, setLeaveReport] = useState<AcademyLeaveReport | null>(null);
  const [holidaysReport, setHolidaysReport] = useState<AcademyHolidaysReport | null>(null);
  const [contactRequestsReport, setContactRequestsReport] = useState<AcademyContactRequestsReport | null>(null);

  useEffect(() => {
    if (hasAcademy === false) return;
    Promise.all([
      api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
      api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
      api.get<AcademyManagedEnrollment[]>('/academy/me/students?status=active').catch(() => [] as AcademyManagedEnrollment[]),
    ]).then(([b, t, s]) => {
      setBatches(b);
      setTeachers(t);
      setStudents(s);
    });
  }, [hasAcademy]);

  const load = useCallback(
    async (filters: { from: string; to: string; batchId: string; teacherId: string; studentId: string; status: string }) => {
      if (hasAcademy === false) return;
      setLoadError(false);
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.batchId) params.set('batchId', filters.batchId);
      if (filters.teacherId) params.set('teacherId', filters.teacherId);
      if (filters.studentId) params.set('studentId', filters.studentId);
      if (filters.status) params.set('status', filters.status);
      const qs = params.toString();

      try {
        switch (category) {
          case 'summary':
            setSummary(await api.get<AcademyReportSummary>('/academy/me/reports/summary'));
            break;
          case 'students':
            setStudentsReport(await api.get<AcademyStudentsReport>(`/academy/me/reports/students?${qs}`));
            break;
          case 'teachers':
            setTeachersReport(await api.get<AcademyTeachersReport>(`/academy/me/reports/teachers?${qs}`));
            break;
          case 'batches':
            setBatchesReport(
              await api.get<AcademyBatchesReport>(
                `/academy/me/reports/batches${filters.teacherId ? `?teacherId=${filters.teacherId}` : ''}`,
              ),
            );
            break;
          case 'attendance':
            setAttendanceReport(await api.get<AcademyAttendanceReport>(`/academy/me/reports/attendance?${qs}`));
            break;
          case 'sessions':
            setSessionsReport(await api.get<AcademySessionsReport>(`/academy/me/reports/sessions?${qs}`));
            break;
          case 'leave':
            setLeaveReport(await api.get<AcademyLeaveReport>(`/academy/me/reports/leave?${qs}`));
            break;
          case 'holidays':
            setHolidaysReport(await api.get<AcademyHolidaysReport>(`/academy/me/reports/holidays?${qs}`));
            break;
          case 'contact-requests':
            setContactRequestsReport(
              await api.get<AcademyContactRequestsReport>(`/academy/me/reports/contact-requests?${qs}`),
            );
            break;
        }
      } catch {
        setLoadError(true);
      }
    },
    [hasAcademy, category],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load({ from, to, batchId, teacherId, studentId, status });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, from, to, batchId, teacherId, studentId, status, hasAcademy]);

  const showDateRange = category !== 'summary' && category !== 'batches';
  const showBatchFilter = category === 'students' || category === 'attendance' || category === 'sessions';
  const showTeacherFilter = category !== 'summary' && category !== 'holidays' && category !== 'contact-requests';
  const showStudentFilter = category === 'students' || category === 'attendance';
  const showStatusFilter = category === 'sessions' || category === 'leave';

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Reports"
        description="Real, academy-wide operational reports — built from the same data as your other dashboard pages."
      />

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              category === c.value
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {(showDateRange || showBatchFilter || showTeacherFilter || showStudentFilter || showStatusFilter) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {showDateRange && (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          {showBatchFilter && (
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          )}
          {showTeacherFilter && (
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map((t) => (
                <option key={t.tutorId} value={t.tutorId}>
                  {t.displayName ?? 'Teacher'}
                </option>
              ))}
            </Select>
          )}
          {showStudentFilter && (
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">All students</option>
              {students.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.displayName ?? s.phoneE164}
                </option>
              ))}
            </Select>
          )}
          {showStatusFilter && category === 'sessions' && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          )}
          {showStatusFilter && category === 'leave' && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          )}
        </div>
      )}

      <div className="mt-6">
        {loadError ? (
          <ErrorState
            description="Could not load this report. Check your connection and try again."
            onRetry={() => void load({ from, to, batchId, teacherId, studentId, status })}
          />
        ) : category === 'summary' ? (
          <SummarySection summary={summary} />
        ) : category === 'students' ? (
          <StudentsSection report={studentsReport} />
        ) : category === 'teachers' ? (
          <TeachersSection report={teachersReport} />
        ) : category === 'batches' ? (
          <BatchesSection report={batchesReport} />
        ) : category === 'attendance' ? (
          <AttendanceSection report={attendanceReport} />
        ) : category === 'sessions' ? (
          <SessionsSection report={sessionsReport} />
        ) : category === 'leave' ? (
          <LeaveSection report={leaveReport} />
        ) : category === 'holidays' ? (
          <HolidaysSection report={holidaysReport} />
        ) : (
          <ContactRequestsSection report={contactRequestsReport} />
        )}
      </div>
    </div>
  );
}

function SummarySection({ summary }: { summary: AcademyReportSummary | null }) {
  if (!summary) return <CardSkeleton />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon={Users} label="Teachers" value={summary.teacherCount} />
      <StatCard icon={GraduationCap} label="Students" value={summary.studentsCount} />
      <StatCard icon={BookOpen} label="Batches" value={`${summary.activeBatchCount}/${summary.batchCount} active`} />
      <StatCard icon={CalendarClock} label="Classes today" value={summary.sessionsToday} />
      <StatCard icon={ClipboardList} label="Pending leave requests" value={summary.pendingLeaveCount} />
      <StatCard icon={CalendarRange} label="Upcoming holidays (30d)" value={summary.upcomingHolidaysCount} />
      <StatCard icon={MessageCircle} label="Contact requests" value={Object.values(summary.contactRequestsByStatus).reduce((a, b) => a + b, 0)} />
    </div>
  );
}

function StudentsSection({ report }: { report: AcademyStudentsReport | null }) {
  if (!report) return <CardSkeleton />;
  if (report.rows.length === 0)
    return (
      <EmptyState
        icon={GraduationCap}
        title="No students match these filters"
        description="Try widening the date range or clearing a filter."
      />
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard icon={GraduationCap} label="Total students" value={report.totalStudents} />
        <StatCard icon={Users} label="New in range" value={report.newStudentsInRange} />
      </div>
      <TableShell>
        <Thead columns={['Student', 'Batch', 'Teacher', 'Grade', 'Joined', 'Attendance']} />
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.rows.map((r, i) => (
            <tr key={`${r.studentId}-${r.batchId}-${i}`} className="bg-white dark:bg-surface">
              <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.displayName ?? 'Student'}</td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.batchTitle}</td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.tutorDisplayName ?? 'Teacher'}</td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.gradeLevel ?? '—'}</td>
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">{formatDate(r.joinedAt)}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.attendance?.rate == null ? '—' : `${r.attendance.rate}%`}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function TeachersSection({ report }: { report: AcademyTeachersReport | null }) {
  if (!report) return <CardSkeleton />;
  if (report.rows.length === 0)
    return (
      <EmptyState
        icon={Users}
        title="No teachers match these filters"
        description="Try widening the date range or clearing a filter."
      />
    );
  return (
    <div className="space-y-4">
      <StatCard icon={Users} label="Total teachers" value={report.totalTeachers} />
      <TableShell>
        <Thead columns={['Teacher', 'Classes', 'Completed', 'Cancelled', 'Leave (P/A/R)']} />
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.rows.map((r) => (
            <tr key={r.tutorId} className="bg-white dark:bg-surface">
              <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.tutorDisplayName ?? 'Teacher'}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.classCount}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.completedCount}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.cancelledCount}</td>
              <td className="px-4 py-2.5 tabular-nums">
                {r.pendingLeaveCount} / {r.approvedLeaveCount} / {r.rejectedLeaveCount}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function BatchesSection({ report }: { report: AcademyBatchesReport | null }) {
  if (!report) return <CardSkeleton />;
  if (report.rows.length === 0)
    return <EmptyState icon={BookOpen} title="No batches match these filters" description="Try clearing the teacher filter." />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard icon={BookOpen} label="Total batches" value={report.totalBatches} />
        <StatCard icon={BookOpen} label="Active batches" value={report.activeBatches} />
      </div>
      <TableShell>
        <Thead columns={['Batch', 'Teacher', 'Status', 'Enrolled / Capacity', 'Upcoming classes']} />
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.rows.map((r) => (
            <tr key={r.batchId} className="bg-white dark:bg-surface">
              <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.title}</td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.tutorDisplayName ?? 'Teacher'}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-2.5 tabular-nums">
                {r.enrolledCount} / {r.capacity}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{r.upcomingSessionCount}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function AttendanceSection({ report }: { report: AcademyAttendanceReport | null }) {
  if (!report) return <CardSkeleton />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <StatCard icon={ClipboardList} label="Total absences" value={report.totalAbsences} />
        {report.rows.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadCsv(`absent-students-${isoDate(new Date())}.csv`, report.rows, [
                { header: 'Student', value: (r) => r.displayName ?? '' },
                { header: 'Batch', value: (r) => r.batchTitle },
                { header: 'Teacher', value: (r) => r.tutorDisplayName ?? '' },
                { header: 'Date', value: (r) => formatDate(r.scheduledStartUtc) },
                { header: 'Time', value: (r) => formatDateTime(r.scheduledStartUtc, r.timezone) },
                { header: 'Status', value: (r) => r.status },
              ])
            }
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </Button>
        )}
      </div>
      {report.rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No absences in this range" description="Great news — or try widening the date range." />
      ) : (
        <TableShell>
          <Thead columns={['Student', 'Batch', 'Teacher', 'Date', 'Time', 'Status']} />
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {report.rows.map((r, i) => (
              <tr key={`${r.sessionId}-${r.studentId}-${i}`} className="bg-white dark:bg-surface">
                <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.displayName ?? 'Student'}</td>
                <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.batchTitle}</td>
                <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.tutorDisplayName ?? 'Teacher'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">{formatDate(r.scheduledStartUtc)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                  {formatDateTime(r.scheduledStartUtc, r.timezone)}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function SessionsSection({ report }: { report: AcademySessionsReport | null }) {
  if (!report) return <CardSkeleton />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={CalendarClock} label="Total" value={report.total} />
          <StatCard icon={CalendarClock} label="Completed" value={report.completed} />
          <StatCard icon={CalendarClock} label="Cancelled" value={report.cancelled} />
          <StatCard icon={CalendarClock} label="Scheduled" value={report.scheduled} />
        </div>
        {report.rows.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadCsv(`classes-${isoDate(new Date())}.csv`, report.rows, [
                { header: 'Date', value: (r) => formatDate(r.scheduledStartUtc) },
                { header: 'Time', value: (r) => formatDateTime(r.scheduledStartUtc, r.timezone) },
                { header: 'Batch', value: (r) => r.batchTitle },
                { header: 'Teacher', value: (r) => r.tutorDisplayName ?? '' },
                { header: 'Status', value: (r) => r.status },
              ])
            }
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </Button>
        )}
      </div>
      {report.rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No classes match these filters"
          description="Try widening the date range or clearing a filter."
        />
      ) : (
        <TableShell>
          <Thead columns={['Date', 'Time', 'Batch', 'Teacher', 'Status']} />
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {report.rows.map((r) => (
              <tr key={r.sessionId} className="bg-white dark:bg-surface">
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">{formatDate(r.scheduledStartUtc)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                  {formatDateTime(r.scheduledStartUtc, r.timezone)}
                </td>
                <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.batchTitle}</td>
                <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.tutorDisplayName ?? 'Teacher'}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status === 'cancelled' ? (cancellationReasonLabel({ status: r.status, cancellationReason: r.cancellationReason })?.toLowerCase() ?? 'cancelled') : r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function LeaveSection({ report }: { report: AcademyLeaveReport | null }) {
  if (!report) return <CardSkeleton />;
  if (report.rows.length === 0)
    return (
      <EmptyState
        icon={CalendarRange}
        title="No leave requests match these filters"
        description="Try widening the date range or clearing a filter."
      />
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={CalendarRange} label="Pending" value={report.pendingCount} />
        <StatCard icon={CalendarRange} label="Approved" value={report.approvedCount} />
        <StatCard icon={CalendarRange} label="Rejected" value={report.rejectedCount} />
      </div>
      <TableShell>
        <Thead columns={['Teacher', 'Dates', 'Reason', 'Status', 'Classes affected']} />
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.rows.map((r) => (
            <tr key={r.id} className="bg-white dark:bg-surface">
              <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.tutorDisplayName ?? 'Teacher'}</td>
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                {r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
              </td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.reason ?? '—'}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-2.5 tabular-nums">{r.classesAffected}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function HolidaysSection({ report }: { report: AcademyHolidaysReport | null }) {
  if (!report) return <CardSkeleton />;
  if (report.rows.length === 0)
    return <EmptyState icon={CalendarRange} title="No holidays in this range" description="Try widening the date range." />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard icon={CalendarRange} label="Government holidays" value={report.governmentCount} />
        <StatCard icon={CalendarRange} label="Academy holidays" value={report.academyCount} />
      </div>
      <TableShell>
        <Thead columns={['Name', 'Type', 'Dates', 'Classes affected']} />
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.rows.map((r) => (
            <tr key={r.id} className="bg-white dark:bg-surface">
              <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.name}</td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">
                {r.type === 'government_holiday' ? 'Government' : 'Academy'}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                {r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{r.affectedClasses}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function ContactRequestsSection({ report }: { report: AcademyContactRequestsReport | null }) {
  if (!report) return <CardSkeleton />;
  if (report.rows.length === 0)
    return <EmptyState icon={MessageCircle} title="No contact requests in this range" description="Try widening the date range." />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(report.byStatus).map(([s, count]) => (
          <StatCard key={s} icon={MessageCircle} label={s.replace(/_/g, ' ')} value={count} />
        ))}
      </div>
      <TableShell>
        <Thead columns={['Date', 'Name', 'Contact', 'Status']} />
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.rows.map((r) => (
            <tr key={r.id} className="bg-white dark:bg-surface">
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-600 dark:text-neutral-400">{formatDate(r.createdAt)}</td>
              <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-100">{r.name ?? 'A visitor'}</td>
              <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">{r.email ?? r.phone ?? '—'}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
