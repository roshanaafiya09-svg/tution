import '../../../core/network/api_client.dart';

class AccountApi {
  AccountApi(this._client);

  final ApiClient _client;

  /// DPDP data-principal export right (blueprint §4/§9) — the raw JSON,
  /// same shape the web client downloads from GET /account/export.
  Future<Map<String, dynamic>> exportData() async {
    return await _client.get('/account/export') as Map<String, dynamic>;
  }

  Future<void> deleteAccount() => _client.delete('/account/me');
}
