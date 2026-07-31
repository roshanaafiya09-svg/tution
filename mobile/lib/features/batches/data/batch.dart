class EnrolledBatch {
  const EnrolledBatch({required this.id, required this.title});

  factory EnrolledBatch.fromJson(Map<String, dynamic> json) =>
      EnrolledBatch(id: json['id'] as String, title: json['title'] as String);

  final String id;
  final String title;
}
