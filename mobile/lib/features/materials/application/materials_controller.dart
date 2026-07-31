import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/network/providers.dart';
import '../../../core/storage/app_database.dart';
import '../../../core/storage/providers.dart';
import '../../batches/application/batches_provider.dart';
import '../data/material_item.dart';
import '../data/materials_api.dart';

final materialsApiProvider = Provider<MaterialsApi>(
  (ref) => MaterialsApi(ref.watch(apiClientProvider)),
);

final bookmarksStreamProvider = StreamProvider(
  (ref) => ref.watch(appDatabaseProvider).watchBookmarks(),
);

/// Batch id -> its materials, across every batch the student is enrolled
/// in — the flat "Materials" tab groups by batch client-side.
final materialsControllerProvider =
    AsyncNotifierProvider<MaterialsController, Map<String, List<MaterialItem>>>(
      MaterialsController.new,
    );

class MaterialsController
    extends AsyncNotifier<Map<String, List<MaterialItem>>> {
  @override
  Future<Map<String, List<MaterialItem>>> build() async {
    final batches = await ref.watch(enrolledBatchesProvider.future);
    final api = ref.read(materialsApiProvider);
    final results = await Future.wait(batches.map((b) => api.listForBatch(b.id)));
    return {
      for (var i = 0; i < batches.length; i++) batches[i].id: results[i],
    };
  }

  Future<void> refresh() async {
    ref.invalidate(enrolledBatchesProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => build());
  }

  /// Downloads once and caches on disk (blueprint §6: offline reading
  /// cache) — a second open reuses the cached file with no network call.
  Future<void> openMaterial(MaterialItem material) async {
    final db = ref.read(appDatabaseProvider);
    final cached = await db.findCached(material.id);

    if (cached != null && await File(cached.localPath).exists()) {
      await OpenFilex.open(cached.localPath);
      return;
    }

    final url = await ref.read(materialsApiProvider).getDownloadUrl(material.id);
    final dir = await getApplicationDocumentsDirectory();
    final extension = _extensionFor(material.mime);
    final localPath = '${dir.path}/materials/${material.id}$extension';
    await Directory('${dir.path}/materials').create(recursive: true);

    await Dio().download(url, localPath);

    await db.upsertCached(
      CachedMaterialsCompanion.insert(
        id: material.id,
        batchId: material.batchId,
        title: material.title,
        mime: material.mime,
        localPath: localPath,
        cachedAt: DateTime.now(),
      ),
    );

    await OpenFilex.open(localPath);
  }

  Future<void> toggleBookmark(MaterialItem material) async {
    final db = ref.read(appDatabaseProvider);
    if (await db.isBookmarked(material.id)) {
      await db.removeBookmark(material.id);
    } else {
      await db.addBookmark(
        BookmarksCompanion.insert(
          materialId: material.id,
          batchId: material.batchId,
          title: material.title,
          mime: material.mime,
          bookmarkedAt: DateTime.now(),
        ),
      );
    }
  }

  String _extensionFor(String mime) {
    switch (mime) {
      case 'application/pdf':
        return '.pdf';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      default:
        return '.jpg';
    }
  }
}
