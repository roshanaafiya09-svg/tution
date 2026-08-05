import 'package:flutter/material.dart';
import '../core/theme/design_tokens.dart';

/// Small uppercase section heading — was duplicated separately in
/// today_screen.dart and materials_screen.dart; now a single shared widget.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.label, {super.key, this.trailing});

  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: colorScheme.onSurface.withValues(alpha: 0.6),
      letterSpacing: 0.6,
    );

    return Padding(
      padding: const EdgeInsets.only(
        bottom: DesignTokens.spacing2,
        left: DesignTokens.spacing1,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.max,
        children: [
          Expanded(child: Text(label.toUpperCase(), style: style)),
          ?trailing,
        ],
      ),
    );
  }
}
