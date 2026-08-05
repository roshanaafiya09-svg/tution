import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../../widgets/widgets.dart';
import '../application/progress_controller.dart';
import '../data/batch_progress.dart';

/// Blueprint §3: "simple progress (attendance %, assignment completion)".
class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progressAsync = ref.watch(progressControllerProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.progressTitle)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(progressControllerProvider.future),
          child: progressAsync.when(
            loading: () => const LoadingView(),
            error: (_, _) => ErrorView(message: l10n.progressLoadError),
            data: (rows) {
              if (rows.isEmpty) {
                return EmptyStateView(
                  title: l10n.noEnrolledBatches,
                  icon: CupertinoIcons.chart_bar,
                );
              }
              return ListView(
                padding: const EdgeInsets.all(DesignTokens.pageGutter),
                children: rows.map((r) => _BatchProgressCard(progress: r)).toList(),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _BatchProgressCard extends StatelessWidget {
  const _BatchProgressCard({required this.progress});

  final BatchProgress progress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(progress.batchTitle, style: theme.textTheme.titleMedium),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _RateGauge(
                    label: l10n.attendanceLabel,
                    rate: progress.attendanceRate,
                    color: DesignTokens.brand500,
                  ),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: _RateGauge(
                    label: l10n.homeworkDoneLabel,
                    rate: progress.completionRate,
                    color: DesignTokens.accent500,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RateGauge extends StatelessWidget {
  const _RateGauge({required this.label, required this.rate, required this.color});

  final String label;
  final int? rate;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              height: 64,
              width: 64,
              child: CircularProgressIndicator(
                value: rate == null ? 0 : rate! / 100,
                strokeWidth: 6,
                strokeCap: StrokeCap.round,
                backgroundColor: color.withValues(alpha: 0.12),
                valueColor: AlwaysStoppedAnimation(color),
              ),
            ),
            Text(
              rate == null ? '—' : '$rate%',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }
}
