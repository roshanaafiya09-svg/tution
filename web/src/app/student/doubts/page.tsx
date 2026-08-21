'use client';

import { useCallback, useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch } from '@/lib/types';
import { CardSkeleton, ErrorState } from '@/components/ui';
import { PageIntro, DoubtsPanel, NoBatchesEmptyState } from '@/components/student';
import { cn } from '@/lib/cn';

export default function StudentDoubtsPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatches(null);
    api
      .get<Batch[]>('/batches/enrolled')
      .then((list) => {
        setBatches(list);
        if (list.length > 0) setBatchId((current) => current ?? list[0].id);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Ask away" title="Doubts / Help" description="Ask a question about anything from your classes." />

      {batches === null ? (
        <div className="space-y-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your batches. Check your connection and try again." onRetry={load} />
      ) : batches.length === 0 ? (
        <NoBatchesEmptyState icon={HelpCircle} description="Ask your tutor for an invite link, or find a teacher to start asking questions." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setBatchId(b.id)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  batchId === b.id
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-400 dark:bg-brand-500'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800',
                )}
              >
                {b.title}
              </button>
            ))}
          </div>

          {batchId && <DoubtsPanel batchId={batchId} />}
        </div>
      )}
    </div>
  );
}
