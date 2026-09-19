import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AssessmentsRepository } from '../../assessments/assessments.repository';
import { OfflineAssessmentsService } from '../../assessments/offline/offline-assessments.service';
import { academicWeekStart } from '../../assessments/academic-week.util';
import type { AssessmentStatus } from '../../../database/types';

export type WeeklyComplianceStatus = AssessmentStatus | 'not_scheduled';

/** Which of a teacher's assessments in the week represents them on the
 *  compliance row. Lower wins; ties go to the newest (callers pass rows
 *  newest-first). A completed assessment means the teacher is compliant;
 *  otherwise an overdue one is the thing an academy needs to see, ahead of
 *  work that is merely in flight; a bare draft is the weakest signal. */
const COMPLIANCE_PRIORITY: Record<AssessmentStatus, number> = {
  completed: 0,
  overdue: 1,
  scorecard_pending: 2,
  published: 2,
  scheduled: 2,
  draft: 3,
};

export function pickPrimaryAssessment<T extends { status: AssessmentStatus }>(
  assessments: T[],
): T | null {
  let best: T | null = null;
  for (const assessment of assessments) {
    if (
      best === null ||
      COMPLIANCE_PRIORITY[assessment.status] < COMPLIANCE_PRIORITY[best.status]
    ) {
      best = assessment;
    }
  }
  return best;
}

/** Every teacher lands in exactly one bucket, so the tiles always add up
 *  to `teachers`. A teacher whose only assessment is an unscheduled draft
 *  has not scheduled anything yet, so counts as "not scheduled" (their row
 *  still shows the draft itself). */
export function summarizeCompliance(
  statuses: WeeklyComplianceStatus[],
): WeeklyComplianceSummary {
  const summary: WeeklyComplianceSummary = {
    teachers: statuses.length,
    completed: 0,
    pending: 0,
    overdue: 0,
    notScheduled: 0,
  };
  for (const status of statuses) {
    if (status === 'completed') summary.completed++;
    else if (status === 'overdue') summary.overdue++;
    else if (
      status === 'scheduled' ||
      status === 'published' ||
      status === 'scorecard_pending'
    ) {
      summary.pending++;
    } else summary.notScheduled++;
  }
  return summary;
}

export interface WeeklyComplianceSummary {
  teachers: number;
  completed: number;
  pending: number;
  overdue: number;
  notScheduled: number;
}

/**
 * Academy Dashboard -> Assessment -> Weekly Compliance (spec §20/§21/§37)
 * — read-only, operational, never a ranking. Same
 * resolveOwnAcademy(ownerUserId) pattern as every other academy-owner
 * service (see AcademyOwnerTeacherAttendanceService); small precedented
 * duplication rather than a shared cross-module private method, per this
 * codebase's existing convention.
 */
@Injectable()
export class AcademyOwnerAssessmentsService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly assessmentsRepository: AssessmentsRepository,
    private readonly offlineAssessments: OfflineAssessmentsService,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  async getWeeklyCompliance(ownerUserId: string, weekStartDate?: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    // Any date inside the wanted week is accepted (the controller has
    // already proven it is a real calendar date) and snapped to that
    // week's Monday, the value assessments.week_start_date holds.
    const week = academicWeekStart(weekStartDate);

    const teachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const tutorIds = teachers.map((t) => t.tutor_id);
    const tutorNames = new Map(
      teachers.map((t) => [t.tutor_id, t.display_name]),
    );

    const assessments = await this.assessmentsRepository.listForTutorsInWeek(
      tutorIds,
      week,
    );
    const byTutor = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      const list = byTutor.get(assessment.tutor_id) ?? [];
      list.push(assessment);
      byTutor.set(assessment.tutor_id, list);
    }

    const rows = await Promise.all(
      tutorIds.map(async (tutorId) => {
        const own = byTutor.get(tutorId) ?? [];
        // Every assessment this teacher has this week still counts
        // (§18: additional assessments in the same week are never hidden)
        // — `primary` only chooses which one names the summary row.
        const primary = pickPrimaryAssessment(own);
        const batches = primary
          ? await this.assessmentsRepository.listBatchesForAssessment(
              primary.id,
            )
          : [];

        // Annotated so the literal isn't widened to `string` in the
        // returned object (summarizeCompliance needs the union).
        const status: WeeklyComplianceStatus =
          primary?.status ?? 'not_scheduled';

        return {
          tutorId,
          teacherDisplayName: tutorNames.get(tutorId) ?? null,
          status,
          assessment: primary
            ? {
                id: primary.id,
                title: primary.title,
                mode: primary.mode,
                batchCount: batches.length,
                batchNames: batches.map((b) => b.title),
                assessmentDate: primary.assessment_date,
                completedAt: primary.completed_at,
                completedLate: primary.completed_late,
              }
            : null,
          additionalAssessmentCount: Math.max(
            0,
            own.length - (primary ? 1 : 0),
          ),
        };
      }),
    );

    const summary = summarizeCompliance(rows.map((r) => r.status));

    return { weekStartDate: week, summary, teachers: rows };
  }

  /** Academy Assessment Details (§21) — verifies the assessment's owning
   *  teacher is an active member of the caller's academy before
   *  returning anything, so an academy admin can never read another
   *  academy's assessment by guessing an id. */
  async getAssessmentDetail(ownerUserId: string, assessmentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const assessment = await this.assessmentsRepository.findById(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    await this.assertTeacherInAcademy(academy.id, assessment.tutor_id);

    const [batches, results, scorecardImports] = await Promise.all([
      this.assessmentsRepository.listBatchesForAssessment(assessmentId),
      this.assessmentsRepository.listResultsForAssessment(assessmentId),
      assessment.mode === 'offline'
        ? this.assessmentsRepository.listScorecardImports(assessmentId)
        : Promise.resolve([]),
    ]);

    const resultsByBatch = new Map<string, typeof results>();
    for (const result of results) {
      const list = resultsByBatch.get(result.batch_id) ?? [];
      list.push(result);
      resultsByBatch.set(result.batch_id, list);
    }

    return {
      id: assessment.id,
      title: assessment.title,
      subjectId: assessment.subject_id,
      mode: assessment.mode,
      status: assessment.status,
      assessmentDate: assessment.assessment_date,
      maxScore: assessment.max_score,
      publishedAt: assessment.published_at,
      completedAt: assessment.completed_at,
      completedLate: assessment.completed_late,
      hasQuestionPaper: assessment.question_paper_object_key !== null,
      batches: batches.map((b) => ({
        id: b.id,
        title: b.title,
        results: (resultsByBatch.get(b.id) ?? []).map((r) => ({
          studentId: r.student_id,
          studentName: r.display_name,
          score: r.score,
          maxScore: r.max_score,
          source: r.source,
          submittedAt: r.submitted_at,
        })),
      })),
      studentCount: results.length,
      scorecardImports: scorecardImports.map((i) => ({
        id: i.id,
        status: i.status,
        rowCount: i.row_count,
        createdAt: i.created_at,
      })),
    };
  }

  async getQuestionPaperDownloadUrl(ownerUserId: string, assessmentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const assessment = await this.assessmentsRepository.findById(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    await this.assertTeacherInAcademy(academy.id, assessment.tutor_id);
    return this.offlineAssessments.resolveQuestionPaperUrl(assessment);
  }

  private async assertTeacherInAcademy(
    academyId: string,
    tutorId: string,
  ): Promise<void> {
    const membership =
      await this.academyMembershipsRepository.findActiveMembership(
        academyId,
        tutorId,
      );
    if (!membership) {
      throw new ForbiddenException("That teacher isn't active at your academy");
    }
  }
}
