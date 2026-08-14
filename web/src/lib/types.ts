export interface Me {
  id: string;
  roles: string[];
  phoneE164: string;
  email: string | null;
  locale: string;
}

export interface AdminTeacherSummary {
  id: string;
  displayName: string | null;
  email: string | null;
  phoneE164: string;
  status: 'active' | 'suspended' | 'deleted';
  verificationStatus: 'pending' | 'verified' | 'rejected' | null;
  createdAt: string;
}

export interface AdminStudentSummary {
  id: string;
  displayName: string | null;
  email: string | null;
  phoneE164: string;
  status: 'active' | 'suspended' | 'deleted';
  gradeLevel: string | null;
  createdAt: string;
}

export interface AdminParentSummary {
  id: string;
  email: string | null;
  phoneE164: string;
  status: 'active' | 'suspended' | 'deleted';
  linkedChildren: number;
  createdAt: string;
}

export type ImpersonatedRole = 'tutor' | 'student' | 'parent';

export interface ImpersonationResponse {
  accessToken: string;
  expiresIn: number;
  target: {
    id: string;
    role: ImpersonatedRole;
    displayName: string | null;
    email: string | null;
    phoneE164: string;
  };
}

export type TeachingMode = 'online' | 'offline' | 'both';

export interface TutorProfile {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  slug: string;
  avatar_object_key: string | null;
  avatarUrl: string | null;
  qualifications: string | null;
  languages: string[] | null;
  teaching_mode: TeachingMode | null;
  methodology: string | null;
  achievements: string | null;
  certifications: string | null;
  fee_note: string | null;
}

export interface AvailableBatch {
  id: string;
  title: string;
  subjectId: string;
  gradeLevelId: string;
  feeMinor: number;
  currency: string;
  feePeriod: 'monthly' | 'quarterly' | 'one_time';
  capacity: number;
  seatsRemaining: number;
}

export interface ContactRequest {
  id: string;
  requester_id: string;
  requester_role: 'student' | 'parent';
  message: string | null;
  read_at: string | null;
  created_at: string;
  email: string | null;
  phone_e164: string;
  student_display_name: string | null;
}

export interface Batch {
  id: string;
  title: string;
  subject_id: string;
  grade_level_id: string;
  capacity: number;
  fee_minor: number;
  currency: string;
  fee_period: 'monthly' | 'quarterly' | 'one_time';
  status: 'active' | 'archived';
  created_at: string;
  /** Only present on GET /batches/enrolled (the student's own list) — the
   *  tutor's profiles_tutor.display_name, null if they never set one. */
  tutor_display_name?: string | null;
}

