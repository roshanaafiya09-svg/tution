'use client';

import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Material } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, Button } from '@/components/ui';

interface MaterialWithBatch extends Material {
  batch_title: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentMaterialsPage() {
  const [materials, setMaterials] = useState<MaterialWithBatch[] | null>(null);

  useEffect(() => {
    void api.get<Batch[]>('/batches/enrolled').then(async (batches) => {
      const perBatch = await Promise.all(
        batches.map((batch) =>
          api
            .get<Material[]>(`/materials/batch/${batch.id}`)
            .then((list) => list.map((m) => ({ ...m, batch_title: batch.title })))
            .catch(() => []),
        ),
      );
      setMaterials(
        perBatch.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    });
  }, []);

  async function download(materialId: string) {
    const { url } = await api.get<{ url: string }>(`/materials/${materialId}/download-url`);
    window.open(url, '_blank');
  }

  return (
    <div>
      <PageHeader title="Study Materials" description="Files shared by your tutors, across all your batches." />

      {materials === null ? (
        <PageLoading />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No materials yet"
          description="Your tutors haven't shared any files yet."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {materials.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{m.title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {m.batch_title} · {formatSize(m.size_bytes)}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void download(m.id)}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
