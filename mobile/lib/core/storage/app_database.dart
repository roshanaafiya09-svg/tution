import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

/// Offline reading cache for materials (blueprint §6: "Drift (SQLite)
/// for the reading cache"). Tracks the on-disk path of a downloaded
/// file so a material can be reopened without a network call; the
/// actual bytes live in the app's documents directory, not in SQLite.
class CachedMaterials extends Table {
  TextColumn get id => text()();
  TextColumn get batchId => text()();
  TextColumn get title => text()();
  TextColumn get mime => text()();
  TextColumn get localPath => text()();
  DateTimeColumn get cachedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Bookmarked materials (blueprint §3) — local-only, no backend table.
/// Denormalized (title/mime carried alongside the id) so a bookmark
/// still renders even if the material later drops out of the student's
/// currently-enrolled-batches fetch.
class Bookmarks extends Table {
  TextColumn get materialId => text()();
  TextColumn get batchId => text()();
  TextColumn get title => text()();
  TextColumn get mime => text()();
  DateTimeColumn get bookmarkedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {materialId};
}

@DriftDatabase(tables: [CachedMaterials, Bookmarks])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 1;

  Future<CachedMaterial?> findCached(String materialId) {
    return (select(
      cachedMaterials,
    )..where((t) => t.id.equals(materialId))).getSingleOrNull();
  }

  Future<void> upsertCached(CachedMaterialsCompanion entry) {
    return into(cachedMaterials).insertOnConflictUpdate(entry);
  }

  Future<List<CachedMaterial>> allForBatch(String batchId) {
    return (select(
      cachedMaterials,
    )..where((t) => t.batchId.equals(batchId))).get();
  }

  Stream<List<Bookmark>> watchBookmarks() =>
      select(bookmarks).watch();

  Future<bool> isBookmarked(String materialId) async {
    final row = await (select(
      bookmarks,
    )..where((t) => t.materialId.equals(materialId))).getSingleOrNull();
    return row != null;
  }

  Future<void> addBookmark(BookmarksCompanion entry) {
    return into(bookmarks).insertOnConflictUpdate(entry);
  }

  Future<void> removeBookmark(String materialId) {
    return (delete(
      bookmarks,
    )..where((t) => t.materialId.equals(materialId))).go();
  }
}

QueryExecutor _openConnection() {
  return driftDatabase(name: 'tuition_offline_cache');
}
