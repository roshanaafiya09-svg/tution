import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../../widgets/widgets.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/application/auth_state.dart';
import '../application/invites_provider.dart';
import '../application/pending_invite.dart';

/// Blueprint §4 growth loop: "tutor shares on WhatsApp -> student
/// installs -> lands pre-enrolled in the batch. No empty states, ever."
/// Reachable both from a real deep link (`tuitionapp://join/TOKEN`) and
/// by pasting a token/link manually.
class JoinScreen extends ConsumerStatefulWidget {
  const JoinScreen({required this.token, super.key});

  final String token;

  @override
  ConsumerState<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends ConsumerState<JoinScreen> {
  bool _joining = false;
  bool _joined = false;
  String? _error;

  Future<void> _join() async {
    final authState = ref.read(authControllerProvider);

    if (authState.status != AuthStatus.signedIn) {
      // Come back here the moment sign-in finishes.
      ref.read(pendingInviteTokenProvider.notifier).state = widget.token;
      context.go('/login');
      return;
    }

    setState(() {
      _joining = true;
      _error = null;
    });
    try {
      await ref.read(invitesApiProvider).redeem(widget.token);
      if (mounted) setState(() => _joined = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    final previewAsync = ref.watch(invitePreviewProvider(widget.token));

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(DesignTokens.pageGutter),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AppCard(
                elevated: true,
                child: previewAsync.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: LoadingView(),
                  ),
                  error: (_, _) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        CupertinoIcons.exclamationmark_triangle,
                        size: 32,
                        color: theme.colorScheme.error,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        l10n.invalidInviteLink,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ),
                  data: (preview) {
                    if (_joined) {
                      return Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: DesignTokens.successBg,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              CupertinoIcons.checkmark_alt,
                              color: DesignTokens.success,
                              size: 24,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            l10n.youreIn,
                            style: theme.textTheme.headlineMedium,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            l10n.joinedBatchMessage(preview.batchTitle),
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: () => context.go('/today'),
                              child: Text(l10n.goToToday),
                            ),
                          ),
                        ],
                      );
                    }

                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          l10n.invitedToJoin,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          preview.batchTitle,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.headlineMedium,
                        ),
                        if (!preview.isActive) ...[
                          const SizedBox(height: 16),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                CupertinoIcons.exclamationmark_triangle,
                                size: 16,
                                color: DesignTokens.warning,
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  l10n.inviteInactive,
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: DesignTokens.warning,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ] else ...[
                          if (_error != null) ...[
                            const SizedBox(height: 16),
                            FormErrorBanner(message: _error!),
                          ],
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _joining ? null : _join,
                              child: Text(
                                _joining ? l10n.joining : l10n.joinThisBatch,
                              ),
                            ),
                          ),
                        ],
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
