import 'package:dio/dio.dart';
import '../env/env.dart';
import 'api_exception.dart';
import 'token_storage.dart';

/// Thin Dio wrapper with bearer-token attachment and a single silent
/// refresh-and-retry on 401 — the same contract as the web client's
/// `api.ts` (access tokens live 15 min; one refresh keeps a working
/// session from bouncing to the login screen mid-task).
class ApiClient {
  ApiClient({TokenStorage? tokenStorage})
    : _tokenStorage = tokenStorage ?? TokenStorage(),
      _dio = Dio(
        BaseOptions(
          baseUrl: Env.apiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        ),
      ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStorage.readAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final isUnauthorized = error.response?.statusCode == 401;
          final alreadyRetried = error.requestOptions.extra['retried'] == true;

          if (isUnauthorized && !alreadyRetried && await _refreshTokens()) {
            error.requestOptions.extra['retried'] = true;
            try {
              final response = await _dio.fetch(error.requestOptions);
              handler.resolve(response);
              return;
            } on DioException catch (retryError) {
              handler.next(retryError);
              return;
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio _dio;
  final TokenStorage _tokenStorage;

  Future<bool> _refreshTokens() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null) return false;

    try {
      // A plain Dio instance — going through `_dio` would re-enter this
      // same interceptor and attach a (stale) Authorization header.
      final response = await Dio(
        BaseOptions(baseUrl: Env.apiBaseUrl),
      ).post('/auth/refresh', data: {'refreshToken': refreshToken});
      await _tokenStorage.save(
        accessToken: response.data['accessToken'] as String,
        refreshToken: response.data['refreshToken'] as String,
      );
      return true;
    } on DioException {
      await _tokenStorage.clear();
      return false;
    }
  }

  /// Returns the decoded JSON body as-is — a `Map` for object responses,
  /// a `List` for the many endpoints that return a bare array (Kysely's
  /// `.execute()` result shape carries straight through most controllers
  /// unwrapped). Callers cast to whichever they expect.
  Future<dynamic> get(String path) => _request('GET', path);

  Future<dynamic> post(String path, [Object? body]) =>
      _request('POST', path, body);

  Future<dynamic> put(String path, [Object? body]) =>
      _request('PUT', path, body);

  Future<void> delete(String path) => _request('DELETE', path);

  Future<dynamic> _request(String method, String path, [Object? body]) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        options: Options(method: method),
      );
      return response.data;
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  ApiException _toApiException(DioException error) {
    final data = error.response?.data;
    final message = (data is Map && data['message'] != null)
        ? data['message'].toString()
        : error.message ?? 'Something went wrong. Try again.';
    return ApiException(message, error.response?.statusCode);
  }
}
