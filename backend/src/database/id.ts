import { uuidv7 } from 'uuidv7';

/**
 * Every table's `id` column is UUIDv7 (blueprint §6) generated here, not by
 * Postgres — keeps us portable across managed Postgres providers that
 * don't ship custom UUID-generation extensions.
 */
export function newId(): string {
  return uuidv7();
}
