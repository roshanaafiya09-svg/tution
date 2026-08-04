import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WaitlistsRepository } from './waitlists.repository';
import { TutorSubjectsRepository } from '../../catalog/tutor-subjects/tutor-subjects.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import type { JoinWaitlistDto } from './dto/join-waitlist.dto';

const EXCLUSIVITY_WINDOW_HOURS = 24;

@Injectable()
export class WaitlistsService {
  constructor(
    private readonly repository: WaitlistsRepository,
    private readonly tutorSubjectsRepository: TutorSubjectsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async join(studentId: string, dto: JoinWaitlistDto) {
    const tutorSubject = await this.tutorSubjectsRepository.findById(
      dto.tutorSubjectId,
    );
    if (!tutorSubject) {
      throw new NotFoundException('Tutor subject offering not found');
    }

    const existing = await this.repository.findActiveForStudentAndTutorSubject(
      dto.tutorSubjectId,
      studentId,
    );
    if (existing) {
      throw new BadRequestException(
        'Already on the waitlist for this offering',
      );
    }

    return this.repository.create(
      dto.tutorSubjectId,
      tutorSubject.tutor_id,
      studentId,
    );
  }

  async listOwn(studentId: string) {
    await this.repository.expireStaleForStudent(studentId);
    return this.repository.listForStudent(studentId);
  }

  async leave(studentId: string, id: string) {
    const entry = await this.repository.findById(id);
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    if (entry.student_id !== studentId) {
      throw new ForbiddenException('Not your waitlist entry');
    }
    if (entry.status !== 'waiting' && entry.status !== 'notified') {
      throw new BadRequestException(
        `Waitlist entry is already ${entry.status}`,
      );
    }
    return this.repository.markCancelled(id);
  }

  /** Called by BookingsService.cancel() when a confirmed booking frees up
   *  a slot, and by the tutor's manual notify endpoint. Fans the freed
   *  slot out to every 'waiting' entry and starts each one's exclusivity
   *  window (blueprint §10 Phase 4). */
  async notifyForTutorSubject(tutorSubjectId: string) {
    const expiresAt = new Date(
      Date.now() + EXCLUSIVITY_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const notified = await this.repository.markWaitingAsNotified(
      tutorSubjectId,
      expiresAt,
    );
    if (notified.length === 0) return notified;

    await this.notifications.notify({
      userIds: notified.map((entry) => entry.student_id),
      type: 'waitlist_slot_open',
      title: 'A slot just opened up',
      body: `You have ${EXCLUSIVITY_WINDOW_HOURS}h to book before it's offered to others.`,
      payload: { tutorSubjectId },
    });
    return notified;
  }

  async notifyForTutorOwned(tutorId: string, tutorSubjectId: string) {
    const tutorSubject =
      await this.tutorSubjectsRepository.findById(tutorSubjectId);
    if (!tutorSubject) {
      throw new NotFoundException('Tutor subject offering not found');
    }
    if (tutorSubject.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your offering');
    }
    return this.notifyForTutorSubject(tutorSubjectId);
  }

  /** Checked by BookingsService *before* creating the booking, so a
   *  rejected waitlistId never leaves an orphaned pending_payment booking
   *  behind. Only a 'notified' entry within its exclusivity window can
   *  convert — a 'waiting' entry hasn't been offered the slot yet, and an
   *  expired one has lapsed back to the general waitlist. */
  async assertConvertible(
    waitlistId: string,
    studentId: string,
    tutorSubjectId: string,
  ) {
    const entry = await this.repository.findById(waitlistId);
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    if (entry.student_id !== studentId) {
      throw new ForbiddenException('Not your waitlist entry');
    }
    if (entry.tutor_subject_id !== tutorSubjectId) {
      throw new BadRequestException(
        "Waitlist entry doesn't match this offering",
      );
    }
    if (
      entry.status === 'notified' &&
      entry.expires_at &&
      entry.expires_at < new Date()
    ) {
      await this.repository.markExpired(waitlistId);
      throw new BadRequestException('Waitlist exclusivity window has expired');
    }
    if (entry.status !== 'notified') {
      throw new BadRequestException(
        `Waitlist entry is ${entry.status}, not notified`,
      );
    }
  }

  /** Called once the booking it was validated for has actually been
   *  created — see assertConvertible(). */
  convert(waitlistId: string, bookingId: string) {
    return this.repository.markConverted(waitlistId, bookingId);
  }
}
