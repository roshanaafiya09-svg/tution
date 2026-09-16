'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Calendar, CalendarClock, Check, Copy, Link2, Pencil, Users } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type {
  AcademyBatchAttendance,
  AcademyManagedBatch,
  AcademyManagedSession,
  Curriculum,
  Enrollment,
  GradeLevel,
  Invite,
  Subject,
} from '@/lib/types';
import { cancellationReasonLabel } from '@/lib/session-labels';
import {
  Button,
  CardSkeleton,
  CardTitle,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';
import { academyInitials } from '@/lib/academies';

type Tab = 'students' | 'schedule' | 'sessions';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'students', label: 'Students', icon: Users },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'sessions', label: 'Sessions', icon: Calendar },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isTab(value: string | null): value is Tab {
  return !!value && TABS.some((t) => t.id === value);
}

export default function AcademyBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'students');
  const [batch, setBatch] = useState<AcademyManagedBatch | null>(null);
  const [sessions, setSessions] = useState<AcademyManagedSession[]>([]);
  const [attendance, setAttendance] = useState<AcademyBatchAttendance | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatch(null);
    Promise.all([
      api.get<AcademyManagedBatch>(`/academy/me/batches/${id}`),
      api.get<AcademyManagedSession[]>(`/academy/me/batches/${id}/sessions`).catch(() => [] as AcademyManagedSession[]),
      api.get<AcademyBatchAttendance>(`/academy/me/attendance/batch/${id}`).catch(() => null),
    ])
      .then(([b, s, a]) => {
        setBatch(b);
        setSessions(s);
        setAttendance(a);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(`/academy/batches/${id}?tab=${next}`, { scroll: false });
  }

  if (loadError) {
    return <ErrorState description="Could not load this batch. Check your connection and try again." onRetry={load} />;
  }

  if (!batch) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const classesThisWeek = sessions.filter((s) => {
    const d = new Date(s.scheduled_start_utc);
    return d >= now && d < weekFromNow && s.status === 'scheduled';
  }).length;
  const nextSession = sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now)
    .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime())[0];
  const attendancePercent =
    attendance && attendance.students.length > 0
      ? Math.round(
          attendance.students.reduce((sum, s) => sum + (s.summary.attendanceRate ?? 0), 0) / attendance.students.length,
        )
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AcademyPageIntro
          eyebrow={batch.tutorDisplayName ? `Batch · ${batch.tutorDisplayName}` : 'Batch'}
          title={batch.title}
          description={`Up to ${batch.capacity} students · ${formatMinor(batch.feeMinor, batch.currency)} per ${
            batch.feePeriod === 'monthly' ? 'month' : batch.feePeriod
          }`}
          back={{ href: '/academy/batches', label: 'All batches' }}
        />
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={batch.status} />
          <Button size="sm" variant="secondary" onClick={() => setShowEdit(!showEdit)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {showEdit ? 'Cancel' : 'Edit'}
          </Button>
        </div>
      </div>

      {showEdit && (
        <div className="mt-4">
          <EditBatchForm
            batch={batch}
            onSaved={() => {
              setShowEdit(false);
              load();
            }}
          />
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total students" value={batch.enrolledCount} />
        <StatCard icon={Calendar} label="Classes this week" value={classesThisWeek} />
        <StatCard
          icon={CalendarClock}
          label="Attendance %"
          value={attendancePercent == null ? '—' : `${attendancePercent}%`}
        />
        <StatCard
          icon={CalendarClock}
          label="Next class"
          value={nextSession ? new Date(nextSession.scheduled_start_utc).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
        />
      </div>

      <div className="mt-6 mb-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'students' && <StudentsTab batchId={id} attendance={attendance} />}
      {tab === 'schedule' && <ScheduleTab sessions={sessions} />}
      {tab === 'sessions' && <SessionsTab batchId={id} />}
    </div>
  );
}

function EditBatchForm({ batch, onSaved }: { batch: AcademyManagedBatch; onSaved: () => void }) {
  const [title, setTitle] = useState(batch.title);
  const [capacity, setCapacity] = useState(String(batch.capacity));
  const [feeRupees, setFeeRupees] = useState(String(batch.feeMinor / 100));
  const [subjectId, setSubjectId] = useState(batch.subjectId);
  const [gradeLevelId, setGradeLevelId] = useState(batch.gradeLevelId);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects).catch(() => setSubjects([]));
    void api.get<Curriculum[]>('/catalog/curricula').then(setCurricula).catch(() => setCurricula([]));
  }, []);

  useEffect(() => {
    if (curricula.length === 0) return;
    // Best-effort: load grade levels for the first curriculum so the current
    // gradeLevelId still resolves to a visible option.
    void api
      .get<GradeLevel[]>(`/catalog/curricula/${curricula[0].id}/grade-levels`)
      .then((rows) => setGradeLevels((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]))
      .catch(() => undefined);
  }, [curricula]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/academy/me/batches/${batch.id}`, {
        title,
        subjectId,
        gradeLevelId,
        capacity: Number(capacity),
        feeMinor: Math.round(Number(feeRupees) * 100),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AcademyCard>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Batch name">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Subject">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_i18n.en}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Grade">
          <Select value={gradeLevelId} onChange={(e) => setGradeLevelId(e.target.value)}>
            {gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Capacity">
          <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label="Monthly fee (₹)">
          <Input type="number" value={feeRupees} onChange={(e) => setFeeRupees(e.target.value)} />
        </Field>
      </div>
      {error && (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      )}
      <div className="mt-4">
        <Button onClick={() => void save()} disabled={saving} loading={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </AcademyCard>
  );
}

function ScheduleTab({ sessions }: { sessions: AcademyManagedSession[] }) {
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_start_utc) >= new Date())
    .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime());

  const byDayOfWeek = new Map<number, AcademyManagedSession[]>();
  for (const s of sessions.filter((s) => s.status !== 'cancelled')) {
    const dow = (new Date(s.scheduled_start_utc).getDay() + 6) % 7;
    byDayOfWeek.set(dow, [...(byDayOfWeek.get(dow) ?? []), s]);
  }

  return (
    <div className="space-y-8">
      <div>
        <AcademySectionHeader title="Weekly pattern" />
        <div className="grid grid-cols-7 gap-2">
          {DAY_LABELS.map((label, i) => {
            const daySessions = byDayOfWeek.get(i) ?? [];
            const time = daySessions[0]
              ? new Date(daySessions[0].scheduled_start_utc).toLocaleTimeString('en-IN', {
                  timeZone: daySessions[0].timezone,
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : null;
            return (
              <div
                key={label}
                className={`rounded-lg border p-2 text-center ${
                  daySessions.length > 0
                    ? 'border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/5'
                    : 'border-neutral-100 dark:border-neutral-800'
                }`}
              >
                <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</p>
                {time && <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{time}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <AcademySectionHeader title="Upcoming & recent" />
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing scheduled.</p>
        ) : (
          <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {upcoming.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {new Date(s.scheduled_start_utc).toLocaleString('en-IN', {
                    timeZone: s.timezone,
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
                <StatusBadge
                  status={
                    s.status === 'cancelled'
                      ? (cancellationReasonLabel({ status: s.status, cancellationReason: s.cancellation_reason })?.toLowerCase() ?? 'cancelled')
                      : s.status
                  }
                />
              </div>
            ))}
          </AcademyCard>
        )}
      </div>
    </div>
  );
}

function StudentsTab({ batchId, attendance }: { batchId: string; attendance: AcademyBatchAttendance | null }) {
  const [students, setStudents] = useState<Enrollment[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [s, inv] = await Promise.all([
        api.get<Enrollment[]>(`/academy/me/batches/${batchId}/students`),
        api.get<Invite[]>(`/academy/me/batches/${batchId}/invites`).catch(() => [] as Invite[]),
      ]);
      setStudents(s);
      setInvites(inv);
    } catch {
      setLoadError(true);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    try {
      await api.post(`/academy/me/batches/${batchId}/invites`, { maxUses: 50 });
      await load();
    } catch {
      setLoadError(true);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load students for this batch." onRetry={() => void load()} />;
  }

  const activeInvite = invites.find((i) => i.used_count < i.max_uses && new Date(i.expires_at) > new Date());
  const inviteUrl = activeInvite ? `${window.location.origin}/join/${activeInvite.token}` : null;

  return (
    <div className="space-y-6">
      <AcademyCard>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
          <CardTitle>Invite students</CardTitle>
        </div>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Share this link on WhatsApp. Students who open it land pre-enrolled in this batch.
        </p>
        {inviteUrl ? (
          <div className="mt-4 flex gap-2">
            <Input readOnly value={inviteUrl} className="flex-1 bg-neutral-50 dark:bg-neutral-900" />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <Button onClick={() => void createInvite()}>Create invite link</Button>
          </div>
        )}
      </AcademyCard>

      {students === null ? (
        <CardSkeleton />
      ) : students.length === 0 ? (
        <AcademyCard className="flex flex-col items-center gap-2 py-10 text-center">
          <Users className="h-6 w-6 text-neutral-400" aria-hidden />
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">No students yet</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Share the invite link above — students appear here as soon as they join.
          </p>
        </AcademyCard>
      ) : (
        <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {students.map((student) => {
            const rate = attendance?.students.find((s) => s.studentId === student.student_id)?.summary.attendanceRate;
            return (
              <div key={student.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {academyInitials(student.display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {student.display_name ?? student.phone_e164}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {student.phone_e164}
                    {rate != null && ` · ${rate}% attendance`}
                  </p>
                </div>
                <StatusBadge status={student.status} />
              </div>
            );
          })}
        </AcademyCard>
      )}
    </div>
  );
}

function SessionsTab({ batchId }: { batchId: string }) {
  const [sessions, setSessions] = useState<AcademyManagedSession[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ startLocal: '', durationMin: '60', meetingUrl: '', repeat: 'none', count: '8' });

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setSessions(await api.get<AcademyManagedSession[]>(`/academy/me/batches/${batchId}/sessions`));
    } catch {
      setLoadError(true);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSession() {
    setError(null);
    setCreating(true);
    try {
      const recurrenceRule = form.repeat === 'none' ? undefined : `FREQ=WEEKLY;BYDAY=${form.repeat};COUNT=${form.count}`;
      await api.post(`/academy/me/batches/${batchId}/sessions`, {
        batchId,
        startLocal: form.startLocal,
        durationMin: Number(form.durationMin),
        meetingUrl: form.meetingUrl || undefined,
        recurrenceRule,
      });
      await load();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the session.');
    } finally {
      setCreating(false);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load sessions for this batch." onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Schedule session'}</Button>

      {showForm && (
        <AcademyCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time" hint="Local time — daylight saving is handled for you.">
              <Input type="datetime-local" value={form.startLocal} onChange={(e) => setForm({ ...form, startLocal: e.target.value })} />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
            </Field>
            <Field label="Meeting link">
              <Input
                value={form.meetingUrl}
                onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
                placeholder="https://meet.google.com/abc-defg-hij"
              />
            </Field>
            <Field label="Repeat weekly on">
              <Select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
                <option value="none">Does not repeat</option>
                <option value="MO">Mondays</option>
                <option value="TU">Tuesdays</option>
                <option value="WE">Wednesdays</option>
                <option value="TH">Thursdays</option>
                <option value="FR">Fridays</option>
                <option value="SA">Saturdays</option>
                <option value="SU">Sundays</option>
                <option value="MO,WE,FR">Mon, Wed, Fri</option>
                <option value="TU,TH">Tue, Thu</option>
              </Select>
            </Field>
            {form.repeat !== 'none' && (
              <Field label="Number of classes">
                <Input type="number" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
              </Field>
            )}
          </div>

          {error && (
            <div className="mt-3">
              <InlineError>{error}</InlineError>
            </div>
          )}

          <div className="mt-4">
            <Button onClick={() => void createSession()} disabled={!form.startLocal || creating} loading={creating}>
              {creating ? 'Scheduling…' : 'Schedule'}
            </Button>
          </div>
        </AcademyCard>
      )}

      {sessions === null ? (
        <CardSkeleton />
      ) : sessions.length === 0 ? (
        <AcademyCard className="flex flex-col items-center gap-2 py-10 text-center">
          <Calendar className="h-6 w-6 text-neutral-400" aria-hidden />
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">No sessions scheduled</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Schedule a class — recurring sessions are created in one go.</p>
        </AcademyCard>
      ) : (
        <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {new Date(session.scheduled_start_utc).toLocaleString('en-IN', {
                    timeZone: session.timezone,
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{session.duration_min} minutes</p>
              </div>
              <StatusBadge status={session.status} />
            </div>
          ))}
        </AcademyCard>
      )}
    </div>
  );
}
