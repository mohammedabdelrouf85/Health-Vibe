import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:health_vibe_mobile/core/localization/app_localizations.dart';

void main() {
  group('Localization & RTL Engine Tests', () {
    test('Arabic localization provides native RTL flag and clinical translations', () {
      final l10nAr = AppLocalizations(const Locale('ar'));

      expect(l10nAr.isRtl, isTrue);
      expect(l10nAr.translate('app_name'), equals('Health Vibe AI'));
      expect(l10nAr.translate('assessment_title'), contains('التقييم التنفسي'));
      expect(l10nAr.translate('status_approved'), contains('تم الاعتماد الطبي'));
      expect(l10nAr.translate('oxygen_level'), contains('نسبة تشبع الأكسجين'));
      expect(l10nAr.translate('emergency_warning_title'), contains('تنبيه سريري طارئ'));
    });

    test('English localization provides LTR flag and clinical translations', () {
      final l10nEn = AppLocalizations(const Locale('en'));

      expect(l10nEn.isRtl, isFalse);
      expect(l10nEn.translate('assessment_title'), equals('Respiratory Clinical Assessment'));
      expect(l10nEn.translate('status_pending'), equals('Pending Clinical Review'));
      expect(l10nEn.translate('doctor_credentials'), equals('Attending Physician Credentials'));
      expect(l10nEn.translate('emergency_warning_title'), equals('Clinical Emergency Alert'));
    });

    test('Falls back gracefully to English key if translation is missing', () {
      final l10n = AppLocalizations(const Locale('ar'));
      expect(l10n.translate('non_existent_key_xyz'), equals('non_existent_key_xyz'));
    });
  });
}
