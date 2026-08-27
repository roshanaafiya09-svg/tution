import { api } from '@/lib/api';
import type { AttendanceBatchHistoryEntry, Batch, Enrollment, FeeEntry } from '@/lib/types';

/** One student, merged across every batch of this teacher's that they
 *  belong to. Assembled client-side from the bulk `/batches/me/students`,
 *  `/attendance/batches/mine/history`, and `/fees/period` endpoints —
 *  there is no single roster endpoint server-side yet. */
export interface RosterStudent {
  studentId: string;
  displayName: string | null;
  phoneE164: string;
  /** 'active' if they're still enrolled in at least one batch. */
  status: 'active' | 'left';
  joinedAt: string;
  batches: { id: string; title: string; status: Enrollment['status'] }[];
  attendance: { present: number; late: number; absent: number; total: number; rate: number | null };
  /** Every marked session for this student, newest first — the rows behind
   *  the aggregate counts above, kept so the detail page needs no refetch. */
  attendanceHistory: (AttendanceBatchHistoryEntry & { batch_id: string; batch_title: string })[];
  fees: { expectedMinor: number; paidMinor: number; outstandingMinor: number; currency: string; entries: FeeEntry[] };
}

export interface RosterData {
  batches: Batch[];
  students: RosterStudent[];
  /** The fee period the fee columns describe, e.g. "2026-08". */
  periodLabel: string;
}

export function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function emptyAttendance(): RosterStudent['attendance'] {
  return { present: 0, late: 0, absent: 0, total: 0, rate: null };
}

/**
 * Bulk load of the teacher's whole roster: one call for enrollments across
 * every batch, one for attendance across every batch, plus a single
 * fee-period call — replacing what used to be two requests per batch.
 * Failures degrade to an empty roster rather than a broken page.
 */
export async function loadRoster(periodLabel = currentPeriodLabel()): Promise<RosterData> {
  const [batches, enrollments, attendanceRows, feeEntries] = await Promise.all([
    api.get<Batch[]>('/batches/me'),
    api.get<Enrollment[]>('/batches/me/students').catch(() => [] as Enrollment[]),
    api.get<AttendanceBatchHistoryEntry[]>('/attendance/batches/mine/history').catch(() => [] as AttendanceBatchHistoryEntry[]),
    api.get<FeeEntry[]>(`/fees/period?period=${periodLabel}`).catch(() => [] as FeeEntry[]),
  ]);

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const byStudent = new Map<string, RosterStudent>();

  for (const enrollment of enrollments) {
    const batch = enrollment.batch_id ? batchById.get(enrollment.batch_id) : undefined;
    if (!batch) continue;
    const existing = byStudent.get(enrollment.student_id);
    if (existing) {
      existing.batches.push({ id: batch.id, title: batch.title, status: enrollment.status });
      if (enrollment.status === 'active') existing.status = 'active';
      if (enrollment.joined_at < existing.joinedAt) existing.joinedAt = enrollment.joined_at;
      existing.displayName = existing.displayName ?? enrollment.display_name;
    } else {
      byStudent.set(enrollment.student_id, {
        studentId: enrollment.student_id,
        displayName: enrollment.display_name,
        phoneE164: enrollment.phone_e164,
        status: enrollment.status,
        joinedAt: enrollment.joined_at,
        batches: [{ id: batch.id, title: batch.title, status: enrollment.status }],
        attendance: emptyAttendance(),
        attendanceHistory: [],
        fees: { expectedMinor: 0, paidMinor: 0, outstandingMinor: 0, currency: 'INR', entries: [] },
      });
    }
  }

  for (const row of attendanceRows) {
    const batch = row.batch_id ? batchById.get(row.batch_id) : undefined;
    if (!batch) continue;
    const student = byStudent.get(row.student_id);
    if (!student) continue;
    student.attendance.total += 1;
    if (row.status === 'present') student.attendance.present += 1;
    else if (row.status === 'late') student.attendance.late += 1;
    else student.attendance.absent += 1;
    student.attendanceHistory.push({ ...row, batch_id: batch.id, batch_title: batch.title });
  }

  for (const student of byStudent.values()) {
    const { present, late, total } = student.attendance;
    student.attendance.rate = total === 0 ? null : Math.round(((present + late) / total) * 100);
    student.attendanceHistory.sort(
      (a, b) => new Date(b.scheduled_start_utc).getTime() - new Date(a.scheduled_start_utc).getTime(),
    );
  }

  for (const entry of feeEntries) {
    const student = byStudent.get(entry.student_id);
    if (!student) continue;
    student.fees.entries.push(entry);
    student.fees.currency = entry.currency;
    if (entry.status === 'waived') continue;
    student.fees.expectedMinor += entry.expected_minor;
    student.fees.paidMinor += entry.recorded_paid_minor ?? 0;
  }

  for (const student of byStudent.values()) {
    student.fees.outstandingMinor = Math.max(0, student.fees.expectedMinor - student.fees.paidMinor);
  }

  const students = [...byStudent.values()].sort((a, b) =>
    (a.displayName ?? a.phoneE164).localeCompare(b.displayName ?? b.phoneE164),
  );

  return { batches, students, periodLabel };
}

/** 'paid' when everything due this period is settled, 'due' when nothing
 *  has been paid, 'partial' in between, and 'none' when no fee record
 *  exists for them this period at all. */
export function feeStatusOf(student: RosterStudent): 'paid' | 'partial' | 'due' | 'none' {
  if (student.fees.entries.length === 0) return 'none';
  if (student.fees.expectedMinor === 0) return 'paid';
  if (student.fees.outstandingMinor === 0) return 'paid';
  return student.fees.paidMinor > 0 ? 'partial' : 'due';
}

export function studentLabel(student: Pick<RosterStudent, 'displayName' | 'phoneE164'>): string {
  return student.displayName ?? student.phoneE164;
}
