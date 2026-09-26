import { describe, expect, it } from 'vitest';
import { canManageSession, coverageLabel, skippedHolidayNote } from './session-labels';

describe('substitute coverage labels (H6)', () => {
  it('the substitute sees who they are covering for — never their own name', () => {
    const session = {
      viewer_role: 'substitute' as const,
      original_tutor_display_name: 'Teacher A',
      substitute_display_name: 'Teacher B',
    };
    expect(coverageLabel(session)).toBe('Covering for Teacher A');
    expect(coverageLabel(session)).not.toContain('Teacher B');
  });

  it('the original teacher sees who is covering their class', () => {
    expect(
      coverageLabel({
        viewer_role: 'owner',
        original_tutor_display_name: 'Teacher A',
        substitute_display_name: 'Teacher B',
      }),
    ).toBe('Covered by Teacher B');
  });

  it('no coverage → no label', () => {
    expect(
      coverageLabel({ viewer_role: 'owner', original_tutor_display_name: 'A', substitute_display_name: null }),
    ).toBeNull();
  });

  it('a substitute cannot manage (cancel/complete) the class; the owner can', () => {
    expect(canManageSession({ viewer_role: 'substitute' })).toBe(false);
    expect(canManageSession({ viewer_role: 'owner' })).toBe(true);
    // Rows from endpoints that don't carry viewer_role keep today's behavior.
    expect(canManageSession({})).toBe(true);
  });
});

describe('skippedHolidayNote', () => {
  it('says nothing when no occurrence was skipped', () => {
    expect(skippedHolidayNote([])).toBeNull();
  });

  it('names the skipped day and the holiday', () => {
    const note = skippedHolidayNote([
      { scheduled_start_utc: '2026-10-05T11:30:00Z', date: '2026-10-05', holiday_name: 'Ayudha Puja' },
    ]);
    expect(note).toContain('Academy holiday');
    expect(note).toContain('Ayudha Puja');
    expect(note).toContain('5 Oct');
  });

  it('counts several skipped classes', () => {
    const note = skippedHolidayNote([
      { scheduled_start_utc: '2026-10-05T11:30:00Z', date: '2026-10-05', holiday_name: 'Puja' },
      { scheduled_start_utc: '2026-10-12T11:30:00Z', date: '2026-10-12', holiday_name: 'Puja' },
    ]);
    expect(note).toMatch(/^2 classes were not scheduled/);
  });
});
