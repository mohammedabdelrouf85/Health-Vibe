/**
 * Health Vibe AI - Condition-Tailored Dashboard Service (مرجع: Propeller Health)
 * Dynamically prioritizes clinical telemetry, vital metrics, and quick actions
 * based on the patient's active recorded condition (Respiratory, Diabetes, Hypertension).
 */

(function (global) {
  "use strict";

  const STORAGE_PREFIX = "healthvibe_primary_condition_";

  const CONDITION_SCHEMAS = {
    respiratory: {
      id: "respiratory",
      icon: "🫁",
      title: { ar: "رعاية الجهاز التنفسي والربو", en: "Respiratory & Asthma Care" },
      subtitle: { ar: "مؤشرات الأكسجين وكفاءة التنفس اللحظية", en: "Real-time SpO2 & Pulmonary Vitals" },
      primaryVitals: ["spo2", "respiratoryRate", "inhalerAdherence"],
      vitalLabels: {
        spo2: { ar: "تشبع الأكسجين (SpO2)", en: "Oxygen Saturation (SpO2)", unit: "%", target: ">= 95%" },
        respiratoryRate: { ar: "معدل التنفس", en: "Respiratory Rate", unit: "تنفس/دقيقة", target: "12-20" },
        inhalerAdherence: { ar: "الالتزام بالبخاخ", en: "Inhaler Adherence", unit: "%", target: ">= 90%" }
      },
      priorityRank: 1,
      quickAction: { ar: "تسجيل فحص تنفس جديد", en: "Log Breathing Vitals" }
    },
    hypertension: {
      id: "hypertension",
      icon: "❤️",
      title: { ar: "رعاية ضغط الدم والقلب", en: "Hypertension & Cardiovascular" },
      subtitle: { ar: "متابعة الضغط الانقباضي والانبساطي", en: "Systolic & Diastolic Tracking" },
      primaryVitals: ["systolic", "diastolic", "heartRate"],
      vitalLabels: {
        systolic: { ar: "الضغط الانقباضي", en: "Systolic BP", unit: "mmHg", target: "< 130" },
        diastolic: { ar: "الضغط الانبساطي", en: "Diastolic BP", unit: "mmHg", target: "< 85" },
        heartRate: { ar: "النبض", en: "Pulse", unit: "bpm", target: "60-100" }
      },
      priorityRank: 2,
      quickAction: { ar: "تسجيل قياس ضغط جديد", en: "Log Blood Pressure" }
    },
    diabetes: {
      id: "diabetes",
      icon: "🩸",
      title: { ar: "رعاية السكري والتمثيل الغذائي", en: "Diabetes & Glycemic Care" },
      subtitle: { ar: "مستويات سكر الدم الصائم والتراكمي", en: "Fasting Glucose & HbA1c" },
      primaryVitals: ["fastingGlucose", "postprandialGlucose", "hba1c"],
      vitalLabels: {
        fastingGlucose: { ar: "السكر الصائم", en: "Fasting Blood Sugar", unit: "mg/dL", target: "70-130" },
        postprandialGlucose: { ar: "السكر بعد الأكل", en: "Postprandial Glucose", unit: "mg/dL", target: "< 180" },
        hba1c: { ar: "السكر التراكمي", en: "HbA1c", unit: "%", target: "< 7.0%" }
      },
      priorityRank: 3,
      quickAction: { ar: "تسجيل قراءة سكر جديدة", en: "Log Glucose Level" }
    },
    general: {
      id: "general",
      icon: "🩺",
      title: { ar: "الرعاية الصحية العامة", en: "General Health Vitals" },
      subtitle: { ar: "المؤشرات الحيوية الشاملة للمريض", en: "Comprehensive Health Indicators" },
      primaryVitals: ["spo2", "systolic", "bmi"],
      vitalLabels: {
        spo2: { ar: "تشبع الأكسجين", en: "Oxygen Saturation", unit: "%", target: ">= 95%" },
        systolic: { ar: "ضغط الدم", en: "Blood Pressure", unit: "mmHg", target: "120/80" },
        bmi: { ar: "كتلة الجسم", en: "BMI", unit: "kg/m²", target: "18.5 - 24.9" }
      },
      priorityRank: 4,
      quickAction: { ar: "تسجيل فحص سريري شامل", en: "Log Clinical Vitals" }
    }
  };

  const inMemoryConditionStore = new Map();

  const ConditionTailoringService = {
    SCHEMAS: CONDITION_SCHEMAS,

    /**
     * Resolves condition ID from user profile or explicit setting.
     * @param {Object} profile
     * @returns {string} condition ID
     */
    detectPrimaryCondition(profile = {}) {
      if (profile.primaryCondition && CONDITION_SCHEMAS[profile.primaryCondition]) {
        return profile.primaryCondition;
      }

      const conditions = (profile.chronicConditions || []).map(c => String(c).toLowerCase());
      const diseaseTags = (profile.diseases || []).map(d => String(d).toLowerCase());
      const combined = [...conditions, ...diseaseTags].join(" ");

      if (combined.includes("asthma") || combined.includes("copd") || combined.includes("ربو") || combined.includes("صدر") || combined.includes("تنفس")) {
        return "respiratory";
      }
      if (combined.includes("hypertension") || combined.includes("pressure") || combined.includes("ضغط")) {
        return "hypertension";
      }
      if (combined.includes("diabetes") || combined.includes("glucose") || combined.includes("سكر")) {
        return "diabetes";
      }

      return "general";
    },

    /**
     * Resolves tailored dashboard schema & telemetry cards for a patient.
     * @param {Object} profile
     * @param {Object} [recentVitals={}]
     * @returns {Object} Tailored dashboard structure
     */
    resolveTailoredDashboard(profile = {}, recentVitals = {}) {
      const conditionId = this.detectPrimaryCondition(profile);
      const schema = CONDITION_SCHEMAS[conditionId] || CONDITION_SCHEMAS.general;

      const telemetry = schema.primaryVitals.map(key => {
        const meta = schema.vitalLabels[key] || {};
        const val = recentVitals[key] !== undefined ? recentVitals[key] : null;
        let status = "normal";

        if (key === "spo2" && val !== null) {
          if (val < 92) status = "critical";
          else if (val < 95) status = "warning";
        } else if (key === "systolic" && val !== null) {
          if (val >= 140) status = "warning";
          if (val >= 160) status = "critical";
        } else if (key === "fastingGlucose" && val !== null) {
          if (val > 180 || val < 70) status = "warning";
        }

        return {
          key,
          label: meta,
          value: val,
          unit: meta.unit,
          target: meta.target,
          status
        };
      });

      return {
        conditionId,
        schema,
        telemetry,
        isRespiratoryElevated: (conditionId === "respiratory"),
        badge: schema.title,
        quickAction: schema.quickAction
      };
    },

    /**
     * Gets persisted condition preference for patient.
     * @param {string} userId
     * @returns {string}
     */
    getSavedCondition(userId = "guest") {
      if (inMemoryConditionStore.has(userId)) {
        return inMemoryConditionStore.get(userId);
      }
      if (typeof localStorage !== "undefined") {
        try {
          const val = localStorage.getItem(STORAGE_PREFIX + userId);
          if (val && CONDITION_SCHEMAS[val]) return val;
        } catch (e) {}
      }
      return "respiratory"; // Propeller default standard
    },

    /**
     * Sets primary condition preference.
     * @param {string} userId
     * @param {string} conditionId
     */
    setSavedCondition(userId = "guest", conditionId = "respiratory") {
      if (!CONDITION_SCHEMAS[conditionId]) {
        throw new Error(`Invalid condition ID: ${conditionId}`);
      }
      inMemoryConditionStore.set(userId, conditionId);
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(STORAGE_PREFIX + userId, conditionId);
        } catch (e) {}
      }
      return {
        success: true,
        userId,
        conditionId,
        schema: CONDITION_SCHEMAS[conditionId]
      };
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ConditionTailoringService;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.ConditionTailoringService = ConditionTailoringService;
  }
})(typeof window !== "undefined" ? window : global);
