import 'package:flutter/widgets.dart';

/// Ports shared/design-tokens/tokens.json ("Scholar") into Dart constants.
/// Values are hand-mirrored, not code-generated — keep this in sync with
/// the JSON file and web/tailwind.config.ts if either changes.
abstract final class DesignTokens {
  // --- color: brand (deep indigo) ---
  static const brand50 = Color(0xFFEEF0FC);
  static const brand100 = Color(0xFFD8DCF8);
  static const brand200 = Color(0xFFB4BBF1);
  static const brand300 = Color(0xFF8A93E6);
  static const brand400 = Color(0xFF5F68D6);
  static const brand500 = Color(0xFF4249C2);
  static const brand600 = Color(0xFF3532A8);
  static const brand700 = Color(0xFF2B2887);
  static const brand800 = Color(0xFF221F6B);
  static const brand900 = Color(0xFF1A1852);
  static const brand950 = Color(0xFF100F35);

  // --- color: accent (warm marigold) ---
  static const accent50 = Color(0xFFFFF8EB);
  static const accent100 = Color(0xFFFFECC2);
  static const accent200 = Color(0xFFFFDA8A);
  static const accent300 = Color(0xFFFFC24D);
  static const accent400 = Color(0xFFFFAB1F);
  static const accent500 = Color(0xFFF59A0C);
  static const accent600 = Color(0xFFD97F06);
  static const accent700 = Color(0xFFB4620A);
  static const accent800 = Color(0xFF8F4C10);
  static const accent900 = Color(0xFF743F10);
  static const accent950 = Color(0xFF421F04);

  // --- color: neutral ---
  static const neutral0 = Color(0xFFFFFFFF);
  static const neutral50 = Color(0xFFFAF9F7);
  static const neutral100 = Color(0xFFF3F1ED);
  static const neutral200 = Color(0xFFE6E2DB);
  static const neutral300 = Color(0xFFD2CCC1);
  static const neutral400 = Color(0xFFAAA290);
  static const neutral500 = Color(0xFF847B69);
  static const neutral600 = Color(0xFF635B4C);
  static const neutral700 = Color(0xFF4A4438);
  static const neutral800 = Color(0xFF332F27);
  static const neutral900 = Color(0xFF211E18);
  static const neutral950 = Color(0xFF14120E);

  // --- color: semantic --- (DEFAULT is tuned for light surfaces; the
  // *Dark variants are lightened for 4.5:1+ contrast on dark surfaces —
  // mirrors the `.dark` key added to shared/design-tokens/tokens.json)
  static const success = Color(0xFF1F8A5C);
  static const successDark = Color(0xFF4ADE9B);
  static const successBg = Color(0xFFE7F6EE);
  static const warning = Color(0xFFB4620A);
  static const warningDark = Color(0xFFF0A845);
  static const warningBg = Color(0xFFFFF3DF);
  static const error = Color(0xFFC4372E);
  static const errorDark = Color(0xFFF2887E);
  static const errorBg = Color(0xFFFBEAE8);
  static const info = Color(0xFF2B6CB0);
  static const infoDark = Color(0xFF6FA8E8);
  static const infoBg = Color(0xFFE9F2FB);

  // --- typography ---
  /// Marketing/section headers — editorial, premium academic feel.
  static const displayFontFamily = 'Fraunces';

  /// Product UI, forms, dense data (attendance, fee ledger).
  static const sansFontFamily = 'Inter';

  // --- radius ---
  static const radiusSm = 6.0;
  static const radiusMd = 10.0;
  static const radiusLg = 16.0;
  static const radiusXl = 24.0;
  static const radius2xl = 32.0;
  static const radiusFull = 999.0;

  // --- spacing --- (4px base scale, semantic aliases for layout rhythm)
  static const spacing1 = 4.0;
  static const spacing2 = 8.0;
  static const spacing3 = 12.0;
  static const spacing4 = 16.0;
  static const spacing5 = 20.0;
  static const spacing6 = 24.0;
  static const spacing8 = 32.0;
  static const spacing10 = 40.0;
  static const spacing12 = 48.0;
  static const pageGutter = 24.0;
  static const cardPadding = 24.0;
  static const sectionGap = 48.0;

  // --- motion ---
  static const motionFast = Duration(milliseconds: 120);
  static const motionBase = Duration(milliseconds: 200);
  static const motionSlow = Duration(milliseconds: 320);
  static const easingStandard = Curves.easeOutCubic;
  static const easingEmphasized = Curves.easeOutExpo;

  // --- shadow --- (warm-tinted, rgb(20,18,14) — matches tokens.json, not
  // pure black). Flutter cards previously used elevation:0 + outline only;
  // AppCard (lib/widgets/app_card.dart) applies these directly.
  static List<BoxShadow> shadowXs({bool dark = false}) => [
    BoxShadow(
      color: const Color(0xFF14120E).withValues(alpha: dark ? 0.24 : 0.04),
      offset: const Offset(0, 1),
      blurRadius: 2,
    ),
  ];

  static List<BoxShadow> shadowSm({bool dark = false}) => [
    BoxShadow(
      color: const Color(0xFF14120E).withValues(alpha: dark ? 0.32 : 0.06),
      offset: const Offset(0, 1),
      blurRadius: 3,
      spreadRadius: -1,
    ),
  ];

  static List<BoxShadow> shadowMd({bool dark = false}) => [
    BoxShadow(
      color: const Color(0xFF14120E).withValues(alpha: dark ? 0.36 : 0.08),
      offset: const Offset(0, 4),
      blurRadius: 12,
      spreadRadius: -2,
    ),
  ];

  static List<BoxShadow> shadowLg({bool dark = false}) => [
    BoxShadow(
      color: const Color(0xFF14120E).withValues(alpha: dark ? 0.4 : 0.12),
      offset: const Offset(0, 12),
      blurRadius: 28,
      spreadRadius: -6,
    ),
  ];
}
