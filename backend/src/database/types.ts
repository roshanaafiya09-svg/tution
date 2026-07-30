import { ColumnType, Generated, JSONColumnType } from 'kysely';

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
  diff: JSONColumnType<Record<string, unknown>> | null;
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

// OTP challenges and refresh tokens live in Redis, not Postgres — see
// modules/identity/otp/otp.repository.ts and
// modules/identity/auth/refresh-token.repository.ts.

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

  fee_ledger: FeeLedgerTable;
  subscriptions: SubscriptionsTable;
  audit_logs: AuditLogsTable;
  notifications: NotificationsTable;
}
