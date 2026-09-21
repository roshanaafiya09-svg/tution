import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AcademyContactRequestsRepository } from '../academies/academy-contact-requests.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { HolidaysRepository } from '../../holidays/holidays.repository';
import { TeacherLeaveRepository } from '../../holidays/teacher-leave.repository';

// Same local-constant convention as HolidayService/TeacherLeaveService/
// AcademyOwnerAttendanceService — not extracted to shared config, see
// those services' identical doc comments for why.
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

interface RangeFilters {
  from?: string;
  to?: string;
}

function rangeOrDefault(filters: RangeFilters, defaultDays: number) {
  const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
  const to = filters.to
    ? DateTime.fromISO(filters.to, { zone: DEFAULT_TIMEZONE }).endOf('day')
    : now.endOf('day');
  const from = filters.from
    ? DateTime.fromISO(filters.from, { zone: DEFAULT_TIMEZONE }).startOf('day')
    : to.minus({ days: defaultDays }).startOf('day');
  return { from: from.toUTC().toJSDate(), to: to.toUTC().toJSDate() };
}

function dateKey(d: Date, timezone: string): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).setZone(timezone).toISODate()!;
}

/**
 * Academy Dashboard > Reports. No new tables, no new repository queries
 * beyond two small bulk-sibling additions
 * (AttendanceRepository.summaryForStudentsBetween,
 * SessionsRepository.countByHolidayForTutors/countByLeaveRequestForTutors)
 * — every report composes the exact same bulk academy-wide repository
 * methods AcademyOwnerAttendanceService already uses, following its
 * "parallel fetch, in-memory join/derive/filter" template rather than a
 * per-report query. Every method resolves "my academy" and scopes every
 * query to its active member teachers only, same as every other
 * academy-owner service.
 */
