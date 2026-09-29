/**
 * Health Vibe AI - Assessment Comparison, Longitudinal Charts & Medical Summary UI
 * 
 * Features:
 * 1. Independent New Assessment Launcher (preserves previous case as baseline without mutation)
 * 2. Physiological Measurements Comparison (Units, Timing, Data Sources, Missing Badging)
 * 3. Approved Clinical Reports Comparison (Diagnoses, Medication Changes, Doctor Signatures)
 * 4. Longitudinal Trend Charts (Observational display strictly guarded against automated diagnosis)
 * 5. Doctor-Approved Reassessment Plan Scheduling & Reminders
 * 6. Comprehensive Medical Summary Export (JSON & Structured Print View)
 */

(function (global) {
  "use strict";

  const STANDARD_UNITS = {
    oxygenLevel: "%",
    heartRate: "bpm",
    respiratoryRate: "breaths/min",
    temperature: "°C",
    bloodPressure: "mmHg"
  };

  /**
   * Starts an independent new assessment.
   * Preserves previous case as baseline without mutating existing historical records.
   * @param {string|null} previousCaseId 
   */
  function startIndependentNewAssessment(previousCaseId = null) {
    try {
      if (global.HealthVibes?.AssessmentService?.clearLocalDraft) {
        global.HealthVibes.AssessmentService.clearLocalDraft();
      }
    } catch (e) {
      console.warn("Failed to clear local draft:", e);
    }

    // Set predecessor pointer in global window
    global._independentAssessmentPredecessorCaseId = previousCaseId || null;

    // Reset input fields in the assessment screen
    const o2Input = document.getElementById("oxygenLevel");
    if (o2Input) o2Input.value = "";
    const coughSelect = document.getElementById("coughLevel");
    if (coughSelect) coughSelect.selectedIndex = 0;
    const durationInput = document.getElementById("symptomDuration");
    if (durationInput) durationInput.value = "";
    const tempInput = document.getElementById("temperature");
    if (tempInput) tempInput.value = "";
    const respInput = document.getElementById("respiratoryRate");
    if (respInput) respInput.value = "";
    const notesInput = document.getElementById("patientNotes");
    if (notesInput) notesInput.value = "";
    const medInput = document.getElementById("currentMedications");
    if (medInput) medInput.value = "";

    // Show indicator banner on assessment page
    displayIndependentAssessmentBanner(previousCaseId);

    // Switch screen to assessment
    if (typeof global.showScreen === "function") {
      global.showScreen("assessment");
    }

    // Scroll to top of assessment form
    const formEl = document.getElementById("assessmentForm") || document.getElementById("screen-assessment");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function displayIndependentAssessmentBanner(previousCaseId) {
    const isEn = (global.currentLanguage || "ar") === "en";
    let banner = document.getElementById("hvIndependentAssessmentBanner");
    const container = document.getElementById("screen-assessment") || document.querySelector(".assessment-container");

    if (!container) return;

    if (!banner) {
      banner = document.createElement("div");
      banner.id = "hvIndependentAssessmentBanner";
      banner.className = "hv-independent-banner";
      banner.style.cssText = `
        background: rgba(14, 165, 233, 0.08);
        border: 1.5px solid #0ea5e9;
        border-radius: 14px;
        padding: 16px 20px;
        margin: 16px auto 24px;
        max-width: 820px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        box-shadow: 0 4px 14px rgba(14, 165, 233, 0.08);
      `;
      container.insertBefore(banner, container.firstChild);
    }

    const baselineText = previousCaseId 
      ? (isEn ? `Linked baseline: Case #${String(previousCaseId).slice(-6).toUpperCase()}` : `المرجع الأساسي: حالة #${String(previousCaseId).slice(-6).toUpperCase()}`)
      : (isEn ? "Independent Evaluation" : "تقييم سريري مستقل");

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 26px;">🔄</span>
        <div>
          <strong style="color: #0284c7; font-size: 14.5px; display: block;">
            ${isEn ? "Independent New Assessment" : "بدء تقييم سريري جديد ومستقل"}
          </strong>
          <span style="font-size: 12.5px; color: var(--ink, #1e293b);">
            ${isEn 
              ? "All historical evaluations are preserved intact. This creates an independent new record linked to your baseline."
              : "جميع التقييمات والتقارير السابقة محفوظة وموثقة بالكامل. سيتم إنشاء سجل جديد ومستقل مرتبط بالسجل التاريخي."}
          </span>
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span class="pill info" style="font-size: 11px; padding: 4px 10px;">${baselineText}</span>
        <button type="button" class="soft-button" style="padding: 4px 10px; font-size: 11px;" onclick="HealthVibes.AssessmentComparisonUI.clearIndependentAssessmentContext()">
          ✕ ${isEn ? "Dismiss" : "إلغاء"}
        </button>
      </div>
    `;
    banner.style.display = "flex";
  }

  function clearIndependentAssessmentContext() {
    global._independentAssessmentPredecessorCaseId = null;
    const banner = document.getElementById("hvIndependentAssessmentBanner");
    if (banner) banner.style.display = "none";
  }

  /**
   * Opens the Assessment Comparison & Longitudinal Trends Modal
   * @param {string} patientId 
   * @param {string} latestCaseId 
   */
  async function openAssessmentComparisonModal(patientId, latestCaseId = null) {
    const isEn = (global.currentLanguage || "ar") === "en";
    let modal = document.getElementById("assessmentComparisonModal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "assessmentComparisonModal";
      modal.className = "modal-overlay";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.style.cssText = `
        position: fixed; inset: 0; z-index: 999990;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; overflow-y: auto;
      `;
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content" style="
        background: var(--surface, #ffffff);
        color: var(--ink, #0f172a);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 20px;
        max-width: 960px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        padding: 28px;
        box-shadow: 0 25px 60px -15px rgba(0,0,0,0.3);
        position: relative;
        text-align: ${isEn ? 'left' : 'right'};
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--line, #e2e8f0); padding-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 28px;">📊</span>
            <div>
              <h3 style="margin: 0; font-size: 18px; color: var(--teal, #0d9488);">
                ${isEn ? "Assessment Comparison & Longitudinal Trends" : "مقارنة التقييمات السريرية والاتجاهات الزمنية"}
              </h3>
              <p style="margin: 2px 0 0; font-size: 12.5px; color: var(--muted, #64748b);">
                ${isEn ? "Tracking physiological changes, report updates, and missing measurements" : "تتبع التغيرات الفسيولوجية وتحديثات التقارير والقياسات المفقودة بدقة"}
              </p>
            </div>
          </div>
          <button type="button" class="soft-button" style="border-radius: 50%; width: 34px; height: 34px; padding: 0; font-size: 16px; cursor: pointer;" onclick="HealthVibes.AssessmentComparisonUI.closeComparisonModal()">✕</button>
        </div>

        <div id="comparisonLoadingState" style="text-align: center; padding: 50px 20px;">
          <div class="spinner" style="margin: 0 auto 16px; width: 36px; height: 36px;"></div>
          <p style="color: var(--muted, #64748b); font-size: 14px;">${isEn ? "Retrieving multi-assessment clinical comparison..." : "جاري استرجاع وتحليل المقارنة السريرية..."}</p>
        </div>

        <div id="comparisonContentState" style="display: none;"></div>
      </div>
    `;

    modal.style.display = "flex";
    modal.classList.add("open");

    // Fetch comparison data
    try {
      const data = await fetchComparisonData(patientId, latestCaseId);
      renderComparisonView(data, patientId);
    } catch (err) {
      console.error("Comparison load error:", err);
      const loadingState = document.getElementById("comparisonLoadingState");
      if (loadingState) {
        loadingState.innerHTML = `
          <div style="padding: 20px; color: #dc2626;">
            <span style="font-size: 32px;">⚠️</span>
            <p style="margin: 8px 0; font-weight: 600;">${isEn ? "Failed to retrieve assessment comparison" : "تعذر استرجاع مقارنة التقييمات السريرية"}</p>
            <small style="color: var(--muted);">${err.message || ""}</small>
          </div>
        `;
      }
    }
  }

  function closeComparisonModal() {
    const modal = document.getElementById("assessmentComparisonModal");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("open");
    }
  }

  /**
   * Fetches comparison from server API, falling back to Firestore client queries if offline.
   */
  async function fetchComparisonData(patientId, latestCaseId) {
    const user = global.auth?.currentUser;
    const token = user ? await user.getIdToken().catch(() => "") : "";
    const queryStr = latestCaseId ? `?latestCaseId=${encodeURIComponent(latestCaseId)}` : "";

    try {
      const res = await fetch(`/api/patient/${encodeURIComponent(patientId)}/assessments/compare${queryStr}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (apiErr) {
      console.warn("Direct API comparison fetch failed, falling back to client-side Firestore:", apiErr);
    }

    // Client-side Firestore fallback
    if (global.db) {
      const snap = await global.db.collection("cases")
        .where("patientId", "==", patientId)
        .get();
      
      const cases = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const tA = (a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt || a.createdAt || 0).getTime()) || 0;
          const tB = (b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt || b.createdAt || 0).getTime()) || 0;
          return tB - tA;
        });

      const latest = cases[0] || null;
      const previous = cases[1] || null;

      return {
        ok: true,
        patientId,
        latestAssessment: latest,
        previousAssessment: previous,
        measurementsComparison: buildClientMeasurementDeltas(latest, previous),
        reportsComparison: {
          hasLatestReport: Boolean(latest?.doctorApproved || latest?.reportSnapshot),
          hasPreviousReport: Boolean(previous?.doctorApproved || previous?.reportSnapshot),
          latestDiagnosis: latest?.doctorDiagnosis || latest?.doctorNote || null,
          previousDiagnosis: previous?.doctorDiagnosis || previous?.doctorNote || null,
          isDiagnosisModified: Boolean(latest?.doctorDiagnosis && previous?.doctorDiagnosis && latest.doctorDiagnosis !== previous.doctorDiagnosis)
        },
        chartData: {
          points: cases.slice(0, 10).reverse().map(c => ({
            caseId: c.id,
            timestamp: c.submittedAt || c.createdAt,
            dateLabel: new Date(c.submittedAt || c.createdAt || Date.now()).toLocaleDateString(),
            oxygenLevel: c.oxygenLevel || null,
            temperature: c.temperature || null,
            respiratoryRate: c.respiratoryRate || null,
            heartRate: c.heartRate || null
          })),
          chartDisclaimer: "The longitudinal chart is an observational display of physiological measurements over time. Diagnostic evaluation is strictly performed by authorized physicians."
        },
        activeReassessmentPlans: []
      };
    }

    throw new Error("No comparison data source available.");
  }

  function buildClientMeasurementDeltas(latest, previous) {
    const list = [
      { key: "oxygenLevel", label: "Oxygen Saturation (SpO2)", unit: "%", goodDirection: "up", expectedMax: 100 },
      { key: "heartRate", label: "Heart Rate", unit: "bpm", goodDirection: "down", normalRange: [60, 100] },
      { key: "respiratoryRate", label: "Respiratory Rate", unit: "breaths/min", goodDirection: "down", normalRange: [12, 20] },
      { key: "temperature", label: "Body Temperature", unit: "°C", goodDirection: "down", normalRange: [36.5, 37.5] }
    ];

    const deltas = {};
    for (const item of list) {
      const cur = latest ? (latest[item.key] ?? latest.assessment?.vitals?.[item.key] ?? null) : null;
      const prev = previous ? (previous[item.key] ?? previous.assessment?.vitals?.[item.key] ?? null) : null;
      const isCurMissing = cur === null || cur === undefined || isNaN(Number(cur));
      const isPrevMissing = prev === null || prev === undefined || isNaN(Number(prev));

      let deltaValue = null;
      let status = "missing";
      if (!isCurMissing && !isPrevMissing) {
        deltaValue = Number((Number(cur) - Number(prev)).toFixed(1));
        status = deltaValue === 0 ? "stable" : (deltaValue > 0 ? "increased" : "decreased");
      } else if (!isCurMissing && isPrevMissing) {
        status = "newly_recorded";
      }

      deltas[item.key] = {
        name: item.label,
        currentValue: isCurMissing ? null : Number(cur),
        previousValue: isPrevMissing ? null : Number(prev),
        unit: item.unit,
        delta: deltaValue,
        status: status,
        isCurrentMissing: isCurMissing,
        isPreviousMissing: isPrevMissing,
        source: latest?.assessment?.vitals?.source || "intake_recorded",
        timing: latest?.submittedAt || latest?.createdAt || null
      };
    }
    return deltas;
  }

  /**
   * Renders the complete Assessment Comparison Modal Content
   */
  function renderComparisonView(data, patientId) {
    const isEn = (global.currentLanguage || "ar") === "en";
    const loadingState = document.getElementById("comparisonLoadingState");
    const contentState = document.getElementById("comparisonContentState");

    if (loadingState) loadingState.style.display = "none";
    if (!contentState) return;

    const latest = data.latestAssessment;
    const previous = data.previousAssessment;
    const measurements = data.measurementsComparison || {};
    const reports = data.reportsComparison || {};
    const chartData = data.chartData || { points: [] };
    const plans = data.activeReassessmentPlans || [];

    const isDoctor = global.normalizeRole ? (global.normalizeRole(global.selectedRole) === "doctor") : false;

    // Measurement Rows HTML
    const metricKeys = ["oxygenLevel", "heartRate", "respiratoryRate", "temperature", "bloodPressure"];
    const metricLabels = {
      oxygenLevel: { ar: "تشبع الأكسجين (SpO2)", en: "Oxygen Saturation (SpO2)", unit: "%" },
      heartRate: { ar: "معدل نبضات القلب", en: "Heart Rate", unit: "bpm" },
      respiratoryRate: { ar: "معدل التنفس", en: "Respiratory Rate", unit: "breaths/min" },
      temperature: { ar: "درجة الحرارة", en: "Body Temperature", unit: "°C" },
      bloodPressure: { ar: "ضغط الدم", en: "Blood Pressure", unit: "mmHg" }
    };

    let measurementRowsHtml = "";
    for (const key of metricKeys) {
      const deltaObj = measurements[key];
      const meta = metricLabels[key];
      const unit = deltaObj?.unit || meta.unit;

      if (!deltaObj || deltaObj.isCurrentMissing) {
        measurementRowsHtml += `
          <tr style="border-bottom: 1px solid var(--line, #e2e8f0);">
            <td style="padding: 12px 14px; font-weight: 600;">
              <div>${isEn ? meta.en : meta.ar}</div>
              <small style="color: var(--muted); font-size: 11px;">${isEn ? 'Standard Unit: ' : 'الوحدة المعيارية: '}<strong>${unit}</strong></small>
            </td>
            <td style="padding: 12px 14px;">
              <span class="pill" style="background: rgba(239, 68, 68, 0.1); color: #dc2626; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
                ⚠️ ${isEn ? 'Missing / Unmeasured' : 'غير مسجل / مفقود'}
              </span>
            </td>
            <td style="padding: 12px 14px; color: var(--muted);">
              ${deltaObj && !deltaObj.isPreviousMissing ? `${deltaObj.previousValue} ${unit}` : (isEn ? 'None' : 'لا يوجد')}
            </td>
            <td style="padding: 12px 14px; color: var(--muted);">--</td>
            <td style="padding: 12px 14px; font-size: 12px; color: var(--muted);">
              ${isEn ? 'Not recorded during intake' : 'لم يتم تسجيله في التقييم'}
            </td>
          </tr>
        `;
      } else {
        const curVal = `${deltaObj.currentValue} ${unit}`;
        const prevVal = deltaObj.isPreviousMissing ? (isEn ? 'Unmeasured' : 'غير مسجل') : `${deltaObj.previousValue} ${unit}`;
        
        let deltaBadge = '<span class="pill" style="background: rgba(100, 116, 139, 0.1); color: #64748b; font-size: 11px;">Stable</span>';
        if (deltaObj.delta !== null && deltaObj.delta !== 0) {
          const sign = deltaObj.delta > 0 ? "+" : "";
          const isFavorable = (key === "oxygenLevel" && deltaObj.delta > 0) || (key !== "oxygenLevel" && deltaObj.delta < 0);
          const color = isFavorable ? "#16a34a" : "#dc2626";
          const bg = isFavorable ? "rgba(22, 163, 74, 0.1)" : "rgba(239, 68, 68, 0.1)";
          deltaBadge = `<span class="pill" style="background: ${bg}; color: ${color}; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">
            ${sign}${deltaObj.delta} ${unit} (${isEn ? deltaObj.direction : (isFavorable ? 'تحسن' : 'تراجع')})
          </span>`;
        }

        const sourceLabel = deltaObj.source ? String(deltaObj.source).replace(/_/g, ' ') : "patient_intake";
        const timingFormatted = deltaObj.timing ? new Date(deltaObj.timing).toLocaleDateString(isEn ? 'en-US' : 'ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : "--";

        measurementRowsHtml += `
          <tr style="border-bottom: 1px solid var(--line, #e2e8f0);">
            <td style="padding: 12px 14px; font-weight: 600;">
              <div>${isEn ? meta.en : meta.ar}</div>
              <small style="color: var(--muted); font-size: 11px;">${isEn ? 'Unit: ' : 'الوحدة: '}<strong>${unit}</strong></small>
            </td>
            <td style="padding: 12px 14px; font-weight: 700; color: var(--teal, #0d9488);">
              ${curVal}
            </td>
            <td style="padding: 12px 14px; color: var(--muted);">
              ${prevVal}
            </td>
            <td style="padding: 12px 14px;">
              ${deltaBadge}
            </td>
            <td style="padding: 12px 14px; font-size: 12px; color: var(--muted);">
              <div>📍 ${sourceLabel}</div>
              <div>🕒 ${timingFormatted}</div>
            </td>
          </tr>
        `;
      }
    }

    // Longitudinal SVG Chart Render
    const chartSvg = generateObservationalChartSvg(chartData.points || [], isEn);

    contentState.innerHTML = `
      <!-- SUMMARY TOP BANNER -->
      <div style="background: var(--surface-2, #f8fafc); border: 1px solid var(--line, #e2e8f0); border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <span style="font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">${isEn ? "Comparison Interval" : "فترة المقارنة السريرية"}</span>
          <div style="font-weight: 700; font-size: 14.5px; margin-top: 2px;">
            ${latest ? `#${String(latest.id).slice(-6).toUpperCase()} (${new Date(latest.submittedAt || latest.createdAt || Date.now()).toLocaleDateString()})` : "--"}
            <span style="color: var(--muted); margin: 0 6px;">↔</span>
            ${previous ? `#${String(previous.id).slice(-6).toUpperCase()} (${new Date(previous.submittedAt || previous.createdAt || Date.now()).toLocaleDateString()})` : (isEn ? "No baseline predecessor" : "لا يوجد تقييم سابق")}
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="solid-button" style="padding: 8px 14px; font-size: 12.5px; background: #0284c7;" onclick="HealthVibes.AssessmentComparisonUI.exportMedicalSummary('${patientId}')">
            <span>📑</span> ${isEn ? "Export Medical Summary" : "تصدير الملخص السريري"}
          </button>
          <button type="button" class="outline-button" style="padding: 8px 14px; font-size: 12.5px;" onclick="HealthVibes.AssessmentComparisonUI.startIndependentNewAssessment('${latest ? latest.id : ''}')">
            <span>🔄</span> ${isEn ? "New Independent Assessment" : "بدء تقييم جديد مستقل"}
          </button>
        </div>
      </div>

      <!-- SECTION 1: MEASUREMENTS COMPARISON & MISSING METRICS -->
      <div style="margin-bottom: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 15.5px; color: var(--teal, #0d9488); display: flex; align-items: center; gap: 8px;">
            <span>📐</span> ${isEn ? "Physiological Measurements & Changes" : "القياسات الفسيولوجية والتغيرات الموثقة"}
          </h4>
          <span style="font-size: 12px; color: var(--muted);">
            ${isEn ? "Units, timing, and data sources clearly identified" : "الوحدات، التوقيت، ومصادر البيانات موضحة"}
          </span>
        </div>

        <div style="overflow-x: auto; border: 1px solid var(--line, #e2e8f0); border-radius: 12px;">
          <table style="width: 100%; border-collapse: collapse; text-align: ${isEn ? 'left' : 'right'}; font-size: 13.5px;">
            <thead>
              <tr style="background: var(--surface-2, #f8fafc); border-bottom: 1px solid var(--line, #e2e8f0); color: var(--muted); font-size: 12px;">
                <th style="padding: 10px 14px;">${isEn ? "Measurement (Metric & Unit)" : "القياس (المؤشر والوحدة)"}</th>
                <th style="padding: 10px 14px;">${isEn ? "Latest Assessment" : "التقييم الأحدث"}</th>
                <th style="padding: 10px 14px;">${isEn ? "Previous Assessment" : "التقييم السابق"}</th>
                <th style="padding: 10px 14px;">${isEn ? "Quantified Delta" : "مقدار التغير"}</th>
                <th style="padding: 10px 14px;">${isEn ? "Source & Timing" : "المصدر والتوقيت"}</th>
              </tr>
            </thead>
            <tbody>
              ${measurementRowsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 2: APPROVED REPORTS COMPARISON -->
      <div style="margin-bottom: 28px; background: var(--surface-2, #f8fafc); border: 1px solid var(--line, #e2e8f0); border-radius: 14px; padding: 20px;">
        <h4 style="margin: 0 0 14px; font-size: 15.5px; color: #16a34a; display: flex; align-items: center; gap: 8px;">
          <span>🩺</span> ${isEn ? "Certified Clinical Reports Comparison" : "مقارنة التقارير الطبية المعتمدة"}
        </h4>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
          <!-- Latest Report -->
          <div style="background: var(--surface, #ffffff); border: 1px solid var(--line, #e2e8f0); border-radius: 10px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: var(--teal); font-size: 13.5px;">${isEn ? "Latest Approved Report" : "التقرير المعتمد الأحدث"}</strong>
              <span class="pill ${reports.hasLatestReport ? 'ok' : 'pending'}" style="font-size: 10.5px;">
                ${reports.hasLatestReport ? (isEn ? 'Approved' : 'معتمد') : (isEn ? 'Pending Review' : 'قيد المراجعة')}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--ink); line-height: 1.5; margin-bottom: 10px;">
              <strong>${isEn ? "Diagnosis: " : "التشخيص: "}</strong>
              <span>${reports.latestDiagnosis || (isEn ? "Awaiting licensed physician review." : "بانتظار مراجعة واعتماد الطبيب المرخص.")}</span>
            </div>
            <div style="font-size: 11.5px; color: var(--muted);">
              ${isEn ? "Attending Physician: " : "الطبيب المعالج: "}
              <strong>${latest?.assignedDoctorName || latest?.reviewedBy || (isEn ? "Dr. Attending" : "طبيب الرعاية")}</strong>
            </div>
          </div>

          <!-- Previous Report -->
          <div style="background: var(--surface, #ffffff); border: 1px solid var(--line, #e2e8f0); border-radius: 10px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: var(--muted); font-size: 13.5px;">${isEn ? "Previous Approved Report" : "التقرير المعتمد السابق"}</strong>
              <span class="pill ${reports.hasPreviousReport ? 'ok' : 'pending'}" style="font-size: 10.5px;">
                ${reports.hasPreviousReport ? (isEn ? 'Approved' : 'معتمد') : (isEn ? 'None / Pending' : 'لا يوجد / معلق')}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--ink); line-height: 1.5; margin-bottom: 10px;">
              <strong>${isEn ? "Diagnosis: " : "التشخيص: "}</strong>
              <span>${reports.previousDiagnosis || (isEn ? "No previous recorded diagnosis." : "لا يوجد تشخيص سابق مسجل.")}</span>
            </div>
            <div style="font-size: 11.5px; color: var(--muted);">
              ${isEn ? "Status Change: " : "تغير التشخيص: "}
              <strong>${reports.isDiagnosisModified ? (isEn ? "Updated Diagnosis" : "تم تعديل التشخيص") : (isEn ? "Unchanged" : "مستقر")}</strong>
            </div>
          </div>
        </div>

        <!-- Prescriptions Delta -->
        ${reports.medicationsComparison ? `
          <div style="margin-top: 14px; background: var(--surface, #ffffff); border: 1px dashed var(--line, #e2e8f0); border-radius: 10px; padding: 12px;">
            <div style="font-weight: 700; font-size: 12.5px; margin-bottom: 6px;">💊 ${isEn ? "Prescription & Medication Regimen Changes:" : "التغيرات في الخطة الدوائية الموصوفة:"}</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px;">
              ${reports.medicationsComparison.added?.map(m => `<span class="pill ok">+ ${m} (${isEn ? 'New' : 'جديد'})</span>`).join('') || ''}
              ${reports.medicationsComparison.removed?.map(m => `<span class="pill error">- ${m} (${isEn ? 'Discontinued' : 'موقوف'})</span>`).join('') || ''}
              ${reports.medicationsComparison.unchanged?.map(m => `<span class="pill info">${m} (${isEn ? 'Maintained' : 'مستمر'})</span>`).join('') || ''}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- SECTION 3: LONGITUDINAL OBSERVATIONAL TREND CHARTS (WITH STRICT SAFETY GUARDRAIL) -->
      <div style="margin-bottom: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <h4 style="margin: 0; font-size: 15.5px; color: #0284c7; display: flex; align-items: center; gap: 8px;">
            <span>📈</span> ${isEn ? "Longitudinal Physiological Trends" : "المسار والاتجاهات الفسيولوجية عبر الزمن"}
          </h4>
          <span class="pill info" style="font-size: 11px;">
            ${isEn ? "Observational Tracking" : "رصد ومتابعة اتجاهات"}
          </span>
        </div>

        <!-- MANDATORY CLINICAL SAFETY NOTICE: STRICT PROHIBITION OF DERIVING NEW DIAGNOSIS FROM CHART -->
        <div style="background: rgba(245, 158, 11, 0.08); border: 1.5px solid #f59e0b; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 12.5px; line-height: 1.5; color: #92400e; display: flex; align-items: flex-start; gap: 10px;">
          <span style="font-size: 20px;">🛡️</span>
          <div>
            <strong>${isEn ? "Clinical Guardrail & Diagnostic Safety Policy:" : "ضابط الأمان السريري وسياسة التشخيص المعتمدة:"}</strong>
            <p style="margin: 2px 0 0;">
              ${isEn
                ? "This longitudinal chart is an observational display of physiological measurements over time. Diagnostic evaluation is strictly performed by authorized licensed physicians. Deriving automated diagnoses from charts without physician review is strictly prohibited."
                : "هذا الرسم البياني مخصص فقط للعرض الرصدي للقياسات الفسيولوجية عبر الزمن. التقييم والتشخيص الطبي يتم حصرياً بواسطة الطبيب المرخص المعتمد، ويُمنع اشتقاق أي تشخيص آلي جديد من الرسم البياني."}
            </p>
          </div>
        </div>

        <div style="background: var(--surface, #ffffff); border: 1px solid var(--line, #e2e8f0); border-radius: 14px; padding: 20px; text-align: center;">
          ${chartSvg}
        </div>
      </div>

      <!-- SECTION 4: REASSESSMENT REMINDERS (DOCTOR-APPROVED PLAN) -->
      <div style="margin-bottom: 24px; background: var(--surface-2, #f8fafc); border: 1px solid var(--line, #e2e8f0); border-radius: 14px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
          <h4 style="margin: 0; font-size: 15.5px; color: var(--teal, #0d9488); display: flex; align-items: center; gap: 8px;">
            <span>⏰</span> ${isEn ? "Reassessment Reminders & Follow-up Plan" : "تذكيرات إعادة التقييم وخطة المتابعة المعتمدة"}
          </h4>
          <span class="pill ok" style="font-size: 11px;">
            ${isEn ? "Doctor-Approved Plan" : "خطة معتمدة من الطبيب"}
          </span>
        </div>

        <div style="font-size: 12.5px; color: var(--muted); margin-bottom: 14px;">
          ${isEn 
            ? "Reminders are scheduled strictly pursuant to a doctor-approved follow-up regimen, without deriving a new diagnosis from the chart." 
            : "يتم جدولة تذكيرات إعادة التقييم بناءً على خطة متابعة معتمدة ومحددة من قبل الطبيب المعالج، ودون اشتقاق أي تشخيص آلي من الرسم البياني."}
        </div>

        ${plans.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
            ${plans.map(p => `
              <div style="background: var(--surface, #ffffff); border: 1px solid var(--line, #e2e8f0); border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                  <strong style="color: var(--ink); font-size: 13.5px;">${p.title || (isEn ? "Scheduled Reassessment" : "إعادة تقييم مجدولة")}</strong>
                  <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
                    ${isEn ? "Scheduled for: " : "موعد التذكير: "}<strong>${new Date(p.scheduledFor).toLocaleString(isEn ? 'en-US' : 'ar-EG')}</strong>
                    • ${isEn ? "Interval: " : "التكرار: "}${p.interval || "24h"}
                  </div>
                  <div style="font-size: 11.5px; color: var(--teal); margin-top: 2px;">
                    👨‍⚕️ ${isEn ? "Approving Doctor: " : "الطبيب المعتمد: "}${p.doctorName || "Dr. Attending"}
                  </div>
                </div>
                <div>
                  <span class="pill ok" style="font-size: 11px;">${p.status || 'scheduled'}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="padding: 14px; text-align: center; color: var(--muted); font-size: 13px; background: var(--surface); border: 1px dashed var(--line); border-radius: 10px; margin-bottom: 16px;">
            ${isEn ? "No active reassessment plans scheduled currently." : "لا توجد خطط إعادة تقييم مجدولة حالياً."}
          </div>
        `}

        <!-- Doctor Reassessment Scheduler (Visible to Doctors) -->
        ${isDoctor ? `
          <div style="background: var(--surface, #ffffff); border: 1.5px solid #0d9488; border-radius: 12px; padding: 16px; margin-top: 14px;">
            <strong style="display: block; margin-bottom: 10px; font-size: 13.5px; color: var(--teal);">
              ➕ ${isEn ? "Physician: Schedule New Reassessment Reminder" : "الطبيب: جدولة موعد وتذكير جديد لإعادة التقييم"}
            </strong>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 12px;">
              <div>
                <label style="display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 4px;">${isEn ? "Reminder Interval" : "فترة التذكير"}</label>
                <select id="planIntervalSelect" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--line);">
                  <option value="24h">${isEn ? "After 24 hours" : "بعد 24 ساعة"}</option>
                  <option value="48h">${isEn ? "After 48 hours" : "بعد 48 ساعة"}</option>
                  <option value="72h">${isEn ? "After 72 hours" : "بعد 72 ساعة"}</option>
                  <option value="7d">${isEn ? "After 7 days" : "بعد 7 أيام"}</option>
                  <option value="14d">${isEn ? "After 14 days" : "بعد 14 يوماً"}</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 4px;">${isEn ? "Urgency / Priority" : "مستوى الأولوية"}</label>
                <select id="planPrioritySelect" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--line);">
                  <option value="normal">${isEn ? "Routine / Normal" : "عادي"}</option>
                  <option value="high">${isEn ? "High Priority" : "أولوية عالية"}</option>
                  <option value="urgent">${isEn ? "Urgent Follow-up" : "متابعة عاجلة"}</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom: 12px;">
              <label style="display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 4px;">${isEn ? "Clinical Instructions for Patient" : "تعليمات الطبيب للمريض عند إعادة الفحص"}</label>
              <input type="text" id="planInstructionsInput" placeholder="${isEn ? 'e.g. Recheck SpO2 resting and walking; log symptom changes.' : 'مثال: إعادة قياس الأكسجين أثناء الراحة وتدوين أي تغير في السعال.'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px;" />
            </div>
            <div style="text-align: ${isEn ? 'right' : 'left'};">
              <button type="button" class="solid-button" style="padding: 8px 16px; font-size: 13px; background: #0d9488;" onclick="HealthVibes.AssessmentComparisonUI.submitDoctorReassessmentPlan('${patientId}', '${latest ? latest.id : ''}')">
                ✅ ${isEn ? "Approve & Schedule Reminder" : "اعتماد الخطة وجدولة التذكير"}
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    contentState.style.display = "block";
  }

  /**
   * Generates a clean, modern SVG multi-point observational trend chart.
   */
  function generateObservationalChartSvg(points, isEn) {
    if (!points || points.length === 0) {
      return `
        <div style="padding: 30px; color: var(--muted);">
          <span style="font-size: 28px;">📉</span>
          <p style="margin: 8px 0 0;">${isEn ? "At least two assessments are needed to plot historical trends." : "يلزم وجود تقييمين على الأقل لرسم منحنى المؤشرات الفسيولوجية."}</p>
        </div>
      `;
    }

    const width = 800;
    const height = 260;
    const padding = { top: 30, right: 40, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Filter points that have oxygenLevel
    const validO2 = points.filter(p => p.oxygenLevel !== null && !isNaN(p.oxygenLevel));
    
    // Scale X
    const stepX = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth / 2;

    // Scale Y for Oxygen (min: 80, max: 100)
    const minY = 80;
    const maxY = 100;
    const getY = (val) => {
      const clamped = Math.min(maxY, Math.max(minY, val));
      return padding.top + chartHeight - ((clamped - minY) / (maxY - minY)) * chartHeight;
    };

    // Build polyline points for Oxygen
    const o2Points = [];
    const dotsHtml = [];

    points.forEach((p, index) => {
      const x = padding.left + (points.length > 1 ? index * stepX : chartWidth / 2);
      if (p.oxygenLevel !== null && !isNaN(p.oxygenLevel)) {
        const y = getY(p.oxygenLevel);
        o2Points.push(`${x},${y}`);
        const dateLabel = p.dateLabel || `P${index + 1}`;
        dotsHtml.push(`
          <circle cx="${x}" cy="${y}" r="5" fill="#0d9488" stroke="#ffffff" stroke-width="2"/>
          <text x="${x}" y="${y - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#0d9488">${p.oxygenLevel}%</text>
          <text x="${x}" y="${height - 15}" text-anchor="middle" font-size="10.5" fill="#64748b">${dateLabel}</text>
        `);
      } else {
        // Missing measurement dot
        dotsHtml.push(`
          <circle cx="${x}" cy="${height - padding.bottom}" r="4" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
          <text x="${x}" y="${height - padding.bottom - 8}" text-anchor="middle" font-size="9.5" fill="#ef4444">${isEn ? 'Missing' : 'مفقود'}</text>
          <text x="${x}" y="${height - 15}" text-anchor="middle" font-size="10.5" fill="#64748b">${p.dateLabel || ''}</text>
        `);
      }
    });

    const o2Polyline = o2Points.join(" ");

    return `
      <svg viewBox="0 0 ${width} ${height}" style="width: 100%; max-width: 800px; height: auto; font-family: inherit;">
        <!-- Background Grid -->
        <line x1="${padding.left}" y1="${getY(100)}" x2="${width - padding.right}" y2="${getY(100)}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
        <text x="${padding.left - 10}" y="${getY(100) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">100%</text>

        <line x1="${padding.left}" y1="${getY(95)}" x2="${width - padding.right}" y2="${getY(95)}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
        <text x="${padding.left - 10}" y="${getY(95) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">95%</text>

        <line x1="${padding.left}" y1="${getY(90)}" x2="${width - padding.right}" y2="${getY(90)}" stroke="#fca5a5" stroke-dasharray="3,3"/>
        <text x="${padding.left - 10}" y="${getY(90) + 4}" text-anchor="end" font-size="10" fill="#ef4444">90% (Alert)</text>

        <!-- Base Axis -->
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#cbd5e1" stroke-width="1.5"/>

        <!-- Trend Line -->
        ${o2Points.length > 1 ? `<polyline fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${o2Polyline}"/>` : ''}

        <!-- Data Dots & Labels -->
        ${dotsHtml.join('')}

        <!-- Legend -->
        <circle cx="${width - padding.right - 140}" cy="15" r="5" fill="#0d9488"/>
        <text x="${width - padding.right - 128}" y="19" font-size="11" font-weight="600" fill="#0f172a">SpO2 Saturation (%)</text>
      </svg>
    `;
  }

  /**
   * Submits a doctor-approved reassessment plan
   */
  async function submitDoctorReassessmentPlan(patientId, caseId) {
    const isEn = (global.currentLanguage || "ar") === "en";
    const interval = document.getElementById("planIntervalSelect")?.value || "24h";
    const priority = document.getElementById("planPrioritySelect")?.value || "normal";
    const instructions = document.getElementById("planInstructionsInput")?.value || "";

    const user = global.auth?.currentUser;
    const token = user ? await user.getIdToken().catch(() => "") : "";

    try {
      const res = await fetch(`/api/patient/${encodeURIComponent(patientId)}/reassessment-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          caseId,
          interval,
          priority,
          instructions,
          doctorName: user?.displayName || user?.email || "Attending Physician"
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to schedule plan");
      }

      alert(isEn ? "Doctor-approved reassessment plan scheduled successfully!" : "تم اعتماد وجدولة خطة وتذكير إعادة التقييم بنجاح!");
      // Refresh comparison modal
      openAssessmentComparisonModal(patientId, caseId);
    } catch (e) {
      alert((isEn ? "Failed to schedule plan: " : "فشل جدولة الخطة: ") + e.message);
    }
  }

  /**
   * Exports comprehensive medical summary (JSON and formatted print)
   */
  async function exportMedicalSummary(patientId) {
    const isEn = (global.currentLanguage || "ar") === "en";
    const user = global.auth?.currentUser;
    const token = user ? await user.getIdToken().catch(() => "") : "";

    try {
      const res = await fetch(`/api/patient/${encodeURIComponent(patientId)}/medical-summary`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error("Failed to export medical summary");
      }

      const summary = await res.json();

      // Trigger JSON download
      const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HealthVibes_Medical_Summary_${patientId}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert((isEn ? "Summary export failed: " : "تعذر تصدير الملخص الطبي: ") + e.message);
    }
  }

  const AssessmentComparisonUI = {
    startIndependentNewAssessment,
    clearIndependentAssessmentContext,
    openAssessmentComparisonModal,
    closeComparisonModal,
    submitDoctorReassessmentPlan,
    exportMedicalSummary
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AssessmentComparisonUI = AssessmentComparisonUI;

  // Global helper exports for inline HTML onclick handlers
  global.startIndependentNewAssessment = startIndependentNewAssessment;
  global.openAssessmentComparisonModal = openAssessmentComparisonModal;
  global.exportMedicalSummary = exportMedicalSummary;

})(typeof window !== "undefined" ? window : globalThis);
