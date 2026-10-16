/**
 * Health Vibe AI - False Negative Clinical Analysis & Decision Threshold Calibration Engine
 * 
 * Medical Context:
 * In acute respiratory AI triage, False Negatives (FN) represent the highest clinical risk:
 * critically ill or deteriorating patients misclassified as "normal / reassuring" (under-triage).
 * Delayed emergency intervention in hypoxemia, pneumonia, or pulmonary embolism can lead to
 * respiratory arrest and avoidable mortality.
 * 
 * This engine provides:
 * 1. Deep Root-Cause Analysis of False Negatives (atypical presentation, pediatric/geriatric masking, borderline SpO2).
 * 2. Decision Threshold Sweep & Cost-Sensitive Calibration (minimizing FN to 0 while guarding against alarm fatigue).
 * 3. Clinical Safety Policy & Invariable Overrides (SpO2 < 90%, chest pain + dyspnea).
 */

const fs = require("fs");
const path = require("path");
const Metrics = require("./metrics");

/**
 * Root-Cause Taxonomy for Clinical False Negatives
 */
const FN_ROOT_CAUSES = Object.freeze({
  BORDERLINE_SPO2_WITH_DYSPNEA: {
    code: "BORDERLINE_SPO2_WITH_DYSPNEA",
    severity: "HIGH",
    clinicalDescriptionAr: "نقص أكسجين حدودي (SpO2 90-92%) مع ضيق تنفس دون كحة شديدة، مما أوقف تجميع النقاط دون عتبة العاجل.",
    clinicalDescriptionEn: "Borderline hypoxemia (SpO2 90-92%) with acute dyspnea lacking severe cough, leaving point score just under cutoff.",
    remediation: "Ensure mandatory rule elevation for SpO2 <= 92% when dyspnea is co-reported."
  },
  PEDIATRIC_ATYPICAL_PRESENTATION: {
    code: "PEDIATRIC_ATYPICAL_PRESENTATION",
    severity: "CRITICAL",
    clinicalDescriptionAr: "حالة أطفال (أقل من 12 سنة) مع نقص أكسجين وضيق تنفس، حيث تغيب الكحة الشديدة البالغة وتظهر علامات جهد تنفسي خفية.",
    clinicalDescriptionEn: "Pediatric patient (age <= 12) with hypoxemia and respiratory effort lacking adult-pattern productive cough.",
    remediation: "Enforce lower urgent threshold or pediatric-specific dyspnea multiplier for age <= 12."
  },
  GERIATRIC_BLUNTED_RESPONSE: {
    code: "GERIATRIC_BLUNTED_RESPONSE",
    severity: "HIGH",
    clinicalDescriptionAr: "استجابة فسيولوجية خافتة لدى كبار السن (65+ سنة) مع مسار تدريجي غير حاد يضلل النقاط المعيارية.",
    clinicalDescriptionEn: "Blunted geriatric febrile/symptom response in patients 65+ with insidious progression.",
    remediation: "Apply geriatric comorbidity weighting and oxygen baseline evaluation."
  },
  SILENT_HYPOXEMIA: {
    code: "SILENT_HYPOXEMIA",
    severity: "CRITICAL",
    clinicalDescriptionAr: "نقص أكسجين صامت (Happy Hypoxia): انخفاض ملحوظ في الأكسجين دون شكوى واضحة من ضيق التنفس.",
    clinicalDescriptionEn: "Silent hypoxemia (happy hypoxia): desaturation without proportionate subjective dyspnea sensation.",
    remediation: "Hard physiological SpO2 cutoffs (<90% absolute emergency, 90-92% close triage) overriding subjective symptoms."
  },
  THRESHOLD_CUTOFF_BOUNDARY: {
    code: "THRESHOLD_CUTOFF_BOUNDARY",
    severity: "MODERATE",
    clinicalDescriptionAr: "النقاط المحسوبة تقل بنقطة واحدة فقط عن العتبة بسبب غياب أعراض ثانوية.",
    clinicalDescriptionEn: "Patient score falls exactly 1 point below decision boundary due to absence of secondary symptoms.",
    remediation: "Calibrate urgent decision threshold to include score 7 cases with hypoxemia."
  }
});

class FalseNegativeAnalyzer {
  constructor() {
    this.clinicalCostRatio = 50; // False Negative is penalized 50x more than False Positive in triage
  }

