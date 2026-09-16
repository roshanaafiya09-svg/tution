export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

export interface WhatsAppMessage {
  userId: string;
  title: string;
  body: string;
}

/**
 * Holiday & Teacher Leave Management feature: every holiday/leave/
 * reminder notification is designed to go out over WhatsApp as well as
 * in-app + push, but this codebase has no WhatsApp integration and a
 * repo doc (email-otp-migration-plan.md) explicitly says not to add
 * one — so only a logging no-op provider (ConsoleWhatsAppProvider) ships
 * here. Real delivery later is a second WhatsAppProvider implementation
 * (Meta Cloud API, same shape the old superseded WhatsApp OTP provider
 * used) selected by notifications.module.ts's factory, exactly like
 * FcmPushProvider is today — zero change to this interface or to any
 * caller of NotificationsService.notify().
 */
export interface WhatsAppProvider {
  send(messages: WhatsAppMessage[]): Promise<void>;
}
