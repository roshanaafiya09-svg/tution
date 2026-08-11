'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload, CheckCircle2, FileQuestion, User, FileText, Sparkles } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, StudentAssignmentSummary, StudentSubmission, Subject } from '@/lib/types';
import { PageLoading, Button, StatusBadge, InlineError, EmptyState } from '@/components/ui';
import { PageIntro, AcademicCard } from '@/components/student';

interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
}

type AssignmentStatus = 'overdue' | 'due_soon' | 'not_started' | 'submitted' | 'graded';

function statusFor(a: StudentAssignmentSummary): AssignmentStatus {
  if (a.grade !== null) return 'graded';
  if (a.submission_id) return 'submitted';
  const dueIn = new Date(a.due_at_utc).getTime() - Date.now();
  if (dueIn < 0) return 'overdue';
  if (dueIn <= 24 * 60 * 60 * 1000) return 'due_soon';
  return 'not_started';
}

export default function StudentAssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assignmentId = params.id;

  const [assignment, setAssignment] = useState<StudentAssignmentSummary | null>(null);
  const [submission, setSubmission] = useState<StudentSubmission | null | undefined>(undefined);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [list, batches, subjects] = await Promise.all([
      api.get<StudentAssignmentSummary[]>('/assignments/me'),
      api.get<Batch[]>('/batches/enrolled'),
      apiGetPublic<Subject[]>('/catalog/subjects'),
    ]);
    const found = list.find((a) => a.id === assignmentId) ?? null;
    setAssignment(found);
    const foundBatch = found ? batches.find((b) => b.id === found.batch_id) ?? null : null;
    setBatch(foundBatch);
    setSubjectName(foundBatch ? subjects.find((s) => s.id === foundBatch.subject_id)?.name_i18n.en ?? null : null);
    const own = await api
      .get<StudentSubmission | undefined>(`/assignments/${assignmentId}/my-submission`)
      .catch(() => undefined);
    setSubmission(own ?? null);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  async function submitFiles() {
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const objectKeys: string[] = [];
      for (const file of files) {
        const presigned = await api.post<PresignedUpload>(`/assignments/${assignmentId}/upload-url`, {
          mime: file.type,
        });
        const res = await fetch(presigned.uploadUrl, {
          method: 'PUT',
          headers: presigned.headers,
          body: file,
        });
        if (!res.ok) throw new Error('Upload failed');
        objectKeys.push(presigned.objectKey);
      }
      await api.post(`/assignments/${assignmentId}/submit`, { objectKeys });
      setFiles([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your work.');
    } finally {
      setUploading(false);
    }
  }

  const loading = assignment === null || submission === undefined;
  const backLink = { href: '/student/assignments', label: 'Back to assignments' };

  return (
    <div>
      {loading ? (
        <>
          <button
            onClick={() => router.push('/student/assignments')}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to assignments
          </button>
          <PageLoading />
        </>
      ) : assignment === null ? (
        <>
          <button
            onClick={() => router.push('/student/assignments')}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to assignments
          </button>
          <EmptyState
            icon={FileQuestion}
            title="Assignment not found"
            description="It may have been removed, or the link is incorrect."
          />
        </>
      ) : (
        <div className="space-y-6">
          <PageIntro
            back={backLink}
            eyebrow={subjectName ? `${subjectName} · ${assignment.batch_title}` : assignment.batch_title}
            title={assignment.title}
          />

          <AcademicCard className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 p-6">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Due{' '}
                <span className="font-medium text-neutral-700 dark:text-neutral-200">
                  {new Date(assignment.due_at_utc).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                {batch?.tutor_display_name && (
                  <span className="ml-3 inline-flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                    <User className="h-3.5 w-3.5" aria-hidden />
                    {batch.tutor_display_name}
                  </span>
                )}
              </p>
              <StatusBadge status={statusFor(assignment)} />
            </div>

            {assignment.instructions && (
              <div className="border-t border-neutral-100 px-6 py-5 dark:border-neutral-800">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
                  Instructions
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {assignment.instructions}
                </p>
              </div>
            )}

            <div className="border-t border-neutral-100 px-6 py-6 dark:border-neutral-800">
              {submission ? (
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success dark:text-success-dark" aria-hidden />
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      Submitted{' '}
                      {new Date(submission.submitted_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {submission.object_keys.length} file{submission.object_keys.length === 1 ? '' : 's'} uploaded
                  </p>

                  {submission.grade !== null ? (
                    <div className="mt-5 flex flex-wrap items-start gap-4 rounded-2xl border border-success/20 bg-success-bg px-5 py-4 dark:border-success-dark/20 dark:bg-success/10">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-success shadow-sm dark:bg-neutral-900 dark:text-success-dark">
                        <Sparkles className="h-5 w-5" aria-hidden />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-success dark:text-success-dark">
                          Grade
                        </p>
                        <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                          {submission.grade}
                        </p>
                        {submission.feedback && (
                          <p className="mt-1.5 text-sm text-neutral-700 dark:text-neutral-300">{submission.feedback}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
                      Not graded yet — your tutor will review it soon.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-50">Submit your work</p>
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 px-6 py-8 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-neutral-700 dark:bg-neutral-900/40 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5">
                    <Upload className="h-5 w-5 text-neutral-400 dark:text-neutral-500" aria-hidden />
                    <span className="text-sm text-neutral-600 dark:text-neutral-300">
                      {files.length > 0
                        ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
                        : 'Click to choose PDF or image files'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/*"
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                      className="sr-only"
                    />
                  </label>
                  {error && (
                    <div className="mt-3">
                      <InlineError>{error}</InlineError>
                    </div>
                  )}
                  <Button
                    className="mt-4"
                    disabled={files.length === 0 || uploading}
                    loading={uploading}
                    onClick={() => void submitFiles()}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    {uploading ? 'Submitting…' : 'Submit'}
                  </Button>
                </div>
              )}
            </div>
          </AcademicCard>
        </div>
      )}
    </div>
  );
}
