import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleList } from './schedule-list';
import type { Session } from '@/lib/types';

const tomorrow = new Date(Date.now() + 26 * 3600_000).toISOString();

function session(over: Partial<Session>): Session {
  return {
    id: 's1',
    batch_id: 'b1',
    scheduled_start_utc: tomorrow,
    timezone: 'Asia/Kolkata',
    duration_min: 60,
    // A real meeting link — the button must be decided by status, not by
    // whether a link exists.
    meeting_url: 'https://meet.example.com/abc',
    status: 'scheduled',
    batch_title: 'Mathematics Academy',
    ...over,
  } as Session;
}

describe('ScheduleList — Join class', () => {
  it('shows Join class for a scheduled class', () => {
    render(<ScheduleList sessions={[session({})]} batches={[]} subjects={[]} />);
    expect(screen.getByRole('link', { name: /join class/i })).toBeTruthy();
  });

  it('never shows Join class for a cancelled class, even with a meeting link', () => {
    render(
      <ScheduleList
        sessions={[session({ status: 'cancelled', cancellation_reason: 'teacher_manual' })]}
        batches={[]}
        subjects={[]}
      />,
    );
    expect(screen.queryByRole('link', { name: /join class/i })).toBeNull();
    expect(screen.getByText(/Cancelled by Teacher/)).toBeTruthy();
  });

  it('says who cancelled it: the academy', () => {
    render(
      <ScheduleList
        sessions={[session({ status: 'cancelled', cancellation_reason: 'academy_manual' })]}
        batches={[]}
        subjects={[]}
      />,
    );
    expect(screen.getByText(/Cancelled by Academy/)).toBeTruthy();
  });

  it('hides Join only for the cancelled class when the day has both', () => {
    render(
      <ScheduleList
        sessions={[
          session({ id: 'a', status: 'cancelled', cancellation_reason: 'academy_manual' }),
          session({ id: 'b', scheduled_start_utc: new Date(Date.parse(tomorrow) + 3600_000 * 2).toISOString() }),
        ]}
        batches={[]}
        subjects={[]}
      />,
    );
    expect(screen.getAllByRole('link', { name: /join class/i })).toHaveLength(1);
  });
});

describe('ScheduleList — holidays and timezone', () => {
  const holiday = (over: Record<string, unknown> = {}) =>
    ({
      id: 'h1',
      type: 'academy_holiday',
      name: 'Founders Day',
      start_date: '2026-10-01',
      end_date: '2026-10-01',
      academy_name: 'Bright Academy',
      ...over,
    }) as never;

  it('shows an Academy holiday on a day with no class', () => {
    render(
      <ScheduleList
        sessions={[]}
        batches={[]}
        subjects={[]}
        holidayDays={[{ key: '2026-10-01', holidays: [holiday()] }]}
      />,
    );
    expect(screen.getByText('Founders Day')).toBeTruthy();
    expect(screen.getByText(/Bright Academy holiday/)).toBeTruthy();
  });

  it('a class at 23:30 IST stays on its IST day (the class timezone, not the browser)', () => {
    // 2026-10-01 23:30 IST == 18:00 UTC the same day.
    render(
      <ScheduleList
        sessions={[session({ scheduled_start_utc: '2026-10-01T18:00:00.000Z' })]}
        batches={[]}
        subjects={[]}
        holidayDays={[{ key: '2026-10-01', holidays: [holiday()] }]}
      />,
    );
    // The holiday and the class share ONE day group (a single date heading).
    expect(screen.getAllByText(/^Thu, 1 Oct$/)).toHaveLength(1);
  });
});
