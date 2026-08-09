'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { StudentAssignmentSummary, StudentSubmission } from '@/lib/types';
import { Card, PageHeader, PageLoading, Button, StatusBadge, InlineError } from '@/components/ui';

interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
}

export default function StudentAssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assignmentId = params.id;

  const [assignment, setAssignment] = useState<StudentAssignmentSummary | null>(null);
  const [submission, setSubmission] = useState<StudentSubmission | null | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const list = await api.get<StudentAssignmentSummary[]>('/assignments/me');
    setAssignment(list.find((a) => a.id === assignmentId) ?? null);
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

  return (
    <div>
      <button
        onClick={() => router.push('/student/assignments')}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to assignments
      </button>

      {loading ? (
        <PageLoading />
      ) : assignment === null ? (
        <Card>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Assignment not found.</p>
        </Card>
      ) : (
        <>
          <PageHeader title={assignment.title} description={assignment.batch_title} />

          <Card className="mb-6">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Due{' '}
              {new Date(assignment.due_at_utc).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
            {assignment.instructions && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                {assignment.instructions}
              </p>
            )}
          </Card>

          {submission ? (
            <Card>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
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
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {submission.object_keys.length} file{submission.object_keys.length === 1 ? '' : 's'} uploaded
              </p>

              {submission.grade !== null ? (
                <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <StatusBadge status="graded" />
                  <p className="mt-2 text-2xl font-display font-semibold text-neutral-900 dark:text-neutral-50">
                    {submission.grade}
                  </p>
                  {submission.feedback && (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{submission.feedback}</p>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Not graded yet.</p>
              )}
            </Card>
          ) : (
            <Card>
              <p className="mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-50">Submit your work</p>
              <input
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 dark:text-neutral-400 dark:file:bg-brand-500/15 dark:file:text-brand-200"
              />
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
            </Card>
          )}
        </>
      )}
    </div>
  );
}
