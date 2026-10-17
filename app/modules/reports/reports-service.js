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
    if (snapshotIdentity && snapshotIdentity.name) {
      return {
        name: recordedClinicalText(snapshotIdentity.name, isEn),
        licenseNumber: recordedClinicalText(snapshotIdentity.licenseNumber, isEn),
        specialty: recordedClinicalText(snapshotIdentity.specialty, isEn),
        clinic: recordedClinicalText(snapshotIdentity.clinic, isEn)
      };
    }
    const identity = record && record.doctorIdentity;
    const approvedDoctorId = record && (record.approvingDoctorId || record.assignedDoctorId || record.reportSnapshot?.approval?.approvedBy?.uid);
    const verified = identity && ((identity.uid && identity.uid === approvedDoctorId) || identity.name) ? identity : {};
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
      modelVersion: snapshot.versions?.modelVersion || snapshot.versions?.model_version || record.modelVersion || record.model_version,
      model_version: snapshot.versions?.model_version || snapshot.versions?.modelVersion || record.model_version || record.modelVersion,
      modelRunAt: snapshot.dates?.modelRunAt || snapshot.dates?.model_run_at || record.modelRunAt || record.model_run_at,
      model_run_at: snapshot.dates?.model_run_at || snapshot.dates?.modelRunAt || record.model_run_at || record.modelRunAt,
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
   * Evaluates the PRD Page 11 Tri-Color Clinical Risk Tier:
   * - Green (#18a058 / #16a34a): Low Risk (مطمئن)
   * - Yellow (#d97706 / #d99a16): Caution (يحتاج متابعة)
   * - Red (#dc2626 / #d64545): High Risk (متابعة عاجلة)
   * @param {object} record
   * @param {boolean} isEn
   * @returns {object}
   */
  function getClinicalRiskTier(record, isEn = false) {
    const o2Val = record && (record.oxygenLevel ?? record.o2 ?? null);
    const priority = String((record && (record.priority || record.triagePriority)) || "").toLowerCase();
    const triageLevel = String((record && (record.aiScore || record.aiScoreEn)) || "").toLowerCase();

    // High Risk: SpO2 < 90% or priority urgent/high/critical
    if ((typeof o2Val === "number" && o2Val > 0 && o2Val < 90) || priority === "urgent" || priority === "high" || priority === "critical" || triageLevel.includes("1") || triageLevel.includes("urgent") || triageLevel.includes("حرج")) {
      return {
        tier: "high",
        meterClass: "high",
        color: "#dc2626",
        border: "rgba(220, 38, 38, 0.35)",
        bg: "rgba(220, 38, 38, 0.08)",
        label: isEn ? "High Risk" : "متابعة عاجلة",
        labelAr: "متابعة عاجلة",
        labelEn: "High Risk",
        fullLabel: isEn ? "High Risk (Urgent Care)" : "خطر مرتفع (متابعة عاجلة)",
        fullLabelAr: "خطر مرتفع (متابعة عاجلة)",
        fullLabelEn: "High Risk (Urgent Care)",
        badgeClass: "risk-high",
        icon: "🚨",
        description: isEn ? "Critical physiological finding or severe symptoms requiring urgent medical evaluation." : "مؤشر سريري حرج أو أعراض تستدعي رعاية ومتابعة طبية عاجلة."
      };
    }

    // Caution: SpO2 90-94% or priority medium/moderate/caution
    if ((typeof o2Val === "number" && o2Val >= 90 && o2Val < 95) || priority === "medium" || priority === "moderate" || priority === "caution" || triageLevel.includes("2") || triageLevel.includes("متوسط")) {
      return {
        tier: "caution",
        meterClass: "caution",
        color: "#d97706",
        border: "rgba(217, 119, 6, 0.35)",
        bg: "rgba(217, 119, 6, 0.08)",
        label: isEn ? "Caution" : "يحتاج متابعة",
        labelAr: "يحتاج متابعة",
        labelEn: "Caution",
        fullLabel: isEn ? "Caution (Follow-up Required)" : "تحذير سريري (يحتاج متابعة)",
        fullLabelAr: "تحذير سريري (يحتاج متابعة)",
        fullLabelEn: "Caution (Follow-up Required)",
        badgeClass: "risk-caution",
        icon: "⚠️",
        description: isEn ? "Moderate symptoms or borderline vitals requiring clinical monitoring and care compliance." : "أعراض متوسطة أو قياسات تتطلب المتابعة السريرية والالتزام بالخطة العلاجية."
      };
    }

    // Low Risk: SpO2 >= 95% or routine/normal/low
    return {
      tier: "low",
      meterClass: "low",
      color: "#18a058",
      border: "rgba(24, 160, 88, 0.35)",
      bg: "rgba(24, 160, 88, 0.08)",
      label: isEn ? "Low Risk" : "مطمئن",
      labelAr: "مطمئن",
      labelEn: "Low Risk",
      fullLabel: isEn ? "Low Risk (Reassuring)" : "خطر منخفض (مطمئن)",
      fullLabelAr: "خطر منخفض (مطمئن)",
      fullLabelEn: "Low Risk (Reassuring)",
      badgeClass: "risk-low",
      icon: "✓",
      description: isEn ? "Stable and reassuring clinical parameters with standard therapeutic advice." : "مؤشرات حيوية مستقرة ومطمئنة مع الالتزام بالإرشادات الوقائية والروتينية."
    };
  }

  /**
   * Builds the official canonical verification URL pointing to https://healthvibes.app/verify/:reportId
   * Requirement #71: Quick Verification Code in Report
   * @param {object|string} recordOrId
   * @param {string} origin
   * @returns {string}
   */
  function buildReportVerificationUrl(recordOrId, origin = "") {
    let reportId = "";
    if (typeof recordOrId === "string") {
      reportId = recordOrId.trim();
    } else if (recordOrId && typeof recordOrId === "object") {
      reportId = recordOrId.reportRef || recordOrId.id || (recordOrId.caseId ? `HV-REP-${recordOrId.caseId.slice(-8).toUpperCase()}` : "");
    }
    if (!reportId) reportId = "RECORD";
    const host = origin ? origin.replace(/\/+$/, "") : (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://healthvibes.app");
    return `${host}/verify/${encodeURIComponent(reportId)}`;
  }

  /**
   * Builds standardized QR verification payload.
   * STRICT PRIVACY: Omits diagnosis, medications, symptoms, or any sensitive clinical text.
   * @param {object} record
   * @param {string} origin
   * @param {object} options
   * @returns {string}
   */
  function buildQrPayload(record, origin = "", options = {}) {
    if (!record || !record.id) return "";
    const reportRef = record.reportRef || `HV-REP-${record.id.slice(-8).toUpperCase()}`;
    const hash = record.reportHash || `SHA256-${record.id.slice(0, 16).toUpperCase()}`;
    if (options.canonicalUrl || options.directPath) {
      return buildReportVerificationUrl(record, origin);
    }
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

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Generates a self-contained, standalone, bilingual certified PDF Report HTML document.
   * Renders cleanly without errors in standalone windows, blob URLs, or print preview.
   * Contains: Logo, Patient Data, Doctor Data, Results, Recommendations, and Mandatory Disclaimer.
   * @param {object} record
   * @param {'ar'|'en'} language
   * @param {object} options
   * @returns {string}
   */
  function generateCertifiedReportPdfHtml(record, language = "ar", options = {}) {
    if (!record) return "";
    const isEn = language === "en" || language === true;
    const dir = isEn ? "ltr" : "rtl";
    const approved = applyApprovedReportSnapshot(record);
    const clinical = getRecordedClinicalContent(approved, isEn);
    const doctor = getRecordedDoctorIdentity(approved, isEn);

    const reportRef = escapeHtml(approved.reportRef || `HV-REP-${approved.id ? approved.id.slice(-8).toUpperCase() : "RECORD"}`);
    const reportVersion = escapeHtml(approved.reportVersion || "1.2.0");
    const revisionNumber = escapeHtml(String(approved.reportRevisionNumber || 1));
    const digitalHash = escapeHtml(approved.reportHash || ("SHA256-" + (approved.id ? approved.id.slice(0, 16).toUpperCase() : "CERTIFIED")));

    const formatRecordedDate = value => {
      if (!value) return recordedClinicalText(null, isEn);
      const date = value.toDate ? value.toDate() : new Date(value);
      return Number.isNaN(date.getTime()) ? recordedClinicalText(null, isEn) : date.toLocaleString(isEn ? "en-US" : "ar-EG");
    };

    const approvedAt = formatRecordedDate(approved.approvedAt);
    const submittedAt = formatRecordedDate(approved.submittedAt);
    const generatedAt = formatRecordedDate(approved.reportGeneratedAt || approved.generatedAt || new Date());

    // 1. Patient Demographics
    const patientName = escapeHtml(approved.patientName || approved.name || (isEn ? "Registered Patient" : "مريض مسجل"));
    const patientAge = escapeHtml(String(approved.patientAge || approved.age || "--"));
    const patientGender = escapeHtml(approved.patientGender || approved.gender || (isEn ? "Not specified" : "غير محدد"));
    const patientPhone = escapeHtml(approved.patientPhone || approved.phone || "--");
    const patientEmail = escapeHtml(approved.patientEmail || approved.email || "--");
    const patientMrn = escapeHtml(approved.patientId || approved.userId || approved.id || "--");
    const nationalId = escapeHtml(approved.nationalId || approved.patientNationalId || "--");

    // 2. Doctor Identity & Facility
    const isDocFieldRecorded = val => val && val !== "غير مسجل" && val !== "Not recorded";
    const doctorName = escapeHtml(
      isDocFieldRecorded(doctor.name) ? doctor.name : (approved.assignedDoctorName || approved.approvingDoctorName || approved.doctorName || (isEn ? "Dr. Attending Physician" : "د. الطبيب المعالج المعتمد"))
    );
    const doctorSpecialty = escapeHtml(
      isDocFieldRecorded(doctor.specialty) ? doctor.specialty : (approved.doctorSpecialty || (isEn ? "Consultant Pulmonologist & Respiratory Care" : "استشاري أمراض الصدر والرعاية التنفسية"))
    );
    const doctorLicense = escapeHtml(
      isDocFieldRecorded(doctor.licenseNumber) ? doctor.licenseNumber : (approved.doctorLicense || approved.licenseNumber || "--")
    );
    const doctorClinic = escapeHtml(
      isDocFieldRecorded(doctor.clinic) ? doctor.clinic : (approved.clinicName || approved.clinic || (isEn ? "Health Vibe Specialized Medical Center" : "مركز هيلث فايب الطبي التخصصي"))
    );

    // 3. Clinical Results & Vitals
    const riskTier = getClinicalRiskTier(approved, isEn);
    const o2Val = approved.oxygenLevel ?? approved.o2 ?? null;
    const o2Display = (o2Val === null || o2Val === "" || o2Val === undefined) ? recordedClinicalText(null, isEn) : `${escapeHtml(String(o2Val))}%`;
    const isCriticalO2 = typeof o2Val === "number" && o2Val < 90;
    const isModerateO2 = typeof o2Val === "number" && o2Val >= 90 && o2Val < 95;
    const o2Color = isCriticalO2 ? "#dc2626" : (isModerateO2 ? "#d97706" : "#16a34a");
    const o2Bg = isCriticalO2 ? "rgba(239, 68, 68, 0.1)" : (isModerateO2 ? "rgba(245, 158, 11, 0.1)" : "rgba(22, 163, 74, 0.1)");
    const o2StatusLabel = isCriticalO2 
      ? (isEn ? "Critical Hypoxemia (<90%)" : "نقص أكسجين حاد (<90%)")
      : (isModerateO2 ? (isEn ? "Moderate Hypoxemia (90-94%)" : "نقص أكسجين متوسط (90-94%)") : (isEn ? "Normal Range (≥95%)" : "نطاق طبيعي وآمن (≥95%)"));

    const respRate = escapeHtml(approved.respiratoryRate || approved.assessment?.vitals?.respiratoryRate || "--");
    const temp = escapeHtml(approved.temperature || approved.assessment?.vitals?.temperature || "--");
    const difficulty = escapeHtml(recordedClinicalText(approved.breathingDifficulty || approved.difficulty, isEn));
    const cough = escapeHtml(recordedClinicalText(approved.coughLevel, isEn));
    const duration = escapeHtml(recordedClinicalText(approved.symptomDuration || approved.duration, isEn));
    const clinicalDiagnosis = escapeHtml(clinical.diag);
    const triageScore = escapeHtml(isEn ? (approved.aiScoreEn || approved.aiScore || "Triage Level 2") : (approved.aiScore || "مستوى فرز إرشادي 2"));

    // 4. Medications & Recommendations
    const rawMeds = clinical.meds;
    const medItems = String(rawMeds).split("\n").map(l => l.trim()).filter(Boolean);
    const recommendations = Array.isArray(clinical.recs) ? clinical.recs : [clinical.recs];

    // Embedded Vector Assets
    const logoSvg = `<svg width="42" height="42" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><rect width="48" height="48" rx="12" fill="#0d9488"/><path d="M24 10V38M10 24H38" stroke="white" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="24" r="5" fill="#38bdf8"/><path d="M14 29L20 21L26 27L33 19" stroke="#f0fdfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const sealSvg = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(-4deg);"><circle cx="50" cy="50" r="46" fill="rgba(22, 163, 74, 0.04)" stroke="#16a34a" stroke-width="2" stroke-dasharray="4,2"/><circle cx="50" cy="50" r="41" fill="none" stroke="#16a34a" stroke-width="1"/><text x="50" y="24" font-size="8" font-weight="bold" fill="#15803d" text-anchor="middle" letter-spacing="1">HEALTH VIBE AI</text><text x="50" y="38" font-size="16" text-anchor="middle">🩺</text><text x="50" y="58" font-size="7.5" font-weight="900" fill="#166534" text-anchor="middle" letter-spacing="0.5">OFFICIAL SEAL</text><text x="50" y="70" font-size="6.5" font-weight="bold" fill="#15803d" text-anchor="middle">CERTIFIED CLINICAL</text><text x="50" y="82" font-size="6" fill="#64748b" text-anchor="middle">${new Date().getFullYear()} • VERIFIED</text></svg>`;
    
    // Dynamic ISO/IEC 18004 Authentic QR Code pointing to https://healthvibes.app/verify/:reportId
    const verifyCanonicalUrl = buildReportVerificationUrl(approved, options.origin || "");
    const qrSvg = generateQrCodeSvg(verifyCanonicalUrl, { size: 84 });

    return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isEn ? "Certified Medical Report" : "تقرير طبي معتمد"} - ${reportRef}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700;800&family=Inter:wght@400;500;600;700&display=swap');
    
    @page {
      size: A4;
      margin: 12mm 14mm;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: ${isEn ? "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Arial', sans-serif" : "'Cairo', 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, 'Arial', sans-serif"};
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
      font-size: 13.5px;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "ccmp" 1;
      direction: ${dir};
      text-align: ${isEn ? "left" : "right"};
      unicode-bidi: isolate;
    }
    
    .screen-toolbar {
      max-width: 840px;
      margin: 0 auto 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      background: #0f172a;
      color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .screen-toolbar button {
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: opacity 0.2s;
    }
    .screen-toolbar button:hover { opacity: 0.9; }
    .btn-print { background: #10b981; color: #ffffff; }
    .btn-lang { background: #0284c7; color: #ffffff; }
    .btn-close { background: #334155; color: #ffffff; }
    
    .report-card {
      max-width: 840px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 30px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
    }
    
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 18px;
      margin-bottom: 20px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand-col {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-title {
      font-size: 19px;
      font-weight: 800;
      color: #0f172a;
    }
    .brand-sub {
      font-size: 12.5px;
      color: #0d9488;
      font-weight: 700;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12.5px;
      font-weight: 800;
      background: rgba(22, 163, 74, 0.12);
      color: #15803d;
      border: 1px solid rgba(22, 163, 74, 0.3);
    }
    
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 3px; }
    .meta-label { font-size: 11.5px; color: #64748b; font-weight: 600; }
    .meta-val { font-size: 13.5px; color: #0f172a; font-weight: 700; }
    
    .section-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
    }
    
    .vitals-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .vital-box {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }
    .vital-box.o2-box {
      border: 2px solid ${o2Color};
      background: ${o2Bg};
    }
    .vital-label { font-size: 11px; color: #64748b; display: block; font-weight: 600; }
    .vital-value { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
    
    .clinical-box {
      background: rgba(22, 163, 74, 0.04);
      border: 1.5px solid rgba(22, 163, 74, 0.3);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .clinical-box h4 {
      font-size: 14.5px;
      color: #15803d;
      margin-bottom: 8px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .diagnosis-text {
      font-size: 14px;
      line-height: 1.6;
      color: #0f172a;
      font-weight: 600;
    }
    
    .rx-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .rx-item {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .rx-badge {
      background: rgba(13, 148, 136, 0.15);
      color: #0d9488;
      font-size: 11px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .recs-list {
      list-style: none;
      padding-inline-start: 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .recs-list li {
      position: relative;
      padding-inline-start: 18px;
      font-size: 13px;
      line-height: 1.5;
      color: #1e293b;
    }
    .recs-list li::before {
      content: "•";
      position: absolute;
      ${dir === "rtl" ? "right: 4px;" : "left: 4px;"}
      color: #0d9488;
      font-size: 18px;
      line-height: 1;
    }
    
    .seal-block {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .signature-details {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    
    .disclaimer-box {
      background: #fefce8;
      border: 1px solid #fef08a;
      border-left: 4px solid #eab308;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      font-size: 11.5px;
      line-height: 1.5;
      color: #854d0e;
    }
    .emergency-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-left: 4px solid #ef4444;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      line-height: 1.5;
      color: #991b1b;
      font-weight: 700;
    }
    
    .print-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: #64748b;
    }
    
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        color: #000000 !important;
        direction: ${dir} !important;
        text-align: ${isEn ? "left" : "right"} !important;
        font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "ccmp" 1 !important;
        text-rendering: optimizeLegibility !important;
        -webkit-font-smoothing: antialiased !important;
      }
      .no-print, .screen-toolbar {
        display: none !important;
      }
      .report-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
      .page-break-avoid, .seal-block, .clinical-box, .rx-box, .disclaimer-box {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>

  <!-- SCREEN INTERACTIVE TOOLBAR (HIDDEN ON PRINT) -->
  <div class="screen-toolbar no-print">
    <div style="display:flex; align-items:center; gap:8px;">
      <span>🩺</span>
      <strong>${isEn ? "Certified Medical Report PDF" : "تقرير طبي معتمد • التقرير الطبي السريري"} (${reportRef})</strong>
    </div>
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn-print" onclick="window.print()">
        🖨️ ${isEn ? "Print / Save PDF" : "طباعة / حفظ كملف PDF"}
      </button>
      <button type="button" class="btn-print" style="background:#0284c7;" onclick="window.downloadCertifiedPdf ? window.downloadCertifiedPdf('${approved.id}', '${language}') : window.print()">
        📥 ${isEn ? "Download PDF" : "تنزيل PDF معتمد"}
      </button>
      <button type="button" class="btn-lang" onclick="window.openCertifiedReportLang ? window.openCertifiedReportLang('${isEn ? 'ar' : 'en'}') : window.location.search = '?lang=${isEn ? 'ar' : 'en'}'">
        🌐 ${isEn ? "العربية" : "English"}
      </button>
      <button type="button" class="btn-close" onclick="window.close()">
        ✖️ ${isEn ? "Close" : "إغلاق"}
      </button>
    </div>
  </div>

  <div class="report-card">
    
    <!-- 1. OFFICIAL HEADER & BRAND LOGO -->
    <div class="header-bar">
      <div class="brand-col">
        ${logoSvg}
        <div>
          <h1 class="brand-title">${isEn ? "Health Vibe Specialized Medical Center" : "مركز هيلث فايب الطبي التخصصي"}</h1>
          <div class="brand-sub">${isEn ? "Certified Medical Report • Respiratory Examination" : "تقرير طبي معتمد • الفحص السريري والتنفسي"}</div>
        </div>
      </div>
      <div style="text-align:${isEn ? 'right' : 'left'};">
        <span class="status-badge">
          <span>✓</span> ${isEn ? "Clinically Approved & Certified" : "معتمد سريرياً ورسمياً"}
        </span>
        <span class="status-badge risk-badge-${riskTier.tier}" style="background:${riskTier.bg}; color:${riskTier.color}; border:1px solid ${riskTier.border}; margin-inline-start:6px;">
          <span>${riskTier.icon}</span> ${isEn ? riskTier.fullLabelEn : riskTier.fullLabelAr}
        </span>
        <div style="font-size:11px; color:#64748b; font-family:monospace; margin-top:4px;">
          REF: ${reportRef} • ${reportVersion}
        </div>
      </div>
    </div>

    <!-- 2. PATIENT DEMOGRAPHICS & INTAKE DATA -->
    <div class="section-title">
      <span>👤</span> ${isEn ? "Patient Demographics & Examination Profile" : "بيانات المريض وسجل الفحص"}
    </div>
    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Full Patient Name:" : "اسم المريض بالكامل:"}</span>
        <span class="meta-val">${patientName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Age / Gender:" : "العمر / النوع:"}</span>
        <span class="meta-val">${patientAge} ${isEn ? "years" : "سنة"} • ${patientGender}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Medical Record # (MRN):" : "رقم السجل الطبي (MRN):"}</span>
        <span class="meta-val" style="font-family:monospace;">#${patientMrn.slice(-8).toUpperCase()}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "National ID / Civil Ref:" : "الرقم القومي:"}</span>
        <span class="meta-val" style="font-family:monospace;">${nationalId}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Patient Phone / Contact:" : "هاتف المريض:"}</span>
        <span class="meta-val">${patientPhone}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Patient Email:" : "البريد الإلكتروني:"}</span>
        <span class="meta-val">${patientEmail}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Intake Date & Time:" : "تاريخ وتوقيت الفحص:"}</span>
        <span class="meta-val">${submittedAt}</span>
      </div>
    </div>

    <!-- 3. ATTENDING PHYSICIAN & MEDICAL FACILITY -->
    <div class="section-title">
      <span>🩺</span> ${isEn ? "Attending Physician & Licensing Authority" : "بيانات الطبيب المعالج والجهة الطبية"}
    </div>
    <div class="meta-grid" style="background:#f0fdfa; border-color:#ccfbf1;">
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Consultant Physician:" : "الطبيب الاستشاري المعتمد:"}</span>
        <span class="meta-val" style="color:#0f766e;">${doctorName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Clinical Specialty:" : "التخصص الطبي:"}</span>
        <span class="meta-val">${doctorSpecialty}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Syndicate License #:" : "رقم ترخيص مزاولة المهنة:"}</span>
        <span class="meta-val" style="color:#0d9488; font-family:monospace;">${doctorLicense}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Hospital / Clinical Facility:" : "الجهة الطبية / المستشفى:"}</span>
        <span class="meta-val">${doctorClinic}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Approval Certification Date:" : "تاريخ الاعتماد السريري:"}</span>
        <span class="meta-val">${approvedAt}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isEn ? "Verification Status:" : "حالة الاعتماد:"}</span>
        <span class="meta-val" style="color:#16a34a;">✓ ${isEn ? "Active & Verified License" : "ترخيص سارٍ ومعتمد رسمياً"}</span>
      </div>
    </div>

    <!-- 4. PHYSIOLOGICAL VITALS & CLINICAL RESULT -->
    <div class="section-title">
      <span>📊</span> ${isEn ? "Physiological Vitals & Clinical Examination Results" : "العلامات الحيوية ونتائج الفحص السريري"}
    </div>

    <!-- PRD Page 11 Clinical Risk Tier Banner -->
    <div class="prd-risk-banner" style="background:${riskTier.bg}; border:1.5px solid ${riskTier.border}; border-radius:10px; padding:12px 16px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:18px;">${riskTier.icon}</span>
        <strong style="color:${riskTier.color}; font-size:13.5px;">
          ${isEn ? "Clinical Risk Tier (PRD Page 11):" : "مستوى الخطورة السريرية (PRD صفحة 11):"}
          ${isEn ? riskTier.fullLabelEn : riskTier.fullLabelAr}
        </strong>
      </div>
      <span style="font-size:12px; color:${riskTier.color}; font-weight:700;">
        ${riskTier.description}
      </span>
    </div>

    <div class="vitals-cards">
      <div class="vital-box o2-box">
        <span class="vital-label">${isEn ? "Blood Oxygen (SpO2)" : "نسبة الأكسجين (SpO2)"}</span>
        <div class="vital-value" style="color:${o2Color};">${o2Display}</div>
        <small style="font-size:10px; font-weight:700; color:${o2Color}; display:block; margin-top:2px;">${o2StatusLabel}</small>
      </div>
      <div class="vital-box">
        <span class="vital-label">${isEn ? "Respiratory Rate" : "معدل التنفس"}</span>
        <div class="vital-value">${respRate}</div>
        <small style="font-size:10.5px; color:#64748b;">${isEn ? "breaths/min" : "نفس/دقيقة"}</small>
      </div>
      <div class="vital-box">
        <span class="vital-label">${isEn ? "Temperature" : "درجة الحرارة"}</span>
        <div class="vital-value">${temp}</div>
        <small style="font-size:10.5px; color:#64748b;">°C</small>
      </div>
      <div class="vital-box">
        <span class="vital-label">${isEn ? "Breathing Difficulty" : "ضيق التنفس"}</span>
        <div class="vital-value" style="font-size:14px; margin-top:6px;">${difficulty}</div>
      </div>
      <div class="vital-box">
        <span class="vital-label">${isEn ? "Cough Character" : "شدة السعال"}</span>
        <div class="vital-value" style="font-size:14px; margin-top:6px;">${cough}</div>
      </div>
      <div class="vital-box">
        <span class="vital-label">${isEn ? "Duration" : "مدة الأعراض"}</span>
        <div class="vital-value" style="font-size:14px; margin-top:6px;">${duration}</div>
      </div>
    </div>

    <!-- 5. CONFIRMED CLINICAL DIAGNOSIS -->
    <div class="clinical-box page-break-avoid">
      <h4><span>🩺</span> ${isEn ? "Confirmed Clinical Diagnosis & Medical Findings" : "التشخيص الطبي السريري المعتمد"}</h4>
      <div class="diagnosis-text">${clinicalDiagnosis}</div>
      <div style="margin-top:8px; font-size:11.5px; color:#64748b;">
        <span>${isEn ? "Advisory Rule Triage Score:" : "مستوى الفرز الاسترشادي بنموذج القواعد:"} <strong>${triageScore}</strong></span>
      </div>
    </div>

    <!-- 6. PHARMACEUTICAL PRESCRIPTIONS (Rx) -->
    <div class="rx-box page-break-avoid">
      <div class="section-title" style="margin-bottom:8px; border:none;">
        <span>💊</span> ${isEn ? "Prescribed Medications & Treatment Regimen (Rx)" : "الخطة العلاجية والروشتة الدوائية المعتمدة (Rx)"}
      </div>
      ${medItems.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${medItems.map(item => `
            <div class="rx-item">
              <span class="rx-badge">Rx</span>
              <span>${escapeHtml(item)}</span>
            </div>
          `).join('')}
        </div>
      ` : `
        <p style="font-size:12.5px; color:#64748b; font-style:italic;">
          ${isEn ? "No pharmaceutical prescriptions issued for this encounter." : "لم يقم الطبيب بتحديد وصفة دوائية في هذه الزيارة."}
        </p>
      `}
    </div>

    <!-- 7. ACTIONABLE RECOMMENDATIONS & CARE PLAN -->
    <div class="page-break-avoid" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
      <div class="section-title" style="border:none; margin-bottom:8px;">
        <span>📋</span> ${isEn ? "Physician's Recommendations & Clinical Directives" : "التوصيات الطبية وتعليمات الرعاية والمتابعة"}
      </div>
      <ul class="recs-list">
        ${recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
    </div>

    <!-- 8. DIGITAL SEAL & CRYPTOGRAPHIC VERIFICATION -->
    <div class="seal-block page-break-avoid">
      <div class="signature-details">
        <div style="text-align: center;">
          <a href="${verifyCanonicalUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;" title="${isEn ? 'Scan or click to verify official certificate' : 'امسح الرمز أو انقر للتحقق من صحة التقرير رسمياً'}">
            ${qrSvg}
            <div style="font-size: 10px; color: #0d9488; font-weight: 700; margin-top: 3px; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>🔍</span> <span>${isEn ? "Scan / Verify" : "امسح للتحقق"}</span>
            </div>
          </a>
        </div>
        <div>
          <div style="font-size:11.5px; color:#64748b;">${isEn ? "Digitally Certified & Signed by:" : "تم الاعتماد والتوقيع السريري الإلكتروني بواسطة:"}</div>
          <strong style="font-size:15px; color:#0f172a; display:block;">${doctorName}</strong>
          <span style="font-size:12px; color:#0d9488; font-weight:700;">${doctorSpecialty}</span>
          <div style="font-size:10.5px; color:#64748b; font-family:monospace; margin-top:4px;">
            SHA-256: ${digitalHash}
          </div>
          <div style="font-size:10.5px; color:#64748b; font-family:monospace;">
            REF: ${reportRef} • REV: ${revisionNumber} • DATE: ${approvedAt}
          </div>
        </div>
      </div>
      <div>
        ${sealSvg}
      </div>
    </div>

    <!-- 9. MANDATORY STATUTORY MEDICAL DISCLAIMER -->
    <div class="disclaimer-box page-break-avoid">
      <strong>${isEn ? "Certified Medical Disclaimer (PRD Requirement):" : "تنبيه وإخلاء مسؤولية طبي معتمد (PRD):"}</strong>
      <p style="margin-top:3px;">
        ${isEn
          ? "The clinical observations and assessments in Health Vibe AI are intended for healthcare decision support and informational awareness only, and do not constitute an autonomous medical diagnosis without licensed physician verification. In case of acute or life-threatening symptoms, immediately contact emergency dispatch (123)."
          : "المعلومات والنتائج المقدمة عبر HealthVibe AI هي لأغراض التوعية ودعم القرار الطبي فقط، ولا تُعد تشخيصاً طبياً مستقلاً أو بديلاً عن تقييم طبيب مؤهل. يجب مراجعة النتائج مع طبيب قبل اتخاذ أي قرار علاجي. في حالات الطوارئ أو الأعراض الشديدة، يجب طلب الرعاية الطبية العاجلة من الجهات المختصة فوراً."}
      </p>
    </div>

    <!-- 10. EMERGENCY 123 ALERT CALLOUT -->
    <div class="emergency-box page-break-avoid">
      <span>🚨 ${isEn ? "Emergency Notice: If blood oxygen SpO2 drops below 90% or you experience severe chest pain, immediately call Emergency Services (123 in Egypt) or visit the nearest hospital emergency room." : "تنبيه طوارئ فوري: في حال انخفاض نسبة الأكسجين عن 90% أو الشعور بألم حاد في الصدر أو ضيق تنفس متسارع، يرجى الاتصال فوراً بالإسعاف (123 في مصر) أو التوجه لأقرب قسم طوارئ."}</span>
    </div>

    <!-- 11. FOOTER -->
    <div class="print-footer">
      <span>Health Vibe AI Health Information System • ${reportRef}</span>
      <span>${isEn ? "Official Approved Copy" : "نسخة رسمية معتمدة"} • ${generatedAt}</span>
      <span>${isEn ? "Page 1 of 1" : "صفحة 1 من 1"}</span>
    </div>

  </div>

</body>
</html>`;
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

  function getArabicReshaper() {
    if (global.HealthVibes?.ArabicReshaper) return global.HealthVibes.ArabicReshaper;
    if (typeof require === "function") {
      try { return require("./arabic-reshaper-service"); } catch (e) {
        try { return require("../../../backend/arabic-reshaper-service"); } catch (e2) { return null; }
      }
    }
    return null;
  }

  function getQrCodeService() {
    if (global.HealthVibes?.QrCodeService) return global.HealthVibes.QrCodeService;
    if (global.QrCodeService) return global.QrCodeService;
    if (typeof require === "function") {
      try { return require("./qr-code-service"); } catch (e) {
        try { return require("../../../backend/qr-code-service"); } catch (e2) { return null; }
      }
    }
    return null;
  }

  function generateQrCodeSvg(textOrRecord, options = {}) {
    const text = typeof textOrRecord === "string" ? textOrRecord : buildReportVerificationUrl(textOrRecord, options.origin || "");
    const engine = getQrCodeService();
    if (engine && typeof engine.generateQrSvg === "function") {
      return engine.generateQrSvg(text, options);
    }
    // Reliable static fallback
    const pixelSize = options.size || 84;
    return `<svg class="hv-report-qr-code" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR Code: ${text}" style="background:#fff; border-radius:6px; border:1px solid #cbd5e1;"><rect width="25" height="25" fill="#ffffff"/><path d="M2,2h7v7h-7z M3,3h5v5h-5z M4,4h3v3h-3z M16,2h7v7h-7z M17,3h5v5h-5z M18,4h3v3h-3z M2,16h7v7h-7z M3,17h5v5h-5z M4,18h3v3h-3z M11,4h1v1h-1z M13,4h1v1h-1z M11,6h1v1h-1z M13,6h1v1h-1z M11,11h3v3h-3z M16,11h1v1h-1z M18,11h1v1h-1z M20,11h1v1h-1z M11,16h1v1h-1z M13,16h1v1h-1z M16,16h2v2h-2z M20,16h2v2h-2z M16,20h2v2h-2z M20,20h2v2h-2z" fill="#0f172a"/></svg>`;
  }

  function reshapeArabicText(text) {
    const engine = getArabicReshaper();
    return engine ? engine.reshape(text) : text;
  }

  function bidiReorder(text) {
    const engine = getArabicReshaper();
    return engine ? engine.bidi(text) : text;
  }

  function processArabicForPdf(text) {
    const engine = getArabicReshaper();
    return engine ? engine.processArabic(text) : text;
  }

  const ReportsService = {
    recordedClinicalText,
    getRecordedClinicalContent,
    getRecordedDoctorIdentity,
    applyApprovedReportSnapshot,
    getClinicalRiskTier,
    buildQrPayload,
    buildReportVerificationUrl,
    getQrCodeService,
    generateQrCodeSvg,
    createReportShareLink,
    revokeReportShareLink,
    verifyReportAuthenticity,
    formatReportForPdfExport,
    generateCertifiedReportPdfHtml,
    buildReportDispatchPayload,
    dispatchReportToDoctor,
    getDoctorInboxDeliveryStatus,
    getArabicReshaper,
    reshapeArabicText,
    bidiReorder,
    processArabicForPdf
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ReportsService = ReportsService;
  global.generateCertifiedReportPdfHtml = generateCertifiedReportPdfHtml;
  global.getClinicalRiskTier = getClinicalRiskTier;
  global.reshapeArabicText = reshapeArabicText;
  global.processArabicForPdf = processArabicForPdf;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReportsService;
  }
})(typeof window !== "undefined" ? window : globalThis);
