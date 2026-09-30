import {
  effectivePremiumStatus,
  effectiveSubscriptionStatus,
} from './effective-status';

const now = new Date('2026-09-30T12:00:00Z');
const past = new Date('2026-09-29T12:00:00Z');
const future = new Date('2026-10-30T12:00:00Z');

describe('effectiveSubscriptionStatus (audit H2)', () => {
  it('an active row whose period is still running is active', () => {
    expect(
      effectiveSubscriptionStatus(
        { status: 'active', trial_ends_at: past, current_period_end: future },
        now,
      ),
    ).toBe('active');
  });

  it('an active row whose period lapsed is expired, not active', () => {
    expect(
      effectiveSubscriptionStatus(
        { status: 'active', trial_ends_at: past, current_period_end: past },
        now,
      ),
    ).toBe('expired');
  });

  it('an active row with no period end is expired', () => {
    expect(
      effectiveSubscriptionStatus(
        { status: 'active', trial_ends_at: past, current_period_end: null },
        now,
      ),
    ).toBe('expired');
  });

  it('a trial is trialing until it ends, then trial_ended', () => {
    const row = { status: 'trialing', current_period_end: null };
    expect(
      effectiveSubscriptionStatus({ ...row, trial_ends_at: future }, now),
    ).toBe('trialing');
    expect(
      effectiveSubscriptionStatus({ ...row, trial_ends_at: past }, now),
    ).toBe('trial_ended');
  });

  it('accepts ISO strings as the database driver may return them', () => {
    expect(
      effectiveSubscriptionStatus(
        {
          status: 'active',
          trial_ends_at: past.toISOString(),
          current_period_end: past.toISOString(),
        },
        now,
      ),
    ).toBe('expired');
  });

  it('passes past_due and cancelled through', () => {
    const base = { trial_ends_at: past, current_period_end: future };
    expect(
      effectiveSubscriptionStatus({ ...base, status: 'past_due' }, now),
    ).toBe('past_due');
    expect(
      effectiveSubscriptionStatus({ ...base, status: 'cancelled' }, now),
    ).toBe('cancelled');
  });
});

describe('effectivePremiumStatus (audit H2)', () => {
  it('no row is inactive', () => {
    expect(effectivePremiumStatus(undefined, now)).toBe('inactive');
  });

  it('active until the period ends, expired after', () => {
    expect(
      effectivePremiumStatus(
        { status: 'active', current_period_end: future },
        now,
      ),
    ).toBe('active');
    expect(
      effectivePremiumStatus(
        { status: 'active', current_period_end: past },
        now,
      ),
    ).toBe('expired');
  });

  it('an inactive row stays inactive', () => {
    expect(
      effectivePremiumStatus(
        { status: 'inactive', current_period_end: null },
        now,
      ),
    ).toBe('inactive');
  });
});
