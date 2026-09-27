// isVisible is a pure function, but notifications.repository.ts also
// imports database.module.ts (a real `sql`/Kysely value import) —
// same ESM workaround as teacher-leave.service.spec.ts etc.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { isVisible, type MembershipSets } from './notifications.repository';

function sets(active: string[], known: string[]): MembershipSets {
  return { active: new Set(active), known: new Set(known) };
}

describe('isVisible', () => {
  it('an Individual notification (no academyId) is always visible', () => {
    expect(isVisible(undefined, sets([], ['A']))).toBe(true);
    expect(isVisible(null, sets([], ['A']))).toBe(true);
  });

  it('a non-teacher recipient (no membership rows at all) always sees it', () => {
    expect(isVisible('A', undefined)).toBe(true);
    expect(isVisible('A', sets([], []))).toBe(true);
    // Even for an academy they've never touched, while they ARE a member
    // elsewhere — "known" only ever gates the SPECIFIC academyId asked about.
    expect(isVisible('B', sets(['A'], ['A']))).toBe(true);
  });

  it('a currently active member sees it', () => {
    expect(isVisible('A', sets(['A'], ['A']))).toBe(true);
  });

  it('a departed member (known but not active) does not see it', () => {
    expect(isVisible('A', sets([], ['A']))).toBe(false);
  });

  it('a member active in one academy but departed from another sees only the active one', () => {
    const m = sets(['B'], ['A', 'B']);
    expect(isVisible('A', m)).toBe(false);
    expect(isVisible('B', m)).toBe(true);
  });

  it('a non-string academyId (malformed payload) is treated as visible, not crashed on', () => {
    expect(isVisible(123, sets([], ['A']))).toBe(true);
    expect(isVisible({}, sets([], ['A']))).toBe(true);
  });
});
