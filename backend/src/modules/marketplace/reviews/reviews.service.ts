import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReviewsRepository } from './reviews.repository';
import { UsersRepository } from '../../identity/users/users.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { BookingsService } from '../bookings/bookings.service';
import type { SubmitReviewDto } from './dto/submit-review.dto';

/**
 * Verified-session-only reviews (blueprint §10 Phase 4) — a student may
 * only review a tutor they've actually had a session with, checked
 * across both scheduling systems: batch-class attendance
 * (AttendanceRepository) and completed 1:1 bookings (BookingsService).
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly repository: ReviewsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly bookingsService: BookingsService,
  ) {}

  async submit(studentId: string, dto: SubmitReviewDto) {
    const tutorRoles = await this.usersRepository.getRoles(dto.tutorId);
    if (!tutorRoles.includes('tutor')) {
      throw new NotFoundException('Tutor not found');
    }

    const [hasAttendance, hasCompletedBooking] = await Promise.all([
      this.attendanceRepository.hasVerifiedAttendanceWithTutor(
        studentId,
        dto.tutorId,
      ),
      this.bookingsService.hasCompletedBookingWith(studentId, dto.tutorId),
    ]);
    if (!hasAttendance && !hasCompletedBooking) {
      throw new BadRequestException(
        "You can only review a tutor you've had a verified session with",
      );
    }

    return this.repository.upsert(
      dto.tutorId,
      studentId,
      dto.rating,
      dto.comment ?? null,
    );
  }

  async listForTutor(tutorId: string) {
    const [reviews, summary] = await Promise.all([
      this.repository.listForTutor(tutorId),
      this.repository.aggregateForTutor(tutorId),
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
