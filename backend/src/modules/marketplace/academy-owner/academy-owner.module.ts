import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { BookingsModule } from '../bookings/bookings.module';
import { StorageModule } from '../../../common/storage/storage.module';
import { AcademiesModule } from '../academies/academies.module';
import { AcademyMembershipsModule } from '../academy-memberships/academy-memberships.module';
import { AcademyReviewsModule } from '../academy-reviews/academy-reviews.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CatalogModule } from '../../catalog/catalog.module';
import { HolidaysModule } from '../../holidays/holidays.module';
import { AcademyOwnerController } from './academy-owner.controller';
import { AcademyOwnerService } from './academy-owner.service';
import { AcademyOwnerBatchesController } from './academy-owner-batches.controller';
import { AcademyOwnerBatchesService } from './academy-owner-batches.service';
import { AcademyOwnerLeaveController } from './academy-owner-leave.controller';
import { AcademyOwnerLeaveService } from './academy-owner-leave.service';
import { AcademyOwnerHolidaysController } from './academy-owner-holidays.controller';
import { AcademyOwnerHolidaysService } from './academy-owner-holidays.service';
import { AcademyOwnerParentsController } from './academy-owner-parents.controller';
import { AcademyOwnerParentsService } from './academy-owner-parents.service';
import { AcademyOwnerParentsRepository } from './academy-owner-parents.repository';
import { AcademyOwnerAttendanceController } from './academy-owner-attendance.controller';
import { AcademyOwnerAttendanceService } from './academy-owner-attendance.service';
import { AcademyOwnerTeacherAttendanceController } from './academy-owner-teacher-attendance.controller';
import { AcademyOwnerTeacherAttendanceService } from './academy-owner-teacher-attendance.service';
import { AcademyOwnerAnnouncementsController } from './academy-owner-announcements.controller';
import { AcademyOwnerAnnouncementsService } from './academy-owner-announcements.service';
import { AcademyAnnouncementsRepository } from './academy-announcements.repository';
import { AcademyOwnerReportsController } from './academy-owner-reports.controller';
import { AcademyOwnerReportsService } from './academy-owner-reports.service';
import { AnnouncementRecipientController } from './announcement-recipient.controller';
import { AnnouncementRecipientService } from './announcement-recipient.service';

/**
 * The self-serve Academy Dashboard (migration 0031) — closes the gap
 * migration 0030 explicitly left open. Imports AcademiesModule for its
 * now-exported repositories (AcademiesRepository/AcademyLocationsRepository/
 * AcademyPhotosRepository/AcademyContactRequestsRepository) rather than
 * duplicating those queries; AcademiesModule does NOT import this module,
 * so there's no cycle. Same for AcademyMembershipsModule (membership +
 * join-request repos) and AcademyReviewsModule (rating summary for
 * stats).
 */
@Module({
  imports: [
    IdentityModule,
    AcademiesModule,
    AcademyMembershipsModule,
    AcademyReviewsModule,
    SchedulingModule,
    BookingsModule,
    StorageModule,
    NotificationsModule,
    CatalogModule,
    HolidaysModule,
  ],
  controllers: [
    AcademyOwnerController,
    AcademyOwnerBatchesController,
    AcademyOwnerLeaveController,
    AcademyOwnerHolidaysController,
    AcademyOwnerParentsController,
    AcademyOwnerAttendanceController,
    AcademyOwnerTeacherAttendanceController,
    AcademyOwnerAnnouncementsController,
    AcademyOwnerReportsController,
    AnnouncementRecipientController,
  ],
  providers: [
    AcademyOwnerService,
    AcademyOwnerBatchesService,
    AcademyOwnerLeaveService,
    AcademyOwnerHolidaysService,
    AcademyOwnerParentsService,
    AcademyOwnerParentsRepository,
    AcademyOwnerAttendanceService,
    AcademyOwnerTeacherAttendanceService,
    AcademyOwnerAnnouncementsService,
    AcademyAnnouncementsRepository,
    AcademyOwnerReportsService,
    AnnouncementRecipientService,
  ],
})
export class AcademyOwnerModule {}
