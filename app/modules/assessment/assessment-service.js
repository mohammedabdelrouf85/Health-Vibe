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

  /**
   * Retrieves historical assessment array safely from storage.
   * Handles empty arrays, null, undefined, corrupt JSON, and populated historical records.
   * @param {object|null} user
   * @returns {Array<object>}
   */
  function getHistoricalAssessments(user = null) {
    if (typeof global.getHistoricalAssessmentsFromStorage === "function") {
      return global.getHistoricalAssessmentsFromStorage(user);
    }
    const results = [];
    const seenIds = new Set();
    const uid = user?.uid || null;

    const storageKeys = [
      "hv_assessment_history",
      "hv_historical_assessments",
      "hv_triage_history",
      "hv_patient_history",
      "hv_cases",
      "cases"
    ];

    try {
      const store = typeof localStorage !== "undefined" ? localStorage : null;
      if (!store) return [];

      for (const k of storageKeys) {
        const raw = store.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed)
            ? parsed
            : (parsed && Array.isArray(parsed.assessments) ? parsed.assessments : (parsed && Array.isArray(parsed.cases) ? parsed.cases : []));

          for (const item of items) {
            if (!item || typeof item !== "object") continue;
            const itemId = String(item.id || item.recordId || item.caseId || `local_${results.length}`);
            if (seenIds.has(itemId)) continue;
            if (uid && (item.patientId || item.uid) && item.patientId !== uid && item.uid !== uid) continue;

            seenIds.add(itemId);
            results.push({
              id: itemId,
              ...item,
              type: "assessment"
            });
          }
        } catch (_) {}
      }
    } catch (_) {}

    return results;
  }

  /**
   * Appends or updates a historical assessment in local storage.
   * @param {object} assessment
   */
  function saveHistoricalAssessment(assessment) {
    if (!assessment || typeof assessment !== "object") return;
    try {
      const store = typeof localStorage !== "undefined" ? localStorage : null;
      if (!store) return;
      const key = "hv_assessment_history";
      const existing = getHistoricalAssessments();
      const updated = [assessment, ...existing.filter(a => a.id !== assessment.id)];
      store.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.warn("[AssessmentService] Failed to save historical assessment to storage:", e);
    }
  }

  const AssessmentService = {
    saveLocalDraft,
    loadLocalDraft,
    clearLocalDraft,
    computeClinicalTriage,
    getHistoricalAssessments,
    saveHistoricalAssessment
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AssessmentService = AssessmentService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AssessmentService;
  }
})(typeof window !== "undefined" ? window : globalThis);
