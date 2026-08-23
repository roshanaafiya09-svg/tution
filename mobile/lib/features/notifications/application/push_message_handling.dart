import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/router/app_router.dart';

/// Attached to [MaterialApp.router] in app.dart so the foreground handler
/// below (registered in main.dart, outside the widget tree) can show a
/// banner without needing a BuildContext of its own.
final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// Wires up what happens when a push notification arrives or is tapped, for
/// all three app states:
///  - Foreground: FCM does NOT surface a system-tray notification while the
///    app is open (that's normal Android/Firebase behaviour, not a bug) —
///    so without this, a push sent while a student has Scholar open would
///    silently go nowhere. Shown here as an in-app banner instead, using
///    Flutter's own SnackBar rather than a new notifications package.
///  - Background: the OS/Firebase SDK already shows a real system
///    notification with no app code needed — untouched here, just routes
///    the resulting tap.
///  - Terminated: same as background for display; [getInitialMessage]
///    covers the tap that relaunched the app.
///
/// Routing is deliberately generic (always `/today`, the app's one
/// signed-in landing route — see app_router.dart) rather than deep-linking
/// into a specific batch/assignment/thread: those aren't separate
/// go_router routes today, so there's nowhere more specific to send a tap
/// safely. `container` (a `ProviderContainer` created in main.dart, not the
/// widget tree's own) is what lets this run before/outside any widget.
void setupPushMessageHandling(ProviderContainer container) {
  FirebaseMessaging.onMessage.listen(_showForegroundBanner);

  FirebaseMessaging.onMessageOpenedApp.listen((_) => _openToday(container));

  // A tap that cold-started the app (terminated -> foreground) doesn't fire
  // onMessageOpenedApp — this is the one-time equivalent for that path.
  // Note this is effectively a no-op today: a freshly-started, signed-in
  // session already lands on /today via app_router.dart's own redirect
  // logic. Wiring it explicitly anyway keeps intent obvious for whoever
  // adds real per-type deep links later, and covers the signed-out case
  // (no-op there too, since the redirect sends them to /login regardless).
  FirebaseMessaging.instance.getInitialMessage().then((message) {
    if (message != null) _openToday(container);
  });
}

void _showForegroundBanner(RemoteMessage message) {
  final title = message.notification?.title;
  final body = message.notification?.body;
  if (title == null && body == null) return;

  final messenger = scaffoldMessengerKey.currentState;
  if (messenger == null) return;

  messenger.showSnackBar(
    SnackBar(
      content: Text([title, body].whereType<String>().join(' — ')),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 4),
    ),
  );
}

void _openToday(ProviderContainer container) {
  container.read(routerProvider).go('/today');
}
