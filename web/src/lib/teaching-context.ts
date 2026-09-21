/**
 * A teacher has ONE Scholar account but works in separate teaching
 * contexts: their Individual business, and one context per academy they are
 * an ACTIVE member of. The current context is sent to the API on every
 * request (`X-Teaching-Context`) and re-verified by the backend each time —
 * this module only remembers the teacher's choice; it never grants access.
 *
 * Wire format: 'individual' | 'academy:<academyId>'.
 */
export type TeachingContextValue = 'individual' | `academy:${string}`;

export const INDIVIDUAL: TeachingContextValue = 'individual';

const STORAGE_KEY = 'scholar.teachingContext';

let current: TeachingContextValue = INDIVIDUAL;
let hydrated = false;
const listeners = new Set<() => void>();

function isValid(value: unknown): value is TeachingContextValue {
  return value === INDIVIDUAL || (typeof value === 'string' && /^academy:[0-9a-f-]{36}$/i.test(value));
}

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValid(stored)) current = stored;
  } catch {
    // Storage blocked — the in-memory value (Individual) is used.
  }
}

export const teachingContext = {
  get value(): TeachingContextValue {
    hydrate();
    return current;
  },
  set(next: TeachingContextValue): void {
    hydrate();
    if (next === current) return;
    current = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best effort — the choice still applies for this page's lifetime.
    }
    listeners.forEach((listener) => listener());
  },
  /** Back to Individual — on sign-out, or when the remembered academy is
   *  no longer one the teacher may work in (e.g. they left it). */
  reset(): void {
    this.set(INDIVIDUAL);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function academyContext(academyId: string): TeachingContextValue {
  return `academy:${academyId}`;
}

export function academyIdFromContext(value: TeachingContextValue): string | null {
  return value.startsWith('academy:') ? value.slice('academy:'.length) : null;
}

/** Response of GET /teaching-contexts/me. */
export interface AvailableTeachingContexts {
  individual: { kind: 'individual' };
  academies: Array<{ academyId: string; name: string; slug: string; logoObjectKey: string | null }>;
}
