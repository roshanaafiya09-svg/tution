import { describe, expect, it } from 'vitest';
import { canManageSession, coverageLabel } from './session-labels';

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
