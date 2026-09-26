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

export interface VerificationQueueItem {
  id: string;
  tutor_id: string;
  type: 'id_proof' | 'qualification';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  tutor_display_name: string | null;
  tutor_email: string | null;
  tutor_phone_e164: string | null;
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

export type ContactRequestStatus = 'new' | 'contacted' | 'interested' | 'joined' | 'not_interested';

export interface ContactRequest {
  id: string;
  requester_id: string;
  requester_role: 'student' | 'parent';
  message: string | null;
  read_at: string | null;
  status: ContactRequestStatus;
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

export type ClassCancellationReason =
  | 'government_holiday'
  | 'academy_holiday'
  | 'teacher_leave'
  | 'manual'
  | 'teacher_manual'
  | 'academy_manual'
  | 'batch_archived';

/** An occurrence of a new recurring series that fell on an Academy holiday
 *  and was therefore not created (see POST /sessions). */
export interface SkippedHolidayOccurrence {
  scheduled_start_utc: string;
  /** The holiday calendar date, YYYY-MM-DD. */
  date: string;
  holiday_name: string;
}

/** Response of POST /sessions and POST /academy/me/batches/:id/sessions —
 *  the created (first) class plus any holiday occurrences skipped. */
export interface CreatedSessionResponse {
  id: string;
  skipped_holiday_occurrences: SkippedHolidayOccurrence[];
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
  /** Only present on GET /sessions/student/:studentId (the parent-facing
   *  route) — the tutor's profiles_tutor.display_name, null if unset. */
  tutor_display_name?: string | null;
  /** Holiday & Teacher Leave feature (migration 0035) — set alongside
   *  status='cancelled' to say why; null for a plain manual cancel that
   *  predates this feature. */
  cancellation_reason?: ClassCancellationReason | null;
  substitute_tutor_id?: string | null;
  substitute_display_name?: string | null;
  /** Only on GET /sessions/me (the teacher's own schedule): the class's
   *  own teacher, and whether the caller teaches it ('owner') or is
   *  covering it as the assigned substitute ('substitute', H6). */
  tutor_id?: string;
  original_tutor_display_name?: string | null;
  viewer_role?: 'owner' | 'substitute';
}

// --- Holiday & Teacher Leave Management (migration 0035) ---

export type HolidayType = 'government_holiday' | 'academy_holiday';
export type HolidayScope = 'academy' | 'batches';

/** `state_code = null` means a national holiday (applies regardless of
 *  the academy's own state) — see the migration's doc comment. */
export interface Holiday {
  id: string;
  type: HolidayType;
  name: string;
  start_date: string;
  end_date: string;
  country_code: string;
  state_code: string | null;
  academy_id: string | null;
  scope: HolidayScope;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A holiday as GET /holidays/me returns it to a teacher / student / parent
 *  calendar. The server has already applied who may see it (a teacher's
 *  Individual profile gets none; a student/parent only the academies whose
 *  own batches they are in, and only holidays that touch them):
 *   - `applies_to_academy_id` / `academy_name`: the academy it is met through;
 *   - `batch_ids`: the batch scope (empty = academy-wide / government);
 *   - `student_ids`: which of the viewer's students it touches (student and
 *     parent viewers; empty for a teacher). */
export interface ViewerHoliday extends Holiday {
  applies_to_academy_id: string;
  academy_name: string;
  batch_ids: string[];
  student_ids: string[];
}

export interface EffectiveHolidays {
  governmentHolidays: Holiday[];
  academyHolidays: Holiday[];
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface TeacherLeaveRequest {
  id: string;
  tutor_id: string;
  academy_id: string;
  start_date: string;
  end_date: string;
  leave_type: 'full_day' | 'specific_classes';
  reason: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Academy admin's view of a leave request — same row, plus the
 *  requesting teacher's display name (GET /academy/me/leave-requests). */
export interface AcademyLeaveRequest extends TeacherLeaveRequest {
  tutor_display_name: string | null;
}

/** One of a leave request's affected classes (GET /leave/:id/sessions
 *  and GET /academy/me/leave-requests/:id/sessions). */
export interface LeaveAffectedSession {
  session_id: string;
  scheduled_start_utc: string;
  timezone: string;
  duration_min: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  substitute_tutor_id: string | null;
  batch_id: string;
  batch_title: string;
}

export interface Enrollment {
  id: string;
  /** Present only on the bulk `/batches/me/students` response. */
  batch_id?: string;
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
  /** Sum of 'waived' entries' expected amount — excluded from
   *  expectedMinor/outstandingMinor, which only cover money still owed. */
  waivedMinor: number;
  outstandingMinor: number;
  entries: number;
  paidCount: number;
  /** Waived entries — neither paid nor owed; see owedCount(). */
  waivedCount: number;
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
  /** Present only on the bulk `/announcements/mine` response. */
  batch_id?: string;
  body: string;
  created_at: string;
}

/** One row per student EXPECTED for the session (active enrollment in its
 *  batch), whether or not attendance has been recorded yet. `status: null`
 *  means Unmarked — not absent, not present — and `id`/`method`/`joined_at`
 *  are null until the teacher (or a join-tap) records something. */
export interface AttendanceRow {
  id: string | null;
  student_id: string;
  status: 'present' | 'absent' | 'late' | null;
  joined_at: string | null;
  method: 'join_tap' | 'manual' | null;
  display_name: string | null;
  /** 'left' = removed from the batch since; the row is shown only because
   *  attendance was already recorded for this class (read-only). */
  enrollment_status?: 'active' | 'left';
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
  verified: boolean;
  yearsExperience: number | null;
  createdAt: string;
  proofOfTeachingScore: number;
  studentsTaught: number;
  rating: ReviewSummary;
  offerings: DiscoveryOffering[];
}

export type DiscoverySortMode = 'recommended' | 'rating' | 'experience' | 'fee' | 'recent';

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

/** A subject the academy teaches in ITS OWN active batches — never a
 *  member teacher's Individual listing or hourly rate. */
export interface AcademyOffering {
  subjectId: string;
  subjectName: Record<string, string>;
  subjectSlug: string;
  gradeMin: number;
  gradeMax: number;
  /** How many of the academy's active batches teach this subject. */
  batchCount: number;
  /** The lowest batch fee among them (minor units). */
  fromFeeMinor: number;
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
  batchCount: number;
  rating: ReviewSummary;
  createdAt: string;
}

export type AcademySortMode = 'recommended' | 'rating' | 'recent';

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
  sortOrder: number;
}

/** Academy Dashboard's own batch-management shape (owner-side CRUD) —
 *  distinct from AcademyBatch below, which is the public "available
 *  batches" shape used by Find an Academy. */
export interface AcademyManagedBatch {
  id: string;
  tutorId: string;
  tutorDisplayName: string | null;
  title: string;
  subjectId: string;
  gradeLevelId: string;
  capacity: number;
  feeMinor: number;
  currency: string;
  feePeriod: 'monthly' | 'quarterly' | 'one_time';
  status: 'active' | 'archived';
  enrolledCount: number;
  createdAt: string;
}

export interface AcademyManagedSession {
  id: string;
  batch_id: string;
  scheduled_start_utc: string;
  timezone: string;
  duration_min: number;
  meeting_url: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  /** class_sessions.selectAll() already returns these (Holiday & Teacher
   *  Leave feature) — just under-typed here until the Schedule tab needed
   *  them. */
  cancellation_reason?: ClassCancellationReason | null;
  substitute_tutor_id?: string | null;
}

/** Cross-academy session shape (camelCase, teacher/subject attributed) —
 *  distinct from AcademyManagedSession, which is scoped to one batch's
 *  detail page and returns the raw class_sessions row. Backs Today's
 *  "Classes happening today"/"Upcoming Classes". */
export interface AcademyTodaySession {
  id: string;
  batchId: string;
  batchTitle: string;
  subjectId: string;
  tutorId: string;
  tutorDisplayName: string | null;
  scheduledStartUtc: string;
  timezone: string;
  durationMin: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  cancellationReason?: ClassCancellationReason | null;
  substituteTutorId?: string | null;
  substituteDisplayName?: string | null;
}

export interface AcademyManagedEnrollment {
  enrollmentId: string;
  studentId: string;
  displayName: string | null;
  phoneE164: string;
  status: 'active' | 'left';
  joinedAt: string;
  batchId: string;
  batchTitle: string;
  tutorId: string;
  tutorDisplayName: string | null;
  subjectId?: string;
  gradeLevelId?: string;
  gradeLevel?: string | null;
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
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  location: { city: string; areaLabel: string | null; lat: number; lng: number } | null;
  /** Holiday & Teacher Leave Management (migration 0035). */
  countryCode: string;
  stateCode: string;
  autoObserveGovtHolidays: boolean;
}

export interface AcademySettingsUpdate {
  countryCode: string;
  stateCode: string;
  autoObserveGovtHolidays: boolean;
}

/** Derived from active members' tutor_subjects, not an editable field —
 *  see AcademyOwnerService.getAcademicInfo's doc comment. */
export interface AcademyAcademicInfo {
  subjects: { subjectId: string; name: string; gradeMin: number; gradeMax: number }[];
}

/** The richer KYC state machine (academy_kyc_verifications) — distinct
 *  from AcademyVerificationStatus above, which stays the existing
 *  3-state field gating discovery/the profile badge and is only ever
 *  synced from a terminal state here. */
export type AcademyKycStatus =
  | 'not_started'
  | 'pending'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'needs_manual_review';

export interface AcademyKycVerificationStatus {
  status: AcademyKycStatus;
  reason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
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

/** Shape of AttendanceRepository.summaryForStudent — distinct from the
 *  AttendanceSummary type below (student/parent attendance history's
 *  `rate` field comes from a different endpoint). */
export interface AcademyAttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number | null;
}

/** Main > Teachers > :id */
export interface AcademyTeacherDetail {
  tutorId: string;
  displayName: string | null;
  slug: string;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  yearsExperience: number | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  qualifications: string | null;
  languages: string[] | null;
  teachingMode: TeachingMode | null;
  methodology: string | null;
  achievements: string | null;
  certifications: string | null;
  joinedAt: string;
  active: boolean;
  subjects: { subjectId: string; name: string; gradeMin: number; gradeMax: number }[];
  batches: {
    id: string;
    title: string;
    subjectId: string;
    gradeLevelId: string;
    status: 'active' | 'archived';
    enrolledCount: number;
  }[];
  upcomingClasses: {
    id: string;
    batchId: string;
    batchTitle: string;
    subjectId: string;
    scheduledStartUtc: string;
    timezone: string;
    durationMin: number;
    status: 'scheduled' | 'completed' | 'cancelled';
  }[];
  leaveHistory: {
    id: string;
    startDate: string;
    endDate: string;
    leaveType: 'full_day' | 'specific_classes';
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    reason: string | null;
  }[];
}

/** Main > Students > :id */
export interface AcademyStudentDetail {
  studentId: string;
  displayName: string | null;
  phoneE164: string;
  gradeLevel: string | null;
  enrollments: {
    enrollmentId: string;
    batchId: string;
    batchTitle: string;
    subjectId: string;
    gradeLevelId: string;
    tutorId: string;
    tutorDisplayName: string | null;
    status: 'active' | 'left';
    joinedAt: string;
    attendance: AcademyAttendanceSummary | null;
  }[];
  parents: { parentId: string; phoneE164: string; email: string | null }[];
}

/** Main > Parents list */
export interface AcademyParentSummary {
  parentId: string;
  phoneE164: string;
  email: string | null;
  childrenCount: number;
  children: { studentId: string; displayName: string | null; status: string }[];
}

/** Main > Parents > :id */
export interface AcademyParentDetail {
  parentId: string;
  phoneE164: string;
  email: string | null;
  children: {
    studentId: string;
    displayName: string | null;
    gradeLevel: string | null;
    batches: {
      batchId: string;
      batchTitle: string;
      tutorId: string;
      tutorDisplayName: string | null;
      status: 'active' | 'left';
      attendance: AcademyAttendanceSummary | null;
    }[];
  }[];
}

/** Main > Academic > Attendance — Today's summary cards. */
export interface AcademyAttendanceTodaySummary {
  classesToday: number;
  classesCompleted: number;
  studentsExpected: number;
  present: number;
  absent: number;
  attendancePercent: number | null;
  teachersToday: (string | null)[];
}

/** Main > Academic > Attendance — one table row per session. */
export interface AcademyAttendanceRow {
  sessionId: string;
  scheduledStartUtc: string;
  batchId: string;
  batchTitle: string;
  tutorId: string;
  tutorDisplayName: string | null;
  totalStudents: number;
  present: number;
  absent: number;
  attendancePercent: number | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  cancellationReason: ClassCancellationReason | null;
}

export interface AcademyStudentAttendanceHistoryRow {
  id: string;
  session_id: string;
  status: 'present' | 'absent' | 'late';
  joined_at: string | null;
  method: 'join_tap' | 'manual';
  batch_id: string;
  scheduled_start_utc: string;
}

/** Main > Academic > Attendance > student drill-down. */
export interface AcademyStudentAttendance {
  summary: { total: number; present: number; late: number; absent: number; rate: number | null };
  history: AcademyStudentAttendanceHistoryRow[];
}

/** Main > Academic > Attendance > batch drill-down (also feeds the Batch
 *  Detail page's enriched Students tab). */
export interface AcademyBatchAttendance {
  batchId: string;
  students: { studentId: string; displayName: string | null; summary: AcademyAttendanceSummary }[];
  recentHistory: {
    id: string;
    session_id: string;
    scheduled_start_utc: string;
    student_id: string;
    display_name: string | null;
    status: 'present' | 'absent' | 'late';
    method: 'join_tap' | 'manual';
  }[];
}

// --- Teacher Attendance (Academic > Attendance > Teacher) — deliberately
// separate from the AcademyAttendance* family above (student attendance):
// no shared table, no shared write path. "Not Recorded" means a scheduled
// class has no attendance record yet — SCHEDULED ≠ PRESENT. */

export type AcademyTeacherAttendanceStatus =
  | 'present'
  | 'absent'
  | 'approved_leave'
  | 'holiday'
  | 'cancelled'
  | 'not_recorded';

export interface AcademyTeacherAttendanceTodaySummary {
  classesToday: number;
  teachersExpected: number;
  present: number;
  absent: number;
  onLeave: number;
  attendancePercent: number | null;
}

/** One row per (date, teacher). */
export interface AcademyTeacherAttendanceRow {
  date: string;
  teacherId: string;
  teacherDisplayName: string | null;
  scheduledClasses: number;
  present: number;
  absent: number;
  approvedLeave: number;
  attendancePercent: number | null;
}

export interface AcademyTeacherAttendanceHistoryRow {
  sessionId: string;
  scheduledStartUtc: string;
  batchId: string;
  batchTitle: string;
  status: AcademyTeacherAttendanceStatus;
}

/** Main > Academic > Attendance > Teacher > teacher drill-down. */
export interface AcademyTeacherAttendance {
  teacherId: string;
  teacherDisplayName: string | null;
  summary: {
    scheduledClasses: number;
    present: number;
    absent: number;
    approvedLeave: number;
    attendancePercent: number | null;
  };
  history: AcademyTeacherAttendanceHistoryRow[];
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

// --- Academy Dashboard > Communication > Announcements (migration 0037) ---

export type AcademyAnnouncementAudience =
  | 'academy'
  | 'teachers'
  | 'students'
  | 'parents'
  | 'batch'
  | 'teacher'
  | 'student';
export type AcademyAnnouncementStatus = 'draft' | 'published' | 'archived';

export interface AcademyAnnouncement {
  id: string;
  academy_id: string;
  created_by: string;
  title: string;
  body: string;
  audience_type: AcademyAnnouncementAudience;
  audience_batch_id: string | null;
  audience_teacher_id: string | null;
  audience_student_id: string | null;
  status: AcademyAnnouncementStatus;
  recipient_count: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audienceType: AcademyAnnouncementAudience;
  audienceBatchId?: string;
  audienceTeacherId?: string;
  audienceStudentId?: string;
  publishNow?: boolean;
}

/** Recipient-facing shape (GET /announcements/:id) — a teacher/student/
 *  parent reading the announcement they were sent. Deliberately leaner
 *  than AcademyAnnouncement (no audience/status/recipient-count fields —
 *  those are the admin's own targeting details, not the recipient's
 *  concern). */
export interface AcademyAnnouncementForRecipient {
  id: string;
  title: string;
  body: string;
  academyName: string | null;
  publishedAt: string | null;
}

// --- Academy Dashboard > Reports ---

export interface AcademyReportSummary {
  teacherCount: number;
  studentsCount: number;
  batchCount: number;
  activeBatchCount: number;
  sessionsToday: number;
  teachersToday: (string | null)[];
  pendingLeaveCount: number;
  upcomingHolidaysCount: number;
  contactRequestsByStatus: Record<string, number>;
}

export interface AcademyStudentReportRow {
  studentId: string;
  displayName: string | null;
  batchId: string;
  batchTitle: string;
  tutorId: string;
  tutorDisplayName: string | null;
  gradeLevel: string | null;
  joinedAt: string;
  attendance: { total: number; present: number; late: number; absent: number; rate: number | null } | null;
}

export interface AcademyStudentsReport {
  totalStudents: number;
  newStudentsInRange: number;
  studentsByBatch: { batchId: string; count: number }[];
  studentsByTeacher: { tutorId: string; tutorDisplayName: string | null; count: number }[];
  rows: AcademyStudentReportRow[];
}

export interface AcademyTeacherReportRow {
  tutorId: string;
  tutorDisplayName: string | null;
  classCount: number;
  completedCount: number;
  cancelledCount: number;
  pendingLeaveCount: number;
  approvedLeaveCount: number;
  rejectedLeaveCount: number;
}

export interface AcademyTeachersReport {
  totalTeachers: number;
  rows: AcademyTeacherReportRow[];
}

export interface AcademyBatchReportRow {
  batchId: string;
  title: string;
  tutorId: string;
  tutorDisplayName: string | null;
  subjectId: string;
  gradeLevelId: string;
  status: 'active' | 'archived';
  capacity: number;
  enrolledCount: number;
  upcomingSessionCount: number;
}

export interface AcademyBatchesReport {
  totalBatches: number;
  activeBatches: number;
  rows: AcademyBatchReportRow[];
}

export interface AcademyAbsentStudentRow {
  sessionId: string;
  studentId: string;
  displayName: string | null;
  batchId: string;
  batchTitle: string;
  tutorId: string;
  tutorDisplayName: string | null;
  subjectId: string;
  scheduledStartUtc: string;
  timezone: string;
  status: 'absent';
}

export interface AcademyAttendanceReport {
  totalAbsences: number;
  rows: AcademyAbsentStudentRow[];
}

export interface AcademySessionReportRow {
  sessionId: string;
  scheduledStartUtc: string;
  timezone: string;
  batchId: string;
  batchTitle: string;
  subjectId: string;
  tutorId: string;
  tutorDisplayName: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  cancellationReason: ClassCancellationReason | null;
}

export interface AcademySessionsReport {
  total: number;
  completed: number;
  cancelled: number;
  scheduled: number;
  byTeacher: { tutorId: string; tutorDisplayName: string | null; count: number }[];
  byBatch: { batchId: string; count: number }[];
  byDate: { date: string; count: number }[];
  rows: AcademySessionReportRow[];
}

export interface AcademyLeaveReportRow {
  id: string;
  tutorId: string;
  tutorDisplayName: string | null;
  startDate: string;
  endDate: string;
  leaveType: 'full_day' | 'specific_classes';
  reason: string | null;
  status: LeaveStatus;
  classesAffected: number;
}

export interface AcademyLeaveReport {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  rows: AcademyLeaveReportRow[];
}

export interface AcademyHolidayReportRow {
  id: string;
  type: HolidayType;
  name: string;
  startDate: string;
  endDate: string;
  affectedClasses: number;
}

export interface AcademyHolidaysReport {
  governmentCount: number;
  academyCount: number;
  rows: AcademyHolidayReportRow[];
}

export interface AcademyContactRequestReportRow {
  id: string;
  createdAt: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: ContactRequestStatus;
}

export interface AcademyContactRequestsReport {
  total: number;
  byStatus: Record<string, number>;
  rows: AcademyContactRequestReportRow[];
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
  subjects: string[] | null;
  languages: string[] | null;
  location: string | null;
  teaching_mode: TeachingMode | null;
  learning_goals: string | null;
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
  /** Present only on the bulk `/quizzes/mine` response. */
  batchId?: string;
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

// --- Assessments (Quiz -> Assessment overhaul) ---
// Deliberately parallel to, not a replacement for, the Quiz* types above
// — see the backend's migration 0039 doc comment. Teacher-facing GET
// responses spread the raw assessment row (snake_case columns) alongside
// a few explicitly-added camelCase fields (batchIds, questions,
// batches) — same mixed shape QuizDraftDetail already has in this file.

export type AssessmentMode = 'online' | 'offline';
export type AssessmentStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'scorecard_pending'
  | 'completed'
  | 'overdue';

export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  order_index: number;
  question_text: string;
  choices: string[];
  correct_choice_index: number;
  marks: number;
  difficulty: QuizDifficulty;
  explanation: string | null;
}

export interface AssessmentRow {
  id: string;
  tutor_id: string;
  mode: AssessmentMode;
  title: string;
  subject_id: string;
  status: AssessmentStatus;
  max_score: number | null;
  question_paper_object_key: string | null;
  question_paper_mime: string | null;
  assessment_date: string | null;
  scorecard_deadline_at: string | null;
  available_until: string | null;
  week_start_date: string;
  published_at: string | null;
  completed_at: string | null;
  completed_late: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnlineAssessmentDetail extends AssessmentRow {
  batchIds: string[];
  questions: AssessmentQuestion[];
}

export interface OfflineAssessmentDetail extends AssessmentRow {
  batches: { id: string; title: string }[];
}

/** GET /assessments/online/student/me — one row per published/completed
 *  online assessment across the student's enrolled batches, plus one per
 *  offline assessment whose scorecard has been imported with a result for
 *  this student (those are always `attempted`, mode 'offline'). */
export interface StudentOnlineAssessmentSummary {
  id: string;
  title: string;
  subjectId: string;
  mode: AssessmentMode;
  status: AssessmentStatus;
  publishedAt: string | null;
  /** Offline only — the date the paper was conducted. */
  assessmentDate: string | null;
  maxScore: number | null;
  attempted: boolean;
  score: number | null;
}

export interface AssessmentTakeQuestion {
  id: string;
  orderIndex: number;
  questionText: string;
  choices: string[];
  marks: number;
  /** Only present once the student has already attempted this assessment
   *  (review mode). */
  correctChoiceIndex?: number;
  explanation?: string | null;
  chosenChoiceIndex?: number | null;
}

export interface AssessmentTakeResponse {
  assessment: { id: string; title: string };
  attempted: boolean;
  /** Only present before an attempt: false once the assessment has closed
   *  (completed without this student), so the form must not be offered. */
  open?: boolean;
  score?: number;
  maxScore?: number | null;
  submittedAt?: string;
  questions: AssessmentTakeQuestion[];
}

export interface AssessmentSubmitResult {
  id: string;
  score: number;
  maxScore: number | null;
  submittedAt: string;
  results: {
    questionId: string;
    chosenChoiceIndex: number;
    correctChoiceIndex: number;
    isCorrect: boolean;
    marks: number;
  }[];
}

export interface ScorecardImportOutcome {
  status: 'success' | 'failed';
  rowCount: number;
  errors: string[];
  completedAt?: string;
  completedLate?: boolean;
}

export interface ScorecardImportRecord {
  id: string;
  assessment_id: string;
  uploaded_by: string;
  status: 'success' | 'failed';
  error_detail: { errors: string[]; totalErrorCount: number } | null;
  row_count: number;
  created_at: string;
}

/** GET /academy/me/assessments/weekly-compliance. */
export interface WeeklyComplianceRow {
  tutorId: string;
  teacherDisplayName: string | null;
  status: AssessmentStatus | 'not_scheduled';
  assessment: {
    id: string;
    title: string;
    mode: AssessmentMode;
    batchCount: number;
    batchNames: string[];
    assessmentDate: string | null;
    completedAt: string | null;
    completedLate: boolean;
  } | null;
  additionalAssessmentCount: number;
}

export interface WeeklyComplianceResponse {
  weekStartDate: string;
  summary: {
    teachers: number;
    completed: number;
    pending: number;
    overdue: number;
    notScheduled: number;
  };
  teachers: WeeklyComplianceRow[];
}

/** GET /assessments/online/:id/results. */
export interface AssessmentResult {
  id: string;
  assessment_id: string;
  batch_id: string;
  student_id: string;
  score: number;
  max_score: number;
  source: 'online_submission' | 'offline_scorecard';
  submitted_at: string;
  display_name: string | null;
}

/** GET /academy/me/assessments/:id. */
export interface AcademyAssessmentDetail {
  id: string;
  title: string;
  subjectId: string;
  mode: AssessmentMode;
  status: AssessmentStatus;
  assessmentDate: string | null;
  maxScore: number | null;
  publishedAt: string | null;
  completedAt: string | null;
  completedLate: boolean;
  hasQuestionPaper: boolean;
  batches: {
    id: string;
    title: string;
    results: {
      studentId: string;
      studentName: string | null;
      score: number;
      maxScore: number;
      source: 'online_submission' | 'offline_scorecard';
      submittedAt: string;
    }[];
  }[];
  studentCount: number;
  scorecardImports: {
    id: string;
    status: 'success' | 'failed';
    rowCount: number;
    createdAt: string;
  }[];
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
  /** Present only on the bulk `/attendance/batches/mine/history` response. */
  batch_id?: string;
  scheduled_start_utc: string;
  student_id: string;
  display_name: string | null;
  status: 'present' | 'absent' | 'late';
  method: 'join_tap' | 'manual';
}

// --- Academy Today command center (GET /academy/me/today) ---

export interface AcademyTodayOverview {
  classesToday: number;
  classesCancelledToday: number;
  /** Of `classesToday`, how many already have at least one attendance row
   *  recorded — not the same as `classesCompleted` (a class can be over
   *  without attendance having been marked yet). */
  attendanceRecordedCount: number;
  teachersActive: number;
  teachersOnLeaveToday: number;
  assessmentsToday: number;
}

/** One row in Today's class timeline — same shape as AcademyTodaySession
 *  plus the two fields the timeline needs that the plain sessions list
 *  doesn't: enrolled headcount and whether attendance is already in. */
export interface AcademyTodayClass extends AcademyTodaySession {
  enrolledCount: number;
  attendanceRecorded: boolean;
}

/** Purely operational counts — never a ranking, never a score. Each
 *  field backs one Needs Attention row; a zero hides that row. */
export interface AcademyNeedsAttention {
  pendingLeaveRequests: number;
  overdueScorecards: number;
  missingAttendance: number;
  pendingContactRequests: number;
  teachersWithoutWeeklyAssessment: number;
}

export interface AcademyUpcomingSummary {
  /** Tomorrow's date, Asia/Kolkata. */
  date: string;
  classes: number;
  assessments: number;
  teacherLeave: number;
}

export interface AcademyRecentActivity {
  activeTeachers: { membershipId: string; tutorId: string; displayName: string | null; joinedAt: string }[];
  contactRequests: { id: string; studentDisplayName: string | null; createdAt: string; readAt: string | null }[];
  reviews: { id: string; studentDisplayName: string | null; rating: number; createdAt: string }[];
  batches: { id: string; title: string; tutorDisplayName: string | null; createdAt: string }[];
  leaveRequests: {
    id: string;
    tutorDisplayName: string | null;
    status: LeaveStatus;
    startDate: string;
    endDate: string;
    createdAt: string;
  }[];
}

/** GET /academy/me/today — Academy Today's single aggregated payload. */
export interface AcademyToday {
  /** Today's date, Asia/Kolkata. */
  date: string;
  overview: AcademyTodayOverview;
  classes: AcademyTodayClass[];
  needsAttention: AcademyNeedsAttention;
  upcoming: AcademyUpcomingSummary;
  recentActivity: AcademyRecentActivity;
}
