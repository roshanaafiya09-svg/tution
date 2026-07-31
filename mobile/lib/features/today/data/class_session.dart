class ClassSession {
  const ClassSession({
    required this.id,
    required this.batchId,
    required this.batchTitle,
    required this.scheduledStartUtc,
    required this.durationMin,
    required this.status,
    this.meetingUrl,
  });

  factory ClassSession.fromJson(Map<String, dynamic> json) => ClassSession(
    id: json['id'] as String,
    batchId: json['batch_id'] as String,
    batchTitle: json['batch_title'] as String,
    scheduledStartUtc: DateTime.parse(json['scheduled_start_utc'] as String),
    durationMin: json['duration_min'] as int,
    status: json['status'] as String,
    meetingUrl: json['meeting_url'] as String?,
  );

  final String id;
  final String batchId;
  final String batchTitle;
  final DateTime scheduledStartUtc;
  final int durationMin;
  final String status;
  final String? meetingUrl;

  DateTime get startLocal => scheduledStartUtc.toLocal();
  DateTime get endLocal => startLocal.add(Duration(minutes: durationMin));
  bool get isCancelled => status == 'cancelled';
}
