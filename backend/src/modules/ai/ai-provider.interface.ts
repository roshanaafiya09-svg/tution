export const AI_PROVIDER = 'AI_PROVIDER';

export interface DigestAttendanceStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  rate: number | null;
}

export interface DigestSubmissionStats {
  submitted: number;
  graded: number;
}

export interface DigestGradeEntry {
  assignmentTitle: string;
  batchTitle: string;
  grade: string;
}

export interface DigestNarrativeInput {
  studentDisplayName: string;
  periodStart: string;
  periodEnd: string;
  attendance: DigestAttendanceStats;
  submissions: DigestSubmissionStats;
  grades: DigestGradeEntry[];
  locale: 'en' | 'ta';
}

export interface QuizQuestionDraft {
  questionText: string;
  /** Exactly 4. */
  choices: string[];
  /** Index into choices, 0-3. */
  correctChoiceIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AiProvider {
  /** Blueprint §8: "attendance, submissions, score trend, one narrative
   *  paragraph, in English or Tamil." The stats themselves are computed
   *  server-side (DigestsService) — this call only turns them into
   *  prose. */
  generateDigestNarrative(input: DigestNarrativeInput): Promise<string>;

  /** Blueprint §8: "PDF chapter in -> 10 draft MCQs with keys and
   *  difficulty." materialText is already-extracted plain text (see
   *  quizzes/pdf-text.ts) — this call never sees the raw file. Output
   *  is always a *draft*: QuizzesService stores it as pending_review,
   *  and nothing here ever reaches a student unreviewed. */
  generateQuizQuestions(
    materialText: string,
    count: number,
  ): Promise<QuizQuestionDraft[]>;
}
