/**
 * Health Vibe AI - Patient UI & Blood Pressure Trend View Module
 * 
 * Manages:
 * 1. Patient dashboard hero and timeline rendering.
 * 2. Patient-facing Blood Pressure History & Trend View:
 *    - Persisted measurements only (strictly no fabricated readings or synthetic trends).
 *    - Detailed measurement display: systolic, diastolic, unit (mmHg), date/time, and source.
 *    - Chronological timeline with monitoring gap detection.
 *    - SVG line chart visualization when >= 2 distinct measurements exist.
 *    - Insufficient data handling: strictly no trend fabrication when < 2 readings.
 *    - Clear indication of missing values, sources, time periods (morning, afternoon, evening, night).
 *    - Clinical boundary enforcement: NO automated diagnoses, NO unsupported risk classifications.
 *    - Bilingual responsive layout supporting Arabic RTL and English LTR.
 */

(function (global) {
  "use strict";

  // =============================================================================
  // 1. HELPER CONSTANTS & FORMATTERS
  // =============================================================================

  const BP_SOURCES = {
    bluetooth_device: {
      key: "bluetooth_device",
      icon: "📶",
      labelEn: "Bluetooth Monitor",
      labelAr: "جهاز بلوتوث معتمد",
      badgeClass: "badge-bt"
    },
    clinic_reading: {
      key: "clinic_reading",
      icon: "🏥",
      labelEn: "Clinic Measurement",
      labelAr: "قياس بالعيادة",
      badgeClass: "badge-clinic"
    },
    manual_patient_log: {
      key: "manual_patient_log",
      icon: "✍️",
      labelEn: "Patient Manual Log",
      labelAr: "تسجيل يدوي",
      badgeClass: "badge-manual"
    },
    patient_self_report: {
      key: "patient_self_report",
      icon: "✍️",
      labelEn: "Patient Self-Report",
      labelAr: "تقرير شخصي",
      badgeClass: "badge-manual"
    },
    medical_ocr: {
      key: "medical_ocr",
      icon: "📄",
      labelEn: "Medical Document OCR",
      labelAr: "مسح تقرير طبي",
      badgeClass: "badge-ocr"
    },
    automated_monitor: {
      key: "automated_monitor",
      icon: "⚙️",
      labelEn: "Automated Monitor",
      labelAr: "جهاز قياس آلي",
      badgeClass: "badge-auto"
    }
  };

  const TIME_PERIODS = {
    morning: { key: "morning", icon: "🌅", labelEn: "Morning", labelAr: "صباحاً" },
    afternoon: { key: "afternoon", icon: "☀️", labelEn: "Afternoon", labelAr: "ظهراً" },
    evening: { key: "evening", icon: "🌆", labelEn: "Evening", labelAr: "مساءً" },
    night: { key: "night", icon: "🌙", labelEn: "Night", labelAr: "ليلاً" }
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTimePeriod(isoString) {
    if (!isoString) return TIME_PERIODS.morning;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return TIME_PERIODS.morning;
    const hours = d.getHours();
    if (hours >= 5 && hours < 12) return TIME_PERIODS.morning;
    if (hours >= 12 && hours < 17) return TIME_PERIODS.afternoon;
    if (hours >= 17 && hours < 22) return TIME_PERIODS.evening;
    return TIME_PERIODS.night;
  }

  function formatDateTime(isoString, isEn = false) {
    if (!isoString) return isEn ? "Date unknown" : "تاريخ غير معروف";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);

    try {
      return d.toLocaleString(isEn ? "en-US" : "ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch (e) {
      return d.toISOString().replace("T", " ").substring(0, 16);
    }
  }

  function formatShortDate(isoString, isEn = false) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
        month: "short",
        day: "numeric"
      });
    } catch (e) {
      return d.toISOString().substring(5, 10);
    }
  }

  function getSourceInfo(sourceKey) {
    const key = String(sourceKey || "manual_patient_log").toLowerCase();
    return BP_SOURCES[key] || {
      key,
      icon: "🩺",
      labelEn: "Clinical Observation",
      labelAr: "ملاحظة سريرية",
      badgeClass: "badge-default"
    };
  }

  // =============================================================================
  // 2. GAP DETECTION & FILTERING
  // =============================================================================

  /**
   * Detects gaps in blood pressure monitoring (e.g. > 48 hours without measurement)
   * @param {Array} readings 
   * @param {number} thresholdHours 
   * @returns {Array} List of gaps { from, to, gapHours, gapDays }
   */
  function detectMonitoringGaps(readings = [], thresholdHours = 48) {
    if (!Array.isArray(readings) || readings.length < 2) return [];

    // Sort chronologically (oldest first)
    const sorted = [...readings].filter(r => r && (r.measuredAt || r.createdAt)).sort((a, b) => {
      return new Date(a.measuredAt || a.createdAt).getTime() - new Date(b.measuredAt || b.createdAt).getTime();
    });

    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const t1 = new Date(current.measuredAt || current.createdAt).getTime();
      const t2 = new Date(next.measuredAt || next.createdAt).getTime();
      const diffMs = t2 - t1;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours >= thresholdHours) {
        gaps.push({
          afterReadingId: current.id || current.readingId,
          beforeReadingId: next.id || next.readingId,
          from: current.measuredAt || current.createdAt,
          to: next.measuredAt || next.createdAt,
          gapHours: Math.round(diffHours),
          gapDays: Math.round((diffHours / 24) * 10) / 10
        });
      }
    }

    return gaps;
  }

  /**
   * Filters readings by period (morning, evening, etc.), source, or time range.
   */
  function filterReadings(readings = [], filters = {}) {
    if (!Array.isArray(readings)) return [];

    return readings.filter(r => {
      if (!r) return false;

      // Period filter
      if (filters.period && filters.period !== "all") {
        const p = getTimePeriod(r.measuredAt || r.createdAt);
        if (p.key !== filters.period) return false;
      }

      // Source filter
      if (filters.source && filters.source !== "all") {
        const src = String(r.measurementSource || r.source || "").toLowerCase();
        if (src !== filters.source) return false;
      }

      // Days range filter (e.g. 7d, 30d)
      if (filters.rangeDays && filters.rangeDays > 0) {
        const t = new Date(r.measuredAt || r.createdAt).getTime();
        const cutoff = Date.now() - (filters.rangeDays * 24 * 60 * 60 * 1000);
        if (t < cutoff) return false;
      }

      return true;
    });
  }

  // =============================================================================
  // 3. SVG TREND CHART (Gated strictly on >= 2 persisted readings)
  // =============================================================================

  /**
   * Generates a responsive SVG line chart visualization for systolic and diastolic curves.
   * Gated: strictly requires >= 2 distinct persisted measurements.
   * NEVER fabricates trends or draws curves when insufficient data exists.
   * NEVER derives a diagnosis from the chart.
   * 
   * @param {Array} readings 
   * @param {boolean} isEn 
   * @returns {string} SVG HTML or insufficient data advisory card
   */
  function renderBpTrendChartSvg(readings = [], isEn = false) {
    const validReadings = (readings || []).filter(r => {
      const s = Number(r?.systolic);
      const d = Number(r?.diastolic);
      return !isNaN(s) && s > 0 && !isNaN(d) && d > 0;
    });

    // RULE: Do not fabricate trends when insufficient data exists (< 2 measurements)
    if (validReadings.length < 2) {
      return `
        <div class="bp-insufficient-data-card" role="region" aria-label="${isEn ? 'Blood pressure trend notice' : 'تنبيه مسار ضغط الدم'}">
          <div class="bp-insufficient-icon" aria-hidden="true">📊</div>
          <div class="bp-insufficient-body">
            <h4 class="bp-insufficient-title">
              ${isEn ? "Trend Chart Requires at Least 2 Measurements" : "رسم المنحنى البياني يتطلب قراءتين مسجلتين على الأقل"}
            </h4>
            <p class="bp-insufficient-desc">
              ${isEn
                ? "To ensure clinical accuracy and avoid misleading curves, trend visualization requires at least 2 persisted measurements across different times. Continue logging your blood pressure to view historical trends."
                : "لضمان الدقة وتفادي أي منحنيات مضللة، يتطلب رسم المنحنى البياني تسجيل قراءتين فعليتين على الأقل في أوقات مختلفة. واصل تسجيل قياساتك لمتابعة الاتجاه الزمني."}
            </p>
            <div class="bp-insufficient-status">
              <span class="bp-count-pill">
                ${isEn ? `Current Persisted Readings: ${validReadings.length}` : `القراءات المسجلة حالياً: ${validReadings.length}`}
              </span>
              <span class="bp-unit-pill">
                ${isEn ? "Unit: mmHg" : "الوحدة: مم زئبق"}
              </span>
            </div>
          </div>
        </div>
      `;
    }

    // Sort chronologically for proper left-to-right temporal progression
    const sorted = [...validReadings].sort((a, b) => {
      return new Date(a.measuredAt || a.createdAt).getTime() - new Date(b.measuredAt || b.createdAt).getTime();
    });

    // Chart Dimensions
    const width = 640;
    const height = 240;
    const padTop = 30;
    const padBottom = 45;
    const padLeft = 55;
    const padRight = 35;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    // Determine Y range (mmHg)
    let minVal = 40;
    let maxVal = 200;
    const allVals = sorted.flatMap(r => [Number(r.systolic), Number(r.diastolic)]);
    const dataMin = Math.min(...allVals);
    const dataMax = Math.max(...allVals);
    minVal = Math.max(40, Math.floor((dataMin - 10) / 10) * 10);
    maxVal = Math.min(240, Math.ceil((dataMax + 15) / 10) * 10);
    if (maxVal - minVal < 40) maxVal = minVal + 40;

    const valToY = (v) => {
      const clamped = Math.max(minVal, Math.min(maxVal, v));
      const ratio = (clamped - minVal) / (maxVal - minVal);
      return height - padBottom - (ratio * plotHeight);
    };

    const n = sorted.length;
    const getX = (idx) => padLeft + (idx / (n - 1)) * plotWidth;

    // Grid lines every 20 mmHg
    const gridLines = [];
    const step = 20;
    const startTick = Math.ceil(minVal / step) * step;
    for (let val = startTick; val <= maxVal; val += step) {
      const y = valToY(val);
      gridLines.push(`
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--line, #1e3f42)" stroke-dasharray="3 3" stroke-width="1" />
        <text x="${padLeft - 8}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="var(--muted, #9ac1bf)" font-family="inherit">${val} <tspan font-size="8">mmHg</tspan></text>
      `);
    }

    // Build SVG paths and point circles
    const sysPoints = [];
    const diaPoints = [];
    const dataCircles = [];
    const dateLabels = [];

    sorted.forEach((r, i) => {
      const x = getX(i);
      const sysY = valToY(Number(r.systolic));
      const diaY = valToY(Number(r.diastolic));

      sysPoints.push(`${x.toFixed(1)},${sysY.toFixed(1)}`);
      diaPoints.push(`${x.toFixed(1)},${diaY.toFixed(1)}`);

      const formattedDt = formatDateTime(r.measuredAt || r.createdAt, isEn);
      const srcInfo = getSourceInfo(r.measurementSource || r.source);
      const srcLabel = isEn ? srcInfo.labelEn : srcInfo.labelAr;
      const periodInfo = getTimePeriod(r.measuredAt || r.createdAt);
      const periodLabel = isEn ? periodInfo.labelEn : periodInfo.labelAr;

      // Tooltip content & accessible labels
      const tooltipTitle = `${formattedDt} (${periodInfo.icon} ${periodLabel})&#10;` +
        `${isEn ? "Systolic" : "الانقباضي"}: ${r.systolic} mmHg&#10;` +
        `${isEn ? "Diastolic" : "الانبساطي"}: ${r.diastolic} mmHg&#10;` +
        `${isEn ? "Source" : "المصدر"}: ${srcInfo.icon} ${srcLabel}`;

      // Systolic Dot
      dataCircles.push(`
        <g class="chart-point-group" tabindex="0" role="img" aria-label="${isEn ? `Measurement ${i + 1}: ${r.systolic}/${r.diastolic} mmHg` : `قياس ${i + 1}: ${r.systolic}/${r.diastolic} مم زئبق`}">
          <title>${tooltipTitle}</title>
          <circle cx="${x.toFixed(1)}" cy="${sysY.toFixed(1)}" r="4.5" class="chart-dot chart-dot-sys" fill="#09b8b6" stroke="var(--surface, #0d2427)" stroke-width="2" />
          <circle cx="${x.toFixed(1)}" cy="${diaY.toFixed(1)}" r="4.5" class="chart-dot chart-dot-dia" fill="#3b82f6" stroke="var(--surface, #0d2427)" stroke-width="2" />
        </g>
      `);

      // X-axis label (show first, last, and intermittent markers)
      if (n <= 5 || i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
        const shortDt = formatShortDate(r.measuredAt || r.createdAt, isEn);
        dateLabels.push(`
          <text x="${x.toFixed(1)}" y="${height - padBottom + 18}" text-anchor="middle" font-size="10" fill="var(--muted, #9ac1bf)" font-family="inherit">${escapeHtml(shortDt)}</text>
        `);
      }
    });

    const sysPathD = `M ` + sysPoints.join(" L ");
    const diaPathD = `M ` + diaPoints.join(" L ");

    return `
      <div class="bp-svg-chart-wrapper" style="position: relative; width: 100%;">
        <!-- Chart Legend & Unit Banner -->
        <div class="bp-chart-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
          <div class="bp-chart-legend" style="display: flex; align-items: center; gap: 14px; font-size: 12.5px;">
            <span class="legend-item" style="display: inline-flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 12px; height: 3px; background: #09b8b6; border-radius: 2px;"></span>
              <strong>${isEn ? "Systolic" : "الضغط الانقباضي"}</strong> <span style="font-size: 11px; color: var(--muted);">(mmHg)</span>
            </span>
            <span class="legend-item" style="display: inline-flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 12px; height: 3px; background: #3b82f6; border-radius: 2px;"></span>
              <strong>${isEn ? "Diastolic" : "الضغط الانبساطي"}</strong> <span style="font-size: 11px; color: var(--muted);">(mmHg)</span>
            </span>
          </div>
          <div class="bp-chart-stats-pill" style="font-size: 11px; color: var(--muted); background: var(--surface-2); padding: 4px 10px; border-radius: 12px; border: 1px solid var(--line);">
            <span>${isEn ? `Showing ${validReadings.length} measurements` : `عرض ${validReadings.length} قياساً مسجلاً`}</span>
          </div>
        </div>

        <!-- Accessible SVG Graphic -->
        <div class="bp-svg-responsive-container" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
          <svg viewBox="0 0 ${width} ${height}" class="bp-trend-svg" style="width: 100%; min-width: 500px; height: auto; display: block;" role="img" aria-label="${isEn ? 'Blood pressure trend chart' : 'الرسم البياني لمسار ضغط الدم'}">
            <!-- Background Grid -->
            <rect x="${padLeft}" y="${padTop}" width="${plotWidth}" height="${plotHeight}" fill="rgba(14, 46, 49, 0.25)" rx="6" />
            ${gridLines.join("")}

            <!-- Trend Lines (Only generated because readings >= 2) -->
            <path d="${diaPathD}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${sysPathD}" fill="none" stroke="#09b8b6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

            <!-- Point Dots with Tooltips -->
            ${dataCircles.join("")}

            <!-- X-Axis Labels -->
            ${dateLabels.join("")}
          </svg>
        </div>

        <!-- Non-Diagnostic Notice -->
        <div class="bp-chart-disclaimer" style="margin-top: 8px; font-size: 11px; color: var(--muted); text-align: start; display: flex; align-items: center; gap: 6px;">
          <span aria-hidden="true">ℹ️</span>
          <span>${isEn ? "Observational trend for self-tracking only. Chart curves do not constitute a clinical diagnosis or treatment prescription." : "منحنى استرعائي للمتابعة الشخصية فقط. لا يشكل الرسم البياني تشخيصاً طبياً أو وصفة علاجية."}</span>
        </div>
      </div>
    `;
  }

  // =============================================================================
  // 4. CHRONOLOGICAL TIMELINE (With Missing Indicators & Gap Detection)
  // =============================================================================

  /**
   * Renders the chronological timeline of persisted measurements.
   * Clearly displays systolic, diastolic, unit (mmHg), date/time, source, and highlights missing values / gaps.
   * 
   * @param {Array} readings 
   * @param {boolean} isEn 
   * @param {object} options 
   * @returns {string} HTML string
   */
  function renderBpTimeline(readings = [], isEn = false, options = {}) {
    if (!Array.isArray(readings) || readings.length === 0) {
      return `
        <div class="bp-timeline-empty" style="text-align: center; padding: 28px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; margin: 16px 0;">
          <div style="font-size: 28px; margin-bottom: 8px;">🩸</div>
          <h4 style="font-size: 14px; margin: 0 0 4px; color: var(--ink);">
            ${isEn ? "No Persisted Blood Pressure Readings" : "لا توجد قياسات مسجلة لضغط الدم"}
          </h4>
          <p style="font-size: 12.5px; color: var(--muted); margin: 0;">
            ${isEn ? "No measurements found for the selected filter. Log a reading or connect a monitor." : "لم يتم العثور على قياسات مطابقة للتصفية الحالية. سجل قراءة أو اربط جهاز قياس."}
          </p>
        </div>
      `;
    }

    // Sort: default to reverse-chronological (newest first) for timeline view, with option for chronological
    const order = options.order || "newest_first";
    const sorted = [...readings].sort((a, b) => {
      const tA = new Date(a.measuredAt || a.createdAt || 0).getTime();
      const tB = new Date(b.measuredAt || b.createdAt || 0).getTime();
      return order === "oldest_first" ? tA - tB : tB - tA;
    });

    // Compute gaps for highlighting intervals between readings
    const gaps = detectMonitoringGaps(readings, 48);
    const gapMap = new Map();
    gaps.forEach(g => {
      gapMap.set(g.beforeReadingId, g);
    });

    const cardsHtml = sorted.map((r, index) => {
      const readingId = r.id || r.readingId || `bp_${index}`;
      const hasSys = r.systolic !== null && r.systolic !== undefined && !isNaN(Number(r.systolic));
      const hasDia = r.diastolic !== null && r.diastolic !== undefined && !isNaN(Number(r.diastolic));
      const sysVal = hasSys ? Number(r.systolic) : null;
      const diaVal = hasDia ? Number(r.diastolic) : null;
      const pulseVal = r.pulse && !isNaN(Number(r.pulse)) ? Number(r.pulse) : null;
      const unit = r.unit || "mmHg";

      const dtStr = formatDateTime(r.measuredAt || r.createdAt, isEn);
      const period = getTimePeriod(r.measuredAt || r.createdAt);
      const periodLabel = isEn ? period.labelEn : period.labelAr;

      const src = getSourceInfo(r.measurementSource || r.source);
      const srcLabel = isEn ? src.labelEn : src.labelAr;

      const context = r.context || {};
      const arm = context.arm || r.arm;
      const posture = context.posture || r.posture;

      // Check if a monitoring gap preceded this reading
      const precedingGap = gapMap.get(readingId);
      const gapNoticeHtml = precedingGap ? `
        <div class="bp-gap-alert-card" style="margin: 10px 0; padding: 8px 12px; background: rgba(240, 180, 41, 0.1); border: 1px dashed var(--amber, #f0b429); border-radius: 8px; font-size: 11.5px; color: var(--amber, #f0b429); display: flex; align-items: center; gap: 8px;">
          <span>⚠️</span>
          <span>${isEn ? `Monitoring Gap: ${precedingGap.gapDays} days without recorded measurements` : `انقطاع في المتابعة: ${precedingGap.gapDays} يوماً دون تسجيل قياسات`}</span>
        </div>
      ` : "";

      // Missing field indicators
      const isMissingMeasurement = !hasSys || !hasDia;
      const sysDisplay = hasSys ? `${sysVal}` : `<span class="bp-missing-tag" style="color: var(--amber); font-weight: normal; font-size: 12px;">${isEn ? "[Missing]" : "[غير متوفر]"}</span>`;
      const diaDisplay = hasDia ? `${diaVal}` : `<span class="bp-missing-tag" style="color: var(--amber); font-weight: normal; font-size: 12px;">${isEn ? "[Missing]" : "[غير متوفر]"}</span>`;

      return `
        ${gapNoticeHtml}
        <div class="bp-timeline-card ${isMissingMeasurement ? 'bp-card-incomplete' : ''}" data-reading-id="${escapeHtml(readingId)}" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; transition: transform 0.15s ease, border-color 0.15s ease;">
          <!-- Top Row: Source badge, Time Period, and Date/Time -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="bp-source-badge ${src.badgeClass}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink);">
                <span>${src.icon}</span>
                <span>${escapeHtml(srcLabel)}</span>
              </span>
              <span class="bp-period-badge" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11px; padding: 3px 7px; border-radius: 6px; background: rgba(9, 184, 182, 0.08); color: var(--teal);">
                <span>${period.icon}</span>
                <span>${escapeHtml(periodLabel)}</span>
              </span>
            </div>
            <time class="bp-reading-time" datetime="${escapeHtml(r.measuredAt || r.createdAt || '')}" style="font-size: 11.5px; color: var(--muted);">
              ${escapeHtml(dtStr)}
            </time>
          </div>

          <!-- Middle Row: Systolic / Diastolic values + unit -->
          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px;">
            <div class="bp-values-display" style="display: flex; align-items: baseline; gap: 6px;">
              <div class="bp-pressure-reading" style="font-size: 24px; font-weight: 700; color: var(--ink); letter-spacing: -0.5px;">
                <span class="bp-sys-val" style="color: #09b8b6;">${sysDisplay}</span>
                <span style="color: var(--muted); margin: 0 2px;">/</span>
                <span class="bp-dia-val" style="color: #3b82f6;">${diaDisplay}</span>
              </div>
              <span class="bp-unit-label" style="font-size: 12.5px; font-weight: 600; color: var(--muted);">${escapeHtml(unit)}</span>
            </div>

            ${pulseVal !== null ? `
              <div class="bp-pulse-badge" style="font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; gap: 4px; background: var(--surface-2); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line);">
                <span style="color: #f06060;">❤️</span>
                <strong>${pulseVal}</strong>
                <span>bpm</span>
              </div>
            ` : ""}
          </div>

          <!-- Incomplete Data Warning if applicable -->
          ${isMissingMeasurement ? `
            <div class="bp-incomplete-alert" style="margin-top: 8px; font-size: 11px; color: var(--amber); display: flex; align-items: center; gap: 4px;">
              <span>⚠️</span>
              <span>${isEn ? "Incomplete reading: missing pressure value recorded." : "قياس غير مكتمل: قيمة الضغط مفقودة."}</span>
            </div>
          ` : ""}

          <!-- Context Meta (Arm, Posture) if provided -->
          ${(arm || posture) ? `
            <div class="bp-context-meta" style="margin-top: 8px; padding-top: 8px; border-top: 1px dotted var(--line); font-size: 11px; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap;">
              ${arm ? `<span>💪 ${escapeHtml(arm === "left_arm" ? (isEn ? "Left Arm" : "الذراع الأيسر") : (isEn ? "Right Arm" : "الذراع الأيمن"))}</span>` : ""}
              ${posture ? `<span>🪑 ${escapeHtml(posture === "sitting" ? (isEn ? "Sitting" : "وضع الجلوس") : posture)}</span>` : ""}
            </div>
          ` : ""}
        </div>
      `;
    });

    return `
      <div class="bp-timeline-container" role="feed" aria-label="${isEn ? 'Blood pressure history timeline' : 'سجل قياسات ضغط الدم'}">
        ${cardsHtml.join("")}
      </div>
    `;
  }

  // =============================================================================
  // 5. PATIENT-FACING HISTORY & TREND VIEW (Main Assembler)
  // =============================================================================

  /**
   * Renders the complete patient-facing blood-pressure history and trend dashboard view.
   * 
   * @param {HTMLElement|string} target Container element or ID (optional)
   * @param {object} options Configuration and data options
   * @returns {string} Rendered HTML
   */
  function renderPatientBpTrendView(target, options = {}) {
    // Handle polymorphic arguments: (options) or (target, options)
    let container = null;
    let opts = options;
    if (target && typeof target === "object" && !target.nodeType && !opts.readings) {
      opts = target;
    } else if (typeof target === "string") {
      container = document.getElementById(target);
    } else if (target && target.nodeType) {
      container = target;
    }

    const isEn = Boolean(opts.isEn !== undefined ? opts.isEn : (global.currentLanguage === "en"));
    const rawReadings = Array.isArray(opts.readings) ? opts.readings : [];

    // Filter to only genuine persisted measurements
    const persistedReadings = rawReadings.filter(r => r && (r.id || r.readingId || (r.systolic && r.diastolic)));

    // Active filters
    const currentPeriod = opts.filterPeriod || "all";
    const currentSource = opts.filterSource || "all";
    const currentRange = opts.filterRange || "all"; // "7d", "30d", "all"

    const filtered = filterReadings(persistedReadings, {
      period: currentPeriod,
      source: currentSource,
      rangeDays: currentRange === "7d" ? 7 : (currentRange === "30d" ? 30 : 0)
    });

    // Statistical summary (Strictly observational arithmetic, NO diagnosis)
    const validMeasurements = filtered.filter(r => Number(r.systolic) > 0 && Number(r.diastolic) > 0);
    const n = validMeasurements.length;
    let sumSys = 0;
    let sumDia = 0;
    validMeasurements.forEach(r => {
      sumSys += Number(r.systolic);
      sumDia += Number(r.diastolic);
    });
    const avgSys = n > 0 ? Math.round(sumSys / n) : null;
    const avgDia = n > 0 ? Math.round(sumDia / n) : null;

    const latest = persistedReadings.length > 0 ? persistedReadings[0] : null;
    const gaps = detectMonitoringGaps(persistedReadings, 48);

    const html = `
      <div class="patient-bp-view ${isEn ? 'ltr-mode' : 'rtl-mode'}" dir="${isEn ? 'ltr' : 'rtl'}" style="width: 100%; max-width: 900px; margin: 0 auto; padding: 12px 0;">
        
        <!-- Module Header & Actions -->
        <div class="bp-view-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 26px;">❤️</span>
              <h2 style="font-size: 20px; font-weight: 700; margin: 0; color: var(--ink);">
                ${isEn ? "Blood Pressure History & Trends" : "سجل ومنحنى ضغط الدم"}
              </h2>
            </div>
            <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
              ${isEn ? "Review your recorded vitals, longitudinal timeline, and trend progression." : "متابعة قياساتك المسجلة، السجل الزمني، ومسار التغيرات."}
            </p>
          </div>

          <div class="bp-header-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-outline" id="btnRefreshBpReadings" style="padding: 7px 12px; font-size: 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); cursor: pointer;">
              <span>🔄</span> ${isEn ? "Refresh" : "تحديث"}
            </button>
            <button type="button" class="btn btn-primary" id="btnOpenLogBpModal" style="padding: 7px 14px; font-size: 12px; border-radius: 8px; background: var(--teal); color: #07191b; font-weight: 600; border: none; cursor: pointer;">
              <span>➕</span> ${isEn ? "Log Measurement" : "تسجيل قياس جديد"}
            </button>
          </div>
        </div>

        <!-- Observational Summary Metric Cards (Purely arithmetic, NO automated risk scores) -->
        <div class="bp-metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <!-- Latest Reading -->
          <div class="bp-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>⏱️</span> ${isEn ? "Latest Persisted Reading" : "آخر قياس مسجل"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${latest && latest.systolic && latest.diastolic ? `
                <span style="color: #09b8b6;">${latest.systolic}</span>/<span style="color: #3b82f6;">${latest.diastolic}</span> <span style="font-size: 11px; font-weight: normal; color: var(--muted);">mmHg</span>
              ` : `<span style="font-size: 13px; color: var(--muted);">${isEn ? "No readings yet" : "لا توجد قراءات"}</span>`}
            </div>
          </div>

          <!-- Average Blood Pressure -->
          <div class="bp-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>📐</span> ${isEn ? "Average Reading" : "متوسط القياسات"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${avgSys && avgDia ? `
                <span style="color: #09b8b6;">${avgSys}</span>/<span style="color: #3b82f6;">${avgDia}</span> <span style="font-size: 11px; font-weight: normal; color: var(--muted);">mmHg</span>
              ` : `<span style="font-size: 13px; color: var(--muted);">--</span>`}
            </div>
          </div>

          <!-- Total Persisted Records -->
          <div class="bp-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>📋</span> ${isEn ? "Total Persisted Records" : "إجمالي السجلات"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${persistedReadings.length}
            </div>
          </div>

          <!-- Monitoring Gaps -->
          <div class="bp-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>⚠️</span> ${isEn ? "Tracking Gaps (>48h)" : "فترات الانقطاع (>٤٨س)"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: ${gaps.length > 0 ? 'var(--amber)' : 'var(--ink)'};">
              ${gaps.length}
            </div>
          </div>
        </div>

        <!-- Strict Clinical Boundary & Non-Diagnostic Advisory Banner -->
        <div class="bp-clinical-disclaimer-banner" role="note" style="background: rgba(9, 184, 182, 0.08); border: 1px solid var(--teal); border-radius: 10px; padding: 12px 14px; margin-bottom: 18px; display: flex; gap: 10px; align-items: flex-start;">
          <span style="font-size: 18px; line-height: 1;" aria-hidden="true">🛡️</span>
          <div style="font-size: 12px; line-height: 1.5; color: var(--ink);">
            <strong>${isEn ? "Observational Health Record Notice:" : "تنبيه السجل الصحي الاسترعائي:"}</strong>
            <span>
              ${isEn
                ? "This history and trend view display your recorded blood-pressure measurements for observational tracking only. It does not provide medical diagnoses, treatment prescriptions, or automated risk classifications. Always discuss your blood pressure history directly with your licensed physician."
                : "يعرض هذا السجل ومنحنى الاتجاه قراءات ضغط الدم المسجلة لأغراض المتابعة الشخصية فقط. لا يقدم هذا العرض تشخيصاً طبياً أو خططاً علاجية أو تصنيفات مخاطر تلقائية. استشر طبيبك المرخص دائماً لمناقشة سجلك الصحي واتخاذ القرارات الطبية."}
            </span>
          </div>
        </div>

        <!-- Trend Chart Section -->
        <div class="bp-chart-card-wrapper" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <h3 style="font-size: 15px; font-weight: 600; margin: 0; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>📈</span> ${isEn ? "Longitudinal Trend Visualization" : "منحنى التغيرات والمسار الزمني"}
            </h3>
            <span style="font-size: 11px; color: var(--muted); background: var(--surface-2); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--line);">
              ${isEn ? "Unit: mmHg" : "الوحدة: مم زئبق"}
            </span>
          </div>

          <!-- Dynamic SVG Chart (Gated strictly on >= 2 persisted measurements) -->
          <div id="patientBpChartContainer">
            ${renderBpTrendChartSvg(filtered, isEn)}
          </div>
        </div>

        <!-- Interactive Filters Toolbar -->
        <div class="bp-filters-bar" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <!-- Period Filters -->
          <div class="bp-filter-group" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 11.5px; color: var(--muted); font-weight: 600;">${isEn ? "Period:" : "الفترة:"}</span>
            <button type="button" class="bp-filter-pill ${currentPeriod === 'all' ? 'active' : ''}" data-filter-type="period" data-filter-val="all" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentPeriod === 'all' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentPeriod === 'all' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentPeriod === 'all' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "All Periods" : "كل الفترات"}
            </button>
            <button type="button" class="bp-filter-pill ${currentPeriod === 'morning' ? 'active' : ''}" data-filter-type="period" data-filter-val="morning" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentPeriod === 'morning' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentPeriod === 'morning' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentPeriod === 'morning' ? '600' : 'normal'}; cursor: pointer;">
              🌅 ${isEn ? "Morning" : "صباحاً"}
            </button>
            <button type="button" class="bp-filter-pill ${currentPeriod === 'evening' ? 'active' : ''}" data-filter-type="period" data-filter-val="evening" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentPeriod === 'evening' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentPeriod === 'evening' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentPeriod === 'evening' ? '600' : 'normal'}; cursor: pointer;">
              🌆 ${isEn ? "Evening" : "مساءً"}
            </button>
          </div>

          <!-- Date Range Filters -->
          <div class="bp-filter-group" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 11.5px; color: var(--muted); font-weight: 600;">${isEn ? "Range:" : "المدى:"}</span>
            <button type="button" class="bp-filter-pill ${currentRange === '7d' ? 'active' : ''}" data-filter-type="range" data-filter-val="7d" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentRange === '7d' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentRange === '7d' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentRange === '7d' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "7 Days" : "٧ أيام"}
            </button>
            <button type="button" class="bp-filter-pill ${currentRange === '30d' ? 'active' : ''}" data-filter-type="range" data-filter-val="30d" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentRange === '30d' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentRange === '30d' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentRange === '30d' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "30 Days" : "٣٠ يوماً"}
            </button>
            <button type="button" class="bp-filter-pill ${currentRange === 'all' ? 'active' : ''}" data-filter-type="range" data-filter-val="all" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentRange === 'all' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentRange === 'all' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentRange === 'all' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "All" : "الكل"}
            </button>
          </div>
        </div>

        <!-- Chronological Timeline Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 15px; font-weight: 600; margin: 0; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span>📋</span> ${isEn ? "Chronological Measurement Timeline" : "السجل الزمني للقياسات"}
          </h3>
          <span style="font-size: 12px; color: var(--muted);">
            ${isEn ? `${filtered.length} entries` : `${filtered.length} سجل`}
          </span>
        </div>

        <!-- Timeline Feed -->
        <div id="patientBpTimelineContainer">
          ${renderBpTimeline(filtered, isEn, { order: "newest_first" })}
        </div>
      </div>
    `;

    if (container) {
      container.innerHTML = html;
      attachBpViewInteractions(container, {
        readings: persistedReadings,
        isEn,
        filterPeriod: currentPeriod,
        filterSource: currentSource,
        filterRange: currentRange
      });
    }

    return html;
  }

  /**
   * Attaches interactive click listeners for filter pills and action buttons.
   */
  function attachBpViewInteractions(container, state = {}) {
    if (!container || typeof container.querySelectorAll !== "function") return;

    // Filter pills
    const pills = container.querySelectorAll(".bp-filter-pill");
    pills.forEach(pill => {
      pill.onclick = () => {
        const fType = pill.getAttribute("data-filter-type");
        const fVal = pill.getAttribute("data-filter-val");
        const nextState = { ...state };
        if (fType === "period") nextState.filterPeriod = fVal;
        if (fType === "range") nextState.filterRange = fVal;
        renderPatientBpTrendView(container, nextState);
      };
    });

    // Refresh button
    const refreshBtn = container.querySelector("#btnRefreshBpReadings");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        if (typeof global.loadPatientBpDashboard === "function") {
          global.loadPatientBpDashboard();
        } else if (typeof global.showToast === "function") {
          global.showToast(state.isEn ? "Refreshing measurements..." : "جاري تحديث القياسات...");
        }
      };
    }

    // Log measurement button
    const logBtn = container.querySelector("#btnOpenLogBpModal");
    if (logBtn) {
      logBtn.onclick = () => {
        if (typeof global.openLogBpModal === "function") {
          global.openLogBpModal();
        }
      };
    }
  }

  // =============================================================================
  // 6. PATIENT HERO & EXISTING TIMELINE (Preserved Compatibility)
  // =============================================================================

  function renderPatientHero(profile = {}, isEn = false) {
    const rawName = profile.name || profile.displayName || (profile.email ? profile.email.split("@")[0] : (isEn ? "Patient" : "مريض"));
    const firstName = String(rawName).split(" ")[0];
    const titleEl = document.getElementById("patientHeroTitle");
    if (titleEl) {
      titleEl.textContent = isEn ? `Welcome, ${firstName}` : `مرحبًا ${firstName}`;
    }
  }

  function renderTimelineCard(item, isEn = false) {
    const escape = global.HealthVibes?.Validation?.escapeHtml || escapeHtml;
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
      notification: "🔔",
      blood_pressure: "🩸"
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

  // =============================================================================
  // 7. EXPORTS & REGISTRATION
  // =============================================================================

  const PatientUI = {
    BP_SOURCES,
    TIME_PERIODS,
    escapeHtml,
    getTimePeriod,
    formatDateTime,
    formatShortDate,
    getSourceInfo,
    detectMonitoringGaps,
    filterReadings,
    renderBpTrendChartSvg,
    renderBpTimeline,
    renderPatientBpTrendView,
    attachBpViewInteractions,
    renderPatientHero,
    renderTimelineCard
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.PatientUI = PatientUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PatientUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
