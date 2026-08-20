import { api } from '@/lib/api';
import type { AttendanceBatchHistoryEntry, Batch, Enrollment, FeeEntry } from '@/lib/types';

/** One student, merged across every batch of this teacher's that they
 *  belong to. Assembled entirely client-side from endpoints that already
 *  exist (`/batches/:id/students`, `/attendance/batch/:id/history`,
 *  `/fees/period`) — there is no single roster endpoint server-side yet. */
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
 * Fan-out load of the teacher's whole roster. One request per batch for
 * enrollments and one per batch for attendance, plus a single fee-period
 * call — the same N+1 shape the Batches list already uses. Failures on an
 * individual batch degrade that batch's contribution to empty rather than
 * failing the whole page.
 */
export async function loadRoster(periodLabel = currentPeriodLabel()): Promise<RosterData> {
  const batches = await api.get<Batch[]>('/batches/me');

  const [enrollmentsByBatch, attendanceByBatch, feeEntries] = await Promise.all([
    Promise.all(
      batches.map((batch) =>
        api
          .get<Enrollment[]>(`/batches/${batch.id}/students`)
          .then((rows) => [batch, rows] as const)
          .catch(() => [batch, [] as Enrollment[]] as const),
      ),
    ),
    Promise.all(
      batches.map((batch) =>
        api
          .get<AttendanceBatchHistoryEntry[]>(`/attendance/batch/${batch.id}/history`)
          .then((rows) => [batch, rows] as const)
          .catch(() => [batch, [] as AttendanceBatchHistoryEntry[]] as const),
      ),
    ),
    api.get<FeeEntry[]>(`/fees/period?period=${periodLabel}`).catch(() => [] as FeeEntry[]),
  ]);

  const byStudent = new Map<string, RosterStudent>();

  for (const [batch, enrollments] of enrollmentsByBatch) {
    for (const enrollment of enrollments) {
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
  }

  for (const [batch, rows] of attendanceByBatch) {
    for (const row of rows) {
      const student = byStudent.get(row.student_id);
      if (!student) continue;
      student.attendance.total += 1;
      if (row.status === 'present') student.attendance.present += 1;
      else if (row.status === 'late') student.attendance.late += 1;
      else student.attendance.absent += 1;
      student.attendanceHistory.push({ ...row, batch_id: batch.id, batch_title: batch.title });
    }
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
