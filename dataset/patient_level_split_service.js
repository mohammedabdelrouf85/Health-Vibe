/**
 * Health Vibe AI - Patient-Level Train / Validation / Test Split Engine
 * 
 * Implements strict Patient-Level (Subject/Group) Partitioning to guarantee
 * ZERO data leakage between Training, Validation, and Test datasets.
 * 
 * Medical Machine Learning Rationale:
 * Naive sample-level random splitting allows records from the same patient
 * to leak across train and evaluation sets. The model then learns patient-specific
 * biometrics/identity rather than generalizable disease features, artificially inflating
 * validation performance and failing in real-world clinical deployment.
 * 
 * Guarantees:
 * 1. Disjointness: Patients(Train) ∩ Patients(Val) = ∅, Patients(Train) ∩ Patients(Test) = ∅, Patients(Val) ∩ Patients(Test) = ∅
 * 2. Stratification: Maintains balanced clinical condition and triage distribution at the patient level.
 * 3. Reproducibility: Deterministic seeded PRNG guarantees identical splits across audits.
 * 4. Audit Manifest: Generates cryptographic SHA-256 manifest and zero-leakage certification.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Deterministic PRNG (Mulberry32) for reproducible, audit-compliant splitting
function createMulberry32(seed = 42) {
  let s = Math.floor(Math.abs(seed)) || 42;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class PatientLevelSplitService {
  constructor(options = {}) {
    this.defaultRatios = {
      train: 0.70,
      validation: 0.15,
      test: 0.15
    };
    this.seed = options.seed || 42;
  }

  /**
   * Resolves the patient identifier from a clinical record.
   * Supports patientId, patient_id, subjectId, id, or userId.
   * @param {object} record
   * @param {string|Function} [customExtractor]
   * @returns {string}
   */
  resolvePatientId(record, customExtractor = null) {
    if (!record || typeof record !== "object") {
      throw new Error("[PATIENT_SPLIT_ERROR]: Invalid record provided for patient ID resolution.");
    }

    if (typeof customExtractor === "function") {
      const customId = customExtractor(record);
      if (customId) return String(customId).trim();
    }

    const candidate = record.patientId || record.patient_id || record.subjectId || record.userId || record.id;
    if (!candidate) {
      throw new Error(`[PATIENT_SPLIT_ERROR]: Record is missing patient identifier (checked patientId, patient_id, subjectId, userId, id): ${JSON.stringify(record).slice(0, 100)}`);
    }

    return String(candidate).trim();
  }

  /**
   * Extracts primary stratum/label for stratified patient grouping.
   * Uses groundTruth.triage, triage.category, groundTruth.critical, or fallback.
   * @param {object} record
   * @returns {string}
   */
  resolveRecordStratum(record) {
    if (record.groundTruth && record.groundTruth.triage) {
      return String(record.groundTruth.triage).toLowerCase();
    }
    if (record.triage && record.triage.category) {
      return String(record.triage.category).toLowerCase();
    }
    if (record.targetLabel || record.label) {
      return String(record.targetLabel || record.label).toLowerCase();
    }
    if (record.archetype) {
      return String(record.archetype).toLowerCase();
    }
    if (record.groundTruth && record.groundTruth.critical !== undefined) {
      return record.groundTruth.critical === 1 ? "critical" : "non_critical";
    }
    return "general_respiratory";
  }

  /**
   * Groups a dataset into distinct patient entities.
   * @param {Array<object>} dataset
   * @param {string|Function} [patientIdExtractor]
   * @returns {Map<string, { patientId: string, records: Array<object>, primaryStratum: string }>}
   */
  groupDatasetByPatient(dataset, patientIdExtractor = null) {
    if (!Array.isArray(dataset) || dataset.length === 0) {
      throw new Error("[PATIENT_SPLIT_ERROR]: Dataset must be a non-empty array of clinical records.");
    }

    const patientMap = new Map();

    for (let i = 0; i < dataset.length; i++) {
      const record = dataset[i];
      const patientId = this.resolvePatientId(record, patientIdExtractor);
      const stratum = this.resolveRecordStratum(record);

      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          patientId,
          records: [],
          strataCounts: {},
          primaryStratum: stratum
        });
      }

      const patientGroup = patientMap.get(patientId);
      patientGroup.records.push(record);
      patientGroup.strataCounts[stratum] = (patientGroup.strataCounts[stratum] || 0) + 1;
    }

    // Determine primary stratum by majority record label for each patient
    for (const [pId, group] of patientMap.entries()) {
      let maxCount = -1;
      let majorityStratum = group.primaryStratum;
      for (const [st, count] of Object.entries(group.strataCounts)) {
        if (count > maxCount) {
          maxCount = count;
          majorityStratum = st;
        }
      }
      group.primaryStratum = majorityStratum;
    }

    return patientMap;
  }

  /**
   * Performs strict Patient-Level Train / Validation / Test split.
   * @param {Array<object>} dataset
   * @param {object} [options]
   * @param {number} [options.trainRatio=0.70]
   * @param {number} [options.valRatio=0.15]
   * @param {number} [options.testRatio=0.15]
   * @param {number} [options.seed=42]
   * @param {string|Function} [options.patientIdExtractor]
   * @returns {{
   *   train: Array<object>,
   *   validation: Array<object>,
   *   test: Array<object>,
   *   trainPatients: Array<string>,
   *   validationPatients: Array<string>,
   *   testPatients: Array<string>,
   *   manifest: object
   * }}
   */
  splitByPatient(dataset, options = {}) {
    const trainRatio = Number(options.trainRatio ?? this.defaultRatios.train);
    const valRatio = Number(options.valRatio ?? this.defaultRatios.validation);
    const testRatio = Number(options.testRatio ?? this.defaultRatios.test);
    const seed = options.seed !== undefined ? options.seed : this.seed;
    const patientIdExtractor = options.patientIdExtractor || null;

    const sumRatios = trainRatio + valRatio + testRatio;
    if (Math.abs(sumRatios - 1.0) > 0.001) {
      throw new Error(`[PATIENT_SPLIT_ERROR]: Split ratios must sum to 1.0 (received train=${trainRatio}, val=${valRatio}, test=${testRatio}, sum=${sumRatios}).`);
    }

    const patientMap = this.groupDatasetByPatient(dataset, patientIdExtractor);
    const totalPatients = patientMap.size;
    const totalRecords = dataset.length;

    if (totalPatients < 3) {
      throw new Error(`[PATIENT_SPLIT_ERROR]: At least 3 distinct patients are required for a 3-way patient-level split (found ${totalPatients}).`);
    }

    // Stratify patients by primary clinical stratum
    const strataGroups = new Map();
    for (const [pId, pData] of patientMap.entries()) {
      const st = pData.primaryStratum;
      if (!strataGroups.has(st)) {
        strataGroups.set(st, []);
      }
      strataGroups.get(st).push(pData);
    }

    const rand = createMulberry32(seed);

    const trainPatientGroups = [];
    const valPatientGroups = [];
    const testPatientGroups = [];

    // Shuffle and partition within each stratum
    for (const [stratum, patientsInStratum] of strataGroups.entries()) {
      // Fisher-Yates shuffle with seeded PRNG
      const shuffled = [...patientsInStratum];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const n = shuffled.length;
      if (n === 1) {
        // Single patient stratum placed in train
        trainPatientGroups.push(shuffled[0]);
      } else if (n === 2) {
        trainPatientGroups.push(shuffled[0]);
        valPatientGroups.push(shuffled[1]);
      } else {
        const nTrain = Math.max(1, Math.round(n * trainRatio));
        const remaining = n - nTrain;
        const nVal = Math.max(1, Math.round(remaining * (valRatio / (valRatio + testRatio))));
        
        const trainSlice = shuffled.slice(0, nTrain);
        const valSlice = shuffled.slice(nTrain, nTrain + nVal);
        const testSlice = shuffled.slice(nTrain + nVal);

        // If rounding left test empty when remaining >= 2, adjust
        if (testSlice.length === 0 && valSlice.length > 1) {
          testSlice.push(valSlice.pop());
        }

        trainPatientGroups.push(...trainSlice);
        valPatientGroups.push(...valSlice);
        testPatientGroups.push(...testSlice);
      }
    }

    // Flatten records for each split
    const trainRecords = [];
    const trainPatientIds = [];
    for (const p of trainPatientGroups) {
      trainPatientIds.push(p.patientId);
      for (const r of p.records) {
        trainRecords.push({ ...r, splitAssignment: "train" });
      }
    }

    const valRecords = [];
    const valPatientIds = [];
    for (const p of valPatientGroups) {
      valPatientIds.push(p.patientId);
      for (const r of p.records) {
        valRecords.push({ ...r, splitAssignment: "validation" });
      }
    }

    const testRecords = [];
    const testPatientIds = [];
    for (const p of testPatientGroups) {
      testPatientIds.push(p.patientId);
      for (const r of p.records) {
        testRecords.push({ ...r, splitAssignment: "test" });
      }
    }

    // ── STRICT ZERO-LEAKAGE VERIFICATION ──────────────────────────
    const verification = this.verifyZeroPatientLeakage({
      trainPatients: trainPatientIds,
      validationPatients: valPatientIds,
      testPatients: testPatientIds
    });

    if (!verification.zeroLeakageCertified) {
      throw new Error(`[CRITICAL_DATA_LEAKAGE_DETECTED]: Patient-level split violated! Overlaps: ${JSON.stringify(verification.overlaps)}`);
    }

    // Generate cryptographic audit manifest
    const manifest = this.generateSplitManifest({
      totalPatients,
      totalRecords,
      trainRatio,
      valRatio,
      testRatio,
      seed,
      trainPatients: trainPatientIds,
      valPatients: valPatientIds,
      testPatients: testPatientIds,
      trainRecords,
      valRecords,
      testRecords,
      strataCount: strataGroups.size
    });

    return {
      train: trainRecords,
      validation: valRecords,
      test: testRecords,
      trainPatients: trainPatientIds,
      validationPatients: valPatientIds,
      testPatients: testPatientIds,
      manifest
    };
  }

  /**
   * Verifies that sets of patient IDs across splits are 100% disjoint.
   * Throws or returns detailed violation diagnostic if any leak exists.
   * @param {object} splitSets
   * @param {Array<string>} splitSets.trainPatients
   * @param {Array<string>} splitSets.validationPatients
   * @param {Array<string>} splitSets.testPatients
   * @returns {{ zeroLeakageCertified: boolean, overlaps: object, stats: object }}
   */
  verifyZeroPatientLeakage({ trainPatients, validationPatients, testPatients }) {
    const sTrain = new Set(trainPatients);
    const sVal = new Set(validationPatients);
    const sTest = new Set(testPatients);

    const trainValOverlap = [];
    for (const p of sVal) {
      if (sTrain.has(p)) trainValOverlap.push(p);
    }

    const trainTestOverlap = [];
    for (const p of sTest) {
      if (sTrain.has(p)) trainTestOverlap.push(p);
    }

    const valTestOverlap = [];
    for (const p of sTest) {
      if (sVal.has(p)) valTestOverlap.push(p);
    }

    const totalOverlaps = trainValOverlap.length + trainTestOverlap.length + valTestOverlap.length;
    const isZeroLeakage = totalOverlaps === 0;

    return {
      zeroLeakageCertified: isZeroLeakage,
      overlaps: {
        trainVsValidation: trainValOverlap,
        trainVsTest: trainTestOverlap,
        validationVsTest: valTestOverlap,
        totalOverlapCount: totalOverlaps
      },
      stats: {
        distinctTrainPatients: sTrain.size,
        distinctValidationPatients: sVal.size,
        distinctTestPatients: sTest.size,
        totalUniquePatients: new Set([...sTrain, ...sVal, ...sTest]).size
      }
    };
  }

  /**
   * Asserts zero patient leakage directly from three record arrays.
   * @param {Array<object>} trainRecords
   * @param {Array<object>} valRecords
   * @param {Array<object>} testRecords
   * @param {string|Function} [patientIdExtractor]
   */
  assertZeroPatientLeakage(trainRecords, valRecords, testRecords, patientIdExtractor = null) {
    const extract = (arr) => arr.map(r => this.resolvePatientId(r, patientIdExtractor));
    const result = this.verifyZeroPatientLeakage({
      trainPatients: extract(trainRecords),
      validationPatients: extract(valRecords),
      testPatients: extract(testRecords)
    });

    if (!result.zeroLeakageCertified) {
      const err = new Error(
        `[DATA_LEAKAGE_ASSERTION_FAILED]: Found ${result.overlaps.totalOverlapCount} overlapping patient ID(s) across splits! ` +
        `Train/Val: [${result.overlaps.trainVsValidation.join(", ")}], ` +
        `Train/Test: [${result.overlaps.trainVsTest.join(", ")}], ` +
        `Val/Test: [${result.overlaps.validationVsTest.join(", ")}]`
      );
      err.code = "DATA_LEAKAGE_DETECTED";
      err.overlaps = result.overlaps;
      throw err;
    }

    return result;
  }

  /**
   * Generates a tamper-evident audit manifest for the split.
   */
  generateSplitManifest(data) {
    const computeClassDist = (records) => {
      const dist = {};
      for (const r of records) {
        const st = this.resolveRecordStratum(r);
        dist[st] = (dist[st] || 0) + 1;
      }
      return dist;
    };

    const manifestPayload = {
      protocol: "HV-PATIENT-SPLIT-GMLP-2026",
      methodology: "STRATIFIED_GROUP_PATIENT_LEVEL_PARTITION",
      specification: "PRD Requirement 52 Compliance: Zero Patient Leakage",
      timestamp: new Date().toISOString(),
      ratios: {
        target: {
          train: data.trainRatio,
          validation: data.valRatio,
          test: data.testRatio
        },
        achievedPatientLevel: {
          train: Number((data.trainPatients.length / data.totalPatients).toFixed(4)),
          validation: Number((data.valPatients.length / data.totalPatients).toFixed(4)),
          test: Number((data.testPatients.length / data.totalPatients).toFixed(4))
        },
        achievedRecordLevel: {
          train: Number((data.trainRecords.length / data.totalRecords).toFixed(4)),
          validation: Number((data.valRecords.length / data.totalRecords).toFixed(4)),
          test: Number((data.testRecords.length / data.totalRecords).toFixed(4))
        }
      },
      counts: {
        totalDistinctPatients: data.totalPatients,
        totalRecords: data.totalRecords,
        train: {
          patients: data.trainPatients.length,
          records: data.trainRecords.length,
          classDistribution: computeClassDist(data.trainRecords)
        },
        validation: {
          patients: data.valPatients.length,
          records: data.valRecords.length,
          classDistribution: computeClassDist(data.valRecords)
        },
        test: {
          patients: data.testPatients.length,
          records: data.testRecords.length,
          classDistribution: computeClassDist(data.testRecords)
        }
      },
      zeroPatientLeakageCertified: true,
      overlapCount: 0,
      randomSeed: data.seed
    };

    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(manifestPayload))
      .digest("hex");

    manifestPayload.manifestSha256 = hash;
    return manifestPayload;
  }

  /**
   * Saves partitioned datasets and manifest to disk.
   */
  saveSplitsToDisk(splitResult, outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outputDir, "train_dataset.json"), JSON.stringify(splitResult.train, null, 2), "utf8");
    fs.writeFileSync(path.join(outputDir, "validation_dataset.json"), JSON.stringify(splitResult.validation, null, 2), "utf8");
    fs.writeFileSync(path.join(outputDir, "test_dataset.json"), JSON.stringify(splitResult.test, null, 2), "utf8");
    fs.writeFileSync(path.join(outputDir, "patient_level_split_manifest.json"), JSON.stringify(splitResult.manifest, null, 2), "utf8");

    return {
      success: true,
      outputDir,
      filesWritten: [
        "train_dataset.json",
        "validation_dataset.json",
        "test_dataset.json",
        "patient_level_split_manifest.json"
      ]
    };
  }
}

const patientLevelSplitService = new PatientLevelSplitService();

module.exports = {
  PatientLevelSplitService,
  patientLevelSplitService
};
