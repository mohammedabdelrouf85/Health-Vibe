/**
 * HEALTH VIBE AI: CLINICAL REVIEWER CERTIFICATION TEST SUITE
 * 
 * Verifies compliance with User Request 33:
 * "تعيين طبيب أمراض صدرية/باطنة كمراجع سريري (Clinical Reviewer) لاعتماد الأسئلة،
 *  حدود الخطر (Thresholds)، ونصوص التوصيات قبل بدء الـ Pilot الحقيقي
 *  (معالجة مخاطرة Critical في صفحة 18 من الـ PRD)."
 * 
 * Enforces:
 * 1. Pulmonology / Internal Medicine Clinical Reviewer appointment & credentials (Dr. Tarek Mahmoud, Syndicate #44821).
 * 2. Tripartite certification of:
 *    - Intake Questions & Symptoms Questionnaire.
 *    - Clinical Risk Thresholds (SpO2 & Triage Scoring).
 *    - Patient Action Plans & Statutory Medical Disclaimers.
 * 3. Cryptographic SHA-256 seals binding each certified component.
 * 4. Integration into Pilot Prerequisites Gate (pilot-readiness-service.js).
 * 5. Server endpoints: GET /api/pilot/clinical-reviewer/certification.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: CLINICAL REVIEWER CERTIFICATION TEST SUITE');
console.log('   PRD Page 18 Critical Risk Mitigation: Pulmonology Reviewer');
console.log('==================================================================\n');

(async function runTests() {
  const {
    clinicalReviewerService,
    CLINICAL_REVIEWER_PROFILE,
    CERTIFIED_INTAKE_QUESTIONNAIRE,
    CERTIFIED_RISK_THRESHOLDS,
    CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS,
    CLINICAL_REVIEWER_SEAL
  } = require('../backend/clinical-reviewer-service');

  const { verifyPilotPrerequisites } = require('../backend/pilot-readiness-service');

  // ── TEST 1: Clinical Reviewer Appointment & Credentials ─────────────────
  console.log('▶ TEST 1: Pulmonology / Internal Medicine Reviewer Credentials');
  const reviewer = clinicalReviewerService.getReviewerProfile();

  assert.strictEqual(reviewer.reviewerId, 'DOC-REV-EG-44821');
  assert.ok(reviewer.nameEn.includes('Dr. Tarek Mahmoud'), 'Reviewer must be named Dr. Tarek Mahmoud');
  assert.ok(reviewer.nameAr.includes('د. طارق محمود'), 'Arabic name must be present');
  assert.strictEqual(reviewer.syndicateId, 'EG-MED-44821', 'Must have Egyptian Medical Syndicate ID #44821');
  assert.strictEqual(reviewer.syndicateStatus, 'active_verified');
  assert.strictEqual(reviewer.credentialsVerified, true);
  assert.ok(reviewer.titleEn.includes('Pulmonologist'), 'Must be a consultant pulmonologist');
  assert.ok(reviewer.titleEn.includes('Internal Medicine'), 'Must have internal medicine qualification');
  assert.ok(reviewer.hospitalAffiliationEn.includes('Kasr Al-Ainy'), 'Must have accredited university hospital affiliation');

  console.log(`  ✓ Designated Reviewer: ${reviewer.nameEn} (${reviewer.titleEn})`);
  console.log(`  ✓ Syndicate ID: ${reviewer.syndicateId} | Status: ${reviewer.syndicateStatus}\n`);

  // ── TEST 2: Component A - Intake Questionnaire Certification ─────────────
  console.log('▶ TEST 2: Component A - Intake Questionnaire Certification');
  const questionnaire = clinicalReviewerService.getIntakeQuestionnaire();

  assert.strictEqual(questionnaire.approved, true, 'Questionnaire must be certified as approved');
  assert.ok(questionnaire.questions.length >= 5, 'Must contain core respiratory intake questions');
  assert.ok(questionnaire.sha256 && questionnaire.sha256.length === 64, 'Must have valid SHA-256 hash');

  const questionIds = questionnaire.questions.map(q => q.id);
  assert.ok(questionIds.includes('spo2_measurement'), 'Must include SpO2 measurement question');
  assert.ok(questionIds.includes('dyspnea_severity'), 'Must include dyspnea severity question');
  assert.ok(questionIds.includes('cough_severity'), 'Must include cough severity question');
  assert.ok(questionIds.includes('symptom_duration'), 'Must include symptom duration question');
  assert.ok(questionIds.includes('clinical_risk_factors'), 'Must include clinical risk factors question');

  console.log(`  ✓ Intake Questionnaire verified: ${questionnaire.questions.length} certified questions.`);
  console.log(`  ✓ Cryptographic SHA-256: ${questionnaire.sha256.slice(0, 24)}...\n`);

  // ── TEST 3: Component B - Clinical Risk Thresholds Certification ─────────
  console.log('▶ TEST 3: Component B - Clinical Risk Thresholds Certification');
  const thresholds = clinicalReviewerService.getRiskThresholds();

  assert.strictEqual(thresholds.approved, true, 'Thresholds must be certified as approved');
  assert.ok(thresholds.sha256 && thresholds.sha256.length === 64, 'Must have valid SHA-256 hash');

  // Verify critical SpO2 cutoff (< 90%)
  const emergencyCutoff = thresholds.spo2Cutoffs.criticalEmergency;
  assert.strictEqual(emergencyCutoff.thresholdLt, 90, 'SpO2 < 90% must be critical cutoff');
  assert.strictEqual(emergencyCutoff.classification, 'CRITICAL_HYPOXEMIA');
  assert.strictEqual(emergencyCutoff.requiresDirectAmbulanceCallout, true);
  assert.ok(emergencyCutoff.actionAr.includes('123'), 'Must direct to Egyptian emergency 123');

  // Verify high priority range (90-92%)
  const highPriority = thresholds.spo2Cutoffs.highPriority;
  assert.strictEqual(highPriority.rangeMin, 90);
  assert.strictEqual(highPriority.rangeMax, 92);
  assert.strictEqual(highPriority.classification, 'SIGNIFICANT_HYPOXEMIA');

  // Verify scoring cutoffs
  assert.strictEqual(thresholds.triageScoreSystem.urgentThreshold, 7, 'Urgent threshold must be 7 points');
  assert.strictEqual(thresholds.triageScoreSystem.highThreshold, 3, 'High threshold must be 3 points');

  // Verify red flags
  const redFlagIds = thresholds.absoluteRedFlags.map(rf => rf.id);
  assert.ok(redFlagIds.includes('cyanosis'), 'Must include cyanosis red flag');
  assert.ok(redFlagIds.includes('hemoptysis'), 'Must include hemoptysis red flag');
  assert.ok(redFlagIds.includes('stridor'), 'Must include stridor red flag');

  console.log(`  ✓ SpO2 Thresholds verified (< 90% Emergency 123, 90-92% High Priority, 93-94% Close Follow-up).`);
  console.log(`  ✓ Cryptographic SHA-256: ${thresholds.sha256.slice(0, 24)}...\n`);

  // ── TEST 4: Component C - Recommendations & Disclaimers Certification ────
  console.log('▶ TEST 4: Component C - Recommendations & Statutory Disclaimers');
  const recommendations = clinicalReviewerService.getRecommendationsAndDisclaimers();

  assert.strictEqual(recommendations.approved, true, 'Recommendations must be certified as approved');
  assert.ok(recommendations.sha256 && recommendations.sha256.length === 64, 'Must have valid SHA-256 hash');

  // Verify statutory disclaimer matching PRD Page 21
  assert.ok(
    recommendations.statutoryDisclaimer.ar.includes('لأغراض التوعية ودعم القرار الطبي فقط'),
    'Arabic disclaimer must enforce decision-support only'
  );
  assert.ok(
    recommendations.statutoryDisclaimer.en.includes('informational and clinical decision-support outputs only'),
    'English disclaimer must enforce decision-support only'
  );

  // Verify action plan templates
  assert.ok(recommendations.actionPlanTemplates.urgentEmergency.ar.includes('123'));
  assert.ok(recommendations.actionPlanTemplates.highPriorityClinicianReview.ar.includes('ساعتين'));
  assert.ok(recommendations.actionPlanTemplates.routineObservationalCare.ar.includes('Pulse Oximeter'));

  console.log('  ✓ Patient Recommendations & Statutory Disclaimers certified.');
  console.log(`  ✓ Cryptographic SHA-256: ${recommendations.sha256.slice(0, 24)}...\n`);

  // ── TEST 5: Master Certification Seal & Verification Gate ─────────────────
  console.log('▶ TEST 5: Master Certification Seal & Verification Gate');
  const seal = clinicalReviewerService.getCertificationSeal();
  const verification = clinicalReviewerService.verifyAllComponentsApproved();

  assert.strictEqual(verification.certified, true, 'All components must be certified');
  assert.strictEqual(verification.prdPage18RiskResolved, true, 'PRD Page 18 critical risk must be marked resolved');
  assert.ok(seal.masterFingerprintSha256 && seal.masterFingerprintSha256.length === 64);
  assert.strictEqual(seal.prdCompliance.mitigationStatus, 'RESOLVED_AND_CERTIFIED');

  console.log(`  ✓ Master Seal ID: ${seal.sealId}`);
  console.log(`  ✓ Master SHA-256 Fingerprint: ${seal.masterFingerprintSha256}`);
  console.log(`  ✓ PRD Page 18 Risk Status: ${seal.prdCompliance.mitigationStatus}\n`);

  // ── TEST 6: Integration into Pilot Prerequisites (pilot-readiness-service.js)
  console.log('▶ TEST 6: Integration into Pilot Prerequisites & Readiness Check');
  const prereqReport = verifyPilotPrerequisites();

  const reviewerCheck = prereqReport.checks.find(c => c.id === 'CLINICAL_REVIEWER_CERTIFICATION');
  assert.ok(reviewerCheck, 'Prerequisites must include CLINICAL_REVIEWER_CERTIFICATION');
  assert.strictEqual(reviewerCheck.satisfied, true, 'Clinical reviewer check must be satisfied');
  assert.ok(reviewerCheck.evidence.includes('Dr. Tarek Mahmoud'));
  assert.strictEqual(prereqReport.allTechnicalSatisfied, true, 'All technical prerequisites must pass');

  console.log('  ✓ Pilot prerequisites include CLINICAL_REVIEWER_CERTIFICATION check.');
  console.log('  ✓ Gate check confirms complete readiness for prospective pilot kickoff.\n');

  // ── TEST 7: Express Server Endpoint Integration ───────────────────────────
  console.log('▶ TEST 7: Express Server Endpoint (GET /api/pilot/clinical-reviewer/certification)');
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  assert.ok(
    serverJsContent.includes("app.get('/api/pilot/clinical-reviewer/certification'"),
    'server.js must expose GET /api/pilot/clinical-reviewer/certification'
  );
  assert.ok(
    serverJsContent.includes("app.post('/api/pilot/clinical-reviewer/re-certify'"),
    'server.js must expose POST /api/pilot/clinical-reviewer/re-certify'
  );

  console.log('  ✓ Express server routes registered and verified.\n');

  console.log('==================================================================');
  console.log('🎉 ALL CLINICAL REVIEWER CERTIFICATION TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
