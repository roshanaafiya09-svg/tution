'use client';

import { useCallback, useEffect, useState } from 'react';
import { IdCard, GraduationCap, ShieldQuestion, ShieldCheck, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import type { VerificationDocType, VerificationUpload } from '@/lib/types';
import { CardTitle, EmptyState, StatusBadge, InlineError, CardSkeleton, ErrorState, useToast } from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

const DOC_LABELS: Record<VerificationDocType, string> = {
  id_proof: 'ID proof (Aadhaar, PAN, etc.)',
  qualification: 'Qualification certificate',
};

const DOC_ICONS: Record<VerificationDocType, typeof IdCard> = {
  id_proof: IdCard,
  qualification: GraduationCap,
};

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_MB = 10;
const DOC_TYPES = Object.keys(DOC_LABELS) as VerificationDocType[];

export default function VerificationPage() {
  const toast = useToast();
  const [uploads, setUploads] = useState<VerificationUpload[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState<VerificationDocType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    return api.get<VerificationUpload[]>('/verifications/me').then(setUploads).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(type: VerificationDocType, file: File) {
    if (!ALLOWED_MIMES.includes(file.type)) {
      setError('Please upload a PDF, JPEG, or PNG file.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`That file is too large — the maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    setError(null);
    setUploading(type);
    try {
      const { upload } = await api.post<{
        upload: { uploadUrl: string; headers?: Record<string, string> };
      }>('/verifications/upload-url', {
        type,
        mime: file.type,
        sizeBytes: file.size,
      });

      const res = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.headers,
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');

      await load();
      toast({ title: 'Document uploaded', description: 'Submitted for review.', variant: 'success' });
    } catch {
      setError('Could not upload that file. Try again.');
    } finally {
      setUploading(null);
    }
  }

  function latestFor(type: VerificationDocType): VerificationUpload | undefined {
    return uploads?.find((u) => u.type === type);
  }

  const submittedCount = uploads ? DOC_TYPES.filter((type) => latestFor(type)).length : 0;
  const fullyVerified = uploads ? DOC_TYPES.every((type) => latestFor(type)?.status === 'approved') : false;

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Trust"
        title="Verification"
        description="Upload your ID and qualifications for review — both need to be approved before your profile shows a verified badge. Typically reviewed within 24 hours."
      />

      {error && (
        <div className="mb-4 mt-8">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="mt-8">
      {loadError ? (
        <ErrorState description="Could not load your verification status. Check your connection and try again." onRetry={load} />
      ) : uploads === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Verification progress: {submittedCount} of {DOC_TYPES.length} submitted
          </p>

          {fullyVerified && (
            <AcademicCard className="mb-6 border-success/30 bg-success-bg dark:border-success-dark/30 dark:bg-success/10">
              <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                Verified badge preview
              </p>
              <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                This is what students see on your profile now that both documents are approved.
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-sm font-medium text-success dark:bg-success/15 dark:text-success-dark">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Verified tutor
              </span>
            </AcademicCard>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {DOC_TYPES.map((type) => {
              const latest = latestFor(type);
              const Icon = DOC_ICONS[type];
              return (
                <AcademicCard key={type}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
                      <CardTitle>{DOC_LABELS[type]}</CardTitle>
                    </div>
                    {latest &&
                      (latest.status === 'pending' ? (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning dark:bg-warning/15 dark:text-warning-dark">
                          Under review
                        </span>
                      ) : (
                        <StatusBadge status={latest.status} />
                      ))}
                  </div>
                  {latest ? (
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                      Submitted {new Date(latest.created_at).toLocaleDateString('en-IN')}
                      {latest.status === 'rejected' && ' — upload again below.'}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Not submitted yet.</p>
                  )}
                  {(!latest || latest.status === 'rejected') && (
                    <>
                      <label className="mt-4 block">
                        <span className="sr-only">Upload {DOC_LABELS[type]}</span>
                        <input
                          type="file"
                          accept={ALLOWED_MIMES.join(',')}
                          disabled={uploading === type}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void upload(type, file);
                          }}
                          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500 dark:hover:file:bg-brand-400"
                        />
                      </label>
                      <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                        Accepted: PDF, JPG, or PNG · Max size {MAX_SIZE_MB}MB
                      </p>
                    </>
                  )}
                  {uploading === type && (
                    <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">Uploading…</p>
                  )}
                </AcademicCard>
              );
            })}
          </div>

          {uploads.length === 0 && (
            <div className="mt-4">
              <EmptyState
                icon={ShieldQuestion}
                title="No documents submitted"
                description="Upload both an ID proof and a qualification to get your verified badge."
              />
            </div>
          )}

          <p className="mt-6 flex items-start gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Your documents are used only for verification and are securely handled — they are never shown
            publicly or shared with students.
          </p>
        </>
      )}
      </div>
    </div>
  );
}
