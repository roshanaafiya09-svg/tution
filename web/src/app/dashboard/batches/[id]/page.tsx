'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  CalendarDays,
  FileText,
  ClipboardList,
  Megaphone,
  Link2,
  Copy,
  Check,
  Sparkles,
  Database,
  Send,
  ClipboardCheck,
  MousePointerClick,
  PenLine,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type {
  Announcement,
  AttendanceBatchHistoryEntry,
  Assignment,
  Batch,
  Enrollment,
  Invite,
  Material,
  Session,
} from '@/lib/types';
import {
  Card,
  CardTitle,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  InlineError,
  CardSkeleton,
  ErrorState,
  useToast,
} from '@/components/ui';

type Tab = 'students' | 'sessions' | 'materials' | 'homework' | 'announcements' | 'attendance';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'students', label: 'Students', icon: Users },
  { id: 'sessions', label: 'Sessions', icon: CalendarDays },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'materials', label: 'Materials', icon: FileText },
  { id: 'homework', label: 'Homework', icon: ClipboardList },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
];

function isTab(value: string | null): value is Tab {
  return !!value && TABS.some((t) => t.id === value);
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'students');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatch(null);
    api.get<Batch>(`/batches/${id}`).then(setBatch).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(`/dashboard/batches/${id}?tab=${next}`, { scroll: false });
  }

  if (loadError) {
    return (
      <ErrorState description="Could not load this batch. Check your connection and try again." onRetry={load} />
    );
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
      <PageHeader
        title={batch.title}
        description={`Up to ${batch.capacity} students · ${formatMinor(batch.fee_minor, batch.currency)} per ${
          batch.fee_period === 'monthly' ? 'month' : batch.fee_period
        }`}
        action={
          <Link href="/dashboard/batches">
            <Button variant="secondary">All batches</Button>
          </Link>
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100'
            }`}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'students' && <StudentsTab batchId={id} />}
      {tab === 'sessions' && <SessionsTab batchId={id} />}
      {tab === 'attendance' && <AttendanceTab batchId={id} />}
      {tab === 'materials' && <MaterialsTab batchId={id} />}
      {tab === 'homework' && <HomeworkTab batchId={id} />}
      {tab === 'announcements' && <AnnouncementsTab batchId={id} />}
    </div>
  );
}

function StudentsTab({ batchId }: { batchId: string }) {
  const toast = useToast();
  const [students, setStudents] = useState<Enrollment[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [s, inv] = await Promise.all([
        api.get<Enrollment[]>(`/batches/${batchId}/students`),
        api.get<Invite[]>(`/invites/batch/${batchId}`),
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
      await api.post(`/invites/batch/${batchId}`, { maxUses: 50 });
      await load();
      toast({ title: 'Invite link created', variant: 'success' });
    } catch {
      toast({ title: 'Could not create an invite link', variant: 'error' });
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load students for this batch." onRetry={() => void load()} />;
  }

  const activeInvite = invites.find(
    (i) => i.used_count < i.max_uses && new Date(i.expires_at) > new Date(),
  );
  const inviteUrl = activeInvite ? `${window.location.origin}/join/${activeInvite.token}` : null;

  return (
    <div className="space-y-6">
      <Card>
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
      </Card>

      {students === null ? (
        <CardSkeleton />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Share the invite link above — students appear here as soon as they join."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {students.map((student) => (
            <div key={student.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {student.display_name ?? student.phone_e164}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{student.phone_e164}</p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/dashboard/messages/${batchId}/${student.student_id}`}
                  className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  Message
                </Link>
                <StatusBadge status={student.status} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function SessionsTab({ batchId }: { batchId: string }) {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    startLocal: '',
    durationMin: '60',
    meetingUrl: '',
    repeat: 'none',
    count: '8',
  });

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setSessions(await api.get<Session[]>(`/sessions/batch/${batchId}`));
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
      const recurrenceRule =
        form.repeat === 'none'
          ? undefined
          : `FREQ=WEEKLY;BYDAY=${form.repeat};COUNT=${form.count}`;

      await api.post('/sessions', {
        batchId,
        startLocal: form.startLocal,
        durationMin: Number(form.durationMin),
        meetingUrl: form.meetingUrl || undefined,
        recurrenceRule,
      });
      await load();
      setShowForm(false);
      toast({ title: 'Session scheduled', variant: 'success' });
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
      <Button onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancel' : 'Schedule session'}
      </Button>

      {showForm && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time" hint="Your local time — daylight saving is handled for you.">
              <Input
                type="datetime-local"
                value={form.startLocal}
                onChange={(e) => setForm({ ...form, startLocal: e.target.value })}
              />
            </Field>
            <Field label="Duration (minutes)">
              <Input
                type="number"
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
              />
            </Field>
            <Field label="Meeting link" hint="Your own Zoom or Google Meet link.">
              <Input
                value={form.meetingUrl}
                onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
                placeholder="https://meet.google.com/abc-defg-hij"
              />
            </Field>
            <Field label="Repeat weekly on">
              <Select
                value={form.repeat}
                onChange={(e) => setForm({ ...form, repeat: e.target.value })}
              >
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
                <Input
                  type="number"
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: e.target.value })}
                />
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
        </Card>
      )}

      {sessions === null ? (
        <CardSkeleton />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No sessions scheduled"
          description="Schedule a class — recurring sessions are created in one go."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between px-6 py-3">
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
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {session.duration_min} minutes
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={session.status} />
                <Link href={`/dashboard/sessions/${session.id}`}>
                  <Button variant="secondary">Attendance</Button>
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function AttendanceTab({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<AttendanceBatchHistoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setRows(null);
    api
      .get<AttendanceBatchHistoryEntry[]>(`/attendance/batch/${batchId}/history`)
      .then(setRows)
      .catch(() => setLoadError(true));
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState description="Could not load attendance history for this batch." onRetry={load} />;
  }

  if (rows === null) return <CardSkeleton />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No attendance marked yet"
        description="Mark attendance from a session to see history here."
      />
    );
  }

  return (
    <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            {row.method === 'join_tap' ? (
              <MousePointerClick className="h-4 w-4 text-neutral-400" aria-hidden />
            ) : (
              <PenLine className="h-4 w-4 text-neutral-400" aria-hidden />
            )}
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {row.display_name ?? row.student_id.slice(0, 8)}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {new Date(row.scheduled_start_utc).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {' · '}
                {row.method === 'join_tap' ? 'Tapped Join' : 'Marked by you'}
              </p>
            </div>
          </div>
          <StatusBadge status={row.status} />
        </div>
      ))}
    </Card>
  );
}