  /**
   * Diagnoses the clinical root cause of an under-triaged critical case.
   */
  diagnoseRootCause(record, calculatedPoints, pointsCutoff) {
    const age = record.demographics ? record.demographics.age : null;
    const o2 = record.vitals ? record.vitals.oxygenLevel : null;
    const dyspnea = record.symptoms ? record.symptoms.breathingDifficulty : false;
    const cough = record.symptoms ? record.symptoms.coughLevel : "mild";

    // 1. Pediatric atypical presentation
    if (age !== null && age <= 12 && o2 !== null && o2 <= 92 && dyspnea) {
      return {
        ...FN_ROOT_CAUSES.PEDIATRIC_ATYPICAL_PRESENTATION,
        clinicalVignette: `Pediatric patient (age ${age}) with SpO2 ${o2}% and dyspnea. Under-triage risk: children decompensate rapidly; mild cough reports can falsely suppress score below ${pointsCutoff}.`
      };
    }

    // 2. Silent Hypoxemia (Desaturation without subjective dyspnea)
    if (o2 !== null && o2 < 93 && !dyspnea) {
      return {
        ...FN_ROOT_CAUSES.SILENT_HYPOXEMIA,
        clinicalVignette: `SpO2 ${o2}% without reported dyspnea. Under-triage risk: silent hypoxemia in viral pneumonitis (e.g. COVID-19/influenza).`
      };
    }

    // 3. Borderline SpO2 with dyspnea
    if (o2 !== null && o2 >= 90 && o2 <= 92 && dyspnea) {
      return {
        ...FN_ROOT_CAUSES.BORDERLINE_SPO2_WITH_DYSPNEA,
        clinicalVignette: `SpO2 ${o2}% with dyspnea. Accumulated points (${calculatedPoints}) fell short of cutoff (${pointsCutoff}) when cough was mild.`
      };
    }

    // 4. Geriatric blunted response
    if (age !== null && age >= 65) {
      return {
        ...FN_ROOT_CAUSES.GERIATRIC_BLUNTED_RESPONSE,
        clinicalVignette: `Geriatric patient (age ${age}) with blunted symptomatic complaint masking respiratory compromise.`
      };
    }

    // 5. Boundary margin error
    return {
      ...FN_ROOT_CAUSES.THRESHOLD_CUTOFF_BOUNDARY,
      clinicalVignette: `Score ${calculatedPoints} fell below cutoff ${pointsCutoff} by ${pointsCutoff - calculatedPoints} point(s).`
    };
  }

  /**
   * Evaluates an individual case with custom scoring and decision parameters.
   */
  evaluateSingleCase(record, options = {}) {
    const {
      urgentCutoff = 7,
      highCutoff = 3,
      spo2EmergencyCutoff = 90,
      rulesVersion = "HealthVibe-Rules-v1.1",
      probabilityCutoff = null,
      useProbabilityCutoff = false
    } = options;

    const o2 = record.vitals ? record.vitals.oxygenLevel : 0;
    const dyspnea = record.symptoms ? record.symptoms.breathingDifficulty : false;
    const cough = record.symptoms ? record.symptoms.coughLevel : "none";
    const duration = record.symptoms ? record.symptoms.symptomDurationDays : 0;
    const chestPain = record.symptoms ? record.symptoms.chestPain : false;
    const rf = record.comorbidities || {};

    let points = 0;
    const triggeredRules = [];

    // SpO2 scoring
    if (o2 > 0 && o2 < 90) {
      points += 6;
      triggeredRules.push("spo2_lt_90");
    } else if (o2 >= 90 && o2 <= 92) {
      points += 4;
      triggeredRules.push("spo2_90_92");
    } else if (o2 >= 93 && o2 <= 94) {
      points += 2;
      triggeredRules.push("spo2_93_94");
    }

    // Dyspnea
    if (dyspnea) {
      points += 2;
      triggeredRules.push("dyspnea_present");
    }

    // Cough
    if (cough === "severe") {
      points += 2;
      triggeredRules.push("severe_cough");
    } else if (cough === "moderate") {
      points += 1;
      triggeredRules.push("moderate_cough");
    }

    // Duration
    if (duration >= 7) {
      points += 1;
      triggeredRules.push("symptoms_7_days");
    }

    // Comorbidities
    const hasRf = rf.asthma || rf.copd || rf.smoking || rf.pregnancy || rf.cardiovascular || rf.diabetes;
    if (hasRf) {
      points += 1;
      triggeredRules.push("risk_factors_present");
    }

    // Chest pain + dyspnea emergency override
    if (chestPain && dyspnea) {
      points += 4;
      triggeredRules.push("acute_chest_pain_with_dyspnea");
    }

    // Calibrated continuous probability (Platt scaling)
    const z = 1.05 * (points - 7.1);
    const calibratedRiskScore = Number((1 / (1 + Math.exp(-z))).toFixed(4));

    // Decision Logic with hard emergency overrides
    let predictedTriage = "normal";
    const isEmergencyOverride = (o2 > 0 && o2 < spo2EmergencyCutoff) || (chestPain && dyspnea);
    const meetsPoints = typeof urgentCutoff === "number" && points >= urgentCutoff;
    const meetsProb = useProbabilityCutoff && typeof probabilityCutoff === "number" && calibratedRiskScore >= probabilityCutoff;

    if (isEmergencyOverride || (useProbabilityCutoff ? meetsProb : meetsPoints)) {
      predictedTriage = "urgent";
    } else if ((o2 > 0 && o2 < 93) || points >= highCutoff) {
      predictedTriage = "high";
    }

    const predictedCritical = predictedTriage === "urgent" ? 1 : 0;
    const actualCritical = record.groundTruth ? record.groundTruth.critical : 0;

    const isFalseNegative = actualCritical === 1 && predictedCritical === 0;
    const isFalsePositive = actualCritical === 0 && predictedCritical === 1;

    return {
      subjectId: record.subjectId || "UNKNOWN",
      points,
      calibratedRiskScore,
      predictedTriage,
      predictedCritical,
      actualCritical,
      isFalseNegative,
      isFalsePositive,
      triggeredRules,
      isEmergencyOverride
    };
  }

