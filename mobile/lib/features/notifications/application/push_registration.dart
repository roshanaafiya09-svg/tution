import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../data/device_api.dart';

final deviceApiProvider = Provider<DeviceApi>(
  (ref) => DeviceApi(ref.watch(apiClientProvider)),
);

/// Requests notification permission, fetches the FCM token, and registers
/// it with the backend. Fire-and-forget from the auth flow — must never
/// throw into the login/restore-session path. A Firebase project is now
/// configured (android/app/google-services.json), but end-to-end delivery
/// is still unverified on a real device — see the mobile FCM audit notes.
///
/// Also listens for token rotation (FCM tokens can change on their own —
/// reinstalls, backup/restore, periodic rotation — not just on first
/// launch) and re-registers the new token the same way. Without this, a
/// rotated token would only ever reach the backend the next time the app
/// happens to call registerDeviceToken() again (e.g. next login), leaving
/// the old, now-invalid token as the only one on file until then.
Future<void> registerDeviceToken(Ref ref) async {
  try {
    await FirebaseMessaging.instance.requestPermission();
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      await ref.read(deviceApiProvider).registerToken(token);
    }
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
      ref.read(deviceApiProvider).registerToken(newToken).catchError((_) {
        // Swallow — same fire-and-forget contract as the initial register.
      });
    });
  } catch (_) {
    // Swallow — push registration failing must never break login.
  }
}

/// Detaches this device's FCM token from the signed-in user on sign-out, so a
/// phone that has logged out stops receiving that user's notifications.
/// Must run BEFORE the auth tokens are cleared (the call is authenticated).
/// Best-effort and bounded: never throws, and never holds sign-out up for
/// more than a few seconds (e.g. Firebase unreachable / offline) — in that
/// case the token simply stays until the next login on this device
/// re-registers it under the new user (the backend upsert reassigns it) or
/// FCM reports it stale.
Future<void> unregisterDeviceToken(Ref ref) async {
  try {
    await () async {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await ref.read(deviceApiProvider).unregisterToken(token);
      }
    }().timeout(const Duration(seconds: 4));
  } catch (_) {
    // Swallow — see above.
  }
}
