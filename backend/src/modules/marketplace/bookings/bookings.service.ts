import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { BookingsRepository } from './bookings.repository';
import { TutorSubjectsRepository } from '../../catalog/tutor-subjects/tutor-subjects.repository';
import { AvailabilityRepository } from '../../catalog/availability/availability.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { WaitlistsService } from '../waitlists/waitlists.service';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import type { CancelBookingDto } from './dto/cancel-booking.dto';
import { RESCHEDULE_POLICY, refundPercentForNotice } from './policy';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

interface AvailabilityWindow {
  weekday: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
}

interface AvailabilityException {
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
}

/**
 * 1:1 marketplace bookings (blueprint §5/§9/§10 Phase 4). Slot
 * validation reads the tutor's existing bookable windows
 * (CatalogModule's AvailabilityRepository — no new availability data)
 * and checks both other bookings and batch class_sessions for
 * double-booking, matching how BatchesService enforces capacity in
 * code rather than a DB constraint.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly repository: BookingsRepository,
    private readonly tutorSubjectsRepository: TutorSubjectsRepository,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly waitlistsService: WaitlistsService,
    private readonly config: ConfigService,
  ) {}

  async create(studentId: string, dto: CreateBookingDto) {
    const tutorSubject = await this.tutorSubjectsRepository.findById(
      dto.tutorSubjectId,
    );
    if (!tutorSubject) {
      throw new NotFoundException('Tutor subject offering not found');
    }

    const { scheduledStartUtc, timezone } = await this.resolveValidSlot(
      tutorSubject.tutor_id,
      dto.startLocal,
      dto.timezone,
      dto.durationMin,
    );

    const amountMinor = Math.round(
      (tutorSubject.hourly_rate_minor * dto.durationMin) / 60,
    );
    const takeRatePercent =
      this.config.get<number>('marketplace.takeRatePercent') ?? 0;
    const platformFeeMinor = Math.round((amountMinor * takeRatePercent) / 100);

    if (dto.waitlistId) {
      await this.waitlistsService.assertConvertible(
        dto.waitlistId,
        studentId,
        dto.tutorSubjectId,
      );
    }

    const booking = await this.repository.create({
      tutorId: tutorSubject.tutor_id,
      studentId,
      subjectId: tutorSubject.subject_id,
      hourlyRateMinor: tutorSubject.hourly_rate_minor,
      amountMinor,
      platformFeeMinor,
      currency: 'INR',
      scheduledStartUtc,
      timezone,
      durationMin: dto.durationMin,
      meetingUrl: dto.meetingUrl ?? null,
    });

    if (dto.waitlistId) {
      await this.waitlistsService.convert(dto.waitlistId, booking.id);
    }

    return booking;
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  /** Read-only accessor for ReviewsModule's verified-session gate —
   *  avoids exposing the repository itself outside this module. */
  hasCompletedBookingWith(studentId: string, tutorId: string) {
    return this.repository.hasCompletedBetween(tutorId, studentId);
  }

  /** Loaded and validated by PaymentsService before creating an order —
   *  mirrors the ownership + status checks initiateFeeOrder does inline. */
  async assertPayableByStudent(bookingId: string, studentId: string) {
    const booking = await this.repository.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.student_id !== studentId) {
      throw new ForbiddenException('Not your booking');
    }
    if (booking.status !== 'pending_payment') {
      throw new BadRequestException(`Booking is already ${booking.status}`);
    }
    return booking;
  }

  /** Called by PaymentsService on capture. */
  markConfirmed(bookingId: string) {
    return this.repository.markConfirmed(bookingId);
  }

  /** Read-only accessor for PaymentsService's refund flow — avoids
   *  exposing the repository itself outside this module. */
  async getForRefund(bookingId: string) {
    const booking = await this.repository.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async reschedule(
    userId: string,
    bookingId: string,
    dto: RescheduleBookingDto,
  ) {
    const booking = await this.getOwnedConfirmedBooking(bookingId, userId);

    if (
      booking.reschedule_count >= RESCHEDULE_POLICY.maxReschedulesPerBooking
    ) {
      throw new BadRequestException(
        `This booking has already been rescheduled the maximum of ${RESCHEDULE_POLICY.maxReschedulesPerBooking} times`,
      );
    }
    const noticeHours =
      (new Date(booking.scheduled_start_utc).getTime() - Date.now()) /
      (60 * 60 * 1000);
    if (noticeHours < RESCHEDULE_POLICY.minNoticeHours) {
      throw new BadRequestException(
        `Reschedule requires at least ${RESCHEDULE_POLICY.minNoticeHours}h notice`,
      );
    }

    const { scheduledStartUtc } = await this.resolveValidSlot(
      booking.tutor_id,
      dto.startLocal,
      dto.timezone ?? booking.timezone,
      booking.duration_min,
      bookingId,
    );

    return this.repository.rescheduleTo(
      bookingId,
      scheduledStartUtc,
      new Date(booking.scheduled_start_utc),
    );
  }

  async cancel(userId: string, bookingId: string, dto: CancelBookingDto) {
    const booking = await this.getOwnedBooking(bookingId, userId);
    if (
      booking.status !== 'pending_payment' &&
      booking.status !== 'confirmed'
    ) {
      throw new BadRequestException(`Booking is already ${booking.status}`);
    }

    const cancelledBy: 'student' | 'tutor' =
      booking.tutor_id === userId ? 'tutor' : 'student';

    let refundPercent: number | null = null;
    if (booking.status === 'confirmed') {
      if (cancelledBy === 'tutor') {
        refundPercent = 100;
      } else {
        const noticeHours =
          (new Date(booking.scheduled_start_utc).getTime() - Date.now()) /
          (60 * 60 * 1000);
        refundPercent = refundPercentForNotice(noticeHours);
      }
    }

    const cancelled = await this.repository.markCancelled(
      bookingId,
      cancelledBy,
      dto.reason ?? null,
      refundPercent,
    );

    if (booking.status === 'confirmed') {
      const tutorSubjects =
        await this.tutorSubjectsRepository.listForTutorAndSubject(
          booking.tutor_id,
          booking.subject_id,
        );
      await Promise.all(
        tutorSubjects.map((ts) =>
          this.waitlistsService.notifyForTutorSubject(ts.id),
        ),
      );
    }

    return cancelled;
  }

  async complete(tutorId: string, bookingId: string) {
    const booking = await this.getOwnedBooking(bookingId, tutorId);
    if (booking.tutor_id !== tutorId) {
      throw new ForbiddenException(
        'Only the tutor can mark a booking complete',
      );
    }
    return this.repository.markCompleted(bookingId);
  }

  /** Tutor reports the student didn't show — the payment is kept, no
   *  refund. A tutor no-show goes through cancel() instead, which is
   *  always a full refund. */
  async noShow(tutorId: string, bookingId: string) {
    const booking = await this.getOwnedBooking(bookingId, tutorId);
    if (booking.tutor_id !== tutorId) {
      throw new ForbiddenException('Only the tutor can report a no-show');
    }
    return this.repository.markNoShow(bookingId);
  }

  private async getOwnedBooking(bookingId: string, userId: string) {
    const booking = await this.repository.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.tutor_id !== userId && booking.student_id !== userId) {
      throw new ForbiddenException('Not your booking');
    }
    return booking;
  }

  private async getOwnedConfirmedBooking(bookingId: string, userId: string) {
    const booking = await this.getOwnedBooking(bookingId, userId);
    if (booking.status !== 'confirmed') {
      throw new BadRequestException(
        `Booking is ${booking.status}, not confirmed`,
      );
    }
    return booking;
  }

  /** Shared by create() and reschedule(): parses local wall-clock time,
   *  checks it's in the future, checks it against the tutor's declared
   *  availability, and checks for double-booking against both other
   *  bookings and batch class_sessions. */
  private async resolveValidSlot(
    tutorId: string,
    startLocal: string,
    timezoneParam: string | undefined,
    durationMin: number,
    excludeBookingId?: string,
  ) {
    const timezone = timezoneParam ?? DEFAULT_TIMEZONE;
    const start = DateTime.fromISO(startLocal, { zone: timezone });
    if (!start.isValid) {
      throw new BadRequestException(
        `Invalid start time "${startLocal}" for zone "${timezone}"`,
      );
    }
    const scheduledStartUtc = start.toUTC().toJSDate();
    const scheduledEndUtc = start
      .plus({ minutes: durationMin })
      .toUTC()
      .toJSDate();

    if (scheduledStartUtc.getTime() <= Date.now()) {
      throw new BadRequestException('Booking must be in the future');
    }

    const [windows, exceptions] = await Promise.all([
      this.availabilityRepository.listForTutor(tutorId),
      this.availabilityRepository.listExceptionsForTutor(tutorId),
    ]);
    if (!isWithinAvailability(start, durationMin, windows, exceptions)) {
      throw new BadRequestException(
        "Requested time is outside the tutor's availability",
      );
    }

    const [bookingOverlap, sessionOverlap] = await Promise.all([
      this.repository.hasOverlapForTutor(
        tutorId,
        scheduledStartUtc,
        scheduledEndUtc,
        excludeBookingId,
      ),
      this.sessionsRepository.hasScheduledOverlapForTutor(
        tutorId,
        scheduledStartUtc,
        scheduledEndUtc,
      ),
    ]);
    if (bookingOverlap || sessionOverlap) {
      throw new BadRequestException('Tutor is not available at that time');
    }

    return { scheduledStartUtc, timezone };
  }
}

