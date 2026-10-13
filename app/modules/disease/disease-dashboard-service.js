/**
 * Health Vibe AI - Disease Dashboard Service
 * 
 * Aggregates patient data from all four clinical disease modules:
 * Diabetes, Hypertension, Blood Disorders, and Obesity.
 * Ensures zero fabrication by using only real persisted account data.
 */

(function (global) {
  "use strict";

  /**
   * Fetches the raw clinical bundle for a specific disease module from Firestore.
   */
  async function fetchDiseaseModuleData(uid, collectionName, dbInstance = null) {
    if (!uid) return null;
    const db = dbInstance || global.db;
    
    if (db) {
      try {
        const doc = await db.collection(collectionName).doc(uid).get();
        if (doc.exists) {
          return doc.data();
        }
      } catch (err) {
        console.warn(`[DiseaseDashboardService] Failed to fetch ${collectionName} from Firestore:`, err);
      }
    }
    
    // Fallback to API if DB is unavailable or we're using REST
    const clientFetch = global.authenticatedFetch;
    if (clientFetch) {
      try {
        // Map collection names to API endpoints
        const endpointMap = {
          'diabetesData': 'diabetes',
          'hypertensionData': 'hypertension',
          'bloodDisordersData': 'blood-disorders',
          'obesityData': 'obesity'
        };
        const endpoint = endpointMap[collectionName] || collectionName;
        const res = await clientFetch(`/api/${endpoint}/patient/${uid}`);
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.success) {
            return data.record || data.data || null;
          }
        }
      } catch (err) {
        console.warn(`[DiseaseDashboardService] API fetch for ${collectionName} failed:`, err);
      }
    }
    return null;
  }

  /**
   * Evaluates the clinical state of a disease module based on its real data bundle.
   * Possible states: 'no_data', 'not_started', 'awaiting_review', 'under_review', 'information_requested', 'approved'.
   */
  function evaluateModuleState(data) {
    if (!data) {
      return { state: 'no_data', nextAction: 'actionNoActionNeeded' };
    }

    const hasMeasurements = data.readingsCount > 0 || (data.measurements && data.measurements.length > 0);
    const hasAssessments = data.assessmentsCount > 0 || (data.assessments && data.assessments.length > 0);
    const hasReports = data.reportsCount > 0 || (data.reports && data.reports.length > 0);
    const hasDoctorReviews = data.reviewsCount > 0 || data.notesCount > 0 || (data.doctorReviews && data.doctorReviews.length > 0);
    const status = data.status || data.reviewStatus;

    if (status === 'pending_patient_response' || data.clarificationRequested) {
      return { state: 'information_requested', nextAction: 'actionRespondInquiry' };
    }
    
    if (hasReports || status === 'approved') {
      return { state: 'approved', nextAction: 'actionViewReport' };
    }
    
    if (hasDoctorReviews || status === 'under_review' || status === 'reviewed') {
      return { state: 'under_review', nextAction: 'actionAwaitingDoctor' };
    }
    
    if ((hasAssessments || hasMeasurements) && (status === 'pending' || status === 'awaiting_review' || !status)) {
      return { state: 'awaiting_review', nextAction: 'actionAwaitingDoctor' };
    }
    
    if (!hasAssessments && !hasMeasurements) {
      return { state: 'not_started', nextAction: 'actionStartAssessment' };
    }

    // Default fallback if some data exists but state is unclear
    return { state: 'awaiting_review', nextAction: 'actionAwaitingDoctor' };
  }

  /**
   * Fetches real patient bundles for all four modules and normalizes their status.
   */
  async function fetchDashboardData(uid) {
    const modules = [
      { id: 'diabetes', collection: 'diabetesData', titleKey: 'diabetesTitle' },
      { id: 'hypertension', collection: 'hypertensionData', titleKey: 'hypertensionTitle' },
      { id: 'bloodDisorders', collection: 'bloodDisordersData', titleKey: 'bloodDisordersTitle' },
      { id: 'obesity', collection: 'obesityData', titleKey: 'obesityTitle' }
    ];

    const results = {};

    await Promise.all(modules.map(async (mod) => {
      const data = await fetchDiseaseModuleData(uid, mod.collection);
      const { state, nextAction } = evaluateModuleState(data);
      
      results[mod.id] = {
        id: mod.id,
        titleKey: mod.titleKey,
        state: state,
        nextAction: nextAction,
        rawData: data // Preserve real data for snippets if needed
      };
    }));

    return results;
  }

  const DiseaseDashboardService = {
    fetchDashboardData,
    evaluateModuleState
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DiseaseDashboardService = DiseaseDashboardService;

})(typeof window !== "undefined" ? window : globalThis);
