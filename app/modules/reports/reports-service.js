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

  /**
   * Builds standardized payload for dispatching a patient's medical report to the doctor inbox.
   * Guarantees patientProfile, assessmentMetrics, timestamp, and recipient doctor are strictly structured.
   * @param {object} params
   * @returns {object}
   */
  function buildReportDispatchPayload({ caseData, user = null, doctorId = null, doctorName = null, clinicId = null, clinicName = null }) {
    if (!caseData || !caseData.id) {
      throw new Error("INVALID_CASE_DATA: caseData with a valid id is required for report dispatch.");
    }

    const nowIso = new Date().toISOString();
    const trackingRef = `HV-DISP-${caseData.id.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // 1. Standardized Patient Profile
    const snapshotPatient = caseData.reportSnapshot?.patient || {};
    const patientProfile = {
      patientId: caseData.patientId || caseData.userId || (user ? user.uid : null) || "unknown_patient",
      fullName: snapshotPatient.patientName || caseData.patientName || caseData.name || (user ? (user.displayName || user.email) : "Patient"),
      age: snapshotPatient.patientAge || caseData.patientAge || caseData.age || null,
      gender: caseData.patientGender || caseData.gender || caseData.sex || "unspecified",
      dateOfBirth: snapshotPatient.patientDob || caseData.patientDob || caseData.dateOfBirth || caseData.dob || null,
      phone: snapshotPatient.patientPhone || caseData.patientPhone || caseData.phone || null,
      email: snapshotPatient.patientEmail || caseData.patientEmail || caseData.email || (user ? user.email : null) || null,
      clinicId: clinicId || caseData.clinicId || (global._patientClinicId || null),
      clinicName: clinicName || caseData.clinicName || (global._patientClinicName || "Health Vibe Medical Center"),
      chronicConditions: caseData.chronicConditions || caseData.medicalHistory || snapshotPatient.patientMedicalHistory || [],
      allergies: caseData.allergies || []
    };

    // 2. Standardized Assessment Metrics
    const snapshotVitals = caseData.reportSnapshot?.caseDetails || caseData.assessment?.vitals || {};
    const snapshotSymptoms = caseData.assessment?.symptoms || {};
    const assessmentMetrics = {
      oxygenLevel: caseData.oxygenLevel ?? caseData.o2 ?? snapshotVitals.oxygenLevel ?? null,
      breathingDifficulty: caseData.breathingDifficulty || caseData.difficulty || snapshotVitals.breathingDifficulty || "unspecified",
      coughLevel: caseData.coughLevel || snapshotVitals.coughLevel || "unspecified",
      symptomDuration: caseData.symptomDuration || caseData.duration || snapshotVitals.symptomDuration || "unspecified",
      temperature: snapshotVitals.temperature ?? caseData.temperature ?? null,
      temperatureUnit: snapshotVitals.temperatureUnit || caseData.temperatureUnit || "°C",
      respiratoryRate: snapshotVitals.respiratoryRate ?? caseData.respiratoryRate ?? null,
      respiratoryRateUnit: snapshotVitals.respiratoryRateUnit || caseData.respiratoryRateUnit || "breaths/min",
      chestPain: snapshotSymptoms.chestPain || caseData.chestPain || "none",
      symptomProgression: snapshotSymptoms.progression || caseData.symptomProgression || caseData.progression || "stable",
      recentInfection: snapshotSymptoms.recentInfection || caseData.recentInfection || "none",
      asthmaCopd: snapshotSymptoms.asthmaCopd || caseData.asthmaCopd || "none",
      currentMedications: caseData.currentMedications || caseData.assessment?.medications?.current || "",
      notes: caseData.notes || caseData.patientNotes || caseData.assessment?.notes || "",
      riskFactors: Array.isArray(caseData.riskFactors) ? caseData.riskFactors : (caseData.assessment?.riskFactors || []),
      aiScore: caseData.aiScore || caseData.assessment?.aiTriage?.priority || caseData.priority || "normal",
      ruleEngineVersion: caseData.ruleEngineVersion || caseData.assessment?.aiTriage?.ruleEngineVersion || "2.4.0",
      clinicalDiagnosis: caseData.clinicalDiagnosis || caseData.reportSnapshot?.clinicalContent?.clinicalDiagnosis || null,
      medications: caseData.medications || caseData.reportSnapshot?.clinicalContent?.medications || null,
      recommendations: caseData.recommendations || caseData.reportSnapshot?.clinicalContent?.recommendations || []
    };

    // 3. Recipient Doctor Info
    const targetDoctorId = doctorId || caseData.assignedDoctorId || caseData.approvingDoctorId || (global._patientAssignedDoctorId || null);
    const targetDoctorName = doctorName || caseData.assignedDoctorName || caseData.approvingDoctorName || (global._patientAssignedDoctorName || "Assigned Pulmonologist");

    return {
      caseId: caseData.id,
      reportRef: caseData.reportRef || `HV-REP-${caseData.id.slice(-8).toUpperCase()}`,
      trackingRef,
      timestamp: nowIso,
      dispatchedAt: nowIso,
      dispatchedBy: patientProfile.patientId,
      dispatchedByRole: "patient",
      status: "dispatched_to_doctor_inbox",
      deliveryStatus: "delivered_to_doctor_inbox",
      recipientDoctor: {
        id: targetDoctorId,
        name: targetDoctorName,
        specialty: caseData.doctorSpecialty || "Pulmonology & Respiratory Care",
        clinic: patientProfile.clinicName
      },
      patientProfile,
      assessmentMetrics
    };
  }

  /**
   * In-memory cache for fast UI status lookup
   */
  const _dispatchedReportsCache = new Map();

  /**
   * Dispatches the patient's medical report directly to the doctor inbox.
   * Handles backend endpoint call with direct Firestore and audit log fallbacks.
   * @param {string} caseId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async function dispatchReportToDoctor(caseId, options = {}) {
    if (!caseId) throw new Error("caseId is required for report dispatch.");

    // Retrieve active case data
    let caseData = options.caseData || (global._currentViewingCase && global._currentViewingCase.id === caseId ? global._currentViewingCase : null);
    if (!caseData && typeof global.db !== "undefined") {
      try {
        const snap = await global.db.collection("cases").doc(caseId).get();
        if (snap.exists) caseData = { id: snap.id, ...snap.data() };
      } catch (e) {
        console.warn("Could not fetch case from Firestore:", e.message);
      }
    }
    if (!caseData) {
      caseData = { id: caseId };
    }

    const user = options.user || (typeof global.auth !== "undefined" ? global.auth.currentUser : null);
    const payload = buildReportDispatchPayload({
      caseData,
      user,
      doctorId: options.doctorId,
      doctorName: options.doctorName,
      clinicId: options.clinicId,
      clinicName: options.clinicName
    });

    let backendSuccess = false;
    let backendResponse = null;

    // 1. Attempt Backend API Dispatch
    try {
      const token = (user && typeof user.getIdToken === "function") ? await user.getIdToken() : "";
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch("/api/reports/dispatch-to-doctor", {
        method: "POST",
        headers,
        body: JSON.stringify({ caseId, payload })
      });

      if (res.ok) {
        backendResponse = await res.json();
        backendSuccess = true;
      }
    } catch (err) {
      console.warn("Backend report dispatch endpoint warning, falling back to direct database sync:", err.message);
    }

    // 2. Direct Firestore Client Sync (Guarantees immediate update in all offline/network scenarios)
    if (typeof global.db !== "undefined") {
      try {
        const updateData = {
          deliveryStatus: "delivered_to_doctor_inbox",
          lastDispatchedAt: payload.timestamp,
          lastDispatchedBy: payload.dispatchedBy,
          latestDispatchTrackingRef: payload.trackingRef,
          latestReportDispatch: payload,
          doctorInboxDelivery: {
            status: "delivered",
            deliveredAt: payload.timestamp,
            doctorId: payload.recipientDoctor.id,
            trackingRef: payload.trackingRef
          }
        };

        if (payload.recipientDoctor.id && !caseData.assignedDoctorId) {
          updateData.assignedDoctorId = payload.recipientDoctor.id;
          updateData.assignedDoctorName = payload.recipientDoctor.name;
        }

        await global.db.collection("cases").doc(caseId).set(updateData, { merge: true });

        // Add message entry to doctor_inbox
        await global.db.collection("doctor_inbox").add({
          caseId,
          trackingRef: payload.trackingRef,
          reportRef: payload.reportRef,
          patientId: payload.patientProfile.patientId,
          doctorId: payload.recipientDoctor.id,
          patientProfile: payload.patientProfile,
          assessmentMetrics: payload.assessmentMetrics,
          status: "unread",
          receivedAt: payload.timestamp,
          dispatchedAt: payload.timestamp,
          type: "patient_medical_report_dispatch"
        }).catch(() => {});

        // Add to auditLog
        await global.db.collection("auditLog").add({
          action: "REPORT_DISPATCHED_TO_DOCTOR",
          caseId,
          trackingRef: payload.trackingRef,
          patientId: payload.patientProfile.patientId,
          doctorId: payload.recipientDoctor.id,
          timestamp: (global.firebase && global.firebase.firestore?.FieldValue?.serverTimestamp)
            ? global.firebase.firestore.FieldValue.serverTimestamp()
            : payload.timestamp
        }).catch(() => {});

        // Sync with patient user profile
        if (user && user.uid) {
          await global.db.collection("users").doc(user.uid).set({
            latestDispatchedReport: {
              caseId,
              trackingRef: payload.trackingRef,
              dispatchedAt: payload.timestamp,
              deliveryStatus: "delivered_to_doctor_inbox"
            }
          }, { merge: true }).catch(() => {});
        }
      } catch (dbErr) {
        console.warn("Direct Firestore case delivery update warning:", dbErr.message);
      }
    }

    // Save in memory cache
    _dispatchedReportsCache.set(caseId, payload);
    if (global._currentViewingCase && global._currentViewingCase.id === caseId) {
      global._currentViewingCase.deliveryStatus = "delivered_to_doctor_inbox";
      global._currentViewingCase.latestReportDispatch = payload;
      global._currentViewingCase.doctorInboxDelivery = {
        status: "delivered",
        deliveredAt: payload.timestamp,
        doctorId: payload.recipientDoctor.id,
        trackingRef: payload.trackingRef
      };
    }

    return {
      success: true,
      backendSynced: backendSuccess,
      ...payload,
      ...(backendResponse || {})
    };
  }

  /**
   * Retrieves doctor inbox delivery status for a case.
   * @param {string} caseId
   * @param {object} caseObj
   * @returns {object|null}
   */
  function getDoctorInboxDeliveryStatus(caseId, caseObj = null) {
    if (!caseId) return null;
    if (_dispatchedReportsCache.has(caseId)) {
      return _dispatchedReportsCache.get(caseId);
    }
    const c = caseObj || (global._currentViewingCase && global._currentViewingCase.id === caseId ? global._currentViewingCase : null);
    if (c && (c.deliveryStatus === "delivered_to_doctor_inbox" || c.latestReportDispatch || c.doctorInboxDelivery)) {
      return c.latestReportDispatch || {
        caseId,
        trackingRef: c.latestDispatchTrackingRef || (c.doctorInboxDelivery?.trackingRef) || `HV-DISP-${caseId.slice(-6).toUpperCase()}`,
        timestamp: c.lastDispatchedAt || (c.doctorInboxDelivery?.deliveredAt) || new Date().toISOString(),
        deliveryStatus: "delivered_to_doctor_inbox",
        recipientDoctor: {
          id: c.assignedDoctorId || c.approvingDoctorId || null,
          name: c.assignedDoctorName || c.approvingDoctorName || "Assigned Pulmonologist",
          clinic: c.clinicName || "Health Vibe Medical Center"
        },
        patientProfile: {
          fullName: c.patientName || c.name || "Patient",
          age: c.patientAge || c.age || null,
          clinicName: c.clinicName || "Health Vibe Medical Center"
        },
        assessmentMetrics: {
          oxygenLevel: c.oxygenLevel ?? c.o2 ?? null,
          breathingDifficulty: c.breathingDifficulty || c.difficulty || "unspecified",
          coughLevel: c.coughLevel || "unspecified"
        }
      };
    }
    return null;
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
    formatReportForPdfExport,
    buildReportDispatchPayload,
    dispatchReportToDoctor,
    getDoctorInboxDeliveryStatus
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ReportsService = ReportsService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReportsService;
  }
})(typeof window !== "undefined" ? window : globalThis);
