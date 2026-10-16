/**
 * Health Vibe AI - Obesity & Metabolic Health UI Module
 * 
 * Provides:
 * 1. Structured Anthropometric Measurements & Dynamic BMI Display:
 *    - Height, Height Unit (cm, m, in), Weight, Weight Unit (kg, lbs, g).
 *    - Measurement Timestamp, Measurement Source, Provenance.
 *    - Reuses existing patient measurements when valid.
 *    - Dynamically calculates BMI strictly from valid height and weight.
 *    - NEVER stores or displays a fabricated BMI (shows incomplete data clearly).
 * 2. Clear Distinction Between Directly Measured Values vs Calculated Values:
 *    - Measured: Height & Unit, Weight & Unit, source, method.
 *    - Calculated: BMI, formula (weight_kg / height_m²), derivation method.
 * 3. Strict Clinical Guardrails & Medical Review Workflow:
 *    - Prominent banner: Weight and BMI alone DO NOT represent an automatic medical diagnosis.
 *    - Zero automated diagnoses generated.
 *    - Any clinical interpretation remains within the approved medical-review workflow.
 * 4. Historical Measurements Preservation:
 *    - Complete longitudinal history table with chronological tracking.
 * 5. Relevant Lifestyle Factors:
 *    - Activity level, dietary patterns, sleep duration, when documented.
 * 6. Doctor Review & Approved Follow-Up Display:
 *    - Attending physician diagnosis, clinical notes, management plan.
 *    - Internal doctor notes strictly quarantined from patient views.
 *    - Approved follow-up protocol display.
 * 7. 100% Arabic (RTL) & English (LTR) localization parity.
 */

