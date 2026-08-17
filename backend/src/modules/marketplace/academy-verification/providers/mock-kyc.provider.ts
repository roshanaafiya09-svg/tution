import { Injectable, Logger } from '@nestjs/common';
import type {
  GstinVerificationResult,
  KycProvider,
  PanVerificationResult,
} from './kyc-provider.interface';

const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;

/**
 * Selected when SETU_CLIENT_ID/SECRET are unset — same "working
 * stand-in, not an error" shape as MockPaymentsProvider/MockAiProvider.
 * Deterministic on format alone (well-formed PAN/GSTIN "verifies",
 * malformed doesn't) so the state machine — including the
 * needs_manual_review path a genuinely ambiguous provider result would
 * take — is fully exercisable without real Setu credentials.
 */
@Injectable()
export class MockKycProvider implements KycProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('KYC (mock)');

  verifyPan(pan: string): Promise<PanVerificationResult> {
    const verified = PAN_FORMAT.test(pan);
    this.logger.warn(
      `Simulated PAN check for ${pan} — SETU_CLIENT_ID unset, not a real verification (result: ${verified ? 'verified' : 'not_found'})`,
    );
    return Promise.resolve({
      verified,
      fullName: verified ? 'Mock Verified Owner' : null,
      resultCode: verified ? 'verified' : 'not_found',
    });
  }

  verifyGstin(gstin: string): Promise<GstinVerificationResult> {
    const verified = GSTIN_FORMAT.test(gstin);
    this.logger.warn(
      `Simulated GSTIN check for ${gstin} — SETU_CLIENT_ID unset, not a real verification (result: ${verified ? 'verified' : 'not_found'})`,
    );
    return Promise.resolve({
      verified,
      active: verified,
      legalName: verified ? 'Mock Verified Academy Pvt Ltd' : null,
      resultCode: verified ? 'verified' : 'not_found',
    });
  }
}
