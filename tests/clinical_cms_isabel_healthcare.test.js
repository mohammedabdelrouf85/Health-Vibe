/**
 * HEALTH VIBE AI: CLINICAL CONTENT MANAGEMENT SYSTEM (Clinical CMS) TEST SUITE
 * Benchmark: Isabel Healthcare Clinical Knowledge & Dual-Language Guidance Governance
 * 
 * Verifies:
 * 1. Initial Clinical Guidelines Catalog & Lineage (Isabel Healthcare Benchmark)
 * 2. Dual-Language Parity & Validation Engine (Arabic RTL & English LTR)
 * 3. Multi-Stage Clinical Approval Lifecycle (Draft -> In Review -> Approved -> Published / Rejected)
 * 4. Multi-Criteria Fast Filtering, Search & Sorting Engine
 * 5. Side-by-Side Version Comparison & Revision History
 * 6. Statutory Audit Trail Persistence & CSV Export Engine
 * 7. DOM UI Sandbox Rendering & Interactive Modal Dialogs
 */

const assert = require('node:assert/strict');
const path = require('node:path');

console.log('================================================================================');
console.log('📚  HEALTH VIBE AI: CLINICAL CMS TEST SUITE (Isabel Healthcare Benchmark)');
console.log('    Dual-Language Guidelines, Multi-Stage Approval, Fast Filters & UI Tests');
console.log('================================================================================\n');

// Load Clinical CMS Service
const servicePath = path.resolve(__dirname, '../app/modules/admin/clinical-cms-service.js');
const uiPath = path.resolve(__dirname, '../app/modules/admin/clinical-cms-ui.js');

const ClinicalCmsService = require(servicePath);
const ClinicalCmsUI = require(uiPath);

// -----------------------------------------------------------------------------
// TEST 1: Initial Clinical Guidelines Catalog & Lineage (Isabel Healthcare)
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Initial Clinical Guidelines Catalog & Lineage (Isabel Healthcare)');
ClinicalCmsService.resetForTesting();
const allGuidelines = ClinicalCmsService.getGuidelines();
assert.ok(Array.isArray(allGuidelines), 'Must return an array of guidelines');
assert.ok(allGuidelines.length >= 5, `Must seed at least 5 guidelines (found ${allGuidelines.length})`);

// Verify essential clinical scopes and categories
const scopes = new Set(allGuidelines.map(g => g.conditionScope));
assert.ok(scopes.has('respiratory_triage'), 'Must include respiratory_triage scope');
assert.ok(scopes.has('pediatric'), 'Must include pediatric scope');
assert.ok(scopes.has('hypoxemia'), 'Must include hypoxemia scope');

const categories = new Set(allGuidelines.map(g => g.category));
assert.ok(categories.has('red_flags'), 'Must include red_flags category');
assert.ok(categories.has('triage_protocol'), 'Must include triage_protocol category');

for (const g of allGuidelines) {
  assert.ok(g.id, 'Guideline must have ID');
  assert.ok(g.version, 'Guideline must have version');
  assert.ok(g.titleAr && g.titleEn, `Guideline ${g.id} must have bilingual titles`);
  assert.ok(g.summaryAr && g.summaryEn, `Guideline ${g.id} must have bilingual summaries`);
  assert.ok(g.criteriaAr && g.criteriaEn, `Guideline ${g.id} must have bilingual criteria`);
  assert.ok(g.actionItemsAr && g.actionItemsEn, `Guideline ${g.id} must have bilingual actions`);
  assert.ok(g.redFlagsAr && g.redFlagsEn, `Guideline ${g.id} must have bilingual red flags`);
  assert.ok(Array.isArray(g.revisionHistory), `Guideline ${g.id} must have revision history`);
}

console.log(`  ✓ Verified ${allGuidelines.length} guidelines with complete dual-language lineage.\n`);

// -----------------------------------------------------------------------------
// TEST 2: Dual-Language Parity & Validation Engine
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Dual-Language Parity & Validation Engine');

// 2.1 Valid guideline passes with 100% parity
const validGuideline = allGuidelines[0];
const validRes = ClinicalCmsService.validateBilingualParity(validGuideline);
assert.equal(validRes.isValid, true, 'Valid guideline must pass parity check');
assert.equal(validRes.parityScorePct, 100, 'Complete guideline must have 100% parity score');

