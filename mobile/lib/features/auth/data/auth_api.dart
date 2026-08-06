import '../../../core/network/api_client.dart';
import 'auth_models.dart';

class AuthApi {
  AuthApi(this._client);

  final ApiClient _client;

  Future<void> requestOtp(String phoneE164) =>
      _client.post('/auth/otp/request', {'phoneE164': phoneE164});

  /// [signupRole] is only required the first time a phone number verifies
  /// — the backend creates the account on that call (blueprint §4).
  Future<AuthTokens> verifyOtp({
    required String phoneE164,
    required String code,
    SignupRole? signupRole,
  }) async {
    final data =
        await _client.post('/auth/otp/verify', {
              'phoneE164': phoneE164,
              'code': code,
              if (signupRole != null) 'signupRole': signupRole.wireValue,
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
