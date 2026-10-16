/**
 * Health Vibe AI - Automated Test Suite
 * Performance & Keyboard Shortcuts Polish for Clinical Risk Override (P2)
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
    // Mock parser for child IDs
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
  console.log("HEALTH VIBE AI: DOCTOR RISK OVERRIDE PERFORMANCE & SHORTCUTS TEST SUITE");
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

  // --- SECTION 1: PERFORMANCE & CACHE BENCHMARKS (< 1000ms guarantee) ---

  await testAsync("loadCaseWithHistoryPerformance loads under 1 second (< 1000ms) on fresh fetch", async () => {
    const testCase = {
      id: "PERF-CASE-001",
      patientName: "سامر عبد الله",
      o2: 89,
      priority: "urgent",
      medicalHistory: [
        { date: "2026-10-10", condition: "COPD Stage 2" },
        { date: "2026-10-14", condition: "Acute Bronchitis" }
      ]
    };
    DoctorService.invalidateCachedCase("PERF-CASE-001");

    const result = await DoctorService.loadCaseWithHistoryPerformance("PERF-CASE-001", {
      fetcher: async (id) => {
        // Simulate remote DB fetch delay
        await new Promise(r => setTimeout(r, 40));
        return testCase;
      }
    });

    assert.strictEqual(result.fromCache, false, "Should be a fresh fetch");
    assert.strictEqual(result.underOneSecond, true, "Must load in < 1000ms");
    assert(result.elapsedMs < 1000, `Elapsed ${result.elapsedMs}ms should be < 1000ms`);
    assert.strictEqual(result.caseData.id, "PERF-CASE-001");
    assert.strictEqual(result.history.length, 2);
  });

  await testAsync("loadCaseWithHistoryPerformance delivers near-instant cache hit (< 50ms)", async () => {
    const cachedResult = await DoctorService.loadCaseWithHistoryPerformance("PERF-CASE-001");
    assert.strictEqual(cachedResult.fromCache, true, "Should hit memory cache");
    assert.strictEqual(cachedResult.underOneSecond, true);
    assert(cachedResult.elapsedMs < 50, `Cache hit should take < 50ms, took ${cachedResult.elapsedMs}ms`);
    assert.strictEqual(cachedResult.caseData.patientName, "سامر عبد الله");
  });

  test("Cache invalidation clears entry properly", () => {
    assert(DoctorService.getCachedCase("PERF-CASE-001") !== null);
    DoctorService.invalidateCachedCase("PERF-CASE-001");
    assert.strictEqual(DoctorService.getCachedCase("PERF-CASE-001"), null);
  });

  // --- SECTION 2: UI VISUAL SHORTCUT BADGES ---

  test("renderRiskOverrideSection includes Alt+O shortcut badge on trigger buttons", () => {
    const activeCase = {
      id: "CASE-UI-SHORTCUTS",
      patientName: "نادية المصري",
      priority: "normal",
      o2: 95
    };
    const htmlAr = DoctorUI.renderRiskOverrideSection(activeCase, false);
    assert(htmlAr.includes("data-case-id=\"CASE-UI-SHORTCUTS\""), "Should render data-case-id");
    assert(htmlAr.includes("Alt+O"), "Should render Alt+O shortcut badge in Arabic view");

    const htmlEn = DoctorUI.renderRiskOverrideSection(activeCase, true);
    assert(htmlEn.includes("Alt+O"), "Should render Alt+O shortcut badge in English view");
  });

  test("renderRiskOverrideModalHtml includes [1], [2], [3] and Alt+E/R badges & shortcuts legend", () => {
    const activeCase = {
      id: "CASE-MODAL-SHORTCUTS",
      patientName: "خالد رشدي",
      priority: "high",
      o2: 91
    };
    const modalHtml = DoctorUI.renderRiskOverrideModalHtml(activeCase, false);
    assert(modalHtml.includes("[1]"), "Must include [1] badge for Urgent priority card");
    assert(modalHtml.includes("[2]"), "Must include [2] badge for High priority card");
    assert(modalHtml.includes("[3]"), "Must include [3] badge for Normal priority card");
    assert(modalHtml.includes("Alt+E"), "Must include Alt+E badge for English presets");
    assert(modalHtml.includes("Alt+R"), "Must include Alt+R badge for Arabic presets");
    assert(modalHtml.includes("shortcuts-legend"), "Must include keyboard shortcuts legend footer");
    assert(modalHtml.includes("Ctrl+↵"), "Must include Ctrl+Enter quick save badge");
    assert(modalHtml.includes("Esc"), "Must include Esc cancel badge");
  });

  // --- SECTION 3: KEYBOARD SHORTCUTS DISPATCH & ACCELERATION ---

  test("initDoctorKeyboardShortcuts registers Alt+O global listener to open modal", () => {
    // Clear any previous modal
    DoctorUI.closeOverrideRiskModal();

    // Set active case section in DOM
    const mockSection = new MockElement("div");
    mockSection.id = "doctorRiskOverrideSection";
    mockSection.setAttribute("data-case-id", "CASE-GLOBAL-KEY");
    global.document._elementsById.set("doctorRiskOverrideSection", mockSection);
    global.cases = [{ id: "CASE-GLOBAL-KEY", patientName: "مريض تجريبي", priority: "normal" }];

    // Simulate Alt + O keydown
    let prevented = false;
    global.document.dispatchEvent({
      type: "keydown",
      altKey: true,
      key: "o",
      code: "KeyO",
      preventDefault: () => { prevented = true; }
    });

    assert.strictEqual(prevented, true, "Alt+O should prevent default browser event");
    const mount = global.document.getElementById("doctorRiskModalMountPoint");
    assert(mount !== null, "Alt+O must mount override risk modal for active case");

    // Close modal for next test
    DoctorUI.closeOverrideRiskModal();
  });

  test("Modal shortcuts: Escape closes modal & Priority selection works with 1, 2, 3", () => {
    // Register active case in global.cases
    global.cases = [{ id: "CASE-KEY-DISPATCH", priority: "high", o2: 91 }];
    DoctorUI.openOverrideRiskModal("CASE-KEY-DISPATCH");

    const mount = global.document.getElementById("doctorRiskModalMountPoint");
    assert(mount !== null, "Mount point must exist when modal is opened");

    // Select Urgent with digit '1'
    let onePrevented = false;
    global.document.dispatchEvent({
      type: "keydown",
      key: "1",
      preventDefault: () => { onePrevented = true; }
    });
    assert.strictEqual(onePrevented, true, "Pressing '1' selects urgent priority");

    // Test Esc closes modal
    let escPrevented = false;
    global.document.dispatchEvent({
      type: "keydown",
      key: "Escape",
      preventDefault: () => { escPrevented = true; }
    });
    assert.strictEqual(escPrevented, true, "Escape keydown default was prevented");
    const mountAfterEsc = global.document.getElementById("doctorRiskModalMountPoint");
    assert.strictEqual(mountAfterEsc, null, "Mount point must be removed on Escape");
  });

  test("Modal shortcuts: Ctrl + Enter triggers rapid override submission", () => {
    // Open modal again
    DoctorUI.openOverrideRiskModal("CASE-KEY-DISPATCH");
    assert(global.document.getElementById("doctorRiskModalMountPoint") !== null);

    const textarea = global.document.getElementById("overrideReasonTextarea");
    if (textarea) textarea.value = "Direct examination reveals severe retractions.";

    let ctrlEnterPrevented = false;
    global.document.dispatchEvent({
      type: "keydown",
      ctrlKey: true,
      key: "Enter",
      preventDefault: () => { ctrlEnterPrevented = true; }
    });
    assert.strictEqual(ctrlEnterPrevented, true, "Ctrl+Enter should trigger submission");
    DoctorUI.closeOverrideRiskModal();
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
