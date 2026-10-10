/**
 * Health Vibe AI - Diabetes Client Data Service
 * 
 * Manages diabetes patient information, relevant glucose/ketone/HbA1c measurements,
 * assessments linking, attending doctor reviews, clinical notes, follow-up protocols,
 * and approved reports.
 *
 * Strict Clinical Governance:
 * - Real persisted data only. Never synthesize medical values or clinical history.
 * - Every field explicitly classifies into:
 *   * known
 *   * unknown
 *   * not_provided
 *   * not_applicable
 * - Reuses existing authentication, RBAC permissions, and doctor assignment.
 * - Enforces patient privacy (patients see only their own data; doctors see only assigned patients).
 */

(function (global) {
  "use strict";

  const CLINICAL_FIELD_STATE = {
    KNOWN: "known",
    UNKNOWN: "unknown",
    NOT_PROVIDED: "not_provided",
    NOT_APPLICABLE: "not_applicable"
  };

  const DIABETES_TYPES = {
    TYPE_1: "type_1",
    TYPE_2: "type_2",
    GESTATIONAL: "gestational",
    PREDIABETES: "prediabetes",
    SECONDARY: "secondary",
    OTHER: "other",
    UNKNOWN: "unknown"
  };

  const GLUCOSE_CONTEXTS = {
    FASTING: "fasting",
    POSTPRANDIAL: "postprandial",
    RANDOM: "random",
    BEDTIME: "bedtime",
    PRE_MEAL: "pre_meal"
  };

  const MEASUREMENT_SOURCES = {
    MANUAL_PATIENT_LOG: "manual_patient_log",
    CGM_SENSOR: "cgm_sensor",
    BLUETOOTH_GLUCOMETER: "bluetooth_glucometer",
    CLINIC_READING: "clinic_reading",
    ACCREDITED_LAB_OCR: "accredited_lab_ocr"
  };

  const REVIEW_STATUSES = {
    PENDING: "pending",
    UNDER_REVIEW: "under_review",
    REVIEWED: "reviewed",
    APPROVED: "approved"
  };

  /**
   * Evaluates field value into one of the 4 strict clinical states:
   * known, unknown, not_provided, or not_applicable.
   *
   * @param {*} value
   * @param {object} [options]
   * @returns {{ state: string, value: *, unit: string, isRecorded: boolean, fieldKey: string }}
   */
  function classifyClinicalField(value, options = {}) {
    const {
      isApplicable = true,
      isUnknown = false,
      isProvided = true,
      unit = "",
      fieldKey = ""
    } = options;

    if (isApplicable === false) {
      return {
        state: CLINICAL_FIELD_STATE.NOT_APPLICABLE,
        value: null,
        unit,
        isRecorded: false,
        fieldKey
      };
    }

    if (isUnknown === true || value === "unknown" || value === "مجهول") {
      return {
        state: CLINICAL_FIELD_STATE.UNKNOWN,
        value: null,
        unit,
        isRecorded: false,
        fieldKey
      };
    }

    if (
      value === null ||
      value === undefined ||
      value === "" ||
      value === "not_provided" ||
      value === "غير مسجل" ||
      isProvided === false
    ) {
      return {
        state: CLINICAL_FIELD_STATE.NOT_PROVIDED,
        value: null,
        unit,
        isRecorded: false,
        fieldKey
      };
    }

    return {
      state: CLINICAL_FIELD_STATE.KNOWN,
      value,
      unit,
      isRecorded: true,
      fieldKey
    };
  }

  /**
   * Evaluates role-based permission for target patient diabetes record.
   *
   * @param {object} user - Current user object
   * @param {string} role - Current active role
   * @param {string} targetPatientId - UID of the patient
   * @param {object} [patientRecord] - Persisted record containing doctor assignment
   * @returns {{ allowed: boolean, reason?: string }}
   */
  function canAccessPatientDiabetes(user, role, targetPatientId, patientRecord = null) {
    if (!user || !user.uid) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }
    if (!targetPatientId) {
      return { allowed: false, reason: "MISSING_PATIENT_ID" };
    }

    const currentRole = role || (global.selectedRole || "patient");

    // Super Admin: platform-wide access
    if (currentRole === "super_admin") {
      return { allowed: true };
    }

    // Clinic Admin: clinic scope
    if (currentRole === "clinic_admin") {
      if (user.clinicId && patientRecord?.clinicId && user.clinicId !== patientRecord.clinicId) {
        return { allowed: false, reason: "CLINIC_MISMATCH" };
      }
      return { allowed: true };
    }

    // Patient: only own data
    if (currentRole === "patient") {
      if (user.uid === targetPatientId) {
        return { allowed: true };
      }
      return { allowed: false, reason: "PATIENT_CAN_ONLY_ACCESS_OWN_DATA" };
    }

    // Doctor: must be assigned to this patient
    if (currentRole === "doctor") {
      const rawAssignedId = patientRecord?.assignedDoctorId?.value || patientRecord?.assignedDoctorId || patientRecord?.doctorId?.value || patientRecord?.doctorId;
      const rawAssignedEmail = patientRecord?.assignedDoctorEmail?.value || patientRecord?.assignedDoctorEmail || patientRecord?.doctorEmail?.value || patientRecord?.doctorEmail;
      const isAssigned = (rawAssignedId && String(rawAssignedId) === String(user.uid)) ||
        (rawAssignedEmail && user.email && String(rawAssignedEmail).toLowerCase() === String(user.email).toLowerCase()) ||
        (Array.isArray(patientRecord?.assignedDoctorIds) && patientRecord.assignedDoctorIds.includes(user.uid));

      if (isAssigned) {
        return { allowed: true };
      }
      return { allowed: false, reason: "DOCTOR_NOT_ASSIGNED_TO_PATIENT" };
    }

    return { allowed: false, reason: "ROLE_UNAUTHORIZED" };
  }

  /**
   * Helper to perform authenticated calls to backend.
   */
  async function apiCall(endpoint, options = {}) {
    if (typeof global.callBackend === "function") {
      return await global.callBackend(endpoint, options.body ? JSON.parse(options.body) : undefined, options.method || "GET");
    }
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (global.auth && global.auth.currentUser && typeof global.auth.currentUser.getIdToken === "function") {
      try {
        const token = await global.auth.currentUser.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      } catch (e) {
        console.warn("[DiabetesService] Token generation failed:", e);
      }
    }
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  /**
   * Fetches patient diabetes bundle (overview, info, measurements, reviews, notes, follow-up, reports).
   */
  async function fetchPatientDiabetesBundle(patientId) {
    if (!patientId) return null;

    try {
      const data = await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}`);
      if (data && data.success && data.bundle) {
        return data.bundle;
      }
    } catch (e) {
      // Fallback: query Firestore directly if backend route offline or in local client mode
      if (global.db) {
        try {
          const doc = await global.db.collection("diabetes_records").doc(patientId).get();
          if (doc.exists) {
            return formatLocalBundle(patientId, doc.data());
          }
        } catch (dbErr) {
          console.warn("[DiabetesService] Firestore bundle fetch fallback error:", dbErr);
        }
      }
    }

    // Default clean unpopulated structure with strict unrecorded classification
    return formatLocalBundle(patientId, null);
  }

  /**
   * Formats a local bundle guaranteeing the 4 clinical field states without assumptions.
   */
  function formatLocalBundle(patientId, rawData = null) {
    const raw = rawData || {};
    return {
      patientId,
      info: {
        patientId: classifyClinicalField(patientId, { fieldKey: "patientId" }),
        patientName: classifyClinicalField(raw.patientName || raw.displayName || null, { fieldKey: "patientName" }),
        diabetesType: classifyClinicalField(raw.diabetesType, {
          isUnknown: raw.diabetesTypeUnknown === true,
          isApplicable: raw.isDiabetic !== false,
          fieldKey: "diabetesType"
        }),
        diagnosisDate: classifyClinicalField(raw.diagnosisDate, {
          isUnknown: raw.diagnosisDateUnknown === true,
          fieldKey: "diagnosisDate"
        }),
        fastingTarget: classifyClinicalField(raw.fastingTarget, {
          unit: "mg/dL",
          isApplicable: raw.hasCustomTargets !== false,
          fieldKey: "fastingTarget"
        }),
        postprandialTarget: classifyClinicalField(raw.postprandialTarget, {
          unit: "mg/dL",
          isApplicable: raw.hasCustomTargets !== false,
          fieldKey: "postprandialTarget"
        }),
        hba1cTarget: classifyClinicalField(raw.hba1cTarget, {
          unit: "%",
          isApplicable: raw.hasCustomTargets !== false,
          fieldKey: "hba1cTarget"
        }),
        activeInsulinRegimen: classifyClinicalField(raw.activeInsulinRegimen, {
          isApplicable: raw.isInsulinTreated !== false,
          fieldKey: "activeInsulinRegimen"
        }),
        comorbidities: classifyClinicalField(raw.comorbidities, { fieldKey: "comorbidities" }),
        assignedDoctorId: classifyClinicalField(raw.assignedDoctorId || raw.doctorId || null, { fieldKey: "assignedDoctorId" }),
        assignedDoctorName: classifyClinicalField(raw.assignedDoctorName || null, { fieldKey: "assignedDoctorName" }),
        lastReviewedAt: classifyClinicalField(raw.lastReviewedAt || null, { fieldKey: "lastReviewedAt" }),
        lastUpdated: raw.updatedAt || null
      },
      measurements: Array.isArray(raw.measurements) ? raw.measurements : [],
      clinicalNotes: Array.isArray(raw.clinicalNotes) ? raw.clinicalNotes : [],
      doctorReviews: Array.isArray(raw.doctorReviews) ? raw.doctorReviews : [],
      followupPlan: raw.followupPlan ? {
        ...raw.followupPlan,
        scheduledDateField: classifyClinicalField(raw.followupPlan.scheduledDate, { fieldKey: "scheduledDate" }),
        instructionsField: classifyClinicalField(raw.followupPlan.instructions, { fieldKey: "instructions" }),
        intervalDaysField: classifyClinicalField(raw.followupPlan.intervalDays, { unit: "days", fieldKey: "intervalDays" })
      } : null,
      approvedReports: Array.isArray(raw.approvedReports) ? raw.approvedReports : [],
      assessments: Array.isArray(raw.assessments) ? raw.assessments : [],
      attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
      clarifications: Array.isArray(raw.clarifications) ? raw.clarifications : [],
      measurementsCount: Array.isArray(raw.measurements) ? raw.measurements.length : 0,
      notesCount: Array.isArray(raw.clinicalNotes) ? raw.clinicalNotes : 0,
      reviewsCount: Array.isArray(raw.doctorReviews) ? raw.doctorReviews.length : 0,
      reportsCount: Array.isArray(raw.approvedReports) ? raw.approvedReports.length : 0,
      assessmentsCount: Array.isArray(raw.assessments) ? raw.assessments.length : 0,
      attachmentsCount: Array.isArray(raw.attachments) ? raw.attachments.length : 0,
      clarificationsCount: Array.isArray(raw.clarifications) ? raw.clarifications.length : 0
    };
  }

  // Active reviewed revisions registry: { [key]: revisionId }
  const _reviewedRevisions = {};

  /**
   * Records that the doctor has explicitly examined and acknowledged a specific clinical revision.
   */
  function acknowledgeRevision(key, revisionId) {
    if (!key || !revisionId) return;
    _reviewedRevisions[String(key)] = String(revisionId);
  }

  /**
   * Retrieves the revision ID acknowledged by the doctor for this case/patient.
   */
  function getAcknowledgedRevision(key) {
    return _reviewedRevisions[String(key)] || null;
  }

  /**
   * Determines if the active case review is stale (i.e. new revision arrived since review).
   */
  function isRevisionStale(key, currentRevisionId) {
    if (!currentRevisionId) return false;
    const reviewed = _reviewedRevisions[String(key)];
    if (!reviewed) return true; // Doctor hasn't reviewed any revision yet
    return String(reviewed) !== String(currentRevisionId);
  }

  /**
   * Draft storage keys helper.
   */
  function getDraftStorageKey(patientId) {
    return `hv_diabetes_draft_${String(patientId || "default")}`;
  }

  /**
   * Saves unsaved doctor draft notes & prescription entries to session/local storage.
   */
  function saveDraftNotes(patientId, draftData = {}) {
    if (!patientId) return;
    try {
      const payload = {
        ...draftData,
        savedAt: new Date().toISOString()
      };
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(getDraftStorageKey(patientId), JSON.stringify(payload));
      }
    } catch (e) {
      console.warn("[DiabetesService] Could not save draft notes:", e);
    }
  }

  /**
   * Retrieves preserved doctor draft notes during conflict resolution or re-renders.
   */
  function getDraftNotes(patientId) {
    if (!patientId) return null;
    try {
      if (typeof sessionStorage !== "undefined") {
        const item = sessionStorage.getItem(getDraftStorageKey(patientId));
        return item ? JSON.parse(item) : null;
      }
    } catch (e) {
      console.warn("[DiabetesService] Could not retrieve draft notes:", e);
    }
    return null;
  }

  /**
   * Clears preserved draft notes after successful approval.
   */
  function clearDraftNotes(patientId) {
    if (!patientId) return;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(getDraftStorageKey(patientId));
      }
    } catch (e) {
      console.warn("[DiabetesService] Could not clear draft notes:", e);
    }
  }

  /**
   * Uploads/links an attachment (lab report, PDF, glucose telemetry image).
   */
  async function addAttachment(patientId, attachmentData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/attachment`, {
      method: "POST",
      body: JSON.stringify(attachmentData)
    });
  }

  /**
   * Submits a patient clarification query or answer.
   */
  async function addClarification(patientId, clarificationData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/clarification`, {
      method: "POST",
      body: JSON.stringify(clarificationData)
    });
  }

  /**
   * Approves diabetes doctor review via authoritative server endpoint.
   * Enforces doctor assignment, revision freshness, and physician-authored diagnoses.
   */
  async function approveDiabetesReview(patientId, approvalPayload) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/approve-review`, {
      method: "POST",
      body: JSON.stringify(approvalPayload)
    });
  }

  /**
   * Normalizes Eastern Arabic-Indic digits to standard ASCII.
   */
  function normalizeDigits(str) {
    return String(str ?? '')
      .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  }

  /**
   * Validates structured diabetes assessment fields during client-side entry.
   */
  function validateAssessmentInput(input = {}, options = {}) {
    const errors = [];
    const { isUpdate = false } = options;

    if (!input.patientId && !isUpdate) {
      errors.push({ field: "patientId", message: "Patient ID is required." });
    }

    // Check measurements bounds if provided
    if (input.measurements) {
      const nowMs = Date.now() + 5 * 60 * 1000;
      for (const [type, m] of Object.entries(input.measurements)) {
        if (!m || m.value === undefined || m.value === null || m.value === '') continue;

        const val = Number(normalizeDigits(m.value));
        if (Number.isNaN(val)) {
          errors.push({ field: `measurements.${type}.value`, message: `Measurement '${type}' value must be numeric.` });
          continue;
        }

        const unit = String(m.unit || '').trim();
        if (type === 'fasting' || type === 'postprandial' || type === 'random' || type === 'bedtime') {
          if (unit === 'mg/dL' && (val < 20 || val > 1000)) {
            errors.push({ field: `measurements.${type}.value`, message: `Blood glucose (${unit}) must be between 20 and 1000.` });
          } else if (unit === 'mmol/L' && (val < 1.1 || val > 55.5)) {
            errors.push({ field: `measurements.${type}.value`, message: `Blood glucose (${unit}) must be between 1.1 and 55.5.` });
          }
        } else if (type === 'hba1c') {
          if (unit === '%' && (val < 3.0 || val > 25.0)) {
            errors.push({ field: `measurements.hba1c.value`, message: `HbA1c (%) must be between 3.0 and 25.0.` });
          } else if (unit === 'mmol/mol' && (val < 9 || val > 240)) {
            errors.push({ field: `measurements.hba1c.value`, message: `HbA1c (mmol/mol) must be between 9 and 240.` });
          }
        }

        if (m.measuredAt) {
          const tMs = new Date(m.measuredAt).getTime();
          if (!Number.isNaN(tMs) && tMs > nowMs) {
            errors.push({ field: `measurements.${type}.measuredAt`, message: `Measurement date cannot be in the future.` });
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Creates a new structured diabetes assessment.
   */
  async function createAssessment(patientId, assessmentData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/assessment`, {
      method: "POST",
      body: JSON.stringify(assessmentData)
    });
  }

  /**
   * Revises an existing structured diabetes assessment (versioned clinical revision).
   */
  async function updateAssessment(patientId, assessmentId, updates) {
    if (!patientId || !assessmentId) throw new Error("patientId and assessmentId are required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/assessment/${encodeURIComponent(assessmentId)}`, {
      method: "PUT",
      body: JSON.stringify(updates)
    });
  }

  /**
   * Retrieves all structured assessments for a patient.
   */
  async function getPatientAssessments(patientId) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/assessments`, {
      method: "GET"
    });
  }

  /**
   * Retrieves single assessment record with observations ledger and revisions ledger.
   */
  async function getAssessment(assessmentId) {
    if (!assessmentId) throw new Error("assessmentId is required");
    return await apiCall(`/api/diabetes/assessment/${encodeURIComponent(assessmentId)}`, {
      method: "GET"
    });
  }

  /**
   * Ingests a new real measurement for a patient.
   */
  async function saveMeasurement(patientId, measurementData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/measurement`, {
      method: "POST",
      body: JSON.stringify(measurementData)
    });
  }

  /**
   * Adds a clinical note authored by attending physician.
   */
  async function addClinicalNote(patientId, noteData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/clinical-note`, {
      method: "POST",
      body: JSON.stringify(noteData)
    });
  }

  /**
   * Records a formal doctor review for a patient case.
   */
  async function recordDoctorReview(patientId, reviewData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/review`, {
      method: "POST",
      body: JSON.stringify(reviewData)
    });
  }

  /**
   * Updates chronic follow-up plan.
   */
  async function updateFollowupPlan(patientId, planData) {
    if (!patientId) throw new Error("patientId is required");
    return await apiCall(`/api/diabetes/patient/${encodeURIComponent(patientId)}/followup`, {
      method: "POST",
      body: JSON.stringify(planData)
    });
  }

  /**
   * Returns clinical metadata and guidelines overview for the Diabetes module.
   */
  function getModuleOverview() {
    return {
      moduleId: "diabetes",
      specialtyNameEn: "Endocrinology & Diabetology",
      specialtyNameAr: "الغدد الصماء والسكري",
      governanceStatus: "UNDER_SPECIALIST_REVIEW",
      readinessFlag: false,
      clinicalDisclaimerEn: "Specialized clinical module for blood glucose tracking, endocrine consultations, and certified care plans. Autonomous diagnosis or medication titration is strictly prohibited. Verified endocrinologist sign-off required.",
      clinicalDisclaimerAr: "قسم سريري متخصص لمتابعة مستويات السكر في الدم، واستشارات الغدد الصماء، والخطط العلاجية المعتمدة. يُحظر تماماً التشخيص التلقائي أو تعديل الجرعات الدوائية ذاتياً. يتطلب الأمر توثيق واعتماد طبيب الغدد الصماء المرخص.",
      guidelines: [
        { name: "ADA Standards of Care in Diabetes (2026)", authority: "American Diabetes Association" },
        { name: "EASD Clinical Practice Guidelines", authority: "European Association for the Study of Diabetes" },
        { name: "Egyptian Diabetes Society Clinical Protocols", authority: "Egyptian Diabetes Association" }
      ]
    };
  }

  const DiabetesService = {
    CLINICAL_FIELD_STATE,
    DIABETES_TYPES,
    GLUCOSE_CONTEXTS,
    MEASUREMENT_SOURCES,
    REVIEW_STATUSES,
    classifyClinicalField,
    canAccessPatientDiabetes,
    fetchPatientDiabetesBundle,
    formatLocalBundle,
    validateAssessmentInput,
    createAssessment,
    updateAssessment,
    getPatientAssessments,
    getAssessment,
    saveMeasurement,
    addClinicalNote,
    recordDoctorReview,
    updateFollowupPlan,
    acknowledgeRevision,
    getAcknowledgedRevision,
    isRevisionStale,
    saveDraftNotes,
    getDraftNotes,
    clearDraftNotes,
    addAttachment,
    addClarification,
    approveDiabetesReview,
    getModuleOverview
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DiabetesService = DiabetesService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DiabetesService;
  }
})(typeof window !== "undefined" ? window : globalThis);
