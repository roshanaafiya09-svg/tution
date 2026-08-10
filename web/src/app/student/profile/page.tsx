'use client';

import { useEffect, useState } from 'react';
import { api, apiGetPublic, ApiError } from '@/lib/api';
import type { Curriculum, StudentProfile } from '@/lib/types';
import { Card, PageHeader, PageLoading, Button, Field, Input, Select, InlineError, useToast } from '@/components/ui';

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null | undefined>(undefined);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [schoolName, setSchoolName] = useState('');
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
      });
      toast({ title: 'Profile saved' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profile" description="Manage your student profile." />

      {profile === undefined ? (
        <PageLoading />
      ) : (
        <Card className="max-w-md">
          <div className="flex flex-col gap-4">
            <Field label="Name" required>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            </Field>
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
            <Field label="School">
              <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Your school" />
            </Field>

            {error && <InlineError>{error}</InlineError>}

            <Button disabled={saving} loading={saving} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
