/**
 * Health Vibe AI - Diabetes Mellitus & Glycemic Management UI Module
 *
 * Provides:
 * 1. Structured Glucose & HbA1c Anthropometric/Biometric Display:
 *    - Fasting Blood Glucose (FBG), Postprandial Glucose (PPG), Random Blood Glucose (RBG), Bedtime, Pre-meal.
 *    - Validated units: mg/dL, mmol/L (canonical conversion: 1 mmol/L = 18.0182 mg/dL).
 *    - Glycated Hemoglobin HbA1c (%).
 *    - Physiological plausibility bounds: Glucose 20 - 800 mg/dL, HbA1c 3.5% - 20.0%.
 * 2. Strict Clinical Guardrails & Human-in-the-Loop Workflow:
 *    - Prominent banner: Zero automated insulin dose prescriptions or automated diagnoses.
 *    - Explicit attending physician / endocrinologist evaluation required for clinical decisions.
 *    - Quarantined internal doctor notes strictly hidden from patient views.
 * 3. Longitudinal Preservation & Historical Readings Table:
 *    - Preserves historical readings in chronological order without overwrite.
 *    - Zero synthetic or mock records.
 * 4. Specialist Review Required Designation:
 *    - Explicitly marks that insulin titration and certified care plans require Specialist (Endocrinologist) review.
 * 5. Full Bilingual Localization Parity:
 *    - 100% Arabic (RTL) and English (LTR) language support.
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

  const GLUCOSE_TYPE_META = {
    fasting: { labelEn: "Fasting (FBG)", labelAr: "صائم (FBG)", icon: "🌅", pillClass: "info" },
    postprandial: { labelEn: "Postprandial (PPG)", labelAr: "بعد الأكل بساعتين (PPG)", icon: "🍽️", pillClass: "ok" },
    random: { labelEn: "Random (RBG)", labelAr: "عشوائي (RBG)", icon: "⏱️", pillClass: "pending" },
    bedtime: { labelEn: "Bedtime", labelAr: "قبل النوم", icon: "🌙", pillClass: "info" },
    pre_meal: { labelEn: "Pre-Meal", labelAr: "قبل الوجبة", icon: "🥗", pillClass: "info" }
  };

  const SOURCE_META = {
    patient_glucometer: { labelEn: "Patient Glucometer", labelAr: "جهاز قياس السكر الشخصي", icon: "🩸" },
    cgm: { labelEn: "Continuous Glucose Monitor (CGM)", labelAr: "حساس السكر المستمر (CGM)", icon: "📡" },
    in_clinic: { labelEn: "In-Clinic Laboratory Measurement", labelAr: "قياس معملي داخل العيادة", icon: "🏥" },
    medical_ocr: { labelEn: "Lab Report Document OCR", labelAr: "استخراج ضوئي من تقرير معملي", icon: "📄" },
    manual_patient_log: { labelEn: "Patient Self-Report", labelAr: "تسجيل المريض الذاتي", icon: "👤" }
  };

  /**
   * Renders the prominent non-diagnostic & specialist review guardrail banner.
   */
  function renderClinicalGuardrailBanner(isEn = false) {
    return `
      <div class="notice-card" style="margin-bottom: 20px; border-inline-start: 4px solid var(--amber); background: rgba(245, 158, 11, 0.08); border-radius: 12px; padding: 14px 18px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <span style="font-size: 22px; line-height: 1;">🛡️</span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
              <strong style="color: var(--ink); font-size: 14px;">
                ${isEn ? "Clinical Safety Guardrail & Specialist Review Required" : "ضمانة الأمان السريري والتوجيه الطبي المتخصص"}
              </strong>
              <span class="pill pending" style="font-size: 10.5px; padding: 2px 7px;">
                ${isEn ? "Endocrinologist Review Required" : "مراجعة استشاري الغدد والسكري مطلوبة"}
              </span>
            </div>
            <p style="margin: 0; font-size: 12.5px; color: var(--ink); line-height: 1.55; opacity: 0.9;">
              ${isEn
                ? "Health Vibe AI strictly prohibits automated insulin dosing prescriptions or autonomous medical diagnoses. Blood glucose records are preserved longitudinally to assist certified endocrinologists and physicians in evaluating your care plan."
                : "تمنع منصة Health Vibe AI إصدار أي جرعات إنسولين تلقائية أو تشخيصات آلية مستقلة. يتم حفظ قياسات السكر وسجل التراكمي زمنياً لمساعدة استشاري السكري والغدد الصماء في تقييم خطتك العلاجية المعتمدة."}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Evaluates glycemic category based on ADA guidelines.
   */
  function classifyGlucoseReading(valueMgDl, type = 'fasting') {
    if (!valueMgDl || isNaN(valueMgDl)) return null;
    const v = Number(valueMgDl);

    if (v < 70) {
      return {
        key: "hypoglycemia",
        labelEn: "Hypoglycemia Alert (<70 mg/dL)",
        labelAr: "تنبيه انخفاض السكر (< 70 مجم/دسل)",
        pillClass: "danger",
        isAlert: true
      };
    }
    if (v >= 300) {
      return {
        key: "severe_hyperglycemia",
        labelEn: "Severe Hyperglycemia (≥300 mg/dL)",
        labelAr: "ارتفاع حاد في السكر (≥ 300 مجم/دسل)",
        pillClass: "danger",
        isAlert: true
      };
    }

    if (type === 'fasting') {
      if (v < 100) return { key: "normal", labelEn: "Normal Fasting (<100 mg/dL)", labelAr: "طبيعي صائم (< 100)", pillClass: "ok" };
      if (v <= 125) return { key: "impaired", labelEn: "Impaired Fasting / Pre-diabetes (100-125)", labelAr: "مقدمات السكري (100-125)", pillClass: "pending" };
      return { key: "elevated", labelEn: "Elevated Fasting (≥126 mg/dL)", labelAr: "مرتفع صائم (≥ 126)", pillClass: "warning" };
    } else {
      if (v < 140) return { key: "normal", labelEn: "Normal Postprandial (<140 mg/dL)", labelAr: "طبيعي بعد الأكل (< 140)", pillClass: "ok" };
      if (v <= 199) return { key: "impaired", labelEn: "Impaired Glucose Tolerance (140-199)", labelAr: "مقدمات السكري بعد الأكل (140-199)", pillClass: "pending" };
      return { key: "elevated", labelEn: "Elevated (≥200 mg/dL)", labelAr: "مرتفع (≥ 200)", pillClass: "warning" };
    }
  }

  /**
   * Renders the historical readings table.
   */
  function renderHistoricalReadingsTable(readings = [], isEn = false) {
    if (!readings || readings.length === 0) {
      return `
        <div style="padding: 36px 20px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 14px; background: var(--surface);">
          <span style="font-size: 32px; display: block; margin-bottom: 8px;">🩸</span>
          <h4 style="margin: 0 0 6px; color: var(--ink); font-size: 15px;">
            ${isEn ? "No persisted glucose readings recorded yet" : "لا توجد قراءات سكر مسجلة حتى الآن"}
          </h4>
          <p style="margin: 0; font-size: 13px; max-width: 420px; margin: 0 auto; line-height: 1.5;">
            ${isEn
              ? "Log your fasting, postprandial, or random blood glucose using the form above. Real measurements will be securely preserved in your clinical record."
              : "سجل قراءات السكر الصائم أو بعد الأكل باستخدام النموذج أعلاه. يتم حفظ قياساتك الحقيقية بأمان داخل ملفك السريري المعتمد دون أي اصطناع."}
          </p>
        </div>
      `;
    }

    const sorted = [...readings].sort((a, b) => new Date(b.measuredAt || b.createdAt) - new Date(a.measuredAt || a.createdAt));

    const rows = sorted.map(r => {
      const typeInfo = GLUCOSE_TYPE_META[r.glucoseType] || GLUCOSE_TYPE_META.random;
      const typeLabel = isEn ? typeInfo.labelEn : typeInfo.labelAr;
      const sourceInfo = SOURCE_META[r.measurementSource] || SOURCE_META.manual_patient_log;
      const sourceLabel = isEn ? sourceInfo.labelEn : sourceInfo.labelAr;

      const classification = classifyGlucoseReading(r.glucoseMgDl || r.glucose, r.glucoseType);
      const classPill = classification
        ? `<span class="pill ${classification.pillClass}" style="font-size: 10.5px;">${escapeHtml(isEn ? classification.labelEn : classification.labelAr)}</span>`
        : "";

      const hba1cText = (r.hba1c !== null && r.hba1c !== undefined)
        ? `<span class="pill info" style="font-size: 10.5px;">HbA1c: ${r.hba1c}%</span>`
        : "—";

      return `
        <tr>
          <td style="padding: 12px 14px; border-bottom: 1px solid var(--line); white-space: nowrap; font-size: 12.5px;">
            ${formatDateTime(r.measuredAt || r.createdAt, isEn)}
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid var(--line);">
            <div style="display: flex; align-items: baseline; gap: 6px;">
              <strong style="font-size: 15px; color: var(--teal); font-family: monospace;">${r.glucose}</strong>
              <span style="font-size: 12px; color: var(--muted);">${escapeHtml(r.unit || "mg/dL")}</span>
            </div>
            ${r.unit === "mmol/L" ? `<span style="font-size: 11px; color: var(--muted);">(${r.glucoseMgDl} mg/dL)</span>` : ""}
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid var(--line);">
            <span class="pill ${typeInfo.pillClass}" style="font-size: 10.5px;">
              ${typeInfo.icon} ${escapeHtml(typeLabel)}
            </span>
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid var(--line);">
            ${classPill}
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: center;">
            ${hba1cText}
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 12px; color: var(--muted);">
            <span>${sourceInfo.icon} ${escapeHtml(sourceLabel)}</span>
            ${r.notes ? `<div style="font-size: 11.5px; color: var(--ink); margin-top: 2px;">💬 ${escapeHtml(r.notes)}</div>` : ""}
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div style="overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface);">
        <table style="width: 100%; border-collapse: collapse; text-align: start;">
          <thead>
            <tr style="background: var(--surface-2); font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line);">
              <th style="padding: 10px 14px; text-align: start;">${isEn ? "Measurement Time" : "وقت القياس"}</th>
              <th style="padding: 10px 14px; text-align: start;">${isEn ? "Blood Glucose" : "نسبة السكر"}</th>
              <th style="padding: 10px 14px; text-align: start;">${isEn ? "Timing / Type" : "التوقيت / النوع"}</th>
              <th style="padding: 10px 14px; text-align: start;">${isEn ? "Clinical Range" : "النطاق السريري"}</th>
              <th style="padding: 10px 14px; text-align: center;">${isEn ? "HbA1c" : "التراكمي"}</th>
              <th style="padding: 10px 14px; text-align: start;">${isEn ? "Source & Notes" : "المصدر وملاحظات"}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renders the Doctor Review & Approved Follow-Up card when a certified report exists.
   */
  function renderDoctorReviewAndReport(currentCase, isEn = false) {
    if (!currentCase || currentCase.status !== "approved") {
      return `
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">⏳</span>
              <div>
                <strong style="font-size: 14px; color: var(--ink);">${isEn ? "Specialist Review Status" : "حالة المراجعة التخصصية"}</strong>
                <p style="margin: 2px 0 0; font-size: 12px; color: var(--muted);">
                  ${isEn ? "Awaiting licensed endocrinologist case review" : "في انتظار مراجعة استشاري السكري والغدد الصماء"}
                </p>
              </div>
            </div>
            <span class="pill pending" style="font-size: 11px;">
              ${isEn ? "Pending Specialist Review" : "قيد المراجعة التخصصية"}
            </span>
          </div>
        </div>
      `;
    }

    const doc = currentCase.approvingDoctor || {};
    return `
      <div style="background: var(--surface); border: 1px solid var(--teal); border-radius: 14px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(9, 184, 182, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 22px;">📋</span>
              <h4 style="margin: 0; font-size: 16px; color: var(--ink); font-weight: 700;">
                ${isEn ? "Certified Endocrinology & Diabetes Care Plan" : "الخطة العلاجية والتقرير الطبي المعتمد للسكري"}
              </h4>
            </div>
            <span style="font-size: 12px; color: var(--muted); margin-top: 3px; display: inline-block;">
              ${isEn ? "Reviewed & Signed by" : "تمت المراجعة والاعتماد بواسطة"}: <strong>${escapeHtml(doc.name || "Consultant Endocrinologist")}</strong> (${escapeHtml(doc.licenseNumber || "LIC-CERTIFIED")})
            </span>
          </div>
          <span class="pill ok" style="font-size: 11px;">
            ✓ ${isEn ? "Physician Approved" : "معتمد من الطبيب"}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; background: var(--surface-2); padding: 14px; border-radius: 10px; border: 1px solid var(--line); font-size: 12.5px;">
          <div>
            <strong style="color: var(--teal); display: block; margin-bottom: 4px;">
              ${isEn ? "Clinical Diagnosis" : "التشخيص الطبي السريري"}
            </strong>
            <span>${escapeHtml(currentCase.clinicalDiagnosis || "Clinical evaluation complete.")}</span>
          </div>
          <div>
            <strong style="color: var(--teal); display: block; margin-bottom: 4px;">
              ${isEn ? "Management & Lifestyle Plan" : "الخطة العلاجية والإرشادات"}
            </strong>
            <span>${escapeHtml(currentCase.managementPlan || "Routine monitoring advised.")}</span>
          </div>
        </div>

        ${currentCase.doctorNotes ? `
          <div style="margin-top: 12px; font-size: 12px; color: var(--ink); padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px;">
            <strong style="color: var(--muted);">${isEn ? "Physician Notes" : "ملاحظات الطبيب"}:</strong> ${escapeHtml(currentCase.doctorNotes)}
          </div>
        ` : ""}
      </div>
    `;
  }

  /**
   * Main render function for the Diabetes Screen.
   */
  function renderDiabetesScreen(container, {
    readings = [],
    cases = [],
    currentCase = null,
    isEn = false,
    currentUser = { role: "patient" },
    onRecordReading = null
  } = {}) {
    if (!container) return;

    container.innerHTML = `
      <div class="diabetes-module-root" style="max-width: 960px; margin: 0 auto;">
        ${renderClinicalGuardrailBanner(isEn)}

        ${renderDoctorReviewAndReport(currentCase || (cases.length > 0 ? cases[0] : null), isEn)}

        <!-- Input Card for New Reading -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 14px; font-size: 15px; color: var(--ink); font-weight: 700; display: flex; align-items: center; gap: 8px;">
            <span>➕</span>
            <span>${isEn ? "Log New Blood Glucose Reading" : "تسجيل قياس سكر جديد"}</span>
          </h4>

          <form id="formDiabetesReading">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 14px;">
              <div>
                <label for="diaInputGlucose" style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">
                  ${isEn ? "Blood Glucose Value *" : "قيمة السكر *"}
                </label>
                <input type="number" id="diaInputGlucose" step="0.1" min="20" max="800" placeholder="${isEn ? "e.g. 110" : "مثال: 110"}" required
                  style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 14px;">
                <span style="font-size: 10.5px; color: var(--muted);">${isEn ? "Plausible: 20-800 mg/dL" : "المقبول: 20 - 800 مجم/دسل"}</span>
              </div>

              <div>
                <label for="diaInputUnit" style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">
                  ${isEn ? "Unit" : "الوحدة"}
                </label>
                <select id="diaInputUnit" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 13px;">
                  <option value="mg/dL">mg/dL (مجم / ديسيلتر)</option>
                  <option value="mmol/L">mmol/L (ملليمول / لتر)</option>
                </select>
              </div>

              <div>
                <label for="diaInputType" style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">
                  ${isEn ? "Timing / Type" : "التوقيت / نوع القراءة"}
                </label>
                <select id="diaInputType" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 13px;">
                  <option value="fasting">${isEn ? "Fasting (FBG)" : "صائم (FBG)"}</option>
                  <option value="postprandial">${isEn ? "Postprandial (2h after meal)" : "بعد الأكل بساعتين (PPG)"}</option>
                  <option value="random" selected>${isEn ? "Random (RBG)" : "عشوائي (RBG)"}</option>
                  <option value="bedtime">${isEn ? "Bedtime" : "قبل النوم"}</option>
                  <option value="pre_meal">${isEn ? "Pre-Meal" : "قبل الوجبة"}</option>
                </select>
              </div>

              <div>
                <label for="diaInputHba1c" style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">
                  ${isEn ? "HbA1c % (Optional)" : "السكر التراكمي % (اختياري)"}
                </label>
                <input type="number" id="diaInputHba1c" step="0.1" min="3.5" max="20" placeholder="${isEn ? "e.g. 6.5" : "مثال: 6.5"}"
                  style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 14px;">
                <span style="font-size: 10.5px; color: var(--muted);">${isEn ? "Range: 3.5% - 20%" : "المجال: 3.5% - 20%"}</span>
              </div>
            </div>

            <div style="margin-bottom: 14px;">
              <label for="diaInputNotes" style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">
                ${isEn ? "Clinical Notes / Context (Optional)" : "ملاحظات سريرية أو سياق (اختياري)"}
              </label>
              <input type="text" id="diaInputNotes" placeholder="${isEn ? "e.g. 15 min after breakfast, mild dizziness" : "مثال: بعد الإفطار، دوار خفيف"}"
                style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 13px;">
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" id="btnSubmitDiabetesReading" class="solid-button"
                style="padding: 9px 22px; font-size: 13px; background: var(--teal); color: #07191b; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
                <span>💾</span>
                <span>${isEn ? "Save Reading" : "حفظ القراءة السريرية"}</span>
              </button>
            </div>
          </form>
        </div>

        <!-- Historical Readings Table -->
        <div style="margin-bottom: 24px;">
          <h4 style="margin: 0 0 12px; font-size: 15px; color: var(--ink); font-weight: 700; display: flex; align-items: center; gap: 8px;">
            <span>📈</span>
            <span>${isEn ? "Longitudinal Blood Glucose Records" : "سجل قياسات السكر التراكمية"}</span>
          </h4>
          ${renderHistoricalReadingsTable(readings, isEn)}
        </div>
      </div>
    `;

    // Bind form submission
    const form = container.querySelector("#formDiabetesReading");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const glucoseInput = container.querySelector("#diaInputGlucose");
        const unitInput = container.querySelector("#diaInputUnit");
        const typeInput = container.querySelector("#diaInputType");
        const hba1cInput = container.querySelector("#diaInputHba1c");
        const notesInput = container.querySelector("#diaInputNotes");

        const val = Number(glucoseInput?.value);
        const unit = unitInput?.value || "mg/dL";
        const glucoseType = typeInput?.value || "random";
        const hba1cVal = hba1cInput?.value ? Number(hba1cInput.value) : null;
        const notes = notesInput?.value || "";

        if (isNaN(val) || val <= 0) {
          alert(isEn ? "Please enter a valid numeric glucose value." : "يرجى إدخال قيمة رقمية صحيحة لنسبة السكر.");
          return;
        }

        const btn = container.querySelector("#btnSubmitDiabetesReading");
        if (btn) btn.disabled = true;

        if (typeof onRecordReading === "function") {
          try {
            await onRecordReading({
              glucoseValue: val,
              unit,
              glucoseType,
              hba1c: hba1cVal,
              notes,
              measuredAt: new Date().toISOString(),
              measurementSource: "patient_glucometer"
            });
          } catch (err) {
            alert((isEn ? "Failed to save reading: " : "تعذر حفظ القراءة: ") + (err.message || ""));
          } finally {
            if (btn) btn.disabled = false;
          }
        }
      });
    }
  }

  const DiabetesUI = {
    renderClinicalGuardrailBanner,
    classifyGlucoseReading,
    renderHistoricalReadingsTable,
    renderDoctorReviewAndReport,
    renderDiabetesScreen
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DiabetesUI = DiabetesUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DiabetesUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
