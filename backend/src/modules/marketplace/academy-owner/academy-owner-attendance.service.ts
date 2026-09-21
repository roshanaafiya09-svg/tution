import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';

// V1 only ever schedules classes in this zone — same constant
// HolidayService/TeacherLeaveService already use for "what day is it"
// boundaries, so this stays consistent with them regardless of the
// server process's own OS timezone.
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

interface AttendanceFilters {
  from?: string;
  to?: string;
  batchId?: string;
  tutorId?: string;
  status?: string;
}

/**
 * Academy-wide Attendance dashboard (Main > Academic > Attendance, new
 * feature). No new tables and no new repository — composes
 * SessionsRepository.listForAcademyBetween (already used by Today/Timetable)
 * with AttendanceRepository.listForBatches/summaryForStudent(Between)
 * (already used by the tutor/student/parent-facing attendance views).
 * Everything is scoped to batches THE ACADEMY OWNS (batches.academy_id):
 * a student's attendance in a teacher's Individual batch, or in another
 * academy, never appears here.
 *
 * Correctness invariant carried over from AttendanceService: a cancelled
 * session (holiday, teacher leave, or manual) can never have attendance
 * rows — markManually/joinSession both refuse to write one. So "expected"
 * counts only ever include non-cancelled sessions, and "absent" is only
 * ever derived from sessions whose status is 'completed' — a 'scheduled'
 * (not yet run) session's unmarked seats are never counted as absences.
 */
