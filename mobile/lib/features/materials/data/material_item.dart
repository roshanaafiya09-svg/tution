class MaterialItem {
  const MaterialItem({
    required this.id,
    required this.batchId,
    required this.title,
    required this.mime,
    required this.sizeBytes,
  });

  factory MaterialItem.fromJson(Map<String, dynamic> json) => MaterialItem(
    id: json['id'] as String,
    batchId: json['batch_id'] as String,
    title: json['title'] as String,
    mime: json['mime'] as String,
    sizeBytes: json['size_bytes'] as int,
  );

  final String id;
  final String batchId;
  final String title;
  final String mime;
  final int sizeBytes;
}
