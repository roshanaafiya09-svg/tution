import '../../../core/network/api_client.dart';
import 'class_session.dart';

class SessionsApi {
  SessionsApi(this._client);

  final ApiClient _client;

  /// Blueprint §4: student's "Today" view — upcoming classes across every
  /// enrolled batch. The backend defaults the window to the next 14 days.
  Future<List<ClassSession>> listUpcoming() async {
    final data = await _client.get('/sessions/upcoming') as List;
    return data.cast<Map<String, dynamic>>().map(ClassSession.fromJson).toList();
  }
}
