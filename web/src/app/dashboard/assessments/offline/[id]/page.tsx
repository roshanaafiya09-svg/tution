'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileWarning, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { OfflineAssessmentDetail, ScorecardImportOutcome, ScorecardImportRecord } from '@/lib/types';
import { Button, CardSkeleton, ErrorState, InlineError, StatusBadge, useToast } from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

const QUESTION_PAPER_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const SCORECARD_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function OfflineAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [assessment, setAssessment] = useState<OfflineAssessmentDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPaper, setUploadingPaper] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [uploadingScorecard, setUploadingScorecard] = useState(false);
  const [outcome, setOutcome] = useState<ScorecardImportOutcome | null>(null);
  const [imports, setImports] = useState<ScorecardImportRecord[] | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const a = await api.get<OfflineAssessmentDetail>(`/assessments/offline/${id}`);
      setAssessment(a);
      if (a.status !== 'draft') {
        api
          .get<ScorecardImportRecord[]>(`/assessments/offline/${id}/scorecard-imports`)
          .then(setImports)
          .catch(() => setImports([]));
      }
    } catch {
      setLoadError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadQuestionPaper(file: File) {
    if (!QUESTION_PAPER_MIMES.includes(file.type)) {
      setError('Question paper must be a PDF, DOC, or DOCX file.');
      return;
    }
    setError(null);
    setUploadingPaper(true);
    try {
      const upload = await api.post<{ uploadUrl: string; headers?: Record<string, string> }>(
        `/assessments/offline/${id}/question-paper/upload-url`,
        { mime: file.type, sizeBytes: file.size },
      );
      const res = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      await load();
      toast({ title: 'Question paper uploaded', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the question paper.');
    } finally {
      setUploadingPaper(false);
    }
  }

  async function viewQuestionPaper() {
    try {
      const { url } = await api.get<{ url: string }>(`/assessments/offline/${id}/question-paper/download-url`);
      window.open(url, '_blank');
    } catch {
      toast({ title: 'Could not open the question paper', variant: 'error' });
    }
  }

  async function schedule() {
    setScheduling(true);
    setError(null);
    try {
      await api.post(`/assessments/offline/${id}/schedule`);
      await load();
      toast({ title: 'Assessment scheduled', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not schedule this assessment.');
    } finally {
      setScheduling(false);
    }
  }

  async function downloadTemplate() {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/assessments/offline/${id}/scorecard-template`,
        { credentials: 'include', headers: { 'X-Auth-Client': 'web' } },
      );
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scorecard-${id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Could not download the template', variant: 'error' });
    }
  }

  async function uploadScorecard(file: File) {
    if (file.type !== SCORECARD_MIME) {
      setError('Scorecard must be a .xlsx spreadsheet.');
      return;
    }
    setError(null);
    setOutcome(null);
    setUploadingScorecard(true);
    try {
      const { uploadUrl, headers, objectKey } = await api.post<{
        uploadUrl: string;
        headers?: Record<string, string>;
        objectKey: string;
      }>(`/assessments/offline/${id}/scorecard/upload-url`, { mime: file.type, sizeBytes: file.size });
      const res = await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      const result = await api.post<ScorecardImportOutcome>(`/assessments/offline/${id}/scorecard/process`, {
        objectKey,
      });
      setOutcome(result);
      await load();
      toast({
        title: result.status === 'success' ? 'Scorecard imported — assessment completed' : 'Scorecard validation failed',
        variant: result.status === 'success' ? 'success' : 'error',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the scorecard.');
    } finally {
      setUploadingScorecard(false);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load this assessment. Check your connection and try again." onRetry={() => void load()} />;
  }

  if (!assessment) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const hasQuestionPaper = assessment.question_paper_object_key !== null;
  const canSchedule = assessment.status === 'draft';
  const canUploadScorecard = ['scheduled', 'scorecard_pending', 'overdue'].includes(assessment.status);

  return (
    <div>
      <TeacherPageHeader
        eyebrow={assessment.batches.map((b) => b.title).join(', ') || 'Offline assessment'}
        title={assessment.title}
        description={`${assessment.max_score ?? 0} marks · ${assessment.batches.length} batch${assessment.batches.length === 1 ? '' : 'es'} selected${assessment.assessment_date ? ` · ${new Date(assessment.assessment_date).toLocaleDateString('en-IN')}` : ''}`}
        action={<StatusBadge status={assessment.status} />}
      />

      {error && (
        <div className="mb-4 mt-8">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="mt-8 space-y-5">
        <AcademicCard>
          <h3 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Question Paper <span className="text-error">*</span>
          </h3>
          <p className="mb-3 text-xs text-neutral-400 dark:text-neutral-500">
            Required before this assessment can be scheduled — PDF, DOC, or DOCX.
          </p>
          {hasQuestionPaper ? (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void viewQuestionPaper()}>
                View uploaded question paper
              </Button>
              {canSchedule && (
                <label className="cursor-pointer text-xs text-brand-600 hover:underline dark:text-brand-400">
                  Replace
                  <input
                    type="file"
                    accept={QUESTION_PAPER_MIMES.join(',')}
                    className="hidden"
                    disabled={uploadingPaper}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadQuestionPaper(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          ) : canSchedule ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-error/40 px-6 py-8 text-center transition-colors hover:border-error dark:border-error-dark/40">
              <FileWarning className="h-5 w-5 text-error" aria-hidden />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {uploadingPaper ? 'Uploading…' : 'Upload Question Paper'}
              </span>
              <input
                type="file"
                accept={QUESTION_PAPER_MIMES.join(',')}
                className="hidden"
                disabled={uploadingPaper}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadQuestionPaper(file);
                  e.target.value = '';
                }}
              />
            </label>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Not uploaded.</p>
          )}
        </AcademicCard>

        {canSchedule && (
          <Button onClick={() => void schedule()} disabled={scheduling || !hasQuestionPaper} loading={scheduling}>
            {scheduling ? 'Scheduling…' : 'Schedule Assessment'}
          </Button>
        )}
        {canSchedule && !hasQuestionPaper && (
          <p className="text-xs text-error dark:text-error-dark">
            Question paper is required before scheduling an offline assessment.
          </p>
        )}

        {assessment.status !== 'draft' && (
          <AcademicCard>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Scorecard</h3>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Download the roster template, fill in scores, then upload it back — all-or-nothing import.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void downloadTemplate()}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                Template
              </Button>
            </div>

            {canUploadScorecard && (
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 px-6 py-8 text-center transition-colors hover:border-brand-300 dark:border-neutral-700 dark:hover:border-brand-600">
                <Upload className="h-5 w-5 text-neutral-400" aria-hidden />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {uploadingScorecard ? 'Validating…' : 'Upload scorecard (.xlsx)'}
                </span>
                <input
                  type="file"
                  accept={SCORECARD_MIME}
                  className="hidden"
                  disabled={uploadingScorecard}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadScorecard(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}

            {outcome && outcome.status === 'failed' && (
              <div className="mt-4 rounded-xl border border-error/30 bg-error/5 p-4 dark:border-error-dark/30">
                <p className="mb-2 text-sm font-medium text-error dark:text-error-dark">
                  Validation failed — nothing was saved
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-600 dark:text-neutral-400">
                  {outcome.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {outcome && outcome.status === 'success' && (
              <p className="mt-4 text-sm text-success dark:text-success-dark">
                Imported {outcome.rowCount} result{outcome.rowCount === 1 ? '' : 's'}
                {outcome.completedLate ? ' — completed late' : ''}.
              </p>
            )}

            {imports && imports.length > 0 && (
              <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Upload history</p>
                <ul className="space-y-1">
                  {imports.map((imp) => (
                    <li key={imp.id} className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                      <span>{new Date(imp.created_at).toLocaleString('en-IN')}</span>
                      <StatusBadge status={imp.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </AcademicCard>
        )}
      </div>
    </div>
  );
}
