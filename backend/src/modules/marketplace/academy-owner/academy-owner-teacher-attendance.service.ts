import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import {
  TeacherAttendanceRepository,
  type TeacherAttendanceStatus,
} from '../../scheduling/attendance/teacher-attendance.repository';
import type { ClassSessionCancellationReason } from '../../../database/types';
import type { MarkTeacherAttendanceDto } from './dto/mark-teacher-attendance.dto';

// Same zone every other Academy Owner / Holiday / Teacher Leave service
// uses for "what day is it" boundaries — kept as a local constant rather
// than a shared import, per this codebase's existing convention (see
// academy-owner-attendance.service.ts).
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export type TeacherAttendanceOutcome =
  | 'present'
  | 'absent'
  | 'approved_leave'
  | 'holiday'
  | 'cancelled'
  | 'not_recorded';

interface SessionWithCancellation {
  id: string;
  batch_id: string;
  tutor_id: string;
  scheduled_start_utc: Date | string;
  batch_title: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  cancellation_reason: ClassSessionCancellationReason | null;
  substitute_tutor_id: string | null;
}

interface TeacherAttendanceFilters {
  from?: string;
  to?: string;
  teacherId?: string;
  status?: string;
  batchId?: string;
}

/**
 * Academy-wide Teacher Attendance (Academic > Attendance > Teacher, new
 * feature) — deliberately separate from AcademyOwnerAttendanceService
 * (student attendance) above it: no shared repository, no shared write
 * path. Composes SessionsRepository (already used for the Student
 * Attendance dashboard) with the new TeacherAttendanceRepository.
 *
 * Core invariant: SCHEDULED ≠ PRESENT. A session with no
 * teacher_attendance row is 'not_recorded', never automatically present.
 * A session already covered by a substitute (approved leave with a
 * replacement teacher) is conclusively 'approved_leave' for the original
 * teacher — it is not open to marking at all, since the original teacher
 * didn't teach it (see markAttendance). Holiday/manual cancellations
 * never produce an absence either. See deriveOutcome for the single
 * place all of this is decided.
 */
