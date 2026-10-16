/**
 * HEALTH VIBE AI: STRICT PATIENT-LEVEL DATASET SPLIT TEST SUITE
 * 
 * Verifies User Request 52 & PRD Requirement 52:
 * "فصل بيانات التدريب والاختبار (Train / Validation / Test Split) بشكل صارم على مستوى المريض
 *  (Patient-level Split) لضمان عدم تسرب بيانات نفس المريض بين التدريب والاختبار."
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  PatientLevelSplitService,
  patientLevelSplitService
} = require("../dataset/patient_level_split_service");

const { kaggleTrainingService } = require("../backend/kaggle-training-service");

console.log("==================================================================");
console.log("🔬 HEALTH VIBE AI: STRICT PATIENT-LEVEL DATASET SPLIT TEST SUITE");
console.log("   PRD Req 52: Zero Patient Data Leakage Across Train / Val / Test");
console.log("==================================================================\n");

// ── TEST 1: Multi-Record Patient Grouping Integrity ─────────────────────────
console.log("▶ TEST 1: Multi-Record Patient Grouping Integrity");
const mockMultiRecordCohort = [
  { patientId: "P-001", visit: 1, vitals: { oxygenLevel: 94 }, groundTruth: { triage: "high" } },
  { patientId: "P-001", visit: 2, vitals: { oxygenLevel: 88 }, groundTruth: { triage: "urgent" } },
  { patientId: "P-001", visit: 3, vitals: { oxygenLevel: 91 }, groundTruth: { triage: "high" } },
  { patientId: "P-002", visit: 1, vitals: { oxygenLevel: 97 }, groundTruth: { triage: "normal" } },
  { patientId: "P-002", visit: 2, vitals: { oxygenLevel: 98 }, groundTruth: { triage: "normal" } },
  { patientId: "P-003", visit: 1, vitals: { oxygenLevel: 85 }, groundTruth: { triage: "urgent" } },
  { patientId: "P-004", visit: 1, vitals: { oxygenLevel: 92 }, groundTruth: { triage: "high" } },
  { patientId: "P-005", visit: 1, vitals: { oxygenLevel: 96 }, groundTruth: { triage: "normal" } },
  { patientId: "P-006", visit: 1, vitals: { oxygenLevel: 89 }, groundTruth: { triage: "urgent" } }
];

const grouped = patientLevelSplitService.groupDatasetByPatient(mockMultiRecordCohort);
assert.strictEqual(grouped.size, 6, "Must group 9 encounters into exactly 6 distinct patients");
assert.strictEqual(grouped.get("P-001").records.length, 3, "Patient P-001 must contain all 3 visit records");
assert.strictEqual(grouped.get("P-002").records.length, 2, "Patient P-002 must contain both visit records");
console.log("  ✓ Multi-encounter grouping successfully aggregated encounters by patient identifier.");

// ── TEST 2: Strict Patient-Level Split (Disjoint Sets) ───────────────────────
console.log("\n▶ TEST 2: Strict Patient-Level 3-Way Split (Train / Validation / Test)");
const splitResult = patientLevelSplitService.splitByPatient(mockMultiRecordCohort, {
  trainRatio: 0.50,
  valRatio: 0.25,
  testRatio: 0.25,
  seed: 123
});

// All 3 records of P-001 must reside in the SAME split partition
const p1InTrain = splitResult.train.some(r => r.patientId === "P-001");
const p1InVal = splitResult.validation.some(r => r.patientId === "P-001");
const p1InTest = splitResult.test.some(r => r.patientId === "P-001");

const p1SplitCount = [p1InTrain, p1InVal, p1InTest].filter(Boolean).length;
assert.strictEqual(p1SplitCount, 1, "Patient P-001's records must exist in EXACTLY ONE split partition");

// Total records preserved
assert.strictEqual(
  splitResult.train.length + splitResult.validation.length + splitResult.test.length,
  mockMultiRecordCohort.length,
  "All records must be preserved across splits"
);

// Programmatic zero leakage verification
const verification = patientLevelSplitService.verifyZeroPatientLeakage({
  trainPatients: splitResult.trainPatients,
  validationPatients: splitResult.validationPatients,
  testPatients: splitResult.testPatients
});
assert.strictEqual(verification.zeroLeakageCertified, true, "Must certify zero patient leakage");
assert.strictEqual(verification.overlaps.totalOverlapCount, 0, "Overlaps must be exactly 0");
console.log("  ✓ All multi-visit records for every patient held exclusively in single split partition.");
console.log("  ✓ Pairwise patient set intersections are 100% empty (Zero Data Leakage).");

// ── TEST 3: Injected Patient Leakage Detection ───────────────────────────────
console.log("\n▶ TEST 3: Active Leakage Detection (Catching Simulated Contamination)");
const contaminatedTrain = [{ patientId: "P-SAFE-1" }, { patientId: "P-LEAK-CONTAMINATED" }];
const contaminatedVal = [{ patientId: "P-SAFE-2" }];
const contaminatedTest = [{ patientId: "P-SAFE-3" }, { patientId: "P-LEAK-CONTAMINATED" }];

let caughtLeakage = false;
try {
  patientLevelSplitService.assertZeroPatientLeakage(contaminatedTrain, contaminatedVal, contaminatedTest);
} catch (err) {
  caughtLeakage = true;
  assert.strictEqual(err.code, "DATA_LEAKAGE_DETECTED");
  assert.ok(err.message.includes("P-LEAK-CONTAMINATED"), "Error message must report contaminated patient ID");
}
assert.strictEqual(caughtLeakage, true, "Validator MUST throw an error when patient overlap exists");
console.log("  ✓ Successfully intercepted injected cross-split contamination and threw DATA_LEAKAGE_DETECTED.");

// ── TEST 4: Deterministic Reproducibility with PRNG Seed ─────────────────────
console.log("\n▶ TEST 4: Deterministic Reproducibility Across Audits");
const run1 = patientLevelSplitService.splitByPatient(mockMultiRecordCohort, { seed: 9999 });
const run2 = patientLevelSplitService.splitByPatient(mockMultiRecordCohort, { seed: 9999 });

assert.deepStrictEqual(run1.trainPatients, run2.trainPatients, "Train patient split must be identical given same seed");
assert.deepStrictEqual(run1.validationPatients, run2.validationPatients, "Validation patient split must be identical given same seed");
assert.deepStrictEqual(run1.testPatients, run2.testPatients, "Test patient split must be identical given same seed");
console.log("  ✓ 100% deterministic reproducibility confirmed under fixed seed.");

// ── TEST 5: Verification of Generated Files on Disk ──────────────────────────
console.log("\n▶ TEST 5: Verification of Production Dataset Files on Disk");
const datasetDir = path.resolve(__dirname, "../dataset");
const trainPath = path.join(datasetDir, "train_dataset.json");
const valPath = path.join(datasetDir, "validation_dataset.json");
const testPath = path.join(datasetDir, "test_dataset.json");
const manifestPath = path.join(datasetDir, "patient_level_split_manifest.json");

assert.ok(fs.existsSync(trainPath), "train_dataset.json must exist");
assert.ok(fs.existsSync(valPath), "validation_dataset.json must exist");
assert.ok(fs.existsSync(testPath), "test_dataset.json must exist");
assert.ok(fs.existsSync(manifestPath), "patient_level_split_manifest.json must exist");

const diskTrain = JSON.parse(fs.readFileSync(trainPath, "utf8"));
const diskVal = JSON.parse(fs.readFileSync(valPath, "utf8"));
const diskTest = JSON.parse(fs.readFileSync(testPath, "utf8"));
const diskManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Assert zero leakage across disk files
const diskLeakageCheck = patientLevelSplitService.assertZeroPatientLeakage(diskTrain, diskVal, diskTest);
assert.strictEqual(diskLeakageCheck.zeroLeakageCertified, true);

assert.strictEqual(diskManifest.zeroPatientLeakageCertified, true);
assert.strictEqual(diskManifest.overlapCount, 0);
assert.ok(diskManifest.manifestSha256, "Manifest must contain SHA-256 fingerprint");
console.log(`  ✓ Disk datasets verified: Train N=${diskTrain.length}, Val N=${diskVal.length}, Test N=${diskTest.length}.`);
console.log(`  ✓ Manifest SHA-256: ${diskManifest.manifestSha256}`);
console.log("  ✓ Zero patient leakage verified across all 3 production files.");

// ── TEST 6: Backend KaggleTrainingService Integration ────────────────────────
console.log("\n▶ TEST 6: Backend KaggleTrainingService Integration");
const backendPartition = kaggleTrainingService.partitionDatasetByPatient(mockMultiRecordCohort, { seed: 555 });
assert.ok(backendPartition.train && backendPartition.validation && backendPartition.test);

const report = kaggleTrainingService.getArchitecturalSeparationReport();
assert.strictEqual(report.patientLevelPartitioning, "ENFORCED_ZERO_PATIENT_LEAKAGE");
console.log("  ✓ KaggleTrainingService seamlessly executes patient-level partitioning and publishes separation report.");

console.log("\n==================================================================");
console.log("🎉 ALL STRICT PATIENT-LEVEL SPLIT TESTS PASSED (100% SUCCESS)!");
console.log("==================================================================");