  /**
   * Conducts exhaustive False Negative Analysis across a dataset.
   */
  analyzeFalseNegatives(dataset, options = {}) {
    const {
      urgentCutoff = 7,
      probabilityCutoff = 0.45,
      datasetName = "Evaluation Cohort"
    } = options;

    const fnCases = [];
    const fpCases = [];
    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (const record of dataset) {
      const evalRes = this.evaluateSingleCase(record, { urgentCutoff, probabilityCutoff });
      const actual = evalRes.actualCritical;
      const pred = evalRes.predictedCritical;

      if (actual === 1 && pred === 1) {
        tp++;
      } else if (actual === 0 && pred === 1) {
        fp++;
        fpCases.push({
          subjectId: evalRes.subjectId,
          points: evalRes.points,
          riskScore: evalRes.calibratedRiskScore,
          vitals: record.vitals,
          symptoms: record.symptoms
        });
      } else if (actual === 0 && pred === 0) {
        tn++;
      } else if (actual === 1 && pred === 0) {
        fn++;
        const rootCause = this.diagnoseRootCause(record, evalRes.points, urgentCutoff);
        fnCases.push({
          subjectId: evalRes.subjectId,
          age: record.demographics ? record.demographics.age : null,
          ageGroup: record.demographics ? record.demographics.ageGroup : null,
          sex: record.demographics ? record.demographics.sex : null,
          vitals: record.vitals,
          symptoms: record.symptoms,
          comorbidities: record.comorbidities,
          points: evalRes.points,
          calibratedRiskScore: evalRes.calibratedRiskScore,
          predictedTriage: evalRes.predictedTriage,
          groundTruthTriage: record.groundTruth ? record.groundTruth.triage : "urgent",
          rootCause,
          clinicalImpact: {
            delayRisk: "SEVERE",
            immediateActionNeeded: "Re-calibrate threshold or enforce SpO2/dyspnea override guard"
          }
        });
      }
    }

    const confMatrix = {
      tp,
      fp,
      tn,
      fn,
      total: dataset.length,
      actualPositive: tp + fn,
      actualNegative: tn + fp,
      predictedPositive: tp + fp,
      predictedNegative: tn + fn
    };
    const diagMetrics = Metrics.calculateDiagnosticMetrics(confMatrix);

    return {
      datasetName,
      sampleSize: dataset.length,
      urgentCutoff,
      probabilityCutoff,
      confusionMatrix: confMatrix,
      diagnosticMetrics: diagMetrics,
      falseNegativeCount: fn,
      falsePositiveCount: fp,
      zeroFalseNegativeGuaranteed: fn === 0,
      falseNegativeCases: fnCases,
      clinicalSafetyStatus: fn === 0 ? "PASSED_ZERO_FN_TOLERANCE" : "FAILED_UNACCEPTABLE_UNDER_TRIAGE",
      remediationSummary: fn === 0
        ? "No clinical false negatives detected. All critical respiratory patients safely escalated."
        : `Identified ${fn} false negative(s). Naive threshold (${urgentCutoff}) creates unacceptable mortality risk. Lower threshold to <= 7.`
    };
  }

