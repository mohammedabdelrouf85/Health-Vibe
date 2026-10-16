/**
 * HEALTH VIBE AI: RESPIRATORY CLINICAL QUESTION & TARGET LABELS TEST SUITE
 * 
 * Verifies compliance with User Request 34:
 * "حسم وتوثيق الـ Clinical Question والـ Target Condition/Label لوحدة الجهاز التنفسي الأولى
 *  (مثل: تصنيف احتمالية الإصابة بالسدة الرئوية/الربو/العدوى التنفسية الحادة وتحديد درجة الاستعجال الطبي)."
 * 
 * Direct adherence to:
 * - PRD Page 22, Section 19: "Exact Respiratory use case: يجب تثبيت أول target condition/label والـ clinical question قبل تدريب النموذج النهائي."
 * - PRD Page 2: Scope decision making Respiratory Module the Flagship MVP.
 * - PRD Page 18: Clinical Reviewer endorsement & critical risk mitigation.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🫁 HEALTH VIBE AI: RESPIRATORY CLINICAL SPECIFICATION TEST SUITE');
console.log('   PRD Page 22 Resolution: Clinical Question, Target Labels & Urgency');
console.log('==================================================================\n');

(async function runTests() {
  const {
    respiratoryClinicalSpecService,
    PRIMARY_CLINICAL_QUESTION,
    TARGET_CONDITIONS,
    URGENCY_TIERS,
    CLINICAL_SPEC_SEAL
  } = require('../backend/respiratory-clinical-spec-service');

  const { clinicalReviewerService } = require('../backend/clinical-reviewer-service');

  // ── TEST 1: Primary Clinical Question Formulation ─────────────────────────
  console.log('▶ TEST 1: Primary Clinical Question Bilingual Formulation');
  const question = respiratoryClinicalSpecService.getPrimaryQuestion();

  assert.ok(question.formulationEn, 'English clinical question must be defined');
  assert.ok(question.formulationAr, 'Arabic clinical question must be defined');

  // Check English keywords
  assert.ok(question.formulationEn.includes('Acute Respiratory Infection'), 'Must name Acute Respiratory Infection');
  assert.ok(question.formulationEn.includes('Bronchial Asthma Exacerbation'), 'Must name Bronchial Asthma Exacerbation');
  assert.ok(question.formulationEn.includes('Chronic Obstructive Pulmonary Disease (COPD) Exacerbation'), 'Must name COPD Exacerbation');
  assert.ok(question.formulationEn.includes('degree of medical urgency'), 'Must name medical urgency determination');

  // Check Arabic keywords
  assert.ok(question.formulationAr.includes('عدوى تنفسية حادة'), 'Arabic must specify acute respiratory infection');
  assert.ok(question.formulationAr.includes('الربو الشعبي'), 'Arabic must specify asthma');
  assert.ok(question.formulationAr.includes('السدة الرئوية المزمنة'), 'Arabic must specify COPD');
  assert.ok(question.formulationAr.includes('درجة الاستعجال الطبي'), 'Arabic must specify medical urgency');

  console.log('  ✓ English Formulation: ' + question.formulationEn.slice(0, 95) + '...');
  console.log('  ✓ Arabic Formulation: ' + question.formulationAr.slice(0, 95) + '...\n');

  // ── TEST 2: Target Condition Diagnostic Labels & ICD-10 Mappings ──────────
  console.log('▶ TEST 2: Target Condition Labels & ICD-10 Coding Mappings');
  const conditions = respiratoryClinicalSpecService.getTargetConditions();

  const expectedLabels = [
    'LABEL_ACUTE_RESPIRATORY_INFECTION',
    'LABEL_ASTHMA_EXACERBATION',
    'LABEL_COPD_EXACERBATION',
    'LABEL_MILD_URI_OR_NORMAL'
  ];

  for (const label of expectedLabels) {
    assert.ok(conditions[label], `Target condition ${label} must be present`);
    assert.ok(conditions[label].icd10Codes.length > 0, `${label} must have mapped ICD-10 codes`);
    assert.ok(conditions[label].nameAr, `${label} must have Arabic clinical name`);
    assert.ok(conditions[label].nameEn, `${label} must have English clinical name`);
  }

  // Verify ICD-10 codes
  assert.ok(conditions.LABEL_ACUTE_RESPIRATORY_INFECTION.icd10Codes.includes('J20.9'));
  assert.ok(conditions.LABEL_ACUTE_RESPIRATORY_INFECTION.icd10Codes.includes('J18.9'));
  assert.ok(conditions.LABEL_ASTHMA_EXACERBATION.icd10Codes.includes('J45.901'));
  assert.ok(conditions.LABEL_COPD_EXACERBATION.icd10Codes.includes('J44.1'));
  assert.ok(conditions.LABEL_MILD_URI_OR_NORMAL.icd10Codes.includes('J00'));

  console.log('  ✓ Verified 4 Target Diagnostic Labels with ICD-10 mappings:');
  console.log('    • ARI/LRTI: ' + conditions.LABEL_ACUTE_RESPIRATORY_INFECTION.icd10Codes.join(', '));
  console.log('    • Asthma: ' + conditions.LABEL_ASTHMA_EXACERBATION.icd10Codes.join(', '));
  console.log('    • COPD: ' + conditions.LABEL_COPD_EXACERBATION.icd10Codes.join(', '));
  console.log('    • Mild URI: ' + conditions.LABEL_MILD_URI_OR_NORMAL.icd10Codes.join(', ') + '\n');

  // ── TEST 3: Clinical Urgency & Triage Tiers ────────────────────────────────
  console.log('▶ TEST 3: Clinical Urgency & Triage Tiers Stratification');
  const tiers = respiratoryClinicalSpecService.getUrgencyTiers();

  assert.ok(tiers.URGENT_EMERGENCY, 'Must define URGENT_EMERGENCY tier');
  assert.ok(tiers.HIGH_PRIORITY_CLINICIAN_REVIEW, 'Must define HIGH_PRIORITY_CLINICIAN_REVIEW tier');
  assert.ok(tiers.ROUTINE_OUTPATIENT_CARE, 'Must define ROUTINE_OUTPATIENT_CARE tier');

  // Tier 1 criteria: SpO2 < 90% or score >= 7
  assert.strictEqual(tiers.URGENT_EMERGENCY.criteria.spo2ThresholdLt, 90);
  assert.strictEqual(tiers.URGENT_EMERGENCY.criteria.triageScoreGte, 7);
  assert.strictEqual(tiers.URGENT_EMERGENCY.actionProtocol.emergencyNumber, '123');

  // Tier 2 criteria: SpO2 90-92%
  assert.strictEqual(tiers.HIGH_PRIORITY_CLINICIAN_REVIEW.criteria.spo2RangeMin, 90);
  assert.strictEqual(tiers.HIGH_PRIORITY_CLINICIAN_REVIEW.criteria.spo2RangeMax, 92);
  assert.strictEqual(tiers.HIGH_PRIORITY_CLINICIAN_REVIEW.actionProtocol.maxResponseHours, 4);

  // Tier 3 criteria: SpO2 >= 93%
  assert.strictEqual(tiers.ROUTINE_OUTPATIENT_CARE.criteria.spo2Min, 93);
  assert.strictEqual(tiers.ROUTINE_OUTPATIENT_CARE.actionProtocol.maxResponseHours, 48);

  console.log('  ✓ Tier 1 (Urgent Emergency): SpO2 < 90% -> Direct 123 Dispatch.');
  console.log('  ✓ Tier 2 (High Priority Review): SpO2 90-92% -> Clinic consultation <= 4h.');
  console.log('  ✓ Tier 3 (Routine Outpatient): SpO2 >= 93% -> Outpatient review <= 48h.\n');

  // ── TEST 4: Deterministic Decision Logic & Classification Scenarios ────────
  console.log('▶ TEST 4: Deterministic Decision Logic & Classification Scenarios');

  // Scenario A: Hypoxemic Emergency (SpO2 87%, severe cough, rest dyspnea)
  const caseA = respiratoryClinicalSpecService.classifyLikelihoodAndUrgency({
    oxygenLevel: 87,
    cough: 'severe',
    dyspnea: 'rest'
  });
  assert.strictEqual(caseA.urgencyTier.tierId, 'URGENT_EMERGENCY');
  assert.strictEqual(caseA.requiresEmergencyDispatch, true);

  // Scenario B: Acute Infection (SpO2 91%, fever 38.8C, cough moderate, score = 5)
  const caseB = respiratoryClinicalSpecService.classifyLikelihoodAndUrgency({
    oxygenLevel: 91,
    fever: true,
    temperature: 38.8,
    cough: 'moderate',
    dyspnea: 'none'
  });
  assert.strictEqual(caseB.urgencyTier.tierId, 'HIGH_PRIORITY_CLINICIAN_REVIEW');
  assert.strictEqual(caseB.primaryConditionLikelihood.labelId, 'LABEL_ACUTE_RESPIRATORY_INFECTION');

  // Scenario C: COPD Exacerbation (58yo male smoker, chronic cough, worsened dyspnea)
  const caseC = respiratoryClinicalSpecService.classifyLikelihoodAndUrgency({
    age: 58,
    smoking: true,
    copd: true,
    oxygenLevel: 92,
    dyspnea: 'exertional',
    cough: 'moderate'
  });
  assert.strictEqual(caseC.primaryConditionLikelihood.labelId, 'LABEL_COPD_EXACERBATION');
  assert.ok(caseC.icd10Codes.includes('J44.1'));

  // Scenario D: Asthma Exacerbation (24yo, known asthma history, acute severe cough, wheezing)
  const caseD = respiratoryClinicalSpecService.classifyLikelihoodAndUrgency({
    age: 24,
    smoking: false,
    asthma: true,
    oxygenLevel: 94,
    cough: 'severe',
    dyspnea: 'exertional'
  });
  assert.strictEqual(caseD.primaryConditionLikelihood.labelId, 'LABEL_ASTHMA_EXACERBATION');
  assert.ok(caseD.icd10Codes.includes('J45.901'));

  // Scenario E: Normal Baseline / Mild URI (SpO2 98%, mild cough, no dyspnea)
  const caseE = respiratoryClinicalSpecService.classifyLikelihoodAndUrgency({
    oxygenLevel: 98,
    cough: 'mild',
    dyspnea: 'none'
  });
  assert.strictEqual(caseE.urgencyTier.tierId, 'ROUTINE_OUTPATIENT_CARE');
  assert.strictEqual(caseE.primaryConditionLikelihood.labelId, 'LABEL_MILD_URI_OR_NORMAL');
  assert.strictEqual(caseE.requiresEmergencyDispatch, false);

  console.log('  ✓ Scenario A: Severe Hypoxemia correctly routed to URGENT_EMERGENCY (123 Dispatch).');
  console.log('  ✓ Scenario B: Fever + Tachypnea correctly classified as Acute Respiratory Infection.');
  console.log('  ✓ Scenario C: Smoker + Age 58 correctly classified as COPD Exacerbation.');
  console.log('  ✓ Scenario D: Asthma comorbidity correctly classified as Asthma Exacerbation.');
  console.log('  ✓ Scenario E: Mild symptoms correctly routed to Routine Outpatient Care.\n');

  // ── TEST 5: Clinical Reviewer Endorsement & PRD Page 22 Settlement ─────────
  console.log('▶ TEST 5: Clinical Reviewer Endorsement & PRD Page 22 Traceability');
  const summary = clinicalReviewerService.getRespiratoryClinicalSpec();

  assert.strictEqual(summary.isSettled, true, 'Specification must be flagged as settled');
  assert.strictEqual(summary.specVersion, '1.0.0');
  assert.strictEqual(summary.certificationSeal.reviewer.syndicateId, 'EG-MED-44821');
  assert.strictEqual(summary.certificationSeal.reviewer.status, 'active_verified');
  assert.ok(summary.certificationSeal.specHashSha256 && summary.certificationSeal.specHashSha256.length === 64);

  console.log(`  ✓ Clinical Reviewer: ${summary.certificationSeal.reviewer.nameEn} (${summary.certificationSeal.reviewer.syndicateId})`);
  console.log(`  ✓ Cryptographic Spec Hash: ${summary.certificationSeal.specHashSha256}`);
  console.log('  ✓ PRD Page 22 Requirement: Settled and Locked for Model Training.\n');

  // ── TEST 6: Governance Markdown Document Verification ───────────────────────
  console.log('▶ TEST 6: Governance Document Verification (RESPIRATORY_CLINICAL_QUESTION_AND_LABELS.md)');
  const docPath = path.resolve(__dirname, '../RESPIRATORY_CLINICAL_QUESTION_AND_LABELS.md');
  assert.ok(fs.existsSync(docPath), 'Governance markdown document must exist in repository root');

  const docContent = fs.readFileSync(docPath, 'utf8');
  assert.ok(docContent.includes('PRD Page 22, Section 19'), 'Must cite PRD Page 22');
  assert.ok(docContent.includes('Dr. Tarek Mahmoud, MD'), 'Must name endorsing consultant');
  assert.ok(docContent.includes('EG-MED-44821'), 'Must include syndicate ID');
  assert.ok(docContent.includes('Acute Respiratory Infection'), 'Must document ARI criteria');
  assert.ok(docContent.includes('Bronchial Asthma Exacerbation'), 'Must document Asthma criteria');
  assert.ok(docContent.includes('Chronic Obstructive Pulmonary Disease (COPD) Exacerbation'), 'Must document COPD criteria');

  console.log('  ✓ Governance specification markdown document verified in repository root.\n');

  // ── TEST 7: Express Server Endpoint (GET /api/respiratory/clinical-spec) ──
  console.log('▶ TEST 7: Express Server API Route Verification');
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  assert.ok(
    serverJsContent.includes("app.get('/api/respiratory/clinical-spec'"),
    'server.js must expose GET /api/respiratory/clinical-spec'
  );

  console.log('  ✓ Route GET /api/respiratory/clinical-spec registered in backend/server.js.\n');

  console.log('==================================================================');
  console.log('🎉 ALL RESPIRATORY CLINICAL SPECIFICATION TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
