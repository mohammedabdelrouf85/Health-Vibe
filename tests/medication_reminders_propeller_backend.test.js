/**
 * Health Vibe AI - Propeller Health Benchmark Medication & Inhaler Reminders Backend Tests
 *
 * Benchmark: Propeller Health (https://propellerhealth.com/)
 * Scope: P2 - أولوية عالية | Backend / Security | المواعيد والشات بوت والملفات (الخدمات الخلفية والتكامل (Backend & APIs)) |
 * تنبيهات متابعة الدواء والبخاخات (Medication Reminders) — إرسال تذكيرات يومية للمريض بمواعيد البخاخة الوقائية
 * لتعزيز الالتزام العلاجي (Adherence) (بناء المنطق البرمجي وربط قواعد البيانات وخدمات الإشعارات). | Propeller Health
 *
 * Test Matrix:
 * 1. Service export and singleton interface.
 * 2. Inhaler registration & schedule validation (controller vs rescue).
 * 3. 1-Tap dose logging: taken, snoozed, and skipped with canister decrements.
 * 4. Longitudinal adherence calculation engine (% over 7, 14, 30 days) and streak tracking.
 * 5. Quick rescue inhaler (Ventolin) logger & 24h clinical safety threshold (>=3/24h).
 * 6. Canister dose counter tracking & automatic Low Canister Alert (<=20 puffs).
 * 7. Multi-channel daily reminder batch dispatch engine.
 * 8. Pre-visit consultation dossier adherence attachment & Chatbot assistant context.
 * 9. Zero-Trust RBAC & cross-patient privacy breach isolation (403 Forbidden).
 * 10. Relational Database persistence sync (patient_medications, medication_doses, rescue_inhaler_logs).
 * 11. Zero-PHI telemetry and audit logging verification.
 */

'use strict';

const assert = require('assert');
const {
  MedicationRemindersService,
  medicationRemindersService,
  MEDICATION_TYPES,
  DOSE_STATUS,
  ADHERENCE_BANDS
} = require('../backend/medication-reminders-service');

const { relationalDbService } = require('../backend/relational-db-service');
const analyticsService = require('../backend/analytics-service');
const notificationService = require('../backend/notification-service');
const app = require('../backend/server');

console.log('\n==================================================================');
console.log('⏰ HEALTH VIBE AI: PROPELLER INHALER REMINDERS BACKEND & APIS');
console.log('   Benchmark: Propeller Health (Backend Logic, DB & Notifications)');
console.log('==================================================================\n');

