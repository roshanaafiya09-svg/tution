import '../../../core/network/api_client.dart';

class DeviceApi {
  DeviceApi(this._client);

  final ApiClient _client;

  Future<void> registerToken(String token, {String platform = 'android'}) =>
      _client.post('/notifications/device-tokens', {
        'token': token,
        'platform': platform,
      });

  /// Sign-out: detach this device from the signed-in user. Token goes in the
  /// body (never a URL) — same reason the backend route is POST, not DELETE.
  Future<void> unregisterToken(String token) =>
      _client.post('/notifications/device-tokens/unregister', {'token': token});
}
