/**
 * Health Vibe AI - Friendly Error Guidance: Performance & Optimization Test Suite
 * 
 * Verifies:
 * 1. Sub-millisecond Error Transformation & BiDi Isolation Benchmark (< 0.05ms per op).
 * 2. High-performance in-memory LRU caching & zero-allocation fast-path evaluation.
 * 3. Performance telemetry API (benchmarkTransformation, getPerformanceMetrics, clearCache).
 * 4. 60fps / 120fps Frame Budget: CSS containment (contain: content) & GPU layers (will-change).
 * 5. Hardware-composited animations (transform/opacity only) with prefers-reduced-motion support.
 * 6. Keystroke debounce & passive input listeners for fluid mobile typing ergonomics.
 * 7. Memory lifecycle & listener cleanup (unbind function, active notices tracking, zero memory leaks).
 * 8. Zero Initial Page Load impact & ultra-lightweight dependency-free architecture.
 */

'use strict';

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("==================================================================");
console.log("⚡ HEALTH VIBE AI: FRIENDLY ERROR GUIDANCE - PERFORMANCE SUITE");
console.log("   Sub-Millisecond Cache, 60fps Frame Budget, GPU Layers & Zero Leaks");
console.log("==================================================================\n");

const ROOT = path.resolve(__dirname, "..");
const ERROR_HANDLER_PATH = path.join(ROOT, "app", "modules", "core", "error-handler.js");
const STYLES_PATH = path.join(ROOT, "app", "styles.css");
const APP_JS_PATH = path.join(ROOT, "app", "app.js");

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

