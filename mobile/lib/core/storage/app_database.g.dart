// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $CachedMaterialsTable extends CachedMaterials
    with TableInfo<$CachedMaterialsTable, CachedMaterial> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedMaterialsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _batchIdMeta = const VerificationMeta(
    'batchId',
  );
  @override
  late final GeneratedColumn<String> batchId = GeneratedColumn<String>(
    'batch_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _mimeMeta = const VerificationMeta('mime');
  @override
  late final GeneratedColumn<String> mime = GeneratedColumn<String>(
    'mime',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _localPathMeta = const VerificationMeta(
    'localPath',
  );
  @override
  late final GeneratedColumn<String> localPath = GeneratedColumn<String>(
    'local_path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cachedAtMeta = const VerificationMeta(
    'cachedAt',
  );
  @override
  late final GeneratedColumn<DateTime> cachedAt = GeneratedColumn<DateTime>(
    'cached_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    batchId,
    title,
    mime,
    localPath,
    cachedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_materials';
  @override
  VerificationContext validateIntegrity(
    Insertable<CachedMaterial> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('batch_id')) {
      context.handle(
        _batchIdMeta,
        batchId.isAcceptableOrUnknown(data['batch_id']!, _batchIdMeta),
      );
    } else if (isInserting) {
      context.missing(_batchIdMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('mime')) {
      context.handle(
        _mimeMeta,
        mime.isAcceptableOrUnknown(data['mime']!, _mimeMeta),
      );
    } else if (isInserting) {
      context.missing(_mimeMeta);
    }
    if (data.containsKey('local_path')) {
      context.handle(
        _localPathMeta,
        localPath.isAcceptableOrUnknown(data['local_path']!, _localPathMeta),
      );
    } else if (isInserting) {
      context.missing(_localPathMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(
        _cachedAtMeta,
        cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedMaterial map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedMaterial(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      batchId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      mime: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}mime'],
      )!,
      localPath: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}local_path'],
      )!,
      cachedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}cached_at'],
      )!,
    );
  }

  @override
  $CachedMaterialsTable createAlias(String alias) {
    return $CachedMaterialsTable(attachedDatabase, alias);
  }
}

