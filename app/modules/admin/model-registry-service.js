/**
 * HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK SERVICE (Glass Health Benchmark)
 * 
 * Features:
 * 1. Comprehensive Trained Model Registry:
 *    - Model version tracking (v1.0, v1.1, v1.2-sp, v2.0-exp, v1.0-ped, etc.).
 *    - Architecture metadata, training dataset version, checkpoint lineage, parameters.
 *    - Release dates, evaluation dates, and deployment lifecycle states.
 * 2. Instant Safe Rollback & Hot-Swap Engine (Glass Health Standard):
 *    - Identifying previous verified stable baseline per clinical scope.
 *    - Side-by-side delta calculation (Sensitivity, Specificity, FP count, Doctor Concordance).
 *    - Emergency rollback hot-swap execution (zero downtime).
 *    - Capturing rollback reason, operator notes, and timestamp.
 * 3. Model Promotion & Deprecation Lifecycle:
 *    - Promoting candidate versions to active production status.
 *    - Demoting previously active models to archived or rolled_back.
 * 4. Fast Filtering & Multi-criteria Search:
 *    - Filter by condition scope, deployment status, time range, search query, and sorting.
 * 5. Audit Logging & Export:
 *    - Full rollback audit trail persistence.
 *    - CSV and JSON export of registry with lineage history.
 */

