/// Mirrors the web client's ApiError — a parsed NestJS error response
/// (`{"message": "..."}`) surfaced with its original HTTP status.
class ApiException implements Exception {
  ApiException(this.message, this.statusCode);

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}
