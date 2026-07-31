'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, PageHeader, EmptyState, StatusBadge, Button, Field, inputClass } from '@/components/ui';

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

  return (
    <div>
      <PageHeader title="Submissions" description="Grade and give feedback — students are notified." />

      {submissions === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : submissions.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Submissions appear here as students upload their work."
        />
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <Card key={submission.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-neutral-900">
                    {submission.display_name ?? submission.student_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Submitted {new Date(submission.submitted_at).toLocaleString('en-IN')} ·{' '}
                    {submission.object_keys.length} file
                    {submission.object_keys.length === 1 ? '' : 's'}
                  </p>
                </div>
                {submission.grade ? (
                  <StatusBadge status="graded" />
                ) : (
                  <StatusBadge status="pending" />
                )}
              </div>

              {submission.grade ? (
                <div className="mt-4 rounded-md bg-neutral-50 px-4 py-3">
                  <p className="text-sm font-medium text-neutral-900">Grade: {submission.grade}</p>
                  {submission.feedback && (
                    <p className="mt-1 text-sm text-neutral-600">{submission.feedback}</p>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                  <Field label="Grade">
                    <input
                      className={inputClass}
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
                    <input
                      className={inputClass}
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
