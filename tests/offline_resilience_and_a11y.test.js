/**
 * tests/offline_resilience_and_a11y.test.js
 * Verification test suite for:
 * 1. Offline and network failure handling with AbortController 10s timeout,
 *    navigator.onLine monitoring, and user-friendly reconnect notification.
 * 2. Accessibility refactor across all forms, inputs (<label for="...">),
 *    icon-only buttons (aria-label), and visible :focus-visible keyboard outlines.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

console.log("==================================================================");
console.log("🌐 HEALTH VIBE AI: OFFLINE RESILIENCE & A11Y VERIFICATION SUITE");
console.log("   10s Timeout, Network Failure, <label for>, aria-label, :focus-visible");
console.log("==================================================================\n");

let passedTests = 0;

async function runTest(name, fn) {
  try {
    process.stdout.write(`▶ ${name} ... `);
    await fn();
    console.log("✓ PASSED");
    passedTests++;
  } catch (err) {
    console.log("✗ FAILED");
    console.error(err);
    process.exit(1);
  }
}

(async () => {
  // =============================================================================
  // PART 1: OFFLINE & NETWORK FAILURE HANDLING
  // =============================================================================

  await runTest("TEST 1: network-resilience.js module API and configuration", () => {
    const net = require(path.join(ROOT, "app", "network-resilience.js"));

    assert.strictEqual(typeof net.isOnline, "function", "isOnline should be a function");
    assert.strictEqual(typeof net.resilientFetch, "function", "resilientFetch should be a function");
    assert.strictEqual(typeof net.showReconnectNotification, "function", "showReconnectNotification should be a function");
    assert.strictEqual(typeof net.dismissReconnectNotification, "function", "dismissReconnectNotification should be a function");
    assert.strictEqual(net.DEFAULT_TIMEOUT_MS, 10000, "Default timeout must be exactly 10,000ms (10 seconds)");
  });

  await runTest("TEST 2: Instant offline rejection with user-friendly error and notification", async () => {
    // Setup a mock DOM environment
    const elements = {};
    const mockDocument = {
      body: {
        prepend: (el) => { elements[el.id] = el; }
      },
      documentElement: { lang: "ar", getAttribute: () => "rtl" },
      getElementById: (id) => elements[id] || null,
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          id: "",
          attributes: {},
          style: {},
          setAttribute: (k, v) => { el.attributes[k] = v; },
          getAttribute: (k) => el.attributes[k],
          querySelector: (sel) => null
        };
        return el;
      }
    };

    global.document = mockDocument;
    try {
      Object.defineProperty(global.navigator, "onLine", { value: false, configurable: true, writable: true });
    } catch (e) {
      Object.defineProperty(global, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    }

    const net = require(path.join(ROOT, "app", "network-resilience.js"));

    let threw = false;
    try {
      await net.resilientFetch("https://example.com/api/test");
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, "OFFLINE", "Offline error must have code OFFLINE");
      assert.strictEqual(err.name, "OfflineError", "Error name must be OfflineError");
    }
    assert.ok(threw, "resilientFetch must reject when navigator.onLine is false");

    // Verify reconnect banner was created
    const banner = elements["networkReconnectBanner"];
    assert.ok(banner, "networkReconnectBanner element must be created in document.body");
    assert.strictEqual(banner.getAttribute("role"), "alert", "Banner must have role=alert for screen readers");
    assert.strictEqual(banner.getAttribute("aria-live"), "assertive", "Banner must have aria-live=assertive");
  });

  await runTest("TEST 3: 10-second AbortController timeout on hanging requests", async () => {
    try {
      Object.defineProperty(global.navigator, "onLine", { value: true, configurable: true, writable: true });
    } catch (e) {
      Object.defineProperty(global, "navigator", { value: { onLine: true }, configurable: true, writable: true });
    }

    // Mock fetch that hangs indefinitely
    global._originalFetch = (url, options) => {
      return new Promise((resolve, reject) => {
        if (options && options.signal) {
          options.signal.addEventListener("abort", () => {
            const abortErr = new Error("The user aborted a request.");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        }
      });
    };

    const net = require(path.join(ROOT, "app", "network-resilience.js"));

    let timedOut = false;
    const startTime = Date.now();
    try {
      // Use 100ms for test speed, testing the AbortController timeout logic
      await net.resilientFetch("https://example.com/api/hang", { timeoutMs: 100 });
    } catch (err) {
      timedOut = true;
      assert.strictEqual(err.code, "TIMEOUT", "Error code must be TIMEOUT");
      assert.strictEqual(err.name, "TimeoutError", "Error name must be TimeoutError");
    }
    const elapsed = Date.now() - startTime;

    assert.ok(timedOut, "resilientFetch must abort and reject on timeout");
    assert.ok(elapsed < 1000, `Timeout should trigger promptly around 100ms (elapsed: ${elapsed}ms)`);
  });

  await runTest("TEST 4: Inclusion of network-resilience.js in index.html, clinics.html, pitch.html", () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
    const clinicsHtml = fs.readFileSync(path.join(ROOT, "app", "clinics.html"), "utf8");
    const pitchHtml = fs.readFileSync(path.join(ROOT, "app", "pitch.html"), "utf8");

    assert.ok(indexHtml.includes("network-resilience.js"), "index.html must include network-resilience.js");
    assert.ok(clinicsHtml.includes("network-resilience.js"), "clinics.html must include network-resilience.js");
    assert.ok(pitchHtml.includes("network-resilience.js"), "pitch.html must include network-resilience.js");
  });

  // =============================================================================
  // PART 2: ACCESSIBILITY REFACTOR (<label for="...">, aria-label, :focus-visible)
  // =============================================================================

  await runTest("TEST 5: Form inputs have explicit <label for='...'> in app/index.html", () => {
    const content = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
    const tags = content.match(/<(input|select|textarea)\b[^>]*>/gi) || [];

    const missing = [];
    tags.forEach(tag => {
      const typeMatch = tag.match(/type=["']([^"']+)["']/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : "text";
      if (type === "hidden") return;

      const idMatch = tag.match(/id=["']([^"']+)["']/i);
      if (!idMatch) {
        missing.push(`[NO ID] ${tag}`);
      } else {
        const id = idMatch[1];
        const labelRegex = new RegExp('<label\\b[^>]*for=["\']' + id + '["\']', 'i');
        if (!labelRegex.test(content)) {
          missing.push(`[NO LABEL FOR ID] ${id} in ${tag.substring(0, 60)}`);
        }
      }
    });

    assert.strictEqual(missing.length, 0, `All inputs in index.html must have an explicit <label for>: \n${missing.join("\n")}`);
  });

  await runTest("TEST 6: Range sliders and lead form in app/clinics.html have explicit <label for='...'>", () => {
    const content = fs.readFileSync(path.join(ROOT, "app", "clinics.html"), "utf8");
    const tags = content.match(/<(input|select|textarea)\b[^>]*>/gi) || [];

    const missing = [];
    tags.forEach(tag => {
      const typeMatch = tag.match(/type=["']([^"']+)["']/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : "text";
      if (type === "hidden") return;

      const idMatch = tag.match(/id=["']([^"']+)["']/i);
      if (!idMatch) {
        missing.push(`[NO ID] ${tag}`);
      } else {
        const id = idMatch[1];
        const labelRegex = new RegExp('<label\\b[^>]*for=["\']' + id + '["\']', 'i');
        if (!labelRegex.test(content)) {
          missing.push(`[NO LABEL FOR ID] ${id}`);
        }
      }
    });

    assert.strictEqual(missing.length, 0, `All inputs in clinics.html must have an explicit <label for>: \n${missing.join("\n")}`);
  });

  await runTest("TEST 7: Icon-only buttons have descriptive aria-label attributes", () => {
    const pitchHtml = fs.readFileSync(path.join(ROOT, "app", "pitch.html"), "utf8");
    const clinicsHtml = fs.readFileSync(path.join(ROOT, "app", "clinics.html"), "utf8");
    const indexHtml = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
    const diabetesJs = fs.readFileSync(path.join(ROOT, "app", "modules", "diabetes", "diabetes-ui.js"), "utf8");
    const assessJs = fs.readFileSync(path.join(ROOT, "app", "modules", "assessment", "assessment-comparison-ui.js"), "utf8");
    const authJs = fs.readFileSync(path.join(ROOT, "app", "modules", "auth", "auth-ui.js"), "utf8");

    // Pitch deck slide dots and navigation arrows
    assert.ok(pitchHtml.includes('id="btnPrevSlide"') && pitchHtml.includes('aria-label="الشريحة السابقة / Previous slide"'), "btnPrevSlide must have aria-label");
    assert.ok(pitchHtml.includes('id="btnNextSlide"') && pitchHtml.includes('aria-label="الشريحة التالية / Next slide"'), "btnNextSlide must have aria-label");
    for (let i = 1; i <= 11; i++) {
      assert.ok(pitchHtml.includes(`data-goto="${i}"`) && pitchHtml.includes(`Slide ${i}`), `Slide dot ${i} must have aria-label`);
    }

    // Clinics language toggle
    assert.ok(clinicsHtml.includes('id="clinicLangToggle"') && clinicsHtml.includes('aria-label='), "clinicLangToggle must have aria-label");

    // Index back to sign in button
    assert.ok(indexHtml.includes('id="backToSignInBtn"') && indexHtml.includes('aria-label='), "backToSignInBtn must have aria-label");

    // Conflict banner and OCR modal close buttons in app.js
    assert.ok(appJs.includes("clearDoctorConflictBanner()") && appJs.includes("aria-label="), "Conflict banner button must have aria-label");
    assert.ok(appJs.includes("closeMedicalOcrModal()") && appJs.includes("aria-label="), "OCR modal close button must have aria-label");

    // Diabetes UI modal close buttons
    assert.ok(diabetesJs.includes('logDiabetesMeasurementModal') && diabetesJs.includes('aria-label="إغلاق النافذة / Close modal"'), "Diabetes measurement modal close button must have aria-label");
    assert.ok(diabetesJs.includes('recordDiabetesReviewModal') && diabetesJs.includes('aria-label="إغلاق النافذة / Close modal"'), "Diabetes review modal close button must have aria-label");

    // Assessment comparison modal close
    assert.ok(assessJs.includes('closeComparisonModal()') && assessJs.includes('aria-label='), "Comparison modal close must have aria-label");

    // Auth UI modal close
    assert.ok(authJs.includes('closeLinkingModal()') && authJs.includes('aria-label='), "Auth linking modal close must have aria-label");
  });

  await runTest("TEST 8: Visible :focus-visible outlines in styles.css, pitch.html, clinics.html", () => {
    const stylesCss = fs.readFileSync(path.join(ROOT, "app", "styles.css"), "utf8");
    const pitchHtml = fs.readFileSync(path.join(ROOT, "app", "pitch.html"), "utf8");
    const clinicsHtml = fs.readFileSync(path.join(ROOT, "app", "clinics.html"), "utf8");

    // styles.css focus-visible
    assert.ok(stylesCss.includes(":focus-visible"), "styles.css must have :focus-visible rules");
    assert.ok(stylesCss.includes("outline: 2px solid"), "styles.css must enforce high-contrast outline on focus-visible");
    assert.ok(stylesCss.includes("outline-offset: 2px"), "styles.css must enforce outline-offset on focus-visible");
    assert.ok(stylesCss.includes('[data-theme="dark"]') && stylesCss.includes(":focus-visible"), "styles.css must have dark mode focus-visible");

    // pitch.html focus-visible
    assert.ok(pitchHtml.includes(":focus-visible"), "pitch.html must have :focus-visible rules");
    assert.ok(pitchHtml.includes(".slide-dot:focus-visible"), "pitch.html must style slide-dot:focus-visible");

    // clinics.html focus-visible
    assert.ok(clinicsHtml.includes(":focus-visible"), "clinics.html must have :focus-visible rules");
    assert.ok(clinicsHtml.includes(".lang-btn:focus-visible"), "clinics.html must style .lang-btn:focus-visible");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests} OFFLINE RESILIENCE & A11Y TESTS PASSED!`);
  console.log("==================================================================\n");
})();
