import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../data/device_api.dart';

final deviceApiProvider = Provider<DeviceApi>(
  (ref) => DeviceApi(ref.watch(apiClientProvider)),
);

/// Requests notification permission, fetches the FCM token, and registers
/// it with the backend. Fire-and-forget from the auth flow — must never
/// throw into the login/restore-session path (no Firebase project is
/// configured until the Milestone 17 manual handoff lands, so this is a
/// no-op until then).
Future<void> registerDeviceToken(Ref ref) async {
  try {
    await FirebaseMessaging.instance.requestPermission();
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    await ref.read(deviceApiProvider).registerToken(token);
  } catch (_) {
    // Swallow — push registration failing must never break login.
  }
}
