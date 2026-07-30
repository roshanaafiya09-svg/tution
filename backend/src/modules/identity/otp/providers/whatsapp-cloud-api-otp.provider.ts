import {
  Injectable,
  InternalServerErrorException,
  Logger,
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
 * is used. Not exercised end-to-end in this environment — there's no
 * Meta Business/WhatsApp Business Platform account to test against — so
 * verify the template's component structure (body-only vs. body + a
 * "copy code" button) against what Meta's console actually approved
 * before relying on this in production.
 */
@Injectable()
export class WhatsAppCloudApiOtpProvider implements OtpProvider {
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

    const response = await fetch(
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

    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({}))) as WhatsappErrorResponse;
      this.logger.error(
        `WhatsApp send failed (${response.status}): ${body.error?.message ?? 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to send OTP via WhatsApp');
    }
  }
}
