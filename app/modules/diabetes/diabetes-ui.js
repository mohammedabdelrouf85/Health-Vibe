/**
 * Health Vibe AI - Diabetes Clinical Module UI Engine
 * 
 * Renders the dedicated Diabetes workspace section adhering to clinical governance:
 * - Real persisted data only (zero invented values, diagnoses, or synthetic cases).
 * - Every clinical field explicitly renders in one of 4 states:
 *   * known
 *   * unknown
 *   * not provided
 *   * not applicable
 * - 8 Core Sub-sections:
 *   1. Diabetes Overview
 *   2. Patient-Specific Diabetes Information
 *   3. Diabetes-Related Assessments
 *   4. Relevant Measurements (Glucose, HbA1c, Ketones)
 *   5. Doctor Review
 *   6. Clinical Notes
 *   7. Follow-up
 *   8. Approved Reports
 * - Strict access control:
 *   * Patients view only their own records.
 *   * Doctors view only patients they are authorized and assigned to review.
 *   * Admins follow existing governance with audit logging.
 * - Reuses existing UI design tokens, i18n, components, and workflows.
 */

(function (global) {
  "use strict";

  let activeTab = "overview";
  let activePatientId = null;
  let activeBundle = null;
  let isLoading = false;
  let errorMessage = null;

  function t(key, params = {}) {
    if (typeof global.HealthVibes?.i18n?.t === "function") {
      return global.HealthVibes.i18n.t(key, params);
    }
    if (typeof global.HealthVibes?.i18n?.defaultI18n?.t === "function") {
      return global.HealthVibes.i18n.defaultI18n.t(key, params);
    }
    if (typeof global.t === "function") {
      return global.t(key, params);
    }
    // Simple fallback
    return key;
  }

  function isRtl() {
    return (typeof document !== "undefined" && document.documentElement?.dir === "rtl") || (global.currentLanguage === "ar");
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
   * Renders the distinct visual badge for each of the 4 clinical field states.
   */
  function renderFieldStateBadge(fieldInfo) {
    if (!fieldInfo) {
      return `<span class="pill info" style="font-size:11px;" data-i18n="diabetes.stateNotProvided">${t("diabetes.stateNotProvided", {}) || "Not provided"}</span>`;
    }

    const { state, value, unit } = fieldInfo;

    switch (state) {
      case "known":
        return `<span class="pill ok" style="font-size:11.5px; font-weight:600;">${escapeHtml(value)}${unit ? " " + escapeHtml(unit) : ""}</span>`;

      case "unknown":
        return `<span class="pill pending" style="font-size:11px;" title="${t("diabetes.stateUnknownDesc", {}) || "Clinically investigated but status is unknown"}">
          <span aria-hidden="true">❓</span> ${escapeHtml(t("diabetes.stateUnknown", {}) || "Unknown")}
        </span>`;

      case "not_applicable":
        return `<span class="pill" style="font-size:11px; opacity:0.65; background:var(--surface-2); border:1px solid var(--line);" title="${t("diabetes.stateNotApplicableDesc", {}) || "Does not apply to this clinical context"}">
          <span aria-hidden="true">🚫</span> ${escapeHtml(t("diabetes.stateNotApplicable", {}) || "Not applicable")}
        </span>`;

      case "not_provided":
      default:
        return `<span class="pill info" style="font-size:11px; opacity:0.85;" title="${t("diabetes.stateNotProvidedDesc", {}) || "Unsupplied by patient or clinician"}">
          <span aria-hidden="true">📋</span> ${escapeHtml(t("diabetes.stateNotProvided", {}) || "Not provided")}
        </span>`;
    }
  }

  /**
   * Renders standardized 4-state badges: documented, missing, awaiting_review, approved.
   */
  function renderStatusPill(statusType) {
    switch (statusType) {
      case "documented":
        return `<span class="pill ok" style="font-weight:600; font-size:11px;"><span aria-hidden="true">✔</span> ${escapeHtml(t("diabetes.statusDocumented") || "Documented")}</span>`;
      case "missing":
        return `<span class="pill info" style="opacity:0.85; border:1px dashed var(--line); font-size:11px;"><span aria-hidden="true">📋</span> ${escapeHtml(t("diabetes.statusMissing") || "Missing")}</span>`;
      case "awaiting_review":
        return `<span class="pill pending" style="font-weight:600; font-size:11px;"><span aria-hidden="true">⏳</span> ${escapeHtml(t("diabetes.statusAwaitingReview") || "Awaiting Review")}</span>`;
      case "approved":
        return `<span class="pill" style="background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; font-weight:700; font-size:11px;"><span aria-hidden="true">🛡️</span> ${escapeHtml(t("diabetes.statusDoctorApproved") || "Doctor Approved")}</span>`;
      default:
        return `<span class="pill info" style="font-size:11px;">${escapeHtml(t("diabetes.statusDocumented") || "Documented")}</span>`;
    }
  }

  function formatDiabetesType(type) {
    const map = {
      type_1: isRtl() ? "النوع الأول (Type 1)" : "Type 1 Diabetes",
      type_2: isRtl() ? "النوع الثاني (Type 2)" : "Type 2 Diabetes",
      gestational: isRtl() ? "سكري الحمل (Gestational)" : "Gestational Diabetes",
      prediabetes: isRtl() ? "مقدمات السكري (Pre-diabetes)" : "Prediabetes",
      secondary: isRtl() ? "سكري ثانوي (Secondary)" : "Secondary Diabetes",
      other: isRtl() ? "أنواع أخرى (Other)" : "Other Specified Diabetes",
      unknown: isRtl() ? "غير محدد" : "Unspecified"
    };
    return map[type] || type || (isRtl() ? "غير مسجل" : "Not specified");
  }

  /**
   * Resolves the patient context for the current user and active role.
   */
  function resolveTargetPatientId() {
    const user = global.auth?.currentUser;
    const role = global.selectedRole || "patient";

    if (!user) return null;

    if (role === "patient") {
      return user.uid;
    }

    // For doctors or admins: check if a specific patient was selected from queue or history
    if (global._selectedDoctorCase?.patientId) {
      return global._selectedDoctorCase.patientId;
    }
    if (global._selectedPatientId) {
      return global._selectedPatientId;
    }

    // Default to own uid for testing/preview if doctor has self-record
    return user.uid;
  }

  /**
   * Main render orchestrator for the Diabetes Section inside #screen-diabetes.
   */
  async function renderScreen(container) {
    if (!container) return;

    const user = global.auth?.currentUser;
    const role = global.selectedRole || "patient";
    const patientId = resolveTargetPatientId();
    activePatientId = patientId;

    const isPatient = (role === "patient");
    if (isPatient && (activeTab === "overview" || activeTab === "doctor-review" || activeTab === "assessments" || activeTab === "patient-info")) {
      activeTab = "patient-dashboard";
    }

    // Log Client Audit Event
    if (typeof global.writeClientAuditLog === "function" && user) {
      try {
        global.writeClientAuditLog("DIABETES_MODULE_ACCESSED", {
          targetPatientId: patientId,
          role,
          activeTab
        });
      } catch (e) {}
    }

    // Render Container Shell
    container.innerHTML = `
      <div class="panel diabetes-panel" style="max-width: 1100px; margin: 0 auto; width: 100%;">
        <!-- Header -->
        <div class="panel-head" style="flex-wrap: wrap; gap: 14px; border-bottom: 1px solid var(--line); padding-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(239, 68, 68, 0.12); display: flex; align-items: center; justify-content: center; font-size: 24px;">
              🩸
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h3 id="diabetesModuleTitle" style="margin: 0; font-size: 19px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.moduleTitle">
                  ${escapeHtml(t("diabetes.moduleTitle") || "Diabetes Mellitus & Glycemic Control")}
                </h3>
              </div>
              <p style="font-size: 12.5px; color: var(--muted); margin: 3px 0 0;" data-i18n="diabetes.specialtyScope">
                ${escapeHtml(t("diabetes.specialtyScope") || "Endocrinology & Diabetology Specialized Track")}
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="pill pending" style="font-size: 11.5px;" data-i18n="diabetes.statusReview">
              ${escapeHtml(t("diabetes.statusReview") || "Under Specialist Review")}
            </span>
            <span class="pill info" style="font-size: 11.5px;" data-i18n="diabetes.governanceBadge">
              ${escapeHtml(t("diabetes.governanceBadge") || "Verified Data Only")}
            </span>
          </div>
        </div>

        <!-- Sub-navigation Tabs -->
        <div class="tabs" role="tablist" style="display: flex; overflow-x: auto; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2);">
          ${isPatient ? `
            ${renderTabButton("patient-dashboard", "📊", "diabetes.patientDashboardTitle", "Dashboard")}
            ${renderTabButton("measurements", "📈", "diabetes.tabMeasurements", "Measurements")}
            ${renderTabButton("clarifications", "💬", "diabetes.outstandingInquiriesHeading", "Doctor Inquiries")}
            ${renderTabButton("followup", "📅", "diabetes.tabFollowup", "Follow-up")}
            ${renderTabButton("reports", "📑", "diabetes.tabReports", "Approved Reports")}
          ` : `
            ${renderTabButton("overview", "📊", "diabetes.tabOverview", "Overview")}
            ${renderTabButton("patient-dashboard", "👤", "diabetes.patientDashboardTitle", "Patient View")}
            ${renderTabButton("patient-info", "📋", "diabetes.tabPatientInfo", "Patient Information")}
            ${renderTabButton("measurements", "📈", "diabetes.tabMeasurements", "Measurements")}
            ${renderTabButton("assessments", "🩺", "diabetes.tabAssessments", "Assessments")}
            ${renderTabButton("doctor-review", "👨‍⚕️", "diabetes.tabDoctorReview", "Doctor Review & Notes")}
            ${renderTabButton("followup", "📅", "diabetes.tabFollowup", "Follow-up")}
            ${renderTabButton("reports", "📑", "diabetes.tabReports", "Approved Reports")}
          `}
        </div>

        <!-- Content Area -->
        <div id="diabetesTabContent" style="padding: 20px 16px;">
          <div style="text-align: center; padding: 32px; color: var(--muted);">
            <div class="hv-skeleton" style="height: 120px; width: 100%; border-radius: 12px;"></div>
          </div>
        </div>
      </div>
    `;

    // Load Real Bundle & Populate Content
    await loadAndDisplayContent();
  }

  function renderTabButton(tabKey, icon, i18nKey, defaultLabel) {
    const isActive = activeTab === tabKey;
    return `
      <button type="button"
        role="tab"
        aria-selected="${isActive ? "true" : "false"}"
        class="tab-btn ${isActive ? "active" : ""}"
        onclick="HealthVibes.DiabetesUI.switchTab('${tabKey}')"
        style="padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid ${isActive ? "var(--teal)" : "transparent"}; background: ${isActive ? "var(--surface)" : "transparent"}; color: ${isActive ? "var(--teal)" : "var(--ink)"}; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
        <span>${icon}</span>
        <span data-i18n="${i18nKey}">${escapeHtml(t(i18nKey) || defaultLabel)}</span>
      </button>
    `;
  }

  function switchTab(newTab) {
    activeTab = newTab;
    const tabBtns = document.querySelectorAll(".diabetes-panel .tab-btn");
    tabBtns.forEach(btn => {
      const isCurrent = btn.getAttribute("onclick")?.includes(`'${newTab}'`);
      btn.classList.toggle("active", isCurrent);
      btn.setAttribute("aria-selected", isCurrent ? "true" : "false");
      btn.style.borderColor = isCurrent ? "var(--teal)" : "transparent";
      btn.style.background = isCurrent ? "var(--surface)" : "transparent";
      btn.style.color = isCurrent ? "var(--teal)" : "var(--ink)";
    });
    renderActiveTabContent();
  }

  async function loadAndDisplayContent() {
    const user = global.auth?.currentUser;
    const role = global.selectedRole || "patient";
    const patientId = activePatientId;
    const contentEl = document.getElementById("diabetesTabContent");

    if (!user) {
      if (contentEl) {
        contentEl.innerHTML = renderUnauthenticatedState();
      }
      return;
    }

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      if (DiabetesService) {
        activeBundle = await DiabetesService.fetchPatientDiabetesBundle(patientId);
      } else {
        activeBundle = {
          patientId,
          info: {},
          measurements: [],
          clinicalNotes: [],
          doctorReviews: [],
          followupPlan: null,
          approvedReports: []
        };
      }

      // Check Role-Based Access Guard
      const accessCheck = DiabetesService?.canAccessPatientDiabetes
        ? DiabetesService.canAccessPatientDiabetes(user, role, patientId, activeBundle?.info)
        : { allowed: true };

      if (!accessCheck.allowed) {
        if (contentEl) {
          contentEl.innerHTML = renderAccessDeniedState(accessCheck.reason);
        }
        return;
      }

      renderActiveTabContent();
    } catch (err) {
      console.error("[DiabetesUI] Error loading patient data:", err);
      if (contentEl) {
        contentEl.innerHTML = renderErrorState(err.message);
      }
    }
  }

  function renderActiveTabContent() {
    const contentEl = document.getElementById("diabetesTabContent");
    if (!contentEl) return;

    const role = global.selectedRole || "patient";
    const isPatient = (role === "patient");

    switch (activeTab) {
      case "patient-dashboard":
        contentEl.innerHTML = renderPatientDashboardTab();
        break;
      case "clarifications":
        contentEl.innerHTML = renderPatientClarificationsTab();
        break;
      case "overview":
        contentEl.innerHTML = isPatient ? renderPatientDashboardTab() : renderOverviewTab();
        break;
      case "patient-info":
        contentEl.innerHTML = renderPatientInfoTab();
        break;
      case "measurements":
        contentEl.innerHTML = renderMeasurementsTab();
        break;
      case "assessments":
        contentEl.innerHTML = isPatient ? renderPatientDashboardTab() : renderAssessmentsTab();
        break;
      case "doctor-review":
        contentEl.innerHTML = isPatient ? renderPatientDashboardTab() : renderDoctorReviewTab();
        break;
      case "followup":
        contentEl.innerHTML = renderFollowupTab();
        break;
      case "reports":
        contentEl.innerHTML = renderApprovedReportsTab();
        break;
      default:
        contentEl.innerHTML = isPatient ? renderPatientDashboardTab() : renderOverviewTab();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 0. PATIENT-FACING DIABETES DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────
  function renderPatientDashboardTab() {
    const bundle = activeBundle || {};
    const info = bundle.info || {};
    const measurements = Array.isArray(bundle.measurements) ? [...bundle.measurements] : [];
    measurements.sort((a, b) => new Date(b.measuredAt || b.createdAt || 0) - new Date(a.measuredAt || a.createdAt || 0));

    const clarifications = Array.isArray(bundle.clarifications) ? bundle.clarifications : [];
    const pendingClarifications = clarifications.filter(c => c.status === "unanswered" || c.status === "pending_patient" || !c.response);
    const followup = bundle.followupPlan;
    const reports = Array.isArray(bundle.approvedReports) ? bundle.approvedReports : [];
    const assessments = Array.isArray(bundle.assessments) ? bundle.assessments : [];

    // Resolve patient identity
    const user = global.auth?.currentUser;
    const cachedDoc = global._cachedUserDoc || {};
    const rawName = info.patientName?.value || cachedDoc.name || cachedDoc.displayName || user?.displayName || user?.name || (user?.email ? user.email.split("@")[0] : (isRtl() ? "مريض" : "Patient"));
    const firstName = String(rawName).split(" ")[0];

    // Assigned doctor attribution
    const assignedDocName = info.assignedDoctorName?.value || null;

    // Evaluate Next Required Patient Action
    let nextActionTitle = "";
    let nextActionBody = "";
    let nextActionButtonHtml = "";
    let nextActionType = "info"; // info, alert, success, pending

    if (pendingClarifications.length > 0) {
      const pendingInquiry = pendingClarifications[0];
      const inquiryDoctor = pendingInquiry.request?.doctorName || pendingInquiry.doctorName || (isRtl() ? "طبيبك المعالج" : "Attending Doctor");
      const inquiryNote = pendingInquiry.request?.note || pendingInquiry.note || pendingInquiry.message || "";
      nextActionType = "alert";
      nextActionTitle = t("diabetes.actionReplyClarification") || "Reply to pending doctor clarification";
      nextActionBody = `${isRtl() ? "طلب د." : "Dr."} ${escapeHtml(inquiryDoctor)} ${isRtl() ? "توضيحًا:" : "requested:"} "${escapeHtml(inquiryNote)}"`;
      nextActionButtonHtml = `
        <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openReplyClarificationModal('${escapeHtml(pendingInquiry.requestId || '')}', ${pendingInquiry.cycle || 'null'})" style="font-size:13px; padding:8px 16px;">
          💬 ${escapeHtml(t("diabetes.btnReplyToDoctor") || "Reply to Doctor")}
        </button>
      `;
    } else if (measurements.length === 0) {
      nextActionType = "alert";
      nextActionTitle = t("diabetes.actionLogFirstMeasurement") || "Log your first blood glucose reading to initiate care";
      nextActionBody = t("diabetes.emptyMeasurementsPatientMessage") || "Welcome! Please log your first blood glucose reading to initiate medical care.";
      nextActionButtonHtml = `
        <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openLogMeasurementModal()" style="font-size:13px; padding:8px 16px;">
          🩸 ${escapeHtml(t("diabetes.actionLogMeasurement") || "Log Blood Glucose Reading")}
        </button>
      `;
    } else if (assessments.some(a => a.status === "under_review" || a.status === "pending")) {
      nextActionType = "pending";
      nextActionTitle = t("diabetes.statusAwaitingReview") || "Awaiting Doctor Review";
      nextActionBody = t("diabetes.actionAwaitingDoctorReview") || "Your records are under doctor review — no action needed from you at this time.";
      nextActionButtonHtml = `
        <span class="pill pending" style="font-weight:600; font-size:12px;">⏳ ${escapeHtml(t("diabetes.statusAwaitingReview") || "Awaiting Doctor Review")}</span>
      `;
    } else if (reports.length > 0) {
      nextActionType = "success";
      nextActionTitle = t("diabetes.actionReviewApprovedReport") || "Review your certified medical report and approved follow-up plan";
      nextActionBody = isRtl() ? "تم اعتماد تقريرك وخطة المتابعة من طبيبك المعالج. يرجى الاطلاع على التوصيات الطبية وموعد المتابعة القادم." : "Your medical report and care plan have been approved. Review clinical recommendations and scheduled follow-up.";
      nextActionButtonHtml = `
        <button type="button" class="soft-button" onclick="HealthVibes.DiabetesUI.switchTab('reports')" style="font-size:13px; padding:8px 16px;">
          📑 ${escapeHtml(t("diabetes.btnViewReport") || "View Certified Report")}
        </button>
      `;
    } else {
      nextActionType = "info";
      nextActionTitle = t("diabetes.actionAllUpToDate") || "All records are up to date";
      nextActionBody = isRtl() ? "سجلاتك محدثة ومطابقة للخطة الطبية. تابع تسجيل قراءاتك الدورية بانتظام." : "All records are up to date. Continue logging periodic measurements as instructed.";
      nextActionButtonHtml = `
        <button type="button" class="soft-button" onclick="HealthVibes.DiabetesUI.openLogMeasurementModal()" style="font-size:13px; padding:8px 16px;">
          ➕ ${escapeHtml(t("diabetes.btnLogMeasurement") || "Log Reading")}
        </button>
      `;
    }

    // Determine current documented diabetes status
    const typeValue = info.type?.value || info.diabetesType?.value || (typeof info.type === "string" ? info.type : null);
    const formattedType = typeValue ? formatDiabetesType(typeValue) : (t("diabetes.stateNotProvided") || "Not provided");
    const diagDateValue = info.diagnosisDate?.value || (typeof info.diagnosisDate === "string" ? info.diagnosisDate : null);
    const regimenValue = info.activeInsulinRegimen?.value || null;

    // Target ranges
    const fastingTarget = info.fastingTarget?.value ? `${info.fastingTarget.value} ${info.fastingTarget.unit || "mg/dL"}` : null;
    const postprandialTarget = info.postprandialTarget?.value ? `${info.postprandialTarget.value} ${info.postprandialTarget.unit || "mg/dL"}` : null;
    const hba1cTarget = info.hba1cTarget?.value ? `${info.hba1cTarget.value} ${info.hba1cTarget.unit || "%"}` : null;

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">

        <!-- 1. Patient Welcome & Identity Hero Panel -->
        <div class="hero-panel" style="background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(13,148,136,0.08) 100%); border: 1px solid var(--line); border-radius: 16px; padding: 22px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
            <div>
              <span class="eyebrow" style="color: var(--teal); font-weight: 700;">
                ${isRtl() ? `مرحبًا، ${escapeHtml(firstName)}` : `Welcome, ${escapeHtml(firstName)}`}
              </span>
              <h2 style="margin: 4px 0 6px; font-size: 20px; font-weight: 800; color: var(--ink);" data-i18n="diabetes.patientDashboardTitle">
                ${escapeHtml(t("diabetes.patientDashboardTitle") || "Diabetes Care Dashboard")}
              </h2>
              <p style="margin: 0; font-size: 13.5px; color: var(--muted);" data-i18n="diabetes.patientDashboardSubtitle">
                ${escapeHtml(t("diabetes.patientDashboardSubtitle") || "Track measurements, approved reports, and clinical inquiries")}
              </p>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
                <span class="pill info" style="font-size: 11.5px;">
                  👤 ${isRtl() ? "رقم المريض:" : "Patient ID:"} ${escapeHtml(bundle.patientId || "P-ID")}
                </span>
                ${assignedDocName ? `
                  <span class="pill ok" style="font-size: 11.5px;">
                    👨‍⚕️ ${isRtl() ? "الطبيب المعالج: د." : "Attending Doctor: Dr."} ${escapeHtml(assignedDocName)}
                  </span>
                ` : `
                  <span class="pill pending" style="font-size: 11.5px;">
                    👨‍⚕️ ${escapeHtml(t("diabetes.noDoctorAssigned") || "Awaiting doctor assignment")}
                  </span>
                `}
                <span class="pill ok" style="font-size: 11.5px;">
                  🛡️ ${escapeHtml(t("diabetes.governanceBadge") || "Verified Data Only")}
                </span>
              </div>
            </div>
            <div>
              <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openLogMeasurementModal()" style="padding: 10px 18px; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <span>🩸</span>
                <span data-i18n="diabetes.btnLogMeasurement">${escapeHtml(t("diabetes.btnLogMeasurement") || "Log Measurement")}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Next Required Patient Action Card -->
        <div class="notice-card" style="border-inline-start: 5px solid ${nextActionType === 'alert' ? '#ef4444' : (nextActionType === 'pending' ? '#f59e0b' : (nextActionType === 'success' ? '#10b981' : 'var(--teal)'))}; background: var(--surface); border-radius: 12px; padding: 18px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); border-inline-end: 1px solid var(--line);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            <div style="display: flex; align-items: flex-start; gap: 12px; max-width: 720px;">
              <span style="font-size: 26px;">${nextActionType === 'alert' ? '⚠️' : (nextActionType === 'pending' ? '⏳' : (nextActionType === 'success' ? '✅' : 'ℹ️'))}</span>
              <div>
                <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--muted); letter-spacing: 0.5px;" data-i18n="diabetes.nextActionHeading">
                  ${escapeHtml(t("diabetes.nextActionHeading") || "Next Required Patient Action")}
                </span>
                <h4 style="margin: 2px 0 4px; font-size: 16px; font-weight: 800; color: var(--ink);">
                  ${escapeHtml(nextActionTitle)}
                </h4>
                <p style="margin: 0; font-size: 13.5px; color: var(--ink); line-height: 1.5;">
                  ${nextActionBody}
                </p>
              </div>
            </div>
            <div>
              ${nextActionButtonHtml}
            </div>
          </div>
        </div>

        <!-- 3. Clinical Data Status Legend (Clearly Distinguish 4 Clinical Statuses) -->
        <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px;">
          <div style="font-size: 11.5px; font-weight: 700; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;" data-i18n="diabetes.statusLegendTitle">
            ${escapeHtml(t("diabetes.statusLegendTitle") || "Clinical Data Status Legend")}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${renderStatusPill("documented")}
              <span style="color: var(--muted); font-size: 12px;">${isRtl() ? "بيانات مسجلة ومؤكدة بالملف" : "Persisted and confirmed on file"}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${renderStatusPill("missing")}
              <span style="color: var(--muted); font-size: 12px;">${isRtl() ? "بيانات سريرية غير متوفرة بعد" : "Not yet provided in records"}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${renderStatusPill("awaiting_review")}
              <span style="color: var(--muted); font-size: 12px;">${isRtl() ? "قيد تدقيق ومراجعة الطبيب" : "Queued for physician review"}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${renderStatusPill("approved")}
              <span style="color: var(--muted); font-size: 12px;">${isRtl() ? "معتمد وموقع طبيًا" : "Officially approved by doctor"}</span>
            </div>
          </div>
        </div>

        <!-- 4. Current Documented Diabetes Status -->
        <div class="panel" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink);" data-i18n="diabetes.currentDocumentedStatus">
              ${escapeHtml(t("diabetes.currentDocumentedStatus") || "Current Documented Diabetes Status")}
            </h4>
            <span class="pill ${reports.length > 0 ? "ok" : (typeValue ? "ok" : "info")}" style="font-size: 11.5px;">
              ${reports.length > 0 ? escapeHtml(t("diabetes.statusDoctorApproved") || "Doctor Approved") : (typeValue ? escapeHtml(t("diabetes.statusDocumented") || "Documented") : escapeHtml(t("diabetes.statusMissing") || "Missing"))}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
            <!-- Diabetes Type -->
            <div style="background: var(--surface-2); padding: 14px; border-radius: 10px; border: 1px solid var(--line);">
              <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.paramType">
                ${escapeHtml(t("diabetes.paramType") || "Diabetes Type")}
              </span>
              <div style="margin-top: 6px; font-size: 15px; font-weight: 700; color: var(--ink);">
                ${escapeHtml(formattedType)}
              </div>
              <div style="margin-top: 6px;">
                ${typeValue ? renderStatusPill("documented") : renderStatusPill("missing")}
              </div>
            </div>

            <!-- Diagnosis Date -->
            <div style="background: var(--surface-2); padding: 14px; border-radius: 10px; border: 1px solid var(--line);">
              <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.paramDiagnosisDate">
                ${escapeHtml(t("diabetes.paramDiagnosisDate") || "Diagnosis Date")}
              </span>
              <div style="margin-top: 6px; font-size: 15px; font-weight: 700; color: var(--ink);">
                ${diagDateValue ? escapeHtml(diagDateValue) : (isRtl() ? "غير مسجل" : "Not recorded")}
              </div>
              <div style="margin-top: 6px;">
                ${diagDateValue ? renderStatusPill("documented") : renderStatusPill("missing")}
              </div>
            </div>

            <!-- Treatment Regimen -->
            <div style="background: var(--surface-2); padding: 14px; border-radius: 10px; border: 1px solid var(--line);">
              <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.treatmentRegimenHeading">
                ${escapeHtml(t("diabetes.treatmentRegimenHeading") || "Documented Treatment Regimen")}
              </span>
              <div style="margin-top: 6px; font-size: 14px; font-weight: 600; color: var(--ink);">
                ${regimenValue ? escapeHtml(regimenValue) : (isRtl() ? "لم تسجل أدوية بعد" : "No medications recorded")}
              </div>
              <div style="margin-top: 6px;">
                ${regimenValue ? renderStatusPill("documented") : renderStatusPill("missing")}
              </div>
            </div>

            <!-- Target Ranges -->
            <div style="background: var(--surface-2); padding: 14px; border-radius: 10px; border: 1px solid var(--line);">
              <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.targetRangesHeading">
                ${escapeHtml(t("diabetes.targetRangesHeading") || "Doctor-Approved Target Ranges")}
              </span>
              <div style="margin-top: 6px; font-size: 12.5px; color: var(--ink); line-height: 1.6;">
                <div><b>FBG:</b> ${fastingTarget ? escapeHtml(fastingTarget) : (isRtl() ? "غير محدد" : "Not set")}</div>
                <div><b>PPG:</b> ${postprandialTarget ? escapeHtml(postprandialTarget) : (isRtl() ? "غير محدد" : "Not set")}</div>
                <div><b>HbA1c:</b> ${hba1cTarget ? escapeHtml(hba1cTarget) : (isRtl() ? "غير محدد" : "Not set")}</div>
              </div>
              <div style="margin-top: 6px;">
                ${(fastingTarget || postprandialTarget || hba1cTarget) ? renderStatusPill("approved") : renderStatusPill("missing")}
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Recent Measurements -->
        <div class="panel" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
            <div>
              <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink);" data-i18n="diabetes.recentMeasurementsHeading">
                ${escapeHtml(t("diabetes.recentMeasurementsHeading") || "Recent Recorded Measurements")}
              </h4>
              <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);">
                ${isRtl() ? "قراءات حقيقية مسجلة بالقيم، التواريخ، والوحدات الدقيقة." : "Real recorded readings with values, timestamps, and precise units."}
              </p>
            </div>
            <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openLogMeasurementModal()" style="font-size: 12.5px; padding: 6px 14px;">
              ➕ ${escapeHtml(t("diabetes.btnLogMeasurement") || "Log Measurement")}
            </button>
          </div>

          ${measurements.length === 0 ? `
            <div class="hv-state-card" data-state="empty" style="text-align: center; padding: 36px 16px; background: var(--surface-2); border: 1px dashed var(--line); border-radius: 12px;">
              <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">🩸</span>
              <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.noMeasurementsHeading">
                ${escapeHtml(t("diabetes.noMeasurementsHeading") || "No Persisted Measurements Recorded")}
              </h4>
              <p style="margin: 0 0 16px; font-size: 13px; color: var(--muted); max-width: 480px; margin-inline: auto;" data-i18n="diabetes.emptyMeasurementsPatientMessage">
                ${escapeHtml(t("diabetes.emptyMeasurementsPatientMessage") || "No glucose or HbA1c readings have been recorded in your profile yet.")}
              </p>
              <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openLogMeasurementModal()" style="font-size: 13px; padding: 8px 18px;">
                ${escapeHtml(t("diabetes.btnLogMeasurement") || "Log Measurement")}
              </button>
            </div>
          ` : `
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; min-width: 600px;">
                <thead>
                  <tr style="background: var(--surface-2); text-align: start; border-bottom: 1px solid var(--line);">
                    <th style="padding: 10px 12px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measurementDateLabel">
                      ${escapeHtml(t("diabetes.measurementDateLabel") || "Measurement Date & Time")}
                    </th>
                    <th style="padding: 10px 12px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measType">
                      ${escapeHtml(t("diabetes.measType") || "Type / Context")}
                    </th>
                    <th style="padding: 10px 12px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measValue">
                      ${escapeHtml(t("diabetes.measValue") || "Value")}
                    </th>
                    <th style="padding: 10px 12px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measurementUnitLabel">
                      ${escapeHtml(t("diabetes.measurementUnitLabel") || "Unit")}
                    </th>
                    <th style="padding: 10px 12px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measSource">
                      ${escapeHtml(t("diabetes.measSource") || "Source")}
                    </th>
                    <th style="padding: 10px 12px; font-weight: 600; color: var(--muted);">
                      ${isRtl() ? "الحالة السريرية" : "Clinical Status"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${measurements.slice(0, 10).map(m => `
                    <tr style="border-bottom: 1px solid var(--line);">
                      <td style="padding: 10px 12px; color: var(--muted); white-space: nowrap;">
                        📅 ${escapeHtml(new Date(m.measuredAt || m.createdAt || Date.now()).toLocaleString())}
                      </td>
                      <td style="padding: 10px 12px; font-weight: 600; color: var(--ink);">
                        ${escapeHtml(formatMeasurementType(m.type, m.mealContext))}
                      </td>
                      <td style="padding: 10px 12px;">
                        <span class="pill ok" style="font-weight: 700; font-size: 13.5px;">
                          ${escapeHtml(m.value)}
                        </span>
                      </td>
                      <td style="padding: 10px 12px; color: var(--muted); font-weight: 600;">
                        ${escapeHtml(m.unit || (m.type === "hba1c" ? "%" : "mg/dL"))}
                      </td>
                      <td style="padding: 10px 12px; color: var(--muted); font-size: 12px;">
                        ${escapeHtml(formatMeasurementSource(m.source))}
                      </td>
                      <td style="padding: 10px 12px;">
                        ${reports.length > 0 ? renderStatusPill("approved") : renderStatusPill("documented")}
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- 6. Outstanding Information Requests (Patient Clarifications) -->
        <div class="panel" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink);" data-i18n="diabetes.outstandingInquiriesHeading">
              ${escapeHtml(t("diabetes.outstandingInquiriesHeading") || "Outstanding Doctor Inquiries")}
            </h4>
            <span class="pill ${pendingClarifications.length > 0 ? "pending" : "ok"}" style="font-size: 11.5px;">
              ${pendingClarifications.length > 0 ? `${pendingClarifications.length} ${isRtl() ? "استفسار معلق" : "pending inquiry"}` : (isRtl() ? "لا توجد استفسارات معلقة" : "Up to date")}
            </span>
          </div>

          ${clarifications.length === 0 ? `
            <div style="text-align: center; padding: 24px 16px; background: var(--surface-2); border-radius: 10px; color: var(--muted); font-size: 13.5px;">
              <span style="font-size: 24px; display: block; margin-bottom: 6px;">💬</span>
              ${escapeHtml(t("diabetes.noInquiriesNotice") || "No pending clarification requests from your doctor.")}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${clarifications.map(c => {
                const isPending = c.status === "unanswered" || c.status === "pending_patient" || !c.response;
                const docName = c.request?.doctorName || c.doctorName || (isRtl() ? "الطبيب المعالج" : "Attending Doctor");
                const docNote = c.request?.note || c.note || c.message || "";
                const reqDate = c.request?.timestamp || c.eventTimestamp || "";
                const responseText = c.response?.text || (typeof c.response === "string" ? c.response : null);

                return `
                  <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px; border-inline-start: 4px solid ${isPending ? '#f59e0b' : '#10b981'};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                      <div>
                        <div style="font-size: 12px; font-weight: 700; color: var(--muted);">
                          👨‍⚕️ ${escapeHtml(docName)} • ${reqDate ? escapeHtml(new Date(reqDate).toLocaleString()) : ""}
                        </div>
                        <div style="font-size: 13.5px; color: var(--ink); margin: 6px 0; font-weight: 600;">
                          "${escapeHtml(docNote)}"
                        </div>
                      </div>
                      <div>
                        ${isPending ? `
                          <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openReplyClarificationModal('${escapeHtml(c.requestId || '')}', ${c.cycle || 'null'})" style="font-size: 12px; padding: 6px 12px;">
                            💬 ${escapeHtml(t("diabetes.btnReplyToDoctor") || "Reply to Doctor")}
                          </button>
                        ` : `
                          <span class="pill ok" style="font-size: 11px;">
                            ✔ ${isRtl() ? "تم إرسال ردك" : "Replied"}
                          </span>
                        `}
                      </div>
                    </div>

                    ${responseText ? `
                      <div style="margin-top: 10px; padding: 10px 12px; background: var(--surface); border-radius: 8px; border: 1px solid var(--line); font-size: 13px;">
                        <span style="font-weight: 700; color: var(--teal); font-size: 11.5px;">${isRtl() ? "إجابتك المسجلة:" : "Your Response:"}</span>
                        <div style="color: var(--ink); margin-top: 3px;">${escapeHtml(responseText)}</div>
                      </div>
                    ` : ""}
                  </div>
                `;
              }).join("")}
            </div>
          `}
        </div>

        <!-- 7. Doctor-Approved Follow-up Plan -->
        <div class="panel" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink);" data-i18n="diabetes.doctorApprovedFollowupHeading">
              ${escapeHtml(t("diabetes.doctorApprovedFollowupHeading") || "Doctor-Approved Follow-up Plan")}
            </h4>
            <span class="pill ${followup ? "ok" : "info"}" style="font-size: 11.5px;">
              ${followup ? escapeHtml(t("diabetes.statusDoctorApproved") || "Doctor Approved") : escapeHtml(t("diabetes.statusMissing") || "Pending Doctor Approval")}
            </span>
          </div>

          ${!followup ? `
            <div style="text-align: center; padding: 24px 16px; background: var(--surface-2); border-radius: 10px; color: var(--muted); font-size: 13.5px;" data-i18n="diabetes.noApprovedFollowupNotice">
              <span style="font-size: 24px; display: block; margin-bottom: 6px;">📅</span>
              ${escapeHtml(t("diabetes.noApprovedFollowupNotice") || "Your follow-up plan will appear here once officially approved by your physician.")}
            </div>
          ` : `
            <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 16px;">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 12px;">
                <div>
                  <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.scheduledDate">
                    ${escapeHtml(t("diabetes.scheduledDate") || "Scheduled Review Date")}
                  </span>
                  <div style="font-size: 14.5px; font-weight: 700; color: var(--ink); margin-top: 4px;">
                    📅 ${escapeHtml(followup.scheduledDate || followup.scheduledDateField?.value || (isRtl() ? "غير محدد" : "Not set"))}
                  </div>
                </div>
                <div>
                  <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.intervalDays">
                    ${escapeHtml(t("diabetes.intervalDays") || "Monitoring Interval")}
                  </span>
                  <div style="font-size: 14.5px; font-weight: 700; color: var(--ink); margin-top: 4px;">
                    🔄 ${escapeHtml(followup.intervalDays || followup.intervalDaysField?.value || t("diabetes.stateNotProvided"))} ${isRtl() ? "يوم" : "days"}
                  </div>
                </div>
              </div>

              ${followup.instructions ? `
                <div style="margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px;">
                  <span style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.instructions">
                    ${escapeHtml(t("diabetes.instructions") || "Specialist Instructions")}
                  </span>
                  <p style="margin: 4px 0 0; font-size: 13.5px; color: var(--ink); line-height: 1.6;">
                    ${escapeHtml(followup.instructions)}
                  </p>
                </div>
              ` : ""}
            </div>
          `}
        </div>

        <!-- 8. Doctor-Approved Reports -->
        <div class="panel" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink);" data-i18n="diabetes.approvedReportsHeading">
              ${escapeHtml(t("diabetes.approvedReportsHeading") || "Doctor-Approved Reports")}
            </h4>
            <span class="pill ${reports.length > 0 ? "ok" : "info"}" style="font-size: 11.5px;">
              ${reports.length > 0 ? `${reports.length} ${isRtl() ? "تقرير معتمد" : "Approved"}` : (isRtl() ? "لا توجد تقارير معتمدة بعد" : "None certified")}
            </span>
          </div>

          ${reports.length === 0 ? `
            <div style="text-align: center; padding: 24px 16px; background: var(--surface-2); border-radius: 10px; color: var(--muted); font-size: 13.5px;" data-i18n="diabetes.noApprovedReportsPatientNotice">
              <span style="font-size: 24px; display: block; margin-bottom: 6px;">📑</span>
              ${escapeHtml(t("diabetes.noApprovedReportsPatientNotice") || "No approved reports yet — certified reports are released exclusively after specialist review.")}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${reports.map(rep => `
                <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 800; font-size: 15px; color: var(--ink);">${escapeHtml(rep.reportRef || "HV-REP")}</span>
                      ${renderStatusPill("approved")}
                    </div>
                    <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">
                      👨‍⚕️ ${escapeHtml(t("diabetes.approvingDoctor") || "Doctor")}: ${escapeHtml(rep.doctorIdentity?.name || "Licensed Physician")}
                      • 📅 ${escapeHtml(new Date(rep.approvedAt || Date.now()).toLocaleDateString())}
                    </div>
                    ${rep.clinicalDiagnosis ? `
                      <div style="font-size: 13px; color: var(--ink); margin-top: 6px;">
                        <b>${isRtl() ? "التشخيص المعتمد:" : "Approved Diagnosis:"}</b> ${escapeHtml(rep.clinicalDiagnosis)}
                      </div>
                    ` : ""}
                  </div>
                  <button type="button" class="soft-button" onclick="showScreen('report')" style="font-size: 13px; padding: 8px 16px;" data-i18n="diabetes.btnViewReport">
                    ${escapeHtml(t("diabetes.btnViewReport") || "View Certified Report")}
                  </button>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- 9. Clinical Governance & Safety Boundaries Notice -->
        <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; font-size: 12.5px; color: var(--muted); line-height: 1.6;">
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 18px;">🛡️</span>
            <div>
              <strong style="color: var(--ink);">${isRtl() ? "حوكمة البيانات السريرية والخصوصية:" : "Clinical Data Governance & Privacy:"}</strong>
              <div data-i18n="diabetes.clinicalGovernancePatientNotice" style="margin-top: 2px;">
                ${escapeHtml(t("diabetes.clinicalGovernancePatientNotice") || "All displayed information is sourced strictly from your authentic medical records. Internal doctor notes and unapproved clinical interpretations are not displayed.")}
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  function renderPatientClarificationsTab() {
    const bundle = activeBundle || {};
    const clarifications = Array.isArray(bundle.clarifications) ? bundle.clarifications : [];

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.outstandingInquiriesHeading">
              ${escapeHtml(t("diabetes.outstandingInquiriesHeading") || "Outstanding Doctor Inquiries")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);">
              ${isRtl() ? "استفسارات وتوضيحات مطلوبة من طبيبك المعالج لتحديث خطة الرعاية." : "Inquiries and clarifications requested by your physician to update your care plan."}
            </p>
          </div>
        </div>

        ${clarifications.length === 0 ? `
          <div class="hv-state-card" data-state="empty" style="text-align: center; padding: 36px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px;">
            <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">💬</span>
            <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink);">
              ${escapeHtml(t("diabetes.noInquiriesNotice") || "No pending clarification requests from your doctor.")}
            </h4>
            <p style="margin: 0; font-size: 13px; color: var(--muted); max-width: 480px; margin-inline: auto;">
              ${isRtl() ? "عندما يحتاج طبيبك المعالج إلى معلومات إضافية حول قياساتك، ستظهر طلبات التوضيح هنا." : "When your doctor requires additional information regarding your measurements, clarification requests will appear here."}
            </p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${clarifications.map(c => {
              const isPending = c.status === "unanswered" || c.status === "pending_patient" || !c.response;
              const docName = c.request?.doctorName || c.doctorName || (isRtl() ? "الطبيب المعالج" : "Attending Doctor");
              const docNote = c.request?.note || c.note || c.message || "";
              const reqDate = c.request?.timestamp || c.eventTimestamp || "";
              const responseText = c.response?.text || (typeof c.response === "string" ? c.response : null);

              return `
                <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; border-inline-start: 4px solid ${isPending ? '#f59e0b' : '#10b981'};">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                    <div>
                      <div style="font-size: 12.5px; font-weight: 700; color: var(--muted);">
                        👨‍⚕️ ${escapeHtml(docName)} • ${reqDate ? escapeHtml(new Date(reqDate).toLocaleString()) : ""}
                      </div>
                      <div style="font-size: 14.5px; color: var(--ink); margin: 8px 0; font-weight: 600;">
                        "${escapeHtml(docNote)}"
                      </div>
                    </div>
                    <div>
                      ${isPending ? `
                        <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openReplyClarificationModal('${escapeHtml(c.requestId || '')}', ${c.cycle || 'null'})" style="font-size: 13px; padding: 8px 16px;">
                          💬 ${escapeHtml(t("diabetes.btnReplyToDoctor") || "Reply to Doctor")}
                        </button>
                      ` : `
                        <span class="pill ok" style="font-size: 11.5px;">
                          ✔ ${isRtl() ? "تم إرسال ردك بنجاح" : "Replied"}
                        </span>
                      `}
                    </div>
                  </div>

                  ${responseText ? `
                    <div style="margin-top: 12px; padding: 12px 14px; background: var(--surface-2); border-radius: 8px; border: 1px solid var(--line); font-size: 13.5px;">
                      <span style="font-weight: 700; color: var(--teal); font-size: 12px;">${isRtl() ? "إجابتك المسجلة:" : "Your Response:"}</span>
                      <div style="color: var(--ink); margin-top: 4px;">${escapeHtml(responseText)}</div>
                    </div>
                  ` : ""}
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DIABETES OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────────
  function renderOverviewTab() {
    const bundle = activeBundle || {};
    const measurementsCount = bundle.measurements?.length || 0;
    const notesCount = bundle.clinicalNotes?.length || 0;
    const reviewsCount = bundle.doctorReviews?.length || 0;
    const reportsCount = bundle.approvedReports?.length || 0;

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Clinical Governance Notice -->
        <div class="notice-card" style="border-inline-start: 4px solid var(--teal); background: var(--surface-2); padding: 16px; border-radius: 12px;">
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 22px;">ℹ️</span>
            <div>
              <h4 style="margin: 0 0 6px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.overviewNoticeTitle">
                ${escapeHtml(t("diabetes.overviewNoticeTitle") || "Certified Clinical Data Governance")}
              </h4>
              <p style="margin: 0 0 10px; font-size: 13.5px; color: var(--ink); line-height: 1.6;" data-i18n="diabetes.overviewNoticeBody">
                ${escapeHtml(t("diabetes.overviewNoticeBody") || "This module manages specialized endocrine and glycemic records. Every data field reflects genuine clinical entry without assumptions or algorithmic synthetic defaults.")}
              </p>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted);">
                <span>• ${escapeHtml(t("diabetes.fourStateRule") || "Strict 4-State Data Field Classification: Known, Unknown, Not Provided, Not Applicable.")}</span>
                <span>• ${escapeHtml(t("diabetes.humanReviewRule") || "Independent Doctor Review strictly required.")}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Persisted Data Summary Cards (Zero synthetic values) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
          <div class="summary-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px;">
            <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.totalMeasurements">
              ${escapeHtml(t("diabetes.totalMeasurements") || "Persisted Measurements")}
            </span>
            <div style="font-size: 26px; font-weight: 700; color: var(--ink); margin-top: 6px;">
              ${measurementsCount}
            </div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
              ${measurementsCount > 0 ? (t("diabetes.recordsLogged") || "Verified readings logged") : (t("diabetes.noMeasurementsYet") || "No readings logged yet")}
            </div>
          </div>

          <div class="summary-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px;">
            <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.clinicalNotesCount">
              ${escapeHtml(t("diabetes.clinicalNotesCount") || "Doctor Clinical Notes")}
            </span>
            <div style="font-size: 26px; font-weight: 700; color: var(--ink); margin-top: 6px;">
              ${notesCount}
            </div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
              ${notesCount > 0 ? (t("diabetes.notesRecorded") || "Clinical observations on file") : (t("diabetes.noNotesYet") || "No clinical notes on file")}
            </div>
          </div>

          <div class="summary-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px;">
            <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.reviewsCount">
              ${escapeHtml(t("diabetes.reviewsCount") || "Doctor Reviews")}
            </span>
            <div style="font-size: 26px; font-weight: 700; color: var(--ink); margin-top: 6px;">
              ${reviewsCount}
            </div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
              ${reviewsCount > 0 ? (t("diabetes.reviewsCompleted") || "Specialist reviews completed") : (t("diabetes.noReviewsYet") || "No reviews on record")}
            </div>
          </div>

          <div class="summary-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px;">
            <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.approvedReportsCount">
              ${escapeHtml(t("diabetes.approvedReportsCount") || "Approved Reports")}
            </span>
            <div style="font-size: 26px; font-weight: 700; color: var(--ink); margin-top: 6px;">
              ${reportsCount}
            </div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
              ${reportsCount > 0 ? (t("diabetes.certifiedAvailable") || "Certified reports ready") : (t("diabetes.noApprovedReportsYet") || "No approved reports yet")}
            </div>
          </div>
        </div>

        <!-- Clinical References & Guidelines -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <h4 style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.guidelinesTitle">
            ${escapeHtml(t("diabetes.guidelinesTitle") || "Governing Clinical Practice Guidelines")}
          </h4>
          <ul style="margin: 0; padding-inline-start: 20px; font-size: 13.5px; color: var(--muted); line-height: 1.7;">
            <li><strong>ADA 2026:</strong> American Diabetes Association Standards of Medical Care in Diabetes.</li>
            <li><strong>EASD:</strong> European Association for the Study of Diabetes Glycemic Protocols.</li>
            <li><strong>Egyptian Diabetes Association:</strong> National clinical guidelines for chronic disease management.</li>
          </ul>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PATIENT-SPECIFIC DIABETES INFORMATION
  // ─────────────────────────────────────────────────────────────────────────────
  function renderPatientInfoTab() {
    const bundle = activeBundle || {};
    const info = bundle.info || {};

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.patientInfoTitle">
              ${escapeHtml(t("diabetes.patientInfoTitle") || "Patient Clinical Profile")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);" data-i18n="diabetes.patientInfoSubtitle">
              ${escapeHtml(t("diabetes.patientInfoSubtitle") || "Persisted clinical records with explicit field-state tracking.")}
            </p>
          </div>
        </div>

        <!-- Data Grid -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
            <thead>
              <tr style="background: var(--surface-2); text-align: start; border-bottom: 1px solid var(--line);">
                <th style="padding: 12px 16px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.fieldLabel">${escapeHtml(t("diabetes.fieldLabel") || "Clinical Parameter")}</th>
                <th style="padding: 12px 16px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.fieldStatus">${escapeHtml(t("diabetes.fieldStatus") || "Recorded State & Value")}</th>
              </tr>
            </thead>
            <tbody>
              ${renderInfoRow("diabetes.paramPatientId", "Patient Identifier", info.patientId)}
              ${renderInfoRow("diabetes.paramPatientName", "Patient Name", info.patientName)}
              ${renderInfoRow("diabetes.paramType", "Diabetes Classification", info.diabetesType)}
              ${renderInfoRow("diabetes.paramDiagnosisDate", "Date of Diagnosis", info.diagnosisDate)}
              ${renderInfoRow("diabetes.paramFastingTarget", "Target Fasting Blood Glucose", info.fastingTarget)}
              ${renderInfoRow("diabetes.paramPostprandialTarget", "Target Postprandial Glucose", info.postprandialTarget)}
              ${renderInfoRow("diabetes.paramHba1cTarget", "Target HbA1c", info.hba1cTarget)}
              ${renderInfoRow("diabetes.paramActiveInsulin", "Active Insulin Regimen", info.activeInsulinRegimen)}
              ${renderInfoRow("diabetes.paramComorbidities", "Documented Comorbidities", info.comorbidities)}
              ${renderInfoRow("diabetes.paramAssignedDoctor", "Assigned Attending Doctor", info.assignedDoctorName)}
              ${renderInfoRow("diabetes.paramLastReviewed", "Last Clinical Review Date", info.lastReviewedAt)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderInfoRow(i18nKey, defaultLabel, fieldData) {
    return `
      <tr style="border-bottom: 1px solid var(--line);">
        <td style="padding: 12px 16px; font-weight: 500; color: var(--ink);">
          <span data-i18n="${i18nKey}">${escapeHtml(t(i18nKey) || defaultLabel)}</span>
        </td>
        <td style="padding: 12px 16px;">
          ${renderFieldStateBadge(fieldData)}
        </td>
      </tr>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. RELEVANT MEASUREMENTS
  // ─────────────────────────────────────────────────────────────────────────────
  function renderMeasurementsTab() {
    const bundle = activeBundle || {};
    const measurements = bundle.measurements || [];
    const isDoctor = global.selectedRole === "doctor" || global.selectedRole === "clinic_admin" || global.selectedRole === "super_admin";

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.measurementsTitle">
              ${escapeHtml(t("diabetes.measurementsTitle") || "Glycemic & Biomarker Measurements")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);" data-i18n="diabetes.measurementsSubtitle">
              ${escapeHtml(t("diabetes.measurementsSubtitle") || "Real recorded glucose, HbA1c, and ketone readings.")}
            </p>
          </div>
          <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openLogMeasurementModal()" style="font-size: 13px; padding: 8px 16px; display: flex; align-items: center; gap: 6px;">
            <span>➕</span>
            <span data-i18n="diabetes.btnLogMeasurement">${escapeHtml(t("diabetes.btnLogMeasurement") || "Log Measurement")}</span>
          </button>
        </div>

        ${measurements.length === 0 ? `
          <div class="hv-state-card" data-state="empty" style="text-align: center; padding: 36px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px;">
            <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">📊</span>
            <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.noMeasurementsHeading">
              ${escapeHtml(t("diabetes.noMeasurementsHeading") || "No Persisted Measurements Recorded")}
            </h4>
            <p style="margin: 0; font-size: 13px; color: var(--muted); max-width: 480px; margin: 0 auto;" data-i18n="diabetes.noMeasurementsText">
              ${escapeHtml(t("diabetes.noMeasurementsText") || "No blood glucose or laboratory measurements have been recorded yet for this patient.")}
            </p>
          </div>
        ` : `
          <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 650px;">
              <thead>
                <tr style="background: var(--surface-2); text-align: start; border-bottom: 1px solid var(--line);">
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--muted);" data-i18n="common.date">${escapeHtml(t("common.date") || "Date & Time")}</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measType">${escapeHtml(t("diabetes.measType") || "Type / Context")}</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measValue">${escapeHtml(t("diabetes.measValue") || "Value")}</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--muted);" data-i18n="diabetes.measSource">${escapeHtml(t("diabetes.measSource") || "Source")}</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--muted);" data-i18n="common.details">${escapeHtml(t("common.details") || "Details / Notes")}</th>
                </tr>
              </thead>
              <tbody>
                ${measurements.map(m => `
                  <tr style="border-bottom: 1px solid var(--line);">
                    <td style="padding: 10px 14px; color: var(--muted); white-space: nowrap;">
                      ${escapeHtml(new Date(m.measuredAt || m.createdAt).toLocaleString())}
                    </td>
                    <td style="padding: 10px 14px; font-weight: 600; color: var(--ink);">
                      ${escapeHtml(formatMeasurementType(m.type, m.mealContext))}
                    </td>
                    <td style="padding: 10px 14px;">
                      <span class="pill ok" style="font-weight: 700; font-size: 13px;">
                        ${escapeHtml(m.value)} ${escapeHtml(m.unit || "")}
                      </span>
                    </td>
                    <td style="padding: 10px 14px; color: var(--muted); font-size: 12.5px;">
                      ${escapeHtml(formatMeasurementSource(m.source))}
                    </td>
                    <td style="padding: 10px 14px; color: var(--ink); font-size: 12.5px;">
                      ${m.notes ? escapeHtml(m.notes) : `<span style="color:var(--muted); font-size:11px;">-</span>`}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  function formatMeasurementType(type, context) {
    const map = {
      fasting: t("diabetes.typeFasting") || "Fasting Blood Glucose",
      postprandial: t("diabetes.typePostprandial") || "Postprandial (2-hr)",
      random: t("diabetes.typeRandom") || "Random Blood Glucose",
      bedtime: t("diabetes.typeBedtime") || "Bedtime Glucose",
      hba1c: t("diabetes.typeHba1c") || "Glycated Hemoglobin (HbA1c)",
      ketones: t("diabetes.typeKetones") || "Ketones"
    };
    return map[type] || type || "Measurement";
  }

  function formatMeasurementSource(src) {
    const map = {
      manual_patient_log: t("diabetes.srcManual") || "Manual Patient Log",
      cgm_sensor: t("diabetes.srcCgm") || "Continuous Glucose Monitor (CGM)",
      bluetooth_glucometer: t("diabetes.srcBgm") || "Bluetooth Glucometer",
      clinic_reading: t("diabetes.srcClinic") || "In-Clinic Reading",
      accredited_lab_ocr: t("diabetes.srcLab") || "Accredited Lab Report"
    };
    return map[src] || src || "Log";
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DIABETES-RELATED ASSESSMENTS
  // ─────────────────────────────────────────────────────────────────────────────
  function renderAssessmentsTab() {
    const bundle = activeBundle || {};
    const assessments = bundle.assessments || [];

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.assessmentsTitle">
              ${escapeHtml(t("diabetes.assessmentsTitle") || "Diabetes Clinical Assessments")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);" data-i18n="diabetes.assessmentsSubtitle">
              ${escapeHtml(t("diabetes.assessmentsSubtitle") || "Integrated with the platform assessment workflow.")}
            </p>
          </div>
          <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openAssessmentModal(null)" style="font-size: 13px; padding: 8px 16px; display: flex; align-items: center; gap: 6px;">
            <span>📋</span>
            <span data-i18n="diabetes.btnNewStructuredAssessment">${escapeHtml(t("diabetes.btnNewStructuredAssessment") || "New Structured Assessment")}</span>
          </button>
        </div>

        ${assessments.length === 0 ? `
          <div class="hv-state-card" data-state="empty" style="text-align: center; padding: 36px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px;">
            <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">📋</span>
            <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.noAssessmentsHeading">
              ${escapeHtml(t("diabetes.noAssessmentsHeading") || "Zero Assessment History")}
            </h4>
            <p style="margin: 0 0 16px; font-size: 13px; color: var(--muted); max-width: 460px; margin: 0 auto 16px;" data-i18n="diabetes.noAssessmentsDesc">
              ${escapeHtml(t("diabetes.noAssessmentsDesc") || "No structured diabetes assessments have been submitted for this patient yet.")}
            </p>
            <button type="button" class="outline-button" onclick="HealthVibes.DiabetesUI.openAssessmentModal(null)" style="font-size: 13px; padding: 8px 18px;" data-i18n="diabetes.btnNewStructuredAssessment">
              ${escapeHtml(t("diabetes.btnNewStructuredAssessment") || "New Structured Assessment")}
            </button>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            ${assessments.map(asm => renderSingleAssessmentCard(asm)).join("")}
          </div>
        `}
      </div>
    `;
  }

  function renderSingleAssessmentCard(asm) {
    const rev = asm.clinicalRevision || 1;
    const authorName = asm.author?.name || asm.author?.displayName || t("diabetes.stateNotProvided");
    const dateFormatted = asm.lastRevisionAt ? new Date(asm.lastRevisionAt).toLocaleDateString() : "";

    return `
      <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <!-- Card Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--line); padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-weight: 700; font-size: 15px; color: var(--ink);">${escapeHtml(asm.assessmentId)}</span>
            <span class="pill ok" style="font-size: 11px; font-weight: 700;">
              ${escapeHtml(t("diabetes.clinicalRevisionBadge") || "Clinical Revision")} #${rev}
            </span>
            <span class="pill info" style="font-size: 11px;">
              ${escapeHtml(asm.status || "submitted")}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 12px; color: var(--muted);">${dateFormatted} • ${escapeHtml(authorName)}</span>
            <button type="button" class="soft-button" onclick="HealthVibes.DiabetesUI.openAssessmentModal('${escapeHtml(asm.assessmentId)}')" style="font-size: 12px; padding: 6px 12px; display: flex; align-items: center; gap: 4px;">
              <span>✏️</span>
              <span data-i18n="diabetes.btnReviseAssessment">${escapeHtml(t("diabetes.btnReviseAssessment") || "Revise Assessment")}</span>
            </button>
          </div>
        </div>

        <!-- Clinically Relevant Sections Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; font-size: 13px;">
          <!-- 1. Diabetes History & Status -->
          <div style="background: var(--surface-2); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
            <div style="font-weight: 700; color: var(--ink); margin-bottom: 4px;" data-i18n="diabetes.sectionHistory">
              ${escapeHtml(t("diabetes.sectionHistory") || "Diabetes History & Status")}
            </div>
            <div style="color: var(--muted); line-height: 1.5;">
              <div><strong>Status:</strong> ${escapeHtml(asm.diabetesHistory?.status || "not_provided")}</div>
              <div><strong>Type:</strong> ${escapeHtml(asm.diabetesHistory?.diabetesType || "not_provided")}</div>
              ${asm.diabetesHistory?.diagnosisYear ? `<div><strong>Year:</strong> ${escapeHtml(asm.diabetesHistory.diagnosisYear)}</div>` : ""}
              ${asm.diabetesHistory?.notes ? `<div><strong>Notes:</strong> ${escapeHtml(asm.diabetesHistory.notes)}</div>` : ""}
            </div>
          </div>

          <!-- 2. Symptoms -->
          <div style="background: var(--surface-2); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
            <div style="font-weight: 700; color: var(--ink); margin-bottom: 4px;" data-i18n="diabetes.sectionSymptoms">
              ${escapeHtml(t("diabetes.sectionSymptoms") || "Relevant Symptoms")}
            </div>
            <div style="color: var(--muted); line-height: 1.5;">
              ${Array.isArray(asm.symptoms?.reported) && asm.symptoms.reported.length > 0 
                ? asm.symptoms.reported.map(s => `<span class="pill info" style="margin: 2px; font-size: 11px;">${escapeHtml(s)}</span>`).join(" ")
                : `<em>${escapeHtml(t("diabetes.stateNotProvided") || "Not provided")}</em>`}
              ${asm.symptoms?.notes ? `<div style="margin-top: 4px;">${escapeHtml(asm.symptoms.notes)}</div>` : ""}
            </div>
          </div>

          <!-- 3. Blood Glucose & HbA1c -->
          <div style="background: var(--surface-2); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
            <div style="font-weight: 700; color: var(--ink); margin-bottom: 4px;" data-i18n="diabetes.sectionMeasurements">
              ${escapeHtml(t("diabetes.sectionMeasurements") || "Measurements")}
            </div>
            <div style="color: var(--muted); line-height: 1.5;">
              ${renderAssessmentMeasurements(asm.measurements)}
            </div>
          </div>

          <!-- 4. Medications & Complications -->
          <div style="background: var(--surface-2); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
            <div style="font-weight: 700; color: var(--ink); margin-bottom: 4px;">
              ${escapeHtml(t("diabetes.sectionMedications") || "Medications")} & ${escapeHtml(t("diabetes.sectionComplications") || "Complications")}
            </div>
            <div style="color: var(--muted); line-height: 1.5;">
              <div><strong>Meds:</strong> ${escapeHtml(asm.medications?.details || asm.medications?.status || "not_provided")}</div>
              <div><strong>Complications:</strong> ${Array.isArray(asm.complications?.conditions) && asm.complications.conditions.length > 0 ? escapeHtml(asm.complications.conditions.join(", ")) : "not_provided"}</div>
            </div>
          </div>

          <!-- 5. Family History & Lifestyle -->
          <div style="background: var(--surface-2); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
            <div style="font-weight: 700; color: var(--ink); margin-bottom: 4px;">
              ${escapeHtml(t("diabetes.sectionFamilyHistory") || "Family History")} & ${escapeHtml(t("diabetes.sectionLifestyle") || "Lifestyle")}
            </div>
            <div style="color: var(--muted); line-height: 1.5;">
              <div><strong>Family:</strong> ${escapeHtml(asm.familyHistory?.relativesDetails || asm.familyHistory?.status || "not_provided")}</div>
              <div><strong>Lifestyle:</strong> ${escapeHtml(asm.lifestyle?.physicalActivity || asm.lifestyle?.dietaryPattern || "not_provided")}</div>
            </div>
          </div>

          <!-- 6. Doctor Notes & Follow-up -->
          <div style="background: var(--surface-2); padding: 12px; border-radius: 8px; border: 1px solid var(--line);">
            <div style="font-weight: 700; color: var(--ink); margin-bottom: 4px;">
              ${escapeHtml(t("diabetes.sectionDoctorNotes") || "Doctor Notes")} & ${escapeHtml(t("diabetes.sectionFollowup") || "Follow-up")}
            </div>
            <div style="color: var(--muted); line-height: 1.5;">
              <div><strong>Notes:</strong> ${escapeHtml(asm.doctorNotes?.text || t("diabetes.stateNotProvided"))}</div>
              <div><strong>Follow-up:</strong> ${escapeHtml(asm.followup?.scheduledDate || t("diabetes.stateNotProvided"))} ${asm.followup?.instructions ? `(${escapeHtml(asm.followup.instructions)})` : ""}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAssessmentMeasurements(m) {
    if (!m || Object.keys(m).length === 0) {
      return `<em>${escapeHtml(t("diabetes.stateNotProvided") || "Not provided")}</em>`;
    }
    const lines = [];
    for (const [key, val] of Object.entries(m)) {
      if (val && val.value !== undefined && val.value !== null) {
        lines.push(`<div><strong>${escapeHtml(key)}:</strong> ${escapeHtml(val.value)} ${escapeHtml(val.unit || "")} <span style="font-size:11px; opacity:0.8;">(${escapeHtml(val.source || "manual")})</span></div>`);
      }
    }
    return lines.length > 0 ? lines.join("") : `<em>${escapeHtml(t("diabetes.stateNotProvided") || "Not provided")}</em>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. DOCTOR REVIEW & CLINICAL NOTES
  // ─────────────────────────────────────────────────────────────────────────────
  function renderDoctorReviewTab() {
    const bundle = activeBundle || {};
    const notes = bundle.clinicalNotes || [];
    const reviews = bundle.doctorReviews || [];
    const measurements = bundle.measurements || [];
    const clarifications = bundle.clarifications || [];
    const attachments = bundle.attachments || [];
    const approvedReports = bundle.approvedReports || [];
    const assessments = bundle.assessments || [];
    const latestAssessment = assessments.length > 0 ? assessments[0] : null;

    const user = global.auth?.currentUser;
    const role = global.selectedRole || "patient";
    const DiabetesService = global.HealthVibes?.DiabetesService;

    // 1. Doctor Assignment & RBAC Authorization Check
    const accessCheck = DiabetesService?.canAccessPatientDiabetes
      ? DiabetesService.canAccessPatientDiabetes(user, role, activePatientId, bundle?.info)
      : { allowed: true };

    if (!accessCheck.allowed) {
      return renderAccessDeniedState(accessCheck.reason);
    }

    // 2. Clinical Revision & Assessment Metadata
    const currentRevisionNumber = latestAssessment?.clinicalRevision || bundle.clinicalRevision || 1;
    const currentRevisionId = latestAssessment?.currentRevisionId || latestAssessment?.assessmentId || `rev-${activePatientId}-${currentRevisionNumber}`;
    const rawAssessedAt = latestAssessment?.assessedAt || latestAssessment?.createdAt || bundle.info?.lastUpdated || new Date().toISOString();
    const assessmentDate = new Date(rawAssessedAt).toLocaleString();

    // 3. Stale Review Detection
    const isStale = DiabetesService?.isRevisionStale
      ? DiabetesService.isRevisionStale(activePatientId, currentRevisionId)
      : false;
    const acknowledgedRev = DiabetesService?.getAcknowledgedRevision
      ? DiabetesService.getAcknowledgedRevision(activePatientId)
      : null;
    const isReviewed = !isStale && acknowledgedRev === String(currentRevisionId);

    // 4. Preserved Doctor Draft Notes
    const preservedDraft = DiabetesService?.getDraftNotes
      ? DiabetesService.getDraftNotes(activePatientId)
      : null;
    const draftDiag = preservedDraft?.clinicalDiagnosis || preservedDraft?.diagnosis || "";
    const draftMeds = preservedDraft?.medications || "";
    const draftRecs = preservedDraft?.recommendations || "";
    const draftNote = preservedDraft?.doctorNotes || preservedDraft?.notes || "";

    const patientName = bundle.info?.patientName?.isRecorded ? bundle.info.patientName.value : (bundle.patientName || activePatientId);
    const assignedDocName = bundle.info?.assignedDoctorName?.isRecorded ? bundle.info.assignedDoctorName.value : (bundle.assignedDoctorName || (t("diabetes.noDoctorAssigned") || "Assigned Medical Specialist"));
    const clinicName = bundle.clinicName || bundle.info?.clinicName || "مركز السكري والغدد الصماء التخصصي";

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16.5px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.reviewWorkflowTitle">
              ${escapeHtml(t("diabetes.reviewWorkflowTitle") || "Diabetes Doctor Review & Clinical Approval")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);" data-i18n="diabetes.doctorReviewSubtitle">
              ${escapeHtml(t("diabetes.doctorReviewSubtitle") || "Licensed medical professional consultation, revision audit, and certified care plans.")}
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="soft-button" onclick="HealthVibes.DiabetesUI.openAddNoteModal()" style="font-size: 13px; padding: 8px 14px;">
              <span>📝</span> <span data-i18n="diabetes.btnAddNote">${escapeHtml(t("diabetes.btnAddNote") || "Add Clinical Note")}</span>
            </button>
            <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openRevisionReviewModal('${escapeHtml(currentRevisionId)}', ${currentRevisionNumber})" style="font-size: 13px; padding: 8px 16px;">
              <span>🔍</span> <span data-i18n="diabetes.btnReviewCurrentRevision">${escapeHtml(t("diabetes.btnReviewCurrentRevision") || "Review Current Revision")}</span>
            </button>
          </div>
        </div>

        <!-- Stale Review Warning Banner -->
        ${isStale ? `
          <div id="diabetesStaleBanner" class="doctor-stale-alert-banner" style="background: rgba(251, 146, 60, 0.14); border: 1.5px solid #f97316; border-radius: 12px; padding: 14px 18px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 26px;">⚠️</span>
                <div>
                  <strong style="color: #c2410c; font-size: 14px;" data-i18n="diabetes.staleReviewBannerTitle">
                    ${escapeHtml(t("diabetes.staleReviewBannerTitle") || "Stale Clinical Review Warning")}
                  </strong>
                  <p style="margin: 2px 0 0; font-size: 12.5px; color: var(--ink);" data-i18n="diabetes.staleReviewBannerDesc">
                    ${escapeHtml(t("diabetes.staleReviewBannerDesc") || "Clinical information or measurements have changed since the case was opened. You must explicitly review the updated revision before approval.")}
                  </p>
                </div>
              </div>
              <button type="button" class="solid-button" onclick="HealthVibes.DiabetesUI.openRevisionReviewModal('${escapeHtml(currentRevisionId)}', ${currentRevisionNumber})" style="font-size: 12.5px; padding: 6px 14px; background: #c2410c; color: white;">
                <span>🔍</span> <span data-i18n="diabetes.btnReviewCurrentRevision">${escapeHtml(t("diabetes.btnReviewCurrentRevision") || "Review Current Revision")}</span>
              </button>
            </div>
          </div>
        ` : ""}

        <!-- 1. PATIENT IDENTITY & CASE ATTRIBUTION -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px;">
            <h5 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>👤</span> <span data-i18n="diabetes.patientIdentityTitle">${escapeHtml(t("diabetes.patientIdentityTitle") || "Patient Identity & Attending Specialist Attribution")}</span>
            </h5>
            <span class="pill info" style="font-size: 11.5px; font-weight: 600;">
              ${escapeHtml(clinicName)}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
            <div>
              <div style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;">${escapeHtml(t("common.name") || "Patient Name")}</div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--ink); margin-top: 3px;">${escapeHtml(patientName)}</div>
              <div style="font-size: 11.5px; color: var(--muted); font-family: monospace;">ID: ${escapeHtml(activePatientId)}</div>
            </div>
            <div>
              <div style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;">${escapeHtml(t("diabetes.assignmentTitle") || "Attending Physician")}</div>
              <div style="font-size: 14px; font-weight: 600; color: var(--teal); margin-top: 3px;">👨‍⚕️ ${escapeHtml(assignedDocName)}</div>
              <div style="font-size: 11.5px; color: var(--muted);">${escapeHtml(t("diabetes.assignedSpecialistDesc") || "Endocrinologist / Diabetologist in charge")}</div>
            </div>
            <div>
              <div style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;">${escapeHtml(t("diabetes.assessmentDateLabel") || "Assessment Date")}</div>
              <div style="font-size: 13.5px; font-weight: 600; color: var(--ink); margin-top: 3px;">📅 ${escapeHtml(assessmentDate)}</div>
              <div style="font-size: 11.5px; color: var(--muted);">Intake & Revision Timestamp</div>
            </div>
            <div>
              <div style="font-size: 11.5px; color: var(--muted); text-transform: uppercase;">${escapeHtml(t("diabetes.clinicalRevisionLabel") || "Current Clinical Revision")}</div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                <span class="pill primary" style="font-weight: 700; font-size: 12px;">#${currentRevisionNumber}</span>
                ${isReviewed
                  ? `<span class="pill ok" style="font-size: 11px;">✅ ${escapeHtml(t("diabetes.reviewStatusVerified") || "Reviewed")}</span>`
                  : `<span class="pill pending" style="font-size: 11px;">⚠️ ${escapeHtml(t("diabetes.reviewStatusPending") || "Pending Review")}</span>`}
              </div>
            </div>
          </div>
        </div>

        <!-- 2. SUBMITTED DIABETES INFORMATION (4-State Clinical Classification) -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <h5 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span>📋</span> <span data-i18n="diabetes.submittedInfoHeading">${escapeHtml(t("diabetes.submittedInfoHeading") || "Submitted Diabetes Clinical Information")}</span>
          </h5>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
            <div style="border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--surface-2);">
              <div style="font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px;" data-i18n="diabetes.type">${escapeHtml(t("diabetes.type") || "Diabetes Classification")}</div>
              ${renderFieldStateBadge(bundle.info?.diabetesType)}
            </div>

            <div style="border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--surface-2);">
              <div style="font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px;" data-i18n="diabetes.activeInsulin">${escapeHtml(t("diabetes.activeInsulin") || "Active Insulin Regimen")}</div>
              ${renderFieldStateBadge(bundle.info?.activeInsulinRegimen)}
            </div>

            <div style="border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--surface-2);">
              <div style="font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px;" data-i18n="diabetes.fastingTarget">${escapeHtml(t("diabetes.fastingTarget") || "Target Fasting Glucose")}</div>
              ${renderFieldStateBadge(bundle.info?.fastingTarget)}
            </div>

            <div style="border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--surface-2);">
              <div style="font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px;" data-i18n="diabetes.postprandialTarget">${escapeHtml(t("diabetes.postprandialTarget") || "Target Postprandial Glucose")}</div>
              ${renderFieldStateBadge(bundle.info?.postprandialTarget)}
            </div>
          </div>

          ${latestAssessment ? `
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line); display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; font-size: 12.5px;">
              <div>
                <strong>${escapeHtml(t("diabetes.sectionSymptoms") || "Reported Symptoms")}:</strong>
                <div style="color: var(--ink); margin-top: 3px;">
                  ${latestAssessment.symptoms?.reported?.length ? latestAssessment.symptoms.reported.map(s => `<span class="pill info" style="font-size:11px; margin:2px;">${escapeHtml(s)}</span>`).join(" ") : (latestAssessment.symptoms?.notes ? escapeHtml(latestAssessment.symptoms.notes) : `<em>${escapeHtml(t("diabetes.stateNotProvided") || "None reported")}</em>`)}
                </div>
              </div>
              <div>
                <strong>${escapeHtml(t("diabetes.sectionMedications") || "Current Medications")}:</strong>
                <div style="color: var(--ink); margin-top: 3px;">${latestAssessment.medications?.details ? escapeHtml(latestAssessment.medications.details) : `<em>${escapeHtml(t("diabetes.stateNotProvided") || "None reported")}</em>`}</div>
              </div>
              <div>
                <strong>${escapeHtml(t("diabetes.sectionComplications") || "Complications")}:</strong>
                <div style="color: var(--ink); margin-top: 3px;">
                  ${latestAssessment.complications?.conditions?.length ? latestAssessment.complications.conditions.map(c => `<span class="pill warn" style="font-size:11px; margin:2px;">${escapeHtml(c)}</span>`).join(" ") : `<em>${escapeHtml(t("diabetes.stateNotProvided") || "None reported")}</em>`}
                </div>
              </div>
              <div>
                <strong>${escapeHtml(t("diabetes.sectionLifestyle") || "Lifestyle & Diet")}:</strong>
                <div style="color: var(--ink); margin-top: 3px;">${latestAssessment.lifestyle?.physicalActivity || latestAssessment.lifestyle?.notes ? escapeHtml(latestAssessment.lifestyle.physicalActivity || latestAssessment.lifestyle.notes) : `<em>${escapeHtml(t("diabetes.stateNotProvided") || "None reported")}</em>`}</div>
              </div>
            </div>
          ` : ""}
        </div>

        <!-- 3. HISTORICAL MEASUREMENTS -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h5 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>📊</span> <span data-i18n="diabetes.historicalMeasurementsHeading">${escapeHtml(t("diabetes.historicalMeasurementsHeading") || "Historical Glycemic Measurements")}</span>
            </h5>
            <span style="font-size: 12px; color: var(--muted);">${measurements.length} ${escapeHtml(t("diabetes.readingsCount") || "readings")}</span>
          </div>

          ${measurements.length === 0 ? `
            <div style="padding: 20px; text-align: center; background: var(--surface-2); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px;" data-i18n="diabetes.noMeasurementsHeading">
              ${escapeHtml(t("diabetes.noMeasurementsHeading") || "No Persisted Measurements Recorded")}
            </div>
          ` : `
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: var(--surface-2); text-align: start; border-bottom: 1px solid var(--line);">
                    <th style="padding: 8px 12px; color: var(--muted);">${escapeHtml(t("common.date") || "Date & Time")}</th>
                    <th style="padding: 8px 12px; color: var(--muted);">${escapeHtml(t("diabetes.measType") || "Type / Context")}</th>
                    <th style="padding: 8px 12px; color: var(--muted);">${escapeHtml(t("diabetes.measValue") || "Value")}</th>
                    <th style="padding: 8px 12px; color: var(--muted);">${escapeHtml(t("diabetes.measSource") || "Source")}</th>
                    <th style="padding: 8px 12px; color: var(--muted);">${escapeHtml(t("common.details") || "Notes")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${measurements.map(m => `
                    <tr style="border-bottom: 1px solid var(--line);">
                      <td style="padding: 8px 12px; color: var(--muted); white-space: nowrap;">${escapeHtml(new Date(m.measuredAt || m.createdAt).toLocaleString())}</td>
                      <td style="padding: 8px 12px; font-weight: 600; color: var(--ink);">${escapeHtml(formatMeasurementType(m.type, m.mealContext))}</td>
                      <td style="padding: 8px 12px;"><span class="pill ok" style="font-weight: 700;">${escapeHtml(m.value)} ${escapeHtml(m.unit || "")}</span></td>
                      <td style="padding: 8px 12px; color: var(--muted); font-size: 12px;">${escapeHtml(formatMeasurementSource(m.source))}</td>
                      <td style="padding: 8px 12px; color: var(--ink); font-size: 12px;">${m.notes ? escapeHtml(m.notes) : "-"}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- 4. PATIENT CLARIFICATIONS THREAD -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h5 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>💬</span> <span data-i18n="diabetes.patientClarificationsHeading">${escapeHtml(t("diabetes.patientClarificationsHeading") || "Patient Clarifications & Dialogue")}</span>
            </h5>
            <button type="button" class="soft-button" onclick="HealthVibes.DiabetesUI.openAddClarificationModal()" style="font-size: 12px; padding: 5px 12px;">
              <span>➕</span> <span>Request Clarification</span>
            </button>
          </div>

          ${clarifications.length === 0 ? `
            <div style="padding: 20px; text-align: center; background: var(--surface-2); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px;" data-i18n="diabetes.noClarificationsNotice">
              ${escapeHtml(t("diabetes.noClarificationsNotice") || "No clarification inquiries or patient statements recorded.")}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${clarifications.map(cl => `
                <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: 600; font-size: 12.5px; color: var(--ink);">
                      ${cl.authorRole === "doctor" ? "👨‍⚕️ " + escapeHtml(cl.authorName || "Doctor Query") : "👤 " + escapeHtml(cl.authorName || "Patient Reply")}
                    </span>
                    <span style="font-size: 11px; color: var(--muted);">${escapeHtml(new Date(cl.createdAt).toLocaleString())}</span>
                  </div>
                  <p style="margin: 0; font-size: 13px; color: var(--ink); line-height: 1.5;">${escapeHtml(cl.message || cl.text)}</p>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- 5. RELEVANT ATTACHMENTS -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h5 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>📎</span> <span data-i18n="diabetes.relevantAttachmentsHeading">${escapeHtml(t("diabetes.relevantAttachmentsHeading") || "Relevant Medical Attachments")}</span>
            </h5>
            <button type="button" class="soft-button" onclick="HealthVibes.DiabetesUI.openAddAttachmentModal()" style="font-size: 12px; padding: 5px 12px;">
              <span>➕</span> <span>Upload File</span>
            </button>
          </div>

          ${attachments.length === 0 ? `
            <div style="padding: 20px; text-align: center; background: var(--surface-2); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px;" data-i18n="diabetes.noAttachmentsNotice">
              ${escapeHtml(t("diabetes.noAttachmentsNotice") || "No medical files, lab PDF reports, or glucose graphs attached.")}
            </div>
          ` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px;">
              ${attachments.map(att => `
                <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                  <div>
                    <div style="font-weight: 600; font-size: 13px; color: var(--ink);">📄 ${escapeHtml(att.fileName || att.name || "Lab_Report.pdf")}</div>
                    <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">${escapeHtml(att.fileType || "PDF Document")} • ${escapeHtml(new Date(att.uploadedAt || att.createdAt).toLocaleDateString())}</div>
                  </div>
                  <a href="${escapeHtml(att.fileUrl || att.url || '#')}" target="_blank" class="outline-button" style="font-size: 11.5px; padding: 4px 10px; text-decoration: none;">View</a>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- 6. DOCTOR NOTES & REPORT BUILDER -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <h5 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span>📝</span> <span data-i18n="diabetes.doctorNotesHeading">${escapeHtml(t("diabetes.doctorNotesHeading") || "Doctor Consultation Notes & Care Plan Builder")}</span>
          </h5>

          <!-- Preserved Draft Notice -->
          ${preservedDraft ? `
            <div id="diabetesDraftNotice" style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--teal); background: rgba(14, 165, 164, 0.1); padding: 8px 12px; border-radius: 8px; margin-bottom: 14px;">
              <span>💾</span> <span data-i18n="diabetes.unsavedNotesPreservedNotice">${escapeHtml(t("diabetes.unsavedNotesPreservedNotice") || "Preserved unsaved doctor notes from previous session.")}</span>
            </div>
          ` : ""}

          <!-- Clinical Boundaries Disclaimer -->
          <div style="background: rgba(14, 165, 233, 0.08); border-inline-start: 4px solid var(--teal); border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 12.5px; color: var(--ink);">
            <strong data-i18n="diabetes.nonDiagnosticNotice">${escapeHtml(t("diabetes.nonDiagnosticNotice") || "Clinical Governance Rule:")}</strong>
            <span> ${escapeHtml(t("diabetes.clinicalDisclaimerEn") || "Any final clinical content must come from the approved doctor workflow. Autonomous diagnosis or medication titration is strictly prohibited.")}</span>
          </div>

          <form id="diabetesDoctorApprovalForm" onsubmit="event.preventDefault();">
            <div style="display: flex; flex-direction: column; gap: 14px;">
              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--ink); margin-bottom: 4px;" data-i18n="diabetes.diagInputLabel">
                  ${escapeHtml(t("diabetes.diagInputLabel") || "Physician Clinical Diagnosis (Required)")}
                </label>
                <textarea id="diabetesDoctorDiagnosisInput" required rows="2" oninput="HealthVibes.DiabetesUI.handleDraftInput()" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink); font-size: 13.5px; resize: vertical;" placeholder="Enter validated diagnosis (e.g. Type 2 Diabetes Mellitus - Uncontrolled hyperglycemia)...">${escapeHtml(draftDiag)}</textarea>
              </div>

              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--ink); margin-bottom: 4px;" data-i18n="diabetes.medsInputLabel">
                  ${escapeHtml(t("diabetes.medsInputLabel") || "Physician Prescribed Medications & Regimen (Required)")}
                </label>
                <textarea id="diabetesDoctorMedsInput" required rows="2" oninput="HealthVibes.DiabetesUI.handleDraftInput()" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink); font-size: 13.5px; resize: vertical;" placeholder="Enter medications and specific titration instructions authored by physician...">${escapeHtml(draftMeds)}</textarea>
              </div>

              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--ink); margin-bottom: 4px;" data-i18n="diabetes.recsInputLabel">
                  ${escapeHtml(t("diabetes.recsInputLabel") || "Physician Clinical Recommendations & Lifestyle Plan (Required)")}
                </label>
                <textarea id="diabetesDoctorRecsInput" required rows="2" oninput="HealthVibes.DiabetesUI.handleDraftInput()" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink); font-size: 13.5px; resize: vertical;" placeholder="Enter clinical lifestyle advice, dietary instructions, repeat testing schedule...">${escapeHtml(draftRecs)}</textarea>
              </div>

              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 600; color: var(--ink); margin-bottom: 4px;">
                  Internal Consultation Notes
                </label>
                <textarea id="diabetesDoctorNotesInput" rows="2" oninput="HealthVibes.DiabetesUI.handleDraftInput()" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink); font-size: 13.5px; resize: vertical;" placeholder="Confidential clinical notes for attending team...">${escapeHtml(draftNote)}</textarea>
              </div>
            </div>
          </form>

          <!-- Historical Notes Listing -->
          ${notes.length > 0 ? `
            <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line);">
              <div style="font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 8px;">Consultation Notes on File:</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${notes.map(n => `
                  <div style="background: var(--surface-2); border-radius: 8px; padding: 10px 12px; font-size: 12.5px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <strong style="color: var(--teal);">${escapeHtml(n.author?.name || "Attending Physician")}</strong>
                      <span style="color: var(--muted); font-size: 11px;">${escapeHtml(new Date(n.createdAt).toLocaleDateString())}</span>
                    </div>
                    <div style="color: var(--ink);">${escapeHtml(n.noteText)}</div>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>

        <!-- 7. PREVIOUS APPROVED REPORTS -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <h5 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span>📑</span> <span data-i18n="diabetes.previousApprovedReportsHeading">${escapeHtml(t("diabetes.previousApprovedReportsHeading") || "Previous Certified Medical Reports")}</span>
          </h5>

          ${approvedReports.length === 0 ? `
            <div style="padding: 20px; text-align: center; background: var(--surface-2); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px;" data-i18n="diabetes.noPreviousReportsNotice">
              ${escapeHtml(t("diabetes.noPreviousReportsNotice") || "No approved medical reports have been certified yet for this patient.")}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${approvedReports.map(rep => `
                <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; font-size: 14px; color: var(--ink);">${escapeHtml(rep.reportRef || "HV-REP")}</span>
                      <span class="pill ok" style="font-size: 11px;">Verified</span>
                    </div>
                    <div style="font-size: 12px; color: var(--muted); margin-top: 3px;">
                      ${escapeHtml(t("diabetes.approvingDoctor") || "Doctor")}: ${escapeHtml(rep.doctorIdentity?.name || rep.doctorName || "Licensed Physician")} • ${escapeHtml(new Date(rep.approvedAt || rep.createdAt).toLocaleString())}
                    </div>
                    ${rep.clinicalDiagnosis ? `
                      <div style="font-size: 12.5px; color: var(--ink); margin-top: 4px;">
                        <strong>Diagnosis:</strong> ${escapeHtml(rep.clinicalDiagnosis)}
                      </div>
                    ` : ""}
                  </div>
                  <button type="button" class="soft-button" onclick="showScreen('report')" style="font-size: 12.5px; padding: 6px 14px;" data-i18n="diabetes.viewCertifiedReport">
                    ${escapeHtml(t("diabetes.viewCertifiedReport") || "View Certified Report")}
                  </button>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- 8. APPROVAL ACTION TOOLBAR & CONCURRENCY GUARD -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 13.5px; font-weight: 700; color: var(--ink);">Final Medical Sign-Off & Certification</div>
              <div style="font-size: 12px; color: var(--muted);">Enforces clinical revision review, fresh data validation, and physician identity attribution.</div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              ${(!isReviewed || isStale) ? `
                <button type="button" class="solid-button" id="btnApproveDiabetesReport" disabled style="font-size: 13.5px; padding: 10px 22px; opacity: 0.55; cursor: not-allowed; background: var(--muted);">
                  <span>🔒</span> <span data-i18n="diabetes.btnApproveDiabetesReport">${escapeHtml(t("diabetes.btnApproveDiabetesReport") || "Approve & Certify Report")}</span>
                </button>
              ` : `
                <button type="button" class="solid-button" id="btnApproveDiabetesReport" onclick="HealthVibes.DiabetesUI.handleApproveDiabetesReview()" style="font-size: 13.5px; padding: 10px 22px; background: #16a34a; color: white; font-weight: 700; box-shadow: 0 4px 12px rgba(22,163,74,0.25);">
                  <span>✨</span> <span data-i18n="diabetes.btnApproveDiabetesReport">${escapeHtml(t("diabetes.btnApproveDiabetesReport") || "Approve & Certify Report")}</span>
                </button>
              `}
            </div>
          </div>

          ${(!isReviewed || isStale) ? `
            <div id="diabetesApprovalLockedNotice" style="margin-top: 10px; font-size: 12px; color: #c2410c; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              <span>⚠️</span> <span data-i18n="diabetes.approvalLockedNotice">${escapeHtml(t("diabetes.approvalLockedNotice") || "You must review and acknowledge the current clinical revision before final approval.")}</span>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. FOLLOW-UP
  // ─────────────────────────────────────────────────────────────────────────────
  function renderFollowupTab() {
    const bundle = activeBundle || {};
    const followup = bundle.followupPlan;

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.followupTitle">
              ${escapeHtml(t("diabetes.followupTitle") || "Chronic Follow-up & Glycemic Monitoring Plan")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);" data-i18n="diabetes.followupSubtitle">
              ${escapeHtml(t("diabetes.followupSubtitle") || "Scheduled specialist evaluations, repeat HbA1c tests, and complication screening intervals.")}
            </p>
          </div>
          <button type="button" class="solid-button" onclick="showScreen('appointments')" style="font-size: 13px; padding: 8px 16px; display: flex; align-items: center; gap: 6px;">
            <span>📅</span>
            <span data-i18n="diabetes.btnBookConsultation">${escapeHtml(t("diabetes.btnBookConsultation") || "Book Follow-up Appointment")}</span>
          </button>
        </div>

        ${!followup ? `
          <div class="hv-state-card" data-state="empty" style="text-align: center; padding: 36px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px;">
            <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">📅</span>
            <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.noFollowupHeading">
              ${escapeHtml(t("diabetes.noFollowupHeading") || "No Follow-up Plan Prescribed Yet")}
            </h4>
            <p style="margin: 0; font-size: 13px; color: var(--muted); max-width: 480px; margin: 0 auto;" data-i18n="diabetes.noFollowupText">
              ${escapeHtml(t("diabetes.noFollowupText") || "The attending endocrinologist has not yet set a formal follow-up interval for this patient.")}
            </p>
          </div>
        ` : `
          <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 16px;">
              <div>
                <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.scheduledDate">
                  ${escapeHtml(t("diabetes.scheduledDate") || "Scheduled Review Date")}
                </span>
                <div style="margin-top: 6px;">
                  ${renderFieldStateBadge(followup.scheduledDateField)}
                </div>
              </div>
              <div>
                <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.intervalDays">
                  ${escapeHtml(t("diabetes.intervalDays") || "Monitoring Interval")}
                </span>
                <div style="margin-top: 6px;">
                  ${renderFieldStateBadge(followup.intervalDaysField)}
                </div>
              </div>
            </div>

            <div>
              <span style="font-size: 12px; color: var(--muted); text-transform: uppercase;" data-i18n="diabetes.instructions">
                ${escapeHtml(t("diabetes.instructions") || "Specialist Instructions")}
              </span>
              <p style="margin: 6px 0 0; font-size: 13.5px; color: var(--ink); line-height: 1.6;">
                ${followup.instructions ? escapeHtml(followup.instructions) : `<span style="color:var(--muted);">${escapeHtml(t("diabetes.stateNotProvided") || "Not provided")}</span>`}
              </p>
            </div>
          </div>
        `}
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. APPROVED REPORTS
  // ─────────────────────────────────────────────────────────────────────────────
  function renderApprovedReportsTab() {
    const bundle = activeBundle || {};
    const reports = bundle.approvedReports || [];

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.reportsTitle">
              ${escapeHtml(t("diabetes.reportsTitle") || "Certified Medical Reports")}
            </h4>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: var(--muted);" data-i18n="diabetes.reportsSubtitle">
              ${escapeHtml(t("diabetes.reportsSubtitle") || "Formal medical reports signed and approved by licensed physicians.")}
            </p>
          </div>
        </div>

        ${reports.length === 0 ? `
          <div class="hv-state-card" data-state="empty" style="text-align: center; padding: 36px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px;">
            <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">📑</span>
            <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.noReportsHeading">
              ${escapeHtml(t("diabetes.noReportsHeading") || "Zero Approved Reports")}
            </h4>
            <p style="margin: 0; font-size: 13px; color: var(--muted); max-width: 480px; margin: 0 auto;" data-i18n="diabetes.noReportsText">
              ${escapeHtml(t("diabetes.noReportsText") || "No approved medical reports have been certified yet for this patient.")}
            </p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${reports.map(rep => `
              <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: 700; font-size: 14.5px; color: var(--ink);">${escapeHtml(rep.reportRef || "HV-REP")}</span>
                    <span class="pill ok" style="font-size: 11px;" data-i18n="common.verified">${escapeHtml(t("common.verified") || "Verified")}</span>
                  </div>
                  <div style="font-size: 12px; color: var(--muted); font-family: monospace;">
                    HASH: ${escapeHtml(rep.reportHash ? rep.reportHash.slice(0, 24) + "..." : "SHA256")}
                  </div>
                  <div style="font-size: 12.5px; color: var(--ink); margin-top: 4px;">
                    ${escapeHtml(t("diabetes.approvingDoctor") || "Doctor")}: ${escapeHtml(rep.doctorIdentity?.name || "Licensed Physician")}
                  </div>
                </div>
                <button type="button" class="soft-button" onclick="showScreen('report')" style="font-size: 13px; padding: 8px 16px;" data-i18n="diabetes.btnViewReport">
                  ${escapeHtml(t("diabetes.btnViewReport") || "View Certified Report")}
                </button>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODALS & INPUT HANDLERS (Real Data Ingestion)
  // ─────────────────────────────────────────────────────────────────────────────
  function openLogMeasurementModal() {
    let modal = document.getElementById("logDiabetesMeasurementModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "logDiabetesMeasurementModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:480px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);" data-i18n="diabetes.modalLogTitle">
            ${escapeHtml(t("diabetes.modalLogTitle") || "Log Real Measurement")}
          </h3>
          <button type="button" onclick="document.getElementById('logDiabetesMeasurementModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <form id="diabetesMeasurementForm" onsubmit="HealthVibes.DiabetesUI.handleSaveMeasurement(event)">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.formType">
                ${escapeHtml(t("diabetes.formType") || "Measurement Type")}
              </label>
              <select id="measTypeSelect" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;">
                <option value="fasting">${escapeHtml(t("diabetes.typeFasting") || "Fasting Blood Glucose")}</option>
                <option value="postprandial">${escapeHtml(t("diabetes.typePostprandial") || "Postprandial (2-hr post-meal)")}</option>
                <option value="random">${escapeHtml(t("diabetes.typeRandom") || "Random Blood Glucose")}</option>
                <option value="bedtime">${escapeHtml(t("diabetes.typeBedtime") || "Bedtime Glucose")}</option>
                <option value="hba1c">${escapeHtml(t("diabetes.typeHba1c") || "Glycated Hemoglobin (HbA1c %)")}</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.formValue">
                ${escapeHtml(t("diabetes.formValue") || "Value (mg/dL or % for HbA1c)")}
              </label>
              <input type="number" step="0.1" required id="measValueInput" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;" placeholder="e.g. 110">
            </div>

            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.formSource">
                ${escapeHtml(t("diabetes.formSource") || "Measurement Source")}
              </label>
              <select id="measSourceSelect" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;">
                <option value="manual_patient_log">${escapeHtml(t("diabetes.srcManual") || "Manual Patient Log")}</option>
                <option value="bluetooth_glucometer">${escapeHtml(t("diabetes.srcBgm") || "Bluetooth Glucometer")}</option>
                <option value="cgm_sensor">${escapeHtml(t("diabetes.srcCgm") || "Continuous Glucose Monitor (CGM)")}</option>
                <option value="clinic_reading">${escapeHtml(t("diabetes.srcClinic") || "In-Clinic Reading")}</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.formNotes">
                ${escapeHtml(t("diabetes.formNotes") || "Context / Patient Notes (Optional)")}
              </label>
              <input type="text" id="measNotesInput" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;" placeholder="e.g. before breakfast">
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="outline-button" onclick="document.getElementById('logDiabetesMeasurementModal').style.display='none'" style="font-size:13px; padding:8px 16px;" data-i18n="common.cancel">
              ${escapeHtml(t("common.cancel") || "Cancel")}
            </button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 18px;" data-i18n="common.save">
              ${escapeHtml(t("common.save") || "Save Reading")}
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveMeasurement(e) {
    e.preventDefault();
    const type = document.getElementById("measTypeSelect")?.value;
    const value = document.getElementById("measValueInput")?.value;
    const source = document.getElementById("measSourceSelect")?.value;
    const notes = document.getElementById("measNotesInput")?.value;

    if (!value) return;

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      if (DiabetesService) {
        await DiabetesService.saveMeasurement(activePatientId, {
          type,
          value: Number(value),
          unit: type === "hba1c" ? "%" : "mg/dL",
          source,
          notes,
          recordedByUid: global.auth?.currentUser?.uid
        });
      }

      // Hide modal
      const modal = document.getElementById("logDiabetesMeasurementModal");
      if (modal) modal.style.display = "none";

      // Refresh data
      await loadAndDisplayContent();
    } catch (err) {
      alert(err.message || "Failed to record measurement.");
    }
  }

  function openAddNoteModal() {
    let modal = document.getElementById("addDiabetesNoteModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "addDiabetesNoteModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:480px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);" data-i18n="diabetes.modalNoteTitle">
            ${escapeHtml(t("diabetes.modalNoteTitle") || "Add Clinical Consultation Note")}
          </h3>
          <button type="button" onclick="document.getElementById('addDiabetesNoteModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <form onsubmit="HealthVibes.DiabetesUI.handleSaveNote(event)">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.noteTextLabel">
                ${escapeHtml(t("diabetes.noteTextLabel") || "Clinical Observation / Note")}
              </label>
              <textarea id="clinicalNoteText" required rows="4" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px; resize:vertical;" placeholder="Enter clinical observations, glycemic trends, or review comments..."></textarea>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="outline-button" onclick="document.getElementById('addDiabetesNoteModal').style.display='none'" style="font-size:13px; padding:8px 16px;" data-i18n="common.cancel">
              ${escapeHtml(t("common.cancel") || "Cancel")}
            </button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 18px;" data-i18n="common.save">
              ${escapeHtml(t("common.save") || "Save Note")}
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveNote(e) {
    e.preventDefault();
    const text = document.getElementById("clinicalNoteText")?.value;
    if (!text) return;

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      const user = global.auth?.currentUser;
      if (DiabetesService) {
        await DiabetesService.addClinicalNote(activePatientId, {
          doctorUid: user?.uid,
          doctorName: user?.displayName || user?.email || "Physician",
          noteText: text
        });
      }

      const modal = document.getElementById("addDiabetesNoteModal");
      if (modal) modal.style.display = "none";

      await loadAndDisplayContent();
    } catch (err) {
      alert(err.message || "Failed to add clinical note.");
    }
  }

  function openReviewModal() {
    let modal = document.getElementById("recordDiabetesReviewModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "recordDiabetesReviewModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:500px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);" data-i18n="diabetes.modalReviewTitle">
            ${escapeHtml(t("diabetes.modalReviewTitle") || "Record Attending Doctor Review")}
          </h3>
          <button type="button" onclick="document.getElementById('recordDiabetesReviewModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <form onsubmit="HealthVibes.DiabetesUI.handleSaveReview(event)">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.reviewObservations">
                ${escapeHtml(t("diabetes.reviewObservations") || "Clinical Observations")}
              </label>
              <textarea id="doctorObservationsText" required rows="3" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px; resize:vertical;"></textarea>
            </div>

            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;" data-i18n="diabetes.reviewRecommendations">
                ${escapeHtml(t("diabetes.reviewRecommendations") || "Specialist Recommendations (One per line)")}
              </label>
              <textarea id="doctorRecommendationsText" rows="3" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px; resize:vertical;" placeholder="e.g. Schedule repeat fasting glucose in 14 days"></textarea>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="outline-button" onclick="document.getElementById('recordDiabetesReviewModal').style.display='none'" style="font-size:13px; padding:8px 16px;" data-i18n="common.cancel">
              ${escapeHtml(t("common.cancel") || "Cancel")}
            </button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 18px;" data-i18n="common.save">
              ${escapeHtml(t("common.save") || "Confirm Review")}
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveReview(e) {
    e.preventDefault();
    const observations = document.getElementById("doctorObservationsText")?.value;
    const recsRaw = document.getElementById("doctorRecommendationsText")?.value;
    const recommendations = String(recsRaw || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      const user = global.auth?.currentUser;
      if (DiabetesService) {
        await DiabetesService.recordDoctorReview(activePatientId, {
          doctorUid: user?.uid,
          doctorName: user?.displayName || user?.email || "Attending Physician",
          observations,
          recommendations,
          status: "reviewed"
        });
      }

      const modal = document.getElementById("recordDiabetesReviewModal");
      if (modal) modal.style.display = "none";

      await loadAndDisplayContent();
    } catch (err) {
      alert(err.message || "Failed to record doctor review.");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REVISION REVIEW, DRAFT PRESERVATION & DOCTOR APPROVAL HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  function handleDraftInput() {
    const DiabetesService = global.HealthVibes?.DiabetesService;
    if (!DiabetesService || !activePatientId) return;

    const diag = document.getElementById("diabetesDoctorDiagnosisInput")?.value || "";
    const meds = document.getElementById("diabetesDoctorMedsInput")?.value || "";
    const recs = document.getElementById("diabetesDoctorRecsInput")?.value || "";
    const notes = document.getElementById("diabetesDoctorNotesInput")?.value || "";

    DiabetesService.saveDraftNotes(activePatientId, {
      clinicalDiagnosis: diag,
      diagnosis: diag,
      medications: meds,
      recommendations: recs,
      doctorNotes: notes,
      notes: notes
    });
  }

  function openRevisionReviewModal(revisionId, revNum = 1) {
    let modal = document.getElementById("diabetesRevisionReviewModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "diabetesRevisionReviewModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px; overflow-y:auto;";
      document.body.appendChild(modal);
    }

    const bundle = activeBundle || {};
    const latestAssessment = (bundle.assessments && bundle.assessments.length > 0) ? bundle.assessments[0] : null;

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:560px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--line); padding-bottom:10px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);" data-i18n="diabetes.reviewModalTitle">
            ${escapeHtml(t("diabetes.reviewModalTitle") || "Mandatory Clinical Revision Review")}
          </h3>
          <button type="button" onclick="document.getElementById('diabetesRevisionReviewModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <p style="margin:0 0 14px; font-size:13px; color:var(--muted); line-height:1.5;">
          Physician sign-off requirement: You must review all clinical data, glycemic trends, and patient replies for the current revision before issuing approval.
        </p>

        <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:10px; padding:14px; margin-bottom:16px; font-size:13px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <strong style="color:var(--ink);">Revision:</strong>
            <span class="pill primary" style="font-weight:700;">#${revNum} (${escapeHtml(revisionId)})</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <strong style="color:var(--ink);">Patient ID:</strong>
            <span style="font-family:monospace; color:var(--muted);">${escapeHtml(activePatientId)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <strong style="color:var(--ink);">Total Measurements:</strong>
            <span>${bundle.measurements?.length || 0} recorded readings</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <strong style="color:var(--ink);">Attachments & Files:</strong>
            <span>${bundle.attachments?.length || 0} attached records</span>
          </div>
        </div>

        <!-- Certification Checkbox -->
        <div style="display:flex; align-items:flex-start; gap:10px; background:rgba(14,165,164,0.08); border:1px solid var(--teal); border-radius:10px; padding:12px; margin-bottom:20px;">
          <input type="checkbox" id="chkCertifyDiabetesRevision" style="margin-top:3px; cursor:pointer; width:16px; height:16px;" onchange="document.getElementById('btnConfirmUnlockReview').disabled = !this.checked">
          <label for="chkCertifyDiabetesRevision" style="font-size:12.5px; font-weight:600; color:var(--ink); cursor:pointer; line-height:1.4;" data-i18n="diabetes.certifyRevisionReviewCheckbox">
            ${escapeHtml(t("diabetes.certifyRevisionReviewCheckbox") || "I certify that I have reviewed the current clinical revision data, historical measurements, and relevant attachments.")}
          </label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="outline-button" onclick="document.getElementById('diabetesRevisionReviewModal').style.display='none'" style="font-size:13px; padding:8px 16px;">
            Cancel
          </button>
          <button type="button" class="solid-button" id="btnConfirmUnlockReview" disabled onclick="HealthVibes.DiabetesUI.handleConfirmRevisionReview('${escapeHtml(revisionId)}')" style="font-size:13px; padding:8px 20px; background:var(--teal); font-weight:700;" data-i18n="diabetes.btnConfirmReviewAndUnlock">
            ${escapeHtml(t("diabetes.btnConfirmReviewAndUnlock") || "Confirm Review & Unlock Approval")}
          </button>
        </div>
      </div>
    `;

    modal.style.display = "flex";
  }

  function handleConfirmRevisionReview(revisionId) {
    const DiabetesService = global.HealthVibes?.DiabetesService;
    if (DiabetesService && activePatientId && revisionId) {
      DiabetesService.acknowledgeRevision(activePatientId, revisionId);
    }

    const modal = document.getElementById("diabetesRevisionReviewModal");
    if (modal) modal.style.display = "none";

    // Re-render tab to reflect unlocked state while preserving draft
    switchTab("doctor_review");
  }

  async function handleApproveDiabetesReview() {
    const diag = document.getElementById("diabetesDoctorDiagnosisInput")?.value?.trim();
    const meds = document.getElementById("diabetesDoctorMedsInput")?.value?.trim();
    const recs = document.getElementById("diabetesDoctorRecsInput")?.value?.trim();
    const notes = document.getElementById("diabetesDoctorNotesInput")?.value?.trim();

    if (!diag) {
      alert("Doctor clinical diagnosis is required before approving the case.");
      document.getElementById("diabetesDoctorDiagnosisInput")?.focus();
      return;
    }
    if (!recs) {
      alert("Doctor clinical recommendations are required before approving the case.");
      document.getElementById("diabetesDoctorRecsInput")?.focus();
      return;
    }

    const bundle = activeBundle || {};
    const assessments = bundle.assessments || [];
    const latestAssessment = assessments.length > 0 ? assessments[0] : null;
    const currentRevisionNumber = latestAssessment?.clinicalRevision || bundle.clinicalRevision || 1;
    const currentRevisionId = latestAssessment?.currentRevisionId || latestAssessment?.assessmentId || `rev-${activePatientId}-${currentRevisionNumber}`;

    const DiabetesService = global.HealthVibes?.DiabetesService;
    if (DiabetesService?.isRevisionStale && DiabetesService.isRevisionStale(activePatientId, currentRevisionId)) {
      alert(t("diabetes.staleReviewBannerDesc") || "Clinical data has changed since your review. Please review the updated revision before approval.");
      return;
    }

    const baselineSnapshot = {
      fastingGlucose: bundle.info?.fastingTarget?.value || null,
      postprandialGlucose: bundle.info?.postprandialTarget?.value || null,
      activeInsulinRegimen: bundle.info?.activeInsulinRegimen?.value || null,
      diabetesType: bundle.info?.diabetesType?.value || null
    };

    try {
      if (DiabetesService?.approveDiabetesReview) {
        const result = await DiabetesService.approveDiabetesReview(activePatientId, {
          caseId: bundle.caseId || null,
          currentRevisionId,
          expectedRevisionNumber: currentRevisionNumber,
          baselineSnapshot,
          clinicalDiagnosis: diag,
          medications: meds,
          recommendations: recs,
          doctorNotes: notes
        });

        // Clear preserved draft notes on approval success
        DiabetesService.clearDraftNotes(activePatientId);

        alert(`Diabetes case successfully approved! Certified Report Reference: ${result.reportRef || result.report?.reportRef || 'HV-REP-OK'}`);
        await loadAndDisplayContent();
      }
    } catch (err) {
      // Preserve unsaved notes during conflicts or rejections
      if (DiabetesService) {
        DiabetesService.saveDraftNotes(activePatientId, {
          clinicalDiagnosis: diag,
          diagnosis: diag,
          medications: meds,
          recommendations: recs,
          doctorNotes: notes,
          notes: notes
        });
      }

      // Check for concurrency conflict (HTTP 409)
      const isConflict = String(err.message).includes("409") || String(err.message).includes("CONFLICT") || err.conflict;
      if (isConflict) {
        alert("⚠️ Concurrency Conflict (409): Patient information or measurements were updated while your review was in progress.\n\nYour unsaved doctor notes and prescriptions have been preserved! Please review the latest revision before re-approving.");
        // Invalidate reviewed revision to force re-review
        if (DiabetesService) {
          DiabetesService.acknowledgeRevision(activePatientId, null);
        }
        await loadAndDisplayContent();
      } else {
        alert(err.message || "Failed to approve diabetes case.");
      }
    }
  }

  function openAddAttachmentModal() {
    let modal = document.getElementById("diabetesAttachmentModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "diabetesAttachmentModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:480px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);">Attach Clinical Document / Report</h3>
          <button type="button" onclick="document.getElementById('diabetesAttachmentModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <form onsubmit="HealthVibes.DiabetesUI.handleSaveAttachment(event)">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;">Document Name</label>
              <input type="text" id="attFileNameInput" required style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;" placeholder="e.g. Lab_HbA1c_Oct2026.pdf">
            </div>

            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;">Document Type</label>
              <select id="attFileTypeSelect" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;">
                <option value="Lab Report">Accredited Laboratory Report (PDF)</option>
                <option value="CGM Export">Continuous Glucose Telemetry Export</option>
                <option value="Prescription">Physician Prescription Slip</option>
                <option value="Clinical Image">Clinical Image / Ulceration Screening</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;">Document URL / Storage Reference</label>
              <input type="text" id="attFileUrlInput" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px;" placeholder="https://storage.healthvibe.local/reports/doc1.pdf">
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="outline-button" onclick="document.getElementById('diabetesAttachmentModal').style.display='none'" style="font-size:13px; padding:8px 16px;">Cancel</button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 18px;">Attach Document</button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveAttachment(e) {
    e.preventDefault();
    const fileName = document.getElementById("attFileNameInput")?.value;
    const fileType = document.getElementById("attFileTypeSelect")?.value;
    const fileUrl = document.getElementById("attFileUrlInput")?.value;

    if (!fileName) return;

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      if (DiabetesService) {
        await DiabetesService.addAttachment(activePatientId, {
          fileName,
          fileType,
          fileUrl: fileUrl || "#"
        });
      }

      const modal = document.getElementById("diabetesAttachmentModal");
      if (modal) modal.style.display = "none";

      await loadAndDisplayContent();
    } catch (err) {
      alert(err.message || "Failed to attach document.");
    }
  }

  function openAddClarificationModal() {
    let modal = document.getElementById("diabetesClarificationModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "diabetesClarificationModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:480px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);">Request Patient Clarification</h3>
          <button type="button" onclick="document.getElementById('diabetesClarificationModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <form onsubmit="HealthVibes.DiabetesUI.handleSaveClarification(event)">
          <div>
            <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:4px;">Inquiry / Clarification Prompt</label>
            <textarea id="clarificationTextInput" required rows="4" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px; resize:vertical;" placeholder="e.g. Please clarify if the postprandial glucose of 240 mg/dL was measured 2 hours after lunch or dinner..."></textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="outline-button" onclick="document.getElementById('diabetesClarificationModal').style.display='none'" style="font-size:13px; padding:8px 16px;">Cancel</button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 18px;">Send Inquiry</button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveClarification(e) {
    e.preventDefault();
    const text = document.getElementById("clarificationTextInput")?.value;
    if (!text) return;

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      const user = global.auth?.currentUser;
      if (DiabetesService) {
        await DiabetesService.addClarification(activePatientId, {
          message: text,
          authorName: user?.displayName || user?.name || "Attending Endocrinologist",
          authorRole: "doctor"
        });
      }

      const modal = document.getElementById("diabetesClarificationModal");
      if (modal) modal.style.display = "none";

      await loadAndDisplayContent();
    } catch (err) {
      alert(err.message || "Failed to record clarification.");
    }
  }

  function openReplyClarificationModal(requestId, cycle = null) {
    let modal = document.getElementById("diabetesReplyClarificationModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "diabetesReplyClarificationModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px;";
      document.body.appendChild(modal);
    }

    const bundle = activeBundle || {};
    const clarifications = bundle.clarifications || [];
    const targetCycle = clarifications.find(c => (requestId && c.requestId === requestId) || (cycle && c.cycle === cycle)) || {};
    const doctorPrompt = targetCycle.request?.note || targetCycle.note || targetCycle.message || "";
    const doctorName = targetCycle.request?.doctorName || targetCycle.doctorName || (isRtl() ? "طبيبك المعالج" : "Attending Doctor");

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:500px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--ink);" data-i18n="diabetes.replyModalTitle">
            ${escapeHtml(t("diabetes.replyModalTitle") || "الرد على استفسار الطبيب المعالج")}
          </h3>
          <button type="button" onclick="document.getElementById('diabetesReplyClarificationModal').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        ${doctorPrompt ? `
          <div style="background:var(--surface-2); border-inline-start:4px solid var(--teal); border-radius:8px; padding:12px; margin-bottom:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--muted); margin-bottom:4px;">
              👨‍⚕️ ${escapeHtml(doctorName)}
            </div>
            <div style="font-size:13.5px; color:var(--ink); line-height:1.5;">
              "${escapeHtml(doctorPrompt)}"
            </div>
          </div>
        ` : ""}

        <form onsubmit="HealthVibes.DiabetesUI.handleSaveClarificationReply(event, '${escapeHtml(requestId || '')}', ${cycle || 'null'})">
          <div>
            <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:6px;" data-i18n="diabetes.replyInputLabel">
              ${escapeHtml(t("diabetes.replyInputLabel") || "توضيحك / إجابتك")}
            </label>
            <textarea id="patientClarificationReplyInput" required rows="4" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-size:13.5px; resize:vertical;" placeholder="${isRtl() ? "اكتب توضيحك لطبيبك هنا..." : "Type your response here..."}"></textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="outline-button" onclick="document.getElementById('diabetesReplyClarificationModal').style.display='none'" style="font-size:13px; padding:8px 16px;" data-i18n="common.cancel">
              ${escapeHtml(t("common.cancel") || "إلغاء")}
            </button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 18px;" data-i18n="diabetes.btnSubmitReply">
              ${escapeHtml(t("diabetes.btnSubmitReply") || "إرسال التوضيح")}
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveClarificationReply(e, requestId, cycle) {
    e.preventDefault();
    const replyText = document.getElementById("patientClarificationReplyInput")?.value;
    if (!replyText) return;

    try {
      const DiabetesService = global.HealthVibes?.DiabetesService;
      const user = global.auth?.currentUser;
      if (DiabetesService) {
        await DiabetesService.addClarification(activePatientId, {
          requestId: requestId || undefined,
          cycle: cycle || undefined,
          response: {
            timestamp: new Date().toISOString(),
            text: replyText,
            patientName: user?.displayName || user?.name || "Patient"
          },
          status: "responded"
        });
      }

      const modal = document.getElementById("diabetesReplyClarificationModal");
      if (modal) modal.style.display = "none";

      await loadAndDisplayContent();
    } catch (err) {
      alert(err.message || "Failed to submit clarification reply.");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRUCTURED DIABETES ASSESSMENT MODAL & HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  function openAssessmentModal(assessmentId = null) {
    let modal = document.getElementById("structuredDiabetesAssessmentModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "structuredDiabetesAssessmentModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px; overflow-y:auto;";
      document.body.appendChild(modal);
    }

    const existing = assessmentId ? (activeBundle?.assessments || []).find(a => a.assessmentId === assessmentId) : null;
    const isRevision = Boolean(existing);
    const role = global.selectedRole || "patient";
    const isDoctor = role === "doctor" || role === "clinic_admin" || role === "super_admin";

    const title = isRevision
      ? (t("diabetes.modalReviseTitle") || "Revise Clinical Assessment (New Revision)")
      : (t("diabetes.modalAssessmentTitle") || "Structured Diabetes Clinical Assessment");

    const historyStatus = existing?.diabetesHistory?.status || "not_provided";
    const diabetesType = existing?.diabetesHistory?.diabetesType || "not_provided";
    const diagnosisYear = existing?.diabetesHistory?.diagnosisYear || "";
    const historyNotes = existing?.diabetesHistory?.notes || "";

    const symptomsNotes = existing?.symptoms?.notes || "";
    const symptomsReported = Array.isArray(existing?.symptoms?.reported) ? existing.symptoms.reported : [];

    const medsDetails = existing?.medications?.details || "";
    const complicationsReported = Array.isArray(existing?.complications?.conditions) ? existing.complications.conditions : [];
    const familyDetails = existing?.familyHistory?.relativesDetails || "";
    const lifestyleNotes = existing?.lifestyle?.notes || existing?.lifestyle?.physicalActivity || "";
    const doctorNotesText = existing?.doctorNotes?.text || "";

    const followupDate = existing?.followup?.scheduledDate || "";
    const followupInterval = existing?.followup?.intervalDays || "";
    const followupInstructions = existing?.followup?.instructions || "";

    modal.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; max-width:680px; width:100%; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--line); padding-bottom:12px;">
          <div>
            <h3 style="margin:0; font-size:17.5px; font-weight:700; color:var(--ink);">
              ${escapeHtml(title)}
            </h3>
            ${isRevision ? `
              <p style="margin:3px 0 0; font-size:12px; color:var(--muted);">
                ${escapeHtml(t("diabetes.clinicalRevisionBadge") || "Clinical Revision")} #${(existing.clinicalRevision || 1) + 1} — Preserves past measurements without overwriting.
              </p>
            ` : ""}
          </div>
          <button type="button" onclick="document.getElementById('structuredDiabetesAssessmentModal').style.display='none'" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--muted);">×</button>
        </div>

        <div id="asmModalErrors" style="display:none; margin-bottom:14px; padding:10px 14px; border-radius:8px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); color:#ef4444; font-size:13px;"></div>

        <form id="structuredAssessmentForm" onsubmit="HealthVibes.DiabetesUI.handleSaveAssessment(event)">
          <input type="hidden" id="asmExistingId" value="${escapeHtml(assessmentId || "")}">
          
          <div style="display:flex; flex-direction:column; gap:16px;">
            <!-- 1. Diabetes History & Status -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                ${escapeHtml(t("diabetes.sectionHistory") || "Diabetes History & Status")}
              </legend>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">${escapeHtml(t("diabetes.fieldStatusLabel") || "Status")}</label>
                  <select id="asmHistoryStatus" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                    <option value="not_provided" ${historyStatus === "not_provided" ? "selected" : ""}>Not provided</option>
                    <option value="known_diabetes" ${historyStatus === "known_diabetes" ? "selected" : ""}>Known Diabetes</option>
                    <option value="newly_diagnosed" ${historyStatus === "newly_diagnosed" ? "selected" : ""}>Newly Diagnosed</option>
                    <option value="prediabetes" ${historyStatus === "prediabetes" ? "selected" : ""}>Prediabetes</option>
                    <option value="suspected" ${historyStatus === "suspected" ? "selected" : ""}>Suspected</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">${escapeHtml(t("diabetes.fieldDiabetesType") || "Documented Type")}</label>
                  <select id="asmDiabetesType" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                    <option value="not_provided" ${diabetesType === "not_provided" ? "selected" : ""}>Not provided</option>
                    <option value="type_1" ${diabetesType === "type_1" ? "selected" : ""}>Type 1</option>
                    <option value="type_2" ${diabetesType === "type_2" ? "selected" : ""}>Type 2</option>
                    <option value="gestational" ${diabetesType === "gestational" ? "selected" : ""}>Gestational</option>
                    <option value="prediabetes" ${diabetesType === "prediabetes" ? "selected" : ""}>Prediabetes</option>
                    <option value="secondary" ${diabetesType === "secondary" ? "selected" : ""}>Secondary</option>
                    <option value="other" ${diabetesType === "other" ? "selected" : ""}>Other</option>
                    <option value="unknown" ${diabetesType === "unknown" ? "selected" : ""}>Unknown</option>
                  </select>
                </div>
              </div>
              <div style="display:grid; grid-template-columns:120px 1fr; gap:10px; margin-top:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">${escapeHtml(t("diabetes.fieldDiagnosisDate") || "Year")}</label>
                  <input type="text" id="asmDiagnosisYear" value="${escapeHtml(diagnosisYear)}" placeholder="e.g. 2021" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">History Notes</label>
                  <input type="text" id="asmHistoryNotes" value="${escapeHtml(historyNotes)}" placeholder="Clinical context..." style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
              </div>
            </fieldset>

            <!-- 2. Symptoms -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                ${escapeHtml(t("diabetes.sectionSymptoms") || "Relevant Symptoms")}
              </legend>
              <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:12.5px; color:var(--ink);">
                <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmSymptom" value="polydipsia" ${symptomsReported.includes("polydipsia") ? "checked" : ""}> Excessive Thirst (Polydipsia)</label>
                <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmSymptom" value="polyuria" ${symptomsReported.includes("polyuria") ? "checked" : ""}> Frequent Urination (Polyuria)</label>
                <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmSymptom" value="weight_loss" ${symptomsReported.includes("weight_loss") ? "checked" : ""}> Weight Loss</label>
                <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmSymptom" value="fatigue" ${symptomsReported.includes("fatigue") ? "checked" : ""}> Fatigue</label>
                <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmSymptom" value="blurry_vision" ${symptomsReported.includes("blurry_vision") ? "checked" : ""}> Blurry Vision</label>
                <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmSymptom" value="numbness" ${symptomsReported.includes("numbness") ? "checked" : ""}> Neuropathic Numbness</label>
              </div>
              <div style="margin-top:8px;">
                <input type="text" id="asmSymptomsNotes" value="${escapeHtml(symptomsNotes)}" placeholder="Other symptom observations..." style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
              </div>
            </fieldset>

            <!-- 3. Blood Glucose Measurements (FBG, PPG, RBG, Bedtime) -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                ${escapeHtml(t("diabetes.sectionMeasurements") || "Blood Glucose Measurement")}
              </legend>
              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Timing Context</label>
                  <select id="asmGlucoseTiming" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                    <option value="fasting">Fasting (FBG)</option>
                    <option value="postprandial">Postprandial (PPG 2h)</option>
                    <option value="random">Random (RBG)</option>
                    <option value="bedtime">Bedtime</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Value</label>
                  <input type="number" step="0.1" id="asmGlucoseValue" placeholder="e.g. 115" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Unit</label>
                  <select id="asmGlucoseUnit" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                    <option value="mg/dL">mg/dL</option>
                    <option value="mmol/L">mmol/L</option>
                  </select>
                </div>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Measurement Date & Time</label>
                  <input type="datetime-local" id="asmGlucoseTime" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Source</label>
                  <select id="asmGlucoseSource" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                    <option value="manual_patient_log">Manual Patient Log</option>
                    <option value="cgm_sensor">CGM Sensor</option>
                    <option value="bluetooth_glucometer">Bluetooth Glucometer</option>
                    <option value="clinic_reading">In-Clinic Reading</option>
                    <option value="accredited_lab_ocr">Accredited Lab</option>
                  </select>
                </div>
              </div>
            </fieldset>

            <!-- 4. HbA1c (Optional) -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                ${escapeHtml(t("diabetes.typeHba1c") || "Glycated Hemoglobin (HbA1c)")}
              </legend>
              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">HbA1c Value</label>
                  <input type="number" step="0.1" id="asmHba1cValue" placeholder="e.g. 6.8" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Unit</label>
                  <select id="asmHba1cUnit" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                    <option value="%">%</option>
                    <option value="mmol/mol">mmol/mol</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Test Date</label>
                  <input type="date" id="asmHba1cTime" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
              </div>
            </fieldset>

            <!-- 5. Medications & Complications -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                Medications & Complications
              </legend>
              <div style="margin-bottom:10px;">
                <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Current Medications</label>
                <input type="text" id="asmMedications" value="${escapeHtml(medsDetails)}" placeholder="e.g. Metformin 500mg BID, Glimepiride 2mg" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Documented Complications</label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:12.5px; color:var(--ink);">
                  <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmComplication" value="retinopathy" ${complicationsReported.includes("retinopathy") ? "checked" : ""}> Retinopathy</label>
                  <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmComplication" value="neuropathy" ${complicationsReported.includes("neuropathy") ? "checked" : ""}> Neuropathy</label>
                  <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmComplication" value="nephropathy" ${complicationsReported.includes("nephropathy") ? "checked" : ""}> Nephropathy</label>
                  <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmComplication" value="cardiovascular" ${complicationsReported.includes("cardiovascular") ? "checked" : ""}> Cardiovascular</label>
                  <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" name="asmComplication" value="diabetic_foot" ${complicationsReported.includes("diabetic_foot") ? "checked" : ""}> Diabetic Foot</label>
                </div>
              </div>
            </fieldset>

            <!-- 6. Family History & Lifestyle -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                Family History & Lifestyle
              </legend>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Family History</label>
                  <input type="text" id="asmFamilyHistory" value="${escapeHtml(familyDetails)}" placeholder="e.g. Mother has T2D" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Lifestyle / Physical Activity</label>
                  <input type="text" id="asmLifestyle" value="${escapeHtml(lifestyleNotes)}" placeholder="e.g. Walking 30 min daily, low carb diet" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
              </div>
            </fieldset>

            <!-- 7. Doctor Notes (Physicians Only) -->
            ${isDoctor ? `
              <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
                <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                  Doctor Notes (Physicians Only)
                </legend>
                <textarea id="asmDoctorNotes" rows="2" style="width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px; resize:vertical;" placeholder="Clinical observations and specialist assessment...">${escapeHtml(doctorNotesText)}</textarea>
              </fieldset>
            ` : ""}

            <!-- 8. Follow-up Information -->
            <fieldset style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0;">
              <legend style="font-weight:700; font-size:13px; color:var(--ink); padding:0 6px;">
                Follow-up Information
              </legend>
              <div style="display:grid; grid-template-columns:1fr 120px 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Scheduled Date</label>
                  <input type="date" id="asmFollowupDate" value="${escapeHtml(followupDate)}" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Interval (Days)</label>
                  <input type="number" id="asmFollowupInterval" value="${escapeHtml(followupInterval)}" placeholder="30" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:4px;">Instructions</label>
                  <input type="text" id="asmFollowupInstructions" value="${escapeHtml(followupInstructions)}" placeholder="Repeat fasting test" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-size:13px;">
                </div>
              </div>
            </fieldset>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px; border-top:1px solid var(--line); padding-top:14px;">
            <button type="button" class="outline-button" onclick="document.getElementById('structuredDiabetesAssessmentModal').style.display='none'" style="font-size:13px; padding:8px 16px;" data-i18n="common.cancel">
              ${escapeHtml(t("common.cancel") || "Cancel")}
            </button>
            <button type="submit" class="solid-button" style="font-size:13px; padding:8px 20px;">
              ${escapeHtml(isRevision ? (t("diabetes.btnSubmitRevision") || "Submit Revision") : (t("diabetes.btnSaveAssessment") || "Save Assessment"))}
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = "flex";
  }

  async function handleSaveAssessment(e) {
    e.preventDefault();
    const existingId = document.getElementById("asmExistingId")?.value;
    const isRevision = Boolean(existingId);
    const errorBox = document.getElementById("asmModalErrors");
    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.innerHTML = "";
    }

    const historyStatus = document.getElementById("asmHistoryStatus")?.value;
    const diabetesType = document.getElementById("asmDiabetesType")?.value;
    const diagnosisYear = document.getElementById("asmDiagnosisYear")?.value;
    const historyNotes = document.getElementById("asmHistoryNotes")?.value;

    const symptomBoxes = Array.from(document.querySelectorAll("input[name='asmSymptom']:checked")).map(cb => cb.value);
    const symptomsNotes = document.getElementById("asmSymptomsNotes")?.value;

    const glucoseTiming = document.getElementById("asmGlucoseTiming")?.value || "fasting";
    const glucoseValue = document.getElementById("asmGlucoseValue")?.value;
    const glucoseUnit = document.getElementById("asmGlucoseUnit")?.value || "mg/dL";
    const glucoseTime = document.getElementById("asmGlucoseTime")?.value;
    const glucoseSource = document.getElementById("asmGlucoseSource")?.value;

    const hba1cValue = document.getElementById("asmHba1cValue")?.value;
    const hba1cUnit = document.getElementById("asmHba1cUnit")?.value || "%";
    const hba1cTime = document.getElementById("asmHba1cTime")?.value;

    const medsDetails = document.getElementById("asmMedications")?.value;
    const complicationBoxes = Array.from(document.querySelectorAll("input[name='asmComplication']:checked")).map(cb => cb.value);
    const familyDetails = document.getElementById("asmFamilyHistory")?.value;
    const lifestyleNotes = document.getElementById("asmLifestyle")?.value;
    const doctorNotesText = document.getElementById("asmDoctorNotes")?.value;

    const followupDate = document.getElementById("asmFollowupDate")?.value;
    const followupInterval = document.getElementById("asmFollowupInterval")?.value;
    const followupInstructions = document.getElementById("asmFollowupInstructions")?.value;

    // Construct structured assessment payload
    const payload = {
      patientId: activePatientId,
      diabetesHistory: {
        status: historyStatus,
        diabetesType: diabetesType,
        diagnosisYear: diagnosisYear ? Number(diagnosisYear) : null,
        notes: historyNotes || null
      },
      symptoms: {
        reported: symptomBoxes,
        notes: symptomsNotes || null
      },
      measurements: {},
      medications: medsDetails ? { details: medsDetails, status: "provided" } : null,
      complications: complicationBoxes.length > 0 ? { conditions: complicationBoxes, status: "documented" } : null,
      familyHistory: familyDetails ? { relativesDetails: familyDetails, status: "provided" } : null,
      lifestyle: lifestyleNotes ? { physicalActivity: lifestyleNotes, status: "provided" } : null,
      followup: followupDate ? { scheduledDate: followupDate, intervalDays: followupInterval ? Number(followupInterval) : null, instructions: followupInstructions || null } : null
    };

    if (glucoseValue !== undefined && glucoseValue !== null && glucoseValue !== "") {
      payload.measurements[glucoseTiming] = {
        value: Number(glucoseValue),
        unit: glucoseUnit,
        timing: glucoseTiming,
        measuredAt: glucoseTime ? new Date(glucoseTime).toISOString() : new Date().toISOString(),
        source: glucoseSource
      };
    }

    if (hba1cValue !== undefined && hba1cValue !== null && hba1cValue !== "") {
      payload.measurements.hba1c = {
        value: Number(hba1cValue),
        unit: hba1cUnit,
        timing: "hba1c",
        measuredAt: hba1cTime ? new Date(hba1cTime).toISOString() : new Date().toISOString(),
        source: "accredited_lab_ocr"
      };
    }

    if (doctorNotesText) {
      payload.doctorNotes = {
        text: doctorNotesText
      };
    }

    // Client-side validation check
    const DiabetesService = global.HealthVibes?.DiabetesService;
    if (DiabetesService) {
      const validation = DiabetesService.validateAssessmentInput(payload, { isUpdate: isRevision });
      if (!validation.isValid) {
        if (errorBox) {
          errorBox.innerHTML = validation.errors.map(e => `<div>• ${escapeHtml(e.message)}</div>`).join("");
          errorBox.style.display = "block";
        }
        return;
      }
    }

    try {
      if (isRevision) {
        await DiabetesService.updateAssessment(activePatientId, existingId, payload);
      } else {
        await DiabetesService.createAssessment(activePatientId, payload);
      }

      const modal = document.getElementById("structuredDiabetesAssessmentModal");
      if (modal) modal.style.display = "none";

      await loadAndDisplayContent();
    } catch (err) {
      if (errorBox) {
        errorBox.innerHTML = `<div>• ${escapeHtml(err.message || "Failed to save assessment.")}</div>`;
        errorBox.style.display = "block";
      } else {
        alert(err.message || "Failed to save assessment.");
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCESS CONTROL ERROR STATES
  // ─────────────────────────────────────────────────────────────────────────────
  function renderAccessDeniedState(reason) {
    return `
      <div class="hv-state-card" data-state="error" style="text-align: center; padding: 48px 16px; background: var(--surface); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px;">
        <span class="state-icon" style="font-size: 38px; display: block; margin-bottom: 10px;">🔒</span>
        <h4 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #ef4444;" data-i18n="diabetes.accessDeniedTitle">
          ${escapeHtml(t("diabetes.accessDeniedTitle") || "Access Denied: Patient Privacy Isolation")}
        </h4>
        <p style="margin: 0 0 16px; font-size: 13.5px; color: var(--ink); max-width: 520px; margin: 0 auto 16px; line-height: 1.6;" data-i18n="diabetes.accessDeniedBody">
          ${escapeHtml(
            reason === "DOCTOR_NOT_ASSIGNED_TO_PATIENT"
              ? (t("diabetes.doctorNotAssignedNotice") || "You are not authorized to view this patient's diabetes records because you are not assigned as their attending physician.")
              : (t("diabetes.privacyIsolationNotice") || "You can only access your own clinical diabetes information.")
          )}
        </p>
        <button type="button" class="soft-button" onclick="showScreen('patient')" style="font-size: 13px; padding: 8px 18px;" data-i18n="common.backToHome">
          ${escapeHtml(t("common.backToHome") || "Return to Home")}
        </button>
      </div>
    `;
  }

  function renderUnauthenticatedState() {
    return `
      <div class="hv-state-card" data-state="offline" style="text-align: center; padding: 48px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px;">
        <span class="state-icon" style="font-size: 38px; display: block; margin-bottom: 10px;">👤</span>
        <h4 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: var(--ink);" data-i18n="diabetes.authRequiredTitle">
          ${escapeHtml(t("diabetes.authRequiredTitle") || "Authentication Required")}
        </h4>
        <p style="margin: 0 0 16px; font-size: 13.5px; color: var(--muted); max-width: 480px; margin: 0 auto 16px;" data-i18n="diabetes.authRequiredBody">
          ${escapeHtml(t("diabetes.authRequiredBody") || "Please sign in to access personalized clinical diabetes tracking.")}
        </p>
        <button type="button" class="solid-button" onclick="showAuth()" style="font-size: 13px; padding: 8px 18px;" data-i18n="auth.signIn">
          ${escapeHtml(t("auth.signIn") || "Sign In")}
        </button>
      </div>
    `;
  }

  function renderErrorState(err) {
    return `
      <div class="hv-state-card" data-state="error" style="text-align: center; padding: 36px 16px; background: var(--surface); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px;">
        <span class="state-icon" style="font-size: 32px; display: block; margin-bottom: 8px;">⚠️</span>
        <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #ef4444;">${escapeHtml(t("common.error") || "Error")}</h4>
        <p style="margin: 0; font-size: 13px; color: var(--muted);">${escapeHtml(err || "Failed to load diabetes module.")}</p>
      </div>
    `;
  }

  function setActivePatientId(id) {
    activePatientId = id;
  }

  function setActiveBundle(bundle) {
    activeBundle = bundle;
    if (bundle?.patientId) {
      activePatientId = bundle.patientId;
    }
  }

  const DiabetesUI = {
    renderScreen,
    switchTab,
    setActivePatientId,
    setActiveBundle,
    openLogMeasurementModal,
    handleSaveMeasurement,
    openAssessmentModal,
    handleSaveAssessment,
    openAddNoteModal,
    handleSaveNote,
    openReviewModal,
    handleSaveReview,
    openRevisionReviewModal,
    handleConfirmRevisionReview,
    handleDraftInput,
    handleApproveDiabetesReview,
    openAddAttachmentModal,
    handleSaveAttachment,
    openAddClarificationModal,
    handleSaveClarification,
    renderDoctorReviewTab,
    renderFieldStateBadge,
    renderStatusPill,
    renderPatientDashboardTab,
    renderPatientClarificationsTab,
    openReplyClarificationModal,
    handleSaveClarificationReply
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DiabetesUI = DiabetesUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DiabetesUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
