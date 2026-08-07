'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import posthog from 'posthog-js';
import { api, apiPost, apiGetPublic, tokenStore, ApiError } from '@/lib/api';
import { Button, Field, Input, InlineError, Card } from '@/components/ui';
import type { Me } from '@/lib/types';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type Phase = 'identify' | 'connect-telegram' | 'otp' | 'choose-role';
type IdentifierKind = 'phone' | 'email';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const ROLES = ['tutor', 'student', 'parent'] as const;
const TELEGRAM_POLL_MS = 2000;

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
  const next = searchParams.get('next');

  const [phase, setPhase] = useState<Phase>('identify');
  const [kind, setKind] = useState<IdentifierKind>('phone');
  // Only the 10 local digits live in state — +91 is fixed and rendered
  // separately, so it's structurally impossible to submit a phone that's
  // missing or has mangled the country code.
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');
  // Signing up with an email still needs a phone (users.phone_e164 is
  // NOT NULL) — collected on the role step, only in that case.
  const [signupPhoneDigits, setSignupPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [signupRole, setSignupRole] = useState<'tutor' | 'student' | 'parent'>('tutor');
  const [telegramLink, setTelegramLink] = useState<{ token: string; deepLink: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const identifier = kind === 'phone' ? `+91${phoneDigits}` : email.trim();
  const identifierReady = kind === 'phone' ? phoneDigits.length === 10 : email.includes('@');

  async function onAuthenticated(tokens: AuthTokens) {
    tokenStore.set(tokens.accessToken, tokens.refreshToken);
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
    // Students have no web dashboard — the mobile app is their surface,
    // so send them somewhere that makes sense on web. Tutors and parents
    // each get their own portal.
    const me = await api.get<Me>('/auth/me').catch(() => null);
    if (me?.roles.includes('parent')) {
      router.replace('/parent');
    } else if (me?.roles.includes('tutor')) {
      router.replace('/dashboard');
    } else {
      router.replace('/');
    }
  }

  /** Shared by the initial submit and the post-linking retry. Returns
   *  true once a code is actually on its way. */
  const sendOtp = useCallback(async (): Promise<boolean> => {
    try {
      await apiPost('/auth/otp/request', { identifier });
      setPhase('otp');
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.telegramLinkRequired) {
        // No Telegram chat on file. Ask the backend to start a link —
        // it refuses (409) for an account that already exists but was
        // created before Telegram sign-in, which can't self-link safely.
        try {
          const link = await apiPost<{ token: string; deepLink: string }>(
            '/auth/telegram/link/start',
            { identifier },
          );
          setTelegramLink(link);
          setPhase('connect-telegram');
        } catch (linkErr) {
          setError(
            linkErr instanceof ApiError ? linkErr.message : 'Could not start Telegram sign-in.',
          );
        }
        return false;
      }
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
      return false;
    }
  }, [identifier]);

  async function handleSendOtp() {
    setError(null);
    setLoading(true);
    await sendOtp();
    setLoading(false);
  }

  // While the user is off in Telegram pressing Start, poll for the link
  // completing, then send the code automatically so they come back to a
  // code prompt rather than having to re-submit.
  useEffect(() => {
    if (phase !== 'connect-telegram' || !telegramLink) return;

    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const { linked } = await apiGetPublic<{ linked: boolean }>(
            `/auth/telegram/link/${telegramLink.token}/status`,
          );
          if (linked && !cancelled) {
            clearInterval(timer);
            await sendOtp();
          }
        } catch {
          // Transient poll failure — the next tick retries.
        }
      })();
    }, TELEGRAM_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, telegramLink, sendOtp]);

  async function handleVerify(withRole?: 'tutor' | 'student' | 'parent') {
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
            <Field label="Phone number" hint="We'll send a code on Telegram.">
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
            <Field label="Email address" hint="We'll send a code on Telegram.">
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

      {phase === 'connect-telegram' && telegramLink && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
              Connect Telegram
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Open our bot and press{' '}
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Start</span>,
              then tap the button it shows you to confirm your number — that's how we know it's
              really you. We&apos;ll send your code here automatically once that's done.
            </p>
          </div>

          <a
            href={telegramLink.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            Open Telegram
          </a>

          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Waiting for you to finish connecting…
          </p>

          <button
            type="button"
            onClick={() => {
              setTelegramLink(null);
              setError(null);
              setPhase('identify');
            }}
            className="text-sm text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Back
          </button>
        </div>
      )}

      {(phase === 'otp' || phase === 'choose-role') && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Code sent to{' '}
            <span className="font-medium text-neutral-800 dark:text-neutral-100">
              {identifier}
            </span>{' '}
            on Telegram.
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
                  New here — are you a tutor, a student, or a parent?
                </p>
                <div className="grid grid-cols-3 gap-2">
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
