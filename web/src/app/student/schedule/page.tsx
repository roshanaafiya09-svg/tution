'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Video } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, Session, Subject } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, StatusBadge, buttonVariants } from '@/components/ui';
import { PageIntro, AcademicCard, TimelineNode, TimelineDot } from '@/components/student';
import { cn } from '@/lib/cn';

function formatTime(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleString('en-IN', {
    timeZone: session.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayKey(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleDateString('en-CA', { timeZone: session.timezone });
}

function dayLabel(session: Session): string {
  const start = new Date(session.scheduled_start_utc);
  const today = new Date();
  if (start.toLocaleDateString('en-CA', { timeZone: session.timezone }) === today.toLocaleDateString('en-CA')) {
    return 'Today';
  }
  return start.toLocaleDateString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function StudentSchedulePage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    setBatches(null);
    setSubjects(null);
    Promise.all([
      api.get<Session[]>('/sessions/upcoming'),
      api.get<Batch[]>('/batches/enrolled'),
      apiGetPublic<Subject[]>('/catalog/subjects'),
    ])
      .then(([s, b, subs]) => {
        setSessions(s);
        setBatches(b);
        setSubjects(subs);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading = sessions === null || batches === null || subjects === null;

  function subjectFor(session: Session): string | undefined {
    const batch = batches?.find((b) => b.id === session.batch_id);
    return batch ? subjects?.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;
  }

  const now = new Date();
  const nextSession = (sessions ?? []).find((s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now);

  const groups: { key: string; label: string; sessions: Session[] }[] = [];
  for (const session of sessions ?? []) {
    const key = dayKey(session);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: dayLabel(session), sessions: [] };
      groups.push(group);
    }
    group.sessions.push(session);
  }

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="What do I have today" title="Schedule" description="Your classes for the next two weeks." />

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your schedule. Check your connection and try again." onRetry={load} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming classes"
          description="Your tutor hasn't scheduled a class yet."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500 dark:text-brand-300">
                {group.label}
              </p>
              <div>
                {group.sessions.map((session, i) => {
                  const subject = subjectFor(session);
                  const isNext = session.id === nextSession?.id;
                  return (
                    <TimelineNode
                      key={session.id}
                      isLast={i === group.sessions.length - 1}
                      marker={<TimelineDot active={isNext} />}
                    >
                      <AcademicCard
                        className={cn(
                          'flex flex-wrap items-center justify-between gap-3',
                          isNext && 'border-brand-300 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/5',
                        )}
                      >
                        <div>
                          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                            {subject ?? session.batch_title}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                            {subject ? `${session.batch_title} · ` : ''}
                            {formatTime(session)} · {session.duration_min} min
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={session.status} />
                          {session.meeting_url && (
                            <a
                              href={session.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                              className={buttonVariants({ variant: 'accent', size: 'sm' })}
                            >
                              <Video className="h-3.5 w-3.5" aria-hidden />
                              Join class
                            </a>
                          )}
                        </div>
                      </AcademicCard>
                    </TimelineNode>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
