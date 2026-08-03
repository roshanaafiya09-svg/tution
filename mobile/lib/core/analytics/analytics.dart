import 'package:posthog_flutter/posthog_flutter.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../env/env.dart';

/// Thin wrapper around PostHog (product analytics) and Sentry's user-scope
/// API. A no-op wherever the corresponding dart-define
/// (`Env.posthogApiKey` / `Env.sentryDsn`) is unset, mirroring the backend
/// `AnalyticsModule`'s env-gated provider pattern — callers never need to
/// check config themselves, and calls must never throw into the auth flow.
abstract final class Analytics {
  /// Must be awaited before `runApp` so early screen views/events aren't
  /// dropped. A no-op when `Env.posthogApiKey` is unset.
  static Future<void> setup() async {
    if (Env.posthogApiKey.isEmpty) return;
    try {
      final config = PostHogConfig(Env.posthogApiKey)..host = Env.posthogHost;
      await Posthog().setup(config);
    } catch (_) {
      // Swallow — analytics setup failing must never block app startup.
    }
  }

  /// Associates future events with [userId] on both PostHog and Sentry.
  static Future<void> identify(String userId) async {
    try {
      if (Env.posthogApiKey.isNotEmpty) {
        await Posthog().identify(userId: userId);
      }
      if (Env.sentryDsn.isNotEmpty) {
        Sentry.configureScope(
          (scope) => scope.setUser(SentryUser(id: userId)),
        );
      }
    } catch (_) {
      // Swallow — identify failing must never break sign-in.
    }
  }

  static Future<void> capture(
    String event, [
    Map<String, Object>? properties,
  ]) async {
    if (Env.posthogApiKey.isEmpty) return;
    try {
      await Posthog().capture(eventName: event, properties: properties);
    } catch (_) {
      // Swallow — a dropped analytics event must never break the caller.
    }
  }

  /// Clears identity on sign-out — must run before the next sign-in's
  /// [identify] to avoid merging distinct users under one distinct id.
  static Future<void> reset() async {
    try {
      if (Env.posthogApiKey.isNotEmpty) {
        await Posthog().reset();
      }
      if (Env.sentryDsn.isNotEmpty) {
        Sentry.configureScope((scope) => scope.setUser(null));
      }
    } catch (_) {
      // Swallow — reset failing must never break sign-out.
    }
  }
}
