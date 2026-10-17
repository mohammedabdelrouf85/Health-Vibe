/**
 * HealthVibe AI - Model Output Reproducibility & Determinism Test Suite
 *
 * Verifies Task #77 (PRD Req #77):
 * "اختبار ثبات مخرجات النموذج (Reproducibility) | تثبيت Random Seed وإصدارات المكتبات
 * في requirements.txt لضمان أن نفس مدخلات المريض تعطي دائماً نفس النتيجة ونسبة الثقة على بيانات الاختبار."
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const {
  ModelReproducibilityService,
  reproducibilityService,
  REQUIREMENTS_PATHS,
  RANDOM_SEED
} = require('../ml_models/reproducibility_service');
const {
  reproducibilityService: backendReproducibilityService
} = require('../backend/model-reproducibility-service');
const { RespiratoryRFClassifier, MODEL_VERSION } = require('../ml_models/respiratory_rf_classifier');
const { extractFeatures, normalizeArabicDigits } = require('../ml_models/feature_extractor');

console.log('================================================================================');
console.log('🔬 HEALTHVIBE AI: MODEL REPRODUCIBILITY & DETERMINISM TEST SUITE');
console.log('   PRD Req #77: Seed Pinning, Library Locks & Zero-Variance Clinical Outputs');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`▶ TEST ${totalTests}: ${name} ... `);
  try {
    fn();
    console.log('✅ PASS');
    passedTests++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error(err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 1. Requirements.txt Pinning & Absence of Floating Versions
// -----------------------------------------------------------------------------
runTest("requirements.txt exists at repository root and in ml_models/", () => {
  for (const reqPath of REQUIREMENTS_PATHS) {
    assert.ok(fs.existsSync(reqPath), `Missing requirements file at: ${reqPath}`);
    const stat = fs.statSync(reqPath);
    assert.ok(stat.size > 100, `Requirements file ${reqPath} is suspiciously small: ${stat.size} bytes`);
  }
});

runTest("Strict '==' pinning and zero unpinned or floating versions in requirements.txt", () => {
  for (const reqPath of REQUIREMENTS_PATHS) {
    const valResult = reproducibilityService.validateRequirementsFile(reqPath);
    assert.strictEqual(
      valResult.valid,
      true,
      `Validation failed for ${reqPath}: ${JSON.stringify(valResult.violations)}`
    );
    assert.strictEqual(valResult.violations.length, 0, `Found floating operators in ${reqPath}`);
    assert.strictEqual(valResult.missing.length, 0, `Missing essential libraries in ${reqPath}: ${valResult.missing.join(', ')}`);

    // Verify critical package versions
    assert.strictEqual(valResult.packages['numpy'], '1.26.4');
    assert.strictEqual(valResult.packages['scipy'], '1.13.1');
    assert.strictEqual(valResult.packages['scikit-learn'], '1.4.2');
    assert.strictEqual(valResult.packages['pandas'], '2.2.2');
    assert.strictEqual(valResult.packages['joblib'], '1.4.0');
    assert.strictEqual(valResult.packages['threadpoolctl'], '3.5.0');
    assert.strictEqual(valResult.packages['pytest'], '8.1.1');
  }
});

// -----------------------------------------------------------------------------
// 2. Random Seed Synchronization Parity across Registry, Pipeline & Runtime
// -----------------------------------------------------------------------------
runTest("RANDOM_SEED = 42 constant is strictly synchronized across all ML components", () => {
  const sync = reproducibilityService.verifySeedSynchronization();
  assert.strictEqual(sync.isSynchronized, true, `Seed synchronization failure: ${JSON.stringify(sync)}`);
  assert.strictEqual(sync.expectedSeed, 42);
  assert.strictEqual(sync.registrySeed, 42);
  assert.strictEqual(sync.pipelineSeedMatches, true);
  assert.strictEqual(sync.serviceSeed, 42);
});

runTest("model_registry.json documents reproducibility metadata and active production model", () => {
  const registryPath = path.join(ROOT_DIR, 'ml_models', 'model_registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  assert.strictEqual(registry.active_production_version, 'resp_rf_v1.0.2');
  assert.strictEqual(registry.reproducibility.random_seed, 42);
  assert.strictEqual(registry.reproducibility.lock_file, 'requirements.txt');
  assert.ok(registry.reproducibility.pinned_libraries['scikit-learn'] === '1.4.2');

  const activeModel = registry.models[registry.active_production_version];
  assert.ok(activeModel, "Active model metadata must be defined");
  assert.strictEqual(activeModel.hyperparameters.random_state, 42);
  assert.strictEqual(activeModel.reproducibility.random_seed, 42);
  assert.strictEqual(activeModel.reproducibility.is_deterministic, true);
});

runTest("ml_models/training_pipeline.py specifies RANDOM_SEED = 42 and deterministic environment controls", () => {
  const pipelinePath = path.join(ROOT_DIR, 'ml_models', 'training_pipeline.py');
  const content = fs.readFileSync(pipelinePath, 'utf8');

  assert.ok(content.includes('RANDOM_SEED = 42'), "Must define RANDOM_SEED = 42");
  assert.ok(content.includes('enforce_deterministic_environment'), "Must define deterministic environment enforcer");
  assert.ok(content.includes('PYTHONHASHSEED'), "Must pin PYTHONHASHSEED");
  assert.ok(content.includes('threadpool_limits'), "Must limit threadpool to prevent non-deterministic float summation");
});

// -----------------------------------------------------------------------------
// 3. Repeated Inference Determinism (Zero Output Drift)
// -----------------------------------------------------------------------------
runTest("Evaluates 10 distinct clinical profiles with 100 runs each, asserting Standard Deviation = 0.000", () => {
  const testProfiles = [
    {
      name: "Young Healthy Adult",
      input: { age: 22, oxygen_saturation: 99, respiratory_rate: 14, dyspnea_severity: 0 }
    },
    {
      name: "Geriatric Borderline Hypoxemia",
      input: { age: 78, oxygen_saturation: 93, respiratory_rate: 22, dyspnea_severity: 2, has_cough: true }
    },
    {
      name: "Smoker with Chronic Cough",
      input: { age: 54, oxygen_saturation: 96, respiratory_rate: 18, smoking_pack_years: 30, cough_duration_days: 45 }
    },
    {
      name: "Asthma Flare-up with Wheezing",
      input: { age: 31, oxygen_saturation: 92, respiratory_rate: 25, dyspnea_severity: 2, has_asthma: true }
    },
    {
      name: "COPD Exacerbation with High RR",
      input: { age: 67, oxygen_saturation: 90, respiratory_rate: 28, dyspnea_severity: 3, has_copd: true }
    },
    {
      name: "Critical Tachypnea Emergency",
      input: { age: 45, oxygen_saturation: 94, respiratory_rate: 34, dyspnea_severity: 3 }
    },
    {
      name: "Severe Hypoxemic Emergency (SpO2 86%)",
      input: { age: 62, oxygen_saturation: 86, respiratory_rate: 28, dyspnea_severity: 3 }
    },
    {
      name: "Hemoptysis with Acute Chest Pain",
      input: { age: 50, oxygen_saturation: 95, respiratory_rate: 22, hemoptysis: true, chest_pain: true }
    },
    {
      name: "Febrile Respiratory Infection",
      input: { age: 39, oxygen_saturation: 95, respiratory_rate: 21, temperature_c: 39.2, has_cough: true, cough_duration_days: 4 }
    },
    {
      name: "Pediatric Mild Asthma History",
      input: { age: 12, oxygen_saturation: 98, respiratory_rate: 19, dyspnea_severity: 1, has_asthma: true }
    }
  ];

  for (const profile of testProfiles) {
    const report = reproducibilityService.verifyOutputDeterminism(profile.input, 100);

    assert.strictEqual(report.success, true, `Determinism failed for: ${profile.name}`);
    assert.strictEqual(report.statistics.scoreVariance, 0, `Score variance must be 0 for: ${profile.name}`);
    assert.strictEqual(report.statistics.scoreStdDev, 0, `Score stdDev must be 0 for: ${profile.name}`);
    assert.strictEqual(report.statistics.confVariance, 0, `Confidence variance must be 0 for: ${profile.name}`);
    assert.strictEqual(report.statistics.confStdDev, 0, `Confidence stdDev must be 0 for: ${profile.name}`);
    assert.ok(report.fingerprint && report.fingerprint.length === 64, `Invalid SHA-256 fingerprint`);
  }
});

// -----------------------------------------------------------------------------
// 4. Feature Extraction Normalization Parity & Cross-Numeral Robustness
// -----------------------------------------------------------------------------
runTest("Arabic numeral inputs generate identical feature fingerprints and prediction outputs", () => {
  const westernInput = {
    age: 48,
    oxygen_saturation: 93,
    respiratory_rate: 22,
    dyspnea_severity: 2,
    cough_duration_days: 10,
    smoking_pack_years: 15
  };

  const arabicInput = {
    age: "٤٨",
    oxygen_saturation: "٩٣",
    respiratory_rate: "٢٢",
    dyspnea_severity: 2,
    cough_duration_days: "١٠",
    smoking_pack_years: "١٥"
  };

  const westernFingerprint = reproducibilityService.computeFingerprint(westernInput);
  const arabicFingerprint = reproducibilityService.computeFingerprint(arabicInput);
  assert.strictEqual(
    arabicFingerprint,
    westernFingerprint,
    "Arabic digit normalization must yield identical SHA-256 feature fingerprint"
  );

  const westernPred = reproducibilityService.classifier.predict(westernInput);
  const arabicPred = reproducibilityService.classifier.predict(arabicInput);

  assert.strictEqual(arabicPred.triage_category, westernPred.triage_category);
  assert.strictEqual(arabicPred.risk_score, westernPred.risk_score);
  assert.strictEqual(arabicPred.confidence, westernPred.confidence);
  assert.deepStrictEqual(arabicPred.probabilities, westernPred.probabilities);
});

runTest("Array tensor input and object input yield identical predictions and fingerprints", () => {
  const patientObj = {
    age: 55,
    oxygen_saturation: 94,
    respiratory_rate: 20,
    systolic_bp: 130,
    diastolic_bp: 85,
    temperature_c: 37.2,
    dyspnea_severity: 1,
    cough_duration_days: 7,
    hemoptysis: false,
    chest_pain: false,
    smoking_pack_years: 0,
    chronic_asthma_history: true,
    chronic_copd_history: false,
    allergy_history: true
  };

  const tensor = extractFeatures(patientObj);
  const predFromObj = reproducibilityService.classifier.predict(patientObj);
  const predFromTensor = reproducibilityService.classifier.predict(tensor);

  assert.strictEqual(predFromTensor.triage_category, predFromObj.triage_category);
  assert.strictEqual(predFromTensor.risk_score, predFromObj.risk_score);
  assert.strictEqual(predFromTensor.confidence, predFromObj.confidence);
  assert.deepStrictEqual(predFromTensor.probabilities, predFromObj.probabilities);
  assert.strictEqual(
    reproducibilityService.computeFingerprint(patientObj),
    reproducibilityService.computeFingerprint(tensor)
  );
});

// -----------------------------------------------------------------------------
// 5. Tamper-Evident Audit Certificate Generation
// -----------------------------------------------------------------------------
runTest("Generates certified Clinical Reproducibility Certificate for audit inspection", () => {
  const patientCase = {
    age: 60,
    oxygen_saturation: 92,
    respiratory_rate: 24,
    dyspnea_severity: 2,
    has_copd: true
  };

  const cert = reproducibilityService.generateAuditCertificate(patientCase);
  assert.strictEqual(cert.certificate_type, 'CLINICAL_MODEL_REPRODUCIBILITY_CERTIFICATE');
  assert.strictEqual(cert.certified, true);
  assert.strictEqual(cert.random_seed, 42);
  assert.strictEqual(cert.model_version, 'resp_rf_v1.0.2');
  assert.strictEqual(cert.audit_metrics.score_variance, 0);
  assert.strictEqual(cert.audit_metrics.score_std_dev, 0);
  assert.strictEqual(cert.audit_metrics.confidence_variance, 0);
  assert.strictEqual(cert.audit_metrics.confidence_std_dev, 0);
  assert.strictEqual(cert.audit_metrics.seed_synchronized, true);
  assert.ok(cert.patient_feature_fingerprint && cert.patient_feature_fingerprint.length === 64);
});

// -----------------------------------------------------------------------------
// 6. Backend Model Reproducibility Service Bridge Parity
// -----------------------------------------------------------------------------
runTest("backend/model-reproducibility-service.js maintains full parity with ml_models", () => {
  const patientCase = { age: 35, oxygen_saturation: 98, respiratory_rate: 16 };
  const backendReport = backendReproducibilityService.verifyOutputDeterminism(patientCase, 20);
  const mlReport = reproducibilityService.verifyOutputDeterminism(patientCase, 20);

  assert.strictEqual(backendReport.success, true);
  assert.strictEqual(backendReport.baselineRiskScore, mlReport.baselineRiskScore);
  assert.strictEqual(backendReport.fingerprint, mlReport.fingerprint);
  assert.strictEqual(backendReproducibilityService.seed, 42);
});

console.log('\n================================================================================');
console.log(`🎯 REPRODUCIBILITY VERIFICATION COMPLETE: ${passedTests}/${totalTests} Tests Passed (100%).`);
console.log('================================================================================\n');