class CachedMaterial extends DataClass implements Insertable<CachedMaterial> {
  final String id;
  final String batchId;
  final String title;
  final String mime;
  final String localPath;
  final DateTime cachedAt;
  const CachedMaterial({
    required this.id,
    required this.batchId,
    required this.title,
    required this.mime,
    required this.localPath,
    required this.cachedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['batch_id'] = Variable<String>(batchId);
    map['title'] = Variable<String>(title);
    map['mime'] = Variable<String>(mime);
    map['local_path'] = Variable<String>(localPath);
    map['cached_at'] = Variable<DateTime>(cachedAt);
    return map;
  }

  CachedMaterialsCompanion toCompanion(bool nullToAbsent) {
    return CachedMaterialsCompanion(
      id: Value(id),
      batchId: Value(batchId),
      title: Value(title),
      mime: Value(mime),
      localPath: Value(localPath),
      cachedAt: Value(cachedAt),
    );
  }

  factory CachedMaterial.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedMaterial(
      id: serializer.fromJson<String>(json['id']),
      batchId: serializer.fromJson<String>(json['batchId']),
      title: serializer.fromJson<String>(json['title']),
      mime: serializer.fromJson<String>(json['mime']),
      localPath: serializer.fromJson<String>(json['localPath']),
      cachedAt: serializer.fromJson<DateTime>(json['cachedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'batchId': serializer.toJson<String>(batchId),
      'title': serializer.toJson<String>(title),
      'mime': serializer.toJson<String>(mime),
      'localPath': serializer.toJson<String>(localPath),
      'cachedAt': serializer.toJson<DateTime>(cachedAt),
    };
  }

  CachedMaterial copyWith({
    String? id,
    String? batchId,
    String? title,
    String? mime,
    String? localPath,
    DateTime? cachedAt,
  }) => CachedMaterial(
    id: id ?? this.id,
    batchId: batchId ?? this.batchId,
    title: title ?? this.title,
    mime: mime ?? this.mime,
    localPath: localPath ?? this.localPath,
    cachedAt: cachedAt ?? this.cachedAt,
  );
  CachedMaterial copyWithCompanion(CachedMaterialsCompanion data) {
    return CachedMaterial(
      id: data.id.present ? data.id.value : this.id,
      batchId: data.batchId.present ? data.batchId.value : this.batchId,
      title: data.title.present ? data.title.value : this.title,
      mime: data.mime.present ? data.mime.value : this.mime,
      localPath: data.localPath.present ? data.localPath.value : this.localPath,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedMaterial(')
          ..write('id: $id, ')
          ..write('batchId: $batchId, ')
          ..write('title: $title, ')
          ..write('mime: $mime, ')
          ..write('localPath: $localPath, ')
          ..write('cachedAt: $cachedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, batchId, title, mime, localPath, cachedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedMaterial &&
          other.id == this.id &&
          other.batchId == this.batchId &&
          other.title == this.title &&
          other.mime == this.mime &&
          other.localPath == this.localPath &&
          other.cachedAt == this.cachedAt);
}

class CachedMaterialsCompanion extends UpdateCompanion<CachedMaterial> {
  final Value<String> id;
  final Value<String> batchId;
  final Value<String> title;
  final Value<String> mime;
  final Value<String> localPath;
  final Value<DateTime> cachedAt;
  final Value<int> rowid;
  const CachedMaterialsCompanion({
    this.id = const Value.absent(),
    this.batchId = const Value.absent(),
    this.title = const Value.absent(),
    this.mime = const Value.absent(),
    this.localPath = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedMaterialsCompanion.insert({
    required String id,
    required String batchId,
    required String title,
    required String mime,
    required String localPath,
    required DateTime cachedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       batchId = Value(batchId),
       title = Value(title),
       mime = Value(mime),
       localPath = Value(localPath),
       cachedAt = Value(cachedAt);
  static Insertable<CachedMaterial> custom({
    Expression<String>? id,
    Expression<String>? batchId,
    Expression<String>? title,
    Expression<String>? mime,
    Expression<String>? localPath,
    Expression<DateTime>? cachedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (batchId != null) 'batch_id': batchId,
      if (title != null) 'title': title,
      if (mime != null) 'mime': mime,
      if (localPath != null) 'local_path': localPath,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedMaterialsCompanion copyWith({
    Value<String>? id,
    Value<String>? batchId,
    Value<String>? title,
    Value<String>? mime,
    Value<String>? localPath,
    Value<DateTime>? cachedAt,
    Value<int>? rowid,
  }) {
    return CachedMaterialsCompanion(
      id: id ?? this.id,
      batchId: batchId ?? this.batchId,
      title: title ?? this.title,
      mime: mime ?? this.mime,
      localPath: localPath ?? this.localPath,
      cachedAt: cachedAt ?? this.cachedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (batchId.present) {
      map['batch_id'] = Variable<String>(batchId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (mime.present) {
      map['mime'] = Variable<String>(mime.value);
    }
    if (localPath.present) {
      map['local_path'] = Variable<String>(localPath.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<DateTime>(cachedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedMaterialsCompanion(')
          ..write('id: $id, ')
          ..write('batchId: $batchId, ')
          ..write('title: $title, ')
          ..write('mime: $mime, ')
          ..write('localPath: $localPath, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $BookmarksTable extends Bookmarks
    with TableInfo<$BookmarksTable, Bookmark> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $BookmarksTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _materialIdMeta = const VerificationMeta(
    'materialId',
  );
  @override
  late final GeneratedColumn<String> materialId = GeneratedColumn<String>(
    'material_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _batchIdMeta = const VerificationMeta(
    'batchId',
  );
  @override
  late final GeneratedColumn<String> batchId = GeneratedColumn<String>(
    'batch_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _mimeMeta = const VerificationMeta('mime');
  @override
  late final GeneratedColumn<String> mime = GeneratedColumn<String>(
    'mime',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _bookmarkedAtMeta = const VerificationMeta(
    'bookmarkedAt',
  );
  @override
  late final GeneratedColumn<DateTime> bookmarkedAt = GeneratedColumn<DateTime>(
    'bookmarked_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    materialId,
    batchId,
    title,
    mime,
    bookmarkedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'bookmarks';
  @override
  VerificationContext validateIntegrity(
    Insertable<Bookmark> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('material_id')) {
      context.handle(
        _materialIdMeta,
        materialId.isAcceptableOrUnknown(data['material_id']!, _materialIdMeta),
      );
    } else if (isInserting) {
      context.missing(_materialIdMeta);
    }
    if (data.containsKey('batch_id')) {
      context.handle(
        _batchIdMeta,
        batchId.isAcceptableOrUnknown(data['batch_id']!, _batchIdMeta),
      );
    } else if (isInserting) {
      context.missing(_batchIdMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('mime')) {
      context.handle(
        _mimeMeta,
        mime.isAcceptableOrUnknown(data['mime']!, _mimeMeta),
      );
    } else if (isInserting) {
      context.missing(_mimeMeta);
    }
    if (data.containsKey('bookmarked_at')) {
      context.handle(
        _bookmarkedAtMeta,
        bookmarkedAt.isAcceptableOrUnknown(
          data['bookmarked_at']!,
          _bookmarkedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_bookmarkedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {materialId};
  @override
  Bookmark map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Bookmark(
      materialId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}material_id'],
      )!,
      batchId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      mime: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}mime'],
      )!,
      bookmarkedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}bookmarked_at'],
      )!,
    );
  }

  @override
  $BookmarksTable createAlias(String alias) {
    return $BookmarksTable(attachedDatabase, alias);
  }
}

class Bookmark extends DataClass implements Insertable<Bookmark> {
  final String materialId;
  final String batchId;
  final String title;
  final String mime;
  final DateTime bookmarkedAt;
  const Bookmark({
    required this.materialId,
    required this.batchId,
    required this.title,
    required this.mime,
    required this.bookmarkedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['material_id'] = Variable<String>(materialId);
    map['batch_id'] = Variable<String>(batchId);
    map['title'] = Variable<String>(title);
    map['mime'] = Variable<String>(mime);
    map['bookmarked_at'] = Variable<DateTime>(bookmarkedAt);
    return map;
  }

  BookmarksCompanion toCompanion(bool nullToAbsent) {
    return BookmarksCompanion(
      materialId: Value(materialId),
      batchId: Value(batchId),
      title: Value(title),
      mime: Value(mime),
      bookmarkedAt: Value(bookmarkedAt),
    );
  }

  factory Bookmark.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Bookmark(
      materialId: serializer.fromJson<String>(json['materialId']),
      batchId: serializer.fromJson<String>(json['batchId']),
      title: serializer.fromJson<String>(json['title']),
      mime: serializer.fromJson<String>(json['mime']),
      bookmarkedAt: serializer.fromJson<DateTime>(json['bookmarkedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'materialId': serializer.toJson<String>(materialId),
      'batchId': serializer.toJson<String>(batchId),
      'title': serializer.toJson<String>(title),
      'mime': serializer.toJson<String>(mime),
      'bookmarkedAt': serializer.toJson<DateTime>(bookmarkedAt),
    };
  }

  Bookmark copyWith({
    String? materialId,
    String? batchId,
    String? title,
    String? mime,
    DateTime? bookmarkedAt,
  }) => Bookmark(
    materialId: materialId ?? this.materialId,
    batchId: batchId ?? this.batchId,
    title: title ?? this.title,
    mime: mime ?? this.mime,
    bookmarkedAt: bookmarkedAt ?? this.bookmarkedAt,
  );
  Bookmark copyWithCompanion(BookmarksCompanion data) {
    return Bookmark(
      materialId: data.materialId.present
          ? data.materialId.value
          : this.materialId,
      batchId: data.batchId.present ? data.batchId.value : this.batchId,
      title: data.title.present ? data.title.value : this.title,
      mime: data.mime.present ? data.mime.value : this.mime,
      bookmarkedAt: data.bookmarkedAt.present
          ? data.bookmarkedAt.value
          : this.bookmarkedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Bookmark(')
          ..write('materialId: $materialId, ')
          ..write('batchId: $batchId, ')
          ..write('title: $title, ')
          ..write('mime: $mime, ')
          ..write('bookmarkedAt: $bookmarkedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(materialId, batchId, title, mime, bookmarkedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Bookmark &&
          other.materialId == this.materialId &&
          other.batchId == this.batchId &&
          other.title == this.title &&
          other.mime == this.mime &&
          other.bookmarkedAt == this.bookmarkedAt);
}

class BookmarksCompanion extends UpdateCompanion<Bookmark> {
  final Value<String> materialId;
  final Value<String> batchId;
  final Value<String> title;
  final Value<String> mime;
  final Value<DateTime> bookmarkedAt;
  final Value<int> rowid;
  const BookmarksCompanion({
    this.materialId = const Value.absent(),
    this.batchId = const Value.absent(),
    this.title = const Value.absent(),
    this.mime = const Value.absent(),
    this.bookmarkedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  BookmarksCompanion.insert({
    required String materialId,
    required String batchId,
    required String title,
    required String mime,
    required DateTime bookmarkedAt,
    this.rowid = const Value.absent(),
  }) : materialId = Value(materialId),
       batchId = Value(batchId),
       title = Value(title),
       mime = Value(mime),
       bookmarkedAt = Value(bookmarkedAt);
  static Insertable<Bookmark> custom({
    Expression<String>? materialId,
    Expression<String>? batchId,
    Expression<String>? title,
    Expression<String>? mime,
    Expression<DateTime>? bookmarkedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (materialId != null) 'material_id': materialId,
      if (batchId != null) 'batch_id': batchId,
      if (title != null) 'title': title,
      if (mime != null) 'mime': mime,
      if (bookmarkedAt != null) 'bookmarked_at': bookmarkedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  BookmarksCompanion copyWith({
    Value<String>? materialId,
    Value<String>? batchId,
    Value<String>? title,
    Value<String>? mime,
    Value<DateTime>? bookmarkedAt,
    Value<int>? rowid,
  }) {
    return BookmarksCompanion(
      materialId: materialId ?? this.materialId,
      batchId: batchId ?? this.batchId,
      title: title ?? this.title,
      mime: mime ?? this.mime,
      bookmarkedAt: bookmarkedAt ?? this.bookmarkedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (materialId.present) {
      map['material_id'] = Variable<String>(materialId.value);
    }
    if (batchId.present) {
      map['batch_id'] = Variable<String>(batchId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (mime.present) {
      map['mime'] = Variable<String>(mime.value);
    }
    if (bookmarkedAt.present) {
      map['bookmarked_at'] = Variable<DateTime>(bookmarkedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('BookmarksCompanion(')
          ..write('materialId: $materialId, ')
          ..write('batchId: $batchId, ')
          ..write('title: $title, ')
          ..write('mime: $mime, ')
          ..write('bookmarkedAt: $bookmarkedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CachedMaterialsTable cachedMaterials = $CachedMaterialsTable(
    this,
  );
  late final $BookmarksTable bookmarks = $BookmarksTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    cachedMaterials,
    bookmarks,
  ];
}

typedef $$CachedMaterialsTableCreateCompanionBuilder =
    CachedMaterialsCompanion Function({
      required String id,
      required String batchId,
      required String title,
      required String mime,
      required String localPath,
      required DateTime cachedAt,
      Value<int> rowid,
    });
typedef $$CachedMaterialsTableUpdateCompanionBuilder =
    CachedMaterialsCompanion Function({
      Value<String> id,
      Value<String> batchId,
      Value<String> title,
      Value<String> mime,
      Value<String> localPath,
      Value<DateTime> cachedAt,
      Value<int> rowid,
    });

class $$CachedMaterialsTableFilterComposer
    extends Composer<_$AppDatabase, $CachedMaterialsTable> {
  $$CachedMaterialsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mime => $composableBuilder(
    column: $table.mime,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get localPath => $composableBuilder(
    column: $table.localPath,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CachedMaterialsTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedMaterialsTable> {
  $$CachedMaterialsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mime => $composableBuilder(
    column: $table.mime,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get localPath => $composableBuilder(
    column: $table.localPath,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CachedMaterialsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedMaterialsTable> {
  $$CachedMaterialsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get batchId =>
      $composableBuilder(column: $table.batchId, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get mime =>
      $composableBuilder(column: $table.mime, builder: (column) => column);

  GeneratedColumn<String> get localPath =>
      $composableBuilder(column: $table.localPath, builder: (column) => column);

  GeneratedColumn<DateTime> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);
}

class $$CachedMaterialsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CachedMaterialsTable,
          CachedMaterial,
          $$CachedMaterialsTableFilterComposer,
          $$CachedMaterialsTableOrderingComposer,
          $$CachedMaterialsTableAnnotationComposer,
          $$CachedMaterialsTableCreateCompanionBuilder,
          $$CachedMaterialsTableUpdateCompanionBuilder,
          (
            CachedMaterial,
            BaseReferences<
              _$AppDatabase,
              $CachedMaterialsTable,
              CachedMaterial
            >,
          ),
          CachedMaterial,
          PrefetchHooks Function()
        > {
  $$CachedMaterialsTableTableManager(
    _$AppDatabase db,
    $CachedMaterialsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedMaterialsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedMaterialsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedMaterialsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> batchId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String> mime = const Value.absent(),
                Value<String> localPath = const Value.absent(),
                Value<DateTime> cachedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CachedMaterialsCompanion(
                id: id,
                batchId: batchId,
                title: title,
                mime: mime,
                localPath: localPath,
                cachedAt: cachedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String batchId,
                required String title,
                required String mime,
                required String localPath,
                required DateTime cachedAt,
                Value<int> rowid = const Value.absent(),
              }) => CachedMaterialsCompanion.insert(
                id: id,
                batchId: batchId,
                title: title,
                mime: mime,
                localPath: localPath,
                cachedAt: cachedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CachedMaterialsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CachedMaterialsTable,
      CachedMaterial,
      $$CachedMaterialsTableFilterComposer,
      $$CachedMaterialsTableOrderingComposer,
      $$CachedMaterialsTableAnnotationComposer,
      $$CachedMaterialsTableCreateCompanionBuilder,
      $$CachedMaterialsTableUpdateCompanionBuilder,
      (
        CachedMaterial,
        BaseReferences<_$AppDatabase, $CachedMaterialsTable, CachedMaterial>,
      ),
      CachedMaterial,
      PrefetchHooks Function()
    >;
typedef $$BookmarksTableCreateCompanionBuilder =
    BookmarksCompanion Function({
      required String materialId,
      required String batchId,
      required String title,
      required String mime,
      required DateTime bookmarkedAt,
      Value<int> rowid,
    });
typedef $$BookmarksTableUpdateCompanionBuilder =
    BookmarksCompanion Function({
      Value<String> materialId,
      Value<String> batchId,
      Value<String> title,
      Value<String> mime,
      Value<DateTime> bookmarkedAt,
      Value<int> rowid,
    });

class $$BookmarksTableFilterComposer
    extends Composer<_$AppDatabase, $BookmarksTable> {
  $$BookmarksTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get materialId => $composableBuilder(
    column: $table.materialId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mime => $composableBuilder(
    column: $table.mime,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get bookmarkedAt => $composableBuilder(
    column: $table.bookmarkedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$BookmarksTableOrderingComposer
    extends Composer<_$AppDatabase, $BookmarksTable> {
  $$BookmarksTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get materialId => $composableBuilder(
    column: $table.materialId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mime => $composableBuilder(
    column: $table.mime,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get bookmarkedAt => $composableBuilder(
    column: $table.bookmarkedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$BookmarksTableAnnotationComposer
    extends Composer<_$AppDatabase, $BookmarksTable> {
  $$BookmarksTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get materialId => $composableBuilder(
    column: $table.materialId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get batchId =>
      $composableBuilder(column: $table.batchId, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get mime =>
      $composableBuilder(column: $table.mime, builder: (column) => column);

  GeneratedColumn<DateTime> get bookmarkedAt => $composableBuilder(
    column: $table.bookmarkedAt,
    builder: (column) => column,
  );
}

class $$BookmarksTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $BookmarksTable,
          Bookmark,
          $$BookmarksTableFilterComposer,
          $$BookmarksTableOrderingComposer,
          $$BookmarksTableAnnotationComposer,
          $$BookmarksTableCreateCompanionBuilder,
          $$BookmarksTableUpdateCompanionBuilder,
          (Bookmark, BaseReferences<_$AppDatabase, $BookmarksTable, Bookmark>),
          Bookmark,
          PrefetchHooks Function()
        > {
  $$BookmarksTableTableManager(_$AppDatabase db, $BookmarksTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$BookmarksTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$BookmarksTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$BookmarksTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> materialId = const Value.absent(),
                Value<String> batchId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String> mime = const Value.absent(),
                Value<DateTime> bookmarkedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => BookmarksCompanion(
                materialId: materialId,
                batchId: batchId,
                title: title,
                mime: mime,
                bookmarkedAt: bookmarkedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String materialId,
                required String batchId,
                required String title,
                required String mime,
                required DateTime bookmarkedAt,
                Value<int> rowid = const Value.absent(),
              }) => BookmarksCompanion.insert(
                materialId: materialId,
                batchId: batchId,
                title: title,
                mime: mime,
                bookmarkedAt: bookmarkedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$BookmarksTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $BookmarksTable,
      Bookmark,
      $$BookmarksTableFilterComposer,
      $$BookmarksTableOrderingComposer,
      $$BookmarksTableAnnotationComposer,
      $$BookmarksTableCreateCompanionBuilder,
      $$BookmarksTableUpdateCompanionBuilder,
      (Bookmark, BaseReferences<_$AppDatabase, $BookmarksTable, Bookmark>),
      Bookmark,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CachedMaterialsTableTableManager get cachedMaterials =>
      $$CachedMaterialsTableTableManager(_db, _db.cachedMaterials);
  $$BookmarksTableTableManager get bookmarks =>
      $$BookmarksTableTableManager(_db, _db.bookmarks);
}
