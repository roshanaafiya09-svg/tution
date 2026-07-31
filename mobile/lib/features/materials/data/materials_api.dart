import '../../../core/network/api_client.dart';
import 'material_item.dart';

class MaterialsApi {
  MaterialsApi(this._client);

  final ApiClient _client;

  Future<List<MaterialItem>> listForBatch(String batchId) async {
    final data = await _client.get('/materials/batch/$batchId') as List;
    return data.cast<Map<String, dynamic>>().map(MaterialItem.fromJson).toList();
  }

  /// Local-dev download targets go through the same local-storage stand-in
  /// as uploads (see LocalStorageProvider) — the URL is whatever the
  /// backend hands back, R2 or local.
  Future<String> getDownloadUrl(String materialId) async {
    final data =
        await _client.get('/materials/$materialId/download-url')
            as Map<String, dynamic>;
    return data['url'] as String;
  }
}
