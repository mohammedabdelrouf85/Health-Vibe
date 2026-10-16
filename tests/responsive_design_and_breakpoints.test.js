/**
 * Health Vibe AI - Responsive Design & Breakpoints Test Suite
 * 
 * Verifies:
 * 1. Standardized Breakpoint CSS Custom Properties in styles.css (:root)
 * 2. Media queries covering Mobile (< 768px / < 640px), Tablet (768px - 1023px), Doctor Desktop (>= 1024px), Wide (>= 1280px, >= 1536px)
 * 3. Doctor Module multi-tier responsive layouts in doctor.css (wide, high-res, tablet, mobile stack)
 * 4. Patient Module responsive layouts in patient.css
 * 5. Appointments Module responsive slot chips & grid in appointments.css
 * 6. Assessment Module responsive form layouts in assessment.css
 * 7. Reports Module responsive padding & card layouts in reports.css
 * 8. Responsive Layout Component API (responsive-layout.js)
 * 9. Script inclusion in app/index.html and app.js integration
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("📱 HEALTH VIBE AI: RESPONSIVE DESIGN & BREAKPOINTS VERIFICATION");
console.log("   Mobile (< 640/768px), Tablet (768-1024px), Doctor Desktop (>= 1024px), Wide (>= 1280px)");
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
  // TEST 1: Breakpoint tokens in styles.css
  await runTest("TEST 1: Standardized breakpoint tokens defined in styles.css :root", () => {
    const stylesContent = fs.readFileSync(path.join(ROOT, "app", "styles.css"), "utf8");
    assert.ok(stylesContent.includes("--bp-xs: 480px;"), "styles.css must declare --bp-xs: 480px");
    assert.ok(stylesContent.includes("--bp-sm: 640px;"), "styles.css must declare --bp-sm: 640px");
    assert.ok(stylesContent.includes("--bp-md: 768px;"), "styles.css must declare --bp-md: 768px");
    assert.ok(stylesContent.includes("--bp-lg: 1024px;"), "styles.css must declare --bp-lg: 1024px");
    assert.ok(stylesContent.includes("--bp-xl: 1280px;"), "styles.css must declare --bp-xl: 1280px");
    assert.ok(stylesContent.includes("--bp-2xl: 1536px;"), "styles.css must declare --bp-2xl: 1536px");
  });

  // TEST 2: Core media queries in styles.css
  await runTest("TEST 2: Core responsive media queries in styles.css", () => {
    const stylesContent = fs.readFileSync(path.join(ROOT, "app", "styles.css"), "utf8");
    assert.ok(stylesContent.includes("@media (min-width: 1024px)"), "styles.css must have desktop media query (>= 1024px)");
    assert.ok(stylesContent.includes("@media (min-width: 1280px)"), "styles.css must have wide clinical workstation query (>= 1280px)");
    assert.ok(stylesContent.includes("@media (min-width: 768px) and (max-width: 1023.98px)"), "styles.css must have tablet media query (768px - 1023.98px)");
    assert.ok(stylesContent.includes("@media (max-width: 768px)"), "styles.css must have mobile smartphone query (<= 768px)");
    assert.ok(stylesContent.includes("body.device-mobile"), "styles.css must support .device-mobile tier class");
    assert.ok(stylesContent.includes("body.device-desktop"), "styles.css must support .device-desktop tier class");
  });

  // TEST 3: Doctor module responsive styling in doctor.css
  await runTest("TEST 3: Doctor module multi-tier responsive layouts in doctor.css", () => {
    const doctorContent = fs.readFileSync(path.join(ROOT, "app", "modules", "doctor", "doctor.css"), "utf8");
    assert.ok(doctorContent.includes("#screen-doctor .doctor-layout"), "doctor.css must style doctor-layout");
    assert.ok(doctorContent.includes("@media (min-width: 1280px)"), "doctor.css must have wide workstation rules (>= 1280px)");
    assert.ok(doctorContent.includes("@media (min-width: 1536px)"), "doctor.css must have high-res rules (>= 1536px)");
    assert.ok(doctorContent.includes("@media (min-width: 768px) and (max-width: 1023.98px)"), "doctor.css must have tablet rules");
    assert.ok(doctorContent.includes("@media (max-width: 767.98px)"), "doctor.css must have mobile rules (< 768px)");
    assert.ok(doctorContent.includes(".doctor-queue-panel.mobile-hidden"), "doctor.css must style mobile-hidden queue panel");
    assert.ok(doctorContent.includes(".mobile-back-to-queue-btn"), "doctor.css must style mobile back-to-queue button");
  });

  // TEST 4: Patient module responsive layouts in patient.css
  await runTest("TEST 4: Patient module responsive layouts in patient.css", () => {
    const patientContent = fs.readFileSync(path.join(ROOT, "app", "modules", "patient", "patient.css"), "utf8");
    assert.ok(patientContent.includes("@media (min-width: 1280px)"), "patient.css must have wide layout (>= 1280px)");
    assert.ok(patientContent.includes("@media (min-width: 640px) and (max-width: 1023.98px)"), "patient.css must have tablet layout");
    assert.ok(patientContent.includes("@media (max-width: 639.98px)"), "patient.css must have mobile layout (< 640px)");
  });

  // TEST 5: Appointments module responsive styling in appointments.css
  await runTest("TEST 5: Appointments module responsive slot chips & grid in appointments.css", () => {
    const apptContent = fs.readFileSync(path.join(ROOT, "app", "modules", "appointments", "appointments.css"), "utf8");
    assert.ok(apptContent.includes("@media (min-width: 1280px)"), "appointments.css must have wide layout (>= 1280px)");
    assert.ok(apptContent.includes("@media (min-width: 768px) and (max-width: 1023.98px)"), "appointments.css must have tablet layout");
    assert.ok(apptContent.includes("@media (max-width: 767.98px)"), "appointments.css must have mobile layout (< 768px)");
    assert.ok(apptContent.includes("min-height: 44px;"), "appointments.css mobile slot chips must have >= 44px touch target");
  });

  // TEST 6: Assessment module responsive layout in assessment.css
  await runTest("TEST 6: Assessment module responsive layout in assessment.css", () => {
    const assessContent = fs.readFileSync(path.join(ROOT, "app", "modules", "assessment", "assessment.css"), "utf8");
    assert.ok(assessContent.includes("@media (min-width: 1280px)"), "assessment.css must have wide layout (>= 1280px)");
    assert.ok(assessContent.includes("@media (min-width: 768px) and (max-width: 1023.98px)"), "assessment.css must have tablet layout");
    assert.ok(assessContent.includes("@media (max-width: 767.98px)"), "assessment.css must have mobile layout (< 768px)");
  });

  // TEST 7: Reports module responsive styling in reports.css
  await runTest("TEST 7: Reports module responsive styling in reports.css", () => {
    const reportContent = fs.readFileSync(path.join(ROOT, "app", "modules", "reports", "reports.css"), "utf8");
    assert.ok(reportContent.includes("@media (max-width: 639.98px)"), "reports.css must have mobile layout (< 640px)");
    assert.ok(reportContent.includes("@media (min-width: 640px) and (max-width: 1023.98px)"), "reports.css must have tablet layout");
  });

  // TEST 8: responsive-layout.js component implementation & calculations
  await runTest("TEST 8: responsive-layout.js component calculations & subscriber logic", () => {
    const responsiveModule = require(path.join(ROOT, "app", "responsive-layout.js"));
    assert.ok(responsiveModule, "responsive-layout.js module must be loadable");
    assert.strictEqual(responsiveModule.BREAKPOINTS.XS, 480);
    assert.strictEqual(responsiveModule.BREAKPOINTS.SM, 640);
    assert.strictEqual(responsiveModule.BREAKPOINTS.MD, 768);
    assert.strictEqual(responsiveModule.BREAKPOINTS.LG, 1024);
    assert.strictEqual(responsiveModule.BREAKPOINTS.XL, 1280);
    assert.strictEqual(responsiveModule.BREAKPOINTS.XXL, 1536);

    // Viewport tier calculation tests
    assert.strictEqual(responsiveModule.getBreakpointTier(375), "mobile", "375px should be mobile");
    assert.strictEqual(responsiveModule.getBreakpointTier(600), "mobile", "600px should be mobile");
    assert.strictEqual(responsiveModule.getBreakpointTier(800), "tablet", "800px should be tablet");
    assert.strictEqual(responsiveModule.getBreakpointTier(1024), "desktop", "1024px should be desktop");
    assert.strictEqual(responsiveModule.getBreakpointTier(1200), "desktop", "1200px should be desktop");
    assert.strictEqual(responsiveModule.getBreakpointTier(1300), "wide", "1300px should be wide");
    assert.strictEqual(responsiveModule.getBreakpointTier(1600), "wide", "1600px should be wide");

    // Token calculation tests
    assert.strictEqual(responsiveModule.getBreakpointToken(360), "xs", "360px should be xs token");
    assert.strictEqual(responsiveModule.getBreakpointToken(500), "sm", "500px should be sm token");
    assert.strictEqual(responsiveModule.getBreakpointToken(700), "md", "700px should be md token");
    assert.strictEqual(responsiveModule.getBreakpointToken(900), "lg", "900px should be lg token");
    assert.strictEqual(responsiveModule.getBreakpointToken(1100), "xl", "1100px should be xl token");
    assert.strictEqual(responsiveModule.getBreakpointToken(1600), "2xl", "1600px should be 2xl token");

    // Subscriber test
    let receivedState = null;
    const unsub = responsiveModule.subscribe(state => {
      receivedState = state;
    });
    assert.ok(receivedState, "Subscriber must receive current state on subscribe");
    assert.ok(typeof receivedState.breakpoint === "string");
    assert.ok(typeof receivedState.token === "string");
    assert.ok(typeof unsub === "function");
    unsub();
  });

  // TEST 9: Script inclusion in app/index.html & app.js integration
  await runTest("TEST 9: Script inclusion in app/index.html & integration in app.js", () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");

    assert.ok(indexHtml.includes('<script src="./responsive-layout.js'), "index.html must include responsive-layout.js");
    assert.ok(appJs.includes("adaptDoctorCockpit"), "app.js must call adaptDoctorCockpit");
  });

  console.log("\n==================================================================");
  console.log(`🎉 ALL ${passedTests} RESPONSIVE DESIGN & BREAKPOINT TESTS PASSED!`);
  console.log("==================================================================\n");
})();
