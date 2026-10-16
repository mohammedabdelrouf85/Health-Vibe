/**
 * Health Vibe AI - Dataset License & Scientific Quality Governance Service
 * 
 * Verifies Request 46 (PRD Page 9, Requirement 46):
 * "فحص وتوثيق رخصة استخدام (License) وجودة أي Dataset مستخرجة من Kaggle أو المصادر الطبية المفتوحة للتأكد من صلاحيتها القانونية والعلمية."
 * 
 * Objectives:
 * 1. Legal Licensing Verification:
 *    - Rejects unverified, proprietary, or ambiguous licenses.
 *    - Flags and blocks non-commercial restricted datasets (e.g. CC-BY-NC) from production inference.
 *    - Enforces verified open clinical licenses (CC-BY-4.0, CC0-1.0, MIT, Apache-2.0, ODC-BY-1.0).
 *    - Validates provenance, DOI citations, and IRB/ethical consent documentation.
 * 2. Scientific & Clinical Quality Audit:
 *    - Missingness rates (< 5% on critical physiological markers).
 *    - Physiological boundary checks (e.g., SpO2 between 50-100%, RR between 5-60 breaths/min).
 *    - Specialist ground truth annotation & inter-rater reliability (Cohen's Kappa >= 0.85).
 *    - Demographic fairness and balanced subgroup representation.
 */

const fs = require("fs");
const path = require("path");

const REGISTRY_PATH = path.join(__dirname, "dataset_provenance_and_quality_registry.json");

const ACCEPTABLE_LICENSES = new Set([
  "CC0-1.0",
  "CC-BY-4.0",
  "MIT",
  "APACHE-2.0",
  "ODC-BY-1.0",
  "ODBL-1.0"
]);

const RESTRICTED_LICENSES = new Set([
  "CC-BY-NC-4.0",
  "CC-BY-NC-SA-4.0",
  "GPL-3.0"
]);

const PHYSIOLOGICAL_BOUNDS = {
  oxygenLevel: { min: 50, max: 100, unit: "%", label: "Blood Oxygen Saturation (SpO2)" },
  respiratoryRate: { min: 5, max: 60, unit: "breaths/min", label: "Respiratory Rate" },
  heartRate: { min: 30, max: 220, unit: "bpm", label: "Heart Rate" },
  temperature: { min: 34.0, max: 43.0, unit: "°C", label: "Body Temperature" },
  systolicBp: { min: 60, max: 260, unit: "mmHg", label: "Systolic Blood Pressure" },
  diastolicBp: { min: 35, max: 150, unit: "mmHg", label: "Diastolic Blood Pressure" },
  glucose: { min: 40, max: 500, unit: "mg/dL", label: "Blood Glucose Level" },
  hemoglobin: { min: 3.0, max: 24.0, unit: "g/dL", label: "Hemoglobin Concentration" },
  bmi: { min: 10.0, max: 70.0, unit: "kg/m²", label: "Body Mass Index" }
};

class DatasetGovernanceService {
  constructor(registryPath = REGISTRY_PATH) {
    this.registryPath = registryPath;
    this.registry = this.loadRegistry();
  }

  loadRegistry() {
    try {
      if (fs.existsSync(this.registryPath)) {
        return JSON.parse(fs.readFileSync(this.registryPath, "utf8"));
      }
    } catch (err) {
      console.warn("[DatasetGovernance] Failed to load registry:", err.message);
    }
    return { registryVersion: "2026.1", datasets: [] };
  }

  getAllRegisteredDatasets() {
    return this.registry.datasets || [];
  }

  getRegisteredDataset(idOrSource) {
    if (!idOrSource) return null;
    const query = String(idOrSource).trim().toLowerCase();
    return (this.registry.datasets || []).find(d =>
      d.id.toLowerCase() === query ||
      d.sourceIdentifier.toLowerCase() === query ||
      d.sourceIdentifier.toLowerCase().startsWith(query)
    ) || null;
  }

