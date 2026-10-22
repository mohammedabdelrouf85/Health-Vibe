/**
 * Health Vibe AI - AI Model Monitoring UI (Infermedica Benchmark)
 * 
 * Renders:
 * - Live AI model performance dashboard (Sensitivity, Specificity, Precision, F1, AUC, Doctor Concordance)
 * - Interactive filter bar (version, condition, status, time range, search)
 * - 2x2 Confusion matrix visualization with safety threshold badges
 * - Models comparison table with live sorting and filtering
 * - Deep-dive inspection modal with sub-cohort demographic parity metrics
 */

(function (global) {
  "use strict";

  const Service = (global.HealthVibes && global.HealthVibes.AIMonitoringService) || (typeof require !== "undefined" ? require("./ai-monitoring-service") : null);

  let currentFilters = {
    version: "all",
    condition: "all",
    status: "all",
    timeRange: "all",
    search: ""
  };

  /**
   * Helper to format numbers safely
   */
  function safePct(val) {
    if (val === null || val === undefined || isNaN(val)) return "0.0%";
    return (val * 100).toFixed(1) + "%";
  }

  /**
   * Renders the complete AI Monitoring Panel
   */
  function renderAIMonitoringPanel(containerId = "adminAiMonitoringPanelContainer") {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Service) {
      container.innerHTML = `<div class="pill error">خدمة مراقبة الذكاء الاصطناعي غير متوفرة.</div>`;
      return;
    }

    const filteredModels = Service.filterModels(Service.CLINICAL_AI_MODELS, currentFilters);
    const agg = Service.computeAggregateMetrics(filteredModels);

    // Selected model for confusion matrix focus
    const focusModel = (currentFilters.version !== "all" 
      ? filteredModels[0] 
      : filteredModels.find(m => m.status === "active") || filteredModels[0]) || Service.computeModelMetrics(Service.CLINICAL_AI_MODELS[0]);

    const cm = focusModel ? focusModel.confusionMatrix : { tp: 0, fp: 0, tn: 0, fn: 0 };
    const focusMetrics = focusModel ? focusModel.metrics : {};

    // Sensitivity threshold badge class
    const sensClass = agg.avgSensitivity >= 0.95 ? "ai-badge-optimal" : (agg.avgSensitivity >= 0.85 ? "ai-badge-warning" : "ai-badge-danger");
    const specClass = agg.avgSpecificity >= 0.90 ? "ai-badge-optimal" : (agg.avgSpecificity >= 0.75 ? "ai-badge-warning" : "ai-badge-danger");
    const concClass = agg.avgDoctorConcordance >= 0.95 ? "ai-badge-optimal" : (agg.avgDoctorConcordance >= 0.88 ? "ai-badge-warning" : "ai-badge-danger");

    container.innerHTML = `
      <section class="ai-monitoring-panel" id="aiMonitoringDashboardRoot" dir="rtl" aria-label="لوحة مراقبة جودة نماذج الذكاء الاصطناعي">
        <!-- Header -->
        <div class="ai-mon-header">
          <div>
            <div class="ai-mon-title-wrap">
              <span class="ai-status-pulse" aria-hidden="true"></span>
              <h3 class="ai-mon-title">
                لوحة مراقبة جودة نماذج الذكاء الاصطناعي السريرية
                <span style="font-size: 13px; font-weight: 500; color: var(--muted);">(Infermedica Clinical AI Benchmark)</span>
              </h3>
              <span class="pill ok" style="font-size: 11px;">اعتماد سريري كامل 🩺</span>
            </div>
            <p class="ai-mon-subtitle">
              رصد دقيق لمقاييس الحساسية، النوعية، الدقة، F1، مساحة AUC، ونسبة توافق قرارات الأطباء مع مخرجات النماذج السريرية
            </p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="soft-button" id="aiMonRefreshBtn" style="padding: 7px 14px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px;">
              <span>🔄</span> تحديث المقاييس
            </button>
            <button type="button" class="outline-button" id="aiMonExportCsvBtn" style="padding: 7px 14px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px;">
              <span>📥</span> تصدير تقرير CSV
            </button>
            <button type="button" class="outline-button" id="aiMonPrintBtn" style="padding: 7px 14px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px;">
              <span>🖨️</span> طباعة
            </button>
          </div>
        </div>

        <!-- Fast Filter Toolbar -->
        <div class="ai-mon-filter-toolbar">
          <div class="ai-mon-filter-group">
            <!-- Model Version Filter -->
            <label for="aiFilterVersion" style="font-size: 12.5px; font-weight: 700; color: var(--muted);">الإصدار:</label>
            <select class="ai-mon-select" id="aiFilterVersion">
              <option value="all" ${currentFilters.version === "all" ? "selected" : ""}>كافة الإصدارات (${Service.CLINICAL_AI_MODELS.length})</option>
              ${Service.CLINICAL_AI_MODELS.map(m => `
                <option value="${m.id}" ${currentFilters.version === m.id ? "selected" : ""}>
                  ${m.name} (${m.status === 'active' ? 'نشط 🟢' : m.status === 'candidate' ? 'مرشح 🟡' : 'تجريبي 🧪'})
                </option>
              `).join("")}
            </select>

            <!-- Condition / Scope Filter -->
            <label for="aiFilterCondition" style="font-size: 12.5px; font-weight: 700; color: var(--muted);">الحالة السريرية:</label>
            <select class="ai-mon-select" id="aiFilterCondition">
              <option value="all" ${currentFilters.condition === "all" ? "selected" : ""}>كافة التخصصات (All Conditions)</option>
              <option value="respiratory_triage" ${currentFilters.condition === "respiratory_triage" ? "selected" : ""}>فرز الطوارئ والأعراض التنفسية</option>
              <option value="hypoxemia" ${currentFilters.condition === "hypoxemia" ? "selected" : ""}>نقص الأكسجة ومؤشر SpO2</option>
              <option value="pneumonia_covid" ${currentFilters.condition === "pneumonia_covid" ? "selected" : ""}>الالتهاب الرئوي والفيروسي</option>
              <option value="pediatric" ${currentFilters.condition === "pediatric" ? "selected" : ""}>طب الأطفال والرضع</option>
            </select>

            <!-- Deployment Status Filter -->
            <label for="aiFilterStatus" style="font-size: 12.5px; font-weight: 700; color: var(--muted);">الحالة:</label>
            <select class="ai-mon-select" id="aiFilterStatus">
              <option value="all" ${currentFilters.status === "all" ? "selected" : ""}>كافة الحالات</option>
              <option value="active" ${currentFilters.status === "active" ? "selected" : ""}>إنتاج نشط (Active)</option>
              <option value="candidate" ${currentFilters.status === "candidate" ? "selected" : ""}>مرشح مؤهل (Candidate)</option>
              <option value="experimental" ${currentFilters.status === "experimental" ? "selected" : ""}>تجريبي (Experimental)</option>
            </select>
          </div>

          <div class="ai-mon-filter-group">
            <!-- Time Range Pills -->
            <div style="display: flex; gap: 6px; align-items: center;">
              <button type="button" class="ai-time-pill-btn ${currentFilters.timeRange === 'all' ? 'active' : ''}" data-range="all">الكل</button>
              <button type="button" class="ai-time-pill-btn ${currentFilters.timeRange === '7d' ? 'active' : ''}" data-range="7d">7 أيام</button>
              <button type="button" class="ai-time-pill-btn ${currentFilters.timeRange === '30d' ? 'active' : ''}" data-range="30d">30 يوماً</button>
              <button type="button" class="ai-time-pill-btn ${currentFilters.timeRange === '90d' ? 'active' : ''}" data-range="90d">90 يوماً</button>
            </div>

            <!-- Instant Search Input -->
            <input type="search" class="ai-mon-search" id="aiMonSearchInput" placeholder="بحث بالاسم أو التخصص..." value="${currentFilters.search}" />
          </div>
        </div>

        <!-- 6 Core Hero Metric Cards -->
        <div class="ai-metrics-grid">
          <!-- 1. Sensitivity (Recall) -->
          <div class="ai-metric-card" id="aiCardSensitivity">
            <div class="ai-metric-card-top">
              <div class="ai-metric-icon-wrap ai-metric-icon-emerald">🎯</div>
              <span class="ai-metric-badge ${sensClass}">الهدف: <bdi class="bidi-isolate">≥ 95.0%</bdi></span>
            </div>
            <div class="ai-metric-label">الحساسية (Sensitivity / Recall)</div>
            <div class="ai-metric-value-wrap">
              <span class="ai-metric-value" style="color: #10b981;" id="aiMetricSensValue">${agg.avgSensitivityPct}</span>
              <span class="ai-metric-target">سلامة سريرية</span>
            </div>
            <div class="ai-metric-subtext">
              نسبة اكتشاف الحالات الحرجة دون تفويت (${focusMetrics.sensitivityCI ? `CI95: ${safePct(focusMetrics.sensitivityCI.lower)} - ${safePct(focusMetrics.sensitivityCI.upper)}` : 'Zero Missed'})
            </div>
            <div class="ai-metric-progress">
              <div class="ai-metric-progress-bar" style="width: ${agg.avgSensitivity * 100}%; background: linear-gradient(90deg, #10b981, #059669);"></div>
            </div>
          </div>

          <!-- 2. Specificity -->
          <div class="ai-metric-card" id="aiCardSpecificity">
            <div class="ai-metric-card-top">
              <div class="ai-metric-icon-wrap ai-metric-icon-blue">🛡️</div>
              <span class="ai-metric-badge ${specClass}">الهدف: <bdi class="bidi-isolate">≥ 90.0%</bdi></span>
            </div>
            <div class="ai-metric-label">النوعية (Specificity / TNR)</div>
            <div class="ai-metric-value-wrap">
              <span class="ai-metric-value" style="color: #3b82f6;" id="aiMetricSpecValue">${agg.avgSpecificityPct}</span>
              <span class="ai-metric-target">تجنب الإنذار الكاذب</span>
            </div>
            <div class="ai-metric-subtext">
              منع التحويل غير الضروري للطوارئ (${focusMetrics.specificityCI ? `CI95: ${safePct(focusMetrics.specificityCI.lower)} - ${safePct(focusMetrics.specificityCI.upper)}` : 'Optimal TNR'})
            </div>
            <div class="ai-metric-progress">
              <div class="ai-metric-progress-bar" style="width: ${agg.avgSpecificity * 100}%; background: linear-gradient(90deg, #3b82f6, #0284c7);"></div>
            </div>
          </div>

          <!-- 3. Precision (PPV) -->
          <div class="ai-metric-card" id="aiCardPrecision">
            <div class="ai-metric-card-top">
              <div class="ai-metric-icon-wrap ai-metric-icon-teal">🔬</div>
              <span class="ai-metric-badge ai-badge-optimal">PPV موثوق</span>
            </div>
            <div class="ai-metric-label">الدقة الإيجابية (Precision / PPV)</div>
            <div class="ai-metric-value-wrap">
              <span class="ai-metric-value" style="color: var(--teal, #09b8b6);" id="aiMetricPrecValue">${agg.avgPrecisionPct}</span>
              <span class="ai-metric-target">ثقة التنبؤ</span>
            </div>
            <div class="ai-metric-subtext">
              صحة توقعات النموذج عند تصنيف الحالة كإيجابية
            </div>
            <div class="ai-metric-progress">
              <div class="ai-metric-progress-bar" style="width: ${agg.avgPrecision * 100}%; background: linear-gradient(90deg, var(--teal, #09b8b6), #0d9488);"></div>
            </div>
          </div>

          <!-- 4. F1-Score -->
          <div class="ai-metric-card" id="aiCardF1">
            <div class="ai-metric-card-top">
              <div class="ai-metric-icon-wrap ai-metric-icon-purple">⚖️</div>
              <span class="ai-metric-badge ai-badge-optimal">التوازن السريري</span>
            </div>
            <div class="ai-metric-label">معامل التوازن (F1-Score)</div>
            <div class="ai-metric-value-wrap">
              <span class="ai-metric-value" style="color: #8b5cf6;" id="aiMetricF1Value">${agg.avgF1ScorePct}</span>
              <span class="ai-metric-target">Harmonic Mean</span>
            </div>
            <div class="ai-metric-subtext">
              المتوسط التوافقي بين الحساسية والدقة لتفادي الانحياز
            </div>
            <div class="ai-metric-progress">
              <div class="ai-metric-progress-bar" style="width: ${agg.avgF1Score * 100}%; background: linear-gradient(90deg, #8b5cf6, #7c3aed);"></div>
            </div>
          </div>

          <!-- 5. AUC-ROC -->
          <div class="ai-metric-card" id="aiCardAuc">
            <div class="ai-metric-card-top">
              <div class="ai-metric-icon-wrap ai-metric-icon-amber">📈</div>
              <span class="ai-metric-badge ai-badge-optimal">تمييز فائق</span>
            </div>
            <div class="ai-metric-label">مساحة المنحنى (AUC-ROC)</div>
            <div class="ai-metric-value-wrap">
              <span class="ai-metric-value" style="color: #f59e0b;" id="aiMetricAucValue">${agg.avgAucRocFormatted}</span>
              <span class="ai-metric-target">Discrimination</span>
            </div>
            <div class="ai-metric-subtext">
              قدرة النموذج على الفصل التام بين الحالات السليمة والحرجة
            </div>
            <div class="ai-metric-progress">
              <div class="ai-metric-progress-bar" style="width: ${agg.avgAucRoc * 100}%; background: linear-gradient(90deg, #f59e0b, #d97706);"></div>
            </div>
          </div>

          <!-- 6. Doctor Concordance Rate -->
          <div class="ai-metric-card" id="aiCardConcordance">
            <div class="ai-metric-card-top">
              <div class="ai-metric-icon-wrap ai-metric-icon-rose">🩺</div>
              <span class="ai-metric-badge ${concClass}">توافق استشاريين</span>
            </div>
            <div class="ai-metric-label">توافق الأطباء (Doctor Concordance)</div>
            <div class="ai-metric-value-wrap">
              <span class="ai-metric-value" style="color: #f43f5e;" id="aiMetricConcValue">${agg.avgDoctorConcordancePct}</span>
              <span class="ai-metric-target">Human-in-the-Loop</span>
            </div>
            <div class="ai-metric-subtext">
              نسبة موافقة واعتماد الأطباء للفرز والتشخيص دون تعديل
            </div>
            <div class="ai-metric-progress">
              <div class="ai-metric-progress-bar" style="width: ${agg.avgDoctorConcordance * 100}%; background: linear-gradient(90deg, #f43f5e, #e11d48);"></div>
            </div>
          </div>
        </div>

        <!-- Confusion Matrix & Physician Consensus Row -->
        <div class="ai-matrix-insights-row">
          <!-- 2x2 Confusion Matrix -->
          <div class="ai-card-panel">
            <div class="ai-card-panel-head">
              <div>
                <h4 class="ai-card-panel-title">
                  مصفوفة الارتباك السريرية (Clinical Confusion Matrix)
                </h4>
                <span style="font-size: 12px; color: var(--muted);">
                  النموذج المحدد: <strong>${focusModel ? focusModel.name : '--'}</strong> (إجمالي العينة: ${cm.tp + cm.fp + cm.tn + cm.fn} فحص)
                </span>
              </div>
              <span class="pill ok" style="font-size: 11px;">FN = ${cm.fn} (Zero Missed)</span>
            </div>

            <div class="confusion-matrix-grid">
              <!-- True Positives (TP) -->
              <div class="cm-cell cm-cell-tp">
                <div class="cm-cell-val" id="cmValTP">${cm.tp}</div>
                <div class="cm-cell-title">صحيح إيجابي (TP)</div>
                <div class="cm-cell-desc">حالات حرجة صنفها الذكاء الاصطناعي بدقة كحالات طارئة</div>
              </div>

              <!-- False Positives (FP) -->
              <div class="cm-cell cm-cell-fp">
                <div class="cm-cell-val" id="cmValFP">${cm.fp}</div>
                <div class="cm-cell-title">إيجابي كاذب (FP)</div>
                <div class="cm-cell-desc">إنذارات أمان تم تصعيدها احترازياً من النموذج</div>
              </div>

              <!-- False Negatives (FN) -->
              <div class="cm-cell cm-cell-fn">
                <div class="cm-cell-val" id="cmValFN">${cm.fn}</div>
                <div class="cm-cell-title">سلبي كاذب (FN) ⚠️</div>
                <div class="cm-cell-desc">تفويت حالات حرجة (الهدف الصارم: 0 تفويت)</div>
              </div>

              <!-- True Negatives (TN) -->
              <div class="cm-cell cm-cell-tn">
                <div class="cm-cell-val" id="cmValTN">${cm.tn}</div>
                <div class="cm-cell-title">صحيح سلبي (TN)</div>
                <div class="cm-cell-desc">حالات مستقرة صنفها النموذج بدقة دون إثارة ذعر</div>
              </div>
            </div>
          </div>

          <!-- Doctor Agreement & Human Consensus Insights -->
          <div class="ai-card-panel">
            <div class="ai-card-panel-head">
              <div>
                <h4 class="ai-card-panel-title">
                  حوكمة ومطابقة القرارات الطبية (Physician Consensus & Overrides)
                </h4>
                <span style="font-size: 12px; color: var(--muted);">
                  تدقيق توافق قرارات أطباء الصدر والاستشاريين مع التوصيات
                </span>
              </div>
              <span class="pill info" style="font-size: 11px;">مراجعة استشارية</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
                <div>
                  <strong style="font-size: 13.5px; display: block;">قرارات معتمدة ومتوافقة تماماً</strong>
                  <small style="color: var(--muted);">اتفاق كامل بين الطبيب ومستوى الفرز المقترح</small>
                </div>
                <span style="font-size: 18px; font-weight: 800; color: #10b981;">
                  ${focusMetrics.doctorAgreedCases || 0} / ${focusMetrics.doctorTotalEvaluated || 0}
                  <small style="font-size: 12px;">(${focusMetrics.doctorConcordancePct || '0%'})</small>
                </span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
                <div>
                  <strong style="font-size: 13.5px; display: block;">تعديلات الطبيب السريرية (Overrides)</strong>
                  <small style="color: var(--muted);">تعديل الطبيب لدرجة الفرز بناءً على العلامات الحيوية الدقيقة</small>
                </div>
                <span style="font-size: 18px; font-weight: 800; color: #f59e0b;">
                  ${focusModel ? focusModel.physicianOverrides : 0} حالات
                </span>
              </div>

              <div style="padding: 12px; background: rgba(9, 184, 182, 0.05); border: 1px solid rgba(9, 184, 182, 0.2); border-radius: 10px;">
                <div style="font-size: 12.5px; font-weight: 700; color: var(--teal, #09b8b6); margin-bottom: 4px;">
                  💡 خلاصة التقييم السريري (Infermedica Validation Summary):
                </div>
                <p style="margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5;">
                  ${focusModel ? focusModel.notes : 'لا توجد ملاحظات سريرية مسجلة.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Models Comparison & Lifecycle Table -->
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div>
              <h4 style="margin: 0; font-size: 16px; font-weight: 700;">
                جدول مقارنة إصدارات النماذج وتتبع الأداء (Models Comparison Matrix)
              </h4>
              <small style="color: var(--muted);">مقارنة تفصيلية للحساسية والنوعية ونسبة التوافق عبر إصدارات المنظومة</small>
            </div>
            <span class="pill info" style="font-size: 11px;">${filteredModels.length} نماذج مطابقة</span>
          </div>

          <div class="ai-table-wrap">
            <table class="ai-models-table" id="aiModelsTable">
              <thead>
                <tr>
                  <th>إصدار النموذج</th>
                  <th>الحالة</th>
                  <th>النطاق السريري</th>
                  <th>الحساسية (Sensitivity)</th>
                  <th>النوعية (Specificity)</th>
                  <th>الدقة (PPV)</th>
                  <th>F1-Score</th>
                  <th>AUC-ROC</th>
                  <th>توافق الأطباء</th>
                  <th>العينة ($N$)</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${filteredModels.length === 0 ? `
                  <tr>
                    <td colspan="11" style="text-align: center; padding: 24px; color: var(--muted);">
                      لا توجد نماذج مطابقة لمعايير البحث والتصفية الحالية.
                    </td>
                  </tr>
                ` : filteredModels.map(m => {
                  const met = m.metrics;
                  const statusBadge = m.status === 'active'
                    ? `<span class="ai-status-pill ai-status-active">🟢 نشط بالإنتاج</span>`
                    : m.status === 'candidate'
                    ? `<span class="ai-status-pill ai-status-candidate">🟡 مؤهل للاعتماد</span>`
                    : `<span class="ai-status-pill ai-status-experimental">🧪 قيد التجربة</span>`;

                  return `
                    <tr data-model-id="${m.id}">
                      <td>
                        <div class="ai-model-name-group">
                          <strong>${m.name}</strong>
                          <span style="font-size: 11px; color: var(--muted);">(${m.version})</span>
                        </div>
                        <small style="font-size: 11px; color: var(--muted);">${m.architecture}</small>
                      </td>
                      <td>${statusBadge}</td>
                      <td>
                        <span style="font-size: 12px; font-weight: 600;">${m.conditionLabelAr}</span>
                      </td>
                      <td>
                        <span class="ai-score-pill ${met.sensitivity >= 0.95 ? 'ai-score-high' : 'ai-score-mid'}">
                          ${met.sensitivityPct}
                        </span>
                      </td>
                      <td>
                        <span class="ai-score-pill ${met.specificity >= 0.90 ? 'ai-score-high' : 'ai-score-mid'}">
                          ${met.specificityPct}
                        </span>
                      </td>
                      <td>
                        <span class="ai-score-pill ${met.precision >= 0.90 ? 'ai-score-high' : 'ai-score-mid'}">
                          ${met.precisionPct}
                        </span>
                      </td>
                      <td>
                        <span class="ai-score-pill ${met.f1Score >= 0.90 ? 'ai-score-high' : 'ai-score-mid'}">
                          ${met.f1ScorePct}
                        </span>
                      </td>
                      <td>
                        <span class="ai-score-pill ${met.aucRoc >= 0.95 ? 'ai-score-high' : 'ai-score-mid'}">
                          ${met.aucRocFormatted}
                        </span>
                      </td>
                      <td>
                        <span class="ai-score-pill ${met.doctorConcordanceRate >= 0.95 ? 'ai-score-high' : 'ai-score-mid'}">
                          ${met.doctorConcordancePct}
                        </span>
                      </td>
                      <td><strong>${met.totalCases}</strong></td>
                      <td>
                        <button type="button" class="soft-button btn-inspect-model" data-id="${m.id}" style="padding: 5px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                          <span>🔍</span> فحص التفاصيل
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Deep Dive Model Inspection Modal / Lightbox -->
      <div class="ai-modal-backdrop" id="aiModelDetailModal" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="ai-modal-card">
          <div class="ai-modal-header">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h3 style="margin: 0; font-size: 18px;" id="aiModalModelTitle">تفاصيل تقييم النموذج</h3>
                <span class="pill ok" id="aiModalStatusBadge">نشط</span>
              </div>
              <small style="color: var(--muted);" id="aiModalSubtitle">النتائج السريرية ومصفوفة الارتباك</small>
            </div>
            <button type="button" class="ai-modal-close-btn" id="aiModalCloseBtn" aria-label="إغلاق">&times;</button>
          </div>

          <div id="aiModalContent">
            <!-- Dynamically populated by openModelDetailsModal -->
          </div>
        </div>
      </div>
    `;

    bindAIMonitoringEvents();
  }

  /**
   * Binds event listeners for filtering, modal inspection, and exports
   */
  function bindAIMonitoringEvents() {
    // 1. Version filter dropdown
    const versionSelect = document.getElementById("aiFilterVersion");
    if (versionSelect) {
      versionSelect.onchange = e => {
        currentFilters.version = e.target.value;
        renderAIMonitoringPanel();
      };
    }

    // 2. Condition filter dropdown
    const conditionSelect = document.getElementById("aiFilterCondition");
    if (conditionSelect) {
      conditionSelect.onchange = e => {
        currentFilters.condition = e.target.value;
        renderAIMonitoringPanel();
      };
    }

    // 3. Status filter dropdown
    const statusSelect = document.getElementById("aiFilterStatus");
    if (statusSelect) {
      statusSelect.onchange = e => {
        currentFilters.status = e.target.value;
        renderAIMonitoringPanel();
      };
    }

    // 4. Time range buttons
    const timeBtns = document.querySelectorAll(".ai-time-pill-btn");
    timeBtns.forEach(btn => {
      btn.onclick = () => {
        currentFilters.timeRange = btn.getAttribute("data-range") || "all";
        renderAIMonitoringPanel();
      };
    });

    // 5. Search input (debounced)
    const searchInput = document.getElementById("aiMonSearchInput");
    if (searchInput) {
      let debounceTimer = null;
      searchInput.oninput = e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          currentFilters.search = e.target.value;
          renderAIMonitoringPanel();
        }, 250);
      };
    }

    // 6. Refresh button
    const refreshBtn = document.getElementById("aiMonRefreshBtn");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        renderAIMonitoringPanel();
      };
    }

    // 7. Export CSV button
    const exportCsvBtn = document.getElementById("aiMonExportCsvBtn");
    if (exportCsvBtn) {
      exportCsvBtn.onclick = () => {
        exportModelsCsv();
      };
    }

    // 8. Print button
    const printBtn = document.getElementById("aiMonPrintBtn");
    if (printBtn) {
      printBtn.onclick = () => {
        window.print();
      };
    }

    // 9. Inspect buttons on table
    const inspectBtns = document.querySelectorAll(".btn-inspect-model");
    inspectBtns.forEach(btn => {
      btn.onclick = () => {
        const modelId = btn.getAttribute("data-id");
        openModelDetailsModal(modelId);
      };
    });

    // 10. Modal close button & backdrop
    const modal = document.getElementById("aiModelDetailModal");
    const closeBtn = document.getElementById("aiModalCloseBtn");
    if (closeBtn && modal) {
      closeBtn.onclick = () => closeModal();
      modal.onclick = e => {
        if (e.target === modal) closeModal();
      };
    }
  }

  function closeModal() {
    const modal = document.getElementById("aiModelDetailModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Opens the deep-dive modal for a specific model
   */
  function openModelDetailsModal(modelId) {
    if (!Service) return;
    const model = Service.CLINICAL_AI_MODELS.find(m => m.id === modelId);
    if (!model) return;

    const computed = Service.computeModelMetrics(model);
    const met = computed.metrics;
    const cm = computed.confusionMatrix;

    const modal = document.getElementById("aiModelDetailModal");
    const title = document.getElementById("aiModalModelTitle");
    const subtitle = document.getElementById("aiModalSubtitle");
    const content = document.getElementById("aiModalContent");

    if (title) title.textContent = `${computed.name} (${computed.version})`;
    if (subtitle) subtitle.textContent = computed.releaseTitle;

    if (content) {
      content.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
            <small style="color: var(--muted); font-size: 11px;">الحساسية (Sensitivity)</small>
            <div style="font-size: 18px; font-weight: 800; color: #10b981;">${met.sensitivityPct}</div>
            <small style="font-size: 10px; color: var(--muted);">CI95: ${safePct(met.sensitivityCI.lower)} - ${safePct(met.sensitivityCI.upper)}</small>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
            <small style="color: var(--muted); font-size: 11px;">النوعية (Specificity)</small>
            <div style="font-size: 18px; font-weight: 800; color: #3b82f6;">${met.specificityPct}</div>
            <small style="font-size: 10px; color: var(--muted);">CI95: ${safePct(met.specificityCI.lower)} - ${safePct(met.specificityCI.upper)}</small>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
            <small style="color: var(--muted); font-size: 11px;">الدقة (PPV)</small>
            <div style="font-size: 18px; font-weight: 800; color: var(--teal, #09b8b6);">${met.precisionPct}</div>
            <small style="font-size: 10px; color: var(--muted);">CI95: ${safePct(met.precisionCI.lower)} - ${safePct(met.precisionCI.upper)}</small>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
            <small style="color: var(--muted); font-size: 11px;">معامل F1</small>
            <div style="font-size: 18px; font-weight: 800; color: #8b5cf6;">${met.f1ScorePct}</div>
            <small style="font-size: 10px; color: var(--muted);">Harmonic Mean</small>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
            <small style="color: var(--muted); font-size: 11px;">AUC-ROC</small>
            <div style="font-size: 18px; font-weight: 800; color: #f59e0b;">${met.aucRocFormatted}</div>
            <small style="font-size: 10px; color: var(--muted);">تمييز سريري</small>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
            <small style="color: var(--muted); font-size: 11px;">توافق الأطباء</small>
            <div style="font-size: 18px; font-weight: 800; color: #f43f5e;">${met.doctorConcordancePct}</div>
            <small style="font-size: 10px; color: var(--muted);">${met.doctorAgreedCases}/${met.doctorTotalEvaluated}</small>
          </div>
        </div>

        <h5 style="margin: 16px 0 8px; font-size: 14px;">مصفوفة الارتباك السريرية ($N = ${cm.tp + cm.fp + cm.tn + cm.fn}$)</h5>
        <div class="confusion-matrix-grid" style="margin-bottom: 18px;">
          <div class="cm-cell cm-cell-tp">
            <div class="cm-cell-val">${cm.tp}</div>
            <div class="cm-cell-title">صحيح إيجابي (TP)</div>
          </div>
          <div class="cm-cell cm-cell-fp">
            <div class="cm-cell-val">${cm.fp}</div>
            <div class="cm-cell-title">إيجابي كاذب (FP)</div>
          </div>
          <div class="cm-cell cm-cell-fn">
            <div class="cm-cell-val">${cm.fn}</div>
            <div class="cm-cell-title">سلبي كاذب (FN)</div>
          </div>
          <div class="cm-cell cm-cell-tn">
            <div class="cm-cell-val">${cm.tn}</div>
            <div class="cm-cell-title">صحيح سلبي (TN)</div>
          </div>
        </div>

        ${computed.subCohorts ? `
          <h5 style="margin: 16px 0 8px; font-size: 14px;">العدالة السريرية وتوزيع الفئات الديموغرافية (Demographic Subgroup Fairness)</h5>
          <div class="ai-disparity-grid">
            ${Object.entries(computed.subCohorts).map(([cohortKey, cData]) => `
              <div class="ai-disparity-item">
                <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 12.5px; margin-bottom: 4px;">
                  <span>${cohortKey === 'pediatric' ? 'أطفال (< 18)' : cohortKey === 'adult' ? 'بالغين (18-64)' : cohortKey === 'geriatric' ? 'كبار السن (≥ 65)' : cohortKey === 'chronicLungDisease' ? 'أمراض الرئة المزمنة' : cohortKey}</span>
                  <span style="color: var(--muted); font-size: 11px;">N = ${cData.n}</span>
                </div>
                <div style="font-size: 12px; display: flex; justify-content: space-between;">
                  <span>حساسية: <strong style="color: #10b981;">${safePct(cData.sensitivity)}</strong></span>
                  <span>نوعية: <strong style="color: #3b82f6;">${safePct(cData.specificity)}</strong></span>
                  <span>توافق: <strong style="color: #f43f5e;">${safePct(cData.concordance)}</strong></span>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ''}

        <div style="margin-top: 18px; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;">
          <strong style="font-size: 13px; color: var(--ink);">ملاحظات التقييم والاعتماد:</strong>
          <p style="margin: 4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5;">${computed.notes}</p>
        </div>
      `;
    }

    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  /**
   * Generates and triggers CSV file download
   */
  function exportModelsCsv() {
    if (!Service) return;
    const filteredModels = Service.filterModels(Service.CLINICAL_AI_MODELS, currentFilters);
    const csvContent = Service.generateModelsCsv(filteredModels);

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `HealthVibe_AI_Model_Monitoring_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const AIMonitoringUI = {
    renderAIMonitoringPanel,
    openModelDetailsModal,
    closeModal,
    exportModelsCsv,
    getFilters: () => ({ ...currentFilters }),
    setFilter: (key, val) => {
      currentFilters[key] = val;
      renderAIMonitoringPanel();
    }
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AIMonitoringUI = AIMonitoringUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AIMonitoringUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
