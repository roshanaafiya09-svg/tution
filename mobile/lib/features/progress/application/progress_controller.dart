import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../../batches/application/batches_provider.dart';
import '../data/batch_progress.dart';
import '../data/progress_api.dart';

final progressApiProvider = Provider<ProgressApi>(
  (ref) => ProgressApi(ref.watch(apiClientProvider)),
);

/// Blueprint §3: "simple progress (attendance %, assignment completion)",
/// one row per enrolled batch.
final progressControllerProvider = FutureProvider<List<BatchProgress>>((
  ref,
) async {
  final batches = await ref.watch(enrolledBatchesProvider.future);
  final api = ref.read(progressApiProvider);

  return Future.wait(
    batches.map((batch) async {
      final results = await Future.wait([
        api.attendanceRate(batch.id),
        api.completionRate(batch.id),
      ]);
      return BatchProgress(
        batchId: batch.id,
        batchTitle: batch.title,
        attendanceRate: results[0],
        completionRate: results[1],
      );
    }),
  );
});