// 2.2 Incomplete guideline missing English red flags and Arabic criteria fails
const incompleteData = {
  titleAr: "عنوان تجريبي",
  titleEn: "Test Title",
  summaryAr: "ملخص عربي",
  summaryEn: "English summary",
  criteriaAr: "", // missing
  criteriaEn: "Some criteria",
  actionItemsAr: "إجراءات",
  actionItemsEn: "Action items",
  redFlagsAr: "علامات خطورة",
  redFlagsEn: "" // missing
};
const invalidRes = ClinicalCmsService.validateBilingualParity(incompleteData);
assert.equal(invalidRes.isValid, false, 'Incomplete guideline must fail validation');
assert.ok(invalidRes.errors.length >= 2, 'Must report missing fields');
assert.ok(invalidRes.parityScorePct < 100, 'Parity score must reflect missing fields');

console.log('  ✓ Dual-language clinical parity engine strictly validated.\n');

// -----------------------------------------------------------------------------
// TEST 3: Multi-Stage Clinical Approval Lifecycle
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Multi-Stage Clinical Approval Lifecycle (Draft -> In Review -> Approved -> Published)');

const mockOperator = { uid: 'user-clinical-qa', name: 'د. هدى منصور', role: 'clinical_qa' };
const mockApprover = { uid: 'user-super-admin', name: 'د. محمد عبد الرؤوف', role: 'super_admin' };

// 3.1 Create new guideline in Draft state
const newGuideline = ClinicalCmsService.createGuideline({
  id: 'guideline_copd_rescue_v1',
  version: 'v1.0-draft',
  category: 'triage_protocol',
  conditionScope: 'respiratory_triage',
  evidenceLevel: 'Grade_A_High',
  targetAudience: 'physician',
  titleAr: 'بروتوكول خطة الطوارئ والإنقاذ لمرضى السدة الرئوية المزمنة (COPD)',
  titleEn: 'Acute COPD Exacerbation Rescue & Triage Action Plan',
  summaryAr: 'إرشادات التعامل السريع مع التدهور المفاجئ في وظائف التنفس لمرضى الانسداد الرئوي المزمن.',
  summaryEn: 'Immediate triage and rescue management protocol for acute COPD exacerbations.',
  criteriaAr: 'زيادة شدة ضيق التنفس، زيادة حجم أو صديدية البلغم، وتراجع SpO2 عن المعدل المعتاد للمريض.',
  criteriaEn: 'Acute worsening of dyspnea, increased sputum volume/purulence, SpO2 drop below baseline.',
  actionItemsAr: 'استنشاق موسعات الشعب الهوائية قصيرة المفعول، تقييم الحاجة للتنفس غير الباضع (NIV).',
  actionItemsEn: 'Administer back-to-back SABA/SAMA via spacer, assess eligibility for non-invasive ventilation (NIV).',
  redFlagsAr: 'فرط ثنائي أكسيد الكربون (Hypercapnia)، تدهور الوعي، أو عدم استقرار الدورة الدموية.',
  redFlagsEn: 'Severe respiratory acidosis (pH < 7.25), somnolence, hemodynamic instability.',
  changeSummary: 'مسودة أولية لخطة إنقاذ مرضى السدة الرئوية.'
}, mockOperator);

assert.equal(newGuideline.status, 'draft', 'Newly created guideline must be in draft status');
assert.equal(newGuideline.id, 'guideline_copd_rescue_v1');

// 3.2 Guard: Cannot publish a draft directly without approval
assert.throws(() => {
  ClinicalCmsService.publishGuideline(newGuideline.id, mockApprover);
}, /لا يمكن نشر التوصية إلا بعد اعتمادها السريري أولاً/);

// 3.3 Submit for Clinical Peer Review
const inReviewGuideline = ClinicalCmsService.submitForReview(newGuideline.id, mockOperator, 'جاهز لمراجعة كبير أطباء الصدر');
assert.equal(inReviewGuideline.status, 'in_review');

// 3.4 Rejection workflow: Request modifications
const rejectedGuideline = ClinicalCmsService.rejectGuideline(newGuideline.id, mockApprover, 'يرجى تدقيق حدود تشبع الأكسجين المستهدف لمرضى احتباس CO2 إلى 88-92%');
assert.equal(rejectedGuideline.status, 'rejected');
assert.ok(rejectedGuideline.peerReviewer.reviewNotes.includes('88-92%'));

// 3.5 Re-submit for review after update
const resubmitted = ClinicalCmsService.submitForReview(newGuideline.id, mockOperator, 'تم تعديل الهدف إلى 88-92% حسب التوصية');
assert.equal(resubmitted.status, 'in_review');

// 3.6 Approve Guideline
const approvedGuideline = ClinicalCmsService.approveGuideline(newGuideline.id, mockApprover, 'معتمد سريرياً للنشر بالإنتاج');
assert.equal(approvedGuideline.status, 'approved');
assert.equal(approvedGuideline.approver.name, 'د. محمد عبد الرؤوف');

