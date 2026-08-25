import { session, ensureSession } from './api';
import type { ImpersonatedRole } from './types';

export interface ImpersonationTarget {
  id: string;
  role: ImpersonatedRole;
  displayName: string | null;
  email: string | null;
  phoneE164: string;
}

let target: ImpersonationTarget | null = null;

/**
 * Client-side session swap for Super Admin "view as user". Both the
 * impersonation access token and the target metadata now live in
 * memory only (SEC-02) — previously stashed in localStorage, which is
 * the single most sensitive place to leave an impersonation token
 * sitting XSS-exposed. The admin's own refresh cookie is never touched
 * by starting/stopping impersonation, so "Back to Super Admin" doesn't
 * need to restore anything explicitly — it just re-derives the admin's
 * own access token from that still-valid cookie via ensureSession().
 *
 * Disclosed behavior change from the localStorage version: a page
 * reload while impersonating now ends the impersonation session
 * (the in-memory target/access-token are gone) rather than surviving
 * it — the correct tradeoff given what impersonation tokens can do,
 * not an oversight.
 */
export const impersonationStore = {
  start(newTarget: ImpersonationTarget, accessToken: string) {
    target = newTarget;
    session.setAccessOnly(accessToken);
  },

  async stop() {
    target = null;
    await ensureSession();
  },

  get active(): boolean {
    return target != null;
  },

  get target(): ImpersonationTarget | null {
    return target;
  },
};
