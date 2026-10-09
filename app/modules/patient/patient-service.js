/**
 * Health Vibe AI - Patient Data Service
 * 
 * Manages patient profiles, medical records history, and timeline aggregation
 * independently of UI rendering.
 */

(function (global) {
  "use strict";

  /**
   * Fetches patient profile document from Firestore or backend.
   * @param {string} uid
   * @param {object} [dbInstance]
   * @returns {Promise<object|null>}
   */
  async function fetchPatientProfile(uid, dbInstance = null) {
    if (!uid) return null;
    const db = dbInstance || global.db;
    if (!db) return null;
    try {
      const doc = await db.collection("users").doc(uid).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (err) {
      console.warn("[PatientService] Failed to fetch patient profile:", err);
      return null;
    }
  }

  /**
   * Updates patient profile fields.
   * @param {string} uid
   * @param {object} updates
   * @param {object} [dbInstance]
   * @returns {Promise<void>}
   */
  async function updatePatientProfile(uid, updates = {}, dbInstance = null) {
    if (!uid) throw new Error("Patient UID is required");
    const db = dbInstance || global.db;
    if (!db) throw new Error("Database service unavailable");
    await db.collection("users").doc(uid).set({
      ...updates,
      updatedAt: global.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
    }, { merge: true });
  }

  /**
   * Aggregates unified patient timeline records (API or local cases).
   * @param {string} uid
   * @param {object} [filters={}]
   * @param {Function} [fetchFn]
   * @returns {Promise<Array<object>>}
   */
  async function fetchPatientTimeline(uid, filters = {}, fetchFn = null) {
    if (!uid) return [];
    const clientFetch = fetchFn || global.authenticatedFetch;
    if (clientFetch) {
      try {
        const params = new URLSearchParams();
        if (filters.type && filters.type !== "all") params.append("type", filters.type);
        if (filters.search) params.append("search", filters.search);
        if (filters.startDate) params.append("startDate", filters.startDate);
        if (filters.endDate) params.append("endDate", filters.endDate);
        const queryStr = params.toString();
        const res = await clientFetch(`/api/patient/timeline${queryStr ? `?${queryStr}` : ""}`);
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.timeline)) {
            return data.timeline;
          }
        }
      } catch (err) {
        console.warn("[PatientService] API timeline fetch failed, falling back to local:", err);
      }
    }
    return [];
  }

  /**
   * Filters in-memory timeline items.
   * @param {Array<object>} items
   * @param {{ type?: string, search?: string, startDate?: string, endDate?: string }} filters
   * @returns {Array<object>}
   */
  function filterTimelineItems(items = [], filters = {}) {
    let result = Array.isArray(items) ? [...items] : [];
    if (filters.type && filters.type !== "all") {
      result = result.filter(i => i.type === filters.type);
    }
    if (filters.startDate) {
      result = result.filter(i => (i.date || "") >= filters.startDate);
    }
    if (filters.endDate) {
      result = result.filter(i => (i.date || "") <= filters.endDate);
    }
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      result = result.filter(i => (String(i.title || "") + " " + String(i.summary || "")).toLowerCase().includes(q));
    }
    return result;
  }

  const PatientService = {
    fetchPatientProfile,
    updatePatientProfile,
    fetchPatientTimeline,
    filterTimelineItems
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.PatientService = PatientService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PatientService;
  }
})(typeof window !== "undefined" ? window : globalThis);
