'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import posthog from 'posthog-js';
import { api, apiPost, session, ensureSession, ApiError } from '@/lib/api';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { Button, Field, Input, InlineError, Card } from '@/components/ui';
import type { Me } from '@/lib/types';

interface AuthTokens {
  accessToken: string;
  csrfToken: string;
}

type Phase = 'identify' | 'otp' | 'choose-role';
type IdentifierKind = 'phone' | 'email';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const ROLES = ['tutor', 'student', 'parent', 'academy'] as const;

/** Reads the `sub` claim straight out of the access token — no server
 * round-trip needed just to identify the PostHog session. */
function decodeJwtSubject(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    return null;
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `next` comes straight off the URL — anyone can link to
  // /login?next=<anything>, so it's only ever trusted as a same-origin
  // path, never handed to router.replace() raw.
  const next = safeRedirectPath(searchParams.get('next'));

  const [phase, setPhase] = useState<Phase>('identify');
  const [kind, setKind] = useState<IdentifierKind>('email');
  // Only the 10 local digits live in state — +91 is fixed and rendered
  // separately, so it's structurally impossible to submit a phone that's
  // missing or has mangled the country code.
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');
  // Signing up with an email still needs a phone (users.phone_e164 is
  // NOT NULL) — collected on the role step, only in that case.
  const [signupPhoneDigits, setSignupPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [signupRole, setSignupRole] = useState<'tutor' | 'student' | 'parent' | 'academy'>('tutor');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const identifier = kind === 'phone' ? `+91${phoneDigits}` : email.trim();
  const identifierReady = kind === 'phone' ? phoneDigits.length === 10 : email.includes('@');

  async function onAuthenticated(tokens: AuthTokens) {
    session.set(tokens.accessToken, tokens.csrfToken);
    if (posthog.__loaded) {
      const userId = decodeJwtSubject(tokens.accessToken);
      if (userId) posthog.identify(userId);
    }
    if (next) {
      router.replace(next);
      return;
    }
    // Fetch the authoritative role set rather than trust the signup-only
    // `signupRole` choice — a returning user never passes that through.
    // Every role now has its own web portal; /get-the-app is the
    // fallback only for an account with none of these roles yet (kept
    // live as a standalone route for the mobile download cards, just no
    // longer the automatic post-login destination for students).
    const me = await api.get<Me>('/auth/me').catch(() => null);
    if (me?.roles.includes('superadmin')) {
      router.replace('/admin');
    } else if (me?.roles.includes('academy')) {
      // An academy-owner account (self-signed-up here, or created by
      // superadmin via AcademyAdminService.linkOwner) is expected to
      // hold only this role — checked ahead of parent/tutor/student so
      // it always wins.
      router.replace('/academy');
    } else if (me?.roles.includes('parent')) {
      router.replace('/parent');
    } else if (me?.roles.includes('tutor')) {
      router.replace('/dashboard');
    } else if (me?.roles.includes('student')) {
      router.replace('/student');
    } else {
      router.replace('/get-the-app');
    }
  }

  // Dev-only Super Admin auto-login: skips the manual phone/email OTP
  // flow entirely when running `next dev` locally. Next.js's production
  // build replaces process.env.NODE_ENV with a literal and dead-code-
  // eliminates this whole branch, so none of it — including the request
  // itself — ships in a production bundle. Only fires when no session
  // exists yet, so it never clobbers a manually-completed login (e.g.
  // while testing another account's flow locally).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    void (async () => {
      // A page reload can still have a valid refresh cookie from an
      // earlier dev session — check before firing another auto-login,
      // same intent as the old synchronous localStorage check.
      if (await ensureSession()) return;

      try {
        const tokens = await apiPost<AuthTokens>('/dev/auto-login', {});
        await onAuthenticated(tokens);
      } catch {
        // Dev backend route unavailable (e.g. migrations not run yet on
        // this machine) — fall back to the normal manual login form.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSendOtp() {
    setError(null);
    setLoading(true);
    try {
      await apiPost('/auth/otp/request', { identifier });
      setPhase('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(withRole?: 'tutor' | 'student' | 'parent' | 'academy') {
    setError(null);
    setLoading(true);
    try {
      const tokens = await apiPost<AuthTokens>('/auth/otp/verify', {
        identifier,
        code,
        signupRole: withRole,
        phoneForSignup:
          withRole && kind === 'email' ? `+91${signupPhoneDigits}` : undefined,
      });
      await onAuthenticated(tokens);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && !withRole) {
        setPhase('choose-role');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not verify the code.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setLoading(true);
    try {
      const tokens = await apiPost<AuthTokens>('/auth/google', { idToken });
      await onAuthenticated(tokens);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const win = window as unknown as {
      google?: {
        accounts: {
          id: {
            initialize: (opts: {
              client_id: string;
              callback: (resp: { credential: string }) => void;
            }) => void;
            renderButton: (el: HTMLElement, opts: { theme: string; size: string }) => void;
          };
        };
      };
    };

    if (win.google && googleButtonRef.current) {
      win.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => void handleGoogleCredential(resp.credential),
      });
      win.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const toggleClass = (active: boolean) =>
    `rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring ${
      active
        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200'
        : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
    }`;

  return (
    <Card className="p-7">
      {GOOGLE_CLIENT_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      )}

      {phase === 'identify' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(['phone', 'email'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setKind(option);
                  setError(null);
                }}
                className={toggleClass(kind === option)}
              >
                {option}
              </button>
            ))}
          </div>

          {kind === 'phone' ? (
            <Field label="Phone number" hint="We'll send a code by email.">
              <div className="flex items-center gap-2">
                <span className="flex h-10 items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                  +91
                </span>
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  maxLength={10}
                  autoFocus
                  className="flex-1"
                />
              </div>
            </Field>
          ) : (
            <Field label="Email address" hint="We'll send a code by email.">
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </Field>
          )}

          <Button
            onClick={() => void handleSendOtp()}
            disabled={loading || !identifierReady}
            loading={loading}
          >
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </div>
      )}

      {(phase === 'otp' || phase === 'choose-role') && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Code sent to your email — check spam if you don&apos;t see it within a minute.
          </p>
          <Field label="6-digit code">
            <Input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              autoFocus
              className="text-center text-lg tracking-[0.4em]"
            />
          </Field>

          {phase === 'choose-role' && (
            <>
              <div>
                <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                  New here — are you a tutor, a student, a parent, or an academy?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSignupRole(role)}
                      className={toggleClass(signupRole === role)}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {kind === 'email' && (
                <Field label="Phone number" hint="Required to create your account.">
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                      +91
                    </span>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={signupPhoneDigits}
                      onChange={(e) =>
                        setSignupPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))
                      }
                      placeholder="9876543210"
                      maxLength={10}
                      className="flex-1"
                    />
                  </div>
                </Field>
              )}
            </>
          )}

          <Button
            onClick={() => void handleVerify(phase === 'choose-role' ? signupRole : undefined)}
            disabled={
              loading ||
              code.length !== 6 ||
              (phase === 'choose-role' && kind === 'email' && signupPhoneDigits.length !== 10)
            }
            loading={loading}
          >
            {loading ? 'Checking…' : phase === 'choose-role' ? 'Create account' : 'Continue'}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {GOOGLE_CLIENT_ID && (
        <>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
            <span className="text-xs text-neutral-400 dark:text-neutral-500">or</span>
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div ref={googleButtonRef} className="flex justify-center" />
        </>
      )}
    </Card>
  );
}
