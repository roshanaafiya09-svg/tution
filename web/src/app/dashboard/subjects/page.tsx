'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, BookMarked, Check, Globe, Plus, Trash2 } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type {
  AvailabilityRule,
  Curriculum,
  GradeLevel,
  Subject,
  TutorLocation,
  TutorProfile,
  TutorSubject,
} from '@/lib/types';
import {
  Badge,
  Button,
  buttonVariants,
  CardSkeleton,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel } from '@/components/dashboard';

const TEACHING_MODE_LABEL: Record<string, string> = {
  online: 'Online',
  offline: 'In-person',
  both: 'Online & in-person',
};

export default function SubjectsPage() {
  const toast = useToast();
  const [offerings, setOfferings] = useState<TutorSubject[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [location, setLocation] = useState<TutorLocation | null>(null);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notifiedId, setNotifiedId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [offeringToDelete, setOfferingToDelete] = useState<TutorSubject | null>(null);

  const [form, setForm] = useState({
    subjectId: '',
    curriculumId: '',
    gradeMin: '1',
    gradeMax: '10',
    hourlyRateRupees: '500',
  });

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([
      api.get<TutorSubject[]>('/tutor-subjects/me'),
      api.get<Subject[]>('/catalog/subjects'),
      api.get<Curriculum[]>('/catalog/curricula'),
      api.get<TutorProfile | null>('/profiles/tutor/me').catch(() => null),
      api.get<TutorLocation | null>('/marketplace/locations/me').catch(() => null),
      api.get<AvailabilityRule[]>('/availability/me').catch(() => [] as AvailabilityRule[]),
    ])
      .then(([o, subs, curr, prof, loc, rules]) => {
        setOfferings(o);
        setSubjects(subs);
        setCurricula(curr);
        setProfile(prof);
        setLocation(loc);
        setAvailabilityRules(rules);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!form.curriculumId) {
      setGradeLevels([]);
      return;
    }
    void api.get<GradeLevel[]>(`/catalog/curricula/${form.curriculumId}/grade-levels`).then(setGradeLevels);
  }, [form.curriculumId]);

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? subjectId.slice(0, 8);
  }

  function curriculumName(curriculumId: string): string {
    return curricula.find((c) => c.id === curriculumId)?.name ?? curriculumId.slice(0, 8);
  }

  async function createOffering() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/tutor-subjects', {
        subjectId: form.subjectId,
        curriculumId: form.curriculumId,
        gradeMin: Number(form.gradeMin),
        gradeMax: Number(form.gradeMax),
        hourlyRateMinor: Math.round(Number(form.hourlyRateRupees) * 100),
      });
      setOfferings(await api.get<TutorSubject[]>('/tutor-subjects/me'));
      setShowForm(false);
      toast({ title: 'Subject added', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that subject.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffering(id: string) {
    await api.delete(`/tutor-subjects/${id}`);
    setOfferings(await api.get<TutorSubject[]>('/tutor-subjects/me'));
    toast({ title: 'Subject removed', variant: 'success' });
  }

  async function notifyWaitlist(tutorSubjectId: string) {
    setNotifyingId(tutorSubjectId);
    try {
      await api.post(`/marketplace/waitlists/tutor/${tutorSubjectId}/notify`);
      setNotifiedId(tutorSubjectId);
      setTimeout(() => setNotifiedId(null), 2000);
    } catch {
      toast({ title: 'Could not notify the waitlist', variant: 'error' });
    } finally {
      setNotifyingId(null);
    }
  }

  const canSubmit = form.subjectId && form.curriculumId && Number(form.gradeMin) <= Number(form.gradeMax);
  const teachingMode = profile?.teaching_mode ? TEACHING_MODE_LABEL[profile.teaching_mode] : null;
  // A subject only actually surfaces in Find a Teacher once the rest of the
  // marketplace listing is in place — same readiness rule the Marketplace
  // page shows, mirrored here so the Status column is honest.
  const discoverable = !!location && availabilityRules.length > 0 && profile?.verification_status === 'verified';

  const addButton = (
    <Button size="sm" onClick={() => setShowForm(true)}>
      <Plus className="h-3.5 w-3.5" aria-hidden />
      Add subject
    </Button>
  );

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Subjects & Rates"
        description="What you teach, which curriculum, and your hourly rate — this is what students search and filter by in the marketplace."
        action={addButton}
      />

      {loadError ? (
        <ErrorState description="Could not load your subjects. Check your connection and try again." onRetry={load} />
      ) : offerings === null ? (
        <div className="space-y-4">
          <CardSkeleton className="h-16 rounded-2xl" />
          <CardSkeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <>
          <div
            className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              discoverable
                ? 'border-success/25 bg-success-bg/60 dark:border-success-dark/25 dark:bg-success/10'
                : 'border-neutral-200/70 bg-white dark:border-neutral-800/80 dark:bg-surface'
            }`}
          >
            <Globe
              className={`h-4 w-4 shrink-0 ${discoverable ? 'text-success dark:text-success-dark' : 'text-neutral-400'}`}
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-300">
              {discoverable
                ? 'These subjects are live in the marketplace — students can find and book them.'
                : 'Subjects are saved, but your marketplace listing needs a location, availability, and verification before students can find them.'}
            </p>
            <Link
              href="/dashboard/marketplace"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              {discoverable ? 'View listing' : 'Finish listing'}
            </Link>
          </div>

          {offerings.length === 0 ? (
            <EmptyPanel
              icon={BookMarked}
              title="No subjects added yet"
              description="Add what you teach and what you charge. Students search the marketplace by subject, curriculum, grade, and rate — the more complete this list, the easier you are to find."
              steps={['Add subject', 'Set your rate', 'Add availability', 'Get booked']}
              action={addButton}
            />
          ) : (
            <>
              <TableContainer className="hidden rounded-2xl border-neutral-200/70 md:block dark:border-neutral-800/80">
                <Table>
                  <THead>
                    <TR>
                      <TH>Subject</TH>
                      <TH>Curriculum</TH>
                      <TH>Hourly rate</TH>
                      <TH>Teaching mode</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {offerings.map((offering) => (
                      <TR key={offering.id}>
                        <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                          {subjectName(offering.subject_id)}
                          <span className="block text-xs font-normal text-neutral-400 dark:text-neutral-500">
                            Grades {offering.grade_min}–{offering.grade_max}
                          </span>
                        </TD>
                        <TD>{curriculumName(offering.curriculum_id)}</TD>
                        <TD className="tabular-nums">
                          {formatMinor(offering.hourly_rate_minor, offering.currency)}/hr
                        </TD>
                        <TD>
                          {teachingMode ?? (
                            <Link
                              href="/dashboard/teacher-profile"
                              className="text-neutral-400 underline decoration-dotted dark:text-neutral-500"
                            >
                              Not set
                            </Link>
                          )}
                        </TD>
                        <TD>
                          <Badge variant={discoverable ? 'success' : 'warning'}>
                            {discoverable ? 'Listed' : 'Pending setup'}
                          </Badge>
                        </TD>
                        <TD>
                          <div className="flex justify-end gap-2">
                            {notifiedId === offering.id ? (
                              <span className="flex items-center gap-1 text-sm text-success dark:text-success-dark">
                                <Check className="h-3.5 w-3.5" aria-hidden />
                                Notified
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void notifyWaitlist(offering.id)}
                                disabled={notifyingId === offering.id}
                                loading={notifyingId === offering.id}
                              >
                                <Bell className="h-3.5 w-3.5" aria-hidden />
                                Notify waitlist
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setOfferingToDelete(offering)}
                              aria-label={`Remove ${subjectName(offering.subject_id)}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>

              <ul className="grid gap-3 md:hidden">
                {offerings.map((offering) => (
                  <li key={offering.id}>
                    <AcademicCard className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                            {subjectName(offering.subject_id)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {curriculumName(offering.curriculum_id)} · Grades {offering.grade_min}–
                            {offering.grade_max}
                          </p>
                        </div>
                        <Badge variant={discoverable ? 'success' : 'warning'}>
                          {discoverable ? 'Listed' : 'Pending'}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                          {formatMinor(offering.hourly_rate_minor, offering.currency)}
                          <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">/hr</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void notifyWaitlist(offering.id)}
                            disabled={notifyingId === offering.id}
                            loading={notifyingId === offering.id}
                          >
                            <Bell className="h-3.5 w-3.5" aria-hidden />
                            {notifiedId === offering.id ? 'Notified' : 'Waitlist'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setOfferingToDelete(offering)}
                            aria-label={`Remove ${subjectName(offering.subject_id)}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </span>
                      </div>
                    </AcademicCard>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Teaching mode is a profile-level setting shared by every subject — change it on your{' '}
                <Link href="/dashboard/teacher-profile" className="underline">
                  Teacher Profile
                </Link>
                . Rates can&apos;t be edited in place yet: remove the subject and add it again to change one.
              </p>
            </>
          )}
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent
          title="Add a subject"
          description="Each subject is one marketplace listing — a curriculum, a grade range, and the hourly rate you charge for it."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subject" required>
              <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_i18n.en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Curriculum" required>
              <Select
                value={form.curriculumId}
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value })}
              >
                <option value="">Select a curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grade from" hint={gradeLevels.length > 0 ? undefined : 'Pick a curriculum first'}>
              <Select
                value={form.gradeMin}
                onChange={(e) => setForm({ ...form, gradeMin: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.ordinal}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grade to">
              <Select
                value={form.gradeMax}
                onChange={(e) => setForm({ ...form, gradeMax: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.ordinal}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hourly rate (₹)">
              <Input
                type="number"
                value={form.hourlyRateRupees}
                onChange={(e) => setForm({ ...form, hourlyRateRupees: e.target.value })}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-3">
              <InlineError>{error}</InlineError>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void createOffering()} disabled={!canSubmit || saving} loading={saving}>
              {saving ? 'Saving…' : 'Add subject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={offeringToDelete !== null}
        onOpenChange={(open) => !open && setOfferingToDelete(null)}
        onConfirm={() => (offeringToDelete ? deleteOffering(offeringToDelete.id) : Promise.resolve())}
        title="Remove this subject offering?"
        description={
          offeringToDelete
            ? `You'll stop appearing in marketplace search for ${subjectName(offeringToDelete.subject_id)} (${curriculumName(offeringToDelete.curriculum_id)}). Existing bookings aren't affected.`
            : ''
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
