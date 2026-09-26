import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { HolidaysRepository } from './holidays.repository';
import { HOLIDAY_TIMEZONE, holidayDayRangeUtc } from './holiday-calendar';
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

// Holiday dates resolve in HOLIDAY_TIMEZONE — shared with class creation
// (see holiday-calendar.ts), so declaring a holiday and scheduling a class
// always agree on which day a class falls on.
const DEFAULT_TIMEZONE = HOLIDAY_TIMEZONE;

export interface CreateAcademyHolidayInput {
  name: string;
  startDate: string;
  endDate?: string;
  scope: HolidayScope;
  batchIds?: string[];
  description?: string | null;
}

const dayRangeUtc = holidayDayRangeUtc;

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

    // Batch-scoped holidays may only target batches this academy OWNS
    // (checked up front; a DB trigger enforces the same on insert).
    if (input.scope === 'batches') {
      for (const batchId of new Set(input.batchIds)) {
        const batch = await this.batchesRepository.findByIdInAcademy(
          batchId,
          academyId,
        );
        if (!batch) throw new NotFoundException('Batch not found');
      }
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
    // Only the academy's OWN classes (batches.academy_id) are candidates
    // — never every class of its member teachers — so an academy or
    // government holiday can't cancel a teacher's Individual class.
    let sessions = await this.sessionsRepository.listScheduledForAcademyBetween(
      academyId,
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
      : (
          await this.batchesRepository.listEnrollmentsForAcademy(
            academyId,
            'active',
          )
        )
          .map((e) => e.student_id)
          .filter((id, i, all) => all.indexOf(id) === i);
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
      // H7: the check above is read-then-write, so two overlapping runs
      // (the daily cron re-scanning while an admin re-applies, say) could
      // both pass it. One notice per (holiday, academy, user) is enforced
      // by the unique index instead — a different holiday or academy is a
      // different key, never merged.
      dedupeKey: `holiday:${holiday.id}:${academyId}`,
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

    // The academies whose OWN batches the student is enrolled in — a
    // student in a teacher's Individual batch gets no academy's holidays
    // just because that teacher is a member somewhere.
    return this.batchesRepository.listAcademyIdsForStudents(studentIds);
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
