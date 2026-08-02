export const PUSH_PROVIDER = 'PUSH_PROVIDER';

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Blueprint §6: "FCM/APNs behind a notification service". Android
 * delivery is real (see FcmPushProvider); iOS/APNs is a later addition
 * behind this same seam — PushMessage.data is already platform-neutral.
 * Preferences + quiet hours are deliberately out of scope for now.
 */
export interface PushProvider {
  send(messages: PushMessage[]): Promise<void>;
}
