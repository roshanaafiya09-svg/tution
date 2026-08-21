import { useMemo } from 'react';
import { FileText, Image as ImageIcon, File as FileIcon, Film, ExternalLink, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { Material } from '@/lib/types';
import { Button, EmptyState } from '@/components/ui';
import { SectionHeader, ResourceCard } from '@/components/student';

export interface MaterialWithBatch extends Material {
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
  if (mime.startsWith('video/')) return Film;
  if (mime === 'application/pdf' || mime.startsWith('text/')) return FileText;
  return FileIcon;
}

function fileTypeTone(mime: string): 'brand' | 'accent' | 'info' | 'success' | 'warning' {
  if (mime === 'application/pdf') return 'brand';
  if (mime.startsWith('image/')) return 'accent';
  if (mime.startsWith('video/')) return 'warning';
  if (mime.includes('word')) return 'info';
  if (mime.includes('sheet') || mime.includes('excel')) return 'success';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'warning';
  return 'brand';
}

/** Category is derived purely from the file's `mime` type — the only real
 *  signal `Material` carries (no tutor-set category field exists). Doesn't
 *  attempt to guess "Notes" vs "Worksheets" vs "Links" since nothing in the
 *  data distinguishes them; these five buckets are ones a mime type can
 *  actually tell us. */
const CATEGORY_ORDER = ['PDFs', 'Documents', 'Images', 'Videos', 'Other'] as const;
type Category = (typeof CATEGORY_ORDER)[number];

function categoryFor(mime: string): Category {
  if (mime === 'application/pdf') return 'PDFs';
  if (mime.startsWith('image/')) return 'Images';
  if (mime.startsWith('video/')) return 'Videos';
  if (mime.includes('word') || mime.includes('sheet') || mime.includes('excel') || mime.includes('presentation') || mime.includes('powerpoint') || mime.startsWith('text/')) {
    return 'Documents';
  }
  return 'Other';
}

async function openMaterial(materialId: string) {
  const { url } = await api.get<{ url: string }>(`/materials/${materialId}/download-url`);
  window.open(url, '_blank');
}

/** Category-grouped materials grid — shared by the global Materials page
 *  (its own "All Batches ▼" dropdown filters which batches feed in) and
 *  each batch workspace's Materials tab (one batch's materials already
 *  pre-filtered by the caller). Batch title is shown on each card so
 *  multi-batch views stay legible without a separate batch-grouping axis. */
export function MaterialsList({ materials, showBatchLabel = true }: { materials: MaterialWithBatch[]; showBatchLabel?: boolean }) {
  const groups = useMemo(() => {
    const byCategory = new Map<Category, MaterialWithBatch[]>();
    for (const m of materials) {
      const category = categoryFor(m.mime);
      const list = byCategory.get(category) ?? [];
      list.push(m);
      byCategory.set(category, list);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => [c, byCategory.get(c)!] as const);
  }, [materials]);

  if (materials.length === 0) {
    return <EmptyState icon={Search} title="No matches" description="Try a different search term." />;
  }

  return (
    <div className="space-y-8">
      {groups.map(([category, items]) => (
        <section key={category}>
          <SectionHeader title={category} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <ResourceCard
                key={m.id}
                icon={fileTypeIcon(m.mime)}
                tone={fileTypeTone(m.mime)}
                title={m.title}
                meta={
                  showBatchLabel
                    ? `${m.batch_title} · ${fileTypeLabel(m.mime)} · ${formatSize(m.size_bytes)}`
                    : `${fileTypeLabel(m.mime)} · ${formatSize(m.size_bytes)}`
                }
                action={
                  <Button variant="secondary" size="sm" className="mt-auto self-start" onClick={() => void openMaterial(m.id)}>
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
  );
}
