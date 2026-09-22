'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Flag, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyManagedBatch, EffectiveHolidays, Holiday } from '@/lib/types';
import {
  Button,
  CardSkeleton,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  Input,
  InlineError,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return start === end
    ? new Date(start).toLocaleDateString('en-IN', opts)
    : `${new Date(start).toLocaleDateString('en-IN', opts)} – ${new Date(end).toLocaleDateString('en-IN', opts)}`;
}

function nextYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function AcademyHolidaysPage() {
  const toast = useToast();
  const { hasAcademy } = useAcademyDashboard();
  const [holidays, setHolidays] = useState<EffectiveHolidays | null>(null);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    startDate: today(),
    endDate: today(),
    scope: 'academy' as 'academy' | 'batches',
    description: '',
  });
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setHolidays({ governmentHolidays: [], academyHolidays: [] });
      return;
    }
    setLoadError(null);
    try {
      const [h, b] = await Promise.all([
        api.get<EffectiveHolidays>(`/academy/me/holidays?from=${today()}&to=${nextYear()}`),
        api.get<AcademyManagedBatch[]>('/academy/me/batches'),
      ]);
      setHolidays(h);
      setBatches(b);
    } catch (err: unknown) {
      setLoadError(err ?? true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm() {
    setFormError(null);
    setSelectedBatchIds(new Set());
    setForm({ name: '', startDate: today(), endDate: today(), scope: 'academy', description: '' });
    setShowForm(true);
  }

  function toggleBatch(id: string) {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError('Give this holiday a name.');
      return;
    }
    if (form.scope === 'batches' && selectedBatchIds.size === 0) {
      setFormError('Select at least one batch.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/academy/me/holidays', {
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        scope: form.scope,
        batchIds: form.scope === 'batches' ? [...selectedBatchIds] : undefined,
        description: form.description || undefined,
      });
      setShowForm(false);
      await load();
      toast({ title: 'Holiday added', variant: 'success' });
    } catch {
      setFormError('Could not save that holiday.');
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday() {
    if (!deleteTarget) return;
    await api.delete(`/academy/me/holidays/${deleteTarget.id}`);
    toast({ title: 'Holiday removed', variant: 'info' });
    await load();
  }

  if (loadError) {
    return <ErrorState error={loadError} what="your holiday calendar" onRetry={() => void load()} />;
  }

  const loading = holidays === null;

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Holidays"
        description="Government holidays (if enabled in Settings) plus any holiday your academy declares. Declaring one immediately cancels the affected classes and notifies everyone concerned."
      />

      <div className="mt-8 flex justify-end">
        <Button size="sm" onClick={openForm}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add Holiday
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <CardSkeleton className="h-20 rounded-2xl" />
          <CardSkeleton className="h-20 rounded-2xl" />
        </div>
      ) : (
        <>
          <AcademySectionHeader title="Academy Holidays" className="mt-6" />
          {holidays.academyHolidays.length === 0 ? (
            <EmptyState icon={CalendarRange} title="No academy holidays declared" description="Add one for a local festival, an academy anniversary, or any day classes won't run." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {holidays.academyHolidays.map((h) => (
                <AcademyCard key={h.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{h.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatDateRange(h.start_date, h.end_date)}</p>
                    <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                      {h.scope === 'academy' ? 'Entire academy' : 'Selected batches'}
                    </p>
                    {h.description && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{h.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(h)}
                    aria-label="Remove holiday"
                    className="shrink-0 rounded p-1.5 text-neutral-400 transition-colors hover:bg-error-bg hover:text-error dark:hover:bg-error/15 dark:hover:text-error-dark"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </AcademyCard>
              ))}
            </div>
          )}

          <AcademySectionHeader title="Government Holidays (Tamil Nadu)" className="mt-8" />
          {holidays.governmentHolidays.length === 0 ? (
            <EmptyState
              icon={Flag}
              title="Government holidays are off"
              description="Turn on “Automatically observe Government Holidays” in Settings to have Tamil Nadu government holidays apply automatically."
            />
          ) : (
            <AcademyCard className="p-0">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {holidays.governmentHolidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <span className="text-neutral-800 dark:text-neutral-100">{h.name}</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{formatDateRange(h.start_date, h.end_date)}</span>
                  </li>
                ))}
              </ul>
            </AcademyCard>
          )}
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent title="Add Holiday" description="Classes affected by this date range are cancelled immediately.">
          {formError && <InlineError>{formError}</InlineError>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Holiday name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Founders Day" />
              </Field>
            </div>
            <Field label="Start date">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })}
              />
            </Field>
            <Field label="End date (optional)">
              <Input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Scope">
                <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as 'academy' | 'batches' })}>
                  <option value="academy">Entire academy</option>
                  <option value="batches">Selected batches only</option>
                </Select>
              </Field>
            </div>
            {form.scope === 'batches' && (
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">Select affected batches</p>
                {batches.length === 0 ? (
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">No batches yet.</p>
                ) : (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                    {batches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={selectedBatchIds.has(b.id)}
                          onChange={() => toggleBatch(b.id)}
                          className="h-3.5 w-3.5 rounded border-neutral-300"
                        />
                        {b.title} {b.tutorDisplayName ? `— ${b.tutorDisplayName}` : ''}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="sm:col-span-2">
              <Field label="Description (optional)">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Add Holiday'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={removeHoliday}
        title={`Remove "${deleteTarget?.name}"?`}
        description="This removes the holiday from your calendar. Classes already cancelled because of it stay cancelled."
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