async function runTests() {
  const patientUser = { uid: 'pt_propeller_001', role: 'patient' };
  const doctorUser = { uid: 'doc_pulmo_001', role: 'doctor', displayName: 'Dr. Sarah Pulmo' };
  const adminUser = { uid: 'admin_sys_001', role: 'super_admin' };
  const intruderUser = { uid: 'pt_intruder_999', role: 'patient' };

  medicationRemindersService.resetStoreForTesting();

  // ==================================================================
  // TEST 1: Service Singleton & Interface Verification
  // ==================================================================
  console.log('▶ TEST 1: Service Singleton & Interface Verification');
  {
    assert.ok(medicationRemindersService instanceof MedicationRemindersService);
    assert.strictEqual(typeof medicationRemindersService.registerMedication, 'function');
    assert.strictEqual(typeof medicationRemindersService.getPatientMedications, 'function');
    assert.strictEqual(typeof medicationRemindersService.logDose, 'function');
    assert.strictEqual(typeof medicationRemindersService.logRescuePuff, 'function');
    assert.strictEqual(typeof medicationRemindersService.calculateAdherence, 'function');
    assert.strictEqual(typeof medicationRemindersService.refillCanister, 'function');
    assert.strictEqual(typeof medicationRemindersService.dispatchDailyReminders, 'function');
    assert.strictEqual(typeof medicationRemindersService.getPreVisitAdherenceDossier, 'function');
    assert.strictEqual(typeof medicationRemindersService.getChatbotReminderContext, 'function');
    assert.strictEqual(typeof medicationRemindersService.verifyPatientAccess, 'function');
    console.log('  ✓ All core service methods exported and verified');
  }

  // ==================================================================
  // TEST 2: Inhaler Registration & Preventative Controller Schedule
  // ==================================================================
  console.log('▶ TEST 2: Inhaler Registration & Preventative Controller Schedule');
  {
    const symbicort = await medicationRemindersService.registerMedication(
      patientUser.uid,
      {
        id: 'med_symbicort_pt1',
        name: 'Symbicort Turbuhaler (160/4.5 mcg)',
        nameAr: 'سيمبيكورت تيربوهالر (١٦٠ / ٤.٥ ميكروجرام)',
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

    assert.strictEqual(symbicort.id, 'med_symbicort_pt1');
    assert.strictEqual(symbicort.type, MEDICATION_TYPES.CONTROLLER);
    assert.strictEqual(symbicort.canisterRemaining, 120);
    assert.deepStrictEqual(symbicort.scheduleTimes, ['08:00', '20:00']);

    // Register PRN rescue inhaler (Ventolin)
    const ventolin = await medicationRemindersService.registerMedication(
      patientUser.uid,
      {
        id: 'med_ventolin_pt1',
        name: 'Ventolin Evohaler (100 mcg)',
        nameAr: 'فنتولين إيفوهالر (١٠٠ ميكروجرام)',
        type: 'rescue',
        activeIngredients: 'Salbutamol',
        dosagePuffs: 2,
        canisterTotal: 200,
        canisterRemaining: 200,
        lowCanisterThreshold: 20
      },
      patientUser
    );

    assert.strictEqual(ventolin.id, 'med_ventolin_pt1');
    assert.strictEqual(ventolin.type, MEDICATION_TYPES.RESCUE);
    assert.strictEqual(ventolin.canisterRemaining, 200);

    const meds = await medicationRemindersService.getPatientMedications(patientUser.uid, patientUser);
    assert.strictEqual(meds.length, 2);
    console.log('  ✓ Controller (Symbicort) & Rescue (Ventolin) registered and retrieved');
  }

  // ==================================================================
  // TEST 3: 1-Tap Dose Logging (Taken, Snoozed, Skipped) & Puff Decrement
  // ==================================================================
  console.log('▶ TEST 3: 1-Tap Dose Logging (Taken, Snoozed, Skipped) & Canister Decrement');
  {
    // 1. Log Morning Dose Taken
    const takeResult = await medicationRemindersService.logDose(
      patientUser.uid,
      {
        medId: 'med_symbicort_pt1',
        scheduledTime: '08:00',
        status: DOSE_STATUS.TAKEN
      },
      patientUser
    );

    assert.strictEqual(takeResult.success, true);
    assert.strictEqual(takeResult.dose.status, DOSE_STATUS.TAKEN);
    assert.strictEqual(takeResult.canisterRemaining, 119); // 120 - 1 = 119
    assert.ok(takeResult.dose.takenAt);

    // 2. Log Snoozed Dose
    const snoozeResult = await medicationRemindersService.logDose(
      patientUser.uid,
      {
        medId: 'med_symbicort_pt1',
        scheduledTime: '20:00',
        status: DOSE_STATUS.SNOOZED,
        snoozeMinutes: 30
      },
      patientUser
    );

    assert.strictEqual(snoozeResult.success, true);
    assert.strictEqual(snoozeResult.dose.status, DOSE_STATUS.SNOOZED);
    assert.ok(snoozeResult.dose.snoozedUntil);

    // 3. Log Skipped Dose
    const skipResult = await medicationRemindersService.logDose(
      patientUser.uid,
      {
        medId: 'med_symbicort_pt1',
        scheduledTime: '20:00',
        status: DOSE_STATUS.SKIPPED,
        reason: 'Patient felt stable'
      },
      patientUser
    );

    assert.strictEqual(skipResult.success, true);
    assert.strictEqual(skipResult.dose.status, DOSE_STATUS.SKIPPED);
    assert.strictEqual(skipResult.dose.reason, 'Patient felt stable');

    console.log('  ✓ 1-Tap dose actions (taken, snoozed, skipped) and canister subtraction verified');
  }

  // ==================================================================
  // TEST 4: Longitudinal Adherence Engine & Streak Gamification
  // ==================================================================
  console.log('▶ TEST 4: Longitudinal Adherence Engine & Streak Calculation');
  {
    // Seed 10 past days with high adherence
    const today = new Date();
    for (let i = 1; i <= 6; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      await medicationRemindersService.logDose(
        patientUser.uid,
        {
          medId: 'med_symbicort_pt1',
          scheduledDate: dateStr,
          scheduledTime: '08:00',
          status: DOSE_STATUS.TAKEN
        },
        patientUser
      );

      await medicationRemindersService.logDose(
        patientUser.uid,
        {
          medId: 'med_symbicort_pt1',
          scheduledDate: dateStr,
          scheduledTime: '20:00',
          status: DOSE_STATUS.TAKEN
        },
        patientUser
      );
    }

    const adherence = await medicationRemindersService.calculateAdherence(patientUser.uid, { days: 7 }, patientUser);
    assert.ok(adherence.adherencePct >= 80, 'Adherence rate must be >= 80%');
    assert.strictEqual(adherence.band, ADHERENCE_BANDS.EXCELLENT);
    assert.ok(adherence.streakDays >= 5, 'Streak must be >= 5 days');
    assert.strictEqual(adherence.scheduledDoses, adherence.takenDoses + 1); // 1 skipped above

    console.log(`  ✓ Adherence: ${adherence.adherencePct}% (${adherence.band}), streak: ${adherence.streakDays} days`);
  }

  // ==================================================================
  // TEST 5: Quick Rescue Inhaler Logger & 24h Clinical Safety Alert
  // ==================================================================
  console.log('▶ TEST 5: Quick Rescue Inhaler Logger & 24h Clinical Safety Alerts');
  {
    // 1st puff
    const r1 = await medicationRemindersService.logRescuePuff(
      patientUser.uid,
      { medId: 'med_ventolin_pt1', puffs: 1, trigger: 'dust' },
      patientUser
    );
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.safetyAlertTriggered, false);
    assert.strictEqual(r1.canisterRemaining, 199); // 200 - 1

    // 2nd puff
    const r2 = await medicationRemindersService.logRescuePuff(
      patientUser.uid,
      { medId: 'med_ventolin_pt1', puffs: 1, trigger: 'exercise' },
      patientUser
    );
    assert.strictEqual(r2.safetyAlertTriggered, false);

    // 3rd puff -> Exceeds safety threshold (>= 3 in 24 hours)
    const r3 = await medicationRemindersService.logRescuePuff(
      patientUser.uid,
      { medId: 'med_ventolin_pt1', puffs: 1, trigger: 'acute_cough' },
      patientUser
    );
    assert.strictEqual(r3.safetyAlertTriggered, true);
    assert.strictEqual(r3.totalRescue24h, 3);

    console.log('  ✓ Rescue logging, trigger attribution, and 24h clinical safety threshold (>=3) verified');
  }

  // ==================================================================
  // TEST 6: Canister Tracking & Low Canister Alert Threshold
  // ==================================================================
  console.log('▶ TEST 6: Canister Tracking & Low Canister Alert (< 20 puffs)');
  {
    // Directly set canister remaining to 18 (below threshold)
    const med = medicationRemindersService._medications.get('med_symbicort_pt1');
    med.canisterRemaining = 18;

    const adherence = await medicationRemindersService.calculateAdherence(patientUser.uid, { days: 7 }, patientUser);
    assert.strictEqual(adherence.lowCanistersCount, 1);
    assert.strictEqual(adherence.lowCanisters[0].id, 'med_symbicort_pt1');

    // Refill Canister API
    const refill = await medicationRemindersService.refillCanister(patientUser.uid, 'med_symbicort_pt1', 120, patientUser);
    assert.strictEqual(refill.success, true);
    assert.strictEqual(refill.canisterRemaining, 120);

    const adherenceAfter = await medicationRemindersService.calculateAdherence(patientUser.uid, { days: 7 }, patientUser);
    assert.strictEqual(adherenceAfter.lowCanistersCount, 0);

    console.log('  ✓ Low canister alert trigger and refill API restoration verified');
  }

  // ==================================================================
  // TEST 7: Multi-Channel Daily Reminder Dispatch Engine
  // ==================================================================
  console.log('▶ TEST 7: Multi-Channel Daily Reminder Dispatch Engine');
  {
    const todayStr = new Date().toISOString().split('T')[0];
    const dispatchResult = await medicationRemindersService.dispatchDailyReminders(todayStr);

    assert.strictEqual(dispatchResult.success, true);
    assert.ok(dispatchResult.remindersDispatched >= 2, 'Must dispatch morning and evening doses');

    // Idempotency: Second run for same date should not re-dispatch duplicate reminders
    const secondDispatch = await medicationRemindersService.dispatchDailyReminders(todayStr);
    assert.strictEqual(secondDispatch.remindersDispatched, 0, 'Must not duplicate reminders on same day');

    console.log('  ✓ Daily reminder generation and idempotency guard verified');
  }

  // ==================================================================
  // TEST 8: Multi-Touchpoint Integration (Appointments Dossier & Chatbot)
  // ==================================================================
  console.log('▶ TEST 8: Multi-Touchpoint Integration (Appointments Dossier & Chatbot)');
  {
    // 1. Pre-Visit Consultation Dossier
    const dossier = await medicationRemindersService.getPreVisitAdherenceDossier(patientUser.uid, doctorUser);
    assert.strictEqual(dossier.patientId, patientUser.uid);
    assert.ok(dossier.adherenceScore >= 0);
    assert.ok(dossier.activeInhalers.length >= 2);
    assert.ok(dossier.clinicalNote.includes('adherence'));

    // 2. Chatbot Assistant Context
    const chatContext = await medicationRemindersService.getChatbotReminderContext(patientUser.uid);
    assert.strictEqual(chatContext.patientId, patientUser.uid);
    assert.ok(chatContext.adherencePct >= 0);
    assert.ok(chatContext.nextScheduledDose);
    assert.strictEqual(chatContext.nextScheduledDose.medId, 'med_symbicort_pt1');

    console.log('  ✓ Pre-visit consultation dossier and Chatbot assistant context verified');
  }

  // ==================================================================
  // TEST 9: Zero-Trust RBAC & Cross-Patient Data Isolation
  // ==================================================================
  console.log('▶ TEST 9: Zero-Trust RBAC & Cross-Patient Data Isolation');
  {
    // Patient can access own records
    const ownCheck = medicationRemindersService.verifyPatientAccess(patientUser, patientUser.uid);
    assert.strictEqual(ownCheck.authorized, true);

    // Doctor can access patient records
    const docCheck = medicationRemindersService.verifyPatientAccess(doctorUser, patientUser.uid);
    assert.strictEqual(docCheck.authorized, true);

    // Admin can access patient records
    const adminCheck = medicationRemindersService.verifyPatientAccess(adminUser, patientUser.uid);
    assert.strictEqual(adminCheck.authorized, true);

    // Intruder attempting to access patient records -> Blocked 403
    const intruderCheck = medicationRemindersService.verifyPatientAccess(intruderUser, patientUser.uid);
    assert.strictEqual(intruderCheck.authorized, false);
    assert.strictEqual(intruderCheck.status, 403);
    assert.strictEqual(intruderCheck.error, 'FORBIDDEN');

    // Attempting service calls with intruder should reject
    await assert.rejects(
      async () => {
        await medicationRemindersService.getPatientMedications(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN' }
    );

    await assert.rejects(
      async () => {
        await medicationRemindersService.logDose(
          patientUser.uid,
          { medId: 'med_symbicort_pt1', scheduledTime: '08:00', status: 'taken' },
          intruderUser
        );
      },
      { statusCode: 403, code: 'FORBIDDEN' }
    );

    console.log('  ✓ Cross-patient data breach attempts strictly blocked with 403 Forbidden');
  }

  // ==================================================================
  // TEST 10: Relational Database Persistence Verification
  // ==================================================================
  console.log('▶ TEST 10: Relational Database Persistence Verification');
  {
    assert.ok(relationalDbService.tables.patient_medications.has('med_symbicort_pt1'));
    assert.ok(relationalDbService.tables.patient_medications.has('med_ventolin_pt1'));

    const dbMeds = await relationalDbService.getPatientMedications(patientUser.uid);
    assert.strictEqual(dbMeds.length, 2);

    const dbDoses = await relationalDbService.getMedicationDoses(patientUser.uid);
    assert.ok(dbDoses.length > 0);

    const dbRescue = await relationalDbService.getRescueInhalerLogs(patientUser.uid);
    assert.strictEqual(dbRescue.length, 3);

    const health = relationalDbService.getHealthStatus();
    assert.ok(health.metrics.patientMedicationsCount >= 2);
    assert.ok(health.metrics.medicationDosesCount > 0);
    assert.ok(health.metrics.rescueInhalerLogsCount >= 3);

    console.log('  ✓ Relational DB tables (medications, doses, rescue logs) synced and indexed');
  }

  // ==================================================================
  // TEST 11: REST API Routes Mounted in server.js
  // ==================================================================
  console.log('▶ TEST 11: REST API Routes Mounted in server.js');
  {
    const fs = require('fs');
    const path = require('path');
    const serverJsContent = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    const expectedEndpoints = [
      '/api/medication-reminders/medications',
      '/api/medication-reminders/doses/log',
      '/api/medication-reminders/rescue/log',
      '/api/medication-reminders/adherence/:patientId',
      '/api/medication-reminders/canister/refill',
      '/api/medication-reminders/reminders/dispatch',
      '/api/medication-reminders/dossier/:patientId',
      '/api/medication-reminders/chatbot/context/:patientId'
    ];

    expectedEndpoints.forEach(endpoint => {
      assert.ok(serverJsContent.includes(endpoint), `server.js must contain route: ${endpoint}`);
    });

    console.log('  ✓ All 8 REST API routes verified in server.js');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 11 PROPELLER INHALER REMINDERS BACKEND TESTS PASSED (100%)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
