/**
 * Health Vibe AI - Vezeeta-Grade Human-Friendly Error Guidance & Form Validation Test Suite
 * 
 * Verifies:
 * 1. Technical error interception & PII sanitization (Zero cryptic stack traces).
 * 2. Clinical vitals friendly guidance (SpO2, Temperature, Heart Rate, Respiration, Blood Pressure, Duration).
 * 3. Patient contact & identity guidance (Egyptian Mobile 010/011/012/015, National ID 14 digits).
 * 4. Doctor appointments & medical attachments guidance (Slot booked, past date, 10MB limit).
 * 5. Bilingual parity (Arabic & English clear titles, plain messages, and actionable instructions).
 * 6. DOM component: inline field validation (input-has-error, aria-invalid, aria-describedby, role=alert).
 * 7. DOM component: error notice card with guidance bulb and retry callback.
 * 8. Responsive CSS stylesheet verification in styles.css (breakpoints, mobile touch targets >= 44px).
 * 9. Integration with app.js and window.FriendlyErrorGuide.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("==================================================================");
console.log("🛡️  HEALTH VIBE AI: FRIENDLY ERROR GUIDANCE & VALIDATION TEST SUITE");
console.log("    Vezeeta UX Benchmark: Plain Language, Clinical Bounds & Responsive UI");
console.log("==================================================================\n");

const ROOT = path.resolve(__dirname, "..");
const ERROR_HANDLER_PATH = path.join(ROOT, "app", "modules", "core", "error-handler.js");
const APP_JS_PATH = path.join(ROOT, "app", "app.js");
const STYLES_PATH = path.join(ROOT, "app", "styles.css");

let passedTests = 0;

async function runTest(name, fn) {
  process.stdout.write(`▶ ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log("✓ PASSED");
  } catch (err) {
    console.log("✗ FAILED");
    console.error(err);
    process.exit(1);
  }
}

// Lightweight DOM Mock for testing FriendlyErrorGuide in Node.js
function createMockDOM() {
  const elements = new Map();

  class MockElement {
    constructor(tagName, id = "") {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = "";
      this.attributes = {};
      this.children = [];
      this.parentElement = null;
      this._innerHTML = "";
      this.textContent = "";
      this.value = "";
      this.style = {};
      this._eventListeners = {};
      if (id) elements.set(id, this);
    }

    get innerHTML() {
      return this._innerHTML || "";
    }

    set innerHTML(html) {
      this._innerHTML = String(html || "");
      this.children = [];
      // Parse child tags from html string
      const tagRegex = /<([a-z0-9\-]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9\-]+)([^>]*)\/?>/gis;
      let match;
      while ((match = tagRegex.exec(this._innerHTML)) !== null) {
        const tagName = match[1] || match[4];
        const attrsStr = match[2] || match[5] || "";
        const child = new MockElement(tagName);

        const classMatch = attrsStr.match(/class=["']([^"']+)["']/i);
        if (classMatch) child.className = classMatch[1];

        const idMatch = attrsStr.match(/id=["']([^"']+)["']/i);
        if (idMatch) {
          child.id = idMatch[1];
          elements.set(child.id, child);
        }

        const roleMatch = attrsStr.match(/role=["']([^"']+)["']/i);
        if (roleMatch) child.setAttribute("role", roleMatch[1]);

        child.parentElement = this;
        this.children.push(child);

        // Recursively set innerHTML for nested children
        const innerContent = match[3];
        if (innerContent && innerContent.includes("<")) {
          child.innerHTML = innerContent;
        } else if (innerContent) {
          child.textContent = innerContent;
        }
      }
    }

    get classList() {
      const self = this;
      return {
        add(c) {
          const classes = self.className.split(" ").filter(Boolean);
          if (!classes.includes(c)) classes.push(c);
          self.className = classes.join(" ");
        },
        remove(c) {
          const classes = self.className.split(" ").filter(Boolean);
          self.className = classes.filter(x => x !== c).join(" ");
        },
        contains(c) {
          return self.className.split(" ").filter(Boolean).includes(c);
        }
      };
    }

    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === "id") {
        this.id = String(v);
        elements.set(this.id, this);
      }
    }

    getAttribute(k) {
      return this.attributes[k] !== undefined ? this.attributes[k] : null;
    }

    removeAttribute(k) {
      delete this.attributes[k];
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    insertAdjacentElement(position, el) {
      if (this.parentElement) {
        el.parentElement = this.parentElement;
        this.parentElement.children.push(el);
      }
      return el;
    }

    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector.startsWith(".") && cur.classList.contains(selector.slice(1))) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(c => c !== this);
      }
      if (this.id) elements.delete(this.id);
    }

    querySelector(selector) {
      if (selector.startsWith("#")) {
        const id = selector.slice(1);
        if (this.id === id) return this;
        for (const c of this.children) {
          const found = c.querySelector(selector);
          if (found) return found;
        }
        return elements.get(id) || null;
      }
      if (selector.startsWith(".")) {
        const cls = selector.slice(1);
        for (const c of this.children) {
          if (c.classList.contains(cls)) return c;
          const found = c.querySelector(selector);
          if (found) return found;
        }
        return null;
      }
      for (const c of this.children) {
        if (c.tagName.toLowerCase() === selector.toLowerCase()) return c;
        const found = c.querySelector(selector);
        if (found) return found;
      }
      return null;
    }

    querySelectorAll(selector) {
      let results = [];
      if (selector.startsWith(".")) {
        const cls = selector.slice(1);
        for (const c of this.children) {
          if (c.classList.contains(cls)) results.push(c);
          results = results.concat(c.querySelectorAll(selector));
        }
        return results;
      }
      for (const c of this.children) {
        if (c.tagName.toLowerCase() === selector.toLowerCase()) results.push(c);
        results = results.concat(c.querySelectorAll(selector));
      }
      return results;
    }

    addEventListener(event, handler) {
      if (!this._eventListeners[event]) this._eventListeners[event] = [];
      this._eventListeners[event].push(handler);
    }

    dispatchEvent(event) {
      const handlers = this._eventListeners[event] || [];
      handlers.forEach(h => h());
    }
  }

  const mockDocument = {
    createElement(tag) {
      return new MockElement(tag);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      if (selector.startsWith("#")) return elements.get(selector.slice(1)) || null;
      return null;
    }
  };

  return { mockDocument, MockElement, elements };
}

(async () => {
  // Setup sandbox with Mock DOM
  const { mockDocument, MockElement } = createMockDOM();
  const sandbox = {
    console,
    Date,
    Math,
    String,
    Number,
    Boolean,
    RegExp,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout,
    clearTimeout,
    document: mockDocument,
    window: {},
    globalThis: {},
    module: { exports: {} }
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const errorHandlerSource = fs.readFileSync(ERROR_HANDLER_PATH, "utf8");
  vm.createContext(sandbox);
  vm.runInContext(errorHandlerSource, sandbox);

  const { toFriendlyAppError, FriendlyErrorGuide, ErrorHandler } = sandbox.module.exports;

  // -------------------------------------------------------------
  // TEST 1: Technical Error Interception & PII Sanitization
  // -------------------------------------------------------------
  await runTest("TEST 1: Technical errors mapped to human-friendly messages without technical jargon", () => {
    const rawAuthErr = { code: "auth/invalid-credential", message: "Firebase: Error (auth/invalid-credential)." };
    const friendlyAuth = toFriendlyAppError(rawAuthErr, "", false);

    assert.strictEqual(friendlyAuth.icon, "🔒");
    assert.strictEqual(friendlyAuth.title, "بيانات تسجيل الدخول غير صحيحة");
    assert.ok(friendlyAuth.message.includes("البريد الإلكتروني أو كلمة المرور غير مطابقة لسجلاتنا"), "Arabic message must be friendly");
    assert.ok(friendlyAuth.action.includes("تأكد من كتابة البريد"), "Actionable instructions must explain how to fix");
    assert.strictEqual(friendlyAuth.severity, "error");
    assert.strictEqual(friendlyAuth.ref, "auth/invalid-credential");

    // Network offline error
    const rawNetErr = new Error("Failed to fetch");
    const friendlyNet = toFriendlyAppError(rawNetErr, "", true);
    assert.strictEqual(friendlyNet.icon, "📡");
    assert.strictEqual(friendlyNet.title, "Connection Unavailable");
    assert.ok(friendlyNet.message.includes("secure") || friendlyNet.message.includes("safe"), "Must reassure patient of data security");
    assert.ok(friendlyNet.action.includes("Wi-Fi") || friendlyNet.action.includes("connection"), "Must offer concrete fix");

    // Cryptic JavaScript error
    const rawJsErr = new TypeError("Cannot read properties of undefined (reading 'patientId')");
    const friendlyJs = toFriendlyAppError(rawJsErr, "", false);
    assert.strictEqual(friendlyJs.icon, "⚠️");
    assert.strictEqual(friendlyJs.title, "تعذر استكمال العملية");
    assert.ok(!friendlyJs.message.includes("TypeError"), "Raw stack trace or type must never leak to patient");
    assert.ok(!friendlyJs.message.includes("patientId"), "Variable names must never leak");
    assert.ok(friendlyJs.message.includes("سجلاتك الطبية"), "Patient safety guarantee must be present");
  });

  // -------------------------------------------------------------
  // TEST 2: Clinical Vitals Friendly Guidance (Vezeeta Standard)
  // -------------------------------------------------------------
  await runTest("TEST 2: Clinical vitals friendly validation guidance (SpO2, Temp, HR, RR, BP, Duration)", () => {
    // SpO2
    const spo2ErrAr = toFriendlyAppError("clinical/spo2-out-of-range", "", false);
    assert.strictEqual(spo2ErrAr.icon, "🩺");
    assert.strictEqual(spo2ErrAr.title, "نسبة الأكسجين غير صالحة");
    assert.ok(spo2ErrAr.message.includes("50% و 100%"), "Must state exact safe percentage bounds");
    assert.ok(spo2ErrAr.action.includes("Pulse Oximeter"), "Must mention pulse oximeter device");

    const spo2ErrEn = toFriendlyAppError("clinical/spo2-out-of-range", "", true);
    assert.strictEqual(spo2ErrEn.title, "Invalid Oxygen Saturation (SpO2)");
    assert.ok(spo2ErrEn.action.includes("pulse oximeter"), "English action guide verified");

    // Temperature
    const tempErr = toFriendlyAppError("clinical/temperature-out-of-range", "", false);
    assert.strictEqual(tempErr.icon, "🌡️");
    assert.ok(tempErr.message.includes("34.0° و 43.0°"), "Must specify temperature range");
    assert.ok(tempErr.action.includes("37.2"), "Must provide concrete input example");

    // Heart Rate
    const hrErr = toFriendlyAppError("clinical/heart-rate-out-of-range", "", false);
    assert.strictEqual(hrErr.icon, "💓");
    assert.ok(hrErr.message.includes("30 و 250"), "Heart rate bounds 30-250 verified");

    // Respiratory Rate
    const rrErr = toFriendlyAppError("clinical/respiratory-rate-out-of-range", "", true);
    assert.strictEqual(rrErr.icon, "🫁");
    assert.ok(rrErr.message.includes("5 and 60 breaths"), "Respiratory rate bounds 5-60 breaths verified");

    // Blood Pressure
    const bpErr = toFriendlyAppError("clinical/blood-pressure-invalid", "", false);
    assert.strictEqual(bpErr.icon, "🩸");
    assert.ok(bpErr.message.includes("الانقباضي") && bpErr.message.includes("الانبساطي"), "Systolic / diastolic explanation present");

    // Symptom Duration
    const durErr = toFriendlyAppError("clinical/duration-out-of-range", "", false);
    assert.strictEqual(durErr.icon, "⏱️");
    assert.ok(durErr.message.includes("يوم واحد و 365 يوماً"), "Duration range 1-365 days verified");
  });

  // -------------------------------------------------------------
  // TEST 3: Patient Form & Contact Validation (Egyptian Standards)
  // -------------------------------------------------------------
  await runTest("TEST 3: Egyptian mobile numbers and National ID guidance", () => {
    // Mobile phone
    const phoneErr = toFriendlyAppError("validation/phone-invalid", "", false);
    assert.strictEqual(phoneErr.icon, "📱");
    assert.strictEqual(phoneErr.title, "رقم الهاتف غير صحيح");
    assert.ok(phoneErr.message.includes("010 أو 011 أو 012 أو 015"), "Must list Egyptian network prefixes");
    assert.ok(phoneErr.action.includes("01012345678"), "Must provide practical example");

    // National ID
    const nidErr = toFriendlyAppError("validation/national-id-invalid", "", false);
    assert.strictEqual(nidErr.icon, "🪪");
    assert.strictEqual(nidErr.title, "الرقم القومي غير مطابق");
    assert.ok(nidErr.message.includes("14 رقماً") && nidErr.message.includes("2 أو 3"), "Must explain 14 digits and starting digits 2 or 3");

    // Required field
    const reqErr = toFriendlyAppError("validation/required-field", "", false);
    assert.strictEqual(reqErr.icon, "✏️");
    assert.ok(reqErr.action.includes("(*)"), "Must direct patient to asterisk indicator");
  });

  // -------------------------------------------------------------
  // TEST 4: Appointments & Medical Attachment Guidance
  // -------------------------------------------------------------
  await runTest("TEST 4: Appointments slot conflicts and file upload bounds", () => {
    // Appointment slot already booked
    const slotErr = toFriendlyAppError("appointment/slot-taken", "", false);
    assert.strictEqual(slotErr.icon, "📅");
    assert.strictEqual(slotErr.severity, "warning");
    assert.ok(slotErr.message.includes("قام مريض آخر بحجز هذا الموعد"), "Clear human explanation of booking conflict");
    assert.ok(slotErr.action.includes("جدول المواعيد المتاحة"), "Action directs user to available calendar");

    // File too large
    const fileLargeErr = toFriendlyAppError("file/too-large", "", false);
    assert.strictEqual(fileLargeErr.icon, "📎");
    assert.ok(fileLargeErr.message.includes("10 ميجابايت"), "Must state 10MB limit");
    assert.ok(fileLargeErr.action.includes("ضغط ملف"), "Actionable compression guidance");

    // File unsupported format
    const fileFmtErr = toFriendlyAppError("file/unsupported-format", "", true);
    assert.strictEqual(fileFmtErr.icon, "📄");
    assert.ok(fileFmtErr.action.includes("PDF") && fileFmtErr.action.includes("PNG"), "Explains accepted formats");
  });

  // -------------------------------------------------------------
  // TEST 5: DOM Inline Field Feedback Component
  // -------------------------------------------------------------
  await runTest("TEST 5: DOM renderFieldFeedback sets input-has-error, aria-invalid, aria-describedby, role=alert", () => {
    const parentContainer = mockDocument.createElement("div");
    parentContainer.className = "form-group";

    const input = mockDocument.createElement("input");
    input.id = "patient_mobile_input";
    input.value = "0123"; // invalid phone
    parentContainer.appendChild(input);

    // Call renderFieldFeedback
    const feedback = FriendlyErrorGuide.renderFieldFeedback(input, "validation/phone-invalid", { isEn: false });
    assert.ok(feedback, "Feedback element must be returned");
    assert.strictEqual(input.classList.contains("input-has-error"), true, "Input must have .input-has-error class");
    assert.strictEqual(input.getAttribute("aria-invalid"), "true", "aria-invalid must be true");
    assert.strictEqual(input.getAttribute("aria-describedby"), `err_desc_${input.id}`, "aria-describedby must match error element id");
    assert.strictEqual(feedback.getAttribute("role"), "alert", "Must have role=alert for screen readers");
    assert.strictEqual(feedback.getAttribute("aria-live"), "polite", "Must have aria-live=polite");
    assert.ok(feedback.innerHTML.includes("010 أو 011"), "Guidance must be injected into feedback element");

    // Call clearFieldFeedback
    FriendlyErrorGuide.clearFieldFeedback(input);
    assert.strictEqual(input.classList.contains("input-has-error"), false, "Input must clear .input-has-error class");
    assert.strictEqual(input.getAttribute("aria-invalid"), "false", "aria-invalid must be false");
    assert.strictEqual(mockDocument.getElementById(`err_desc_${input.id}`), null, "Error element must be removed from DOM");
  });

  // -------------------------------------------------------------
  // TEST 6: DOM Notice Card Component with Guidance Bulb & Actions
  // -------------------------------------------------------------
  await runTest("TEST 6: DOM renderNotice builds responsive card with guidance bulb and callbacks", () => {
    const container = mockDocument.createElement("div");
    container.id = "notice_container";

    let retryCalled = false;
    const card = FriendlyErrorGuide.renderNotice(container, "clinical/spo2-out-of-range", {
      isEn: false,
      onRetry: () => { retryCalled = true; }
    });

    assert.ok(card, "Notice card must be created");
    assert.strictEqual(card.getAttribute("role"), "alert", "Notice must be role=alert");
    assert.strictEqual(card.classList.contains("friendly-error-card"), true, "Must have .friendly-error-card class");
    assert.ok(card.innerHTML.includes("friendly-error-guidance"), "Must contain guidance section");
    assert.ok(card.innerHTML.includes("💡"), "Must contain bulb icon");
    assert.ok(card.innerHTML.includes("Pulse Oximeter"), "Must contain actionable instructions");

    const retryBtn = card.querySelector(".friendly-retry-btn");
    assert.ok(retryBtn, "Retry button must be rendered when onRetry is provided");
    retryBtn.dispatchEvent("click");
    assert.strictEqual(retryCalled, true, "Retry callback must be executed on click");
  });

  // -------------------------------------------------------------
  // TEST 7: validateField Helper Method
  // -------------------------------------------------------------
  await runTest("TEST 7: validateField evaluates inputs and returns structured validation status", () => {
    const input = mockDocument.createElement("input");
    input.id = "spo2_test_field";

    // Invalid value: 120 (above 100)
    input.value = "120";
    const resInvalid = FriendlyErrorGuide.validateField(input, "spo2", { isEn: false });
    assert.strictEqual(resInvalid.valid, false, "120 must be invalid for SpO2");
    assert.ok(resInvalid.error, "Error object returned");
    assert.strictEqual(input.classList.contains("input-has-error"), true);

    // Valid value: 98
    input.value = "98";
    const resValid = FriendlyErrorGuide.validateField(input, "spo2", { isEn: false });
    assert.strictEqual(resValid.valid, true, "98 must be valid for SpO2");
    assert.strictEqual(resValid.error, null);
    assert.strictEqual(input.classList.contains("input-has-error"), false);

    // Egyptian phone
    const phoneInput = mockDocument.createElement("input");
    phoneInput.id = "phone_test_field";
    phoneInput.value = "01012345678";
    const phoneValid = FriendlyErrorGuide.validateField(phoneInput, "phone", { isEn: false });
    assert.strictEqual(phoneValid.valid, true, "01012345678 is a valid Egyptian mobile");

    phoneInput.value = "12345";
    const phoneInvalid = FriendlyErrorGuide.validateField(phoneInput, "phone", { isEn: false });
    assert.strictEqual(phoneInvalid.valid, false, "12345 is invalid Egyptian mobile");
  });

  // -------------------------------------------------------------
  // TEST 8: Responsive CSS Stylesheet Verification (Breakpoints & Touch Targets)
  // -------------------------------------------------------------
  await runTest("TEST 8: Responsive CSS stylesheet rules in styles.css", () => {
    const css = fs.readFileSync(STYLES_PATH, "utf8");

    assert.ok(css.includes(".friendly-error-card"), "styles.css must declare .friendly-error-card");
    assert.ok(css.includes(".friendly-error-guidance"), "styles.css must declare .friendly-error-guidance");
    assert.ok(css.includes(".friendly-field-error"), "styles.css must declare .friendly-field-error");
    assert.ok(css.includes("input.input-has-error"), "styles.css must declare input.input-has-error");
    assert.ok(css.includes("@keyframes friendlyErrorSlideIn"), "styles.css must declare friendlyErrorSlideIn animation");
    assert.ok(css.includes("@keyframes friendlyFieldFadeIn"), "styles.css must declare friendlyFieldFadeIn animation");
    assert.ok(css.includes("@media (max-width: 640px)"), "styles.css must declare mobile breakpoint (<= 640px)");
    assert.ok(css.includes("min-height: 48px") || css.includes("min-height: 44px"), "styles.css must enforce touch target >= 44px");
    assert.ok(css.includes("border-inline-start: 4px solid var(--teal"), "styles.css must use logical properties for RTL/LTR support");
  });

  // -------------------------------------------------------------
  // TEST 9: Integration with app.js
  // -------------------------------------------------------------
  await runTest("TEST 9: Integration with app.js showAppError and toFriendlyAppError", () => {
    const appJs = fs.readFileSync(APP_JS_PATH, "utf8");
    assert.ok(appJs.includes("function toFriendlyAppError("), "app.js must define toFriendlyAppError");
    assert.ok(appJs.includes("function showAppError("), "app.js must define showAppError");
    assert.ok(appJs.includes("window.FriendlyErrorGuide"), "app.js must expose window.FriendlyErrorGuide");
    assert.ok(appJs.includes("clinical/spo2-out-of-range"), "app.js must handle SpO2 clinical error code");
    assert.ok(appJs.includes("validation/phone-invalid"), "app.js must handle phone validation error code");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests} FRIENDLY ERROR GUIDANCE & VALIDATION TESTS PASSED (100%)!`);
  console.log("==================================================================\n");
})();
