/// The two roles a user can self-serve sign up as (blueprint §4) — trust
/// & safety / admin roles are provisioned out-of-band, never via signup.
enum SignupRole {
  tutor,
  student;

  String get wireValue => name;
}

class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
  );

  final String accessToken;
  final String refreshToken;
}

class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.roles,
    this.phoneE164,
    this.locale,
  });

  factory CurrentUser.fromJson(Map<String, dynamic> json) => CurrentUser(
    id: json['id'] as String,
    roles: (json['roles'] as List).cast<String>(),
    phoneE164: json['phoneE164'] as String?,
    locale: json['locale'] as String?,
  );

  final String id;
  final List<String> roles;
  final String? phoneE164;
  final String? locale;

  bool get isTutor => roles.contains('tutor');
  bool get isStudent => roles.contains('student');
}
