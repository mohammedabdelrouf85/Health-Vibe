/**
 * HEALTH VIBE AI: CLINICAL CONTENT MANAGEMENT SYSTEM (Clinical CMS) UI MODULE
 * Benchmark: Isabel Healthcare Clinical Knowledge & Dual-Language Guidance Governance
 * 
 * Features:
 * 1. KPI Counter Cards (Total, Published, In Review, Approved, Draft, Red Flags, Parity Rate).
 * 2. Multi-Criteria Filter & Search Toolbar.
 * 3. Responsive Data Table with Dual-Language Title Preview, Badges, and Action Triggers.
 * 4. Dual-Column Bilingual Guideline Editor Modal (Arabic RTL & English LTR).
 * 5. Clinical Review & Approval Modal with Peer Feedback.
 * 6. Side-by-Side Version Diff & Audit History Drawer.
 * 7. CSV Export Engine.
 */

(function (global) {
  "use strict";

  const Service = (global.HealthVibes && global.HealthVibes.ClinicalCmsService) || 
                  (typeof require !== "undefined" ? require("./clinical-cms-service") : null);

  let currentContainerId = "adminClinicalCmsContainer";
  let activeFilters = {
    status: "all",
    category: "all",
    conditionScope: "all",
    evidenceLevel: "all",
    search: "",
    sortBy: "date_desc"
  };

  let currentUser = {
    uid: "user-clinical-qa",
    name: "د. هدى منصور",
    role: "clinical_qa"
  };

  function getCategoryLabel(category) {
    const map = {
      triage_protocol: "بروتوكول فرز (Triage)",
      red_flags: "علامات خطورة (Red Flags)",
      discharge_care: "رعاية خروج (Discharge)",
      home_treatment: "علاج ومتابعة منزلية (Home Care)",
      referral_criteria: "معايير إحالة عاجلة (Referral)",
      emergency_warning: "إنذار طوارئ (Emergency)"
    };
    return map[category] || category;
  }

  function getScopeLabel(scope) {
    const map = {
      respiratory_triage: "فرز الطوارئ والأعراض التنفسية",
      hypoxemia: "نقص الأكسجة وSpO2",
      pneumonia_covid: "الالتهاب الرئوي والفيروسي",
      pediatric: "طب الأطفال والرضع",
      general_emergency: "طوارئ عامة",
      cardiovascular: "القلب والأوعية الدموية"
    };
    return map[scope] || scope;
  }

  function getStatusBadgeHtml(status) {
    switch (status) {
      case "published":
        return `<span class="cms-badge cms-badge-published">🟢 منشورة بالإنتاج (Published)</span>`;
      case "in_review":
        return `<span class="cms-badge cms-badge-in_review">🟡 قيد المراجعة (In Review)</span>`;
      case "approved":
        return `<span class="cms-badge cms-badge-approved">🔵 معتمدة سريرياً (Approved)</span>`;
      case "draft":
        return `<span class="cms-badge cms-badge-draft">⚪ مسودة (Draft)</span>`;
      case "rejected":
        return `<span class="cms-badge cms-badge-rejected">🔴 مرفوضة / طلب تعديل (Rejected)</span>`;
      case "archived":
        return `<span class="cms-badge cms-badge-archived">📦 مؤرشفة (Archived)</span>`;
      default:
        return `<span class="cms-badge">${status}</span>`;
    }
  }

  function getEvidenceBadgeHtml(level) {
    if (level === "Grade_A_High") {
      return `<span class="cms-chip cms-chip-grade-a">⭐ Grade A (دليل عالي)</span>`;
    }
    if (level === "Grade_B_Moderate") {
      return `<span class="cms-chip">🔹 Grade B (متوسط)</span>`;
    }
    return `<span class="cms-chip">🔸 ${level}</span>`;
  }

  /**
   * Main render function
   */
  function renderClinicalCmsPanel(containerId = "adminClinicalCmsContainer") {
    currentContainerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Service) {
      container.innerHTML = `<div class="cms-panel-card"><p style="color:#ef4444;">خطأ: لم يتم تحميل خدمة ClinicalCmsService.</p></div>`;
      return;
    }

    const metrics = Service.getSummaryMetrics();
    const guidelines = Service.getGuidelines(activeFilters);

    container.innerHTML = `
      <section class="cms-panel-card" id="clinicalCmsMainCard">
        <!-- Header Row -->
        <div class="cms-header-row">
          <div class="cms-title-box">
            <h3>
              <span>📚</span>
              <span>نظام إدارة ومراجعة محتوى التوصيات الطبية (Clinical CMS)</span>
              <span class="cms-chip" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.3);">
                معيار Isabel Healthcare
              </span>
            </h3>
            <p>منظومة حوكمة النصوص الإرشادية والتوصيات السريرية باللغتين العربية والإنجليزية ضمن مسار موافقة سريري موثق</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="cms-btn cms-btn-outline" id="btnExportCmsCsv">
              <span>📥</span> تصدير السجل (CSV)
            </button>
            <button type="button" class="cms-btn cms-btn-primary" id="btnAddNewGuideline">
              <span>➕</span> إضافة توصية جديدة (New)
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div class="cms-metrics-grid">
          <div class="cms-metric-chip">
            <span>إجمالي التوصيات</span>
            <strong>${metrics.total}</strong>
            <small style="color: var(--text-muted);">كافة الحالات المسجلة</small>
          </div>
          <div class="cms-metric-chip" style="border-color: rgba(16, 185, 129, 0.25);">
            <span>منشورة بالإنتاج (Published)</span>
            <strong style="color: #34d399;">${metrics.published}</strong>
            <small style="color: #34d399;">فعالة في محرك الفرز</small>
          </div>
          <div class="cms-metric-chip" style="border-color: rgba(245, 158, 11, 0.25);">
            <span>قيد المراجعة (In Review)</span>
            <strong style="color: #fbbf24;">${metrics.inReview}</strong>
            <small style="color: #fbbf24;">بانتظار اعتماد الجودة</small>
          </div>
          <div class="cms-metric-chip" style="border-color: rgba(14, 165, 233, 0.25);">
            <span>معتمدة جاهزة للنشر</span>
            <strong style="color: #38bdf8;">${metrics.approved}</strong>
            <small style="color: #38bdf8;">اجتازت المراجعة</small>
          </div>
          <div class="cms-metric-chip">
            <span>مسودات قيد التحرير</span>
            <strong style="color: #d1d5db;">${metrics.draft}</strong>
            <small style="color: var(--text-muted);">مسودات أولية</small>
          </div>
          <div class="cms-metric-chip" style="border-color: rgba(239, 68, 68, 0.25);">
            <span>علامات خطورة مفعلة</span>
            <strong style="color: #f87171;">${metrics.redFlagsCount}</strong>
            <small style="color: #f87171;">Red Flag Alerts</small>
          </div>
          <div class="cms-metric-chip" style="border-color: rgba(6, 182, 212, 0.25);">
            <span>تطابق اللغتين (Parity)</span>
            <strong style="color: #22d3ee;">${metrics.parityRatePct}%</strong>
            <small style="color: #22d3ee;">Isabel Dual-Lang Rate</small>
          </div>
        </div>

        <!-- Filter Toolbar -->
        <div class="cms-toolbar">
          <div class="cms-search-input-wrap">
            <input type="text" class="cms-search-input" id="cmsSearchInput" 
                   placeholder="بحث بالعربية أو الإنجليزية (الأعراض، التوصيات، المعايير...)" 
                   value="${activeFilters.search || ''}">
          </div>

          <select class="cms-select" id="cmsFilterStatus">
            <option value="all" ${activeFilters.status === 'all' ? 'selected' : ''}>كافة الحالات (All Status)</option>
            <option value="published" ${activeFilters.status === 'published' ? 'selected' : ''}>منشورة (Published)</option>
            <option value="in_review" ${activeFilters.status === 'in_review' ? 'selected' : ''}>قيد المراجعة (In Review)</option>
            <option value="approved" ${activeFilters.status === 'approved' ? 'selected' : ''}>معتمدة (Approved)</option>
            <option value="draft" ${activeFilters.status === 'draft' ? 'selected' : ''}>مسودات (Draft)</option>
            <option value="rejected" ${activeFilters.status === 'rejected' ? 'selected' : ''}>مرفوضة (Rejected)</option>
            <option value="archived" ${activeFilters.status === 'archived' ? 'selected' : ''}>مؤرشفة (Archived)</option>
          </select>

          <select class="cms-select" id="cmsFilterCategory">
            <option value="all" ${activeFilters.category === 'all' ? 'selected' : ''}>كافة التصنيفات (All Categories)</option>
            <option value="triage_protocol" ${activeFilters.category === 'triage_protocol' ? 'selected' : ''}>بروتوكولات فرز (Triage)</option>
            <option value="red_flags" ${activeFilters.category === 'red_flags' ? 'selected' : ''}>علامات خطورة (Red Flags)</option>
            <option value="discharge_care" ${activeFilters.category === 'discharge_care' ? 'selected' : ''}>رعاية خروج (Discharge)</option>
            <option value="home_treatment" ${activeFilters.category === 'home_treatment' ? 'selected' : ''}>علاج ومتابعة منزلية (Home Care)</option>
            <option value="referral_criteria" ${activeFilters.category === 'referral_criteria' ? 'selected' : ''}>معايير إحالة (Referral)</option>
          </select>

          <select class="cms-select" id="cmsFilterScope">
            <option value="all" ${activeFilters.conditionScope === 'all' ? 'selected' : ''}>كافة النطاقات السريرية (All Scopes)</option>
            <option value="respiratory_triage" ${activeFilters.conditionScope === 'respiratory_triage' ? 'selected' : ''}>فرز الأعراض التنفسية</option>
            <option value="hypoxemia" ${activeFilters.conditionScope === 'hypoxemia' ? 'selected' : ''}>نقص الأكسجة وSpO2</option>
            <option value="pneumonia_covid" ${activeFilters.conditionScope === 'pneumonia_covid' ? 'selected' : ''}>الالتهاب الرئوي والفيروسي</option>
            <option value="pediatric" ${activeFilters.conditionScope === 'pediatric' ? 'selected' : ''}>طب الأطفال والرضع</option>
            <option value="general_emergency" ${activeFilters.conditionScope === 'general_emergency' ? 'selected' : ''}>طوارئ عامة</option>
          </select>

          <select class="cms-select" id="cmsSortBy">
            <option value="date_desc" ${activeFilters.sortBy === 'date_desc' ? 'selected' : ''}>الأحدث تحديثاً (Newest First)</option>
            <option value="date_asc" ${activeFilters.sortBy === 'date_asc' ? 'selected' : ''}>الأقدم تحديثاً (Oldest First)</option>
            <option value="title_ar" ${activeFilters.sortBy === 'title_ar' ? 'selected' : ''}>العنوان أبجدياً (أ-ي)</option>
            <option value="title_en" ${activeFilters.sortBy === 'title_en' ? 'selected' : ''}>Title (A-Z)</option>
            <option value="version_desc" ${activeFilters.sortBy === 'version_desc' ? 'selected' : ''}>رقم الإصدار (Version)</option>
          </select>

          <button type="button" class="cms-btn cms-btn-outline" id="btnResetCmsFilters" title="إعادة تعيين الفلاتر">
            <span>🔄</span> تفريغ
          </button>
        </div>

        <!-- Guidelines Data Table -->
        <div class="cms-table-wrapper">
          <table class="cms-table">
            <thead>
              <tr>
                <th>معرف التوصية والإصدار</th>
                <th>العنوان السريري الثنائي (AR / EN)</th>
                <th>التصنيف والنطاق السريري</th>
                <th>مستوى الدليل والجمهور</th>
                <th>الحالة والمسار</th>
                <th>آخر تحديث</th>
                <th style="text-align: center;">الإجراءات السريرية</th>
              </tr>
            </thead>
            <tbody>
              ${renderTableRows(guidelines)}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Mount point for Modals -->
      <div id="cmsModalRoot"></div>
    `;

    bindEvents();
  }

  function renderTableRows(guidelines) {
    if (!guidelines || guidelines.length === 0) {
      return `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px; color: var(--text-muted);">
            <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
            <strong style="font-size: 14px; color: var(--text-primary);">لم يتم العثور على توصيات تطابق معايير البحث</strong>
            <p style="margin: 4px 0 0; font-size: 12px;">جرب تغيير خيارات التصفية أو البحث عن مصطلح سريري آخر.</p>
          </td>
        </tr>
      `;
    }

    return guidelines.map(g => {
      const isRedFlag = g.category === "red_flags";
      return `
        <tr data-guideline-id="${g.id}">
          <td>
            <div style="font-family: monospace; font-size: 11.5px; font-weight: 700; color: #38bdf8;">${g.id}</div>
            <div style="display: inline-block; margin-top: 3px; font-size: 11px; padding: 1px 6px; background: rgba(255,255,255,0.06); border-radius: 4px; color: #e5e7eb;">${g.version}</div>
          </td>
          <td>
            <div class="cms-guideline-title-wrap">
              <span class="cms-guideline-title-ar">${g.titleAr}</span>
              <span class="cms-guideline-title-en">${g.titleEn}</span>
            </div>
          </td>
          <td>
            <div>
              <span class="cms-chip ${isRedFlag ? 'cms-chip-redflags' : ''}">${getCategoryLabel(g.category)}</span>
            </div>
            <small style="color: var(--text-muted); font-size: 11px; display: block; margin-top: 3px;">
              ${getScopeLabel(g.conditionScope)}
            </small>
          </td>
          <td>
            <div>${getEvidenceBadgeHtml(g.evidenceLevel)}</div>
            <small style="color: var(--text-muted); font-size: 11px; display: block; margin-top: 3px;">
              الجمهور: ${g.targetAudience}
            </small>
          </td>
          <td>
            <div>${getStatusBadgeHtml(g.status)}</div>
            <small style="color: var(--text-muted); font-size: 10.5px; display: block; margin-top: 3px;">
              ${g.approver?.name ? `معتمد بواسطة: ${g.approver.name}` : (g.status === 'in_review' ? 'بانتظار الاعتماد' : 'مسودة قيد العمل')}
            </small>
          </td>
          <td>
            <span style="font-size: 11.5px; color: #d1d5db;">${(g.updatedAt || g.createdAt || '').split('T')[0]}</span>
            <small style="display: block; font-size: 10px; color: var(--text-muted);">${(g.updatedAt || '').split('T')[1]?.substring(0, 5) || ''}</small>
          </td>
          <td>
            <div class="cms-actions-cell">
              <button type="button" class="cms-action-icon-btn btn-cms-edit" data-id="${g.id}" title="تعديل المحتوى (Edit)">
                <span>✏️</span> تعديل
              </button>
              ${g.status === 'in_review' || g.status === 'draft' || g.status === 'approved' ? `
                <button type="button" class="cms-action-icon-btn btn-cms-review" data-id="${g.id}" title="مراجعة واعتماد (Review & Approve)" style="background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #34d399;">
                  <span>📋</span> مراجعة
                </button>
              ` : ''}
              <button type="button" class="cms-action-icon-btn btn-cms-diff" data-id="${g.id}" title="سجل الإصدارات والمقارنة (Diff)">
                <span>🔀</span> مقارنة
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function bindEvents() {
    const container = document.getElementById(currentContainerId);
    if (!container) return;

    // Search input
    const searchInput = container.querySelector("#cmsSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        activeFilters.search = e.target.value;
        refreshTableOnly();
      });
    }

    // Status filter
    const statusSelect = container.querySelector("#cmsFilterStatus");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        activeFilters.status = e.target.value;
        refreshTableOnly();
      });
    }

    // Category filter
    const categorySelect = container.querySelector("#cmsFilterCategory");
    if (categorySelect) {
      categorySelect.addEventListener("change", (e) => {
        activeFilters.category = e.target.value;
        refreshTableOnly();
      });
    }

    // Scope filter
    const scopeSelect = container.querySelector("#cmsFilterScope");
    if (scopeSelect) {
      scopeSelect.addEventListener("change", (e) => {
        activeFilters.conditionScope = e.target.value;
        refreshTableOnly();
      });
    }

    // SortBy
    const sortSelect = container.querySelector("#cmsSortBy");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        activeFilters.sortBy = e.target.value;
        refreshTableOnly();
      });
    }

    // Reset Filters
    const resetBtn = container.querySelector("#btnResetCmsFilters");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        activeFilters = {
          status: "all",
          category: "all",
          conditionScope: "all",
          evidenceLevel: "all",
          search: "",
          sortBy: "date_desc"
        };
        renderClinicalCmsPanel(currentContainerId);
      });
    }

    // Add New
    const addBtn = container.querySelector("#btnAddNewGuideline");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        openEditGuidelineModal(null);
      });
    }

    // Export CSV
    const exportBtn = container.querySelector("#btnExportCmsCsv");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        handleExportCsv();
      });
    }

    // Action buttons inside table (delegation)
    container.addEventListener("click", (e) => {
      const editBtn = e.target.closest(".btn-cms-edit");
      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        openEditGuidelineModal(id);
        return;
      }

      const reviewBtn = e.target.closest(".btn-cms-review");
      if (reviewBtn) {
        const id = reviewBtn.getAttribute("data-id");
        openReviewGuidelineModal(id);
        return;
      }

      const diffBtn = e.target.closest(".btn-cms-diff");
      if (diffBtn) {
        const id = diffBtn.getAttribute("data-id");
        openDiffGuidelineModal(id);
        return;
      }
    });
  }

  function refreshTableOnly() {
    const container = document.getElementById(currentContainerId);
    if (!container || !Service) return;
    const tbody = container.querySelector("tbody");
    if (!tbody) return;
    const guidelines = Service.getGuidelines(activeFilters);
    tbody.innerHTML = renderTableRows(guidelines);
  }

  /**
   * Modal 1: Dual-Language Guideline Editor (Create & Edit)
   */
  function openEditGuidelineModal(guidelineId = null) {
    const modalRoot = document.getElementById("cmsModalRoot") || document.body;
    const existing = guidelineId ? Service.getGuidelineById(guidelineId) : null;
    const isEditing = Boolean(existing);

    const title = isEditing 
      ? `تعديل التوصية الطبية: ${existing.titleAr} (${existing.version})` 
      : `إضافة توصية سريرية جديدة (Isabel Clinical Guideline)`;

    const modalHtml = `
      <div class="cms-modal-backdrop" id="cmsEditModalBackdrop">
        <div class="cms-modal-box">
          <div class="cms-modal-header">
            <h4>
              <span>${isEditing ? '✏️' : '➕'}</span>
              <span>${title}</span>
            </h4>
            <button type="button" class="cms-modal-close-btn" id="btnCmsCloseEditModal">✕</button>
          </div>
          
          <form id="cmsGuidelineForm">
            <div class="cms-modal-body">
              <div id="cmsFormValidationAlert" style="display:none; padding:12px; background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:8px; color:#fca5a5; font-size:12.5px; margin-bottom:16px;"></div>

              <!-- General Metadata Row -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px;">
                <div class="cms-form-group">
                  <label>معرف التوصية الفريد (Unique ID):</label>
                  <input type="text" class="cms-form-control" id="editGuidelineId" 
                         value="${existing ? existing.id : 'guideline_' + Date.now().toString(36)}" 
                         ${isEditing ? 'readonly style="opacity:0.6;"' : ''} required>
                </div>
                <div class="cms-form-group">
                  <label>رقم الإصدار (Version):</label>
                  <input type="text" class="cms-form-control" id="editGuidelineVersion" 
                         value="${existing ? existing.version : 'v1.0-draft'}" required>
                </div>
                <div class="cms-form-group">
                  <label>التصنيف الطبي (Category):</label>
                  <select class="cms-form-control" id="editGuidelineCategory">
                    <option value="triage_protocol" ${existing?.category === 'triage_protocol' ? 'selected' : ''}>بروتوكول فرز (Triage)</option>
                    <option value="red_flags" ${existing?.category === 'red_flags' ? 'selected' : ''}>علامات خطورة (Red Flags)</option>
                    <option value="discharge_care" ${existing?.category === 'discharge_care' ? 'selected' : ''}>رعاية خروج (Discharge)</option>
                    <option value="home_treatment" ${existing?.category === 'home_treatment' ? 'selected' : ''}>علاج ومتابعة منزلية (Home Care)</option>
                    <option value="referral_criteria" ${existing?.category === 'referral_criteria' ? 'selected' : ''}>معايير إحالة (Referral)</option>
                  </select>
                </div>
                <div class="cms-form-group">
                  <label>النطاق السريري (Condition Scope):</label>
                  <select class="cms-form-control" id="editGuidelineScope">
                    <option value="respiratory_triage" ${existing?.conditionScope === 'respiratory_triage' ? 'selected' : ''}>فرز الأعراض التنفسية</option>
                    <option value="hypoxemia" ${existing?.conditionScope === 'hypoxemia' ? 'selected' : ''}>نقص الأكسجة وSpO2</option>
                    <option value="pneumonia_covid" ${existing?.conditionScope === 'pneumonia_covid' ? 'selected' : ''}>الالتهاب الرئوي والفيروسي</option>
                    <option value="pediatric" ${existing?.conditionScope === 'pediatric' ? 'selected' : ''}>طب الأطفال والرضع</option>
                    <option value="general_emergency" ${existing?.conditionScope === 'general_emergency' ? 'selected' : ''}>طوارئ عامة</option>
                  </select>
                </div>
                <div class="cms-form-group">
                  <label>مستوى الدليل (Evidence Level):</label>
                  <select class="cms-form-control" id="editGuidelineEvidence">
                    <option value="Grade_A_High" ${existing?.evidenceLevel === 'Grade_A_High' ? 'selected' : ''}>Grade A - دليل عالي الجودة (RCTs)</option>
                    <option value="Grade_B_Moderate" ${existing?.evidenceLevel === 'Grade_B_Moderate' ? 'selected' : ''}>Grade B - دراسات رصدية محكمة</option>
                    <option value="Grade_C_Consensus" ${existing?.evidenceLevel === 'Grade_C_Consensus' ? 'selected' : ''}>Grade C - إجماع الخبراء السريري</option>
                  </select>
                </div>
                <div class="cms-form-group">
                  <label>الفئة المستهدفة (Target Audience):</label>
                  <select class="cms-form-control" id="editGuidelineAudience">
                    <option value="physician" ${existing?.targetAudience === 'physician' ? 'selected' : ''}>الأطباء المعالجون (Physicians)</option>
                    <option value="nurse" ${existing?.targetAudience === 'nurse' ? 'selected' : ''}>التمريض السريري (Nurses)</option>
                    <option value="triage_officer" ${existing?.targetAudience === 'triage_officer' ? 'selected' : ''}>مسؤولو الفرز (Triage Officers)</option>
                    <option value="patient_family" ${existing?.targetAudience === 'patient_family' ? 'selected' : ''}>المريض والأسرة (Patient & Family)</option>
                  </select>
                </div>
              </div>

              <!-- Dual Columns: Arabic RTL vs English LTR -->
              <div class="cms-dual-columns">
                <!-- Arabic Column -->
                <div class="cms-editor-column" dir="rtl">
                  <div class="cms-column-header">
                    <span>🇸🇦</span>
                    <span>المحتوى الطبي المعتمد باللغة العربية (RTL)</span>
                  </div>
                  <div class="cms-form-group">
                    <label>عنوان التوصية بالعربية *:</label>
                    <input type="text" class="cms-form-control" id="editTitleAr" value="${existing ? existing.titleAr : ''}" required>
                  </div>
                  <div class="cms-form-group">
                    <label>الملخص السريري بالعربية *:</label>
                    <textarea class="cms-form-control" id="editSummaryAr" rows="2" required>${existing ? existing.summaryAr : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label>دواعي الاستخدام والمعايير السريرية *:</label>
                    <textarea class="cms-form-control" id="editCriteriaAr" rows="3" required>${existing ? existing.criteriaAr : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label>الإجراءات والتوصيات العلاجية *:</label>
                    <textarea class="cms-form-control" id="editActionItemsAr" rows="3" required>${existing ? existing.actionItemsAr : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label style="color:#f87171;">🚨 علامات الخطورة والتحذير العاجل (Red Flags) *:</label>
                    <textarea class="cms-form-control" id="editRedFlagsAr" rows="2" style="border-color: rgba(239,68,68,0.4);" required>${existing ? existing.redFlagsAr : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label>تعليمات المريض والخروج (اختياري):</label>
                    <textarea class="cms-form-control" id="editPatientInstructionsAr" rows="2">${existing?.patientInstructionsAr || ''}</textarea>
                  </div>
                </div>

                <!-- English Column -->
                <div class="cms-editor-column" dir="ltr">
                  <div class="cms-column-header">
                    <span>🇬🇧</span>
                    <span>English Clinical Guidance & Red Flags (LTR)</span>
                  </div>
                  <div class="cms-form-group">
                    <label>Guideline Title in English *:</label>
                    <input type="text" class="cms-form-control" id="editTitleEn" value="${existing ? existing.titleEn : ''}" required>
                  </div>
                  <div class="cms-form-group">
                    <label>Clinical Summary (EN) *:</label>
                    <textarea class="cms-form-control" id="editSummaryEn" rows="2" required>${existing ? existing.summaryEn : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label>Indications & Clinical Criteria (EN) *:</label>
                    <textarea class="cms-form-control" id="editCriteriaEn" rows="3" required>${existing ? existing.criteriaEn : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label>Recommended Action Items (EN) *:</label>
                    <textarea class="cms-form-control" id="editActionItemsEn" rows="3" required>${existing ? existing.actionItemsEn : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label style="color:#f87171;">🚨 Red Flags & Emergency Triggers (EN) *:</label>
                    <textarea class="cms-form-control" id="editRedFlagsEn" rows="2" style="border-color: rgba(239,68,68,0.4);" required>${existing ? existing.redFlagsEn : ''}</textarea>
                  </div>
                  <div class="cms-form-group">
                    <label>Patient Discharge Instructions (Optional):</label>
                    <textarea class="cms-form-control" id="editPatientInstructionsEn" rows="2">${existing?.patientInstructionsEn || ''}</textarea>
                  </div>
                </div>
              </div>

              <!-- Revision Note -->
              <div class="cms-form-group" style="margin-top: 16px;">
                <label>ملاحظة المراجعة / سبب التعديل (Revision Summary):</label>
                <input type="text" class="cms-form-control" id="editChangeSummary" 
                       placeholder="مثال: تحديث علامات نقص الأكسجة الصامت ومطابقتها مع مقاييس Pulse Oximeter">
              </div>
            </div>

            <div class="cms-modal-footer">
              <button type="button" class="cms-btn cms-btn-outline" id="btnCmsCancelEdit">إلغاء</button>
              <button type="submit" class="cms-btn cms-btn-primary" id="btnCmsSaveGuideline">
                <span>💾</span> حفظ التعديلات كمسودة
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    modalRoot.innerHTML = modalHtml;

    const closeBtn = document.getElementById("btnCmsCloseEditModal");
    const cancelBtn = document.getElementById("btnCmsCancelEdit");
    const backdrop = document.getElementById("cmsEditModalBackdrop");
    const form = document.getElementById("cmsGuidelineForm");

    const closeModal = () => {
      modalRoot.innerHTML = "";
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = {
          id: document.getElementById("editGuidelineId").value.trim(),
          version: document.getElementById("editGuidelineVersion").value.trim(),
          category: document.getElementById("editGuidelineCategory").value,
          conditionScope: document.getElementById("editGuidelineScope").value,
          evidenceLevel: document.getElementById("editGuidelineEvidence").value,
          targetAudience: document.getElementById("editGuidelineAudience").value,
          titleAr: document.getElementById("editTitleAr").value,
          titleEn: document.getElementById("editTitleEn").value,
          summaryAr: document.getElementById("editSummaryAr").value,
          summaryEn: document.getElementById("editSummaryEn").value,
          criteriaAr: document.getElementById("editCriteriaAr").value,
          criteriaEn: document.getElementById("editCriteriaEn").value,
          actionItemsAr: document.getElementById("editActionItemsAr").value,
          actionItemsEn: document.getElementById("editActionItemsEn").value,
          redFlagsAr: document.getElementById("editRedFlagsAr").value,
          redFlagsEn: document.getElementById("editRedFlagsEn").value,
          patientInstructionsAr: document.getElementById("editPatientInstructionsAr").value,
          patientInstructionsEn: document.getElementById("editPatientInstructionsEn").value,
          changeSummary: document.getElementById("editChangeSummary").value
        };

        try {
          if (isEditing) {
            Service.updateGuideline(payload.id, payload, currentUser);
          } else {
            Service.createGuideline(payload, currentUser);
          }
          closeModal();
          renderClinicalCmsPanel(currentContainerId);
        } catch (err) {
          const alertBox = document.getElementById("cmsFormValidationAlert");
          if (alertBox) {
            alertBox.style.display = "block";
            alertBox.textContent = `تعذر الحفظ: ${err.message}`;
          }
        }
      });
    }
  }

  /**
   * Modal 2: Clinical Review & Approval Modal
   */
  function openReviewGuidelineModal(guidelineId) {
    const modalRoot = document.getElementById("cmsModalRoot") || document.body;
    const g = Service.getGuidelineById(guidelineId);
    if (!g) return;

    const modalHtml = `
      <div class="cms-modal-backdrop" id="cmsReviewModalBackdrop">
        <div class="cms-modal-box">
          <div class="cms-modal-header">
            <h4>
              <span>📋</span>
              <span>مسار المراجعة والاعتماد السريري: ${g.titleAr} (${g.version})</span>
            </h4>
            <button type="button" class="cms-modal-close-btn" id="btnCmsCloseReviewModal">✕</button>
          </div>
          
          <div class="cms-modal-body">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding:12px 16px; background:rgba(255,255,255,0.03); border-radius:10px;">
              <div>
                <strong>الحالة الحالية:</strong> ${getStatusBadgeHtml(g.status)}
                <span style="margin: 0 10px; color: var(--text-muted);">|</span>
                <strong>النطاق:</strong> ${getScopeLabel(g.conditionScope)}
              </div>
              <div>${getEvidenceBadgeHtml(g.evidenceLevel)}</div>
            </div>

            <div class="cms-dual-columns">
              <div class="cms-editor-column" dir="rtl">
                <h5 style="margin:0 0 10px; color:#38bdf8;">🇸🇦 النص العربي المعتمد</h5>
                <p><strong>العنوان:</strong> ${g.titleAr}</p>
                <p><strong>الملخص:</strong> ${g.summaryAr}</p>
                <p><strong>المعايير السريرية:</strong> ${g.criteriaAr}</p>
                <p><strong>التوصيات:</strong> ${g.actionItemsAr}</p>
                <p style="color:#f87171;"><strong>علامات الخطورة:</strong> ${g.redFlagsAr}</p>
              </div>

              <div class="cms-editor-column" dir="ltr">
                <h5 style="margin:0 0 10px; color:#38bdf8;">🇬🇧 Approved English Text</h5>
                <p><strong>Title:</strong> ${g.titleEn}</p>
                <p><strong>Summary:</strong> ${g.summaryEn}</p>
                <p><strong>Criteria:</strong> ${g.criteriaEn}</p>
                <p><strong>Actions:</strong> ${g.actionItemsEn}</p>
                <p style="color:#f87171;"><strong>Red Flags:</strong> ${g.redFlagsEn}</p>
              </div>
            </div>

            <!-- Review Notes Input -->
            <div class="cms-form-group" style="margin-top: 20px;">
              <label>ملاحظات المراجعة والاعتماد السريري (Review Notes & Clinical Rationale):</label>
              <textarea class="cms-form-control" id="reviewOperatorNotes" rows="2" 
                        placeholder="أدخل مبررات الاعتماد أو أسباب طلب التعديل..."></textarea>
            </div>
          </div>

          <div class="cms-modal-footer">
            <button type="button" class="cms-btn cms-btn-outline" id="btnCmsCancelReview">إغلاق</button>
            
            ${g.status === 'draft' || g.status === 'rejected' ? `
              <button type="button" class="cms-btn cms-btn-warning" id="btnSubmitReview">
                <span>🚀</span> تقديم للمراجعة السريرية
              </button>
            ` : ''}

            ${g.status === 'in_review' ? `
              <button type="button" class="cms-btn cms-btn-danger" id="btnRejectGuideline">
                <span>❌</span> طلب تعديلات (Reject)
              </button>
              <button type="button" class="cms-btn cms-btn-success" id="btnApproveGuideline">
                <span>✅</span> اعتماد سريري (Approve)
              </button>
            ` : ''}

            ${g.status === 'approved' ? `
              <button type="button" class="cms-btn cms-btn-primary" id="btnPublishGuideline">
                <span>🟢</span> نشر بالإنتاج (Publish Live)
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    modalRoot.innerHTML = modalHtml;

    const closeModal = () => { modalRoot.innerHTML = ""; };
    document.getElementById("btnCmsCloseReviewModal")?.addEventListener("click", closeModal);
    document.getElementById("btnCmsCancelReview")?.addEventListener("click", closeModal);

    const submitBtn = document.getElementById("btnSubmitReview");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        const notes = document.getElementById("reviewOperatorNotes")?.value || "";
        Service.submitForReview(guidelineId, currentUser, notes);
        closeModal();
        renderClinicalCmsPanel(currentContainerId);
      });
    }

    const approveBtn = document.getElementById("btnApproveGuideline");
    if (approveBtn) {
      approveBtn.addEventListener("click", () => {
        const notes = document.getElementById("reviewOperatorNotes")?.value || "";
        Service.approveGuideline(guidelineId, currentUser, notes);
        closeModal();
        renderClinicalCmsPanel(currentContainerId);
      });
    }

    const publishBtn = document.getElementById("btnPublishGuideline");
    if (publishBtn) {
      publishBtn.addEventListener("click", () => {
        const notes = document.getElementById("reviewOperatorNotes")?.value || "";
        Service.publishGuideline(guidelineId, currentUser, notes);
        closeModal();
        renderClinicalCmsPanel(currentContainerId);
      });
    }

    const rejectBtn = document.getElementById("btnRejectGuideline");
    if (rejectBtn) {
      rejectBtn.addEventListener("click", () => {
        const reason = document.getElementById("reviewOperatorNotes")?.value || "";
        Service.rejectGuideline(guidelineId, currentUser, reason);
        closeModal();
        renderClinicalCmsPanel(currentContainerId);
      });
    }
  }

  /**
   * Modal 3: Version Comparison & Diff Drawer
   */
  function openDiffGuidelineModal(guidelineId) {
    const modalRoot = document.getElementById("cmsModalRoot") || document.body;
    const g = Service.getGuidelineById(guidelineId);
    if (!g) return;

    const revisions = g.revisionHistory || [];
    const revA = revisions[0] || { version: g.version, changeSummary: "Initial" };
    const revB = revisions[revisions.length - 1] || revA;

    const modalHtml = `
      <div class="cms-modal-backdrop" id="cmsDiffModalBackdrop">
        <div class="cms-modal-box">
          <div class="cms-modal-header">
            <h4>
              <span>🔀</span>
              <span>سجل الإصدارات ومقارنة الفروقات: ${g.titleAr}</span>
            </h4>
            <button type="button" class="cms-modal-close-btn" id="btnCmsCloseDiffModal">✕</button>
          </div>

          <div class="cms-modal-body">
            <h5 style="margin: 0 0 12px; color: var(--text-muted); font-size: 13px;">تاريخ التعديلات المسجلة:</h5>
            <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
              ${revisions.map((r, i) => `
                <div style="display:flex; justify-content:space-between; font-size:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                  <div>
                    <strong style="color:#38bdf8;">${r.version}</strong>
                    <span style="margin:0 8px; color:var(--text-muted);">(${getStatusBadgeHtml(r.status)})</span>
                    <span>${r.changeSummary}</span>
                  </div>
                  <div style="color:var(--text-muted);">${(r.updatedAt || '').split('T')[0]} - ${r.authorName}</div>
                </div>
              `).join("")}
            </div>

            <!-- Content Snapshot -->
            <div class="cms-diff-grid">
              <div class="cms-diff-box">
                <h5>
                  <span>النسخة المبدئية / الأساسية (${revA.version})</span>
                  <span class="cms-chip">${(revA.updatedAt || '').split('T')[0]}</span>
                </h5>
                <p style="font-size:12px; color:var(--text-muted);">
                  <strong>ملخص التغيير:</strong> ${revA.changeSummary}
                </p>
              </div>

              <div class="cms-diff-box" style="border-color: rgba(14, 165, 233, 0.3);">
                <h5>
                  <span>النسخة الحالية النشطة (${revB.version})</span>
                  <span class="cms-chip" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8;">${(revB.updatedAt || '').split('T')[0]}</span>
                </h5>
                <p style="font-size:12px; color:var(--text-muted);">
                  <strong>ملخص التغيير:</strong> ${revB.changeSummary}
                </p>
                <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; font-size: 12px;">
                  <strong style="color:#fff;">المعايير الحالية:</strong>
                  <p style="margin:4px 0;">${g.criteriaAr}</p>
                  <strong style="color:#f87171;">علامات الخطورة:</strong>
                  <p style="margin:4px 0; color:#f87171;">${g.redFlagsAr}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="cms-modal-footer">
            <button type="button" class="cms-btn cms-btn-outline" id="btnCmsCloseDiff">إغلاق</button>
          </div>
        </div>
      </div>
    `;

    modalRoot.innerHTML = modalHtml;
    const closeModal = () => { modalRoot.innerHTML = ""; };
    document.getElementById("btnCmsCloseDiffModal")?.addEventListener("click", closeModal);
    document.getElementById("btnCmsCloseDiff")?.addEventListener("click", closeModal);
  }

  /**
   * Export CSV Handler
   */
  function handleExportCsv() {
    if (!Service) return;
    const csvContent = Service.exportGuidelinesCsv(activeFilters);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `healthvibe_clinical_guidelines_isabel_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const ClinicalCmsUI = {
    renderClinicalCmsPanel,
    openEditGuidelineModal,
    openReviewGuidelineModal,
    openDiffGuidelineModal,
    handleExportCsv,
    setCurrentUser(user) {
      if (user) currentUser = { ...user };
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ClinicalCmsUI;
  }
  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ClinicalCmsUI = ClinicalCmsUI;
})(typeof window !== "undefined" ? window : global);
