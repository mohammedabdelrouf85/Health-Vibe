/**
 * Health Vibe AI - Admin UI Module
 * 
 * Manages KPI dashboard rendering, summary cards, and audit event tables.
 */

(function (global) {
  "use strict";

  function renderKpiMetricCard(title, value, subtitle, icon = "📊", status = "neutral") {
    return `
      <div class="kpi-card kpi-status-${status}">
        <div class="kpi-card-header">
          <span class="kpi-card-icon">${icon}</span>
          <span class="kpi-card-title">${title}</span>
        </div>
        <div class="kpi-card-value">${value}</div>
        ${subtitle ? `<div class="kpi-card-sub">${subtitle}</div>` : ""}
      </div>
    `;
  }

  const AdminUI = {
    renderKpiMetricCard
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AdminUI = AdminUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AdminUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
