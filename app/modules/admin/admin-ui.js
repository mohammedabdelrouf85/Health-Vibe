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

  function renderUsageConversionHeroCards(data = {}, isEn = false) {
    const reg = data.registeredPatients || {};
    const comp = data.completedAssessments || {};
    const doc = data.doctorReviewTime || {};
    const conv = data.conversion || {};

    return `
      <div class="usage-hero-grid">
        <div class="usage-kpi-card emerald" id="cardUsageRegistered">
          <div class="usage-kpi-header">
            <span class="usage-kpi-icon">👥</span>
            <span class="usage-kpi-title">${isEn ? "Registered Patients" : "المرضى المسجلون"}</span>
          </div>
          <div class="usage-kpi-value" id="adminUsageRegisteredPatientsCount">${reg.display || "0"}</div>
          <div class="usage-kpi-sub" id="adminUsageRegisteredTodayBadge">${reg.todayDisplay || (isEn ? "Today: 0 new" : "اليوم: 0 جديد")}</div>
        </div>

        <div class="usage-kpi-card teal" id="cardUsageAssessments">
          <div class="usage-kpi-header">
            <span class="usage-kpi-icon">🩺</span>
            <span class="usage-kpi-title">${isEn ? "Completed Assessments" : "التقييمات المكتملة"}</span>
          </div>
          <div class="usage-kpi-value" id="adminUsageCompletedAssessmentsCount">${comp.completed !== undefined ? comp.completed : "0"}</div>
          <div class="usage-kpi-sub" id="adminUsageCompletionRateBadge">${isEn ? "Completion Rate: " : "معدل الإكمال: "}${comp.completionRateDisplay || "--%"}</div>
        </div>

        <div class="usage-kpi-card blue" id="cardUsageReviewTime">
          <div class="usage-kpi-header">
            <span class="usage-kpi-icon">⏱️</span>
            <span class="usage-kpi-title">${isEn ? "Avg Doctor Review Time" : "متوسط وقت مراجعة الأطباء"}</span>
          </div>
          <div class="usage-kpi-value" id="adminUsageAvgDoctorReviewTime">${doc.display || (isEn ? "Unavailable" : "غير متاح")}</div>
          <div class="usage-kpi-sub" id="adminUsageReviewSlaBadge">${doc.slaDisplay || (isEn ? "SLA: < 30m" : "SLA: < 30 دقيقة")}</div>
        </div>

        <div class="usage-kpi-card amber" id="cardUsageConversion">
          <div class="usage-kpi-header">
            <span class="usage-kpi-icon">🎯</span>
            <span class="usage-kpi-title">${isEn ? "Booking Conversion Rate" : "معدل التحول لحجز المواعيد"}</span>
          </div>
          <div class="usage-kpi-value" id="adminUsageConversionRate">${conv.conversionRateDisplay || "--%"}</div>
          <div class="usage-kpi-sub" id="adminUsageTotalBookingsBadge">${conv.totalBookingsConverted || 0} ${isEn ? "confirmed bookings" : "حجز مؤكد"}</div>
        </div>
      </div>
    `;
  }

  function renderConversionFunnel(stages = [], isEn = false) {
    if (!stages || stages.length === 0) return "";
    return `
      <div class="usage-funnel-container">
        ${stages.map((stage, idx) => `
          <div class="funnel-step" data-step="${stage.stage}">
            <div class="funnel-step-badge">${stage.stage}</div>
            <div class="funnel-step-content">
              <div class="funnel-step-name">${isEn ? stage.name : stage.nameAr}</div>
              <div class="funnel-step-count" id="adminUsageFunnelStep${stage.stage}Count">${stage.count}</div>
              ${idx > 0 ? `
                <div class="funnel-step-rates">
                  <span class="funnel-rate-conv" id="adminUsageFunnelStep${stage.stage}Rate">${stage.conversionFromPrev}% ${isEn ? "conv" : "تحويل"}</span>
                  ${stage.dropoffRate > 0 ? `<span class="funnel-rate-drop" id="adminUsageFunnelStep${stage.stage}Drop">-${stage.dropoffRate}% ${isEn ? "drop" : "تسرب"}</span>` : ""}
                </div>
              ` : `
                <div class="funnel-step-rates"><span class="funnel-rate-conv">100% ${isEn ? "base" : "الأساس"}</span></div>
              `}
            </div>
            ${idx < stages.length - 1 ? `<div class="funnel-arrow">➜</div>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderDoctorLeaderboardRows(doctors = [], isEn = false) {
    if (!doctors || doctors.length === 0) {
      return `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--muted);">${isEn ? "No doctor activity recorded for this period." : "لا توجد نشاطات أطباء مسجلة خلال هذه الفترة."}</td></tr>`;
    }

    return doctors.map(doc => {
      const statusPill = doc.slaStatus === 'optimal'
        ? `<span class="pill ok">${isEn ? "Optimal (< 30m)" : "ممتاز (< 30 دقيقة)"}</span>`
        : (doc.slaStatus === 'warning'
          ? `<span class="pill warning">${isEn ? "Acceptable (< 1h)" : "مقبول (< ساعة)"}</span>`
          : `<span class="pill danger">${isEn ? "Delayed" : "متأخر"}</span>`);

      return `
        <tr>
          <td>
            <strong>${doc.doctorName}</strong>
            <small style="display:block; color:var(--muted); font-size:11px;">${doc.clinicName}</small>
          </td>
          <td>${doc.reviewsCount}</td>
          <td><strong>${doc.avgReviewDisplay}</strong></td>
          <td>${doc.convertedBookings}</td>
          <td><span class="pill info" style="font-weight:700;">${doc.conversionRateDisplay}</span></td>
          <td>${doc.slaRate !== null ? `${doc.slaRate}%` : (isEn ? "N/A" : "غير متوفر")}</td>
          <td>${statusPill}</td>
        </tr>
      `;
    }).join("");
  }

  function renderPatientJourneyRows(patients = [], isEn = false) {
    if (!patients || patients.length === 0) {
      return `<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--muted);">${isEn ? "No patient journeys logged yet." : "لم يتم تسجيل مسارات مرضى بعد."}</td></tr>`;
    }

    return patients.map(p => `
      <tr>
        <td><code>${p.patientCode || p.id || "--"}</code></td>
        <td>${p.date || "--"}</td>
        <td><span class="pill ${p.assessmentCompleted ? 'ok' : 'pending'}">${p.assessmentStatus || "--"}</span></td>
        <td>${p.reviewDuration || (isEn ? "Pending" : "قيد الانتظار")}</td>
        <td><span class="pill ${p.appointmentBooked ? 'ok' : 'neutral'}">${p.appointmentBooked ? (isEn ? "Booked ✓" : "تم الحجز ✓") : (isEn ? "Not Yet" : "لم يحجز")}</span></td>
        <td><strong style="color: var(--teal);">${p.conversionStage || "--"}</strong></td>
      </tr>
    `).join("");
  }

  const AdminUI = {
    renderKpiMetricCard,
    renderUsageConversionHeroCards,
    renderConversionFunnel,
    renderDoctorLeaderboardRows,
    renderPatientJourneyRows
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AdminUI = AdminUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AdminUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
