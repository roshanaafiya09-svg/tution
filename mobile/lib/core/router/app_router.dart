import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/application/auth_state.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/invites/application/pending_invite.dart';
import '../../features/invites/presentation/join_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import 'home_shell.dart';

/// Rebuilt whenever [authControllerProvider] changes, so `redirect` below
/// always sees the current auth status without a separate Listenable
/// bridge — acceptable here because auth transitions are exactly the
/// points where resetting the nav stack is desired anyway.
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authControllerProvider);
  final pendingInviteToken = ref.watch(pendingInviteTokenProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) => _redirect(
      ref,
      authState,
      pendingInviteToken,
      state.matchedLocation,
    ),
    routes: [
      GoRoute(path: '/', builder: (_, _) => const _SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/otp', builder: (_, _) => const OtpScreen()),
      GoRoute(path: '/today', builder: (_, _) => const HomeShell()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      GoRoute(
        path: '/join/:token',
        builder: (_, state) => JoinScreen(token: state.pathParameters['token']!),
      ),
    ],
  );
});

String? _redirect(
  Ref ref,
  AuthState authState,
  String? pendingInviteToken,
  String location,
) {
  // Blueprint §4: the invite preview is public — reachable at any auth
  // status. Signed-out taps fall through to the normal login flow from
  // inside JoinScreen itself, remembering the token to come back to.
  if (location.startsWith('/join/')) return null;

  switch (authState.status) {
    case AuthStatus.unknown:
      return location == '/' ? null : '/';
    case AuthStatus.signedIn:
      if (pendingInviteToken != null) {
        ref.read(pendingInviteTokenProvider.notifier).state = null;
        return '/join/$pendingInviteToken';
      }
      const signedInRoutes = {'/today', '/settings'};
      return signedInRoutes.contains(location) ? null : '/today';
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
