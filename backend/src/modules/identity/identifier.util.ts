export type IdentifierType = 'phone' | 'email';

/**
 * A login identifier is either an E.164 phone number or an email
 * address. '@' is the discriminator: it's valid in an email local-part
 * and impossible in E.164, so no ambiguity exists. Both DTO validation
 * (see request-otp.dto.ts) and this classifier see the same raw string,
 * so a value that reaches here has already been shape-checked as one or
 * the other.
 */
export function identifierType(identifier: string): IdentifierType {
  return identifier.includes('@') ? 'email' : 'phone';
}

/**
 * Emails are case-insensitive in practice, and Redis OTP keys plus the
 * `users.email` unique index are both case-*sensitive* — so
 * "User@x.com" and "user@x.com" would otherwise be two distinct
 * accounts/challenges for what a person considers one address. Phone
 * numbers are left exactly as given (E.164 has no case).
 */
export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return identifierType(trimmed) === 'email' ? trimmed.toLowerCase() : trimmed;
}