function MaterialsTab({ batchId }: { batchId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [indexedId, setIndexedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setMaterials(await api.get<Material[]>(`/materials/batch/${batchId}`));
    } catch {
      setLoadError(true);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { upload } = await api.post<{ upload: { uploadUrl: string; headers?: Record<string, string> } }>(
        '/materials/upload-url',
        { batchId, title: file.name, mime: file.type, sizeBytes: file.size },
      );

      const res = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.headers,
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');

      await load();
      toast({ title: 'Material uploaded', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the file.');
    } finally {
      setUploading(false);
    }
  }

  async function download(materialId: string) {
    const { url } = await api.get<{ url: string }>(`/materials/${materialId}/download-url`);
    window.open(url, '_blank');
  }

  async function generateQuiz(materialId: string) {
    setError(null);
    setGeneratingId(materialId);
    try {
      const draft = await api.post<{ id: string }>(`/quizzes/material/${materialId}/generate`);
      router.push(`/dashboard/quizzes/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a quiz from this material.');
    } finally {
      setGeneratingId(null);
    }
  }

  async function indexForAi(materialId: string) {
    setError(null);
    setIndexingId(materialId);
    try {
      await api.post(`/doubt-solver/materials/${materialId}/index`);
      setIndexedId(materialId);
      setTimeout(() => setIndexedId(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not index this material.');
    } finally {
      setIndexingId(null);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load materials for this batch." onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Upload a PDF or image" hint="Students can read it offline in the app.">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            className="text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 dark:text-neutral-400 dark:file:bg-brand-500/15 dark:file:text-brand-200"
          />
        </Field>
        {uploading && (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Uploading…</p>
        )}
        {error && (
          <div className="mt-2">
            <InlineError>{error}</InlineError>
          </div>
        )}
      </Card>

      {materials === null ? (
        <CardSkeleton />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No materials yet"
          description="Upload notes, worksheets, or past papers."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {materials.map((material) => (
            <div key={material.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {material.title}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {(material.size_bytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <div className="flex items-center gap-2">
                {material.mime === 'application/pdf' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void generateQuiz(material.id)}
                      disabled={generatingId === material.id}
                      loading={generatingId === material.id}
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      {generatingId === material.id ? 'Generating…' : 'Generate quiz'}
                    </Button>
                    {indexedId === material.id ? (
                      <span className="flex items-center gap-1 text-sm text-success dark:text-success-dark">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Indexed
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void indexForAi(material.id)}
                        disabled={indexingId === material.id}
                        loading={indexingId === material.id}
                      >
                        <Database className="h-3.5 w-3.5" aria-hidden />
                        {indexingId === material.id ? 'Indexing…' : 'Index for AI'}
                      </Button>
                    )}
                  </>
                )}
                <Button variant="secondary" size="sm" onClick={() => void download(material.id)}>
                  Open
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function HomeworkTab({ batchId }: { batchId: string }) {
  const toast = useToast();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', instructions: '', dueAtLocal: '' });

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setAssignments(await api.get<Assignment[]>(`/assignments/batch/${batchId}`));
    } catch {
      setLoadError(true);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setError(null);
    setCreating(true);
    try {
      await api.post('/assignments', {
        batchId,
        title: form.title,
        instructions: form.instructions || undefined,
        dueAtLocal: form.dueAtLocal,
      });
      await load();
      setShowForm(false);
      setForm({ title: '', instructions: '', dueAtLocal: '' });
      toast({ title: 'Homework set', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set this homework.');
    } finally {
      setCreating(false);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load homework for this batch." onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Set homework'}</Button>

      {showForm && (
        <Card>
          <div className="grid gap-4">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Newton's laws worksheet"
              />
            </Field>
            <Field label="Instructions">
              <Textarea
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </Field>
            <Field label="Due">
              <Input
                type="datetime-local"
                value={form.dueAtLocal}
                onChange={(e) => setForm({ ...form, dueAtLocal: e.target.value })}
              />
            </Field>
          </div>
          {error && (
            <div className="mt-3">
              <InlineError>{error}</InlineError>
            </div>
          )}
          <div className="mt-4">
            <Button
              onClick={() => void create()}
              disabled={!form.title || !form.dueAtLocal || creating}
              loading={creating}
            >
              {creating ? 'Setting homework…' : 'Set homework'}
            </Button>
          </div>
        </Card>
      )}

      {assignments === null ? (
        <CardSkeleton />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No homework set"
          description="Students are notified as soon as you set it."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {assignment.title}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Due{' '}
                  {new Date(assignment.due_at_utc).toLocaleString('en-IN', {
                    timeZone: assignment.timezone,
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <Link href={`/dashboard/assignments/${assignment.id}`}>
                <Button variant="secondary">Submissions</Button>
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function AnnouncementsTab({ batchId }: { batchId: string }) {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setAnnouncements(await api.get<Announcement[]>(`/announcements/batch/${batchId}`));
    } catch {
      setLoadError(true);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    setPosting(true);
    try {
      await api.post(`/announcements/batch/${batchId}`, { body });
      setBody('');
      await load();
      toast({ title: 'Announcement sent', variant: 'success' });
    } catch {
      toast({ title: 'Could not send the announcement', variant: 'error' });
    } finally {
      setPosting(false);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load announcements for this batch." onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Message the whole batch" hint="Everyone gets a notification.">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Class moved to 5pm tomorrow."
          />
        </Field>
        <div className="mt-3">
          <Button onClick={() => void post()} disabled={!body.trim() || posting} loading={posting}>
            <Send className="h-3.5 w-3.5" aria-hidden />
            {posting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Card>

      {announcements === null ? (
        <CardSkeleton />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="Anything you send here reaches every student."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="px-6 py-3">
              <p className="text-sm text-neutral-800 dark:text-neutral-200">{announcement.body}</p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                {new Date(announcement.created_at).toLocaleString('en-IN')}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
