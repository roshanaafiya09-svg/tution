'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, FileText } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { VerificationQueueItem } from '@/lib/types';
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

const TYPE_LABEL: Record<VerificationQueueItem['type'], string> = {
  id_proof: 'ID proof',
  qualification: 'Qualification',
};

export default function AdminVerificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<VerificationQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<VerificationQueueItem | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  function load() {
    api
      .get<VerificationQueueItem[]>('/verifications/queue')
      .then(setItems)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load the verification queue.')));
  }

  useEffect(load, []);

  function openReview(item: VerificationQueueItem, next: 'approved' | 'rejected') {
    setReviewing(item);
    setDecision(next);
    setNote('');
    setFormError(null);
  }

  async function viewDocument(item: VerificationQueueItem) {
    setPreviewingId(item.id);
    try {
      const res = await api.get<{ url: string }>(`/verifications/${item.id}/download-url`);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Could not open the document', description: errorMessage(err), variant: 'error' });
    } finally {
      setPreviewingId(null);
    }
  }

  async function submitReview() {
    if (!reviewing || !decision) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.post(`/verifications/${reviewing.id}/review`, {
        status: decision,
        note: note || undefined,
      });
      setItems((prev) => prev?.filter((i) => i.id !== reviewing.id) ?? null);
      toast({
        title: decision === 'approved' ? 'Document approved' : 'Document rejected',
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
    return <ErrorState description={error} onRetry={() => { setError(null); load(); }} />;
  }

  if (items === null) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Verifications"
        description="Teacher-submitted ID proof and qualification documents awaiting review."
      />

      {items.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="Queue is empty" description="Nothing is waiting for review right now." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Teacher</TH>
                <TH>Contact</TH>
                <TH>Document type</TH>
                <TH>Submitted</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                    {item.tutor_display_name ?? '—'}
                  </TD>
                  <TD>{item.tutor_email ?? item.tutor_phone_e164 ?? '—'}</TD>
                  <TD>
                    <StatusBadge status={TYPE_LABEL[item.type]} />
                  </TD>
                  <TD>{new Date(item.created_at).toLocaleDateString()}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void viewDocument(item)}
                        loading={previewingId === item.id}
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        View
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openReview(item, 'rejected')}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => openReview(item, 'approved')}>
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
          title={decision === 'approved' ? 'Approve document' : 'Reject document'}
          description={
            reviewing
              ? `${TYPE_LABEL[reviewing.type]} submitted by ${reviewing.tutor_display_name ?? 'this teacher'}.`
              : undefined
          }
        >
          <Field label="Note (optional)" hint="Visible in the audit trail; not shown to the teacher automatically.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
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
              {decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
