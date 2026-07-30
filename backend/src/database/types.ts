/**
 * Kysely database schema interface.
 *
 * Empty at project-init time — populated table-by-table alongside the SQL
 * migrations in `database/migrations/` (blueprint §7, built in the next
 * milestone). Every table added to a migration must get a matching
 * interface entry here so queries stay compile-time checked.
 */
export interface DB {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
}
