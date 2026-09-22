'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyAssessmentDetail } from '@/lib/types';
import { Button, CardSkeleton, ErrorState, StatusBadge, useToast } from '@/components/ui';
import { AcademyCard, AcademyPageIntro } from '@/components/academy';

export default function AcademyAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [detail, setDetail] = useState<AcademyAssessmentDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .get<AcademyAssessmentDetail>(`/academy/me/assessments/${id}`)
      .then(setDetail)
      .catch((err: unknown) => setLoadError(err ?? true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function viewQuestionPaper() {
    try {
      const { url } = await api.get<{ url: string }>(`/academy/me/assessments/${id}/question-paper`);
      window.open(url, '_blank');
    } catch {
      toast({ title: 'Could not open the question paper', variant: 'error' });
    }
  }

  if (loadError) {
    return <ErrorState error={loadError} what="this assessment" onRetry={load} />;
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AcademyPageIntro
        eyebrow={`${detail.mode} assessment`}
        title={detail.title}
        description={`${detail.maxScore ?? 0} marks · ${detail.studentCount} student result${detail.studentCount === 1 ? '' : 's'}${detail.completedAt ? ` · completed ${new Date(detail.completedAt).toLocaleDateString('en-IN')}${detail.completedLate ? ' (late)' : ''}` : ''}`}
        action={<StatusBadge status={detail.status} />}
        back={{ href: '/academy/assessments', label: 'Weekly Compliance' }}
      />

      {detail.mode === 'offline' && (
        <AcademyCard>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Question paper</h3>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {detail.hasQuestionPaper ? 'Uploaded' : 'Not uploaded yet'}
              </p>
            </div>
            {detail.hasQuestionPaper && (
              <Button variant="secondary" size="sm" onClick={() => void viewQuestionPaper()}>
                <FileText className="h-3.5 w-3.5" aria-hidden />
                View
              </Button>
            )}
          </div>
          {detail.scorecardImports.length > 0 && (
            <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Scorecard uploads</p>
              <ul className="space-y-1">
                {detail.scorecardImports.map((imp) => (
                  <li key={imp.id} className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{new Date(imp.createdAt).toLocaleString('en-IN')}</span>
                    <StatusBadge status={imp.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AcademyCard>
      )}

      {detail.batches.map((batch) => (
        <AcademyCard key={batch.id} className="p-0">
          <div className="border-b border-neutral-100 px-5 py-3 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{batch.title}</h3>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {batch.results.length} result{batch.results.length === 1 ? '' : 's'}
            </p>
          </div>
          {batch.results.length === 0 ? (
            <p className="px-5 py-4 text-sm text-neutral-500 dark:text-neutral-400">No results yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {batch.results.map((result) => (
                <li key={result.studentId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-neutral-800 dark:text-neutral-200">{result.studentName ?? result.studentId.slice(0, 8)}</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">
                    {result.score}/{result.maxScore}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AcademyCard>
      ))}
    </div>
  );
}
