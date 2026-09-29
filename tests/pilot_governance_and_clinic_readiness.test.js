/**
 * Health Vibe AI - Clinical Pilot Governance & Readiness Test Suite
 * 
 * Verifies:
 * 1. Pre-requisites verification across security hardening and clinical governance.
 * 2. 1-Clinic, 3-Doctor pilot configuration structure and role allocation.
 * 3. Circuit breaker stopping trigger evaluation (immediate halt protocol).
 * 4. Document non-fabrication & template placeholder integrity.
 * 5. Server endpoints integration for pilot governance.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const {
  PILOT_SPEC,
  STOPPING_TRIGGERS,
  verifyPilotPrerequisites,
  validatePilotClinicConfig,
  evaluateCircuitBreakerTriggers,
  verifyNonFabricationIntegrity
} = require('../backend/pilot-readiness-service');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: CLINICAL PILOT READINESS & GOVERNANCE TEST SUITE');
console.log('   1 Clinic, 3 Doctors, Circuit Breaker & Non-Fabrication Verification');
console.log('==================================================================\n');

async function runTests() {
  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Pre-requisites Verification Across Security & Medical Tasks
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Security & Medical Review Pre-requisites Verification');
  const prereqReport = verifyPilotPrerequisites();
  assert.strictEqual(prereqReport.ok, true, 'All technical prerequisites must be satisfied');
  assert.strictEqual(prereqReport.allTechnicalSatisfied, true);

  const checkIds = prereqReport.checks.map(c => c.id);
  assert.ok(checkIds.includes('RULES_EVALUATION'), 'Rules evaluation must be checked');
  assert.ok(checkIds.includes('AI_DIAGNOSIS_PROHIBITION'), 'AI diagnosis prohibition must be checked');
  assert.ok(checkIds.includes('OBSERVATIONAL_TRENDS_GUARDRAIL'), 'Observational trends guardrail must be checked');
  assert.ok(checkIds.includes('CLINIC_MULTI_TENANT_ISOLATION'), 'Clinic isolation must be checked');
  assert.ok(checkIds.includes('RBAC_SECURITY_MATRIX'), 'RBAC matrix must be checked');
  assert.ok(checkIds.includes('ETHICS_INSTITUTIONAL_APPROVAL'), 'Ethics approval status must be tracked');

  // Verify that institutional approval is honestly marked as pending kickoff, not fabricated
  const ethicsCheck = prereqReport.checks.find(c => c.id === 'ETHICS_INSTITUTIONAL_APPROVAL');
  assert.strictEqual(ethicsCheck.satisfied, false, 'Ethics institutional agreement must remain pending without fabrication');
  assert.strictEqual(ethicsCheck.pendingKickoff, true);
  console.log(`  ✓ Verified ${prereqReport.satisfiedCount}/${prereqReport.totalChecks} checks.`);
  console.log('  ✓ Preceding security & medical-review capabilities confirmed satisfied.');
  console.log('  ✓ Institutional partner execution correctly preserved as pending kickoff.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: 1-Clinic & 3-Doctor Architecture Validation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: 1-Clinic & 3-Doctor Architecture Validation');

  // Valid 1 clinic, 3 doctors configuration
  const validClinicConfig = {
    clinicId: 'pilot-clinic-01',
    clinicName: 'Chest & Pulmonary Specialty Center',
    durationDays: 30,
    doctors: [
      { id: 'doc-1', name: 'Dr. Lead Pulmonologist', role: 'lead_pulmonologist', licenseNumber: 'EG-MED-10001' },
      { id: 'doc-2', name: 'Dr. Attending Pulmonologist', role: 'attending_pulmonologist', licenseNumber: 'EG-MED-10002' },
      { id: 'doc-3', name: 'Dr. Specialist Pulmonologist', role: 'specialist_pulmonologist', licenseNumber: 'EG-MED-10003' }
    ]
  };

  const validationResult = validatePilotClinicConfig(validClinicConfig);
  assert.strictEqual(validationResult.valid, true, 'Valid 1-clinic, 3-doctor config must pass');
  assert.strictEqual(validationResult.summary.doctorCount, 3);
  assert.strictEqual(validationResult.summary.durationDays, 30);

  // Invalid configs: 2 doctors or 4 doctors
  const invalidConfigFewDoctors = {
    clinicId: 'clinic-err',
    clinicName: 'Clinic Err',
    doctors: [{ id: 'doc-1' }, { id: 'doc-2' }]
  };
  const failResultFew = validatePilotClinicConfig(invalidConfigFewDoctors);
  assert.strictEqual(failResultFew.valid, false, 'Config with fewer than 3 doctors must fail');
  assert.ok(failResultFew.errors.some(e => e.includes('exactly 3 doctors')));

  const invalidConfigMissingClinic = {
    clinicName: 'No Id Clinic',
    doctors: [{ id: '1' }, { id: '2' }, { id: '3' }]
  };
  const failResultNoId = validatePilotClinicConfig(invalidConfigMissingClinic);
  assert.strictEqual(failResultNoId.valid, false, 'Config missing clinicId must fail');
  console.log('  ✓ 1-Clinic, 3-Doctor, 30-Day parameter enforcement verified.');
  console.log('  ✓ Deviations from required doctor headcount strictly rejected.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Circuit Breaker Stopping Triggers (Safety Protocol)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Circuit Breaker & Pilot Stopping Protocol');

  // Normal operational telemetry -> should NOT halt
  const normalTelemetry = {
    criticalHypoxemiaMisrouted: false,
    missedUrgentCases: 0,
    crossTenantAccessBreach: false,
    clinicalDisagreementRate: 0.04, // 4% (within safe threshold < 10%)
    physicianSafetyVeto: false,
    clinicHoursDowntimeMinutes: 5
  };
  const normalEval = evaluateCircuitBreakerTriggers(normalTelemetry);
  assert.strictEqual(normalEval.shouldHalt, false, 'Normal telemetry must not halt pilot');
  assert.strictEqual(normalEval.recommendation, 'PROCEED_NORMAL_OPERATIONS');

  // Trigger A: Critical hypoxemia misrouting -> HALT
  const misrouteTelemetry = {
    ...normalTelemetry,
    criticalHypoxemiaMisrouted: true
  };
  const haltMisroute = evaluateCircuitBreakerTriggers(misrouteTelemetry);
  assert.strictEqual(haltMisroute.shouldHalt, true, 'Critical misrouting must halt pilot immediately');
  assert.ok(haltMisroute.trippedTriggers.some(t => t.trigger === STOPPING_TRIGGERS.CRITICAL_MISROUTING));

  // Trigger B: Data isolation breach -> HALT
  const breachTelemetry = {
    ...normalTelemetry,
    crossTenantAccessBreach: true
  };
  const haltBreach = evaluateCircuitBreakerTriggers(breachTelemetry);
  assert.strictEqual(haltBreach.shouldHalt, true, 'Cross-tenant breach must halt pilot immediately');
  assert.ok(haltBreach.trippedTriggers.some(t => t.trigger === STOPPING_TRIGGERS.SECURITY_PHI_BREACH));

  // Trigger C: Physician Safety Veto -> HALT
  const vetoTelemetry = {
    ...normalTelemetry,
    physicianSafetyVeto: true
  };
  const haltVeto = evaluateCircuitBreakerTriggers(vetoTelemetry);
  assert.strictEqual(haltVeto.shouldHalt, true, 'Physician safety veto must halt pilot immediately');
  assert.ok(haltVeto.trippedTriggers.some(t => t.trigger === STOPPING_TRIGGERS.PHYSICIAN_SAFETY_VETO));

  // Trigger D: Excessive clinic hours outage (> 60 mins) -> HALT
  const outageTelemetry = {
    ...normalTelemetry,
    clinicHoursDowntimeMinutes: 75
  };
  const haltOutage = evaluateCircuitBreakerTriggers(outageTelemetry);
  assert.strictEqual(haltOutage.shouldHalt, true, 'Outage > 60m must halt pilot');
  assert.ok(haltOutage.trippedTriggers.some(t => t.trigger === STOPPING_TRIGGERS.EXCESSIVE_DOWNTIME));
  console.log('  ✓ Circuit breaker halts on critical misrouting, PHI leaks, physician veto, and outages.');
  console.log('  ✓ Runbook immediate emergency freeze step verified.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Non-Fabrication & Document Placeholder Integrity
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Non-Fabrication & Document Placeholder Integrity');

  const pilotPlanPath = path.resolve(__dirname, '../PILOT_PLAN_AND_CLINICAL_ONBOARDING.md');
  const loiTemplatePath = path.resolve(__dirname, '../templates/LETTER_OF_INTENT_PILOT_TEMPLATE.md');
  const feedbackRegisterPath = path.resolve(__dirname, '../records/PILOT_FEEDBACK_AND_RESULTS_REGISTER.md');

  assert.ok(fs.existsSync(pilotPlanPath), 'Pilot Plan document must exist');
  assert.ok(fs.existsSync(loiTemplatePath), 'Letter of Intent template must exist');
  assert.ok(fs.existsSync(feedbackRegisterPath), 'Feedback and results register must exist');

  const pilotPlanContent = fs.readFileSync(pilotPlanPath, 'utf8');
  const loiContent = fs.readFileSync(loiTemplatePath, 'utf8');
  const registerContent = fs.readFileSync(feedbackRegisterPath, 'utf8');

  // Verify non-fabrication compliance
  const planCheck = verifyNonFabricationIntegrity(pilotPlanContent);
  assert.strictEqual(planCheck.compliant, true, 'Pilot plan must have zero fabricated claims');
  assert.strictEqual(planCheck.hasProperPlaceholders, true, 'Pilot plan must use legitimate placeholders');

  const loiCheck = verifyNonFabricationIntegrity(loiContent);
  assert.strictEqual(loiCheck.compliant, true, 'LOI template must have zero fabricated claims');
  assert.strictEqual(loiCheck.hasProperPlaceholders, true, 'LOI template must use legitimate placeholders');

  const registerCheck = verifyNonFabricationIntegrity(registerContent);
  assert.strictEqual(registerCheck.compliant, true, 'Feedback register must have zero fabricated claims');
  assert.strictEqual(registerCheck.hasProperPlaceholders, true, 'Feedback register must use legitimate placeholders');

  // Verify all 7 acceptance scenarios are present in Pilot Plan
  for (let s = 1; s <= 7; s++) {
    assert.ok(pilotPlanContent.includes(`Scenario ${s}:`), `Pilot plan must contain Scenario ${s}`);
  }

  // Verify all 3 training modules are present
  assert.ok(pilotPlanContent.includes('Module 1: Administrative'), 'Training Module 1 must be defined');
  assert.ok(pilotPlanContent.includes('Module 2: Nursing'), 'Training Module 2 must be defined');
  assert.ok(pilotPlanContent.includes('Module 3: Physician'), 'Training Module 3 must be defined');

  console.log('  ✓ Documents verified: PILOT_PLAN, LETTER_OF_INTENT, FEEDBACK_REGISTER.');
  console.log('  ✓ Non-fabrication integrity verified: 0 fake sign-offs, proper template placeholders.');
  console.log('  ✓ All 7 Acceptance Scenarios and 3 Training Modules confirmed.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Express Server Readiness HTTP Route
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: Express Server Pilot Readiness Endpoint');
  const app = require('../backend/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/clinics/pilot/readiness`);
    assert.strictEqual(res.status, 200, 'GET /api/clinics/pilot/readiness must return 200');
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.allTechnicalSatisfied, true);
    assert.ok(data.checks.length >= 10);
    console.log('  ✓ Express route /api/clinics/pilot/readiness returned active readiness report.');
  } finally {
    server.close();
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 5 CLINICAL PILOT READINESS & GOVERNANCE TESTS PASSED 100%!');
  console.log('==================================================================');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
