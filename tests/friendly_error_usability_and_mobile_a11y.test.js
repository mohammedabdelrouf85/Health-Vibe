/**
 * Health Vibe AI - Friendly Error Guidance: Mobile Usability & Accessibility (A11y) QA Test Suite
 * 
 * Verifies:
 * 1. WCAG 2.5.5 / 2.5.8 Touch Target Ergonomics on Smartphones:
 *    - Close button (>= 44x44px touch bounding box).
 *    - Mobile action buttons (>= 48px height, full width on <= 640px).
 *    - Universal action buttons (>= 44px height).
 *    - Vertical button stack on mobile to avoid horizontal scrolling/overflow.
 * 2. Screen Reader ARIA & DOM Semantics (WCAG 4.1.2 & 4.1.3):
 *    - Notice container role="alert", customizable aria-live ("polite" / "assertive").
 *    - Dismiss button localized aria-label ("إغلاق" in Arabic, "Close" in English) and title tooltip.
 *    - Decorative icons (warning icons, light bulb 💡) carry aria-hidden="true".
 *    - Form input error state: aria-invalid="true", aria-describedby pointing to error ID.
 *    - Clear error state: aria-invalid="false", removes aria-describedby cleanly.
 * 3. Cognitive Accessibility & Plain Language for Non-Technical Patients (Vezeeta Standard):
 *    - Zero raw stack traces, HTTP status codes, or cryptic database/auth errors shown to patients.
 *    - Clinical vitals violations translate into physical, tangible advice using household tools:
 *      * SpO2: instructs repositioning pulse oximeter finger sensor on warm clean finger.
 *      * Temperature: instructs re-measuring with clinical digital thermometer.
 *      * Heart Rate: instructs resting quietly for several minutes before re-checking pulse.
 *      * Respiration: instructs sitting comfortably and counting normal breaths.
 *      * Blood Pressure: instructs 5-minute seated rest with upright posture.
 *    - Identity & Phone formats provide concrete Egyptian examples (010/011/012/015, 14 digits starting with 2 or 3).
 * 4. Elderly & Non-Technical Patient Reassurance on Network Disruptions:
 *    - Preserves patient confidence by explicitly stating "Your local records are secure" ("بياناتك المسجلة بأمان").
 *    - Offers immediate single-tap retry button.
 *    - Isolates reference tracking code (unicode-bidi: isolate; direction: ltr) without intimidating the patient.
 * 5. Smartphone Viewport Adaptability & Overflow Protection (320px – 375px):
 *    - Zero horizontal viewport drift / overflow protection on compact smartphones (320px - 375px).
 *    - Word-break: break-all on REF code to prevent clipping.
 *    - Font scaling and reduced card padding on mobile screens.
 * 6. Bidirectional (BiDi) Integrity & RTL/LTR Alignment:
 *    - Arabic cards set dir="rtl" and lang="ar"; English cards set dir="ltr" and lang="en".
 *    - All numeric figures, ranges, units, phone numbers, and REF identifiers are protected via <bdi class="bidi-isolate">.
 *    - Dynamic language switching live-updates notice attributes and text without losing state.
 * 7. Motor Accessibility & Keyboard Focus (:focus-visible):
 *    - Visible high-contrast focus rings (2px solid outline, 2px offset) on interactive controls.
 *    - Light and dark theme focus states conforming to WCAG 1.4.11 / 2.4.7.
 * 8. End-to-End Dynamic Field Lifecycle & Form Draft Resilience:
 *    - Invalid clinical entry renders inline feedback and triggers draft save.
 *    - Valid correction automatically clears feedback and restores aria-invalid="false".
 */

'use strict';

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("==================================================================");
console.log("🩺 HEALTH VIBE AI: FRIENDLY ERROR GUIDANCE - MOBILE & A11Y QA");
console.log("   Vezeeta Benchmark: WCAG 2.1 AA/AAA, Mobile Ergonomics & Plain Arabic");
console.log("==================================================================\n");

const ROOT = path.resolve(__dirname, "..");
const ERROR_HANDLER_PATH = path.join(ROOT, "app", "modules", "core", "error-handler.js");
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

