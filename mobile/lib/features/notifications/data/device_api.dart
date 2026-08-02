import '../../../core/network/api_client.dart';

class DeviceApi {
  DeviceApi(this._client);

  final ApiClient _client;

  Future<void> registerToken(String token, {String platform = 'android'}) =>
      _client.post('/notifications/device-tokens', {
        'token': token,
        'platform': platform,
      });
}
