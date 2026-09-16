'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, UserCheck, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyActiveTeacher, AcademyLeaveRequest, LeaveAffectedSession } from '@/lib/types';
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
  Select,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { cn } from '@/lib/cn';
import { useAcademyDashboard } from '@/components/academy-shell';

type Tab = 'pending' | 'all';

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return start === end
    ? new Date(start).toLocaleDateString('en-IN', opts)
    : `${new Date(start).toLocaleDateString('en-IN', opts)} – ${new Date(end).toLocaleDateString('en-IN', opts)}`;
}

export default function AcademyLeaveRequestsPage() {
  const toast = useToast();
  const { hasAcademy } = useAcademyDashboard();
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<AcademyLeaveRequest[] | null>(null);
  const [all, setAll] = useState<AcademyLeaveRequest[] | null>(null);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [detailFor, setDetailFor] = useState<AcademyLeaveRequest | null>(null);
  const [detailSessions, setDetailSessions] = useState<LeaveAffectedSession[] | null>(null);

  const [approveTarget, setApproveTarget] = useState<AcademyLeaveRequest | null>(null);
  const [substituteId, setSubstituteId] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AcademyLeaveRequest | null>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setPending([]);
      setAll([]);
      return;
    }
    setLoadError(false);
    try {
      const [p, a, t] = await Promise.all([
        api.get<AcademyLeaveRequest[]>('/academy/me/leave-requests/pending'),
        api.get<AcademyLeaveRequest[]>('/academy/me/leave-requests'),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
      ]);
      setPending(p);
      setAll(a);
      setTeachers(t);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(request: AcademyLeaveRequest) {
    setDetailFor(request);
    setDetailSessions(null);
    try {
      setDetailSessions(await api.get<LeaveAffectedSession[]>(`/academy/me/leave-requests/${request.id}/sessions`));
    } catch {
      setDetailSessions([]);
    }
  }

  function openApprove(request: AcademyLeaveRequest) {
    setSubstituteId('');
    setApproveTarget(request);
  }

  async function approve() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await api.post(`/academy/me/leave-requests/${approveTarget.id}/approve`, {
        substituteTutorId: substituteId || undefined,
      });
      toast({ title: 'Leave approved', variant: 'success' });
      setApproveTarget(null);
      await load();
    } catch {
      toast({ title: 'Could not approve that request', variant: 'error' });
    } finally {
      setApproving(false);
    }
  }

  async function reject() {
    if (!rejectTarget) return;
    await api.post(`/academy/me/leave-requests/${rejectTarget.id}/reject`);
    toast({ title: 'Leave request rejected', variant: 'info' });
    await load();
  }

  if (loadError) {
    return (
      <ErrorState description="Could not load leave requests. Check your connection and try again." onRetry={() => void load()} />
    );
  }

  const loading = pending === null || all === null;
  const list = (tab === 'pending' ? pending : all) ?? [];

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Leave Requests"
        description="Review teacher leave requests. Approving notifies only the students and parents in the affected classes."
      />

      <div className="mt-8 mb-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {(['pending', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
            )}
          >
            {t === 'pending' ? 'Pending' : 'All Requests'}
            {t === 'pending' && pending && pending.length > 0 && (
              <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-semibold text-warning dark:bg-warning/15 dark:text-warning-dark">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={tab === 'pending' ? 'No pending leave requests' : 'No leave requests yet'}
          description="Teacher leave requests will appear here for your review."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((r) => (
            <AcademyCard key={r.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {r.tutor_display_name ?? 'Teacher'}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {formatDateRange(r.start_date, r.end_date)} · {r.leave_type === 'full_day' ? 'Full day' : 'Specific classes'}
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
              </div>
              {r.status === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => openApprove(r)}>
                    <UserCheck className="h-3.5 w-3.5" aria-hidden />
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRejectTarget(r)}>
                    <UserX className="h-3.5 w-3.5" aria-hidden />
                    Reject
                  </Button>
                </div>
              )}
            </AcademyCard>
          ))}
        </div>
      )}

      <Dialog open={detailFor !== null} onOpenChange={(open) => !open && setDetailFor(null)}>
        <DialogContent
          title="Affected classes"
          description={detailFor ? `${detailFor.tutor_display_name ?? 'Teacher'} — ${formatDateRange(detailFor.start_date, detailFor.end_date)}` : ''}
        >
          {detailSessions === null ? (
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

      <Dialog open={approveTarget !== null} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent
          title={`Approve ${approveTarget?.tutor_display_name ?? 'this teacher'}'s leave?`}
          description="Optionally assign a substitute so the affected classes stay active instead of being cancelled."
        >
          <Field label="Substitute teacher (optional)" hint="Leave blank to cancel the affected classes instead.">
            <Select value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
              <option value="">No substitute — cancel the classes</option>
              {teachers
                .filter((t) => t.tutorId !== approveTarget?.tutor_id)
                .map((t) => (
                  <option key={t.tutorId} value={t.tutorId}>
                    {t.displayName ?? 'Teacher'}
                  </option>
                ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setApproveTarget(null)} disabled={approving}>
              Cancel
            </Button>
            <Button onClick={() => void approve()} disabled={approving} loading={approving}>
              {approving ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        onConfirm={reject}
        title={`Reject ${rejectTarget?.tutor_display_name ?? 'this'} leave request?`}
        description="The teacher will be notified that their request was declined."
        confirmLabel="Reject"
        danger
      />
    </div>
  );
}
