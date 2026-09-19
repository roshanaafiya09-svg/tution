import { ApiError } from './api';

export interface LoadErrorInfo {
  title: string;
  description: string;
}

/**
 * Turns a failed page load into what the user should actually read.
 * Every assessment page used to collapse *every* failure — a revoked
 * session, a 403, a 500, a dropped connection — into the same "Check your
 * connection" card, which sent people hunting for a network problem that
 * did not exist. `what` is the noun phrase ("weekly assessment
 * compliance"); the status decides the rest.
 */
export function describeLoadError(err: unknown, what: string): LoadErrorInfo {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return {
        title: 'Session expired',
        description: `Sign in again to see ${what}.`,
      };
    }
    if (err.status === 403) {
      return {
        title: 'No access',
        description: `Your account doesn't have access to ${what}.`,
      };
    }
    if (err.status === 404) {
      return {
        title: 'Not found',
        description: `We couldn't find ${what}. It may have been removed.`,
      };
    }
    if (err.status >= 500) {
      return {
        title: 'Something went wrong',
        description: `We hit a problem on our side loading ${what}. Try again in a moment.`,
      };
    }
    return {
      title: 'Something went wrong',
      description: `Could not load ${what}. ${err.message}`,
    };
  }
  // fetch() rejects with a bare TypeError on a network failure — the only
  // case where "check your connection" is honest advice.
  return {
    title: 'Something went wrong',
    description: `Could not reach the server to load ${what}. Check your connection and try again.`,
  };
}