@Injectable()
export class AcademyOwnerReportsService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly academyContactRequestsRepository: AcademyContactRequestsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly holidaysRepository: HolidaysRepository,
    private readonly teacherLeaveRepository: TeacherLeaveRepository,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  /** `tutorIds` = the academy's ACTIVE teachers (roster rows and
   *  counts). `tutorNames` also covers teachers who have since left, so
   *  the academy's historical classes/batches stay attributable. NEVER use
   *  `tutorIds` to scope data queries: every report reads the academy's own
   *  records (batches.academy_id); a teacher filter can only narrow. */
  private async activeTeachers(academyId: string) {
    const teachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academyId);
    return {
      tutorIds: teachers.map((t) => t.tutor_id),
      tutorNames:
        await this.academyMembershipsRepository.displayNamesForAcademy(
          academyId,
        ),
    };
  }

  // --- Summary ---------------------------------------------------------

  async summary(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds, tutorNames } = await this.activeTeachers(academy.id);

    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    const startOfDay = now.startOf('day').toUTC().toJSDate();
    const endOfDay = now.endOf('day').toUTC().toJSDate();
    const todayStr = now.toISODate()!;
    const holidayWindowEnd = now.plus({ days: 30 }).toISODate()!;

    const [
      batches,
      studentIds,
      todaySessions,
      leaveRequests,
      academyHolidays,
      govHolidays,
      contactRequests,
    ] = await Promise.all([
      this.batchesRepository.listForAcademy(academy.id),
      this.batchesRepository.listDistinctStudentIdsForAcademy(academy.id),
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        startOfDay,
        endOfDay,
      ),
      this.teacherLeaveRepository.listForAcademyWithTutor(academy.id),
      this.holidaysRepository.listForAcademy(
        academy.id,
        todayStr,
        holidayWindowEnd,
      ),
      this.holidaysRepository.listGovernment(
        academy.country_code,
        academy.state_code,
        todayStr,
        holidayWindowEnd,
      ),
      this.academyContactRequestsRepository.listForAcademy(academy.id),
    ]);

    const contactByStatus: Record<string, number> = {};
    for (const r of contactRequests) {
      contactByStatus[r.status] = (contactByStatus[r.status] ?? 0) + 1;
    }

    return {
      teacherCount: tutorIds.length,
      studentsCount: studentIds.length,
      batchCount: batches.length,
      activeBatchCount: batches.filter((b) => b.status === 'active').length,
      sessionsToday: todaySessions.filter((s) => s.status !== 'cancelled')
        .length,
      teachersToday: [
        ...new Set(
          todaySessions
            .filter((s) => s.status !== 'cancelled')
            .map((s) => s.tutor_id),
        ),
      ].map((id) => tutorNames.get(id) ?? null),
      pendingLeaveCount: leaveRequests.filter((r) => r.status === 'pending')
        .length,
      upcomingHolidaysCount: academyHolidays.length + govHolidays.length,
      contactRequestsByStatus: contactByStatus,
    };
  }

  // --- Students ----------------------------------------------------------

  async students(
    ownerUserId: string,
    filters: RangeFilters & {
      batchId?: string;
      teacherId?: string;
      studentId?: string;
    },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds: allTutorIds, tutorNames } = await this.activeTeachers(
      academy.id,
    );
    const tutorIds = filters.teacherId
      ? allTutorIds.filter((id) => id === filters.teacherId)
      : allTutorIds;
    const { from, to } = rangeOrDefault(filters, 30);

    const enrollments = await this.batchesRepository.listEnrollmentsForAcademy(
      academy.id,
      'active',
      filters.teacherId ? tutorIds : undefined,
    );
    const scoped = enrollments.filter(
      (e) =>
        (!filters.batchId || e.batch_id === filters.batchId) &&
        (!filters.studentId || e.student_id === filters.studentId),
    );

    const studentIds = [...new Set(scoped.map((e) => e.student_id))];
    const attendanceRows =
      await this.attendanceRepository.summaryForStudentsBetween(
        studentIds,
        from,
        to,
        academy.id,
      );
    const attendanceByStudent = new Map(
      attendanceRows.map((r) => [r.studentId, r]),
    );

    const rows = scoped.map((e) => ({
      studentId: e.student_id,
      displayName: e.display_name,
      batchId: e.batch_id,
      batchTitle: e.batch_title,
      tutorId: e.tutor_id,
      tutorDisplayName: tutorNames.get(e.tutor_id) ?? null,
      gradeLevel: e.grade_level,
      joinedAt: e.joined_at,
      attendance: attendanceByStudent.get(e.student_id) ?? null,
    }));

    const studentsByBatch = new Map<string, number>();
    const studentsByTeacher = new Map<string, number>();
    for (const e of scoped) {
      studentsByBatch.set(
        e.batch_id,
        (studentsByBatch.get(e.batch_id) ?? 0) + 1,
      );
      studentsByTeacher.set(
        e.tutor_id,
        (studentsByTeacher.get(e.tutor_id) ?? 0) + 1,
      );
    }

    return {
      totalStudents: studentIds.length,
      newStudentsInRange: scoped.filter(
        (e) => e.joined_at >= from && e.joined_at < to,
      ).length,
      studentsByBatch: [...studentsByBatch].map(([batchId, count]) => ({
        batchId,
        count,
      })),
      studentsByTeacher: [...studentsByTeacher].map(([tutorId, count]) => ({
        tutorId,
        tutorDisplayName: tutorNames.get(tutorId) ?? null,
        count,
      })),
      rows,
    };
  }

  // --- Teachers ------------------------------------------------------

  async teachers(
    ownerUserId: string,
    filters: RangeFilters & { teacherId?: string },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds: allTutorIds, tutorNames } = await this.activeTeachers(
      academy.id,
    );
    const tutorIds = filters.teacherId
      ? allTutorIds.filter((id) => id === filters.teacherId)
      : allTutorIds;
    const { from, to } = rangeOrDefault(filters, 30);

    const [sessions, leaveRequests] = await Promise.all([
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        from,
        to,
        filters.teacherId ? tutorIds : undefined,
      ),
      this.teacherLeaveRepository.listForAcademyWithTutor(academy.id),
    ]);

    const rows = tutorIds.map((tutorId) => {
      const tutorSessions = sessions.filter((s) => s.tutor_id === tutorId);
      const tutorLeave = leaveRequests.filter((r) => r.tutor_id === tutorId);
      return {
        tutorId,
        tutorDisplayName: tutorNames.get(tutorId) ?? null,
        classCount: tutorSessions.length,
        completedCount: tutorSessions.filter((s) => s.status === 'completed')
          .length,
        cancelledCount: tutorSessions.filter((s) => s.status === 'cancelled')
          .length,
        pendingLeaveCount: tutorLeave.filter((r) => r.status === 'pending')
          .length,
        approvedLeaveCount: tutorLeave.filter((r) => r.status === 'approved')
          .length,
        rejectedLeaveCount: tutorLeave.filter((r) => r.status === 'rejected')
          .length,
      };
    });

    return {
      totalTeachers: allTutorIds.length,
      rows,
    };
  }

  // --- Batches -------------------------------------------------------

  async batches(ownerUserId: string, filters: { teacherId?: string }) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds: allTutorIds, tutorNames } = await this.activeTeachers(
      academy.id,
    );
    const tutorIds = filters.teacherId
      ? allTutorIds.filter((id) => id === filters.teacherId)
      : allTutorIds;

    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    const upcomingTo = now.plus({ days: 14 }).toUTC().toJSDate();

    const [batches, upcomingSessions] = await Promise.all([
      this.batchesRepository.listForAcademy(
        academy.id,
        filters.teacherId ? tutorIds : undefined,
      ),
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        now.toUTC().toJSDate(),
        upcomingTo,
        filters.teacherId ? tutorIds : undefined,
      ),
    ]);

    const upcomingByBatch = new Map<string, number>();
    for (const s of upcomingSessions) {
      if (s.status === 'cancelled') continue;
      upcomingByBatch.set(
        s.batch_id,
        (upcomingByBatch.get(s.batch_id) ?? 0) + 1,
      );
    }

    const rows = batches.map((b) => ({
      batchId: b.id,
      title: b.title,
      tutorId: b.tutor_id,
      tutorDisplayName: tutorNames.get(b.tutor_id) ?? null,
      subjectId: b.subject_id,
      gradeLevelId: b.grade_level_id,
      status: b.status,
      capacity: b.capacity,
      enrolledCount: Number(b.enrolled_count),
      upcomingSessionCount: upcomingByBatch.get(b.id) ?? 0,
    }));

    return {
      totalBatches: batches.length,
      activeBatches: batches.filter((b) => b.status === 'active').length,
      rows,
    };
  }

  // --- Attendance (the detailed absent-students report) ---------------

  /** Real per-student absent rows, not a summary number — see this
   *  feature's plan doc for the corrected algorithm (a student is one
   *  absent row per completed session they weren't present/late for;
   *  never a second, separately-iterated pass over explicit 'absent'
   *  rows, which would double count). Cancelled/holiday/leave sessions
   *  never enter this computation — only `completed` sessions are
   *  considered, so a holiday-cancelled class can never appear as an
   *  absence. Default range is the last 7 days (matching
   *  AcademyOwnerAttendanceService.listAttendanceTable) since this is
   *  the one Reports endpoint whose volume scales with
   *  session-count × roster-size rather than entity count alone. */
  async attendance(
    ownerUserId: string,
    filters: RangeFilters & {
      batchId?: string;
      teacherId?: string;
      studentId?: string;
    },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds: allTutorIds, tutorNames } = await this.activeTeachers(
      academy.id,
    );
    const tutorIds = filters.teacherId
      ? allTutorIds.filter((id) => id === filters.teacherId)
      : allTutorIds;
    const { from, to } = rangeOrDefault(filters, 7);

    const [sessions, enrollments] = await Promise.all([
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        from,
        to,
        filters.teacherId ? tutorIds : undefined,
      ),
      this.batchesRepository.listEnrollmentsForAcademy(
        academy.id,
        'active',
        filters.teacherId ? tutorIds : undefined,
      ),
    ]);

    const completedSessions = sessions.filter(
      (s) =>
        s.status === 'completed' &&
        (!filters.batchId || s.batch_id === filters.batchId),
    );
    const batchIds = [...new Set(completedSessions.map((s) => s.batch_id))];
    const attendanceRows =
      batchIds.length > 0
        ? await this.attendanceRepository.listForBatches(batchIds)
        : [];

    const enrollmentsByBatch = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      const list = enrollmentsByBatch.get(e.batch_id) ?? [];
      list.push(e);
      enrollmentsByBatch.set(e.batch_id, list);
    }
    const attendanceBySession = new Map<string, typeof attendanceRows>();
    for (const row of attendanceRows) {
      const list = attendanceBySession.get(row.session_id) ?? [];
      list.push(row);
      attendanceBySession.set(row.session_id, list);
    }

    const rows: Array<{
      sessionId: string;
      studentId: string;
      displayName: string | null;
      batchId: string;
      batchTitle: string;
      tutorId: string;
      tutorDisplayName: string | null;
      subjectId: string;
      scheduledStartUtc: Date;
      timezone: string;
      status: 'absent';
    }> = [];

    for (const session of completedSessions) {
      const rowsForSession = attendanceBySession.get(session.id) ?? [];
      const presentOrLateIds = new Set(
        rowsForSession
          .filter((r) => r.status === 'present' || r.status === 'late')
          .map((r) => r.student_id),
      );
      const activeEnrollments = enrollmentsByBatch.get(session.batch_id) ?? [];

      // Roster = active enrollments UNION any student with an actual
      // attendance row for this session — recovers a since-left
      // student's own historical row (they may have had an explicit
      // 'absent' row, or simply none). A left student with zero
      // attendance row for a session during their enrollment is
      // unrecoverable from the current schema, same accepted limitation
      // AcademyOwnerAttendanceService.listAttendanceTable already has.
      const rosterIds = new Set<string>([
        ...activeEnrollments.map((e) => e.student_id),
        ...rowsForSession.map((r) => r.student_id),
      ]);

      for (const studentId of rosterIds) {
        if (presentOrLateIds.has(studentId)) continue;
        if (filters.studentId && studentId !== filters.studentId) continue;

        const enrollment = activeEnrollments.find(
          (e) => e.student_id === studentId,
        );
        const historicalRow = rowsForSession.find(
          (r) => r.student_id === studentId,
        );

        rows.push({
          sessionId: session.id,
          studentId,
          displayName:
            enrollment?.display_name ?? historicalRow?.display_name ?? null,
          batchId: session.batch_id,
          batchTitle: session.batch_title,
          tutorId: session.tutor_id,
          tutorDisplayName: tutorNames.get(session.tutor_id) ?? null,
          subjectId: session.subject_id,
          scheduledStartUtc: session.scheduled_start_utc,
          timezone: session.timezone,
          status: 'absent',
        });
      }
    }

    rows.sort(
      (a, b) =>
        new Date(b.scheduledStartUtc).getTime() -
        new Date(a.scheduledStartUtc).getTime(),
    );

    return { totalAbsences: rows.length, rows };
  }

  // --- Sessions --------------------------------------------------------

  async sessions(
    ownerUserId: string,
    filters: RangeFilters & {
      batchId?: string;
      teacherId?: string;
      status?: string;
    },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds: allTutorIds, tutorNames } = await this.activeTeachers(
      academy.id,
    );
    const tutorIds = filters.teacherId
      ? allTutorIds.filter((id) => id === filters.teacherId)
      : allTutorIds;
    const { from, to } = rangeOrDefault(filters, 30);

    const sessions = await this.sessionsRepository.listForAcademyBetween(
      academy.id,
      from,
      to,
      filters.teacherId ? tutorIds : undefined,
    );
    const scoped = sessions.filter(
      (s) =>
        (!filters.batchId || s.batch_id === filters.batchId) &&
        (!filters.status || s.status === filters.status),
    );

    const byTeacher = new Map<string, number>();
    const byBatch = new Map<string, number>();
    const byDate = new Map<string, number>();
    for (const s of scoped) {
      byTeacher.set(s.tutor_id, (byTeacher.get(s.tutor_id) ?? 0) + 1);
      byBatch.set(s.batch_id, (byBatch.get(s.batch_id) ?? 0) + 1);
      const key = dateKey(s.scheduled_start_utc, DEFAULT_TIMEZONE);
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }

    return {
      total: scoped.length,
      completed: scoped.filter((s) => s.status === 'completed').length,
      cancelled: scoped.filter((s) => s.status === 'cancelled').length,
      scheduled: scoped.filter((s) => s.status === 'scheduled').length,
      byTeacher: [...byTeacher].map(([tutorId, count]) => ({
        tutorId,
        tutorDisplayName: tutorNames.get(tutorId) ?? null,
        count,
      })),
      byBatch: [...byBatch].map(([batchId, count]) => ({ batchId, count })),
      byDate: [...byDate].map(([date, count]) => ({ date, count })),
      rows: scoped
        .map((s) => ({
          sessionId: s.id,
          scheduledStartUtc: s.scheduled_start_utc,
          timezone: s.timezone,
          batchId: s.batch_id,
          batchTitle: s.batch_title,
          subjectId: s.subject_id,
          tutorId: s.tutor_id,
          tutorDisplayName: tutorNames.get(s.tutor_id) ?? null,
          status: s.status,
          cancellationReason: s.cancellation_reason,
        }))
        .sort(
          (a, b) =>
            new Date(b.scheduledStartUtc).getTime() -
            new Date(a.scheduledStartUtc).getTime(),
        ),
    };
  }

  // --- Leave -----------------------------------------------------------

  async leave(
    ownerUserId: string,
    filters: RangeFilters & { teacherId?: string; status?: string },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);

    const allRequests =
      await this.teacherLeaveRepository.listForAcademyWithTutor(academy.id);
    const scoped = allRequests.filter(
      (r) =>
        (!filters.teacherId || r.tutor_id === filters.teacherId) &&
        (!filters.status || r.status === filters.status) &&
        (!filters.from || r.end_date >= filters.from) &&
        (!filters.to || r.start_date <= filters.to),
    );

    const affectedByRequest =
      await this.sessionsRepository.countByLeaveRequestForAcademy(
        academy.id,
        scoped.map((r) => r.id),
      );

    return {
      pendingCount: scoped.filter((r) => r.status === 'pending').length,
      approvedCount: scoped.filter((r) => r.status === 'approved').length,
      rejectedCount: scoped.filter((r) => r.status === 'rejected').length,
      rows: scoped.map((r) => ({
        id: r.id,
        tutorId: r.tutor_id,
        tutorDisplayName: r.tutor_display_name,
        startDate: r.start_date,
        endDate: r.end_date,
        leaveType: r.leave_type,
        reason: r.reason,
        status: r.status,
        classesAffected: affectedByRequest.get(r.id) ?? 0,
      })),
    };
  }

  // --- Holidays ----------------------------------------------------------

  async holidays(ownerUserId: string, filters: RangeFilters) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    const from = filters.from ?? now.minus({ days: 30 }).toISODate()!;
    const to = filters.to ?? now.plus({ days: 90 }).toISODate()!;

    const [academyHolidays, govHolidays] = await Promise.all([
      this.holidaysRepository.listForAcademy(academy.id, from, to),
      this.holidaysRepository.listGovernment(
        academy.country_code,
        academy.state_code,
        from,
        to,
      ),
    ]);

    const allHolidays = [...academyHolidays, ...govHolidays];
    const affectedByHoliday =
      await this.sessionsRepository.countByHolidayForAcademy(
        academy.id,
        allHolidays.map((h) => h.id),
      );

    return {
      governmentCount: govHolidays.length,
      academyCount: academyHolidays.length,
      rows: allHolidays
        .map((h) => ({
          id: h.id,
          type: h.type,
          name: h.name,
          startDate: h.start_date,
          endDate: h.end_date,
          affectedClasses: affectedByHoliday.get(h.id) ?? 0,
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  }

  // --- Contact requests --------------------------------------------------

  async contactRequests(ownerUserId: string, filters: RangeFilters) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const all = await this.academyContactRequestsRepository.listForAcademy(
      academy.id,
    );
    const scoped = all.filter((r) => {
      const created = dateKey(r.created_at, DEFAULT_TIMEZONE);
      return (
        (!filters.from || created >= filters.from) &&
        (!filters.to || created <= filters.to)
      );
    });

    const byStatus: Record<string, number> = {};
    for (const r of scoped) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    return {
      total: scoped.length,
      byStatus,
      rows: scoped.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        name: r.student_display_name,
        email: r.email,
        phone: r.phone_e164,
        status: r.status,
      })),
    };
  }
}