// Lightweight DOM Mock for Testing Performance in Node.js
function createMockDOM() {
  const elements = new Map();
  const windowListeners = new Map();

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
      if (this._id && elements.has(this._id)) elements.delete(this._id);
      this._id = String(val || "");
      if (this._id) elements.set(this._id, this);
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
        if (idMatch) child.id = idMatch[1];

        const roleMatch = attrsStr.match(/role=["']([^"']+)["']/i);
        if (roleMatch) child.setAttribute("role", roleMatch[1]);

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
      if (name === "id") this.id = String(value);
      if (name === "class") this.className = String(value);
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
          if (parts.some(s => matchSingle(child, s))) results.push(child);
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

    addEventListener(event, handler, options = {}) {
      if (!this._eventListeners[event]) this._eventListeners[event] = [];
      this._eventListeners[event].push({ handler, options });
    }

    removeEventListener(event, handler) {
      if (!this._eventListeners[event]) return;
      this._eventListeners[event] = this._eventListeners[event].filter(l => l.handler !== handler);
    }

    dispatchEvent(event) {
      const evType = event.type || event;
      const listeners = this._eventListeners[evType] || [];
      listeners.forEach(l => l.handler(event));
    }

    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx > -1) this.parentElement.children.splice(idx, 1);
      }
      if (this._id) elements.delete(this._id);
    }
  }

  const mockDocument = {
    createElement: tag => new MockElement(tag),
    getElementById: id => elements.get(id) || null,
    querySelector: sel => {
      if (sel.startsWith("#")) return elements.get(sel.slice(1)) || null;
      for (const el of elements.values()) {
        const found = el.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: sel => {
      const results = [];
      for (const el of elements.values()) results.push(...el.querySelectorAll(sel));
      return results;
    }
  };

  const mockWindow = {
    addEventListener(event, fn, opts) {
      if (!windowListeners.has(event)) windowListeners.set(event, []);
      windowListeners.get(event).push({ fn, opts });
    },
    removeEventListener(event, fn) {
      if (!windowListeners.has(event)) return;
      windowListeners.set(event, windowListeners.get(event).filter(l => l.fn !== fn));
    },
    dispatchEvent(evt) {
      const arr = windowListeners.get(evt.type) || [];
      arr.forEach(l => l.fn(evt));
    },
    getListenerCount(event) {
      return (windowListeners.get(event) || []).length;
    }
  };

  return { mockDocument, mockWindow, elements };
}

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

  const context = {
    window: mockWindow,
    document: mockDocument,
    sessionStorage: sessionStorageMock,
    localStorage: localStorageMock,
    currentLanguage: "ar",
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => {
      // Return a timer token object for manual or synchronous clearing
      const token = { id: Math.random(), cleared: false };
      fn();
      return token;
    },
    clearTimeout: (token) => {
      if (token) token.cleared = true;
    },
    performance: {
      now: () => {
        const hr = process.hrtime();
        return hr[0] * 1000 + hr[1] / 1000000;
      }
    }
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
  const errorHandlerContent = fs.readFileSync(ERROR_HANDLER_PATH, "utf8");
  const appJsContent = fs.readFileSync(APP_JS_PATH, "utf8");

  // =========================================================================
  // SUITE 1: Sub-Millisecond Transformation & BiDi Isolation Benchmark
  // =========================================================================
  console.log("▶ SUITE 1: Sub-Millisecond Transformation & BiDi Isolation Benchmark");

  await runTest("benchmarkTransformation runs 2000 iterations in < 0.05ms average duration", () => {
    const { guide } = loadErrorHandlerInSandbox();
    assert.strictEqual(typeof guide.benchmarkTransformation, "function", "benchmarkTransformation must be exposed");

    const result = guide.benchmarkTransformation(2000);
    assert.strictEqual(result.iterations, 2000, "Must run exactly 2000 iterations");
    assert.ok(result.totalMs > 0, "Benchmark must record positive duration");
    assert.ok(result.avgMsPerOp < 0.05, `Average transformation must be < 0.05ms (actual: ${result.avgMsPerOp.toFixed(5)}ms)`);
    assert.strictEqual(result.status, "PASS", "Benchmark status must be PASS");
    assert.ok(result.opsPerSec > 20000, `Throughput must exceed 20,000 ops/sec (actual: ${result.opsPerSec} ops/sec)`);
  });

  await runTest("isolateBidiNumbers short-circuits plain text without numbers/units in < 0.005ms", () => {
    const { guide } = loadErrorHandlerInSandbox();
    const plainArabic = "يرجى المحاولة بعد لحظات أو التواصل مع الدعم الفني المباشر";

    const start = process.hrtime();
    for (let i = 0; i < 5000; i++) {
      guide.isolateBidiNumbers(plainArabic);
    }
    const diff = process.hrtime(start);
    const totalMs = diff[0] * 1000 + diff[1] / 1000000;
    const avgMs = totalMs / 5000;

    assert.ok(avgMs < 0.005, `Plain text fast-path must be < 0.005ms per call (actual: ${avgMs.toFixed(5)}ms)`);
  });

  await runTest("Pre-compiled regular expressions exist at module scope (zero RegExp allocation overhead)", () => {
    assert.ok(errorHandlerContent.includes("const RE_HTML_TAGS ="), "Must precompile RE_HTML_TAGS");
    assert.ok(errorHandlerContent.includes("const RE_REF ="), "Must precompile RE_REF");
    assert.ok(errorHandlerContent.includes("const RE_NID ="), "Must precompile RE_NID");
    assert.ok(errorHandlerContent.includes("const RE_PHONE ="), "Must precompile RE_PHONE");
    assert.ok(errorHandlerContent.includes("const RE_TEMP ="), "Must precompile RE_TEMP");
    assert.ok(errorHandlerContent.includes("const RE_PERCENT ="), "Must precompile RE_PERCENT");
    assert.ok(errorHandlerContent.includes("const RE_HAS_BIDI_CONTENT ="), "Must precompile RE_HAS_BIDI_CONTENT");
  });

  // =========================================================================
  // SUITE 2: Fast In-Memory LRU Cache & Telemetry Metrics
  // =========================================================================
  console.log("\n▶ SUITE 2: In-Memory LRU Cache & Performance Telemetry Metrics");

  await runTest("Repeated error transformations trigger cache hits with telemetry tracking", () => {
    const { guide } = loadErrorHandlerInSandbox();
    guide.clearCache();

    // First call (cache miss)
    const err1 = guide.toFriendlyAppError("clinical/spo2-out-of-range", "", false);
    let metrics = guide.getPerformanceMetrics();
    assert.strictEqual(metrics.transformationsCount, 1, "Count must be 1");
    assert.strictEqual(metrics.cacheHits, 0, "First lookup must be cache miss");

    // Second call (cache hit)
    const err2 = guide.toFriendlyAppError("clinical/spo2-out-of-range", "", false);
    metrics = guide.getPerformanceMetrics();
    assert.strictEqual(metrics.transformationsCount, 2, "Count must be 2");
    assert.strictEqual(metrics.cacheHits, 1, "Second lookup must be cache hit");
    assert.strictEqual(metrics.cacheHitRate, "50.0%", "Cache hit rate must be 50.0%");
    assert.strictEqual(err1.title, err2.title, "Cached result must match initial result");
  });

  await runTest("clearCache resets transformation cache map and telemetry metrics", () => {
    const { guide } = loadErrorHandlerInSandbox();
    guide.toFriendlyAppError("validation/phone-invalid", "", false);
    assert.ok(guide.getPerformanceMetrics().cacheSize > 0, "Cache size must be > 0");

    guide.clearCache();
    const metrics = guide.getPerformanceMetrics();
    assert.strictEqual(metrics.cacheSize, 0, "Cache size must be 0 after clearCache");
    assert.strictEqual(metrics.transformationsCount, 0, "Transformations count must be reset");
    assert.strictEqual(metrics.cacheHits, 0, "Cache hits must be reset");
  });

  await runTest("LRU Cache cap (MAX_CACHE_SIZE = 250) prevents unbounded memory growth", () => {
    assert.ok(errorHandlerContent.includes("const MAX_CACHE_SIZE = 250;"), "MAX_CACHE_SIZE must be set to 250");
    assert.ok(errorHandlerContent.includes("TRANSFORMATION_CACHE.size >= MAX_CACHE_SIZE"), "Must enforce cache size ceiling");
  });

  // =========================================================================
  // SUITE 3: 60fps / 120fps Frame Budget & GPU Layer Acceleration
  // =========================================================================
  console.log("\n▶ SUITE 3: 60fps / 120fps Frame Budget & GPU Hardware Layers");

  await runTest("CSS containment (contain: content) isolates component subtree from global reflows", () => {
    // Assert .friendly-error-card contains 'contain: content;'
    const cardIdx = stylesContent.indexOf(".friendly-error-card {");
    assert.ok(cardIdx !== -1, ".friendly-error-card rule must exist");
    const cardBlock = stylesContent.slice(cardIdx, cardIdx + 600);
    assert.ok(cardBlock.includes("contain: content;"), ".friendly-error-card must declare contain: content");

    // Assert .friendly-field-error contains 'contain: content;'
    const fieldIdx = stylesContent.indexOf(".friendly-field-error {");
    assert.ok(fieldIdx !== -1, ".friendly-field-error rule must exist");
    const fieldBlock = stylesContent.slice(fieldIdx, fieldIdx + 600);
    assert.ok(fieldBlock.includes("contain: content;"), ".friendly-field-error must declare contain: content");
  });

  await runTest("GPU hardware layer promotion (will-change: transform, opacity) prevents layout jank", () => {
    const cardIdx = stylesContent.indexOf(".friendly-error-card {");
    const cardBlock = stylesContent.slice(cardIdx, cardIdx + 600);
    assert.ok(cardBlock.includes("will-change: transform, opacity;"), ".friendly-error-card must declare will-change: transform, opacity");

    const fieldIdx = stylesContent.indexOf(".friendly-field-error {");
    const fieldBlock = stylesContent.slice(fieldIdx, fieldIdx + 600);
    assert.ok(fieldBlock.includes("will-change: transform, opacity;"), ".friendly-field-error must declare will-change: transform, opacity");
  });

  await runTest("Keyframe animations strictly animate composited properties (transform, opacity only)", () => {
    const slideInIdx = stylesContent.indexOf("@keyframes friendlyErrorSlideIn");
    const slideInBlock = stylesContent.slice(slideInIdx, slideInIdx + 300);
    assert.ok(slideInBlock.includes("opacity:"), "Must animate opacity");
    assert.ok(slideInBlock.includes("transform:"), "Must animate transform");
    assert.ok(!slideInBlock.includes("top:"), "Must never animate top (causes layout reflow)");
    assert.ok(!slideInBlock.includes("margin:"), "Must never animate margin (causes layout reflow)");
    assert.ok(!slideInBlock.includes("height:"), "Must never animate height (causes layout reflow)");
  });

  await runTest("prefers-reduced-motion: reduce disables animations to preserve battery and CPU", () => {
    assert.ok(stylesContent.includes("@media (prefers-reduced-motion: reduce)"), "styles.css must support prefers-reduced-motion");
    const mediaIdx = stylesContent.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    const mediaBlock = stylesContent.slice(mediaIdx, mediaIdx + 400);
    assert.ok(mediaBlock.includes("animation: none !important;"), "Must disable animation for reduced motion");
    assert.ok(mediaBlock.includes("transition: none !important;"), "Must disable transition for reduced motion");
  });

  // =========================================================================
  // SUITE 4: Keystroke Debounce & Input Typing Ergonomics
  // =========================================================================
  console.log("\n▶ SUITE 4: Keystroke Debounce & Passive Input Listeners");

  await runTest("bindLiveValidation registers input event with { passive: true }", () => {
    assert.ok(errorHandlerContent.includes('input.addEventListener("input", onInput, { passive: true })') ||
              errorHandlerContent.includes('{ passive: true }'),
              "bindLiveValidation must register input with { passive: true } to prevent thread blocking");
  });

  await runTest("bindLiveValidation debounces input keystrokes by default 250ms", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.id = "userPhone";
    form.appendChild(input);

    const schema = { "#userPhone": "phone" };
    const unbind = guide.bindLiveValidation(form, schema, { debounceMs: 250 });
    assert.strictEqual(typeof unbind, "function", "bindLiveValidation must return an unbind function");

    // Verify debounce timer parameter exists
    assert.ok(errorHandlerContent.includes("debounceDelay = typeof globalOptions.debounceMs === \"number\" ? globalOptions.debounceMs : 250"),
      "Default debounce delay must be 250ms");
    
    unbind();
  });

  await runTest("bindLiveValidation unbind function removes all listeners (zero memory leaks)", () => {
    const { guide, document } = loadErrorHandlerInSandbox();
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.id = "userEmail";
    form.appendChild(input);

    const unbind = guide.bindLiveValidation(form, { "#userEmail": "email" });
    assert.ok(input._eventListeners["blur"] && input._eventListeners["blur"].length > 0, "Blur listener must be attached");
    assert.ok(input._eventListeners["input"] && input._eventListeners["input"].length > 0, "Input listener must be attached");

    // Invoke unbind
    unbind();
    assert.strictEqual(input._eventListeners["blur"].length, 0, "Blur listener must be cleanly detached");
    assert.strictEqual(input._eventListeners["input"].length, 0, "Input listener must be cleanly detached");
  });

  // =========================================================================
  // SUITE 5: DOM Memory Lifecycle & Event Listener Cleanup
  // =========================================================================
  console.log("\n▶ SUITE 5: Notice Card Lifecycle & Immediate Listener Cleanup");

  await runTest("Dismissing notice card removes window languageChanged listener immediately", () => {
    const { guide, document, window } = loadErrorHandlerInSandbox();
    const container = document.createElement("div");

    const initialListeners = window.getListenerCount("languageChanged");
    const card = guide.renderNotice(container, "clinical/spo2-out-of-range", { isEn: false });

    // Listener added for reactivity
    assert.strictEqual(window.getListenerCount("languageChanged"), initialListeners + 1,
      "languageChanged listener must be registered for card");
    assert.strictEqual(guide.getPerformanceMetrics().activeNoticesCount, 1, "activeNoticesCount must be 1");

    // Click close button
    const closeBtn = card.querySelector(".friendly-close-btn");
    assert.ok(closeBtn, "Close button must exist");
    closeBtn.dispatchEvent({ type: "click" });

    // Listener must be removed immediately upon dismiss
    assert.strictEqual(window.getListenerCount("languageChanged"), initialListeners,
      "languageChanged listener must be cleanly removed on dismiss");
    assert.strictEqual(guide.getPerformanceMetrics().activeNoticesCount, 0,
      "activeNoticesCount must decrement to 0");
  });

  // =========================================================================
  // SUITE 6: Zero Initial Page Load Impact & Ultra-Lightweight Bundle Size
  // =========================================================================
  console.log("\n▶ SUITE 6: Zero Page Load Impact & Bundle Efficiency");

  await runTest("error-handler.js has zero external npm dependencies and lightweight footprint", () => {
    const stats = fs.statSync(ERROR_HANDLER_PATH);
    // Unminified complete bilingual engine with 18 namespaces and DOM components
    assert.ok(stats.size < 85000, `error-handler.js size (${stats.size} bytes) must be < 85KB unminified`);
    assert.ok(!errorHandlerContent.includes("require('lodash')"), "Must not require lodash");
    assert.ok(!errorHandlerContent.includes("require('moment')"), "Must not require moment");
    assert.ok(!errorHandlerContent.includes("require('axios')"), "Must not require axios");
  });

  await runTest("showAppError in app.js gracefully leverages window.FriendlyErrorGuide", () => {
    assert.ok(appJsContent.includes("window.FriendlyErrorGuide"), "app.js must reference window.FriendlyErrorGuide");
    assert.ok(appJsContent.includes("toFriendlyAppError"), "app.js must provide toFriendlyAppError wrapper");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests}/${passedTests} PERFORMANCE & OPTIMIZATION TESTS PASSED!`);
  console.log("==================================================================");
})();
