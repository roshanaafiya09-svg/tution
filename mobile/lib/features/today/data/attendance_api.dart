import '../../../core/network/api_client.dart';

class JoinResult {
  const JoinResult({required this.meetingUrl});

  factory JoinResult.fromJson(Map<String, dynamic> json) =>
      JoinResult(meetingUrl: json['meetingUrl'] as String?);

  final String? meetingUrl;
}

class AttendanceApi {
  AttendanceApi(this._client);

  final ApiClient _client;

  /// The join-tap that drives the pilot's verdict metric (blueprint §13):
  /// records attendance and hands back the tutor's own meeting link.
  Future<JoinResult> joinSession(String sessionId) async {
    final data =
        await _client.post('/attendance/session/$sessionId/join')
            as Map<String, dynamic>;
    return JoinResult.fromJson(data);
  }
}
