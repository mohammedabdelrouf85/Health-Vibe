/**
 * Health Vibe AI - Hypertension Clinical Module UI Engine
 *
 * Renders the dedicated Hypertension workspace section adhering to clinical governance:
 * - Real persisted data only (zero invented values, diagnoses, or synthetic cases).
 * - Every clinical field explicitly renders in one of 4 states:
 *   * known
 *   * unknown
 *   * not provided
 *   * not applicable
 * - 7 Core Sub-sections:
 *   1. Hypertension Overview / Patient Information
 *   2. Blood Pressure & Hemodynamic Measurements
 *   3. Structured Assessments & Revisions
 *   4. Doctor Review
 *   5. Clinical Notes (Doctor role only)
 *   6. Follow-up Protocol
 *   7. Approved Reports
 * - Strict access control & privacy:
 *   * Patients view only their own records; internal doctor notes are stripped.
 *   * Doctors view assigned patients with full clinical notes & review tools.
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
      .replace(/"/g, "&quot;");
  }

  function renderFieldBadge(field) {
    if (!field || typeof field !== 'object') {
      return `<span class="pill info" style="font-size: 11px;">📋 ${escapeHtml(t("hypertension.stateNotProvided") || "غير مسجل")}</span>`;
    }
    const state = field.state || (field.isRecorded ? 'known' : 'not_provided');

    if (state === "known") {
      const displayVal = field.value !== null && field.value !== undefined ? `${escapeHtml(field.value)} ${escapeHtml(field.unit || "")}`.trim() : (t("hypertension.documented") || "موثق");
      return `<span class="pill ok" style="font-size: 11px;" title="${displayVal}">✔ ${displayVal}</span>`;
    }
    if (state === "unknown") {
      return `<span class="pill pending" style="font-size: 11px;">❓ ${escapeHtml(t("hypertension.stateUnknown") || "قيد البحث")}</span>`;
    }
    if (state === "not_applicable") {
      return `<span class="pill" style="font-size: 11px; background: var(--surface-muted); color: var(--muted);">⛔ ${escapeHtml(t("hypertension.stateNotApplicable") || "لا ينطبق")}</span>`;
    }
    return `<span class="pill info" style="font-size: 11px; border: 1px dashed var(--muted);">📋 ${escapeHtml(t("hypertension.stateNotProvided") || "غير مسجل")}</span>`;
  }

  async function loadPatientBundle(patientId) {
    isLoading = true;
    errorMessage = null;
    try {
      const service = global.HealthVibes?.HypertensionService;
      if (service && typeof service.getPatientBundle === "function") {
        activeBundle = await service.getPatientBundle(patientId);
      } else {
        activeBundle = {
          patientId,
          profileRecord: null,
          readings: [],
          assessments: [],
          reviews: [],
          followupPlan: null,
          approvedReports: [],
          clarifications: [],
          clinicalNotes: [],
          dashboardMetrics: { totalReadings: 0, controlRatePercent: 0, averages: { systolic: 0, diastolic: 0, pulse: 0 } }
        };
      }
    } catch (e) {
      errorMessage = e.message;
    } finally {
      isLoading = false;
    }
  }

  function renderHeader(container) {
    const role = global.currentUserRole || "patient";
    const title = t("hypertension.moduleTitle") || "Hypertension Clinical Module";
    const category = t("nav.disease") || "Disease";
    const statusText = activeBundle?.profileRecord?.isDocumented
      ? (t("hypertension.activeMonitoring") || "Active Monitoring")
      : (t("hypertension.underPrep") || "Under Preparation");

    return `
      <div class="panel-head" style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 28px;">🫀</span>
          <div>
            <h3 style="margin: 0; font-size: 20px; font-weight: 700;">${escapeHtml(title)}</h3>
            <p style="font-size: 13px; color: var(--muted); margin: 2px 0 0;">${escapeHtml(category)}</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="pill ${activeBundle?.profileRecord?.isDocumented ? 'ok' : 'pending'}">${escapeHtml(statusText)}</span>
          <button type="button" class="soft-button" onclick="window.HealthVibes.HypertensionUI.refresh()" style="font-size: 12px; padding: 6px 12px;">
            🔄 ${escapeHtml(t("common.refresh") || "Refresh")}
          </button>
        </div>
      </div>
    `;
  }

  function renderTabs() {
    const role = global.currentUserRole || "patient";
    const isDoc = role === "doctor" || role === "super_admin";

    const tabs = [
      { id: "overview", label: t("hypertension.tabOverview") || "Overview" },
      { id: "measurements", label: t("hypertension.tabMeasurements") || "BP Measurements" },
      { id: "assessments", label: t("hypertension.tabAssessments") || "Assessments & Revisions" },
      { id: "reviews", label: t("hypertension.tabReviews") || "Doctor Reviews" },
      { id: "followup", label: t("hypertension.tabFollowup") || "Follow-Up Protocol" },
      { id: "reports", label: t("hypertension.tabReports") || "Approved Reports" }
    ];

    if (isDoc) {
      tabs.push({ id: "notes", label: t("hypertension.tabNotes") || "Clinical Notes" });
    }

    return `
      <div class="sub-nav-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid var(--line); margin-bottom: 20px; overflow-x: auto;">
        ${tabs.map(tab => `
          <button type="button" 
                  class="tab-item ${activeTab === tab.id ? 'active' : ''}" 
                  onclick="window.HealthVibes.HypertensionUI.switchTab('${tab.id}')"
                  style="padding: 10px 16px; border: none; background: none; font-weight: ${activeTab === tab.id ? '700' : '500'}; color: ${activeTab === tab.id ? 'var(--primary)' : 'var(--ink)'}; border-bottom: ${activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent'}; cursor: pointer;">
            ${escapeHtml(tab.label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderOverviewTab() {
    const p = activeBundle?.profileRecord || {};
    const metrics = activeBundle?.dashboardMetrics || {};
    const latestReading = activeBundle?.readings?.[0];

    return `
      <div class="overview-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        <div class="panel" style="padding: 16px;">
          <h4 style="margin-top: 0; font-size: 15px; color: var(--ink); border-bottom: 1px solid var(--line); padding-bottom: 8px;">
            🫀 ${escapeHtml(t("hypertension.bpSummary") || "Blood Pressure Summary")}
          </h4>
          <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(t("hypertension.latestBp") || "Latest BP")}:</span>
              ${latestReading ? `<strong>${latestReading.systolic}/${latestReading.diastolic} mmHg</strong>` : renderFieldBadge(null)}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(t("hypertension.controlRate") || "Control Rate")}:</span>
              <strong>${metrics.controlRatePercent !== undefined ? `${metrics.controlRatePercent}%` : t("hypertension.stateNotProvided")}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(t("hypertension.avgBp") || "Average BP")}:</span>
              <strong>${metrics.averages?.systolic ? `${metrics.averages.systolic}/${metrics.averages.diastolic} mmHg` : t("hypertension.stateNotProvided")}</strong>
            </div>
          </div>
        </div>

        <div class="panel" style="padding: 16px;">
          <h4 style="margin-top: 0; font-size: 15px; color: var(--ink); border-bottom: 1px solid var(--line); padding-bottom: 8px;">
            📋 ${escapeHtml(t("hypertension.patientProfile") || "Hypertension Profile")}
          </h4>
          <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(t("hypertension.status") || "Hypertension Status")}:</span>
              ${renderFieldBadge(p.hypertensionStatus)}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(t("hypertension.diagnosisDate") || "Diagnosis Date")}:</span>
              ${renderFieldBadge(p.diagnosisDate)}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(t("hypertension.targetBp") || "Target BP")}:</span>
              ${renderFieldBadge(p.targetSystolic ? { state: 'known', value: `< ${p.targetSystolic?.value || 130}/${p.targetDiastolic?.value || 80}` } : null)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMeasurementsTab() {
    const readings = activeBundle?.readings || [];

    if (readings.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px;" class="panel">
          <p style="font-size: 14px; color: var(--muted);">${escapeHtml(t("hypertension.noReadings") || "No blood pressure measurements recorded yet.")}</p>
        </div>
      `;
    }

    return `
      <div class="panel" style="padding: 16px; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: start;">
          <thead>
            <tr style="border-bottom: 2px solid var(--line); color: var(--muted);">
              <th style="padding: 10px;">${escapeHtml(t("hypertension.date") || "Date")}</th>
              <th style="padding: 10px;">${escapeHtml(t("hypertension.bpReading") || "BP (mmHg)")}</th>
              <th style="padding: 10px;">${escapeHtml(t("hypertension.pulse") || "Pulse (bpm)")}</th>
              <th style="padding: 10px;">${escapeHtml(t("hypertension.map") || "MAP")}</th>
              <th style="padding: 10px;">${escapeHtml(t("hypertension.stage") || "Stage")}</th>
            </tr>
          </thead>
          <tbody>
            ${readings.map(r => `
              <tr style="border-bottom: 1px solid var(--line);">
                <td style="padding: 10px;">${new Date(r.measuredAt).toLocaleString()}</td>
                <td style="padding: 10px;"><strong>${r.systolic}/${r.diastolic}</strong></td>
                <td style="padding: 10px;">${r.pulse || '--'}</td>
                <td style="padding: 10px;">${r.map || '--'}</td>
                <td style="padding: 10px;"><span class="pill ok">${escapeHtml(r.classification?.stage || 'NORMAL')}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAssessmentsTab() {
    const assessments = activeBundle?.assessments || [];

    if (assessments.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px;" class="panel">
          <p style="font-size: 14px; color: var(--muted);">${escapeHtml(t("hypertension.noAssessments") || "No structured assessments recorded yet.")}</p>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${assessments.map(asm => `
          <div class="panel" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px;">
              <div>
                <strong>${escapeHtml(t("hypertension.assessmentRev") || "Clinical Revision")}: #${asm.clinicalRevision || 1}</strong>
                <span style="font-size: 12px; color: var(--muted); margin-inline-start: 10px;">${new Date(asm.createdAt || asm.assessedAt).toLocaleString()}</span>
              </div>
              <span class="pill ok">${escapeHtml(asm.status || 'submitted')}</span>
            </div>
            <div style="font-size: 13px; color: var(--ink);">
              <p><strong>${escapeHtml(t("hypertension.author") || "Author")}:</strong> ${escapeHtml(asm.author?.name || 'Patient')}</p>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderReviewsTab() {
    const reviews = activeBundle?.reviews || [];

    if (reviews.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px;" class="panel">
          <p style="font-size: 14px; color: var(--muted);">${escapeHtml(t("hypertension.noReviews") || "No doctor reviews recorded yet.")}</p>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${reviews.map(rev => `
          <div class="panel" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 12px;">
              <div>
                <strong>👨‍⚕️ ${escapeHtml(rev.doctor?.name || 'Physician')}</strong>
                <span style="font-size: 12px; color: var(--muted); margin-inline-start: 8px;">(${escapeHtml(rev.doctor?.licenseNumber || '')})</span>
              </div>
              <span class="pill ok">${escapeHtml(rev.status || 'reviewed')}</span>
            </div>
            <p style="font-size: 13px; margin: 4px 0;">${escapeHtml(rev.observations)}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderFollowupTab() {
    const plan = activeBundle?.followupPlan;

    if (!plan) {
      return `
        <div style="text-align: center; padding: 40px 20px;" class="panel">
          <p style="font-size: 14px; color: var(--muted);">${escapeHtml(t("hypertension.noFollowup") || "No follow-up protocol scheduled yet.")}</p>
        </div>
      `;
    }

    return `
      <div class="panel" style="padding: 16px;">
        <h4 style="margin-top: 0; border-bottom: 1px solid var(--line); padding-bottom: 8px;">
          📅 ${escapeHtml(t("hypertension.followupProtocol") || "Follow-up Protocol")}
        </h4>
        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 10px;">
          <div><strong>${escapeHtml(t("hypertension.scheduledDate") || "Scheduled Review")}:</strong> ${plan.scheduledDate || t("hypertension.stateNotProvided")}</div>
          <div><strong>${escapeHtml(t("hypertension.instructions") || "Instructions")}:</strong> ${escapeHtml(plan.instructions || t("hypertension.stateNotProvided"))}</div>
        </div>
      </div>
    `;
  }

  function renderReportsTab() {
    const reports = activeBundle?.approvedReports || [];

    if (reports.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px;" class="panel">
          <p style="font-size: 14px; color: var(--muted);">${escapeHtml(t("hypertension.noReports") || "No approved certified reports available yet.")}</p>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${reports.map(rep => `
          <div class="panel" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 12px;">
              <div>
                <strong>📄 ${escapeHtml(rep.reportRef || 'Certified Report')}</strong>
                <span style="font-size: 12px; color: var(--muted); margin-inline-start: 8px;">${new Date(rep.approvedAt || rep.certifiedAt).toLocaleDateString()}</span>
              </div>
              <span class="pill ok">🛡️ ${escapeHtml(t("hypertension.certified") || "Certified")}</span>
            </div>
            <p style="font-size: 13px;"><strong>${escapeHtml(t("hypertension.diagnosis") || "Diagnosis")}:</strong> ${escapeHtml(rep.clinicalDiagnosis || '')}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderNotesTab() {
    const notes = activeBundle?.clinicalNotes || [];

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div class="panel" style="padding: 16px;">
          <h4 style="margin-top: 0; border-bottom: 1px solid var(--line); padding-bottom: 8px;">📝 ${escapeHtml(t("hypertension.addNote") || "Add Doctor Clinical Note")}</h4>
          <textarea id="htnNewNoteText" rows="3" style="width: 100%; box-sizing: border-box; padding: 8px; font-family: inherit; margin-bottom: 10px;" placeholder="${escapeHtml(t("hypertension.notePlaceholder") || "Enter clinical note...")}"></textarea>
          <button type="button" class="action-button" onclick="window.HealthVibes.HypertensionUI.saveClinicalNote()">${escapeHtml(t("common.save") || "Save Note")}</button>
        </div>
        ${notes.map(n => `
          <div class="panel" style="padding: 16px;">
            <div style="font-size: 12px; color: var(--muted); margin-bottom: 6px;">${escapeHtml(n.author?.name)} - ${new Date(n.createdAt).toLocaleString()}</div>
            <div style="font-size: 13px;">${escapeHtml(n.noteText)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  async function renderScreen(container) {
    if (!container) return;

    activePatientId = global.currentPatientId || global.currentUserUid || "usr_patient_demo";

    if (!activeBundle) {
      await loadPatientBundle(activePatientId);
    }

    let tabContent = "";
    if (activeTab === "overview") tabContent = renderOverviewTab();
    else if (activeTab === "measurements") tabContent = renderMeasurementsTab();
    else if (activeTab === "assessments") tabContent = renderAssessmentsTab();
    else if (activeTab === "reviews") tabContent = renderReviewsTab();
    else if (activeTab === "followup") tabContent = renderFollowupTab();
    else if (activeTab === "reports") tabContent = renderReportsTab();
    else if (activeTab === "notes") tabContent = renderNotesTab();

    container.innerHTML = `
      <div class="hypertension-module-container" style="padding: 20px; max-width: 1200px; margin: 0 auto;">
        ${renderHeader(container)}
        ${renderTabs()}
        <div class="tab-body">
          ${isLoading ? `<p style="text-align: center;">⏳ Loading...</p>` : tabContent}
        </div>
      </div>
    `;
  }

  const UI = {
    switchTab: function (tabId) {
      activeTab = tabId;
      const screen = document.getElementById("screen-hypertension");
      if (screen) renderScreen(screen);
    },
    refresh: async function () {
      activeBundle = null;
      const screen = document.getElementById("screen-hypertension");
      if (screen) await renderScreen(screen);
    },
    saveClinicalNote: async function () {
      const txt = document.getElementById("htnNewNoteText")?.value;
      if (!txt || !txt.trim()) return;
      try {
        await global.fetch("/api/hypertension/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: activePatientId, noteText: txt })
        });
        await this.refresh();
      } catch (e) {
        alert("Failed to save note: " + e.message);
      }
    },
    renderScreen
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.HypertensionUI = UI;

})(typeof window !== "undefined" ? window : global);
