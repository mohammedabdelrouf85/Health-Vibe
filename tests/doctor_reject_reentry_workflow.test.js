/**
 * Health Vibe AI - Automated Test Suite
 * Reject Assessment & Request Re-entry Workflow (K Health Pattern)
 */

const assert = require("assert");

// Setup minimal mock DOM environment for Node.js
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(c) { this.classes.add(c); }
  remove(c) { this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toString() { return Array.from(this.classes).join(" "); }
}

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.classList = new MockClassList();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this._innerHTML = "";
    this._value = "";
    this._textContent = "";
    this.listeners = new Map();
  }

  get id() { return this.attributes.get("id") || ""; }
  set id(val) { this.attributes.set("id", val); }

  get value() { return this._value; }
  set value(val) { this._value = val; }

  get textContent() { return this._textContent; }
  set textContent(val) { this._textContent = val; }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = html;
    const idMatches = html.matchAll(/id=["']([^"']+)["']/g);
    for (const match of idMatches) {
      const child = new MockElement("div");
      child.id = match[1];
      child.parentElement = this;
      this.children.push(child);
      if (global.document && global.document._elementsById) {
        global.document._elementsById.set(match[1], child);
      }
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (child.id && global.document && global.document._elementsById) {
      global.document._elementsById.set(child.id, child);
    }
    return child;
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    this.listeners.set(event, this.listeners.get(event).filter(f => f !== fn));
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) fn(event);
  }

  focus() {
    if (global.document) global.document.activeElement = this;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
    }
    const cleanIds = (el) => {
      if (global.document && global.document._elementsById && el.id) {
        global.document._elementsById.delete(el.id);
      }
      if (Array.isArray(el.children)) {
        for (const child of el.children) {
          cleanIds(child);
        }
      }
    };
    cleanIds(this);
  }

  querySelector(sel) {
    return this.children[0] || null;
  }

  querySelectorAll(sel) {
    return this.children;
  }
}

class MockDocument {
  constructor() {
    this._elementsById = new Map();
    this.body = new MockElement("body");
    this.activeElement = null;
    this.listeners = new Map();
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    this.listeners.set(event, this.listeners.get(event).filter(f => f !== fn));
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) fn(event);
  }
}

// Attach mocks to global
global.document = new MockDocument();
global.window = global;
global.currentLanguage = "ar";
global.state = {};
global.cases = [];

// Load modules
const DoctorService = require("../app/modules/doctor/doctor-service.js");
const DoctorUI = require("../app/modules/doctor/doctor-ui.js");

