import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * A teacher has ONE account but works in separate teaching contexts:
 *   - Individual: the teacher's own private business (batches with
 *     academy_id NULL).
 *   - Academy:    activity owned by one academy (batches with that
 *     academy_id), available only while the teacher is an ACTIVE member.
 *
 * `tutor_id` on a record says who ran it; the context says who owns it.
 * They are different questions — see migration 0040.
 */
export type TeachingContext =
  { kind: 'individual' } | { kind: 'academy'; academyId: string };

export const INDIVIDUAL_CONTEXT: TeachingContext = { kind: 'individual' };

/** Request header the web/mobile clients send to say which context a
 *  teacher request is made in. Absent => Individual (the safe default:
 *  a missing header can never widen access to Academy data). */
export const TEACHING_CONTEXT_HEADER = 'x-teaching-context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 'individual' | 'academy:<uuid>' -> context, or null when malformed. */
export function parseTeachingContext(
  raw: string | undefined | null,
): TeachingContext | null {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return INDIVIDUAL_CONTEXT;
  }
  const value = raw.trim().toLowerCase();
  if (value === 'individual') return INDIVIDUAL_CONTEXT;
  if (value.startsWith('academy:')) {
    const academyId = value.slice('academy:'.length);
    if (UUID_RE.test(academyId)) return { kind: 'academy', academyId };
  }
  return null;
}

/** The context a batch (or any record keyed by batch.academy_id) lives in. */
export function contextOfAcademyId(academyId: string | null): TeachingContext {
  return academyId ? { kind: 'academy', academyId } : INDIVIDUAL_CONTEXT;
}

export function academyIdOf(ctx: TeachingContext): string | null {
  return ctx.kind === 'academy' ? ctx.academyId : null;
}

export function sameContext(a: TeachingContext, b: TeachingContext): boolean {
  return academyIdOf(a) === academyIdOf(b);
}

export function serializeTeachingContext(ctx: TeachingContext): string {
  return ctx.kind === 'academy' ? `academy:${ctx.academyId}` : 'individual';
}

/**
 * Per-request context carrier. TeachingContextInterceptor runs the handler
 * inside the verified context here so the single choke point every batch-addressed tutor
 * operation goes through (BatchesService.getOwnedBatch) can reject an
 * operation on a batch from the *other* context — e.g. an Academy-context
 * request touching the teacher's private Individual batch — without every
 * service having to thread the context through by hand.
 *
 * Only ever set by the guard on tutor routes. Non-HTTP callers and the
 * Academy owner's delegation layer never set it, so no cross-check runs
 * there (those paths authorise through the academy's own ownership
 * instead).
 */

const storage = new AsyncLocalStorage<{ ctx: TeachingContext }>();

export function currentTeachingContext(): TeachingContext | undefined {
  return storage.getStore()?.ctx;
}

/** Runs `fn` inside a context — used by tests and any non-HTTP caller. */
export function runInTeachingContext<T>(ctx: TeachingContext, fn: () => T): T {
  return storage.run({ ctx }, fn);
}
