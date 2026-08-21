'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Material } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, Field, Input, Select } from '@/components/ui';
import { PageIntro, MaterialsList, type MaterialWithBatch } from '@/components/student';

export default function StudentMaterialsPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [materials, setMaterials] = useState<MaterialWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('');

  const load = useCallback(() => {
    setLoadError(false);
    setBatches(null);
    setMaterials(null);
    api
      .get<Batch[]>('/batches/enrolled')
      .then(async (batches) => {
        setBatches(batches);
        const perBatch = await Promise.all(
          batches.map((batch) =>
            api
              .get<Material[]>(`/materials/batch/${batch.id}`)
              .then((list) => list.map((m) => ({ ...m, batch_title: batch.title })))
              .catch(() => [] as MaterialWithBatch[]),
          ),
        );
        setMaterials(perBatch.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (materials ?? [])
      .filter((m) => !batchFilter || m.batch_id === batchFilter)
      .filter((m) => !q || m.title.toLowerCase().includes(q) || m.batch_title.toLowerCase().includes(q));
  }, [materials, query, batchFilter]);

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Your resources"
        title="Study Materials"
        description="Files shared by your tutors, across all your batches."
        action={
          materials && materials.length > 0 ? (
            <div className="relative w-full max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search materials…"
                className="pl-9"
                aria-label="Search materials"
              />
            </div>
          ) : undefined
        }
      />

      {materials && materials.length > 0 && batches && batches.length > 1 && (
        <div className="w-56">
          <Field label="Batch">
            <Select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {materials === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your materials. Check your connection and try again." onRetry={load} />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No materials yet"
          description="Your tutors haven't shared any study materials yet."
        />
      ) : (
        <MaterialsList materials={filtered} showBatchLabel={!batchFilter} />
      )}
    </div>
  );
}
