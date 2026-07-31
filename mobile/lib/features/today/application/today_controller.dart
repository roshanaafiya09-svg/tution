import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../../auth/application/auth_controller.dart';
import '../data/attendance_api.dart';
import '../data/class_session.dart';
import '../data/sessions_api.dart';

final sessionsApiProvider = Provider<SessionsApi>(
  (ref) => SessionsApi(ref.watch(apiClientProvider)),
);

final attendanceApiProvider = Provider<AttendanceApi>(
  (ref) => AttendanceApi(ref.watch(apiClientProvider)),
);

final todayControllerProvider =
    AsyncNotifierProvider<TodayController, List<ClassSession>>(
      TodayController.new,
    );

class TodayController extends AsyncNotifier<List<ClassSession>> {
  @override
  Future<List<ClassSession>> build() {
    // /sessions/upcoming is student-only (blueprint §3 scopes the Today
    // view to students/parents) — a tutor account gets an empty list
    // here rather than a 403, and the screen shows a different message.
    if (ref.watch(authControllerProvider).user?.isStudent != true) {
      return Future.value(const []);
    }
    return ref.read(sessionsApiProvider).listUpcoming();
  }

  Future<void> refresh() async {
    if (ref.read(authControllerProvider).user?.isStudent != true) return;
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(sessionsApiProvider).listUpcoming(),
    );
  }

  /// Records the join-tap; the caller (UI) is responsible for actually
  /// opening [JoinResult.meetingUrl] once this resolves.
  Future<String?> joinSession(String sessionId) async {
    final result = await ref.read(attendanceApiProvider).joinSession(
      sessionId,
    );
    return result.meetingUrl;
  }
}
