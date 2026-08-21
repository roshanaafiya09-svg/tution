'use client';

import { useEffect, useState } from 'react';
import { api, apiGetPublic, ApiError } from '@/lib/api';
import type { Curriculum, StudentProfile, TeachingMode } from '@/lib/types';
import { PageLoading, Button, Field, Input, Select, Textarea, InlineError, useToast } from '@/components/ui';
import { AcademicCard, PageIntro } from '@/components/student';

export default function StudentProfilePage() {
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
  const toast = useToast();

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

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Your account" title="Profile" description="How your tutors and academies see you." />

      {profile === undefined ? (
        <PageLoading />
      ) : (
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
      )}
    </div>
  );
}
