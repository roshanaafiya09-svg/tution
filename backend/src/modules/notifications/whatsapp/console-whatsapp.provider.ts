import { Injectable, Logger } from '@nestjs/common';
import {
  WhatsAppMessage,
  WhatsAppProvider,
} from './whatsapp-provider.interface';

/**
 * Logs instead of sending — see WhatsAppProvider's doc comment. Real
 * delivery needs a Meta WhatsApp Business Cloud API integration
 * (access token, phone number id, pre-approved message templates),
 * none of which exist in this environment yet.
 */
@Injectable()
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('WhatsApp (dev)');

  send(messages: WhatsAppMessage[]): Promise<void> {
    for (const message of messages) {
      this.logger.log(
        `-> ${message.userId}: ${message.title} — ${message.body}`,
      );
    }
    return Promise.resolve();
  }
}
