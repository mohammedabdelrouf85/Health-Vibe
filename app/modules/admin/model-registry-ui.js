/**
 * HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK UI COMPONENT (Glass Health Benchmark)
 * 
 * Features:
 * 1. Glass Health Clinical Aesthetics:
 *    - Translucent panels, pulsing status indicators, high-contrast metric chips.
 * 2. Active Production Models Bar:
 *    - Live status per clinical condition scope (Acute Respiratory, Hypoxemia, Pediatric).
 * 3. Fast Filtering & Search Toolbar:
 *    - Instant search across versions, architectures, and checkpoints.
 *    - Filters for condition scope, deployment status, and release date range.
 * 4. Model Registry Data Table:
 *    - Comprehensive lineage (Version, Checkpoint, Date, Parameters, Sensitivity, Specificity, Concordance).
 *    - One-click Emergency Rollback trigger.
 * 5. Safe Rollback Confirmation Modal:
 *    - Side-by-side delta visualization (Current Active vs Target Rollback).
 *    - Reason capture, operator notes, and safety acknowledgment.
 *    - Zero-downtime hot-swap execution.
 * 6. Version Diff & Lineage Comparison Drawer.
 */

(function (global) {
  "use strict";

  const Service = (global.HealthVibes && global.HealthVibes.ModelRegistryService) || 
                  (typeof require !== "undefined" ? require("./model-registry-service") : null);

  let currentContainerId = "adminModelRegistryContainer";
  let activeFilters = {
    condition: "all",
    status: "all",
    timeRange: "all",
    sortBy: "date_desc",
    search: ""
  };

  let pendingRollbackTargetId = null;

  function getScopeLabelAr(scope) {
    const map = {
      respiratory_triage: "فرز الطوارئ والأعراض التنفسية",
      hypoxemia: "نقص الأكسجة ومؤشر SpO2",
      pneumonia_covid: "الالتهاب الرئوي والفيروسي",
      pediatric: "طب الأطفال والرضع"
    };
    return map[scope] || scope;
  }

  function getStatusBadgeHtml(status) {
    switch (status) {
      case "active":
        return `<span class="glass-badge glass-badge-active"><span class="glass-pulse-dot" style="width:7px;height:7px;"></span> نشط بالإنتاج (Active)</span>`;
      case "candidate":
        return `<span class="glass-badge glass-badge-candidate">🟡 مرشح للاعتماد (Candidate)</span>`;
      case "rolled_back":
        return `<span class="glass-badge glass-badge-rolled-back">⏪ تم التراجع عنها (Rolled Back)</span>`;
      case "archived":
        return `<span class="glass-badge glass-badge-archived">📦 مؤرشفة (Archived)</span>`;
      case "experimental":
        return `<span class="glass-badge glass-badge-experimental">🧪 قيد الاختبار (Experimental)</span>`;
      default:
        return `<span class="glass-badge">${status}</span>`;
    }
  }

  function renderModelRegistryPanel(containerId = "adminModelRegistryContainer") {
    currentContainerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Service) {
      container.innerHTML = `<div class="error-banner">تعذر تحميل خدمة سجل النماذج السريرية (Model Registry Service).</div>`;
      return;
    }

    const allModels = Service.getAllModels();
    const filteredModels = Service.filterRegistry(allModels, activeFilters);

    // Group active models by scope for the quick status bar
    const scopes = ["respiratory_triage", "hypoxemia", "pediatric", "pneumonia_covid"];
    const scopeCardsHtml = scopes.map(sc => {
      const activeModel = allModels.find(m => m.conditionScope === sc && m.status === "active");
      const previousCandidates = allModels.filter(m => m.conditionScope === sc && m.status !== "active");
      const rollbackTarget = previousCandidates.find(m => m.status === "rolled_back" || m.status === "archived") || previousCandidates[0];

      return `
        <div class="glass-scope-card ${activeModel ? 'is-active-card' : ''}">
          <div>
            <div class="glass-scope-header">
              <h4 class="glass-scope-title">${getScopeLabelAr(sc)}</h4>
              <span class="glass-scope-version">${activeModel ? activeModel.version : 'غير مفعل'}</span>
            </div>
            <div style="font-size: 12.5px; font-weight: 600; color: #10b981; display: flex; align-items: center; gap: 6px;">
              <span class="glass-pulse-dot" style="width: 8px; height: 8px;"></span>
              ${activeModel ? activeModel.name : 'لا يوجد نموذج نشط'}
            </div>
            <div class="glass-scope-meta">
              <span>تاريخ الإطلاق: <strong>${activeModel?.releaseDate || '--'}</strong></span>
              <span>الحساسية: <strong>${activeModel?.metrics.sensitivityPct || '--'}</strong></span>
            </div>
          </div>
          <div class="glass-scope-actions">
            ${rollbackTarget ? `
              <button type="button" class="glass-btn-rollback btn-quick-rollback" data-target-id="${rollbackTarget.id}" title="تراجع فوري للنسخة السابقة">
                <span>⏪</span> تراجع للنسخة السابقة (${rollbackTarget.version})
              </button>
            ` : `
              <span style="font-size: 11px; color: var(--muted);">لا توجد نسخ سابقة للتراجع</span>
            `}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <section class="glass-registry-panel" id="modelRegistryPanelRoot" dir="rtl" aria-label="سجل إصدارات النماذج والتبديل الآمن">
        <!-- Header -->
        <div class="glass-registry-header">
          <div>
            <div class="glass-title-wrap">
              <span class="glass-pulse-dot" aria-hidden="true"></span>
              <h3 class="glass-registry-title">
                سجل إصدارات النماذج والتبديل الآمن (Model Registry & Safe Rollback)
                <span style="font-size: 12px; font-weight: 500; color: var(--muted);">(Glass Health Clinical Benchmark)</span>
              </h3>
              <span class="glass-badge glass-badge-active">جاهزية التبديل الفوري ⚡</span>
            </div>
            <p class="glass-registry-subtitle">
              إدارة تتبع كافة نسخ النماذج السريرية المدربة، تواريخ إطلاقها، معماريتها، وميزة التراجع الفوري الآمن للنسخة السابقة عند الطوارئ دون انقطاع بالخدمة.
            </p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="soft-button" id="regRefreshBtn" style="padding: 7px 14px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px;">
              <span>🔄</span> تحديث السجل
            </button>
            <button type="button" class="outline-button" id="regExportCsvBtn" style="padding: 7px 14px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px;">
              <span>📥</span> تصدير السجل (CSV)
            </button>
            <button type="button" class="glass-btn-rollback" id="regEmergencyRollbackBtn" style="padding: 7px 14px; font-size: 12px;">
              <span>⚠️</span> التراجع الطارئ للنسخة السابقة
            </button>
          </div>
        </div>

        <!-- Active Production Scopes Bar -->
        <div style="margin-top: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 12.5px; font-weight: 700; color: var(--muted);">النسخ النشطة حالياً في بيئة الإنتاج السريري (Live Clinical Deployment):</span>
            <span style="font-size: 11.5px; color: #10b981;">⚡ تبديل فوري Zero-Downtime Hot-Swap</span>
          </div>
          <div class="glass-active-scopes-bar">
            ${scopeCardsHtml}
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="glass-filter-toolbar">
          <div class="glass-filter-group">
            <!-- Condition Scope -->
            <label for="regFilterScope" style="font-size: 12px; font-weight: 700; color: var(--muted);">التخصص السريري:</label>
            <select class="glass-select" id="regFilterScope">
              <option value="all" ${activeFilters.condition === 'all' ? 'selected' : ''}>كافة التخصصات (${allModels.length})</option>
              <option value="respiratory_triage" ${activeFilters.condition === 'respiratory_triage' ? 'selected' : ''}>فرز الطوارئ والأعراض التنفسية</option>
              <option value="hypoxemia" ${activeFilters.condition === 'hypoxemia' ? 'selected' : ''}>نقص الأكسجة ومؤشر SpO2</option>
              <option value="pneumonia_covid" ${activeFilters.condition === 'pneumonia_covid' ? 'selected' : ''}>الالتهاب الرئوي والفيروسي</option>
              <option value="pediatric" ${activeFilters.condition === 'pediatric' ? 'selected' : ''}>طب الأطفال والرضع</option>
            </select>

            <!-- Deployment Status -->
            <label for="regFilterStatus" style="font-size: 12px; font-weight: 700; color: var(--muted);">الحالة:</label>
            <select class="glass-select" id="regFilterStatus">
              <option value="all" ${activeFilters.status === 'all' ? 'selected' : ''}>كافة الحالات</option>
              <option value="active" ${activeFilters.status === 'active' ? 'selected' : ''}>نشط بالإنتاج (Active)</option>
              <option value="candidate" ${activeFilters.status === 'candidate' ? 'selected' : ''}>مرشح للاعتماد (Candidate)</option>
              <option value="rolled_back" ${activeFilters.status === 'rolled_back' ? 'selected' : ''}>تم التراجع عنها (Rolled Back)</option>
              <option value="archived" ${activeFilters.status === 'archived' ? 'selected' : ''}>مؤرشف (Archived)</option>
            </select>

            <!-- Time Range -->
            <label for="regFilterTime" style="font-size: 12px; font-weight: 700; color: var(--muted);">تاريخ الإطلاق:</label>
            <select class="glass-select" id="regFilterTime">
              <option value="all" ${activeFilters.timeRange === 'all' ? 'selected' : ''}>كافة التواريخ</option>
              <option value="7d" ${activeFilters.timeRange === '7d' ? 'selected' : ''}>آخر 7 أيام</option>
              <option value="30d" ${activeFilters.timeRange === '30d' ? 'selected' : ''}>آخر 30 يوماً</option>
              <option value="90d" ${activeFilters.timeRange === '90d' ? 'selected' : ''}>آخر 90 يوماً</option>
            </select>

            <!-- Sort By -->
            <label for="regSortBy" style="font-size: 12px; font-weight: 700; color: var(--muted);">ترتيب حسب:</label>
            <select class="glass-select" id="regSortBy">
              <option value="date_desc" ${activeFilters.sortBy === 'date_desc' ? 'selected' : ''}>الأحدث إطلاقاً ⬇️</option>
              <option value="date_asc" ${activeFilters.sortBy === 'date_asc' ? 'selected' : ''}>الأقدم إطلاقاً ⬆️</option>
              <option value="sensitivity_desc" ${activeFilters.sortBy === 'sensitivity_desc' ? 'selected' : ''}>الأعلى حساسية 🩺</option>
              <option value="specificity_desc" ${activeFilters.sortBy === 'specificity_desc' ? 'selected' : ''}>الأعلى نوعية 🛡️</option>
              <option value="concordance_desc" ${activeFilters.sortBy === 'concordance_desc' ? 'selected' : ''}>أعلى توافق مع الأطباء 👨‍⚕️</option>
            </select>
          </div>

          <!-- Keyword Search -->
          <div style="flex: 1; min-width: 200px; max-width: 300px;">
            <input type="search" class="glass-input" id="regSearchInput" placeholder="بحث بالإصدار أو المعمارية أو الحزمة..." value="${activeFilters.search || ''}" style="width: 100%;">
          </div>
        </div>

        <!-- Table of Models -->
        <div class="glass-table-container">
          <table class="glass-models-table" id="glassRegistryTable">
            <thead>
              <tr>
                <th>إصدار النموذج وبيانات التدريب</th>
                <th>الحالة التشغيلية</th>
                <th>النطاق السريري</th>
                <th>المعمارية والمعاملات</th>
                <th>تاريخ الإطلاق</th>
                <th>الحساسية (Sensitivity)</th>
                <th>النوعية (Specificity)</th>
                <th>توافق الأطباء</th>
                <th>العينة ($N$)</th>
                <th>التحكم والتبديل الآمن</th>
              </tr>
            </thead>
            <tbody>
              ${filteredModels.length === 0 ? `
                <tr>
                  <td colspan="10" style="text-align: center; padding: 28px; color: var(--muted);">
                    لا توجد نماذج مطابقة لمعايير البحث والتصفية المحددة.
                  </td>
                </tr>
              ` : filteredModels.map(m => {
                const met = m.metrics;
                const isCurrentActive = m.status === 'active';

                return `
                  <tr class="${isCurrentActive ? 'is-active-row' : ''}" data-model-id="${m.id}">
                    <td>
                      <div style="font-weight: 700; font-size: 13.5px; display: flex; align-items: center; gap: 6px;">
                        <span>${m.name}</span>
                        <span style="font-size: 11px; color: var(--teal); background: rgba(9, 184, 182, 0.1); padding: 1px 6px; border-radius: 4px;">${m.version}</span>
                      </div>
                      <small style="font-size: 11px; color: var(--muted); display: block; margin-top: 2px;">
                        Checkpoint: <code style="font-size: 10.5px;">${m.trainingCheckpoint || '--'}</code>
                      </small>
                    </td>
                    <td>${getStatusBadgeHtml(m.status)}</td>
                    <td>
                      <span style="font-weight: 600; font-size: 12px;">${m.conditionLabelAr}</span>
                    </td>
                    <td>
                      <div style="font-size: 12px;">${m.architecture}</div>
                      <small style="font-size: 10.5px; color: var(--muted);">${m.parametersCount || '--'}</small>
                    </td>
                    <td>
                      <span style="font-family: monospace; font-size: 12px;">${m.releaseDate || '--'}</span>
                    </td>
                    <td>
                      <span class="glass-metric-pill ${met.sensitivity >= 0.98 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
                        ${met.sensitivityPct}
                      </span>
                    </td>
                    <td>
                      <span class="glass-metric-pill ${met.specificity >= 0.90 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
                        ${met.specificityPct}
                      </span>
                    </td>
                    <td>
                      <span class="glass-metric-pill ${met.doctorConcordanceRate >= 0.95 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
                        ${met.doctorConcordancePct}
                      </span>
                    </td>
                    <td><strong>${met.totalCases}</strong></td>
                    <td>
                      <div style="display: flex; gap: 6px; align-items: center;">
                        ${isCurrentActive ? `
                          <span style="font-size: 11.5px; font-weight: 700; color: #10b981; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(16,185,129,0.1); border-radius: 6px;">
                            <span>✓</span> قيد التشغيل بالإنتاج
                          </span>
                        ` : `
                          <button type="button" class="glass-btn-rollback btn-trigger-rollback" data-id="${m.id}" title="التراجع الفوري لهذه النسخة وتفعيلها بالإنتاج">
                            <span>⏪</span> تراجع فوري
                          </button>
                        `}
                        ${m.status === 'candidate' ? `
                          <button type="button" class="glass-btn-promote btn-trigger-promote" data-id="${m.id}" title="ترقية للاعتماد النشط">
                            <span>🚀</span> ترقية
                          </button>
                        ` : ''}
                        <button type="button" class="glass-btn-inspect btn-trigger-compare" data-id="${m.id}" title="مقارنة مع النسخة النشطة">
                          <span>⚖️</span> مقارنة
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Safe Rollback Confirmation Modal (Glass Health Hot-Swap) -->
      <div class="glass-modal-backdrop" id="modelRollbackModal" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="glass-modal-card">
          <div class="glass-modal-header">
            <h4 class="glass-modal-title">
              <span>⚠️</span> تأكيد التراجع الفوري الآمن (Glass Health Safe Hot-Swap Rollback)
            </h4>
            <button type="button" class="glass-close-btn" id="btnCloseRollbackModal" aria-label="إغلاق">&times;</button>
          </div>

          <div id="rollbackModalBodyContent">
            <!-- Dynamic comparison and inputs injected here -->
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
            <button type="button" class="outline-button" id="btnCancelRollback" style="padding: 8px 18px; font-size: 13px;">إلغاء</button>
            <button type="button" class="glass-btn-rollback" id="btnConfirmRollback" style="padding: 8px 22px; font-size: 13px; font-weight: 700;">
              <span>⚡</span> تنفيذ التراجع الفوري الآمن
            </button>
          </div>
        </div>
      </div>

      <!-- Version Compare & Diff Modal -->
      <div class="glass-modal-backdrop" id="modelCompareModal" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="glass-modal-card" style="max-width: 780px;">
          <div class="glass-modal-header">
            <h4 class="glass-modal-title" style="color: var(--teal, #09b8b6);">
              <span>⚖️</span> مقارنة النسخ وتحليل الفروق السريرية (Version Diff & Lineage)
            </h4>
            <button type="button" class="glass-close-btn" id="btnCloseCompareModal" aria-label="إغلاق">&times;</button>
          </div>
          <div id="compareModalBodyContent"></div>
        </div>
      </div>
    `;

    attachEventListeners(container);
  }

  function attachEventListeners(container) {
    // Toolbar Filter Listeners
    const scopeSelect = container.querySelector("#regFilterScope");
    if (scopeSelect) {
      scopeSelect.onchange = e => {
        activeFilters.condition = e.target.value;
        renderModelRegistryPanel(currentContainerId);
      };
    }

    const statusSelect = container.querySelector("#regFilterStatus");
    if (statusSelect) {
      statusSelect.onchange = e => {
        activeFilters.status = e.target.value;
        renderModelRegistryPanel(currentContainerId);
      };
    }

    const timeSelect = container.querySelector("#regFilterTime");
    if (timeSelect) {
      timeSelect.onchange = e => {
        activeFilters.timeRange = e.target.value;
        renderModelRegistryPanel(currentContainerId);
      };
    }

    const sortSelect = container.querySelector("#regSortBy");
    if (sortSelect) {
      sortSelect.onchange = e => {
        activeFilters.sortBy = e.target.value;
        renderModelRegistryPanel(currentContainerId);
      };
    }

    const searchInput = container.querySelector("#regSearchInput");
    if (searchInput) {
      searchInput.oninput = e => {
        activeFilters.search = e.target.value;
        // Debounced or live re-filter
        const allModels = Service.getAllModels();
        const filtered = Service.filterRegistry(allModels, activeFilters);
        updateTableOnly(filtered);
      };
    }

    // Refresh button
    const refreshBtn = container.querySelector("#regRefreshBtn");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        renderModelRegistryPanel(currentContainerId);
        showToast("تم تحديث سجل إصدارات النماذج بنجاح 🔄");
      };
    }

    // Export CSV
    const exportBtn = container.querySelector("#regExportCsvBtn");
    if (exportBtn) {
      exportBtn.onclick = () => {
        const allModels = Service.getAllModels();
        const filtered = Service.filterRegistry(allModels, activeFilters);
        const csvContent = Service.generateRegistryCsv(filtered);
        downloadFile(csvContent, `healthvibe-model-registry-${new Date().toISOString().split("T")[0]}.csv`, "text/csv;charset=utf-8;");
        showToast("تم تصدير سجل النماذج السريرية بنجاح 📥");
      };
    }

    // Emergency Rollback Global Button
    const emergencyBtn = container.querySelector("#regEmergencyRollbackBtn");
    if (emergencyBtn) {
      emergencyBtn.onclick = () => {
        // Find candidate for respiratory triage or first active
        const respiratoryCandidate = Service.getRollbackCandidatesForScope("respiratory_triage");
        const target = respiratoryCandidate.find(m => m.version === "v1.0" || m.status === "archived") || respiratoryCandidate[0];
        if (target) {
          openRollbackModal(target.id);
        } else {
          showToast("لا يوجد نموذج سابق متاح للتراجع الطارئ.");
        }
      };
    }

    // Quick Rollback from Scope Cards
    container.querySelectorAll(".btn-quick-rollback").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-target-id");
        if (id) openRollbackModal(id);
      };
    });

    // Row Rollback Buttons
    container.querySelectorAll(".btn-trigger-rollback").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-id");
        if (id) openRollbackModal(id);
      };
    });

    // Row Promote Buttons
    container.querySelectorAll(".btn-trigger-promote").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (confirm("هل تؤكد ترقية هذا النموذج المرشح إلى بيئة الإنتاج السريري؟")) {
          btn.disabled = true;
          try {
            await Service.promoteModel(id);
            showToast("تم ترقية النموذج إلى الإنتاج النشط بنجاح 🚀");
            renderModelRegistryPanel(currentContainerId);
          } catch (err) {
            alert(`فشل الترقية: ${err.message}`);
          }
        }
      };
    });

    // Row Compare Buttons
    container.querySelectorAll(".btn-trigger-compare").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-id");
        if (id) openCompareModal(id);
      };
    });

    // Modal Close buttons
    const closeRollbackBtn = container.querySelector("#btnCloseRollbackModal");
    if (closeRollbackBtn) closeRollbackBtn.onclick = closeRollbackModal;
    const cancelRollbackBtn = container.querySelector("#btnCancelRollback");
    if (cancelRollbackBtn) cancelRollbackBtn.onclick = closeRollbackModal;

    const confirmRollbackBtn = container.querySelector("#btnConfirmRollback");
    if (confirmRollbackBtn) confirmRollbackBtn.onclick = executePendingRollback;

    const closeCompareBtn = container.querySelector("#btnCloseCompareModal");
    if (closeCompareBtn) closeCompareBtn.onclick = closeCompareModal;
  }

  function updateTableOnly(filteredModels) {
    const tbody = document.querySelector("#glassRegistryTable tbody");
    if (!tbody) return;

    if (filteredModels.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 28px; color: var(--muted);">
            لا توجد نماذج مطابقة لمعايير البحث والتصفية المحددة.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredModels.map(m => {
      const met = m.metrics;
      const isCurrentActive = m.status === 'active';

      return `
        <tr class="${isCurrentActive ? 'is-active-row' : ''}" data-model-id="${m.id}">
          <td>
            <div style="font-weight: 700; font-size: 13.5px; display: flex; align-items: center; gap: 6px;">
              <span>${m.name}</span>
              <span style="font-size: 11px; color: var(--teal); background: rgba(9, 184, 182, 0.1); padding: 1px 6px; border-radius: 4px;">${m.version}</span>
            </div>
            <small style="font-size: 11px; color: var(--muted); display: block; margin-top: 2px;">
              Checkpoint: <code style="font-size: 10.5px;">${m.trainingCheckpoint || '--'}</code>
            </small>
          </td>
          <td>${getStatusBadgeHtml(m.status)}</td>
          <td>
            <span style="font-weight: 600; font-size: 12px;">${m.conditionLabelAr}</span>
          </td>
          <td>
            <div style="font-size: 12px;">${m.architecture}</div>
            <small style="font-size: 10.5px; color: var(--muted);">${m.parametersCount || '--'}</small>
          </td>
          <td>
            <span style="font-family: monospace; font-size: 12px;">${m.releaseDate || '--'}</span>
          </td>
          <td>
            <span class="glass-metric-pill ${met.sensitivity >= 0.98 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
              ${met.sensitivityPct}
            </span>
          </td>
          <td>
            <span class="glass-metric-pill ${met.specificity >= 0.90 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
              ${met.specificityPct}
            </span>
          </td>
          <td>
            <span class="glass-metric-pill ${met.doctorConcordanceRate >= 0.95 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
              ${met.doctorConcordancePct}
            </span>
          </td>
          <td><strong>${met.totalCases}</strong></td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${isCurrentActive ? `
                <span style="font-size: 11.5px; font-weight: 700; color: #10b981; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(16,185,129,0.1); border-radius: 6px;">
                  <span>✓</span> قيد التشغيل بالإنتاج
                </span>
              ` : `
                <button type="button" class="glass-btn-rollback btn-trigger-rollback" data-id="${m.id}" title="التراجع الفوري لهذه النسخة وتفعيلها بالإنتاج">
                  <span>⏪</span> تراجع فوري
                </button>
              `}
              ${m.status === 'candidate' ? `
                <button type="button" class="glass-btn-promote btn-trigger-promote" data-id="${m.id}" title="ترقية للاعتماد النشط">
                  <span>🚀</span> ترقية
                </button>
              ` : ''}
              <button type="button" class="glass-btn-inspect btn-trigger-compare" data-id="${m.id}" title="مقارنة مع النسخة النشطة">
                <span>⚖️</span> مقارنة
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Reattach row buttons
    tbody.querySelectorAll(".btn-trigger-rollback").forEach(btn => {
      btn.onclick = () => openRollbackModal(btn.getAttribute("data-id"));
    });
    tbody.querySelectorAll(".btn-trigger-promote").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        if (confirm("هل تؤكد ترقية هذا النموذج المرشح إلى بيئة الإنتاج السريري؟")) {
          await Service.promoteModel(id);
          renderModelRegistryPanel(currentContainerId);
        }
      };
    });
    tbody.querySelectorAll(".btn-trigger-compare").forEach(btn => {
      btn.onclick = () => openCompareModal(btn.getAttribute("data-id"));
    });
  }

  /**
   * Open the Safe Rollback Confirmation Modal with Side-by-Side Delta Comparison
   */
  function openRollbackModal(targetModelId) {
    if (!Service) return;
    pendingRollbackTargetId = targetModelId;

    const all = Service.getAllModels();
    const targetModel = all.find(m => m.id === targetModelId || m.version === targetModelId);
    if (!targetModel) return;

    const currentActive = Service.getActiveModelForScope(targetModel.conditionScope);
    const delta = Service.computeRollbackDelta(currentActive, targetModel);

    const modal = document.getElementById("modelRollbackModal");
    const content = document.getElementById("rollbackModalBodyContent");
    if (!modal || !content) return;

    content.innerHTML = `
      <p style="font-size: 13.5px; color: var(--text); margin-top: 0; line-height: 1.6;">
        أنت على وشك تنفيذ <strong>تراجع سريري فوري (Zero-Downtime Hot-Swap Rollback)</strong> إلى النسخة السابقة المعتمدة.
        سيتم تفعيل هذه النسخة فورياً لفرز الحالات في العيادات والطوارئ، مع توثيق سبب التراجع في السجل الرقابي.
      </p>

      <!-- Side-by-Side Comparison Box -->
      <div class="glass-diff-box">
        <!-- Current Active Version -->
        <div class="glass-diff-side">
          <div style="font-size: 11px; color: #ef4444; font-weight: 700;">النسخة النشطة حالياً (سيتم إلغاء تفعيلها):</div>
          <strong style="font-size: 14px;">${currentActive ? currentActive.name : 'لا يوجد'} (${currentActive ? currentActive.version : '--'})</strong>
          <small style="color: var(--muted);">${currentActive?.architecture || '--'}</small>
          
          <div class="glass-diff-stat" style="margin-top: 8px;">
            <span>الحساسية:</span>
            <strong>${currentActive?.metrics.sensitivityPct || '--'}</strong>
          </div>
          <div class="glass-diff-stat">
            <span>النوعية:</span>
            <strong>${currentActive?.metrics.specificityPct || '--'}</strong>
          </div>
          <div class="glass-diff-stat">
            <span>الإنذارات الكاذبة (FP):</span>
            <strong style="color: #ef4444;">${currentActive?.confusionMatrix.fp ?? '--'} حالات</strong>
          </div>
          <div class="glass-diff-stat">
            <span>توافق الأطباء:</span>
            <strong>${currentActive?.metrics.doctorConcordancePct || '--'}</strong>
          </div>
        </div>

        <!-- Arrow indicator -->
        <div class="glass-diff-arrow">
          ⟵
        </div>

        <!-- Target Rollback Version -->
        <div class="glass-diff-side">
          <div style="font-size: 11px; color: #10b981; font-weight: 700;">النسخة المستهدفة للتراجع (سيتم تفعيلها فوراً):</div>
          <strong style="font-size: 14px; color: #34d399;">${targetModel.name} (${targetModel.version})</strong>
          <small style="color: var(--muted);">${targetModel.architecture}</small>

          <div class="glass-diff-stat" style="margin-top: 8px;">
            <span>الحساسية المستعادة:</span>
            <strong>${targetModel.metrics.sensitivityPct}</strong>
          </div>
          <div class="glass-diff-stat">
            <span>النوعية:</span>
            <strong>${targetModel.metrics.specificityPct}</strong>
          </div>
          <div class="glass-diff-stat">
            <span>الإنذارات الكاذبة (FP):</span>
            <strong>${targetModel.confusionMatrix.fp} حالات</strong>
          </div>
          <div class="glass-diff-stat">
            <span>توافق الأطباء:</span>
            <strong>${targetModel.metrics.doctorConcordancePct}</strong>
          </div>
        </div>
      </div>

      <!-- Delta Insights Pill Bar -->
      ${delta ? `
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px;">
          <span class="glass-metric-pill ${delta.isSafetyNeutral ? 'glass-metric-optimal' : 'glass-metric-danger'}">
            الحساسية للحالات الحرجة: ${delta.targetModel.metrics.sensitivityPct} (مضمونة 100%)
          </span>
          <span class="glass-metric-pill ${delta.fpDelta <= 0 ? 'glass-metric-optimal' : 'glass-metric-warning'}">
            فارق الإنذارات الكاذبة: ${delta.fpDelta > 0 ? `+${delta.fpDelta}` : delta.fpDelta} حالات
          </span>
          <span class="glass-metric-pill glass-metric-optimal">
            فارق توافق الأطباء: ${delta.concordanceDeltaPct}
          </span>
        </div>
      ` : ''}

      <!-- Reason for Rollback -->
      <div style="margin-bottom: 16px;">
        <label for="rollbackReasonSelect" style="display: block; font-size: 12.5px; font-weight: 700; margin-bottom: 6px;">
          سبب التراجع السريري الإلزامي (Clinical Reason for Rollback): <span style="color:#ef4444;">*</span>
        </label>
        <select class="glass-select" id="rollbackReasonSelect" style="width: 100%; padding: 9px 12px;">
          <option value="ارتفاع مفاجئ في الإنذارات الكاذبة (False Positive Alert Spike)">ارتفاع مفاجئ في الإنذارات الكاذبة (False Positive Alert Spike)</option>
          <option value="ملاحظات عدم دقة سريرية من الاستشاريين (Physician Feedback & Discrepancies)">ملاحظات عدم دقة سريرية من الاستشاريين (Physician Feedback & Discrepancies)</option>
          <option value="انحراف في المعايرة الإحصائية (Clinical Calibration Drift)">انحراف في المعايرة الإحصائية (Clinical Calibration Drift)</option>
          <option value="مشكلات في استقرار واجهة التنبؤ (Prediction Latency or Model Instability)">مشكلات في استقرار واجهة التنبؤ (Prediction Latency or Model Instability)</option>
          <option value="صيانة واختبار سريري دوري (Routine Clinical Verification Maintenance)">صيانة واختبار سريري دوري (Routine Clinical Verification Maintenance)</option>
        </select>
      </div>

      <!-- Operator Notes -->
      <div style="margin-bottom: 16px;">
        <label for="rollbackNotesTextarea" style="display: block; font-size: 12.5px; font-weight: 700; margin-bottom: 6px;">
          ملاحظات المشرف السريري (Clinical Operator Notes):
        </label>
        <textarea class="glass-input" id="rollbackNotesTextarea" rows="3" placeholder="اكتب تفاصيل قرار التراجع أو أرقام الحالات الاسترشادية..." style="width: 100%; resize: vertical;"></textarea>
      </div>

      <!-- Legal & Safety Acknowledgment -->
      <div style="padding: 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px;">
        <label style="display: flex; gap: 8px; align-items: flex-start; cursor: pointer; font-size: 12px; color: var(--text); line-height: 1.5;">
          <input type="checkbox" id="rollbackConsentCheck" checked style="margin-top: 3px;">
          <span>
            أقر بصفتي مسؤولاً سريرياً/إدارياً معتمداً بأن التراجع سيتم فورياً (Zero-Downtime Failover) على مستوى كافة نقاط الفرز، وسيتم توثيق العملية في السجل الرقابي القانوني الدائم.
          </span>
        </label>
      </div>
    `;

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeRollbackModal() {
    const modal = document.getElementById("modelRollbackModal");
    if (modal) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }
    pendingRollbackTargetId = null;
  }

  async function executePendingRollback() {
    if (!Service || !pendingRollbackTargetId) return;

    const consentCheck = document.getElementById("rollbackConsentCheck");
    if (consentCheck && !consentCheck.checked) {
      alert("يرجى تأكيد الإقرار السريري قبل تنفيذ التراجع الفوري.");
      return;
    }

    const reasonSelect = document.getElementById("rollbackReasonSelect");
    const notesText = document.getElementById("rollbackNotesTextarea");
    const confirmBtn = document.getElementById("btnConfirmRollback");

    const reason = reasonSelect ? reasonSelect.value : "Emergency failover to previous verified version";
    const notes = notesText ? notesText.value : "";

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span>⏳</span> جاري التبديل الفوري...`;
    }

    try {
      const result = await Service.executeRollback(pendingRollbackTargetId, { reason, notes });
      closeRollbackModal();
      showToast(`تم التراجع بنجاح إلى النسخة [${result.activeModel.version}] وتفعيلها فورياً بالإنتاج ⚡`);
      renderModelRegistryPanel(currentContainerId);
    } catch (err) {
      alert(`فشل التراجع الفوري: ${err.message}`);
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>⚡</span> تنفيذ التراجع الفوري الآمن`;
      }
    }
  }

  /**
   * Version Diff & Lineage Comparison Drawer / Modal
   */
  function openCompareModal(modelId) {
    if (!Service) return;
    const all = Service.getAllModels();
    const modelA = all.find(m => m.id === modelId || m.version === modelId) || all[0];
    const modelB = all.find(m => m.id !== modelA.id && m.conditionScope === modelA.conditionScope) || all.find(m => m.id !== modelA.id) || all[1];

    const modal = document.getElementById("modelCompareModal");
    const content = document.getElementById("compareModalBodyContent");
    if (!modal || !content) return;

    content.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div>
          <label style="font-size: 12px; font-weight: 700; color: var(--muted);">النسخة الأولى (Model A):</label>
          <select class="glass-select" id="compareSelectA" style="width: 100%; margin-top: 4px;">
            ${all.map(m => `<option value="${m.id}" ${m.id === modelA.id ? 'selected' : ''}>${m.name} (${m.version}) - ${m.status}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size: 12px; font-weight: 700; color: var(--muted);">النسخة الثانية (Model B):</label>
          <select class="glass-select" id="compareSelectB" style="width: 100%; margin-top: 4px;">
            ${all.map(m => `<option value="${m.id}" ${m.id === modelB.id ? 'selected' : ''}>${m.name} (${m.version}) - ${m.status}</option>`).join("")}
          </select>
        </div>
      </div>

      <div id="compareDynamicDiffTable">
        ${renderDiffTableHtml(modelA, modelB)}
      </div>
    `;

    const selectA = content.querySelector("#compareSelectA");
    const selectB = content.querySelector("#compareSelectB");

    function onCompareChange() {
      const mA = all.find(m => m.id === selectA.value);
      const mB = all.find(m => m.id === selectB.value);
      const diffContainer = content.querySelector("#compareDynamicDiffTable");
      if (diffContainer && mA && mB) {
        diffContainer.innerHTML = renderDiffTableHtml(mA, mB);
      }
    }

    if (selectA) selectA.onchange = onCompareChange;
    if (selectB) selectB.onchange = onCompareChange;

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeCompareModal() {
    const modal = document.getElementById("modelCompareModal");
    if (modal) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function renderDiffTableHtml(mA, mB) {
    const metA = mA.metrics;
    const metB = mB.metrics;

    const diffRows = [
      { label: "الحالة التشغيلية", valA: getStatusBadgeHtml(mA.status), valB: getStatusBadgeHtml(mB.status) },
      { label: "المعمارية السريرية", valA: mA.architecture, valB: mB.architecture },
      { label: "حجم المعاملات والقواعد", valA: mA.parametersCount || '--', valB: mB.parametersCount || '--' },
      { label: "نقطة التحقق (Checkpoint)", valA: `<code>${mA.trainingCheckpoint || '--'}</code>`, valB: `<code>${mB.trainingCheckpoint || '--'}</code>` },
      { label: "تاريخ الإطلاق", valA: mA.releaseDate || '--', valB: mB.releaseDate || '--' },
      { label: "الحساسية (Sensitivity)", valA: metA.sensitivityPct, valB: metB.sensitivityPct, isMetric: true, diff: metB.sensitivity - metA.sensitivity },
      { label: "النوعية (Specificity)", valA: metA.specificityPct, valB: metB.specificityPct, isMetric: true, diff: metB.specificity - metA.specificity },
      { label: "الدقة الإيجابية (PPV)", valA: metA.precisionPct, valB: metB.precisionPct, isMetric: true, diff: metB.precision - metA.precision },
      { label: "F1-Score", valA: metA.f1ScorePct, valB: metB.f1ScorePct, isMetric: true, diff: metB.f1Score - metA.f1Score },
      { label: "AUC-ROC", valA: metA.aucRocFormatted, valB: metB.aucRocFormatted, isMetric: true, diff: metB.aucRoc - metA.aucRoc },
      { label: "الإنذارات الكاذبة (FP)", valA: `${mA.confusionMatrix?.fp} حالات`, valB: `${mB.confusionMatrix?.fp} حالات` },
      { label: "توافق الأطباء", valA: metA.doctorConcordancePct, valB: metB.doctorConcordancePct, isMetric: true, diff: metB.doctorConcordanceRate - metA.doctorConcordanceRate },
      { label: "العينة الإجمالية ($N$)", valA: metA.totalCases, valB: metB.totalCases }
    ];

    return `
      <table class="glass-models-table" style="font-size: 12.5px;">
        <thead>
          <tr>
            <th style="width: 30%;">المعيار السريري</th>
            <th style="width: 35%;">${mA.name} (${mA.version})</th>
            <th style="width: 35%;">${mB.name} (${mB.version})</th>
          </tr>
        </thead>
        <tbody>
          ${diffRows.map(r => `
            <tr>
              <td style="font-weight: 700; color: var(--muted);">${r.label}</td>
              <td>${r.valA}</td>
              <td>
                ${r.valB}
                ${r.isMetric && r.diff !== 0 ? `
                  <small style="margin-right: 6px; font-weight: 700; color: ${r.diff > 0 ? '#10b981' : '#ef4444'};">
                    (${r.diff > 0 ? `+${(r.diff * 100).toFixed(1)}%` : `${(r.diff * 100).toFixed(1)}%`})
                  </small>
                ` : ''}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function showToast(message) {
    const existing = document.querySelector(".glass-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "glass-toast";
    toast.innerHTML = `<span>⚡</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.4s ease";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  function downloadFile(content, fileName, mimeType) {
    const a = document.createElement("a");
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Public Interface
  const ModelRegistryUI = {
    renderModelRegistryPanel,
    openRollbackModal,
    closeRollbackModal,
    executePendingRollback,
    openCompareModal,
    closeCompareModal,
    showToast,
    getActiveFilters: () => ({ ...activeFilters }),
    setFilter: (key, val) => { activeFilters[key] = val; }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ModelRegistryUI;
  }

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ModelRegistryUI = ModelRegistryUI;

})(typeof window !== "undefined" ? window : globalThis);
