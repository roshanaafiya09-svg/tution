import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../core/theme/design_tokens.dart';

/// Inline form-level error — an icon-led tinted banner, used below a form's
/// primary input(s) so the failure reason stays visible next to the field
/// it relates to (preferred over a snackbar, which disappears).
class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isDark
            ? DesignTokens.error.withValues(alpha: 0.12)
            : DesignTokens.errorBg,
        borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            CupertinoIcons.exclamationmark_circle,
            size: 16,
            color: isDark ? DesignTokens.errorDark : DesignTokens.error,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: isDark ? DesignTokens.errorDark : DesignTokens.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
