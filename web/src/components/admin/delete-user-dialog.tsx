'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  Button,
  Field,
  Input,
  InlineError,
} from '@/components/ui';

export interface DeleteUserTarget {
  id: string;
  /** Shown in the confirmation copy — display name if there is one, else email/phone. */
  label: string;
  /** The exact value the admin must retype — the account's email, or its
   *  phone number when no email is on file. */
  confirmValue: string;
  confirmFieldLabel: 'email' | 'phone number';
}

/**
 * Type-to-confirm delete: the Delete button stays disabled until the
 * typed value exactly matches the target's own email/phone, so a stray
 * click can never remove the wrong account. This is the only path that
 * reaches DELETE /admin/users/:id — see AdminService.deleteUser on the
 * backend for the matching self/superadmin guard.
 */
export function DeleteUserDialog({
  target,
  open,
  onOpenChange,
  onConfirm,
}: {
  target: DeleteUserTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const matches =
    target !== null && typed.trim().toLowerCase() === target.confirmValue.toLowerCase();

  async function handleConfirm() {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      setTyped('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this account.');
    } finally {
      setDeleting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTyped('');
      setError(null);
    }
  }

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={`Delete ${target.label}?`}
        description={`This will permanently remove ${target.label} and all their data — batches, materials, assignments, enrollments, and messages. This cannot be undone.`}
      >
        <Field
          label={`Type their ${target.confirmFieldLabel} to confirm`}
          hint={target.confirmValue}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={target.confirmValue}
            autoFocus
            autoComplete="off"
          />
        </Field>

        {error && <InlineError>{error}</InlineError>}

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleConfirm()}
            disabled={!matches || deleting}
            loading={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
