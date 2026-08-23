import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'app.dart';
import 'core/analytics/analytics.dart';
import 'core/env/env.dart';
import 'features/notifications/application/push_message_handling.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // A real Firebase project (android/app/google-services.json) is
  // configured, but this stays try/catch: a local dev checkout without
  // that file (or without google-services.json ever reaching a machine)
  // must still boot — push registration and message handling both degrade
  // to a no-op via their own guards when Firebase isn't actually available.
  var firebaseReady = false;
  try {
    await Firebase.initializeApp();
    firebaseReady = true;
  } catch (_) {
    // Swallow: see above.
  }

  await Analytics.setup();

  // A ProviderContainer of our own, rather than letting ProviderScope
  // create one implicitly, so setupPushMessageHandling below (registered
  // before runApp, i.e. outside any widget's BuildContext) can still read
  // routerProvider to act on a notification tap. TuitionApp is then
  // wrapped in UncontrolledProviderScope over this same container instead
  // of creating a second one.
  final container = ProviderContainer();
  if (firebaseReady) {
    setupPushMessageHandling(container);
  }

  Future<void> bootstrap() async {
    runApp(UncontrolledProviderScope(container: container, child: const TuitionApp()));
  }

  if (Env.sentryDsn.isNotEmpty) {
    await SentryFlutter.init((options) {
      options.dsn = Env.sentryDsn;
    }, appRunner: bootstrap);
  } else {
    // No DSN configured (local dev default) — boot without Sentry.
    await bootstrap();
  }
}
