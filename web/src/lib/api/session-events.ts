/**
 * How the API client tells the app "the signed-in session is gone".
 *
 * The client cannot navigate (it is not a React module), so it raises this
 * event and a single app-level listener (`ApiEventsBridge`, mounted in the
 * root layout) decides where to send the user — to /login normally, back to
 * /admin if an impersonation token expired. Because it is raised from ONE
 * place (the client's 401 handling) no page ever has to check for 401.
 */
export type SessionLostHandler = () => void;

let handler: SessionLostHandler | null = null;
let raised = false;

/** Registers the app's response to a lost session; returns an unsubscribe. */
export function onSessionLost(next: SessionLostHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** A fresh sign-in re-arms the event. */
export function rearmSessionLost(): void {
  raised = false;
}

/**
 * Raised at most once per lost session: a dashboard fires many requests at
 * once and they all 401 together — the user should be redirected once, not
 * once per request.
 */
export function raiseSessionLost(): void {
  if (raised) return;
  raised = true;
  if (handler) {
    handler();
    return;
  }
  // No listener mounted (e.g. very early load): a hard redirect is the safe
  // default. This is plain module code, not a component — there is no
  // router to push with, so a real navigation is the only option.
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }
}
