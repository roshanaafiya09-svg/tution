import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { HolidaysRepository } from './holidays.repository';
import { AcademiesRepository } from '../marketplace/academies/academies.repository';
import { AcademyMembershipsRepository } from '../marketplace/academy-memberships/academy-memberships.repository';
import { BatchesRepository } from '../scheduling/batches/batches.repository';
import { SessionsRepository } from '../scheduling/sessions/sessions.repository';
import { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { Selectable } from 'kysely';
import type {
  HolidayScope,
  HolidaysTable,
  UserRole,
} from '../../database/types';

// V1 only ever schedules classes in this zone (see DEFAULT_TIMEZONE
// elsewhere in the codebase, e.g. sessions.service.ts) — holiday dates
// are plain calendar dates, so they need one IANA zone to resolve to a
// UTC instant range. Not extracted to a shared constant: every other
// occurrence of this string in the codebase is already its own local
// copy (see the plan's "Known limitations"); adding a fifth one here
// isn't a new problem this feature introduces.
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface CreateAcademyHolidayInput {
  name: string;
  startDate: string;
  endDate?: string;
  scope: HolidayScope;
  batchIds?: string[];
  description?: string | null;
}

function dayRangeUtc(startDate: string, endDate: string) {
  const from = DateTime.fromISO(startDate, { zone: DEFAULT_TIMEZONE })
    .startOf('day')
    .toUTC()
    .toJSDate();
  const to = DateTime.fromISO(endDate, { zone: DEFAULT_TIMEZONE })
    .endOf('day')
    .toUTC()
    .toJSDate();
  return { from, to };
}

/**
 * The spec's `HolidayService` — reusable across government and academy
 * holidays, and designed so a second Indian state is pure data (see
 * migration 0035's doc comment on `state_code`), never a new code path.
 */
@Injectable()
export class HolidayService {
  constructor(
    private readonly repository: HolidaysRepository,
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Academy Dashboard's Holiday calendar — government (only if the
   *  academy opts in) + academy-declared, categorized separately so the
   *  UI can label them per the spec (§14). Deliberately NOT gated by
   *  whether cancellation has actually run yet — a holiday is visible
   *  in the calendar the moment it exists, well before its date. */
  async listEffectiveForAcademy(academyId: string, from: string, to: string) {
    const academy = await this.academiesRepository.findById(academyId);
    if (!academy) throw new NotFoundException('Academy not found');

    const academyHolidays = await this.repository.listForAcademy(
      academyId,
      from,
      to,
    );
    const governmentHolidays = academy.auto_observe_govt_holidays
      ? await this.repository.listGovernment(
          academy.country_code,
          academy.state_code,
          from,
          to,
        )
      : [];
    return { governmentHolidays, academyHolidays };
  }

  /** Read-only sibling for a teacher/student/parent who may be
   *  connected to more than one academy — merges each academy's
   *  effective holidays, de-duplicated by holiday id (a national
   *  government holiday looked up twice for two academies in the same
   *  state is one holiday, not two). */
  async listEffectiveForAcademies(
    academyIds: string[],
    from: string,
    to: string,
  ) {
    const seen = new Map<string, Selectable<HolidaysTable>>();
    for (const academyId of [...new Set(academyIds)]) {
      const { governmentHolidays, academyHolidays } =
        await this.listEffectiveForAcademy(academyId, from, to);
      for (const h of [...governmentHolidays, ...academyHolidays]) {
        seen.set(h.id, h);
      }
    }
    return [...seen.values()].sort((a, b) =>
      a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
    );
  }

  async createAcademyHoliday(
    academyId: string,
    input: CreateAcademyHolidayInput,
    createdBy: string,
  ) {
    const endDate = input.endDate ?? input.startDate;
    if (endDate < input.startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }
    if (
      input.scope === 'batches' &&
      (!input.batchIds || input.batchIds.length === 0)
    ) {
      throw new BadRequestException(
        'Select at least one batch for a batch-scoped holiday',
      );
    }

    const holiday = await this.repository.createAcademyHoliday({
      academyId,
      name: input.name,
      startDate: input.startDate,
      endDate,
      scope: input.scope,
      description: input.description ?? null,
      createdBy,
    });

    if (input.scope === 'batches') {
      await this.repository.setBatchScope(holiday.id, input.batchIds!);
    }

    // Academy holidays take effect immediately, however far in advance
    // they're declared — unlike government holidays (seeded a year
    // ahead), there's no "wait for the date" step here (see the plan's
    // "Known scope decisions" for why the notification copy uses an
    // absolute date rather than "today"/"tomorrow").
    await this.applyHolidayForAcademy(holiday.id, academyId);
    return holiday;
  }

  async deleteAcademyHoliday(
    academyId: string,
    holidayId: string,
  ): Promise<void> {
    const holiday = await this.repository.findAcademyHoliday(
      holidayId,
      academyId,
    );
    if (!holiday) throw new NotFoundException('Holiday not found');
    await this.repository.delete(holidayId);
  }

  /**
   * Idempotent: cancels every not-yet-cancelled `scheduled` session in
   * the holiday's date range for this academy's relevant tutors/batches,
   * then notifies the affected students/parents/teachers exactly once
   * per (holiday, academy) — re-running this (a retried request, or the
   * daily government-holiday cron re-scanning a multi-day holiday) never
   * double-cancels or double-notifies, via the same "check recent
   * notifications for this exact payload before sending" pattern
   * AttendanceService.maybeAlertOnRepeatedAbsence already uses.
   */
  async applyHolidayForAcademy(
    holidayId: string,
    academyId: string,
  ): Promise<void> {
    const holiday = await this.repository.findById(holidayId);
    if (!holiday) return;

    const activeMembers =
      await this.academyMembershipsRepository.listActiveForAcademy(academyId);
    const allTutorIds = activeMembers.map((m) => m.tutor_id);

    let batchIds: string[] | null = null;
    if (holiday.type === 'academy_holiday' && holiday.scope === 'batches') {
      batchIds = await this.repository.listBatchIdsForHoliday(holidayId);
    }

    const { from, to } = dayRangeUtc(holiday.start_date, holiday.end_date);
    let sessions = await this.sessionsRepository.listScheduledForTutorsBetween(
      allTutorIds,
      from,
      to,
    );
    if (batchIds) {
      const batchIdSet = new Set(batchIds);
      sessions = sessions.filter((s) => batchIdSet.has(s.batch_id));
    }

    const reason =
      holiday.type === 'government_holiday'
        ? 'government_holiday'
        : 'academy_holiday';
    for (const session of sessions) {
      await this.sessionsRepository.setHolidayOrLeaveCancellation(
        session.id,
        reason,
        {
          holidayId: holiday.id,
        },
      );
    }

    // Recipients: batch-scoped holidays only reach that batch's roster +
    // the teacher(s) running it; an academy-wide holiday (or a
    // government holiday, which is always academy-wide when observed)
    // reaches every active student/parent/teacher — never "the whole
    // academy" for a batch-scoped one, matching the spec's recipient
    // rules exactly.
    const academy = await this.academiesRepository.findById(academyId);
    const teacherIds = batchIds
      ? await this.batchesRepository.listDistinctTutorIdsForBatches(batchIds)
      : allTutorIds;
    const studentIds = batchIds
      ? await this.batchesRepository.listDistinctStudentIdsForBatches(batchIds)
      : await this.batchesRepository.listDistinctStudentIdsForTutors(
          allTutorIds,
        );
    const parentIds =
      await this.attendanceRepository.listActiveParentIdsForStudents(
        studentIds,
      );

    const candidateIds = [
      ...new Set([...studentIds, ...parentIds, ...teacherIds]),
    ];
    if (candidateIds.length === 0 || !academy) return;

    const dateLabel =
      holiday.start_date === holiday.end_date
        ? DateTime.fromISO(holiday.start_date).toFormat('d LLL yyyy')
        : `${DateTime.fromISO(holiday.start_date).toFormat('d LLL')} – ${DateTime.fromISO(holiday.end_date).toFormat('d LLL yyyy')}`;
    const title =
      reason === 'government_holiday'
        ? '🇮🇳 Holiday Notice'
        : '🔔 Academy Holiday';
    const body =
      reason === 'government_holiday'
        ? `${holiday.name} is a government holiday on ${dateLabel}. There will be no scheduled tuition classes at ${academy.name} on this date.`
        : `${academy.name} will be closed on ${dateLabel} for ${holiday.name}. There will be no tuition classes.`;

    // Same recent-notification-by-type-and-payload dedupe
    // AttendanceService uses — never notify the same user about the
    // same holiday twice, however many times this method re-runs.
    const since = new Date(0);
    const recipientIds: string[] = [];
    for (const userId of candidateIds) {
      const recent = await this.notificationsService.listRecentForUserByType(
        userId,
        reason,
        since,
      );
      const alreadyNotified = recent.some((n) => {
        const payload = n.payload as { holidayId?: string; academyId?: string };
        return (
          payload.holidayId === holiday.id && payload.academyId === academyId
        );
      });
      if (!alreadyNotified) recipientIds.push(userId);
    }
    if (recipientIds.length === 0) return;

    await this.notificationsService.notify({
      userIds: recipientIds,
      type: reason,
      title,
      body,
      payload: {
        holidayId: holiday.id,
        academyId,
        startDate: holiday.start_date,
        endDate: holiday.end_date,
      },
    });
  }

  /** Which academies are relevant to a non-academy caller's own holiday
   *  view — a tutor's own active memberships, or (for a student/parent)
   *  the academies reachable through their enrolled/linked children's
   *  batches' teachers. Used by HolidaysController's read-only `/holidays/me`. */
  async resolveAcademyIdsForRole(user: {
    sub: string;
    roles: UserRole[];
  }): Promise<string[]> {
    if (user.roles.includes('tutor')) {
      const memberships =
        await this.academyMembershipsRepository.listActiveForTutor(user.sub);
      return memberships.map((m) => m.id);
    }

    let studentIds: string[] = [];
    if (user.roles.includes('student')) {
      studentIds = [user.sub];
    } else if (user.roles.includes('parent')) {
      studentIds = await this.attendanceRepository.listActiveChildIdsForParent(
        user.sub,
      );
    }
    if (studentIds.length === 0) return [];

    const tutorIds = new Set<string>();
    for (const studentId of studentIds) {
      const batches = await this.batchesRepository.listForStudent(studentId);
      for (const batch of batches) tutorIds.add(batch.tutor_id);
    }
    return this.academyMembershipsRepository.listActiveAcademyIdsForTutors([
      ...tutorIds,
    ]);
  }

  /** Daily cron entry point (RemindersModule) — sweeps every academy
   *  that has opted into automatic government-holiday observance and
   *  applies any holiday covering today in that academy's own
   *  country/state. Safe to call as often as needed: applyHolidayForAcademy
   *  is fully idempotent. */
  async applyGovernmentHolidaysForToday(): Promise<void> {
    const today = DateTime.now().setZone(DEFAULT_TIMEZONE).toISODate();
    if (!today) return;

    const academies =
      await this.academiesRepository.listAutoObservingGovtHolidays();
    for (const academy of academies) {
      const holidaysToday = await this.repository.listGovernmentActiveOn(
        academy.country_code,
        academy.state_code,
        today,
      );
      for (const holiday of holidaysToday) {
        await this.applyHolidayForAcademy(holiday.id, academy.id);
      }
    }
  }
}
