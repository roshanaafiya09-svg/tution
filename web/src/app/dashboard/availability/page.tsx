'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AvailabilityRule, AvailabilityException } from '@/lib/types';
import { Card, PageHeader, EmptyState, Button, Field, inputClass } from '@/components/ui';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [exceptions, setExceptions] = useState<AvailabilityException[] | null>(null);
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

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      api.get<AvailabilityRule[]>('/availability/me'),
      api.get<AvailabilityException[]>('/availability/exceptions/me'),
    ]);
    setRules(r);
    setExceptions(e);
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
    } catch {
      setError('Could not save that rule.');
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id: string) {
    await api.delete(`/availability/${id}`);
    await load();
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
    } catch {
      setError('Could not save that exception.');
    } finally {
      setSavingException(false);
    }
  }

  async function deleteException(id: string) {
    await api.delete(`/availability/exceptions/${id}`);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Availability"
        description="When you're generally free to teach — batches and sessions should fit inside these windows."
      />

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Weekly rules</h2>
        <Button variant="secondary" onClick={() => setShowRuleForm((s) => !s)}>
          {showRuleForm ? 'Cancel' : 'Add rule'}
        </Button>
      </div>

      {showRuleForm && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Day">
              <select
                className={inputClass}
                value={ruleForm.weekday}
                onChange={(e) => setRuleForm({ ...ruleForm, weekday: e.target.value })}
              >
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input
                type="time"
                className={inputClass}
                value={ruleForm.startTime}
                onChange={(e) => setRuleForm({ ...ruleForm, startTime: e.target.value })}
              />
            </Field>
            <Field label="To">
              <input
                type="time"
                className={inputClass}
                value={ruleForm.endTime}
                onChange={(e) => setRuleForm({ ...ruleForm, endTime: e.target.value })}
              />
            </Field>
            <Field label="Starting from">
              <input
                type="date"
                className={inputClass}
                value={ruleForm.effectiveFrom}
                onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })}
              />
            </Field>
          </div>
          <Button className="mt-4" onClick={() => void createRule()} disabled={savingRule}>
            {savingRule ? 'Saving…' : 'Save rule'}
          </Button>
        </Card>
      )}

      {rules === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : rules.length === 0 ? (
        <EmptyState title="No availability set" description="Add a weekly rule so students know when you teach." />
      ) : (
        <Card className="mb-8 divide-y divide-neutral-100 p-0">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{WEEKDAYS[rule.weekday]}</p>
                <p className="text-sm text-neutral-500">
                  {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                </p>
              </div>
              <Button variant="secondary" onClick={() => void deleteRule(rule.id)}>
                Remove
              </Button>
            </div>
          ))}
        </Card>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Exceptions</h2>
        <Button variant="secondary" onClick={() => setShowExceptionForm((s) => !s)}>
          {showExceptionForm ? 'Cancel' : 'Add exception'}
        </Button>
      </div>

      {showExceptionForm && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={exceptionForm.date}
                onChange={(e) => setExceptionForm({ ...exceptionForm, date: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={exceptionForm.isAvailable ? 'available' : 'off'}
                onChange={(e) =>
                  setExceptionForm({ ...exceptionForm, isAvailable: e.target.value === 'available' })
                }
              >
                <option value="off">Day off</option>
                <option value="available">Extra availability</option>
              </select>
            </Field>
            {exceptionForm.isAvailable && (
              <>
                <Field label="From">
                  <input
                    type="time"
                    className={inputClass}
                    value={exceptionForm.startTime}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, startTime: e.target.value })}
                  />
                </Field>
                <Field label="To">
                  <input
                    type="time"
                    className={inputClass}
                    value={exceptionForm.endTime}
                    onChange={(e) => setExceptionForm({ ...exceptionForm, endTime: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
          <Button className="mt-4" onClick={() => void createException()} disabled={savingException}>
            {savingException ? 'Saving…' : 'Save exception'}
          </Button>
        </Card>
      )}

      {exceptions === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : exceptions.length === 0 ? (
        <EmptyState title="No exceptions" description="Days off or extra availability will show up here." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {exceptions.map((exception) => (
            <div key={exception.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {new Date(exception.date).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <p className="text-sm text-neutral-500">
                  {exception.is_available
                    ? `Available ${exception.start_time?.slice(0, 5)}–${exception.end_time?.slice(0, 5)}`
                    : 'Day off'}
                </p>
              </div>
              <Button variant="secondary" onClick={() => void deleteException(exception.id)}>
                Remove
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