(function (global) {
  "use strict";

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(isoString, isEn = false) {
    if (!isoString) return isEn ? "Date unknown" : "تاريخ غير معروف";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    try {
      return d.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return String(isoString).substring(0, 10);
    }
  }

  function formatShortDate(isoString, isEn = false) {
    if (!isoString) return isEn ? "Unknown" : "غير معروف";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString).substring(0, 10);
    try {
      return d.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
        month: "short",
        day: "numeric"
      });
    } catch (e) {
      return String(isoString).substring(0, 10);
    }
  }

  function getTimePeriod(isoString) {
    if (!isoString) {
      return { key: "unknown", labelEn: "Recorded", labelAr: "مسجل", icon: "⏱️" };
    }
    const d = new Date(isoString);
    const hour = isNaN(d.getTime()) ? 12 : d.getHours();
    if (hour >= 5 && hour < 12) {
      return { key: "morning", labelEn: "Morning", labelAr: "صباحاً", icon: "🌅" };
    } else if (hour >= 12 && hour < 17) {
      return { key: "afternoon", labelEn: "Afternoon", labelAr: "ظهراً", icon: "☀️" };
    } else if (hour >= 17 && hour < 22) {
      return { key: "evening", labelEn: "Evening", labelAr: "مساءً", icon: "🌆" };
    } else {
      return { key: "night", labelEn: "Night", labelAr: "ليلاً", icon: "🌙" };
    }
  }

  const SOURCE_META = {
    patient_self_report: { labelEn: "Patient Self-Report", labelAr: "تسجيل المريض الذاتي", icon: "👤", pillClass: "pending" },
    clinical_scale: { labelEn: "Clinical Scale (In-Clinic)", labelAr: "ميزان سريري داخل العيادة", icon: "🏥", pillClass: "ok" },
    smart_scale: { labelEn: "Smart Scale / Bluetooth", labelAr: "ميزان ذكي متصل", icon: "📱", pillClass: "info" },
    in_clinic: { labelEn: "In-Clinic Measurement", labelAr: "قياس عيادي موثق", icon: "🩺", pillClass: "ok" },
    medical_ocr: { labelEn: "Medical Document OCR", labelAr: "استخراج ضوئي من وثيقة", icon: "📄", pillClass: "warning" },
    ehr_import: { labelEn: "EHR / Hospital Import", labelAr: "مستورد من السجل الطبي", icon: "🏛️", pillClass: "info" },
    existing_patient_record: { labelEn: "Reused Existing Record", labelAr: "مسترجع من السجل الطبي", icon: "🔄", pillClass: "info" }
  };

  function getSourceInfo(sourceKey) {
    if (!sourceKey) return { ...SOURCE_META.patient_self_report, key: "patient_self_report" };
    const normalized = String(sourceKey).toLowerCase();
    return SOURCE_META[normalized] || {
      labelEn: sourceKey,
      labelAr: sourceKey,
      icon: "⚖️",
      pillClass: "pending",
      key: sourceKey
    };
  }

  /**
   * Detects tracking intervals exceeding maxDaysGap (default 30 days) between consecutive records.
   */
  function detectObesityTrackingGaps(measurements = [], maxDaysGap = 30) {
    if (!Array.isArray(measurements) || measurements.length < 2) return [];

    const sorted = [...measurements].filter(m => m && (m.measurementTimestamp || m.measuredAt || m.createdAt)).sort((a, b) => {
      const tA = new Date(a.measurementTimestamp || a.measuredAt || a.createdAt).getTime();
      const tB = new Date(b.measurementTimestamp || b.measuredAt || b.createdAt).getTime();
      return tA - tB;
    });

    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const tPrev = new Date(prev.measurementTimestamp || prev.measuredAt || prev.createdAt).getTime();
      const tCurr = new Date(curr.measurementTimestamp || curr.measuredAt || curr.createdAt).getTime();

      if (!isNaN(tPrev) && !isNaN(tCurr)) {
        const diffMs = tCurr - tPrev;
        const gapDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (gapDays > maxDaysGap) {
          gaps.push({
            beforeMeasurementId: curr.measurementId || curr.id || `meas_${i}`,
            gapDays,
            fromDate: prev.measurementTimestamp || prev.measuredAt || prev.createdAt,
            toDate: curr.measurementTimestamp || curr.measuredAt || curr.createdAt
          });
        }
      }
    }
    return gaps;
  }

  /**
   * Filter measurements by source, time period, or date range.
   */
  function filterMeasurements(measurements = [], filters = {}) {
    if (!Array.isArray(measurements)) return [];
    let list = [...measurements];

    if (filters.source && filters.source !== "all") {
      list = list.filter(m => (m.measurementSource || m.source) === filters.source);
    }

    if (filters.period && filters.period !== "all") {
      list = list.filter(m => {
        const period = getTimePeriod(m.measurementTimestamp || m.measuredAt || m.createdAt);
        return period.key === filters.period;
      });
    }

    if (filters.rangeDays && Number(filters.rangeDays) > 0) {
      const cutoff = Date.now() - (Number(filters.rangeDays) * 24 * 60 * 60 * 1000);
      list = list.filter(m => {
        const t = new Date(m.measurementTimestamp || m.measuredAt || m.createdAt).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    return list;
  }

  /**
   * Renders the mandatory non-diagnostic guardrail banner.
   */
  function renderClinicalGuardrailBanner(isEn = false) {
    return `
      <div class="clinical-guardrail-banner" style="background: rgba(9, 184, 182, 0.08); border: 1.5px solid var(--teal); border-radius: 12px; padding: 14px 18px; margin-bottom: 20px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <span style="font-size: 24px; line-height: 1;">🛡️</span>
          <div>
            <strong style="color: var(--teal); font-size: 14px; display: block; margin-bottom: 4px;">
              ${isEn ? "Clinical Standard: Anthropometric Non-Diagnostic Boundary" : "المعيار السريري: حدود القياسات الأنثروبومترية غير التشخيصية"}
            </strong>
            <p style="font-size: 13px; color: var(--ink); margin: 0 0 6px; line-height: 1.5;">
              ${isEn
                ? "Weight and Body Mass Index (BMI) are anthropometric parameters, NOT a medical diagnosis. A patient's weight or BMI alone does not represent an automatic clinical diagnosis."
                : "الوزن ومؤشر كتلة الجسم (BMI) هما مؤشران أنثروبومتريان ولا يمثلان تشخيصاً طبياً بمفردهما. وزن المريض أو مؤشر كتلته لا يمثل تشخيصاً سريرياً تلقائياً."}
            </p>
            <p style="font-size: 12px; color: var(--muted); margin: 0; line-height: 1.4;">
              ${isEn
                ? "• Automated diagnoses are strictly forbidden. Any clinical interpretation and treatment plan must remain within the approved medical-review workflow conducted by an authorized physician."
                : "• يُمنع إصدار تشخيصات تلقائية. يجب أن يبقى أي تفسير سريري أو خطة علاجية ضمن مسار المراجعة الطبية المعتمدة من قبل طبيب مرخص."}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the chronological historical measurements table.
   * Preserves all recorded entries without overwrite and clearly distinguishes
   * directly measured values from calculated BMI.
   */
  function renderHistoricalMeasurementsTable(measurements = [], isEn = false) {
    if (!measurements || measurements.length === 0) {
      return `
        <div class="empty-measurements-card" style="padding: 28px 16px; text-align: center; color: var(--muted); background: var(--surface-2); border: 1px dashed var(--line); border-radius: 12px;">
          <span style="font-size: 32px; display: block; margin-bottom: 8px;">⚖️</span>
          <p style="margin: 0; font-size: 14px;">
            ${isEn ? "No persisted anthropometric measurements recorded yet." : "لا توجد قياسات أنثروبومترية محفوظة لهذا المريض حتى الآن."}
          </p>
          <span style="font-size: 12px; color: var(--muted); display: block; margin-top: 4px;">
            ${isEn ? "Record real height and weight below to track longitudinal history." : "سجّل قياسات الطول والوزن الحقيقية بالأسفل لتتبع السجل الزمني."}
          </span>
        </div>
      `;
    }

    const rowsHtml = measurements.map((m) => {
      const src = SOURCE_META[m.measurementSource] || SOURCE_META.patient_self_report;
      const srcLabel = isEn ? src.labelEn : src.labelAr;
      const timestamp = m.measurementTimestamp || m.measuredAt;
      const dateStr = formatDateTime(timestamp, isEn);

      // Distinguish directly measured vs reused height
      const hVal = m.height !== undefined && m.height !== null ? m.height : m.heightCm;
      const hUnit = m.heightUnit || 'cm';
      const isHReused = Boolean(m.measuredValues?.height?.isReusedFromHistory);
      const heightDisplay = hVal !== null && hVal !== undefined
        ? `<span>${escapeHtml(hVal)} ${escapeHtml(hUnit)}</span>${isHReused ? ` <small class="pill info" style="font-size: 9px; padding: 1px 4px;">${isEn ? "Reused" : "مسترجع"}</small>` : ""}`
        : "--";

      // Weight with unit
      const wVal = m.weight !== undefined && m.weight !== null ? m.weight : m.weightKg;
      const wUnit = m.weightUnit || 'kg';
      const weightDisplay = wVal !== null && wVal !== undefined
        ? `<span>${escapeHtml(wVal)} ${escapeHtml(wUnit)}</span>`
        : "--";

      // Calculated BMI vs Incomplete Data (Never Fabricated)
      let bmiDisplay = "";
      if (m.bmi !== undefined && m.bmi !== null) {
        bmiDisplay = `
          <div style="display: flex; align-items: center; gap: 4px;">
            <strong style="color: var(--teal); font-family: monospace;">${escapeHtml(m.bmi)} kg/m²</strong>
            <span class="pill ok" style="font-size: 9.5px; padding: 1px 5px;" title="${isEn ? 'Calculated from valid height and weight: weight / height²' : 'محسوب بدقة من الطول والوزن: الوزن / مربع الطول'}">
              📐 ${isEn ? "Calculated" : "محسوب"}
            </span>
          </div>
        `;
      } else {
        bmiDisplay = `
          <span style="color: var(--muted); font-size: 11.5px; font-style: italic;" title="${isEn ? 'Incomplete height or weight. Fabricated BMI is strictly prohibited.' : 'بيانات غير مكتملة. يمنع اصطناع مؤشر كتلة افتراضي.'}">
            ${isEn ? "-- (Incomplete Data — No Fabricated BMI)" : "-- (بيانات غير مكتملة — لا اصطناع)"}
          </span>
        `;
      }

      let statusBadge = `<span class="pill pending" style="font-size: 10.5px;">${isEn ? "Unverified" : "غير موثق"}</span>`;
      if (m.reviewStatus === "approved" || m.reviewStatus === "APPROVED") {
        statusBadge = `<span class="pill ok" style="font-size: 10.5px;">${isEn ? "Approved Fact" : "معتمد سريرياً"}</span>`;
      } else if (m.reviewStatus === "doctor_verified" || m.reviewStatus === "DOCTOR_VERIFIED") {
        statusBadge = `<span class="pill ok" style="font-size: 10.5px;">${isEn ? "Doctor-Verified" : "موثق من الطبيب"}</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid var(--line);">
          <td style="padding: 10px 12px; font-weight: 600; color: var(--ink); white-space: nowrap;">${escapeHtml(dateStr)}</td>
          <td style="padding: 10px 12px; font-size: 13px;">${heightDisplay}</td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: var(--ink);">${weightDisplay}</td>
          <td style="padding: 10px 12px; font-size: 13px;">${bmiDisplay}</td>
          <td style="padding: 10px 12px;">
            <span class="pill ${src.pillClass}" style="font-size: 10.5px; display: inline-flex; align-items: center; gap: 4px;">
              <span>${src.icon}</span> ${escapeHtml(srcLabel)}
            </span>
          </td>
          <td style="padding: 10px 12px;">${statusBadge}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="table-responsive" style="overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface);">
        <table class="clinical-table" style="width: 100%; border-collapse: collapse; text-align: start; font-size: 13px;">
          <thead>
            <tr style="background: var(--surface-2); border-bottom: 1px solid var(--line); color: var(--ink);">
              <th style="padding: 10px 12px;">${isEn ? "Measurement Timestamp" : "تاريخ وتوقيت القياس"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Measured Height" : "الطول المقاس"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Measured Weight" : "الوزن المقاس"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Calculated BMI" : "مؤشر الكتلة المحسوب (BMI)"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Measurement Source" : "مصدر القياس"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Review Status" : "حالة الاعتماد"}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      <p style="font-size: 11px; color: var(--muted); margin: 8px 4px 0; line-height: 1.4;">
        🛡️ ${isEn
          ? "Note: Directly measured values (height, weight) are clearly separated from calculated values (BMI). BMI alone does NOT generate an automated diagnosis."
          : "ملاحظة: يتم فصل القياسات المباشرة (الطول، الوزن) عن القيم المحسوبة (BMI) بوضوح تام. مؤشر كتلة الجسم بمفرده لا ينشئ تشخيصاً تلقائياً."}
      </p>
    `;
  }

  /**
   * Renders documented lifestyle factors when collected.
   */
  function renderLifestyleSummary(lifestyle, isEn = false) {
    if (!lifestyle || (!lifestyle.physicalActivity && !lifestyle.dietaryHabits && !lifestyle.sleep)) {
      return `
        <div style="padding: 14px; background: var(--surface-2); border-radius: 10px; border: 1px dashed var(--line); color: var(--muted); font-size: 12.5px; text-align: center;">
          <span>ℹ️</span> ${isEn ? "No lifestyle information documented for this observation." : "لا توجد معلومات نمط حياة موثقة لهذا القياس."}
        </div>
      `;
    }

    const activity = lifestyle.physicalActivity;
    const diet = lifestyle.dietaryHabits;
    const sleep = lifestyle.sleep;

    return `
      <div class="lifestyle-summary-card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <!-- Physical Activity -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px;">
          <strong style="color: var(--teal); font-size: 12.5px; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span>🏃</span> ${isEn ? "Physical Activity" : "النشاط البدني"}
          </strong>
          <p style="margin: 0; font-size: 13px; color: var(--ink);">
            ${activity && activity.activityLevel ? escapeHtml(activity.activityLevel) : (isEn ? "Not specified" : "غير محدد")}
            ${activity && activity.minutesPerWeek ? ` (${activity.minutesPerWeek} ${isEn ? "min/wk" : "دقيقة/أسبوع"})` : ""}
          </p>
          ${activity && activity.notes ? `<p style="margin: 4px 0 0; font-size: 11.5px; color: var(--muted);">${escapeHtml(activity.notes)}</p>` : ""}
        </div>

        <!-- Dietary Habits -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px;">
          <strong style="color: var(--teal); font-size: 12.5px; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span>🥗</span> ${isEn ? "Dietary Patterns" : "النمط الغذائي"}
          </strong>
          <p style="margin: 0; font-size: 13px; color: var(--ink);">
            ${diet && diet.nutritionalPattern ? escapeHtml(diet.nutritionalPattern) : (isEn ? "Documented habits" : "عادات موثقة")}
            ${diet && diet.mealsPerDay ? ` • ${diet.mealsPerDay} ${isEn ? "meals/day" : "وجبات/يوم"}` : ""}
          </p>
          ${diet && diet.notes ? `<p style="margin: 4px 0 0; font-size: 11.5px; color: var(--muted);">${escapeHtml(diet.notes)}</p>` : ""}
        </div>

        <!-- Sleep Quality -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px;">
          <strong style="color: var(--teal); font-size: 12.5px; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span>🌙</span> ${isEn ? "Sleep Duration & Screening" : "النوم وفحص انقطاع النفس"}
          </strong>
          <p style="margin: 0; font-size: 13px; color: var(--ink);">
            ${sleep && sleep.hoursPerNight ? `${sleep.hoursPerNight} ${isEn ? "hours/night" : "ساعات/ليلة"}` : (isEn ? "Unspecified hours" : "ساعات غير محددة")}
            ${sleep && sleep.sleepApneaScreening && sleep.sleepApneaScreening !== "unassessed" ? ` • Apnea: ${escapeHtml(sleep.sleepApneaScreening)}` : ""}
          </p>
          ${sleep && sleep.notes ? `<p style="margin: 4px 0 0; font-size: 11.5px; color: var(--muted);">${escapeHtml(sleep.notes)}</p>` : ""}
        </div>
      </div>
    `;
  }

  /**
   * Renders the Doctor Clinical Review & Approved Follow-Up Section.
   * QUARANTINE GUARD: Internal notes are strictly quarantined unless isDoctor === true.
   */
  function renderDoctorReviewAndFollowUp(caseData, isEn = false, isDoctor = false) {
    if (!caseData || caseData.status !== "approved") {
      return `
        <div style="padding: 20px; background: var(--surface-2); border-radius: 12px; border: 1px dashed var(--line); text-align: center; color: var(--muted);">
          <span style="font-size: 26px; display: block; margin-bottom: 6px;">⏳</span>
          <strong style="display: block; font-size: 13.5px; color: var(--ink); margin-bottom: 4px;">
            ${isEn ? "Awaiting Attending Physician Review" : "بانتظار مراجعة واعتماد الطبيب المعالج"}
          </strong>
          <p style="margin: 0; font-size: 12.5px;">
            ${isEn ? "Clinical diagnosis and approved management plan require authorized physician sign-off. BMI alone is never an automatic diagnosis." : "يتطلب التشخيص وخطة العلاج توقيع واعتماد الطبيب المرخص. مؤشر كتلة الجسم بمفرده ليس تشخيصاً أبداً."}
          </p>
        </div>
      `;
    }

    const doc = caseData.approvingDoctor || {};
    const followUp = caseData.followUpPlan || {};

    let internalNotesHtml = "";
    if (isDoctor && caseData.internalDoctorNotes) {
      internalNotesHtml = `
        <div class="quarantined-notes-card" style="background: rgba(245, 158, 11, 0.08); border: 1.5px dashed #d97706; border-radius: 10px; padding: 12px; margin-top: 12px;">
          <strong style="color: #b45309; font-size: 12px; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span>🔒</span> ${isEn ? "Quarantined Internal Doctor Notes (Hidden from Patient)" : "ملاحظات الطبيب الداخلية المحجوبة (سرية عن المريض)"}
          </strong>
          <p style="margin: 0; font-size: 12.5px; color: var(--ink);">${escapeHtml(caseData.internalDoctorNotes)}</p>
        </div>
      `;
    }

    return `
      <div class="approved-review-card" style="background: var(--surface); border: 1px solid var(--teal); border-radius: 14px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 10px;">
          <div>
            <span class="pill ok" style="font-size: 11px; margin-bottom: 4px; display: inline-block;">
              🏆 ${isEn ? "Doctor-Approved Clinical Assessment" : "تقييم سريري معتمد من الطبيب"}
            </span>
            <h4 style="margin: 4px 0 0; font-size: 15px; color: var(--ink);">
              ${escapeHtml(doc.name || "Physician")} • <span style="font-size: 12px; color: var(--muted);">${escapeHtml(doc.specialty || "Obesity Medicine")}</span>
            </h4>
            <span style="font-size: 11.5px; color: var(--muted); font-family: monospace;">
              ${isEn ? "License" : "الترخيص"}: ${escapeHtml(doc.licenseNumber || "VERIFIED")} • ${formatDateTime(caseData.approvedAt, isEn)}
            </span>
          </div>
        </div>

        <!-- Explicit Physician Diagnosis -->
        <div style="background: var(--surface-2); padding: 12px 14px; border-radius: 10px; border-inline-start: 4px solid var(--teal); margin-bottom: 12px;">
          <strong style="font-size: 13px; color: var(--teal); display: block; margin-bottom: 4px;">
            ${isEn ? "Physician Clinical Diagnosis (Explicit Human Evaluation):" : "التشخيص الطبي السريري (تقييم بشري صريح):"}
          </strong>
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: var(--ink);">
            ${escapeHtml(caseData.clinicalDiagnosis)}
          </p>
        </div>

        <!-- Management Plan -->
        ${caseData.managementPlan ? `
          <div style="margin-bottom: 12px;">
            <strong style="font-size: 12.5px; color: var(--ink); display: block; margin-bottom: 2px;">
              ${isEn ? "Management & Nutrition Plan:" : "خطة الإدارة والرعاية التغذوية:"}
            </strong>
            <p style="margin: 0; font-size: 13px; color: var(--ink); line-height: 1.5;">${escapeHtml(caseData.managementPlan)}</p>
          </div>
        ` : ""}

        <!-- Doctor Public Clinical Notes -->
        ${caseData.doctorNotes ? `
          <div style="margin-bottom: 12px;">
            <strong style="font-size: 12.5px; color: var(--ink); display: block; margin-bottom: 2px;">
              ${isEn ? "Doctor Clinical Notes:" : "ملاحظات الطبيب السريرية:"}
            </strong>
            <p style="margin: 0; font-size: 13px; color: var(--muted); line-height: 1.5;">${escapeHtml(caseData.doctorNotes)}</p>
          </div>
        ` : ""}

        <!-- Approved Follow-Up Plan -->
        ${followUp && (followUp.targetFollowUpDate || followUp.intervalWeeks) ? `
          <div class="followup-box" style="background: rgba(9, 184, 182, 0.06); border: 1px solid var(--teal); border-radius: 10px; padding: 12px; margin-top: 12px;">
            <strong style="color: var(--teal); font-size: 13px; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <span>📅</span> ${isEn ? "Approved Follow-Up Protocol" : "بروتوكول المتابعة المعتمد"}
            </strong>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; font-size: 12px; color: var(--ink);">
              <div>
                <strong>${isEn ? "Follow-Up Interval" : "فترة المتابعة"}:</strong> ${followUp.intervalWeeks} ${isEn ? "weeks" : "أسابيع"}
                ${followUp.targetFollowUpDate ? ` (${followUp.targetFollowUpDate})` : ""}
              </div>
              <div>
                <strong>${isEn ? "Repeat Biometrics" : "تكرار القياسات"}:</strong> ${escapeHtml(followUp.repeatBiometricsSchedule || "monthly")}
              </div>
              <div>
                <strong>${isEn ? "Nutrition Consultation" : "استشارة تغذية"}:</strong> ${followUp.nutritionConsultation ? (isEn ? "Recommended" : "موصى بها") : (isEn ? "Standard" : "اعتيادية")}
              </div>
            </div>
            ${followUp.lifestyleGoals ? `
              <p style="margin: 6px 0 0; font-size: 12px; color: var(--ink);">
                <strong>${isEn ? "Target Goals" : "الأهداف"}:</strong> ${escapeHtml(followUp.lifestyleGoals)}
              </p>
            ` : ""}
          </div>
        ` : ""}

        <!-- Quarantined Notes if doctor -->
        ${internalNotesHtml}
      </div>
    `;
  }

  // =============================================================================
  // TREND VISUALIZATION (SVG Chart Gated on >= 2 Measurements)
  // =============================================================================

  /**
   * Generates a responsive SVG line chart visualization for historical weight progression.
   * Gated: strictly requires >= 2 distinct persisted measurements.
   * NEVER fabricates trends or draws curves when insufficient data exists (< 2).
   * NEVER derives a diagnosis from the chart or recommends treatments.
   *
   * @param {Array} measurements
   * @param {boolean} isEn
   * @param {object} options
   * @returns {string} SVG HTML or insufficient data advisory card
   */
  function renderObesityTrendChartSvg(measurements = [], isEn = false, options = {}) {
    const validMeasurements = (measurements || []).filter(m => {
      const w = Number(m?.weight !== undefined && m?.weight !== null ? m.weight : m?.weightKg);
      return !isNaN(w) && w > 0;
    });

    // RULE: Do not fabricate trends when insufficient data exists (< 2 measurements)
    if (validMeasurements.length < 2) {
      return `
        <div class="ob-insufficient-data-card" role="region" aria-label="${isEn ? 'Weight trend notice' : 'تنبيه مسار الوزن'}" style="text-align: center; padding: 28px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; margin: 12px 0;">
          <div class="ob-insufficient-icon" aria-hidden="true" style="font-size: 32px; margin-bottom: 8px;">📊</div>
          <div class="ob-insufficient-body">
            <h4 class="ob-insufficient-title" style="font-size: 14.5px; font-weight: 700; color: var(--ink); margin: 0 0 6px;">
              ${isEn ? "Trend Chart Requires at Least 2 Measurements" : "رسم المنحنى البياني يتطلب قياسين مسجلين على الأقل"}
            </h4>
            <p class="ob-insufficient-desc" style="font-size: 12.5px; color: var(--muted); margin: 0 0 12px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.5;">
              ${isEn
                ? "To ensure clinical accuracy and avoid misleading trend curves, visualization requires at least 2 persisted measurements across different times. Continue logging your weight to view historical trends."
                : "لضمان الدقة وتفادي أي منحنيات بيانية مضللة، يتطلب رسم المنحنى تسجيل قياسين فعليين على الأقل في أوقات مختلفة. واصل تسجيل وزنك لمتابعة الاتجاه الزمني."}
            </p>
            <div class="ob-insufficient-status" style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
              <span class="pill info" style="font-size: 11px; padding: 3px 10px;">
                ${isEn ? `Current Persisted Readings: ${validMeasurements.length}` : `القياسات المسجلة حالياً: ${validMeasurements.length}`}
              </span>
              <span class="pill ok" style="font-size: 11px; padding: 3px 10px;">
                ${isEn ? "Unit: kg" : "الوحدة: كجم"}
              </span>
            </div>
          </div>
        </div>
      `;
    }

    // Sort chronologically (oldest first)
    const sorted = [...validMeasurements].sort((a, b) => {
      const tA = new Date(a.measurementTimestamp || a.measuredAt || a.createdAt || 0).getTime();
      const tB = new Date(b.measurementTimestamp || b.measuredAt || b.createdAt || 0).getTime();
      return tA - tB;
    });

    const width = 640;
    const height = 240;
    const padTop = 30;
    const padBottom = 45;
    const padLeft = 55;
    const padRight = 35;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    // Normalize weights to kg for chart coordinates
    const weightsKg = sorted.map(m => {
      const w = Number(m.weight !== undefined && m.weight !== null ? m.weight : m.weightKg);
      const unit = m.weightUnit || 'kg';
      if (unit === 'lbs') return Math.round(w * 0.45359237 * 10) / 10;
      if (unit === 'g') return Math.round(w * 0.001 * 10) / 10;
      return Math.round(w * 10) / 10;
    });

    const dataMin = Math.min(...weightsKg);
    const dataMax = Math.max(...weightsKg);
    let minVal = Math.max(0, Math.floor((dataMin - 5) / 5) * 5);
    let maxVal = Math.ceil((dataMax + 5) / 5) * 5;
    if (maxVal - minVal < 10) maxVal = minVal + 10;

    const valToY = (v) => {
      const clamped = Math.max(minVal, Math.min(maxVal, v));
      const ratio = (clamped - minVal) / (maxVal - minVal);
      return height - padBottom - (ratio * plotHeight);
    };

    const n = sorted.length;
    const getX = (idx) => padLeft + (idx / (n - 1)) * plotWidth;

    // Grid lines every 5 or 10 kg
    const step = (maxVal - minVal) > 40 ? 10 : 5;
    const gridLines = [];
    const startTick = Math.ceil(minVal / step) * step;
    for (let val = startTick; val <= maxVal; val += step) {
      const y = valToY(val);
      gridLines.push(`
        <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line, #1e3f42)" stroke-dasharray="3 3" stroke-width="1" />
        <text x="${padLeft - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted, #9ac1bf)" font-family="inherit">${val} <tspan font-size="8">kg</tspan></text>
      `);
    }

    const weightPoints = [];
    const dataCircles = [];
    const dateLabels = [];

    sorted.forEach((m, i) => {
      const x = getX(i);
      const wKg = weightsKg[i];
      const y = valToY(wKg);

      weightPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);

      const rawW = m.weight !== undefined && m.weight !== null ? m.weight : m.weightKg;
      const rawUnit = m.weightUnit || 'kg';
      const formattedDt = formatDateTime(m.measurementTimestamp || m.measuredAt || m.createdAt, isEn);
      const srcInfo = getSourceInfo(m.measurementSource || m.source);
      const srcLabel = isEn ? srcInfo.labelEn : srcInfo.labelAr;
      const periodInfo = getTimePeriod(m.measurementTimestamp || m.measuredAt || m.createdAt);
      const periodLabel = isEn ? periodInfo.labelEn : periodInfo.labelAr;

      const bmiText = (m.bmi !== undefined && m.bmi !== null)
        ? `${m.bmi} kg/m² (${isEn ? "Calculated: weight / height²" : "محسوب: الوزن / مربع الطول"})`
        : (isEn ? "BMI not calculated (missing height)" : "لم يُحسب مؤشر الكتلة (الطول غير مسجل)");

      const tooltipTitle = `${formattedDt} (${periodInfo.icon} ${periodLabel})&#10;` +
        `${isEn ? "Measured Weight" : "الوزن المقاس"}: ${rawW} ${rawUnit}&#10;` +
        `${isEn ? "Calculated BMI" : "مؤشر الكتلة"}: ${bmiText}&#10;` +
        `${isEn ? "Source" : "المصدر"}: ${srcInfo.icon} ${srcLabel}`;

      dataCircles.push(`
        <g class="chart-point-group" tabindex="0" role="img" aria-label="${isEn ? `Measurement ${i + 1}: ${rawW} ${rawUnit}` : `قياس ${i + 1}: ${rawW} ${rawUnit}`}">
          <title>${tooltipTitle}</title>
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="chart-dot" fill="#09b8b6" stroke="var(--surface, #0d2427)" stroke-width="2" />
        </g>
      `);

      if (n <= 6 || i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
        const shortDt = formatShortDate(m.measurementTimestamp || m.measuredAt || m.createdAt, isEn);
        dateLabels.push(`
          <text x="${x.toFixed(1)}" y="${height - padBottom + 18}" text-anchor="middle" font-size="10" fill="var(--muted, #9ac1bf)" font-family="inherit">${escapeHtml(shortDt)}</text>
        `);
      }
    });

    const weightPathD = "M " + weightPoints.join(" L ");

    return `
      <div class="ob-svg-chart-wrapper" style="position: relative; width: 100%;">
        <!-- Chart Legend & Info Banner -->
        <div class="ob-chart-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
          <div class="ob-chart-legend" style="display: flex; align-items: center; gap: 14px; font-size: 12.5px;">
            <span class="legend-item" style="display: inline-flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 12px; height: 3px; background: #09b8b6; border-radius: 2px;"></span>
              <strong>${isEn ? "Measured Weight" : "الوزن المقاس"}</strong> <span style="font-size: 11px; color: var(--muted);">(kg)</span>
            </span>
          </div>
          <div class="ob-chart-stats-pill" style="font-size: 11px; color: var(--muted); background: var(--surface-2); padding: 4px 10px; border-radius: 12px; border: 1px solid var(--line);">
            <span>${isEn ? `Showing ${validMeasurements.length} measurements` : `عرض ${validMeasurements.length} قياساً مسجلاً`}</span>
          </div>
        </div>

        <!-- Accessible SVG Graphic -->
        <div class="ob-svg-responsive-container" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
          <svg viewBox="0 0 ${width} ${height}" class="ob-trend-svg" style="width: 100%; min-width: 500px; height: auto; display: block;" role="img" aria-label="${isEn ? 'Weight trend progression chart' : 'الرسم البياني لمسار تغير الوزن'}">
            <!-- Background Grid -->
            <rect x="${padLeft}" y="${padTop}" width="${plotWidth}" height="${plotHeight}" fill="rgba(14, 46, 49, 0.25)" rx="6" />
            ${gridLines.join("")}

            <!-- Trend Line (Only generated because readings >= 2) -->
            <path d="${weightPathD}" fill="none" stroke="#09b8b6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

            <!-- Point Dots with Tooltips -->
            ${dataCircles.join("")}

            <!-- X-Axis Labels -->
            ${dateLabels.join("")}
          </svg>
        </div>

        <!-- Non-Diagnostic Notice -->
        <div class="ob-chart-disclaimer" style="margin-top: 8px; font-size: 11px; color: var(--muted); text-align: start; display: flex; align-items: center; gap: 6px;">
          <span aria-hidden="true">ℹ️</span>
          <span>${isEn ? "Observational trend for self-tracking only. Chart curves do not constitute a clinical diagnosis or treatment recommendation." : "منحنى استرعائي للمتابعة الشخصية فقط. لا يشكل الرسم البياني تشخيصاً طبياً أو توصية علاجية."}</span>
        </div>
      </div>
    `;
  }

  // =============================================================================
  // CHRONOLOGICAL TIMELINE (With Missing Indicators & Gap Detection)
  // =============================================================================

  /**
   * Renders the chronological timeline of persisted anthropometric measurements.
   * Clearly displays weight, unit, date/time, source, and calculated BMI when valid.
   * Highlights missing information and tracking gaps (> 30 days).
   *
   * @param {Array} measurements
   * @param {boolean} isEn
   * @param {object} options
   * @returns {string} HTML string
   */
  function renderObesityTimeline(measurements = [], isEn = false, options = {}) {
    if (!Array.isArray(measurements) || measurements.length === 0) {
      return `
        <div class="ob-timeline-empty" style="text-align: center; padding: 28px 16px; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; margin: 16px 0;">
          <div style="font-size: 28px; margin-bottom: 8px;">⚖️</div>
          <h4 style="font-size: 14px; margin: 0 0 4px; color: var(--ink);">
            ${isEn ? "No Persisted Weight Measurements" : "لا توجد قياسات مسجلة للوزن"}
          </h4>
          <p style="font-size: 12.5px; color: var(--muted); margin: 0;">
            ${isEn ? "No measurements found for the selected filter. Log a measurement to track your history." : "لم يتم العثور على قياسات مطابقة للتصفية الحالية. سجل قياساً لتتبع تاريخك الصحي."}
          </p>
        </div>
      `;
    }

    const order = options.order || "newest_first";
    const sorted = [...measurements].sort((a, b) => {
      const tA = new Date(a.measurementTimestamp || a.measuredAt || a.createdAt || 0).getTime();
      const tB = new Date(b.measurementTimestamp || b.measuredAt || b.createdAt || 0).getTime();
      return order === "oldest_first" ? tA - tB : tB - tA;
    });

    const gaps = detectObesityTrackingGaps(measurements, 30);
    const gapMap = new Map();
    gaps.forEach(g => {
      gapMap.set(g.beforeMeasurementId, g);
    });

    const cardsHtml = sorted.map((m, index) => {
      const measurementId = m.measurementId || m.id || `ob_m_${index}`;
      const dtStr = formatDateTime(m.measurementTimestamp || m.measuredAt || m.createdAt, isEn);
      const period = getTimePeriod(m.measurementTimestamp || m.measuredAt || m.createdAt);
      const periodLabel = isEn ? period.labelEn : period.labelAr;

      const src = getSourceInfo(m.measurementSource || m.source);
      const srcLabel = isEn ? src.labelEn : src.labelAr;

      // Weight (Measured)
      const hasW = m.weight !== null && m.weight !== undefined && !isNaN(Number(m.weight));
      const wVal = hasW ? Number(m.weight) : (m.weightKg !== undefined ? Number(m.weightKg) : null);
      const wUnit = m.weightUnit || 'kg';
      const weightDisplay = wVal !== null
        ? `${wVal}`
        : `<span class="ob-missing-tag" style="color: var(--amber); font-weight: normal; font-size: 12px;">${isEn ? "[Missing Weight]" : "[الوزن غير مسجل]"}</span>`;

      // Height (Measured or Reused)
      const hVal = m.height !== null && m.height !== undefined ? m.height : m.heightCm;
      const hUnit = m.heightUnit || 'cm';
      const isHReused = Boolean(m.measuredValues?.height?.isReusedFromHistory || m.provenance?.isReusedMeasurement);
      const hasH = hVal !== null && hVal !== undefined && !isNaN(Number(hVal));
      const heightDisplay = hasH
        ? `<span>${hVal} ${hUnit}</span>${isHReused ? ` <small class="pill info" style="font-size: 9.5px; padding: 1px 5px;">${isEn ? "Reused Height" : "طول مسترجع"}</small>` : ""}`
        : `<span class="ob-missing-tag" style="color: var(--amber); font-weight: normal; font-size: 11px;">${isEn ? "[Missing Height]" : "[الطول غير مسجل]"}</span>`;

      // Calculated BMI vs Incomplete Data
      let bmiDisplay = "";
      if (m.bmi !== undefined && m.bmi !== null) {
        bmiDisplay = `
          <div style="display: flex; align-items: baseline; gap: 5px;">
            <strong class="ob-bmi-val" style="color: var(--teal); font-family: monospace; font-size: 18px;">${m.bmi}</strong>
            <span style="font-size: 11px; color: var(--muted);">kg/m²</span>
            <span class="pill ok" style="font-size: 9.5px; padding: 1px 5px;" title="${isEn ? 'Calculated from valid height and weight: weight / height²' : 'محسوب بدقة من الطول والوزن: الوزن / مربع الطول'}">
              📐 ${isEn ? "Calculated" : "محسوب"}
            </span>
          </div>
        `;
      } else {
        bmiDisplay = `
          <span class="ob-bmi-missing" style="color: var(--muted); font-size: 11.5px; font-style: italic;">
            ${isEn ? "-- (Incomplete Data — No Fabricated BMI)" : "-- (بيانات غير مكتملة — لا اصطناع)"}
          </span>
        `;
      }

      // Review status badge
      let statusBadge = `<span class="pill pending" style="font-size: 10px;">${isEn ? "Unverified" : "غير موثق"}</span>`;
      if (m.reviewStatus === "approved" || m.reviewStatus === "APPROVED") {
        statusBadge = `<span class="pill ok" style="font-size: 10px;">${isEn ? "Approved Fact" : "معتمد سريرياً"}</span>`;
      } else if (m.reviewStatus === "doctor_verified" || m.reviewStatus === "DOCTOR_VERIFIED") {
        statusBadge = `<span class="pill ok" style="font-size: 10px;">${isEn ? "Doctor-Verified" : "موثق من الطبيب"}</span>`;
      }

      // Gap preceding this reading
      const precedingGap = gapMap.get(measurementId);
      const gapNoticeHtml = precedingGap ? `
        <div class="ob-gap-alert-card" style="margin: 10px 0; padding: 8px 12px; background: rgba(240, 180, 41, 0.1); border: 1px dashed var(--amber, #f0b429); border-radius: 8px; font-size: 11.5px; color: var(--amber, #f0b429); display: flex; align-items: center; gap: 8px;">
          <span>⚠️</span>
          <span>${isEn ? `Monitoring Gap: ${precedingGap.gapDays} days without recorded measurements` : `انقطاع في المتابعة: ${precedingGap.gapDays} يوماً دون تسجيل قياسات`}</span>
        </div>
      ` : "";

      const isMissingMeasurement = !hasW;

      return `
        ${gapNoticeHtml}
        <div class="ob-timeline-card ${isMissingMeasurement ? 'ob-card-incomplete' : ''}" data-measurement-id="${escapeHtml(measurementId)}" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px;">
          <!-- Top Row: Source, Time Period, Date, Status -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span class="ob-source-badge pill ${src.pillClass}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px;">
                <span>${src.icon}</span>
                <span>${escapeHtml(srcLabel)}</span>
              </span>
              <span class="ob-period-badge" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11px; padding: 2px 7px; border-radius: 6px; background: rgba(9, 184, 182, 0.08); color: var(--teal);">
                <span>${period.icon}</span>
                <span>${escapeHtml(periodLabel)}</span>
              </span>
              ${statusBadge}
            </div>
            <time class="ob-reading-time" datetime="${escapeHtml(m.measurementTimestamp || m.measuredAt || m.createdAt || '')}" style="font-size: 11.5px; color: var(--muted);">
              ${escapeHtml(dtStr)}
            </time>
          </div>

          <!-- Middle Row: Measured Weight & Height vs Calculated BMI -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: center; background: var(--surface-2); padding: 12px 14px; border-radius: 10px;">
            <!-- Measured Weight -->
            <div>
              <div style="font-size: 10.5px; color: var(--muted); margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                <span class="pill info" style="font-size: 9px; padding: 0 4px;">${isEn ? "Direct Measurement" : "قياس مباشر"}</span>
                <span>${isEn ? "Measured Weight" : "الوزن المقاس"}</span>
              </div>
              <div class="ob-weight-reading" style="font-size: 22px; font-weight: 700; color: var(--ink);">
                <span class="ob-weight-val" style="color: #09b8b6;">${weightDisplay}</span>
                ${hasW ? `<span class="ob-unit-label" style="font-size: 12px; font-weight: 600; color: var(--muted); margin-inline-start: 4px;">${escapeHtml(wUnit)}</span>` : ""}
              </div>
            </div>

            <!-- Height -->
            <div>
              <div style="font-size: 10.5px; color: var(--muted); margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                <span class="pill info" style="font-size: 9px; padding: 0 4px;">${isEn ? "Height Parameter" : "معيار الطول"}</span>
                <span>${isEn ? "Stature" : "الطول"}</span>
              </div>
              <div style="font-size: 14px; font-weight: 600; color: var(--ink);">
                ${heightDisplay}
              </div>
            </div>

            <!-- Calculated BMI -->
            <div>
              <div style="font-size: 10.5px; color: var(--muted); margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                <span class="pill ok" style="font-size: 9px; padding: 0 4px;">${isEn ? "Derived Formula" : "معادلة مشتقة"}</span>
                <span>${isEn ? "Calculated BMI" : "مؤشر الكتلة (BMI)"}</span>
              </div>
              <div>
                ${bmiDisplay}
              </div>
            </div>
          </div>

          ${isMissingMeasurement ? `
            <div class="ob-incomplete-alert" style="margin-top: 8px; font-size: 11px; color: var(--amber); display: flex; align-items: center; gap: 4px;">
              <span>⚠️</span>
              <span>${isEn ? "Incomplete reading: missing weight value recorded." : "قياس غير مكتمل: قيمة الوزن مفقودة."}</span>
            </div>
          ` : ""}
        </div>
      `;
    });

    return `
      <div class="ob-timeline-container" role="feed" aria-label="${isEn ? 'Anthropometric measurement timeline' : 'السجل الزمني للقياسات الأنثروبومترية'}">
        ${cardsHtml.join("")}
      </div>
    `;
  }

  // =============================================================================
  // PATIENT-FACING HISTORY & TREND VIEW (Main Assembler)
  // =============================================================================

  /**
   * Renders the complete patient-facing weight and measurement history and trend dashboard view.
   *
   * @param {HTMLElement|string|object} target Container element or options
   * @param {object} options Configuration and data options
   * @returns {string} Rendered HTML
   */
  function renderPatientObesityTrendView(target, options = {}) {
    let container = null;
    let opts = options;
    if (target && typeof target === "object" && !target.nodeType && !opts.measurements && !opts.readings) {
      opts = target;
    } else if (typeof target === "string") {
      container = document.getElementById(target);
    } else if (target && target.nodeType) {
      container = target;
    }

    const isEn = Boolean(opts.isEn !== undefined ? opts.isEn : (global.currentLanguage === "en"));
    const rawMeasurements = Array.isArray(opts.measurements)
      ? opts.measurements
      : (Array.isArray(opts.readings) ? opts.readings : []);

    const persisted = rawMeasurements.filter(m => m && (m.measurementId || m.id || m.weight || m.weightKg));

    const currentPeriod = opts.filterPeriod || "all";
    const currentSource = opts.filterSource || "all";
    const currentRange = opts.filterRange || "all"; // "30d", "90d", "all"

    const filtered = filterMeasurements(persisted, {
      period: currentPeriod,
      source: currentSource,
      rangeDays: currentRange === "30d" ? 30 : (currentRange === "90d" ? 90 : 0)
    });

    // Statistical summary (Strictly observational arithmetic, NO diagnosis)
    const validWeights = filtered.filter(m => {
      const w = Number(m.weight !== undefined && m.weight !== null ? m.weight : m.weightKg);
      return !isNaN(w) && w > 0;
    });

    const n = validWeights.length;
    let sumWeightKg = 0;
    validWeights.forEach(m => {
      const w = Number(m.weight !== undefined && m.weight !== null ? m.weight : m.weightKg);
      const u = m.weightUnit || 'kg';
      const inKg = u === 'lbs' ? w * 0.45359237 : (u === 'g' ? w * 0.001 : w);
      sumWeightKg += inKg;
    });
    const avgWeight = n > 0 ? (Math.round((sumWeightKg / n) * 10) / 10) : null;

    // Latest measurement
    const sortedDesc = [...persisted].sort((a, b) => {
      const tA = new Date(a.measurementTimestamp || a.measuredAt || a.createdAt || 0).getTime();
      const tB = new Date(b.measurementTimestamp || b.measuredAt || b.createdAt || 0).getTime();
      return tB - tA;
    });
    const latest = sortedDesc.length > 0 ? sortedDesc[0] : null;
    const latestWeight = latest ? (latest.weight !== undefined && latest.weight !== null ? latest.weight : latest.weightKg) : null;
    const latestWeightUnit = latest ? (latest.weightUnit || 'kg') : 'kg';
    const latestBmi = latest && latest.bmi !== undefined && latest.bmi !== null ? latest.bmi : null;

    const gaps = detectObesityTrackingGaps(persisted, 30);

    const html = `
      <div class="patient-obesity-view ${isEn ? 'ltr-mode' : 'rtl-mode'}" dir="${isEn ? 'ltr' : 'rtl'}" style="width: 100%; max-width: 960px; margin: 0 auto; padding: 12px 0;">
        
        <!-- Module Header & Actions -->
        <div class="ob-view-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 26px;">⚖️</span>
              <h2 style="font-size: 20px; font-weight: 700; margin: 0; color: var(--ink);">
                ${isEn ? "Weight & Measurement History" : "سجل ومنحنى الوزن والقياسات"}
              </h2>
            </div>
            <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
              ${isEn ? "Longitudinal tracking of actual historical measurements, trend progression, and calculated BMI." : "متابعة القياسات التاريخية الفعلية، مسار تغير الوزن، ومؤشر كتلة الجسم المحسوب."}
            </p>
          </div>

          <div class="ob-header-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-outline" id="btnRefreshObMeasurements" style="padding: 7px 12px; font-size: 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); cursor: pointer;">
              <span>🔄</span> ${isEn ? "Refresh" : "تحديث"}
            </button>
            <button type="button" class="btn btn-primary" id="btnOpenLogObModal" style="padding: 7px 14px; font-size: 12px; border-radius: 8px; background: var(--teal); color: #07191b; font-weight: 600; border: none; cursor: pointer;">
              <span>➕</span> ${isEn ? "Log Measurement" : "تسجيل قياس جديد"}
            </button>
          </div>
        </div>

        <!-- Observational Summary Metric Cards (Purely arithmetic, NO automated diagnosis or risk claims) -->
        <div class="ob-metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <!-- Latest Measured Weight -->
          <div class="ob-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>⏱️</span> ${isEn ? "Latest Measured Weight" : "آخر وزن مقاس"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${latestWeight !== null ? `
                <span style="color: #09b8b6;">${latestWeight}</span> <span style="font-size: 12px; font-weight: normal; color: var(--muted);">${escapeHtml(latestWeightUnit)}</span>
              ` : `<span style="font-size: 13px; color: var(--muted);">${isEn ? "No readings yet" : "لا توجد قراءات"}</span>`}
            </div>
          </div>

          <!-- Average Measured Weight -->
          <div class="ob-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>📐</span> ${isEn ? "Average Weight" : "متوسط الوزن"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${avgWeight !== null ? `
                <span style="color: #09b8b6;">${avgWeight}</span> <span style="font-size: 12px; font-weight: normal; color: var(--muted);">kg</span>
              ` : `<span style="font-size: 13px; color: var(--muted);">--</span>`}
            </div>
          </div>

          <!-- Latest Calculated BMI (Strictly calculated, no diagnosis) -->
          <div class="ob-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>📐</span> ${isEn ? "Latest Calculated BMI" : "آخر مؤشر كتلة محسوب"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${latestBmi !== null ? `
                <span style="color: var(--teal); font-family: monospace;">${latestBmi}</span> <span style="font-size: 11px; font-weight: normal; color: var(--muted);">kg/m²</span>
              ` : `<span style="font-size: 11.5px; color: var(--muted); font-style: italic;">--</span>`}
            </div>
          </div>

          <!-- Total Persisted Records -->
          <div class="ob-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>📋</span> ${isEn ? "Total Persisted Records" : "إجمالي السجلات"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--ink);">
              ${persisted.length}
            </div>
          </div>

          <!-- Monitoring Gaps -->
          <div class="ob-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>⚠️</span> ${isEn ? "Tracking Gaps (>30d)" : "فترات الانقطاع (>٣٠ي)"}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: ${gaps.length > 0 ? 'var(--amber)' : 'var(--ink)'};">
              ${gaps.length}
            </div>
          </div>
        </div>

        <!-- Strict Clinical Boundary & Non-Diagnostic Advisory Banner -->
        <div class="ob-clinical-disclaimer-banner" role="note" style="background: rgba(9, 184, 182, 0.08); border: 1px solid var(--teal); border-radius: 10px; padding: 12px 14px; margin-bottom: 18px; display: flex; gap: 10px; align-items: flex-start;">
          <span style="font-size: 18px; line-height: 1;" aria-hidden="true">🛡️</span>
          <div style="font-size: 12px; line-height: 1.5; color: var(--ink);">
            <strong>${isEn ? "Observational Anthropometric Record Notice:" : "تنبيه السجل الأنثروبومتري الاسترعائي:"}</strong>
            <span>
              ${isEn
                ? "This weight and measurement history displays your recorded observations for self-monitoring only. It does not provide medical diagnoses, treatment recommendations, diet prescriptions, or automated classifications. Always discuss your measurements directly with your licensed physician."
                : "يعرض هذا السجل ومنحنى الاتجاه القياسات المسجلة لأغراض المتابعة الشخصية فقط. لا يقدم هذا العرض تشخيصاً طبياً أو توصيات علاجية أو وصفات غذائية أو تصنيفات تلقائية. استشر طبيبك المرخص دائماً لمناقشة سجلك الصحي."}
            </span>
          </div>
        </div>

        <!-- Trend Chart Section -->
        <div class="ob-chart-card-wrapper" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <h3 style="font-size: 15px; font-weight: 600; margin: 0; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>📈</span> ${isEn ? "Longitudinal Weight Trend" : "منحنى تغير الوزن والمسار الزمني"}
            </h3>
            <span style="font-size: 11px; color: var(--muted); background: var(--surface-2); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--line);">
              ${isEn ? "Unit: kg" : "الوحدة: كجم"}
            </span>
          </div>

          <!-- Dynamic SVG Chart (Gated strictly on >= 2 persisted measurements) -->
          <div id="patientObChartContainer">
            ${renderObesityTrendChartSvg(filtered, isEn)}
          </div>
        </div>

        <!-- Interactive Filters Toolbar -->
        <div class="ob-filters-bar" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <!-- Period Filters -->
          <div class="ob-filter-group" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 11.5px; color: var(--muted); font-weight: 600;">${isEn ? "Period:" : "الفترة:"}</span>
            <button type="button" class="ob-filter-pill ${currentPeriod === 'all' ? 'active' : ''}" data-filter-type="period" data-filter-val="all" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentPeriod === 'all' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentPeriod === 'all' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentPeriod === 'all' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "All Periods" : "كل الفترات"}
            </button>
            <button type="button" class="ob-filter-pill ${currentPeriod === 'morning' ? 'active' : ''}" data-filter-type="period" data-filter-val="morning" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentPeriod === 'morning' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentPeriod === 'morning' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentPeriod === 'morning' ? '600' : 'normal'}; cursor: pointer;">
              🌅 ${isEn ? "Morning" : "صباحاً"}
            </button>
            <button type="button" class="ob-filter-pill ${currentPeriod === 'evening' ? 'active' : ''}" data-filter-type="period" data-filter-val="evening" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentPeriod === 'evening' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentPeriod === 'evening' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentPeriod === 'evening' ? '600' : 'normal'}; cursor: pointer;">
              🌆 ${isEn ? "Evening" : "مساءً"}
            </button>
          </div>

          <!-- Date Range Filters -->
          <div class="ob-filter-group" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 11.5px; color: var(--muted); font-weight: 600;">${isEn ? "Range:" : "المدى:"}</span>
            <button type="button" class="ob-filter-pill ${currentRange === '30d' ? 'active' : ''}" data-filter-type="range" data-filter-val="30d" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentRange === '30d' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentRange === '30d' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentRange === '30d' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "30 Days" : "٣٠ يوماً"}
            </button>
            <button type="button" class="ob-filter-pill ${currentRange === '90d' ? 'active' : ''}" data-filter-type="range" data-filter-val="90d" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentRange === '90d' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentRange === '90d' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentRange === '90d' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "90 Days" : "٩٠ يوماً"}
            </button>
            <button type="button" class="ob-filter-pill ${currentRange === 'all' ? 'active' : ''}" data-filter-type="range" data-filter-val="all" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--line); background: ${currentRange === 'all' ? 'var(--teal)' : 'var(--surface)'}; color: ${currentRange === 'all' ? '#07191b' : 'var(--ink)'}; font-weight: ${currentRange === 'all' ? '600' : 'normal'}; cursor: pointer;">
              ${isEn ? "All" : "الكل"}
            </button>
          </div>
        </div>

        <!-- Chronological Timeline Section -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 15px; font-weight: 600; margin: 0; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span>📋</span> ${isEn ? "Chronological Measurement Timeline" : "السجل الزمني للقياسات"}
          </h3>
          <span style="font-size: 12px; color: var(--muted);">
            ${isEn ? `${filtered.length} entries` : `${filtered.length} سجل`}
          </span>
        </div>

        <!-- Timeline Feed -->
        <div id="patientObTimelineContainer">
          ${renderObesityTimeline(filtered, isEn, { order: "newest_first" })}
        </div>

        <!-- Detailed Table View -->
        <div style="margin-top: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0; font-size: 14px; color: var(--ink);">
              ${isEn ? "Tabular Measurement Records" : "سجل القياسات التفصيلي (جدول)"}
            </h4>
            <span class="pill info" style="font-size: 10.5px;">
              ${isEn ? "Auditable History" : "سجل قابل للتدقيق"}
            </span>
          </div>
          ${renderHistoricalMeasurementsTable(filtered, isEn)}
        </div>
      </div>
    `;

    if (container) {
      container.innerHTML = html;
      attachObesityTrendViewInteractions(container, {
        measurements: persisted,
        isEn,
        filterPeriod: currentPeriod,
        filterSource: currentSource,
        filterRange: currentRange
      });
    }

    return html;
  }

  /**
   * Attaches interactive click listeners for filter pills and action buttons in trend view.
   */
  function attachObesityTrendViewInteractions(container, state = {}) {
    if (!container || typeof container.querySelectorAll !== "function") return;

    // Filter pills
    const pills = container.querySelectorAll(".ob-filter-pill");
    pills.forEach(pill => {
      pill.onclick = () => {
        const fType = pill.getAttribute("data-filter-type");
        const fVal = pill.getAttribute("data-filter-val");
        const nextState = { ...state };
        if (fType === "period") nextState.filterPeriod = fVal;
        if (fType === "range") nextState.filterRange = fVal;
        renderPatientObesityTrendView(container, nextState);
      };
    });

    // Refresh button
    const refreshBtn = container.querySelector("#btnRefreshObMeasurements");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        if (typeof state.onRefresh === "function") {
          state.onRefresh();
        }
      };
    }

    // Log button
    const logBtn = container.querySelector("#btnOpenLogObModal");
    if (logBtn) {
      logBtn.onclick = () => {
        const recordTabBtn = document.querySelector('[data-ob-tab="record"]');
        if (recordTabBtn) {
          recordTabBtn.click();
        }
      };
    }
  }

  /**
   * Main Obesity & Metabolic Health Module Screen Renderer.
   */
  function renderObesityScreen(container, state = {}) {
    if (!container) return;

    const isEn = Boolean(state.isEn);
    const measurements = Array.isArray(state.measurements) ? state.measurements : [];
    const activeTab = state.activeTab || "measurements";
    const currentCase = state.currentCase || (Array.isArray(state.cases) && state.cases[0]) || null;
    const isDoctor = Boolean(state.currentUser && (state.currentUser.role === "doctor" || state.isDoctor));

    container.innerHTML = `
      <div class="obesity-module-wrapper" style="max-width: 960px; margin: 0 auto;">
        ${renderClinicalGuardrailBanner(isEn)}

        <!-- Top Navigation Tabs -->
        <div class="ob-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid var(--line); margin-bottom: 20px; overflow-x: auto; padding-bottom: 4px;">
          <button type="button" class="ob-tab-btn soft-button ${activeTab === "measurements" ? "active" : ""}" data-ob-tab="measurements" style="font-size: 13px; font-weight: 600;">
            <span>⚖️</span> ${isEn ? "Anthropometric History" : "سجل القياسات الأنثروبومترية"} (${measurements.length})
          </button>
          <button type="button" class="ob-tab-btn soft-button ${activeTab === "record" ? "active" : ""}" data-ob-tab="record" style="font-size: 13px; font-weight: 600;">
            <span>➕</span> ${isEn ? "Record Measurement" : "تسجيل قياس جديد"}
          </button>
          <button type="button" class="ob-tab-btn soft-button ${activeTab === "lifestyle" ? "active" : ""}" data-ob-tab="lifestyle" style="font-size: 13px; font-weight: 600;">
            <span>🏃</span> ${isEn ? "Lifestyle & Nutrition" : "نمط الحياة والتغذية"}
          </button>
          <button type="button" class="ob-tab-btn soft-button ${activeTab === "doctor_review" ? "active" : ""}" data-ob-tab="doctor_review" style="font-size: 13px; font-weight: 600;">
            <span>🩺</span> ${isEn ? "Doctor Review & Follow-Up" : "مراجعة الطبيب والمتابعة"}
          </button>
        </div>

        <!-- Tab 1: Measurements History & Trends -->
        <div class="ob-tab-content" id="obTabMeasurements" style="display: ${activeTab === "measurements" ? "block" : "none"};">
          ${renderPatientObesityTrendView({ measurements, isEn })}
        </div>

        <!-- Tab 2: Record Measurement Form -->
        <div class="ob-tab-content" id="obTabRecord" style="display: ${activeTab === "record" ? "block" : "none"};">
          <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px;">
            <h4 style="margin: 0 0 14px; font-size: 16px; color: var(--ink);">
              ${isEn ? "Record Structured Height & Weight Measurement" : "تسجيل قياس منظم للطول والوزن"}
            </h4>

            <form id="obRecordMeasurementForm" onsubmit="return false;">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 14px;">
                <!-- Height and Unit -->
                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 4px;">
                    ${isEn ? "Height Value & Unit" : "قيمة ووحدة الطول"}
                  </label>
                  <div style="display: flex; gap: 6px;">
                    <input type="number" id="obInputHeight" step="0.1" placeholder="${isEn ? "e.g. 175" : "مثال: 175"}" style="flex: 2; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 13px;" />
                    <select id="obInputHeightUnit" style="flex: 1; padding: 8px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 13px;">
                      <option value="cm">cm (سم)</option>
                      <option value="m">m (متر)</option>
                      <option value="in">in (بوصة)</option>
                    </select>
                  </div>
                  <small style="color: var(--muted); font-size: 11px; margin-top: 3px; display: block;">
                    ${isEn ? "Leave blank to reuse latest valid height if on file." : "اتركه فارغاً لاستخدام آخر طول معتمد مسجل."}
                  </small>
                </div>

                <!-- Weight and Unit -->
                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 4px;">
                    ${isEn ? "Weight Value & Unit" : "قيمة ووحدة الوزن"} <span style="color: #ef4444;">*</span>
                  </label>
                  <div style="display: flex; gap: 6px;">
                    <input type="number" id="obInputWeight" step="0.1" placeholder="${isEn ? "e.g. 82.5" : "مثال: 82.5"}" required style="flex: 2; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 13px;" />
                    <select id="obInputWeightUnit" style="flex: 1; padding: 8px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 13px;">
                      <option value="kg">kg (كجم)</option>
                      <option value="lbs">lbs (رطل)</option>
                      <option value="g">g (جرام)</option>
                    </select>
                  </div>
                </div>

                <!-- Measurement Source -->
                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 4px;">
                    ${isEn ? "Measurement Source" : "مصدر القياس"}
                  </label>
                  <select id="obInputSource" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 13px;">
                    <option value="patient_self_report">${isEn ? "Patient Self-Report" : "تسجيل المريض الذاتي"}</option>
                    <option value="clinical_scale">${isEn ? "Clinical Scale (In-Clinic)" : "ميزان سريري داخل العيادة"}</option>
                    <option value="smart_scale">${isEn ? "Smart Scale / Bluetooth" : "ميزان ذكي متصل"}</option>
                    <option value="in_clinic">${isEn ? "In-Clinic Observation" : "قياس عيادي موثق"}</option>
                    <option value="medical_ocr">${isEn ? "Medical Document OCR" : "استخراج ضوئي من وثيقة"}</option>
                  </select>
                </div>
              </div>

              <!-- Measurement Timestamp -->
              <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 4px;">
                  ${isEn ? "Measurement Date & Time" : "تاريخ وتوقيت القياس"}
                </label>
                <input type="datetime-local" id="obInputTimestamp" style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 13px;" />
              </div>

              <!-- Live Dynamic BMI Display (Only when valid height and weight available) -->
              <div style="background: var(--surface-2); padding: 14px 18px; border-radius: 10px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div>
                  <strong style="font-size: 13px; color: var(--teal); display: block;">
                    ${isEn ? "Dynamic Calculated BMI:" : "مؤشر كتلة الجسم المحسوب آلياً:"}
                  </strong>
                  <span style="font-size: 11px; color: var(--muted);">
                    ${isEn
                      ? "Calculated dynamically: weight(kg) / height(m)². Never fabricated or assumed."
                      : "يُحسب آلياً: الوزن(كجم) / مربع الطول(م). لا يُصطنع ولا يُفترض أبداً."}
                  </span>
                </div>
                <div id="obLiveBmiPreview" style="font-size: 18px; font-weight: 700; color: var(--ink); font-family: monospace;">
                  -- kg/m²
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button type="submit" id="obBtnSaveMeasurement" class="solid-button" style="padding: 9px 20px; font-size: 13px; font-weight: 600; background: var(--teal); color: #07191b;">
                  <span>💾</span> ${isEn ? "Save Measurement to History" : "حفظ القياس في السجل الطبي"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Tab 3: Lifestyle & Nutrition -->
        <div class="ob-tab-content" id="obTabLifestyle" style="display: ${activeTab === "lifestyle" ? "block" : "none"};">
          <h4 style="margin: 0 0 12px; font-size: 15px; color: var(--ink);">
            ${isEn ? "Documented Lifestyle & Nutrition Factors" : "عوامل نمط الحياة والتغذية الموثقة"}
          </h4>
          ${renderLifestyleSummary(currentCase ? currentCase.lifestyle : (measurements[measurements.length - 1]?.lifestyle), isEn)}
        </div>

        <!-- Tab 4: Doctor Review & Follow-Up -->
        <div class="ob-tab-content" id="obTabDoctorReview" style="display: ${activeTab === "doctor_review" ? "block" : "none"};">
          <h4 style="margin: 0 0 12px; font-size: 15px; color: var(--ink);">
            ${isEn ? "Attending Physician Clinical Evaluation & Approved Protocol" : "التقييم السريري للطبيب المعالج والبروتوكول المعتمد"}
          </h4>
          ${renderDoctorReviewAndFollowUp(currentCase, isEn, isDoctor)}
        </div>
      </div>
    `;

    attachObesityListeners(container, state);
  }

  /**
   * Attaches interactive listeners to tab buttons and live dynamic BMI calculations.
   */
  function attachObesityListeners(container, state = {}) {
    if (!container || typeof container.querySelectorAll !== "function") return;

    // Tabs
    container.querySelectorAll(".ob-tab-btn").forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute("data-ob-tab");
        renderObesityScreen(container, { ...state, activeTab: tab });
      };
    });

    // Default timestamp to current local time if empty
    const timestampInput = container.querySelector("#obInputTimestamp");
    if (timestampInput && !timestampInput.value) {
      try {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        timestampInput.value = now.toISOString().slice(0, 16);
      } catch (e) {}
    }

    // Live Dynamic BMI calculation on input
    const heightInput = container.querySelector("#obInputHeight");
    const heightUnitSelect = container.querySelector("#obInputHeightUnit");
    const weightInput = container.querySelector("#obInputWeight");
    const weightUnitSelect = container.querySelector("#obInputWeightUnit");
    const previewEl = container.querySelector("#obLiveBmiPreview");

    function updatePreview() {
      if (!previewEl || !heightInput || !weightInput) return;
      const hRaw = Number(heightInput.value);
      const wRaw = Number(weightInput.value);
      const hUnit = heightUnitSelect?.value || 'cm';
      const wUnit = weightUnitSelect?.value || 'kg';

      let heightCm = null;
      if (hRaw > 0) {
        if (hUnit === 'm') heightCm = hRaw * 100;
        else if (hUnit === 'in') heightCm = hRaw * 2.54;
        else heightCm = hRaw;
      }

      let weightKg = null;
      if (wRaw > 0) {
        if (wUnit === 'lbs') weightKg = wRaw * 0.45359237;
        else if (wUnit === 'g') weightKg = wRaw * 0.001;
        else weightKg = wRaw;
      }

      if (heightCm > 0 && weightKg > 0 && heightCm >= 40 && heightCm <= 260 && weightKg >= 15 && weightKg <= 450) {
        const heightM = heightCm / 100;
        const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
        previewEl.textContent = `${bmi} kg/m²`;
        previewEl.style.color = "var(--teal)";
      } else {
        previewEl.textContent = "-- kg/m²";
        previewEl.style.color = "var(--ink)";
      }
    }

    if (heightInput && weightInput) {
      heightInput.oninput = updatePreview;
      weightInput.oninput = updatePreview;
      if (heightUnitSelect) heightUnitSelect.onchange = updatePreview;
      if (weightUnitSelect) weightUnitSelect.onchange = updatePreview;
    }

    // Form submit
    const form = container.querySelector("#obRecordMeasurementForm");
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const heightVal = heightInput.value ? Number(heightInput.value) : null;
        const heightUnitVal = heightUnitSelect?.value || 'cm';
        const weightVal = Number(weightInput.value);
        const weightUnitVal = weightUnitSelect?.value || 'kg';
        const source = container.querySelector("#obInputSource")?.value || "patient_self_report";
        const measuredAtVal = timestampInput?.value ? new Date(timestampInput.value).toISOString() : new Date().toISOString();

        const payload = {
          height: heightVal,
          heightUnit: heightUnitVal,
          weight: weightVal,
          weightUnit: weightUnitVal,
          measurementTimestamp: measuredAtVal,
          measuredAt: measuredAtVal,
          measurementSource: source,
          useExistingMeasurements: true
        };

        if (typeof state.onRecordMeasurement === "function") {
          await state.onRecordMeasurement(payload);
        } else if (typeof global.recordObesityMeasurementClient === "function") {
          await global.recordObesityMeasurementClient(payload);
        }
      };
    }

    // Trend view interactions in active tab
    attachObesityTrendViewInteractions(container, {
      measurements: state.measurements || [],
      isEn: Boolean(state.isEn),
      onRecordMeasurement: state.onRecordMeasurement
    });
  }

  const ObesityUI = {
    escapeHtml,
    formatDateTime,
    formatShortDate,
    getTimePeriod,
    getSourceInfo,
    filterMeasurements,
    detectObesityTrackingGaps,
    renderClinicalGuardrailBanner,
    renderHistoricalMeasurementsTable,
    renderLifestyleSummary,
    renderDoctorReviewAndFollowUp,
    renderObesityTrendChartSvg,
    renderObesityTimeline,
    renderPatientObesityTrendView,
    attachObesityTrendViewInteractions,
    renderObesityScreen
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ObesityUI = ObesityUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ObesityUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
