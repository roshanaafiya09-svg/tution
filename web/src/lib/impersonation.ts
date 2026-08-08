import { tokenStore } from './api';
import type { ImpersonatedRole } from './types';

const ADMIN_ACCESS_KEY = 'adminAccessToken';
const ADMIN_REFRESH_KEY = 'adminRefreshToken';
const TARGET_KEY = 'impersonationTarget';

export interface ImpersonationTarget {
  id: string;
  role: ImpersonatedRole;
  displayName: string | null;
  email: string | null;
  phoneE164: string;
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/**
 * Client-side session swap for Super Admin "view as user". The admin's
 * own tokens are stashed (not discarded) so "Back to Super Admin"
 * restores the exact same session rather than forcing a re-login — the
 * impersonation token itself carries no refresh token (see
 * TokensService.signImpersonationToken on the backend), so there's
 * nothing for api.ts's silent-401-refresh to exchange while active;
 * a 401 during impersonation just means the 15-minute token expired.
 */
export const impersonationStore = {
  start(target: ImpersonationTarget, accessToken: string) {
    const s = storage();
    if (!s) return;

    if (tokenStore.access) s.setItem(ADMIN_ACCESS_KEY, tokenStore.access);
    if (tokenStore.refresh) s.setItem(ADMIN_REFRESH_KEY, tokenStore.refresh);
    s.setItem(TARGET_KEY, JSON.stringify(target));

    tokenStore.setAccessOnly(accessToken);
  },

  stop() {
    const s = storage();
    if (!s) return;

    const adminAccess = s.getItem(ADMIN_ACCESS_KEY);
    const adminRefresh = s.getItem(ADMIN_REFRESH_KEY);
    if (adminAccess && adminRefresh) {
      tokenStore.set(adminAccess, adminRefresh);
    } else {
      tokenStore.clear();
    }

    s.removeItem(ADMIN_ACCESS_KEY);
    s.removeItem(ADMIN_REFRESH_KEY);
    s.removeItem(TARGET_KEY);
  },

  get active(): boolean {
    return storage()?.getItem(TARGET_KEY) != null;
  },

  get target(): ImpersonationTarget | null {
    const raw = storage()?.getItem(TARGET_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ImpersonationTarget;
    } catch {
      return null;
    }
  },
};
