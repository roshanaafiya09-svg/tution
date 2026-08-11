'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, File as FileIcon, Search, ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Material } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, Button, Input } from '@/components/ui';
import { PageIntro, SectionHeader, ResourceCard } from '@/components/student';

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

function fileTypeTone(mime: string): 'brand' | 'accent' | 'info' | 'success' | 'warning' {
  if (mime === 'application/pdf') return 'brand';
  if (mime.startsWith('image/')) return 'accent';
  if (mime.includes('word')) return 'info';
  if (mime.includes('sheet') || mime.includes('excel')) return 'success';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'warning';
  return 'brand';
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
      ) : groups.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try a different search term." />
      ) : (
        <div className="space-y-8">
          {groups.map(([batchTitle, items]) => (
            <section key={batchTitle}>
              <SectionHeader title={batchTitle} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => (
                  <ResourceCard
                    key={m.id}
                    icon={fileTypeIcon(m.mime)}
                    tone={fileTypeTone(m.mime)}
                    title={m.title}
                    meta={`${fileTypeLabel(m.mime)} · ${formatSize(m.size_bytes)}`}
                    action={
                      <Button variant="secondary" size="sm" className="mt-auto self-start" onClick={() => void open(m.id)}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Open
                      </Button>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
