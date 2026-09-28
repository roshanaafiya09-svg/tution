'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { AcademyKycQueueItem } from '@/lib/types';
import {
  PageHeader,
  TableContainer,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
  StatusBadge,
  Button,
  PageLoading,
  ErrorState,
  Dialog,
  DialogContent,
  DialogFooter,
  Textarea,
  Field,
  InlineError,
  useToast,
} from '@/components/ui';

type Decision = 'verified' | 'rejected';

/**
 * Reviewer side of Academy KYC: the academies whose current verification
 * submission the automated PAN/GSTIN check couldn't settle (or that are
 * otherwise awaiting a person). The reviewer approves or rejects; the
 * backend syncs the academy's verification status and tells the owner.
 * There are no documents in this workflow and PAN/GSTIN are never stored,
 * so the row is exactly what the reviewer has: the academy, why it was
 * flagged, and when it was submitted.
 */
export default function AdminAcademyVerificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<AcademyKycQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<AcademyKycQueueItem | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    api
      .get<AcademyKycQueueItem[]>('/admin/academy-verifications/queue')
      .then(setItems)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load the academy verification queue.')));
  }

  useEffect(load, []);

  function openReview(item: AcademyKycQueueItem, next: Decision) {
    setReviewing(item);
    setDecision(next);
    setReason('');
    setFormError(null);
  }

  async function submitReview() {
    if (!reviewing || !decision) return;
    if (decision === 'rejected' && !reason.trim()) {
      setFormError('A reason is required when rejecting — it is shown to the academy owner.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await api.post(`/admin/academy-verifications/${reviewing.id}/review`, {
        status: decision,
        reason: reason.trim() || undefined,
      });
      setItems((prev) => prev?.filter((i) => i.id !== reviewing.id) ?? null);
      toast({
        title: decision === 'verified' ? 'Academy verified' : 'Academy verification rejected',
        variant: 'success',
      });
      setReviewing(null);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <ErrorState
        description={error}
        onRetry={() => {
          setError(null);
          load();
        }}
      />
    );
  }

  if (items === null) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Academy KYC"
        description="Academies whose owner-identity check needs a reviewer's decision."
      />

      {items.length === 0 ? (
        <EmptyState icon={Building2} title="Queue is empty" description="No academy is waiting for review right now." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Academy</TH>
                <TH>Status</TH>
                <TH>Why it needs review</TH>
                <TH>Submitted</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium text-neutral-900 dark:text-neutral-50">{item.academy_name}</TD>
                  <TD>
                    <StatusBadge status={item.status} />
                  </TD>
                  <TD>{item.reason ?? '—'}</TD>
                  <TD>{new Date(item.created_at).toLocaleDateString()}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openReview(item, 'rejected')}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => openReview(item, 'verified')}>
                        Approve
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={reviewing !== null} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent
          title={decision === 'verified' ? 'Approve academy verification' : 'Reject academy verification'}
          description={reviewing ? `${reviewing.academy_name} — ${reviewing.reason ?? 'awaiting review'}` : undefined}
        >
          <Field
            label={decision === 'rejected' ? 'Reason (required)' : 'Note (optional)'}
            hint={
              decision === 'rejected'
                ? 'Shown to the academy owner as the reason.'
                : 'Recorded in the audit trail.'
            }
          >
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
          </Field>
          {formError && (
            <div className="mt-3">
              <InlineError>{formError}</InlineError>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReviewing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={decision === 'rejected' ? 'danger' : 'primary'}
              onClick={() => void submitReview()}
              disabled={busy}
              loading={busy}
            >
              {decision === 'verified' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
