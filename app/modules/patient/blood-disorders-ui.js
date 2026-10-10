/**
 * Health Vibe AI - Blood Clotting & Blood Disorders UI Module
 *
 * Provides:
 * 1. Multi-Condition Clinical Registry & Medical Reviewer Specification View.
 *    - Recognizes that "blood clotting" encompasses distinct hematological conditions
 *      (Thrombosis, Thrombophilia, Anticoagulation, Bleeding Disorders, Thrombocytopenia).
 *    - Allows medical reviewers to review, define, and customize supported conditions and required fields.
 * 2. Structured Patient Information & Clinical Intake Display.
 * 3. Structured Laboratory Results Table (using only persisted real lab measurements).
 * 4. Human Physician Review & Certified Report Display (strictly NO automated diagnoses).
 * 5. Structured Follow-up Protocols (repeat lab dates, monitoring frequency, red-flag precautions).
 * 6. Responsive, fully localized Arabic (RTL) and English (LTR) interface.
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
        day: "numeric"
      });
    } catch (e) {
      return String(isoString).substring(0, 10);
    }
  }

  const CATEGORY_META = {
    THROMBOSIS: { icon: "🩸", labelEn: "Venous / Arterial Thrombosis", labelAr: "التخثر وتجلط الأوردة والشرايين", color: "#f06060" },
    THROMBOPHILIA: { icon: "🧬", labelEn: "Thrombophilia & Hypercoagulability", labelAr: "أهبة التخثر وفرط التجلط", color: "#818cf8" },
    ANTICOAGULATION: { icon: "💊", labelEn: "Anticoagulation Monitoring", labelAr: "متابعة أدوية السيولة ومضادات التخثر", color: "#09b8b6" },
    BLEEDING: { icon: "🩹", labelEn: "Coagulopathies & Bleeding Disorders", labelAr: "اضطرابات النزف واعتلالات التخثر", color: "#f0b429" },
    PLATELET: { icon: "🔬", labelEn: "Platelet Disorders & Thrombocytopenia", labelAr: "اضطرابات ونقص الصفائح الدموية", color: "#38bdf8" }
  };

  /**
   * Renders the Multi-Condition Clinical Registry cards.
   */
  function renderConditionsRegistry(conditions = [], isEn = false, isDoctor = false) {
    if (!conditions || conditions.length === 0) {
      return `
        <div class="empty-conditions-card" style="padding: 24px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 12px;">
          <p>${isEn ? "No condition specifications registered yet." : "لا توجد مواصفات سريرية مسجلة بعد."}</p>
        </div>
      `;
    }

    const cardsHtml = conditions.map(cond => {
      const cat = CATEGORY_META[cond.category] || CATEGORY_META.THROMBOSIS;
      const catLabel = isEn ? cat.labelEn : cat.labelAr;
      const name = isEn ? cond.nameEn : cond.nameAr;
      const desc = isEn ? cond.descriptionEn : cond.descriptionAr;
      const isUnderReview = cond.status === "UNDER_SPECIALIST_REVIEW";
      const statusPill = isUnderReview
        ? `<span class="pill pending" style="font-size: 11px;">${isEn ? "Under Specialist Review" : "قيد المراجعة التخصصية"}</span>`
        : `<span class="pill ok" style="font-size: 11px;">${isEn ? "Active Supported" : "معتمد وسارٍ"}</span>`;

      const reqFields = cond.requiredClinicalFields || [];
      const reqLabs = cond.requiredLabPanels || [];

      return `
        <div class="condition-spec-card" data-condition-id="${escapeHtml(cond.conditionId)}" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">${cat.icon}</span>
                <h4 style="margin: 0; font-size: 16px; color: var(--ink); font-weight: 700;">${escapeHtml(name)}</h4>
              </div>
              <span style="font-size: 11.5px; color: var(--muted); margin-top: 3px; display: inline-block;">
                ${escapeHtml(catLabel)} • <span style="font-family: monospace;">v${cond.specificationVersion || 1}</span>
              </span>
            </div>
            <div>
              ${statusPill}
            </div>
          </div>

          <p style="font-size: 13px; color: var(--ink); line-height: 1.5; margin: 0 0 12px;">
            ${escapeHtml(desc)}
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; background: var(--surface-2); padding: 12px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 12px; font-size: 11.5px;">
            <div>
              <strong style="color: var(--teal); display: block; margin-bottom: 4px;">
                📝 ${isEn ? "Required Clinical Intake Fields:" : "الحقول السريرية المطلوبة:"}
              </strong>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${reqFields.map(f => `<span style="background: var(--surface); border: 1px solid var(--line); padding: 2px 6px; border-radius: 4px; color: var(--muted);">${escapeHtml(f)}</span>`).join("")}
              </div>
            </div>
            <div>
              <strong style="color: var(--teal); display: block; margin-bottom: 4px;">
                🧪 ${isEn ? "Required Laboratory Panels:" : "التحاليل المخبرية المطلوبة:"}
              </strong>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${reqLabs.map(l => `<span style="background: var(--surface); border: 1px solid var(--line); padding: 2px 6px; border-radius: 4px; color: var(--ink); font-weight: 600;">${escapeHtml(l)}</span>`).join("")}
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--muted);">
            <div>
              <span>📚 ${isEn ? "Guidelines Reference: " : "المرجع الإرشادي: "}</span>
              <strong>${escapeHtml(cond.clinicalGuidelinesRef || "ISTH / ASH / CHEST")}</strong>
            </div>
            ${isDoctor ? `
              <button type="button" class="btn btn-outline btn-sm" onclick="openConditionEditorModal('${escapeHtml(cond.conditionId)}')" style="padding: 4px 10px; font-size: 11px; border-radius: 6px; background: var(--surface); border: 1px solid var(--teal); color: var(--teal); cursor: pointer;">
                ✏️ ${isEn ? "Review / Customize Specification" : "مراجعة وتخصيص المواصفة"}
              </button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="conditions-registry-container">
        <div style="background: rgba(9, 184, 182, 0.08); border: 1px solid var(--teal); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
          <h4 style="margin: 0 0 4px; font-size: 14px; color: var(--teal-2); display: flex; align-items: center; gap: 6px;">
            <span>🛡️</span> ${isEn ? "Multi-Condition Medical Foundation Notice" : "تنبيه التأسيس السريري متعدد الحالات"}
          </h4>
          <p style="margin: 0; font-size: 12.5px; color: var(--ink); line-height: 1.5;">
            ${isEn
              ? "Blood clotting is not a single uniform disease. This module is structured to accommodate distinct categories: Venous Thromboembolism, Inherited Thrombophilia, Anticoagulant Monitoring, Bleeding Coagulopathies, and Platelet Disorders. Licensed medical reviewers define the required fields and lab panels prior to clinical logic implementation."
              : "تجلط الدم لا يمثل مرضاً واحداً منفرداً. تم تصميم هذه الوحدة لاستيعاب فئات سريرية متعددة تشمل: الانصمام الخثاري الوريدي، أهبة التخثر وفرط التجلط، متابعة مضادات التخثر، اضطرابات النزف، ونقص الصفائح الدموية. يحدد المراجعون الأطباء الحقول والتحاليل المطلوبة قبل تفعيل المنطق السريري."}
          </p>
        </div>
        ${cardsHtml}
      </div>
    `;
  }

  /**
   * Renders the structured laboratory results table.
   * Uses only authentic, persisted measurements.
   */
  function renderLaboratoryResultsTable(labResults = [], isEn = false) {
    if (!Array.isArray(labResults) || labResults.length === 0) {
      return `
        <div class="empty-labs-notice" style="padding: 20px; text-align: center; background: var(--surface-2); border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 12.5px;">
          <span>🧪</span> ${isEn ? "No laboratory results recorded for this case yet. Upload verified lab report or enter results." : "لا توجد نتائج تحاليل مخبرية مسجلة لهذه الحالة بعد. أرفق تقرير المختبر المعتمد أو أدخل النتائج."}
        </div>
      `;
    }

    const rowsHtml = labResults.map((lab, idx) => {
      const code = escapeHtml(lab.testCode || "");
      const name = isEn ? (lab.testName || code) : (lab.testNameAr || lab.testName || code);
      const val = lab.value;
      const unit = escapeHtml(lab.unit || "");
      const ref = lab.referenceRange ? (lab.referenceRange.low !== undefined && lab.referenceRange.high !== undefined ? `${lab.referenceRange.low} - ${lab.referenceRange.high} ${unit}` : JSON.stringify(lab.referenceRange)) : "--";
      const dt = formatDateTime(lab.collectedAt, isEn);
      const sourceLab = escapeHtml(lab.reportingLab || "Clinical Laboratory");

      return `
        <tr style="border-bottom: 1px solid var(--line);">
          <td style="padding: 10px 12px; font-weight: 700; color: var(--teal); font-family: monospace;">${code}</td>
          <td style="padding: 10px 12px; color: var(--ink);">${escapeHtml(name)}</td>
          <td style="padding: 10px 12px; font-weight: 700; color: var(--ink); font-size: 14px;">${val}</td>
          <td style="padding: 10px 12px; color: var(--muted); font-size: 12px;">${unit}</td>
          <td style="padding: 10px 12px; color: var(--muted); font-size: 12px;">${ref}</td>
          <td style="padding: 10px 12px; color: var(--muted); font-size: 11.5px;">${dt}</td>
          <td style="padding: 10px 12px; color: var(--muted); font-size: 11.5px;">${sourceLab}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="lab-results-table-wrap" style="overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 10px;">
        <table class="lab-results-table" style="width: 100%; border-collapse: collapse; text-align: start; font-size: 13px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px;">
          <thead>
            <tr style="background: var(--surface-2); border-bottom: 1.5px solid var(--line); color: var(--muted); font-size: 12px;">
              <th style="padding: 10px 12px;">${isEn ? "Test Code" : "رمز التحليل"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Test Name" : "اسم التحليل"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Value" : "النتيجة"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Unit" : "الوحدة"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Reference Range" : "النطاق المرجعي"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Date" : "التاريخ"}</th>
              <th style="padding: 10px 12px;">${isEn ? "Performing Lab" : "المختبر"}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renders the complete Blood Disorders Module view.
   */
  function renderBloodDisordersScreen(target, options = {}) {
    let container = null;
    let opts = options;
    if (target && typeof target === "object" && !target.nodeType && !opts.conditions) {
      opts = target;
    } else if (typeof target === "string") {
      container = document.getElementById(target);
    } else if (target && target.nodeType) {
      container = target;
    }

    const isEn = Boolean(opts.isEn !== undefined ? opts.isEn : (global.currentLanguage === "en"));
    const activeTab = opts.activeTab || "conditions"; // 'conditions' | 'cases' | 'new_case'
    const conditions = Array.isArray(opts.conditions) ? opts.conditions : [];
    const cases = Array.isArray(opts.cases) ? opts.cases : [];
    const currentUser = opts.currentUser || {};
    const isDoctor = currentUser.role === "doctor";

    const html = `
      <div class="blood-disorders-view ${isEn ? 'ltr-mode' : 'rtl-mode'}" dir="${isEn ? 'ltr' : 'rtl'}" style="width: 100%; max-width: 960px; margin: 0 auto;">
        
        <!-- Module Header -->
        <div class="bd-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 18px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 28px;">🩹</span>
              <div>
                <h2 style="font-size: 20px; font-weight: 700; margin: 0; color: var(--ink);">
                  ${isEn ? "Blood Clotting & Blood Disorders Module" : "وحدة تجلط الدم واعتلالات واضطرابات الدم"}
                </h2>
                <span style="font-size: 12.5px; color: var(--muted);">
                  ${isEn ? "Clinical Hematology Foundation • Multi-Condition Architecture" : "المنظومة السريرية لأمراض الدم • بنية متعددة الحالات"}
                </span>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-outline" id="btnRefreshBdModule" style="padding: 7px 12px; font-size: 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); cursor: pointer;">
              🔄 ${isEn ? "Refresh" : "تحديث"}
            </button>
            <button type="button" class="btn btn-primary" id="btnNewBdCase" style="padding: 7px 14px; font-size: 12px; border-radius: 8px; background: var(--teal); color: #07191b; font-weight: 600; border: none; cursor: pointer;">
              ➕ ${isEn ? "New Case Intake" : "تسجيل حالة جديدة"}
            </button>
          </div>
        </div>

        <!-- Non-Diagnostic Human Oversight Notice -->
        <div class="bd-boundary-alert" role="note" style="background: rgba(9, 184, 182, 0.08); border: 1px solid var(--teal); border-radius: 12px; padding: 12px 14px; margin-bottom: 18px; display: flex; gap: 10px; align-items: flex-start;">
          <span style="font-size: 18px; line-height: 1;" aria-hidden="true">🛡️</span>
          <div style="font-size: 12px; line-height: 1.5; color: var(--ink);">
            <strong>${isEn ? "Clinical Boundary & Non-Diagnostic Oversight:" : "إطار الأمان السريري والإشراف الطبي:"}</strong>
            <span>
              ${isEn
                ? "This module supports structured clinical information, authentic laboratory results, human doctor review, and verified reports. It does NOT generate automatic AI diagnoses or fabricate laboratory values. Diagnosis, anticoagulation plans, and reports are established solely by certified physicians."
                : "تدعم هذه الوحدة تنظيم البيانات السريرية، نتائج التحاليل المخبرية الفعلية، مراجعة الطبيب البشري، والتقارير المعتمدة. لا تنشئ المنظومة أي تشخيصات تلقائية ولا تصطنع نتائج مخبرية. يتم تحديد التشخيص وخطة العلاج والمتابعة حصرياً عبر الأطباء المعتمدين."}
            </span>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="bd-tabs" style="display: flex; gap: 8px; border-bottom: 1.5px solid var(--line); margin-bottom: 18px; padding-bottom: 6px; overflow-x: auto;">
          <button type="button" class="bd-tab-btn ${activeTab === 'conditions' ? 'active' : ''}" data-bd-tab="conditions" style="padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 8px; border: none; background: ${activeTab === 'conditions' ? 'var(--teal)' : 'transparent'}; color: ${activeTab === 'conditions' ? '#07191b' : 'var(--muted)'}; cursor: pointer;">
            📑 ${isEn ? "Supported Conditions & Reviewer Registry" : "المكتبة السريرية لحالات واعتلالات الدم"}
          </button>
          <button type="button" class="bd-tab-btn ${activeTab === 'cases' ? 'active' : ''}" data-bd-tab="cases" style="padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 8px; border: none; background: ${activeTab === 'cases' ? 'var(--teal)' : 'transparent'}; color: ${activeTab === 'cases' ? '#07191b' : 'var(--muted)'}; cursor: pointer;">
            📋 ${isEn ? "Clinical Cases & Intake Records" : "سجلات الحالات والتحاليل"}
          </button>
        </div>

        <!-- Tab Content Body -->
        <div class="bd-tab-body">
          ${activeTab === 'conditions' ? renderConditionsRegistry(conditions, isEn, isDoctor) : ''}
          ${activeTab === 'cases' ? renderCasesList(cases, isEn) : ''}
        </div>
      </div>
    `;

    if (container) {
      container.innerHTML = html;
      attachBdListeners(container, opts);
    }

    return html;
  }

  function renderCasesList(cases = [], isEn = false) {
    if (!cases || cases.length === 0) {
      return `
        <div style="padding: 32px 16px; text-align: center; background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; color: var(--muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">📋</div>
          <h4 style="margin: 0 0 4px; font-size: 14px; color: var(--ink);">
            ${isEn ? "No Blood Disorder Cases Recorded" : "لا توجد حالات مسجلة لاعتلالات الدم"}
          </h4>
          <p style="margin: 0; font-size: 12.5px;">
            ${isEn ? "Click 'New Case Intake' to record clinical history and verified lab results." : "اضغط على 'تسجيل حالة جديدة' لإدخال التاريخ السريري ونتائج التحاليل المعتمدة."}
          </p>
        </div>
      `;
    }

    const cardsHtml = cases.map(c => {
      const statusPill = c.status === "approved"
        ? `<span class="pill ok">${isEn ? "Approved by Doctor" : "معتمد من الطبيب 🟢"}</span>`
        : `<span class="pill pending">${isEn ? "Pending Review" : "قيد المراجعة الطبية ⏳"}</span>`;

      const condName = isEn ? c.conditionNameEn : c.conditionNameAr;
      const labsCount = Array.isArray(c.laboratoryResults) ? c.laboratoryResults.length : 0;
      const dt = formatDateTime(c.createdAt, isEn);

      return `
        <div class="bd-case-item-card" data-case-id="${escapeHtml(c.id)}" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
            <div>
              <strong style="font-size: 15px; color: var(--ink);">${escapeHtml(condName)}</strong>
              <div style="font-size: 11.5px; color: var(--muted); margin-top: 2px;">
                <span>#${escapeHtml(c.id)}</span> • <span>${dt}</span>
              </div>
            </div>
            <div>
              ${statusPill}
            </div>
          </div>

          <div style="font-size: 12.5px; color: var(--ink); margin-bottom: 10px; background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <strong>${isEn ? "Indication: " : "دواعي الاستشارة: "}</strong>
            <span>${escapeHtml(c.clinicalIntake?.indication || "--")}</span>
            • <span>${isEn ? `Labs: ${labsCount} tests` : `التحاليل: ${labsCount} فحص`}</span>
          </div>

          ${c.clinicalDiagnosis ? `
            <div style="font-size: 12px; color: var(--teal); margin-bottom: 10px; padding: 6px 10px; background: rgba(9,184,182,0.08); border-radius: 6px;">
              <strong>👨‍⚕️ ${isEn ? "Physician Diagnosis: " : "تشخيص الطبيب المعالج: "}</strong>
              <span>${escapeHtml(c.clinicalDiagnosis)}</span>
              ${c.reportRef ? `<span style="margin-inline-start: 6px; font-family: monospace;">(#${escapeHtml(c.reportRef)})</span>` : ''}
            </div>
          ` : ''}

          <div style="display: flex; justify-content: flex-end;">
            <button type="button" class="btn btn-outline btn-sm" onclick="viewBloodDisorderCase('${escapeHtml(c.id)}')" style="padding: 5px 12px; font-size: 12px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); cursor: pointer;">
              ${isEn ? "View Details & Labs" : "عرض التفاصيل والتحاليل"}
            </button>
          </div>
        </div>
      `;
    }).join("");

    return `<div>${cardsHtml}</div>`;
  }

  function attachBdListeners(container, state = {}) {
    if (!container) return;

    // Tab buttons
    container.querySelectorAll(".bd-tab-btn").forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute("data-bd-tab");
        renderBloodDisordersScreen(container, { ...state, activeTab: tab });
      };
    });

    // Refresh
    const refreshBtn = container.querySelector("#btnRefreshBdModule");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        if (typeof global.loadBloodDisordersModule === "function") {
          global.loadBloodDisordersModule();
        }
      };
    }
  }

  const BloodDisordersUI = {
    CATEGORY_META,
    escapeHtml,
    formatDateTime,
    renderConditionsRegistry,
    renderLaboratoryResultsTable,
    renderBloodDisordersScreen
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.BloodDisordersUI = BloodDisordersUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = BloodDisordersUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
