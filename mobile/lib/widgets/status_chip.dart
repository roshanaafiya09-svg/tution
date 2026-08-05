import 'package:flutter/material.dart';
import '../core/theme/design_tokens.dart';

class _StatusStyle {
  const _StatusStyle(this.fg, this.fgDark, this.bg, this.bgDark);
  final Color fg;
  final Color fgDark;
  final Color bg;
  final Color bgDark;
}

final Map<String, _StatusStyle> _styles = {
  for (final key in [
    'paid', 'present', 'completed', 'active', 'verified', 'approved',
    'captured', 'confirmed', 'converted', 'graded',
  ])
    key: _StatusStyle(
      DesignTokens.success,
      DesignTokens.successDark,
      DesignTokens.successBg,
      DesignTokens.success.withValues(alpha: 0.16),
    ),
  for (final key in [
    'due', 'partial', 'late', 'pending', 'pending_review', 'waiting',
    'pending_payment',
  ])
    key: _StatusStyle(
      DesignTokens.warning,
      DesignTokens.warningDark,
      DesignTokens.warningBg,
      DesignTokens.warning.withValues(alpha: 0.16),
    ),
  for (final key in [
    'absent', 'rejected', 'failed', 'past_due', 'no_show',
  ])
    key: _StatusStyle(
      DesignTokens.error,
      DesignTokens.errorDark,
      DesignTokens.errorBg,
      DesignTokens.error.withValues(alpha: 0.16),
    ),
  for (final key in ['scheduled', 'created', 'trialing', 'notified', 'processing'])
    key: _StatusStyle(
      DesignTokens.info,
      DesignTokens.infoDark,
      DesignTokens.infoBg,
      DesignTokens.info.withValues(alpha: 0.16),
    ),
};

/// Consolidates the `_StatusChip` widget from assignments_screen.dart into
/// a shared component usable by any screen showing attendance/fee/booking
/// status. Keys match the backend's status strings exactly.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final style = _styles[status];
    final fg = style != null
        ? (isDark ? style.fgDark : style.fg)
        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    final bg = style != null
        ? (isDark ? style.bgDark : style.bg)
        : Theme.of(context).colorScheme.surfaceContainerHighest;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(DesignTokens.radiusFull),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: fg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
