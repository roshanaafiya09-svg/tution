import '../data/auth_models.dart';

enum AuthStatus {
  /// Startup: still checking for a stored session.
  unknown,
  signedOut,

  /// OTP requested for [identifier] — awaiting the 6-digit code.
  otpRequested,
  signedIn,
}

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.identifier,
    this.needsSignup = false,
    this.user,
    this.error,
    this.isSubmitting = false,
  });

  final AuthStatus status;
  final String? identifier;

  /// Set once a bare verify (no signupRole) comes back 400 — the
  /// backend's signal that this identifier has no account yet. The OTP
  /// screen reveals the role + phone picker only then, so a returning
  /// user is never asked for a phone number just to sign back in.
  final bool needsSignup;
  final CurrentUser? user;
  final String? error;
  final bool isSubmitting;

  AuthState copyWith({
    AuthStatus? status,
    String? identifier,
    bool? needsSignup,
    CurrentUser? user,
    String? error,
    bool? isSubmitting,
    bool clearError = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      identifier: identifier ?? this.identifier,
      needsSignup: needsSignup ?? this.needsSignup,
      user: user ?? this.user,
      error: clearError ? null : (error ?? this.error),
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }
}