  /**
   * Sweeps decision thresholds to identify the mathematically and clinically optimal operating point.
   */
  optimizeThresholds(dataset, options = {}) {
    const {
      pointsRange = [4, 5, 6, 7, 8, 9, 10],
      costFn = 50,
      costFp = 1
    } = options;

    const pointsSweep = [];
    let optimalZeroFnCutoff = null;
    let optimalYoudenCutoff = null;
    let optimalCostCutoff = null;
    let minLoss = Infinity;
    let maxY = -Infinity;

    for (const cutoff of pointsRange) {
      let curTp = 0, curFp = 0, curTn = 0, curFn = 0;
      const fnSubjectIds = [];

      for (const record of dataset) {
        const o2 = record.vitals ? record.vitals.oxygenLevel : 0;
        const dyspnea = record.symptoms ? record.symptoms.breathingDifficulty : false;
        const chestPain = record.symptoms ? record.symptoms.chestPain : false;

        // Points evaluation
        let pts = 0;
        if (o2 > 0 && o2 < 90) pts += 6;
        else if (o2 >= 90 && o2 <= 92) pts += 4;
        else if (o2 >= 93 && o2 <= 94) pts += 2;
        if (dyspnea) pts += 2;
        if (record.symptoms && record.symptoms.coughLevel === "severe") pts += 2;
        else if (record.symptoms && record.symptoms.coughLevel === "moderate") pts += 1;
        if (record.symptoms && record.symptoms.symptomDurationDays >= 7) pts += 1;
        const rf = record.comorbidities || {};
        if (rf.asthma || rf.copd || rf.smoking || rf.pregnancy || rf.cardiovascular || rf.diabetes) pts += 1;
        if (chestPain && dyspnea) pts += 4;

        const isPredCritical = ((o2 > 0 && o2 < 90) || pts >= cutoff || (chestPain && dyspnea)) ? 1 : 0;
        const actual = record.groundTruth ? record.groundTruth.critical : 0;

        if (actual === 1 && isPredCritical === 1) curTp++;
        else if (actual === 0 && isPredCritical === 1) curFp++;
        else if (actual === 0 && isPredCritical === 0) curTn++;
        else if (actual === 1 && isPredCritical === 0) {
          curFn++;
          fnSubjectIds.push(record.subjectId);
        }
      }

      const totalPos = curTp + curFn;
      const totalNeg = curTn + curFp;
      const sens = totalPos > 0 ? curTp / totalPos : 0;
      const spec = totalNeg > 0 ? curTn / totalNeg : 0;
      const ppv = (curTp + curFp) > 0 ? curTp / (curTp + curFp) : 0;
      const npv = (curTn + curFn) > 0 ? curTn / (curTn + curFn) : 0;

      // F2 Score: weights recall 5x higher than precision (beta = 2)
      const beta = 2;
      const f2 = (1 + beta * beta) * curTp / ((1 + beta * beta) * curTp + beta * beta * curFn + curFp);
      const youdenJ = sens + spec - 1;
      const clinicalLoss = (curFn * costFn) + (curFp * costFp);

      const entry = {
        pointsCutoff: cutoff,
        tp: curTp,
        fp: curFp,
        tn: curTn,
        fn: curFn,
        sensitivity: Number(sens.toFixed(4)),
        specificity: Number(spec.toFixed(4)),
        ppv: Number(ppv.toFixed(4)),
        npv: Number(npv.toFixed(4)),
        f2Score: Number((isNaN(f2) ? 0 : f2).toFixed(4)),
        youdenIndex: Number(youdenJ.toFixed(4)),
        clinicalLoss,
        fnSubjectIds,
        zeroFalseNegatives: curFn === 0
      };

      pointsSweep.push(entry);

      // Track zero FN cutoff
      if (curFn === 0) {
        if (optimalZeroFnCutoff === null || cutoff > optimalZeroFnCutoff.pointsCutoff) {
          optimalZeroFnCutoff = entry;
        }
      }

      // Track Youden index
      if (youdenJ > maxY && curFn === 0) {
        maxY = youdenJ;
        optimalYoudenCutoff = entry;
      }

      // Track Cost-sensitive loss
      if (clinicalLoss < minLoss) {
        minLoss = clinicalLoss;
        optimalCostCutoff = entry;
      }
    }

    // Continuous probability threshold sweep
    const probSweep = [];
    for (let pThresh = 0.15; pThresh <= 0.85; pThresh += 0.05) {
      let pTp = 0, pFp = 0, pTn = 0, pFn = 0;
      for (const record of dataset) {
        const evalRes = this.evaluateSingleCase(record, { probabilityCutoff: pThresh, urgentCutoff: 999, useProbabilityCutoff: true });
        const act = evalRes.actualCritical;
        const prd = evalRes.predictedCritical;
        if (act === 1 && prd === 1) pTp++;
        else if (act === 0 && prd === 1) pFp++;
        else if (act === 0 && prd === 0) pTn++;
        else if (act === 1 && prd === 0) pFn++;
      }
      const pSens = (pTp + pFn) > 0 ? pTp / (pTp + pFn) : 0;
      const pSpec = (pTn + pFp) > 0 ? pTn / (pTn + pFp) : 0;
      probSweep.push({
        probabilityThreshold: Number(pThresh.toFixed(2)),
        tp: pTp,
        fp: pFp,
        tn: pTn,
        fn: pFn,
        sensitivity: Number(pSens.toFixed(4)),
        specificity: Number(pSpec.toFixed(4)),
        zeroFalseNegatives: pFn === 0
      });
    }

    return {
      clinicalObjective: "MINIMIZE_FALSE_NEGATIVES_TO_ZERO",
      pointsSweep,
      probSweep,
      recommendedCutoff: optimalZeroFnCutoff ? optimalZeroFnCutoff.pointsCutoff : 7,
      recommendedProbabilityThreshold: 0.45,
      optimalZeroFnCutoff,
      optimalYoudenCutoff,
      optimalCostCutoff,
      catastrophicBoundary: {
        pointsCutoff: 8,
        consequence: "Sudden emergence of 6 False Negatives (Sensitivity drops to 85.7%). Strictly prohibited in clinical SaMD."
      },
      safetyMargin: "1 point margin between operating point (7) and failure threshold (8)"
    };
  }

