'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, Session, Subject } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, Field, Select } from '@/components/ui';
import { PageIntro, ScheduleList } from '@/components/student';
import { TabNav, type TabItem } from '@/components/dashboard/tab-nav';

type RangeId = 'today' | 'week' | 'two_weeks' | 'month';

const RANGE_TABS: TabItem<RangeId>[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'two_weeks', label: '2 Weeks' },
  { id: 'month', label: 'Month' },
];

function rangeFor(range: RangeId): { from: Date; to: Date } {
  const from = new Date();
  const to = new Date(from);
  switch (range) {
    case 'today':
      to.setHours(23, 59, 59, 999);
      break;
    case 'week':
      to.setDate(to.getDate() + 7);
      break;
    case 'two_weeks':
      to.setDate(to.getDate() + 14);
      break;
    case 'month':
      to.setDate(to.getDate() + 30);
      break;
  }
  return { from, to };
}

export default function StudentSchedulePage() {
  const [range, setRange] = useState<RangeId>('two_weeks');
  const [batchFilter, setBatchFilter] = useState('');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    setBatches(null);
    setSubjects(null);
    const { from, to } = rangeFor(range);
    Promise.all([
      api.get<Session[]>(`/sessions/upcoming?from=${from.toISOString()}&to=${to.toISOString()}`),
      api.get<Batch[]>('/batches/enrolled'),
      apiGetPublic<Subject[]>('/catalog/subjects'),
    ])
      .then(([s, b, subs]) => {
        setSessions(s);
        setBatches(b);
        setSubjects(subs);
      })
      .catch(() => setLoadError(true));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const loading = sessions === null || batches === null || subjects === null;

  const visibleSessions = useMemo(
    () => (sessions ?? []).filter((s) => !batchFilter || s.batch_id === batchFilter),
    [sessions, batchFilter],
  );

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="What do I have today" title="Schedule" description="Your classes, upcoming and recent." />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabNav tabs={RANGE_TABS} value={range} onChange={setRange} label="Date range" />
        {batches && batches.length > 1 && (
          <div className="w-56">
            <Field label="Batch">
              <Select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
                <option value="">All Batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your schedule. Check your connection and try again." onRetry={load} />
      ) : visibleSessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming classes"
          description="Your tutor hasn't scheduled a class yet."
        />
      ) : (
        <ScheduleList sessions={visibleSessions} batches={batches!} subjects={subjects!} />
      )}
    </div>
  );
}
