'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import type { Material } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { MaterialsList, useBatchWorkspace, type MaterialWithBatch } from '@/components/student';

export default function BatchMaterialsTab() {
  const { batch } = useBatchWorkspace();
  const [materials, setMaterials] = useState<MaterialWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setMaterials(null);
    api
      .get<Material[]>(`/materials/batch/${batch.id}`)
      .then((list) =>
        setMaterials(
          list
            .map((m) => ({ ...m, batch_title: batch.title }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        ),
      )
      .catch((err: unknown) => setLoadError(err ?? true));
  }, [batch.id, batch.title]);

  useEffect(() => {
    load();
  }, [load]);

  if (materials === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState error={loadError} what="this batch's materials" onRetry={load} />;
  }
  if (materials.length === 0) {
    return <EmptyState icon={FileText} title="No materials yet" description="Your tutor hasn't shared any study materials for this batch yet." />;
  }

  return <MaterialsList materials={materials} showBatchLabel={false} />;
}
