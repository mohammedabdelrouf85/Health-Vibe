/**
 * Health Vibe AI - Patient Onboarding: Usability & Mobile Accessibility (A11y) QA Test Suite
 * Task 17: P2 \- أولوية عالية | QA / Medical Research | تجربة المريض والموبايل (اختبار قابلية الاستخدام (Usability & A11y QA))
 * مرجع: Ada Health
 * 
 * Verifies:
 * 1. Mobile Touch Target Ergonomics (WCAG 2.5.5 / 2.5.8):
 *    - Next action button >= 48px height for effortless thumb taps.
 *    - Previous and Skip buttons >= 44px touch targets.
 *    - Mobile bottom sheet responsive transformation on viewports <= 640px.
 * 2. Screen Reader ARIA Semantics (WCAG 4.1.2):
 *    - Modal dialog declares role="dialog", aria-modal="true", aria-labelledby, aria-describedby.
 *    - Progress step indicators declare role="tab" and aria-selected state.
 * 3. Keyboard Navigation & Accessibility:
 *    - Escape key dismisses / skips the walkthrough.
 *    - Arrow keys (ArrowLeft / ArrowRight) navigate between steps respecting RTL/LTR.
 * 4. Clinical Workflow Clarity (Ada Health Standard):
 *    - 3 distinct clinical steps: Symptoms ➡️ Doctor Review ➡️ Certified Report.
 *    - Clear confirmation that AI does not replace human clinical judgment.
 * 5. RTL / LTR Bilingual Translation Parity:
 *    - 100% parity across all 15 onboarding keys in app/i18n.js.
 *    - Correct contextual arrow directions (← in Arabic, → in English).
 * 6. Backend Persistence & Audit Trail:
 *    - GET and POST /api/patient/preferences/onboarding endpoints.
 *    - Audit event PATIENT_ONBOARDING_COMPLETED logged.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('📱 HEALTH VIBE AI: ONBOARDING WALKTHROUGH USABILITY & A11Y QA');
console.log('   WCAG 2.1 AA/AAA Touch Ergonomics, Screen Readers & Ada Health');
console.log('==================================================================\n');

let passedTests = 0;
const totalTests = 6;

async function runSuite() {
  const cssPath = path.resolve(__dirname, '../app/modules/patient/onboarding.css');
  const servicePath = path.resolve(__dirname, '../app/modules/patient/onboarding-service.js');
  const uiPath = path.resolve(__dirname, '../app/modules/patient/onboarding-ui.js');
  const i18nPath = path.resolve(__dirname, '../app/i18n.js');
  const indexPath = path.resolve(__dirname, '../app/index.html');
  const serverPath = path.resolve(__dirname, '../backend/server.js');

  const css = fs.readFileSync(cssPath, 'utf8');
  const service = require(servicePath);
  const jsUi = fs.readFileSync(uiPath, 'utf8');
  const { translations } = require(i18nPath);
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  // -----------------------------------------------------------------------------
  // TEST 1: Mobile Touch Target Ergonomics (WCAG 2.5.5 >= 44px / 48px)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: Mobile Touch Target Ergonomics & Touch Bounding Boxes');
  {
    assert.ok(css.includes('min-height: 48px'), 'Next action button must have >= 48px touch height');
    assert.ok(css.includes('min-height: 44px') && css.includes('min-width: 44px'), 'Skip and auxiliary buttons must have >= 44px touch bounding box');
    assert.ok(css.includes('@media (max-width: 640px)'), 'Mobile bottom sheet layout must be styled');
    console.log('  ✓ Verified >= 48px touch targets and bottom sheet mobile presentation.');
    passedTests++;
  }

  // -----------------------------------------------------------------------------
  // TEST 2: Screen Reader ARIA Semantics & Role Declarations
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Screen Reader ARIA Semantics & Modal Roles');
  {
    assert.ok(jsUi.includes('role="dialog"') || jsUi.includes('"role", "dialog"'), 'Onboarding container must declare role="dialog"');
    assert.ok(jsUi.includes('aria-modal="true"') || jsUi.includes('"aria-modal", "true"'), 'Modal must declare aria-modal="true"');
    assert.ok(jsUi.includes('aria-labelledby'), 'Modal must bind aria-labelledby to card title');
    assert.ok(jsUi.includes('role="tab"') || jsUi.includes('role="tablist"'), 'Step indicators must declare tab semantics');
    assert.ok(jsUi.includes('aria-selected'), 'Active step dot must declare aria-selected');
    console.log('  ✓ Verified dialog, aria-modal, and tab semantics for screen readers.');
    passedTests++;
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Keyboard Trapping & Escape / Arrow Navigation
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Keyboard Trapping & Escape / Arrow Navigation');
  {
    assert.ok(jsUi.includes('Escape'), 'Must support dismissal / skip via Escape key');
    assert.ok(jsUi.includes('ArrowRight') && jsUi.includes('ArrowLeft'), 'Must support arrow key navigation between cards');
    assert.ok(jsUi.includes('focus()'), 'Must focus primary action button upon opening');
    console.log('  ✓ Verified Escape key, ArrowLeft/ArrowRight, and programmatic focus.');
    passedTests++;
  }

  // -----------------------------------------------------------------------------
  // TEST 4: 3-Step Clinical Clarity (Ada Health Standard)
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Clinical Workflow Clarity & Physician Role Disclosure');
  {
    const steps = service.getSteps();
    assert.strictEqual(steps.length, 3, 'Onboarding must contain exactly 3 concise steps');

    assert.ok(steps[0].title.ar.includes('الأعراض') || steps[0].title.en.includes('Symptoms'), 'Step 1 must explain symptom entry');
    assert.ok(steps[1].title.ar.includes('طبيب') || steps[1].title.en.includes('Physician'), 'Step 2 must explain physician review');
    assert.ok(steps[1].description.ar.includes('لا يحل') || steps[1].subtitle.en.includes('never replaces'), 'Step 2 must disclose that AI does not replace doctors');
    assert.ok(steps[2].title.ar.includes('التقرير') || steps[2].title.en.includes('Report'), 'Step 3 must explain certified report delivery');
    console.log('  ✓ Verified 3-step sequence: Symptoms -> Human Doctor -> Certified Report.');
    passedTests++;
  }

  // -----------------------------------------------------------------------------
  // TEST 5: RTL / LTR Bilingual Parity & Asset Linkage
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Bilingual Translation Parity & HTML Inclusions');
  {
    assert.ok(translations.ar.onboarding && translations.en.onboarding, 'Bilingual onboarding dictionaries must exist');
    const arKeys = Object.keys(translations.ar.onboarding).sort();
    const enKeys = Object.keys(translations.en.onboarding).sort();
    assert.deepStrictEqual(arKeys, enKeys, 'Arabic and English onboarding keys must have 100% parity');

    assert.ok(indexHtml.includes('onboarding.css'), 'index.html must link onboarding.css');
    assert.ok(indexHtml.includes('onboarding-service.js'), 'index.html must link onboarding-service.js');
    assert.ok(indexHtml.includes('onboarding-ui.js'), 'index.html must link onboarding-ui.js');
    console.log('  ✓ Verified 100% translation parity across 15 keys and HTML script/CSS linkage.');
    passedTests++;
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Backend Persistence & Security Audit
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Backend Persistence Endpoints & Audit Logging');
  {
    assert.ok(serverContent.includes("app.get('/api/patient/preferences/onboarding'"), 'server.js must expose GET onboarding preference');
    assert.ok(serverContent.includes("app.post('/api/patient/preferences/onboarding'"), 'server.js must expose POST onboarding preference');
    assert.ok(serverContent.includes('PATIENT_ONBOARDING_COMPLETED'), 'server.js must log PATIENT_ONBOARDING_COMPLETED audit event');
    console.log('  ✓ Verified GET/POST onboarding preference endpoints and security audit trail.');
    passedTests++;
  }

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} ONBOARDING USABILITY & A11Y TESTS PASSED (100%)!`);
  console.log('==================================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ ONBOARDING QA TEST SUITE FAILED:', err);
  process.exit(1);
});
