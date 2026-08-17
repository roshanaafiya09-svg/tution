import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GstinVerificationResult,
  KycProvider,
  PanVerificationResult,
} from './kyc-provider.interface';

/** Thrown when Setu couldn't be reached or returned something outside
 *  its documented success/failure envelope — distinct from a normal
 *  "PAN not found" result, which is a real answer, not an error. The
 *  service layer catches this and routes to needs_manual_review rather
 *  than letting it surface as a raw 500. */
export class KycProviderUnavailableError extends Error {}

const SANDBOX_BASE_URL = 'https://dg-sandbox.setu.co';
const PRODUCTION_BASE_URL = 'https://dg.setu.co';

interface SetuErrorBody {
  message?: string;
}

interface SetuPanResponse {
  verification?: 'success' | 'failed';
  message?: string;
  data?: {
    full_name?: string;
  };
}

interface SetuGstinResponse {
  success?: boolean;
  data?: {
    // Field names beyond gstin/legal name are not fully confirmed
    // against Setu's live API reference (not accessible without a
    // Bridge console login) — parsed defensively across the common
    // naming variants seen across India GST-verification APIs rather
    // than asserting one exact shape. Verify against Setu's actual
    // response the first time a real GSTIN is checked, and tighten
    // this if the real field names differ.
    gstin_status?: string;
    status?: string;
    legalName?: string;
    lgnm?: string;
    tradeName?: string;
    tradeNam?: string;
  };
  message?: string;
}

/**
 * Selected by AcademyVerificationModule's factory once SETU_CLIENT_ID/
 * SECRET are set. PAN and GSTIN verification are synchronous REST
 * calls (not the async, webhook-driven shape Aadhaar/DigiLocker would
 * need) — see the Academy Identity Verification research report for
 * why DigiLocker is deferred to a later phase.
 *
 * Auth is static x-client-id/x-client-secret/x-product-instance-id
 * headers (confirmed from Setu's own quickstart docs), not a signed
 * JWT — simpler than payments-style HMAC, but still never logged.
 */
@Injectable()
export class SetuKycProvider implements KycProvider {
  readonly name = 'setu';
  private readonly logger = new Logger('KYC (Setu)');

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('app.nodeEnv') === 'production'
      ? PRODUCTION_BASE_URL
      : SANDBOX_BASE_URL;
  }

  async verifyPan(pan: string, reason: string): Promise<PanVerificationResult> {
    const productInstanceId = this.config.getOrThrow<string>(
      'setu.panProductInstanceId',
    );
    const body = await this.call<SetuPanResponse>(
      '/api/verify/pan',
      productInstanceId,
      { pan, consent: 'Y', reason },
    );

    const verified = body.verification === 'success';
    return {
      verified,
      fullName: body.data?.full_name ?? null,
      resultCode: body.message ?? (verified ? 'verified' : 'not_found'),
    };
  }

  async verifyGstin(gstin: string): Promise<GstinVerificationResult> {
    const productInstanceId = this.config.getOrThrow<string>(
      'setu.gstinProductInstanceId',
    );
    const body = await this.call<SetuGstinResponse>(
      '/api/verify/gstin',
      productInstanceId,
      { gstin },
    );

    const statusValue = body.data?.gstin_status ?? body.data?.status;
    const active =
      typeof statusValue === 'string' && statusValue.toLowerCase() === 'active';
    return {
      verified: body.success === true,
      active,
      legalName:
        body.data?.legalName ??
        body.data?.lgnm ??
        body.data?.tradeName ??
        body.data?.tradeNam ??
        null,
      resultCode: body.message ?? (body.success ? 'verified' : 'not_found'),
    };
  }

  private async call<T>(
    path: string,
    productInstanceId: string,
    payload: Record<string, string>,
  ): Promise<T> {
    const clientId = this.config.getOrThrow<string>('setu.clientId');
    const clientSecret = this.config.getOrThrow<string>('setu.clientSecret');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientId,
          'x-client-secret': clientSecret,
          'x-product-instance-id': productInstanceId,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Never include clientSecret here — only ever sent in a header,
      // never part of what fetch() throws or what we log.
      this.logger.error(
        `Setu request to ${path} failed: could not reach Setu (${err instanceof Error ? err.message : 'unknown network error'})`,
      );
      throw new KycProviderUnavailableError('Could not reach Setu');
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as SetuErrorBody;
      this.logger.error(
        `Setu request to ${path} failed (HTTP ${response.status}): ${body.message ?? 'unknown error'}`,
      );
      // A 4xx here (bad PAN/GSTIN format, unrecognized identifier) is
      // still "Setu couldn't be reached with a usable answer" from the
      // caller's point of view — the service treats this the same as
      // a network failure, not as a confirmed-invalid result, since
      // Setu's own success/failure envelope (checked above) is what
      // actually distinguishes those.
      throw new KycProviderUnavailableError(
        `Setu returned HTTP ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }
}
