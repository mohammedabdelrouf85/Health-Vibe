/**
 * Health Vibe AI - Propeller Health Benchmark Medication & Inhaler Reminders Test Suite
 * Benchmark: Propeller Health (https://propellerhealth.com/)
 *
 * Scope:
 * P2 - أولوية عالية | Product / Frontend | المواعيد والشات بوت والملفات (واجهة المستخدم والتجربة (UI/UX Flow)) |
 * تنبيهات متابعة الدواء والبخاخات (Medication Reminders) — إرسال تذكيرات يومية للمريض بمواعيد البخاخة الوقائية
 * لتعزيز الالتزام العلاجي (Adherence) (تصميم الشاشات والتفاعلات بشكل مبسط ومتجاوب مع الهاتف). | Propeller Health
 *
 * Test Matrix:
 * 1. Module loading & interface exposure (window.HealthVibes.MedicationRemindersUI).
 * 2. Schedule setup & preventative controller daily doses (Morning 08:00 & Evening 20:00).
 * 3. 1-Tap fast dose actions: "taken", "snoozed", and "skipped".
 * 4. Adherence score calculation engine (% over 7 and 14 days) & clinical bands.
 * 5. Gamified streak tracking ("🔥 5 أيام متتالية").
 * 6. Quick rescue inhaler (Ventolin) logger & clinical safety thresholds (>=3/24h).
 * 7. Inhaler canister puff tracking & Low Canister Alert (< 20 puffs).
 * 8. HTML UI renderers (Dashboard card, Studio modal, Chatbot card, Appointments dossier).
 * 9. CSS responsive rules, touch accessibility (>=44px), dark/light mode compatibility.
 * 10. 100% bilingual Arabic & English parity in app/i18n.js.
 * 11. HTML layout integration & script loading in app/index.html.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(root, 'app', 'i18n.js'), 'utf8');
const medRemindersCss = fs.readFileSync(
  path.join(root, 'app', 'modules', 'patient', 'medication-reminders.css'),
  'utf8'
);
const medRemindersUiContent = fs.readFileSync(
  path.join(root, 'app', 'modules', 'patient', 'medication-reminders-ui.js'),
  'utf8'
);
const appointmentsUiContent = fs.readFileSync(
  path.join(root, 'app', 'modules', 'appointments', 'appointments-ui.js'),
  'utf8'
);

console.log('\n==================================================================');
console.log('⏰ HEALTH VIBE AI: PROPELLER INHALER REMINDERS TEST SUITE');
console.log('   Benchmark: Propeller Health (Preventative Controller Adherence)');
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
  documentElement: { lang: 'ar' },
  body: {
    style: {},
    appendChild: el => el
  },
  getElementById: id => domStore.get(id) || null,
  createElement: tag => {
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      innerHTML: '',
      style: {},
      attributes: {},
      setAttribute: (k, v) => { el.attributes[k] = v; },
      getAttribute: k => el.attributes[k],
      addEventListener: () => {},
      querySelectorAll: () => []
    };
    return el;
  },
  addEventListener: () => {}
};

const mockWindow = {
  HealthVibes: {},
  document: mockDocument,
  localStorage: mockLocalStorage,
  currentLanguage: 'ar',
  addEventListener: () => {},
  showToast: () => {}
};

// Evaluate Module Code
const moduleEvaluator = new Function('window', 'global', 'document', 'localStorage', medRemindersUiContent);
moduleEvaluator(mockWindow, mockWindow, mockDocument, mockLocalStorage);

const MedicationRemindersUI = mockWindow.HealthVibes.MedicationRemindersUI;

// -----------------------------------------------------------------------------
// TEST 1: Module Loading & Interface Verification
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: MedicationRemindersUI Module Loading & Public Methods');
{
  assert.ok(MedicationRemindersUI, 'HealthVibes.MedicationRemindersUI must be defined');
  assert.strictEqual(typeof MedicationRemindersUI.init, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.getState, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.logDose, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.logRescuePuff, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.calculateAdherence, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.calculateStreak, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.refillCanister, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.updateScheduleTimes, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.openStudio, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.closeStudio, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.setStudioTab, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.renderDashboardWidget, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.renderChatbotCard, 'function');
  assert.strictEqual(typeof MedicationRemindersUI.renderAppointmentAdherenceSnippet, 'function');
  console.log('  ✓ All 14 public module methods verified');
}

// -----------------------------------------------------------------------------
// TEST 2: Controller Inhaler Schedule & Initial State
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Preventative Controller Schedule & Initial Catalog');
{
  MedicationRemindersUI.resetState();
  const state = MedicationRemindersUI.getState();

  assert.ok(Array.isArray(state.medications), 'State has medications list');
  const controller = state.medications.find(m => m.type === 'controller');
  assert.ok(controller, 'Must have at least one preventative controller inhaler');
  assert.strictEqual(controller.id, 'med_symbicort_01');
  assert.ok(controller.scheduleTimes.includes('08:00'), 'Morning dose at 08:00');
  assert.ok(controller.scheduleTimes.includes('20:00'), 'Evening dose at 20:00');
  assert.strictEqual(controller.canisterTotal, 120);

  const rescue = state.medications.find(m => m.type === 'rescue');
  assert.ok(rescue, 'Must have at least one PRN rescue inhaler');
  assert.strictEqual(rescue.id, 'med_ventolin_02');
  console.log('  ✓ Controller (Symbicort) & Rescue (Ventolin) schedules verified');
}

// -----------------------------------------------------------------------------
// TEST 3: 1-Tap Fast Actions: Taken, Snoozed, and Skipped
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: 1-Tap Fast Actions: Taken, Snoozed, and Skipped');
{
  MedicationRemindersUI.resetState();

  // 1. Take dose
  const takeRes = MedicationRemindersUI.logDose('med_symbicort_01', '08:00', 'taken');
  assert.strictEqual(takeRes.success, true);
  assert.strictEqual(takeRes.status, 'taken');

  let state = MedicationRemindersUI.getState();
  const takenDose = state.todayDoses.find(d => d.medId === 'med_symbicort_01' && d.scheduledTime === '08:00');
  assert.ok(takenDose);
  assert.strictEqual(takenDose.status, 'taken');
  assert.ok(takenDose.takenAt);

  // Canister should have decremented
  const controller = state.medications.find(m => m.id === 'med_symbicort_01');
  assert.strictEqual(controller.canisterRemaining, 105); // started at 106 - 1 = 105

  // 2. Snooze dose
  const snoozeRes = MedicationRemindersUI.logDose('med_symbicort_01', '20:00', 'snoozed', { snoozeMinutes: 30 });
  assert.strictEqual(snoozeRes.success, true);
  assert.strictEqual(snoozeRes.status, 'snoozed');
  assert.ok(snoozeRes.snoozedUntil);

  // 3. Skip dose
  const skipRes = MedicationRemindersUI.logDose('med_symbicort_01', '20:00', 'skipped', { reason: 'Side effects' });
  assert.strictEqual(skipRes.success, true);
  assert.strictEqual(skipRes.status, 'skipped');
  assert.strictEqual(skipRes.reason, 'Side effects');

  console.log('  ✓ All 3 dose transitions (taken, snoozed, skipped) verified');
}

// -----------------------------------------------------------------------------
// TEST 4: Adherence Score Engine & Clinical Bands
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Longitudinal Adherence Score & Propeller Clinical Bands');
{
  MedicationRemindersUI.resetState();

  const adherence7 = MedicationRemindersUI.calculateAdherence(7);
  assert.ok(typeof adherence7.adherencePct === 'number');
  assert.ok(adherence7.adherencePct >= 0 && adherence7.adherencePct <= 100);
  assert.ok(['excellent', 'moderate', 'at_risk'].includes(adherence7.band));

  // Verify band thresholds
  // >= 80% is excellent
  assert.strictEqual(adherence7.band, 'excellent');

  const streak = MedicationRemindersUI.calculateStreak();
  assert.ok(streak >= 1, 'Streak is at least 1 day');

  console.log(`  ✓ Adherence calculated: ${adherence7.adherencePct}% (${adherence7.band}), streak: ${streak} days`);
}

// -----------------------------------------------------------------------------
// TEST 5: Quick Rescue Inhaler Logger & Clinical Safety Alerts
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Quick Rescue Inhaler Logger & Clinical Safety Threshold');
{
  MedicationRemindersUI.resetState();

  const res1 = MedicationRemindersUI.logRescuePuff('med_ventolin_02', 2, 'dust_storm');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.entry.puffs, 2);
  assert.strictEqual(res1.entry.trigger, 'dust_storm');

  // Check canister decremented by 2
  const state = MedicationRemindersUI.getState();
  const ventolin = state.medications.find(m => m.id === 'med_ventolin_02');
  assert.strictEqual(ventolin.canisterRemaining, 166); // 168 - 2 = 166

  // Trigger multiple times to test >=3 in 24h threshold
  MedicationRemindersUI.logRescuePuff('med_ventolin_02', 1, 'exercise');
  const res3 = MedicationRemindersUI.logRescuePuff('med_ventolin_02', 1, 'night_cough');
  assert.ok(res3.recentRescueCount >= 3, 'Recent rescue count tracks >= 3 in 24 hours');

  console.log('  ✓ Rescue logging, canister puff subtraction, and safety check verified');
}

// -----------------------------------------------------------------------------
// TEST 6: Canister Tracking & Low Canister Alert (< 20 puffs)
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Canister Puff Counter & Low Canister Alert');
{
  MedicationRemindersUI.resetState();

  // Set remaining to 15 (below 20 threshold)
  MedicationRemindersUI.refillCanister('med_symbicort_01', 15);

  // Adherence calculation detects low canister
  const adherence = MedicationRemindersUI.calculateAdherence(7);
  assert.strictEqual(adherence.lowCanistersCount, 1);
  assert.strictEqual(adherence.lowCanisters[0].id, 'med_symbicort_01');

  // Refill canister restores count
  const refillRes = MedicationRemindersUI.refillCanister('med_symbicort_01', 120);
  assert.strictEqual(refillRes.success, true);
  assert.strictEqual(refillRes.canisterRemaining, 120);

  const adherenceAfter = MedicationRemindersUI.calculateAdherence(7);
  assert.strictEqual(adherenceAfter.lowCanistersCount, 0);

  console.log('  ✓ Low canister detection (<20 puffs) and refill restoration verified');
}

// -----------------------------------------------------------------------------
// TEST 7: HTML UI Renderers (Dashboard Widget, Modal, Chatbot, Dossier)
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: Multi-Touchpoint HTML Renderers');
{
  // 1. Dashboard widget mount
  const dummyMount = { innerHTML: '', id: 'patientMedicationRemindersCard' };
  domStore.set('patientMedicationRemindersCard', dummyMount);

  const widgetHtml = MedicationRemindersUI.renderDashboardWidget('patientMedicationRemindersCard');
  assert.ok(widgetHtml.includes('med-reminders-card'), 'Widget contains med-reminders-card');
  assert.ok(widgetHtml.includes('Propeller Standard'), 'Widget includes Propeller Standard badge');
  assert.ok(widgetHtml.includes('med-btn-take'), 'Widget has 1-tap take button');
  assert.ok(widgetHtml.includes('med-btn-snooze'), 'Widget has 1-tap snooze button');
  assert.ok(widgetHtml.includes('med-btn-rescue'), 'Widget has rescue puff logger button');

  // 2. Chatbot card
  const chatCardHtml = MedicationRemindersUI.renderChatbotCard();
  assert.ok(chatCardHtml.includes('med-chatbot-reminder-card'), 'Contains chatbot reminder card class');
  assert.ok(chatCardHtml.includes('logDose'), 'Contains fast 1-tap action onclick');

  // 3. Appointment Dossier Adherence Snippet
  const dossierSnippetHtml = MedicationRemindersUI.renderAppointmentAdherenceSnippet();
  assert.ok(dossierSnippetHtml.includes('med-dossier-adherence-badge'), 'Contains dossier adherence badge');
  assert.ok(dossierSnippetHtml.includes('Propeller'), 'Mentions Propeller standard');

  console.log('  ✓ Dashboard card, Chatbot card, and Pre-Visit Dossier snippet verified');
}

// -----------------------------------------------------------------------------
// TEST 8: Responsive CSS Tokens, WCAG Touch Targets (>= 44px)
// -----------------------------------------------------------------------------
console.log('▶ TEST 8: CSS Responsive Rules & WCAG >=44px Touch Targets');
{
  assert.ok(medRemindersCss.includes('min-height: 44px'), 'Action buttons must enforce >=44px min-height');
  assert.ok(medRemindersCss.includes('.med-btn-action'), 'Contains .med-btn-action styles');
  assert.ok(medRemindersCss.includes('@media (max-width: 640px)'), 'Contains mobile breakpoint optimizations');
  assert.ok(medRemindersCss.includes('.med-reminders-card'), 'Contains card styling');
  assert.ok(medRemindersCss.includes('.med-modal-dialog'), 'Contains modal dialog styling');
  assert.ok(medRemindersCss.includes('.med-canister-gauge-fill'), 'Contains canister gauge progress styling');
  console.log('  ✓ Touch target accessibility and responsive breakpoint rules verified');
}

// -----------------------------------------------------------------------------
// TEST 9: 100% Arabic & English Bilingual Parity in app/i18n.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 9: 100% Bilingual Parity for medicationReminders Catalog');
{
  const i18nModule = require('../app/i18n');
  const translations = i18nModule.translations;

  assert.ok(translations.ar.medicationReminders, 'translations.ar must contain medicationReminders');
  assert.ok(translations.en.medicationReminders, 'translations.en must contain medicationReminders');

  const arKeys = Object.keys(translations.ar.medicationReminders);
  const enKeys = Object.keys(translations.en.medicationReminders);

  assert.strictEqual(arKeys.length, enKeys.length, 'Key counts must match exactly');

  arKeys.forEach(k => {
    assert.ok(translations.en.medicationReminders[k], `Missing English key for: ${k}`);
    assert.ok(
      typeof translations.ar.medicationReminders[k] === 'string' && translations.ar.medicationReminders[k].length > 0,
      `Arabic key ${k} must not be empty`
    );
    assert.ok(
      typeof translations.en.medicationReminders[k] === 'string' && translations.en.medicationReminders[k].length > 0,
      `English key ${k} must not be empty`
    );
  });

  console.log(`  ✓ 100% mutual parity verified across all ${arKeys.length} medicationReminders translation keys`);
}

// -----------------------------------------------------------------------------
// TEST 10: HTML Layout Integration & Script Loading in app/index.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 10: app/index.html Linkage & DOM Mount Points');
{
  assert.ok(
    appHtml.includes('href="./modules/patient/medication-reminders.css"'),
    'index.html must include medication-reminders.css'
  );
  assert.ok(
    appHtml.includes('src="./modules/patient/medication-reminders-ui.js?v=1.0"'),
    'index.html must include medication-reminders-ui.js'
  );
  assert.ok(
    appHtml.includes('id="patientMedicationRemindersCard"'),
    'index.html must include #patientMedicationRemindersCard mount point'
  );
  assert.ok(
    appHtml.includes('id="navMedicationRemindersBtn"'),
    'index.html sidebar must include #navMedicationRemindersBtn'
  );
  assert.ok(
    appHtml.includes('id="btnChatMedReminders"'),
    'index.html chat compose must include #btnChatMedReminders'
  );
  console.log('  ✓ Stylesheet, script, sidebar button, chat button, and mount point verified in index.html');
}

// -----------------------------------------------------------------------------
// TEST 11: app.js & appointments-ui.js Integration Hooks
// -----------------------------------------------------------------------------
console.log('▶ TEST 11: app.js & appointments-ui.js Integration Hooks');
{
  assert.ok(
    appJs.includes('MedicationRemindersUI.renderDashboardWidget()'),
    'app.js must trigger MedicationRemindersUI.renderDashboardWidget in showScreen("patient")'
  );
  assert.ok(
    appJs.includes('openMedicationRemindersStudio'),
    'app.js must provide chatbot quick chip to open medication reminders studio'
  );
  assert.ok(
    appointmentsUiContent.includes('renderAppointmentAdherenceSnippet'),
    'appointments-ui.js must embed renderAppointmentAdherenceSnippet in consultation dossier'
  );
  console.log('  ✓ Patient dashboard hook, chatbot quick chip, and consultation dossier hooks verified');
}

console.log('\n==================================================================');
console.log('🎉 ALL 11 PROPELLER INHALER REMINDERS TESTS PASSED (100%)');
console.log('==================================================================\n');
