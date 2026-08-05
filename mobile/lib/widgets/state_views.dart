import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../core/theme/design_tokens.dart';

/// Centered loading indicator — replaces bare `CircularProgressIndicator()`
/// scattered per-screen with a consistent label + spacing.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(strokeWidth: 2.5),
          if (label != null) ...[
            const SizedBox(height: DesignTokens.spacing3),
            Text(
              label!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Consolidates the `_ErrorView`/`_CenteredMessage` widgets that were
/// hand-duplicated in today_screen.dart, materials_screen.dart,
/// assignments_screen.dart, and progress_screen.dart.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(DesignTokens.spacing6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: colorScheme.errorContainer,
                shape: BoxShape.circle,
              ),
              child: Icon(
                CupertinoIcons.exclamationmark_triangle,
                color: colorScheme.onErrorContainer,
                size: 20,
              ),
            ),
            const SizedBox(height: DesignTokens.spacing3),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colorScheme.onSurface.withValues(alpha: 0.75),
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: DesignTokens.spacing4),
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

/// An empty-but-not-broken state — invitation to act, not an apology.
class EmptyStateView extends StatelessWidget {
  const EmptyStateView({
    super.key,
    required this.title,
    this.message,
    this.icon = CupertinoIcons.tray,
    this.action,
  });

  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(DesignTokens.spacing6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                color: colorScheme.onSurface.withValues(alpha: 0.4),
                size: 22,
              ),
            ),
            const SizedBox(height: DesignTokens.spacing4),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            if (message != null) ...[
              const SizedBox(height: DesignTokens.spacing1),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: DesignTokens.spacing5),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
