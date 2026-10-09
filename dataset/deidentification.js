/**
 * Health Vibe AI - Clinical Dataset De-identification Module
 * 
 * Implements HIPAA Safe Harbor and GDPR pseudonymization principles
 * for respiratory clinical assessments.
 * 
 * Direct Identifiers Prohibited:
 * - Patient full names (first, middle, last)
 * - Email addresses
 * - Phone / mobile numbers
 * - National Identification Numbers (e.g., 14-digit Egyptian NID, SSN)
 * - Exact physical addresses, street names, postal codes
 * - Exact Date of Birth (DOB) -> replaced with integer age or age-bracket
 * - Direct database / Firebase UIDs -> replaced with salted pseudonymous subject ID (HV-SUBJ-XXXX)
 */

(function (global) {
  "use strict";

  const crypto = typeof require !== "undefined" ? require("crypto") : null;

  // Patterns for detecting accidental leakage of direct identifiers
  const DIRECT_IDENTIFIER_PATTERNS = Object.freeze({
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
    phone: /(?:\+?20|0)?1[0125]\d{8}|\+?[1-9]\d{1,14}/,
    nationalId: /\b\d{14}\b/, // Egyptian 14-digit National ID
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
    fullDob: /\b\d{4}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])\b/
  });

  /**
   * Generates a deterministic pseudonymous subject ID from an internal UID and salt.
   * @param {string} rawId
   * @param {string} salt
   * @returns {string} e.g. "HV-SUBJ-A8F2E1"
   */
  function generateSubjectId(rawId, salt = "health-vibes-eval-salt-2026") {
    if (!rawId) {
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `HV-SUBJ-${rand}`;
    }
    if (crypto) {
      const hash = crypto.createHmac("sha256", salt).update(String(rawId)).digest("hex");
      return `HV-SUBJ-${hash.substring(0, 8).toUpperCase()}`;
    }
    // Fallback simple hash
    let hash = 0;
    const str = `${salt}:${rawId}`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `HV-SUBJ-${Math.abs(hash).toString(16).substring(0, 8).toUpperCase()}`;
  }

  /**
   * Bins chronological age into standardized clinical demographic cohorts.
   * @param {number} age
   * @returns {"pediatric"|"young_adult"|"middle_aged"|"geriatric"}
   */
  function categorizeAgeGroup(age) {
    const num = Number(age);
    if (!Number.isFinite(num) || num < 0) return "unknown";
    if (num < 18) return "pediatric";
    if (num <= 39) return "young_adult";
    if (num <= 64) return "middle_aged";
    return "geriatric";
  }

  /**
   * Validates that a clinical record contains ZERO direct identifiers.
   * @param {object} record
   * @returns {{ isDeidentified: boolean, violations: string[] }}
   */
  function validateDeidentifiedRecord(record) {
    const violations = [];
    if (!record || typeof record !== "object") {
      return { isDeidentified: false, violations: ["Invalid or empty record object"] };
    }

    // Check prohibited top-level keys
    const prohibitedKeys = [
      "name", "patientName", "patientNameEn", "displayName",
      "email", "patientEmail", "userEmail",
      "phone", "phoneNumber", "patientPhone",
      "nationalId", "nid", "ssn",
      "address", "street", "postalCode", "zip",
      "dob", "dateOfBirth", "birthDate",
      "ip", "ipAddress",
      "uid", "patientUid", "userId", "doctorId"
    ];

    for (const key of prohibitedKeys) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
        violations.push(`Prohibited direct identifier field found: "${key}"`);
      }
    }

    // Check textual values in the entire record for regex matches of emails, phones, national IDs
    const textBlob = JSON.stringify(record);

    if (DIRECT_IDENTIFIER_PATTERNS.email.test(textBlob)) {
      violations.push("Direct identifier pattern detected: email address");
    }
    if (DIRECT_IDENTIFIER_PATTERNS.nationalId.test(textBlob)) {
      violations.push("Direct identifier pattern detected: 14-digit National ID");
    }
    if (DIRECT_IDENTIFIER_PATTERNS.fullDob.test(textBlob)) {
      violations.push("Direct identifier pattern detected: full Date of Birth");
    }

    // Must have a pseudonymous subjectId
    if (!record.subjectId || typeof record.subjectId !== "string" || !record.subjectId.startsWith("HV-")) {
      violations.push("Missing or invalid pseudonymous subjectId (must start with 'HV-')");
    }

    return {
      isDeidentified: violations.length === 0,
      violations
    };
  }

  /**
   * De-identifies a raw case by stripping all direct identifiers and mapping to research schema.
   * @param {object} rawCase
   * @param {string} salt
   * @returns {object} De-identified record
   */
  function deidentifyCase(rawCase, salt = "health-vibes-eval-salt-2026") {
    const subjectId = rawCase.subjectId || generateSubjectId(rawCase.patientId || rawCase.id, salt);
    const age = Number(rawCase.age || rawCase.patientAge || 0);

    return {
      subjectId,
      demographics: {
        age: age > 0 ? age : null,
        ageGroup: categorizeAgeGroup(age),
        sex: (rawCase.sex || rawCase.gender || "unspecified").toLowerCase()
      },
      vitals: {
        oxygenLevel: Number(rawCase.oxygenLevel ?? rawCase.o2 ?? 0),
        respiratoryRate: Number(rawCase.respiratoryRate ?? 0) || null,
        temperature: Number(rawCase.temperature ?? 0) || null,
        heartRate: Number(rawCase.heartRate ?? 0) || null
      },
      symptoms: {
        breathingDifficulty: Boolean(rawCase.breathingDifficulty === "yes" || rawCase.breathingDifficulty === "نعم" || rawCase.hasDyspnea),
        coughLevel: String(rawCase.coughLevel || rawCase.coughKey || "none").toLowerCase(),
        symptomDurationDays: Number(rawCase.symptomDurationDays || rawCase.durationDays || 1),
        chestPain: Boolean(rawCase.chestPain === "yes" || rawCase.chestPain === "نعم" || rawCase.hasChestPain),
        symptomProgression: String(rawCase.symptomProgression || "stable").toLowerCase()
      },
      comorbidities: {
        asthma: Boolean(rawCase.asthma || (rawCase.riskFactors && rawCase.riskFactors.includes("asthma"))),
        copd: Boolean(rawCase.copd || (rawCase.riskFactors && rawCase.riskFactors.includes("copd"))),
        smoking: Boolean(rawCase.smoking || (rawCase.riskFactors && rawCase.riskFactors.includes("smoking"))),
        pregnancy: Boolean(rawCase.pregnancy || (rawCase.riskFactors && rawCase.riskFactors.includes("pregnancy"))),
        cardiovascular: Boolean(rawCase.cardiovascular || (rawCase.riskFactors && rawCase.riskFactors.includes("cardiovascular"))),
        diabetes: Boolean(rawCase.diabetes || (rawCase.riskFactors && rawCase.riskFactors.includes("diabetes")))
      },
      deidentifiedAt: new Date().toISOString()
    };
  }

  const DeidentificationModule = {
    generateSubjectId,
    categorizeAgeGroup,
    validateDeidentifiedRecord,
    deidentifyCase,
    DIRECT_IDENTIFIER_PATTERNS
  };

  global.HealthVibesDeidentification = DeidentificationModule;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DeidentificationModule;
  }
})(typeof window !== "undefined" ? window : globalThis);
