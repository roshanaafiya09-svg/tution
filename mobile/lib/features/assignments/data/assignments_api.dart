import '../../../core/network/api_client.dart';
import 'assignment.dart';
import 'submission.dart';

class UploadTarget {
  const UploadTarget({required this.uploadUrl, required this.objectKey});

  factory UploadTarget.fromJson(Map<String, dynamic> json) => UploadTarget(
    uploadUrl: json['uploadUrl'] as String,
    objectKey: json['objectKey'] as String,
  );

  final String uploadUrl;
  final String objectKey;
}

class AssignmentsApi {
  AssignmentsApi(this._client);

  final ApiClient _client;

  Future<List<Assignment>> listForStudent() async {
    final data = await _client.get('/assignments/me') as List;
    return data.cast<Map<String, dynamic>>().map(Assignment.fromJson).toList();
  }

  Future<UploadTarget> createUploadUrl(String assignmentId, String mime) async {
    final data =
        await _client.post('/assignments/$assignmentId/upload-url', {
              'mime': mime,
            })
            as Map<String, dynamic>;
    return UploadTarget.fromJson(data);
  }

  Future<Submission> submit(String assignmentId, List<String> objectKeys) async {
    final data =
        await _client.post('/assignments/$assignmentId/submit', {
              'objectKeys': objectKeys,
            })
            as Map<String, dynamic>;
    return Submission.fromJson(data);
  }
}
