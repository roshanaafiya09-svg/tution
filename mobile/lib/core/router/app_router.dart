import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/application/auth_state.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/today/presentation/today_screen.dart';

/// Rebuilt whenever [authControllerProvider] changes, so `redirect` below
/// always sees the current auth status without a separate Listenable
/// bridge — acceptable here because auth transitions are exactly the
/// points where resetting the nav stack is desired anyway.
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) => _redirect(authState, state.matchedLocation),
    routes: [
      GoRoute(path: '/', builder: (_, _) => const _SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/otp', builder: (_, _) => const OtpScreen()),
      GoRoute(path: '/today', builder: (_, _) => const TodayScreen()),
    ],
  );
});

String? _redirect(AuthState authState, String location) {
  switch (authState.status) {
    case AuthStatus.unknown:
      return location == '/' ? null : '/';
    case AuthStatus.signedIn:
      return location == '/today' ? null : '/today';
    case AuthStatus.otpRequested:
      return location == '/otp' ? null : '/otp';
    case AuthStatus.signedOut:
      return location == '/login' ? null : '/login';
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
