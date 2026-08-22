'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { api, tokenStore } from '@/lib/api';
import type { Me } from '@/lib/types';
import {
  Button,
  CardSkeleton,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  ErrorState,
  InlineError,
  PageHeader,
} from '@/components/ui';
import { ParentCard } from '@/components/parent';

/** Parent's "Account" page — login identity plus DPDP data-principal
 *  rights (export/deletion), same shape and endpoints as Teacher's
 *  /dashboard/profile and Academy's /academy/account. */
export default function ParentAccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setMe(await api.get<Me>('/auth/me'));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportData() {
    setExportError(null);
    setExporting(true);
    try {
      const data = await api.get('/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scholar-parent-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.delete('/account/me');
      tokenStore.clear();
      router.replace('/login');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Your account" title="Account" description="Your login details, plus data export and account deletion controls." />

      {loadError ? (
        <ErrorState description="Could not load your account. Check your connection and try again." onRetry={() => void load()} />
      ) : !me ? (
        <div className="max-w-2xl">
          <CardSkeleton />
        </div>
      ) : (
        <>
          <ParentCard className="max-w-2xl">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">Login email</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{me.email ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">Login phone</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{me.phoneE164}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
              Contact support to change your login details.
            </p>
          </ParentCard>

          <ParentCard className="mt-6 max-w-2xl border-error/20 dark:border-error/25">
            <h2 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">Your data</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Export everything the app has on you, or permanently delete your account.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => void exportData()} disabled={exporting} loading={exporting}>
                <Download className="h-4 w-4" aria-hidden />
                {exporting ? 'Preparing export…' : 'Export my data'}
              </Button>

              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button variant="danger">
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete my account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-bg dark:bg-error/15">
                      <AlertTriangle className="h-5 w-5 text-error dark:text-error-dark" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        Delete your account?
                      </h3>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        This permanently deletes your account and signs you out everywhere. Your linked children
                        keep their own accounts untouched — only your own login and links are removed.
                      </p>
                    </div>
                  </div>
                  {deleteError && (
                    <div className="mt-3">
                      <InlineError>{deleteError}</InlineError>
                    </div>
                  )}
                  <DialogFooter className="mt-5">
                    <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="danger" onClick={() => void deleteAccount()} disabled={deleting} loading={deleting}>
                      {deleting ? 'Deleting…' : 'Yes, permanently delete my account'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {exportError && (
              <div className="mt-3">
                <InlineError>{exportError}</InlineError>
              </div>
            )}
          </ParentCard>
        </>
      )}
    </div>
  );
}
