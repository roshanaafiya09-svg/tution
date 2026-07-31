import '../../../core/network/api_client.dart';

class ProgressApi {
  ProgressApi(this._client);

  final ApiClient _client;

  Future<int?> attendanceRate(String batchId) async {
    final data =
        await _client.get('/attendance/summary/batch/$batchId')
            as Map<String, dynamic>;
    return data['attendanceRate'] as int?;
  }

  Future<int?> completionRate(String batchId) async {
    final data =
        await _client.get('/assignments/summary/batch/$batchId')
            as Map<String, dynamic>;
    return data['completionRate'] as int?;
  }
}
