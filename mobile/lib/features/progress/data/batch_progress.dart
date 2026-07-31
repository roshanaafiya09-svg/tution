class BatchProgress {
  const BatchProgress({
    required this.batchId,
    required this.batchTitle,
    required this.attendanceRate,
    required this.completionRate,
  });

  final String batchId;
  final String batchTitle;

  /// Null when there's no attendance/assignment history yet to compute a
  /// rate from — shown as "—" rather than a misleading 0%.
  final int? attendanceRate;
  final int? completionRate;
}
