'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { LeaveAffectedSession, Session, TeacherLeaveRequest } from '@/lib/types';
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
  InlineError,
  Input,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';
import { useApiQuery } from '@/lib/query';

interface Academy {
  id: string;
  name: string;
  slug: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return start === end
    ? new Date(start).toLocaleDateString('en-IN', opts)
    : `${new Date(start).toLocaleDateString('en-IN', opts)} – ${new Date(end).toLocaleDateString('en-IN', opts)}`;
}

export default function TeacherLeavePage() {
  const toast = useToast();
  const [academies, setAcademies] = useState<Academy[] | null>(null);
  const [requests, setRequests] = useState<TeacherLeaveRequest[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    academyId: '',
    startDate: today(),
    endDate: today(),
    leaveType: 'full_day' as 'full_day' | 'specific_classes',
    reason: '',
  });
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [detailFor, setDetailFor] = useState<TeacherLeaveRequest | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<TeacherLeaveRequest | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [a, r] = await Promise.all([
        api.get<Academy[]>('/leave/academies'),
        api.get<TeacherLeaveRequest[]>('/leave/me'),
      ]);
      setAcademies(a);
      setRequests(r);
      setForm((f) => (f.academyId ? f : { ...f, academyId: a[0]?.id ?? '' }));
    } catch (err: unknown) {
      setLoadError(err ?? true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Classes the leave could cover. A failure here must never read as "no classes
  // in that range" — that would let someone file a specific-classes leave against nothing.
  const candidateQuery = useApiQuery(
    () => api.get<Session[]>(`/sessions/me?from=${form.startDate}&to=${addDays(form.endDate || form.startDate, 1)}`),
    [form.startDate, form.endDate],
    { enabled: showForm && form.leaveType === 'specific_classes' && Boolean(form.startDate) },
  );
  const candidateSessions = candidateQuery.data ?? [];

  function openForm() {
    setFormError(null);
    setSelectedSessionIds(new Set());
    setForm((f) => ({ ...f, startDate: today(), endDate: today(), leaveType: 'full_day', reason: '' }));
    setShowForm(true);
  }

  function toggleSession(id: string) {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!form.academyId) {
      setFormError('Select an academy.');
      return;
    }
    if (form.leaveType === 'specific_classes' && selectedSessionIds.size === 0) {
      setFormError('Select at least one class.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/leave', {
        academyId: form.academyId,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        leaveType: form.leaveType,
        sessionIds: form.leaveType === 'specific_classes' ? [...selectedSessionIds] : undefined,
        reason: form.reason || undefined,
      });
      setShowForm(false);
      await load();
      toast({ title: 'Leave request submitted', variant: 'success' });
    } catch {
      setFormError('Could not submit that leave request. Check the dates and try again.');
    } finally {
      setSaving(false);
    }
  }

  function openDetail(request: TeacherLeaveRequest) {
    setDetailFor(request);
  }

  const detailQuery = useApiQuery(
    () => api.get<LeaveAffectedSession[]>(`/leave/${detailFor?.id}/sessions`),
    [detailFor?.id],
    { enabled: detailFor !== null },
  );
  const detailSessions = detailQuery.data ?? [];

  async function withdraw() {
    if (!withdrawTarget) return;
    await api.post(`/leave/${withdrawTarget.id}/withdraw`);
    toast({ title: 'Leave request withdrawn', variant: 'info' });
    await load();
  }

  if (loadError) {
    return (
      <ErrorState error={loadError} what="your leave requests" onRetry={() => void load()} />
    );
  }

  const loading = academies === null || requests === null;
  const canApply = (academies?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Leave"
        description="Request leave from an academy you teach at. Approved leave notifies only the students and parents in your affected classes."
        action={
          canApply ? (
            <Button size="sm" onClick={openForm}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Apply for leave
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton className="h-24 rounded-2xl" />
          <CardSkeleton className="h-24 rounded-2xl" />
        </div>
      ) : !canApply ? (
        <EmptyState
          icon={CalendarOff}
          title="Leave requests need an academy"
          description="You can only request leave from an academy you're an active member of. Join an academy from Find an Academy first."
        />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No leave requests yet"
          description="Apply for leave and your academy admin will review it. Approved leave never affects your independent (non-academy) classes."
          action={
            <Button size="sm" onClick={openForm}>
              Apply for leave
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {requests.map((r) => (
            <AcademicCard key={r.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {formatDateRange(r.start_date, r.end_date)}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {r.leave_type === 'full_day' ? 'Full day' : 'Specific classes'}
              </p>
              {r.reason && (
                <p className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                  &ldquo;{r.reason}&rdquo;
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void openDetail(r)}
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  View affected classes
                </button>
                {r.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => setWithdrawTarget(r)}
                    className="text-xs font-medium text-error hover:underline dark:text-error-dark"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </AcademicCard>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent title="Apply for leave" description="Your academy admin will approve or reject this request.">
          {formError && <InlineError>{formError}</InlineError>}
          <div className="grid gap-3 sm:grid-cols-2">
            {academies && academies.length > 1 && (
              <div className="sm:col-span-2">
                <Field label="Academy">
                  <Select value={form.academyId} onChange={(e) => setForm({ ...form, academyId: e.target.value })}>
                    {academies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <Field label="Start date">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })}
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Type">
                <Select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value as 'full_day' | 'specific_classes' })}>
                  <option value="full_day">Full day(s) — every class in this range</option>
                  <option value="specific_classes">Specific classes only</option>
                </Select>
              </Field>
            </div>
            {form.leaveType === 'specific_classes' && (
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Select the classes this leave covers
                </p>
                {candidateQuery.status === 'error' ? (
                  <ErrorState compact error={candidateQuery.error} what="your classes in that range" onRetry={() => void candidateQuery.reload()} />
                ) : candidateQuery.status === 'loading' ? (
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">Loading classes…</p>
                ) : candidateSessions.length === 0 ? (
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">No scheduled classes in that range yet.</p>
                ) : (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                    {candidateSessions.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={selectedSessionIds.has(s.id)}
                          onChange={() => toggleSession(s.id)}
                          className="h-3.5 w-3.5 rounded border-neutral-300"
                        />
                        {s.batch_title} —{' '}
                        {new Date(s.scheduled_start_utc).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="sm:col-span-2">
              <Field label="Reason (optional)">
                <Textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={2}
                  placeholder="e.g. Family function"
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving} loading={saving}>
              {saving ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailFor !== null} onOpenChange={(open) => !open && setDetailFor(null)}>
        <DialogContent
          title="Affected classes"
          description={detailFor ? formatDateRange(detailFor.start_date, detailFor.end_date) : ''}
        >
          {detailQuery.status === 'error' ? (
            <ErrorState compact error={detailQuery.error} what="the affected classes" onRetry={() => void detailQuery.reload()} />
          ) : detailQuery.status === 'loading' ? (
            <CardSkeleton className="h-16 rounded-xl" />
          ) : detailSessions.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No classes matched this leave request.</p>
          ) : (
            <ul className="space-y-2">
              {detailSessions.map((s) => (
                <li
                  key={s.session_id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{s.batch_title}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(s.scheduled_start_utc).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <StatusBadge status={s.substitute_tutor_id ? 'substitute assigned' : s.status} />
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={withdrawTarget !== null}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
        onConfirm={withdraw}
        title="Withdraw this leave request?"
        description="Your academy admin will no longer see this as pending. You can apply again later."
        confirmLabel="Withdraw"
        danger
      />
    </div>
  );
}
