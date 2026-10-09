import 'package:flutter/material.dart';

class AppColors {
  // Brand Primary & Accents
  static const Color primary = Color(0xFF0F766E); // Medical Deep Teal
  static const Color primaryDark = Color(0xFF115E59);
  static const Color primaryLight = Color(0xFFCCFBF1);
  static const Color secondary = Color(0xFF0284C7); // Clinical Blue
  static const Color accent = Color(0xFF06B6D4);

  // Status & Triage Colors
  static const Color statusPending = Color(0xFFD97706); // Amber
  static const Color statusUnderReview = Color(0xFF2563EB); // Royal Blue
  static const Color statusApproved = Color(0xFF059669); // Emerald Green
  static const Color statusNeedsFollowup = Color(0xFFDC2626); // Crimson Red
  static const Color statusClosed = Color(0xFF6B7280); // Cool Grey

  // Priority Triage Colors
  static const Color triageCritical = Color(0xFFDC2626);
  static const Color triageHigh = Color(0xFFEA580C);
  static const Color triageModerate = Color(0xFFD97706);
  static const Color triageNormal = Color(0xFF059669);

  // Neutral & Surfaces
  static const Color backgroundLight = Color(0xFFF8FAFC);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color cardBorder = Color(0xFFE2E8F0);
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textMuted = Color(0xFF94A3B8);

  // Dark Theme Surfaces
  static const Color backgroundDark = Color(0xFF0B1120);
  static const Color surfaceDark = Color(0xFF1E293B);
  static const Color cardBorderDark = Color(0xFF334155);
  static const Color textPrimaryDark = Color(0xFFF1F5F9);
  static const Color textSecondaryDark = Color(0xFF94A3B8);
}
