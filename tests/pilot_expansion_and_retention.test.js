/**
 * Health Vibe AI - Pilot Expansion, Retention & Progression Criteria Test Suite
 * 
 * Verifies:
 * 1. Multi-stage expansion roadmap (Stage 0 Pilot -> Stage 1 Early Commercial -> Stage 2 Regional -> Stage 3 Enterprise).
 * 2. Strict progression gate evaluation across:
 *    - Service Quality (concordance, CSAT, completeness).
 *    - Response Time (p95 API latency, doctor turnaround).
 *    - Errors & Safety (0 misclassifications, <0.1% technical errors, 0 circuit breaker stops).
 *    - Repeat Usage (active clinical days, weekly volume).
 * 3. CRITICAL TELEMETRY SAFEGUARD:
 *    - Form leads, demo requests, and account registrations are NEVER counted as verified active usage.
 *    - Only clinics with verified clinical workflow transactions within trailing 14d are active.
 * 4. Clinic cohort retention calculation.
 * 5. Revenue per Clinic (ARPC) and feature adoption tracking.
 * 6. De-identified aggregate results file integrity: ZERO patient PHI.
 * 7. Express API endpoint contracts (/api/expansion/stages, /api/expansion/case-study).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const expansionService = require('../backend/expansion-analytics-service');
const app = require('../backend/server');

const {
  EXPANSION_STAGES,
  STAGE_PROGRESSION_GATES,
  ENGAGEMENT_STATUS,
  classifyClinicEngagement,
  getVerifiedActiveClinics,
  evaluateStageProgression,
  calculateClinicRetention,
  calculateRevenuePerClinic,
  calculateFeatureAdoption,
  PILOT_CASE_STUDY
} = expansionService;

console.log('==================================================================');
console.log('🚀 HEALTH VIBE AI: PILOT EXPANSION & PROGRESSION CRITERIA TESTS');
console.log('   Gradual Scaling, Active Usage Gating & Zero-PHI Verification');
console.log('==================================================================\n');

async function runTests() {
  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Expansion Stages & Progression Gate Definitions
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Expansion Stages & Progression Gate Definitions');

  assert.ok(EXPANSION_STAGES.STAGE_0_PILOT, 'Stage 0 Pilot must exist');
  assert.strictEqual(EXPANSION_STAGES.STAGE_0_PILOT.status, 'COMPLETED_VALIDATED');
  assert.strictEqual(EXPANSION_STAGES.STAGE_0_PILOT.targetClinics, 1);
  assert.strictEqual(EXPANSION_STAGES.STAGE_0_PILOT.targetDoctors, 3);

  assert.ok(EXPANSION_STAGES.STAGE_1_EXPANSION, 'Stage 1 Expansion must exist');
  assert.strictEqual(EXPANSION_STAGES.STAGE_1_EXPANSION.status, 'READY_FOR_KICKOFF');
  assert.strictEqual(EXPANSION_STAGES.STAGE_1_EXPANSION.targetClinics, 5);

  assert.ok(EXPANSION_STAGES.STAGE_2_REGIONAL, 'Stage 2 Regional must exist');
  assert.ok(EXPANSION_STAGES.STAGE_3_ENTERPRISE, 'Stage 3 Enterprise must exist');

  // Verify Progression Gate Thresholds
  const { serviceQuality, responseTime, errorsAndSafety, repeatUsage } = STAGE_PROGRESSION_GATES;
  assert.strictEqual(serviceQuality.minConcordanceRate, 0.95);
  assert.strictEqual(serviceQuality.minPatientCsat, 0.90);
  assert.strictEqual(responseTime.maxApiLatencyP95Ms, 400);
  assert.strictEqual(responseTime.maxDoctorTurnaroundMins, 15.0);
  assert.strictEqual(errorsAndSafety.maxClinicalMisclassificationRate, 0.0);
  assert.strictEqual(errorsAndSafety.maxTrippedCircuitBreakers, 0);
  assert.strictEqual(repeatUsage.minActiveClinicalDaysRatio, 0.80);
  assert.strictEqual(repeatUsage.minWeeklyCasesPerDoctor, 15);

  console.log('  ✓ 4 Expansion stages verified (Stage 0 to Stage 3).');
  console.log('  ✓ Gate thresholds confirmed across Quality, Response Time, Safety, and Repeat Usage.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Progression Gate Evaluation & Failure Traps
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: Progression Gate Evaluation & Failure Traps');

  // Case A: Ideal qualifying telemetry (Pilot baseline)
  const qualifyingTelemetry = {
    concordanceRate: 0.963,
    patientCsat: 0.942,
    documentationCompleteness: 0.994,
    apiLatencyP95Ms: 320,
    doctorTurnaroundMins: 12.0,
    urgentDispatchLatencySecs: 1.2,
    clinicalMisclassificationRate: 0.0,
    technicalErrorRate: 0.0002,
    trippedCircuitBreakers: 0,
    zeroAutonomousDiagnosisViolations: true,
    activeClinicalDaysRatio: 0.88,
    weeklyCasesPerDoctor: 24,
    cohort30DayRetention: 1.0
  };

  const passEval = evaluateStageProgression(qualifyingTelemetry);
  assert.strictEqual(passEval.qualifiesForNextStage, true, 'Qualifying telemetry must pass stage gate');
  assert.strictEqual(passEval.failingCriteria.length, 0);

  // Case B: Degraded clinical concordance (below 95%)
  const lowQualityTelemetry = { ...qualifyingTelemetry, concordanceRate: 0.91 };
  const failQuality = evaluateStageProgression(lowQualityTelemetry);
  assert.strictEqual(failQuality.qualifiesForNextStage, false);
  assert.ok(failQuality.failingCriteria.includes('SERVICE_QUALITY'), 'Must flag SERVICE_QUALITY failure');

  // Case C: High latency (p95 > 400ms)
  const slowTelemetry = { ...qualifyingTelemetry, apiLatencyP95Ms: 550 };
  const failSlow = evaluateStageProgression(slowTelemetry);
  assert.strictEqual(failSlow.qualifiesForNextStage, false);
  assert.ok(failSlow.failingCriteria.includes('RESPONSE_TIME'), 'Must flag RESPONSE_TIME failure');

  // Case D: Clinical safety misclassification
  const unsafeTelemetry = { ...qualifyingTelemetry, clinicalMisclassificationRate: 0.02 };
  const failSafety = evaluateStageProgression(unsafeTelemetry);
  assert.strictEqual(failSafety.qualifiesForNextStage, false);
  assert.ok(failSafety.failingCriteria.includes('ERRORS_AND_SAFETY'), 'Must flag ERRORS_AND_SAFETY failure');

  // Case E: Infrequent clinical usage (< 80% active days)
  const lowUsageTelemetry = { ...qualifyingTelemetry, activeClinicalDaysRatio: 0.65 };
  const failUsage = evaluateStageProgression(lowUsageTelemetry);
  assert.strictEqual(failUsage.qualifiesForNextStage, false);
  assert.ok(failUsage.failingCriteria.includes('REPEAT_USAGE'), 'Must flag REPEAT_USAGE failure');

  console.log('  ✓ Qualifying telemetry properly transitions to next stage.');
  console.log('  ✓ Quality, Latency, Safety, and Usage traps strictly block unauthorized progression.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: CRITICAL TELEMETRY SAFEGUARD: Leads/Registrations != Active Usage
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Active Usage Telemetry Safeguard (Leads/Registrations Rejected)');

  const nowIso = new Date().toISOString();
  const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString();
  const fortyDaysAgo = new Date(Date.now() - 40 * 86400000).toISOString();

  // Prospect 1: Submitted a demo request / lead form
  const leadProspect = {
    isLead: true,
    leadId: 'LEAD-101',
    clinicName: 'Prospective Cairo Clinic',
    email: 'doctor@prospect.com'
  };
  const leadClass = classifyClinicEngagement(leadProspect);
  assert.strictEqual(leadClass.status, ENGAGEMENT_STATUS.LEAD_PROSPECT);
  assert.strictEqual(leadClass.isVerifiedActive, false, 'Lead request MUST NOT be active usage');

  // Prospect 2: Registered user / issued credentials, but 0 completed assessments
  const registeredEmpty = {
    clinicId: 'clinic_registered_empty',
    clinicName: 'Registered Inactive Center',
    completedAssessmentsCount: 0,
    subscriptionStatus: 'active'
  };
  const regClass = classifyClinicEngagement(registeredEmpty);
  assert.strictEqual(regClass.status, ENGAGEMENT_STATUS.REGISTERED_INACTIVE);
  assert.strictEqual(regClass.isVerifiedActive, false, '0-assessment registration MUST NOT be active usage');

  // Prospect 3: Dormant clinic (inactive for 20 days)
  const dormantClinic = {
    clinicId: 'clinic_dormant',
    clinicName: 'Dormant Respiratory Unit',
    completedAssessmentsCount: 45,
    lastClinicalActivityAt: twentyDaysAgo
  };
  const dormantClass = classifyClinicEngagement(dormantClinic);
  assert.strictEqual(dormantClass.status, ENGAGEMENT_STATUS.DORMANT);
  assert.strictEqual(dormantClass.isVerifiedActive, false, 'Dormant clinic MUST NOT be active usage');

  // Prospect 4: Churned clinic (inactive for 40 days)
  const churnedClinic = {
    clinicId: 'clinic_churned',
    clinicName: 'Closed Clinic',
    completedAssessmentsCount: 12,
    lastClinicalActivityAt: fortyDaysAgo
  };
  const churnedClass = classifyClinicEngagement(churnedClinic);
  assert.strictEqual(churnedClass.status, ENGAGEMENT_STATUS.CHURNED);
  assert.strictEqual(churnedClass.isVerifiedActive, false, 'Churned clinic MUST NOT be active usage');

  // Clinic 5: Real Verified Active Clinic
  const activeClinic = {
    clinicId: 'clinic_nile_chest',
    clinicName: 'Nile Chest Care Center',
    completedAssessmentsCount: 320,
    lastClinicalActivityAt: nowIso,
    subscriptionStatus: 'trialing'
  };
  const activeClass = classifyClinicEngagement(activeClinic);
  assert.strictEqual(activeClass.status, ENGAGEMENT_STATUS.TRIALING_ACTIVE);
  assert.strictEqual(activeClass.isVerifiedActive, true, 'Clinical user with recent cases MUST be active usage');

  // Test array filter: getVerifiedActiveClinics
  const mixedCohort = [leadProspect, registeredEmpty, dormantClinic, churnedClinic, activeClinic];
  const activeOnly = getVerifiedActiveClinics(mixedCohort);
  assert.strictEqual(activeOnly.length, 1, 'Only 1 of 5 items is verified active usage');
  assert.strictEqual(activeOnly[0].clinicId, 'clinic_nile_chest');

  console.log('  ✓ Leads, demo submissions, and empty registrations correctly rejected.');
  console.log('  ✓ Dormant and churned accounts accurately flagged as inactive.');
  console.log('  ✓ Verified active usage strictly isolated to actual clinical workflow executions.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Clinic Retention, Revenue per Clinic & Feature Adoption
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Clinic Retention, ARPC & Feature Adoption Tracking');

  // Retention evaluation
  const retentionReport = calculateClinicRetention(mixedCohort);
  assert.strictEqual(retentionReport.unverifiedLeadsCount, 1, '1 lead isolated');
  assert.strictEqual(retentionReport.totalClinicsInCohort, 4, '4 onboarded clinics in denominator');
  assert.strictEqual(retentionReport.verifiedActiveCount, 1);
  assert.strictEqual(retentionReport.dormantCount, 1);
  assert.strictEqual(retentionReport.churnedCount, 2);
  assert.strictEqual(retentionReport.retentionRate, 0.25);

  // Revenue per clinic (ARPC)
  const mockLedger = [
    { entryType: 'payment_received', grossAmount: 499.0, netAmount: 437.72 },
    { entryType: 'payment_received', grossAmount: 499.0, netAmount: 437.72 },
    { entryType: 'refund_issued', grossAmount: 100.0, netAmount: 87.72 }
  ];
  const arpcReport = calculateRevenuePerClinic([activeClinic], mockLedger);
  assert.strictEqual(arpcReport.activeClinicsCount, 1);
  assert.strictEqual(arpcReport.totalNetRevenueEgp, 787.72);
  assert.strictEqual(arpcReport.averageRevenuePerClinicEgp, 787.72);

  // Feature adoption
  const adoptionReport = calculateFeatureAdoption([activeClinic]);
  assert.strictEqual(adoptionReport.activeClinicsEvaluated, 1);
  assert.strictEqual(adoptionReport.features.aiPreTriage.adoptionRate, 1.0);
  assert.strictEqual(adoptionReport.features.doctorVerificationQueue.adoptionRate, 1.0);

  console.log(`  ✓ Retention rate accurately calculated: ${retentionReport.retentionRate * 100}%.`);
  console.log(`  ✓ ARPC accurately reconciled from revenue ledger: ${arpcReport.averageRevenuePerClinicEgp} EGP.`);
  console.log('  ✓ Feature adoption depth measured across clinical capabilities.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: De-identified Aggregate Results File & Case Study (Zero PHI)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: De-identified Aggregate Results & Case Study (Zero-PHI Guarantee)');

  const aggregateFilePath = path.join(__dirname, '../dataset/pilot_aggregate_results_anonymized.json');
  assert.ok(fs.existsSync(aggregateFilePath), 'Aggregate results JSON file must exist');

  const rawJson = fs.readFileSync(aggregateFilePath, 'utf8');
  const aggregateData = JSON.parse(rawJson);

  assert.strictEqual(aggregateData.metadata.phiContained, false);
  assert.strictEqual(aggregateData.metadata.deidentificationVerified, true);
  assert.strictEqual(aggregateData.aggregateVolume.totalPatientAssessmentsCompleted, 320);
  assert.strictEqual(aggregateData.clinicalQualityAndConcordance.physicianTriageConcordanceRate, 0.963);
  assert.strictEqual(aggregateData.operationalEfficiencyMetrics.patientIntakeDurationMins.percentReduction, 72.0);

  // Strict regex scanning for accidental leakage of direct identifiers in the raw JSON
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const egyptianPhoneRegex = /(?:\+?20|0)?1[0125]\d{8}/;
  const nationalIdRegex = /\b\d{14}\b/;

  assert.strictEqual(emailRegex.test(rawJson), false, 'No emails permitted in aggregate results file');
  assert.strictEqual(egyptianPhoneRegex.test(rawJson), false, 'No mobile numbers permitted in aggregate results file');
  assert.strictEqual(nationalIdRegex.test(rawJson), false, 'No 14-digit national IDs permitted');

  // Case study verification
  assert.strictEqual(PILOT_CASE_STUDY.partner.institutionName, 'Nile Chest Care Center');
  assert.strictEqual(PILOT_CASE_STUDY.testimonialQuote.consentStatus, 'SIGNED_BILATERAL_CONSENT_ON_FILE');
  assert.ok(PILOT_CASE_STUDY.privacyGuarantee.includes('Zero Patient Health Information'));

  console.log('  ✓ Aggregate results JSON confirmed 100% de-identified (320 assessments, 72% triage drop).');
  console.log('  ✓ Automated scanner confirms ZERO patient emails, phone numbers, or national IDs.');
  console.log('  ✓ Pilot Case Study confirmed with verified bilateral consent status.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Express Expansion Endpoints Integration
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 6: Express Expansion Endpoints Integration');

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;

      http.get(`http://127.0.0.1:${port}/api/expansion/stages`, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            assert.strictEqual(res.statusCode, 200, 'GET /api/expansion/stages must return 200');
            const body = JSON.parse(data);
            assert.strictEqual(body.success, true);
            assert.ok(body.stages.STAGE_0_PILOT);
            assert.ok(body.stages.STAGE_1_EXPANSION);
            assert.strictEqual(body.currentProgressionEvaluation.qualifiesForNextStage, true);

            // Test case study endpoint
            http.get(`http://127.0.0.1:${port}/api/expansion/case-study`, (res2) => {
              let data2 = '';
              res2.on('data', chunk2 => { data2 += chunk2; });
              res2.on('end', () => {
                server.close();
                try {
                  assert.strictEqual(res2.statusCode, 200);
                  const body2 = JSON.parse(data2);
                  assert.strictEqual(body2.success, true);
                  assert.strictEqual(body2.phiExposed, false);
                  assert.strictEqual(body2.caseStudy.id, 'CASE_STUDY_NILE_CHEST_2026');
                  console.log('  ✓ GET /api/expansion/stages and /api/expansion/case-study passed.\n');
                  resolve();
                } catch (e) {
                  reject(e);
                }
              });
            }).on('error', (err) => {
              server.close();
              reject(err);
            });
          } catch (e) {
            server.close();
            reject(e);
          }
        });
      }).on('error', (err) => {
        server.close();
        reject(err);
      });
    });
  });

  console.log('==================================================================');
  console.log('🎉 ALL EXPANSION, RETENTION & PROGRESSION TESTS PASSED (100%)');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ EXPANSION TEST SUITE FAILURE:', err);
  process.exit(1);
});
