/**
 * HealthVibe AI - Model Evaluation & Clinical Benchmark Runner
 * Validates active production model against clinical performance thresholds
 * and verifies output reproducibility & determinism across repeated runs (Req #77).
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { RespiratoryRFClassifier, RANDOM_SEED } = require('./respiratory_rf_classifier');
const { reproducibilityService, REQUIREMENTS_PATHS } = require('./reproducibility_service');
const registry = require('./model_registry.json');

console.log('================================================================================');
console.log('🔬 HEALTHVIBE AI: CLINICAL ML MODEL EVALUATION & REPRODUCIBILITY HARNESS');
console.log(`   Evaluating Active Model: [${registry.active_production_version}] | Seed: [${RANDOM_SEED}]`);
console.log('================================================================================');

const classifier = new RespiratoryRFClassifier();

// Test Cohort: Critical Clinical Scenarios
const testCohort = [
  {
    name: 'Normal Healthy Baseline',
    input: { age: 28, oxygen_saturation: 99, respiratory_rate: 14, dyspnea_severity: 0, has_cough: false },
    expectedCategory: 'LOW_RISK',
    expectedMaxScore: 30
  },
  {
    name: 'Mild Bronchitis / Viral URI',
    input: { age: 34, oxygen_saturation: 97, respiratory_rate: 18, dyspnea_severity: 1, has_cough: true, cough_duration_days: 5 },
    expectedCategory: 'LOW_RISK',
    expectedMaxScore: 35
  },
  {
    name: 'Moderate Asthma Exacerbation',
    input: { age: 42, oxygen_saturation: 94, respiratory_rate: 22, dyspnea_severity: 2, has_asthma: true, cough_duration_days: 3 },
    expectedCategory: 'MODERATE_RISK',
    minScore: 35,
    maxScore: 69
  },
  {
    name: 'Severe COPD Decompensation',
    input: { age: 68, oxygen_saturation: 91, respiratory_rate: 27, dyspnea_severity: 3, has_copd: true, smoking_pack_years: 40 },
    expectedCategory: 'HIGH_RISK',
    minScore: 70
  },
  {
    name: 'Critical Hypoxemic Emergency (SpO2 < 90%)',
    input: { age: 72, oxygen_saturation: 84, respiratory_rate: 34, dyspnea_severity: 3 },
    expectedCategory: 'EMERGENCY',
    minScore: 90,
    expectOverride: true
  },
  {
    name: 'Hemoptysis with Chest Pain Emergency',
    input: { age: 55, oxygen_saturation: 95, respiratory_rate: 24, hemoptysis: true, chest_pain: true, dyspnea_severity: 2 },
    expectedCategory: 'EMERGENCY',
    expectOverride: true
  }
];

let passed = 0;

console.log('\n--- Phase 1: Clinical Triage Threshold Verification ---');
for (const test of testCohort) {
  const result = classifier.predict(test.input);

  console.log(`\n▶ Scenario: ${test.name}`);
  console.log(`  - Predicted Category: ${result.triage_category} (Urgency: ${result.urgency_code})`);
  console.log(`  - Risk Score: ${result.risk_score} | Confidence: ${(result.confidence * 100).toFixed(1)}%`);

  assert.strictEqual(
    result.triage_category,
    test.expectedCategory,
    `Scenario '${test.name}' category mismatch: expected ${test.expectedCategory}, got ${result.triage_category}`
  );

  if (test.minScore !== undefined) {
    assert.ok(result.risk_score >= test.minScore, `Score must be >= ${test.minScore}`);
  }
  if (test.expectedMaxScore !== undefined) {
    assert.ok(result.risk_score <= test.expectedMaxScore, `Score must be <= ${test.expectedMaxScore}`);
  }
  if (test.expectOverride) {
    assert.strictEqual(result.override_applied, true, 'Safety override must be triggered.');
  }

  console.log(`  ✅ PASS`);
  passed++;
}

console.log('\n--- Phase 2: Reproducibility & Output Determinism (50 Iterations/Scenario) ---');
for (const test of testCohort) {
  const detResult = reproducibilityService.verifyOutputDeterminism(test.input, 50);
  assert.strictEqual(detResult.success, true, `Determinism check failed for scenario: ${test.name}`);
  assert.strictEqual(detResult.statistics.scoreStdDev, 0, `Risk score standard deviation must be 0.000 for: ${test.name}`);
  assert.strictEqual(detResult.statistics.confStdDev, 0, `Confidence standard deviation must be 0.000 for: ${test.name}`);
  console.log(`  ✅ Scenario '${test.name}': 50/50 runs identical (StdDev = 0.000 | Fingerprint: ${detResult.fingerprint.slice(0, 12)}...)`);
}

console.log('\n--- Phase 3: Requirements.txt Version Pinning Verification ---');
for (const reqPath of REQUIREMENTS_PATHS) {
  const valResult = reproducibilityService.validateRequirementsFile(reqPath);
  assert.strictEqual(valResult.valid, true, `Requirements file ${reqPath} failed validation: ${JSON.stringify(valResult.violations)}`);
  console.log(`  ✅ ${path.basename(path.dirname(reqPath))}/${path.basename(reqPath)}: ${valResult.packageCount} packages strictly pinned with '=='`);
}

console.log('\n================================================================================');
console.log(`🎯 EVALUATION COMPLETE: All ${passed} Scenarios & Reproducibility Guarantees Verified.`);
console.log('================================================================================\n');
