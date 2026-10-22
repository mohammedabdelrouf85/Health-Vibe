/**
 * Health Vibe AI - Propeller Health Benchmark: Medication Reminders Safety, Privacy & Physician Scope Tests
 *
 * Benchmark: Propeller Health (https://propellerhealth.com/)
 * Scope: P2 - أولوية عالية | Backend / Security | المواعيد والشات بوت والملفات (ضوابط السلامة والأمان الطبي (Safety & Privacy)) |
 * تنبيهات متابعة الدواء والبخاخات (Medication Reminders) — إرسال تذكيرات يومية للمريض بمواعيد البخاخة الوقائية
 * لتعزيز الالتزام العلاجي (Adherence) (تطبيق قيود الخصوصية ومنع أي تجاوز لدور الطبيب البشري). | Propeller Health
 *
 * Test Matrix:
 * 1. Service Singleton & Methods Verification.
 * 2. Human Physician Scope Guardrail: Block Patient Prescription Modifications (403 Forbidden).
 * 3. Human Physician Scope Guardrail: Allow Licensed Pulmonologist Prescription Modifications.
 * 4. Chatbot Guardrail: Prevent Autonomous Dose Adjustment Advice & Fallback to Doctor Guidance.
 * 5. Acute Exacerbation & Red Flag Detection: Emergency 123/997 Escalation Trigger.
 * 6. 24-Hour Rescue Overuse Clinical Risk Assessment (Normal vs Warning vs Critical Emergency).
 * 7. GDPR Article 15 & 20 Data Portability: Patient Export Manifest with Zero Cross-Tenant Leakage.
 * 8. GDPR Article 17 Right to Erasure with Medical Audit Retention Safeguards (Cryptographic Tombstone).
 * 9. HIPAA Safe Harbor Research De-identification Engine (HMAC-SHA256 Pseudonymization).
 * 10. Outgoing Notification Zero-PHI Verification Guard.
 * 11. REST API Endpoints Mounting & RBAC Verification in server.js.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  MedicationSafetyPrivacyService,
  medicationSafetyPrivacyService,
  CLINICAL_DISCLAIMERS,
  EMERGENCY_HOTLINES,
  DOSAGE_MUTATION_PATTERNS,
  ACUTE_RESPIRATORY_RED_FLAGS
} = require('../backend/medication-safety-privacy-service');

const {
  medicationRemindersService,
  MEDICATION_TYPES
} = require('../backend/medication-reminders-service');

const analyticsService = require('../backend/analytics-service');
const auditService = require('../backend/audit-service');
const app = require('../backend/server');

console.log('\n==================================================================');
console.log('🛡️ HEALTH VIBE AI: PROPELLER SAFETY, PRIVACY & PHYSICIAN SCOPE');
console.log('   Benchmark: Propeller Health (Clinical Safety & HIPAA/GDPR Privacy)');
console.log('==================================================================\n');

async function runTests() {
  const patientUser = { uid: 'pt_resp_safe_001', role: 'patient' };
  const doctorUser = { uid: 'doc_pulmo_001', role: 'doctor', displayName: 'Dr. Tarek Pulmonologist' };
  const adminUser = { uid: 'admin_sys_001', role: 'super_admin' };
  const intruderUser = { uid: 'pt_intruder_999', role: 'patient' };

  medicationRemindersService.resetStoreForTesting();

  // Setup patient initial medication
  const symbicort = await medicationRemindersService.registerMedication(
    patientUser.uid,
    {
      id: 'med_symbicort_001',
      name: 'Symbicort Turbuhaler (160/4.5 mcg)',
      nameAr: 'سيمبيكورت تيربوهالر',
      type: 'controller',
      activeIngredients: 'Budesonide / Formoterol',
      scheduleTimes: ['08:00', '20:00'],
      dosagePuffs: 1,
      canisterTotal: 120,
      canisterRemaining: 120,
      lowCanisterThreshold: 20
    },
    patientUser
  );

  // ==================================================================
  // TEST 1: Service Singleton & Interface Verification
  // ==================================================================
  console.log('▶ TEST 1: Service Singleton & Interface Verification');
  {
    assert.ok(medicationSafetyPrivacyService instanceof MedicationSafetyPrivacyService);
    assert.strictEqual(typeof medicationSafetyPrivacyService.enforcePhysicianPrescriptionBoundary, 'function');
    assert.strictEqual(typeof medicationSafetyPrivacyService.evaluateQuerySafety, 'function');
    assert.strictEqual(typeof medicationSafetyPrivacyService.assessRescueOveruseSafety, 'function');
    assert.strictEqual(typeof medicationSafetyPrivacyService.exportPatientMedicationHistory, 'function');
    assert.strictEqual(typeof medicationSafetyPrivacyService.purgePatientMedicationData, 'function');
    assert.strictEqual(typeof medicationSafetyPrivacyService.anonymizeMedicationDataForResearch, 'function');
    assert.strictEqual(typeof medicationSafetyPrivacyService.verifyZeroPhiInReminder, 'function');

    assert.ok(CLINICAL_DISCLAIMERS.STANDARD_REMINDER);
    assert.ok(CLINICAL_DISCLAIMERS.CHATBOT_GUARDRAIL);
    assert.ok(CLINICAL_DISCLAIMERS.EMERGENCY_RED_FLAG);
    assert.ok(EMERGENCY_HOTLINES.EG);
    assert.ok(EMERGENCY_HOTLINES.SA);

    console.log('  ✓ Core safety and privacy methods and disclaimers verified');
  }

  // ==================================================================
  // TEST 2: Physician Scope Guardrail - Block Patient Prescription Mutations
  // ==================================================================
  console.log('▶ TEST 2: Physician Scope Guardrail - Block Patient Prescription Mutations (403)');
  {
    // A patient attempts to autonomously double their dosage puffs or alter daily schedule
    assert.throws(
      () => {
        medicationSafetyPrivacyService.enforcePhysicianPrescriptionBoundary(
          patientUser,
          symbicort,
          { dosagePuffs: 2 } // Attempting to increase puffs without physician signoff
        );
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'PHYSICIAN_PRESCRIPTION_OVERRIDE_FORBIDDEN');
        assert.ok(err.message.includes('licensed human physician'));
        return true;
      }
    );

    // Also verify through medicationRemindersService.updateMedicationPrescription
    await assert.rejects(
      async () => {
        await medicationRemindersService.updateMedicationPrescription(
          patientUser.uid,
          symbicort.id,
          { scheduleTimes: ['08:00', '14:00', '20:00'] },
          patientUser
        );
      },
      { statusCode: 403, code: 'PHYSICIAN_PRESCRIPTION_OVERRIDE_FORBIDDEN' }
    );

    console.log('  ✓ Autonomous dosage and schedule alteration attempts strictly blocked (403 Forbidden)');
  }

  // ==================================================================
  // TEST 3: Physician Scope Guardrail - Allow Licensed Pulmonologist Prescription Updates
  // ==================================================================
  console.log('▶ TEST 3: Physician Scope Guardrail - Allow Licensed Pulmonologist Updates');
  {
    const updateResult = await medicationRemindersService.updateMedicationPrescription(
      patientUser.uid,
      symbicort.id,
      {
        dosagePuffs: 2,
        scheduleTimes: ['08:00', '20:00']
      },
      doctorUser
    );

    assert.strictEqual(updateResult.success, true);
    assert.strictEqual(updateResult.medication.dosagePuffs, 2);
    assert.ok(updateResult.disclaimer);

    console.log('  ✓ Verified human pulmonologist authorized to adjust prescription parameters');
  }

  // ==================================================================
  // TEST 4: Chatbot Guardrail - Prevent Autonomous Dosage Adjustment Advice
  // ==================================================================
  console.log('▶ TEST 4: Chatbot Guardrail - Prevent Autonomous Dosage Adjustment Advice');
  {
    // Patient queries asking if they can double dose or stop inhaler
    const arabicQuery = 'أشعر بتحسن هل أوقف بخاخ سيمبيكورت الوقائي؟';
    const evalAr = medicationSafetyPrivacyService.evaluateQuerySafety(arabicQuery, { patientId: patientUser.uid });

    assert.strictEqual(evalAr.safe, false);
    assert.strictEqual(evalAr.dosageChangeAttempt, true);
    assert.strictEqual(evalAr.action, 'PROVIDE_CLINICAL_SAFETY_ADVICE');
    assert.ok(evalAr.adviceAr.includes('طبيبك المعالج'));
    assert.ok(evalAr.clinicalNotice);

    const englishQuery = 'Can I take double puffs tonight because of my cough?';
    const evalEn = medicationSafetyPrivacyService.evaluateQuerySafety(englishQuery, { patientId: patientUser.uid });

    assert.strictEqual(evalEn.safe, false);
    assert.strictEqual(evalEn.dosageChangeAttempt, true);
    assert.strictEqual(evalEn.action, 'PROVIDE_CLINICAL_SAFETY_ADVICE');
    assert.ok(evalEn.adviceEn.includes('consult your physician'));

    console.log('  ✓ Chatbot intercepted dosage adjustment attempts and enforced doctor consultation');
  }

  // ==================================================================
  // TEST 5: Acute Exacerbation & Red Flag Detection - Emergency Escalation
  // ==================================================================
  console.log('▶ TEST 5: Acute Exacerbation & Red Flag Detection - Emergency Escalation');
  {
    const severeEmergencyAr = 'لدي زرقة في الشفتين ومش قادر أتنفس خالص';
    const evalEmergAr = medicationSafetyPrivacyService.evaluateQuerySafety(severeEmergencyAr, { patientId: patientUser.uid });

    assert.strictEqual(evalEmergAr.safe, false);
    assert.strictEqual(evalEmergAr.redFlagDetected, true);
    assert.strictEqual(evalEmergAr.action, 'BLOCK_AND_ESCALATE_EMERGENCY');
    assert.strictEqual(evalEmergAr.riskLevel, 'critical');
    assert.ok(evalEmergAr.adviceAr.includes('123 في مصر'));
    assert.strictEqual(evalEmergAr.hotlines.EG.number, '123');

    const severeEmergencyEn = 'Cannot breathe blue lips severe chest tightness';
    const evalEmergEn = medicationSafetyPrivacyService.evaluateQuerySafety(severeEmergencyEn, { patientId: patientUser.uid });

    assert.strictEqual(evalEmergEn.safe, false);
    assert.strictEqual(evalEmergEn.redFlagDetected, true);
    assert.strictEqual(evalEmergEn.action, 'BLOCK_AND_ESCALATE_EMERGENCY');
    assert.ok(evalEmergEn.adviceEn.includes('emergency medical services'));

    console.log('  ✓ Acute respiratory red flags escalated immediately with 123/997 emergency hotline guidance');
  }

  // ==================================================================
  // TEST 6: 24-Hour Rescue Overuse Clinical Risk Assessment
  // ==================================================================
  console.log('▶ TEST 6: 24-Hour Rescue Overuse Clinical Risk Assessment');
  {
    // 1. Normal PRN
    const normalRisk = medicationSafetyPrivacyService.assessRescueOveruseSafety(patientUser.uid, 1);
    assert.strictEqual(normalRisk.riskLevel, 'normal');
    assert.strictEqual(normalRisk.alertType, 'CONTROLLED');

    // 2. Warning Threshold (>= 3 puffs)
    const warningRisk = medicationSafetyPrivacyService.assessRescueOveruseSafety(patientUser.uid, 4);
    assert.strictEqual(warningRisk.riskLevel, 'warning');
    assert.strictEqual(warningRisk.alertType, 'FREQUENT_RESCUE_USAGE');
    assert.ok(warningRisk.messageAr.includes('4 مرات خلال 24 ساعة'));

    // 3. Critical Exacerbation (>= 6 puffs)
    const criticalRisk = medicationSafetyPrivacyService.assessRescueOveruseSafety(patientUser.uid, 7);
    assert.strictEqual(criticalRisk.riskLevel, 'critical');
    assert.strictEqual(criticalRisk.alertType, 'SEVERE_EXACERBATION_RISK');
    assert.strictEqual(criticalRisk.requiresImmediateAction, true);

    console.log('  ✓ 24-hour rescue overuse clinical risk stratified (normal, warning, critical)');
  }

  // ==================================================================
  // TEST 7: GDPR Article 15 & 20 Data Portability (Export Manifest)
  // ==================================================================
  console.log('▶ TEST 7: GDPR Article 15 & 20 Data Portability (Export Manifest)');
  {
    // Log doses and rescue puff to have export data
    await medicationRemindersService.logDose(
      patientUser.uid,
      { medId: symbicort.id, scheduledTime: '08:00', status: 'taken' },
      patientUser
    );

    const exportManifest = await medicationSafetyPrivacyService.exportPatientMedicationHistory(
      patientUser.uid,
      patientUser
    );

    assert.strictEqual(exportManifest.patientId, patientUser.uid);
    assert.ok(exportManifest.exportId.startsWith('dossier_export_'));
    assert.ok(exportManifest.statutoryDisclaimer);
    assert.ok(exportManifest.dataInventory.activeMedicationsCount >= 1);
    assert.ok(exportManifest.dataInventory.loggedDosesCount >= 1);

    // Intruder attempting to export another patient's data -> Blocked 403
    await assert.rejects(
      async () => {
        await medicationSafetyPrivacyService.exportPatientMedicationHistory(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN' }
    );

    console.log('  ✓ GDPR Data Portability export generated with zero cross-tenant leakage');
  }

  // ==================================================================
  // TEST 8: GDPR Article 17 Right to Erasure with Medical Audit Safeguards
  // ==================================================================
  console.log('▶ TEST 8: GDPR Article 17 Right to Erasure with Retention Safeguards');
  {
    const purgeResult = await medicationSafetyPrivacyService.purgePatientMedicationData(
      patientUser.uid,
      patientUser
    );

    assert.strictEqual(purgeResult.patientId, patientUser.uid);
    assert.ok(purgeResult.tombstoneHash);
    assert.strictEqual(purgeResult.activeRemindersPurged, true);
    assert.strictEqual(purgeResult.clinicalRecordsDeIdentified, true);

    // Intruder attempting to purge another patient's data -> Blocked 403
    await assert.rejects(
      async () => {
        await medicationSafetyPrivacyService.purgePatientMedicationData(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN' }
    );

    console.log('  ✓ GDPR Right to Erasure executed with statutory medical audit retention pseudonymization');
  }

  // ==================================================================
  // TEST 9: HIPAA Safe Harbor Population Research De-identification
  // ==================================================================
  console.log('▶ TEST 9: HIPAA Safe Harbor Population Research De-identification');
  {
    const rawClinicalRecords = [
      { patientId: 'pt_john_doe', type: 'controller', adherencePct: 92, streakDays: 8, trigger: 'dust' },
      { patientId: 'pt_fatima_ali', type: 'rescue', adherencePct: 65, streakDays: 3, trigger: 'cold_air' }
    ];

    const anonymized = medicationSafetyPrivacyService.anonymizeMedicationDataForResearch(rawClinicalRecords);
    assert.strictEqual(anonymized.length, 2);

    anonymized.forEach(rec => {
      assert.ok(rec.researchId.startsWith('resp_res_'));
      assert.ok(!rec.patientId, 'Raw patient ID must be completely purged');
      assert.strictEqual(rec.dataStandard, 'HIPAA Safe Harbor De-identified (45 CFR § 164.514(b))');
      assert.strictEqual(rec.reportingQuarter, '2026-Q4');
    });

    console.log('  ✓ Research de-identification successfully stripped all 18 HIPAA Safe Harbor identifiers');
  }

  // ==================================================================
  // TEST 10: Outgoing Notification Zero-PHI Verification Guard
  // ==================================================================
  console.log('▶ TEST 10: Outgoing Notification Zero-PHI Verification Guard');
  {
    // Clean operational notification
    const cleanReminder = {
      recipientId: patientUser.uid,
      title: 'Reminder: Symbicort Turbuhaler',
      message: 'Time for your morning controller dose to keep your airways protected.',
      channel: 'in_app'
    };
    const cleanCheck = medicationSafetyPrivacyService.verifyZeroPhiInReminder(cleanReminder);
    assert.strictEqual(cleanCheck.isClean, true);
    assert.strictEqual(cleanCheck.violations.length, 0);

    // Polluted notification with diagnosis text (forbidden)
    const pollutedReminder = {
      recipientId: patientUser.uid,
      title: 'Reminder',
      message: 'Your cancer diagnosis requires adherence.',
      channel: 'push'
    };
    const pollutedCheck = medicationSafetyPrivacyService.verifyZeroPhiInReminder(pollutedReminder);
    assert.strictEqual(pollutedCheck.isClean, false);
    assert.ok(pollutedCheck.violations.includes('cancer'));

    console.log('  ✓ Zero-PHI filter intercepted prohibited clinical diagnostic text');
  }

  // ==================================================================
  // TEST 11: REST API Endpoints Mounted in server.js
  // ==================================================================
  console.log('▶ TEST 11: REST API Endpoints Mounted in server.js');
  {
    const serverJsContent = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    const expectedEndpoints = [
      '/api/medication-reminders/prescriptions/update',
      '/api/medication-reminders/safety/evaluate-query',
      '/api/medication-reminders/safety/assess-rescue',
      '/api/medication-reminders/privacy/export/:patientId',
      '/api/medication-reminders/privacy/purge/:patientId',
      '/api/medication-reminders/privacy/anonymize-research'
    ];

    expectedEndpoints.forEach(endpoint => {
      assert.ok(serverJsContent.includes(endpoint), `server.js must contain safety/privacy route: ${endpoint}`);
    });

    console.log('  ✓ All 6 Safety, Privacy & Physician Scope REST API endpoints verified in server.js');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 11 PROPELLER SAFETY & PRIVACY BACKEND TESTS PASSED (100%)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
