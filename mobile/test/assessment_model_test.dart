import 'package:flutter_test/flutter_test.dart';
import 'package:health_vibe_mobile/models/assessment_model.dart';

void main() {
  group('AssessmentModel Schema Parity Tests', () {
    test('Calculates physiological oxygen thresholds accurately', () {
      final criticalVitals = VitalsData(
        oxygenLevel: 85.0,
        temperature: 37.5,
        respiratoryRate: 24,
      );
      expect(criticalVitals.isCriticalOxygen, isTrue);
      expect(criticalVitals.isLowOxygen, isTrue);

      final moderateLowVitals = VitalsData(
        oxygenLevel: 90.0,
        temperature: 37.0,
        respiratoryRate: 20,
      );
      expect(moderateLowVitals.isCriticalOxygen, isFalse);
      expect(moderateLowVitals.isLowOxygen, isTrue);

      final normalVitals = VitalsData(
        oxygenLevel: 97.0,
        temperature: 36.8,
        respiratoryRate: 16,
      );
      expect(normalVitals.isCriticalOxygen, isFalse);
      expect(normalVitals.isLowOxygen, isFalse);
    });

    test('toApiPayload generates structure matching ASSESSMENT_SCHEMA.md v1.1.0', () {
      final assessment = AssessmentModel(
        caseId: 'case_test_101',
        patientId: 'usr_patient_abc',
        patientName: 'أحمد محمود',
        patientEmail: 'patient@example.com',
        clinicId: 'clinic_cairo',
        status: 'pending',
        vitals: VitalsData(
          oxygenLevel: 94.0,
          temperature: 37.2,
          respiratoryRate: 18,
        ),
        symptoms: SymptomsData(
          breathingDifficulty: 'mild',
          coughSeverity: 'moderate',
          durationDays: 3,
          chestPain: 'no',
          symptomProgression: 'stable',
        ),
        privacyConsent: PrivacyConsentData(
          accepted: true,
          version: 'HealthVibe-Privacy-v1.0',
        ),
        medications: 'Salbutamol',
        notes: 'Clinical intake note',
      );

      final payload = assessment.toApiPayload();

      expect(payload['caseId'], equals('case_test_101'));
      expect(payload['schemaVersion'], equals('1.0.0'));
      expect(payload['status'], equals('pending'));

      final consent = payload['privacyConsent'] as Map<String, dynamic>;
      expect(consent['accepted'], isTrue);
      expect(consent['version'], equals('HealthVibe-Privacy-v1.0'));

      final assessObj = payload['assessment'] as Map<String, dynamic>;
      final vitalsObj = assessObj['vitals'] as Map<String, dynamic>;
      expect(vitalsObj['oxygenLevel'], equals(94.0));
      expect(vitalsObj['unit'], equals('%'));
      expect(vitalsObj['temperature'], equals(37.2));
      expect(vitalsObj['respiratoryRate'], equals(18));

      final symptomsObj = assessObj['symptoms'] as Map<String, dynamic>;
      expect(symptomsObj['coughSeverity'], equals('moderate'));
      expect(symptomsObj['breathingDifficulty'], equals('mild'));
    });

    test('Deserializes backend assessment JSON with AI Triage', () {
      final backendJson = {
        'caseId': 'case_987654',
        'patientId': 'usr_patient_abc123',
        'patientName': 'أحمد محمد',
        'patientEmail': 'patient@example.com',
        'assignedDoctorId': 'usr_doctor_xyz789',
        'assignedDoctorName': 'د. منى سامي',
        'status': 'under_review',
        'assessment': {
          'vitals': {
            'oxygenLevel': 95.0,
            'isLowOxygen': false,
            'isCriticalOxygen': false,
            'temperature': 37.2,
            'respiratoryRate': 18,
          },
          'symptoms': {
            'breathingDifficulty': 'no',
            'coughSeverity': 'moderate',
            'durationDays': 3,
            'chestPain': 'no',
          },
          'aiTriage': {
            'priority': 'normal',
            'risk': 'منخفض',
            'riskEn': 'Low',
            'ruleScorePoints': 1,
            'triggeredRules': [
              {'id': 'moderate_cough'}
            ]
          }
        },
        'privacyConsent': {
          'accepted': true,
          'version': 'HealthVibe-Privacy-v1.0'
        }
      };

      final parsed = AssessmentModel.fromJson(backendJson);

      expect(parsed.caseId, equals('case_987654'));
      expect(parsed.assignedDoctorName, equals('د. منى سامي'));
      expect(parsed.status, equals('under_review'));
      expect(parsed.vitals.oxygenLevel, equals(95.0));
      expect(parsed.aiTriage?.priority, equals('normal'));
      expect(parsed.aiTriage?.riskEn, equals('Low'));
      expect(parsed.aiTriage?.triggeredRuleIds.contains('moderate_cough'), isTrue);
    });
  });
}
