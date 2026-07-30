import { ColumnType, Generated, JSONColumnType } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

// --- identity & trust ---

export interface UsersTable {
  id: string;
  phone_e164: string;
  email: string | null;
  locale: 'en' | 'ta';
  timezone: string;
  dob: ColumnType<string, string, string> | null;
  status: 'active' | 'suspended' | 'deleted';
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
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
  granted_at: Generated<Timestamp>;
}

export interface ProfilesTutorTable {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  slug: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ProfilesStudentTable {
  user_id: string;
  display_name: string;
  grade_level: string | null;
  curriculum_id: string | null;
  school_name: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TutorVerificationsTable {
  id: string;
  tutor_id: string;
  type: 'id_proof' | 'qualification';
  document_key: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ConsentRecordsTable {
  id: string;
  user_id: string;
  consent_type: string;
  policy_version: string;
  granted_at: Generated<Timestamp>;
  ip: string | null;
  user_agent: string | null;
}

// --- catalog ---

export interface CurriculaTable {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  created_at: Generated<Timestamp>;
}

export interface SubjectsTable {
  id: string;
  slug: string;
  name_i18n: JSONColumnType<Record<string, string>>;
  created_at: Generated<Timestamp>;
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
  currency: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TutorAvailabilityTable {
  id: string;
  tutor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  effective_from: string;
  effective_to: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TutorAvailabilityExceptionsTable {
  id: string;
  tutor_id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: Generated<Timestamp>;
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
  currency: string;
  fee_period: 'monthly' | 'quarterly' | 'one_time';
  status: 'active' | 'archived';
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface EnrollmentsTable {
  id: string;
  batch_id: string;
  student_id: string;
  status: 'active' | 'left';
  joined_at: Generated<Timestamp>;
  left_at: Timestamp | null;
  updated_at: Generated<Timestamp>;
}

export interface InvitesTable {
  id: string;
  tutor_id: string;
  batch_id: string;
  token: string;
  expires_at: Timestamp;
  max_uses: Generated<number>;
  used_count: Generated<number>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ClassSessionsTable {
  id: string;
  batch_id: string;
  tutor_id: string;
  scheduled_start_utc: Timestamp;
  timezone: string;
  duration_min: number;
  meeting_url: string | null;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface AttendanceTable {
  id: string;
  session_id: string;
  student_id: string;
  status: 'present' | 'absent' | 'late';
  joined_at: Timestamp | null;
  marked_by: string | null;
  method: 'join_tap' | 'manual';
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
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
  created_at: Generated<Timestamp>;
}

export interface AssignmentsTable {
  id: string;
  batch_id: string;
  title: string;
  instructions: string | null;
  due_at_utc: Timestamp;
  timezone: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface SubmissionsTable {
  id: string;
  assignment_id: string;
  student_id: string;
  object_keys: JSONColumnType<string[]>;
  submitted_at: Generated<Timestamp>;
  grade: string | null;
  feedback: string | null;
  graded_at: Timestamp | null;
  updated_at: Generated<Timestamp>;
}

export interface AnnouncementsTable {
  id: string;
  batch_id: string;
  tutor_id: string;
  body: string;
  created_at: Generated<Timestamp>;
}

// --- billing & platform ---

export interface FeeLedgerTable {
  id: string;
  tutor_id: string;
  student_id: string;
  batch_id: string;
  period_label: string;
  expected_minor: number;
  currency: string;
  status: 'due' | 'partial' | 'paid' | 'waived';
  recorded_paid_minor: number | null;
  paid_at: Timestamp | null;
  note: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface SubscriptionsTable {
  id: string;
  tutor_id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  trial_ends_at: Timestamp;
  current_period_end: Timestamp | null;
  provider: string | null;
  provider_ref: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
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
  created_at: Generated<Timestamp>;
}

export interface NotificationsTable {
  id: string;
  user_id: string;
  type: string;
  payload: JSONColumnType<Record<string, unknown>>;
  read_at: Timestamp | null;
  created_at: Generated<Timestamp>;
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

  fee_ledger: FeeLedgerTable;
  subscriptions: SubscriptionsTable;
  audit_logs: AuditLogsTable;
  notifications: NotificationsTable;
}
