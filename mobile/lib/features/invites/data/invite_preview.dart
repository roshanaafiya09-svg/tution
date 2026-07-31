class InvitePreview {
  const InvitePreview({
    required this.batchTitle,
    required this.isExpired,
    required this.isExhausted,
  });

  factory InvitePreview.fromJson(Map<String, dynamic> json) => InvitePreview(
    batchTitle: json['batchTitle'] as String,
    isExpired: json['isExpired'] as bool,
    isExhausted: json['isExhausted'] as bool,
  );

  final String batchTitle;
  final bool isExpired;
  final bool isExhausted;

  bool get isActive => !isExpired && !isExhausted;
}
