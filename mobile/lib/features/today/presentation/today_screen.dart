import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/data/auth_models.dart';
import '../application/today_controller.dart';
import '../data/class_session.dart';

/// Blueprint §3: "Today view (home), class join ... records attendance".
/// Scoped to students — the mobile app's primary audience (blueprint §2);
/// a tutor sees a short note instead of an empty list.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final sessionsAsync = ref.watch(todayControllerProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navToday),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: l10n.settingsTitle,
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: SafeArea(
        child: user?.isStudent != true
            ? _TutorPlaceholder(user: user)
            : RefreshIndicator(
                onRefresh: () =>
                    ref.read(todayControllerProvider.notifier).refresh(),
                child: sessionsAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (error, _) => _ErrorView(
                    message: error is ApiException
                        ? error.message
                        : l10n.todayLoadError,
                    onRetry: () =>
                        ref.read(todayControllerProvider.notifier).refresh(),
                  ),
                  data: (sessions) => _SessionList(sessions: sessions),
                ),
              ),
      ),
    );
  }
}

class _TutorPlaceholder extends StatelessWidget {
  const _TutorPlaceholder({required this.user});

  final CurrentUser? user;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    return ListView(
      padding: const EdgeInsets.all(DesignTokens.pageGutter),
      children: [
        Text(l10n.welcomeTutor, style: theme.textTheme.headlineMedium),
        if (user?.phoneE164 != null) ...[
          const SizedBox(height: 4),
          Text(
            user!.phoneE164!,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
        const SizedBox(height: 24),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(DesignTokens.cardPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.tutorPlaceholderTitle, style: theme.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(l10n.tutorPlaceholderBody, style: theme.textTheme.bodyMedium),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return ListView(
      padding: const EdgeInsets.all(DesignTokens.pageGutter),
      children: [
        const SizedBox(height: 48),
        Icon(
          Icons.error_outline,
          size: 40,
          color: Theme.of(context).colorScheme.error,
        ),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        Center(
          child: OutlinedButton(onPressed: onRetry, child: Text(l10n.retry)),
        ),
      ],
    );
  }
}

class _SessionList extends StatelessWidget {
  const _SessionList({required this.sessions});

  final List<ClassSession> sessions;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (sessions.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(DesignTokens.pageGutter),
        children: [
          const SizedBox(height: 48),
          Center(
            child: Text(l10n.todayEmptyState, textAlign: TextAlign.center),
          ),
        ],
      );
    }

    final now = DateTime.now();
    final today = sessions
        .where((s) => _isSameDay(s.startLocal, now))
        .toList();
    final upcoming = sessions
        .where((s) => !_isSameDay(s.startLocal, now))
        .toList();

    return ListView(
      padding: const EdgeInsets.all(DesignTokens.pageGutter),
      children: [
        if (today.isNotEmpty) ...[
          _SectionLabel(l10n.todaySectionToday),
          ...today.map((s) => _SessionCard(session: s)),
          const SizedBox(height: 24),
        ],
        if (upcoming.isNotEmpty) ...[
          _SectionLabel(l10n.todaySectionUpcoming),
          ...upcoming.map((s) => _SessionCard(session: s)),
        ],
      ],
    );
  }

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _SessionCard extends ConsumerStatefulWidget {
  const _SessionCard({required this.session});

  final ClassSession session;

  @override
  ConsumerState<_SessionCard> createState() => _SessionCardState();
}

class _SessionCardState extends ConsumerState<_SessionCard> {
  bool _joining = false;

  Future<void> _join() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() => _joining = true);
    try {
      final meetingUrl = await ref
          .read(todayControllerProvider.notifier)
          .joinSession(widget.session.id);
      if (meetingUrl != null) {
        await launchUrl(Uri.parse(meetingUrl), mode: LaunchMode.externalApplication);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.joinNoLinkYet)),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    final session = widget.session;
    final timeRange =
        '${DateFormat.jm().format(session.startLocal)} – ${DateFormat.jm().format(session.endLocal)}';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(DesignTokens.cardPadding),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(session.batchTitle, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    timeRange,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                  if (session.isCancelled) ...[
                    const SizedBox(height: 4),
                    Text(
                      l10n.classCancelled,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: DesignTokens.error,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (!session.isCancelled)
              FilledButton(
                onPressed: _joining ? null : _join,
                child: _joining
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.joinClass),
              ),
          ],
        ),
      ),
    );
  }
}
