'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, FolderOpen, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Material } from '@/lib/types';
import {
  Button,
  buttonVariants,
  CardSkeleton,
  ConfirmDialog,
  ErrorState,
  InlineError,
  Input,
  Select,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, MetricCard } from '@/components/dashboard';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 25;

interface MaterialWithBatch extends Material {
  batch_title: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function MaterialsPage() {
  const router = useRouter();
  const toast = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [materials, setMaterials] = useState<MaterialWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [uploadBatchId, setUploadBatchId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MaterialWithBatch | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const batchRows = await api.get<Batch[]>('/batches/me');
      setBatches(batchRows);
      setUploadBatchId((current) => current || batchRows.find((b) => b.status === 'active')?.id || '');
      const perBatch = await Promise.all(
        batchRows.map((batch) =>
          api
            .get<Material[]>(`/materials/batch/${batch.id}`)
            .then((rows) => rows.map((row) => ({ ...row, batch_title: batch.title })))
            .catch(() => [] as MaterialWithBatch[]),
        ),
      );
      setMaterials(
        perBatch
          .flat()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    if (!uploadBatchId) {
      setError('Choose a batch to upload into first.');
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      setError('Please upload a PDF, JPEG, PNG, or WEBP file.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`That file is too large — the maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { upload: target } = await api.post<{
        upload: { uploadUrl: string; headers?: Record<string, string> };
      }>('/materials/upload-url', {
        batchId: uploadBatchId,
        title: file.name,
        mime: file.type,
        sizeBytes: file.size,
      });
      const res = await fetch(target.uploadUrl, { method: 'PUT', headers: target.headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      await load();
      toast({ title: 'Material uploaded', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  }

  async function download(materialId: string) {
    try {
      const { url } = await api.get<{ url: string }>(`/materials/${materialId}/download-url`);
      window.open(url, '_blank');
    } catch {
      toast({ title: 'Could not open that material', variant: 'error' });
    }
  }

  async function generateQuiz(materialId: string) {
    setError(null);
    setGeneratingId(materialId);
    try {
      const draft = await api.post<{ id: string }>(`/quizzes/material/${materialId}/generate`);
      router.push(`/dashboard/quizzes/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a quiz from this material.');
    } finally {
      setGeneratingId(null);
    }
  }

  async function remove(materialId: string) {
    await api.delete(`/materials/${materialId}`);
    await load();
    toast({ title: 'Material removed', variant: 'success' });
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (materials ?? []).filter((material) => {
      if (batchFilter !== 'all' && material.batch_id !== batchFilter) return false;
      if (!needle) return true;
      return (
        material.title.toLowerCase().includes(needle) || material.batch_title.toLowerCase().includes(needle)
      );
    });
  }, [materials, query, batchFilter]);

  const totalBytes = (materials ?? []).reduce((sum, m) => sum + m.size_bytes, 0);
  const pdfCount = (materials ?? []).filter((m) => m.mime === 'application/pdf').length;

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Materials"
        description="Every note, worksheet, and past paper you've shared, across all your batches."
      />

      {error && <InlineError>{error}</InlineError>}

      {loadError ? (
        <ErrorState description="Could not load your materials. Check your connection and try again." onRetry={() => void load()} />
      ) : materials === null ? (
        <div className="space-y-4">
          <CardSkeleton className="h-24 rounded-2xl" />
          <CardSkeleton className="h-48 rounded-2xl" />
        </div>
      ) : batches.length === 0 ? (
        <EmptyPanel
          icon={FolderOpen}
          title="Materials live inside batches"
          description="Create a batch first — then anything you upload to it is shared with those students and listed here."
          steps={['Create batch', 'Upload material', 'Students read it', 'Generate a quiz from it']}
          action={
            <Link href="/dashboard/batches" className={buttonVariants({ size: 'sm' })}>
              Create your first batch
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard icon={FileText} label="Materials" value={materials.length} hint={`Across ${batches.length} batches`} />
            <MetricCard icon={Sparkles} label="Quiz-ready PDFs" value={pdfCount} hint="Can generate an AI quiz draft" href="/dashboard/quizzes" />
            <MetricCard icon={FolderOpen} label="Total size" value={formatSize(totalBytes)} hint={`Max ${MAX_SIZE_MB}MB per file`} />
          </div>

          <AcademicCard className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Upload into</span>
                  <Select value={uploadBatchId} onChange={(e) => setUploadBatchId(e.target.value)}>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.title}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="min-w-[14rem] flex-[2]">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    PDF or image
                  </span>
                  <input
                    type="file"
                    accept={ALLOWED_MIMES.join(',')}
                    disabled={uploading || !uploadBatchId}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                    }}
                    className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500 dark:file:text-neutral-950 dark:hover:file:bg-brand-400"
                  />
                </label>
              </div>
              {uploading && (
                <p className="flex items-center gap-1.5 pb-2 text-sm text-neutral-500 dark:text-neutral-400">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Uploading…
                </p>
              )}
            </div>
          </AcademicCard>

          {materials.length === 0 ? (
            <EmptyPanel
              icon={FileText}
              title="No materials yet"
              description="Upload notes, worksheets, or past papers — students read them in the app, and PDFs can become AI quiz drafts."
              steps={['Upload a PDF', 'Students read it', 'Generate a quiz', 'Publish to the batch']}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search materials…"
                    aria-label="Search materials"
                    className="w-full pl-9"
                  />
                </div>
                <Select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  aria-label="Filter by batch"
                  className="w-auto"
                >
                  <option value="all">All batches</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.title}
                    </option>
                  ))}
                </Select>
              </div>

              {filtered.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-neutral-300 px-5 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700/70 dark:text-neutral-500">
                  No materials match your search.
                </p>
              ) : (
                <AcademicCard className="p-0">
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filtered.map((material) => (
                      <li
                        key={material.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            {material.title}
                          </p>
                          <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                            {material.batch_title} · {formatSize(material.size_bytes)} ·{' '}
                            {new Date(material.created_at).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {material.mime === 'application/pdf' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void generateQuiz(material.id)}
                              disabled={generatingId === material.id}
                              loading={generatingId === material.id}
                            >
                              <Sparkles className="h-3.5 w-3.5" aria-hidden />
                              {generatingId === material.id ? 'Generating…' : 'Quiz'}
                            </Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => void download(material.id)}>
                            Open
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToDelete(material)}
                            aria-label={`Remove ${material.title}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </AcademicCard>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => (toDelete ? remove(toDelete.id) : Promise.resolve())}
        title="Remove this material?"
        description={
          toDelete
            ? `“${toDelete.title}” will no longer be available to students in ${toDelete.batch_title}.`
            : ''
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
