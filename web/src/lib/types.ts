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

export interface TutorProfile {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  slug: string;
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
  proofOfTeachingScore: number;
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
  inputs: {
    verifiedHours: number;
    attendanceRetentionRate: number | null;
    quizImprovementTrend: 'up' | 'flat' | 'down';
  };
}

export interface PublicTutorPage {
  profile: {
    displayName: string | null;
    slug: string;
    headline: string | null;
    bio: string | null;
    yearsExperience: number | null;
    verificationStatus: 'pending' | 'verified' | 'rejected';
  };
  location: { city: string; areaLabel: string | null } | null;
  offerings: DiscoveryOffering[];
  proofOfTeaching: ProofOfTeaching;
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