export interface Session {
  id: string;
  batch_id: string;
  batch_title: string;
  scheduled_start_utc: string;
  timezone: string;
  duration_min: number;
  meeting_url: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface Enrollment {
  id: string;
  student_id: string;
  status: 'active' | 'left';
  joined_at: string;
  phone_e164: string;
  display_name: string | null;
}

export interface Invite {
  id: string;
  token: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
}

export interface Subject {
  id: string;
  slug: string;
  name_i18n: Record<string, string>;
}

export interface Curriculum {
  id: string;
  slug: string;
  name: string;
}

export interface GradeLevel {
  id: string;
  curriculum_id: string;
  ordinal: number;
  label: string;
}

export interface FeeEntry {
  id: string;
  student_id: string;
  batch_id: string;
  period_label: string;
  expected_minor: number;
  recorded_paid_minor: number | null;
  currency: string;
  status: 'due' | 'partial' | 'paid' | 'waived';
  paid_at: string | null;
  note: string | null;
  batch_title: string;
  display_name: string | null;
  phone_e164: string;
}

export interface FeeTotals {
  periodLabel: string;
  expectedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  entries: number;
  paidCount: number;
  currency: string;
}

export interface Assignment {
  id: string;
  batch_id: string;
  title: string;
  instructions: string | null;
  due_at_utc: string;
  timezone: string;
}

export interface Material {
  id: string;
  batch_id: string;
  title: string;
  mime: string;
  size_bytes: number;
  created_at: string;
}

export interface Announcement {
  id: string;
  body: string;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  student_id: string;
  status: 'present' | 'absent' | 'late';
  joined_at: string | null;
  method: 'join_tap' | 'manual';
  display_name: string | null;
}

export interface AvailabilityRule {
  id: string;
  weekday: number; // 0 (Sun) - 6 (Sat)
  start_time: string; // HH:mm
  end_time: string;
  timezone: string;
  effective_from: string;
  effective_to: string | null;
}

export interface AvailabilityException {
  id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface TutorSubject {
  id: string;
  subject_id: string;
  curriculum_id: string;
  grade_min: number;
  grade_max: number;
  hourly_rate_minor: number;
  currency: string;
}

export type VerificationDocType = 'id_proof' | 'qualification';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationUpload {
  id: string;
  type: VerificationDocType;
  status: VerificationStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface SubscriptionRecap {
  classesRun: number;
  attendancesMarked: number;
  feesTrackedMinor: number;
  currency: string;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string;
}

export interface SubscriptionPlan {
  label: string;
  priceMinor: number;
  periodDays: number;
}

export interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  amount_minor: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

export interface DiscoveryOffering {
  tutorSubjectId: string;
  subjectId: string;
  subjectName: Record<string, string>;
  subjectSlug: string;
  curriculumId: string;
  gradeMin: number;
  gradeMax: number;
  hourlyRateMinor: number;
}

export interface ReviewSummary {
  count: number;
  average: number | null;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  student_display_name: string | null;
}

export interface DiscoveryTutorResult {
  tutorId: string;
  displayName: string | null;
  slug: string;
  headline: string | null;
  avatarUrl: string | null;
  teachingMode: TeachingMode | null;
  languages: string[];
  location: { city: string; areaLabel: string | null } | null;
  proofOfTeachingScore: number;
  studentsTaught: number;
  rating: ReviewSummary;
  offerings: DiscoveryOffering[];
}

export interface DiscoverySearchResponse {
  gateOpen: boolean;
  curated: boolean;
  results: DiscoveryTutorResult[];
}

export interface ProofOfTeaching {
  tutorId: string;
  score: number;
  studentsTaught: number;
  inputs: {
    verifiedHours: number;
    attendanceRetentionRate: number | null;
    quizImprovementTrend: 'up' | 'flat' | 'down';
  };
}

/** A tutor's active academy affiliation — shown as a "Teaching under"
 *  badge on their own profile and the public tutor page, and the
 *  bidirectional link into Find an Academy (Path 1: Find a Teacher ->
 *  Teacher Profile -> "Teaching under" -> View Academy). */
export interface TutorAcademyAffiliation {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface PublicTutorPage {
  profile: {
    displayName: string | null;
    slug: string;
    headline: string | null;
    bio: string | null;
    yearsExperience: number | null;
    verificationStatus: 'pending' | 'verified' | 'rejected';
    avatarUrl: string | null;
    qualifications: string | null;
    languages: string[];
    teachingMode: TeachingMode | null;
    methodology: string | null;
    achievements: string | null;
    certifications: string | null;
    feeNote: string | null;
  };
  location: { city: string; areaLabel: string | null } | null;
  offerings: DiscoveryOffering[];
  availableBatches: AvailableBatch[];
  proofOfTeaching: ProofOfTeaching;
  reviews: { reviews: Review[]; summary: ReviewSummary };
  academies: TutorAcademyAffiliation[];
}

// --- Find an Academy ---

export type AcademyVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface AcademyOffering {
  tutorSubjectId: string;
  tutorId: string;
  tutorDisplayName: string | null;
  tutorSlug: string;
  subjectId: string;
  subjectName: Record<string, string>;
  subjectSlug: string;
  curriculumId: string;
  gradeMin: number;
  gradeMax: number;
  hourlyRateMinor: number;
}

export interface AcademyCardResult {
  academyId: string;
  name: string;
  slug: string;
  tagline: string | null;
  logoUrl: string | null;
  verificationStatus: AcademyVerificationStatus;
  teachingMode: TeachingMode | null;
  location: { city: string; areaLabel: string | null } | null;
  subjects: string[];
  grades: { min: number; max: number };
  teacherCount: number;
  studentsCount: number | null;
  rating: ReviewSummary;
}

export interface AcademySearchResponse {
  gateOpen: boolean;
  curated: boolean;
  results: AcademyCardResult[];
}

export interface AcademyTeacherSummary {
  tutorId: string;
  displayName: string | null;
  slug: string;
  headline: string | null;
  avatarUrl: string | null;
  yearsExperience: number | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
}

export interface AcademyPhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface AcademyBatch {
  id: string;
  tutorId: string;
  tutorDisplayName: string | null;
  title: string;
  subjectId: string;
  gradeLevelId: string;
  feeMinor: number;
  currency: string;
  feePeriod: 'monthly' | 'quarterly' | 'one_time';
  capacity: number;
  seatsRemaining: number;
}

// --- Academy Dashboard (self-serve, role: 'academy') ---

export interface AcademyOwnerProfile {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  methodology: string | null;
  yearsEstablished: number | null;
  achievements: string | null;
  certifications: string | null;
  teachingMode: TeachingMode | null;
  verificationStatus: AcademyVerificationStatus;
  logoUrl: string | null;
  coverUrl: string | null;
  location: { city: string; areaLabel: string | null; lat: number; lng: number } | null;
}

export interface AcademyOwnerStats {
  verificationStatus: AcademyVerificationStatus;
  teacherCount: number;
  studentsCount: number;
  openBatchesCount: number;
  pendingRequestCount: number;
  unreadContactRequestCount: number;
  rating: ReviewSummary;
}

export interface AcademyActiveTeacher {
  membershipId: string;
  tutorId: string;
  displayName: string | null;
  slug: string;
  headline: string | null;
  avatarUrl: string | null;
  yearsExperience: number | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  joinedAt: string;
}

export interface AcademyPendingRequest {
  requestId: string;
  tutorId: string;
  displayName: string | null;
  slug: string;
  headline: string | null;
  avatarUrl: string | null;
  yearsExperience: number | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  message: string | null;
  requestedAt: string;
}

export interface AcademyRemovedTeacher {
  membershipId: string;
  tutorId: string;
  displayName: string | null;
  slug: string;
  headline: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  leftAt: string | null;
}

/** A tutor's own request to join an academy — all statuses, backs the
 *  Teaching Arrangement pending/declined states and the find-an-academy
 *  "Request to Join" / "Request Pending" button. */
export interface TutorJoinRequestSummary {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  created_at: string;
  decided_at: string | null;
  academy_id: string;
  academy_name: string;
  academy_slug: string;
}

export interface PublicAcademyPage {
  academy: {
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    description: string | null;
    methodology: string | null;
    yearsEstablished: number | null;
    achievements: string | null;
    certifications: string | null;
    teachingMode: TeachingMode | null;
    verificationStatus: AcademyVerificationStatus;
    logoUrl: string | null;
    coverUrl: string | null;
  };
  location: { city: string; areaLabel: string | null } | null;
  teachers: AcademyTeacherSummary[];
  photos: AcademyPhoto[];
  offerings: AcademyOffering[];
  availableBatches: AcademyBatch[];
  studentsCount: number | null;
  reviews: { reviews: Review[]; summary: ReviewSummary };
}

export type BookingStatus = 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
  id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string;
  hourly_rate_minor: number;
  amount_minor: number;
  platform_fee_minor: number;
  currency: string;
  scheduled_start_utc: string;
  original_scheduled_start_utc: string | null;
  timezone: string;
  duration_min: number;
  meeting_url: string | null;
  status: BookingStatus;
  reschedule_count: number;
  cancelled_by: 'student' | 'tutor' | null;
  cancellation_reason: string | null;
  refund_percent: number | null;
  created_at: string;
}

export interface TutorLocation {
  tutor_id: string;
  city: string;
  area_label: string | null;
  lat: number;
  lng: number;
}

export type ParentLinkStatus = 'pending' | 'active';

export interface ParentLink {
  id: string;
  parent_id: string;
  student_id: string;
  status: ParentLinkStatus;
  consent_record_id: string | null;
  created_at: string;
  student_display_name: string | null;
}

export interface Digest {
  id: string;
  parent_id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  locale: string;
  narrative: string;
  stats: {
    attendance?: { present: number; late: number; absent: number };
    submissions?: { submitted: number; graded: number };
    tier?: 'basic' | 'premium';
  };
  created_at: string;
}

export interface ParentPremiumStatus {
  status: 'inactive' | 'active' | 'past_due' | 'cancelled';
  currentPeriodEnd: string | null;
}

/** Shape returned by GET /fees/student/:studentId — narrower than
 *  FeeEntry (the tutor's own listForPeriod join), since this comes from
 *  FeesRepository.listForStudent instead. */
export interface StudentFeeEntry {
  id: string;
  period_label: string;
  expected_minor: number;
  recorded_paid_minor: number | null;
  currency: string;
  status: 'due' | 'partial' | 'paid' | 'waived';
  paid_at: string | null;
  batch_title: string;
}

export interface ProgressSummary {
  studentId: string;
  weeks: {
    weekStart: string;
    attendance: { total: number; present: number; late: number; absent: number; rate: number | null };
    assignments: { due: number; submitted: number; graded: number };
    quizzes: { attempted: number; averageScorePercent: number | null };
  }[];
  summary: {
    overallAttendanceRate: number | null;
    overallAssignmentCompletionRate: number | null;
    overallQuizAverageScorePercent: number | null;
    attendanceTrend: 'up' | 'flat' | 'down';
    quizTrend: 'up' | 'flat' | 'down';
  };
}

export interface PaymentOrder {
  id: string;
  amount_minor: number;
  currency: string;
  provider: string;
  provider_order_id: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
}

export type SenderRole = 'tutor' | 'student' | 'parent';

export interface ThreadMessage {
  id: string;
  sender_id: string;
  sender_role: SenderRole;
  body: string;
  created_at: string;
  sender_display_name: string | null;
}

export interface ThreadSummary {
  batch_id: string;
  student_id: string;
  batch_title: string;
  student_display_name: string | null;
  last_message_at: string;
  message_count: number;
}

export interface AppNotification {
  id: string;
  type: string;
  payload: { title: string; body: string; [key: string]: unknown };
  read_at: string | null;
  created_at: string;
}

export type QuizDraftStatus = 'pending_review' | 'approved' | 'rejected';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizDraftSummary {
  id: string;
  batch_id: string;
  status: QuizDraftStatus;
  created_at: string;
  material_title: string;
}

export interface QuizDraftQuestion {
  id: string;
  quiz_draft_id: string;
  order_index: number;
  question_text: string;
  choices: string[];
  correct_choice_index: number;
  difficulty: QuizDifficulty;
}

export interface QuizDraftDetail {
  id: string;
  tutor_id: string;
  material_id: string;
  batch_id: string;
  status: QuizDraftStatus;
  created_at: string;
  questions: QuizDraftQuestion[];
}

export interface PublishedQuiz {
  id: string;
  quiz_draft_id: string;
  batch_id: string;
  tutor_id: string;
  title: string;
  created_at: string;
  questions: unknown[];
}

export interface QuizAttemptSummary {
  id: string;
  student_id: string;
  score: number;
  total: number;
  submitted_at: string;
  display_name: string | null;
}

/** Shape returned by GET /assignments/me — distinct from Assignment
 *  (the tutor's create/manage shape): carries the batch title and this
 *  student's own submission status inline. */
export interface StudentAssignmentSummary {
  id: string;
  batch_id: string;
  title: string;
  instructions: string | null;
  due_at_utc: string;
  timezone: string;
  batch_title: string;
  submission_id: string | null;
  submitted_at: string | null;
  grade: number | null;
}

export interface StudentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  object_keys: string[];
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
  updated_at: string;
}

export interface AssignmentBatchSummary {
  totalAssignments: number;
  submitted: number;
  graded: number;
  completionRate: number;
}

export interface StudentProfile {
  user_id: string;
  display_name: string;
  grade_level: string | null;
  curriculum_id: string | null;
  school_name: string | null;
  created_at: string;
  updated_at: string;
}

export type DoubtTurnKind = 'hint' | 'full_answer';

export interface DoubtTurn {
  id: string;
  kind: DoubtTurnKind;
  questionText: string;
  answerText: string;
  citations: unknown[];
  flagged: boolean;
  awaitingAttempt: boolean;
  createdAt: string;
}

export interface StudentQuizSummary {
  id: string;
  title: string;
  createdAt: string;
  questionCount: number;
  attempted: boolean;
  score: number | null;
  total: number | null;
  attemptedAt: string | null;
}

export interface QuizTakeQuestion {
  id: string;
  orderIndex: number;
  questionText: string;
  choices: string[];
  /** Only present once the student has already attempted this quiz
   *  (review mode) — absent while the quiz is still unanswered. */
  correctChoiceIndex?: number;
  chosenChoiceIndex?: number;
}

export interface QuizTakeResponse {
  quiz: { id: string; title: string };
  attempted: boolean;
  score?: number;
  total?: number;
  submittedAt?: string;
  questions: QuizTakeQuestion[];
}

export interface QuizSubmitResult {
  id: string;
  score: number;
  total: number;
  submittedAt: string;
  results: {
    questionId: string;
    chosenChoiceIndex: number;
    correctChoiceIndex: number;
    isCorrect: boolean;
  }[];
}

export interface StudentQuizAttemptSummary {
  id: string;
  quiz_id: string;
  score: number;
  total: number;
  submitted_at: string;
  quiz_title: string;
  batch_title: string;
}

/** Shape returned by GET /attendance/me/summary, /attendance/summary/batch/:id
 *  is a distinct (older) per-batch shape and keeps its own `attendanceRate` field. */
export interface AttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  rate: number | null;
}

/** Student/parent attendance history row — GET /attendance/me/history,
 *  /attendance/student/:id/history. batch_title isn't included server-side
 *  (listForStudent is shared with ProgressService); resolve it client-side
 *  from the caller's own batch list. */
export interface AttendanceHistoryEntry {
  id: string;
  session_id: string;
  status: 'present' | 'absent' | 'late';
  joined_at: string | null;
  method: 'join_tap' | 'manual';
  batch_id: string;
  scheduled_start_utc: string;
}

/** Tutor's batch-level attendance history row — GET /attendance/batch/:id/history. */
export interface AttendanceBatchHistoryEntry {
  id: string;
  session_id: string;
  scheduled_start_utc: string;
  student_id: string;
  display_name: string | null;
  status: 'present' | 'absent' | 'late';
  method: 'join_tap' | 'manual';
}