@Injectable()
export class AcademyOwnerAttendanceService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly attendanceRepository: AttendanceRepository,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  /** Display names for attributing the academy's own classes to teachers
   *  — includes teachers who have since left (the academy keeps that
   *  history). */
  private tutorNames(academyId: string) {
    return this.academyMembershipsRepository.displayNamesForAcademy(academyId);
  }

  /** Today's summary cards — classes today (non-cancelled), students
   *  expected, present/absent, attendance %. */
  async getTodaySummary(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const tutorNames = await this.tutorNames(academy.id);

    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    const [sessions, batches] = await Promise.all([
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        startOfDay,
        endOfDay,
      ),
      this.batchesRepository.listForAcademy(academy.id),
    ]);
    const enrolledByBatch = new Map(
      batches.map((b) => [b.id, Number(b.enrolled_count)]),
    );

    const activeSessions = sessions.filter((s) => s.status !== 'cancelled');
    const studentsExpected = activeSessions.reduce(
      (sum, s) => sum + (enrolledByBatch.get(s.batch_id) ?? 0),
      0,
    );

    const batchIds = [...new Set(activeSessions.map((s) => s.batch_id))];
    const attendanceRows =
      batchIds.length > 0
        ? await this.attendanceRepository.listForBatches(batchIds)
        : [];
    const todaySessionIds = new Set(activeSessions.map((s) => s.id));
    const todaysAttendance = attendanceRows.filter((r) =>
      todaySessionIds.has(r.session_id),
    );
    const present = todaysAttendance.filter(
      (r) => r.status === 'present' || r.status === 'late',
    ).length;
    const absent = todaysAttendance.filter((r) => r.status === 'absent').length;
    const marked = present + absent;

    return {
      classesToday: activeSessions.length,
      classesCompleted: activeSessions.filter((s) => s.status === 'completed')
        .length,
      studentsExpected,
      present,
      absent,
      attendancePercent:
        marked === 0 ? null : Math.round((present / marked) * 100),
      teachersToday: [...new Set(activeSessions.map((s) => s.tutor_id))].map(
        (id) => tutorNames.get(id) ?? null,
      ),
    };
  }

  /** The Attendance table — one row per session, date/batch/teacher/
   *  total/present/absent/%/status. Server-side date-range filter (via
   *  listForAcademyBetween's SQL where clause); batch/tutor/status filters
   *  narrow the already date-bounded result set. */
  async listAttendanceTable(ownerUserId: string, filters: AttendanceFilters) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const tutorNames = await this.tutorNames(academy.id);
    const tutorIds = filters.tutorId ? [filters.tutorId] : undefined;

    const to = filters.to ? new Date(filters.to) : new Date();
    const from = filters.from
      ? new Date(filters.from)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [sessions, batches] = await Promise.all([
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        from,
        to,
        tutorIds,
      ),
      this.batchesRepository.listForAcademy(academy.id, tutorIds),
    ]);
    const enrolledByBatch = new Map(
      batches.map((b) => [b.id, Number(b.enrolled_count)]),
    );

    const scoped = sessions.filter(
      (s) => !filters.batchId || s.batch_id === filters.batchId,
    );
    const batchIds = [...new Set(scoped.map((s) => s.batch_id))];
    const attendanceRows =
      batchIds.length > 0
        ? await this.attendanceRepository.listForBatches(batchIds)
        : [];
    const bySession = new Map<string, typeof attendanceRows>();
    for (const row of attendanceRows) {
      const list = bySession.get(row.session_id) ?? [];
      list.push(row);
      bySession.set(row.session_id, list);
    }

    return scoped
      .filter((s) => !filters.status || s.status === filters.status)
      .map((s) => {
        const rows = bySession.get(s.id) ?? [];
        const present = rows.filter(
          (r) => r.status === 'present' || r.status === 'late',
        ).length;
        // Only a completed class's unmarked seats count as absent — a
        // cancelled class never has rows to begin with, and a scheduled
        // (future) class simply hasn't happened yet.
        const totalEnrolled = enrolledByBatch.get(s.batch_id) ?? 0;
        const absent =
          s.status === 'completed'
            ? Math.max(totalEnrolled - present, 0)
            : rows.filter((r) => r.status === 'absent').length;
        return {
          sessionId: s.id,
          scheduledStartUtc: s.scheduled_start_utc,
          batchId: s.batch_id,
          batchTitle: s.batch_title,
          tutorId: s.tutor_id,
          tutorDisplayName: tutorNames.get(s.tutor_id) ?? null,
          totalStudents: totalEnrolled,
          present,
          absent,
          attendancePercent:
            totalEnrolled === 0
              ? null
              : Math.round((present / totalEnrolled) * 100),
          status: s.status,
          cancellationReason: s.cancellation_reason,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.scheduledStartUtc).getTime() -
          new Date(a.scheduledStartUtc).getTime(),
      );
  }

  /** A single student's attendance — same repository calls the
   *  student/parent-facing routes already use, gated by academy
   *  ownership (the student must have an active enrollment somewhere in
   *  this academy). */
  async getStudentAttendance(ownerUserId: string, studentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const enrollments = await this.batchesRepository.listEnrollmentsForAcademy(
      academy.id,
    );
    const belongs = enrollments.some((e) => e.student_id === studentId);
    if (!belongs) {
      throw new NotFoundException(
        "That student isn't enrolled with your academy",
      );
    }

    // Scoped to this academy's own classes — the same student's attendance
    // in a teacher's Individual batch (or another academy) is not shown.
    const [summary, history] = await Promise.all([
      this.attendanceRepository.summaryForStudentBetween(
        studentId,
        new Date(0),
        new Date(),
        academy.id,
      ),
      this.attendanceRepository.listForStudent(studentId, academy.id),
    ]);
    return { summary, history: history.slice(0, 20) };
  }

  /** A single batch's attendance — total, per-student breakdown, recent
   *  history. The batch must be owned by THIS academy; an Individual batch
   *  or another academy's is "not found". */
  async getBatchAttendance(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.batchesRepository.findByIdInAcademy(
      batchId,
      academy.id,
    );
    if (!batch) throw new NotFoundException('Batch not found');

    const [students, history] = await Promise.all([
      this.batchesRepository.listEnrollments(batchId),
      this.attendanceRepository.listForBatch(batchId),
    ]);

    const activeStudents = students.filter((s) => s.status === 'active');
    const perStudent = await Promise.all(
      activeStudents.map(async (s) => ({
        studentId: s.student_id,
        displayName: s.display_name,
        summary: await this.attendanceRepository.summaryForStudent(
          s.student_id,
          batchId,
        ),
      })),
    );

    return {
      batchId,
      students: perStudent,
      recentHistory: history.slice(0, 30),
    };
  }
}
