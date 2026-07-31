import '../data/auth_models.dart';

enum AuthStatus {
  /// Startup: still checking for a stored session.
  unknown,
  signedOut,

  /// OTP requested for [phoneE164] — awaiting the 6-digit code.
  otpRequested,
  signedIn,
}

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.phoneE164,
    this.user,
    this.error,
    this.isSubmitting = false,
  });

  final AuthStatus status;
  final String? phoneE164;
  final CurrentUser? user;
  final String? error;
  final bool isSubmitting;

  AuthState copyWith({
    AuthStatus? status,
    String? phoneE164,
    CurrentUser? user,
    String? error,
    bool? isSubmitting,
    bool clearError = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      phoneE164: phoneE164 ?? this.phoneE164,
      user: user ?? this.user,
      error: clearError ? null : (error ?? this.error),
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }
}
