/**
 * Health Vibe AI - Reports Data Service
 * 
 * Manages clinical report integrity, snapshots, verified doctor identity,
 * and certified clinical payload generation.
 */

(function (global) {
  "use strict";

  /**
   * Fallback for missing clinical text without synthesizing medical data.
   * @param {*} value
   * @param {boolean} isEn
   * @returns {string}
   */
  function recordedClinicalText(value, isEn = false) {
    return typeof value === "string" && value.trim() ? value.trim() : (isEn ? "Not recorded" : "غير مسجل");
  }

  /**
   * Extracts verified clinical content from report snapshots.
   * @param {object} record
   * @param {boolean} isEn
   * @returns {{ diag: string, meds: string, recs: Array<string> }}
   */
  function getRecordedClinicalContent(record, isEn = false) {
    const c = (record && record.reportSnapshot && record.reportSnapshot.clinicalContent) || record || {};
    const parseRecs = (global.HealthVibes?.DoctorService?.parseDoctorRecommendations) || (raw => String(raw || "").split(/\r?\n/).filter(Boolean));
    const saved = Array.isArray(c.recommendations)
      ? c.recommendations.filter(value => typeof value === "string" && value.trim()).map(value => value.trim())
      : parseRecs(c.recommendation);
    return {
      diag: recordedClinicalText(c.clinicalDiagnosis, isEn),
      meds: recordedClinicalText(c.medications, isEn),
      recs: saved.length ? saved : [recordedClinicalText(null, isEn)]
    };
  }

  /**
   * Extracts and verifies attending doctor identity.
   * @param {object} record
   * @param {boolean} isEn
   * @returns {{ name: string, licenseNumber: string, specialty: string, clinic: string }}
   */
  function getRecordedDoctorIdentity(record, isEn = false) {
    const snapshotIdentity = record && record.reportSnapshot && record.reportSnapshot.doctorIdentity;
    const identity = snapshotIdentity || (record && record.doctorIdentity);
    const approvedDoctorId = record && (record.approvingDoctorId || record.reportSnapshot?.approval?.approvedBy?.uid);
    const verified = identity && identity.uid === approvedDoctorId && identity.applicationId ? identity : {};
    return {
      name: recordedClinicalText(verified.name, isEn),
      licenseNumber: recordedClinicalText(verified.licenseNumber, isEn),
      specialty: recordedClinicalText(verified.specialty, isEn),
      clinic: recordedClinicalText(verified.clinic, isEn)
    };
  }

  /**
   * Applies immutable approved report snapshot over mutable live case fields.
   * @param {object} record
   * @returns {object}
   */
  function applyApprovedReportSnapshot(record) {
    const snapshot = record && record.reportSnapshot;
    if (!snapshot) return record;
    return {
      ...record,
      ...(snapshot.patient || {}),
      ...(snapshot.caseDetails || {}),
      ...(snapshot.clinicalContent || {}),
      doctorIdentity: snapshot.doctorIdentity || record.doctorIdentity,
      reportVersion: snapshot.versions?.reportVersion || record.reportVersion,
      modelVersion: snapshot.versions?.modelVersion || record.modelVersion,
      ruleEngineVersion: snapshot.versions?.ruleEngineVersion || record.ruleEngineVersion,
      approvedAt: snapshot.dates?.approvedAt || record.approvedAt,
      generatedAt: snapshot.dates?.generatedAt || record.generatedAt,
      reportGeneratedAt: snapshot.dates?.generatedAt || record.reportGeneratedAt,
      submittedAt: snapshot.dates?.submittedAt || record.submittedAt,
      reportRevisionNumber: snapshot.revisionNumber || record.reportRevisionNumber,
      currentReportRevisionId: snapshot.revisionId || record.currentReportRevisionId,
      previousReportRevisionId: snapshot.previousRevisionId || record.previousReportRevisionId,
      reportWithdrawal: record.reportWithdrawal || snapshot.withdrawal
    };
  }

  /**
   * Builds standardized QR verification payload.
   * STRICT PRIVACY: Omits diagnosis, medications, symptoms, or any sensitive clinical text.
   * @param {object} record
   * @param {string} origin
   * @returns {string}
   */
  function buildQrPayload(record, origin = "") {
    if (!record || !record.id) return "";
    const reportRef = record.reportRef || `HV-REP-${record.id.slice(-8).toUpperCase()}`;
    const hash = record.reportHash || `SHA256-${record.id.slice(0, 16).toUpperCase()}`;
    // Construct the public authenticity verification link
    const base = origin || (typeof window !== "undefined" && window.location ? window.location.origin : "");
    return `${base}/app/index.html?screen=verify&ref=${encodeURIComponent(reportRef)}&hash=${encodeURIComponent(hash)}`;
  }

  /**
   * Creates a time-limited, revocable report sharing link with explicit consent.
   * @param {string} caseId
   * @param {object} options { consent: boolean, consentText: string, expiresInHours: number, recipientEmail?: string, recipientPin?: string }
   * @returns {Promise<object>}
   */
  async function createReportShareLink(caseId, options = {}) {
    if (!caseId) throw new Error("caseId is required");
    if (!options.consent) {
      throw new Error("EXPLICIT_CONSENT_REQUIRED");
    }
    const payload = {
      caseId,
      consent: true,
      consentText: options.consentText || "Patient explicitly authorized time-limited medical report sharing.",
      expiresInHours: options.expiresInHours || 48,
      recipientEmail: options.recipientEmail || null,
      recipientPin: options.recipientPin || null
    };

    if (typeof global.callBackend === "function") {
      return await global.callBackend("/api/reports/share", payload);
    }
    const token = (typeof global.auth !== "undefined" && global.auth?.currentUser) ? await global.auth.currentUser.getIdToken() : "";
    const res = await fetch("/api/reports/share", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "Failed to create share link");
    return data;
  }

  /**
   * Revokes an existing report share link.
   * @param {string} shareId
   * @returns {Promise<object>}
   */
  async function revokeReportShareLink(shareId) {
    if (!shareId) throw new Error("shareId is required");
    const payload = { shareId };
    if (typeof global.callBackend === "function") {
      return await global.callBackend("/api/reports/share/revoke", payload);
    }
    const token = (typeof global.auth !== "undefined" && global.auth?.currentUser) ? await global.auth.currentUser.getIdToken() : "";
    const res = await fetch("/api/reports/share/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "Failed to revoke share link");
    return data;
  }

  /**
   * Queries report authenticity without exposing medical content publicly.
   * @param {string} reportRefOrId
   * @returns {Promise<object>}
   */
  async function verifyReportAuthenticity(reportRefOrId) {
    if (!reportRefOrId) throw new Error("reportRef is required");
    const res = await fetch(`/api/reports/verify/${encodeURIComponent(reportRefOrId)}`);
    const data = await res.json();
    return { ok: res.ok, status: res.status, ...data };
  }

  /**
   * Formats report for bilingual PDF export matching the approved version.
   * @param {object} params { record: object, language: 'ar' | 'en' }
   * @returns {object}
   */
  function formatReportForPdfExport({ record, language = "ar" }) {
    if (!record) return null;
    const isEn = language === "en";
    const approved = applyApprovedReportSnapshot(record);
    const clinical = getRecordedClinicalContent(approved, isEn);
    const doctor = getRecordedDoctorIdentity(approved, isEn);
    const dates = {
      approvedAt: approved.approvedAt ? new Date(approved.approvedAt).toLocaleString(isEn ? "en-US" : "ar-EG") : recordedClinicalText(null, isEn),
      generatedAt: (approved.reportGeneratedAt || approved.generatedAt) ? new Date(approved.reportGeneratedAt || approved.generatedAt).toLocaleString(isEn ? "en-US" : "ar-EG") : recordedClinicalText(null, isEn),
      submittedAt: approved.submittedAt ? new Date(approved.submittedAt).toLocaleString(isEn ? "en-US" : "ar-EG") : recordedClinicalText(null, isEn)
    };

    return {
      record: approved,
      language,
      isEn,
      dir: isEn ? "ltr" : "rtl",
      fontFamily: isEn ? "'Inter', 'Segoe UI', Roboto, sans-serif" : "'Cairo', 'Segoe UI', Tahoma, sans-serif",
      reportRef: approved.reportRef || `HV-REP-${approved.id.slice(-8).toUpperCase()}`,
      reportVersion: approved.reportVersion || "1.0.0",
      revisionNumber: approved.reportRevisionNumber || 1,
      dates,
      clinical,
      doctor,
      isWithdrawn: Boolean(approved.reportWithdrawal && approved.reportWithdrawal.status === "withdrawn"),
      withdrawal: approved.reportWithdrawal || null
    };
  }

  const ReportsService = {
    recordedClinicalText,
    getRecordedClinicalContent,
    getRecordedDoctorIdentity,
    applyApprovedReportSnapshot,
    buildQrPayload,
    createReportShareLink,
    revokeReportShareLink,
    verifyReportAuthenticity,
    formatReportForPdfExport
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ReportsService = ReportsService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReportsService;
  }
})(typeof window !== "undefined" ? window : globalThis);
