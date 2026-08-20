'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CalendarDays, CalendarOff, Plus, Sun, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { AvailabilityRule, AvailabilityException } from '@/lib/types';
import {
  Button,
  buttonVariants,
  CardSkeleton,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, MetricCard, SectionHeader } from '@/components/dashboard';
import { cn } from '@/lib/cn';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Display order for the weekly grid — Monday first, matching how tutors think about a teaching week.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ruleHours(rule: AvailabilityRule): number {
  const [sh, sm] = rule.start_time.slice(0, 5).split(':').map(Number);
  const [eh, em] = rule.end_time.slice(0, 5).split(':').map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

export default function AvailabilityPage() {
  const toast = useToast();
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [exceptions, setExceptions] = useState<AvailabilityException[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    weekday: '1',
    startTime: '16:00',
    endTime: '18:00',
    effectiveFrom: today(),
  });
  const [savingRule, setSavingRule] = useState(false);

  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    date: today(),
    isAvailable: false,
    startTime: '',
    endTime: '',
  });
  const [savingException, setSavingException] = useState(false);

  const [ruleToDelete, setRuleToDelete] = useState<AvailabilityRule | null>(null);
  const [exceptionToDelete, setExceptionToDelete] = useState<AvailabilityException | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [r, e] = await Promise.all([
        api.get<AvailabilityRule[]>('/availability/me'),
        api.get<AvailabilityException[]>('/availability/exceptions/me'),
      ]);
      setRules(r);
      setExceptions(e);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openRuleForm(weekday?: number) {
    if (weekday !== undefined) setRuleForm((f) => ({ ...f, weekday: String(weekday) }));
    setShowRuleForm(true);
  }

  async function createRule() {
    setSavingRule(true);
    setError(null);
    try {
      await api.post('/availability', {
        weekday: Number(ruleForm.weekday),
        startTime: ruleForm.startTime,
        endTime: ruleForm.endTime,
        effectiveFrom: ruleForm.effectiveFrom,
      });
      setShowRuleForm(false);
      await load();
      toast({ title: 'Rule saved', variant: 'success' });
    } catch {
      setError('Could not save that rule.');
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id: string) {
    await api.delete(`/availability/${id}`);
    await load();
    toast({ title: 'Rule removed', variant: 'success' });
  }

  async function createException() {
    setSavingException(true);
    setError(null);
    try {
      await api.post('/availability/exceptions', {
        date: exceptionForm.date,
        isAvailable: exceptionForm.isAvailable,
        startTime: exceptionForm.isAvailable ? exceptionForm.startTime || undefined : undefined,
        endTime: exceptionForm.isAvailable ? exceptionForm.endTime || undefined : undefined,
      });
      setShowExceptionForm(false);
      await load();
      toast({ title: 'Exception saved', variant: 'success' });
    } catch {
      setError('Could not save that exception.');
    } finally {
      setSavingException(false);
    }
  }

  async function deleteException(id: string) {
    await api.delete(`/availability/exceptions/${id}`);
    await load();
    toast({ title: 'Exception removed', variant: 'success' });
  }

  const totalHours = rules ? rules.reduce((sum, r) => sum + ruleHours(r), 0) : 0;
  const daysCovered = rules ? new Set(rules.map((r) => r.weekday)).size : 0;
  const upcomingExceptions = (exceptions ?? []).filter((e) => e.date.slice(0, 10) >= today());

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Availability"
        description="The hours you're generally willing to teach. Students booking 1:1 sessions can only pick times inside these windows."
        action={
          <Button size="sm" onClick={() => openRuleForm()}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add window
          </Button>
        }
      />

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-brand-200/70 bg-brand-50/40 px-4 py-3 dark:border-brand-500/25 dark:bg-brand-500/[0.07]">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-neutral-800 dark:text-neutral-100">
            General availability, not your actual schedule
          </p>
          <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">
            This page says <em>when you could teach</em>. Real classes and bookings — the ones with students
            attached — live in the Calendar.
          </p>
        </div>
        <Link href="/dashboard/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Open calendar
        </Link>
      </div>

      {loadError ? (
        <ErrorState
          description="Could not load your availability. Check your connection and try again."
          onRetry={() => void load()}
        />
      ) : rules === null || exceptions === null ? (
        <div className="space-y-4">
          <CardSkeleton className="h-24 rounded-2xl" />
          <CardSkeleton className="h-48 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={CalendarClock}
              label="Hours per week"
              value={totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}
              hint={`${rules.length} window${rules.length === 1 ? '' : 's'}`}
            />
            <MetricCard
              icon={Sun}
              label="Days covered"
              value={`${daysCovered}/7`}
              hint={daysCovered === 0 ? 'No days set yet' : 'Weekly pattern'}
              tone={daysCovered === 0 ? 'warning' : 'brand'}
            />
            <MetricCard
              icon={CalendarOff}
              label="Upcoming exceptions"
              value={upcomingExceptions.length}
              hint="Days off and one-off extra hours"
              tone="neutral"
            />
          </div>

          <SectionHeader
            eyebrow="Every week"
            title="General availability"
            className="mb-0 pt-2"
          />

          {rules.length === 0 ? (
            <EmptyPanel
              icon={CalendarClock}
              title="No weekly availability yet"
              description="Add the time windows you're normally free to teach. Students see these when booking, and your calendar shades them so you can plan around them."
              steps={['Add a window', 'Repeat weekly', 'Students book inside it', 'Add exceptions as needed']}
              action={
                <Button size="sm" onClick={() => openRuleForm()}>
                  Add your first window
                </Button>
              }
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
              {DISPLAY_ORDER.map((weekday) => {
                const dayRules = rules
                  .filter((r) => r.weekday === weekday)
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));
                const dayHours = dayRules.reduce((sum, r) => sum + ruleHours(r), 0);
                return (
                  <div
                    key={weekday}
                    className={cn(
                      'flex min-h-[8rem] flex-col rounded-xl border p-3 transition-colors',
                      dayRules.length > 0
                        ? 'border-neutral-200/70 bg-white dark:border-neutral-800/80 dark:bg-surface'
                        : 'border-dashed border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40',
                    )}
                  >
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                        <span className="lg:hidden">{WEEKDAYS[weekday]}</span>
                        <span className="hidden lg:inline">{WEEKDAYS[weekday].slice(0, 3)}</span>
                      </span>
                      {dayHours > 0 && (
                        <span className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
                          {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}h
                        </span>
                      )}
                    </p>

                    <div className="mt-2 flex flex-1 flex-wrap content-start gap-1.5">
                      {dayRules.length === 0 ? (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">Unavailable</span>
                      ) : (
                        dayRules.map((rule) => (
                          <span
                            key={rule.id}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-1 pl-2 pr-1 text-[11px] font-medium tabular-nums text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                          >
                            {rule.start_time.slice(0, 5)}–{rule.end_time.slice(0, 5)}
                            <button
                              type="button"
                              onClick={() => setRuleToDelete(rule)}
                              aria-label={`Remove ${WEEKDAYS[rule.weekday]} ${rule.start_time.slice(0, 5)}–${rule.end_time.slice(0, 5)}`}
                              className="rounded p-0.5 text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-800 dark:text-brand-300 dark:hover:bg-brand-500/25"
                            >
                              <X className="h-3 w-3" aria-hidden />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openRuleForm(weekday)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-brand-600 dark:text-neutral-500 dark:hover:text-brand-300"
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3 pt-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500 dark:text-brand-300">
                One-off changes
              </p>
              <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                Exceptions
              </h2>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setShowExceptionForm(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add exception
            </Button>
          </div>

          {exceptions.length === 0 ? (
            <EmptyPanel
              icon={CalendarOff}
              title="No exceptions"
              description="Holidays, days off, or extra hours you're adding just once override your weekly pattern for that date."
              action={
                <Button variant="secondary" size="sm" onClick={() => setShowExceptionForm(true)}>
                  Add an exception
                </Button>
              }
            />
          ) : (
            <AcademicCard className="p-0">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {exceptions.map((exception) => (
                  <li key={exception.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          exception.is_available
                            ? 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark'
                            : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500',
                        )}
                        aria-hidden
                      >
                        {exception.is_available ? (
                          <Sun className="h-4 w-4" />
                        ) : (
                          <CalendarOff className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {new Date(exception.date).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {exception.is_available
                            ? `Extra availability ${exception.start_time?.slice(0, 5) ?? ''}–${exception.end_time?.slice(0, 5) ?? ''}`
                            : 'Day off — no bookings taken'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExceptionToDelete(exception)}
                      aria-label="Remove exception"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </AcademicCard>
          )}
        </>
      )}

      <Dialog open={showRuleForm} onOpenChange={setShowRuleForm}>
        <DialogContent
          title="Add a weekly window"
          description="This time window repeats every week until you remove it."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Day">
              <Select value={ruleForm.weekday} onChange={(e) => setRuleForm({ ...ruleForm, weekday: e.target.value })}>
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Starting from">
              <Input
                type="date"
                value={ruleForm.effectiveFrom}
                onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })}
              />
            </Field>
            <Field label="From">
              <Input
                type="time"
                value={ruleForm.startTime}
                onChange={(e) => setRuleForm({ ...ruleForm, startTime: e.target.value })}
              />
            </Field>
            <Field label="To">
              <Input
                type="time"
                value={ruleForm.endTime}
                onChange={(e) => setRuleForm({ ...ruleForm, endTime: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowRuleForm(false)} disabled={savingRule}>
              Cancel
            </Button>
            <Button onClick={() => void createRule()} disabled={savingRule} loading={savingRule}>
              {savingRule ? 'Saving…' : 'Save window'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExceptionForm} onOpenChange={setShowExceptionForm}>
        <DialogContent
          title="Add an exception"
          description="A one-off change to your usual week — a holiday, a single unavailable date, or extra hours you're adding just once."
        >
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field label="Date">
              <Input
                type="date"
                value={exceptionForm.date}
                onChange={(e) => setExceptionForm({ ...exceptionForm, date: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={exceptionForm.isAvailable ? 'available' : 'off'}
                onChange={(e) => setExceptionForm({ ...exceptionForm, isAvailable: e.target.value === 'available' })}
              >
                <option value="off">Day off — e.g. a holiday</option>
                <option value="available">Extra availability — e.g. one-off extra hours</option>
              </Select>
            </Field>
            {exceptionForm.isAvailable && (
              <>
                <Field label="From">
                  <Input
                    type="time"
                    value={exceptionForm.startTime}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, startTime: e.target.value })}
                  />
                </Field>
                <Field label="To">
                  <Input
                    type="time"
                    value={exceptionForm.endTime}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, endTime: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowExceptionForm(false)} disabled={savingException}>
              Cancel
            </Button>
            <Button onClick={() => void createException()} disabled={savingException} loading={savingException}>
              {savingException ? 'Saving…' : 'Save exception'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={ruleToDelete !== null}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
        onConfirm={() => (ruleToDelete ? deleteRule(ruleToDelete.id) : Promise.resolve())}
        title="Remove this availability window?"
        description={
          ruleToDelete
            ? `You'll no longer be marked as generally free on ${WEEKDAYS[ruleToDelete.weekday]}s ${ruleToDelete.start_time.slice(0, 5)}–${ruleToDelete.end_time.slice(0, 5)}. This won't affect batches or sessions already scheduled.`
            : ''
        }
        confirmLabel="Remove"
      />

      <ConfirmDialog
        open={exceptionToDelete !== null}
        onOpenChange={(open) => !open && setExceptionToDelete(null)}
        onConfirm={() => (exceptionToDelete ? deleteException(exceptionToDelete.id) : Promise.resolve())}
        title="Remove this exception?"
        description={
          exceptionToDelete
            ? `This will remove your ${exceptionToDelete.is_available ? 'extra availability' : 'day off'} for ${new Date(exceptionToDelete.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}.`
            : ''
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