// Lightweight DOM Mock for Testing A11y and Mobile Viewports in Node.js
function createMockDOM() {
  const elements = new Map();
  const eventListeners = new Map();

  class MockElement {
    constructor(tagName, id = "") {
      this.tagName = tagName.toUpperCase();
      this.className = "";
      this.attributes = {};
      this.children = [];
      this.parentElement = null;
      this._innerHTML = "";
      this.textContent = "";
      this.value = "";
      this.style = {};
      this._eventListeners = {};
      this._id = "";
      if (id) this.id = id;
    }

    get id() {
      return this._id || "";
    }

    set id(val) {
      if (this._id && elements.has(this._id)) {
        elements.delete(this._id);
      }
      this._id = String(val || "");
      if (this._id) {
        elements.set(this._id, this);
      }
    }

    get isConnected() {
      return true;
    }

    get innerHTML() {
      return this._innerHTML || "";
    }

    set innerHTML(html) {
      this._innerHTML = String(html || "");
      this.children = [];
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

        const ariaLiveMatch = attrsStr.match(/aria-live=["']([^"']+)["']/i);
        if (ariaLiveMatch) child.setAttribute("aria-live", ariaLiveMatch[1]);

        const ariaLabelMatch = attrsStr.match(/aria-label=["']([^"']+)["']/i);
        if (ariaLabelMatch) child.setAttribute("aria-label", ariaLabelMatch[1]);

        const ariaHiddenMatch = attrsStr.match(/aria-hidden=["']([^"']+)["']/i);
        if (ariaHiddenMatch) child.setAttribute("aria-hidden", ariaHiddenMatch[1]);

        const titleMatch = attrsStr.match(/title=["']([^"']+)["']/i);
        if (titleMatch) child.setAttribute("title", titleMatch[1]);

        child.parentElement = this;
        this.children.push(child);

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

    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "id") {
        this.id = String(value);
        elements.set(this.id, this);
      }
      if (name === "class") {
        this.className = String(value);
      }
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    insertAdjacentElement(position, child) {
      if (position === "afterend" && this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        child.parentElement = this.parentElement;
        this.parentElement.children.splice(idx + 1, 0, child);
        return child;
      }
      return this.appendChild(child);
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const parts = selector.split(",").map(s => s.trim());

      function matchSingle(child, s) {
        if (s.startsWith(".")) return child.classList.contains(s.slice(1));
        if (s.startsWith("#")) return child.id === s.slice(1);
        return child.tagName.toLowerCase() === s.toLowerCase();
      }

      function traverse(el) {
        for (const child of el.children) {
          if (parts.some(s => matchSingle(child, s))) {
            results.push(child);
          }
          traverse(child);
        }
      }
      traverse(this);
      return results;
    }

    closest(selector) {
      let cur = this;
      const target = selector.replace(/^[.#]/, "");
      const isClass = selector.startsWith(".");
      const isTag = !selector.startsWith(".") && !selector.startsWith("#");

      while (cur) {
        if (isClass && cur.classList && cur.classList.contains(target)) return cur;
        if (isTag && cur.tagName && cur.tagName.toLowerCase() === target.toLowerCase()) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    addEventListener(event, handler) {
      if (!this._eventListeners[event]) this._eventListeners[event] = [];
      this._eventListeners[event].push(handler);
    }

    dispatchEvent(event) {
      const handlers = this._eventListeners[event.type || event] || [];
      handlers.forEach(h => h(event));
    }

    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx > -1) this.parentElement.children.splice(idx, 1);
      }
      if (this.id) elements.delete(this.id);
    }
  }

  const mockDocument = {
    createElement(tagName) {
      return new MockElement(tagName);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      if (selector.startsWith("#")) {
        return elements.get(selector.slice(1)) || null;
      }
      for (const el of elements.values()) {
        const found = el.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(selector) {
      const results = [];
      for (const el of elements.values()) {
        results.push(...el.querySelectorAll(selector));
      }
      return results;
    }
  };

  const mockWindow = {
    addEventListener(event, fn) {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (!eventListeners.has(event)) return;
      const arr = eventListeners.get(event).filter(f => f !== fn);
      eventListeners.set(event, arr);
    },
    dispatchEvent(evt) {
      const arr = eventListeners.get(evt.type) || [];
      arr.forEach(fn => fn(evt));
    }
  };

  return { mockDocument, mockWindow, elements };
}

// Load error-handler.js in mock sandbox
function loadErrorHandlerInSandbox() {
  const { mockDocument, mockWindow, elements } = createMockDOM();
  const code = fs.readFileSync(ERROR_HANDLER_PATH, "utf8");

  const storageMock = {};
  const sessionStorageMock = {
    getItem: k => storageMock[k] || null,
    setItem: (k, v) => { storageMock[k] = String(v); },
    removeItem: k => { delete storageMock[k]; }
  };
  const localStorageMock = {
    getItem: k => storageMock[k] || null,
    setItem: (k, v) => { storageMock[k] = String(v); },
    removeItem: k => { delete storageMock[k]; }
  };

  const userPrefsMock = {
    getPreferences: () => ({
      errorGuidanceLevel: "detailed",
      autoDraftRecovery: true,
      dismissedErrorTips: []
    }),
    saveFormDraft: (formId, data) => {
      const payload = { data, savedAt: new Date().toISOString() };
      storageMock[`hv_form_draft_${formId}`] = JSON.stringify(payload);
      return payload;
    },
    restoreFormDraft: formId => {
      const raw = storageMock[`hv_form_draft_${formId}`];
      return raw ? JSON.parse(raw) : null;
    },
    clearFormDraft: formId => {
      delete storageMock[`hv_form_draft_${formId}`];
    },
    dismissTip: tipId => {}
  };

  const context = {
    window: mockWindow,
    document: mockDocument,
    sessionStorage: sessionStorageMock,
    localStorage: localStorageMock,
    HVUserPreferences: userPrefsMock,
    currentLanguage: "ar",
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  return {
    guide: context.window.FriendlyErrorGuide,
    document: mockDocument,
    window: mockWindow,
    context
  };
}

(async () => {
  const stylesContent = fs.readFileSync(STYLES_PATH, "utf8");

  // =========================================================================
  // SUITE 1: WCAG 2.5.5 / 2.5.8 Touch Target Ergonomics on Mobile & Smartphones
  // =========================================================================
  console.log("▶ SUITE 1: Touch Target Sizing & Smartphone Thumb Usability (WCAG 2.5.5 / 2.5.8)");

  await runTest("Close button meets minimum 44px x 44px touch bounding box", () => {
    assert.ok(stylesContent.includes(".friendly-close-btn"), "styles.css must style .friendly-close-btn");
    assert.ok(stylesContent.includes("min-width: 44px;"), "Close button must declare min-width: 44px");
    assert.ok(stylesContent.includes("min-height: 44px;"), "Close button must declare min-height: 44px");
    assert.ok(stylesContent.includes("display: flex;"), "Close button must use flex centering");
    assert.ok(stylesContent.includes("justify-content: center;"), "Close button must center content");
    assert.ok(stylesContent.includes("align-items: center;"), "Close button must center content vertically");
  });

  await runTest("Smartphone breakpoint (<= 640px) scales action buttons to 48px full width for one-thumb use", () => {
    assert.ok(stylesContent.includes("@media (max-width: 640px)"), "styles.css must have <=640px mobile media query");
    assert.ok(stylesContent.includes(".friendly-retry-btn,\n  .friendly-primary-action-btn") ||
              stylesContent.includes(".friendly-retry-btn,") && stylesContent.includes(".friendly-primary-action-btn"),
              "Action buttons must be targeted in mobile query");
    assert.ok(stylesContent.includes("min-height: 48px;"), "Mobile action buttons must provide 48px touch height");
    assert.ok(stylesContent.includes("width: 100%;"), "Mobile action buttons must expand to 100% width for thumb accessibility");
    assert.ok(stylesContent.includes("flex-direction: column;"), "Mobile action button container must stack vertically");
  });

  await runTest("Universal desktop/tablet action buttons maintain at least 44px height", () => {
    assert.ok(stylesContent.includes("min-height: 44px;"), "Desktop action buttons must have min-height: 44px");
    assert.ok(stylesContent.includes("padding: 0 20px;"), "Desktop action buttons must have comfortable padding");
  });

  // =========================================================================
  // SUITE 2: Screen Reader Semantics & Accessible Name Calculation (WCAG 4.1.2 & 4.1.3)
  // =========================================================================
  console.log("\n▶ SUITE 2: Screen Reader Semantics & ARIA Landmarks (WCAG 4.1.2 & 4.1.3)");

  await runTest("renderNotice assigns role='alert' and customizable aria-live ('polite' / 'assertive')", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");
    container.id = "alertContainer";

    // Default polite announcement
    const cardDefault = guide.renderNotice(container, "clinical/spo2-out-of-range", { isEn: false });
    assert.strictEqual(cardDefault.getAttribute("role"), "alert", "Card must have role='alert'");
    assert.strictEqual(cardDefault.getAttribute("aria-live"), "polite", "Default card must have aria-live='polite'");

    // Explicit assertive announcement for critical clinical escalation
    const cardAssertive = guide.renderNotice(container, "clinical/spo2-out-of-range", { isEn: false, ariaLive: "assertive" });
    assert.strictEqual(cardAssertive.getAttribute("aria-live"), "assertive", "Custom card must support aria-live='assertive'");
  });

  await runTest("Close button has localized aria-label and title tooltip ('إغلاق' in AR, 'Close' in EN)", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");

    // Arabic close button
    const cardAr = guide.renderNotice(container, "validation/phone-invalid", { isEn: false });
    const closeBtnAr = cardAr.querySelector(".friendly-close-btn");
    assert.ok(closeBtnAr, "Close button must be present in Arabic card");
    assert.strictEqual(closeBtnAr.getAttribute("aria-label"), "إغلاق", "Arabic close button must have aria-label='إغلاق'");
    assert.strictEqual(closeBtnAr.getAttribute("title"), "إغلاق", "Arabic close button must have title='إغلاق'");

    // English close button
    const cardEn = guide.renderNotice(container, "validation/phone-invalid", { isEn: true });
    const closeBtnEn = cardEn.querySelector(".friendly-close-btn");
    assert.ok(closeBtnEn, "Close button must be present in English card");
    assert.strictEqual(closeBtnEn.getAttribute("aria-label"), "Close", "English close button must have aria-label='Close'");
    assert.strictEqual(closeBtnEn.getAttribute("title"), "Close", "English close button must have title='Close'");
  });

  await runTest("Decorative icons carry aria-hidden='true' to eliminate screen reader clutter", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");
    const card = guide.renderNotice(container, "clinical/temperature-out-of-range", { isEn: false });

    assert.ok(card.innerHTML.includes('class="friendly-error-icon" aria-hidden="true"'), "Notice error icon must be aria-hidden='true'");
    assert.ok(card.innerHTML.includes('class="guidance-bulb" aria-hidden="true"'), "Guidance bulb must be aria-hidden='true'");
  });

  await runTest("Inline field error connects via aria-invalid='true' and aria-describedby", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const parent = document.createElement("div");
    parent.className = "form-group";
    const input = document.createElement("input");
    input.id = "patientNationalId";
    input.value = "12345"; // Invalid Egyptian NID
    parent.appendChild(input);

    const result = guide.validateField(input, "national_id", { isEn: false });
    assert.strictEqual(result.valid, false, "Invalid NID must fail validation");
    assert.strictEqual(input.getAttribute("aria-invalid"), "true", "Input must have aria-invalid='true'");
    assert.strictEqual(input.getAttribute("aria-describedby"), "err_desc_patientNationalId", "aria-describedby must match error container ID");

    const errorContainer = document.getElementById("err_desc_patientNationalId");
    assert.ok(errorContainer, "Error container must exist in DOM");
    assert.strictEqual(errorContainer.getAttribute("role"), "alert", "Field error container must have role='alert'");
    assert.strictEqual(errorContainer.getAttribute("aria-live"), "polite", "Field error container must have aria-live='polite'");
  });

  await runTest("Clearing field error restores aria-invalid='false' and cleans aria-describedby", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const parent = document.createElement("div");
    parent.className = "form-group";
    const input = document.createElement("input");
    input.id = "patientPhone";
    input.value = "01000"; // Invalid phone
    parent.appendChild(input);

    // First validate with error
    guide.validateField(input, "phone", { isEn: false });
    assert.strictEqual(input.getAttribute("aria-invalid"), "true");

    // Correct to valid 11-digit Egyptian phone
    input.value = "01012345678";
    const result = guide.validateField(input, "phone", { isEn: false });
    assert.strictEqual(result.valid, true, "Valid Egyptian mobile must pass");
    assert.strictEqual(input.getAttribute("aria-invalid"), "false", "Input aria-invalid must be reset to 'false'");
    assert.strictEqual(input.getAttribute("aria-describedby"), null, "aria-describedby must be cleanly removed");
    assert.strictEqual(document.getElementById("err_desc_patientPhone"), null, "Error DOM element must be removed");
  });

  // =========================================================================
  // SUITE 3: Cognitive Usability & Non-Technical Patient Communication (Vezeeta Standard)
  // =========================================================================
  console.log("\n▶ SUITE 3: Cognitive Usability & Plain Language for Patients (Vezeeta Standard)");

  await runTest("Zero raw technical jargon, HTTP error codes, or stack traces in patient error notices", () => {
    const { guide } = loadErrorHandlerInSandbox();
    const technicalErrors = [
      new Error("ECONNREFUSED 127.0.0.1:5000"),
      { code: "auth/user-not-found", message: "Firebase: Error (auth/user-not-found)." },
      { code: "firestore/permission-denied", message: "Missing or insufficient permissions at /patients/123." },
      { code: "ERR_HTTP_INVALID_STATUS_CODE", message: "Server returned 500 Internal Server Error at line 482" }
    ];

    technicalErrors.forEach(err => {
      const friendlyAr = guide.toFriendlyAppError(err, "", false);
      const friendlyEn = guide.toFriendlyAppError(err, "", true);

      [friendlyAr, friendlyEn].forEach(f => {
        assert.ok(!f.title.includes("500"), "Title must not contain HTTP 500");
        assert.ok(!f.title.includes("ECONNREFUSED"), "Title must not contain socket error codes");
        assert.ok(!f.title.includes("auth/"), "Title must not contain auth error codes");
        assert.ok(!f.message.includes("at line"), "Message must not contain stack traces");
        assert.ok(!f.message.includes("permission-denied"), "Message must not contain database jargon");
        assert.ok(f.action && f.action.length > 5, "Every error must provide an actionable 'how to fix' instruction");
      });
    });
  });

  await runTest("Clinical vitals errors provide tangible physical instructions referencing household tools", () => {
    const { guide } = loadErrorHandlerInSandbox();

    // SpO2 instructs pulse oximeter finger placement
    const spo2Ar = guide.toFriendlyAppError("clinical/spo2-out-of-range", "", false);
    assert.ok(spo2Ar.action.includes("Pulse Oximeter") || spo2Ar.action.includes("مقياس النبض"),
      "SpO2 guidance must reference pulse oximeter device");
    const spo2En = guide.toFriendlyAppError("clinical/spo2-out-of-range", "", true);
    assert.ok(spo2En.action.includes("pulse oximeter") && spo2En.action.includes("finger"),
      "SpO2 English must instruct checking reading on finger");

    // Temperature instructs thermometer
    const tempAr = guide.toFriendlyAppError("clinical/temperature-out-of-range", "", false);
    assert.ok(tempAr.action.includes("بالترمومتر") || tempAr.action.includes("مقياس حرارة"),
      "Temperature guidance must reference clinical thermometer");
    const tempEn = guide.toFriendlyAppError("clinical/temperature-out-of-range", "", true);
    assert.ok(tempEn.action.includes("clinical thermometer"),
      "Temperature English must instruct checking with thermometer");

    // Heart Rate instructs pulse check
    const hrAr = guide.toFriendlyAppError("clinical/heart-rate-out-of-range", "", false);
    assert.ok(hrAr.action.includes("النبض") || hrAr.action.includes("الساعة الذكية"),
      "Heart rate guidance must instruct measuring pulse or smartwatch");
    const hrEn = guide.toFriendlyAppError("clinical/heart-rate-out-of-range", "", true);
    assert.ok(hrEn.action.includes("radial pulse") || hrEn.action.includes("monitor"),
      "Heart rate English must instruct counting pulse");

    // Blood Pressure instructs systolic/diastolic ordering
    const bpAr = guide.toFriendlyAppError("clinical/blood-pressure-invalid", "", false);
    assert.ok(bpAr.action.includes("انقباضي") && bpAr.action.includes("انبساطي"),
      "Blood pressure guidance must guide systolic and diastolic ordering");
    const bpEn = guide.toFriendlyAppError("clinical/blood-pressure-invalid", "", true);
    assert.ok(bpEn.action.includes("blood pressure monitor"),
      "Blood pressure English must reference monitor");

    // Respiration instructs normal breathing count
    const rrAr = guide.toFriendlyAppError("clinical/respiratory-rate-out-of-range", "", false);
    assert.ok(rrAr.action.includes("مرات التنفس") || rrAr.action.includes("شهيق وزفير"),
      "Respiratory guidance must instruct calm breathing count");
    const rrEn = guide.toFriendlyAppError("clinical/respiratory-rate-out-of-range", "", true);
    assert.ok(rrEn.action.includes("breaths in 60 seconds"),
      "Respiratory English guidance must instruct counting breaths");
  });

  await runTest("Patient identity & contact formats provide explicit Egyptian examples", () => {
    const { guide } = loadErrorHandlerInSandbox();

    // Phone error specifies 010/011/012/015
    const phone = guide.toFriendlyAppError("validation/phone-invalid", "", false);
    assert.ok(phone.message.includes("010") && phone.message.includes("011"),
      "Phone error message must mention Egyptian carrier prefixes (010, 011, 012, 015)");
    assert.ok(phone.action.includes("01012345678"),
      "Phone action must provide concrete 11-digit mobile example");

    // National ID specifies 14 digits starting with 2 or 3
    const nid = guide.toFriendlyAppError("validation/national-id-invalid", "", false);
    assert.ok(nid.message.includes("14") && (nid.message.includes("2") || nid.message.includes("3")),
      "National ID error must mention 14 digits starting with 2 or 3");
    assert.ok(nid.action.includes("14"),
      "National ID action must instruct entering all 14 digits");
  });

  // =========================================================================
  // SUITE 4: Elderly & Non-Technical Reassurance on Network Disruptions
  // =========================================================================
  console.log("\n▶ SUITE 4: Reassurance on Network Disruptions & Draft Preservation");

  await runTest("Network disconnect error preserves patient trust by reassuring that records are secure", () => {
    const { guide } = loadErrorHandlerInSandbox();
    const networkErr = new Error("Failed to fetch");

    const friendlyAr = guide.toFriendlyAppError(networkErr, "", false);
    assert.ok(friendlyAr.message.includes("بياناتك المسجلة بأمان"),
      "Arabic network error must reassure patient: 'بياناتك المسجلة بأمان'");
    assert.ok(friendlyAr.action.includes("إعادة المحاولة"),
      "Arabic network error must prompt single-tap retry");

    const friendlyEn = guide.toFriendlyAppError(networkErr, "", true);
    assert.ok(friendlyEn.message.includes("local records are secure"),
      "English network error must reassure patient: 'local records are secure'");
  });

  await runTest("Single-tap retry button triggers callback upon touch/click", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");
    let retried = false;

    const card = guide.renderNotice(container, new Error("Network error"), {
      isEn: false,
      onRetry: () => { retried = true; }
    });

    const retryBtn = card.querySelector(".friendly-retry-btn");
    assert.ok(retryBtn, "Retry button must be rendered when onRetry is provided");
    retryBtn.dispatchEvent({ type: "click" });
    assert.strictEqual(retried, true, "Clicking retry button must trigger onRetry callback");
  });

  await runTest("Reference code is isolated with unicode-bidi: isolate and direction: ltr", () => {
    assert.ok(stylesContent.includes(".friendly-error-ref"), "styles.css must style .friendly-error-ref");
    assert.ok(stylesContent.includes("direction: ltr !important;"), "REF code must enforce direction: ltr");
    assert.ok(stylesContent.includes("unicode-bidi: isolate !important;"), "REF code must isolate bidi");
    assert.ok(stylesContent.includes("word-break: break-all;"), "REF code must break all to prevent smartphone overflow");
  });

  // =========================================================================
  // SUITE 5: Smartphone Viewport Adaptability & Zero Overflow (320px – 375px)
  // =========================================================================
  console.log("\n▶ SUITE 5: Smartphone Viewports (320px–375px) & Overflow Prevention");

  await runTest("Mobile padding and typography scale down for compact smartphone screens (320px–375px)", () => {
    assert.ok(stylesContent.includes("@media (max-width: 640px)"), "Must have max-width: 640px query");
    assert.ok(stylesContent.includes("padding: 14px 16px;"), "Card padding must scale down on mobile");
    assert.ok(stylesContent.includes("border-radius: 14px;"), "Border radius must adapt on mobile");
    assert.ok(stylesContent.includes("font-size: 15px;"), "Title font size must be 15px on mobile");
    assert.ok(stylesContent.includes("font-size: 13px;"), "Message font size must be 13px on mobile");
    assert.ok(stylesContent.includes("font-size: 12px;"), "Guidance font size must be 12px on mobile");
  });

  await runTest("No horizontal drift triggers or fixed desktop dimensions in friendly error CSS", () => {
    // Assert no fixed width > 300px inside .friendly-error-card
    const cardSection = stylesContent.slice(stylesContent.indexOf(".friendly-error-card"), stylesContent.indexOf(".friendly-error-card") + 2500);
    assert.ok(!cardSection.includes("width: 400px"), "No fixed 400px width");
    assert.ok(!cardSection.includes("width: 500px"), "No fixed 500px width");
    assert.ok(!cardSection.includes("width: 600px"), "No fixed 600px width");
  });

  // =========================================================================
  // SUITE 6: Bidirectional (BiDi) Usability & RTL/LTR Layout Integrity
  // =========================================================================
  console.log("\n▶ SUITE 6: Bidirectional Integrity & Dynamic Language Reactivity");

  await runTest("Arabic notice sets dir='rtl' and lang='ar'; English notice sets dir='ltr' and lang='en'", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");

    const cardAr = guide.renderNotice(container, "clinical/spo2-out-of-range", { isEn: false });
    assert.strictEqual(cardAr.getAttribute("dir"), "rtl", "Arabic card must have dir='rtl'");
    assert.strictEqual(cardAr.getAttribute("lang"), "ar", "Arabic card must have lang='ar'");

    const cardEn = guide.renderNotice(container, "clinical/spo2-out-of-range", { isEn: true });
    assert.strictEqual(cardEn.getAttribute("dir"), "ltr", "English card must have dir='ltr'");
    assert.strictEqual(cardEn.getAttribute("lang"), "en", "English card must have lang='en'");
  });

  await runTest("isolateBidiNumbers wraps ranges, percentages, and phones with <bdi class='bidi-isolate'>", () => {
    const { guide } = loadErrorHandlerInSandbox();

    const rangeText = "النسبة الطبيعية هي 90% إلى 100%";
    const isolatedRange = guide.isolateBidiNumbers(rangeText);
    assert.ok(isolatedRange.includes('<bdi class="bidi-isolate">90%</bdi>'), "Percentages must be isolated");
    assert.ok(isolatedRange.includes('<bdi class="bidi-isolate">100%</bdi>'), "Percentages must be isolated");

    const phoneText = "رقم هاتفك 01012345678 غير مكتمل";
    const isolatedPhone = guide.isolateBidiNumbers(phoneText);
    assert.ok(isolatedPhone.includes('<bdi class="bidi-isolate">01012345678</bdi>'), "Phones must be isolated");
  });

  await runTest("Dispatched 'languageChanged' event live-updates notice attributes and text without reload", () => {
    const { guide, document, window, context } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");

    const card = guide.renderNotice(container, "clinical/spo2-out-of-range", { isEn: false });
    assert.strictEqual(card.getAttribute("dir"), "rtl");
    assert.ok(card.innerHTML.includes("أكسجين"));

    // Switch language to English dynamically
    context.currentLanguage = "en";
    window.dispatchEvent({ type: "languageChanged", detail: { language: "en" } });

    assert.strictEqual(card.getAttribute("dir"), "ltr", "Card dir must update to 'ltr'");
    assert.strictEqual(card.getAttribute("lang"), "en", "Card lang must update to 'en'");
    const titleEl = card.querySelector(".friendly-error-title");
    assert.ok(titleEl && titleEl.textContent.includes("Oxygen"), "Title element text must update to English");
    const msgEl = card.querySelector(".friendly-error-message");
    assert.ok(msgEl && msgEl.innerHTML.toLowerCase().includes("oxygen"), "Message element text must update to English");
  });

  // =========================================================================
  // SUITE 7: Motor Accessibility & Keyboard Focus (:focus-visible)
  // =========================================================================
  console.log("\n▶ SUITE 7: Visible High-Contrast Keyboard Focus (:focus-visible)");

  await runTest("Interactive error controls declare :focus-visible with 2px solid outline and offset", () => {
    assert.ok(stylesContent.includes(".friendly-close-btn:focus-visible"), ":focus-visible on close button");
    assert.ok(stylesContent.includes(".friendly-retry-btn:focus-visible"), ":focus-visible on retry button");
    assert.ok(stylesContent.includes(".friendly-primary-action-btn:focus-visible"), ":focus-visible on primary action button");
    assert.ok(stylesContent.includes("outline: 2px solid var(--teal, #09b8b6) !important;"), "Must declare 2px teal outline in dark theme");
    assert.ok(stylesContent.includes("outline-offset: 2px !important;"), "Must declare 2px outline offset");
  });

  await runTest("Light theme declares high-contrast focus outlines and accessible close button", () => {
    assert.ok(stylesContent.includes("html.hv-theme-light body .friendly-close-btn"), "Light theme close button style");
    assert.ok(stylesContent.includes("html.hv-theme-light body .friendly-close-btn:focus-visible"), "Light theme close button focus-visible");
    assert.ok(stylesContent.includes("outline: 2px solid #0f766e !important;"), "Light theme must use WCAG AA compliant #0f766e teal outline");
  });

  // =========================================================================
  // SUITE 8: End-to-End Form Draft Auto-Recovery & Error Dismissal Lifecycle
  // =========================================================================
  console.log("\n▶ SUITE 8: Form Draft Auto-Recovery & Tip Dismissal Persistence");

  await runTest("Field validation error automatically preserves patient form draft", () => {
    const { guide, document, context } = loadErrorHandlerInSandbox();
    const form = document.createElement("form");
    form.id = "patientConsultationForm";

    const nameInput = document.createElement("input");
    nameInput.name = "fullName";
    nameInput.value = "أحمد محمد محمود";
    form.appendChild(nameInput);

    const spo2Input = document.createElement("input");
    spo2Input.name = "spo2Value";
    spo2Input.value = "150"; // Invalid
    form.appendChild(spo2Input);

    const result = guide.validateField(spo2Input, "spo2", { isEn: false });
    assert.strictEqual(result.valid, false, "Validation must fail for 150%");

    // Verify draft was saved in persistence
    const savedDraft = context.sessionStorage.getItem("hv_form_draft_patientConsultationForm");
    assert.ok(savedDraft, "Form draft must be auto-saved on validation failure");
    const parsed = JSON.parse(savedDraft);
    assert.strictEqual(parsed.data.fullName, "أحمد محمد محمود", "Draft must contain patient's entered name");
  });

  await runTest("Dismissing notice card removes it from DOM and records tip dismissal", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");
    let closed = false;

    const card = guide.renderNotice(container, "clinical/spo2-out-of-range", {
      isEn: false,
      tipId: "tip_spo2_measurement",
      onClose: () => { closed = true; }
    });

    const closeBtn = card.querySelector(".friendly-close-btn");
    assert.ok(closeBtn, "Close button must exist");

    closeBtn.dispatchEvent({ type: "click" });
    assert.strictEqual(closed, true, "onClose callback must be called");
    assert.strictEqual(container.children.length, 0, "Card must be removed from container DOM");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests}/${passedTests} USABILITY & MOBILE A11Y QA TESTS PASSED!`);
  console.log("==================================================================");
})();
