'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, formatMinor } from '@/lib/api';
import type {
  Announcement,
  Assignment,
  Batch,
  Enrollment,
  Invite,
  Material,
  Session,
} from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  Field,
  inputClass,
} from '@/components/ui';

type Tab = 'students' | 'sessions' | 'materials' | 'homework' | 'announcements';

const TABS: { id: Tab; label: string }[] = [
  { id: 'students', label: 'Students' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'materials', label: 'Materials' },
  { id: 'homework', label: 'Homework' },
  { id: 'announcements', label: 'Announcements' },
];

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [tab, setTab] = useState<Tab>('students');

  useEffect(() => {
    void api.get<Batch>(`/batches/${id}`).then(setBatch);
  }, [id]);

  if (!batch) return <p className="text-sm text-neutral-400">Loading…</p>;

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

      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'students' && <StudentsTab batchId={id} />}
      {tab === 'sessions' && <SessionsTab batchId={id} />}
      {tab === 'materials' && <MaterialsTab batchId={id} />}
      {tab === 'homework' && <HomeworkTab batchId={id} />}
      {tab === 'announcements' && <AnnouncementsTab batchId={id} />}
    </div>
  );
}

function StudentsTab({ batchId }: { batchId: string }) {
  const [students, setStudents] = useState<Enrollment[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setStudents(await api.get<Enrollment[]>(`/batches/${batchId}/students`));
    setInvites(await api.get<Invite[]>(`/invites/batch/${batchId}`));
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    await api.post(`/invites/batch/${batchId}`, { maxUses: 50 });
    await load();
  }

  const activeInvite = invites.find(
    (i) => i.used_count < i.max_uses && new Date(i.expires_at) > new Date(),
  );
  const inviteUrl = activeInvite ? `${window.location.origin}/join/${activeInvite.token}` : null;

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-medium text-neutral-900">Invite students</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Share this link on WhatsApp. Students who open it land pre-enrolled in this batch.
        </p>
        {inviteUrl ? (
          <div className="mt-4 flex gap-2">
            <input readOnly value={inviteUrl} className={`${inputClass} flex-1 bg-neutral-50`} />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
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
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : students.length === 0 ? (
        <EmptyState
          title="No students yet"
          description="Share the invite link above — students appear here as soon as they join."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {students.map((student) => (
            <div key={student.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {student.display_name ?? student.phone_e164}
                </p>
                <p className="text-xs text-neutral-500">{student.phone_e164}</p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/dashboard/messages/${batchId}/${student.student_id}`}
                  className="text-sm font-medium text-brand-700 hover:underline"
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
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    startLocal: '',
    durationMin: '60',
    meetingUrl: '',
    repeat: 'none',
    count: '8',
  });

  const load = useCallback(async () => {
    setSessions(await api.get<Session[]>(`/sessions/batch/${batchId}`));
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSession() {
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the session.');
    }
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
              <input
                type="datetime-local"
                className={inputClass}
                value={form.startLocal}
                onChange={(e) => setForm({ ...form, startLocal: e.target.value })}
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                className={inputClass}
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
              />
            </Field>
            <Field label="Meeting link" hint="Your own Zoom or Google Meet link.">
              <input
                className={inputClass}
                value={form.meetingUrl}
                onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
                placeholder="https://meet.google.com/abc-defg-hij"
              />
            </Field>
            <Field label="Repeat weekly on">
              <select
                className={inputClass}
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
              </select>
            </Field>
            {form.repeat !== 'none' && (
              <Field label="Number of classes">
                <input
                  type="number"
                  className={inputClass}
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: e.target.value })}
                />
              </Field>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-error">{error}</p>}

          <div className="mt-4">
            <Button onClick={() => void createSession()} disabled={!form.startLocal}>
              Schedule
            </Button>
          </div>
        </Card>
      )}

      {sessions === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No sessions scheduled"
          description="Schedule a class — recurring sessions are created in one go."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {new Date(session.scheduled_start_utc).toLocaleString('en-IN', {
                    timeZone: session.timezone,
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-xs text-neutral-500">{session.duration_min} minutes</p>
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

function MaterialsTab({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [indexedId, setIndexedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMaterials(await api.get<Material[]>(`/materials/batch/${batchId}`));
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
            className="text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
          />
        </Field>
        {uploading && <p className="mt-2 text-sm text-neutral-500">Uploading…</p>}
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </Card>

      {materials === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : materials.length === 0 ? (
        <EmptyState title="No materials yet" description="Upload notes, worksheets, or past papers." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {materials.map((material) => (
            <div key={material.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{material.title}</p>
                <p className="text-xs text-neutral-500">
                  {(material.size_bytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <div className="flex items-center gap-2">
                {material.mime === 'application/pdf' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => void generateQuiz(material.id)}
                      disabled={generatingId === material.id}
                    >
                      {generatingId === material.id ? 'Generating…' : 'Generate quiz'}
                    </Button>
                    {indexedId === material.id ? (
                      <span className="text-sm text-success">Indexed</span>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => void indexForAi(material.id)}
                        disabled={indexingId === material.id}
                      >
                        {indexingId === material.id ? 'Indexing…' : 'Index for AI'}
                      </Button>
                    )}
                  </>
                )}
                <Button variant="secondary" onClick={() => void download(material.id)}>
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
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', instructions: '', dueAtLocal: '' });

  const load = useCallback(async () => {
    setAssignments(await api.get<Assignment[]>(`/assignments/batch/${batchId}`));
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    await api.post('/assignments', {
      batchId,
      title: form.title,
      instructions: form.instructions || undefined,
      dueAtLocal: form.dueAtLocal,
    });
    await load();
    setShowForm(false);
    setForm({ title: '', instructions: '', dueAtLocal: '' });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Set homework'}</Button>

      {showForm && (
        <Card>
          <div className="grid gap-4">
            <Field label="Title">
              <input
                className={inputClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Newton's laws worksheet"
              />
            </Field>
            <Field label="Instructions">
              <textarea
                className={inputClass}
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </Field>
            <Field label="Due">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.dueAtLocal}
                onChange={(e) => setForm({ ...form, dueAtLocal: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button onClick={() => void create()} disabled={!form.title || !form.dueAtLocal}>
              Set homework
            </Button>
          </div>
        </Card>
      )}

      {assignments === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : assignments.length === 0 ? (
        <EmptyState title="No homework set" description="Students are notified as soon as you set it." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{assignment.title}</p>
                <p className="text-xs text-neutral-500">
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
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setAnnouncements(await api.get<Announcement[]>(`/announcements/batch/${batchId}`));
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
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Message the whole batch" hint="Everyone gets a notification.">
          <textarea
            className={inputClass}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Class moved to 5pm tomorrow."
          />
        </Field>
        <div className="mt-3">
          <Button onClick={() => void post()} disabled={!body.trim() || posting}>
            {posting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Card>

      {announcements === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : announcements.length === 0 ? (
        <EmptyState title="No announcements" description="Anything you send here reaches every student." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="px-6 py-3">
              <p className="text-sm text-neutral-800">{announcement.body}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {new Date(announcement.created_at).toLocaleString('en-IN')}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
