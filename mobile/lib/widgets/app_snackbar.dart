import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../core/theme/design_tokens.dart';

/// Themed snackbar helpers — Flutter's idiomatic equivalent of a web toast.
/// Uses the app's SnackBarThemeData (app_theme.dart) for color/shape, only
/// varying the leading icon per intent.
abstract final class AppSnackbar {
  static void success(BuildContext context, String message) =>
      _show(context, message, CupertinoIcons.check_mark_circled_solid, DesignTokens.successDark);

  static void error(BuildContext context, String message) =>
      _show(context, message, CupertinoIcons.exclamationmark_circle_fill, DesignTokens.errorDark);

  static void info(BuildContext context, String message) =>
      _show(context, message, CupertinoIcons.info_circle_fill, DesignTokens.infoDark);

  static void _show(BuildContext context, String message, IconData icon, Color iconColor) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(width: DesignTokens.spacing3),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
  }
}
