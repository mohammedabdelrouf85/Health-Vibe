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
   * @param {object} record
   * @returns {string}
   */
  function buildQrPayload(record) {
    if (!record || !record.id) return "";
    const payload = {
      id: record.id,
      patientId: record.patientId || "",
      hash: record.reportHash || record.sha256 || "",
      approvedAt: record.approvedAt || record.reportSnapshot?.dates?.approvedAt || ""
    };
    return JSON.stringify(payload);
  }

  const ReportsService = {
    recordedClinicalText,
    getRecordedClinicalContent,
    getRecordedDoctorIdentity,
    applyApprovedReportSnapshot,
    buildQrPayload
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ReportsService = ReportsService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReportsService;
  }
})(typeof window !== "undefined" ? window : globalThis);
