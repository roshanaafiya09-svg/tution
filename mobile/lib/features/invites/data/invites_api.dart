import '../../../core/network/api_client.dart';
import 'invite_preview.dart';

class InvitesApi {
  InvitesApi(this._client);

  final ApiClient _client;

  /// Public — no auth required, matches the web `/join/[token]` page's
  /// "no empty states, ever" preview (blueprint §4).
  Future<InvitePreview> preview(String token) async {
    final data = await _client.get('/invites/$token') as Map<String, dynamic>;
    return InvitePreview.fromJson(data);
  }

  Future<void> redeem(String token) => _client.post('/invites/$token/redeem');
}