@Injectable()
export class AcademyOwnerTeacherAttendanceService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly teacherAttendanceRepository: TeacherAttendanceRepository,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  /** `tutorIds` = ACTIVE teachers, only ever used to narrow a teacher
   *  filter — every session read is scoped to classes the academy OWNS
   *  (batches.academy_id), never to "sessions of my active teachers", so a
   *  member's Individual classes can't be listed or marked here.
   *  `tutorNames` also covers teachers who have left (historical rows). */
  private async activeTutorIds(academyId: string) {
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

  /** The one place a session's teacher-attendance outcome is decided —
   *  every endpoint below routes through this so the rules can never
   *  drift apart between the summary, the table, and the detail view. */
  private deriveOutcome(
    session: SessionWithCancellation,
    attendanceBySession: Map<string, TeacherAttendanceStatus>,
  ): TeacherAttendanceOutcome {
    if (session.status === 'cancelled') {
      if (session.cancellation_reason === 'teacher_leave')
        return 'approved_leave';
      if (
        session.cancellation_reason === 'government_holiday' ||
        session.cancellation_reason === 'academy_holiday'
      )
        return 'holiday';
      return 'cancelled';
    }
    // A substitute covers the class — the original teacher's slot is
    // conclusively leave, regardless of whether the substitute was
    // separately marked (the substitute's own coverage isn't tracked as
    // its own attendance record in this pass — see markAttendance).
    if (session.substitute_tutor_id) return 'approved_leave';

    const recorded = attendanceBySession.get(session.id);
    if (!recorded) return 'not_recorded';
    return recorded;
  }

  /** Today's summary cards — classes today, teachers expected,
   *  present/absent/on-leave, attendance %. */
  async getTodaySummary(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    const sessions: SessionWithCancellation[] =
      await this.sessionsRepository.listForAcademyBetween(
        academy.id,
        startOfDay,
        endOfDay,
      );

    const attendanceRows =
      await this.teacherAttendanceRepository.findBySessionIds(
        sessions.map((s) => s.id),
      );
    const attendanceBySession = new Map(
      attendanceRows.map((r) => [r.session_id, r.status]),
    );

    const activeSessions = sessions.filter((s) => s.status !== 'cancelled');
    const outcomes = activeSessions.map((s) =>
      this.deriveOutcome(s, attendanceBySession),
    );
    const present = outcomes.filter((o) => o === 'present').length;
    const absent = outcomes.filter((o) => o === 'absent').length;
    const onLeave = outcomes.filter((o) => o === 'approved_leave').length;
    const marked = present + absent;

    const teachersExpected = new Set(
      activeSessions
        .filter((s) => !s.substitute_tutor_id)
        .map((s) => s.tutor_id),
    ).size;

    return {
      classesToday: activeSessions.length,
      teachersExpected,
      present,
      absent,
      onLeave,
      attendancePercent:
        marked === 0 ? null : Math.round((present / marked) * 100),
    };
  }

  /** The Teacher Attendance table — one row per (date, teacher):
   *  scheduled classes / present / absent / approved leave / % for that
   *  day, derived from the same outcome function as everything else. */
  async listAttendanceTable(
    ownerUserId: string,
    filters: TeacherAttendanceFilters,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { tutorIds: allTutorIds, tutorNames } = await this.activeTutorIds(
      academy.id,
    );
    const tutorIds = filters.teacherId
      ? allTutorIds.filter((id) => id === filters.teacherId)
      : allTutorIds;

    const to = filters.to ? new Date(filters.to) : new Date();
    const from = filters.from
      ? new Date(filters.from)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sessions: SessionWithCancellation[] =
      await this.sessionsRepository.listForAcademyBetween(
        academy.id,
        from,
        to,
        filters.teacherId ? tutorIds : undefined,
      );
    const scoped = sessions.filter(
      (s) => !filters.batchId || s.batch_id === filters.batchId,
    );

    const attendanceRows =
      await this.teacherAttendanceRepository.findBySessionIds(
        scoped.map((s) => s.id),
      );
    const attendanceBySession = new Map(
      attendanceRows.map((r) => [r.session_id, r.status]),
    );

    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      {
        date: string;
        teacherId: string;
        classes: number;
        present: number;
        absent: number;
        approvedLeave: number;
      }
    >();

    for (const session of scoped) {
      const date = DateTime.fromJSDate(new Date(session.scheduled_start_utc))
        .setZone(DEFAULT_TIMEZONE)
        .toFormat('yyyy-LL-dd');
      const key = `${date}::${session.tutor_id}`;
      const group = groups.get(key) ?? {
        date,
        teacherId: session.tutor_id,
        classes: 0,
        present: 0,
        absent: 0,
        approvedLeave: 0,
      };
      group.classes += 1;
      const outcome = this.deriveOutcome(session, attendanceBySession);
      if (outcome === 'present') group.present += 1;
      else if (outcome === 'absent') group.absent += 1;
      else if (outcome === 'approved_leave') group.approvedLeave += 1;
      groups.set(key, group);
    }

    return [...groups.values()]
      .map((g) => {
        const marked = g.present + g.absent;
        return {
          date: g.date,
          teacherId: g.teacherId,
          teacherDisplayName: tutorNames.get(g.teacherId) ?? null,
          scheduledClasses: g.classes,
          present: g.present,
          absent: g.absent,
          approvedLeave: g.approvedLeave,
          attendancePercent:
            marked === 0 ? null : Math.round((g.present / marked) * 100),
        };
      })
      .filter(
        (row) => !filters.status || this.rowMatchesStatus(row, filters.status),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  private rowMatchesStatus(
    row: { present: number; absent: number; approvedLeave: number },
    status: string,
  ): boolean {
    if (status === 'present') return row.present > 0;
    if (status === 'absent') return row.absent > 0;
    if (status === 'approved_leave') return row.approvedLeave > 0;
    return true;
  }

  /** A single teacher's attendance summary + session-level history over a
   *  date range — ownership-checked the same way getBatchAttendance
   *  checks a batch (active membership in the caller's academy). */
  async getTeacherAttendance(
    ownerUserId: string,
    teacherId: string,
    range: { from?: string; to?: string },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const membership =
      await this.academyMembershipsRepository.findActiveMembership(
        academy.id,
        teacherId,
      );
    if (!membership) {
      throw new ForbiddenException("That teacher isn't active at your academy");
    }
    const { tutorNames } = await this.activeTutorIds(academy.id);

    const to = range.to ? new Date(range.to) : new Date();
    const from = range.from
      ? new Date(range.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const sessions: SessionWithCancellation[] =
      await this.sessionsRepository.listForAcademyBetween(
        academy.id,
        from,
        to,
        [teacherId],
      );
    const attendanceRows =
      await this.teacherAttendanceRepository.findBySessionIds(
        sessions.map((s) => s.id),
      );
    const attendanceBySession = new Map(
      attendanceRows.map((r) => [r.session_id, r.status]),
    );

    let present = 0;
    let absent = 0;
    let approvedLeave = 0;
    const history = sessions
      .map((s) => {
        const outcome = this.deriveOutcome(s, attendanceBySession);
        if (outcome === 'present') present += 1;
        else if (outcome === 'absent') absent += 1;
        else if (outcome === 'approved_leave') approvedLeave += 1;
        return {
          sessionId: s.id,
          scheduledStartUtc: s.scheduled_start_utc,
          batchId: s.batch_id,
          batchTitle: s.batch_title,
          status: outcome,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.scheduledStartUtc).getTime() -
          new Date(a.scheduledStartUtc).getTime(),
      );

    const marked = present + absent;
    return {
      teacherId,
      teacherDisplayName: tutorNames.get(teacherId) ?? null,
      summary: {
        scheduledClasses: sessions.length,
        present,
        absent,
        approvedLeave,
        attendancePercent:
          marked === 0 ? null : Math.round((present / marked) * 100),
      },
      history,
    };
  }

  /** Records Present/Absent for one session — the only write path for
   *  Teacher Attendance. Rejects a cancelled session (mirrors
   *  AttendanceService's identical invariant for student attendance) and
   *  a session already covered by a substitute (that slot is
   *  conclusively the original teacher's approved leave, not open to
   *  marking — see deriveOutcome). */
  async markAttendance(ownerUserId: string, dto: MarkTeacherAttendanceDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    // Only a class this academy OWNS can be marked — a member teacher's
    // Individual class (or another academy's) is "not found", so the
    // academy can neither read nor write attendance for private teaching.
    const session = await this.sessionsRepository.findByIdInAcademy(
      dto.sessionId,
      academy.id,
    );
    if (!session) throw new NotFoundException('Class session not found');
    if (session.status === 'cancelled') {
      throw new BadRequestException(
        'A cancelled class has nothing to record attendance for',
      );
    }
    if (session.substitute_tutor_id) {
      throw new BadRequestException(
        "This class is covered by a substitute — it's already recorded as the teacher's approved leave",
      );
    }

    return this.teacherAttendanceRepository.upsert(
      dto.sessionId,
      session.tutor_id,
      dto.status,
      ownerUserId,
    );
  }
}
