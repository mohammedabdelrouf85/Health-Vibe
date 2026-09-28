/**
 * Health Vibe AI - Reports UI Module
 * 
 * Manages clinical report presentation, print layout triggers,
 * and security badge displays.
 */

(function (global) {
  "use strict";

  function triggerPrintReport() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  function renderReportSecurityBadge(record, isEn = false) {
    const isApproved = record && (record.status === "approved" || record.reportSnapshot);
    if (!isApproved) {
      return `
        <div class="report-badge unapproved">
          <span>⚠️</span>
          <span>${isEn ? "Preliminary / Not Certified" : "تقرير مبدئي / غير معتمد"}</span>
        </div>
      `;
    }
    return `
      <div class="report-badge certified">
        <span>🔒</span>
        <span>${isEn ? "Digitally Certified by Attending Physician" : "معتمد رقمياً وموثق بواسطة الطبيب المعالج"}</span>
      </div>
    `;
  }

  const ReportsUI = {
    triggerPrintReport,
    renderReportSecurityBadge
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ReportsUI = ReportsUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReportsUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