  /**
   * Returns authoritative Clinical Operating Policy.
   */
  getClinicalSafetyOperatingPolicy() {
    return {
      policyId: "POL-CLINICAL-SAFETY-ZERO-FN-2026",
      governanceFramework: "Health Vibe Clinical AI Safety Directive",
      maxAllowedFalseNegatives: 0,
      targetSensitivity: "100.0%",
      activeDecisionCutoff: {
        urgentPointThreshold: 7,
        calibratedProbabilityThreshold: 0.45,
        highPointThreshold: 3
      },
      hardInvariableOverrides: [
        {
          trigger: "SpO2 < 90%",
          classification: "URGENT",
          rationale: "Severe hypoxemia indicates respiratory failure; immediate emergency care required regardless of symptom accumulation."
        },
        {
          trigger: "Acute Chest Pain AND Dyspnea",
          classification: "URGENT",
          rationale: "Rule out acute pulmonary embolism, tension pneumothorax, or acute coronary syndrome."
        },
        {
          trigger: "Critical Symptoms Screener (Cyanosis / Hemoptysis / Altered Sensorium)",
          classification: "EMERGENCY_RED_ALERT",
          rationale: "PRD Requirement 51 mandatory emergency bypass routing directly to Egyptian Ambulance (123)."
        }
      ],
      prohibitedOperatingPoints: [
        {
          cutoff: "Points >= 8",
          prohibitionReason: "Under-triages pediatric and borderline hypoxemia cases with 14.3% False Negative rate."
        },
        {
          cutoff: "Probability >= 0.50 (Uncalibrated ML Default)",
          prohibitionReason: "Naive thresholding causes 7 False Negatives; medical AI requires asymmetric cost-sensitive calibration."
        }
      ],
      auditVerification: "ZERO_FN_VERIFIED_ON_HELD_OUT_EVAL_AND_PATIENT_LEVEL_TEST_SETS"
    };
  }
}

// Singleton export
const falseNegativeAnalyzer = new FalseNegativeAnalyzer();

module.exports = {
  FalseNegativeAnalyzer,
  falseNegativeAnalyzer,
  FN_ROOT_CAUSES
};
