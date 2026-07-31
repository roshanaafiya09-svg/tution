import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../data/batch.dart';
import '../data/batches_api.dart';

final batchesApiProvider = Provider<BatchesApi>(
  (ref) => BatchesApi(ref.watch(apiClientProvider)),
);

/// Batches the signed-in student is actively enrolled in — the shared
/// list materials/assignments/progress all key off of.
final enrolledBatchesProvider = FutureProvider<List<EnrolledBatch>>(
  (ref) => ref.watch(batchesApiProvider).listEnrolled(),
);
