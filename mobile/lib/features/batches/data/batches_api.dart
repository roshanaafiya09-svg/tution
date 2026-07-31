import '../../../core/network/api_client.dart';
import 'batch.dart';

class BatchesApi {
  BatchesApi(this._client);

  final ApiClient _client;

  Future<List<EnrolledBatch>> listEnrolled() async {
    final data = await _client.get('/batches/enrolled') as List;
    return data.cast<Map<String, dynamic>>().map(EnrolledBatch.fromJson).toList();
  }
}