/** JS/Date.getDay() convention (0=Sunday..6=Saturday), matching
 *  tutor_availability.weekday — luxon's ISO weekday (1=Monday..7=Sunday)
 *  needs converting. Doesn't handle a window crossing midnight; booking
 *  durations are short (<=240min) so this is an acceptable simplification. */
function isWithinAvailability(
  start: DateTime,
  durationMin: number,
  windows: AvailabilityWindow[],
  exceptions: AvailabilityException[],
): boolean {
  const end = start.plus({ minutes: durationMin });
  const dateStr = start.toISODate()!;
  const weekday = start.weekday % 7;

  const exception = exceptions.find((e) => e.date === dateStr);
  if (exception) {
    if (!exception.is_available) return false;
    if (exception.start_time && exception.end_time) {
      return isWithinClock(
        start,
        end,
        exception.start_time,
        exception.end_time,
      );
    }
    return true;
  }

  return windows.some((w) => {
    if (w.weekday !== weekday) return false;
    if (dateStr < w.effective_from) return false;
    if (w.effective_to && dateStr > w.effective_to) return false;
    return isWithinClock(start, end, w.start_time, w.end_time);
  });
}

function isWithinClock(
  start: DateTime,
  end: DateTime,
  windowStart: string,
  windowEnd: string,
): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  return startMin >= toMinutes(windowStart) && endMin <= toMinutes(windowEnd);
}
