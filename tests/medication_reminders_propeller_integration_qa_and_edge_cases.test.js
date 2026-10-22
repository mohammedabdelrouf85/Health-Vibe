/**
 * Health Vibe AI - Propeller Health Benchmark: Medication Reminders Integration QA & Edge Cases Test Suite
 * Benchmark: Propeller Health (https://propellerhealth.com/)
 *
 * Scope: P2 - أولوية عالية | QA / Medical Research | المواعيد والشات بوت والملفات (اختبار التكامل والحالات الحدية (Integration QA)) |
 * تنبيهات متابعة الدواء والبخاخات (Medication Reminders) — إرسال تذكيرات يومية للمريض بمواعيد البخاخة الوقائية
 * لتعزيز الالتزام العلاجي (Adherence) (اختبار عمل الميزة مع باقي أجزاء النظام باللغتين العربية والإنجليزية).
 *
 * Test Matrix (13 Rigorous Scenarios):
 * 1. End-to-End Appointments Integration: Pre-visit clinical adherence dossier attached to consultation.
 * 2. End-to-End Chatbot Assistant Integration: Context generation, 1-tap dose confirmation, quick rescue logging.
 * 3. Chatbot Clinical Guardrail & Emergency Escalation (Bilingual Arabic & English).
 * 4. Private Cloud Files & Digital Prescription Linkage & GDPR Export Integration.
 * 5. Boundary Condition: Day 0 / Fresh Inhaler with 0 Doses Logged (Zero Division / NaN Guard).
 * 6. Boundary Condition: Canister Puff Exhaustion & Negative Underflow Prevention (Floor at 0).
 * 7. Boundary Condition: Canister Refill Variations (Custom Sample vs Full Canister Reset).
 * 8. Idempotency Guard: Daily Reminder Batch Dispatching (Zero Duplicate Dispatches).
 * 9. Clinical Exacerbation Escalation: Rescue Inhaler Usage Stratification (1 puff -> 4 puffs -> 7 puffs).
 * 10. Longitudinal Streak Engine Resilience (Consecutive Days vs Broken Day).
 * 11. Zero-Trust RBAC & Cross-Patient Privacy Walls (403 Forbidden on Breach Attempts).
 * 12. Relational Database Sync & Health Check Metrics Verification.
 * 13. 100% Bilingual Parity across all 26 medicationReminders i18n Catalog Keys & Disclaimers.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  MedicationRemindersService,
  medicationRemindersService,
  MEDICATION_TYPES,
  DOSE_STATUS,
  ADHERENCE_BANDS,
  RESCUE_TRIGGERS
} = require('../backend/medication-reminders-service');

const {
  MedicationSafetyPrivacyService,
  medicationSafetyPrivacyService,
  CLINICAL_DISCLAIMERS,
  EMERGENCY_HOTLINES
} = require('../backend/medication-safety-privacy-service');

const { relationalDbService } = require('../backend/relational-db-service');
const analyticsService = require('../backend/analytics-service');
const notificationService = require('../backend/notification-service');
const { translations } = require('../app/i18n.js');
const app = require('../backend/server');

console.log('\n==================================================================');
console.log('🧪 HEALTH VIBE AI: PROPELLER INHALER REMINDERS INTEGRATION QA');
console.log('   Benchmark: Propeller Health (Appointments, Chatbot & Files)');
console.log('==================================================================\n');

async function runIntegrationQaSuite() {
  const patientUser = { uid: 'pt_propeller_qa_001', role: 'patient', displayName: 'Ahmed Mansour' };
  const doctorUser = { uid: 'doc_pulmo_qa_001', role: 'doctor', displayName: 'Dr. Sarah Pulmo' };
  const intruderUser = { uid: 'pt_intruder_qa_999', role: 'patient', displayName: 'Intruder User' };

  medicationRemindersService.resetStoreForTesting();

  // -----------------------------------------------------------------------------
  // TEST 1: End-to-End Appointments Integration (Pre-Visit Adherence Dossier)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: End-to-End Appointments Integration (Pre-Visit Adherence Dossier)');
  {
    // Register controller and rescue inhalers
    const symbicort = await medicationRemindersService.registerMedication(
      patientUser.uid,
      {
        id: 'med_symbicort_qa',
        name: 'Symbicort Turbuhaler (160/4.5 mcg)',
        nameAr: 'سيمبيكورت تيربوهالر',
        type: 'controller',
        scheduleTimes: ['08:00', '20:00'],
        dosagePuffs: 1,
        canisterTotal: 120,
        canisterRemaining: 120,
        lowCanisterThreshold: 20
      },
      patientUser
    );

    const ventolin = await medicationRemindersService.registerMedication(
      patientUser.uid,
      {
        id: 'med_ventolin_qa',
        name: 'Ventolin Inhaler (100 mcg)',
        nameAr: 'بخاخ فينتولين الإسعافي',
        type: 'rescue',
        dosagePuffs: 2,
        canisterTotal: 200,
        canisterRemaining: 200,
        lowCanisterThreshold: 20
      },
      patientUser
    );

    // Simulate 14 days of doses
    for (let i = 1; i <= 12; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      await medicationRemindersService.logDose(
        patientUser.uid,
        { medId: symbicort.id, scheduledTime: '08:00', scheduledDate: dateStr, status: 'taken' },
        patientUser
      );
      await medicationRemindersService.logDose(
        patientUser.uid,
        { medId: symbicort.id, scheduledTime: '20:00', scheduledDate: dateStr, status: 'taken' },
        patientUser
      );
    }

    // 1 missed dose
    const missedDate = new Date();
    missedDate.setDate(missedDate.getDate() - 13);
    await medicationRemindersService.logDose(
      patientUser.uid,
      { medId: symbicort.id, scheduledTime: '08:00', scheduledDate: missedDate.toISOString().split('T')[0], status: 'skipped' },
      patientUser
    );

    // Pulmonologist accesses pre-visit consultation dossier
    const dossier = await medicationRemindersService.getPreVisitAdherenceDossier(patientUser.uid, doctorUser);

    assert.strictEqual(dossier.patientId, patientUser.uid);
    assert.ok(dossier.adherenceScore >= 80, `Expected >=80% adherence, got ${dossier.adherenceScore}%`);
    assert.strictEqual(dossier.adherenceBand, ADHERENCE_BANDS.EXCELLENT);
    assert.ok(dossier.streakDays >= 1);
    assert.ok(dossier.clinicalNote.includes('High adherence'));
    assert.ok(dossier.statutoryDisclaimer);
    assert.strictEqual(dossier.activeInhalers.length, 2);

    console.log(`  ✓ Pre-visit dossier generated for Pulmonologist: ${dossier.adherenceScore}% adherence, ${dossier.streakDays}d streak`);
  }

  // -----------------------------------------------------------------------------
  // TEST 2: End-to-End Chatbot Assistant Integration (Real-time Context & 1-Tap Logs)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 2: End-to-End Chatbot Assistant Integration (Real-time Context & 1-Tap Logs)');
  {
    const chatContext = await medicationRemindersService.getChatbotReminderContext(patientUser.uid);

    assert.strictEqual(chatContext.patientId, patientUser.uid);
    assert.ok(chatContext.adherencePct >= 80);
    assert.ok(chatContext.nextScheduledDose);
    assert.strictEqual(chatContext.nextScheduledDose.medName, 'Symbicort Turbuhaler (160/4.5 mcg)');
    assert.deepStrictEqual(chatContext.nextScheduledDose.scheduledTimes, ['08:00', '20:00']);
    assert.ok(chatContext.clinicalNotice);
    assert.ok(chatContext.statutoryDisclaimer);

    // Chatbot 1-Tap dose confirmation action
    const doseLog = await medicationRemindersService.logDose(
      patientUser.uid,
      {
        medId: chatContext.nextScheduledDose.medId,
        scheduledTime: '08:00',
        status: DOSE_STATUS.TAKEN
      },
      patientUser
    );

    assert.strictEqual(doseLog.success, true);
    assert.strictEqual(doseLog.dose.status, DOSE_STATUS.TAKEN);

    // Chatbot quick rescue logging action
    const rescueLog = await medicationRemindersService.logRescuePuff(
      patientUser.uid,
      {
        medId: 'med_ventolin_qa',
        puffs: 2,
        trigger: 'cold_air'
      },
      patientUser
    );

    assert.strictEqual(rescueLog.success, true);
    assert.strictEqual(rescueLog.entry.trigger, 'cold_air');

    console.log('  ✓ Chatbot context generation, 1-tap dose log, and rescue puff action confirmed');
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Chatbot Clinical Safety Guardrail & Emergency Escalation (AR & EN)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 3: Chatbot Clinical Safety Guardrail & Emergency Escalation (AR & EN)');
  {
    // Arabic dosage change inquiry
    const arDosageQuery = 'هل أزيد جرعة سيمبيكورت اليوم؟';
    const evalAr = medicationSafetyPrivacyService.evaluateQuerySafety(arDosageQuery, { patientId: patientUser.uid });
    assert.strictEqual(evalAr.safe, false);
    assert.strictEqual(evalAr.dosageChangeAttempt, true);
    assert.strictEqual(evalAr.action, 'PROVIDE_CLINICAL_SAFETY_ADVICE');
    assert.ok(evalAr.adviceAr.includes('طبيبك المعالج'));

    // English dosage change inquiry
    const enDosageQuery = 'Can I take extra puffs of Symbicort?';
    const evalEn = medicationSafetyPrivacyService.evaluateQuerySafety(enDosageQuery, { patientId: patientUser.uid });
    assert.strictEqual(evalEn.safe, false);
    assert.strictEqual(evalEn.dosageChangeAttempt, true);
    assert.strictEqual(evalEn.action, 'PROVIDE_CLINICAL_SAFETY_ADVICE');
    assert.ok(evalEn.adviceEn.includes('consult your physician'));

    // Arabic emergency red flag
    const arEmergencyQuery = 'لدي صعوبة شديدة في التنفس وزرقة في شفتي';
    const evalEmergAr = medicationSafetyPrivacyService.evaluateQuerySafety(arEmergencyQuery, { patientId: patientUser.uid });
    assert.strictEqual(evalEmergAr.safe, false);
    assert.strictEqual(evalEmergAr.redFlagDetected, true);
    assert.strictEqual(evalEmergAr.action, 'BLOCK_AND_ESCALATE_EMERGENCY');
    assert.strictEqual(evalEmergAr.riskLevel, 'critical');
    assert.ok(evalEmergAr.adviceAr.includes('123 في مصر'));
    assert.strictEqual(evalEmergAr.hotlines.EG.number, '123');

    // English emergency red flag
    const enEmergencyQuery = 'I cannot breathe and my lips are turning blue';
    const evalEmergEn = medicationSafetyPrivacyService.evaluateQuerySafety(enEmergencyQuery, { patientId: patientUser.uid });
    assert.strictEqual(evalEmergEn.safe, false);
    assert.strictEqual(evalEmergEn.redFlagDetected, true);
    assert.strictEqual(evalEmergEn.action, 'BLOCK_AND_ESCALATE_EMERGENCY');
    assert.ok(evalEmergEn.adviceEn.includes('emergency medical services'));

    console.log('  ✓ Bilingual Chatbot safety guardrail and acute emergency escalation validated');
  }

  // -----------------------------------------------------------------------------
  // TEST 4: Private Cloud Files & Digital Prescription Linkage & GDPR Export
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 4: Private Cloud Files & Digital Prescription Linkage & GDPR Export');
  {
    // Register medication linked with digital prescription file
    const seretide = await medicationRemindersService.registerMedication(
      patientUser.uid,
      {
        id: 'med_seretide_doc_link',
        name: 'Seretide Diskus (250/50 mcg)',
        nameAr: 'سيريتيد ديسكس',
        type: 'controller',
        prescriptionFileId: 'file_rx_pulmo_2026_0911',
        photoId: 'photo_inhaler_box_7721'
      },
      patientUser
    );

    assert.strictEqual(seretide.id, 'med_seretide_doc_link');

    // Export complete patient GDPR dossier
    const exportData = await medicationSafetyPrivacyService.exportPatientMedicationHistory(
      patientUser.uid,
      patientUser
    );

    assert.ok(exportData.exportId);
    assert.ok(exportData.dataInventory.activeMedicationsCount >= 2);
    assert.ok(exportData.dataInventory.loggedDosesCount >= 10);
    assert.ok(exportData.statutoryDisclaimer);

    console.log(`  ✓ Digital prescription linkage confirmed & ${exportData.dataInventory.loggedDosesCount} doses exported in GDPR manifest`);
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Boundary Condition: Day 0 / Fresh Inhaler with 0 Doses Logged
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 5: Boundary Condition: Day 0 / Fresh Inhaler with 0 Doses Logged (Zero Division Guard)');
  {
    const freshPatientId = 'pt_fresh_day0_001';
    await medicationRemindersService.registerMedication(
      freshPatientId,
      {
        id: 'med_fresh_inhaler',
        name: 'Spiriva Respimat (2.5 mcg)',
        type: 'controller'
      },
      { uid: freshPatientId, role: 'patient' }
    );

    // Calculate adherence with 0 doses logged
    const freshAdherence = await medicationRemindersService.calculateAdherence(
      freshPatientId,
      { days: 7 },
      { uid: freshPatientId, role: 'patient' }
    );

    assert.strictEqual(isNaN(freshAdherence.adherencePct), false, 'adherencePct must not be NaN');
    assert.strictEqual(freshAdherence.adherencePct, 100, 'Zero scheduled doses should evaluate to 100% clean baseline');
    assert.strictEqual(freshAdherence.scheduledDoses, 0);
    assert.strictEqual(freshAdherence.takenDoses, 0);
    assert.strictEqual(freshAdherence.rescuePast7Days, 0);
    assert.strictEqual(freshAdherence.controllerToRescueRatio, 'Optimal (Zero Rescue)');

    console.log('  ✓ Day 0 zero doses logged handled cleanly without NaN or division by zero');
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Boundary Condition: Canister Puff Exhaustion & Negative Underflow Prevention
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 6: Boundary Condition: Canister Puff Exhaustion & Negative Underflow Prevention');
  {
    const almostEmptyPatient = 'pt_exhaust_001';
    const lowMed = await medicationRemindersService.registerMedication(
      almostEmptyPatient,
      {
        id: 'med_almost_empty',
        name: 'Ventolin PRN Exhaust Test',
        type: 'rescue',
        dosagePuffs: 2,
        canisterTotal: 10,
        canisterRemaining: 2,
        lowCanisterThreshold: 20
      },
      { uid: almostEmptyPatient, role: 'patient' }
    );

    // Deduct 2 puffs (remaining = 0)
    const log1 = await medicationRemindersService.logRescuePuff(
      almostEmptyPatient,
      { medId: lowMed.id, puffs: 2 },
      { uid: almostEmptyPatient, role: 'patient' }
    );
    assert.strictEqual(log1.canisterRemaining, 0);

    // Deduct 2 more puffs (should NOT become negative, must floor at 0)
    const log2 = await medicationRemindersService.logRescuePuff(
      almostEmptyPatient,
      { medId: lowMed.id, puffs: 2 },
      { uid: almostEmptyPatient, role: 'patient' }
    );
    assert.strictEqual(log2.canisterRemaining, 0, 'Canister puffs must never underflow below 0');

    console.log('  ✓ Canister exhaustion and underflow floor at 0 puffs verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Boundary Condition: Canister Refill Variations (Custom Sample vs Full Reset)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 7: Boundary Condition: Canister Refill Variations (Custom Sample vs Full Reset)');
  {
    // Custom refill (e.g. 60 puffs hospital sample)
    const customRefill = await medicationRemindersService.refillCanister(
      patientUser.uid,
      'med_symbicort_qa',
      60,
      patientUser
    );
    assert.strictEqual(customRefill.canisterRemaining, 60);

    // Full canister reset (omitting customPuffs restores full canisterTotal 120)
    const fullRefill = await medicationRemindersService.refillCanister(
      patientUser.uid,
      'med_symbicort_qa',
      null,
      patientUser
    );
    assert.strictEqual(fullRefill.canisterRemaining, 120);
    assert.strictEqual(fullRefill.canisterTotal, 120);

    console.log('  ✓ Custom refill (60 puffs) and full canister reset (120 puffs) verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 8: Idempotency Guard: Daily Reminder Batch Dispatching
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 8: Idempotency Guard: Daily Reminder Batch Dispatching');
  {
    const todayStr = '2026-10-22';
    // Run 1
    const run1 = await medicationRemindersService.dispatchDailyReminders(todayStr);
    assert.strictEqual(run1.success, true);
    assert.ok(run1.remindersDispatched >= 1);

    // Run 2 (Same date - must recognize existing reminders and dispatch 0 duplicates)
    const run2 = await medicationRemindersService.dispatchDailyReminders(todayStr);
    assert.strictEqual(run2.success, true);
    assert.strictEqual(run2.remindersDispatched, 0, 'Duplicate reminder batch must be idempotently suppressed');

    console.log(`  ✓ Idempotency guard: Run 1 dispatched ${run1.remindersDispatched}, Run 2 dispatched 0 duplicates`);
  }

  // -----------------------------------------------------------------------------
  // TEST 9: Clinical Exacerbation Escalation: Rescue Inhaler Usage Stratification
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 9: Clinical Exacerbation Escalation: Rescue Inhaler Usage Stratification');
  {
    const rescuePatient = 'pt_exacerbation_qa_001';
    await medicationRemindersService.registerMedication(
      rescuePatient,
      { id: 'med_vent_strat', name: 'Ventolin', type: 'rescue' },
      { uid: rescuePatient, role: 'patient' }
    );

    // Stage 1: 1 puff (normal)
    const stage1 = await medicationRemindersService.logRescuePuff(
      rescuePatient,
      { medId: 'med_vent_strat', puffs: 1, trigger: 'dust' },
      { uid: rescuePatient, role: 'patient' }
    );
    assert.strictEqual(stage1.safetyAlertTriggered, false);
    assert.strictEqual(stage1.safetyAssessment.riskLevel, 'normal');

    // Stage 2: 2 more puffs (total 3 in 24h -> Warning threshold)
    const stage2 = await medicationRemindersService.logRescuePuff(
      rescuePatient,
      { medId: 'med_vent_strat', puffs: 2, trigger: 'cold_air' },
      { uid: rescuePatient, role: 'patient' }
    );
    assert.strictEqual(stage2.safetyAlertTriggered, true);
    assert.strictEqual(stage2.safetyAssessment.riskLevel, 'warning');
    assert.strictEqual(stage2.safetyAssessment.alertType, 'FREQUENT_RESCUE_USAGE');

    // Stage 3: 4 more puffs (total 7 in 24h -> Critical emergency)
    const stage3 = await medicationRemindersService.logRescuePuff(
      rescuePatient,
      { medId: 'med_vent_strat', puffs: 4, trigger: 'acute_cough' },
      { uid: rescuePatient, role: 'patient' }
    );
    assert.strictEqual(stage3.safetyAlertTriggered, true);
    assert.strictEqual(stage3.safetyAssessment.riskLevel, 'critical');
    assert.strictEqual(stage3.safetyAssessment.alertType, 'SEVERE_EXACERBATION_RISK');
    assert.strictEqual(stage3.safetyAssessment.requiresImmediateAction, true);

    console.log('  ✓ Multi-stage clinical exacerbation escalation: normal -> warning (>=3) -> critical emergency (>=6)');
  }

  // -----------------------------------------------------------------------------
  // TEST 10: Longitudinal Streak Engine Resilience (Consecutive vs Broken Days)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 10: Longitudinal Streak Engine Resilience (Consecutive vs Broken Days)');
  {
    const streakPatient = 'pt_streak_qa_001';
    const streakMed = await medicationRemindersService.registerMedication(
      streakPatient,
      { id: 'med_streak_test', name: 'Symbicort Streak Test', type: 'controller' },
      { uid: streakPatient, role: 'patient' }
    );

    // Log 4 consecutive taken days
    for (let i = 0; i < 4; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      await medicationRemindersService.logDose(
        streakPatient,
        { medId: streakMed.id, scheduledTime: '08:00', scheduledDate: d.toISOString().split('T')[0], status: 'taken' },
        { uid: streakPatient, role: 'patient' }
      );
    }

    const adherence4d = await medicationRemindersService.calculateAdherence(
      streakPatient,
      { days: 7 },
      { uid: streakPatient, role: 'patient' }
    );
    assert.strictEqual(adherence4d.streakDays, 4);

    // Day 5 has skipped dose -> Streak must break at 4
    const d5 = new Date();
    d5.setDate(d5.getDate() - 4);
    await medicationRemindersService.logDose(
      streakPatient,
      { medId: streakMed.id, scheduledTime: '08:00', scheduledDate: d5.toISOString().split('T')[0], status: 'skipped' },
      { uid: streakPatient, role: 'patient' }
    );

    const adherenceBroken = await medicationRemindersService.calculateAdherence(
      streakPatient,
      { days: 7 },
      { uid: streakPatient, role: 'patient' }
    );
    assert.strictEqual(adherenceBroken.streakDays, 4, 'Streak should count consecutive streak prior to break');

    console.log(`  ✓ Streak resilience confirmed: 4-day continuous streak preserved against historical gap`);
  }

  // -----------------------------------------------------------------------------
  // TEST 11: Zero-Trust RBAC & Cross-Patient Privacy Isolation (403 Forbidden)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 11: Zero-Trust RBAC & Cross-Patient Privacy Isolation (403 Forbidden)');
  {
    // Intruder trying to view patient medications
    await assert.rejects(
      async () => {
        await medicationRemindersService.getPatientMedications(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN' }
    );

    // Intruder trying to export patient GDPR data
    await assert.rejects(
      async () => {
        await medicationSafetyPrivacyService.exportPatientMedicationHistory(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN' }
    );

    // Patient trying to modify prescription parameters autonomously
    await assert.rejects(
      async () => {
        await medicationRemindersService.updateMedicationPrescription(
          patientUser.uid,
          'med_symbicort_qa',
          { dosagePuffs: 3 },
          patientUser
        );
      },
      { statusCode: 403, code: 'PHYSICIAN_PRESCRIPTION_OVERRIDE_FORBIDDEN' }
    );

    // Pulmonologist CAN modify prescription parameters
    const docUpdate = await medicationRemindersService.updateMedicationPrescription(
      patientUser.uid,
      'med_symbicort_qa',
      { dosagePuffs: 2 },
      doctorUser
    );
    assert.strictEqual(docUpdate.success, true);
    assert.strictEqual(docUpdate.medication.dosagePuffs, 2);

    console.log('  ✓ Cross-patient breach attempts and unauthorized prescription mutations blocked (403 Forbidden)');
  }

  // -----------------------------------------------------------------------------
  // TEST 12: Relational Database Sync & Health Check Metrics Verification
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 12: Relational Database Sync & Health Check Metrics Verification');
  {
    const dbMeds = await relationalDbService.getPatientMedications(patientUser.uid);
    assert.ok(dbMeds.length >= 2, 'Relational DB must contain registered patient medications');

    const dbDoses = await relationalDbService.getMedicationDoses(patientUser.uid);
    assert.ok(dbDoses.length >= 10, 'Relational DB must contain logged medication doses');

    const dbRescue = await relationalDbService.getRescueInhalerLogs(patientUser.uid);
    assert.ok(dbRescue.length >= 1, 'Relational DB must contain logged rescue inhaler events');

    const health = relationalDbService.getHealthStatus();
    assert.ok(health.metrics.patientMedicationsCount >= 2);
    assert.ok(health.metrics.medicationDosesCount >= 10);
    const tableNames = Object.keys(relationalDbService.tables);
    assert.ok(tableNames.includes('patient_medications'));
    assert.ok(tableNames.includes('medication_doses'));
    assert.ok(tableNames.includes('rescue_inhaler_logs'));
    assert.ok(tableNames.includes('medication_reminders_queue'));

    console.log('  ✓ All 4 Relational DB tables synced and health metrics validated');
  }

  // -----------------------------------------------------------------------------
  // TEST 13: 100% Bilingual Parity across all 26 i18n Catalog Keys & Disclaimers
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 13: 100% Bilingual Parity across all 26 i18n Catalog Keys & Disclaimers');
  {
    assert.ok(translations.ar.medicationReminders, 'Arabic medicationReminders catalog must exist');
    assert.ok(translations.en.medicationReminders, 'English medicationReminders catalog must exist');

    const arKeys = Object.keys(translations.ar.medicationReminders);
    const enKeys = Object.keys(translations.en.medicationReminders);

    assert.strictEqual(arKeys.length, enKeys.length, `Key counts must match (${arKeys.length} vs ${enKeys.length})`);

    arKeys.forEach(k => {
      assert.ok(translations.en.medicationReminders[k], `Missing English key for: ${k}`);
      assert.ok(
        typeof translations.ar.medicationReminders[k] === 'string' && translations.ar.medicationReminders[k].length > 0,
        `Arabic key ${k} must not be empty`
      );
      assert.ok(
        typeof translations.en.medicationReminders[k] === 'string' && translations.en.medicationReminders[k].length > 0,
        `English key ${k} must not be empty`
      );
    });

    // Verify statutory disclaimers bilingual integrity
    assert.ok(CLINICAL_DISCLAIMERS.STANDARD_REMINDER.ar.length > 20);
    assert.ok(CLINICAL_DISCLAIMERS.STANDARD_REMINDER.en.length > 20);
    assert.ok(CLINICAL_DISCLAIMERS.CHATBOT_GUARDRAIL.ar.length > 20);
    assert.ok(CLINICAL_DISCLAIMERS.CHATBOT_GUARDRAIL.en.length > 20);
    assert.ok(CLINICAL_DISCLAIMERS.EMERGENCY_RED_FLAG.ar.length > 20);
    assert.ok(CLINICAL_DISCLAIMERS.EMERGENCY_RED_FLAG.en.length > 20);

    console.log(`  ✓ 100% mutual parity verified across all ${arKeys.length} keys and clinical disclaimers`);
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 13 PROPELLER INTEGRATION QA & EDGE CASES TESTS PASSED (100%)');
  console.log('==================================================================\n');
  process.exit(0);
}

runIntegrationQaSuite().catch(err => {
  console.error('\n❌ INTEGRATION QA TEST RUNNER FAILED:', err);
  process.exit(1);
});
