import 'dotenv/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../src/database/types';
import { newId } from '../src/database/id';
import { AiInteractionsRepository } from '../src/modules/ai/doubt-solver/interactions.repository';

/**
 * SEC-04: assertUnderBudget (SELECT/aggregate) and the eventual
 * interactions.create() (INSERT) used to be two separate, unlocked
 * statements with an entire AI-provider round trip in between —
 * concurrent requests could all read "under budget" before any of them
 * had written usage back, blowing past the monthly cap by however many
 * requests raced. AiInteractionsRepository.createIfUnderBudget fixes
 * this with a per-student Postgres advisory lock (pg_advisory_xact_lock)
 * wrapping a fresh re-check + the insert in one transaction.
 *
 * This needs a real Postgres connection (not a mock) — the property
 * under test is genuine cross-connection serialization, which nothing
 * short of the actual database can prove. Runs against the local dev
 * DB (same DATABASE_URL as `npm run start:dev`); creates one throwaway
 * user + batch, cleans them up in `afterAll` regardless of outcome.
 */
describe('AiInteractionsRepository.createIfUnderBudget — concurrency (SEC-04)', () => {
  let db: Kysely<DB>;
  let repository: AiInteractionsRepository;
  let tutorId: string;
  let studentId: string;
  let batchId: string;

  const TOKEN_COST = 40;
  const CAP = 100; // allows exactly 3 of 5 concurrent 40-token requests through

  beforeAll(async () => {
    db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: process.env.DATABASE_URL }),
      }),
    });
    repository = new AiInteractionsRepository(db);

    const subject = await db
      .selectFrom('subjects')
      .select('id')
      .executeTakeFirstOrThrow();
    const gradeLevel = await db
      .selectFrom('grade_levels')
      .select('id')
      .executeTakeFirstOrThrow();

    const marker = `sec04-${Date.now()}`;
    tutorId = newId();
    studentId = newId();
    batchId = newId();

    await db
      .insertInto('users')
      .values([
        { id: tutorId, phone_e164: `+91-${marker}-t` },
        { id: studentId, phone_e164: `+91-${marker}-s` },
      ])
      .execute();

    await db
      .insertInto('batches')
      .values({
        id: batchId,
        tutor_id: tutorId,
        title: `SEC-04 race test batch ${marker}`,
        subject_id: subject.id,
        grade_level_id: gradeLevel.id,
        capacity: 10,
        fee_minor: 0,
      })
      .execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom('ai_interactions')
      .where('batch_id', '=', batchId)
      .execute();
    await db.deleteFrom('batches').where('id', '=', batchId).execute();
    await db
      .deleteFrom('users')
      .where('id', 'in', [tutorId, studentId])
      .execute();
    await db.destroy();
  });

  it('lets only the requests that fit under the cap through, even when fired concurrently', async () => {
    const attempt = () =>
      repository.createIfUnderBudget(
        {
          studentId,
          batchId,
          parentId: null,
          kind: 'hint',
          questionText: 'q',
          answerText: 'a',
          citations: [],
          flagged: false,
          inputTokens: TOKEN_COST,
          outputTokens: 0,
        },
        CAP,
      );

    // All five fire before any of them has committed — without the
    // advisory lock, every one would read usage=0 and all would insert,
    // landing on 200 total tokens against a cap of 100.
    const results = await Promise.all([
      attempt(),
      attempt(),
      attempt(),
      attempt(),
      attempt(),
    ]);

    const allowed = results.filter((r) => r !== null);
    const blocked = results.filter((r) => r === null);

    expect(allowed).toHaveLength(3);
    expect(blocked).toHaveLength(2);

    const rows = await db
      .selectFrom('ai_interactions')
      .selectAll()
      .where('student_id', '=', studentId)
      .execute();
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, r) => sum + r.input_tokens, 0)).toBe(
      3 * TOKEN_COST,
    );
  });
});
