/**
 * Health Vibe AI - AI Model Monitoring Service (Infermedica Benchmark)
 * 
 * Computes, manages, and tracks clinical AI diagnostic and triage metrics:
 * - Sensitivity (Recall)
 * - Specificity
 * - Precision (PPV)
 * - F1-Score
 * - AUC-ROC (Area Under the ROC Curve)
 * - Doctor Concordance Rate (Physician Agreement Rate)
 * - Confusion Matrix (TP, FP, TN, FN)
 * - Wilson 95% Confidence Intervals
 * - Sub-cohort Demographic Fairness Breakdown
 */

(function (global) {
  "use strict";

  // Statistical calculations with safety bounds
  function calculateSensitivity(tp, fn) {
    const denom = tp + fn;
    if (denom <= 0) return 0;
    return tp / denom;
  }

  function calculateSpecificity(tn, fp) {
    const denom = tn + fp;
    if (denom <= 0) return 0;
    return tn / denom;
  }

  function calculatePrecision(tp, fp) {
    const denom = tp + fp;
    if (denom <= 0) return 0;
    return tp / denom;
  }

  function calculateF1Score(precision, recall) {
    if (precision + recall <= 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  function calculateWilsonCI(val, n, z = 1.96) {
    if (!n || n <= 0) return { lower: 0, upper: 0 };
    const p = Math.max(0, Math.min(1, val));
    const denom = 1 + (z * z) / n;
    const center = p + (z * z) / (2 * n);
    const rad = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return {
      lower: Math.max(0, Number(((center - rad) / denom).toFixed(4))),
      upper: Math.min(1, Number(((center + rad) / denom).toFixed(4)))
    };
  }

  function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return "0.0%";
    return (val * 100).toFixed(1) + "%";
  }

  // Clinical AI Models Registry (Infermedica Benchmark Ground-truth)
  const CLINICAL_AI_MODELS = [
    {
      id: "model_v1_1_candidate",
      version: "v1.1",
      name: "HealthVibe-Triage-v1.1",
      releaseTitle: "تحديث شجرة الفرز السريري (خوارزمية v1.1 المرشحة)",
      status: "candidate", // 'active' | 'candidate' | 'experimental' | 'archived'
      conditionScope: "respiratory_triage",
      conditionLabelAr: "فرز الطوارئ والأعراض التنفسية",
      conditionLabelEn: "Acute Respiratory & Hypoxemia Triage",
      architecture: "Rule-Based + Bayesian Expert System",
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
      notes: "تخفيض بنسبة 80% في الإنذارات الكاذبة (False Positives) مع الحفاظ على حساسية 100% للحالات الحرجة."
    },
    {
      id: "model_v1_0_active",
      version: "v1.0",
      name: "HealthVibe-Triage-v1.0",
      releaseTitle: "نظام الفرز السريري المعتمد في الإنتاج (Production Active)",
      status: "active",
      conditionScope: "respiratory_triage",
      conditionLabelAr: "فرز الطوارئ التنفسية (النسخة النشطة)",
      conditionLabelEn: "Active Production Respiratory Triage",
      architecture: "Rule-Based Expert System",
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
      notes: "الإصدار المعتمد حالياً في المنظومة الطبية؛ حساسية ممتازة 100% ولكن بمعدل إنذارات كاذبة مرتفع نسبياً."
    },
    {
      id: "model_hypoxemia_v1_2",
      version: "v1.2-sp",
      name: "HealthVibe-Hypoxemia-v1.2",
      releaseTitle: "مصنف نقص الأكسجة الحاد (Acute Hypoxemia Guard)",
      status: "candidate",
      conditionScope: "hypoxemia",
      conditionLabelAr: "فحص نقص الأكسجة ونبضات القلب (SpO2 Guard)",
      conditionLabelEn: "Pulse Oximetry & Hypoxemia Classification",
      architecture: "Extreme Gradient Boosting + Vital Guardrails",
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
      notes: "كاشف دقيق لنقص الأكسجة الصامت مع تدقيق التوافق مع قراءات Pulse Oximeter."
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

  /**
   * Computes derived statistical metrics for a single model record
   */
  function computeModelMetrics(model) {
    const cm = model.confusionMatrix || { tp: 0, fp: 0, tn: 0, fn: 0 };
    const sens = calculateSensitivity(cm.tp, cm.fn);
    const spec = calculateSpecificity(cm.tn, cm.fp);
    const prec = calculatePrecision(cm.tp, cm.fp);
    const f1 = calculateF1Score(prec, sens);
    const total = cm.tp + cm.fp + cm.tn + cm.fn;

    const sensCI = calculateWilsonCI(sens, cm.tp + cm.fn);
    const specCI = calculateWilsonCI(spec, cm.tn + cm.fp);
    const precCI = calculateWilsonCI(prec, cm.tp + cm.fp);

    const docConc = model.doctorConcordance || {};
    const concordanceRate = docConc.rate !== undefined
      ? docConc.rate
      : (docConc.total > 0 ? docConc.agreed / docConc.total : 0);

    return {
      ...model,
      metrics: {
        sensitivity: sens,
        sensitivityPct: formatPct(sens),
        sensitivityCI: sensCI,

        specificity: spec,
        specificityPct: formatPct(spec),
        specificityCI: specCI,

        precision: prec,
        precisionPct: formatPct(prec),
        precisionCI: precCI,

        f1Score: f1,
        f1ScorePct: formatPct(f1),

        aucRoc: model.aucRoc || 0,
        aucRocFormatted: (model.aucRoc || 0).toFixed(4),

        doctorConcordanceRate: concordanceRate,
        doctorConcordancePct: formatPct(concordanceRate),
        doctorAgreedCases: docConc.agreed || 0,
        doctorTotalEvaluated: docConc.total || total,

        totalCases: total,
        actualPositives: cm.tp + cm.fn,
        actualNegatives: cm.tn + cm.fp,
        predictedPositives: cm.tp + cm.fp,
        predictedNegatives: cm.tn + cm.fn
      }
    };
  }

  /**
   * Filter and search models based on admin toolbar criteria
   */
  function filterModels(models = CLINICAL_AI_MODELS, filters = {}) {
    const versionFilter = (filters.version || "all").trim();
    const conditionFilter = (filters.condition || "all").trim();
    const statusFilter = (filters.status || "all").trim();
    const timeRange = (filters.timeRange || "all").trim();
    const search = (filters.search || "").trim().toLowerCase();

    return models
      .filter(m => {
        // Version filter
        if (versionFilter !== "all" && m.id !== versionFilter && m.version !== versionFilter) {
          return false;
        }

        // Condition filter
        if (conditionFilter !== "all" && m.conditionScope !== conditionFilter) {
          return false;
        }

        // Status filter
        if (statusFilter !== "all" && m.status !== statusFilter) {
          return false;
        }

        // Time range filter (relative to evaluationDate)
        if (timeRange !== "all" && m.evaluationDate) {
          const evalDate = new Date(m.evaluationDate).getTime();
          const now = Date.now();
          const daysAgo = (now - evalDate) / (1000 * 60 * 60 * 24);
          if (timeRange === "7d" && daysAgo > 7) return false;
          if (timeRange === "30d" && daysAgo > 30) return false;
          if (timeRange === "90d" && daysAgo > 90) return false;
        }

        // Search text matching name, release title, condition, notes
        if (search) {
          const haystack = [
            m.name,
            m.version,
            m.releaseTitle,
            m.conditionLabelAr,
            m.conditionLabelEn,
            m.architecture,
            m.notes
          ].join(" ").toLowerCase();
          if (!haystack.includes(search)) return false;
        }

        return true;
      })
      .map(computeModelMetrics);
  }

  /**
   * Computes aggregate macro metrics across filtered models
   */
  function computeAggregateMetrics(computedModels = []) {
    if (computedModels.length === 0) {
      return {
        avgSensitivity: 0,
        avgSpecificity: 0,
        avgPrecision: 0,
        avgF1Score: 0,
        avgAucRoc: 0,
        avgDoctorConcordance: 0,
        totalCases: 0,
        modelsCount: 0
      };
    }

    let sumSens = 0;
    let sumSpec = 0;
    let sumPrec = 0;
    let sumF1 = 0;
    let sumAuc = 0;
    let sumConc = 0;
    let totalN = 0;

    computedModels.forEach(m => {
      const met = m.metrics;
      sumSens += met.sensitivity;
      sumSpec += met.specificity;
      sumPrec += met.precision;
      sumF1 += met.f1Score;
      sumAuc += met.aucRoc;
      sumConc += met.doctorConcordanceRate;
      totalN += met.totalCases;
    });

    const count = computedModels.length;

    return {
      avgSensitivity: sumSens / count,
      avgSensitivityPct: formatPct(sumSens / count),

      avgSpecificity: sumSpec / count,
      avgSpecificityPct: formatPct(sumSpec / count),

      avgPrecision: sumPrec / count,
      avgPrecisionPct: formatPct(sumPrec / count),

      avgF1Score: sumF1 / count,
      avgF1ScorePct: formatPct(sumF1 / count),

      avgAucRoc: sumAuc / count,
      avgAucRocFormatted: (sumAuc / count).toFixed(4),

      avgDoctorConcordance: sumConc / count,
      avgDoctorConcordancePct: formatPct(sumConc / count),

      totalCases: totalN,
      modelsCount: count
    };
  }

  /**
   * Generates a CSV export of models and metrics
   */
  function generateModelsCsv(computedModels = []) {
    const headers = [
      "Model ID",
      "Version",
      "Model Name",
      "Status",
      "Condition Scope",
      "Sensitivity",
      "Specificity",
      "Precision (PPV)",
      "F1-Score",
      "AUC-ROC",
      "Doctor Concordance Rate",
      "Sample Size (N)",
      "TP",
      "FP",
      "TN",
      "FN",
      "Evaluation Date"
    ];

    const rows = computedModels.map(m => {
      const met = m.metrics;
      const cm = m.confusionMatrix;
      return [
        `"${m.id}"`,
        `"${m.version}"`,
        `"${m.name}"`,
        `"${m.status}"`,
        `"${m.conditionScope}"`,
        `"${met.sensitivityPct}"`,
        `"${met.specificityPct}"`,
        `"${met.precisionPct}"`,
        `"${met.f1ScorePct}"`,
        `"${met.aucRocFormatted}"`,
        `"${met.doctorConcordancePct}"`,
        met.totalCases,
        cm.tp,
        cm.fp,
        cm.tn,
        cm.fn,
        `"${m.evaluationDate}"`
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }

  const AIMonitoringService = {
    CLINICAL_AI_MODELS,
    calculateSensitivity,
    calculateSpecificity,
    calculatePrecision,
    calculateF1Score,
    calculateWilsonCI,
    computeModelMetrics,
    filterModels,
    computeAggregateMetrics,
    generateModelsCsv,
    formatPct
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AIMonitoringService = AIMonitoringService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AIMonitoringService;
  }
})(typeof window !== "undefined" ? window : globalThis);
