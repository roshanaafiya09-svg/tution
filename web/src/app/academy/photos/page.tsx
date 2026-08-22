'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, Star, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyPhoto } from '@/lib/types';
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorState, useToast } from '@/components/ui';
import { AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_MB = 5;

export default function AcademyPhotosPage() {
  const toast = useToast();
  const { hasAcademy } = useAcademyDashboard();
  const [photos, setPhotos] = useState<AcademyPhoto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AcademyPhoto | null>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setPhotos([]);
      return;
    }
    setLoadError(false);
    try {
      setPhotos(await api.get<AcademyPhoto[]>('/academy/me/photos'));
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadPhoto(file: File) {
    if (!ALLOWED_MIMES.includes(file.type)) {
      toast({ title: 'Please upload a JPEG, PNG, or WEBP image.', variant: 'error' });
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast({ title: `That photo is too large — max ${MAX_IMAGE_MB}MB.`, variant: 'error' });
      return;
    }
    setUploading(true);
    try {
      const { upload } = await api.post<{ upload: { uploadUrl: string; headers?: Record<string, string> } }>(
        '/academy/me/photos',
        { mime: file.type, sizeBytes: file.size },
      );
      const res = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      await load();
      toast({ title: 'Photo added', variant: 'success' });
    } catch {
      toast({ title: 'Could not upload that photo. Try again.', variant: 'error' });
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!deleteTarget) return;
    await api.delete(`/academy/me/photos/${deleteTarget.id}`);
    await load();
    toast({ title: 'Photo removed', variant: 'success' });
  }

  async function move(index: number, direction: -1 | 1) {
    if (!photos) return;
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPhotos(reordered);
    try {
      await api.put('/academy/me/photos/order', { photoIds: reordered.map((p) => p.id) });
    } catch {
      toast({ title: 'Could not reorder photos. Try again.', variant: 'error' });
      await load();
    }
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Photos"
        description="Photos shown on your public academy profile."
        action={
          hasAcademy === false ? undefined : (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 aria-disabled:pointer-events-none aria-disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-400">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {uploading ? 'Uploading…' : 'Upload photo'}
              <input
                type="file"
                accept={ALLOWED_MIMES.join(',')}
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  e.target.value = '';
                }}
                className="sr-only"
              />
            </label>
          )
        }
      />

      <div className="mt-8">
        {loadError ? (
          <ErrorState description="Could not load photos. Check your connection and try again." onRetry={() => void load()} />
        ) : photos === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : photos.length === 0 ? (
          <EmptyState icon={Images} title="No photos yet" description="Upload photos to showcase your academy on Find an Academy." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p, index) => (
              <div key={p.id} className="group relative aspect-video overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-neutral-950/60 px-2 py-1 text-xs font-medium text-white">
                    <Star className="h-3 w-3 fill-accent-400 text-accent-400" aria-hidden />
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(p)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950/60 text-white opacity-0 transition-opacity hover:bg-error group-hover:opacity-100"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-neutral-950/70 to-transparent px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move earlier"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-neutral-700 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(index, 1)}
                    disabled={index === photos.length - 1}
                    aria-label="Move later"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-neutral-700 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={removePhoto}
        title="Delete this photo?"
        description="This photo will be removed from your public academy profile."
        confirmLabel="Delete"
      />
    </div>
  );
}
