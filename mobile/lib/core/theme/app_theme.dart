import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'design_tokens.dart';

/// Builds Flutter's light/dark [ThemeData] from [DesignTokens], mirroring
/// the "Scholar" system wired into Tailwind for web (blueprint §4: dark
/// mode is in-scope for Phase 1).
abstract final class AppTheme {
  static ThemeData light() => _build(brightness: Brightness.light);
  static ThemeData dark() => _build(brightness: Brightness.dark);

  static ThemeData _build({required Brightness brightness}) {
    final isDark = brightness == Brightness.dark;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: isDark ? DesignTokens.brand300 : DesignTokens.brand600,
      onPrimary: isDark ? DesignTokens.brand950 : DesignTokens.neutral0,
      secondary: isDark ? DesignTokens.accent300 : DesignTokens.accent600,
      onSecondary: isDark ? DesignTokens.accent950 : DesignTokens.neutral0,
      error: isDark ? DesignTokens.errorDark : DesignTokens.error,
      onError: isDark ? DesignTokens.error : DesignTokens.neutral0,
      errorContainer: isDark
          ? DesignTokens.error.withValues(alpha: 0.16)
          : DesignTokens.errorBg,
      onErrorContainer: isDark ? DesignTokens.errorDark : DesignTokens.error,
      surface: isDark ? DesignTokens.neutral900 : DesignTokens.neutral0,
      onSurface: isDark ? DesignTokens.neutral100 : DesignTokens.neutral900,
      surfaceContainerHighest:
          isDark ? DesignTokens.neutral800 : DesignTokens.neutral50,
      outline: isDark ? DesignTokens.neutral700 : DesignTokens.neutral300,
      outlineVariant: isDark ? DesignTokens.neutral800 : DesignTokens.neutral200,
    );

    final baseTextTheme =
        isDark ? Typography.whiteMountainView : Typography.blackMountainView;
    final sansTextTheme = GoogleFonts.interTextTheme(baseTextTheme);
    final displayFontFamily = GoogleFonts.fraunces().fontFamily;

    // Maps shared/design-tokens/tokens.json's named type scale
    // (display-2xl…caption) onto Flutter's 15-slot TextTheme so every
    // screen pulls from Theme.of(context).textTheme instead of ad hoc
    // TextStyles. Sizes are the token rem values * 16.
    final textTheme = sansTextTheme.copyWith(
      displayLarge: sansTextTheme.displayLarge?.copyWith(
        fontFamily: displayFontFamily,
        fontSize: 72,
        height: 1.05,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.02 * 72,
      ),
      displayMedium: sansTextTheme.displayMedium?.copyWith(
        fontFamily: displayFontFamily,
        fontSize: 56,
        height: 1.08,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.02 * 56,
      ),
      displaySmall: sansTextTheme.displaySmall?.copyWith(
        fontFamily: displayFontFamily,
        fontSize: 44,
        height: 1.12,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.01 * 44,
      ),
      headlineLarge: sansTextTheme.headlineLarge?.copyWith(
        fontFamily: displayFontFamily,
        fontSize: 36,
        height: 1.18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.01 * 36,
      ),
      headlineMedium: sansTextTheme.headlineMedium?.copyWith(
        fontSize: 30,
        height: 1.25,
        fontWeight: FontWeight.w700,
      ),
      headlineSmall: sansTextTheme.headlineSmall?.copyWith(
        fontSize: 24,
        height: 1.3,
        fontWeight: FontWeight.w700,
      ),
      titleLarge: sansTextTheme.titleLarge?.copyWith(
        fontSize: 20,
        height: 1.35,
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: sansTextTheme.bodyLarge?.copyWith(fontSize: 18, height: 1.6),
      bodyMedium: sansTextTheme.bodyMedium?.copyWith(fontSize: 16, height: 1.6),
      bodySmall: sansTextTheme.bodySmall?.copyWith(fontSize: 14, height: 1.5),
      labelSmall: sansTextTheme.labelSmall?.copyWith(
        fontSize: 12,
        height: 1.4,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.2,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colorScheme.surface,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: colorScheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusLg),
          side: BorderSide(color: colorScheme.outline),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerHighest,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          borderSide: BorderSide(color: colorScheme.primary, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,
          disabledBackgroundColor: colorScheme.primary.withValues(alpha: 0.4),
          disabledForegroundColor: colorScheme.onPrimary.withValues(
            alpha: 0.7,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          ),
          textStyle: textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colorScheme.onSurface,
          side: BorderSide(color: colorScheme.outline),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          ),
          textStyle: textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colorScheme.primary,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          ),
          textStyle: textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colorScheme.surfaceContainerHighest,
        labelStyle: textTheme.labelSmall?.copyWith(color: colorScheme.onSurface),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusFull),
        ),
        side: BorderSide.none,
      ),
      dividerTheme: DividerThemeData(
        color: colorScheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDark
            ? DesignTokens.neutral100
            : DesignTokens.neutral900,
        contentTextStyle: TextStyle(
          color: isDark ? DesignTokens.neutral900 : DesignTokens.neutral50,
        ),
        actionTextColor: isDark
            ? DesignTokens.brand700
            : DesignTokens.accent300,
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
        ),
      ),
    );
  }
}
