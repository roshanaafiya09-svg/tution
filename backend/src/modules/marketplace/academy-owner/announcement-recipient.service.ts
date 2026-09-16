import { Injectable, NotFoundException } from '@nestjs/common';
import { AcademyAnnouncementsRepository } from './academy-announcements.repository';
import { AcademiesRepository } from '../academies/academies.repository';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * The recipient-facing half of Announcements — a teacher/student/parent
 * (any authenticated role, not just 'academy') opening the notification
 * they were sent. Deliberately lives beside AcademyAnnouncementsRepository
 * despite not being owner-scoped itself: no recipient list is ever
 * persisted (publish() only computes a transient Set to fan out through
 * NotificationsService — see that method's doc comment), so there's
 * nothing here to scope a query by except the id itself. Authorization
 * instead comes from proof of receipt: does this user actually have an
 * 'academy_announcement' notification naming this id? That reuses
 * exactly the notify() fan-out from publish() as the source of truth for
 * "was I a recipient," with no new table and no re-derivation of
 * audience membership (which could drift — e.g. a student who has since
 * left the batch — whereas the notification record is a durable,
 * historically-accurate receipt).
 */
@Injectable()
export class AnnouncementRecipientService {
  constructor(
    private readonly repository: AcademyAnnouncementsRepository,
    private readonly academiesRepository: AcademiesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getForRecipient(userId: string, announcementId: string) {
    const announcement = await this.repository.findById(announcementId);
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Same lookback-then-filter-in-application-code idiom every existing
    // notify()-dedupe check already uses (attendance.service.ts,
    // holiday.service.ts, teacher-leave.service.ts) — not a new pattern.
    const notifications =
      await this.notificationsService.listRecentForUserByType(
        userId,
        'academy_announcement',
        new Date(0),
      );
    const received = notifications.some(
      (n) =>
        (n.payload as { announcementId?: string }).announcementId ===
        announcementId,
    );
    if (!received) {
      // Same 404 as "doesn't exist" — never reveal to a non-recipient
      // that a given announcement id is real.
      throw new NotFoundException('Announcement not found');
    }

    const academy = await this.academiesRepository.findById(
      announcement.academy_id,
    );

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      academyName: academy?.name ?? null,
      publishedAt: announcement.published_at,
    };
  }
}
