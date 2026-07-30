'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { apiGet, apiPost, ApiError } from '@/lib/api';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface Me {
  id: string;
  roles: string[];
  phoneE164: string;
  locale: string;
}

type Phase = 'phone' | 'otp' | 'choose-role' | 'authenticated';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function LoginForm() {
  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [signupRole, setSignupRole] = useState<'tutor' | 'student'>('tutor');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  async function loadMe(accessToken: string) {
    const record = await apiGet<Me>('/auth/me', accessToken);
    setMe(record);
    setPhase('authenticated');
  }

  async function handleSendOtp() {
    setError(null);
    setLoading(true);
    try {
      await apiPost('/auth/otp/request', { phoneE164: phone });
      setPhase('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send OTP.');
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
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      await loadMe(tokens.accessToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && !withRole) {
        // No account yet — ask which role, then retry with it.
        setPhase('choose-role');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not verify OTP.');
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
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      await loadMe(tokens.accessToken);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Google sign-in failed.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || phase === 'authenticated') return;

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

  if (phase === 'authenticated' && me) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Signed in as</p>
        <p className="mt-1 font-semibold text-neutral-900">{me.phoneE164}</p>
        <p className="mt-1 text-sm text-neutral-600">Roles: {me.roles.join(', ')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      {GOOGLE_CLIENT_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      )}

      {phase === 'phone' && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-700">Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <button
            onClick={() => void handleSendOtp()}
            disabled={loading}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
        </div>
      )}

      {(phase === 'otp' || phase === 'choose-role') && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-500">
            Code sent to <span className="font-medium text-neutral-800">{phone}</span>. In dev,
            check the backend server log for the code.
          </p>
          <label className="text-sm font-medium text-neutral-700">6-digit code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />

          {phase === 'choose-role' && (
            <div>
              <p className="mb-2 text-sm text-neutral-500">
                No account yet for this number — sign up as:
              </p>
              <div className="flex gap-2">
                {(['tutor', 'student'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setSignupRole(role)}
                    className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                      signupRole === role
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-neutral-300 text-neutral-600'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => void handleVerify(phase === 'choose-role' ? signupRole : undefined)}
            disabled={loading || code.length !== 6}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Verifying…' : phase === 'choose-role' ? 'Create account' : 'Verify'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs text-neutral-400">or</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      {GOOGLE_CLIENT_ID ? (
        <div ref={googleButtonRef} />
      ) : (
        <p className="text-xs text-neutral-400">
          Google Sign-In isn&apos;t configured on this deployment.
        </p>
      )}
    </div>
  );
}
