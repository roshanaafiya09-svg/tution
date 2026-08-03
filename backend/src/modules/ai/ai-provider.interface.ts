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

export interface AiProvider {
  /** Blueprint §8: "attendance, submissions, score trend, one narrative
   *  paragraph, in English or Tamil." The stats themselves are computed
   *  server-side (DigestsService) — this call only turns them into
   *  prose. */
  generateDigestNarrative(input: DigestNarrativeInput): Promise<string>;
}
