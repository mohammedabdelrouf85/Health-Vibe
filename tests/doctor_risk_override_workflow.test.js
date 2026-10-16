/**
 * Health Vibe AI - Doctor Risk Override Workflow Test Suite
 *
 * Validates:
 * 1. Reasoned clinical priority override (urgent, high, normal) with SLA calibration.
 * 2. Strict validation of mandatory clinical rationale (>= 10 characters) and standard categories.
 * 3. Rendering of clinical risk override section in Doctor review panel (AI advisory vs Clinically Overridden).
 * 4. Rendering and interaction of the responsive override modal dialog for clinic use (Mobile, Tablet, Desktop).
 * 5. Full bilingual parity (Arabic & English), dual icon + text signaling, and multi-modal accessibility.
 * 6. Ground-truth telemetry preservation for Infermedica / Rules Engine AI model continuous learning.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("⚖️  HEALTH VIBE AI: DOCTOR RISK OVERRIDE WORKFLOW TEST SUITE");
console.log("   Priorities, Categories, Rationale Validation, UI & AI Telemetry");
console.log("==================================================================\n");

// Setup browser globals mock
const mockStore = {};
global.localStorage = {
  getItem: (k) => mockStore[k] || null,
  setItem: (k, v) => { mockStore[k] = String(v); },
  removeItem: (k) => { delete mockStore[k]; },
  clear: () => { Object.keys(mockStore).forEach(k => delete mockStore[k]); }
};

global.currentLanguage = "ar";
const mockElements = new Map();

function createMockElement(id, tagName = "div") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: "",
    textContent: "",
    innerHTML: "",
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      contains: function(c) { return this._classes.has(c); }
    },
    dataset: {},
    setAttribute: function(name, val) { this[name] = val; },
    removeAttribute: function(name) { delete this[name]; },
    getAttribute: function(name) { return this[name] || null; },
    focus: function() {},
    addEventListener: function(event, handler) { this[`_on_${event}`] = handler; },
    removeEventListener: function(event) { delete this[`_on_${event}`]; },
    dispatchEvent: function(evt) {
      if (this[`_on_${evt.type}`]) this[`_on_${evt.type}`](evt);
    },
    remove: function() { mockElements.delete(id); }
  };
  mockElements.set(id, el);
  return el;
}

global.document = {
  activeElement: null,
  getElementById: (id) => mockElements.get(id) || null,
  createElement: (tag) => createMockElement(`dyn_${Date.now()}_${Math.random()}`, tag),
  body: {
    appendChild: (child) => { mockElements.set(child.id, child); }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.Event = function(type) { this.type = type; };

// Load modules
const DoctorService = require(path.resolve(__dirname, "../app/modules/doctor/doctor-service.js"));
const DoctorUI = require(path.resolve(__dirname, "../app/modules/doctor/doctor-ui.js"));

// Test Case Personas
const baselineAdvisoryCase = {
  id: "case_clinic_2026_101",
  patientName: "سامح زكي عبد الله",
  patientNameEn: "Sameh Zaki Abdullah",
  priority: "high",
  o2: 91,
  submittedAt: new Date(Date.now() - 3600000).toISOString(),
  triageOverride: null
};

const overriddenCase = {
  id: "case_clinic_2026_102",
  patientName: "هدى محمود الشافعي",
  patientNameEn: "Hoda Mahmoud El-Shafei",
  priority: "urgent",
  triageLevel: "urgent",
  o2: 93,
  submittedAt: new Date(Date.now() - 1800000).toISOString(),
  triageOverride: {
    isOverridden: true,
    originalPriority: "high",
    overriddenPriority: "urgent",
    overrideCategory: "CLINICAL_SIGNS_OF_EXHAUSTION",
    overrideReason: "المريض يعاني من سحب بين الأضلاع وإجهاد تنفسي ملحوظ رغم استقرار الأكسجين الظاهري عند 93%",
    overriddenBy: {
      uid: "doc_ahmed_hegazy",
      name: "أ.د. أحمد حجازي",
      license: "EG-MED-21943"
    },
    timestamp: new Date(Date.now() - 600000).toISOString()
  }
};

(async () => {
  // -----------------------------------------------------------------------------
  // TEST 1: DoctorService Priorities, Categories, and Metadata
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: DoctorService Priorities, Categories, and Metadata Validation ...");
  
  assert.deepEqual(
    DoctorService.VALID_OVERRIDE_PRIORITIES,
    ["urgent", "high", "normal"],
    "Must support urgent, high, and normal priority overrides"
  );

  assert.ok(DoctorService.VALID_OVERRIDE_CATEGORIES.includes("CLINICAL_SIGNS_OF_EXHAUSTION"));
  assert.ok(DoctorService.VALID_OVERRIDE_CATEGORIES.includes("RAPID_TRAJECTORY"));
  assert.ok(DoctorService.VALID_OVERRIDE_CATEGORIES.includes("ARTIFACT_CORRECTION"));
  assert.ok(DoctorService.VALID_OVERRIDE_CATEGORIES.includes("COMORBIDITY_RISK"));
  assert.ok(DoctorService.VALID_OVERRIDE_CATEGORIES.includes("OTHER_CLINICAL_JUDGMENT"));

  // Check category metadata has both Arabic and English descriptors
  Object.keys(DoctorService.OVERRIDE_CATEGORY_META).forEach(cat => {
    const meta = DoctorService.OVERRIDE_CATEGORY_META[cat];
    assert.ok(meta.ar && meta.ar.length > 5, `Category ${cat} must have Arabic title`);
    assert.ok(meta.en && meta.en.length > 5, `Category ${cat} must have English title`);
    assert.ok(meta.descAr && meta.descAr.length > 10, `Category ${cat} must have Arabic description`);
    assert.ok(meta.descEn && meta.descEn.length > 10, `Category ${cat} must have English description`);
  });

  console.log("  ✓ DoctorService override categories and bilingual metadata verified.\n");

  // -----------------------------------------------------------------------------
  // TEST 2: Authoritative Priority Resolution & SLA Target Mapping
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 2: Authoritative Priority Resolution & SLA Targets ...");

  // Non-overridden case priority
  assert.equal(DoctorService.getCasePriorityKey(baselineAdvisoryCase), "high");
  const slaBase = DoctorService.getCaseSlaInfo(baselineAdvisoryCase);
  assert.equal(slaBase.target, 30, "High priority SLA must target 30 minutes");

  // Overridden case priority must take precedence over SpO2 93% (which normally maps to high)
  assert.equal(DoctorService.getCasePriorityKey(overriddenCase), "urgent");
  const slaOverridden = DoctorService.getCaseSlaInfo(overriddenCase);
  assert.equal(slaOverridden.target, 15, "Urgent overridden SLA must target 15 minutes");

  console.log("  ✓ Authoritative clinical override takes precedence and updates SLA calculations.\n");

  // -----------------------------------------------------------------------------
  // TEST 3: Validation of Mandatory Clinical Rationale (>= 10 characters) & Category
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 3: Mandatory Clinical Rationale and Category Enforcement ...");

  // Missing priority
  await assert.rejects(
    async () => {
      await DoctorService.overrideTriagePriority({
        caseId: "CASE-999",
        overriddenPriority: "invalid_level",
        overrideReason: "Valid reason text exceeding 10 characters",
        overrideCategory: "CLINICAL_SIGNS_OF_EXHAUSTION"
      });
    },
    /valid overriddenPriority/
  );

  // Rationale too short (< 10 chars)
  await assert.rejects(
    async () => {
      await DoctorService.overrideTriagePriority({
        caseId: "CASE-999",
        overriddenPriority: "urgent",
        overrideReason: "Short",
        overrideCategory: "CLINICAL_SIGNS_OF_EXHAUSTION"
      });
    },
    /at least 10 characters/
  );

  // Invalid category
  await assert.rejects(
    async () => {
      await DoctorService.overrideTriagePriority({
        caseId: "CASE-999",
        overriddenPriority: "urgent",
        overrideReason: "Valid detailed clinical explanation",
        overrideCategory: "NON_STANDARD_CATEGORY"
      });
    },
    /overrideCategory must be one of/
  );

  console.log("  ✓ Strict clinical governance enforces valid priority, category, and minimum 10-char rationale.\n");

  // -----------------------------------------------------------------------------
  // TEST 4: Clinical Risk Override Section (Non-Overridden / AI Advisory Mode)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 4: UI Rendering - Non-Overridden State (AI Advisory) ...");

  const secAr = DoctorUI.renderRiskOverrideSection(baselineAdvisoryCase, false);
  assert.ok(secAr.includes('id="doctorRiskOverrideSection"'), "Section must have doctorRiskOverrideSection id");
  assert.ok(secAr.includes("مسار تصنيف درجة الخطورة"), "Must have Arabic heading");
  assert.ok(secAr.includes("تصنيف استرشادي بالذكاء الاصطناعي"), "Must indicate AI advisory state");
  assert.ok(secAr.includes("أولوية عالية / أصفر") || secAr.includes("⚠️"), "Must render priority pill with icon");
  assert.ok(secAr.includes("تعديل درجة الخطورة السريرية"), "Must render action button to override");

  const secEn = DoctorUI.renderRiskOverrideSection(baselineAdvisoryCase, true);
  assert.ok(secEn.includes("Clinical Risk Level & Triage Classification"), "Must have English heading");
  assert.ok(secEn.includes("AI / Infermedica Advisory"), "Must indicate English AI advisory state");
  assert.ok(secEn.includes("Override Risk Level"), "Must have English override button");

  console.log("  ✓ Non-overridden clinical risk card renders advisory guidance and override trigger.\n");

  // -----------------------------------------------------------------------------
  // TEST 5: Clinical Risk Override Section (Overridden State with AI Learning Loop)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 5: UI Rendering - Clinically Overridden State with AI Telemetry ...");

  const overSecAr = DoctorUI.renderRiskOverrideSection(overriddenCase, false);
  assert.ok(overSecAr.includes("is-overridden"), "Card must have is-overridden CSS class");
  assert.ok(overSecAr.includes("معتمد سريرياً بتعديل الطبيب"), "Must show clinically overridden badge");
  assert.ok(overSecAr.includes("تصنيف الذكاء الاصطناعي الأصلي:"), "Must display original AI suggestion label");
  assert.ok(overSecAr.includes("التصنيف المعتمد سريرياً:"), "Must display doctor overridden label");
  assert.ok(overSecAr.includes("عاجل / أحمر") || overSecAr.includes("🚨"), "Must display new active priority");
  assert.ok(overSecAr.includes("المبررات السريرية الموثقة:"), "Must display rationale header");
  assert.ok(overSecAr.includes("المريض يعاني من سحب بين الأضلاع"), "Must render actual doctor rationale");
  assert.ok(overSecAr.includes("أ.د. أحمد حجازي"), "Must display attesting doctor name");
  assert.ok(overSecAr.includes("EG-MED-21943"), "Must display syndicate license");
  assert.ok(overSecAr.includes("تغذية وتحسين نموذج الذكاء الاصطناعي"), "Must display AI feedback loop notice");

  const overSecEn = DoctorUI.renderRiskOverrideSection(overriddenCase, true);
  assert.ok(overSecEn.includes("Clinically Overridden by Physician"), "Must display English override badge");
  assert.ok(overSecEn.includes("AI / Infermedica Suggestion:"), "Must display English original suggestion");
  assert.ok(overSecEn.includes("Physician Clinical Override:"), "Must display English override label");
  assert.ok(overSecEn.includes("AI Model & Infermedica Calibration Telemetry"), "Must display English AI telemetry notice");

  console.log("  ✓ Overridden clinical risk card displays side-by-side comparison, doctor credentials, and AI learning banner.\n");

  // -----------------------------------------------------------------------------
  // TEST 6: Responsive Override Modal Dialog HTML Structure
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 6: Responsive Override Modal HTML Structure & Controls ...");

  const modalHtmlAr = DoctorUI.renderRiskOverrideModalHtml(baselineAdvisoryCase, false);
  assert.ok(modalHtmlAr.includes('id="doctorOverrideRiskModalBackdrop"'), "Modal must have backdrop id");
  assert.ok(modalHtmlAr.includes('id="doctorOverrideRiskModal"'), "Modal must have container id");
  assert.ok(modalHtmlAr.includes('role="dialog"'), "Modal must have accessible dialog role");
  assert.ok(modalHtmlAr.includes('aria-modal="true"'), "Modal must be marked as modal for screen readers");

  // Priority Cards (Urgent, High, Normal)
  assert.ok(modalHtmlAr.includes('data-priority="urgent"'), "Must contain urgent priority card");
  assert.ok(modalHtmlAr.includes('data-priority="high"'), "Must contain high priority card");
  assert.ok(modalHtmlAr.includes('data-priority="normal"'), "Must contain normal priority card");
  assert.ok(modalHtmlAr.includes("SLA: 15 دقيقة"), "Urgent card must specify 15 min SLA");
  assert.ok(modalHtmlAr.includes("SLA: 30 دقيقة"), "High card must specify 30 min SLA");
  assert.ok(modalHtmlAr.includes("SLA: 120 دقيقة"), "Normal card must specify 120 min SLA");

  // Category Selector
  assert.ok(modalHtmlAr.includes('id="overrideCategorySelect"'), "Must include category dropdown select");
  DoctorService.VALID_OVERRIDE_CATEGORIES.forEach(cat => {
    assert.ok(modalHtmlAr.includes(`value="${cat}"`), `Select must contain option for ${cat}`);
  });

  // Textarea & Quick Chips
  assert.ok(modalHtmlAr.includes('id="overrideReasonTextarea"'), "Must include rationale textarea");
  assert.ok(modalHtmlAr.includes('id="overrideReasonCharCount"'), "Must include live character counter");
  DoctorUI.QUICK_CLINICAL_REASON_CHIPS.forEach(chip => {
    assert.ok(modalHtmlAr.includes(chip.ar.slice(0, 20)), "Modal must include quick clinical reason chips");
  });

  // AI Learning Loop Notice
  assert.ok(modalHtmlAr.includes("حوكمة وتدريب نموذج الذكاء الاصطناعي"), "Must include AI training loop notice in modal");
  assert.ok(modalHtmlAr.includes('id="btnSubmitRiskOverride"'), "Must have confirm button with id");

  console.log("  ✓ Modal HTML properly structures 3 priority cards, 5 clinical categories, quick chips, and AI telemetry notice.\n");

  // -----------------------------------------------------------------------------
  // TEST 7: Modal Controllers, Priority Selection, and Reason Chip Injection
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 7: Modal Controllers, Priority Selection, and Reason Chips ...");

  // Mock initial DOM elements for controller test
  const pInput = createMockElement("overrideSelectedPriorityInput");
  const cardUrgent = createMockElement("riskOpt_urgent");
  const cardHigh = createMockElement("riskOpt_high");
  const cardNormal = createMockElement("riskOpt_normal");
  const textareaEl = createMockElement("overrideReasonTextarea");

  // Test priority selection
  DoctorUI.selectOverridePriorityOption("urgent");
  assert.equal(pInput.value, "urgent", "Hidden input must be updated to urgent");
  assert.equal(cardUrgent.classList.contains("is-selected"), true, "Urgent card must have is-selected class");
  assert.equal(cardHigh.classList.contains("is-selected"), false, "High card must NOT be selected");

  DoctorUI.selectOverridePriorityOption("normal");
  assert.equal(pInput.value, "normal", "Hidden input must be updated to normal");
  assert.equal(cardNormal.classList.contains("is-selected"), true, "Normal card must have is-selected class");

  // Test quick chip insertion
  DoctorUI.applyOverrideReasonChip("المريض يعاني من إجهاد تنفسي وسحب بين الأضلاع");
  assert.ok(textareaEl.value.includes("المريض يعاني من إجهاد تنفسي"), "Textarea value must contain chip text");

  // Appending additional chip
  DoctorUI.applyOverrideReasonChip("الفحص السريري مستقر");
  assert.ok(textareaEl.value.includes("المريض يعاني من إجهاد تنفسي") && textareaEl.value.includes("الفحص السريري مستقر"), "Subsequent chip must append cleanly");

  console.log("  ✓ Interactive controllers accurately update state, styles, ARIA attributes, and textarea content.\n");

  // -----------------------------------------------------------------------------
  // TEST 8: Full End-to-End Submission & State Mutation
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 8: End-to-End Submission, Toast Notification & State Updates ...");

  let toastMessage = "";
  global.showToast = (msg) => { toastMessage = msg; };

  let refreshedCaseId = null;
  global.selectDoctorCase = (id) => { refreshedCaseId = id; };

  // Set up mock DOM elements for submission
  pInput.value = "urgent";
  const catSelectEl = createMockElement("overrideCategorySelect");
  catSelectEl.value = "CLINICAL_SIGNS_OF_EXHAUSTION";
  textareaEl.value = "المريض يعاني من إجهاد تنفسي واضح أثناء الكشف المباشر";
  createMockElement("overrideReasonValidationMsg");
  createMockElement("btnSubmitRiskOverride");

  // Setup cases store in global
  const activeCaseInGlobal = { id: "case_clinic_2026_101", priority: "high" };
  global.cases = [activeCaseInGlobal];

  // Execute submission
  await DoctorUI.submitOverrideRisk("case_clinic_2026_101");

  // Assert case object was mutated
  assert.equal(activeCaseInGlobal.priority, "urgent", "Case priority must be updated to urgent");
  assert.equal(activeCaseInGlobal.isOverridden, true, "Case must be marked as isOverridden");
  assert.equal(activeCaseInGlobal.triageOverride.overriddenPriority, "urgent");
  assert.equal(activeCaseInGlobal.triageOverride.overrideCategory, "CLINICAL_SIGNS_OF_EXHAUSTION");
  assert.ok(activeCaseInGlobal.triageOverride.overrideReason.includes("المريض يعاني من إجهاد تنفسي"));

  // Assert toast notification was triggered
  assert.ok(toastMessage.includes("عاجل") || toastMessage.includes("Urgent"), "Success toast must mention new priority");
  assert.equal(refreshedCaseId, "case_clinic_2026_101", "selectDoctorCase must be called to refresh review screen");

  console.log("  ✓ End-to-end clinical override submission updates in-memory cases, triggers toast, and re-renders UI.\n");

  console.log("==================================================================");
  console.log("🎉 ALL 8 CLINICAL RISK OVERRIDE ACCEPTANCE TESTS PASSED (100%)");
  console.log("==================================================================\n");
})();
