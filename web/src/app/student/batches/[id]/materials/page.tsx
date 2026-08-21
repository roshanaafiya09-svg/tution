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
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
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
      .catch(() => setLoadError(true));
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
    return <ErrorState description="Could not load this batch's materials. Check your connection and try again." onRetry={load} />;
  }
  if (materials.length === 0) {
    return <EmptyState icon={FileText} title="No materials yet" description="Your tutor hasn't shared any study materials for this batch yet." />;
  }

  return <MaterialsList materials={materials} showBatchLabel={false} />;
}