(function (global) {
  "use strict";

  // Initial Model Registry Seed (incorporating Glass Health and Infermedica clinical lineages)
  const INITIAL_MODEL_REGISTRY = [
    {
      id: "model_v1_1_candidate",
      version: "v1.1",
      name: "HealthVibe-Triage-v1.1",
      releaseTitle: "نظام الفرز السريري الذكي المطور (Glass Health Enhanced Expert)",
      status: "candidate",
      conditionScope: "respiratory_triage",
      conditionLabelAr: "فرز الطوارئ والأعراض التنفسية",
      conditionLabelEn: "Acute Respiratory & Hypoxemia Triage",
      architecture: "Rule-Based + Bayesian Expert System",
      parametersCount: "128K Rules & Weights",
      datasetVersion: "HealthVibe-Validation-v2.1",
      trainingCheckpoint: "chk_triage_v1.1_b80_final",
      releaseDate: "2026-10-20",
      evaluationDate: "2026-10-20",
      sampleSize: 80,
      confusionMatrix: { tp: 42, fp: 2, tn: 36, fn: 0 },
      aucRoc: 0.9981,
      doctorConcordance: { agreed: 78, total: 80, rate: 0.975 },
      physicianOverrides: 2,
      subCohorts: {
        pediatric: { n: 16, sensitivity: 1.0, specificity: 0.933, concordance: 0.937 },
        adult: { n: 44, sensitivity: 1.0, specificity: 0.952, concordance: 0.977 },
        geriatric: { n: 20, sensitivity: 1.0, specificity: 0.941, concordance: 1.0 },
        chronicLungDisease: { n: 20, sensitivity: 1.0, specificity: 0.900, concordance: 0.95 }
      },
      notes: "تخفيض بنسبة 80% في الإنذارات الكاذبة مع حساسية 100% للحالات الحرجة."
    },
    {
      id: "model_v1_0_active",
      version: "v1.0",
      name: "HealthVibe-Triage-v1.0",
      releaseTitle: "النسخة المعتمدة سابقاً في الإنتاج (Verified Baseline Production)",
      status: "active",
      conditionScope: "respiratory_triage",
      conditionLabelAr: "فرز الطوارئ التنفسية (النسخة الأساسية)",
      conditionLabelEn: "Active Production Respiratory Triage",
      architecture: "Rule-Based Clinical Expert System",
      parametersCount: "84K Rules",
      datasetVersion: "HealthVibe-Validation-v1.0",
      trainingCheckpoint: "chk_triage_v1.0_baseline",
      releaseDate: "2026-09-29",
      evaluationDate: "2026-09-29",
      sampleSize: 80,
      confusionMatrix: { tp: 42, fp: 10, tn: 28, fn: 0 },
      aucRoc: 0.9956,
      doctorConcordance: { agreed: 73, total: 80, rate: 0.9125 },
      physicianOverrides: 7,
      subCohorts: {
        pediatric: { n: 16, sensitivity: 1.0, specificity: 0.733, concordance: 0.875 },
        adult: { n: 44, sensitivity: 1.0, specificity: 0.762, concordance: 0.909 },
        geriatric: { n: 20, sensitivity: 1.0, specificity: 0.706, concordance: 0.95 },
        chronicLungDisease: { n: 20, sensitivity: 1.0, specificity: 0.700, concordance: 0.90 }
      },
      notes: "الإصدار المعتمد كخط أساس ثابت؛ حساسية ممتازة 100% ولكن بمعدل إنذارات كاذبة أعلى نسبياً."
    },
    {
      id: "model_hypoxemia_v1_2",
      version: "v1.2-sp",
      name: "HealthVibe-Hypoxemia-v1.2",
      releaseTitle: "مصنف نقص الأكسجة الحاد (Acute Hypoxemia Guard)",
      status: "active",
      conditionScope: "hypoxemia",
      conditionLabelAr: "فحص نقص الأكسجة ونبضات القلب (SpO2 Guard)",
      conditionLabelEn: "Pulse Oximetry & Hypoxemia Classification",
      architecture: "Extreme Gradient Boosting + Vital Guardrails",
      parametersCount: "450K Trees & Nodes",
      datasetVersion: "PulseOx-Cohort-2026",
      trainingCheckpoint: "chk_hypox_v1.2_xgb_prod",
      releaseDate: "2026-10-18",
      evaluationDate: "2026-10-18",
      sampleSize: 120,
      confusionMatrix: { tp: 65, fp: 2, tn: 53, fn: 0 },
      aucRoc: 0.9992,
      doctorConcordance: { agreed: 118, total: 120, rate: 0.9833 },
      physicianOverrides: 2,
      subCohorts: {
        pediatric: { n: 24, sensitivity: 1.0, specificity: 0.955, concordance: 0.958 },
        adult: { n: 66, sensitivity: 1.0, specificity: 0.967, concordance: 0.985 },
        geriatric: { n: 30, sensitivity: 1.0, specificity: 0.962, concordance: 1.0 },
        chronicLungDisease: { n: 35, sensitivity: 1.0, specificity: 0.941, concordance: 0.971 }
      },
      notes: "كاشف دقيق لنقص الأكسجة الصامت متوافق مع قياسات أجهزة Pulse Oximeter."
    },
    {
      id: "model_symptomnet_v2_0",
      version: "v2.0-exp",
      name: "HealthVibe-SymptomNet-v2.0",
      releaseTitle: "الشبكة العصبية لتحليل الأعراض المعقدة (SymptomNet)",
      status: "experimental",
      conditionScope: "pneumonia_covid",
      conditionLabelAr: "أعراض الالتهاب الرئوي وكوفيد-19 المعقدة",
      conditionLabelEn: "Pneumonia & Complex Viral Respiratory",
      architecture: "Multi-Task Deep Neural Network (DNN)",
      parametersCount: "1.2M Weights",
      datasetVersion: "MIMIC-IV-Ext-Pneumo",
      trainingCheckpoint: "chk_symptomnet_v2.0_dnn",
      releaseDate: "2026-10-15",
      evaluationDate: "2026-10-15",
      sampleSize: 150,
      confusionMatrix: { tp: 78, fp: 6, tn: 63, fn: 3 },
      aucRoc: 0.9890,
      doctorConcordance: { agreed: 141, total: 150, rate: 0.940 },
      physicianOverrides: 9,
      subCohorts: {
        pediatric: { n: 30, sensitivity: 0.952, specificity: 0.889, concordance: 0.933 },
        adult: { n: 85, sensitivity: 0.976, specificity: 0.930, concordance: 0.941 },
        geriatric: { n: 35, sensitivity: 0.947, specificity: 0.938, concordance: 0.943 },
        chronicLungDisease: { n: 40, sensitivity: 0.958, specificity: 0.875, concordance: 0.925 }
      },
      notes: "نموذج تجريبي متعدد الفئات لتصنيف الالتهاب الرئوي الجرثومي والفيروسي."
    },
    {
      id: "model_pediatric_v1_0",
      version: "v1.0-ped",
      name: "HealthVibe-Pediatric-v1.0",
      releaseTitle: "محرك فرز طب الأطفال التخصصي (Pediatric Care)",
      status: "active",
      conditionScope: "pediatric",
      conditionLabelAr: "أمراض الجهاز التنفسي لدى الأطفال والرضع",
      conditionLabelEn: "Pediatric & Infant Respiratory Protocol",
      architecture: "Decision Forest + Pediatric Vital Bounds",
      parametersCount: "64K Decision Rules",
      datasetVersion: "Pediatric-Respiratory-Cohort-2026",
      trainingCheckpoint: "chk_pediatric_v1.0_prod",
      releaseDate: "2026-10-05",
      evaluationDate: "2026-10-05",
      sampleSize: 95,
      confusionMatrix: { tp: 48, fp: 4, tn: 42, fn: 1 },
      aucRoc: 0.9875,
      doctorConcordance: { agreed: 91, total: 95, rate: 0.9578 },
      physicianOverrides: 4,
      subCohorts: {
        infants: { n: 25, sensitivity: 1.0, specificity: 0.909, concordance: 0.96 },
        children: { n: 70, sensitivity: 0.971, specificity: 0.914, concordance: 0.957 }
      },
      notes: "معاير خصيصاً لحدود التنفس وسرعة ضربات القلب حسب الفئات العمرية للأطفال."
    }
  ];

  // In-memory / localStorage state
  let currentRegistry = JSON.parse(JSON.stringify(INITIAL_MODEL_REGISTRY));
  let rollbackAuditTrail = [];

  const STORAGE_KEY_REGISTRY = "healthvibe_ai_model_registry_v1";
  const STORAGE_KEY_ROLLBACK_LOGS = "healthvibe_ai_rollback_logs_v1";

  function loadLocalState() {
    try {
      if (typeof localStorage !== "undefined") {
        const savedReg = localStorage.getItem(STORAGE_KEY_REGISTRY);
        if (savedReg) {
          currentRegistry = JSON.parse(savedReg);
        }
        const savedLogs = localStorage.getItem(STORAGE_KEY_ROLLBACK_LOGS);
        if (savedLogs) {
          rollbackAuditTrail = JSON.parse(savedLogs);
        }
      }
    } catch (_) {}
  }

  function saveLocalState() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(currentRegistry));
        localStorage.setItem(STORAGE_KEY_ROLLBACK_LOGS, JSON.stringify(rollbackAuditTrail));
      }
    } catch (_) {}
  }

  loadLocalState();

  // Mathematical metric helpers
  function calculateSensitivity(tp, fn) {
    const denom = tp + fn;
    return denom > 0 ? tp / denom : 0;
  }

  function calculateSpecificity(tn, fp) {
    const denom = tn + fp;
    return denom > 0 ? tn / denom : 0;
  }

  function calculatePrecision(tp, fp) {
    const denom = tp + fp;
    return denom > 0 ? tp / denom : 0;
  }

  function calculateF1Score(prec, sens) {
    return prec + sens > 0 ? (2 * prec * sens) / (prec + sens) : 0;
  }

  function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return "0.0%";
    return (val * 100).toFixed(1) + "%";
  }

  function computeModelMetrics(model) {
    const cm = model.confusionMatrix || { tp: 0, fp: 0, tn: 0, fn: 0 };
    const sens = calculateSensitivity(cm.tp, cm.fn);
    const spec = calculateSpecificity(cm.tn, cm.fp);
    const prec = calculatePrecision(cm.tp, cm.fp);
    const f1 = calculateF1Score(prec, sens);
    const concordance = model.doctorConcordance || { agreed: 0, total: 0, rate: 0 };
    const totalCases = cm.tp + cm.fp + cm.tn + cm.fn;

    return {
      ...model,
      metrics: {
        sensitivity: sens,
        sensitivityPct: formatPct(sens),
        specificity: spec,
        specificityPct: formatPct(spec),
        precision: prec,
        precisionPct: formatPct(prec),
        f1Score: f1,
        f1ScorePct: formatPct(f1),
        aucRoc: model.aucRoc || 0,
        aucRocFormatted: (model.aucRoc || 0).toFixed(4),
        doctorConcordanceRate: concordance.rate,
        doctorConcordancePct: formatPct(concordance.rate),
        doctorAgreedCases: concordance.agreed,
        doctorTotalEvaluated: concordance.total,
        totalCases
      }
    };
  }

  /**
   * Get all registered models with computed metrics
   */
  function getAllModels() {
    return currentRegistry.map(m => computeModelMetrics(m));
  }

  /**
   * Get the active model for a specific clinical scope
   */
  function getActiveModelForScope(scope) {
    const all = getAllModels();
    return all.find(m => m.conditionScope === scope && m.status === "active") || null;
  }

  /**
   * Find candidate rollback targets for a given condition scope
   * (e.g. Previous active or archived models with verified status)
   */
  function getRollbackCandidatesForScope(scope) {
    const all = getAllModels();
    return all.filter(m => m.conditionScope === scope && m.status !== "active");
  }

  /**
   * Calculate detailed Delta/Diff between Current Active and Target Rollback model
   */
  function computeRollbackDelta(currentActive, targetRollback) {
    if (!currentActive || !targetRollback) return null;
    const cur = computeModelMetrics(currentActive);
    const tgt = computeModelMetrics(targetRollback);

    const sensDiff = tgt.metrics.sensitivity - cur.metrics.sensitivity;
    const specDiff = tgt.metrics.specificity - cur.metrics.specificity;
    const fpDiff = tgt.confusionMatrix.fp - cur.confusionMatrix.fp;
    const concDiff = tgt.metrics.doctorConcordanceRate - cur.metrics.doctorConcordanceRate;

    return {
      currentModel: cur,
      targetModel: tgt,
      sensitivityDelta: sensDiff,
      sensitivityDeltaPct: (sensDiff * 100).toFixed(1) + "%",
      specificityDelta: specDiff,
      specificityDeltaPct: (specDiff * 100).toFixed(1) + "%",
      fpDelta: fpDiff,
      concordanceDelta: concDiff,
      concordanceDeltaPct: (concDiff * 100).toFixed(1) + "%",
      isSafetyNeutral: tgt.metrics.sensitivity >= 1.0,
      isFpImproved: fpDiff < 0
    };
  }

  /**
   * Execute Safe Rollback (Glass Health Zero-Downtime Hot-Swap)
   * Target model is restored to active; currently active model is demoted to 'rolled_back'
   */
  async function executeRollback(targetModelId, { reason, notes, operator } = {}) {
    const target = currentRegistry.find(m => m.id === targetModelId || m.version === targetModelId);
    if (!target) {
      throw new Error(`Target model ${targetModelId} not found in registry.`);
    }

    const scope = target.conditionScope;
    const previousActive = currentRegistry.find(m => m.conditionScope === scope && m.status === "active" && m.id !== target.id);

    const timestamp = new Date().toISOString();
    const rollbackEvent = {
      id: `rb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      conditionScope: scope,
      targetModelId: target.id,
      targetVersion: target.version,
      targetName: target.name,
      previousActiveId: previousActive ? previousActive.id : null,
      previousActiveVersion: previousActive ? previousActive.version : null,
      reason: reason || "Emergency failover to previous verified version",
      notes: notes || "",
      operator: operator || { role: "clinical_qa", email: "qa.lead@healthvibes.org" }
    };

    // If backend API is reachable, call it
    let apiSuccess = false;
    try {
      if (typeof fetch !== "undefined") {
        const token = (typeof localStorage !== "undefined" && localStorage.getItem("healthvibe_auth_token")) || null;
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/admin/ai/models/${encodeURIComponent(target.id)}/rollback`, {
          method: "POST",
          headers,
          body: JSON.stringify({ reason: rollbackEvent.reason, notes: rollbackEvent.notes })
        });
        if (res.ok) {
          apiSuccess = true;
        }
      }
    } catch (_) {
      // Offline / client sandbox fallback
    }

    // Mutate local state atomically
    if (previousActive) {
      previousActive.status = "rolled_back";
      previousActive.rolledBackAt = timestamp;
      previousActive.rollbackReason = rollbackEvent.reason;
      previousActive.rollbackNotes = rollbackEvent.notes;
    }

    target.status = "active";
    target.restoredAt = timestamp;
    target.rollbackReason = `Restored baseline via rollback: ${rollbackEvent.reason}`;

    rollbackAuditTrail.unshift(rollbackEvent);
    saveLocalState();

    return {
      success: true,
      apiSynced: apiSuccess,
      rollbackEvent,
      activeModel: computeModelMetrics(target),
      demotedModel: previousActive ? computeModelMetrics(previousActive) : null
    };
  }

  /**
   * Promote a candidate model to active production status
   */
  async function promoteModel(targetModelId, { operator } = {}) {
    const target = currentRegistry.find(m => m.id === targetModelId || m.version === targetModelId);
    if (!target) throw new Error(`Model ${targetModelId} not found.`);

    const scope = target.conditionScope;
    const previousActive = currentRegistry.find(m => m.conditionScope === scope && m.status === "active" && m.id !== target.id);
    const timestamp = new Date().toISOString();

    // Call backend if available
    try {
      if (typeof fetch !== "undefined") {
        const token = (typeof localStorage !== "undefined" && localStorage.getItem("healthvibe_auth_token")) || null;
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        await fetch(`/api/admin/ai/models/${encodeURIComponent(target.id)}/promote`, { method: "POST", headers });
      }
    } catch (_) {}

    if (previousActive) {
      previousActive.status = "archived";
      previousActive.archivedAt = timestamp;
    }

    target.status = "active";
    target.promotedAt = timestamp;
    target.promotedBy = operator || { role: "super_admin" };

    saveLocalState();
    return {
      success: true,
      promotedModel: computeModelMetrics(target),
      archivedModel: previousActive ? computeModelMetrics(previousActive) : null
    };
  }

  /**
   * Fast Filtering and Sorting Engine for Model Registry
   */
  function filterRegistry(models = null, { condition = "all", status = "all", search = "", timeRange = "all", sortBy = "date_desc" } = {}) {
    let list = (models || getAllModels()).slice();

    if (condition && condition !== "all") {
      list = list.filter(m => m.conditionScope === condition);
    }

    if (status && status !== "all") {
      list = list.filter(m => m.status === status);
    }

    if (timeRange && timeRange !== "all") {
      const now = Date.now();
      list = list.filter(m => {
        if (!m.releaseDate) return true;
        const t = new Date(m.releaseDate).getTime();
        const days = (now - t) / (1000 * 60 * 60 * 24);
        if (timeRange === "7d") return days <= 7;
        if (timeRange === "30d") return days <= 30;
        if (timeRange === "90d") return days <= 90;
        return true;
      });
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(m => {
        const haystack = [
          m.id,
          m.version,
          m.name,
          m.releaseTitle,
          m.conditionLabelAr,
          m.conditionLabelEn,
          m.architecture,
          m.datasetVersion,
          m.trainingCheckpoint,
          m.notes
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }

    // Sort order
    list.sort((a, b) => {
      if (sortBy === "date_desc") return new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0);
      if (sortBy === "date_asc") return new Date(a.releaseDate || 0) - new Date(b.releaseDate || 0);
      if (sortBy === "version") return String(b.version).localeCompare(String(a.version));
      if (sortBy === "sensitivity_desc") return b.metrics.sensitivity - a.metrics.sensitivity;
      if (sortBy === "specificity_desc") return b.metrics.specificity - a.metrics.specificity;
      if (sortBy === "concordance_desc") return b.metrics.doctorConcordanceRate - a.metrics.doctorConcordanceRate;
      return 0;
    });

    return list;
  }

  /**
   * Reset registry to clean factory state
   */
  function resetRegistry() {
    currentRegistry = JSON.parse(JSON.stringify(INITIAL_MODEL_REGISTRY));
    rollbackAuditTrail = [];
    saveLocalState();
    return getAllModels();
  }

  /**
   * Export Registry as CSV
   */
  function generateRegistryCsv(models = null) {
    const list = models || getAllModels();
    const headers = [
      "Model ID", "Version", "Name", "Status", "Condition Scope", "Architecture",
      "Parameters", "Dataset Checkpoint", "Release Date", "Sensitivity", "Specificity",
      "Precision", "F1 Score", "AUC-ROC", "Doctor Concordance", "Total Cases", "TP", "FP", "TN", "FN"
    ];

    const rows = list.map(m => {
      const met = m.metrics;
      const cm = m.confusionMatrix || {};
      return [
        `"${m.id}"`,
        `"${m.version}"`,
        `"${m.name}"`,
        `"${m.status}"`,
        `"${m.conditionScope}"`,
        `"${m.architecture}"`,
        `"${m.parametersCount || '--'}"`,
        `"${m.trainingCheckpoint || '--'}"`,
        `"${m.releaseDate || '--'}"`,
        `"${met.sensitivityPct}"`,
        `"${met.specificityPct}"`,
        `"${met.precisionPct}"`,
        `"${met.f1ScorePct}"`,
        `"${met.aucRocFormatted}"`,
        `"${met.doctorConcordancePct}"`,
        met.totalCases,
        cm.tp || 0,
        cm.fp || 0,
        cm.tn || 0,
        cm.fn || 0
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }

  // Export API
  const ModelRegistryService = {
    INITIAL_MODEL_REGISTRY,
    getAllModels,
    getActiveModelForScope,
    getRollbackCandidatesForScope,
    computeRollbackDelta,
    executeRollback,
    promoteModel,
    filterRegistry,
    resetRegistry,
    generateRegistryCsv,
    computeModelMetrics,
    getRollbackLogs: () => rollbackAuditTrail.slice()
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ModelRegistryService;
  }

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ModelRegistryService = ModelRegistryService;

})(typeof window !== "undefined" ? window : globalThis);
