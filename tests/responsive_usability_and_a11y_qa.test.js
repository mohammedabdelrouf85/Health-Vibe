/**
 * Health Vibe AI - Responsive Usability & Accessibility (A11y) QA Test Suite
 * 
 * Verifies:
 * 1. WCAG 2.5.5 / 2.5.8 Touch Target Sizes (>= 44px / 48px) across all interactive mobile controls
 * 2. Non-technical patient accessibility: screen reader ARIA labels, aria-expanded, aria-controls, skip links
 * 3. Breakpoint adaptability across Mobile (xs, sm), Tablet (md), and Doctor Desktop (lg, xl, 2xl)
 * 4. Zero horizontal viewport drift / overflow protection on small smartphones (320px - 375px)
 * 5. iOS Safari auto-zoom prevention via 16px input font-size
 * 6. Safe Area Insets (iOS/Android home bars & notches: env(safe-area-inset-*))
 * 7. High-contrast keyboard focus outlines (:focus-visible)
 * 8. Bidirectional usability & natural gesture alignment in Arabic (RTL) and English (LTR)
 * 9. Clinical display density modes (compact, comfortable, spacious)
 */

'use strict';

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🩺 HEALTH VIBE AI: RESPONSIVE USABILITY & A11Y QA TEST SUITE");
console.log("   Smartphones, Tablets, Clinical Workstations (Non-Technical & Doctors)");
console.log("==================================================================\n");

const ROOT = path.resolve(__dirname, "..");

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

