import { ColumnType, Generated, JSONColumnType, RawBuilder } from 'kysely';

/** Timestamp column the caller always supplies. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** Timestamp column with a DB default (now()) — optional on insert. */
type GeneratedTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

// --- identity & trust ---

export interface UsersTable {
  id: string;
  phone_e164: string;
  email: ColumnType<string | null, string | null | undefined, string | null>;
  locale: Generated<'en' | 'ta'>;
  timezone: Generated<string>;
  dob: ColumnType<string | null, string | null | undefined, string | null>;
  status: Generated<'active' | 'suspended' | 'deleted'>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
}

export type UserRole =
  | 'tutor'
  | 'student'
  | 'parent'
  | 'support'
  | 'trust_safety'
  | 'finance'
  | 'growth'
  | 'superadmin';

export interface UserRolesTable {
  user_id: string;
  role: UserRole;
  granted_at: GeneratedTimestamp;
}

export interface ProfilesTutorTable {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  verification_status: Generated<'pending' | 'verified' | 'rejected'>;
  slug: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ProfilesStudentTable {
  user_id: string;
  display_name: string;
  grade_level: string | null;
  curriculum_id: string | null;
  school_name: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface TutorVerificationsTable {
  id: string;
  tutor_id: string;
  type: 'id_proof' | 'qualification';
  document_key: string;
  status: Generated<'pending' | 'approved' | 'rejected'>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ConsentRecordsTable {
  id: string;
  user_id: string;
  consent_type: string;
  policy_version: string;
  granted_at: GeneratedTimestamp;
  ip: string | null;
  user_agent: string | null;
}

// --- catalog ---

export interface CurriculaTable {
  id: string;
  slug: string;
  name: string;
  country_code: Generated<string>;
  created_at: GeneratedTimestamp;
}

export interface SubjectsTable {
  id: string;
  slug: string;
  name_i18n: JSONColumnType<Record<string, string>>;
  created_at: GeneratedTimestamp;
}

export interface GradeLevelsTable {
  id: string;
  curriculum_id: string;
  ordinal: number;
  label: string;
}

export interface TutorSubjectsTable {
  id: string;
  tutor_id: string;
  subject_id: string;
  curriculum_id: string;
  grade_min: number;
  grade_max: number;
  hourly_rate_minor: number;
  currency: Generated<string>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface TutorAvailabilityTable {
  id: string;
  tutor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: Generated<string>;
  effective_from: string;
  effective_to: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface TutorAvailabilityExceptionsTable {
  id: string;
  tutor_id: string;
  date: string;
  is_available: Generated<boolean>;
  start_time: string | null;
  end_time: string | null;
  created_at: GeneratedTimestamp;
}

// --- scheduling ---

export interface BatchesTable {
  id: string;
  tutor_id: string;
  title: string;
  subject_id: string;
  grade_level_id: string;
  capacity: number;
  fee_minor: number;
  currency: Generated<string>;
  fee_period: Generated<'monthly' | 'quarterly' | 'one_time'>;
  status: Generated<'active' | 'archived'>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface EnrollmentsTable {
  id: string;
  batch_id: string;
  student_id: string;
  status: Generated<'active' | 'left'>;
  joined_at: GeneratedTimestamp;
  left_at: Timestamp | null;
  updated_at: GeneratedTimestamp;
}

export interface InvitesTable {
  id: string;
  tutor_id: string;
  batch_id: string;
  token: string;
  expires_at: Timestamp;
  max_uses: Generated<number>;
  used_count: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ClassSessionsTable {
  id: string;
  batch_id: string;
  tutor_id: string;
  scheduled_start_utc: Timestamp;
  timezone: Generated<string>;
  duration_min: number;
  meeting_url: string | null;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  status: Generated<'scheduled' | 'completed' | 'cancelled'>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AttendanceTable {
  id: string;
  session_id: string;
  student_id: string;
  status: 'present' | 'absent' | 'late';
  joined_at: Timestamp | null;
  marked_by: string | null;
  method: Generated<'join_tap' | 'manual'>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- delivery & assessment ---

export interface MaterialsTable {
  id: string;
  batch_id: string;
  tutor_id: string;
  title: string;
  object_key: string;
  mime: string;
  size_bytes: number;
  created_at: GeneratedTimestamp;
}

export interface AssignmentsTable {
  id: string;
  batch_id: string;
  title: string;
  instructions: string | null;
  due_at_utc: Timestamp;
  timezone: Generated<string>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface SubmissionsTable {
  id: string;
  assignment_id: string;
  student_id: string;
  // Insert type is optional because the column has a DB default.
  // Generated<JSONColumnType<T>> would nest ColumnTypes and break.
  object_keys: JSONColumnType<string[], string | undefined, string>;
  submitted_at: GeneratedTimestamp;
  grade: string | null;
  feedback: string | null;
  graded_at: Timestamp | null;
  updated_at: GeneratedTimestamp;
}

export interface AnnouncementsTable {
  id: string;
  batch_id: string;
  tutor_id: string;
  body: string;
  created_at: GeneratedTimestamp;
}

/** Thread key is (batch_id, student_id) — see migration 0013. */
export interface MessagesTable {
  id: string;
  batch_id: string;
  student_id: string;
  sender_id: string;
  sender_role: 'tutor' | 'student' | 'parent';
  body: string;
  created_at: GeneratedTimestamp;
}

// --- billing & platform ---

export interface FeeLedgerTable {
  id: string;
  tutor_id: string;
  student_id: string;
  batch_id: string;
  period_label: string;
  expected_minor: number;
  currency: Generated<string>;
  status: Generated<'due' | 'partial' | 'paid' | 'waived'>;
  recorded_paid_minor: number | null;
  paid_at: Timestamp | null;
  note: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface SubscriptionsTable {
  id: string;
  tutor_id: string;
  plan_id: Generated<string>;
  status: Generated<'trialing' | 'active' | 'past_due' | 'cancelled'>;
  trial_ends_at: Timestamp;
  current_period_end: Timestamp | null;
  provider: string | null;
  provider_ref: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AuditLogsTable {
  id: string;
  actor_id: string | null;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string;
  // Same insert-optional form as notifications.payload / submissions.object_keys
  // above — the bare `JSONColumnType<T> | null` form types inserts as an
  // object when the driver actually needs a JSON string (see milestone 5).
  diff: JSONColumnType<
    Record<string, unknown>,
    string | undefined,
    string
  > | null;
  ip: string | null;
  created_at: GeneratedTimestamp;
}

export interface NotificationsTable {
  id: string;
  user_id: string;
  type: string;
  payload: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  read_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export interface DeviceTokensTable {
  id: string;
  user_id: string;
  token: string;
  platform: Generated<'android' | 'ios'>;
  created_at: GeneratedTimestamp;
  last_seen_at: GeneratedTimestamp;
}

// --- Phase 2: billing & parents ---

/** Exactly one of fee_ledger_id / subscription_id / parent_subscription_id
 *  is set — see migration 0014 (two-way) and 0019 (three-way). */
export interface PaymentsTable {
  id: string;
  fee_ledger_id: string | null;
  subscription_id: string | null;
  parent_subscription_id: string | null;
  /** Only set for subscription/parent-premium purchases — which plan
   *  tier, needed at capture time to compute current_period_end. */
  plan_id: string | null;
  payer_id: string;
  amount_minor: number;
  currency: Generated<string>;
  status: Generated<
    'created' | 'authorized' | 'captured' | 'failed' | 'refunded'
  >;
  provider: Generated<string>;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  failure_reason: string | null;
  /** Which payout (below) this captured fee-collection payment was
   *  aggregated into — see migration 0015. Null for subscription
   *  payments and for fee payments not yet paid out. */
  payout_id: string | null;
  /** Fourth settleable target (blueprint §10 Phase 4) — a 1:1 marketplace
   *  booking payment. See migration 0021. */
  booking_id: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PayoutsTable {
  id: string;
  tutor_id: string;
  amount_minor: number;
  currency: Generated<string>;
  status: Generated<'pending' | 'processing' | 'paid' | 'failed'>;
  provider: Generated<string>;
  provider_payout_id: string | null;
  period_start: string;
  period_end: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

/** Razorpay Route linked-account onboarding status — KYC/bank details
 *  happen entirely out of band; this just records the resulting id. */
export interface TutorPayoutAccountsTable {
  tutor_id: string;
  provider: Generated<string>;
  provider_account_id: string | null;
  status: Generated<'pending' | 'active' | 'rejected'>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

/** Parent premium tier (blueprint §5/§10 Phase 3) — no trial, opt-in
 *  paid only, so status starts 'inactive' rather than 'trialing'. See
 *  migration 0019. */
export interface ParentPremiumSubscriptionsTable {
  id: string;
  parent_id: string;
  plan_id: string | null;
  status: Generated<'inactive' | 'active' | 'past_due' | 'cancelled'>;
  current_period_end: Timestamp | null;
  provider: string | null;
  provider_ref: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ParentChildLinksTable {
  id: string;
  parent_id: string;
  student_id: string;
  status: Generated<'pending' | 'active' | 'revoked'>;
  consent_record_id: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface DigestsTable {
  id: string;
  parent_id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  locale: Generated<string>;
  narrative: string;
  stats: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  sent_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

/** Phase 2 only — not Phase 3's student-facing quizzes/quiz_attempts.
 *  See migration 0016. */
export interface QuizDraftsTable {
  id: string;
  tutor_id: string;
  material_id: string;
  batch_id: string;
  status: Generated<'pending_review' | 'approved' | 'rejected'>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface QuizDraftQuestionsTable {
  id: string;
  quiz_draft_id: string;
  order_index: number;
  question_text: string;
  choices: JSONColumnType<string[]>;
  correct_choice_index: number;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface QuizzesTable {
  id: string;
  quiz_draft_id: string;
  batch_id: string;
  tutor_id: string;
  title: string;
  created_at: GeneratedTimestamp;
}

export interface QuizQuestionsTable {
  id: string;
  quiz_id: string;
  order_index: number;
  question_text: string;
  choices: JSONColumnType<string[]>;
  correct_choice_index: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuizAttemptsTable {
  id: string;
  quiz_id: string;
  student_id: string;
  answers: JSONColumnType<number[]>;
  score: number;
  total: number;
  submitted_at: GeneratedTimestamp;
}

/** `embedding` is pgvector, not a Kysely-native type. The Insert/Update
 *  type is `RawBuilder<unknown>` on purpose — it forces every write to
 *  go through a `sql`-tagged `::vector` cast (see
 *  material-chunks.repository.ts's vectorLiteral helper) rather than a
 *  plain string that node-postgres wouldn't know how to cast. Selected
 *  type is `string` (pgvector's text form) but application code never
 *  actually selects it — searches only need id/content/material_id. */
export interface MaterialChunksTable {
  id: string;
  material_id: string;
  batch_id: string;
  tutor_id: string;
  chunk_index: number;
  content: string;
  embedding: ColumnType<string, RawBuilder<unknown>, RawBuilder<unknown>>;
  created_at: GeneratedTimestamp;
}

export interface AiInteractionCitation {
  materialId: string;
  materialTitle: string;
  chunkIndex: number;
}

export interface AiInteractionsTable {
  id: string;
  student_id: string;
  batch_id: string;
  parent_id: string | null;
  kind: 'hint' | 'full_answer';
  question_text: string;
  answer_text: string;
  citations: JSONColumnType<AiInteractionCitation[]>;
  flagged: Generated<boolean>;
  input_tokens: Generated<number>;
  output_tokens: Generated<number>;
  created_at: GeneratedTimestamp;
}

// OTP challenges and refresh tokens live in Redis, not Postgres — see
// modules/identity/otp/otp.repository.ts and
// modules/identity/auth/refresh-token.repository.ts.

// --- marketplace (Phase 4) ---

export interface TutorLocationsTable {
  tutor_id: string;
  city: string;
  area_label: string | null;
  lat: number;
  lng: number;
  geog: ColumnType<string, RawBuilder<unknown>, RawBuilder<unknown>>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface BookingWaitlistsTable {
  id: string;
  tutor_subject_id: string;
  tutor_id: string;
  student_id: string;
  status: Generated<
    'waiting' | 'notified' | 'converted' | 'expired' | 'cancelled'
  >;
  notified_at: Timestamp | null;
  expires_at: Timestamp | null;
  converted_booking_id: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface BookingsTable {
  id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string;
  hourly_rate_minor: number;
  amount_minor: number;
  platform_fee_minor: Generated<number>;
  currency: Generated<string>;
  scheduled_start_utc: Timestamp;
  timezone: Generated<string>;
  duration_min: number;
  meeting_url: string | null;
  status: Generated<
    'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  >;
  cancelled_by: 'student' | 'tutor' | null;
  cancellation_reason: string | null;
  refund_percent: number | null;
  original_scheduled_start_utc: Timestamp | null;
  reschedule_count: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ReviewsTable {
  id: string;
  tutor_id: string;
  student_id: string;
  rating: number;
  comment: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface DB {
  users: UsersTable;
  user_roles: UserRolesTable;
  profiles_tutor: ProfilesTutorTable;
  profiles_student: ProfilesStudentTable;
  tutor_verifications: TutorVerificationsTable;
  consent_records: ConsentRecordsTable;

  curricula: CurriculaTable;
  subjects: SubjectsTable;
  grade_levels: GradeLevelsTable;
  tutor_subjects: TutorSubjectsTable;
  tutor_availability: TutorAvailabilityTable;
  tutor_availability_exceptions: TutorAvailabilityExceptionsTable;

  batches: BatchesTable;
  enrollments: EnrollmentsTable;
  invites: InvitesTable;
  class_sessions: ClassSessionsTable;
  attendance: AttendanceTable;

  materials: MaterialsTable;
  assignments: AssignmentsTable;
  submissions: SubmissionsTable;
  announcements: AnnouncementsTable;
  messages: MessagesTable;

  fee_ledger: FeeLedgerTable;
  subscriptions: SubscriptionsTable;
  audit_logs: AuditLogsTable;
  notifications: NotificationsTable;
  device_tokens: DeviceTokensTable;

  payments: PaymentsTable;
  payouts: PayoutsTable;
  tutor_payout_accounts: TutorPayoutAccountsTable;
  parent_premium_subscriptions: ParentPremiumSubscriptionsTable;
  parent_child_links: ParentChildLinksTable;
  digests: DigestsTable;
  quiz_drafts: QuizDraftsTable;
  quiz_draft_questions: QuizDraftQuestionsTable;
  quizzes: QuizzesTable;
  quiz_questions: QuizQuestionsTable;
  quiz_attempts: QuizAttemptsTable;
  material_chunks: MaterialChunksTable;
  ai_interactions: AiInteractionsTable;

  tutor_locations: TutorLocationsTable;
  bookings: BookingsTable;
  booking_waitlists: BookingWaitlistsTable;
  reviews: ReviewsTable;
}
