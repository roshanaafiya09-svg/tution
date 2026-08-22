'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { api, apiGetPublic, tokenStore, ApiError } from '@/lib/api';
import type { Curriculum, Me, StudentProfile, TeachingMode } from '@/lib/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Field,
  InlineError,
  Input,
  PageLoading,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { AcademicCard, PageIntro } from '@/components/student';

export default function StudentAccountPage() {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<StudentProfile | null | undefined>(undefined);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [subjects, setSubjects] = useState('');
  const [languages, setLanguages] = useState('');
  const [location, setLocation] = useState('');
  const [teachingMode, setTeachingMode] = useState<TeachingMode | ''>('');
  const [learningGoals, setLearningGoals] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void apiGetPublic<Curriculum[]>('/catalog/curricula').then(setCurricula);
    api
      .get<StudentProfile | undefined>('/profiles/student/me')
      .then((p) => {
        setProfile(p ?? null);
        if (p) {
          setDisplayName(p.display_name);
          setGradeLevel(p.grade_level ?? '');
          setCurriculumId(p.curriculum_id ?? '');
          setSchoolName(p.school_name ?? '');
          setSubjects((p.subjects ?? []).join(', '));
          setLanguages((p.languages ?? []).join(', '));
          setLocation(p.location ?? '');
          setTeachingMode(p.teaching_mode ?? '');
          setLearningGoals(p.learning_goals ?? '');
        }
      })
      .catch(() => setProfile(null));
    void api.get<Me>('/auth/me').then(setMe);
  }, []);

  async function save() {
    if (!displayName.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.put('/profiles/student', {
        displayName: displayName.trim(),
        gradeLevel: gradeLevel.trim() || undefined,
        curriculumId: curriculumId || undefined,
        schoolName: schoolName.trim() || undefined,
        subjects: subjects.trim()
          ? subjects.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        languages: languages.trim()
          ? languages.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        location: location.trim() || undefined,
        teachingMode: teachingMode || undefined,
        learningGoals: learningGoals.trim() || undefined,
      });
      toast({ title: 'Profile saved' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  const exportData = useCallback(async () => {
    setExportError(null);
    setExporting(true);
    try {
      const data = await api.get('/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scholar-student-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.delete('/account/me');
      tokenStore.clear();
      router.replace('/login');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }, [router]);

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Your account" title="Account" description="How your tutors and academies see you." />

      {profile === undefined ? (
        <PageLoading />
      ) : (
        <>
          <AcademicCard className="max-w-xl">
            <div className="flex flex-col gap-4">
              <Field label="Name" required>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Grade / class">
                  <Input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g. Grade 9" />
                </Field>
                <Field label="Curriculum">
                  <Select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
                    <option value="">Not set</option>
                    {curricula.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="School">
                <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Your school" />
              </Field>
              <Field label="Subjects" hint="Comma-separated">
                <Input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Mathematics, Physics" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Languages" hint="Comma-separated">
                  <Input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English, Tamil" />
                </Field>
                <Field label="Location">
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Chennai" />
                </Field>
              </div>
              <Field label="Preferred teaching mode">
                <Select value={teachingMode} onChange={(e) => setTeachingMode(e.target.value as TeachingMode | '')}>
                  <option value="">Not set</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="both">Both</option>
                </Select>
              </Field>
              <Field label="Learning goals">
                <Textarea
                  value={learningGoals}
                  onChange={(e) => setLearningGoals(e.target.value)}
                  placeholder="What are you hoping to achieve?"
                  rows={3}
                />
              </Field>

              {error && <InlineError>{error}</InlineError>}

              <Button disabled={saving} loading={saving} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </AcademicCard>

          <AcademicCard className="max-w-xl border-error/20 dark:border-error/25">
            <h2 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">Your data</h2>
            {me && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Signed in as {me.email ?? me.phoneE164}. Export everything the app has on you, or permanently delete
                your account.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => void exportData()} disabled={exporting} loading={exporting}>
                <Download className="h-4 w-4" aria-hidden />
                {exporting ? 'Preparing export…' : 'Export my data'}
              </Button>

              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button variant="danger">
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete my account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-bg dark:bg-error/15">
                      <AlertTriangle className="h-5 w-5 text-error dark:text-error-dark" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        Delete your account?
                      </h3>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        This permanently deletes your account and signs you out everywhere. Your batches, tutors,
                        and academies keep their own records untouched — only your own login is removed.
                      </p>
                    </div>
                  </div>
                  {deleteError && (
                    <div className="mt-3">
                      <InlineError>{deleteError}</InlineError>
                    </div>
                  )}
                  <DialogFooter className="mt-5">
                    <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="danger" onClick={() => void deleteAccount()} disabled={deleting} loading={deleting}>
                      {deleting ? 'Deleting…' : 'Yes, permanently delete my account'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {exportError && (
              <div className="mt-3">
                <InlineError>{exportError}</InlineError>
              </div>
            )}
          </AcademicCard>
        </>
      )}
    </div>
  );
}
