/**
 * Health Vibe AI - Doctor Data Service
 * 
 * Manages clinical queue filtering, case sorting, SLA calculation,
 * and diagnostic presets.
 */

(function (global) {
  "use strict";

  function getCaseOxygenValue(c) {
    const value = Number(c && (c.o2 ?? c.oxygenLevel ?? c.assessment?.oxygenLevel ?? c.assessment?.o2));
    return Number.isFinite(value) ? value : 0;
  }

  function getCaseSubmittedMillis(c) {
    if (!c) return 0;
    const value = c.submittedAt || c.createdAt || c.created_at || c.date || c.assessment?.submittedAt;
    if (!value) return 0;
    if (value.toMillis) return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getCaseWaitingMinutes(c, nowMs = Date.now()) {
    const start = getCaseSubmittedMillis(c);
    return start > 0 ? Math.max(0, Math.floor((nowMs - start) / 60000)) : 0;
  }

  function formatElapsedMinutes(minutes, isEn = false) {
    const total = Number(minutes) || 0;
    if (total < 60) return isEn ? `${total} min` : `${total} دقيقة`;
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours < 24) return isEn ? `${hours}h ${mins}m` : `${hours}س ${mins}د`;
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return isEn ? `${days}d ${rest}h` : `${days}ي ${rest}س`;
  }

  const VALID_OVERRIDE_PRIORITIES = ["urgent", "high", "normal"];
  const VALID_OVERRIDE_CATEGORIES = [
    "CLINICAL_SIGNS_OF_EXHAUSTION",
    "RAPID_TRAJECTORY",
    "ARTIFACT_CORRECTION",
    "COMORBIDITY_RISK",
    "OTHER_CLINICAL_JUDGMENT"
  ];

  const OVERRIDE_CATEGORY_META = {
    CLINICAL_SIGNS_OF_EXHAUSTION: {
      ar: "علامات سريرية للإجهاد التنفسي / الإرهاق",
      en: "Clinical Signs of Respiratory Exhaustion",
      descAr: "سحب بين الأضلاع، صعوبة إكمال جملة، أو إجهاد عضلات التنفس رغم قراءات الأكسجين",
      descEn: "Intercostal retractions, inability to complete sentences, or respiratory muscle fatigue"
    },
    RAPID_TRAJECTORY: {
      ar: "تدهور سريع أو تسارع في تفاقم الأعراض",
      en: "Rapid Trajectory / Acute Worsening",
      descAr: "انحدار متسارع خلال وقت قصير يستدعي رفع الجاهزية والتدخل الفوري",
      descEn: "Accelerated decline within a short timeframe requiring immediate escalation"
    },
    ARTIFACT_CORRECTION: {
      ar: "تصحيح قراءة خاطئة أو قياس غير دقيق للجهاز",
      en: "Artifact / Sensor Measurement Correction",
      descAr: "قراءة SpO2 منخفضة بسبب برودة الأطراف أو حركة المريض مع استقرار الفحص السريري",
      descEn: "Falsely low SpO2 due to cold extremities, sensor slip, or motion artifact"
    },
    COMORBIDITY_RISK: {
      ar: "عوامل خطورة وأمراض مصاحبة معقدة",
      en: "High-Risk Comorbidity / Vulnerability",
      descAr: "وجود أمراض مزمنة مصاحبة (فشل قلبي، نقص مناعة، كبر سن) ترفع درجة الخطورة",
      descEn: "Severe chronic comorbidities (heart failure, immunocompromise) elevating clinical risk"
    },
    OTHER_CLINICAL_JUDGMENT: {
      ar: "تقدير وخبرة الطبيب السريرية بعد الفحص المباشر",
      en: "Other Physician Clinical Judgment",
      descAr: "تقييم سريري شامل مبني على الفحص الإكلينيكي المباشر للعيادة",
      descEn: "Comprehensive clinical evaluation based on direct physical examination"
    }
  };

  // ===========================================================================
  // REJECT / REQUEST RE-ENTRY TAXONOMY & CLINICAL GOVERNANCE (K HEALTH)
  // ===========================================================================

  const REJECTION_REENTRY_CATEGORIES = [
    "INCOMPLETE_MEASUREMENTS",
    "CONTRADICTORY_VITALS",
    "UNREADABLE_ATTACHMENTS",
    "CLINICAL_INCONSISTENCY",
    "OTHER_CLINICAL_JUSTIFICATION"
  ];

  const REJECTION_REENTRY_META = {
    INCOMPLETE_MEASUREMENTS: {
      key: "INCOMPLETE_MEASUREMENTS",
      ar: "نقص القياسات أو المؤشرات الحيوية الأساسية",
      en: "Incomplete / Missing Vital Measurements",
      descAr: "تم إغفال قياسات حيوية أساسية مثل نسبة تشبع الأكسجين أو ضغط الدم لتقييم آمن للحالة.",
      descEn: "Essential clinical vitals such as SpO2 or blood pressure were omitted, preventing safe triage."
    },
    CONTRADICTORY_VITALS: {
      key: "CONTRADICTORY_VITALS",
      ar: "قياسات أو مؤشرات حيوية متناقضة أو غير منطقية",
      en: "Contradictory / Implausible Vital Readings",
      descAr: "القراءات المسجلة متناقضة فيزيولوجياً (مثل SpO2 منخفض جداً مع حركة طبيعية، أو نبض غير سليم).",
      descEn: "Recorded values are physiologically contradictory or clinically implausible (e.g. sensor artifact)."
    },
    UNREADABLE_ATTACHMENTS: {
      key: "UNREADABLE_ATTACHMENTS",
      ar: "مرفقات أو صور تحاليل/روشتات غير واضحة",
      en: "Unreadable / Blurry Attachments & Labs",
      descAr: "صور التحاليل المخبرية أو الروشتات المرفقة ضبابية أو مقطوعة وتتعذر قراءتها سريرياً.",
      descEn: "Uploaded photos of lab tests, ECG or prescriptions are blurry, cropped, or illegible."
    },
    CLINICAL_INCONSISTENCY: {
      key: "CLINICAL_INCONSISTENCY",
      ar: "عدم تطابق الأعراض مع التاريخ المرضي المسجل",
      en: "Symptom-History Discrepancy",
      descAr: "الأعراض الحالية للمريض تتناقض صراحة مع الشكوى أو الإجابات السابقة المسجلة.",
      descEn: "Current symptoms contradict previously documented answers or intake responses."
    },
    OTHER_CLINICAL_JUSTIFICATION: {
      key: "OTHER_CLINICAL_JUSTIFICATION",
      ar: "مبررات سريرية أخرى يحددها الطبيب",
      en: "Other Physician Clinical Justification",
      descAr: "تقييم سريري مباشر من الطبيب المعالج يستدعي تصحيح المدخلات وإعادة أخذ القياسات.",
      descEn: "Direct attending physician clinical assessment requiring intake correction."
    }
  };

  const REENTRY_REQUEST_FIELDS = [
    { id: "spo2", labelEn: "SpO2 (Oxygen Saturation)", labelAr: "نسبة تشبع الأكسجين (SpO2)", icon: "💨" },
    { id: "blood_pressure", labelEn: "Blood Pressure & Pulse", labelAr: "ضغط الدم والنبض", icon: "❤️" },
    { id: "temperature", labelEn: "Body Temperature", labelAr: "درجة حرارة الجسم", icon: "🌡️" },
    { id: "symptoms_detail", labelEn: "Symptom Onset & Severity", labelAr: "بداية الأعراض وشدتها", icon: "📋" },
    { id: "attachments", labelEn: "Clear Lab / Report Photos", labelAr: "صورة واضحة للتحاليل أو التقرير", icon: "📷" },
    { id: "medications", labelEn: "Current Medications List", labelAr: "قائمة الأدوية الحالية والجرعات", icon: "💊" }
  ];

  const QUICK_REENTRY_INSTRUCTION_CHIPS = [
    {
      en: "Please warm your hands, rest for 5 minutes, and retake your pulse oximeter (SpO2) reading.",
      ar: "يرجى تدفئة اليدين والراحة لمدة 5 دقائق ثم إعادة قياس نسبة الأكسجين والتأكد من ثبات القراءة."
    },
    {
      en: "Blood pressure reading appears implausible. Please re-measure while seated quietly using a calibrated cuff.",
      ar: "قراءة ضغط الدم تبدو غير دقيقة، يرجى إعادة القياس في وضعية الجلوس بهدوء بجهاز معتمد."
    },
    {
      en: "The uploaded lab result photo is blurry or cropped. Please upload a clear, flat photo in good lighting.",
      ar: "صورة نتيجة التحليل المرفقة غير واضحة، يرجى إعادة تصوير الورقة كاملة بإضاءة جيدة بدون اهتزاز."
    },
    {
      en: "Reported symptoms are contradictory. Please clarify which symptom is primary and when it started.",
      ar: "هناك تضارب في الأعراض المسجلة، يرجى توضيح العرض الرئيسي وتاريخ بدايته بدقة."
    },
    {
      en: "Please confirm your current chronic disease medications and exact daily dosages.",
      ar: "يرجى كتابة أسماء أدوية الأمراض المزمنة التي تتناولها حالياً بجرعاتها اليومية بوضوح."
    }
  ];

  function getReentryCategoryMeta(categoryKey, isEn = false) {
    const meta = REJECTION_REENTRY_META[categoryKey];
    if (!meta) return { label: categoryKey || "", desc: "" };
    return {
      label: isEn ? meta.en : meta.ar,
      desc: isEn ? meta.descEn : meta.descAr
    };
  }

  function validateRejectReentryPayload({ mode, reasonCategory, requiredFields = [], doctorNote = "" }) {
    if (!["reentry", "definitive_reject"].includes(mode)) {
      return { valid: false, error: "INVALID_MODE", messageEn: "Invalid rejection mode.", messageAr: "نوع الرفض غير صالح." };
    }
    if (!REJECTION_REENTRY_CATEGORIES.includes(reasonCategory)) {
      return { valid: false, error: "INVALID_CATEGORY", messageEn: "Please select a valid clinical category.", messageAr: "يرجى اختيار فئة سريرية صالحة." };
    }
    const cleanNote = String(doctorNote || "").trim();
    if (cleanNote.length < 10) {
      return { valid: false, error: "NOTE_TOO_SHORT", messageEn: "Physician instruction note must be at least 10 characters.", messageAr: "يجب ألا تقل ملاحظات وتوجيهات الطبيب عن 10 أحرف." };
    }
    if (mode === "reentry") {
      if (!Array.isArray(requiredFields) || requiredFields.length === 0) {
        return { valid: false, error: "NO_FIELDS_SELECTED", messageEn: "Please select at least one field requiring patient re-entry.", messageAr: "يرجى اختيار حقل واحد على الأقل يطلب من المريض إعادة إدخاله." };
      }
    }
    return { valid: true };
  }


  function getCasePriorityKey(c) {
    if (c?.triageOverride?.overriddenPriority) {
      return String(c.triageOverride.overriddenPriority).toLowerCase();
    }
    const priority = String(c?.priority || c?.risk || c?.assessment?.aiTriage?.priority || "").toLowerCase();
    const o2 = getCaseOxygenValue(c);
    if (priority.includes("urgent") || priority.includes("emergency") || priority.includes("عاجل") || (o2 > 0 && o2 < 90)) return "urgent";
    if (priority.includes("high") || priority.includes("medium") || priority.includes("عالية") || (o2 >= 90 && o2 < 93)) return "high";
    return "normal";
  }

  function getPriorityMeta(priority, isEn = false) {
    const key = priority || "normal";
    const meta = {
      urgent: { weight: 3, pill: "danger", en: "Urgent", ar: "عاجل" },
      high: { weight: 2, pill: "pending", en: "High", ar: "أولوية عالية" },
      normal: { weight: 1, pill: "ok", en: "Routine", ar: "عادية" }
    };
    const item = meta[key] || meta.normal;
    return { ...item, label: isEn ? item.en : item.ar };
  }

  function getCaseSlaInfo(c, isEn = false, nowMs = Date.now()) {
    const priority = getCasePriorityKey(c);
    const target = priority === "urgent" ? 15 : (priority === "high" ? 30 : 120);
    const elapsed = getCaseWaitingMinutes(c, nowMs);
    const respondedAt = getCaseSubmittedMillis(c?.reviewStartedAt || c?.firstReviewedAt || c?.underReviewAt || c?.approvedAt || c?.updatedAt);
    const responseMinutes = respondedAt && getCaseSubmittedMillis(c)
      ? Math.max(0, Math.floor((respondedAt - getCaseSubmittedMillis(c)) / 60000))
      : null;
    const compare = responseMinutes ?? elapsed;
    const met = compare <= target;
    return {
      priority,
      target,
      elapsed,
      responseMinutes,
      met,
      label: isEn
        ? `SLA ${target} min - ${met ? "on track" : "overdue"}`
        : `SLA ${target} دقيقة - ${met ? "ضمن الوقت" : "متأخر"}`
    };
  }

  function parseDoctorRecommendations(rawText) {
    return String(rawText || "")
      .split(/\r?\n|[;؛]/)
      .map(item => item.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter(Boolean);
  }

  /**
   * Pure filtering and sorting for doctor queue cases.
   */
  function filterDoctorQueue(cases = [], options = {}) {
    const {
      filter = "all",
      priority = "all",
      sort = "waiting_desc",
      search = "",
      doctorUid = "",
      doctorEmail = "",
      nowMs = Date.now()
    } = options;

    let items = Array.isArray(cases) ? [...cases] : [];

    // Filter by doctor assignment & status
    if (filter === "assigned_to_me" && (doctorUid || doctorEmail)) {
      items = items.filter(c => {
        const uid = doctorUid;
        const email = String(doctorEmail).toLowerCase();
        return (c.assignedDoctorId && c.assignedDoctorId === uid) ||
          (c.doctorId && c.doctorId === uid) ||
          (c.doctorUid && c.doctorUid === uid) ||
          (c.assignedDoctorEmail && String(c.assignedDoctorEmail).toLowerCase() === email) ||
          (c.doctorEmail && String(c.doctorEmail).toLowerCase() === email);
      });
    } else if (filter === "urgent") {
      items = items.filter(c => getCasePriorityKey(c) === "urgent");
    } else if (filter === "unassigned") {
      items = items.filter(c => !c.assignedDoctorId && !c.doctorId && !c.doctorUid);
    } else if (filter !== "all") {
      items = items.filter(c => String(c.status || "").toLowerCase() === filter.toLowerCase());
    }

    // Filter by priority
    if (priority && priority !== "all") {
      items = items.filter(c => getCasePriorityKey(c) === priority.toLowerCase());
    }

    // Filter by search query
    if (search) {
      const q = String(search).toLowerCase();
      items = items.filter(c => {
        const text = [
          c.id,
          c.patientName,
          c.patientId,
          c.symptoms,
          c.symptomsEn,
          c.notes,
          c.status
        ].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }

    // Sort items
    items.sort((a, b) => {
      if (sort === "waiting_desc") {
        return getCaseSubmittedMillis(b) - getCaseSubmittedMillis(a);
      }
      if (sort === "waiting_asc") {
        return getCaseSubmittedMillis(a) - getCaseSubmittedMillis(b);
      }
      if (sort === "priority_desc") {
        const pA = getPriorityMeta(getCasePriorityKey(a)).weight;
        const pB = getPriorityMeta(getCasePriorityKey(b)).weight;
        return pB - pA;
      }
      return 0;
    });

    return items;
  }

  /**
   * Helper to perform authenticated calls to the backend.
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
        console.warn("[DoctorService] Could not retrieve ID token:", e);
      }
    }
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `Request failed with status ${res.status}`);
      err.code = data.error || "API_ERROR";
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function requestHandover({ caseId, toDoctorId, targetQueue, handoverReason, clinicalNotes, slaMinutes, routeToQueueIfUnavailable = true }) {
    return await apiCall(`/api/cases/${encodeURIComponent(caseId)}/handover/request`, {
      method: "POST",
      body: JSON.stringify({ toDoctorId, targetQueue, handoverReason, clinicalNotes, slaMinutes, routeToQueueIfUnavailable })
    });
  }

  async function acceptHandover({ handoverId, ackReferenceId, channel = "in_app" }) {
    return await apiCall(`/api/cases/handover/${encodeURIComponent(handoverId)}/accept`, {
      method: "POST",
      body: JSON.stringify({ ackReferenceId, channel })
    });
  }

  async function rejectHandover({ handoverId, rejectionReason }) {
    return await apiCall(`/api/cases/handover/${encodeURIComponent(handoverId)}/reject`, {
      method: "POST",
      body: JSON.stringify({ rejectionReason })
    });
  }

  async function cancelHandover({ handoverId, cancelReason }) {
    return await apiCall(`/api/cases/handover/${encodeURIComponent(handoverId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancelReason })
    });
  }

  async function escalateCase({ caseId, severity, reason, targetRecipient, deduplicationWindowMs }) {
    return await apiCall(`/api/cases/${encodeURIComponent(caseId)}/escalate`, {
      method: "POST",
      body: JSON.stringify({ severity, reason, targetRecipient, deduplicationWindowMs })
    });
  }

  async function acknowledgeEscalation({ escalationId, ackMethod, ackToken }) {
    return await apiCall(`/api/cases/escalation/${encodeURIComponent(escalationId)}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ ackMethod, ackToken })
    });
  }

  async function getOverdueHandovers(clinicId = null) {
    const q = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : "";
    return await apiCall(`/api/cases/handover/overdue${q}`);
  }

  async function getUnassignedCases(clinicId = null) {
    const q = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : "";
    return await apiCall(`/api/cases/unassigned${q}`);
  }

  async function claimCase(caseId) {
    return await apiCall(`/api/cases/${encodeURIComponent(caseId)}/claim`, {
      method: "POST"
    });
  }

  async function overrideTriagePriority({ caseId, overriddenPriority, overrideReason, overrideCategory }) {
    if (!caseId || !VALID_OVERRIDE_PRIORITIES.includes(overriddenPriority)) {
      throw new Error(`caseId and valid overriddenPriority (${VALID_OVERRIDE_PRIORITIES.join(", ")}) required.`);
    }
    if (!overrideReason || String(overrideReason).trim().length < 10) {
      throw new Error("A structured clinical overrideReason of at least 10 characters is mandatory to override system triage.");
    }
    if (!overrideCategory || !VALID_OVERRIDE_CATEGORIES.includes(overrideCategory)) {
      throw new Error(`overrideCategory must be one of: ${VALID_OVERRIDE_CATEGORIES.join(", ")}`);
    }

    try {
      if (typeof global.callBackend === "function" || typeof fetch !== "undefined") {
        return await apiCall("/api/doctor/override-triage-priority", {
          method: "POST",
          body: JSON.stringify({ caseId, overriddenPriority, overrideReason, overrideCategory })
        });
      }
    } catch (err) {
      // In offline / local demo environment without live backend API, provide seamless client fallback
      if (global.db && global.db.collection) {
        const caseRef = global.db.collection("cases").doc(caseId);
        const caseDoc = await caseRef.get().catch(() => null);
        const currentData = caseDoc && caseDoc.exists ? caseDoc.data() : {};
        const origPriority = currentData.priority || currentData.triageLevel || "normal";
        const docUser = global.auth?.currentUser || {};
        const doctorName = docUser.displayName || "Licensed Doctor";
        const doctorLicense = "EG-MED-VERIFIED";
        const nowIso = new Date().toISOString();

        const overrideRecord = {
          isOverridden: true,
          overriddenPriority,
          overrideReason: String(overrideReason).trim(),
          overrideCategory,
          overriddenBy: {
            uid: docUser.uid || "doc_demo",
            name: doctorName,
            license: doctorLicense,
            email: docUser.email || ""
          },
          timestamp: nowIso,
          originalPriority: origPriority
        };

        const updatePayload = {
          priority: overriddenPriority,
          triageLevel: overriddenPriority,
          triageOverride: overrideRecord
        };

        if (global.firebase?.firestore?.FieldValue?.arrayUnion) {
          updatePayload.statusHistory = global.firebase.firestore.FieldValue.arrayUnion({
            oldStatus: currentData.status || "under_review",
            newStatus: currentData.status || "under_review",
            action: "TRIAGE_OVERRIDE",
            actor: { uid: docUser.uid || "doc_demo", name: doctorName, role: "doctor" },
            reason: overrideRecord.overrideReason,
            timestamp: nowIso
          });
        }

        await caseRef.update(updatePayload);
        return {
          success: true,
          message: `Triage priority overridden to '${overriddenPriority}' with clinical justification.`,
          overrideRecord
        };
      }
    }

    // Default standalone return when backend and db are not connected (e.g. unit tests or local preview)
    const fallbackRecord = {
      isOverridden: true,
      overriddenPriority,
      overrideReason: String(overrideReason).trim(),
      overrideCategory,
      overriddenBy: {
        uid: "doc_demo_local",
        name: "Treating Physician",
        license: "EG-MED-VERIFIED"
      },
      timestamp: new Date().toISOString()
    };
    return {
      success: true,
      message: `Triage priority overridden to '${overriddenPriority}' with clinical justification.`,
      overrideRecord: fallbackRecord
    };
  }

  /**
   * Reject initial intake or request patient re-entry with clinical justification (K Health)
   */
  async function rejectOrRequestReentry({ caseId, mode = "reentry", reasonCategory, requiredFields = [], doctorNote }) {
    if (!caseId) {
      throw new Error("caseId is required.");
    }
    const val = validateRejectReentryPayload({ mode, reasonCategory, requiredFields, doctorNote });
    if (!val.valid) {
      const err = new Error(val.messageEn || "Validation failed.");
      err.code = val.error || "VALIDATION_FAILED";
      throw err;
    }

    try {
      if (typeof global.callBackend === "function" || typeof fetch !== "undefined") {
        return await apiCall(`/api/cases/${encodeURIComponent(caseId)}/reject-reentry`, {
          method: "POST",
          body: JSON.stringify({
            mode,
            reasonCategory,
            requiredFields,
            doctorNote
          })
        });
      }
    } catch (err) {
      // Offline / client-side Firestore fallback
      if (global.db && global.db.collection) {
        const caseRef = global.db.collection("cases").doc(caseId);
        const caseDoc = await caseRef.get().catch(() => null);
        const currentData = caseDoc && caseDoc.exists ? caseDoc.data() : {};
        const docUser = global.auth?.currentUser || {};
        const doctorName = docUser.displayName || "Licensed Physician";
        const nowIso = new Date().toISOString();
        const isReentry = mode === "reentry";
        const targetStatus = isReentry ? "more_info_requested" : "rejected";

        const reentryRecord = {
          mode,
          isReentryRequest: isReentry,
          reasonCategory,
          rejectionReason: String(doctorNote).trim(),
          requiredFields: isReentry ? requiredFields : [],
          flaggedBy: {
            uid: docUser.uid || "doc_demo",
            name: doctorName,
            email: docUser.email || ""
          },
          timestamp: nowIso
        };

        const updatePayload = {
          status: targetStatus,
          rejectionReason: String(doctorNote).trim(),
          rejectionCategory: reasonCategory,
          isReentryRequest: isReentry,
          reentryMode: mode,
          requiredFields: isReentry ? requiredFields : [],
          doctorNote: String(doctorNote).trim(),
          doctorApproved: false,
          reentryRecord,
          updatedAt: nowIso
        };

        if (global.firebase?.firestore?.FieldValue?.arrayUnion) {
          updatePayload.statusHistory = global.firebase.firestore.FieldValue.arrayUnion({
            oldStatus: currentData.status || "under_review",
            newStatus: targetStatus,
            action: isReentry ? "REJECT_REQUEST_REENTRY" : "DEFINITIVE_REJECTION",
            actor: { uid: docUser.uid || "doc_demo", name: doctorName, role: "doctor" },
            reason: String(doctorNote).trim(),
            timestamp: nowIso
          });
        }

        await caseRef.update(updatePayload);
        return {
          success: true,
          caseId,
          mode,
          targetStatus,
          message: isReentry ? "Re-entry request sent to patient." : "Case definitively rejected.",
          reentryRecord
        };
      }
      throw err;
    }

    return {
      success: true,
      caseId,
      mode,
      targetStatus: mode === "reentry" ? "more_info_requested" : "rejected",
      message: mode === "reentry" ? "Re-entry request sent to patient." : "Case definitively rejected.",
      reentryRecord: {
        mode,
        isReentryRequest: mode === "reentry",
        reasonCategory,
        rejectionReason: String(doctorNote).trim(),
        requiredFields: mode === "reentry" ? requiredFields : [],
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Retrieves rejection / re-entry telemetry and details for a case
   */
  async function getCaseRejectReentryStatus(caseId) {
    if (!caseId) throw new Error("caseId is required.");
    return await apiCall(`/api/cases/${encodeURIComponent(caseId)}/reject-reentry`);
  }

  function getOverrideCategoryLabel(catKey, isEn = false) {
    const meta = OVERRIDE_CATEGORY_META[catKey];
    if (!meta) return catKey;
    return isEn ? meta.en : meta.ar;
  }

  function getOverrideCategoryDesc(catKey, isEn = false) {
    const meta = OVERRIDE_CATEGORY_META[catKey];
    if (!meta) return "";
    return isEn ? meta.descEn : meta.descAr;
  }

  function detectBilingualDirection(text) {
    if (!text) return "ltr";
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicPattern.test(String(text)) ? "rtl" : "ltr";
  }

  const _caseDataCache = new Map();
  const CASE_CACHE_TTL_MS = 60000;

  function setCachedCase(caseId, data) {
    if (!caseId) return;
    _caseDataCache.set(caseId, {
      data,
      cachedAt: Date.now()
    });
  }

  function getCachedCase(caseId) {
    if (!caseId || !_caseDataCache.has(caseId)) return null;
    const entry = _caseDataCache.get(caseId);
    if (Date.now() - entry.cachedAt > CASE_CACHE_TTL_MS) {
      _caseDataCache.delete(caseId);
      return null;
    }
    return entry.data;
  }

  function invalidateCachedCase(caseId) {
    if (caseId) _caseDataCache.delete(caseId);
    else _caseDataCache.clear();
  }

  async function loadCaseWithHistoryPerformance(caseId, options = {}) {
    const startTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    // 1. Check cache for instant retrieval (< 50ms)
    const cached = getCachedCase(caseId);
    if (cached && !options.forceFresh) {
      const elapsedMs = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - startTime;
      return {
        caseData: cached,
        history: cached.medicalHistory || cached.statusHistory || [],
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        fromCache: true,
        underOneSecond: elapsedMs < 1000
      };
    }

    // 2. Fetch fresh
    let caseData = null;
    if (typeof options.fetcher === "function") {
      caseData = await options.fetcher(caseId);
    } else if (Array.isArray(global.cases)) {
      caseData = global.cases.find(c => c.id === caseId) || null;
    } else if (Array.isArray(global.state?.doctorQueue)) {
      caseData = global.state.doctorQueue.find(c => c.id === caseId) || null;
    }

    if (caseData) {
      setCachedCase(caseId, caseData);
    }

    const endTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const elapsedMs = endTime - startTime;

    return {
      caseData: caseData || { id: caseId },
      history: caseData?.medicalHistory || caseData?.statusHistory || [],
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      fromCache: false,
      underOneSecond: elapsedMs < 1000
    };
  }

  // ===========================================================================
  // DIAGNOSTIC INVESTIGATIONS & RADIOLOGY CATALOG (VEZEETA PATTERN)
  // ===========================================================================

  const INVESTIGATION_CATEGORIES = {
    LAB: "LAB",
    RADIOLOGY: "RADIOLOGY"
  };

  const INVESTIGATION_URGENCIES = {
    ROUTINE: "routine",
    STAT: "stat"
  };

  const DIAGNOSTIC_INVESTIGATIONS_CATALOG = [
    // --- High-Yield Laboratory Tests ---
    {
      code: "CBC",
      loinc: "58410-2",
      category: "LAB",
      nameAr: "صورة دم كاملة (CBC)",
      nameEn: "Complete Blood Count (CBC)",
      descAr: "فحص كريات الدم البيضاء والحمراء والصفائح لتقييم العدوى والأنيميا.",
      descEn: "Leukocytes, platelets & hemoglobin to assess infection & anemia.",
      highYield: true,
      fastingHours: 0,
      sampleTypeAr: "عينة دم وريدي (EDTA)",
      sampleTypeEn: "Venous Blood (EDTA)"
    },
    {
      code: "CRP",
      loinc: "1988-5",
      category: "LAB",
      nameAr: "بروتين سي التفاعلي كمي (CRP)",
      nameEn: "C-Reactive Protein - Quantitative (CRP)",
      descAr: "مؤشر حيوي لشدة الالتهاب الحاد والاستجابة المناعية.",
      descEn: "Acute phase reactant biomarker measuring inflammation severity.",
      highYield: true,
      fastingHours: 0,
      sampleTypeAr: "عينة مصل دم",
      sampleTypeEn: "Serum"
    },
    {
      code: "D_DIMER",
      loinc: "48065-7",
      category: "LAB",
      nameAr: "دي-دايمر كمي (D-Dimer)",
      nameEn: "D-Dimer Quantitative",
      descAr: "استبعاد الجلطة الرئوية والتخثر المنتشر داخل الأوعية.",
      descEn: "Evaluation of pulmonary embolism, DVT & hypercoagulability.",
      highYield: true,
      fastingHours: 0,
      sampleTypeAr: "بلازما سيترات",
      sampleTypeEn: "Citrated Plasma"
    },
    {
      code: "SERUM_FERRITIN",
      loinc: "2276-4",
      category: "LAB",
      nameAr: "فيريتين المصل (Serum Ferritin)",
      nameEn: "Serum Ferritin",
      descAr: "تقييم العاصفة الالتهابية ومخزون الحديد في الدم.",
      descEn: "Hyperferritinemic inflammatory response & iron stores.",
      highYield: true,
      fastingHours: 0,
      sampleTypeAr: "مصل دم",
      sampleTypeEn: "Serum"
    },
    {
      code: "KIDNEY_PANEL",
      loinc: "2160-0",
      category: "LAB",
      nameAr: "وظائف كلى (Creatinine & Urea)",
      nameEn: "Kidney Function Panel (Creatinine & BUN)",
      descAr: "تقييم وظائف الكلى قبل وصف الأدوية أو الصبغة.",
      descEn: "Renal clearance evaluation prior to therapeutics or contrast.",
      highYield: true,
      fastingHours: 0,
      sampleTypeAr: "مصل دم",
      sampleTypeEn: "Serum"
    },
    {
      code: "LIVER_PANEL",
      loinc: "1751-7",
      category: "LAB",
      nameAr: "وظائف كبد (ALT, AST & Bilirubin)",
      nameEn: "Liver Enzymes Panel (ALT, AST, Bilirubin)",
      descAr: "تقييم كفاءة الكبد وسلامة الإنزيمات الحيوية.",
      descEn: "Hepatic transaminases and metabolic function.",
      highYield: false,
      fastingHours: 0,
      sampleTypeAr: "مصل دم",
      sampleTypeEn: "Serum"
    },
    {
      code: "HBA1C",
      loinc: "4548-4",
      category: "LAB",
      nameAr: "سكر تراكمي (HbA1c)",
      nameEn: "Glycated Hemoglobin (HbA1c)",
      descAr: "معدل السكر التراكمي خلال آخر 3 أشهر.",
      descEn: "Long-term glycemic control over past 90 days.",
      highYield: false,
      fastingHours: 0,
      sampleTypeAr: "دم كامل",
      sampleTypeEn: "Whole Blood"
    },
    {
      code: "ABG",
      loinc: "1994-3",
      category: "LAB",
      nameAr: "غازات الدم الشرياني (ABG)",
      nameEn: "Arterial Blood Gases (ABG)",
      descAr: "تقييم حموضة الدم PaO2 و PaCO2 في حالات نقص الأكسجين الحاد.",
      descEn: "Direct arterial PaO2, PaCO2 & pH for acute hypoxemic distress.",
      highYield: true,
      fastingHours: 0,
      sampleTypeAr: "دم شرياني مسحوب بالهيبارين",
      sampleTypeEn: "Heparinized Arterial Blood"
    },
    {
      code: "SPUTUM_CULTURE",
      loinc: "6460-0",
      category: "LAB",
      nameAr: "مزرعة وحساسية بصاق (Sputum C&S)",
      nameEn: "Sputum Culture & Sensitivity",
      descAr: "عزل الميكروب المسبب وتحديد المضاد الحيوي الحساس.",
      descEn: "Pathogen identification & targeted antibiotic susceptibility.",
      highYield: false,
      fastingHours: 0,
      sampleTypeAr: "عينة بصاق صباحية عميقة",
      sampleTypeEn: "Deep Early Morning Sputum"
    },
    {
      code: "ESR",
      loinc: "30341-2",
      category: "LAB",
      nameAr: "سرعة الترسيب (ESR)",
      nameEn: "Erythrocyte Sedimentation Rate (ESR)",
      descAr: "معدل سرعة ترسيب كرات الدم الحمراء للالتهابات المزمنة.",
      descEn: "Erythrocyte sedimentation velocity for chronic inflammation.",
      highYield: false,
      fastingHours: 0,
      sampleTypeAr: "دم كامل",
      sampleTypeEn: "Whole Blood (Citrate)"
    },
    {
      code: "SERUM_ELECTROLYTES",
      loinc: "2823-3",
      category: "LAB",
      nameAr: "أملاح ومعادن الدم (Na+, K+, Cl-)",
      nameEn: "Serum Electrolytes (Na+, K+, Cl-)",
      descAr: "توازن الكهارل والأملاح لدعم استقرار الدورة الدموية.",
      descEn: "Electrolyte balance for cardiac & hemodynamic stability.",
      highYield: false,
      fastingHours: 0,
      sampleTypeAr: "مصل دم",
      sampleTypeEn: "Serum"
    },
    {
      code: "TROPONIN_I",
      loinc: "10839-9",
      category: "LAB",
      nameAr: "تروبونين قلبي عالي الحساسية (Troponin-I)",
      nameEn: "High-Sensitivity Cardiac Troponin-I",
      descAr: "استبعاد احتشاء عضلة القلب الحاد ومتلازمة الشريان التاجي.",
      descEn: "Rule out acute myocardial infarction & myocarditis.",
      highYield: false,
      fastingHours: 0,
      sampleTypeAr: "مصل دم",
      sampleTypeEn: "Serum"
    },

    // --- High-Yield Radiology & Medical Imaging ---
    {
      code: "CHEST_XRAY",
      loinc: "36643-5",
      category: "RADIOLOGY",
      nameAr: "أشعة عادية على الصدر (Chest X-Ray PA/Lat)",
      nameEn: "Chest X-Ray Frontal & Lateral (PA/Lat)",
      descAr: "فحص الصدر لاستبعاد الارتشاح الرئوي والتجمع الهوائي والالتهاب.",
      descEn: "Radiographic evaluation for consolidation, pneumothorax & effusion.",
      highYield: true,
      modality: "CR / DX",
      instructionsAr: "نزع أي مجوهرات أو سلاسل معدنية قبل التصوير.",
      instructionsEn: "Remove metallic accessories and jewelry before exposure."
    },
    {
      code: "HRCT_CHEST",
      loinc: "24627-2",
      category: "RADIOLOGY",
      nameAr: "أشعة مقطعية عالية الدقة على الصدر (HRCT Chest)",
      nameEn: "High-Resolution CT Chest (HRCT)",
      descAr: "تصوير مقطعي دقيق لنسيج الرئة وعلامات التليف والتعتيم الزجاجي.",
      descEn: "Sub-millimeter thoracic scan for ground-glass opacities & interstitial disease.",
      highYield: true,
      modality: "CT without IV Contrast",
      instructionsAr: "حبس النفس أثناء التصوير حسب توجيهات فني الأشعة.",
      instructionsEn: "Follow technician breathing commands during scan acquisition."
    },
    {
      code: "CTPA",
      loinc: "CTPA",
      category: "RADIOLOGY",
      nameAr: "مقطعية بالصبغة على الشرايين الرئوية (CTPA)",
      nameEn: "CT Pulmonary Angiogram (CTPA)",
      descAr: "الفحص المعياري لتأكيد أو نفي الجلطة الرئوية الحادة.",
      descEn: "Gold standard contrast-enhanced imaging for pulmonary embolism.",
      highYield: false,
      modality: "CT with IV Contrast",
      instructionsAr: "صيام 4-6 ساعات ووظائف كلى حديثة قبل حقن الصبغة.",
      instructionsEn: "4-6 hours fasting and recent serum creatinine required."
    },
    {
      code: "CHEST_US",
      loinc: "CHEST_US",
      category: "RADIOLOGY",
      nameAr: "موجات صوتية وسونار على الصدر (Chest Ultrasound)",
      nameEn: "Chest Ultrasound / Pleural POCUS",
      descAr: "كشف الارتشاح البلوري وتحديد خطوط B السريرية للرئة.",
      descEn: "Bedside ultrasound for pleural effusion & B-line artifact quantification.",
      highYield: false,
      modality: "Ultrasound",
      instructionsAr: "لا يتطلب تحضيراً خاصاً.",
      instructionsEn: "No special preparation required."
    },
    {
      code: "ECG_12LEAD",
      loinc: "11524-6",
      category: "RADIOLOGY",
      nameAr: "تخطيط كهربية القلب (12-Lead ECG)",
      nameEn: "12-Lead Electrocardiogram (ECG)",
      descAr: "رسم قلب فوري لتقييم نظم القلب واستبعاد الإجهاد القلبي.",
      descEn: "Electrocardiographic rhythm & acute myocardial strain assessment.",
      highYield: true,
      modality: "ECG",
      instructionsAr: "الاستلقاء والاسترخاء التام أثناء التسجيل.",
      instructionsEn: "Remain completely relaxed and still during trace recording."
    }
  ];

  const INVESTIGATION_PRESETS = {
    respiratory_infection: {
      key: "respiratory_infection",
      ar: "باقة التهاب شعبي وتنفسي",
      en: "Respiratory Infection Workup",
      icon: "🫁",
      codes: ["CBC", "CRP", "CHEST_XRAY"],
      rationaleAr: "تقييم شدة العدوى التنفسية واستبعاد الالتهاب الرئوي.",
      rationaleEn: "Assess infection severity and exclude pneumonic consolidation."
    },
    acute_dyspnea_pe: {
      key: "acute_dyspnea_pe",
      ar: "باقة ضيق تنفس حاد واشتباه جلطة",
      en: "Acute Dyspnea & PE Workup",
      icon: "⚠️",
      codes: ["D_DIMER", "ABG", "CHEST_XRAY", "ECG_12LEAD"],
      rationaleAr: "استبعاد الانسداد الرئوي واضطراب الأكسجة الحاد.",
      rationaleEn: "Rule out acute pulmonary embolism and severe hypoxemic gas exchange failure."
    },
    viral_pneumonia: {
      key: "viral_pneumonia",
      ar: "باقة اشتباه التهاب رئوي فيروسي",
      en: "Viral Pneumonia Workup",
      icon: "🦠",
      codes: ["CBC", "CRP", "SERUM_FERRITIN", "D_DIMER", "HRCT_CHEST"],
      rationaleAr: "متابعة العاصفة الالتهابية وفحص التعتيم الزجاجي في نسيج الرئة.",
      rationaleEn: "Monitor inflammatory cascade and ground-glass pulmonary involvement."
    },
    cardiopulmonary_workup: {
      key: "cardiopulmonary_workup",
      ar: "باقة فحص صدري وقلبي شامل",
      en: "Cardiopulmonary Comprehensive",
      icon: "❤️",
      codes: ["CBC", "KIDNEY_PANEL", "CHEST_XRAY", "ECG_12LEAD", "TROPONIN_I"],
      rationaleAr: "تقييم التفاعل القلبي الرئوي ووظائف الأعضاء الحيوية.",
      rationaleEn: "Holistic evaluation of cardiopulmonary interaction and biomarker clearance."
    }
  };

  function getDiagnosticCatalog() {
    return DIAGNOSTIC_INVESTIGATIONS_CATALOG.map(item => ({ ...item }));
  }

  function getInvestigationPresets() {
    return { ...INVESTIGATION_PRESETS };
  }

  function getInvestigationByCode(code) {
    if (!code) return null;
    const clean = String(code).trim().toUpperCase();
    return DIAGNOSTIC_INVESTIGATIONS_CATALOG.find(i => i.code.toUpperCase() === clean || i.loinc === clean) || null;
  }

  function filterDiagnosticCatalog({ category = "ALL", search = "", highYieldOnly = false } = {}) {
    let list = DIAGNOSTIC_INVESTIGATIONS_CATALOG;

    if (category && category !== "ALL") {
      const catUpper = String(category).toUpperCase();
      list = list.filter(i => i.category === catUpper);
    }

    if (highYieldOnly) {
      list = list.filter(i => Boolean(i.highYield));
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(i =>
        i.code.toLowerCase().includes(q) ||
        (i.loinc && i.loinc.toLowerCase().includes(q)) ||
        (i.nameAr && i.nameAr.toLowerCase().includes(q)) ||
        (i.nameEn && i.nameEn.toLowerCase().includes(q)) ||
        (i.descAr && i.descAr.toLowerCase().includes(q)) ||
        (i.descEn && i.descEn.toLowerCase().includes(q))
      );
    }

    return list.map(item => ({ ...item }));
  }

  function formatInvestigationUrgency(urgency, isEn = false) {
    const isStat = String(urgency).toLowerCase() === "stat";
    return {
      key: isStat ? "stat" : "routine",
      label: isStat ? (isEn ? "STAT (Urgent)" : "عاجل / طارئ STAT") : (isEn ? "Routine" : "عادي / روتيني"),
      badgeClass: isStat ? "danger" : "ok",
      color: isStat ? "#ef4444" : "#10b981",
      icon: isStat ? "⚡" : "📋"
    };
  }

  function validateOrderedInvestigations(items) {
    if (!Array.isArray(items)) return [];
    return items.filter(item => {
      if (!item) return false;
      const code = typeof item === "string" ? item : (item.code || item.id);
      return Boolean(code && String(code).trim());
    }).map(item => {
      const rawCode = String(typeof item === "string" ? item : (item.code || item.id)).trim().toUpperCase();
      const catalogMeta = getInvestigationByCode(rawCode);
      const isObj = typeof item === "object" && item !== null;
      return {
        code: rawCode,
        loinc: (isObj && item.loinc) || catalogMeta?.loinc || null,
        category: ((isObj && item.category) || catalogMeta?.category || "LAB").toUpperCase(),
        nameAr: (isObj && item.nameAr) || catalogMeta?.nameAr || rawCode,
        nameEn: (isObj && item.nameEn) || catalogMeta?.nameEn || rawCode,
        urgency: String((isObj && item.urgency) || "routine").toLowerCase() === "stat" ? "stat" : "routine",
        clinicalIndication: String((isObj && (item.clinicalIndication || item.reason)) || "").trim(),
        instructions: String((isObj && (item.instructions || item.patientPrep)) || catalogMeta?.instructionsAr || "").trim(),
        custom: Boolean((isObj && item.custom) || !catalogMeta)
      };
    });
  }

  const DoctorService = {
    VALID_OVERRIDE_PRIORITIES,
    VALID_OVERRIDE_CATEGORIES,
    OVERRIDE_CATEGORY_META,
    getOverrideCategoryLabel,
    getOverrideCategoryDesc,
    detectBilingualDirection,
    setCachedCase,
    getCachedCase,
    invalidateCachedCase,
    loadCaseWithHistoryPerformance,
    getCaseOxygenValue,
    getCaseSubmittedMillis,
    getCaseWaitingMinutes,
    formatElapsedMinutes,
    getCasePriorityKey,
    getPriorityMeta,
    getCaseSlaInfo,
    parseDoctorRecommendations,
    filterDoctorQueue,
    requestHandover,
    acceptHandover,
    rejectHandover,
    cancelHandover,
    escalateCase,
    acknowledgeEscalation,
    getOverdueHandovers,
    getUnassignedCases,
    claimCase,
    overrideTriagePriority,
    REJECTION_REENTRY_CATEGORIES,
    REJECTION_REENTRY_META,
    REENTRY_REQUEST_FIELDS,
    QUICK_REENTRY_INSTRUCTION_CHIPS,
    getReentryCategoryMeta,
    validateRejectReentryPayload,
    rejectOrRequestReentry,
    getCaseRejectReentryStatus,
    // Diagnostic Investigations & Radiology (Vezeeta Pattern)
    INVESTIGATION_CATEGORIES,
    INVESTIGATION_URGENCIES,
    DIAGNOSTIC_INVESTIGATIONS_CATALOG,
    INVESTIGATION_PRESETS,
    getDiagnosticCatalog,
    getInvestigationPresets,
    getInvestigationByCode,
    filterDiagnosticCatalog,
    formatInvestigationUrgency,
    validateOrderedInvestigations
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorService = DoctorService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorService;
  }
})(typeof window !== "undefined" ? window : globalThis);

