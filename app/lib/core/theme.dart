import 'package:flutter/material.dart';

/// The olive palette from the activity graph.
class GpColors extends ThemeExtension<GpColors> {
  const GpColors({
    required this.levels,
    required this.surface2,
    required this.border,
    required this.muted,
    required this.accent,
    required this.danger,
  });

  final List<Color> levels;
  final Color surface2;
  final Color border;
  final Color muted;
  final Color accent;
  final Color danger;

  static const light = GpColors(
    levels: [Color(0xFFEBECE8), Color(0xFFDCE6CB), Color(0xFFB9CC9A), Color(0xFF8AA665), Color(0xFF4F6A32)],
    surface2: Color(0xFFFBFBF7),
    border: Color(0xFFE3E6DA),
    muted: Color(0xFF7D8471),
    accent: Color(0xFF4F6A32),
    danger: Color(0xFFA3473F),
  );

  static const dark = GpColors(
    levels: [Color(0xFF252A1F), Color(0xFF33461F), Color(0xFF4A6A2C), Color(0xFF6F9A42), Color(0xFFA8CC78)],
    surface2: Color(0xFF1F241A),
    border: Color(0xFF2B3224),
    muted: Color(0xFF949C86),
    accent: Color(0xFFA5C47A),
    danger: Color(0xFFE08A80),
  );

  @override
  GpColors copyWith() => this;

  @override
  GpColors lerp(ThemeExtension<GpColors>? other, double t) => t < 0.5 ? this : (other as GpColors? ?? this);
}

extension GpTheme on BuildContext {
  GpColors get gp => Theme.of(this).extension<GpColors>()!;
}

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final gp = dark ? GpColors.dark : GpColors.light;
  final primary = dark ? const Color(0xFFB9CF94) : const Color(0xFF2F3A24);
  final bg = dark ? const Color(0xFF12150F) : const Color(0xFFF6F6F1);
  final surface = dark ? const Color(0xFF1A1E16) : Colors.white;
  final text = dark ? const Color(0xFFE7ECDC) : const Color(0xFF2B3320);
  final scheme = ColorScheme(
    brightness: b,
    primary: primary,
    onPrimary: dark ? const Color(0xFF1A1E16) : const Color(0xFFF3F6EC),
    secondary: gp.accent,
    onSecondary: surface,
    error: gp.danger,
    onError: Colors.white,
    surface: surface,
    onSurface: text,
  );
  final radius = BorderRadius.circular(12);
  return ThemeData(
    useMaterial3: true,
    brightness: b,
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    fontFamily: 'IRANYekanX',
    extensions: [gp],
    dividerColor: gp.border,
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: gp.border)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: gp.border)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: gp.border)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: gp.levels[3], width: 1.5)),
      labelStyle: TextStyle(color: gp.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 44),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: 'IRANYekanX', fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 44),
        foregroundColor: text,
        side: BorderSide(color: gp.border),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: 'IRANYekanX', fontWeight: FontWeight.w600),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: gp.surface2,
      indicatorColor: primary,
      selectedIconTheme: IconThemeData(color: scheme.onPrimary),
      unselectedIconTheme: IconThemeData(color: gp.muted),
      selectedLabelTextStyle: TextStyle(color: text, fontWeight: FontWeight.w700, fontFamily: 'IRANYekanX'),
      unselectedLabelTextStyle: TextStyle(color: gp.muted, fontFamily: 'IRANYekanX'),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      indicatorColor: gp.levels[1],
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 11, color: text, fontFamily: 'IRANYekanX')),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: primary,
      contentTextStyle: TextStyle(color: scheme.onPrimary, fontFamily: 'IRANYekanX'),
      shape: RoundedRectangleBorder(borderRadius: radius),
    ),
  );
}