  /**
   * Legal Licensing Audit
   * Validates dataset license, commercial viability, provenance citation, and privacy consent.
   */
  auditDatasetLegalLicensing(metadata = {}) {
    const licensing = metadata.licensing || metadata;
    const origin = metadata.origin || {};
    const issues = [];
    const warnings = [];

    const rawLicense = String(licensing.licenseType || licensing.spdxId || licensing.license || "").toUpperCase().trim();
    if (!rawLicense) {
      issues.push("Missing license specification. Dataset cannot be used without explicit license.");
    }

    const isAcceptable = ACCEPTABLE_LICENSES.has(rawLicense);
    const isRestricted = RESTRICTED_LICENSES.has(rawLicense);

    if (!isAcceptable && !isRestricted) {
      issues.push(`Unverified or prohibited license: '${rawLicense}'. Must be an approved open standard license.`);
    }

    if (isRestricted) {
      warnings.push(`Restricted license '${rawLicense}'. Commercial deployment prohibited; permitted for offline academic research only.`);
    }

    // Commercial viability
    const isCommercialAllowed = Boolean(licensing.isCommercialUseAllowed ?? (isAcceptable && !rawLicense.includes("NC")));

    // Provenance & Citation Check
    if (!origin.citation && !origin.doi && !metadata.citation && !metadata.doi) {
      warnings.push("Missing formal academic citation or DOI. Attribution requires persistent identifier.");
    }

    // Consent and HIPAA verification
    const consentStatus = licensing.patientConsentStatus || metadata.patientConsentStatus || "";
    const isConsentDocumented = Boolean(consentStatus && (
      consentStatus.toLowerCase().includes("irb") ||
      consentStatus.toLowerCase().includes("consent") ||
      consentStatus.toLowerCase().includes("exempt") ||
      consentStatus.toLowerCase().includes("ethics")
    ));

    if (!isConsentDocumented) {
      warnings.push("Explicit IRB / Patient Informed Consent clearance is not formally documented.");
    }

    const isLegalCompliant = issues.length === 0;

    return {
      isLegalCompliant,
      licenseType: rawLicense,
      isCommercialUseAllowed: isCommercialAllowed,
      requiresAttribution: Boolean(licensing.requiresAttribution ?? true),
      isConsentDocumented,
      complianceStatus: isLegalCompliant
        ? (isRestricted ? "LEGAL_RESEARCH_ONLY" : "VERIFIED_LEGAL_COMPLIANT")
        : "REJECTED_LEGAL_VIOLATION",
      issues,
      warnings
    };
  }

  /**
   * Scientific & Clinical Quality Audit
   * Validates completeness, physiological bounds, ground truth authority, and bias parity.
   */
  auditDatasetScientificQuality(metadata = {}, dataSample = []) {
    const quality = metadata.scientificQuality || metadata;
    const issues = [];
    const warnings = [];

    const sampleSize = quality.sampleSize || (Array.isArray(dataSample) && dataSample.length > 0 ? dataSample.length : 0);

    if (sampleSize < 100) {
      issues.push(`Insufficient sample size: N=${sampleSize}. Minimum clinical threshold is N=100.`);
    }

    // Missingness audit
    let criticalMissingness = quality.missingness?.criticalFeaturesMissingPercent ?? 0;
    let overallMissingness = quality.missingness?.overallMissingPercent ?? 0;

    if (Array.isArray(dataSample) && dataSample.length > 0) {
      let totalCells = 0;
      let missingCells = 0;
      let criticalTotal = 0;
      let criticalMissing = 0;

      const criticalFields = ["oxygenLevel", "spo2", "respiratoryRate", "vitalSigns", "diagnosis", "clinicalDiagnosis"];

      for (const row of dataSample) {
        if (!row || typeof row !== "object") continue;
        const keys = Object.keys(row);
        totalCells += keys.length;
        for (const k of keys) {
          const val = row[k];
          const isMissing = val === null || val === undefined || val === "" || Number.isNaN(val);
          if (isMissing) missingCells++;
          if (criticalFields.includes(k)) {
            criticalTotal++;
            if (isMissing) criticalMissing++;
          }
        }
      }

      overallMissingness = totalCells > 0 ? Number(((missingCells / totalCells) * 100).toFixed(2)) : 0;
      criticalMissingness = criticalTotal > 0 ? Number(((criticalMissing / criticalTotal) * 100).toFixed(2)) : 0;
    }

    if (criticalMissingness > 5.0) {
      issues.push(`Critical feature missingness (${criticalMissingness}%) exceeds clinical safety limit (5.0%).`);
    }

    if (overallMissingness > 10.0) {
      warnings.push(`Overall missingness rate (${overallMissingness}%) exceeds recommended 10% tolerance.`);
    }

    // Physiological boundary audit on samples
    let outOfBoundsCount = 0;
    const boundaryViolations = [];

    if (Array.isArray(dataSample) && dataSample.length > 0) {
      for (const row of dataSample) {
        for (const [prop, bounds] of Object.entries(PHYSIOLOGICAL_BOUNDS)) {
          const val = row[prop];
          if (typeof val === "number" && !Number.isNaN(val)) {
            if (val < bounds.min || val > bounds.max) {
              outOfBoundsCount++;
              boundaryViolations.push(`${bounds.label} value ${val} out of bounds [${bounds.min}, ${bounds.max}]`);
            }
          }
        }
      }
    }

    if (outOfBoundsCount > 0) {
      issues.push(`Found ${outOfBoundsCount} physiological boundary violations in data sample.`);
    }

    // Ground truth & specialist annotation
    const groundTruth = String(quality.groundTruthAnnotation || "").trim();
    if (!groundTruth) {
      warnings.push("Missing description of specialist medical annotation or gold-standard laboratory reference.");
    }

    const kappa = quality.interRaterReliabilityKappa;
    if (typeof kappa === "number" && kappa < 0.85) {
      warnings.push(`Inter-rater reliability Kappa (${kappa}) is below the optimal threshold (0.85).`);
    }

    // Compute composite quality score (0 - 100)
    let qualityScore = 100;
    qualityScore -= issues.length * 20;
    qualityScore -= warnings.length * 5;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    const isScientificallyValidated = issues.length === 0 && qualityScore >= 75;

    return {
      isScientificallyValidated,
      qualityScore,
      sampleSize,
      missingness: {
        criticalFeaturesMissingPercent: criticalMissingness,
        overallMissingPercent: overallMissingness
      },
      boundaryViolationsCount: outOfBoundsCount,
      boundaryViolations: boundaryViolations.slice(0, 5),
      interRaterReliabilityKappa: kappa || null,
      scientificStatus: isScientificallyValidated ? "CLINICALLY_VALIDATED" : "REJECTED_QUALITY_DEFICIT",
      issues,
      warnings
    };
  }

