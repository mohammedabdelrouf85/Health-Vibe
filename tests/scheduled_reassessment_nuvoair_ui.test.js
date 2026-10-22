/**
 * Health Vibe AI - NuvoAir Medical Benchmark Scheduled Re-assessment Test Suite
 * Benchmark: NuvoAir Medical (https://nuvoair.com/)
 *
 * Scope:
 * P2 - أولوية عالية | Product / Frontend | المواعيد والشات بوت والملفات (واجهة المستخدم والتجربة (UI/UX Flow)) |
 * جدولة تقييم متابعة دوري تلقائي (Scheduled Re-assessment) — تذكير المريض بإجراء تقييم تنفسي جديد بعد أسبوع من بدء الخطة العلاجية لقياس التحسن
 * (تصميم الشاشات والتفاعلات بشكل مبسط ومتجاوب مع الهاتف). | NuvoAir Medical
 *
 * Test Matrix:
 * 1. Module loading & interface exposure (window.HealthVibes.ScheduledReassessmentUI).
 * 2. 7-Day post-treatment initiation schedule generation & due status evaluation.
 * 3. 0-25 Standardized Respiratory Control Score calculation engine & validated question weightings.
 * 4. NuvoAir Longitudinal Trajectory & Quantified Delta (+/- % and score change vs Baseline).
 * 5. Step-by-step wizard navigation, input updates, biometrics, and submission.
 * 6. 24h Snooze re-assessment functionality with snooze count tracking.
 * 7. Multi-touchpoint HTML renderers (Patient Dashboard Card, Chatbot Card, Appointments Dossier).
 * 8. CSS mobile responsiveness, touch accessibility (>=44px), and dark/light mode compatibility.
 * 9. 100% bilingual Arabic & English parity in app/i18n.js.
 * 10. HTML layout integration & script loading in app/index.html & patient-view.html.
 * 11. app.js & appointments-ui.js integration hooks and event triggers.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const patientViewHtml = fs.readFileSync(
  path.join(root, 'app', 'modules', 'patient', 'patient-view.html'),
  'utf8'
);
const appJs = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(root, 'app', 'i18n.js'), 'utf8');
const reassessmentCss = fs.readFileSync(
  path.join(root, 'app', 'modules', 'patient', 'scheduled-reassessment.css'),
  'utf8'
);
const reassessmentUiContent = fs.readFileSync(
  path.join(root, 'app', 'modules', 'patient', 'scheduled-reassessment-ui.js'),
  'utf8'
);
const appointmentsUiContent = fs.readFileSync(
  path.join(root, 'app', 'modules', 'appointments', 'appointments-ui.js'),
  'utf8'
);

console.log('\n==================================================================');
console.log('📈 HEALTH VIBE AI: NUVOAIR SCHEDULED RE-ASSESSMENT TEST SUITE');
console.log('   Benchmark: NuvoAir Medical (7-Day Post-Treatment Longitudinal Check-in)');
console.log('==================================================================\n');

// -----------------------------------------------------------------------------
// Setup Mock Browser Environment
// -----------------------------------------------------------------------------
const storageMock = new Map();
const mockLocalStorage = {
  getItem: key => storageMock.get(key) || null,
  setItem: (key, val) => storageMock.set(key, String(val)),
  removeItem: key => storageMock.delete(key),
  clear: () => storageMock.clear()
};

const domStore = new Map();
const mockDocument = {
  getElementById: id => domStore.get(id) || null,
  body: {
    appendChild: el => domStore.set(el.id || 'appended_child', el)
  },
  createElement: tag => ({
    tagName: tag,
    id: '',
    className: '',
    style: {},
    innerHTML: '',
    classList: {
      add: function () {},
      remove: function () {}
    }
  }),
  documentElement: { lang: 'ar', dir: 'rtl' }
};

global.window = {
  HealthVibes: {},
  currentLanguage: 'ar',
  localStorage: mockLocalStorage,
  document: mockDocument
};
global.document = mockDocument;
global.localStorage = mockLocalStorage;
global.HealthVibes = global.window.HealthVibes;

// Load ScheduledReassessmentUI into global scope
const ScheduledReassessmentUI = require('../app/modules/patient/scheduled-reassessment-ui');

// -----------------------------------------------------------------------------
// TEST 1: Module Loading & Interface Verification
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: ScheduledReassessmentUI Module Loading & Public Methods');
{
  assert.ok(ScheduledReassessmentUI, 'ScheduledReassessmentUI module must be exported');
  assert.strictEqual(
    global.HealthVibes.ScheduledReassessmentUI,
    ScheduledReassessmentUI,
    'ScheduledReassessmentUI must be mounted to window.HealthVibes'
  );

  const requiredMethods = [
    'getState',
    'resetState',
    'scheduleReassessment',
    'snoozeReassessment',
    'submitReassessment',
    'calculateControlScore',
    'calculateImprovementTrajectory',
    'evaluateScheduleStatus',
    'renderDashboardCard',
    'openWizardModal',
    'closeWizardModal',
    'setWizardStep',
    'updateDraftField',
    'selectOption',
    'finalizeAndSave',
    'renderChatbotCard',
    'renderAppointmentReassessmentSnippet'
  ];

  requiredMethods.forEach(method => {
    assert.strictEqual(
      typeof ScheduledReassessmentUI[method],
      'function',
      `Method ${method} must be exported as a function`
    );
  });

  console.log(`  ✓ All ${requiredMethods.length} public module methods verified`);
}

// -----------------------------------------------------------------------------
// TEST 2: 7-Day Post-Treatment Initiation Schedule Generation & Status
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: 7-Day Post-Treatment Schedule & Due Status Engine');
{
  ScheduledReassessmentUI.resetState();
  const state = ScheduledReassessmentUI.getState();

  assert.ok(state.schedule, 'Schedule must exist');
  assert.strictEqual(state.schedule.intervalDays, 7, 'Default interval must be 7 days (Week 1 follow-up)');
  assert.strictEqual(state.schedule.reason, 'post_treatment_7day_improvement');

  // Initial state started 7 days ago, so due status is 'due'
  assert.strictEqual(state.schedule.status, 'due');

  // Test newly scheduled in future
  const schedFuture = ScheduledReassessmentUI.scheduleReassessment({
    intervalDays: 7,
    startDate: '2026-10-22'
  });
  assert.strictEqual(schedFuture.schedule.intervalDays, 7);
  assert.strictEqual(schedFuture.schedule.status, 'scheduled');

  // Test status evaluation helper
  assert.strictEqual(
    ScheduledReassessmentUI.evaluateScheduleStatus({ status: 'completed' }),
    'completed'
  );

  console.log('  ✓ 7-Day post-treatment initiation schedule generation & due evaluation verified');
}

// -----------------------------------------------------------------------------
// TEST 3: 0-25 Standardized Respiratory Control Score Engine
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Standardized 0-25 Respiratory Control Score Calculation Engine');
{
  // 1. Perfect Control Case (0 breathlessness, 0 night waking, 0 rescue, 0 activity limit)
  const perfectScore = ScheduledReassessmentUI.calculateControlScore({
    dayBreathlessness: 0, // 6 pts
    nightWaking: 0,       // 6 pts
    rescuePuffsWeek: 0,   // 7 pts
    activityLimitation: 0 // 6 pts
  });
  assert.strictEqual(perfectScore.score, 25);
  assert.strictEqual(perfectScore.controlBand, 'controlled');
  assert.strictEqual(perfectScore.scorePct, 100);

  // 2. Moderate Control Case
  const moderateScore = ScheduledReassessmentUI.calculateControlScore({
    dayBreathlessness: 1, // 4 pts
    nightWaking: 1,       // 3 pts
    rescuePuffsWeek: 2,   // 4 pts
    activityLimitation: 0 // 6 pts
  });
  assert.strictEqual(moderateScore.score, 17); // 4 + 3 + 4 + 6 = 17
  assert.strictEqual(moderateScore.controlBand, 'moderate');

  // 3. Poor Control Case
  const poorScore = ScheduledReassessmentUI.calculateControlScore({
    dayBreathlessness: 2, // 2 pts
    nightWaking: 2,       // 0 pts
    rescuePuffsWeek: 6,   // 0 pts
    activityLimitation: 2 // 0 pts
  });
  assert.strictEqual(poorScore.score, 2);
  assert.strictEqual(poorScore.controlBand, 'poor');

  console.log('  ✓ Validated 0-25 scoring engine verified across controlled, moderate, and poor bands');
}

// -----------------------------------------------------------------------------
// TEST 4: NuvoAir Longitudinal Trajectory & Quantified Delta (+/- %)
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: NuvoAir Longitudinal Improvement Trajectory & Quantified Delta');
{
  const baseline = {
    controlScore: 13,
    controlBand: 'poor',
    rescuePuffsWeek: 8
  };

  // 1. Significant Improvement Case
  const followUpImproved = {
    dayBreathlessness: 0,
    nightWaking: 0,
    rescuePuffsWeek: 1,
    activityLimitation: 0
  }; // Score = 25
  const trajImproved = ScheduledReassessmentUI.calculateImprovementTrajectory(baseline, followUpImproved);

  assert.strictEqual(trajImproved.baselineScore, 13);
  assert.strictEqual(trajImproved.currentScore, 25);
  assert.strictEqual(trajImproved.deltaPoints, 12);
  assert.strictEqual(trajImproved.deltaPct, 92); // (12/13)*100 = 92%
  assert.strictEqual(trajImproved.trajectory, 'improved');
  assert.strictEqual(trajImproved.isSignificantImprovement, true);
  assert.strictEqual(trajImproved.clinicalReviewRecommended, false);

  // 2. Deteriorating Case
  const followUpDeteriorating = {
    dayBreathlessness: 3,
    nightWaking: 2,
    rescuePuffsWeek: 8,
    activityLimitation: 2
  }; // Score = 0
  const trajDeteriorating = ScheduledReassessmentUI.calculateImprovementTrajectory(baseline, followUpDeteriorating);

  assert.strictEqual(trajDeteriorating.currentScore, 0);
  assert.strictEqual(trajDeteriorating.deltaPoints, -13);
  assert.strictEqual(trajDeteriorating.trajectory, 'deteriorating');
  assert.strictEqual(trajDeteriorating.clinicalReviewRecommended, true);

  // 3. Stable Case
  const baselineStable = { controlScore: 18, controlBand: 'moderate', rescuePuffsWeek: 2 };
  const followUpStable = {
    dayBreathlessness: 1,
    nightWaking: 1,
    rescuePuffsWeek: 2,
    activityLimitation: 0
  }; // Score = 17
  const trajStable = ScheduledReassessmentUI.calculateImprovementTrajectory(baselineStable, followUpStable);

  assert.strictEqual(trajStable.deltaPoints, -1);
  assert.strictEqual(trajStable.trajectory, 'stable');

  console.log('  ✓ Trajectory classification (improved, stable, deteriorating) and quantified deltas verified');
}

// -----------------------------------------------------------------------------
// TEST 5: Step-by-Step Wizard Navigation & Input Updates
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Step-by-Step Wizard Flow, Biometrics & Submission');
{
  ScheduledReassessmentUI.resetState();

  // Test field updating
  ScheduledReassessmentUI.updateDraftField('dayBreathlessness', 0);
  ScheduledReassessmentUI.updateDraftField('nightWaking', 0);
  ScheduledReassessmentUI.updateDraftField('rescuePuffsWeek', 1);
  ScheduledReassessmentUI.updateDraftField('activityLimitation', 0);
  ScheduledReassessmentUI.updateDraftField('spo2', 99);
  ScheduledReassessmentUI.updateDraftField('fev1Percent', 88);
  ScheduledReassessmentUI.updateDraftField('peakFlow', 480);

  const state = ScheduledReassessmentUI.getState();
  assert.strictEqual(state.currentDraft.spo2, 99);
  assert.strictEqual(state.currentDraft.fev1Percent, 88);
  assert.strictEqual(state.currentDraft.peakFlow, 480);

  // Submit re-assessment
  const submitRes = ScheduledReassessmentUI.submitReassessment(state.currentDraft);
  assert.strictEqual(submitRes.success, true);
  assert.strictEqual(submitRes.entry.score, 25);
  assert.strictEqual(submitRes.trajectory.trajectory, 'improved');

  // Verify state updated
  const updatedState = ScheduledReassessmentUI.getState();
  assert.strictEqual(updatedState.schedule.status, 'completed');
  assert.strictEqual(updatedState.history.length, 1);
  assert.ok(updatedState.nextScheduledDate, 'Next routine check-in date scheduled');

  console.log('  ✓ Wizard step updates, home biometrics input, and completion engine verified');
}

// -----------------------------------------------------------------------------
// TEST 6: 24h Snooze Re-assessment Functionality
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: 24h Snooze Engine & Cooldown Tracking');
{
  ScheduledReassessmentUI.resetState();

  const snoozeRes = ScheduledReassessmentUI.snoozeReassessment(24);
  assert.strictEqual(snoozeRes.success, true);
  assert.ok(snoozeRes.snoozedUntil > Date.now());

  const state = ScheduledReassessmentUI.getState();
  assert.strictEqual(state.schedule.status, 'snoozed');
  assert.strictEqual(state.schedule.snoozeCount, 1);

  console.log('  ✓ 24h snooze cooldown and snooze count tracking verified');
}

// -----------------------------------------------------------------------------
// TEST 7: Multi-Touchpoint HTML Renderers
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: Multi-Touchpoint HTML Renderers (Dashboard, Chatbot, Dossier)');
{
  ScheduledReassessmentUI.resetState();

  // 1. Dashboard card mount
  const dummyMount = { innerHTML: '', id: 'patientScheduledReassessmentCard' };
  domStore.set('patientScheduledReassessmentCard', dummyMount);

  const cardHtml = ScheduledReassessmentUI.renderDashboardCard('patientScheduledReassessmentCard');
  assert.ok(cardHtml.includes('NuvoAir Medical'), 'Dashboard card must reference NuvoAir Medical benchmark');
  assert.ok(cardHtml.includes('btn-nuvoair-primary'), 'Dashboard card must include primary start button');
  assert.ok(cardHtml.includes('openWizardModal()'), 'Card must link to openWizardModal');

  // 2. Chatbot card
  const chatHtml = ScheduledReassessmentUI.renderChatbotCard();
  assert.ok(chatHtml.includes('nuvoair-chatbot-card'), 'Chatbot must render NuvoAir check-in card');
  assert.ok(chatHtml.includes('openWizardModal()'), 'Chatbot card must include start action');

  // 3. Appointments Pre-Visit Dossier Snippet
  const dossierHtml = ScheduledReassessmentUI.renderAppointmentReassessmentSnippet('pt_123');
  assert.ok(dossierHtml.includes('nuvoair-dossier-snippet'), 'Appointments dossier must render NuvoAir trajectory snippet');
  assert.ok(dossierHtml.includes('Quantified Delta') || dossierHtml.includes('مقدار التغير'), 'Dossier must show quantified delta');

  console.log('  ✓ Dashboard card, Chatbot check-in card, and Pre-Visit consultation dossier snippets verified');
}

// -----------------------------------------------------------------------------
// TEST 8: CSS Responsive Rules & WCAG >=44px Touch Targets
// -----------------------------------------------------------------------------
console.log('▶ TEST 8: CSS Responsive Rules & WCAG >=44px Touch Targets');
{
  assert.ok(
    reassessmentCss.includes('min-height: 44px') || reassessmentCss.includes('min-height: 52px'),
    'CSS must enforce >=44px touch targets on buttons and radio cards'
  );
  assert.ok(
    reassessmentCss.includes('@media (max-width: 768px)'),
    'CSS must include tablet/mobile breakpoint <= 768px'
  );
  assert.ok(
    reassessmentCss.includes('@media (max-width: 480px)'),
    'CSS must include compact mobile breakpoint <= 480px'
  );
  assert.ok(
    reassessmentCss.includes('[data-theme="dark"]'),
    'CSS must support dark theme tokens'
  );

  console.log('  ✓ Mobile responsive breakpoints and WCAG >=44px touch target rules verified');
}

// -----------------------------------------------------------------------------
// TEST 9: 100% Arabic & English Bilingual Parity in app/i18n.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 9: 100% Bilingual Parity for scheduledReassessment Catalog');
{
  const i18nModule = require('../app/i18n');
  const translations = i18nModule.translations;

  assert.ok(translations.ar.scheduledReassessment, 'translations.ar must contain scheduledReassessment');
  assert.ok(translations.en.scheduledReassessment, 'translations.en must contain scheduledReassessment');

  const arKeys = Object.keys(translations.ar.scheduledReassessment);
  const enKeys = Object.keys(translations.en.scheduledReassessment);

  assert.strictEqual(arKeys.length, enKeys.length, 'Key counts must match exactly between Arabic and English');

  arKeys.forEach(k => {
    assert.ok(translations.en.scheduledReassessment[k], `Missing English key for: ${k}`);
    assert.ok(
      typeof translations.ar.scheduledReassessment[k] === 'string' && translations.ar.scheduledReassessment[k].length > 0,
      `Arabic key ${k} must not be empty`
    );
    assert.ok(
      typeof translations.en.scheduledReassessment[k] === 'string' && translations.en.scheduledReassessment[k].length > 0,
      `English key ${k} must not be empty`
    );
  });

  console.log(`  ✓ 100% mutual parity verified across all ${arKeys.length} scheduledReassessment translation keys`);
}

// -----------------------------------------------------------------------------
// TEST 10: HTML Layout Integration & Script Loading in app/index.html & patient-view.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 10: app/index.html & patient-view.html Linkages & Mount Points');
{
  assert.ok(
    appHtml.includes('href="./modules/patient/scheduled-reassessment.css"'),
    'index.html must include scheduled-reassessment.css'
  );
  assert.ok(
    appHtml.includes('src="./modules/patient/scheduled-reassessment-ui.js?v=1.0"'),
    'index.html must include scheduled-reassessment-ui.js'
  );
  assert.ok(
    appHtml.includes('id="patientScheduledReassessmentCard"'),
    'index.html must include #patientScheduledReassessmentCard mount point'
  );
  assert.ok(
    patientViewHtml.includes('id="patientScheduledReassessmentCard"'),
    'patient-view.html must include #patientScheduledReassessmentCard mount point'
  );
  assert.ok(
    appHtml.includes('id="navScheduledReassessmentBtn"'),
    'index.html sidebar must include #navScheduledReassessmentBtn'
  );
  assert.ok(
    appHtml.includes('id="btnChatScheduledReassessment"'),
    'index.html chat compose must include #btnChatScheduledReassessment'
  );
  console.log('  ✓ Stylesheet, script, sidebar button, chat compose button, and mount points verified in HTML');
}

// -----------------------------------------------------------------------------
// TEST 11: app.js & appointments-ui.js Integration Hooks
// -----------------------------------------------------------------------------
console.log('▶ TEST 11: app.js & appointments-ui.js Integration Hooks');
{
  assert.ok(
    appJs.includes('ScheduledReassessmentUI.renderDashboardCard()'),
    'app.js must trigger ScheduledReassessmentUI.renderDashboardCard in showScreen("patient")'
  );
  assert.ok(
    appJs.includes('openScheduledReassessmentWizard'),
    'app.js must provide window.openScheduledReassessmentWizard global helper'
  );
  assert.ok(
    appJs.includes('isReassessmentQuery'),
    'app.js must detect reassessment queries in handleSendChatMessage'
  );
  assert.ok(
    appointmentsUiContent.includes('renderAppointmentReassessmentSnippet'),
    'appointments-ui.js must embed renderAppointmentReassessmentSnippet in consultation dossier'
  );
  console.log('  ✓ Patient dashboard hook, chatbot query detector, and appointment dossier hooks verified');
}

console.log('\n==================================================================');
console.log('🎉 ALL 11 NUVOAIR SCHEDULED RE-ASSESSMENT TESTS PASSED (100%)');
console.log('==================================================================\n');
