import { ConflictException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../../database/types';

// database.module.ts pulls in Kysely's real (ESM) package at the top
// level for its Postgres pool setup — this Jest config can't transform
// that. The test never touches Nest's DI container (UsersRepository is
// constructed directly below), so the token's actual value doesn't
// matter; only importing it without crashing does.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { UsersRepository } from './users.repository';

/** Shapes an error the way `pg` actually throws a unique-violation —
 *  SQLSTATE 23505 plus the violated constraint's name, both read off
 *  the error object rather than via `instanceof` (pg doesn't export a
 *  typed error class for this). */
function pgUniqueViolation(constraint: string): Error {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code: string; constraint: string };
  err.code = '23505';
  err.constraint = constraint;
  return err;
}

describe('UsersRepository.createWithRole', () => {
  /** createWithRole's only DB interaction that can fail this way is
   *  `this.db.transaction().execute(...)` — mocking just that call is
   *  enough to exercise the catch/translate logic without needing to
   *  emulate Kysely's full fluent query-builder chain. */
  function build(executeError: Error): UsersRepository {
    const db = {
      transaction: () => ({
        execute: () => Promise.reject(executeError),
      }),
    } as unknown as Kysely<DB>;
    return new UsersRepository(db);
  }

  it('translates a telegram_chat_id collision into a clear 409 — legacy constraint, kept since the column/index still exist', async () => {
    const repo = build(pgUniqueViolation('users_telegram_chat_id_unique_idx'));

    await expect(
      repo.createWithRole('+919876543210', 'tutor', undefined, '12345'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      repo.createWithRole('+919876543210', 'tutor', undefined, '12345'),
    ).rejects.toThrow(/already connected to a different account/);
  });

  it('translates a phone_e164 collision into a clear 409', async () => {
    const repo = build(pgUniqueViolation('users_phone_e164_key'));

    await expect(repo.createWithRole('+919876543210', 'tutor')).rejects.toThrow(
      /phone number already exists/,
    );
  });

  it('translates an email collision into a clear 409', async () => {
    const repo = build(pgUniqueViolation('users_email_unique_idx'));

    await expect(
      repo.createWithRole('student@example.com', 'student', '+919876543210'),
    ).rejects.toThrow(/email already exists/);
  });

  it('does not swallow an unrelated error as a fake conflict', async () => {
    const repo = build(new Error('connection terminated unexpectedly'));

    await expect(repo.createWithRole('+919876543210', 'tutor')).rejects.toThrow(
      'connection terminated unexpectedly',
    );
  });

  it('still requires a phone number for an email signup, before ever touching the database', async () => {
    const repo = build(new Error('should never be reached'));

    await expect(
      repo.createWithRole('student@example.com', 'student'),
    ).rejects.toThrow('createWithRole needs a phone number');
  });
});

describe('UsersRepository.updateEmail', () => {
  /** updateEmail's only DB interaction is
   *  `this.db.updateTable('users').set(...).where(...).execute()` —
   *  mocking just that chain is enough to exercise the conflict
   *  translation without emulating the full query builder. */
  function build(execute: () => Promise<unknown>): UsersRepository {
    const db = {
      updateTable: () => ({
        set: () => ({
          where: () => ({ execute }),
        }),
      }),
    } as unknown as Kysely<DB>;
    return new UsersRepository(db);
  }

  it('translates an email collision into a clean 409 instead of leaking the raw driver error — a race where someone else claims the same email between AuthService.requestEmailUpdate and confirmEmailUpdate', async () => {
    const repo = build(() =>
      Promise.reject(pgUniqueViolation('users_email_unique_idx')),
    );

    await expect(
      repo.updateEmail('user-1', 'taken@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      repo.updateEmail('user-1', 'taken@example.com'),
    ).rejects.toThrow(/email already exists/);
  });

  it('does not swallow an unrelated error as a fake conflict', async () => {
    const repo = build(() =>
      Promise.reject(new Error('connection terminated unexpectedly')),
    );

    await expect(
      repo.updateEmail('user-1', 'someone@example.com'),
    ).rejects.toThrow('connection terminated unexpectedly');
  });

  it('succeeds normally when there is no conflict', async () => {
    const repo = build(() => Promise.resolve(undefined));

    await expect(
      repo.updateEmail('user-1', 'new@example.com'),
    ).resolves.toBeUndefined();
  });
});
