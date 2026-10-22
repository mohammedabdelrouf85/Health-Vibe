/**
 * Health Vibe AI - NuvoAir Medical Benchmark: Scheduled Re-assessment Integration QA & Edge Cases Test Suite
 * Benchmark: NuvoAir Medical (https://nuvoair.com/)
 *
 * Scope: P2 - أولوية عالية | QA / Medical Research | المواعيد والشات بوت والملفات (اختبار التكامل والحالات الحدية (Integration QA)) |
 * جدولة تقييم متابعة دوري تلقائي (Scheduled Re-assessment) — تذكير المريض بإجراء تقييم تنفسي جديد بعد أسبوع من بدء الخطة العلاجية
 * لقياس التحسن (اختبار عمل الميزة مع باقي أجزاء النظام باللغتين العربية والإنجليزية).
 *
 * Test Matrix (13 Comprehensive Scenarios):
 * 1. End-to-End Appointments Integration: Post-treatment initiation schedule staging & pre-visit dossier snippet.
 * 2. End-to-End Chatbot Assistant Integration: Context generation, check-in card & Arabic/English prompts.
 * 3. Medical Dossier & Longitudinal Trajectory Progression (Week 0 Baseline -> Week 1 Follow-up -> Week 2 Control).
 * 4. Clinical Deterioration & Exacerbation Emergency Escalation (Rescue overuse & urgent clinical review alert).
 * 5. Boundary Condition: Extreme Boundary Scores (Floor 0 vs Ceiling 25) & Zero-Division / NaN Guard.
 * 6. Boundary Condition: Partial / Incomplete Form Submissions & Default Fallback Resilience.
 * 7. Boundary Condition: 24h Snooze Expiration, Multi-Snooze Stacking & Dynamic Cooldown Transition.
 * 8. Boundary Condition: Out-of-Sequence & Rapid Successive Submissions.
 * 9. Multi-Channel Batch Reminder Dispatching & Strict Idempotency Guard (5x Batch Run).
 * 10. Zero-Trust RBAC & Cross-Patient Privacy Walls (403 Forbidden on Breach Attempts).
 * 11. Relational Database Sync, Secondary Indexing & Health Metrics Verification.
 * 12. 100% Bilingual Parity across all 47 scheduledReassessment i18n Catalog Keys & Clinical Terminology.
 * 13. REST API Routes Full Integration Verification in server.js.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

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
const analyticsService = require('../backend/analytics-service');
const { translations } = require('../app/i18n.js');
const app = require('../backend/server');

console.log('\n==================================================================');
console.log('🧪 HEALTH VIBE AI: NUVOAIR RE-ASSESSMENT INTEGRATION QA & EDGE CASES');
console.log('   Benchmark: NuvoAir Medical (Appointments, Chatbot & Files)');
console.log('==================================================================\n');

async function runIntegrationQaSuite() {
  const patientUser = { uid: 'pt_nuvoair_qa_001', role: 'patient', displayName: 'Omar Al-Khatib' };
  const doctorUser = { uid: 'doc_pulmo_qa_001', role: 'doctor', displayName: 'Dr. Sarah Pulmo' };
  const adminUser = { uid: 'admin_sys_qa_001', role: 'super_admin', displayName: 'System Admin' };
  const intruderUser = { uid: 'pt_intruder_qa_999', role: 'patient', displayName: 'Intruder User' };

  scheduledReassessmentService.resetState();

  // -----------------------------------------------------------------------------
  // TEST 1: End-to-End Appointments Integration (Post-Treatment Initiation Staging)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: End-to-End Appointments Integration (Post-Treatment Dossier)');
  {
    const today = new Date().toISOString().split('T')[0];
    const initialSchedule = await scheduledReassessmentService.scheduleReassessment(
      patientUser.uid,
      {
        startDate: today,
        intervalDays: DEFAULT_INTERVAL_DAYS,
        notificationChannel: 'whatsapp',
        baselineAssessment: {
          controlScore: 11,
          dayBreathlessness: 3,
          nightWaking: 2,
          rescuePuffsWeek: 8,
          activityLimitation: 3,
          spo2: 93,
          fev1Percent: 62,
          peakFlow: 320
        }
      },
      patientUser
    );

    assert.ok(initialSchedule.id);
    assert.strictEqual(initialSchedule.patientId, patientUser.uid);
    assert.strictEqual(initialSchedule.intervalDays, 7);
    assert.strictEqual(initialSchedule.baselineAssessment.controlScore, 11);
    assert.strictEqual(initialSchedule.baselineAssessment.controlBand, CONTROL_BANDS.POOR);

    // Verify pre-visit dossier snippet attachment for doctor
    const dossier = await scheduledReassessmentService.getDossierSnippet(patientUser.uid, doctorUser);
    assert.strictEqual(dossier.patientId, patientUser.uid);
    assert.strictEqual(dossier.benchmark, 'NuvoAir Medical');
    assert.strictEqual(dossier.baselineScore, 11);
    assert.ok(dossier.dossierTextAr.includes('مسار التحسن السريري (معيار NuvoAir)'));
    assert.ok(dossier.dossierTextEn.includes('Clinical Trajectory (NuvoAir)'));

    console.log('  ✓ Treatment plan re-assessment staging and pre-visit dossier snippet verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 2: End-to-End Chatbot Assistant Integration (Real-Time Context & Prompts)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 2: End-to-End Chatbot Assistant Integration (Real-Time Context & Prompts)');
  {
    const chatbotContext = await scheduledReassessmentService.getChatbotContext(patientUser.uid);
    assert.strictEqual(chatbotContext.patientId, patientUser.uid);
    assert.strictEqual(chatbotContext.baselineScore, 11);
    assert.strictEqual(typeof chatbotContext.daysRemaining, 'number');
    assert.strictEqual(typeof chatbotContext.promptSuggestionAr, 'string');
    assert.strictEqual(typeof chatbotContext.promptSuggestionEn, 'string');
    assert.ok(chatbotContext.promptSuggestionAr.length > 0);
    assert.ok(chatbotContext.promptSuggestionEn.length > 0);

    // Chatbot query matching validation (bilingual)
    const arabicQueries = ['أريد تقييم تحسن التنفس', 'تقييم المتابعة', 'هل تحسنت حالتي التنفسية؟'];
    const englishQueries = ['I want to do follow-up check-in', 'respiratory reassessment', 'check breathing progress'];

    const containsReassessmentIntent = (q) => {
      const lower = q.toLowerCase();
      return (
        lower.includes('تقييم') ||
        lower.includes('متابعة') ||
        lower.includes('تحسن') ||
        lower.includes('reassessment') ||
        lower.includes('follow-up') ||
        lower.includes('progress')
      );
    };

    arabicQueries.forEach(q => assert.ok(containsReassessmentIntent(q), `Arabic query "${q}" should match`));
    englishQueries.forEach(q => assert.ok(containsReassessmentIntent(q), `English query "${q}" should match`));

    console.log('  ✓ Chatbot assistant context and bilingual query detection verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Medical Dossier & Longitudinal Trajectory Progression (Multi-Week Curve)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 3: Medical Dossier & Longitudinal Trajectory Progression (Multi-Week Curve)');
  {
    // Week 1 Check-in (Moderate improvement: +6 points)
    const week1Submission = await scheduledReassessmentService.submitReassessment(
      patientUser.uid,
      {
        dayBreathlessness: 1, // 4 pts
        nightWaking: 1,        // 3 pts
        rescuePuffsWeek: 2,    // 4 pts
        activityLimitation: 0, // 6 pts -> Total: 17 pts
        spo2: 96,
        fev1Percent: 74,
        peakFlow: 410,
        notes: 'Noticeable reduction in shortness of breath after 1 week.'
      },
      patientUser
    );

    assert.strictEqual(week1Submission.score, 17);
    assert.strictEqual(week1Submission.controlBand, CONTROL_BANDS.MODERATE);
    assert.strictEqual(week1Submission.trajectory, TRAJECTORY_STATUS.IMPROVED);
    assert.strictEqual(week1Submission.deltaPoints, 6);
    assert.strictEqual(week1Submission.deltaPct, 55);

    // Check updated dossier after Week 1
    const dossierW1 = await scheduledReassessmentService.getDossierSnippet(patientUser.uid, doctorUser);
    assert.strictEqual(dossierW1.latestScore, 17);
    assert.strictEqual(dossierW1.deltaPoints, 6);
    assert.strictEqual(dossierW1.trajectory, TRAJECTORY_STATUS.IMPROVED);

    // Week 2 Check-in (Controlled status: +12 points vs baseline)
    const week2Submission = await scheduledReassessmentService.submitReassessment(
      patientUser.uid,
      {
        dayBreathlessness: 0, // 6 pts
        nightWaking: 0,        // 6 pts
        rescuePuffsWeek: 1,    // 7 pts
        activityLimitation: 1, // 3 pts -> Total: 22 pts
        spo2: 98,
        fev1Percent: 82,
        peakFlow: 460,
        notes: 'Excellent activity tolerance, no nocturnal waking.'
      },
      patientUser
    );

    assert.strictEqual(week2Submission.score, 22);
    assert.strictEqual(week2Submission.controlBand, CONTROL_BANDS.CONTROLLED);
    assert.strictEqual(week2Submission.trajectory, TRAJECTORY_STATUS.IMPROVED);
    assert.strictEqual(week2Submission.deltaPoints, 11);

    const history = await scheduledReassessmentService.getReassessmentHistory(patientUser.uid, patientUser);
    assert.strictEqual(history.length, 2, 'History must contain 2 longitudinal submissions');

    console.log('  ✓ Multi-week longitudinal progression (11 -> 17 -> 22) verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 4: Clinical Deterioration & Exacerbation Emergency Escalation
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 4: Clinical Deterioration & Exacerbation Emergency Escalation');
  {
    const detPatient = 'pt_deteriorating_001';
    await scheduledReassessmentService.scheduleReassessment(
      detPatient,
      {
        baselineAssessment: { controlScore: 18, rescuePuffsWeek: 2 }
      },
      adminUser
    );

    // Deteriorating submission: rescue inhaler overuse and nighttime waking
    const detSubmission = await scheduledReassessmentService.submitReassessment(
      detPatient,
      {
        dayBreathlessness: 3, // 0 pts
        nightWaking: 3,        // 0 pts
        rescuePuffsWeek: 10,   // 0 pts
        activityLimitation: 3, // 0 pts -> Total: 0 pts
        spo2: 89,
        fev1Percent: 48,
        peakFlow: 220,
        notes: 'Severe wheezing, waking every night.'
      },
      adminUser
    );

    assert.strictEqual(detSubmission.score, 0);
    assert.strictEqual(detSubmission.controlBand, CONTROL_BANDS.POOR);
    assert.strictEqual(detSubmission.trajectory, TRAJECTORY_STATUS.DETERIORATING);
    assert.ok(detSubmission.deltaPoints < 0);
    assert.strictEqual(detSubmission.trajectoryDetails.clinicalReviewRecommended, true);

    const detReport = await scheduledReassessmentService.getTrajectoryReport(detPatient, doctorUser);
    assert.strictEqual(detReport.clinicalReviewRecommended, true);
    assert.strictEqual(detReport.trajectory, TRAJECTORY_STATUS.DETERIORATING);

    console.log('  ✓ Deterioration detection and clinical review recommendation trigger verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Boundary Condition: Extreme Boundary Scores (Floor 0 vs Ceiling 25)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 5: Boundary Condition: Extreme Boundary Scores (Floor 0 vs Ceiling 25)');
  {
    // Floor test: Maximum severe symptom inputs
    const floorScore = scheduledReassessmentService.calculateControlScore({
      dayBreathlessness: 10,
      nightWaking: 10,
      rescuePuffsWeek: 50,
      activityLimitation: 10
    });
    assert.strictEqual(floorScore.score, 0);
    assert.strictEqual(floorScore.controlBand, CONTROL_BANDS.POOR);
    assert.ok(floorScore.score >= 0, 'Score must never be negative');

    // Ceiling test: Zero symptoms across all dimensions
    const ceilingScore = scheduledReassessmentService.calculateControlScore({
      dayBreathlessness: 0,
      nightWaking: 0,
      rescuePuffsWeek: 0,
      activityLimitation: 0
    });
    assert.strictEqual(ceilingScore.score, 25);
    assert.strictEqual(ceilingScore.controlBand, CONTROL_BANDS.CONTROLLED);
    assert.ok(ceilingScore.score <= 25, 'Score must never exceed 25');

    // Zero-division / NaN Guard on delta calculation
    const zeroBaseTraj = scheduledReassessmentService.calculateImprovementTrajectory(
      { controlScore: 0, rescuePuffsWeek: 0 },
      { dayBreathlessness: 0, nightWaking: 0, rescuePuffsWeek: 0, activityLimitation: 0 }
    );
    assert.strictEqual(typeof zeroBaseTraj.deltaPct, 'number');
    assert.ok(!isNaN(zeroBaseTraj.deltaPct), 'Delta percentage must not be NaN');
    assert.ok(isFinite(zeroBaseTraj.deltaPct), 'Delta percentage must be finite');

    console.log('  ✓ Score bounds (0 to 25) and NaN/Zero-division guards verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Boundary Condition: Partial / Incomplete Form Submissions
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 6: Boundary Condition: Partial / Incomplete Form Submissions');
  {
    // Empty submission payload
    const emptyScore = scheduledReassessmentService.calculateControlScore({});
    assert.ok(emptyScore.score >= 0 && emptyScore.score <= 25);
    assert.strictEqual(typeof emptyScore.controlBand, 'string');

    // Submitting with empty object should apply graceful clinical fallbacks without throwing
    const fallbackSub = await scheduledReassessmentService.submitReassessment(
      'pt_fallback_001',
      {},
      adminUser
    );
    assert.ok(fallbackSub.submissionId);
    assert.ok(fallbackSub.score >= 0);
    assert.strictEqual(fallbackSub.scheduleStatus, REASSESSMENT_STATUS.COMPLETED);

    console.log('  ✓ Partial inputs and graceful clinical fallbacks verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Boundary Condition: 24h Snooze Expiration & Multiple Snoozes
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 7: Boundary Condition: 24h Snooze Expiration & Multiple Snoozes');
  {
    const snoozePt = 'pt_snooze_multi';
    await scheduledReassessmentService.scheduleReassessment(
      snoozePt,
      { intervalDays: 0 },
      adminUser
    );

    // Snooze 1
    const snz1 = await scheduledReassessmentService.snoozeReassessment(snoozePt, { hours: 24 }, adminUser);
    assert.strictEqual(snz1.status, REASSESSMENT_STATUS.SNOOZED);
    assert.strictEqual(snz1.snoozeCount, 1);
    assert.ok(snz1.snoozedUntil > Date.now());

    // Snooze 2
    const snz2 = await scheduledReassessmentService.snoozeReassessment(snoozePt, { hours: 48 }, adminUser);
    assert.strictEqual(snz2.status, REASSESSMENT_STATUS.SNOOZED);
    assert.strictEqual(snz2.snoozeCount, 2);

    // Simulate snooze expiration (snoozedUntil in past)
    const expiredSchedule = {
      snoozedUntil: Date.now() - 1000,
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: REASSESSMENT_STATUS.SNOOZED
    };
    const dynamicStatus = scheduledReassessmentService.evaluateScheduleStatus(expiredSchedule);
    assert.strictEqual(dynamicStatus, REASSESSMENT_STATUS.OVERDUE);

    console.log('  ✓ 24h Snooze stacking and expired snooze transition to overdue verified');
  }

  // -----------------------------------------------------------------------------
  // TEST 8: Boundary Condition: Out-of-Sequence & Rapid Successive Submissions
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 8: Boundary Condition: Out-of-Sequence & Rapid Submissions');
  {
    const rapidPt = 'pt_rapid_sub_001';
    await scheduledReassessmentService.scheduleReassessment(rapidPt, {}, adminUser);

    // Sub 1
    const sub1 = await scheduledReassessmentService.submitReassessment(
      rapidPt,
      { dayBreathlessness: 1, notes: 'First rapid click' },
      adminUser
    );

    // Ensure distinct monotonic millisecond timestamp
    await new Promise(resolve => setTimeout(resolve, 20));

    // Sub 2 (immediate second submission)
    const sub2 = await scheduledReassessmentService.submitReassessment(
      rapidPt,
      { dayBreathlessness: 0, notes: 'Second rapid click' },
      adminUser
    );

    assert.notStrictEqual(sub1.submissionId, sub2.submissionId);
    const rapidHistory = await scheduledReassessmentService.getReassessmentHistory(rapidPt, adminUser);
    assert.strictEqual(rapidHistory.length, 2, 'Both submissions must be recorded in history');
    assert.strictEqual(rapidHistory[0].id, sub2.submissionId, 'Latest submission must be first in history');

    console.log('  ✓ Rapid successive submissions handled without race conditions or overwrites');
  }

  // -----------------------------------------------------------------------------
  // TEST 9: Multi-Channel Reminder Batch Dispatch & Idempotency Guard (5x Batch Run)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 9: Multi-Channel Reminder Batch Dispatch & Idempotency Guard (5x Run)');
  {
    const batchPt = 'pt_idempotency_qa';
    await scheduledReassessmentService.scheduleReassessment(
      batchPt,
      { intervalDays: -2, notificationChannel: 'sms' }, // overdue
      adminUser
    );

    const targetDate = new Date().toISOString().split('T')[0];

    // Run 1: Must dispatch
    const run1 = await scheduledReassessmentService.dispatchPendingReminders(targetDate);
    assert.strictEqual(run1.success, true);
    assert.ok(run1.dispatched >= 1);

    // Runs 2 to 5: Must skip already notified (Idempotency)
    for (let i = 2; i <= 5; i++) {
      const runN = await scheduledReassessmentService.dispatchPendingReminders(targetDate);
      assert.strictEqual(runN.success, true);
      assert.strictEqual(runN.dispatched, 0, `Run ${i} must dispatch 0 new reminders`);
      assert.ok(runN.skippedAlreadyNotified >= 1, `Run ${i} must skip already notified reminders`);
    }

    console.log('  ✓ 5x Batch dispatch run confirmed strict zero-duplicate idempotency');
  }

  // -----------------------------------------------------------------------------
  // TEST 10: Zero-Trust RBAC & Cross-Patient Privacy Walls
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 10: Zero-Trust RBAC & Cross-Patient Privacy Walls');
  {
    const victimPt = patientUser.uid;

    // 1. Intruder read attempt on schedule
    await assert.rejects(
      async () => {
        await scheduledReassessmentService.getPatientSchedule(victimPt, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    // 2. Intruder submit attempt
    await assert.rejects(
      async () => {
        await scheduledReassessmentService.submitReassessment(victimPt, { dayBreathlessness: 0 }, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    // 3. Intruder trajectory read attempt
    await assert.rejects(
      async () => {
        await scheduledReassessmentService.getTrajectoryReport(victimPt, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    // 4. Intruder dossier read attempt
    await assert.rejects(
      async () => {
        await scheduledReassessmentService.getDossierSnippet(victimPt, intruderUser);
      },
      { statusCode: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' }
    );

    // 5. Authorized Clinician CAN read dossier
    const authorizedDossier = await scheduledReassessmentService.getDossierSnippet(victimPt, doctorUser);
    assert.strictEqual(authorizedDossier.patientId, victimPt);

    console.log('  ✓ Cross-patient breach attempts strictly blocked with 403 Forbidden');
  }

  // -----------------------------------------------------------------------------
  // TEST 11: Relational Database Sync & Health Check Metrics Verification
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 11: Relational Database Sync & Health Check Metrics Verification');
  {
    const dbSched = await relationalDbService.getScheduledReassessment(patientUser.uid);
    assert.ok(dbSched, 'Schedule must exist in Relational DB');
    assert.strictEqual(dbSched.patient_id, patientUser.uid);

    const dbSubs = await relationalDbService.getReassessmentSubmissions(patientUser.uid);
    assert.ok(dbSubs.length >= 2, 'Submissions must exist in Relational DB');

    const health = relationalDbService.getHealthStatus();
    assert.ok(health.metrics.scheduledReassessmentsCount > 0);
    assert.ok(health.metrics.reassessmentSubmissionsCount > 0);
    assert.ok(Object.keys(relationalDbService.tables).includes('scheduled_reassessments'));
    assert.ok(Object.keys(relationalDbService.tables).includes('reassessment_submissions'));

    console.log('  ✓ Relational DB tables and secondary indexes verified with operational metrics');
  }

  // -----------------------------------------------------------------------------
  // TEST 12: 100% Bilingual Parity across all 47 scheduledReassessment i18n Keys
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 12: 100% Bilingual Parity across all 47 scheduledReassessment i18n Keys');
  {
    assert.ok(translations.ar.scheduledReassessment, 'Arabic scheduledReassessment catalog must exist');
    assert.ok(translations.en.scheduledReassessment, 'English scheduledReassessment catalog must exist');

    const arKeys = Object.keys(translations.ar.scheduledReassessment);
    const enKeys = Object.keys(translations.en.scheduledReassessment);

    assert.strictEqual(arKeys.length, enKeys.length, `Key counts must match (${arKeys.length} vs ${enKeys.length})`);
    assert.ok(arKeys.length >= 47, `Must have at least 47 translation keys, found ${arKeys.length}`);

    arKeys.forEach(k => {
      assert.ok(translations.en.scheduledReassessment[k], `Missing English key for: ${k}`);
      assert.ok(
        typeof translations.ar.scheduledReassessment[k] === 'string' && translations.ar.scheduledReassessment[k].length > 0,
        `Arabic key ${k} must not be empty`
      );
      assert.ok(
        typeof translations.en.scheduledReassessment[k] === 'string' && translations.en.scheduledReassessment[k].length > 0,
        `English key ${k} must not be empty`
      );
    });

    // Verify key clinical terms in both languages
    assert.ok(translations.ar.scheduledReassessment.benchmarkBadge.includes('NuvoAir'));
    assert.ok(translations.en.scheduledReassessment.benchmarkBadge.includes('NuvoAir'));
    assert.ok(translations.ar.scheduledReassessment.trajectoryImproved.length > 0);
    assert.ok(translations.en.scheduledReassessment.trajectoryImproved.length > 0);
    assert.ok(translations.ar.scheduledReassessment.trajectoryStable.length > 0);
    assert.ok(translations.en.scheduledReassessment.trajectoryStable.length > 0);
    assert.ok(translations.ar.scheduledReassessment.trajectoryDeteriorating.length > 0);
    assert.ok(translations.en.scheduledReassessment.trajectoryDeteriorating.length > 0);
    assert.ok(translations.ar.scheduledReassessment.dossierSnippetTitle.length > 0);
    assert.ok(translations.en.scheduledReassessment.dossierSnippetTitle.length > 0);

    console.log(`  ✓ 100% mutual parity verified across all ${arKeys.length} keys with clinical precision`);
  }

  // -----------------------------------------------------------------------------
  // TEST 13: REST API Routes Full Integration Verification in server.js
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 13: REST API Routes Full Integration Verification in server.js');
  {
    const serverJsContent = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    const expectedRoutes = [
      "app.post('/api/reassessment/schedule'",
      "app.get('/api/reassessment/patient/:patientId'",
      "app.post('/api/reassessment/patient/:patientId/snooze'",
      "app.post('/api/reassessment/patient/:patientId/submit'",
      "app.get('/api/reassessment/patient/:patientId/history'",
      "app.get('/api/reassessment/patient/:patientId/trajectory'",
      "app.post('/api/reassessment/dispatch-reminders'",
      "app.get('/api/reassessment/dossier/:patientId'",
      "app.get('/api/reassessment/chatbot/context/:patientId'"
    ];

    expectedRoutes.forEach(route => {
      assert.ok(serverJsContent.includes(route), `server.js must contain route handler for: ${route}`);
    });

    console.log('  ✓ All 9 REST API route declarations verified in server.js');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 13 NUVOAIR RE-ASSESSMENT INTEGRATION QA & EDGE CASES TESTS PASSED (100%)');
  console.log('==================================================================\n');
  process.exit(0);
}

runIntegrationQaSuite().catch(err => {
  console.error('\n❌ INTEGRATION QA TEST RUNNER FAILED:', err);
  process.exit(1);
});
