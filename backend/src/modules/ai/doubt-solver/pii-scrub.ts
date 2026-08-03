/**
 * Blueprint §8 guardrail: "PII scrubbed pre-call." Regex redaction of
 * the obvious, high-confidence PII shapes (phone numbers, emails) in a
 * student's question before it's ever sent to the AI provider — not a
 * general PII classifier, just the categories a student is realistically
 * likely to paste into a doubt-solver question (their own or someone
 * else's contact info) and that are safe to redact without false-
 * positiving on legitimate math/science content (numbers, symbols).
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// India-shaped phone numbers: optional +91, then 10 digits, optionally
// spaced/hyphenated in groups — deliberately not a bare \d{10}+ so it
// doesn't eat long numeric answers/IDs from a math or physics question.
const PHONE_PATTERN = /(?:\+?91[-\s]?)?[6-9]\d{4}[-\s]?\d{5}\b/g;

export function scrubPii(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[redacted email]')
    .replace(PHONE_PATTERN, '[redacted phone]');
}
