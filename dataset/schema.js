/**
 * Health Vibe AI - Dataset & Model Evaluation Specification Schema
 * 
 * Defines formal versions, inputs, outputs, acceptance criteria,
 * and clinical governance boundaries.
 */

(function (global) {
  "use strict";

  const SPECIFICATION = Object.freeze({
    versions: Object.freeze({
      datasetVersion: "HealthVibe-Dataset-v1.0.0",
      activeRulesVersion: "HealthVibe-Rules-v1.0",
      candidateRulesVersion: "HealthVibe-Rules-v1.1",
      evaluationProtocolVersion: "HealthVibe-Eval-v1.0.0",
      governanceFrameworkVersion: "HealthVibe-Governance-2026.1"
    }),

    /**
     * Formal Input Specifications
     */
    inputs: Object.freeze({
      demographics: Object.freeze({
        subjectId: { type: "string", format: "^HV-(DEV|EVAL)-[A-Z0-9]{3,}$", required: true, description: "De-identified pseudonymous subject token" },
        ageGroup: { type: "enum", values: ["pediatric", "young_adult", "middle_aged", "geriatric"], required: true },
        age: { type: "number", min: 0, max: 120, required: false, description: "Age in whole years without birth date" },
        sex: { type: "enum", values: ["male", "female", "unspecified"], required: true }
      }),
      vitals: Object.freeze({
        oxygenLevel: { type: "number", min: 50, max: 100, unit: "%", required: true, description: "SpO2 pulse oximetry reading" },
        respiratoryRate: { type: "number", min: 5, max: 60, unit: "breaths/min", required: false },
        temperature: { type: "number", min: 34.0, max: 43.0, unit: "°C", required: false },
        heartRate: { type: "number", min: 30, max: 220, unit: "bpm", required: false }
      }),
      symptoms: Object.freeze({
        breathingDifficulty: { type: "boolean", required: true, description: "Presence of acute shortness of breath / dyspnea" },
        coughLevel: { type: "enum", values: ["none", "mild", "moderate", "severe"], required: true },
        symptomDurationDays: { type: "number", min: 1, max: 365, required: true },
        chestPain: { type: "boolean", required: true },
        symptomProgression: { type: "enum", values: ["improving", "stable", "worsening", "unknown"], required: false }
      }),
      comorbidities: Object.freeze({
        asthma: { type: "boolean", default: false },
        copd: { type: "boolean", default: false },
        smoking: { type: "boolean", default: false },
        pregnancy: { type: "boolean", default: false },
        cardiovascular: { type: "boolean", default: false },
        diabetes: { type: "boolean", default: false }
      })
    }),

    /**
     * Formal Output Specifications
     */
    outputs: Object.freeze({
      predictedTriage: {
        type: "enum",
        values: ["urgent", "high", "normal"],
        description: "Advisory clinical routing category (urgent = Emergency/Urgent escalation, high = High-priority doctor review, normal = Routine outpatient)"
      },
      predictedCritical: {
        type: "binary",
        values: [0, 1],
        description: "Binary escalation indicator: 1 = Urgent/Emergency escalation required, 0 = Non-urgent / routine care"
      },
      ruleScorePoints: {
        type: "integer",
        min: 0,
        max: 20,
        description: "Deterministic clinical points accumulated based on SpO2, symptoms, and risk rules"
      },
      calibratedRiskScore: {
        type: "float",
        min: 0.0,
        max: 1.0,
        description: "Empirically calibrated risk probability estimate P(critical | inputs) supported by evaluation"
      },
      triggeredRules: {
        type: "array",
        items: "string",
        description: "Transparent, explainable list of rule IDs activated by the patient inputs"
      }
    }),

    /**
     * Clinical Acceptance Criteria (Pre-specified Evaluation Benchmarks)
     * All criteria must be satisfied on the held-out evaluation dataset.
     */
    acceptanceCriteria: Object.freeze({
      criticalTriageSensitivity: {
        target: ">= 0.950",
        threshold: 0.950,
        metric: "Sensitivity (Recall)",
        clinicalRationale: "Safety-critical bound: Minimizes false negatives to avoid under-triaging patients with severe hypoxemia or decompensation."
      },
      criticalTriageSpecificity: {
        target: ">= 0.800",
        threshold: 0.800,
        metric: "Specificity",
        clinicalRationale: "Operational bound: Avoids excessive false positives that could overwhelm emergency departments and urgent care lines."
      },
      negativePredictiveValue: {
        target: ">= 0.950",
        threshold: 0.950,
        metric: "NPV",
        clinicalRationale: "High clinical reassurance: A non-urgent triage classification must be reliably low risk."
      },
      discriminationRocAuc: {
        target: ">= 0.880",
        threshold: 0.880,
        metric: "ROC-AUC",
        clinicalRationale: "Demonstrates strong discriminative power across variable decision thresholds."
      },
      calibrationBrierScore: {
        target: "<= 0.150",
        threshold: 0.150,
        metric: "Brier Score",
        clinicalRationale: "Ensures probability estimates are well-calibrated and reflect true event frequencies."
      },
      calibrationEce: {
        target: "<= 0.100",
        threshold: 0.100,
        metric: "Expected Calibration Error (ECE)",
        clinicalRationale: "Prevents overconfident probability claims in risk estimation."
      },
      subgroupParityMinSensitivity: {
        target: ">= 0.900",
        threshold: 0.900,
        metric: "Subgroup Minimum Sensitivity",
        clinicalRationale: "Equity and safety: Sensitivity must not collapse below 90% in vulnerable cohorts (geriatric, pediatric, smokers, asthma)."
      }
    }),

    /**
     * Governance & Unsupported Claims Ban
     */
    claimsPolicy: Object.freeze({
      prohibitedPhrases: [
        "99% accuracy",
        "100% accurate",
        "diagnostic AI",
        "diagnoses respiratory illness",
        "validated clinical diagnosis",
        "replaces doctor consultation"
      ],
      allowedStatement: "Health Vibe AI provides deterministic decision-support triage routing. All performance figures (sensitivity, specificity, ROC-AUC) are documented on a held-out clinical evaluation dataset reviewed by board-certified specialists."
    })
  });

  global.HealthVibesDatasetSchema = SPECIFICATION;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SPECIFICATION;
  }
})(typeof window !== "undefined" ? window : globalThis);
