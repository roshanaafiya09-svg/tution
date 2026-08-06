import '../../../core/network/api_client.dart';

/// Student-side of blueprint §4's invite-link pattern for linking a
/// parent account — the mobile counterpart to the web app's parent-side
/// `/parent/link` page, which only ever had somewhere to paste a token,
/// never anywhere for a student to generate one (found in a pre-launch
/// audit: the whole parent portal was unreachable by a real user without
/// this).
class ParentLinksApi {
  ParentLinksApi(this._client);

  final ApiClient _client;

  /// Returns a short-lived token the student shares with their parent
  /// out-of-band (WhatsApp, etc.) — the parent pastes it into their own
  /// "Link a child" screen. POST /parent-links/invite, student-only.
  Future<String> createInvite() async {
    final data = await _client.post('/parent-links/invite') as Map<String, dynamic>;
    return data['token'] as String;
  }
}