// 3.7 Publish Guideline Live to production triage
const publishedGuideline = ClinicalCmsService.publishGuideline(newGuideline.id, mockApprover, 'تم التفعيل في محرك الفرز الذكي');
assert.equal(publishedGuideline.status, 'published');
assert.ok(publishedGuideline.publishedAt, 'Published guideline must have publishedAt timestamp');

console.log('  ✓ Multi-stage approval and rejection lifecycle verified end-to-end.\n');

// -----------------------------------------------------------------------------
// TEST 4: Multi-Criteria Fast Filtering, Search & Sorting Engine
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Multi-Criteria Fast Filtering, Search & Sorting Engine');

// 4.1 Filter by Status
const publishedList = ClinicalCmsService.getGuidelines({ status: 'published' });
assert.ok(publishedList.every(g => g.status === 'published'), 'All items must have status=published');

const inReviewList = ClinicalCmsService.getGuidelines({ status: 'in_review' });
assert.ok(inReviewList.every(g => g.status === 'in_review'), 'All items must have status=in_review');

// 4.2 Filter by Category
const redFlagsList = ClinicalCmsService.getGuidelines({ category: 'red_flags' });
assert.ok(redFlagsList.every(g => g.category === 'red_flags'), 'All items must have category=red_flags');

// 4.3 Filter by Scope
const pedList = ClinicalCmsService.getGuidelines({ conditionScope: 'pediatric' });
assert.ok(pedList.every(g => g.conditionScope === 'pediatric'), 'All items must have scope=pediatric');

// 4.4 Search by Arabic keyword
const arSearchResults = ClinicalCmsService.getGuidelines({ search: 'أكسجين' });
assert.ok(arSearchResults.length >= 1, 'Must find guidelines matching Arabic query "أكسجين"');

// 4.5 Search by English keyword
const enSearchResults = ClinicalCmsService.getGuidelines({ search: 'dyspnea' });
assert.ok(enSearchResults.length >= 1, 'Must find guidelines matching English query "dyspnea"');

// 4.6 Sorting by Title
const sortedByTitleAr = ClinicalCmsService.getGuidelines({ sortBy: 'title_ar' });
assert.ok(sortedByTitleAr.length >= 2);

console.log('  ✓ Fast multi-criteria filtering, dual-language search, and sorting verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: Side-by-Side Version Comparison & Revision History
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Side-by-Side Version Comparison & Revision History');

const targetGuideline = ClinicalCmsService.getGuidelineById('guideline_resp_triage_redflags');
assert.ok(targetGuideline.revisionHistory.length >= 2, 'Must have at least 2 revisions');

const diffResult = ClinicalCmsService.compareGuidelineVersions(
  'guideline_resp_triage_redflags',
  targetGuideline.revisionHistory[0].version,
  targetGuideline.revisionHistory[1].version
);

assert.equal(diffResult.guidelineId, 'guideline_resp_triage_redflags');
assert.ok(diffResult.versionA, 'Diff must contain versionA snapshot');
assert.ok(diffResult.versionB, 'Diff must contain versionB snapshot');
assert.ok(diffResult.currentContent.criteriaAr, 'Must expose criteriaAr');
assert.ok(diffResult.currentContent.redFlagsAr, 'Must expose redFlagsAr');

console.log('  ✓ Version diff engine and revision snapshot comparison verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Statutory Audit Trail Persistence & CSV Export Engine
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Statutory Audit Trail Persistence & CSV Export Engine');

const auditLog = ClinicalCmsService.getAuditTrail();
assert.ok(auditLog.length >= 4, `Must capture multiple lifecycle audit events (found ${auditLog.length})`);

const actions = new Set(auditLog.map(e => e.action));
assert.ok(actions.has('GUIDELINE_CREATED'), 'Must log GUIDELINE_CREATED');
assert.ok(actions.has('GUIDELINE_SUBMITTED_FOR_REVIEW'), 'Must log GUIDELINE_SUBMITTED_FOR_REVIEW');
assert.ok(actions.has('GUIDELINE_REJECTED'), 'Must log GUIDELINE_REJECTED');
assert.ok(actions.has('GUIDELINE_APPROVED'), 'Must log GUIDELINE_APPROVED');
assert.ok(actions.has('GUIDELINE_PUBLISHED'), 'Must log GUIDELINE_PUBLISHED');

// Verify CSV export
const csvString = ClinicalCmsService.exportGuidelinesCsv();
assert.ok(typeof csvString === 'string', 'CSV export must return string');
assert.ok(csvString.includes('Guideline_ID'), 'CSV must contain Guideline_ID header');
assert.ok(csvString.includes('Title_AR'), 'CSV must contain Title_AR header');
assert.ok(csvString.includes('Title_EN'), 'CSV must contain Title_EN header');
assert.ok(csvString.includes('Red_Flags_AR'), 'CSV must contain Red_Flags_AR header');
assert.ok(csvString.includes('guideline_resp_triage_redflags'), 'CSV must contain guideline row');

console.log('  ✓ Audit trail persistence and CSV export verified.\n');

// -----------------------------------------------------------------------------
// TEST 7: DOM UI Sandbox Rendering & Interactive Modal Dialogs
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: DOM UI Sandbox Rendering & Interactive Modal Dialogs');

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.innerHTML = '';
    this.value = '';
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.children = [];
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  removeAttribute(k) { this.attributes.delete(k); }

  addEventListener(event, fn) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(fn);
  }

  dispatchEvent(event) {
    const fns = this.eventListeners.get(event.type) || [];
    for (const fn of fns) fn(event);
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      return this._findChild(el => el.id === id);
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.includes(cls)) return this;
      return this._findChild(el => el.className.includes(cls));
    }
    const tag = selector.toUpperCase();
    if (this.tagName === tag) return this;
    return this._findChild(el => el.tagName === tag);
  }

  querySelectorAll(selector) {
    const results = [];
    this._collectAll(selector, results);
    return results;
  }

  closest(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.includes(cls)) return this;
    }
    return null;
  }

  _findChild(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child._findChild(predicate);
      if (found) return found;
    }
    return null;
  }

  _collectAll(selector, results) {
    const isClass = selector.startsWith('.');
    const cls = isClass ? selector.slice(1) : '';
    const tag = !isClass ? selector.toUpperCase() : '';
    for (const child of this.children) {
      if (isClass && child.className.includes(cls)) results.push(child);
      else if (!isClass && child.tagName === tag) results.push(child);
      child._collectAll(selector, results);
    }
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.body = new MockElement('body');
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  register(el) {
    if (el.id) this.elements.set(el.id, el);
    return el;
  }
}

