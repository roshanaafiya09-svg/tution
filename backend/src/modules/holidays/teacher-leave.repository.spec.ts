/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await --
 * A hand-rolled Kysely query-builder stand-in, kept deliberately untyped
 * (`any`) — the point of this suite is to trace WHICH connection object
 * a call went through and in what order, not to type-check a mock
 * against Kysely's real (huge, generic) builder interface. */

// Same ESM/database.module workaround as teacher-leave.service.spec.ts —
// TeacherLeaveRepository imports database.module.ts (real Kysely/pg pool
// setup) which this Jest config can't transform.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { TeacherLeaveRepository } from './teacher-leave.repository';

const REQUEST_ID = 'leave-1';
const ACADEMY_ID = 'academy-1';
const TUTOR_ID = 'tutor-1';

/** A minimal chainable Kysely-query-builder stand-in: every method
 *  returns `this` except the terminal executors, which resolve/queue
 *  from the scripts below. Good enough to prove WHICH connection object
 *  (`trx` vs `this.db`) a call went through and in what order, without
 *  standing up a real Postgres transaction. */
function makeQueryBuilder(onExecute: () => unknown) {
  const builder: any = {
    innerJoin: () => builder,
    select: () => builder,
    where: () => builder,
    set: () => builder,
    returningAll: () => builder,
    execute: async () => onExecute(),
    executeTakeFirst: async () => onExecute(),
  };
  return builder;
}

