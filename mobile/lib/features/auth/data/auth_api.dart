import '../../../core/network/api_client.dart';
import 'auth_models.dart';

class AuthApi {
  AuthApi(this._client);

  final ApiClient _client;

  Future<void> requestOtp(String identifier) =>
      _client.post('/auth/otp/request', {'identifier': identifier});

  /// [signupRole] is only required the first time an identifier verifies
  /// — the backend creates the account on that call (blueprint §4).
  /// [phoneForSignup] is required alongside it, since `users.phone_e164`
  /// is NOT NULL but email is now the login identifier, not phone.
  Future<AuthTokens> verifyOtp({
    required String identifier,
    required String code,
    SignupRole? signupRole,
    String? phoneForSignup,
  }) async {
    final data =
        await _client.post('/auth/otp/verify', {
              'identifier': identifier,
              'code': code,
              'signupRole': ?signupRole?.wireValue,
              'phoneForSignup': ?phoneForSignup,
            })
            as Map<String, dynamic>;
    return AuthTokens.fromJson(data);
  }

  Future<CurrentUser> me() async {
    final data = await _client.get('/auth/me') as Map<String, dynamic>;
    return CurrentUser.fromJson(data);
  }

  /// Revokes this device's refresh token server-side. Best-effort by
  /// design — the caller clears local storage regardless of whether
  /// this succeeds, since the device signing out locally is the part
  /// that must never fail.
  Future<void> logout(String refreshToken) async {
    await _client.post('/auth/logout', {'refreshToken': refreshToken});
  }
}
