import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Device-bound access/refresh token pair, backed by Keychain (iOS) /
/// Keystore (Android) — the mobile counterpart to the web client's
/// localStorage token store, but hardware-backed instead of JS-readable.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _accessKey = 'accessToken';
  static const _refreshKey = 'refreshToken';

  final FlutterSecureStorage _storage;

  Future<String?> readAccessToken() => _storage.read(key: _accessKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> save({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}
