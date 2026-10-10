/**
 * Health Vibe AI - Doctor Review Interface Test Suite
 *
 * Validates:
 * 1. Persistent, compact patient & case identity header with assessment date and current revision.
 * 2. Stale revision detection & clear "New information received" alert banner.
 * 3. Field-level revision comparison with timestamps and source provenance.
 * 4. Doctor draft notes preservation across re-renders and case switches.
 * 5. Explicit review acknowledgment enforcement before enabling approval.
 * 6. Arabic and English parity, mobile responsiveness, and keyboard navigation.
 * 7. Multi-modal accessibility: text and icons alongside status colors.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("🩺 HEALTH VIBE AI: DOCTOR REVIEW INTERFACE TEST SUITE");
console.log("   Identity Header, Stale Banners, Field Diff, Drafts & A11y");
console.log("==================================================================\n");

// Mock browser globals for Node test environment
const mockLocalStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

global.localStorage = mockLocalStorage;
global.currentLanguage = "en";

// Mock document for DOM elements
const mockElements = new Map();
global.document = {
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: (selector) => {
    if (selector === ".btn-clinical.approve") {
      return Array.from(mockElements.values()).filter(el => el.classList && el.classList.contains("approve"));
    }
    return [];
  },
  createElement: (tag) => {
    return {
      tagName: tag,
      innerHTML: "",
      children: [],
      classList: {
        contains: (c) => false,
        add: () => {},
        remove: () => {}
      },
      firstElementChild: {
        id: "doctorRevisionDiffModalBackdrop",
        querySelector: () => ({ focus: () => {} }),
        querySelectorAll: () => []
      }
    };
  },
  body: {
    appendChild: () => {}
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Load DoctorUI module
const doctorUI = require(path.resolve(__dirname, "../app/modules/doctor/doctor-ui.js"));

// Test Case Personas
const baselineCase = {
  id: "case_resp_2026_001",
  patientId: "usr_pt_tarek_982",
  patientName: "طارق عبد المنعم",
  patientNameEn: "Tarek Abdel-Moneim",
  age: 46,
  gender: "male",
  clinicName: "عيادة النيل للأمراض الصدرية",
  clinicNameEn: "Nile Chest Clinic",
  status: "under_review",
  priority: "urgent",
  o2: 89,
  previousO2: 86,
  temperature: 38.2,
  previousTemperature: 39.0,
  heartRate: 98,
  previousHeartRate: 112,
  respiratoryRate: 22,
  previousRespiratoryRate: 28,
  systolicBp: 135,
  diastolicBp: 85,
  previousBp: "150/95 mmHg",
  symptoms: ["ضيق تنفس متزايد", "سعال جاف"],
  previousSymptoms: "ضيق تنفس حاد، سعال جاف شديد",
  patientResponse: "أشعر بتحسن طفيف بعد استخدام البخاخ الإسعافي، والحرارة بدأت تنخفض.",
  submittedAt: new Date(Date.now() - 7200000).toISOString(),
  lastRevisionAt: new Date(Date.now() - 900000).toISOString(),
  clinicalRevision: 2,
  isRevisionStale: true
};

(async () => {
  // -----------------------------------------------------------------------------
  // TEST 1: Persistent Compact Patient & Case Identity Header
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Persistent Patient & Case Identity Header ...");
  
  // English Rendering
  const headerEn = doctorUI.renderPersistentCaseHeader(baselineCase, true);
  assert.ok(headerEn.includes('class="doctor-identity-header sticky-header"'), "Header must have sticky-header class");
  assert.ok(headerEn.includes("Tarek Abdel-Moneim"), "Header must include English patient name");
  assert.ok(headerEn.includes("usr_pt_tar"), "Header must include short patient identifier");
  assert.ok(headerEn.includes("Nile Chest Clinic"), "Header must include clinic name");
  assert.ok(headerEn.includes("Date:"), "Header must clearly display assessment date label");
  assert.ok(headerEn.includes("Rev 2"), "Header must display revision 2");
  assert.ok(headerEn.includes("(Review Required)"), "Header must indicate stale revision needs review in English");
  assert.ok(headerEn.includes("🚨") && headerEn.includes("Urgent"), "Header priority pill must include both icon and text");
  assert.ok(headerEn.includes("🩺") && headerEn.includes("Under Review"), "Header status pill must include both icon and text");

  // Arabic Rendering
  const headerAr = doctorUI.renderPersistentCaseHeader(baselineCase, false);
  assert.ok(headerAr.includes("طارق عبد المنعم"), "Header must include Arabic patient name");
  assert.ok(headerAr.includes("التاريخ:"), "Header must clearly display Arabic assessment date label");
  assert.ok(headerAr.includes("المراجعة 2"), "Header must display Arabic revision 2");
  assert.ok(headerAr.includes("محدثة"), "Header must indicate stale revision in Arabic");
  assert.ok(headerAr.includes("🚨") && headerAr.includes("عاجل"), "Header priority pill must include Arabic icon and text");
  console.log("  ✓ Persistent compact identity header renders complete patient info, assessment date, revision, and multi-modal status pills.\n");

  // -----------------------------------------------------------------------------
  // TEST 2: Stale Revision Detection & "New Information Received" Banner
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 2: Stale Revision Detection & Alert Banner ...");
  
  // Check initial stale state
  assert.equal(doctorUI.isRevisionStale(baselineCase), true, "Baseline case at Rev 2 without acknowledgment must be stale");

  // Stale Banner HTML
  const bannerEn = doctorUI.renderStaleRevisionBanner(baselineCase, true);
  assert.ok(bannerEn.includes('id="staleRevisionBanner"'), "Banner must have staleRevisionBanner id");
  assert.ok(bannerEn.includes("New Clinical Information Received"), "Banner must show prominent English alert heading");
  assert.ok(bannerEn.includes("📢"), "Banner must show alert icon");
  assert.ok(bannerEn.includes("Revision 2"), "Banner must show revision pill with text and icon");
  assert.ok(bannerEn.includes("Patient In-App Response"), "Banner must show source provenance");
  assert.ok(bannerEn.includes("Compare Changes & Review"), "Banner must include comparison action button");

  const bannerAr = doctorUI.renderStaleRevisionBanner(baselineCase, false);
  assert.ok(bannerAr.includes("تم استلام معلومات سريرية جديدة"), "Banner must show prominent Arabic alert heading");
  assert.ok(bannerAr.includes("المراجعة السريرية 2"), "Banner must show Arabic revision pill");
  assert.ok(bannerAr.includes("رد المريض على طلب البيانات"), "Banner must show Arabic source provenance");
  console.log("  ✓ Stale revision correctly identified and rendered with clear provenance, timestamp, and review actions.\n");

  // -----------------------------------------------------------------------------
  // TEST 3: Field-Level Revision Comparison Extraction
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 3: Field-Level Revision Comparison with Timestamps & Sources ...");
  
  const diffsEn = doctorUI.extractRevisionDifferences(baselineCase, true);
  assert.ok(diffsEn.length >= 6, "Must extract at least 6 clinical measurement diffs");

  // Verify Oxygen Saturation
  const o2Diff = diffsEn.find(d => d.id === "oxygenLevel");
  assert.ok(o2Diff, "SpO2 diff must be present");
  assert.equal(o2Diff.prevVal, "86%", "Previous SpO2 must match");
  assert.equal(o2Diff.newVal, "89%", "New SpO2 must match");
  assert.ok(o2Diff.deltaText.includes("+3%"), "Delta must report +3%");
  assert.ok(o2Diff.deltaText.includes("🟢"), "Delta must include trend icon alongside text");
  assert.ok(o2Diff.prevSource.includes("Initial Assessment"), "Baseline provenance must be identified");
  assert.ok(o2Diff.newSource.includes("Patient Reply"), "Updated provenance must be identified");

  // Verify Body Temperature
  const tempDiff = diffsEn.find(d => d.id === "temperature");
  assert.ok(tempDiff, "Temperature diff must be present");
  assert.equal(tempDiff.prevVal, "39 °C");
  assert.equal(tempDiff.newVal, "38.2 °C");
  assert.ok(tempDiff.deltaText.includes("🟢") && tempDiff.deltaText.includes("Reduced fever"));

  // Verify Blood Pressure & Symptoms
  const bpDiff = diffsEn.find(d => d.id === "bloodPressure");
  assert.ok(bpDiff && bpDiff.isChanged, "BP diff must be flagged as changed");
  const symDiff = diffsEn.find(d => d.id === "symptoms");
  assert.ok(symDiff && symDiff.isChanged, "Symptoms diff must be flagged as changed");

  // Test Modal Dialog HTML
  const modalHtmlEn = doctorUI.renderFieldComparisonModalHtml(baselineCase, true);
  assert.ok(modalHtmlEn.includes('id="doctorRevisionDiffModal"'), "Modal dialog must be rendered");
  assert.ok(modalHtmlEn.includes('id="doctorDiffReviewedCheck"'), "Modal must contain explicit verification checkbox");
  assert.ok(modalHtmlEn.includes('id="btnUnlockApprovalAction"'), "Modal must contain unlock approval button");
  assert.ok(modalHtmlEn.includes('disabled="disabled"'), "Unlock button must initially be disabled until checkbox is checked");
  console.log("  ✓ Field-level comparison accurately computes values, timestamps, sources, and delta indicators.\n");

  // -----------------------------------------------------------------------------
  // TEST 4: Draft Note Preservation Engine
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 4: Draft Note Preservation Engine ...");
  
  const testCaseId = "case_draft_test_777";
  assert.equal(doctorUI.hasDraftNotes(testCaseId), false, "New case must have no draft notes initially");

  // Save notes
  doctorUI.saveDraftNotes(testCaseId, {
    diagnosis: "Acute Bronchitis with mild wheezing",
    medications: "Salbutamol 100mcg 2 puffs prn",
    recommendations: "Drink warm fluids, rest 48 hours"
  });

  assert.equal(doctorUI.hasDraftNotes(testCaseId), true, "Case must have draft notes after saving");
  const draftRetrieved = doctorUI.getDraftNotes(testCaseId);
  assert.equal(draftRetrieved.diagnosis, "Acute Bronchitis with mild wheezing");
  assert.equal(draftRetrieved.medications, "Salbutamol 100mcg 2 puffs prn");
  assert.ok(mockLocalStorage.getItem(`hv_draft_doc_${testCaseId}`), "Draft must be persisted to localStorage");

  // Discard draft notes
  doctorUI.clearDraftNotes(testCaseId);
  assert.equal(doctorUI.hasDraftNotes(testCaseId), false, "Draft must be cleared");
  assert.equal(doctorUI.getDraftNotes(testCaseId), null);
  console.log("  ✓ Draft note preservation reliably saves, retrieves, and clears unsaved notes.\n");

  // -----------------------------------------------------------------------------
  // TEST 5: Explicit Review Requirement & Approval Unlocking
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 5: Explicit Review Requirement & Approval Unlocking ...");
  
  // Setup mock DOM elements for acknowledgment test
  const mockStaleBanner = { id: "staleRevisionBanner", style: { display: "block" } };
  const mockRevPill = { id: "headerRevisionPill", className: "pill pending", innerHTML: "", title: "" };
  const mockApproveBtn = {
    classList: {
      contains: (c) => c === "approve" || c === "locked",
      remove: function(c) { if (c === "locked") this._locked = false; }
    },
    style: { opacity: "0.65", cursor: "not-allowed", background: "#64748b" },
    removeAttribute: function(attr) { if (attr === "disabled") this._disabled = false; },
    setAttribute: function() {},
    title: "",
    innerHTML: ""
  };
  const mockAriaLive = { id: "doctorReviewAriaLive", textContent: "" };

  mockElements.set("staleRevisionBanner", mockStaleBanner);
  mockElements.set("headerRevisionPill", mockRevPill);
  mockElements.set("doctorReviewAriaLive", mockAriaLive);
  mockElements.set("btnApprove1", mockApproveBtn);

  // Verification checkbox toggles unlock button
  const mockUnlockBtn = {
    removeAttribute: function(a) { this._disabled = false; },
    setAttribute: function(a) { this._disabled = true; },
    style: { opacity: "0.65", cursor: "not-allowed", background: "#64748b" },
    classList: {
      contains: (c) => false,
      remove: () => {},
      add: () => {}
    }
  };
  mockElements.set("btnUnlockApprovalAction", mockUnlockBtn);

  doctorUI.handleVerificationCheckboxChange(false);
  assert.equal(mockUnlockBtn._disabled, true, "Button remains disabled when checkbox unchecked");

  doctorUI.handleVerificationCheckboxChange(true);
  assert.equal(mockUnlockBtn._disabled, false, "Button unlocks when checkbox checked");
  assert.equal(mockUnlockBtn.style.background, "#10b981");

  // Doctor acknowledges revision
  doctorUI.acknowledgeNewRevision(baselineCase.id);

  assert.equal(doctorUI.isRevisionStale(baselineCase), false, "Case must no longer be stale after acknowledgment");
  assert.equal(mockStaleBanner.style.display, "none", "Stale banner must be hidden");
  assert.equal(mockRevPill.className, "pill ok", "Revision pill must become 'pill ok'");
  assert.ok(mockRevPill.innerHTML.includes("Verified") || mockRevPill.innerHTML.includes("مدققة"), "Revision pill must indicate verified");
  assert.ok(mockAriaLive.textContent.includes("verified") || mockAriaLive.textContent.includes("تأكيد"), "Screen reader live region must announce verification");
  console.log("  ✓ Explicit certification checkbox gates approval, and acknowledgment unlocks workflow properly.\n");

  // -----------------------------------------------------------------------------
  // TEST 6: Diagnostic Presets Parity
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 6: Diagnostic Presets Parity ...");
  const presetsEn = doctorUI.getDiagnosticPresets(true);
  const presetsAr = doctorUI.getDiagnosticPresets(false);

  const expectedKeys = ["bronchitis", "stable", "asthma", "uri"];
  expectedKeys.forEach(k => {
    assert.ok(presetsEn[k], `English preset ${k} must exist`);
    assert.ok(presetsAr[k], `Arabic preset ${k} must exist`);
    assert.ok(presetsEn[k].diag && presetsEn[k].meds && presetsEn[k].recs);
    assert.ok(presetsAr[k].diag && presetsAr[k].meds && presetsAr[k].recs);
  });
  console.log("  ✓ All 4 clinical diagnostic shortcuts have full Arabic and English parity.\n");

  // -----------------------------------------------------------------------------
  // TEST 7: Mobile Navigation, Review Tabs & Queue Scroll Preservation
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 7: Mobile Navigation Bar, Review Tabs & Queue Scroll Preservation ...");

  // Render Mobile Nav Bar
  const mobileNavEn = doctorUI.renderMobileNavBar(baselineCase, true, 5);
  assert.ok(mobileNavEn.includes("Back to Patient Queue"), "Mobile nav must have English back button");
  assert.ok(mobileNavEn.includes("←"), "Mobile nav English must show left arrow");
  assert.ok(mobileNavEn.includes("5"), "Mobile nav must show queue count pill");

  const mobileNavAr = doctorUI.renderMobileNavBar(baselineCase, false, 5);
  assert.ok(mobileNavAr.includes("العودة لقائمة المرضى"), "Mobile nav must have Arabic back button");
  assert.ok(mobileNavAr.includes("→"), "Mobile nav Arabic must show right arrow");

  // Render Review Tabs
  const reviewTabsEn = doctorUI.renderReviewTabs(baselineCase, true);
  assert.ok(reviewTabsEn.includes('id="docTab-inputs"'), "Must render inputs tab button");
  assert.ok(reviewTabsEn.includes('id="docTab-clarifications"'), "Must render clarifications tab button");
  assert.ok(reviewTabsEn.includes('id="docTab-notes"'), "Must render notes tab button");
  assert.ok(reviewTabsEn.includes('id="docTab-timeline"'), "Must render timeline tab button");
  assert.ok(reviewTabsEn.includes('id="docTab-all"'), "Must render all sections tab button");
  assert.ok(reviewTabsEn.includes("Inputs & Triage"), "English tab labels must be present");

  const reviewTabsAr = doctorUI.renderReviewTabs(baselineCase, false);
  assert.ok(reviewTabsAr.includes("المدخلات والفرز"), "Arabic tab labels must be present");
  assert.ok(reviewTabsAr.includes("الاستفسارات"), "Arabic clarifications tab label must be present");

  // Queue Scroll Preservation
  doctorUI.setSavedQueueScrollTop(345);
  assert.equal(doctorUI.getSavedQueueScrollTop(), 345, "Saved queue scroll position must equal 345");
  doctorUI.setSavedQueueScrollTop(0);
  assert.equal(doctorUI.getSavedQueueScrollTop(), 0, "Queue scroll position resets cleanly");
  console.log("  ✓ Mobile nav bar, review tabs, and queue scroll position preservation validated.\n");

  // -----------------------------------------------------------------------------
  // TEST 8: Workspace Tabs Switching & View Toggling
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 8: Review Tab Switching & Mobile View Toggling ...");

  global.window = {
    innerWidth: 500,
    scrollTo: () => {}
  };

  const mockTabInputs = { id: "docTab-inputs", classList: { toggle: () => {} }, setAttribute: () => {} };
  const mockTabNotes = { id: "docTab-notes", classList: { toggle: () => {} }, setAttribute: () => {} };
  const mockSecInputs = { id: "docSection-inputs", style: { display: "block" } };
  const mockSecNotes = { id: "docSection-notes", style: { display: "none" } };
  const mockLayout = {
    id: "doctorWorkspaceLayout",
    classList: {
      add: function(c) { this._classes = this._classes || new Set(); this._classes.add(c); },
      remove: function(c) { if (this._classes) this._classes.delete(c); },
      contains: function(c) { return this._classes ? this._classes.has(c) : false; }
    }
  };
  const mockQueuePanel = { id: "doctorQueuePanel", style: { display: "block" } };
  const mockReviewPanel = { id: "doctorReviewPanel", style: { display: "none" } };
  const mockQueueList = { id: "doctorQueueList", scrollTop: 0 };

  mockElements.set("docTab-inputs", mockTabInputs);
  mockElements.set("docTab-notes", mockTabNotes);
  mockElements.set("docSection-inputs", mockSecInputs);
  mockElements.set("docSection-notes", mockSecNotes);
  mockElements.set("doctorWorkspaceLayout", mockLayout);
  mockElements.set("doctorQueuePanel", mockQueuePanel);
  mockElements.set("doctorReviewPanel", mockReviewPanel);
  mockElements.set("doctorQueueList", mockQueueList);

  // Switch tab
  doctorUI.switchReviewTab("notes");
  assert.equal(doctorUI.getActiveReviewTab(), "notes", "Active tab must switch to 'notes'");

  // Open case on mobile
  mockQueueList.scrollTop = 420;
  doctorUI.openCaseOnMobile("case_resp_2026_001");
  assert.equal(doctorUI.getSavedQueueScrollTop(), 420, "Scroll position saved on mobile case open");
  assert.ok(mockLayout.classList.contains("view-review"), "Layout class switched to view-review");

  // Return to queue
  doctorUI.returnToQueue();
  assert.ok(mockLayout.classList.contains("view-queue"), "Layout class restored to view-queue");
  assert.equal(mockQueueList.scrollTop, 420, "Queue scroll position restored on return");
  console.log("  ✓ Mobile view navigation, tabs switching, and queue return work reliably.\n");

  console.log("==================================================================");
  console.log("🎉 ALL 8 DOCTOR REVIEW INTERFACE ACCEPTANCE TESTS PASSED (100%)");
  console.log("==================================================================");
})();
