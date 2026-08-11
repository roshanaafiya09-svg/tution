'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Paperclip, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState, StatusBadge, Button, Field, Input, PageLoading } from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

interface Submission {
  id: string;
  student_id: string;
  object_keys: string[];
  submitted_at: string;
  grade: string | null;
  feedback: string | null;
  graded_at: string | null;
  display_name: string | null;
}

export default function AssignmentSubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [grading, setGrading] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSubmissions(await api.get<Submission[]>(`/assignments/${id}/submissions`));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitGrade(submissionId: string) {
    const entry = grading[submissionId];
    if (!entry?.grade) return;

    await api.post(`/assignments/submissions/${submissionId}/grade`, {
      grade: entry.grade,
      feedback: entry.feedback || undefined,
    });
    await load();
  }

  async function viewFiles(submissionId: string) {
    setViewingId(submissionId);
    try {
      const { urls } = await api.get<{ urls: string[] }>(
        `/assignments/submissions/${submissionId}/download-urls`,
      );
      urls.forEach((url) => window.open(url, '_blank'));
    } finally {
      setViewingId(null);
    }
  }

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Homework"
        title="Submissions"
        description="Grade and give feedback — students are notified."
        back={{ href: '/dashboard/batches', label: 'Batches' }}
      />

      <div className="mt-8">
      {submissions === null ? (
        <PageLoading />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No submissions yet"
          description="Submissions appear here as students upload their work."
        />
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <AcademicCard key={submission.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-50">
                    {submission.display_name ?? submission.student_id.slice(0, 8)}
                  </p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Submitted {new Date(submission.submitted_at).toLocaleString('en-IN')} ·{' '}
                    {submission.object_keys.length} file
                    {submission.object_keys.length === 1 ? '' : 's'}
                    {' · '}
                    <button
                      onClick={() => void viewFiles(submission.id)}
                      disabled={viewingId === submission.id}
                      className="flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-300"
                    >
                      {viewingId === submission.id ? 'Opening…' : 'View'}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </button>
                  </p>
                </div>
                {submission.grade ? (
                  <StatusBadge status="graded" />
                ) : (
                  <StatusBadge status="pending" />
                )}
              </div>

              {submission.grade ? (
                <div className="mt-4 rounded-md bg-neutral-50 px-4 py-3 dark:bg-neutral-900">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    Grade: {submission.grade}
                  </p>
                  {submission.feedback && (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {submission.feedback}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                  <Field label="Grade">
                    <Input
                      placeholder="8/10"
                      value={grading[submission.id]?.grade ?? ''}
                      onChange={(e) =>
                        setGrading({
                          ...grading,
                          [submission.id]: {
                            grade: e.target.value,
                            feedback: grading[submission.id]?.feedback ?? '',
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Feedback">
                    <Input
                      placeholder="Good work — revise Q7."
                      value={grading[submission.id]?.feedback ?? ''}
                      onChange={(e) =>
                        setGrading({
                          ...grading,
                          [submission.id]: {
                            grade: grading[submission.id]?.grade ?? '',
                            feedback: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                  <Button
                    onClick={() => void submitGrade(submission.id)}
                    disabled={!grading[submission.id]?.grade}
                  >
                    Save grade
                  </Button>
                </div>
              )}
            </AcademicCard>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
