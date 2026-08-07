import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider } from './otp-provider.interface';

interface WhatsappErrorResponse {
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Sends OTPs via the Meta WhatsApp Business Cloud API (blueprint §4:
 * "WhatsApp OTP (Meta Cloud API) primary"). Requires an approved
 * "authentication" category template in Meta Business Manager — WhatsApp
 * rejects business-initiated messages that aren't a pre-approved
 * template. WHATSAPP_OTP_TEMPLATE_NAME must match that template's name
 * exactly, and its single body variable is the OTP code.
 *
 * Selected automatically by IdentityModule when WHATSAPP_ACCESS_TOKEN
 * and WHATSAPP_PHONE_NUMBER_ID are both set; otherwise ConsoleOtpProvider
 * is used. Error-handling branches below are unit-tested against mocked
 * fetch responses (see the .spec.ts alongside this file) since there's
 * no real Meta Business account in this environment to exercise them
 * against — verify the template's component structure (body-only vs.
 * body + a "copy code" button) against what Meta's console actually
 * approved before relying on this in production.
 */
@Injectable()
export class WhatsAppCloudApiOtpProvider implements OtpProvider {
  readonly channel = 'whatsapp' as const;
  private readonly logger = new Logger('OTP (WhatsApp)');

  constructor(private readonly config: ConfigService) {}

  async send(phoneE164: string, code: string): Promise<void> {
    const accessToken = this.config.getOrThrow<string>('whatsapp.accessToken');
    const phoneNumberId = this.config.getOrThrow<string>(
      'whatsapp.phoneNumberId',
    );
    const templateName = this.config.getOrThrow<string>(
      'whatsapp.templateName',
    );
    const templateLanguage = this.config.getOrThrow<string>(
      'whatsapp.templateLanguage',
    );
    const apiVersion = this.config.getOrThrow<string>('whatsapp.apiVersion');

    // Meta's API wants the number without the leading '+'.
    const to = phoneE164.replace(/^\+/, '');

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: templateName,
              language: { code: templateLanguage },
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }),
        },
      );
    } catch (err) {
      // fetch() itself throws for DNS/connection/timeout failures —
      // distinct from a non-ok HTTP response, and unhandled before this.
      // Never include the access token (it's only ever in the request
      // we sent, never in what we caught here) — just the failure reason.
      this.logger.error(
        `WhatsApp send failed: could not reach graph.facebook.com (${err instanceof Error ? err.message : 'unknown network error'})`,
      );
      throw new ServiceUnavailableException(
        'Could not reach WhatsApp to send the code — try again shortly.',
      );
    }

    if (response.ok) return;

    const body = (await response
      .json()
      .catch(() => ({}))) as WhatsappErrorResponse;
    const metaType = body.error?.type ?? 'unknown';
    const metaMessage = body.error?.message ?? 'unknown error';

    // Server-side diagnostics only ever include Meta's own error payload
    // (type/message) — never the access token, headers, or request body.
    this.logger.error(
      `WhatsApp send failed (HTTP ${response.status}, type ${metaType}): ${metaMessage}`,
    );

    if (response.status === 429) {
      // Meta's WhatsApp Business Account throttles at the account level,
      // not per-caller — OtpService's own per-phone-number limiter is a
      // separate, tighter check that already ran before we got here. A
      // 429 from Meta means the account itself is at its send-rate cap,
      // not that this particular user asked too often.
      throw new ServiceUnavailableException(
        'OTP delivery is busy right now — try again in a moment.',
      );
    }

    if (response.status === 401 || metaType === 'OAuthException') {
      // Expired/invalid/revoked access token — an operator-configuration
      // problem, never something the caller can retry their way past.
      throw new ServiceUnavailableException(
        'OTP delivery is temporarily unavailable.',
      );
    }

    if (metaMessage.toLowerCase().includes('template')) {
      // Missing/unapproved/paused template, or a parameter mismatch
      // against what Meta's console actually approved.
      throw new ServiceUnavailableException(
        'OTP delivery is temporarily unavailable.',
      );
    }

    throw new InternalServerErrorException('Failed to send OTP via WhatsApp');
  }
}