describe('TeacherLeaveRepository.decide — transactional integrity', () => {
  it('runs the status claim AND every session mutation through the SAME transaction handle, never the outer db', async () => {
    const calls: string[] = [];
    const trx: any = {
      updateTable: (table: string) => {
        calls.push(`trx.updateTable(${table})`);
        if (table === 'teacher_leave_requests') {
          return makeQueryBuilder(() => ({
            id: REQUEST_ID,
            tutor_id: TUTOR_ID,
            academy_id: ACADEMY_ID,
            status: 'approved',
            start_date: '2026-09-20',
            end_date: '2026-09-20',
          }));
        }
        return makeQueryBuilder(() => undefined);
      },
      selectFrom: (table: string) => {
        calls.push(`trx.selectFrom(${table})`);
        if (table === 'teacher_leave_request_sessions') {
          return makeQueryBuilder(() => [
            { session_id: 's1' },
            { session_id: 's2' },
          ]);
        }
        // class_sessions eligibility query
        return makeQueryBuilder(() => [
          {
            id: 's1',
            batch_id: 'b1',
            scheduled_start_utc: new Date('2026-09-20T10:00:00Z'),
            timezone: 'Asia/Kolkata',
          },
          {
            id: 's2',
            batch_id: 'b1',
            scheduled_start_utc: new Date('2026-09-20T12:00:00Z'),
            timezone: 'Asia/Kolkata',
          },
        ]);
      },
    };

    const outerDb: any = {
      updateTable: () => {
        throw new Error(
          'decide() must never touch the outer db directly once inside a transaction',
        );
      },
      selectFrom: () => {
        throw new Error(
          'decide() must never touch the outer db directly once inside a transaction',
        );
      },
      transaction: () => ({
        execute: async (fn: (trx: unknown) => Promise<unknown>) => fn(trx),
      }),
    };

    const repository = new TeacherLeaveRepository(outerDb);
    const result = await repository.decide(
      REQUEST_ID,
      ACADEMY_ID,
      'approved',
      'admin-1',
      null,
    );

    expect(result?.sessions).toHaveLength(2);
    // The claim UPDATE and both session UPDATEs all went through trx.
    expect(
      calls.filter((c) => c === 'trx.updateTable(class_sessions)'),
    ).toHaveLength(2);
    expect(calls).toContain('trx.updateTable(teacher_leave_requests)');
  });

  it('TEST 34 — a failure partway through the session loop propagates instead of being swallowed, so nothing partial is ever reported as committed', async () => {
    let classSessionUpdateCount = 0;
    const trx: any = {
      updateTable: (table: string) => {
        if (table === 'teacher_leave_requests') {
          return makeQueryBuilder(() => ({
            id: REQUEST_ID,
            tutor_id: TUTOR_ID,
            academy_id: ACADEMY_ID,
            status: 'approved',
            start_date: '2026-09-20',
            end_date: '2026-09-20',
          }));
        }
        // class_sessions: succeed once, then blow up — modeling "5
        // cancelled, then a DB error" from the spec's own example.
        classSessionUpdateCount += 1;
        if (classSessionUpdateCount >= 2) {
          throw new Error('simulated mid-transaction failure');
        }
        return makeQueryBuilder(() => undefined);
      },
      selectFrom: (table: string) => {
        if (table === 'teacher_leave_request_sessions') {
          return makeQueryBuilder(() => [
            { session_id: 's1' },
            { session_id: 's2' },
            { session_id: 's3' },
          ]);
        }
        return makeQueryBuilder(() => [
          {
            id: 's1',
            batch_id: 'b1',
            scheduled_start_utc: new Date('2026-09-20T10:00:00Z'),
            timezone: 'Asia/Kolkata',
          },
          {
            id: 's2',
            batch_id: 'b1',
            scheduled_start_utc: new Date('2026-09-20T12:00:00Z'),
            timezone: 'Asia/Kolkata',
          },
          {
            id: 's3',
            batch_id: 'b1',
            scheduled_start_utc: new Date('2026-09-20T14:00:00Z'),
            timezone: 'Asia/Kolkata',
          },
        ]);
      },
    };

    // Real Kysely's `transaction().execute(fn)` issues ROLLBACK and
    // re-throws whenever `fn` rejects — modeled here by simply
    // propagating the callback's rejection, which is exactly what a
    // *real* Postgres connection does with everything written through
    // `trx` up to that point (see this test's sibling above for proof
    // that every write in this method goes through `trx`, never the
    // outer `db` — that is what makes the real rollback total).
    const outerDb: any = {
      transaction: () => ({
        execute: async (fn: (trx: unknown) => Promise<unknown>) => fn(trx),
      }),
    };

    const repository = new TeacherLeaveRepository(outerDb);

    await expect(
      repository.decide(REQUEST_ID, ACADEMY_ID, 'approved', 'admin-1', null),
    ).rejects.toThrow('simulated mid-transaction failure');

    // Exactly one session was mutated before the failure — proving the
    // failure is real (not swallowed) and that no code path outside this
    // one transaction call could have separately committed the other two.
    expect(classSessionUpdateCount).toBe(2);
  });

  it('a rejection claims nothing and never queries class_sessions at all', async () => {
    const selectFromCalls: string[] = [];
    const trx: any = {
      updateTable: (table: string) => {
        if (table === 'teacher_leave_requests') {
          return makeQueryBuilder(() => ({
            id: REQUEST_ID,
            tutor_id: TUTOR_ID,
            academy_id: ACADEMY_ID,
            status: 'rejected',
            start_date: '2026-09-20',
            end_date: '2026-09-20',
          }));
        }
        throw new Error('a rejection must never touch class_sessions');
      },
      selectFrom: (table: string) => {
        selectFromCalls.push(table);
        throw new Error('a rejection must never query sessions at all');
      },
    };
    const outerDb: any = {
      transaction: () => ({
        execute: async (fn: (trx: unknown) => Promise<unknown>) => fn(trx),
      }),
    };

    const repository = new TeacherLeaveRepository(outerDb);
    const result = await repository.decide(
      REQUEST_ID,
      ACADEMY_ID,
      'rejected',
      'admin-1',
      null,
    );

    expect(result).toEqual({
      request: expect.objectContaining({ status: 'rejected' }),
      sessions: [],
    });
    expect(selectFromCalls).toHaveLength(0);
  });

  it('returns undefined without touching sessions when the row is no longer pending (already decided / membership ended)', async () => {
    const selectFromCalls: string[] = [];
    const trx: any = {
      updateTable: () => makeQueryBuilder(() => undefined),
      selectFrom: (table: string) => {
        selectFromCalls.push(table);
        throw new Error('must never query sessions once the claim failed');
      },
    };
    const outerDb: any = {
      transaction: () => ({
        execute: async (fn: (trx: unknown) => Promise<unknown>) => fn(trx),
      }),
    };

    const repository = new TeacherLeaveRepository(outerDb);
    const result = await repository.decide(
      REQUEST_ID,
      ACADEMY_ID,
      'approved',
      'admin-1',
      null,
    );

    expect(result).toBeUndefined();
    expect(selectFromCalls).toHaveLength(0);
  });
});
