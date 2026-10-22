/**
 * HEALTH VIBE AI: AI MODEL MONITORING DASHBOARD TEST SUITE (Infermedica Benchmark)
 * 
 * Verifies:
 * 1. Mathematical Accuracy & Bounds of Clinical Diagnostic Metrics:
 *    - Sensitivity (Recall)
 *    - Specificity (TNR)
 *    - Precision (PPV)
 *    - F1-Score (Harmonic Mean)
 *    - AUC-ROC (Area Under the Curve)
 *    - Doctor Concordance Rate (Physician Agreement Rate)
 *    - Wilson 95% Confidence Intervals
 * 2. Ground-Truth Clinical Benchmark Models (Infermedica Standard):
 *    - HealthVibe-Triage-v1.0 (Production Active)
 *    - HealthVibe-Triage-v1.1 (Staged Candidate)
 *    - HealthVibe-Hypoxemia-v1.2 (Pulse Oximetry Guard)
 *    - HealthVibe-SymptomNet-v2.0 (Neural Multi-condition Parser)
 *    - HealthVibe-Pediatric-v1.0 (Pediatric Respiratory Engine)
 * 3. Dynamic Filter & Search Engine:
 *    - By Model Version, Condition Domain, Deployment Status, Time Range, and Search Query.
 * 4. Aggregate Macro Metrics & Reporting:
 *    - Macro averages across filtered sets.
 *    - CSV Export generation and structure.
 * 5. UI DOM Rendering & Interactive Lightbox:
 *    - DOM generation of 6 Hero Metric Cards, 2x2 Confusion Matrix, Comparison Table, and Deep-Dive Modal.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

console.log('================================================================================');
console.log('🤖  HEALTH VIBE AI: AI MODEL MONITORING DASHBOARD TEST SUITE (Infermedica)');
console.log('    Sensitivity, Specificity, Precision, F1, AUC & Doctor Concordance');
console.log('================================================================================\n');

const servicePath = path.resolve(__dirname, '../app/modules/admin/ai-monitoring-service.js');
const uiPath = path.resolve(__dirname, '../app/modules/admin/ai-monitoring-ui.js');

const service = require(servicePath);

(function runAIMonitoringTestSuite() {
  // ── TEST 1: Metric Calculations & Mathematical Soundness ────────────────────
  console.log('▶ TEST 1: Clinical Metric Mathematical Computations & Bounds');

  // Sensitivity = TP / (TP + FN)
  assert.strictEqual(service.calculateSensitivity(42, 0), 1.0, 'Sensitivity with zero FN must be 1.0 (100%)');
  assert.strictEqual(service.calculateSensitivity(30, 10), 0.75, 'Sensitivity 30 / (30 + 10) must be 0.75');
  assert.strictEqual(service.calculateSensitivity(0, 0), 0, 'Zero denominator must return 0 without NaN');

  // Specificity = TN / (TN + FP)
  assert.strictEqual(service.calculateSpecificity(36, 2), 36 / 38, 'Specificity 36 / 38');
  assert.strictEqual(service.calculateSpecificity(28, 10), 28 / 38, 'Specificity 28 / 38');
  assert.strictEqual(service.calculateSpecificity(0, 0), 0, 'Zero denominator must return 0 without NaN');

  // Precision = TP / (TP + FP)
  assert.strictEqual(service.calculatePrecision(42, 2), 42 / 44, 'Precision 42 / 44');
  assert.strictEqual(service.calculatePrecision(42, 10), 42 / 52, 'Precision 42 / 52');
  assert.strictEqual(service.calculatePrecision(0, 0), 0, 'Zero denominator must return 0 without NaN');

  // F1-Score = 2 * (P * R) / (P + R)
  const prec = 42 / 44;
  const sens = 1.0;
  const expectedF1 = (2 * prec * sens) / (prec + sens);
  assert.strictEqual(service.calculateF1Score(prec, sens), expectedF1, 'F1-Score harmonic mean');
  assert.strictEqual(service.calculateF1Score(0, 0), 0, 'Zero F1 denominator must return 0');

  // Wilson 95% Confidence Interval
  const ci = service.calculateWilsonCI(1.0, 42);
  assert.ok(ci.lower > 0.90 && ci.lower <= 1.0, `Wilson CI lower bound for 100% on N=42 should be > 0.90 (got ${ci.lower})`);
  assert.strictEqual(ci.upper, 1.0, 'Wilson CI upper bound for 100% must be capped at 1.0');

  console.log('  ✓ Sensitivity, Specificity, Precision, F1, and Wilson CIs verified mathematically.\n');

  // ── TEST 2: Ground-Truth Evaluation Models (Infermedica Benchmark) ──────────
  console.log('▶ TEST 2: Infermedica Benchmark Models Registry & Ground Truth');

  assert.ok(Array.isArray(service.CLINICAL_AI_MODELS), 'CLINICAL_AI_MODELS must be an array');
  assert.ok(service.CLINICAL_AI_MODELS.length >= 5, 'Must contain at least 5 benchmark models');

  // Verify Active v1.0
  const v10 = service.CLINICAL_AI_MODELS.find(m => m.version === 'v1.0');
  assert.ok(v10, 'HealthVibe-Triage-v1.0 must exist');
  assert.strictEqual(v10.status, 'active');
  const v10Metrics = service.computeModelMetrics(v10).metrics;
  assert.strictEqual(v10Metrics.sensitivity, 1.0, 'v1.0 sensitivity must be 100%');
  assert.strictEqual(v10Metrics.sensitivityPct, '100.0%');
  assert.strictEqual(v10Metrics.specificityPct, '73.7%');
  assert.strictEqual(v10Metrics.precisionPct, '80.8%');
  assert.strictEqual(v10Metrics.doctorConcordancePct, '91.3%'); // 73/80 = 91.25% rounded to 91.3%

  // Verify Candidate v1.1 (80% FP Reduction)
  const v11 = service.CLINICAL_AI_MODELS.find(m => m.version === 'v1.1');
  assert.ok(v11, 'HealthVibe-Triage-v1.1 must exist');
  assert.strictEqual(v11.status, 'candidate');
  const v11Metrics = service.computeModelMetrics(v11).metrics;
  assert.strictEqual(v11Metrics.sensitivity, 1.0, 'v1.1 sensitivity must be 100%');
  assert.strictEqual(v11Metrics.specificityPct, '94.7%'); // 36/38 = 94.7%
  assert.strictEqual(v11Metrics.precisionPct, '95.5%'); // 42/44 = 95.5%
  assert.strictEqual(v11Metrics.doctorConcordancePct, '97.5%'); // 78/80 = 97.5%
  assert.ok(v11.aucRoc >= 0.998, 'AUC must be >= 0.998');

  console.log('  ✓ Ground-truth v1.0 and v1.1 evaluation results match clinical audit registers.\n');

  // ── TEST 3: Dynamic Filtering & Search Engine ───────────────────────────────
  console.log('▶ TEST 3: Fast Filtering Engine (Version, Condition, Status & Search)');

  // Filter by Version
  const filteredVersion = service.filterModels(service.CLINICAL_AI_MODELS, { version: 'model_v1_1_candidate' });
  assert.strictEqual(filteredVersion.length, 1);
  assert.strictEqual(filteredVersion[0].version, 'v1.1');

  // Filter by Condition
  const hypoxemiaModels = service.filterModels(service.CLINICAL_AI_MODELS, { condition: 'hypoxemia' });
  assert.strictEqual(hypoxemiaModels.length, 1);
  assert.strictEqual(hypoxemiaModels[0].id, 'model_hypoxemia_v1_2');

  // Filter by Status: active
  const activeModels = service.filterModels(service.CLINICAL_AI_MODELS, { status: 'active' });
  assert.ok(activeModels.every(m => m.status === 'active'), 'All returned models must be active');
  assert.ok(activeModels.length >= 2, 'Should have at least 2 active models');

  // Filter by Status: candidate
  const candidateModels = service.filterModels(service.CLINICAL_AI_MODELS, { status: 'candidate' });
  assert.ok(candidateModels.every(m => m.status === 'candidate'), 'All returned models must be candidate');

  // Search Filter
  const searchResult = service.filterModels(service.CLINICAL_AI_MODELS, { search: 'SymptomNet' });
  assert.strictEqual(searchResult.length, 1);
  assert.strictEqual(searchResult[0].id, 'model_symptomnet_v2_0');

  const arabicSearch = service.filterModels(service.CLINICAL_AI_MODELS, { search: 'الأطفال' });
  assert.ok(arabicSearch.length >= 1, 'Search by Arabic keyword must find pediatric model');

  console.log('  ✓ Filters by version, condition, deployment status, and text search verified.\n');

  // ── TEST 4: Macro-Aggregates & CSV Generation ──────────────────────────────
  console.log('▶ TEST 4: Aggregate Macro Metrics & Reporting (CSV Export)');

  const allComputed = service.filterModels(service.CLINICAL_AI_MODELS, {});
  const aggregates = service.computeAggregateMetrics(allComputed);

  assert.ok(aggregates.avgSensitivity >= 0.95, `Average Sensitivity (${aggregates.avgSensitivity}) must be >= 0.95`);
  assert.ok(aggregates.avgSpecificity >= 0.85, `Average Specificity (${aggregates.avgSpecificity}) must be >= 0.85`);
  assert.ok(aggregates.avgDoctorConcordance >= 0.90, `Doctor Concordance (${aggregates.avgDoctorConcordance}) must be >= 0.90`);
  assert.ok(aggregates.totalCases > 300, `Total evaluated clinical cases (${aggregates.totalCases}) must be > 300`);

  // CSV Generation
  const csv = service.generateModelsCsv(allComputed);
  assert.ok(csv.includes('Model ID,Version,Model Name,Status'), 'CSV must include header row');
  assert.ok(csv.includes('HealthVibe-Triage-v1.1'), 'CSV must include v1.1');
  assert.ok(csv.includes('100.0%'), 'CSV must include 100.0% sensitivity');

  console.log('  ✓ Macro-aggregates and CSV export validated.\n');

  // ── TEST 5: DOM UI Sandbox Rendering & Interactions ────────────────────────
  console.log('▶ TEST 5: Frontend DOM UI Rendering & Interactive Modal');

  // Construct a minimal browser DOM environment in VM
  const domElements = new Map();

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.children = [];
      this.attributes = {};
      this._innerHTML = '';
      this.classList = new Set();
      this.onclick = null;
      this.onchange = null;
      this.oninput = null;
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      this._innerHTML = val;
    }

    setAttribute(k, v) {
      this.attributes[k] = v;
    }

    getAttribute(k) {
      return this.attributes[k] || null;
    }

    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }

    querySelectorAll(sel) {
      return [];
    }
  }

  const containerElem = new MockElement('div', 'adminAiMonitoringPanelContainer');
  const mockDocument = {
    getElementById: id => {
      if (id === 'adminAiMonitoringPanelContainer') return containerElem;
      if (!domElements.has(id)) {
        domElements.set(id, new MockElement('div', id));
      }
      return domElements.get(id);
    },
    querySelectorAll: sel => []
  };

  const sandbox = {
    window: {},
    document: mockDocument,
    HealthVibes: {
      AIMonitoringService: service
    },
    setTimeout: (fn, ms) => fn(),
    clearTimeout: () => {},
    console
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.HealthVibes = sandbox.HealthVibes;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(uiPath, 'utf8'), sandbox);

  const uiModule = sandbox.HealthVibes.AIMonitoringUI;
  assert.ok(uiModule, 'AIMonitoringUI must be exported on HealthVibes');

  // Render the panel
  uiModule.renderAIMonitoringPanel('adminAiMonitoringPanelContainer');
  assert.ok(containerElem.innerHTML.includes('ai-monitoring-panel'), 'Panel root container must be rendered');
  assert.ok(containerElem.innerHTML.includes('الحساسية (Sensitivity / Recall)'), 'Must render Sensitivity card');
  assert.ok(containerElem.innerHTML.includes('النوعية (Specificity / TNR)'), 'Must render Specificity card');
  assert.ok(containerElem.innerHTML.includes('الدقة الإيجابية (Precision / PPV)'), 'Must render Precision card');
  assert.ok(containerElem.innerHTML.includes('معامل التوازن (F1-Score)'), 'Must render F1 card');
  assert.ok(containerElem.innerHTML.includes('مساحة المنحنى (AUC-ROC)'), 'Must render AUC-ROC card');
  assert.ok(containerElem.innerHTML.includes('توافق الأطباء (Doctor Concordance)'), 'Must render Doctor Concordance card');
  assert.ok(containerElem.innerHTML.includes('مصفوفة الارتباك السريرية'), 'Must render 2x2 Confusion Matrix');
  assert.ok(containerElem.innerHTML.includes('جدول مقارنة إصدارات النماذج'), 'Must render Comparison Table');

  // Deep-dive modal trigger
  uiModule.openModelDetailsModal('model_v1_1_candidate');
  const modalContent = mockDocument.getElementById('aiModalContent');
  assert.ok(modalContent.innerHTML.includes('HealthVibe-Triage-v1.1') || mockDocument.getElementById('aiModalModelTitle').textContent.includes('HealthVibe-Triage-v1.1'), 'Modal must reflect candidate v1.1');
  assert.ok(modalContent.innerHTML.includes('العدالة السريرية وتوزيع الفئات الديموغرافية'), 'Modal must display demographic fairness breakdown');

  console.log('  ✓ UI DOM components, 6 hero cards, confusion matrix, table, and modal verified.\n');

  console.log('================================================================================');
  console.log('✅ ALL AI MODEL MONITORING TESTS PASSED (100% SUCCESS)');
  console.log('================================================================================\n');
})();
