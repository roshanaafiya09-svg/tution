import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/providers.dart';
import '../data/invite_preview.dart';
import '../data/invites_api.dart';

final invitesApiProvider = Provider<InvitesApi>(
  (ref) => InvitesApi(ref.watch(apiClientProvider)),
);

final invitePreviewProvider = FutureProvider.family<InvitePreview, String>(
  (ref, token) => ref.watch(invitesApiProvider).preview(token),
);
