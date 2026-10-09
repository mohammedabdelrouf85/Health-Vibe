import 'package:flutter_test/flutter_test.dart';
import 'package:health_vibe_mobile/models/clinical_report_model.dart';
import 'package:health_vibe_mobile/models/case_status_model.dart';

void main() {
  group('Clinical Report & Physician Provenance Tests', () {
    test('Parses certified doctor credentials and report integrity data', () {
      final reportJson = {
        'caseId': 'case_1790939832789_nuitv',
        'report': {
          'reference': 'HV-REP-89_NUITV',
          'doctor': {
            'name': 'د. منى سامي',
            'license': 'TEST-LICENSE-20491',
          },
          'diagnosis': 'تشخيص سجله الطبيب بعد المراجعة السريرية',
          'recommendations': 'متابعة تشبع الأكسجين يومياً واستخدام البخاخ عند اللزوم',
          'prescriptions': 'Salbutamol Inhaler 100mcg',
          'approvedAt': '2026-10-02T10:00:00.000Z',
          'verificationUrl': '/api/reports/verify/HV-REP-89_NUITV',
        },
        'patientName': 'طارق محمود',
        'patientAge': '38',
      };

      final report = ClinicalReportModel.fromJson(reportJson);

      expect(report.caseId, equals('case_1790939832789_nuitv'));
      expect(report.reportReference, equals('HV-REP-89_NUITV'));
      expect(report.doctorName, equals('د. منى سامي'));
      expect(report.doctorLicense, equals('TEST-LICENSE-20491'));
      expect(report.patientName, equals('طارق محمود'));
      expect(report.diagnosis, contains('تشخيص سجله الطبيب'));
      expect(report.verificationUrl, contains('/api/reports/verify/'));
    });

    test('CaseStatusHelper maps lifecycle states to appropriate keys and icons', () {
      expect(CaseStatusHelper.fromString('pending'), equals(CaseStatusType.pending));
      expect(CaseStatusHelper.fromString('under_review'), equals(CaseStatusType.underReview));
      expect(CaseStatusHelper.fromString('approved'), equals(CaseStatusType.approved));
      expect(CaseStatusHelper.fromString('needs_followup'), equals(CaseStatusType.needsFollowup));
      expect(CaseStatusHelper.fromString('closed'), equals(CaseStatusType.closed));

      expect(CaseStatusHelper.toKey(CaseStatusType.approved), equals('status_approved'));
      expect(CaseStatusHelper.toKey(CaseStatusType.pending), equals('status_pending'));
    });
  });
}