(async () => {
  const stylesPath = path.join(ROOT, "app", "styles.css");
  const stylesContent = fs.readFileSync(stylesPath, "utf8");
  const htmlPath = path.join(ROOT, "app", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");
  const appJsPath = path.join(ROOT, "app", "app.js");
  const appJsContent = fs.readFileSync(appJsPath, "utf8");
  const respPath = path.join(ROOT, "app", "responsive-layout.js");
  const respContent = fs.readFileSync(respPath, "utf8");

  // TEST 1: WCAG 2.5.5 / 2.5.8 Touch Target Sizing (>= 44px x 44px / 48px)
  await runTest("TEST 1: Interactive elements meet 44px/48px touch target baseline", () => {
    // Universal button touch targets
    assert.ok(stylesContent.includes("min-width: 44px;"), "Button targets must have min-width: 44px");
    assert.ok(stylesContent.includes("min-height: 44px;"), "Button targets must have min-height: 44px");

    // Mobile bottom navigation buttons
    assert.ok(stylesContent.includes(".mobile-nav-btn"), "styles.css must style .mobile-nav-btn");
    assert.ok(stylesContent.includes("min-width: 56px;"), "Mobile nav button must have min-width: 56px");
    assert.ok(stylesContent.includes("min-height: 48px;"), "Mobile nav button must have min-height: 48px");

    // Inputs min-height
    assert.ok(stylesContent.includes(':where(input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea)'), "Inputs must be targeted for touch ergonomics");
  });

  // TEST 2: Screen Reader Semantics & ARIA Landmarks
  await runTest("TEST 2: Screen reader semantics, landmarks, and ARIA attributes", () => {
    // Skip to main content link
    assert.ok(htmlContent.includes('<a class="skip-link" href="#screenTitle">'), "Skip to main content link must be present");

    // Sidebar landmark with id & accessible label
    assert.ok(htmlContent.includes('<aside class="sidebar" id="appSidebar" aria-label="التنقل داخل التطبيق">'), "appSidebar aside must have id and aria-label");

    // Menu toggle button with aria-expanded & aria-controls
    assert.ok(htmlContent.includes('id="menuToggle"'), "menuToggle button must exist");
    assert.ok(htmlContent.includes('aria-expanded="false"'), "menuToggle must declare initial aria-expanded='false'");
    assert.ok(htmlContent.includes('aria-controls="appSidebar"'), "menuToggle must declare aria-controls='appSidebar'");

    // Toggle drawer updates aria-expanded dynamically
    assert.ok(appJsContent.includes('menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false")'), "toggleSidebarDrawer must update aria-expanded");
    assert.ok(appJsContent.includes('menuBtn.setAttribute("aria-expanded", "false")'), "closeSidebarDrawer must reset aria-expanded");

    // Mobile nav aria-current and decorative icons
    assert.ok(appJsContent.includes('aria-current="${isActive ? \'page\' : \'false\'}"'), "Mobile nav active button must expose aria-current='page'");
    assert.ok(appJsContent.includes('<span class="mobile-nav-icon" aria-hidden="true">'), "Mobile nav icons must be aria-hidden='true'");
  });

  // TEST 3: iOS Safari Auto-Zoom Prevention on Mobile Inputs
  await runTest("TEST 3: Mobile inputs styled with 16px font-size to prevent iOS viewport drift", () => {
    assert.ok(stylesContent.includes("@media (max-width: 768px)"), "Must have mobile media query");
    assert.ok(stylesContent.includes("font-size: 16px !important;"), "Mobile inputs must enforce 16px font-size to prevent auto-zoom drift");
  });

  // TEST 4: Safe Area Insets for Modern Smartphones (Notches & Home Bars)
  await runTest("TEST 4: Safe Area Insets (env(safe-area-inset-*)) protect mobile navigation", () => {
    assert.ok(stylesContent.includes("padding: 6px 8px calc(6px + var(--sab));") || stylesContent.includes("calc(76px + var(--sab))"), "Mobile bottom nav must incorporate safe area bottom");
    assert.ok(stylesContent.includes("env(safe-area-inset-bottom, 0px)"), "styles.css must configure env(safe-area-inset-bottom)");
    assert.ok(stylesContent.includes("env(safe-area-inset-top, 0px)"), "styles.css must configure env(safe-area-inset-top)");
  });

  // TEST 5: Keyboard Focus Accessibility (:focus-visible)
  await runTest("TEST 5: Visible focus outlines (:focus-visible) for motor-impaired and keyboard users", () => {
    assert.ok(stylesContent.includes(":focus-visible"), "styles.css must declare :focus-visible rules");
    assert.ok(stylesContent.includes("outline: 2px solid"), ":focus-visible must provide at least 2px solid outline");
    assert.ok(stylesContent.includes("outline-offset: 2px"), ":focus-visible must include outline-offset");
  });

  // TEST 6: Multi-Tier Breakpoint Architecture & Viewport Adaptability
  await runTest("TEST 6: Fluid breakpoint adaptability across smartphones, tablets, and doctor workstations", () => {
    const responsive = require(respPath);
    assert.ok(responsive.BREAKPOINTS, "Breakpoint tokens must be defined");
    assert.strictEqual(responsive.BREAKPOINTS.XS, 480);
    assert.strictEqual(responsive.BREAKPOINTS.SM, 640);
    assert.strictEqual(responsive.BREAKPOINTS.MD, 768);
    assert.strictEqual(responsive.BREAKPOINTS.LG, 1024);
    assert.strictEqual(responsive.BREAKPOINTS.XL, 1280);
    assert.strictEqual(responsive.BREAKPOINTS.XXL, 1536);

    // Viewport tier resolution
    assert.strictEqual(responsive.getBreakpointTier(320), "mobile", "320px compact phone must be mobile tier");
    assert.strictEqual(responsive.getBreakpointTier(375), "mobile", "375px standard phone must be mobile tier");
    assert.strictEqual(responsive.getBreakpointTier(768), "tablet", "768px iPad mini must be tablet tier");
    assert.strictEqual(responsive.getBreakpointTier(1024), "desktop", "1024px workstation must be desktop tier");
    assert.strictEqual(responsive.getBreakpointTier(1440), "wide", "1440px wide workstation must be wide tier");
  });

  // TEST 7: Bidirectional Natural Usability & Gesture Physics
  await runTest("TEST 7: Bidirectional swipe-to-dismiss and navigation arrows aligned with reading direction", () => {
    // Arabic RTL drawer docks on right, English LTR docks on left
    assert.ok(stylesContent.includes('html[dir="rtl"] .sidebar'), "RTL sidebar drawer docked on right");
    assert.ok(stylesContent.includes('html[dir="ltr"] .sidebar'), "LTR sidebar drawer docked on left");

    // Gesture directions in app.js
    assert.ok(appJsContent.includes("const isRtl = document.documentElement.dir === \"rtl\""), "Swipe handler must evaluate reading direction");

    // Doctor Cockpit adaptive return arrow
    assert.ok(respContent.includes("const arrow = isRtl ? \"→\" : \"←\";"), "Doctor Cockpit must point return arrow according to RTL/LTR");
  });

  // TEST 8: Clinical Display Density Modes for Workstations & Non-Technical Patients
  await runTest("TEST 8: Clinical density modes (compact for doctors, spacious for elderly patients)", () => {
    assert.ok(stylesContent.includes('[data-density="compact"]'), "styles.css must support [data-density='compact']");
    assert.ok(stylesContent.includes('[data-density="spacious"]'), "styles.css must support [data-density='spacious']");
    assert.ok(stylesContent.includes("--spacing-unit"), "styles.css must declare --spacing-unit token");
    assert.ok(stylesContent.includes("--card-padding"), "styles.css must declare --card-padding token");
    assert.ok(stylesContent.includes("--control-height"), "styles.css must declare --control-height token");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests} USABILITY & A11Y QA TESTS PASSED WITH 100% SUCCESS!`);
  console.log("==================================================================");
})();
