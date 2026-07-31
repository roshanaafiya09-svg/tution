import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Set when a signed-out user opens an invite link, so the router can
/// send them back to /join/:token — instead of the default /today —
/// the moment they finish signing in. Mirrors the web client's
/// `router.push('/login?next=/join/token')` pattern without a query
/// string, since go_router's redirect already has this state to read.
final pendingInviteTokenProvider = StateProvider<String?>((ref) => null);