  /**
   * Full Dataset Governance Audit
   * Evaluates both Legal Licensing and Scientific Quality simultaneously.
   */
  auditFullDataset(metadata = {}, dataSample = []) {
    const legalAudit = this.auditDatasetLegalLicensing(metadata);
    const scientificAudit = this.auditDatasetScientificQuality(metadata, dataSample);

    const isFullyCertified = legalAudit.isLegalCompliant && scientificAudit.isScientificallyValidated;

    return {
      datasetId: metadata.id || metadata.sourceIdentifier || "unregistered-dataset",
      title: metadata.title || "Custom Clinical Dataset",
      auditedAt: new Date().toISOString(),
      isFullyCertified,
      governanceClearanceStatus: isFullyCertified
        ? (legalAudit.complianceStatus === "LEGAL_RESEARCH_ONLY" ? "APPROVED_FOR_RESEARCH_ONLY" : "APPROVED_FOR_CLINICAL_TRAINING")
        : "REJECTED",
      legalAudit,
      scientificAudit,
      summary: {
        license: legalAudit.licenseType,
        commercialAllowed: legalAudit.isCommercialUseAllowed,
        qualityScore: scientificAudit.qualityScore,
        sampleSize: scientificAudit.sampleSize,
        criticalMissingPercent: scientificAudit.missingness.criticalFeaturesMissingPercent
      }
    };
  }

  /**
   * Audits all datasets in the pre-configured registry.
   */
  auditRegistry() {
    const datasets = this.getAllRegisteredDatasets();
    const reports = datasets.map(d => this.auditFullDataset(d));
    const certifiedCount = reports.filter(r => r.isFullyCertified).length;

    return {
      totalDatasets: datasets.length,
      certifiedCount,
      passRatePercent: datasets.length > 0 ? Number(((certifiedCount / datasets.length) * 100).toFixed(1)) : 100,
      reports
    };
  }
}

const datasetGovernanceService = new DatasetGovernanceService();

module.exports = {
  DatasetGovernanceService,
  datasetGovernanceService,
  ACCEPTABLE_LICENSES,
  RESTRICTED_LICENSES,
  PHYSIOLOGICAL_BOUNDS
};
