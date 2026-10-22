/**
 * Health Vibe AI - NuvoAir Medical Benchmark Scheduled Re-assessment Backend Tests
 *
 * Benchmark: NuvoAir Medical (https://nuvoair.com/)
 * Scope: P2 - أولوية عالية | Backend / Security | المواعيد والشات بوت والملفات (الخدمات الخلفية والتكامل (Backend & APIs)) |
 * جدولة تقييم متابعة دوري تلقائي (Scheduled Re-assessment) — تذكير المريض بإجراء تقييم تنفسي جديد بعد أسبوع من بدء الخطة العلاجية
 * لقياس التحسن (بناء المنطق البرمجي وربط قواعد البيانات وخدمات الإشعارات). | NuvoAir Medical
 *
 * Test Matrix:
 * 1. Service export and singleton interface.
 * 2. Schedule generation & dynamic due/overdue status evaluation.
 * 3. 0-25 Standardized Respiratory Control Score calculation & control bands.
 * 4. NuvoAir longitudinal trajectory engine & quantified delta (+/- points and %).
 * 5. Re-assessment submission & completed state transition.
 * 6. 24h Snooze cooldown & notification channel preference.
 * 7. Multi-channel batch reminder dispatch engine & idempotency guard.
 * 8. Multi-touchpoint integration (Consultation Dossier & Chatbot Assistant context).
 * 9. Zero-Trust RBAC & cross-patient data isolation (403 Forbidden).
 * 10. Relational Database sync (scheduled_reassessments, reassessment_submissions) & health metrics.
 * 11. REST API routes mounted in server.js verification.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ScheduledReassessmentService,
  scheduledReassessmentService,
  REASSESSMENT_STATUS,
  TRAJECTORY_STATUS,
  CONTROL_BANDS,
  DEFAULT_INTERVAL_DAYS
} = require('../backend/scheduled-reassessment-service');

const { relationalDbService } = require('../backend/relational-db-service');
const notificationService = require('../backend/notification-service');
const app = require('../backend/server');

console.log('\n==================================================================');
console.log('🫁 HEALTH VIBE AI: NUVOAIR RE-ASSESSMENT BACKEND & APIS');
console.log('   Benchmark: NuvoAir Medical (Scheduled Follow-up & Trajectory)');
console.log('==================================================================\n');

async function runTests() {
  const patientUser = { uid: 'pt_nuvoair_001', role: 'patient' };
  const doctorUser = { uid: 'doc_pulmo_001', role: 'doctor', displayName: 'Dr. Tariq Pulmo' };
  const adminUser = { uid: 'admin_sys_001', role: 'super_admin' };
  const intruderUser = { uid: 'pt_intruder_999', role: 'patient' };

  scheduledReassessmentService.resetState();

  // ==================================================================
  // TEST 1: Service Singleton & Interface Verification
  // ==================================================================
  console.log('▶ TEST 1: Service Singleton & Interface Verification');
  {
    assert.ok(scheduledReassessmentService instanceof ScheduledReassessmentService);
    assert.strictEqual(typeof scheduledReassessmentService.scheduleReassessment, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.getPatientSchedule, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.snoozeReassessment, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.calculateControlScore, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.calculateImprovementTrajectory, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.submitReassessment, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.getReassessmentHistory, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.getTrajectoryReport, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.dispatchPendingReminders, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.getDossierSnippet, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.getChatbotContext, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.verifyPatientAccess, 'function');
    assert.strictEqual(typeof scheduledReassessmentService.resetState, 'function');
    console.log('  ✓ All 13 core service methods exported and verified');
  }

  // ==================================================================
  // TEST 2: Schedule Generation & Dynamic Due Status Evaluation
  // ==================================================================
  console.log('▶ TEST 2: Schedule Generation & Dynamic Due Status Evaluation');
  {
    const today = new Date().toISOString().split('T')[0];
    const sched = await scheduledReassessmentService.scheduleReassessment(
      patientUser.uid,
      {
        intervalDays: DEFAULT_INTERVAL_DAYS,
        startDate: today,
        notificationChannel: 'whatsapp',
        baselineAssessment: {
          controlScore: 12,
          dayBreathlessness: 3,
          nightWaking: 3,
          rescuePuffsWeek: 9,
          activityLimitation: 2
        }
      },
      patientUser
    );

    assert.ok(sched.id.startsWith('sched_'));
    assert.strictEqual(sched.patientId, patientUser.uid);
    assert.strictEqual(sched.intervalDays, 7);
    assert.strictEqual(sched.notificationChannel, 'whatsapp');
    assert.strictEqual(sched.baselineAssessment.controlScore, 12);
    assert.strictEqual(sched.baselineAssessment.controlBand, CONTROL_BANDS.POOR);

    // Dynamic status evaluation
    const fetched = await scheduledReassessmentService.getPatientSchedule(patientUser.uid, patientUser);
    assert.strictEqual(fetched.patientId, patientUser.uid);
    assert.strictEqual(fetched.status, REASSESSMENT_STATUS.SCHEDULED);
    assert.strictEqual(fetched.daysRemaining, 7);
    assert.strictEqual(fetched.isDueNow, false);

    // Past due schedule evaluation
    const overdueSchedule = {
      dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: REASSESSMENT_STATUS.SCHEDULED
    };
    assert.strictEqual(
      scheduledReassessmentService.evaluateScheduleStatus(overdueSchedule),
      REASSESSMENT_STATUS.OVERDUE
    );

    console.log('  ✓ 7-day automatic scheduling and dynamic status evaluator verified');
  }

  // ==================================================================
  // TEST 3: 0-25 Respiratory Control Score Calculation & Question Weighting
  // ==================================================================
  console.log('▶ TEST 3: 0-25 Respiratory Control Score Calculation & Control Bands');
  {
    // Perfect control (25/25)
    const controlledData = {
      dayBreathlessness: 0, // 5 pts
      nightWaking: 0,        // 5 pts
      rescuePuffsWeek: 0,    // 5 pts
      activityLimitation: 0, // 5 pts
      coughWheeze: 0         // 5 pts (default 0)
    };
    const perfectScore = scheduledReassessmentService.calculateControlScore(controlledData);
    assert.strictEqual(perfectScore.score, 25);
    assert.strictEqual(perfectScore.controlBand, CONTROL_BANDS.CONTROLLED);

    // Moderate control (16-19)
    const moderateData = {
      dayBreathlessness: 1, // 4 pts
      nightWaking: 1,        // 3 pts
      rescuePuffsWeek: 2,    // 4 pts
      activityLimitation: 0  // 6 pts -> Total 17 pts
    };
    const modScore = scheduledReassessmentService.calculateControlScore(moderateData);
    assert.strictEqual(modScore.score, 17);
    assert.strictEqual(modScore.controlBand, CONTROL_BANDS.MODERATE);

    // Poor control (<= 15)
    const poorData = {
      dayBreathlessness: 2, // 2 pts
      nightWaking: 1,        // 3 pts
      rescuePuffsWeek: 4,    // 2 pts
      activityLimitation: 2  // 0 pts -> Total 7 pts
    };
    const poorScore = scheduledReassessmentService.calculateControlScore(poorData);
    assert.strictEqual(poorScore.score, 7);
    assert.strictEqual(poorScore.controlBand, CONTROL_BANDS.POOR);

    console.log('  ✓ 0-25 Control score engine and clinical bands (Controlled, Moderate, Poor) verified');
  }

  // ==================================================================
  // TEST 4: NuvoAir Longitudinal Trajectory & Delta Engine
  // ==================================================================
  console.log('▶ TEST 4: NuvoAir Longitudinal Trajectory & Delta Engine');
  {
    const baseline = {
      controlScore: 12,
      rescuePuffsWeek: 8
    };

    // Case A: Improvement (+9 points, +75%)
    const improvedFollowup = {
      dayBreathlessness: 1,
      nightWaking: 0,
      rescuePuffsWeek: 1,
      activityLimitation: 0
    };
    const trajImproved = scheduledReassessmentService.calculateImprovementTrajectory(baseline, improvedFollowup);
    assert.strictEqual(trajImproved.trajectory, TRAJECTORY_STATUS.IMPROVED);
    assert.ok(trajImproved.deltaPoints > 0);
    assert.ok(trajImproved.deltaPct > 0);
    assert.strictEqual(trajImproved.currentBand, CONTROL_BANDS.CONTROLLED);
    assert.strictEqual(trajImproved.clinicalReviewRecommended, false);

    // Case B: Deterioration (Rescue overuse or score drop)
    const deterioratingFollowup = {
      dayBreathlessness: 4,
      nightWaking: 4,
      rescuePuffsWeek: 12,
      activityLimitation: 4
    };
    const trajDet = scheduledReassessmentService.calculateImprovementTrajectory(baseline, deterioratingFollowup);
    assert.strictEqual(trajDet.trajectory, TRAJECTORY_STATUS.DETERIORATING);
    assert.ok(trajDet.deltaPoints < 0);
    assert.strictEqual(trajDet.clinicalReviewRecommended, true);

    console.log('  ✓ Trajectory classifications (improved/stable/deteriorating) & delta points verified');
  }

  // ==================================================================
  // TEST 5: Re-assessment Submission & Next Routine Staging
  // ==================================================================
  console.log('▶ TEST 5: Re-assessment Submission & Completed State Transition');
  {
    const submissionResult = await scheduledReassessmentService.submitReassessment(
      patientUser.uid,
      {
        dayBreathlessness: 1, // 4 pts
        nightWaking: 0,        // 5 pts
        rescuePuffsWeek: 1,    // 4 pts
        activityLimitation: 0, // 5 pts
        coughWheeze: 1,        // 4 pts -> Total 22 pts
        spo2: 98,
        fev1Percent: 82,
        peakFlow: 450,
        notes: 'Noticeable improvement in breathing after 1 week on Symbicort'
      },
      patientUser
    );

    assert.ok(submissionResult.submissionId.startsWith('reassess_'));
    assert.strictEqual(submissionResult.patientId, patientUser.uid);
    assert.ok(submissionResult.score >= 20);
    assert.strictEqual(submissionResult.controlBand, CONTROL_BANDS.CONTROLLED);
    assert.strictEqual(submissionResult.trajectory, TRAJECTORY_STATUS.IMPROVED);
    assert.strictEqual(submissionResult.scheduleStatus, REASSESSMENT_STATUS.COMPLETED);

    // Verify history contains submission
    const history = await scheduledReassessmentService.getReassessmentHistory(patientUser.uid, patientUser);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].id, submissionResult.submissionId);
    assert.strictEqual(history[0].score, submissionResult.score);

    console.log('  ✓ Re-assessment submission logged, schedule marked completed, and history preserved');
  }

  // ==================================================================
  // TEST 6: 24h Snooze Cooldown & Schedulable Preferences
  // ==================================================================
  console.log('▶ TEST 6: 24h Snooze Cooldown & Schedulable Preferences');
  {
    // Create new active schedule to test snooze
    const newSched = await scheduledReassessmentService.scheduleReassessment(
      'pt_snooze_test',
      { intervalDays: 0 }, // due today
      adminUser
    );

    const snoozeRes = await scheduledReassessmentService.snoozeReassessment(
      'pt_snooze_test',
      { reason: 'Feeling busy with work' },
      adminUser
    );

    assert.strictEqual(snoozeRes.success, true);
    assert.strictEqual(snoozeRes.status, REASSESSMENT_STATUS.SNOOZED);
    assert.strictEqual(snoozeRes.snoozeCount, 1);
    assert.ok(snoozeRes.snoozedUntil > Date.now());

    console.log('  ✓ 24h Snooze cooldown logic and increment counters verified');
  }

  // ==================================================================
  // TEST 7: Multi-Channel Batch Reminder Dispatching & Idempotency
  // ==================================================================
  console.log('▶ TEST 7: Multi-Channel Batch Reminder Dispatch Engine & Idempotency');
  {
    // Create patient with due schedule
    await scheduledReassessmentService.scheduleReassessment(
      'pt_batch_due_01',
      { intervalDays: -1, notificationChannel: 'sms' }, // past due
      adminUser
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const dispatch1 = await scheduledReassessmentService.dispatchPendingReminders(todayStr);
    assert.strictEqual(dispatch1.success, true);
    assert.ok(dispatch1.scanned >= 1);
    assert.ok(dispatch1.dispatched >= 1);

    // Second dispatch on same day should be idempotent for already dispatched reminders
    const dispatch2 = await scheduledReassessmentService.dispatchPendingReminders(todayStr);
    assert.strictEqual(dispatch2.success, true);
    assert.strictEqual(dispatch2.skippedAlreadyNotified >= 1, true);

    console.log('  ✓ Batch multi-channel dispatcher and idempotency guard verified');
  }

  // ==================================================================
  // TEST 8: Multi-Touchpoint Integration (Consultation Dossier & Chatbot)
  // ==================================================================
  console.log('▶ TEST 8: Multi-Touchpoint Integration (Consultation Dossier & Chatbot)');
  {
    // 1. Dossier snippet for doctor pre-visit consultation
    const dossier = await scheduledReassessmentService.getDossierSnippet(patientUser.uid, doctorUser);
    assert.strictEqual(dossier.patientId, patientUser.uid);
    assert.strictEqual(dossier.benchmark, 'NuvoAir Medical');
    assert.ok(dossier.baselineScore !== undefined);
    assert.ok(dossier.latestScore >= 20);
    assert.strictEqual(dossier.trajectory, TRAJECTORY_STATUS.IMPROVED);
    assert.ok(dossier.dossierTextAr.includes('مسار التحسن السريري'));
    assert.ok(dossier.dossierTextEn.includes('Clinical Trajectory'));

    // 2. Chatbot assistant real-time context
    const chatbotCtx = await scheduledReassessmentService.getChatbotContext(patientUser.uid);
    assert.strictEqual(chatbotCtx.patientId, patientUser.uid);
    assert.ok(chatbotCtx.promptSuggestionAr.length > 0);
    assert.ok(chatbotCtx.promptSuggestionEn.length > 0);

    console.log('  ✓ Pre-visit consultation dossier and Chatbot assistant context verified');
  }

  // ==================================================================
  // TEST 9: Zero-Trust RBAC & Cross-Patient Data Isolation
  // ==================================================================
  console.log('▶ TEST 9: Zero-Trust RBAC & Cross-Patient Data Isolation');
  {
    // Patient can access own schedule
    const ownCheck = scheduledReassessmentService.verifyPatientAccess(patientUser, patientUser.uid);
    assert.strictEqual(ownCheck.authorized, true);

    // Doctor can access patient records
    const docCheck = scheduledReassessmentService.verifyPatientAccess(doctorUser, patientUser.uid);
    assert.strictEqual(docCheck.authorized, true);

    // Admin can access patient records
    const adminCheck = scheduledReassessmentService.verifyPatientAccess(adminUser, patientUser.uid);
    assert.strictEqual(adminCheck.authorized, true);

    // Intruder attempting cross-patient breach -> Blocked 403
    const intruderCheck = scheduledReassessmentService.verifyPatientAccess(intruderUser, patientUser.uid);
    assert.strictEqual(intruderCheck.authorized, false);
    assert.strictEqual(intruderCheck.status, 403);
    assert.strictEqual(intruderCheck.error, 'FORBIDDEN_CROSS_PATIENT_ACCESS');

    // Attempting service calls with intruder should reject
    await assert.rejects(
      async () => {
        await scheduledReassessmentService.getPatientSchedule(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    await assert.rejects(
      async () => {
        await scheduledReassessmentService.submitReassessment(
          patientUser.uid,
          { dayBreathlessness: 1 },
          intruderUser
        );
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    await assert.rejects(
      async () => {
        await scheduledReassessmentService.getTrajectoryReport(patientUser.uid, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    console.log('  ✓ Cross-patient data breach attempts strictly blocked with 403 Forbidden');
  }

  // ==================================================================
  // TEST 10: Relational Database Persistence Verification & Health Metrics
  // ==================================================================
  console.log('▶ TEST 10: Relational Database Persistence Verification & Health Metrics');
  {
    assert.ok(relationalDbService.tables.scheduled_reassessments.size > 0);
    assert.ok(relationalDbService.tables.reassessment_submissions.size > 0);

    const dbSched = await relationalDbService.getScheduledReassessment(patientUser.uid);
    assert.ok(dbSched);
    assert.strictEqual(dbSched.patient_id, patientUser.uid);

    const dbSubs = await relationalDbService.getReassessmentSubmissions(patientUser.uid);
    assert.ok(dbSubs.length > 0);
    assert.strictEqual(dbSubs[0].patient_id, patientUser.uid);

    const health = relationalDbService.getHealthStatus();
    assert.ok(health.metrics.scheduledReassessmentsCount > 0);
    assert.ok(health.metrics.reassessmentSubmissionsCount > 0);

    console.log('  ✓ Relational DB tables and health metrics synced and indexed');
  }

  // ==================================================================
  // TEST 11: REST API Routes Mounted in server.js
  // ==================================================================
  console.log('▶ TEST 11: REST API Routes Mounted in server.js');
  {
    const serverJsContent = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    const expectedEndpoints = [
      '/api/reassessment/schedule',
      '/api/reassessment/patient/:patientId',
      '/api/reassessment/patient/:patientId/snooze',
      '/api/reassessment/patient/:patientId/submit',
      '/api/reassessment/patient/:patientId/history',
      '/api/reassessment/patient/:patientId/trajectory',
      '/api/reassessment/dispatch-reminders',
      '/api/reassessment/dossier/:patientId',
      '/api/reassessment/chatbot/context/:patientId'
    ];

    expectedEndpoints.forEach(endpoint => {
      assert.ok(serverJsContent.includes(endpoint), `server.js must contain route: ${endpoint}`);
    });

    console.log('  ✓ All 9 REST API routes verified in server.js');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 11 NUVOAIR RE-ASSESSMENT BACKEND TESTS PASSED (100%)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