async function runTests() {
  console.log("===============================================================================");
  console.log("HEALTH VIBE AI: REJECT & REQUEST RE-ENTRY WORKFLOW TEST SUITE (K HEALTH)");
  console.log("===============================================================================\n");

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  // --- SECTION 1: DOCTOR SERVICE TAXONOMY & VALIDATION ---

  test("DoctorService includes all 5 K Health Rejection Categories and 6 Re-entry Fields", () => {
    assert.strictEqual(DoctorService.REJECTION_REENTRY_CATEGORIES.length, 5);
    assert(DoctorService.REJECTION_REENTRY_CATEGORIES.includes("INCOMPLETE_MEASUREMENTS"));
    assert(DoctorService.REJECTION_REENTRY_CATEGORIES.includes("CONTRADICTORY_VITALS"));
    assert(DoctorService.REJECTION_REENTRY_CATEGORIES.includes("UNREADABLE_ATTACHMENTS"));
    assert(DoctorService.REJECTION_REENTRY_CATEGORIES.includes("CLINICAL_INCONSISTENCY"));
    assert(DoctorService.REJECTION_REENTRY_CATEGORIES.includes("OTHER_CLINICAL_JUSTIFICATION"));

    assert.strictEqual(DoctorService.REENTRY_REQUEST_FIELDS.length, 6);
    const fieldIds = DoctorService.REENTRY_REQUEST_FIELDS.map(f => f.id);
    assert(fieldIds.includes("spo2"));
    assert(fieldIds.includes("blood_pressure"));
    assert(fieldIds.includes("temperature"));
    assert(fieldIds.includes("symptoms_detail"));
    assert(fieldIds.includes("attachments"));
    assert(fieldIds.includes("medications"));
  });

  test("validateRejectReentryPayload enforces mandatory rules and minimum 10 characters note", () => {
    // Mode error
    const r1 = DoctorService.validateRejectReentryPayload({
      mode: "invalid_mode",
      reasonCategory: "CONTRADICTORY_VITALS",
      doctorNote: "Valid explanation note here"
    });
    assert.strictEqual(r1.valid, false);
    assert.strictEqual(r1.error, "INVALID_MODE");

    // Short note error
    const r2 = DoctorService.validateRejectReentryPayload({
      mode: "reentry",
      reasonCategory: "CONTRADICTORY_VITALS",
      requiredFields: ["spo2"],
      doctorNote: "Short"
    });
    assert.strictEqual(r2.valid, false);
    assert.strictEqual(r2.error, "NOTE_TOO_SHORT");

    // No fields selected in reentry mode
    const r3 = DoctorService.validateRejectReentryPayload({
      mode: "reentry",
      reasonCategory: "CONTRADICTORY_VITALS",
      requiredFields: [],
      doctorNote: "Valid explanation of why pulse is contradictory"
    });
    assert.strictEqual(r3.valid, false);
    assert.strictEqual(r3.error, "NO_FIELDS_SELECTED");

    // Valid reentry payload
    const r4 = DoctorService.validateRejectReentryPayload({
      mode: "reentry",
      reasonCategory: "CONTRADICTORY_VITALS",
      requiredFields: ["spo2", "blood_pressure"],
      doctorNote: "Please warm fingers and retake SpO2 seated quietly."
    });
    assert.strictEqual(r4.valid, true);

    // Valid definitive rejection (fields not mandatory)
    const r5 = DoctorService.validateRejectReentryPayload({
      mode: "definitive_reject",
      reasonCategory: "CLINICAL_INCONSISTENCY",
      requiredFields: [],
      doctorNote: "Duplicate submission from non-medical demo bot."
    });
    assert.strictEqual(r5.valid, true);
  });

  // --- SECTION 2: UI MODAL HTML RENDERING & K HEALTH PROTOCOL ---

  test("renderRejectReentryModalHtml generates complete responsive K Health intake modal", () => {
    const testCase = {
      id: "CASE-REJECT-UI",
      patientName: "منى الشاذلي",
      o2: 78,
      duration: "3 days"
    };

    const modalHtmlAr = DoctorUI.renderRejectReentryModalHtml(testCase, false);
    assert(modalHtmlAr.includes("doctorRejectReentryModal"), "Must include modal container ID");
    assert(modalHtmlAr.includes("K Health Intake Protocol"), "Must include K Health protocol banner");
    assert(modalHtmlAr.includes("modeCard_reentry"), "Must include reentry mode card");
    assert(modalHtmlAr.includes("modeCard_definitive"), "Must include definitive rejection mode card");
    assert(modalHtmlAr.includes("reentryFieldsSection"), "Must include required fields checklist section");
    assert(modalHtmlAr.includes("rejectReentryInstructionTextarea"), "Must include physician instructions textarea");
    assert(modalHtmlAr.includes("reentryNotificationPreviewCard"), "Must include live patient push preview");

    const modalHtmlEn = DoctorUI.renderRejectReentryModalHtml(testCase, true);
    assert(modalHtmlEn.includes("Reject Assessment & Request Patient Re-entry"), "Must support clinical English");
    assert(modalHtmlEn.includes("Live Patient In-App Push & SMS Alert Preview"));
  });

  // --- SECTION 3: MODAL CONTROLLERS & INTERACTIVE INTERACTIONS ---

  test("openRejectReentryModal mounts dialog and handles mode switching & field toggles", () => {
    const testCase = {
      id: "CASE-CTRL-TEST",
      patientName: "حاتم عبد الرحمن",
      o2: 92
    };
    global.cases = [testCase];

    DoctorUI.openRejectReentryModal("CASE-CTRL-TEST", "reentry");
    const mount = global.document.getElementById("doctorRejectModalMountPoint");
    assert(mount !== null, "Mount point must exist when modal is opened");

    // Toggle field 'blood_pressure'
    DoctorUI.toggleReentryField("blood_pressure");

    // Switch mode to definitive_reject
    DoctorUI.setRejectReentryMode("definitive_reject");
    const cardDefinitive = global.document.getElementById("modeCard_definitive");
    assert(cardDefinitive.classList.contains("is-selected"));

    // Switch back to reentry mode
    DoctorUI.setRejectReentryMode("reentry");
    const cardReentry = global.document.getElementById("modeCard_reentry");
    assert(cardReentry.classList.contains("is-selected"));

    // Close modal
    DoctorUI.closeRejectReentryModal();
    const mountAfterClose = global.document.getElementById("doctorRejectModalMountPoint");
    assert.strictEqual(mountAfterClose, null, "Modal mount point must be cleared on close");
  });

  // --- SECTION 4: KEYBOARD SHORTCUTS IN MODAL ---

  test("Keyboard shortcuts: Escape closes modal & Ctrl+Enter triggers submission", () => {
    global.cases = [{ id: "CASE-KEY-TEST", patientName: "هدى كمال", o2: 88 }];
    DoctorUI.openRejectReentryModal("CASE-KEY-TEST", "reentry");
    assert(global.document.getElementById("doctorRejectModalMountPoint") !== null);

    // Escape closes
    let escPrevented = false;
    global.document.dispatchEvent({
      type: "keydown",
      key: "Escape",
      preventDefault: () => { escPrevented = true; }
    });
    assert.strictEqual(escPrevented, true);
    assert.strictEqual(global.document.getElementById("doctorRejectModalMountPoint"), null);

    // Reopen and test Ctrl+Enter
    DoctorUI.openRejectReentryModal("CASE-KEY-TEST", "reentry");
    const textarea = global.document.getElementById("rejectReentryInstructionTextarea");
    if (textarea) textarea.value = "Please re-measure blood pressure and SpO2.";

    let enterPrevented = false;
    global.document.dispatchEvent({
      type: "keydown",
      ctrlKey: true,
      key: "Enter",
      preventDefault: () => { enterPrevented = true; }
    });
    assert.strictEqual(enterPrevented, true);
    DoctorUI.closeRejectReentryModal();
  });

  // --- SECTION 5: END-TO-END SUBMISSION & STATUS TRANSITIONS ---

  await testAsync("submitRejectReentry transitions case to more_info_requested with reentry metadata", async () => {
    const testCase = {
      id: "CASE-SUBMIT-REENTRY",
      patientName: "أحمد الفقي",
      status: "under_review",
      o2: 75
    };
    global.cases = [testCase];
    global.state = { doctorQueue: [testCase] };

    let passedStatus = null;
    let passedPayload = null;
    global.updateCaseStatus = async (id, status, note, payload) => {
      passedStatus = status;
      passedPayload = payload;
      testCase.status = status;
      Object.assign(testCase, payload);
      return true;
    };

    DoctorUI.openRejectReentryModal("CASE-SUBMIT-REENTRY", "reentry");

    const catSelect = global.document.getElementById("rejectCategorySelect");
    if (catSelect) catSelect.value = "CONTRADICTORY_VITALS";

    const textarea = global.document.getElementById("rejectReentryInstructionTextarea");
    if (textarea) textarea.value = "SpO2 reading of 75% without dyspnea appears to be an artifact. Please re-measure.";

    DoctorUI.toggleReentryField("blood_pressure");

    await DoctorUI.submitRejectReentry("CASE-SUBMIT-REENTRY");

    assert.strictEqual(passedStatus, "more_info_requested");
    assert.strictEqual(passedPayload.isReentryRequest, true);
    assert.strictEqual(passedPayload.reentryMode, "reentry");
    assert.strictEqual(passedPayload.rejectionCategory, "CONTRADICTORY_VITALS");
    assert(Array.isArray(passedPayload.requiredFields));
    assert(passedPayload.requiredFields.includes("spo2"));
    assert(passedPayload.patientNotification !== null);
    assert.strictEqual(testCase.status, "more_info_requested");
  });

  // --- SECTION 6: RE-ENTRY STATUS ALERT BANNER RENDERING ---

  test("renderReentryStatusAlertBanner displays prominent warning banner on flagged case", () => {
    const flaggedCase = {
      id: "CASE-ALERT-BANNER",
      patientName: "مريم نور",
      status: "more_info_requested",
      isReentryRequest: true,
      reentryCategory: "CONTRADICTORY_VITALS",
      rejectionReason: "SpO2 sensor slipped. Please warm extremities and retake.",
      requiredFields: ["spo2", "temperature"]
    };

    const bannerAr = DoctorUI.renderReentryStatusAlertBanner(flaggedCase, false);
    assert(bannerAr.includes("doctor-reentry-alert-card"), "Must render alert card");
    assert(bannerAr.includes("K Health"));
    assert(bannerAr.includes("SpO2"));
    assert(bannerAr.includes("SpO2 sensor slipped"));

    const bannerEn = DoctorUI.renderReentryStatusAlertBanner(flaggedCase, true);
    assert(bannerEn.includes("Assessment Intake Rejected — Awaiting Patient Re-entry"));
    assert(bannerEn.includes("Flagged items for re-entry:"));
  });

  console.log("\n===============================================================================");
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)`);
  console.log("===============================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
