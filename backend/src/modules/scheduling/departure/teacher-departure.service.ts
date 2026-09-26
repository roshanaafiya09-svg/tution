import { Injectable } from '@nestjs/common';
import { AcademyMembershipsRepository } from '../../marketplace/academy-memberships/academy-memberships.repository';
import { SessionNotificationsService } from '../sessions/session-notifications.service';

/**
 * The single path by which a teacher stops being a member of an academy
 * (they leave, the academy removes them, or an admin removes them).
 *
 * The membership flip and the fate of the teacher's FUTURE ACADEMY classes
 * happen in one transaction (AcademyMembershipsRepository.markLeft): a class
 * that would still be taught by the departing teacher is cancelled
 * (`academy_manual`, the academy owns it and has no teacher for it), while a
 * class already covered by another active substitute keeps running. Nothing
 * about the teacher's Individual classes, other academies, or history is
 * touched.
 *
 * Only after the transaction has committed are the students and parents of
 * the cancelled classes told, with the existing class-cancelled notice —
 * which also means the cancelled-class reminder sweep will not announce them
 * a second time, and no "starts in 10 minutes" reminder can fire for a
 * cancelled class. The departed teacher is deliberately NOT sent the
 * "cancelled by your academy" teacher notice (no academy id is passed): they
 * no longer hold any Academy permission.
 */
@Injectable()
export class TeacherDepartureService {
  constructor(
    private readonly memberships: AcademyMembershipsRepository,
    private readonly sessionNotifications: SessionNotificationsService,
  ) {}

  async leave(membershipId: string) {
    const { cancelledSessionIds, ...membership } =
      await this.memberships.markLeft(membershipId);
    await this.sessionNotifications.notifyCancelled(
      cancelledSessionIds,
      'academy_manual',
    );
    return { membership, cancelledSessionIds };
  }
}
