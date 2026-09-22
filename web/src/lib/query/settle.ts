import { toApiError, type ApiError } from '../api/errors';

/**
 * A request's outcome carried as DATA: either the response or the failure —
 * never a substitute value. For loaders that fan out many independent
 * requests (one per child, one per batch) and want one failure to mark only
 * ITS piece of the page as failed instead of failing everything:
 *
 *   const progress = await settle(api.get<Progress>(`/progress/${id}`));
 *   progress.status === 'error'   // render a failed state for this child
 *   progress.status === 'success' // progress.data is the real response
 *
 * The error is preserved (kind, code, request id), so the UI can show and log
 * exactly what went wrong. There is no way to read `.data` off a failure.
 */
export type Settled<T> =
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: ApiError };

export async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { status: 'success', data: await promise, error: null };
  } catch (thrown) {
    return { status: 'error', data: null, error: toApiError(thrown) };
  }
}
