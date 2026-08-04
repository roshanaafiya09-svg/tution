import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DigestsRepository } from './digests.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { SubmissionsRepository } from '../../assessment/submissions/submissions.repository';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import { ProfilesService } from '../../identity/profiles/profiles.service';
import { AiService } from '../ai.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ParentPremiumService } from '../../billing/parent-premium/parent-premium.service';
import type { GenerateDigestDto } from './dto/generate-digest.dto';

/**
 * AI weekly parent digest (blueprint §8, §10 Phase 2): attendance,
 * submissions, and grades over a period turned into one narrative
 * paragraph. Stats are computed here, server-side, from real data —
 * the AI call (AiService) only writes the prose, never invents numbers.
 *
 * Blueprint frames this as a Sunday-evening batch job (BullMQ); that
 * scheduler doesn't exist in this codebase yet, so generation is
 * exposed as a parent-triggered endpoint for now — a manual stand-in
 * for the same underlying capability, not a redesign. Idempotent per
 * (parent, student, periodStart), so re-triggering never double-spends
 * an AI call.
 *
 * Every parent gets a digest — this stays the free retention loop
 * (blueprint's "AI parent weekly digest... unchanged from v1"). Parent
 * Premium (blueprint §5/§10 Phase 3) only makes it *richer*: an extra
 * AI-written focus-area paragraph, recorded as stats.tier so which kind
 * a given digest was is visible after the fact.
 */
@Injectable()
export class DigestsService {
  constructor(
    private readonly repository: DigestsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly submissionsRepository: SubmissionsRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
    private readonly profilesService: ProfilesService,
    private readonly aiService: AiService,
    private readonly analytics: AnalyticsService,
    private readonly parentPremiumService: ParentPremiumService,
  ) {}

  async generate(parentId: string, studentId: string, dto: GenerateDigestDto) {
    const link = await this.parentLinksRepository.findByParentAndStudent(
      parentId,
      studentId,
    );
    if (!link || link.status !== 'active') {
      throw new ForbiddenException('No active consented link to this student');
    }

    const existing = await this.repository.findExisting(
      parentId,
      studentId,
      dto.periodStart,
    );
    if (existing) return existing;

    const from = new Date(`${dto.periodStart}T00:00:00.000Z`);
    const to = new Date(`${dto.periodEnd}T00:00:00.000Z`);
    to.setUTCDate(to.getUTCDate() + 1); // periodEnd is inclusive
    if (to <= from) {
      throw new BadRequestException(
        'periodEnd must be on or after periodStart',
      );
    }

    const [attendance, submissionRows, profile, premiumActive] =
      await Promise.all([
        this.attendanceRepository.summaryForStudentBetween(studentId, from, to),
        this.submissionsRepository.listForStudentBetween(studentId, from, to),
        this.profilesService.getStudentProfile(studentId),
        this.parentPremiumService.isActive(parentId),
      ]);

    const gradedRows = submissionRows.filter((row) => row.grade !== null);
    const locale = dto.locale ?? 'en';
    const tier = premiumActive ? 'premium' : 'basic';

    const narrative = await this.aiService.generateDigestNarrative({
      studentDisplayName: profile?.display_name ?? 'your child',
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      attendance,
      submissions: {
        submitted: submissionRows.length,
        graded: gradedRows.length,
      },
      grades: gradedRows.map((row) => ({
        assignmentTitle: row.assignment_title,
        batchTitle: row.batch_title,
        grade: row.grade as string,
      })),
      locale,
      tier,
    });

    const digest = await this.repository.create({
      parentId,
      studentId,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      locale,
      narrative,
      stats: {
        attendance,
        submissions: {
          submitted: submissionRows.length,
          graded: gradedRows.length,
        },
        tier,
      },
    });

    this.analytics.capture(parentId, 'digest_generated', {
      studentId,
      periodStart: dto.periodStart,
      tier,
    });

    return digest;
  }

  listForParent(parentId: string) {
    return this.repository.listForParent(parentId);
  }
}
