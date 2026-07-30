export const PUSH_PROVIDER = 'PUSH_PROVIDER';

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Blueprint §6: "FCM/APNs behind a notification service (preferences +
 * quiet hours)". Device-token registration lands with the mobile app;
 * this interface is the seam so the in-app notification path can ship
 * and be used now.
 */
export interface PushProvider {
  send(messages: PushMessage[]): Promise<void>;
}
