'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Check, Copy, Link2, Users } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { AcademyManagedBatch, AcademyManagedSession, Enrollment, Invite } from '@/lib/types';
import {
  Button,
  CardSkeleton,
  CardTitle,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  StatusBadge,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro } from '@/components/academy';
import { academyInitials } from '@/lib/academies';

type Tab = 'students' | 'sessions';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'students', label: 'Students', icon: Users },
  { id: 'sessions', label: 'Sessions', icon: Calendar },
];

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
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatch(null);
    api
      .get<AcademyManagedBatch>(`/academy/me/batches/${id}`)
      .then(setBatch)
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

  return (
    <div>
      <AcademyPageIntro
        eyebrow={batch.tutorDisplayName ? `Batch · ${batch.tutorDisplayName}` : 'Batch'}
        title={batch.title}
        description={`Up to ${batch.capacity} students · ${formatMinor(batch.feeMinor, batch.currency)} per ${
          batch.feePeriod === 'monthly' ? 'month' : batch.feePeriod
        }`}
        back={{ href: '/academy/batches', label: 'All batches' }}
      />

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

      {tab === 'students' && <StudentsTab batchId={id} />}
      {tab === 'sessions' && <SessionsTab batchId={id} />}
    </div>
  );
}

function StudentsTab({ batchId }: { batchId: string }) {
  const [students, setStudents] = useState<Enrollment[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [s, inv] = await Promise.all([
        api.get<Enrollment[]>(`/academy/me/batches/${batchId}/students`),
        api.get<Invite[]>(`/academy/me/batches/${batchId}/invites`),
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
          {students.map((student) => (
            <div key={student.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {academyInitials(student.display_name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {student.display_name ?? student.phone_e164}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{student.phone_e164}</p>
              </div>
              <StatusBadge status={student.status} />
            </div>
          ))}
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
