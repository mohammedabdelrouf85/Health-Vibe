/**
 * Health Vibe AI - Assessment Data Service
 * 
 * Manages assessment drafts, offline storage, triage classification,
 * and payload transmission.
 */

(function (global) {
  "use strict";

  const DRAFT_STORAGE_KEY = "hv_assessment_draft";

  /**
   * Persists an assessment draft to local storage.
   * @param {object} draft
   */
  function saveLocalDraft(draft) {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        ...draft,
        savedAt: Date.now()
      }));
    } catch (e) {
      console.warn("[AssessmentService] Failed to save local draft:", e);
    }
  }

  /**
   * Retrieves any cached assessment draft from local storage.
   * @returns {object|null}
   */
  function loadLocalDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clears saved assessment draft from local storage.
   */
  function clearLocalDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (e) {}
  }

  /**
   * Computes deterministic clinical priority based on SpO2 and vital symptoms.
   * @param {{ oxygenLevel: number, breathingDifficulty: string, chestPain: string }} input
   * @returns {{ priority: "urgent"|"high"|"normal", priorityAr: string, priorityEn: string }}
   */
  function computeClinicalTriage(input = {}) {
    const o2 = Number(input.oxygenLevel) || 0;
    const dyspnea = String(input.breathingDifficulty || "").toLowerCase();
    const chestPain = String(input.chestPain || "").toLowerCase();

    const isUrgent = (o2 > 0 && o2 < 90) || chestPain === "yes" || chestPain === "نعم";
    const isHigh = (o2 >= 90 && o2 < 93) || dyspnea === "yes" || dyspnea === "نعم";

    if (isUrgent) {
      return { priority: "urgent", priorityAr: "عاجل جداً", priorityEn: "Emergency / Urgent" };
    }
    if (isHigh) {
      return { priority: "high", priorityAr: "أولوية عالية", priorityEn: "High Priority" };
    }
    return { priority: "normal", priorityAr: "عادية", priorityEn: "Routine / Normal" };
  }

  const AssessmentService = {
    saveLocalDraft,
    loadLocalDraft,
    clearLocalDraft,
    computeClinicalTriage
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AssessmentService = AssessmentService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AssessmentService;
  }
})(typeof window !== "undefined" ? window : globalThis);
