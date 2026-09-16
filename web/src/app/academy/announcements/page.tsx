'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone, Plus, Search, Send, Users } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
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

function audienceLabel(a: AcademyAnnouncementAudience): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === a)?.label ?? a;
}

const STATUS_OPTIONS = ['all', 'draft', 'published', 'archived'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function emptyForm() {
  return {
    title: '',
    body: '',
    audienceType: 'academy' as AcademyAnnouncementAudience,
    audienceBatchId: '',
    audienceTeacherId: '',
    audienceStudentId: '',
  };
}

export default function AcademyAnnouncementsPage() {
  const toast = useToast();
  const router = useRouter();
  const { hasAcademy } = useAcademyDashboard();
  const [announcements, setAnnouncements] = useState<AcademyAnnouncement[] | null>(null);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [students, setStudents] = useState<AcademyManagedEnrollment[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [audienceFilter, setAudienceFilter] = useState<AcademyAnnouncementAudience | ''>('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setAnnouncements([]);
      return;
    }
    setLoadError(false);
    try {
      const [a, b, t, s] = await Promise.all([
        api.get<AcademyAnnouncement[]>('/academy/me/announcements'),
        api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
        api
          .get<AcademyManagedEnrollment[]>('/academy/me/students?status=active')
          .catch(() => [] as AcademyManagedEnrollment[]),
      ]);
      setAnnouncements(a);
      setBatches(b);
      setTeachers(t);
      setStudents(s);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!announcements) return [];
    const query = q.trim().toLowerCase();
    return announcements.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (audienceFilter && a.audience_type !== audienceFilter) return false;
      if (query && !a.title.toLowerCase().includes(query) && !a.body.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [announcements, q, statusFilter, audienceFilter]);

  function openForm() {
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function validate(): string | null {
    if (!form.title.trim()) return 'Give this announcement a title.';
    if (!form.body.trim()) return 'Write a message.';
    if (form.audienceType === 'batch' && !form.audienceBatchId) return 'Select a batch.';
    if (form.audienceType === 'teacher' && !form.audienceTeacherId) return 'Select a teacher.';
    if (form.audienceType === 'student' && !form.audienceStudentId) return 'Select a student.';
    return null;
  }

  async function submit(publishNow: boolean) {
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    setSaving(publishNow ? 'publish' : 'draft');
    setFormError(null);
    try {
      await api.post('/academy/me/announcements', {
        title: form.title.trim(),
        body: form.body.trim(),
        audienceType: form.audienceType,
        audienceBatchId: form.audienceType === 'batch' ? form.audienceBatchId : undefined,
        audienceTeacherId: form.audienceType === 'teacher' ? form.audienceTeacherId : undefined,
        audienceStudentId: form.audienceType === 'student' ? form.audienceStudentId : undefined,
        publishNow,
      });
      setShowForm(false);
      await load();
      toast({ title: publishNow ? 'Announcement published' : 'Draft saved', variant: 'success' });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save that announcement.');
    } finally {
      setSaving(null);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load announcements. Check your connection and try again." onRetry={() => void load()} />;
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Announcements"
        description="Publish important information to teachers, students, and parents connected to your academy."
        action={
          <Button size="sm" onClick={openForm}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New Announcement
          </Button>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or message" className="pl-9" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
        <Select
          value={audienceFilter}
          onChange={(e) => setAudienceFilter(e.target.value as AcademyAnnouncementAudience | '')}
        >
          <option value="">All audiences</option>
          {AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-6">
        {announcements === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={announcements.length === 0 ? 'No announcements yet' : 'No announcements match your filters'}
            description="Create one to reach your academy's teachers, students, or parents."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((a) => (
              <AcademyCard
                key={a.id}
                interactive
                onClick={() => router.push(`/academy/announcements/${a.id}`)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
                  <StatusBadge status={a.status} />
                </div>
                <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">{a.body}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400 dark:text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" aria-hidden />
                    {audienceLabel(a.audience_type)}
                  </span>
                  <span>
                    {a.status === 'published' && a.published_at
                      ? `Published ${new Date(a.published_at).toLocaleDateString('en-IN')}`
                      : `Created ${new Date(a.created_at).toLocaleDateString('en-IN')}`}
                  </span>
                  {a.recipient_count != null && (
                    <span className="flex items-center gap-1">
                      <Send className="h-3 w-3" aria-hidden />
                      {a.recipient_count} recipient{a.recipient_count === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent title="New Announcement" description="Save as a draft, or publish immediately to notify the chosen audience.">
          {formError && <InlineError>{formError}</InlineError>}
          <div className="space-y-3">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                placeholder="e.g. Diwali holiday schedule"
              />
            </Field>
            <Field label="Message">
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={4}
                maxLength={5000}
              />
            </Field>
            <Field label="Audience">
              <Select
                value={form.audienceType}
                onChange={(e) => setForm({ ...form, audienceType: e.target.value as AcademyAnnouncementAudience })}
              >
                {AUDIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            {form.audienceType === 'batch' && (
              <Field label="Batch">
                <Select value={form.audienceBatchId} onChange={(e) => setForm({ ...form, audienceBatchId: e.target.value })}>
                  <option value="">Select a batch…</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {form.audienceType === 'teacher' && (
              <Field label="Teacher">
                <Select
                  value={form.audienceTeacherId}
                  onChange={(e) => setForm({ ...form, audienceTeacherId: e.target.value })}
                >
                  <option value="">Select a teacher…</option>
                  {teachers.map((t) => (
                    <option key={t.tutorId} value={t.tutorId}>
                      {t.displayName ?? 'Teacher'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {form.audienceType === 'student' && (
              <Field label="Student">
                <Select
                  value={form.audienceStudentId}
                  onChange={(e) => setForm({ ...form, audienceStudentId: e.target.value })}
                >
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.studentId} value={s.studentId}>
                      {s.displayName ?? s.phoneE164} — {s.batchTitle}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => void submit(false)} disabled={saving !== null} loading={saving === 'draft'}>
              {saving === 'draft' ? 'Saving…' : 'Save draft'}
            </Button>
            <Button onClick={() => void submit(true)} disabled={saving !== null} loading={saving === 'publish'}>
              {saving === 'publish' ? 'Publishing…' : 'Publish now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
