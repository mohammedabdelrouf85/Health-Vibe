/**
 * HEALTH VIBE AI: SYNTHETIC PATIENTS & CONSENT GOVERNANCE TEST SUITE
 * 
 * Verifies compliance with User Request 35:
 * "تجهيز حزمة بيانات مرضى افتراضية (Synthetic / De-identified Patients) لاستخدامها في
 *  العروض التقديمية والتجارب، ومنع استخدام أي بيانات مرضى حقيقية بدون موافقة موثقة."
 * 
 * Adheres to:
 * - PRD Page 18 (Section 15, Critical Risk Mitigation): "بيانات حقيقية وحساسة: عدم استخدام بيانات مرضى حقيقية في Demo بدون Consent وحماية مناسبة؛ استخدام de-identified / test data قدر الإمكان."
 * - PRD Page 10 (Section 10, Security & Privacy): Mandatory documented consent before real patient data processing.
 * - HIPAA Safe Harbor & Egyptian Data Protection Law.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('👥 HEALTH VIBE AI: SYNTHETIC PATIENTS & CONSENT GUARD TEST SUITE');
console.log('   PRD Page 18: Zero Real PHI in Demos & Mandatory Consent Guard');
console.log('==================================================================\n');

(async function runTests() {
  const {
    syntheticPatientsService,
    SYNTHETIC_PATIENTS_COHORT
  } = require('../backend/synthetic-patients-service');

  const { validateDeidentifiedRecord } = require('../dataset/deidentification');

  // ── TEST 1: Synthetic Patients Bundle File & Cohort Structure ─────────────
  console.log('▶ TEST 1: Synthetic Patients Bundle File & Cohort Size');
  const bundlePath = path.resolve(__dirname, '../dataset/synthetic_patients_bundle.json');
  assert.ok(fs.existsSync(bundlePath), 'dataset/synthetic_patients_bundle.json must exist');

  const rawJson = fs.readFileSync(bundlePath, 'utf8');
  const loadedCohort = JSON.parse(rawJson);

  assert.strictEqual(loadedCohort.length, 20, 'Synthetic cohort must contain exactly 20 personas');
  assert.strictEqual(SYNTHETIC_PATIENTS_COHORT.length, 20);

  console.log(`  ✓ Bundle JSON verified: ${loadedCohort.length} synthetic patient personas loaded.`);
  console.log(`  ✓ File path: dataset/synthetic_patients_bundle.json (${Math.round(rawJson.length / 1024)} KB)\n`);

  // ── TEST 2: Zero Real PHI & De-identification Verification ────────────────
  console.log('▶ TEST 2: Zero Real PHI & HIPAA De-identification Compliance');

  for (const patient of SYNTHETIC_PATIENTS_COHORT) {
    // Top-level privacy flags
    assert.strictEqual(patient.isSynthetic, true, `Patient ${patient.patientId} must be flagged isSynthetic`);
    assert.strictEqual(patient.isDeidentified, true, `Patient ${patient.patientId} must be flagged isDeidentified`);
    assert.strictEqual(patient.demoSafe, true, `Patient ${patient.patientId} must be flagged demoSafe`);
    assert.strictEqual(patient.containsRealPhi, false, `Patient ${patient.patientId} must have containsRealPhi: false`);

    // Prohibited direct identifiers must NOT exist
    assert.strictEqual(patient.email, undefined);
    assert.strictEqual(patient.phone, undefined);
    assert.strictEqual(patient.nationalId, undefined);
    assert.strictEqual(patient.dob, undefined);

    // Deep HIPAA Safe Harbor check
    const check = validateDeidentifiedRecord({
      subjectId: patient.patientId,
      age: patient.demographics.age,
      sex: patient.demographics.gender,
      vitals: patient.vitals,
      symptoms: patient.symptoms
    });
    assert.strictEqual(check.isDeidentified, true, `Patient ${patient.patientId} must pass de-identification scan`);
  }

  console.log('  ✓ Verified 20/20 synthetic patients satisfy HIPAA Safe Harbor rules.');
  console.log('  ✓ Zero direct identifiers (no real names, phones, NIDs, or DOBs).\n');

  // ── TEST 3: Clinical Diversity & Condition Representation ──────────────────
  console.log('▶ TEST 3: Clinical Diversity (ARI, Asthma, COPD, Mild URI & Urgency)');

  const conditionLabels = new Set(SYNTHETIC_PATIENTS_COHORT.map(p => p.triage.assignedConditionLabel));
  assert.ok(conditionLabels.has('LABEL_COPD_EXACERBATION'), 'Must represent COPD exacerbations');
  assert.ok(conditionLabels.has('LABEL_ASTHMA_EXACERBATION'), 'Must represent Asthma exacerbations');
  assert.ok(conditionLabels.has('LABEL_ACUTE_RESPIRATORY_INFECTION'), 'Must represent Acute Respiratory Infections');
  assert.ok(conditionLabels.has('LABEL_MILD_URI_OR_NORMAL'), 'Must represent Normal/Mild URI baseline');

  const categories = new Set(SYNTHETIC_PATIENTS_COHORT.map(p => p.triage.category));
  assert.ok(categories.has('urgent'), 'Must include urgent/emergency cases');
  assert.ok(categories.has('high'), 'Must include high priority cases');
  assert.ok(categories.has('normal'), 'Must include normal routine cases');

  // Verify demographic diversity
  const ages = SYNTHETIC_PATIENTS_COHORT.map(p => p.demographics.age);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  assert.ok(minAge <= 20, 'Should include adolescent/young adult cases');
  assert.ok(maxAge >= 70, 'Should include geriatric cases');

  console.log(`  ✓ Condition Labels: ${Array.from(conditionLabels).join(', ')}`);
  console.log(`  ✓ Urgency Tiers: ${Array.from(categories).join(', ')}`);
  console.log(`  ✓ Age Range: ${minAge} to ${maxAge} years across male & female personas.\n`);

  // ── TEST 4: Deep PHI Scanner & Anti-Leakage Detection ──────────────────────
  console.log('▶ TEST 4: Deep PHI Scanner & Synthetic Anti-Leakage Validation');

  // Scan all 20 synthetic patients
  for (const patient of SYNTHETIC_PATIENTS_COHORT) {
    const scan = syntheticPatientsService.scanForUnconsentedRealPhi(patient);
    assert.strictEqual(scan.clean, true, `Synthetic patient ${patient.patientId} must be 100% clean of real PHI`);
    assert.strictEqual(scan.leaksDetected.length, 0);
  }

  // Test detection of real 14-digit Egyptian NID
  const contaminatedRecordWithNid = {
    patientId: 'HV-TEST-LEAK-01',
    note: 'المريض يحمل رقم قومي 29501011234567 وتم تسجيله'
  };
  const nidScan = syntheticPatientsService.scanForUnconsentedRealPhi(contaminatedRecordWithNid);
  assert.strictEqual(nidScan.clean, false);
  assert.ok(nidScan.leaksDetected.includes('EGYPTIAN_14_DIGIT_NATIONAL_ID'), 'Must detect 14-digit Egyptian NID');

  // Test detection of real Egyptian mobile number
  const contaminatedRecordWithPhone = {
    patientId: 'HV-TEST-LEAK-02',
    contact: '01012345678'
  };
  const phoneScan = syntheticPatientsService.scanForUnconsentedRealPhi(contaminatedRecordWithPhone);
  assert.strictEqual(phoneScan.clean, false);
  assert.ok(phoneScan.leaksDetected.includes('REAL_EGYPTIAN_MOBILE_NUMBER'), 'Must detect unmasked mobile phone');

  console.log('  ✓ Deep PHI scanner confirmed 0 leaks across entire synthetic cohort.');
  console.log('  ✓ Scanner successfully catches Egyptian 14-digit NIDs and raw mobile numbers.\n');

  // ── TEST 5: Real Patient Consent Enforcement Guard (PRD Page 18) ───────────
  console.log('▶ TEST 5: Real Patient Consent Enforcement Guard');

  // 1. Synthetic record passes immediately
  const syntheticCheck = syntheticPatientsService.validateConsentRequirement(SYNTHETIC_PATIENTS_COHORT[0]);
  assert.strictEqual(syntheticCheck.permitted, true);
  assert.strictEqual(syntheticCheck.isSynthetic, true);

  // 2. Real patient WITHOUT consent is strictly blocked
  const unconsentedRealPatient = {
    patientId: 'REAL-PATIENT-999',
    isSynthetic: false,
    vitals: { spo2: 95 }
  };
  const unconsentedCheck = syntheticPatientsService.validateConsentRequirement(unconsentedRealPatient);
  assert.strictEqual(unconsentedCheck.permitted, false);
  assert.strictEqual(unconsentedCheck.error, 'REAL_PATIENT_DATA_WITHOUT_CONSENT_PROHIBITED');

  // 3. Real patient with incomplete consent is rejected
  const incompleteConsentPatient = {
    patientId: 'REAL-PATIENT-888',
    isSynthetic: false,
    consent: {
      signed: false // Not signed!
    }
  };
  const incompleteCheck = syntheticPatientsService.validateConsentRequirement(incompleteConsentPatient);
  assert.strictEqual(incompleteCheck.permitted, false);
  assert.strictEqual(incompleteCheck.error, 'INCOMPLETE_CONSENT_RECORD');

  // 4. Real patient WITH valid documented consent is permitted
  const validConsentedPatient = {
    patientId: 'REAL-PATIENT-777',
    isSynthetic: false,
    consent: {
      signed: true,
      signedAt: '2026-10-01T10:00:00.000Z',
      scope: ['clinical_care', 'pilot_research'],
      patientSignature: 'DIGITALLY_SIGNED_SHA256_HASH'
    }
  };
  const validCheck = syntheticPatientsService.validateConsentRequirement(validConsentedPatient);
  assert.strictEqual(validCheck.permitted, true);
  assert.strictEqual(validCheck.isSynthetic, false);
  assert.strictEqual(validCheck.consentDetails.signed, true);

  console.log('  ✓ Synthetic patients permitted for demos without real consent.');
  console.log('  ✓ Unconsented real patient data strictly blocked with REAL_PATIENT_DATA_WITHOUT_CONSENT_PROHIBITED.');
  console.log('  ✓ Real patients permitted ONLY with documented, verifiable consent.\n');

  // ── TEST 6: Demo Environment Isolation Guard ──────────────────────────────
  console.log('▶ TEST 6: Demo Environment Isolation Guard');

  // Pure synthetic cohort passes isolation
  const isolationCheck = syntheticPatientsService.enforceDemoEnvironmentIsolation(SYNTHETIC_PATIENTS_COHORT);
  assert.strictEqual(isolationCheck.compliant, true);
  assert.strictEqual(isolationCheck.demoSafe, true);

  // Ingestion of real record into demo feed throws security violation
  assert.throws(() => {
    syntheticPatientsService.enforceDemoEnvironmentIsolation([
      SYNTHETIC_PATIENTS_COHORT[0],
      unconsentedRealPatient // Intruder real record!
    ]);
  }, (err) => err.message.includes('DEMO_SECURITY_VIOLATION'), 'Must throw DEMO_SECURITY_VIOLATION on non-synthetic data');

  console.log('  ✓ Demo environment isolation verified: strictly bars any non-synthetic records.\n');

  // ── TEST 7: Express Server Endpoint Integration ───────────────────────────
  console.log('▶ TEST 7: Express Server API Routes Verification');
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  assert.ok(
    serverJsContent.includes("app.get('/api/demo/synthetic-patients'"),
    'server.js must expose GET /api/demo/synthetic-patients'
  );
  assert.ok(
    serverJsContent.includes("app.post('/api/patients/validate-consent'"),
    'server.js must expose POST /api/patients/validate-consent'
  );

  console.log('  ✓ Routes GET /api/demo/synthetic-patients & POST /api/patients/validate-consent registered.\n');

  console.log('==================================================================');
  console.log('🎉 ALL SYNTHETIC PATIENTS & CONSENT GUARD TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
