import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademyReviewsRepository } from './academy-reviews.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { BookingsService } from '../bookings/bookings.service';
import type { SubmitAcademyReviewDto } from './dto/submit-academy-review.dto';

/**
 * Verified-session-only academy reviews — mirrors ReviewsService
 * (teacher reviews) exactly, except the gate checks for a verified
 * session with ANY of the academy's currently-active member tutors,
 * not one fixed tutor. A separate rating system from `reviews` (teacher
 * ratings) — an academy's trust signal never mixes with an individual
 * teacher's, per migration 0030's doc comment.
 */
@Injectable()
export class AcademyReviewsService {
  constructor(
    private readonly repository: AcademyReviewsRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly bookingsService: BookingsService,
  ) {}

  async submit(studentId: string, dto: SubmitAcademyReviewDto) {
    const activeMembers =
      await this.academyMembershipsRepository.listActiveForAcademy(
        dto.academyId,
      );
    if (activeMembers.length === 0) {
      throw new BadRequestException(
        'This academy has no active teachers to verify a session with',
      );
    }
    const tutorIds = activeMembers.map((m) => m.tutor_id);

    const [hasAttendance, hasCompletedBooking] = await Promise.all([
      this.attendanceRepository.hasVerifiedAttendanceWithAnyTutor(
        studentId,
        tutorIds,
      ),
      this.bookingsService.hasCompletedBookingWithAny(studentId, tutorIds),
    ]);
    if (!hasAttendance && !hasCompletedBooking) {
      throw new BadRequestException(
        "You can only review an academy you've had a verified session with one of its teachers",
      );
    }

    return this.repository.upsert(
      dto.academyId,
      studentId,
      dto.rating,
      dto.comment ?? null,
    );
  }

  async listForAcademy(academyId: string) {
    const [reviews, summary] = await Promise.all([
      this.repository.listForAcademy(academyId),
      this.repository.aggregateForAcademy(academyId),
    ]);
    return { reviews, summary };
  }

  listOwn(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  async remove(studentId: string, id: string) {
    const review = await this.repository.findById(id);
    if (!review) throw new NotFoundException('Review not found');
    if (review.student_id !== studentId) {
      throw new ForbiddenException('Not your review');
    }
    await this.repository.deleteById(id);
  }
}
