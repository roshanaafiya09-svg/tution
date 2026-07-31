class Submission {
  const Submission({
    required this.id,
    required this.submittedAt,
    this.grade,
    this.feedback,
  });

  factory Submission.fromJson(Map<String, dynamic> json) => Submission(
    id: json['id'] as String,
    submittedAt: DateTime.parse(json['submitted_at'] as String),
    grade: json['grade'] as String?,
    feedback: json['feedback'] as String?,
  );

  final String id;
  final DateTime submittedAt;
  final String? grade;
  final String? feedback;
}
