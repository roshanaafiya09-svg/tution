'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { apiPost, tokenStore, ApiError } from '@/lib/api';
import { Button, Field, inputClass } from '@/components/ui';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type Phase = 'phone' | 'otp' | 'choose-role';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');

  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [signupRole, setSignupRole] = useState<'tutor' | 'student'>('tutor');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  function onAuthenticated(tokens: AuthTokens, roles?: string[]) {
    tokenStore.set(tokens.accessToken, tokens.refreshToken);
    if (next) {
      router.replace(next);
      return;
    }
    // Students have no web dashboard in Phase 1 — the mobile app is
    // their surface, so send them somewhere that makes sense on web.
    router.replace(roles?.includes('tutor') === false ? '/' : '/dashboard');
  }

  async function handleSendOtp() {
    setError(null);
    setLoading(true);
    try {
      await apiPost('/auth/otp/request', { phoneE164: phone });
      setPhase('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(withRole?: 'tutor' | 'student') {
    setError(null);
    setLoading(true);
    try {
      const tokens = await apiPost<AuthTokens>('/auth/otp/verify', {
        phoneE164: phone,
        code,
        signupRole: withRole,
      });
      onAuthenticated(tokens, withRole ? [withRole] : undefined);
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
      onAuthenticated(tokens);
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

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      {GOOGLE_CLIENT_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      )}

      {phase === 'phone' && (
        <div className="flex flex-col gap-4">
          <Field label="Phone number" hint="We'll send a code on WhatsApp.">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className={inputClass}
            />
          </Field>
          <Button onClick={() => void handleSendOtp()} disabled={loading || phone.length < 8}>
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </div>
      )}

      {(phase === 'otp' || phase === 'choose-role') && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500">
            Code sent to <span className="font-medium text-neutral-800">{phone}</span>.
          </p>
          <Field label="6-digit code">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              className={`${inputClass} tracking-[0.3em]`}
            />
          </Field>

          {phase === 'choose-role' && (
            <div>
              <p className="mb-2 text-sm text-neutral-500">
                New here — are you signing up as a tutor or a student?
              </p>
              <div className="flex gap-2">
                {(['tutor', 'student'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setSignupRole(role)}
                    className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                      signupRole === role
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={() => void handleVerify(phase === 'choose-role' ? signupRole : undefined)}
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Checking…' : phase === 'choose-role' ? 'Create account' : 'Continue'}
          </Button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      {GOOGLE_CLIENT_ID && (
        <>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-400">or</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>
          <div ref={googleButtonRef} />
        </>
      )}
    </div>
  );
}
