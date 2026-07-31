import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../data/assignment.dart';
import '../data/assignments_api.dart';

final assignmentsApiProvider = Provider<AssignmentsApi>(
  (ref) => AssignmentsApi(ref.watch(apiClientProvider)),
);

final assignmentsControllerProvider =
    AsyncNotifierProvider<AssignmentsController, List<Assignment>>(
      AssignmentsController.new,
    );

class AssignmentsController extends AsyncNotifier<List<Assignment>> {
  @override
  Future<List<Assignment>> build() {
    return ref.read(assignmentsApiProvider).listForStudent();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(assignmentsApiProvider).listForStudent(),
    );
  }

  /// Uploads [bytes] straight to storage (the API only ever hands out a
  /// presigned URL, blueprint §6), then records the submission and
  /// refreshes the list so the new status shows immediately.
  Future<void> submitHomework({
    required String assignmentId,
    required List<int> bytes,
    required String mime,
  }) async {
    final api = ref.read(assignmentsApiProvider);
    final target = await api.createUploadUrl(assignmentId, mime);
    await Dio().put(
      target.uploadUrl,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: {
          Headers.contentTypeHeader: mime,
          Headers.contentLengthHeader: bytes.length,
        },
      ),
    );
    await api.submit(assignmentId, [target.objectKey]);
    await refresh();
  }
}
