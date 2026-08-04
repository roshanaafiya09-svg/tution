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
import type { CreateBookingDto } from './dto/create-booking.dto';

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
    private readonly config: ConfigService,
  ) {}

  async create(studentId: string, dto: CreateBookingDto) {
    const tutorSubject = await this.tutorSubjectsRepository.findById(
      dto.tutorSubjectId,
    );
    if (!tutorSubject) {
      throw new NotFoundException('Tutor subject offering not found');
    }

    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    const start = DateTime.fromISO(dto.startLocal, { zone: timezone });
    if (!start.isValid) {
      throw new BadRequestException(
        `Invalid start time "${dto.startLocal}" for zone "${timezone}"`,
      );
    }
    const scheduledStartUtc = start.toUTC().toJSDate();
    const scheduledEndUtc = start
      .plus({ minutes: dto.durationMin })
      .toUTC()
      .toJSDate();

    if (scheduledStartUtc.getTime() <= Date.now()) {
      throw new BadRequestException('Booking must be in the future');
    }

    const [windows, exceptions] = await Promise.all([
      this.availabilityRepository.listForTutor(tutorSubject.tutor_id),
      this.availabilityRepository.listExceptionsForTutor(tutorSubject.tutor_id),
    ]);
    if (!isWithinAvailability(start, dto.durationMin, windows, exceptions)) {
      throw new BadRequestException(
        "Requested time is outside the tutor's availability",
      );
    }

    const [bookingOverlap, sessionOverlap] = await Promise.all([
      this.repository.hasOverlapForTutor(
        tutorSubject.tutor_id,
        scheduledStartUtc,
        scheduledEndUtc,
      ),
      this.sessionsRepository.hasScheduledOverlapForTutor(
        tutorSubject.tutor_id,
        scheduledStartUtc,
        scheduledEndUtc,
      ),
    ]);
    if (bookingOverlap || sessionOverlap) {
      throw new BadRequestException('Tutor is not available at that time');
    }

    const amountMinor = Math.round(
      (tutorSubject.hourly_rate_minor * dto.durationMin) / 60,
    );
    const takeRatePercent =
      this.config.get<number>('marketplace.takeRatePercent') ?? 0;
    const platformFeeMinor = Math.round((amountMinor * takeRatePercent) / 100);

    return this.repository.create({
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
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
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
