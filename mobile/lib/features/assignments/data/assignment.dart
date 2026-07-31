enum AssignmentStatus { pending, submitted, graded }

class Assignment {
  const Assignment({
    required this.id,
    required this.batchId,
    required this.batchTitle,
    required this.title,
    required this.instructions,
    required this.dueAtUtc,
    this.submissionId,
    this.grade,
  });

  factory Assignment.fromJson(Map<String, dynamic> json) => Assignment(
    id: json['id'] as String,
    batchId: json['batch_id'] as String,
    batchTitle: json['batch_title'] as String,
    title: json['title'] as String,
    instructions: json['instructions'] as String?,
    dueAtUtc: DateTime.parse(json['due_at_utc'] as String),
    submissionId: json['submission_id'] as String?,
    grade: json['grade'] as String?,
  );

  final String id;
  final String batchId;
  final String batchTitle;
  final String title;
  final String? instructions;
  final DateTime dueAtUtc;
  final String? submissionId;
  final String? grade;

  DateTime get dueAtLocal => dueAtUtc.toLocal();

  AssignmentStatus get status {
    if (submissionId == null) return AssignmentStatus.pending;
    if (grade == null) return AssignmentStatus.submitted;
    return AssignmentStatus.graded;
  }
}
