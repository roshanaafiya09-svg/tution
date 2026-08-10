'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarOff, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { AvailabilityRule, AvailabilityException } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  Button,
  Field,
  Input,
  Select,
  InlineError,
  CardSkeleton,
  ErrorState,
  ConfirmDialog,
  StatCard,
  Dialog,
  DialogContent,
  DialogFooter,
  useToast,
} from '@/components/ui';

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

  return (
    <div>
      <PageHeader
        title="Availability"
        description="When you're generally free to teach — batches and sessions should fit inside these windows."
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {loadError ? (
        <ErrorState description="Could not load your availability. Check your connection and try again." onRetry={() => void load()} />
      ) : rules === null || exceptions === null ? (
        <div className="space-y-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={CalendarClock}
              label="Available this week"
              value={`${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} hours`}
            />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Weekly schedule</h2>
            <Button onClick={() => setShowRuleForm(true)}>Add rule</Button>
          </div>

          <Card className="mb-8 divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {DISPLAY_ORDER.map((weekday) => {
              const dayRules = rules.filter((r) => r.weekday === weekday);
              return (
                <div key={weekday} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <p className="w-24 shrink-0 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {WEEKDAYS[weekday]}
                  </p>
                  {dayRules.length === 0 ? (
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">Unavailable</p>
                  ) : (
                    <div className="flex flex-1 flex-wrap gap-2">
                      {dayRules.map((rule) => (
                        <span
                          key={rule.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                        >
                          {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                          <button
                            type="button"
                            onClick={() => setRuleToDelete(rule)}
                            aria-label={`Remove ${WEEKDAYS[rule.weekday]} ${rule.start_time.slice(0, 5)}–${rule.end_time.slice(0, 5)}`}
                            className="rounded-full p-0.5 text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-800 dark:text-brand-300 dark:hover:bg-brand-500/20"
                          >
                            <X className="h-3 w-3" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Exceptions</h2>
            <Button onClick={() => setShowExceptionForm(true)}>Add exception</Button>
          </div>

          {exceptions.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No exceptions"
              description="Days off or extra availability will show up here."
            />
          ) : (
            <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              {exceptions.map((exception) => (
                <div key={exception.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {new Date(exception.date).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {exception.is_available
                        ? `Available ${exception.start_time?.slice(0, 5)}–${exception.end_time?.slice(0, 5)}`
                        : 'Day off'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExceptionToDelete(exception)}
                    aria-label="Remove exception"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      <Dialog open={showRuleForm} onOpenChange={setShowRuleForm}>
        <DialogContent title="Add a weekly rule" description="This time window repeats every week until you remove it.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Day">
              <Select
                value={ruleForm.weekday}
                onChange={(e) => setRuleForm({ ...ruleForm, weekday: e.target.value })}
              >
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
              {savingRule ? 'Saving…' : 'Save rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExceptionForm} onOpenChange={setShowExceptionForm}>
        <DialogContent title="Add an exception" description="A one-off change to your usual schedule — a holiday, a single unavailable date, or extra hours you're adding just once.">
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
                onChange={(e) =>
                  setExceptionForm({ ...exceptionForm, isAvailable: e.target.value === 'available' })
                }
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
        title="Remove this availability rule?"
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