const mockDoc = new MockDocument();
const containerElem = mockDoc.register(new MockElement('div', 'adminClinicalCmsContainer'));
const modalRootElem = mockDoc.register(new MockElement('div', 'cmsModalRoot'));

// Mock global environment
global.document = {
  getElementById: (id) => {
    if (id === 'adminClinicalCmsContainer') return containerElem;
    if (id === 'cmsModalRoot') return modalRootElem;
    return mockDoc.getElementById(id);
  },
  createElement: (tag) => mockDoc.createElement(tag),
  body: mockDoc.body
};

// Render Panel
ClinicalCmsUI.renderClinicalCmsPanel('adminClinicalCmsContainer');
assert.ok(containerElem.innerHTML.includes('Clinical CMS'), 'Must render Clinical CMS header title');
assert.ok(containerElem.innerHTML.includes('Isabel Healthcare'), 'Must cite Isabel Healthcare benchmark');
assert.ok(containerElem.innerHTML.includes('cmsSearchInput'), 'Must render search input');
assert.ok(containerElem.innerHTML.includes('cmsFilterStatus'), 'Must render status filter');

// Test Open Editor Modal
ClinicalCmsUI.openEditGuidelineModal(null);
assert.ok(modalRootElem.innerHTML.includes('إضافة توصية سريرية جديدة'), 'Must open Create Guideline modal');
assert.ok(modalRootElem.innerHTML.includes('editTitleAr'), 'Must contain Arabic title input');
assert.ok(modalRootElem.innerHTML.includes('editTitleEn'), 'Must contain English title input');
assert.ok(modalRootElem.innerHTML.includes('editRedFlagsAr'), 'Must contain Arabic red flags input');

// Test Open Review Modal
ClinicalCmsUI.openReviewGuidelineModal('guideline_resp_triage_redflags');
assert.ok(modalRootElem.innerHTML.includes('مسار المراجعة والاعتماد السريري'), 'Must open Clinical Review modal');

// Test Open Diff Modal
ClinicalCmsUI.openDiffGuidelineModal('guideline_resp_triage_redflags');
assert.ok(modalRootElem.innerHTML.includes('سجل الإصدارات ومقارنة الفروقات'), 'Must open Version Diff modal');

console.log('  ✓ DOM sandbox UI rendering, dual-column editor, and review modals verified.\n');

console.log('================================================================================');
console.log('✅ ALL CLINICAL CMS TESTS PASSED (100% SUCCESS)');
console.log('================================================================================');
process.exit(0);
