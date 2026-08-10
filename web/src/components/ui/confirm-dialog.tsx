'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from './dialog';
import { Button } from './button';
import { InlineError } from './error-state';

/** Generic confirm-before-destructive-action dialog — for lower-stakes
 *  deletes than DeleteUserDialog's type-to-confirm (a single availability
 *  rule or subject offering, not an entire account). Same controlled
 *  open/onOpenChange/onConfirm shape so call sites look the same. */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  danger = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent title={title} description={description}>
        {error && <InlineError>{error}</InlineError>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            disabled={busy}
            loading={busy}
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
