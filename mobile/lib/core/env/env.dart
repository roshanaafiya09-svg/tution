import 'package:flutter/foundation.dart';

/// API base URL, overridable at build time with
/// `--dart-define=API_BASE_URL=https://api.example.com`.
///
/// Defaults target the local dev backend (blueprint: NestJS on :3001).
/// The Android emulator can't reach the host's `localhost` directly — it
/// must go through the special `10.0.2.2` alias — so that's the default
/// there; every other target (web, iOS simulator, desktop) reaches the
/// host loopback directly.
abstract final class Env {
  static const _override = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_override.isNotEmpty) return _override;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3001';
    }
    return 'http://localhost:3001';
  }
}
