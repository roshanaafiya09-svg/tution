export const KYC_PROVIDER = 'KYC_PROVIDER';

export interface PanVerificationResult {
  verified: boolean;
  /** The name Setu's own records associate with the PAN — compared
   *  against nothing automatically today (no owner-supplied name to
   *  match against yet); surfaced to a human reviewer instead. */
  fullName: string | null;
  /** Provider-specific code/message for the audit trail and, when
   *  verification fails, the reason surfaced to the owner. */
  resultCode: string;
}

export interface GstinVerificationResult {
  verified: boolean;
  active: boolean;
  legalName: string | null;
  resultCode: string;
}

/**
 * Provider-agnostic contract (mirrors PaymentsProvider's shape) so the
 * concrete KYC vendor can change later without touching
 * AcademyVerificationService. PAN and GSTIN are synchronous lookups —
 * no webhook in this phase; DigiLocker/Aadhaar (async, webhook-driven)
 * is explicitly deferred, see the Academy Identity Verification
 * research report.
 */
export interface KycProvider {
  readonly name: string;

  /** `reason` is Setu's required "why are you checking this PAN"
   *  disclosure string (their API enforces a minimum length) — an
   *  internal audit string, not something the caller supplies. */
  verifyPan(pan: string, reason: string): Promise<PanVerificationResult>;

  verifyGstin(gstin: string): Promise<GstinVerificationResult>;
}
