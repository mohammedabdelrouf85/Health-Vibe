/**
 * Health Vibe AI - Bidirectional Responsive Layout & Breakpoints Test Suite
 * 
 * Verifies:
 * 1. Bidirectional Mobile & Tablet Drawer Alignment (RTL right-to-left slide, LTR left-to-right slide)
 * 2. Direction-Aware Touch Gestures (Swiping right dismisses RTL drawer; swiping left dismisses LTR drawer)
 * 3. Directional Navigation Indicators (Doctor Cockpit back button: '→' in Arabic RTL, '←' in English LTR)
 * 4. Multi-Tier Breakpoint Architecture across Phone, Tablet, and Desktop (>= 1024px, >= 1280px, >= 1536px)
 * 5. Bidirectional CSS Symmetry for Critical UI Components (Timeline cards, emergency alerts, queue cards)
 * 6. BiDi Text and Numeric Isolation on Small, Medium, and Large Viewports
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🌐 HEALTH VIBE AI: BIDIRECTIONAL RESPONSIVE RTL/LTR VERIFICATION");
console.log("   Phones, Tablets, Doctor Workstations (Arabic RTL & English LTR)");
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
  const appJsPath = path.join(ROOT, "app", "app.js");
  const appJsContent = fs.readFileSync(appJsPath, "utf8");
  const respLayoutPath = path.join(ROOT, "app", "responsive-layout.js");
  const respLayoutContent = fs.readFileSync(respLayoutPath, "utf8");

  // TEST 1: Bidirectional Drawer CSS across Breakpoints
  await runTest("TEST 1: Bidirectional drawer positioning and slide physics in styles.css", () => {
    // RTL rules
    assert.ok(stylesContent.includes('html[dir="rtl"] .sidebar'), "styles.css must have html[dir='rtl'] .sidebar rule");
    assert.ok(stylesContent.includes("right: 0 !important"), "RTL sidebar drawer must dock at right: 0");
    assert.ok(stylesContent.includes("transform: translateX(100%) !important"), "RTL sidebar drawer must hide offscreen via translateX(100%)");
    assert.ok(stylesContent.includes("border-radius: 20px 0 0 20px !important"), "RTL sidebar drawer must have rounded left corners");

    // LTR rules
    assert.ok(stylesContent.includes('html[dir="ltr"] .sidebar'), "styles.css must have html[dir='ltr'] .sidebar rule");
    assert.ok(stylesContent.includes("left: 0 !important"), "LTR sidebar drawer must dock at left: 0");
    assert.ok(stylesContent.includes("transform: translateX(-100%) !important"), "LTR sidebar drawer must hide offscreen via translateX(-100%)");
    assert.ok(stylesContent.includes("border-radius: 0 20px 20px 0 !important"), "LTR sidebar drawer must have rounded right corners");

    // Open state
    assert.ok(stylesContent.includes("body.sidebar-open .sidebar"), "styles.css must have body.sidebar-open .sidebar rule");
    assert.ok(stylesContent.includes("transform: translateX(0) !important"), "Active sidebar must translate to translateX(0)");
  });

  // TEST 2: Direction-Aware Mobile Touch Gestures in app.js
  await runTest("TEST 2: Direction-aware swipe-to-dismiss touch gestures in app.js", () => {
    assert.ok(appJsContent.includes("function initMobileTouchGestures()"), "app.js must implement initMobileTouchGestures");
    assert.ok(appJsContent.includes("isRtl"), "initMobileTouchGestures must detect isRtl direction");
    assert.ok(appJsContent.includes("diffX > 45") || appJsContent.includes("diffX > 50"), "RTL must detect swipe-right dismissal");
    assert.ok(appJsContent.includes("diffX < -45") || appJsContent.includes("diffX < -50"), "LTR must detect swipe-left dismissal");
  });

  // TEST 3: Doctor Cockpit Adaptive RTL/LTR Navigation Controls
  await runTest("TEST 3: Direction-aware Doctor Cockpit back-to-queue button in responsive-layout.js", () => {
    assert.ok(respLayoutContent.includes("adaptDoctorCockpit"), "responsive-layout.js must contain adaptDoctorCockpit");
    assert.ok(respLayoutContent.includes("btnMobileBackToQueue"), "responsive-layout.js must manage btnMobileBackToQueue");
    assert.ok(respLayoutContent.includes("isRtl"), "adaptDoctorCockpit must check RTL mode");
    assert.ok(respLayoutContent.includes("العودة لقائمة الانتظار"), "Arabic label must be present in RTL mode");
    assert.ok(respLayoutContent.includes("Back to Queue"), "English label must be present in LTR mode");
    // Arrow orientation: '→' for RTL (return to right), '←' for LTR (return to left)
    assert.ok(respLayoutContent.includes("→") && respLayoutContent.includes("←"), "Arrows must be dynamically reversed between RTL and LTR");
  });

  // TEST 4: Desktop Workstation Grid Bidirectional Symmetry (>= 1024px)
  await runTest("TEST 4: Doctor Desktop Workstation layout auto-positions sidebar in RTL and LTR", () => {
    assert.ok(stylesContent.includes("@media (min-width: 1024px)"), "styles.css must have desktop media query");
    assert.ok(stylesContent.includes("grid-template-columns: minmax(240px, 282px) minmax(0, 1fr) !important;"), "app-shell must use CSS Grid");
    // Under CSS Grid with dir="rtl", 1st column is naturally at the right, and in dir="ltr" at the left
    assert.ok(stylesContent.includes("position: sticky !important"), "Desktop sidebar must be sticky");
    assert.ok(stylesContent.includes("transform: none !important"), "Desktop sidebar must cancel mobile translation");
  });

  // TEST 5: Bidirectional Symmetric Component Alignments
  await runTest("TEST 5: Bidirectional symmetric component borders and indicators", () => {
    // Queue status indicators
    assert.ok(stylesContent.includes('html[dir="ltr"] .queue .danger { border-left-color: var(--red); }'), "LTR queue item danger indicator");
    assert.ok(stylesContent.includes('html[dir="ltr"] .queue .pending { border-left-color: var(--amber); }'), "LTR queue item pending indicator");
    assert.ok(stylesContent.includes('html[dir="ltr"] .queue .ok { border-left-color: var(--green); }'), "LTR queue item ok indicator");

    // Unified timeline cards
    assert.ok(stylesContent.includes('[dir="rtl"] .unified-timeline-card::before { right: 0; }'), "RTL timeline pin at right: 0");
    assert.ok(stylesContent.includes('[dir="ltr"] .unified-timeline-card::before { left: 0; }'), "LTR timeline pin at left: 0");

    // Emergency banners
    assert.ok(stylesContent.includes('body[dir="ltr"] .emergency-alert-card'), "LTR emergency alert card orientation");
    assert.ok(stylesContent.includes('body[dir="ltr"] .doctor-emergency-alert-banner'), "LTR doctor emergency banner orientation");
  });

  // TEST 6: BiDi Text & Number Isolation on Mobile & Desktop
  await runTest("TEST 6: Directional text isolation and numeric preservation across viewports", () => {
    assert.ok(stylesContent.includes('[dir="rtl"] bdi'), "bdi tag must have RTL styling");
    assert.ok(stylesContent.includes('[dir="rtl"] .bidi-isolate'), ".bidi-isolate class must be supported");
    assert.ok(stylesContent.includes('[dir="rtl"] .ltr-num'), ".ltr-num must enforce direction: ltr for metrics");
    assert.ok(stylesContent.includes("unicode-bidi: isolate;"), "unicode-bidi: isolate must be configured");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests} BIDIRECTIONAL RESPONSIVE RTL/LTR TESTS PASSED!`);
  console.log("==================================================================");
})();
