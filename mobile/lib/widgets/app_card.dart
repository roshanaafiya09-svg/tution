import 'package:flutter/material.dart';
import '../core/theme/design_tokens.dart';

/// Shared card surface — replaces per-screen `Card(...)` usage with a
/// consistent shadow (design_tokens.dart's shadow scale, not Material
/// elevation) so every card across the app reads identically.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(DesignTokens.cardPadding),
    this.onTap,
    this.elevated = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colorScheme = Theme.of(context).colorScheme;

    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(DesignTokens.radiusLg),
        border: Border.all(color: colorScheme.outline),
        boxShadow: elevated
            ? DesignTokens.shadowMd(dark: isDark)
            : DesignTokens.shadowXs(dark: isDark),
      ),
      child: child,
    );

    if (onTap == null) return content;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(DesignTokens.radiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(DesignTokens.radiusLg),
        child: content,
      ),
    );
  }
}
