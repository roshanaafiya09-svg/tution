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
      error: DesignTokens.error,
      onError: DesignTokens.neutral0,
      surface: isDark ? DesignTokens.neutral900 : DesignTokens.neutral0,
      onSurface: isDark ? DesignTokens.neutral100 : DesignTokens.neutral900,
      surfaceContainerHighest:
          isDark ? DesignTokens.neutral800 : DesignTokens.neutral50,
      outline: isDark ? DesignTokens.neutral700 : DesignTokens.neutral300,
    );

    final baseTextTheme =
        isDark ? Typography.whiteMountainView : Typography.blackMountainView;
    final sansTextTheme = GoogleFonts.interTextTheme(baseTextTheme);
    final displayFontFamily = GoogleFonts.fraunces().fontFamily;

    final textTheme = sansTextTheme.copyWith(
      displayLarge: sansTextTheme.displayLarge?.copyWith(
        fontFamily: displayFontFamily,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.5,
      ),
      displayMedium: sansTextTheme.displayMedium?.copyWith(
        fontFamily: displayFontFamily,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.5,
      ),
      headlineLarge: sansTextTheme.headlineLarge?.copyWith(
        fontFamily: displayFontFamily,
        fontWeight: FontWeight.w600,
      ),
      headlineMedium: sansTextTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
      ),
      titleLarge: sansTextTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
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
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
          ),
          textStyle: textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDark
            ? DesignTokens.neutral800
            : DesignTokens.neutral900,
        contentTextStyle: TextStyle(color: colorScheme.surface),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
        ),
      ),
    );
  }
}
