# Scholar (tution repo) --- Auth Migration

## Telegram OTP → Gmail Email OTP

**Repo:** https://github.com/roshanaafiya09-svg/tution.git\
**Deployed:** Web on Vercel (https://tution-xi-eosin.vercel.app/),
backend on Render + Neon Postgres + Upstash Redis.\
**Scope:** India only. Do NOT add SMS, WhatsApp, or
global/multi-currency changes. Razorpay stays deferred --- keep the
existing mock payment provider untouched.

## Goal

Replace Telegram-only OTP delivery with email OTP via Gmail SMTP
(Nodemailer). Email becomes the primary login identifier. The "connect
Telegram" gate must be fully removed from the user flow. All three roles
(tutor, student, parent) log in the same way: enter email → receive
6-digit code by email → enter code → in.

Important context: an EmailOtpProvider (Nodemailer/SMTP) previously
existed in this repo and was deleted during the Telegram rearchitecture
(see handover.md §5, "Auth rearchitected to phone-or-email login,
Telegram-only delivery"). Check git log for the deletion commit and
restore/adapt it rather than writing from scratch if it's cleaner. The
OTP core (hashing, TTL, rate limits, Redis storage in OtpRepository /
OtpService) is already generalized to a string identifier --- do not
change those constants or semantics.

## Backend changes (backend/)

1.  Restore/create EmailOtpProvider in
    `src/modules/identity/otp/providers/`:

    -   Implements the existing OtpProvider interface
        (`channel: 'email'` --- extend OtpChannel type).
    -   Uses Nodemailer over SMTP with env vars: `SMTP_HOST`,
        `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
    -   Plain-text email, code visible in the subject line,
        e.g. `subject: Your Scholar login code: 482913`, short plain
        body with the code and a 10-minute validity note. No
        images/heavy HTML (better Gmail deliverability + code readable
        from the notification).

2.  Provider selection in IdentityModule: factory picks EmailOtpProvider
    when SMTP env vars are set, else falls back to ConsoleOtpProvider
    (keep the zero-credential dev fallback exactly as it works today).
    Remove TelegramOtpProvider from the factory. Do not delete the
    Telegram linking subsystem files (TelegramLinkRepository /
    TelegramLinkService / TelegramUpdatesPoller) --- just
    unregister/disable them so they are dead code; deletion can happen
    later.

3.  Remove the Telegram gate: `POST /auth/otp/request` must no longer
    return `403 telegramLinkRequired`. An identifier with a known email
    (or an email used directly as the identifier) gets a code sent to
    that email, full stop.

4.  Email as required identifier:

    -   Login: identifier is the email address. Phone login may remain
        if trivial (send the code to the account's email), but email is
        the primary path.
    -   Signup: email is required. Keep `users.phone_e164 NOT NULL` and
        keep collecting a +91 phone at signup (India-only scope --- do
        not build a country picker), but authentication is keyed on
        email.
    -   Migration 0026's unique index on `users.email` already makes
        email safe as a login key; if any live rows lack email, handle
        via the existing partial-index approach --- do not break
        existing rows.

5.  `POST /auth/contact` already sets email --- verify it still works;
    it must no longer reference Telegram chat IDs anywhere
    user-reachable.

6.  Unlock pre-existing accounts: the \~20 pre-existing accounts (and
    the Super Admin) were locked out only by the Telegram-linking rule.
    With email OTP they must be able to log in once an email is on file.
    Ensure the Super Admin account's email is set (migration 0028
    matches by email/phone) and that its login works via email OTP.

7.  Keep the existing OTP rate limiter and the global throttler
    untouched.

## Web frontend changes (web/)

1.  Login form (`src/app/login/login-form.tsx`):

    -   Default the identifier toggle to email (keep phone toggle only
        if the backend keeps phone→email delivery; otherwise remove it).
    -   Delete the connect-telegram phase, the deep-link UI, and the
        polling useEffect entirely.
    -   After sending, show "Code sent to your email --- check spam if
        you don't see it within a minute."
    -   Keep the existing choose-role signup step and Google sign-in
        wiring (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`-gated) as-is.

2.  Student post-login dead end: after OTP verification, a student
    currently gets `router.replace('/')` (the marketing homepage).
    Replace with a simple `/get-the-app` page: "Scholar for students is
    a mobile app" + placeholder download buttons + their login worked
    confirmation. Tutors → `/dashboard`, parents → `/parent`, superadmin
    → `/dashboard` --- unchanged.

3.  Landing page copy (`src/app/page.tsx`): replace the "Sign in with
    Telegram" feature card with an email-OTP equivalent ("Sign in with
    your email --- a one-time code, no password to forget").

## Mobile changes (mobile/, Flutter)

1.  Update the login screen to the same email-OTP flow: email field →
    code field. Remove any Telegram linking UI/strings.
2.  Keep everything else (parent-invite code generation in Settings,
    etc.) untouched.
3.  Run `flutter analyze` clean; do not attempt visual verification if
    the environment can't render Flutter.

## Out of scope --- do not touch

-   Razorpay / payments / payouts / subscriptions (mock provider stays;
    trial enforcement logic stays).
-   SMS, WhatsApp, or any non-email OTP channel.
-   Country-code picker, multi-currency, i18n beyond what exists.
-   Marketplace, AI modules, messaging, notifications.

## Verification checklist (do all of these)

-   Backend: `nest build` clean, existing tests pass; add/adapt a unit
    test for EmailOtpProvider mirroring `telegram-otp.provider.spec.ts`.
-   With SMTP env vars unset locally, ConsoleOtpProvider still logs
    codes and the full signup/login flow works for all three roles
    against the local stack.
-   Web: `tsc --noEmit` and full `next build` clean; browser-test
    signup + login for tutor, student (lands on `/get-the-app`), and
    parent.
-   Confirm `POST /auth/otp/request` never returns
    `telegramLinkRequired` on any path.
-   Update `handover.md` §5/§6 to reflect the new auth state (email OTP
    live, Telegram disabled, locked-out accounts resolved).

## Environment variables (set by the owner, listed here for reference)

``` text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=<the new app Gmail address>
SMTP_PASS=<16-char Google App Password>
SMTP_FROM="Scholar <the new app Gmail address>"
```
