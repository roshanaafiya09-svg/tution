/**
 * Upper bound for any money amount in minor units (paise) the API accepts.
 * Every money column (fee_ledger.expected_minor / recorded_paid_minor,
 * batches.fee_minor) is a Postgres `integer`, so a bigger value used to
 * reach the database and fail there as SQLSTATE 22003 — a generic 500.
 * Rejecting it at the DTO boundary gives the caller a precise 400 instead.
 * This is the storage limit (≈ ₹2.14 crore), not a business rule about
 * what a sensible fee is.
 */
export const MAX_MONEY_MINOR = 2_147_483_647;

export const MAX_MONEY_MINOR_MESSAGE =
  'Amount is too large (maximum 2147483647 paise).';
