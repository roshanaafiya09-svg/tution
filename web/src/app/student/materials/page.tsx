'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, File as FileIcon, Search, ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Material } from '@/lib/types';
import { Card, PageHeader, EmptyState, CardSkeleton, ErrorState, Button, Input } from '@/components/ui';

interface MaterialWithBatch extends Material {
  batch_title: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  png: 'PNG',
  jpeg: 'JPG',
  jpg: 'JPG',
  gif: 'GIF',
  webp: 'WEBP',
  plain: 'TXT',
  msword: 'DOC',
  'vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'vnd.ms-excel': 'XLS',
  'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'vnd.ms-powerpoint': 'PPT',
  'vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
};

function fileTypeLabel(mime: string): string {
  const subtype = mime.split('/')[1] ?? mime;
  return FILE_LABELS[subtype] ?? subtype.split('.').pop()?.toUpperCase().slice(0, 5) ?? 'FILE';
}

function fileTypeIcon(mime: string): LucideIcon {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime === 'application/pdf' || mime.startsWith('text/')) return FileText;
  return FileIcon;
}

export default function StudentMaterialsPage() {
  const [materials, setMaterials] = useState<MaterialWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setLoadError(false);
    setMaterials(null);
    api
      .get<Batch[]>('/batches/enrolled')
      .then(async (batches) => {
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

  async function open(materialId: string) {
    const { url } = await api.get<{ url: string }>(`/materials/${materialId}/download-url`);
    window.open(url, '_blank');
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials ?? [];
    return (materials ?? []).filter(
      (m) => m.title.toLowerCase().includes(q) || m.batch_title.toLowerCase().includes(q),
    );
  }, [materials, query]);

  const groups = useMemo(() => {
    const byBatch = new Map<string, MaterialWithBatch[]>();
    for (const m of filtered) {
      const list = byBatch.get(m.batch_title) ?? [];
      list.push(m);
      byBatch.set(m.batch_title, list);
    }
    return Array.from(byBatch.entries()).sort(
      ([, a], [, b]) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime(),
    );
  }, [filtered]);

  return (
    <div>
      <PageHeader title="Study Materials" description="Files shared by your tutors, across all your batches." />

      {materials === null ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
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
        <div className="space-y-6">
          <div className="relative max-w-sm">
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

          {groups.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description="Try a different search term." />
          ) : (
            groups.map(([batchTitle, items]) => (
              <section key={batchTitle}>
                <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">{batchTitle}</h2>
                <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                  {items.map((m) => {
                    const Icon = fileTypeIcon(m.mime);
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-3 px-6 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                            <Icon className="h-4.5 w-4.5" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{m.title}</p>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                              {fileTypeLabel(m.mime)} · {formatSize(m.size_bytes)}
                            </p>
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => void open(m.id)}>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Open
                        </Button>
                      </div>
                    );
                  })}
                </Card>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
