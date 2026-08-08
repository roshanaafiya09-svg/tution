import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/analytics/analytics.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/providers.dart';
import '../../notifications/application/push_registration.dart';
import '../data/auth_api.dart';
import '../data/auth_models.dart';
import 'auth_state.dart';

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(apiClientProvider)),
);

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    _restoreSession();
    return const AuthState();
  }

  AuthApi get _api => ref.read(authApiProvider);

  /// Startup check: a stored access token (even if expired — ApiClient
  /// silently refreshes it) means the session survives an app restart.
  Future<void> _restoreSession() async {
    final storedToken = await ref
        .read(tokenStorageProvider)
        .readAccessToken();
    if (storedToken == null) {
      state = state.copyWith(status: AuthStatus.signedOut);
      return;
    }
    try {
      final user = await _api.me();
      state = state.copyWith(status: AuthStatus.signedIn, user: user);
      unawaited(registerDeviceToken(ref));
      unawaited(Analytics.identify(user.id));
    } on ApiException {
      await ref.read(tokenStorageProvider).clear();
      state = state.copyWith(status: AuthStatus.signedOut);
    }
  }

  Future<void> requestOtp(String identifier) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      await _api.requestOtp(identifier);
      state = state.copyWith(
        status: AuthStatus.otpRequested,
        identifier: identifier,
        isSubmitting: false,
      );
    } on ApiException catch (e) {
      state = state.copyWith(error: e.message, isSubmitting: false);
    }
  }

  Future<void> verifyOtp(
    String code, {
    SignupRole? signupRole,
    String? phoneForSignup,
  }) async {
    final identifier = state.identifier;
    if (identifier == null) return;

    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final tokens = await _api.verifyOtp(
        identifier: identifier,
        code: code,
        signupRole: signupRole,
        phoneForSignup: phoneForSignup,
      );
      await ref
          .read(tokenStorageProvider)
          .save(
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          );
      final user = await _api.me();
      state = state.copyWith(
        status: AuthStatus.signedIn,
        user: user,
        isSubmitting: false,
      );
      unawaited(registerDeviceToken(ref));
      unawaited(Analytics.identify(user.id));
      unawaited(Analytics.capture('login'));
    } on ApiException catch (e) {
      if (e.statusCode == 400 && signupRole == null) {
        // No account for this identifier yet — reveal the role/phone
        // picker so the caller can retry with them, mirroring the web
        // app's identical two-step verify flow.
        state = state.copyWith(
          needsSignup: true,
          isSubmitting: false,
          clearError: true,
        );
        return;
      }
      state = state.copyWith(error: e.message, isSubmitting: false);
    }
  }

  /// Back to identifier entry — e.g. the user mistyped their email.
  void cancelOtp() {
    state = state.copyWith(status: AuthStatus.signedOut, clearError: true);
  }

  Future<void> signOut() async {
    await Analytics.capture('logout');
    await Analytics.reset();
    final storage = ref.read(tokenStorageProvider);
    final refreshToken = await storage.readRefreshToken();
    await storage.clear();
    state = const AuthState(status: AuthStatus.signedOut);
    if (refreshToken != null) {
      unawaited(_api.logout(refreshToken).catchError((_) {}));
    }
  }
}
