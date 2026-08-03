import { Injectable } from '@nestjs/common';
import { FeesRepository } from '../fees/fees.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/**
 * Value-recap paywall (blueprint §5): "You ran 41 classes, 380
 * attendances marked, ₹62,000 in fees tracked. Keep it for ₹499/month" —
 * shown at trial end instead of a bare countdown.
 */
@Injectable()
export class RecapService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly feesRepository: FeesRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async forTutor(tutorId: string) {
    const [classesRun, attendancesMarked, feesTrackedMinor, subscription] =
      await Promise.all([
        this.sessionsRepository.countCompletedForTutor(tutorId),
        this.attendanceRepository.countForTutor(tutorId),
        this.feesRepository.sumExpectedForTutor(tutorId),
        this.subscriptions.getStatus(tutorId),
      ]);

    return {
      classesRun,
      attendancesMarked,
      feesTrackedMinor,
      currency: 'INR',
      subscriptionStatus: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
    };
  }
}
