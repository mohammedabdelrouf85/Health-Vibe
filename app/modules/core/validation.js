/**
 * Health Vibe AI - Core Validation Module
 * 
 * Separates data validation, string normalization, and clinical input parsing
 * from DOM/UI rendering. Pure functions with zero DOM dependencies.
 */

(function (global) {
  "use strict";

  /**
   * Normalizes Arabic-Indic (٠-٩) and Eastern-Arabic-Indic (۰-۹) digits to standard Western digits (0-9).
   * @param {string|number} value
   * @returns {string}
   */
  function normalizeArabicIndicDigits(value) {
    return String(value ?? "")
      .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0));
  }

  /**
   * Parses and strictly validates oxygen saturation (SpO2: 50% - 100%).
   * @param {string|number} value
   * @returns {{ ok: boolean, value: number|null, reason: string|null }}
   */
  function parseStrictOxygenInput(value) {
    const raw = String(value ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).trim();
    if (!normalized) {
      return { ok: false, value: null, reason: "empty" };
    }
    const match = normalized.match(/^(\d{1,3})\s*%?$/);
    if (!match) {
      return { ok: false, value: null, reason: "format" };
    }
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isInteger(parsed)) {
      return { ok: false, value: null, reason: "format" };
    }
    if (parsed < 50 || parsed > 100) {
      return { ok: false, value: parsed, reason: parsed > 100 ? "above-range" : "below-range" };
    }
    return { ok: true, value: parsed, reason: null };
  }

  /**
   * Parses and validates symptom duration in days (1 - 365).
   * @param {string|number} value
   * @returns {{ ok: boolean, value: number|null, text: string, reason: string|null }}
   */
  function parseStrictSymptomDurationInput(value) {
    const raw = String(value ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).trim();
    if (!normalized || normalized === "غير محدد") {
      return { ok: false, value: null, text: raw, reason: "empty" };
    }
    const match = normalized.match(/^(\d{1,3})\s*(?:days?|day|d|يوم|أيام|ايام|يوما|يوماً)?$/i);
    if (!match) {
      return { ok: false, value: null, text: raw, reason: "format" };
    }
    const days = Number.parseInt(match[1], 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return { ok: false, value: days, text: raw, reason: days > 365 ? "above-range" : "below-range" };
    }
    return { ok: true, value: days, text: raw, reason: null };
  }

  /**
   * Parses optional body temperature in Celsius (34.0°C - 43.0°C).
   * @param {string|number} value
   * @returns {{ ok: boolean, value: number|null, unit: string, reason: string|null }}
   */
  function parseOptionalTemperatureInput(value) {
    const raw = String(value ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).replace(/°/g, "").replace(/\s*c$/i, "").trim();
    if (!normalized) return { ok: true, value: null, unit: "°C", reason: "not-provided" };
    if (/^(unknown|غير معروف|غير معلوم|لا اعرف)$/i.test(normalized)) {
      return { ok: true, value: null, unit: "°C", reason: "unknown" };
    }
    const match = normalized.match(/^(\d{2})(?:[.,](\d))?$/);
    if (!match) return { ok: false, value: null, unit: "°C", reason: "format" };
    const parsed = Number(`${match[1]}.${match[2] || "0"}`);
    if (parsed < 34 || parsed > 43) {
      return { ok: false, value: parsed, unit: "°C", reason: parsed > 43 ? "above-range" : "below-range" };
    }
    return { ok: true, value: parsed, unit: "°C", reason: null };
  }

  /**
   * Parses optional respiratory rate in breaths per minute (5 - 60).
   * @param {string|number} value
   * @returns {{ ok: boolean, value: number|null, unit: string, reason: string|null }}
   */
  function parseOptionalRespiratoryRateInput(value) {
    const raw = String(value ?? "").trim();
    const normalized = normalizeArabicIndicDigits(raw).trim();
    if (!normalized) return { ok: true, value: null, unit: "breaths/min", reason: "not-provided" };
    if (/^(unknown|غير معروف|غير معلوم|لا اعرف)$/i.test(normalized)) {
      return { ok: true, value: null, unit: "breaths/min", reason: "unknown" };
    }
    if (!/^\d{1,2}$/.test(normalized)) return { ok: false, value: null, unit: "breaths/min", reason: "format" };
    const parsed = Number.parseInt(normalized, 10);
    if (parsed < 5 || parsed > 60) {
      return { ok: false, value: parsed, unit: "breaths/min", reason: parsed > 60 ? "above-range" : "below-range" };
    }
    return { ok: true, value: parsed, unit: "breaths/min", reason: null };
  }

  /**
   * Normalizes yes/no/unknown clinical values across bilingual inputs.
   * @param {string} value
   * @returns {"yes"|"no"|"unknown"|""}
   */
  function normalizeYesNoUnknown(value) {
    const clean = String(value ?? "").trim().toLowerCase();
    if (clean === "نعم" || clean === "yes") return "yes";
    if (clean === "لا" || clean === "no") return "no";
    if (clean === "غير معروف" || clean === "unknown") return "unknown";
    return "";
  }

  /**
   * Normalizes symptom progression categories.
   * @param {string} value
   * @returns {"improving"|"stable"|"worsening"|"unknown"|""}
   */
  function normalizeSymptomProgression(value) {
    const clean = String(value ?? "").trim().toLowerCase();
    if (clean === "تتحسن" || clean === "improving") return "improving";
    if (clean === "ثابتة" || clean === "stable") return "stable";
    if (clean === "تسوء" || clean === "worsening") return "worsening";
    if (clean === "غير معروف" || clean === "unknown") return "unknown";
    return "";
  }

  /**
   * Validates standard email address format.
   * @param {string} email
   * @returns {boolean}
   */
  function validateEmail(email) {
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
    return re.test(String(email || "").trim());
  }

  /**
   * Validates international or local telephone number.
   * @param {string} phone
   * @returns {boolean}
   */
  function validatePhone(phone) {
    const normalized = normalizeArabicIndicDigits(String(phone || "").trim()).replace(/[\s\-()]/g, "");
    return /^\+?[0-9]{8,15}$/.test(normalized);
  }

  /**
   * Validates Egyptian / Arab 14-digit National ID.
   * @param {string} id
   * @returns {boolean}
   */
  function validateNationalId(id) {
    const normalized = normalizeArabicIndicDigits(String(id || "").trim());
    return /^[23]\d{13}$/.test(normalized);
  }

  /**
   * Validates password strength (min 8 characters, letters & digits).
   * @param {string} password
   * @returns {{ isValid: boolean, message: string }}
   */
  function validatePassword(password) {
    const str = String(password || "");
    if (str.length < 8) {
      return { isValid: false, message: "Password must be at least 8 characters long." };
    }
    const hasLetters = /[a-zA-Z]/.test(str);
    const hasDigits = /[0-9]/.test(str);
    if (!hasLetters || !hasDigits) {
      return { isValid: false, message: "Password must contain both letters and numbers." };
    }
    return { isValid: true, message: "" };
  }

  /**
   * Escapes HTML special characters for safe output.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Escapes HTML and converts newlines to <br> tags.
   * @param {*} value
   * @returns {string}
   */
  function textToHtml(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
  }

  const Validation = {
    normalizeArabicIndicDigits,
    parseStrictOxygenInput,
    parseStrictSymptomDurationInput,
    parseOptionalTemperatureInput,
    parseOptionalRespiratoryRateInput,
    normalizeYesNoUnknown,
    normalizeSymptomProgression,
    validateEmail,
    validatePhone,
    validateNationalId,
    validatePassword,
    escapeHtml,
    textToHtml
  };

  // Mount to HealthVibes namespace
  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.Validation = Validation;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Validation;
  }
})(typeof window !== "undefined" ? window : globalThis);
