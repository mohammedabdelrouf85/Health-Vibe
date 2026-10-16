/**
 * Health Vibe AI - Strict Dataset License & Scientific Quality Governance Test Suite
 * PRD Page 9, Requirement 46:
 * "فحص وتوثيق رخصة استخدام (License) وجودة أي Dataset مستخرجة من Kaggle أو المصادر الطبية المفتوحة للتأكد من صلاحيتها القانونية والعلمية."
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DatasetGovernanceService,
  datasetGovernanceService,
  ACCEPTABLE_LICENSES,
  RESTRICTED_LICENSES,
  PHYSIOLOGICAL_BOUNDS
} = require("../dataset/dataset_governance_service");

const {
  KaggleTrainingService,
  kaggleTrainingService
} = require("../backend/kaggle-training-service");

console.log("================================================================================");
console.log("🔬 HEALTH VIBE AI: DATASET LICENSE & SCIENTIFIC QUALITY TEST SUITE (PRD 46)");
console.log("   Legal Licensing, Commercial Viability, Physiological Bounds, Quality Audit");
console.log("================================================================================\n");

async function runTestSuite() {
  const service = new DatasetGovernanceService();

  // ── TEST 1: Dataset Registry Existence and Completeness ───────────────────
  console.log("▶ TEST 1: Kaggle & Open Clinical Dataset Registry Verification");
  const registered = service.getAllRegisteredDatasets();
  assert.ok(Array.isArray(registered), "Registry must contain an array of datasets");
  assert.ok(registered.length >= 6, `Registry must contain at least 6 foundational datasets (found ${registered.length})`);

  const expectedSourceIds = [
    "kaggle/respiratory-sound-database",
    "kaggle/asthma-copd-clinical-dataset",
    "kaggle/diabetes-prediction-dataset",
    "kaggle/hypertension-risk-indicators",
    "kaggle/obesity-levels-estimation",
    "kaggle/blood-disorders-hematology-benchmarks"
  ];

  for (const expectedId of expectedSourceIds) {
    const found = service.getRegisteredDataset(expectedId);
    assert.ok(found, `Dataset '${expectedId}' must be present in registry`);
    assert.ok(found.title, `Dataset '${expectedId}' must have a title`);
    assert.ok(found.origin.doi || found.origin.citation, `Dataset '${expectedId}' must have academic citation or DOI`);
    assert.ok(found.licensing.licenseType, `Dataset '${expectedId}' must specify a license type`);
    assert.ok(found.scientificQuality.groundTruthAnnotation, `Dataset '${expectedId}' must specify ground truth annotation`);
  }
  console.log("  ✓ All 6 foundational Kaggle and open clinical datasets registered with full provenance.\n");

  // ── TEST 2: Legal Licensing Audit Engine ──────────────────────────────────
  console.log("▶ TEST 2: Legal Licensing Audit & Commercial Viability Verification");

  // 1. Valid open license with commercial permission (CC-BY-4.0)
  const validMeta = {
    licensing: {
      licenseType: "CC-BY-4.0",
      isCommercialUseAllowed: true,
      requiresAttribution: true,
      patientConsentStatus: "IRB Approved & Informed Consent Verified"
    },
    origin: {
      doi: "10.1007/978-3-319-65798-1_10",
      citation: "Rocha BM, et al. Respiratory sound classification. Physiol Meas. 2019."
    }
  };
  const validAudit = service.auditDatasetLegalLicensing(validMeta);
  assert.equal(validAudit.isLegalCompliant, true, "CC-BY-4.0 must be legal compliant");
  assert.equal(validAudit.isCommercialUseAllowed, true, "CC-BY-4.0 must allow commercial use");
  assert.equal(validAudit.complianceStatus, "VERIFIED_LEGAL_COMPLIANT");
  assert.equal(validAudit.issues.length, 0);

  // 2. Public Domain license (CC0-1.0)
  const cc0Audit = service.auditDatasetLegalLicensing({
    licensing: {
      licenseType: "CC0-1.0",
      patientConsentStatus: "Exempt Public Health Data"
    },
    origin: { citation: "Public Domain Epidemiological Survey" }
  });
  assert.equal(cc0Audit.isLegalCompliant, true, "CC0-1.0 must be legal compliant");
  assert.equal(cc0Audit.isCommercialUseAllowed, true, "CC0-1.0 allows commercial use");

  // 3. Restricted Non-Commercial license (CC-BY-NC-4.0)
  const ncMeta = {
    licensing: {
      licenseType: "CC-BY-NC-4.0",
      patientConsentStatus: "IRB Approved"
    },
    origin: { citation: "Academic Research Only" }
  };
  const ncAudit = service.auditDatasetLegalLicensing(ncMeta);
  assert.equal(ncAudit.complianceStatus, "LEGAL_RESEARCH_ONLY", "CC-BY-NC must be marked research only");
  assert.equal(ncAudit.isCommercialUseAllowed, false, "CC-BY-NC cannot be used commercially");
  assert.ok(ncAudit.warnings.some(w => w.includes("Commercial deployment prohibited")));

  // 4. Prohibited or Unknown license
  const invalidMeta = {
    licensing: {
      licenseType: "Proprietary-Restricted",
      patientConsentStatus: "None"
    }
  };
  const invalidAudit = service.auditDatasetLegalLicensing(invalidMeta);
  assert.equal(invalidAudit.isLegalCompliant, false, "Proprietary license must fail audit");
  assert.equal(invalidAudit.complianceStatus, "REJECTED_LEGAL_VIOLATION");
  assert.ok(invalidAudit.issues.length > 0);

  console.log("  ✓ Legal licensing engine strictly separates commercial, research-only, and prohibited licenses.\n");

  // ── TEST 3: Scientific Quality & Physiological Boundary Auditing ──────────
  console.log("▶ TEST 3: Scientific Quality & Physiological Boundary Verification");

  // Sample data within valid physiological boundaries
  const validClinicalSample = [
    { oxygenLevel: 98, respiratoryRate: 16, heartRate: 72, temperature: 36.6 },
    { oxygenLevel: 94, respiratoryRate: 22, heartRate: 88, temperature: 37.8 },
    { oxygenLevel: 91, respiratoryRate: 26, heartRate: 104, temperature: 38.5 },
    { oxygenLevel: 96, respiratoryRate: 18, heartRate: 76, temperature: 36.9 }
  ];

  const qualityMeta = {
    sampleSize: 500,
    groundTruthAnnotation: "Specialist pulmonologist consensus and spirometry assay",
    interRaterReliabilityKappa: 0.92
  };

  const sampleQualityAudit = service.auditDatasetScientificQuality(qualityMeta, validClinicalSample);
  assert.equal(sampleQualityAudit.isScientificallyValidated, true, "Valid clinical sample must pass scientific audit");
  assert.equal(sampleQualityAudit.boundaryViolationsCount, 0, "Should have 0 boundary violations");
  assert.ok(sampleQualityAudit.qualityScore >= 90, "Quality score should be >= 90");
  assert.equal(sampleQualityAudit.scientificStatus, "CLINICALLY_VALIDATED");

  // Injected physiological violations: impossible SpO2 and extreme heart rate
  const corruptSample = [
    { oxygenLevel: 145, respiratoryRate: 16 }, // Impossible SpO2 > 100%
    { oxygenLevel: 95, heartRate: 350 },       // Impossible HR > 220 bpm
    { oxygenLevel: 30, temperature: 46.0 }      // Severe boundary violations
  ];

  const corruptAudit = service.auditDatasetScientificQuality({ sampleSize: 200 }, corruptSample);
  assert.equal(corruptAudit.isScientificallyValidated, false, "Corrupt physiological sample must fail");
  assert.ok(corruptAudit.boundaryViolationsCount >= 3, "Must detect physiological violations");
  assert.equal(corruptAudit.scientificStatus, "REJECTED_QUALITY_DEFICIT");

  // Injected high critical missingness test
  const missingSample = [
    { oxygenLevel: null, respiratoryRate: null, heartRate: 80 },
    { oxygenLevel: undefined, respiratoryRate: 20, heartRate: 75 },
    { oxygenLevel: "", respiratoryRate: 18, heartRate: 72 },
    { oxygenLevel: 95, respiratoryRate: 16, heartRate: 70 }
  ]; // 3/4 = 75% critical missingness
  const missingAudit = service.auditDatasetScientificQuality({ sampleSize: 200 }, missingSample);
  assert.equal(missingAudit.isScientificallyValidated, false, "High critical missingness must fail audit");
  assert.ok(missingAudit.issues.some(i => i.includes("Critical feature missingness")));

  console.log("  ✓ Scientific quality engine enforces physiological plausibility and critical completeness.\n");

  // ── TEST 4: Comprehensive Audit of All 6 Registered Kaggle Benchmarks ─────
  console.log("▶ TEST 4: Full Governance Audit of All Registered Kaggle Benchmarks");
  const registryAudit = service.auditRegistry();
  assert.equal(registryAudit.totalDatasets, registered.length);
  assert.equal(registryAudit.certifiedCount, registered.length, "All registered benchmark datasets must be certified");
  assert.equal(registryAudit.passRatePercent, 100.0, "Pass rate must be 100%");

  registryAudit.reports.forEach(report => {
    assert.equal(report.isFullyCertified, true, `Dataset '${report.datasetId}' must be certified`);
    assert.equal(report.legalAudit.isLegalCompliant, true);
    assert.equal(report.scientificAudit.isScientificallyValidated, true);
    assert.ok(report.summary.qualityScore >= 90, `Quality score for '${report.datasetId}' must be >= 90`);
    assert.equal(report.summary.criticalMissingPercent, 0.0, "Critical missingness must be 0%");
  });

  console.log(`  ✓ All ${registryAudit.totalDatasets} registered datasets audited and certified 100% compliant.\n`);

  // ── TEST 5: KaggleTrainingService Integration ─────────────────────────────
  console.log("▶ TEST 5: KaggleTrainingService Governance Integration");
  const trainingService = new KaggleTrainingService();

  // 1. Verify audit method on training service
  const repAudit = trainingService.auditDatasetQualityAndLicense("kaggle/respiratory-sound-database");
  assert.ok(repAudit, "auditDatasetQualityAndLicense must return report");
  assert.equal(repAudit.isFullyCertified, true);
  assert.equal(repAudit.governanceClearanceStatus, "APPROVED_FOR_CLINICAL_TRAINING");

  // 2. Reject unapproved or unregistered dataset
  assert.throws(
    () => {
      trainingService.auditDatasetQualityAndLicense("kaggle/unapproved-fake-medical-dataset");
    },
    /not found in approved dataset registry/
  );

  // 3. Zero PHI protection check on Kaggle training records
  const phiCleanSample = [
    { subject_token: "HV-SAMP-01", spo2: 95, respiratory_rate: 18, triage_class: "normal" },
    { subject_token: "HV-SAMP-02", spo2: 89, respiratory_rate: 28, triage_class: "urgent" }
  ];
  const phiResult = trainingService.verifyZeroPhi(phiCleanSample);
  assert.equal(phiResult.zeroPhiCertified, true);

  // Injected PHI must be caught immediately
  assert.throws(
    () => {
      trainingService.verifyZeroPhi([
        { subject_token: "HV-SAMP-03", patient_name: "Ahmed Ali", national_id: "29801010101010" }
      ]);
    },
    /DATA_LEAKAGE_GUARD/
  );

  console.log("  ✓ KaggleTrainingService enforces full licensing, scientific quality, and zero-PHI governance.\n");

  console.log("================================================================================");
  console.log("🎉 ALL 5 DATASET LICENSE & SCIENTIFIC QUALITY TESTS PASSED (100% SUCCESS!)");
  console.log("================================================================================\n");
}

runTestSuite().catch(err => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
