import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type {
  AssessmentMode,
  AssessmentResultSource,
  AssessmentStatus,
  DB,
} from '../../database/types';
import { newId } from '../../database/id';
import type { AssessmentQuestionDraft } from '../ai/assessment-ai/assessment-ai-provider.interface';

export interface CreateAssessmentInput {
  tutorId: string;
  mode: AssessmentMode;
  title: string;
  subjectId: string;
  batchIds: string[];
  maxScore: number | null;
  assessmentDate: string | null;
  scorecardDeadlineAt: Date | null;
  weekStartDate: string;
  /** Teaching context the assessment belongs to (NULL = Individual). Every
   *  batch in `batchIds` must share it (also enforced by a DB trigger). */
  academyId: string | null;
}

@Injectable()
export class AssessmentsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: CreateAssessmentInput) {
    return this.db.transaction().execute(async (trx) => {
      const assessment = await trx
        .insertInto('assessments')
        .values({
          id: newId(),
          tutor_id: input.tutorId,
          academy_id: input.academyId,
          mode: input.mode,
          title: input.title,
          subject_id: input.subjectId,
          max_score: input.maxScore,
          assessment_date: input.assessmentDate,
          scorecard_deadline_at: input.scorecardDeadlineAt,
          week_start_date: input.weekStartDate,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('assessment_batches')
        .values(
          input.batchIds.map((batchId) => ({
            assessment_id: assessment.id,
            batch_id: batchId,
          })),
        )
        .execute();

      return assessment;
    });
  }

  findById(id: string) {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listBatchIds(assessmentId: string) {
    return this.db
      .selectFrom('assessment_batches')
      .select('batch_id')
      .where('assessment_id', '=', assessmentId)
      .execute()
      .then((rows) => rows.map((r) => r.batch_id));
  }

  /** Batch id + title pairs, for detail views (§21's "clearly identify
   *  the batch" requirement). */
  listBatchesForAssessment(assessmentId: string) {
    return this.db
      .selectFrom('assessment_batches')
      .innerJoin('batches', 'batches.id', 'assessment_batches.batch_id')
      .select(['batches.id', 'batches.title'])
      .where('assessment_batches.assessment_id', '=', assessmentId)
      .execute();
  }

  /** A tutor's assessments in ONE teaching context (null = Individual,
   *  an id = that academy's). */
  listForTutor(
    tutorId: string,
    academyId: string | null,
    mode?: AssessmentMode,
  ) {
    let query = this.db
      .selectFrom('assessments')
      .selectAll()
      .where('tutor_id', '=', tutorId);
    query =
      academyId === null
        ? query.where('academy_id', 'is', null)
        : query.where('academy_id', '=', academyId);
    if (mode) query = query.where('mode', '=', mode);
    return query.orderBy('created_at', 'desc').execute();
  }

  /** This week's assessments the ACADEMY owns — the Academy weekly
   *  compliance dashboard's core query (§20/§37). One row per teacher per
   *  assessment; the caller groups by tutor. A member teacher's Individual
   *  assessments never count towards (or appear in) academy compliance. */
  listForAcademyInWeek(academyId: string, weekStartDate: string) {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('academy_id', '=', academyId)
      .where('week_start_date', '=', weekStartDate)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Every context's assessments for a set of tutors in a week — for the
   *  weekly-reminder cron ONLY, which then keys the result by
   *  (tutor_id, academy_id) so a teacher assessing in one context isn't
   *  treated as compliant in the other. Not for any Academy-facing view. */
  listInWeekForReminders(tutorIds: string[], weekStartDate: string) {
    if (tutorIds.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('tutor_id', 'in', tutorIds)
      .where('week_start_date', '=', weekStartDate)
      .execute();
  }

  /** Published/completed online assessments across a set of batches —
   *  backs the student assessment list (a student may be enrolled in
   *  several of an assessment's selected batches, so this is deduped by
   *  assessment id). */
  listForTutorsAcrossBatches(batchIds: string[]) {
    if (batchIds.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('assessments')
      .innerJoin(
        'assessment_batches',
        'assessment_batches.assessment_id',
        'assessments.id',
      )
      .selectAll('assessments')
      .distinct()
      .where('assessment_batches.batch_id', 'in', batchIds)
      .where('assessments.mode', '=', 'online')
      .where('assessments.status', 'in', ['published', 'completed'])
      .orderBy('assessments.published_at', 'desc')
      .execute();
  }

  /** Offline assessments this student has a scorecard result for — the
   *  offline half of the student's assessment list. Keyed on the
   *  student's own result rows (their authenticated id, never a client-
   *  supplied one), so a student only ever sees their own marks. */
  listOfflineResultsForStudent(studentId: string) {
    return this.db
      .selectFrom('assessment_results')
      .innerJoin(
        'assessments',
        'assessments.id',
        'assessment_results.assessment_id',
      )
      .select([
        'assessments.id',
        'assessments.title',
        'assessments.subject_id',
        'assessments.assessment_date',
        'assessments.completed_at',
        'assessment_results.score',
        'assessment_results.max_score',
      ])
      .where('assessment_results.student_id', '=', studentId)
      .where('assessments.mode', '=', 'offline')
      .orderBy('assessments.assessment_date', 'desc')
      .execute();
  }

  setMaxScore(id: string, maxScore: number) {
    return this.db
      .updateTable('assessments')
      .set({ max_score: maxScore })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setQuestionPaper(id: string, objectKey: string, mime: string) {
    return this.db
      .updateTable('assessments')
      .set({ question_paper_object_key: objectKey, question_paper_mime: mime })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setScorecardDeadline(id: string, scorecardDeadlineAt: Date) {
    return this.db
      .updateTable('assessments')
      .set({ scorecard_deadline_at: scorecardDeadlineAt })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateStatus(
    id: string,
    status: AssessmentStatus,
    extra: {
      publishedAt?: Date;
      completedAt?: Date;
      completedLate?: boolean;
    } = {},
  ) {
    return this.db
      .updateTable('assessments')
      .set({
        status,
        ...(extra.publishedAt !== undefined && {
          published_at: extra.publishedAt,
        }),
        ...(extra.completedAt !== undefined && {
          completed_at: extra.completedAt,
        }),
        ...(extra.completedLate !== undefined && {
          completed_late: extra.completedLate,
        }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Deletes any existing draft questions and inserts the new set —
   *  supports regenerating a draft while the assessment is still `draft`.
   *  Caller (OnlineAssessmentsService) is responsible for only allowing
   *  this while status is `draft`. */
  replaceQuestions(assessmentId: string, questions: AssessmentQuestionDraft[]) {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('assessment_questions')
        .where('assessment_id', '=', assessmentId)
        .execute();

      if (questions.length === 0) return [];

      return trx
        .insertInto('assessment_questions')
        .values(
          questions.map((q, index) => ({
            id: newId(),
            assessment_id: assessmentId,
            order_index: index,
            question_text: q.questionText,
            choices: JSON.stringify(q.choices),
            correct_choice_index: q.correctChoiceIndex,
            marks: q.marks,
            difficulty: q.difficulty,
            explanation: q.explanation,
          })),
        )
        .returningAll()
        .execute();
    });
  }

  listQuestions(assessmentId: string) {
    return this.db
      .selectFrom('assessment_questions')
      .selectAll()
      .where('assessment_id', '=', assessmentId)
      .orderBy('order_index')
      .execute();
  }

  findQuestionById(id: string) {
    return this.db
      .selectFrom('assessment_questions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  updateQuestion(
    id: string,
    patch: Partial<{
      questionText: string;
      choices: string[];
      correctChoiceIndex: number;
      marks: number;
      difficulty: 'easy' | 'medium' | 'hard';
      explanation: string | null;
    }>,
  ) {
    return this.db
      .updateTable('assessment_questions')
      .set({
        ...(patch.questionText !== undefined && {
          question_text: patch.questionText,
        }),
        ...(patch.choices !== undefined && {
          choices: JSON.stringify(patch.choices),
        }),
        ...(patch.correctChoiceIndex !== undefined && {
          correct_choice_index: patch.correctChoiceIndex,
        }),
        ...(patch.marks !== undefined && { marks: patch.marks }),
        ...(patch.difficulty !== undefined && { difficulty: patch.difficulty }),
        ...(patch.explanation !== undefined && {
          explanation: patch.explanation,
        }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findResult(assessmentId: string, studentId: string) {
    return this.db
      .selectFrom('assessment_results')
      .selectAll()
      .where('assessment_id', '=', assessmentId)
      .where('student_id', '=', studentId)
      .executeTakeFirst();
  }

  insertResult(input: {
    assessmentId: string;
    batchId: string;
    studentId: string;
    score: number;
    maxScore: number;
    source: AssessmentResultSource;
    answers: number[] | null;
  }) {
    return this.db
      .insertInto('assessment_results')
      .values({
        id: newId(),
        assessment_id: input.assessmentId,
        batch_id: input.batchId,
        student_id: input.studentId,
        score: input.score,
        max_score: input.maxScore,
        source: input.source,
        answers: input.answers === null ? null : JSON.stringify(input.answers),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Left-joins the student's display name purely for UI convenience —
   *  additive to the base `assessment_results` row shape, doesn't affect
   *  any other caller. */
  listResultsForAssessment(assessmentId: string) {
    return this.db
      .selectFrom('assessment_results')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'assessment_results.student_id',
      )
      .selectAll('assessment_results')
      .select('profiles_student.display_name')
      .where('assessment_id', '=', assessmentId)
      .execute();
  }

  countResultsForAssessment(assessmentId: string): Promise<number> {
    return this.db
      .selectFrom('assessment_results')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('assessment_id', '=', assessmentId)
      .executeTakeFirstOrThrow()
      .then((row) => Number(row.count));
  }

  /** How many of the given students have a result. Completion must be
   *  judged against the CURRENT required roster only — a removed
   *  student's kept result (history) must not count towards someone
   *  else's outstanding submission. */
  async countResultsForStudents(
    assessmentId: string,
    studentIds: string[],
  ): Promise<number> {
    if (studentIds.length === 0) return 0;
    const row = await this.db
      .selectFrom('assessment_results')
      .select((eb) => eb.fn.count('student_id').distinct().as('count'))
      .where('assessment_id', '=', assessmentId)
      .where('student_id', 'in', studentIds)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** All-or-nothing offline scorecard import (spec §15/§47): every
   *  student result, the success audit row, and the assessment's
   *  completed/completed_late transition happen in one transaction — a
   *  failure partway through leaves no partial results. */
  completeOfflineImport(input: {
    assessmentId: string;
    uploadedBy: string;
    results: {
      batchId: string;
      studentId: string;
      score: number;
      maxScore: number;
    }[];
    completedAt: Date;
    completedLate: boolean;
  }) {
    return this.db.transaction().execute(async (trx) => {
      if (input.results.length > 0) {
        await trx
          .insertInto('assessment_results')
          .values(
            input.results.map((r) => ({
              id: newId(),
              assessment_id: input.assessmentId,
              batch_id: r.batchId,
              student_id: r.studentId,
              score: r.score,
              max_score: r.maxScore,
              source: 'offline_scorecard' as const,
              answers: null,
            })),
          )
          .execute();
      }

      await trx
        .insertInto('assessment_scorecard_imports')
        .values({
          id: newId(),
          assessment_id: input.assessmentId,
          uploaded_by: input.uploadedBy,
          status: 'success',
          error_detail: null,
          row_count: input.results.length,
        })
        .execute();

      return trx
        .updateTable('assessments')
        .set({
          status: 'completed',
          completed_at: input.completedAt,
          completed_late: input.completedLate,
        })
        .where('id', '=', input.assessmentId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  recordScorecardImport(input: {
    assessmentId: string;
    uploadedBy: string;
    status: 'success' | 'failed';
    errorDetail: Record<string, unknown> | null;
    rowCount: number;
  }) {
    return this.db
      .insertInto('assessment_scorecard_imports')
      .values({
        id: newId(),
        assessment_id: input.assessmentId,
        uploaded_by: input.uploadedBy,
        status: input.status,
        error_detail:
          input.errorDetail === null ? null : JSON.stringify(input.errorDetail),
        row_count: input.rowCount,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listScorecardImports(assessmentId: string) {
    return this.db
      .selectFrom('assessment_scorecard_imports')
      .selectAll()
      .where('assessment_id', '=', assessmentId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Offline deadline sweep candidates — scorecard_pending assessments
   *  whose deadline has passed (§16 OVERDUE). */
  listOverdueCandidates(asOf: Date) {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('mode', '=', 'offline')
      .where('status', '=', 'scorecard_pending')
      .where('scorecard_deadline_at', 'is not', null)
      .where('scorecard_deadline_at', '<', asOf)
      .execute();
  }

  /** Published online assessments still open (not yet completed) — the
   *  cron sweep's candidates for the `available_until` deadline case. */
  listOpenOnlineCandidates() {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('mode', '=', 'online')
      .where('status', '=', 'published')
      .execute();
  }

  /** Assessments scheduled for today (Asia/Kolkata) — the cron sweep's
   *  scheduled->scorecard_pending transition candidates. */
  listScheduledForDate(date: string) {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('mode', '=', 'offline')
      .where('status', '=', 'scheduled')
      .where('assessment_date', '<=', date)
      .execute();
  }

  /** Every assessment (online or offline, any status) the academy owns,
   *  dated on a single day — Academy Today's "assessments
   *  today"/Upcoming counts (§9/§24). Distinct from listScheduledForDate
   *  above, which is the cron sweep's own narrower offline-only query. */
  listForAcademyOnDate(academyId: string, date: string) {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('academy_id', '=', academyId)
      .where('assessment_date', '=', date)
      .execute();
  }

  /** Offline assessments already past their scorecard deadline, scoped to
   *  one academy — Academy Today's Needs Attention "overdue offline
   *  scorecards" alert (§17). The cron sweep (listOverdueCandidates
   *  above) is what actually flips a row to 'overdue' in the first
   *  place; this just reads that already-maintained status back,
   *  scoped to the academy's own assessments. */
  listOverdueForAcademy(academyId: string) {
    return this.db
      .selectFrom('assessments')
      .selectAll()
      .where('academy_id', '=', academyId)
      .where('status', '=', 'overdue')
      .execute();
  }
}
