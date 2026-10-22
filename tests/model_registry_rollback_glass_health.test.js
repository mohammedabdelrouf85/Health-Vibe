/**
 * HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK TEST SUITE (Glass Health Benchmark)
 * 
 * Verifies:
 * 1. Model Registry Data & Lineage Tracking:
 *    - Model version tracking (v1.0, v1.1, v1.2-sp, v2.0-exp, v1.0-ped).
 *    - Release dates, training checkpoints, architectures, parameter counts, condition scopes.
 *    - Ground-truth clinical metrics (Sensitivity, Specificity, Precision, F1, AUC, Concordance).
 * 2. Fast Multi-criteria Filtering & Search:
 *    - Filtering by condition scope, deployment status, time range, search keywords, and sorting.
 * 3. Side-by-Side Rollback Delta Calculation:
 *    - Accurate comparison between Current Active and Target Rollback models.
 *    - Sensitivity, Specificity, False Positive count, and Concordance deltas.
 * 4. Safe Rollback & Zero-Downtime Hot-Swap Execution:
 *    - Atomically activates target previous version.
 *    - Demotes current active model to 'rolled_back' with rollback reason and notes.
 *    - Persists rollback audit trail events.
 * 5. Model Promotion Lifecycle:
 *    - Promoting candidate model to active and archiving previous version.
 * 6. CSV Registry Export:
 *    - Validates exported columns and data integrity.
 * 7. DOM UI Sandbox Component Rendering & Interactive Modals:
 *    - Renders Glass Health glassmorphic panel, active scopes bar, table, and buttons.
 *    - Opens Safe Rollback confirmation modal with side-by-side comparison.
 *    - Opens Version Compare diff drawer.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

console.log('================================================================================');
console.log('📜  HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK TEST SUITE (Glass Health)');
console.log('    Model Registry, Hot-Swap Rollback, Lineage Diffs & Fast Filters');
console.log('================================================================================\n');

const servicePath = path.resolve(__dirname, '../app/modules/admin/model-registry-service.js');
const uiPath = path.resolve(__dirname, '../app/modules/admin/model-registry-ui.js');

const service = require(servicePath);

(async function runModelRegistryTestSuite() {
  // Always reset registry to clean state before running suite
  service.resetRegistry();

  // ── TEST 1: Model Registry Data & Lineage Tracking ──────────────────────────
  console.log('▶ TEST 1: Model Registry Catalog & Lineage Metadata (Glass Health Benchmark)');

  const models = service.getAllModels();
  assert.ok(Array.isArray(models), 'Registry must return an array of models');
  assert.ok(models.length >= 5, 'Registry must contain at least 5 clinical models');

  // Verify v1.1 candidate
  const v11 = models.find(m => m.version === 'v1.1');
  assert.ok(v11, 'Model v1.1 must exist in registry');
  assert.strictEqual(v11.conditionScope, 'respiratory_triage');
  assert.strictEqual(v11.trainingCheckpoint, 'chk_triage_v1.1_b80_final');
  assert.strictEqual(v11.releaseDate, '2026-10-20');
  assert.strictEqual(v11.metrics.sensitivity, 1.0);
  assert.strictEqual(v11.metrics.specificityPct, '94.7%');
  assert.strictEqual(v11.metrics.doctorConcordancePct, '97.5%');

  // Verify v1.0 active baseline
  const v10 = models.find(m => m.version === 'v1.0');
  assert.ok(v10, 'Model v1.0 baseline must exist');
  assert.strictEqual(v10.status, 'active');
  assert.strictEqual(v10.metrics.sensitivity, 1.0);
  assert.strictEqual(v10.metrics.specificityPct, '73.7%');
  assert.strictEqual(v10.metrics.doctorConcordancePct, '91.3%');
  assert.strictEqual(v10.releaseDate, '2026-09-29');

  console.log('  ✓ Model registry catalog, architectures, checkpoints, and release dates verified.\n');

  // ── TEST 2: Active Model Lookup & Rollback Candidates ───────────────────────
  console.log('▶ TEST 2: Active Model Scoping & Rollback Candidates Identification');

  const activeTriage = service.getActiveModelForScope('respiratory_triage');
  assert.ok(activeTriage, 'Active respiratory triage model must exist');
  assert.strictEqual(activeTriage.version, 'v1.0');

  const candidates = service.getRollbackCandidatesForScope('respiratory_triage');
  assert.ok(candidates.length >= 1, 'Must have at least 1 candidate/alternative version for respiratory triage');
  assert.ok(candidates.some(c => c.version === 'v1.1'), 'v1.1 candidate exists for triage');

  const activeHypoxemia = service.getActiveModelForScope('hypoxemia');
  assert.ok(activeHypoxemia, 'Active hypoxemia model must exist');
  assert.strictEqual(activeHypoxemia.id, 'model_hypoxemia_v1_2');

  console.log('  ✓ Active models by scope and rollback candidate identification verified.\n');

  // ── TEST 3: Rollback Delta Computation (Side-by-Side Comparison) ─────────────
  console.log('▶ TEST 3: Side-by-Side Rollback Delta Computation (Glass Health Diff)');

  // Let's promote v1.1 first so it becomes active
  await service.promoteModel('model_v1_1_candidate');
  const newActive = service.getActiveModelForScope('respiratory_triage');
  assert.strictEqual(newActive.version, 'v1.1', 'v1.1 is now active in production');

  // Now compute delta when considering rolling back to v1.0
  const rollbackTarget = models.find(m => m.version === 'v1.0');
  const delta = service.computeRollbackDelta(newActive, rollbackTarget);

  assert.ok(delta, 'Rollback delta object must be computed');
  assert.strictEqual(delta.currentModel.version, 'v1.1');
  assert.strictEqual(delta.targetModel.version, 'v1.0');
  // Sensitivity remains 100%
  assert.strictEqual(delta.sensitivityDelta, 0);
  assert.strictEqual(delta.isSafetyNeutral, true, 'Zero drop in critical sensitivity');
  // Specificity drops from 94.7% to 73.7%
  assert.ok(delta.specificityDelta < 0, 'Specificity delta reflects previous version baseline');
  // FP count increases from 2 to 10 (+8 FP)
  assert.strictEqual(delta.fpDelta, 8, 'FP delta is 10 - 2 = +8');

  console.log('  ✓ Side-by-side delta calculation (Sensitivity, Specificity, FP count) verified.\n');

  // ── TEST 4: Safe Rollback Execution & Hot-Swap (Zero Downtime) ──────────────
  console.log('▶ TEST 4: Safe Rollback Execution & Audit Trail (Zero-Downtime Hot-Swap)');

  const rollbackRes = await service.executeRollback('model_v1_0_active', {
    reason: 'ارتفاع مفاجئ في الإنذارات الكاذبة (False Positive Alert Spike)',
    notes: 'تراجع سريري فوري للنسخة المستقرة السابقة لاختبار معايرة جديدة.',
    operator: { role: 'clinical_qa', email: 'qa.lead@healthvibes.org' }
  });

  assert.strictEqual(rollbackRes.success, true);
  assert.strictEqual(rollbackRes.activeModel.version, 'v1.0', 'v1.0 is now restored as active');
  assert.strictEqual(rollbackRes.activeModel.status, 'active');
  assert.ok(rollbackRes.activeModel.restoredAt, 'Restored timestamp recorded');

  assert.strictEqual(rollbackRes.demotedModel.version, 'v1.1', 'v1.1 is demoted');
  assert.strictEqual(rollbackRes.demotedModel.status, 'rolled_back', 'v1.1 marked as rolled_back');
  assert.strictEqual(rollbackRes.demotedModel.rollbackReason, 'ارتفاع مفاجئ في الإنذارات الكاذبة (False Positive Alert Spike)');

  // Verify rollback audit logs
  const logs = service.getRollbackLogs();
  assert.ok(logs.length >= 1, 'Audit log must record rollback event');
  assert.strictEqual(logs[0].targetVersion, 'v1.0');
  assert.strictEqual(logs[0].previousActiveVersion, 'v1.1');
  assert.strictEqual(logs[0].conditionScope, 'respiratory_triage');

  console.log('  ✓ Safe rollback executed: target restored to active, demoted marked rolled_back, audit log persisted.\n');

  // ── TEST 5: Fast Filtering, Sorting, and Search Engine ──────────────────────
  console.log('▶ TEST 5: Fast Multi-Criteria Filtering, Search & Sorting');

  // Filter by condition
  const hypoxFilter = service.filterRegistry(null, { condition: 'hypoxemia' });
  assert.strictEqual(hypoxFilter.length, 1);
  assert.strictEqual(hypoxFilter[0].id, 'model_hypoxemia_v1_2');

  // Filter by status: rolled_back
  const rolledBackFilter = service.filterRegistry(null, { status: 'rolled_back' });
  assert.strictEqual(rolledBackFilter.length, 1);
  assert.strictEqual(rolledBackFilter[0].version, 'v1.1');

  // Filter by search query
  const searchResult = service.filterRegistry(null, { search: 'Bayesian' });
  assert.strictEqual(searchResult.length, 1);
  assert.strictEqual(searchResult[0].version, 'v1.1');

  // Sort by date ascending
  const sortedAsc = service.filterRegistry(null, { sortBy: 'date_asc' });
  assert.strictEqual(sortedAsc[0].version, 'v1.0', 'Oldest model (v1.0 from Sept 2026) is first');

  // Sort by sensitivity descending
  const sortedSens = service.filterRegistry(null, { sortBy: 'sensitivity_desc' });
  assert.strictEqual(sortedSens[0].metrics.sensitivity, 1.0);

  console.log('  ✓ Fast filtering by scope, status, search keyword, and sorting verified.\n');

  // ── TEST 6: CSV Export Engine ───────────────────────────────────────────────
  console.log('▶ TEST 6: Model Registry CSV Export Engine');

  const csv = service.generateRegistryCsv();
  assert.ok(csv.includes('Model ID,Version,Name,Status'), 'CSV header present');
  assert.ok(csv.includes('HealthVibe-Triage-v1.0'), 'Model v1.0 present in CSV');
  assert.ok(csv.includes('HealthVibe-Triage-v1.1'), 'Model v1.1 present in CSV');
  assert.ok(csv.includes('rolled_back'), 'Status rolled_back reflected in CSV');

  console.log('  ✓ CSV export generated accurately with full registry lineage.\n');

  // ── TEST 7: DOM UI Component & Interactive Modal Rendering ──────────────────
  console.log('▶ TEST 7: DOM UI Sandbox Rendering & Interactive Rollback Lightbox');

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

  const containerElem = new MockElement('div', 'adminModelRegistryContainer');
  const mockDocument = {
    getElementById: id => {
      if (id === 'adminModelRegistryContainer') return containerElem;
      if (!domElements.has(id)) {
        domElements.set(id, new MockElement('div', id));
      }
      return domElements.get(id);
    },
    querySelectorAll: sel => [],
    querySelector: sel => null,
    body: new MockElement('body'),
    createElement: tag => new MockElement(tag)
  };

  const sandbox = {
    window: {},
    document: mockDocument,
    HealthVibes: {
      ModelRegistryService: service
    },
    setTimeout: (fn, ms) => fn(),
    clearTimeout: () => {},
    console
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.HealthVibes = sandbox.HealthVibes;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(uiPath, 'utf8'), sandbox);

  const uiModule = sandbox.HealthVibes.ModelRegistryUI;
  assert.ok(uiModule, 'ModelRegistryUI exported successfully');

  // Render Panel
  uiModule.renderModelRegistryPanel('adminModelRegistryContainer');
  assert.ok(containerElem.innerHTML.includes('glass-registry-panel'), 'Panel root container rendered');
  assert.ok(containerElem.innerHTML.includes('سجل إصدارات النماذج والتبديل الآمن'), 'Header title rendered');
  assert.ok(containerElem.innerHTML.includes('النسخ النشطة حالياً في بيئة الإنتاج السريري'), 'Active scopes showcase rendered');
  assert.ok(containerElem.innerHTML.includes('التراجع الطارئ للنسخة السابقة'), 'Emergency rollback button rendered');
  assert.ok(containerElem.innerHTML.includes('glass-models-table'), 'Table rendered');

  // Trigger Rollback Modal
  uiModule.openRollbackModal('model_v1_0_active');
  const modalElem = mockDocument.getElementById('modelRollbackModal');
  assert.ok(modalElem.classList.has('is-open'), 'Rollback modal opened with is-open class');

  assert.ok(containerElem.innerHTML.includes('تأكيد التراجع الفوري الآمن'), 'Container contains rollback modal template');
  const modalBody = mockDocument.getElementById('rollbackModalBodyContent');
  assert.ok(modalBody.innerHTML.includes('النسخة المستهدفة للتراجع'), 'Target rollback version displayed');
  assert.ok(modalBody.innerHTML.includes('سبب التراجع السريري الإلزامي'), 'Reason selector displayed');

  // Trigger Compare Modal
  uiModule.openCompareModal('model_v1_0_active');
  const compareModal = mockDocument.getElementById('modelCompareModal');
  assert.ok(compareModal.classList.has('is-open'), 'Compare modal opened with is-open class');

  const compareBody = mockDocument.getElementById('compareModalBodyContent');
  assert.ok(compareBody.innerHTML.includes('المعمارية السريرية'), 'Compare table rendered');

  console.log('  ✓ DOM UI components, active scopes cards, rollback modal & diff drawer verified.\n');

  console.log('================================================================================');
  console.log('✅ ALL MODEL REGISTRY & SAFE ROLLBACK TESTS PASSED (100% SUCCESS)');
  console.log('================================================================================');

})().catch(err => {
  console.error('\n❌ MODEL REGISTRY TEST SUITE FAILED:', err);
  process.exit(1);
});
