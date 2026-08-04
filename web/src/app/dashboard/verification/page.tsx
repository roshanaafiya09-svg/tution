'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { VerificationDocType, VerificationUpload } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge } from '@/components/ui';

const DOC_LABELS: Record<VerificationDocType, string> = {
  id_proof: 'ID proof (Aadhaar, PAN, etc.)',
  qualification: 'Qualification certificate',
};

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function VerificationPage() {
  const [uploads, setUploads] = useState<VerificationUpload[] | null>(null);
  const [uploading, setUploading] = useState<VerificationDocType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setUploads(await api.get<VerificationUpload[]>('/verifications/me'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(type: VerificationDocType, file: File) {
    if (!ALLOWED_MIMES.includes(file.type)) {
      setError('Please upload a PDF, JPEG, or PNG file.');
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
    } catch {
      setError('Could not upload that file. Try again.');
    } finally {
      setUploading(null);
    }
  }

  function latestFor(type: VerificationDocType): VerificationUpload | undefined {
    return uploads?.find((u) => u.type === type);
  }

  return (
    <div>
      <PageHeader
        title="Verification"
        description="Upload your ID and qualifications for review — both need to be approved before your profile shows a verified badge. Typically reviewed within 24 hours."
      />

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      {uploads === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(DOC_LABELS) as VerificationDocType[]).map((type) => {
            const latest = latestFor(type);
            return (
              <Card key={type}>
                <div className="flex items-start justify-between">
                  <p className="font-medium text-neutral-900">{DOC_LABELS[type]}</p>
                  {latest && <StatusBadge status={latest.status} />}
                </div>
                {latest ? (
                  <p className="mt-2 text-sm text-neutral-500">
                    Submitted {new Date(latest.created_at).toLocaleDateString('en-IN')}
                    {latest.status === 'rejected' && ' — upload again below.'}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">Not submitted yet.</p>
                )}
                {(!latest || latest.status === 'rejected') && (
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
                      className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
                    />
                  </label>
                )}
                {uploading === type && <p className="mt-2 text-sm text-neutral-400">Uploading…</p>}
              </Card>
            );
          })}
        </div>
      )}

      {uploads !== null && uploads.length === 0 && (
        <div className="mt-4">
          <EmptyState
            title="No documents submitted"
            description="Upload both an ID proof and a qualification to get your verified badge."
          />
        </div>
      )}
    </div>
  );
}
