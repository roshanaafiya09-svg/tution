'use client';

import { useEffect, useState } from 'react';
import { BookMarked } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Batch } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, StatusBadge } from '@/components/ui';

export default function StudentBatchesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);

  useEffect(() => {
    void api.get<Batch[]>('/batches/enrolled').then(setBatches);
  }, []);

  return (
    <div>
      <PageHeader title="My Batches" description="Classes you're enrolled in." />

      {batches === null ? (
        <PageLoading />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No batches yet"
          description="You're not enrolled in any batch yet. Ask your tutor for an invite link."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((batch) => (
            <Card key={batch.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-neutral-900 dark:text-neutral-50">{batch.title}</p>
                <StatusBadge status={batch.status} />
              </div>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {batch.tutor_display_name ?? 'Tutor'}
              </p>
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                {formatMinor(batch.fee_minor, batch.currency)} / {batch.fee_period.replace('_', ' ')}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
