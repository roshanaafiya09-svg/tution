export interface Me {
  id: string;
  roles: string[];
  phoneE164: string;
  locale: string;
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
