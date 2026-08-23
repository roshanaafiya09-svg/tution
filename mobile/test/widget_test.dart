import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app.dart';
import 'package:mobile/core/network/providers.dart';
import 'package:mobile/core/network/token_storage.dart';

/// No stored session, and never touches platform-channel secure storage
/// (which isn't available in the widget-test environment).
class _NullTokenStorage implements TokenStorage {
  @override
  Future<void> clear() async {}

  @override
  Future<String?> readAccessToken() async => null;

  @override
  Future<String?> readRefreshToken() async => null;

  @override
  Future<void> save({
    required String accessToken,
    required String refreshToken,
  }) async {}
}

void main() {
  testWidgets('signed-out startup lands on the login screen', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenStorageProvider.overrideWithValue(_NullTokenStorage()),
        ],
        child: const TuitionApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Scholar'), findsOneWidget);
    expect(find.text('Send OTP'), findsOneWidget);
  });
}
