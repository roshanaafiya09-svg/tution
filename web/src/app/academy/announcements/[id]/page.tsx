'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, Send, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type {
  AcademyActiveTeacher,
  AcademyAnnouncement,
  AcademyAnnouncementAudience,
  AcademyManagedBatch,
  AcademyManagedEnrollment,
} from '@/lib/types';
import {
  Button,
  CardSkeleton,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  InlineError,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

const AUDIENCE_OPTIONS: { value: AcademyAnnouncementAudience; label: string }[] = [
  { value: 'academy', label: 'Entire academy' },
  { value: 'teachers', label: 'All teachers' },
  { value: 'students', label: 'All students' },
  { value: 'parents', label: 'All parents' },
  { value: 'batch', label: 'A specific batch' },
  { value: 'teacher', label: 'A specific teacher' },
  { value: 'student', label: 'A specific student' },
];

const AUDIENCE_LABELS: Record<AcademyAnnouncementAudience, string> = {
  academy: 'Entire academy',
  teachers: 'All teachers',
  students: 'All students',
  parents: 'All parents',
  batch: 'A specific batch',
  teacher: 'A specific teacher',
  student: 'A specific student',
};

export default function AcademyAnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { hasAcademy } = useAcademyDashboard();
  const [announcement, setAnnouncement] = useState<AcademyAnnouncement | null>(null);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [students, setStudents] = useState<AcademyManagedEnrollment[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [publishTarget, setPublishTarget] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    body: '',
    audienceType: 'academy' as AcademyAnnouncementAudience,
    audienceBatchId: '',
    audienceTeacherId: '',
    audienceStudentId: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (hasAcademy === false) return;
    setLoadError(false);
    setNotFound(false);
    try {
      const [a, b, t, s] = await Promise.all([
        api.get<AcademyAnnouncement>(`/academy/me/announcements/${params.id}`),
        api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
        api
          .get<AcademyManagedEnrollment[]>('/academy/me/students?status=active')
          .catch(() => [] as AcademyManagedEnrollment[]),
      ]);
      setAnnouncement(a);
      setBatches(b);
      setTeachers(t);
      setStudents(s);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setLoadError(true);
    }
  }, [hasAcademy, params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit() {
    if (!announcement) return;
    setEditForm({
      title: announcement.title,
      body: announcement.body,
      audienceType: announcement.audience_type,
      audienceBatchId: announcement.audience_batch_id ?? '',
      audienceTeacherId: announcement.audience_teacher_id ?? '',
      audienceStudentId: announcement.audience_student_id ?? '',
    });
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editForm.title.trim()) return setEditError('Give this announcement a title.');
    if (!editForm.body.trim()) return setEditError('Write a message.');
    if (editForm.audienceType === 'batch' && !editForm.audienceBatchId) return setEditError('Select a batch.');
    if (editForm.audienceType === 'teacher' && !editForm.audienceTeacherId) return setEditError('Select a teacher.');
    if (editForm.audienceType === 'student' && !editForm.audienceStudentId) return setEditError('Select a student.');

    setSaving(true);
    setEditError(null);
    try {
      const updated = await api.patch<AcademyAnnouncement>(`/academy/me/announcements/${params.id}`, {
        title: editForm.title.trim(),
        body: editForm.body.trim(),
        audienceType: editForm.audienceType,
        audienceBatchId: editForm.audienceType === 'batch' ? editForm.audienceBatchId : undefined,
        audienceTeacherId: editForm.audienceType === 'teacher' ? editForm.audienceTeacherId : undefined,
        audienceStudentId: editForm.audienceType === 'student' ? editForm.audienceStudentId : undefined,
      });
      setAnnouncement(updated);
      setEditing(false);
      toast({ title: 'Draft updated', variant: 'success' });
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const updated = await api.post<AcademyAnnouncement>(`/academy/me/announcements/${params.id}/publish`);
    setAnnouncement(updated);
    toast({ title: `Published — reached ${updated.recipient_count ?? 0} people`, variant: 'success' });
  }

  async function archive() {
    const updated = await api.post<AcademyAnnouncement>(`/academy/me/announcements/${params.id}/archive`);
    setAnnouncement(updated);
    toast({ title: 'Announcement archived', variant: 'info' });
  }

  if (notFound) {
    return (
      <ErrorState
        title="Announcement not found"
        description="It may have been deleted, or belongs to a different academy."
        onRetry={() => router.push('/academy/announcements')}
      />
    );
  }

  if (loadError) {
    return <ErrorState description="Could not load this announcement. Check your connection and try again." onRetry={() => void load()} />;
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title={announcement?.title ?? 'Announcement'}
        back={{ href: '/academy/announcements', label: 'Announcements' }}
        action={
          announcement &&
          !editing && (
            <div className="flex gap-2">
              {announcement.status === 'draft' && (
                <>
                  <Button variant="secondary" size="sm" onClick={startEdit}>
                    Edit draft
                  </Button>
                  <Button size="sm" onClick={() => setPublishTarget(true)}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Publish
                  </Button>
                </>
              )}
              {announcement.status === 'published' && (
                <Button variant="secondary" size="sm" onClick={() => setArchiveTarget(true)}>
                  <Archive className="h-3.5 w-3.5" aria-hidden />
                  Archive
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="mt-8">
        {announcement === null ? (
          <CardSkeleton className="h-48 rounded-2xl" />
        ) : editing ? (
          <AcademyCard className="space-y-3">
            {editError && <InlineError>{editError}</InlineError>}
            <Field label="Title">
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} maxLength={200} />
            </Field>
            <Field label="Message">
              <Textarea value={editForm.body} onChange={(e) => setEditForm({ ...editForm, body: e.target.value })} rows={4} maxLength={5000} />
            </Field>
            <Field label="Audience">
              <Select
                value={editForm.audienceType}
                onChange={(e) => setEditForm({ ...editForm, audienceType: e.target.value as AcademyAnnouncementAudience })}
              >
                {AUDIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            {editForm.audienceType === 'batch' && (
              <Field label="Batch">
                <Select value={editForm.audienceBatchId} onChange={(e) => setEditForm({ ...editForm, audienceBatchId: e.target.value })}>
                  <option value="">Select a batch…</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {editForm.audienceType === 'teacher' && (
              <Field label="Teacher">
                <Select value={editForm.audienceTeacherId} onChange={(e) => setEditForm({ ...editForm, audienceTeacherId: e.target.value })}>
                  <option value="">Select a teacher…</option>
                  {teachers.map((t) => (
                    <option key={t.tutorId} value={t.tutorId}>
                      {t.displayName ?? 'Teacher'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {editForm.audienceType === 'student' && (
              <Field label="Student">
                <Select value={editForm.audienceStudentId} onChange={(e) => setEditForm({ ...editForm, audienceStudentId: e.target.value })}>
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.studentId} value={s.studentId}>
                      {s.displayName ?? s.phoneE164} — {s.batchTitle}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()} disabled={saving} loading={saving}>
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
            </div>
          </AcademyCard>
        ) : (
          <AcademyCard className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={announcement.status} />
              <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {AUDIENCE_LABELS[announcement.audience_type]}
              </span>
              {announcement.recipient_count != null && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  · {announcement.recipient_count} recipient{announcement.recipient_count === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <p className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">{announcement.body}</p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <dt className="font-medium">Created</dt>
              <dd>{new Date(announcement.created_at).toLocaleString('en-IN')}</dd>
              {announcement.published_at && (
                <>
                  <dt className="font-medium">Published</dt>
                  <dd>{new Date(announcement.published_at).toLocaleString('en-IN')}</dd>
                </>
              )}
            </dl>
          </AcademyCard>
        )}
      </div>

      <ConfirmDialog
        open={publishTarget}
        onOpenChange={setPublishTarget}
        onConfirm={publish}
        title="Publish this announcement?"
        description="Everyone in the chosen audience gets an in-app notification immediately. This can't be undone."
        confirmLabel="Publish"
        danger={false}
      />

      <ConfirmDialog
        open={archiveTarget}
        onOpenChange={setArchiveTarget}
        onConfirm={archive}
        title="Archive this announcement?"
        description="It stays visible in your history but is marked as no longer active."
        confirmLabel="Archive"
        danger={false}
      />
    </div>
  );
}
