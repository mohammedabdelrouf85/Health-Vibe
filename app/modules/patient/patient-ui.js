/**
 * Health Vibe AI - Patient UI Module
 * 
 * Manages patient dashboard rendering, timeline UI items, and profile forms.
 */

(function (global) {
  "use strict";

  /**
   * Renders patient greeting and hero metrics.
   * @param {object} profile
   * @param {boolean} isEn
   */
  function renderPatientHero(profile = {}, isEn = false) {
    const rawName = profile.name || profile.displayName || (profile.email ? profile.email.split("@")[0] : (isEn ? "Patient" : "مريض"));
    const firstName = String(rawName).split(" ")[0];
    const titleEl = document.getElementById("patientHeroTitle");
    if (titleEl) {
      titleEl.textContent = isEn ? `Welcome, ${firstName}` : `مرحبًا ${firstName}`;
    }
  }

  /**
   * Generates HTML card for a timeline event item.
   * @param {object} item
   * @param {boolean} isEn
   * @returns {string}
   */
  function renderTimelineCard(item, isEn = false) {
    const escape = global.HealthVibes?.Validation?.escapeHtml || (s => String(s ?? ""));
    const type = item.type || "assessment";
    const dateStr = item.date || item.formattedDate || "";
    const title = item.title || "";
    const summary = item.summary || "";
    const doctorName = item.doctorName || "";
    const clinicName = item.clinicName || "";

    const typeIcons = {
      assessment: "🩺",
      appointment: "📅",
      report: "📋",
      notification: "🔔"
    };

    return `
      <div class="timeline-item timeline-type-${escape(type)}" data-id="${escape(item.id)}">
        <div class="timeline-badge">${typeIcons[type] || "•"}</div>
        <div class="timeline-content">
          <div class="timeline-header">
            <h4 class="timeline-title">${escape(title)}</h4>
            <span class="timeline-date">${escape(dateStr)}</span>
          </div>
          <p class="timeline-summary">${escape(summary)}</p>
          ${doctorName ? `<div class="timeline-meta"><span>👨‍⚕️ ${escape(doctorName)}</span>${clinicName ? ` • <span>🏥 ${escape(clinicName)}</span>` : ""}</div>` : ""}
        </div>
      </div>
    `;
  }

  /**
   * Renders patient diabetes summary card using standard patient clinical tokens.
   */
  function renderDiabetesSummaryCard(bundle = {}, isEn = false) {
    if (global.HealthVibes?.DiabetesUI?.renderPatientDashboardTab) {
      return global.HealthVibes.DiabetesUI.renderPatientDashboardTab();
    }
    return "";
  }

  const PatientUI = {
    renderPatientHero,
    renderTimelineCard,
    renderDiabetesSummaryCard
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.PatientUI = PatientUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PatientUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
