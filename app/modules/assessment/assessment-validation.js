/**
 * Health Vibe AI - Clinical Assessment Validation Module
 * 
 * Clinical rules, SpO2 ranges, symptom progression, and field constraints.
 */

(function (global) {
  "use strict";

  const Validation = (global.HealthVibes && global.HealthVibes.Validation) || {};

  const normalizeArabicIndicDigits = Validation.normalizeArabicIndicDigits || function(v) {
    return String(v ?? "")
      .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  };

  const parseStrictOxygenInput = Validation.parseStrictOxygenInput || function(v) {
    const raw = String(v ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).trim();
    if (!normalized) return { ok: false, value: null, reason: "empty" };
    const match = normalized.match(/^(\d{1,3})\s*%?$/);
    if (!match) return { ok: false, value: null, reason: "format" };
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isInteger(parsed)) return { ok: false, value: null, reason: "format" };
    if (parsed < 50 || parsed > 100) return { ok: false, value: parsed, reason: parsed > 100 ? "above-range" : "below-range" };
    return { ok: true, value: parsed, reason: null };
  };

  const parseStrictSymptomDurationInput = Validation.parseStrictSymptomDurationInput || function(v) {
    const raw = String(v ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).trim();
    if (!normalized || normalized === "غير محدد") return { ok: false, value: null, text: raw, reason: "empty" };
    const match = normalized.match(/^(\d{1,3})\s*(?:days?|day|d|يوم|أيام|ايام|يوما|يوماً)?$/i);
    if (!match) return { ok: false, value: null, text: raw, reason: "format" };
    const days = Number.parseInt(match[1], 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, value: days, text: raw, reason: days > 365 ? "above-range" : "below-range" };
    return { ok: true, value: days, text: raw, reason: null };
  };

  const parseOptionalTemperatureInput = Validation.parseOptionalTemperatureInput || function(v) {
    const raw = String(v ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).replace(/°/g, "").replace(/\s*c$/i, "").trim();
    if (!normalized) return { ok: true, value: null, unit: "°C", reason: "not-provided" };
    if (/^(unknown|غير معروف|غير معلوم|لا اعرف)$/i.test(normalized)) return { ok: true, value: null, unit: "°C", reason: "unknown" };
    const match = normalized.match(/^(\d{2})(?:[.,](\d))?$/);
    if (!match) return { ok: false, value: null, unit: "°C", reason: "format" };
    const parsed = Number(`${match[1]}.${match[2] || "0"}`);
    if (parsed < 34 || parsed > 43) return { ok: false, value: parsed, unit: "°C", reason: parsed > 43 ? "above-range" : "below-range" };
    return { ok: true, value: parsed, unit: "°C", reason: null };
  };

  const parseOptionalRespiratoryRateInput = Validation.parseOptionalRespiratoryRateInput || function(v) {
    const raw = String(v ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).trim();
    if (!normalized) return { ok: true, value: null, unit: "breaths/min", reason: "not-provided" };
    if (/^(unknown|غير معروف|غير معلوم|لا اعرف)$/i.test(normalized)) return { ok: true, value: null, unit: "breaths/min", reason: "unknown" };
    if (!/^\d{1,2}$/.test(normalized)) return { ok: false, value: null, unit: "breaths/min", reason: "format" };
    const parsed = Number.parseInt(normalized, 10);
    if (parsed < 5 || parsed > 60) return { ok: false, value: parsed, unit: "breaths/min", reason: parsed > 60 ? "above-range" : "below-range" };
    return { ok: true, value: parsed, unit: "breaths/min", reason: null };
  };

  const normalizeYesNoUnknown = Validation.normalizeYesNoUnknown || function(v) {
    const clean = String(v ?? "").trim().toLowerCase();
    if (clean === "نعم" || clean === "yes") return "yes";
    if (clean === "لا" || clean === "no") return "no";
    if (clean === "غير معروف" || clean === "unknown") return "unknown";
    return "";
  };

  const normalizeSymptomProgression = Validation.normalizeSymptomProgression || function(v) {
    const clean = String(v ?? "").trim().toLowerCase();
    if (clean === "تتحسن" || clean === "improving") return "improving";
    if (clean === "ثابتة" || clean === "stable") return "stable";
    if (clean === "تسوء" || clean === "worsening") return "worsening";
    if (clean === "غير معروف" || clean === "unknown") return "unknown";
    return "";
  };

  /**
   * Validates assessment payload against clinical guidelines.
   * @param {object} fields
   * @returns {{ isValid: boolean, errors: Array<{ field: string, message: string }>, errorSummary: string }}
   */
  function validateAssessmentFields({
    oxygenLevel,
    breathingDifficulty,
    coughLevel,
    symptomDuration,
    temperature,
    respiratoryRate,
    chestPain,
    symptomProgression,
    recentInfection,
    asthmaCopd,
    currentMedications,
    notes,
    riskFactors,
    isEn = false
  }) {
    const errors = [];

    // 1. Oxygen Level (SpO2: 50% - 100%)
    const parsedOxygen = parseStrictOxygenInput(oxygenLevel);
    if (!parsedOxygen.ok) {
      errors.push({
        field: "oxygenInput",
        message: parsedOxygen.reason === "above-range"
          ? (isEn ? "Oxygen level cannot exceed 100%." : "نسبة الأكسجين لا يمكن أن تتجاوز 100%.")
          : parsedOxygen.reason === "below-range"
            ? (isEn ? "SpO2 below 50% cannot be recorded reliably. Please re-check the device or seek urgent care if symptoms are severe." : "قراءة الأكسجين أقل من 50% لا يمكن تسجيلها كقياس موثوق. يرجى إعادة القياس أو طلب الطوارئ عند وجود أعراض شديدة.")
            : (isEn ? "Unable to measure SpO2 from this input. Enter a whole number between 50 and 100." : "تعذر قياس الأكسجين من هذا الإدخال. أدخل رقماً صحيحاً بين 50 و 100.")
      });
    }

    // 2. Breathing Difficulty (Required selection)
    const validBreathing = ["نعم", "لا", "yes", "no"];
    const breathingStr = String(breathingDifficulty || "").trim();
    if (!breathingStr || breathingStr === "غير محدد" || (!validBreathing.includes(breathingStr.toLowerCase()) && !validBreathing.includes(breathingStr))) {
      errors.push({
        field: "breathingChoices",
        message: isEn
          ? "Please specify whether shortness of breath is present (Yes or No)."
          : "يرجى تحديد ما إذا كان يوجد ضيق في التنفس (نعم أم لا)."
      });
    }

    // 3. Cough Level (Required selection)
    const validCough = ["خفيفة", "متوسطة", "شديدة", "لا توجد", "mild", "moderate", "severe", "none"];
    const coughStr = String(coughLevel || "").trim();
    if (!coughStr || coughStr === "غير محدد" || (!validCough.includes(coughStr.toLowerCase()) && !validCough.includes(coughStr))) {
      errors.push({
        field: "coughChoices",
        message: isEn
          ? "Please select cough severity level."
          : "يرجى اختيار درجة شدة الكحة من الخيارات المتاحة."
      });
    }

    // 4. Symptom Duration (Must contain valid day count: 1 - 365)
    const parsedDuration = parseStrictSymptomDurationInput(symptomDuration);
    if (!parsedDuration.ok) {
      errors.push({
        field: "symptomDuration",
        message: isEn
          ? "Please enter symptom duration as a whole number of days between 1 and 365."
          : "يرجى إدخال مدة الأعراض كعدد أيام صحيح بين 1 و 365."
      });
    }

    const parsedTemperature = parseOptionalTemperatureInput(temperature);
    if (!parsedTemperature.ok) {
      errors.push({
        field: "temperatureInput",
        message: isEn
          ? "Temperature must be Celsius between 34.0 and 43.0, blank, or unknown."
          : "درجة الحرارة يجب أن تكون مئوية بين 34.0 و 43.0 أو فارغة أو غير معروف."
      });
    }

    const parsedRespiratoryRate = parseOptionalRespiratoryRateInput(respiratoryRate);
    if (!parsedRespiratoryRate.ok) {
      errors.push({
        field: "respiratoryRateInput",
        message: isEn
          ? "Respiratory rate must be a whole number between 5 and 60 breaths/min, blank, or unknown."
          : "معدل التنفس يجب أن يكون رقماً صحيحاً بين 5 و 60 نفس/دقيقة أو فارغاً أو غير معروف."
      });
    }

    [
      ["chestPainChoices", chestPain, normalizeYesNoUnknown, isEn ? "Please record chest pain as Yes, No, or Unknown." : "يرجى تسجيل ألم الصدر: نعم أو لا أو غير معروف."],
      ["recentInfectionChoices", recentInfection, normalizeYesNoUnknown, isEn ? "Please record recent infection as Yes, No, or Unknown." : "يرجى تسجيل العدوى الحديثة: نعم أو لا أو غير معروف."],
      ["asthmaCopdChoices", asthmaCopd, normalizeYesNoUnknown, isEn ? "Please record asthma/COPD as Yes, No, or Unknown." : "يرجى تسجيل الربو/COPD: نعم أو لا أو غير معروف."],
      ["symptomProgressionChoices", symptomProgression, normalizeSymptomProgression, isEn ? "Please record symptom progression." : "يرجى تسجيل تطور الأعراض."]
    ].forEach(([field, raw, normalizer, message]) => {
      if (!normalizer(raw)) {
        errors.push({ field, message });
      }
    });

    if (String(currentMedications || "").length > 500) {
      errors.push({
        field: "currentMedicationsInput",
        message: isEn ? "Current medications must be 500 characters or fewer." : "الأدوية الحالية يجب ألا تتجاوز 500 حرف."
      });
    }

    if (String(notes || "").length > 1000) {
      errors.push({
        field: "assessmentNotesInput",
        message: isEn ? "Notes must be 1000 characters or fewer." : "الملاحظات يجب ألا تتجاوز 1000 حرف."
      });
    }

    // 5. Risk Factors (Must be a non-empty array with valid options)
    if (!Array.isArray(riskFactors) || riskFactors.length === 0) {
      errors.push({
        field: "riskChoices",
        message: isEn
          ? "Please select your risk factors (or choose 'None')."
          : "يرجى تحديد عوامل الخطورة (أو اختيار 'لا يوجد')."
      });
    } else {
      const validRf = ["ربو", "تدخين", "حمل", "لا يوجد", "asthma", "smoking", "pregnancy", "none"];
      const hasInvalid = riskFactors.some(rf => !validRf.includes(String(rf).trim()) && !validRf.includes(String(rf).trim().toLowerCase()));
      if (hasInvalid) {
        errors.push({
          field: "riskChoices",
          message: isEn
            ? "Invalid risk factors selected."
            : "تم اختيار عوامل خطورة غير صالحة."
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      errorSummary: errors.map(e => e.message).join(" | ")
    };
  }

  const AssessmentValidation = {
    validateAssessmentFields
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AssessmentValidation = AssessmentValidation;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AssessmentValidation;
  }
})(typeof window !== "undefined" ? window : globalThis);
