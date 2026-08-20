'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, GraduationCap, IdCard, Lock, ShieldCheck, Upload, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { VerificationDocType, VerificationUpload } from '@/lib/types';
import { Badge, CardSkeleton, ErrorState, InlineError, useToast } from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';
import { cn } from '@/lib/cn';

const DOC_LABELS: Record<VerificationDocType, string> = {
  id_proof: 'Identity verification',
  qualification: 'Qualification verification',
};

const DOC_DESCRIPTIONS: Record<VerificationDocType, string> = {
  id_proof: 'A government ID — Aadhaar, PAN, passport, or driving licence.',
  qualification: 'A degree certificate, teaching credential, or training certificate.',
};

const DOC_ICONS: Record<VerificationDocType, LucideIcon> = {
  id_proof: IdCard,
  qualification: GraduationCap,
};

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_MB = 10;
const DOC_TYPES = Object.keys(DOC_LABELS) as VerificationDocType[];

/** The four states a teacher actually sees, derived from the single
 *  `status` column plus whether a row exists at all. */
type DocState = 'not_submitted' | 'under_review' | 'approved' | 'rejected';

const STATE_COPY: Record<DocState, { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' }> = {
  not_submitted: { label: 'Not submitted', variant: 'neutral' },
  under_review: { label: 'Under review', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Needs a new upload', variant: 'warning' },
};

const STEPS = ['Not submitted', 'Under review', 'Approved'] as const;

function stateOf(upload: VerificationUpload | undefined): DocState {
  if (!upload) return 'not_submitted';
  if (upload.status === 'approved') return 'approved';
  if (upload.status === 'rejected') return 'rejected';
  return 'under_review';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StateStepper({ state }: { state: DocState }) {
  const activeIndex = state === 'approved' ? 2 : state === 'not_submitted' ? 0 : 1;
  return (
    <ol className="mt-4 flex items-center gap-1.5" aria-label="Verification progress">
      {STEPS.map((step, index) => {
        const reached = index <= activeIndex;
        return (
          <li key={step} className="flex flex-1 items-center gap-1.5">
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block h-1 rounded-full transition-colors duration-base',
                  state === 'rejected' && index === 1
                    ? 'bg-warning'
                    : reached
                      ? 'bg-brand-500 dark:bg-brand-400'
                      : 'bg-neutral-100 dark:bg-neutral-800',
                )}
              />
              <span
                className={cn(
                  'mt-1.5 block truncate text-[11px] font-medium',
                  reached ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-400 dark:text-neutral-600',
                )}
              >
                {step}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function VerificationPage() {
  const toast = useToast();
  const [uploads, setUploads] = useState<VerificationUpload[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState<VerificationDocType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    return api
      .get<VerificationUpload[]>('/verifications/me')
      .then(setUploads)
      .catch(() => setLoadError(true));
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
      const { upload: target } = await api.post<{
        upload: { uploadUrl: string; headers?: Record<string, string> };
      }>('/verifications/upload-url', { type, mime: file.type, sizeBytes: file.size });

      const res = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: target.headers,
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

  /** Newest first from the API, so the first match is the current one. */
  function latestFor(type: VerificationDocType): VerificationUpload | undefined {
    return uploads?.find((u) => u.type === type);
  }

  const states = uploads ? DOC_TYPES.map((type) => stateOf(latestFor(type))) : [];
  const approvedCount = states.filter((s) => s === 'approved').length;
  const fullyVerified = uploads !== null && approvedCount === DOC_TYPES.length;
  const overall: { label: string; variant: 'success' | 'info' | 'warning' | 'neutral' } = fullyVerified
    ? { label: 'Verified', variant: 'success' }
    : states.includes('rejected')
      ? { label: 'Action needed', variant: 'warning' }
      : states.includes('under_review')
        ? { label: 'In review', variant: 'info' }
        : { label: 'Not started', variant: 'neutral' };

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Trust"
        title="Verification"
        description="Two documents, reviewed by our team — both approved gives your profile a verified badge students can see."
        action={uploads ? <Badge variant={overall.variant}>{overall.label}</Badge> : undefined}
      />

      {error && <InlineError>{error}</InlineError>}

      {loadError ? (
        <ErrorState
          description="Could not load your verification status. Check your connection and try again."
          onRetry={load}
        />
      ) : uploads === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton className="h-56 rounded-2xl" />
          <CardSkeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <>
          <AcademicCard
            className={cn(
              'flex flex-wrap items-center gap-4 p-4 sm:p-5',
              fullyVerified && 'border-success/25 bg-success-bg/50 dark:border-success-dark/25 dark:bg-success/10',
            )}
          >
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                fullyVerified
                  ? 'bg-success-bg text-success dark:bg-success/20 dark:text-success-dark'
                  : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500',
              )}
              aria-hidden
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                {fullyVerified ? 'You’re verified' : `${approvedCount} of ${DOC_TYPES.length} documents approved`}
              </p>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {fullyVerified
                  ? 'Students and parents see a “Verified tutor” badge on your public profile.'
                  : 'Both documents need to be approved before the verified badge appears. Reviews are usually done within 24 hours.'}
              </p>
            </div>
            {fullyVerified && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-sm font-medium text-success dark:bg-success/15 dark:text-success-dark">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Verified tutor
              </span>
            )}
          </AcademicCard>

          <div className="grid gap-4 sm:grid-cols-2">
            {DOC_TYPES.map((type) => {
              const latest = latestFor(type);
              const state = stateOf(latest);
              const Icon = DOC_ICONS[type];
              const copy = STATE_COPY[state];
              return (
                <AcademicCard key={type} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                          {DOC_LABELS[type]}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {DOC_DESCRIPTIONS[type]}
                        </p>
                      </div>
                    </div>
                    <Badge variant={copy.variant} className="shrink-0">
                      {copy.label}
                    </Badge>
                  </div>

                  <StateStepper state={state} />

                  <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-800">
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">Uploaded</dt>
                      <dd className="text-neutral-700 dark:text-neutral-200">
                        {latest ? formatDate(latest.created_at) : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">Reviewed</dt>
                      <dd className="text-neutral-700 dark:text-neutral-200">
                        {latest?.reviewed_at ? formatDate(latest.reviewed_at) : 'Not yet'}
                      </dd>
                    </div>
                  </dl>

                  {state === 'under_review' && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-info-bg px-3 py-2 text-xs text-info dark:bg-info/10 dark:text-info-dark">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Submitted and waiting on our review team — typically within 24 hours. Nothing more to do.
                    </p>
                  )}

                  {state === 'rejected' && (
                    <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning dark:bg-warning/10 dark:text-warning-dark">
                      This document wasn&apos;t approved. Upload a clearer, unexpired copy where the name and
                      details are fully readable.
                    </p>
                  )}

                  {(state === 'not_submitted' || state === 'rejected') && (
                    <div className="mt-4">
                      <label className="block">
                        <span className="sr-only">Upload {DOC_LABELS[type]}</span>
                        <input
                          type="file"
                          accept={ALLOWED_MIMES.join(',')}
                          disabled={uploading === type}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void upload(type, file);
                          }}
                          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500 dark:file:text-neutral-950 dark:hover:file:bg-brand-400"
                        />
                      </label>
                      <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                        PDF, JPG, or PNG · Max {MAX_SIZE_MB}MB
                      </p>
                    </div>
                  )}

                  {uploading === type && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      Uploading…
                    </p>
                  )}
                </AcademicCard>
              );
            })}
          </div>

          <p className="flex items-start gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Your documents are used only for verification. They&apos;re never shown publicly or shared with
            students and parents — only you and our review team can open them.
          </p>
        </>
      )}
    </div>
  );
}
