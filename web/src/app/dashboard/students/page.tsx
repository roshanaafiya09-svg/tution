'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react';
import { formatMinor } from '@/lib/api';
import { currentPeriodLabel, feeStatusOf, loadRoster, studentLabel, type RosterStudent } from '@/lib/teacher-roster';
import type { Batch } from '@/lib/types';
import {
  Button,
  buttonVariants,
  CardSkeleton,
  ErrorState,
  Input,
  Select,
  StatusBadge,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { TeacherPageHeader, EmptyPanel, MetricCard } from '@/components/dashboard';
import { cn } from '@/lib/cn';

const FEE_LABEL: Record<ReturnType<typeof feeStatusOf>, string> = {
  paid: 'Paid',
  partial: 'Partial',
  due: 'Due',
  none: 'Not generated',
};

function AttendanceMeter({ student }: { student: RosterStudent }) {
  const { rate, total } = student.attendance;
  if (rate === null) {
    return <span className="text-sm text-neutral-400 dark:text-neutral-500">No classes yet</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <span
          className={cn(
            'block h-full rounded-full',
            rate >= 80 ? 'bg-success' : rate >= 60 ? 'bg-warning' : 'bg-error',
          )}
          style={{ width: `${rate}%` }}
        />
      </span>
      <span className="text-sm tabular-nums text-neutral-700 dark:text-neutral-300">{rate}%</span>
      <span className="text-xs text-neutral-400 dark:text-neutral-500">({total})</span>
    </span>
  );
}

export default function StudentsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'left'>('active');
  const periodLabel = currentPeriodLabel();

  const load = useCallback(() => {
    setLoadError(false);
    setStudents(null);
    loadRoster(periodLabel)
      .then((data) => {
        setBatches(data.batches);
        setStudents(data.students);
      })
      .catch(() => setLoadError(true));
  }, [periodLabel]);

  useEffect(() => {
    load();
  }, [load]);

  // Seeded from the header's quick search ("Search students for …").
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) {
      setQuery(initial);
      setStatusFilter('all');
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (students ?? []).filter((student) => {
      if (statusFilter !== 'all' && student.status !== statusFilter) return false;
      if (batchFilter !== 'all' && !student.batches.some((b) => b.id === batchFilter)) return false;
      if (!needle) return true;
      return (
        studentLabel(student).toLowerCase().includes(needle) ||
        student.batches.some((b) => b.title.toLowerCase().includes(needle))
      );
    });
  }, [students, query, batchFilter, statusFilter]);

  const activeCount = (students ?? []).filter((s) => s.status === 'active').length;
  const withOutstanding = (students ?? []).filter((s) => s.fees.outstandingMinor > 0);
  const outstandingMinor = withOutstanding.reduce((sum, s) => sum + s.fees.outstandingMinor, 0);
  const rated = (students ?? []).filter((s) => s.attendance.rate !== null);
  const averageAttendance =
    rated.length === 0 ? null : Math.round(rated.reduce((sum, s) => sum + (s.attendance.rate ?? 0), 0) / rated.length);
  const currency = students?.find((s) => s.fees.entries.length > 0)?.fees.currency ?? 'INR';

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Your people"
        title="Students"
        description="Everyone you teach, across every batch — attendance and fees at a glance."
        action={
          batches.length > 0 ? (
            <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Invite students
            </Link>
          ) : undefined
        }
      />

      {loadError ? (
        <ErrorState description="Could not load your students. Check your connection and try again." onRetry={load} />
      ) : students === null ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <CardSkeleton className="h-24 rounded-2xl" />
            <CardSkeleton className="h-24 rounded-2xl" />
            <CardSkeleton className="h-24 rounded-2xl" />
          </div>
          <CardSkeleton className="h-64 rounded-2xl" />
        </div>
      ) : students.length === 0 ? (
        <EmptyPanel
          icon={Users}
          title="No students yet"
          description="Students appear here as soon as they join one of your batches with an invite link."
          steps={['Create batch', 'Share invite link', 'Students join', 'Track attendance & fees']}
          action={
            <Link href="/dashboard/batches" className={buttonVariants({ size: 'sm' })}>
              {batches.length === 0 ? 'Create your first batch' : 'Go to batches'}
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard icon={Users} label="Active students" value={activeCount} hint={`${students.length} total`} />
            <MetricCard
              icon={Users}
              label="Average attendance"
              value={averageAttendance === null ? '—' : `${averageAttendance}%`}
              hint={rated.length === 0 ? 'No attendance marked yet' : `Across ${rated.length} students`}
              tone={averageAttendance !== null && averageAttendance < 60 ? 'warning' : 'brand'}
            />
            <MetricCard
              icon={Users}
              label="Fees outstanding"
              value={formatMinor(outstandingMinor, currency)}
              hint={
                withOutstanding.length === 0
                  ? `Nothing pending for ${periodLabel}`
                  : `${withOutstanding.length} student${withOutstanding.length === 1 ? '' : 's'} · ${periodLabel}`
              }
              tone={outstandingMinor > 0 ? 'warning' : 'success'}
              href="/dashboard/fees"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search students…"
                aria-label="Search students"
                className="w-full pl-9"
              />
            </div>
            <Select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              aria-label="Filter by batch"
              className="w-auto"
            >
              <option value="all">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.title}
                </option>
              ))}
            </Select>
            <div className="flex gap-1.5">
              {(['active', 'left', 'all'] as const).map((option) => (
                <Button
                  key={option}
                  variant={statusFilter === option ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setStatusFilter(option)}
                  className="capitalize"
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 px-5 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700/70 dark:text-neutral-500">
              No students match your search or filters.
            </p>
          ) : (
            <>
              {/* Desktop / tablet: full table. */}
              <TableContainer className="hidden rounded-2xl border-neutral-200/70 md:block dark:border-neutral-800/80">
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Batch</TH>
                      <TH>Attendance</TH>
                      <TH>Fees</TH>
                      <TH>Status</TH>
                      <TH className="w-10"><span className="sr-only">Open</span></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((student) => {
                      const feeStatus = feeStatusOf(student);
                      return (
                        <TR key={student.studentId} className="cursor-pointer">
                          <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                            <Link href={`/dashboard/students/${student.studentId}`} className="block">
                              {studentLabel(student)}
                              {student.displayName && (
                                <span className="block text-xs font-normal text-neutral-400 dark:text-neutral-500">
                                  {student.phoneE164}
                                </span>
                              )}
                            </Link>
                          </TD>
                          <TD>
                            <span className="flex flex-wrap gap-1">
                              {student.batches.slice(0, 2).map((batch) => (
                                <span
                                  key={batch.id}
                                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                                >
                                  {batch.title}
                                </span>
                              ))}
                              {student.batches.length > 2 && (
                                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                                  +{student.batches.length - 2}
                                </span>
                              )}
                            </span>
                          </TD>
                          <TD>
                            <AttendanceMeter student={student} />
                          </TD>
                          <TD>
                            {feeStatus === 'none' ? (
                              <span className="text-sm text-neutral-400 dark:text-neutral-500">Not generated</span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <StatusBadge status={feeStatus} />
                                {student.fees.outstandingMinor > 0 && (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {formatMinor(student.fees.outstandingMinor, student.fees.currency)}
                                  </span>
                                )}
                              </span>
                            )}
                          </TD>
                          <TD>
                            <StatusBadge status={student.status} />
                          </TD>
                          <TD>
                            <Link
                              href={`/dashboard/students/${student.studentId}`}
                              aria-label={`Open ${studentLabel(student)}`}
                              className="flex text-neutral-300 transition-colors hover:text-brand-600 dark:text-neutral-600 dark:hover:text-brand-300"
                            >
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            </Link>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableContainer>

              {/* Mobile: the same rows as stacked cards. */}
              <ul className="space-y-2.5 md:hidden">
                {filtered.map((student) => {
                  const feeStatus = feeStatusOf(student);
                  return (
                    <li key={student.studentId}>
                      <Link
                        href={`/dashboard/students/${student.studentId}`}
                        className="block rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300 dark:border-neutral-800/80 dark:bg-surface dark:hover:border-neutral-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                              {studentLabel(student)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                              {student.batches.map((b) => b.title).join(' · ')}
                            </p>
                          </div>
                          <StatusBadge status={student.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <AttendanceMeter student={student} />
                          {feeStatus === 'none' ? (
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">
                              {FEE_LABEL.none}
                            </span>
                          ) : (
                            <StatusBadge status={feeStatus} />
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
