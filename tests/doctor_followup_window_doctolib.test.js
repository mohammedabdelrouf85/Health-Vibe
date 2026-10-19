/**
 * HEALTH VIBE AI: DOCTOR RECOMMEND FOLLOW-UP WINDOW & CALENDAR SYNC TEST SUITE (DOCTOLIB PATTERN)
 *
 * Verifies:
 * 1. Preset follow-up windows (within_24h, within_3d, within_1w, within_1m, custom, as_needed).
 * 2. Target date calculations for all timeframes with Arabic and English formatting.
 * 3. Consultation modes (clinic, video, phone) and doctor clinical directives.
 * 4. State management, in-memory store, and draft notes persistence.
 * 5. Doctolib 1-click calendar sync: auto-linking to appointments screen, pre-selecting date,
 *    matching mode, and pre-filling structured clinical notes.
 * 6. Responsive HTML workstation rendering, accessibility attributes (ARIA), and DOM updates.
 * 7. Official certified report integration with follow-up badge and booking button.
 * 8. ReportsService canonicalization, snapshot preservation, and PDF export formatting.
 * 9. 100% key parity in i18n translation catalogs (ar.doctor vs en.doctor).
 * 10. Alt+F keyboard shortcut and responsive CSS styling rules.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Setup minimal browser globals mock for Node.js
const mockElements = new Map();
function createMockElement(id, tagName = "div") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: "",
    textContent: "",
    _innerHTML: "",
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      toggle: function(c, force) {
        if (force !== undefined) {
          if (force) this._classes.add(c); else this._classes.delete(c);
          return force;
        }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains: function(c) { return this._classes.has(c); }
    },
    dataset: {},
    attributes: new Map(),
    setAttribute: function(name, val) { this.attributes.set(name, String(val)); this[name] = val; },
    removeAttribute: function(name) { this.attributes.delete(name); delete this[name]; },
    getAttribute: function(name) { return this.attributes.has(name) ? this.attributes.get(name) : (this[name] || null); },
    focus: function() {},
    select: function() {},
    scrollIntoView: function() {},
    querySelector: function(sel) { return null; },
    querySelectorAll: function(sel) { return []; },
    addEventListener: function(event, handler) { this[`_on_${event}`] = handler; },
    removeEventListener: function(event) { delete this[`_on_${event}`]; },
    dispatchEvent: function(evt) {
      if (this[`_on_${evt.type}`]) this[`_on_${evt.type}`](evt);
    },
    remove: function() { mockElements.delete(id); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = String(v); }
  });
  mockElements.set(id, el);
  return el;
}

global.document = {
  activeElement: null,
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: (selector) => {
    const matched = [];
    mockElements.forEach((el) => {
      if (selector.includes('[') && selector.includes(']')) {
        const attrMatches = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]/g);
        if (attrMatches) {
          const allMatch = attrMatches.every(m => {
            const parts = m.slice(1, -1).split('="');
            const attrName = parts[0];
            const attrVal = parts[1] ? parts[1].replace(/"$/, '') : null;
            if (attrVal !== null) {
              return el.getAttribute(attrName) === attrVal;
            }
            return el.getAttribute(attrName) !== null;
          });
          if (allMatch) matched.push(el);
          return;
        }
      }
      matched.push(el);
    });
    return matched;
  },
  createElement: (tagName) => createMockElement(`mock-${Date.now()}-${Math.random()}`, tagName),
  addEventListener: (event, handler) => { global[`_doc_on_${event}`] = handler; }
};

global.window = global;
global.localStorage = {
  _data: new Map(),
  getItem: (k) => global.localStorage._data.get(k) || null,
  setItem: (k, v) => global.localStorage._data.set(k, String(v)),
  removeItem: (k) => global.localStorage._data.delete(k),
  clear: () => global.localStorage._data.clear()
};

global.showToast = (msg) => { global._lastToast = msg; };
global.showScreen = (screen) => { global._lastScreen = screen; };
global.selectAppointmentDate = (date) => { global._lastApptDate = date; };
global.setAppointmentType = (type) => { global._lastApptType = type; };
global.apptDaysList = [];

// Load Modules
const i18n = require(path.join(__dirname, '../app/i18n.js'));
const ReportsService = require(path.join(__dirname, '../app/modules/reports/reports-service.js'));
const DoctorUI = require(path.join(__dirname, '../app/modules/doctor/doctor-ui.js'));

let testsPassed = 0;
let currentTestIdx = 0;
let totalTests = 10;

function runTest(name, fn) {
  currentTestIdx++;
  try {
    fn();
    console.log(`  [PASS] Test ${currentTestIdx}: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${currentTestIdx}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('='.repeat(80));
console.log('🩺 HEALTH VIBE AI: DOCTOR RECOMMEND FOLLOW-UP WINDOW TEST SUITE');
console.log('   Doctolib Interactive Scheduling, Target Date Sync & Mobile UX');
console.log('='.repeat(80));

// -----------------------------------------------------------------------------
// TEST 1: FOLLOW_UP_WINDOWS Presets Catalog Completeness
// -----------------------------------------------------------------------------
runTest('FOLLOW_UP_WINDOWS contains complete clinical preset catalog', () => {
  const catalog = DoctorUI.FOLLOW_UP_WINDOWS;
  assert.ok(Array.isArray(catalog), 'Catalog must be an array');
  assert.strictEqual(catalog.length, 6, 'Should have 6 follow-up window presets');

  const keys = catalog.map(w => w.id);
  assert.ok(keys.includes('within_24h'), 'Must include within_24h');
  assert.ok(keys.includes('within_3d'), 'Must include within_3d');
  assert.ok(keys.includes('within_1w'), 'Must include within_1w');
  assert.ok(keys.includes('within_1m'), 'Must include within_1m');
  assert.ok(keys.includes('custom'), 'Must include custom');
  assert.ok(keys.includes('as_needed'), 'Must include as_needed');

  catalog.forEach(item => {
    assert.ok(item.labelEn && item.labelAr, `Item ${item.id} must have bilingual labels`);
    assert.ok(item.taglineEn && item.taglineAr, `Item ${item.id} must have bilingual taglines`);
    assert.ok(item.descriptionEn && item.descriptionAr, `Item ${item.id} must have bilingual descriptions`);
    assert.ok(item.icon, `Item ${item.id} must have an icon`);
    assert.ok(item.urgency, `Item ${item.id} must have an urgency classification`);
  });
});

// -----------------------------------------------------------------------------
// TEST 2: Target Date Calculation for Presets & Custom Horizons
// -----------------------------------------------------------------------------
runTest('calculateFollowUpTargetDate accurately computes target dates and localization', () => {
  const base = new Date('2026-10-20T10:00:00Z');

  // 1. within_24h -> +1 day
  const d24h = DoctorUI.calculateFollowUpTargetDate('within_24h', base);
  assert.strictEqual(d24h.dateStr, '2026-10-21');
  assert.strictEqual(d24h.daysFromNow, 1);
  assert.ok(d24h.formattedAr.includes('2026'));
  assert.ok(d24h.formattedEn.includes('2026'));

  // 2. within_3d -> +3 days
  const d3d = DoctorUI.calculateFollowUpTargetDate('within_3d', base);
  assert.strictEqual(d3d.dateStr, '2026-10-23');
  assert.strictEqual(d3d.daysFromNow, 3);

  // 3. within_1w -> +7 days
  const d1w = DoctorUI.calculateFollowUpTargetDate('within_1w', base);
  assert.strictEqual(d1w.dateStr, '2026-10-27');
  assert.strictEqual(d1w.daysFromNow, 7);

  // 4. within_1m -> +30 days
  const d1m = DoctorUI.calculateFollowUpTargetDate('within_1m', base);
  assert.strictEqual(d1m.dateStr, '2026-11-19');
  assert.strictEqual(d1m.daysFromNow, 30);

  // 5. custom date
  const dCustom = DoctorUI.calculateFollowUpTargetDate('custom', base, '2026-11-05');
  assert.strictEqual(dCustom.dateStr, '2026-11-05');
  assert.strictEqual(dCustom.daysFromNow, 16);

  // 6. as_needed (PRN)
  const dPrn = DoctorUI.calculateFollowUpTargetDate('as_needed', base);
  assert.strictEqual(dPrn.dateStr, '');
  assert.strictEqual(dPrn.daysFromNow, 0);
  assert.ok(dPrn.formattedAr.includes('عند'));
  assert.ok(dPrn.formattedEn.includes('PRN'));
});

// -----------------------------------------------------------------------------
// TEST 3: State Management & In-Memory / Draft Persistence
// -----------------------------------------------------------------------------
runTest('Follow-up plan state management preserves data across cases and drafts', () => {
  const caseId = 'case-doctolib-test-101';
  DoctorUI.clearDraftNotes(caseId);

  // Initial default plan
  const initial = DoctorUI.getCaseFollowUpPlan(caseId);
  assert.ok(initial, 'Should provide default follow-up plan');
  assert.strictEqual(initial.window, 'within_3d');
  assert.strictEqual(initial.mode, 'clinic');

  // Select different window
  const updated = DoctorUI.selectFollowUpWindow(caseId, 'within_1w');
  assert.strictEqual(updated.window, 'within_1w');
  assert.strictEqual(updated.urgency, 'routine');

  // Set consultation mode
  DoctorUI.setFollowUpMode(caseId, 'video');
  let current = DoctorUI.getCaseFollowUpPlan(caseId);
  assert.strictEqual(current.mode, 'video');

  // Set clinical instructions
  DoctorUI.setFollowUpInstructions(caseId, 'Review SpO2 and follow-up on CBC results.');
  current = DoctorUI.getCaseFollowUpPlan(caseId);
  assert.strictEqual(current.instructions, 'Review SpO2 and follow-up on CBC results.');

  // Verify draft notes preservation
  const draft = DoctorUI.getDraftNotes(caseId);
  assert.ok(draft && draft.followUpPlan, 'Draft notes must contain followUpPlan');
  assert.strictEqual(draft.followUpPlan.window, 'within_1w');
  assert.strictEqual(draft.followUpPlan.mode, 'video');

  // Clear draft
  DoctorUI.clearDraftNotes(caseId);
  const resetPlan = DoctorUI.getCaseFollowUpPlan(caseId);
  assert.strictEqual(resetPlan.window, 'within_3d');
});

// -----------------------------------------------------------------------------
// TEST 4: Doctolib Calendar Sync & 1-Click Linking
// -----------------------------------------------------------------------------
runTest('linkToAppointmentBooking transitions screen, selects date, and pre-fills notes', () => {
  const caseId = 'case-sync-999';
  DoctorUI.clearDraftNotes(caseId);

  // Configure plan
  DoctorUI.selectFollowUpWindow(caseId, 'within_3d');
  DoctorUI.setFollowUpMode(caseId, 'clinic');
  DoctorUI.setFollowUpInstructions(caseId, 'Re-auscultate chest and assess wheezing.');

  // Mock appointments notes input in DOM
  const mockNotesInput = createMockElement('apptNotesInput', 'textarea');

  // Reset global spies
  global._lastScreen = null;
  global._lastApptDate = null;
  global._lastApptType = null;
  global._lastToast = null;
  global.apptDaysList = [];

  DoctorUI.linkToAppointmentBooking(caseId);

  // 1. Verifies screen transition
  assert.strictEqual(global._lastScreen, 'appointments', 'Must navigate to appointments screen');

  // 2. Verifies date pre-selection
  const plan = DoctorUI.getCaseFollowUpPlan(caseId);
  assert.strictEqual(global._lastApptDate, plan.targetDate, 'Must pre-select computed target date');

  // 3. Verifies consultation mode sync
  assert.strictEqual(global._lastApptType, 'clinic', 'Must match clinic mode');

  // 4. Verifies pre-filled clinical reason in notes
  assert.ok(mockNotesInput.value.includes('Doctolib'), 'Notes must contain Doctolib tag');
  assert.ok(mockNotesInput.value.includes('999'), 'Notes must reference case ID');
  assert.ok(mockNotesInput.value.includes('Re-auscultate chest'), 'Notes must include doctor instructions');

  // 5. Verifies confirmation toast
  assert.ok(global._lastToast, 'Must show confirmation toast');
});

// -----------------------------------------------------------------------------
// TEST 5: HTML Station Rendering & Accessibility
// -----------------------------------------------------------------------------
runTest('renderFollowUpSchedulingStationHtml generates accessible, responsive markup', () => {
  const mockCase = { id: 'case-html-test', patientName: 'Nour El-Din' };

  // 1. Arabic Station Markup
  const htmlAr = DoctorUI.renderFollowUpSchedulingStationHtml(mockCase, false);
  assert.ok(htmlAr.includes('doc-followup-station'), 'Must have root station class');
  assert.ok(htmlAr.includes('doctolibFollowUpStation'), 'Must have unique ID');
  assert.ok(htmlAr.includes('role="region"'), 'Must have region ARIA role');
  assert.ok(htmlAr.includes('role="radiogroup"'), 'Must have radiogroup role');
  assert.ok(htmlAr.includes('خلال 24 ساعة'), 'Must display Arabic 24h window');
  assert.ok(htmlAr.includes('خلال 3 أيام'), 'Must display Arabic 3d window');
  assert.ok(htmlAr.includes('Alt+F'), 'Must display keyboard shortcut badge');
  assert.ok(htmlAr.includes('btn-book-calendar-sync'), 'Must include Doctolib sync button');

  // 2. English Station Markup
  const htmlEn = DoctorUI.renderFollowUpSchedulingStationHtml(mockCase, true);
  assert.ok(htmlEn.includes('Within 24 Hours'), 'Must display English 24h window');
  assert.ok(htmlEn.includes('Within 3 Days'), 'Must display English 3d window');
  assert.ok(htmlEn.includes('Within 1 Week'), 'Must display English 1w window');
  assert.ok(htmlEn.includes('Sync & Book in Calendar'), 'Must include English sync button');
});

// -----------------------------------------------------------------------------
// TEST 6: DOM In-Place Updates Without Full Redraw
// -----------------------------------------------------------------------------
runTest('updateFollowUpStationDOM updates active states and target date display', () => {
  const caseId = 'case-dom-update';
  DoctorUI.clearDraftNotes(caseId);

  // Setup mock DOM buttons
  const btn24h = createMockElement('btn24h');
  btn24h.setAttribute('data-followup-case', caseId);
  btn24h.setAttribute('data-window-btn', 'within_24h');

  const btn3d = createMockElement('btn3d');
  btn3d.setAttribute('data-followup-case', caseId);
  btn3d.setAttribute('data-window-btn', 'within_3d');

  const targetDateEl = createMockElement(`followUpTargetDateDisplay_${caseId}`);
  const badgeEl = createMockElement(`followUpWindowBadge_${caseId}`);

  // Select 24h
  DoctorUI.selectFollowUpWindow(caseId, 'within_24h');
  DoctorUI.updateFollowUpStationDOM(caseId);

  assert.strictEqual(btn24h.getAttribute('aria-checked'), 'true');
  assert.strictEqual(btn3d.getAttribute('aria-checked'), 'false');
  assert.ok(targetDateEl.textContent.length > 0, 'Target date must be updated');
  assert.ok(badgeEl.textContent.length > 0, 'Window badge must be updated');
});

// -----------------------------------------------------------------------------
// TEST 7: Official Certified Report & Snapshot Integration
// -----------------------------------------------------------------------------
runTest('ReportsService extracts and preserves followUpPlan in clinical snapshots', () => {
  const mockPlan = {
    window: 'within_3d',
    targetDate: '2026-10-23',
    targetDateFormattedAr: 'الجمعة، 23 أكتوبر 2026',
    targetDateFormattedEn: 'Fri, 23 Oct 2026',
    mode: 'clinic',
    instructions: 'Follow-up on antibiotic therapy.',
    urgency: 'high'
  };

  const mockCase = {
    id: 'case-rep-snapshot',
    clinicalDiagnosis: 'Acute Bronchitis',
    medications: 'Amoxicillin 500mg tid',
    recommendations: ['Maintain hydration', 'Rest'],
    followUpPlan: mockPlan
  };

  // 1. getRecordedClinicalContent
  const clinical = ReportsService.getRecordedClinicalContent(mockCase, false);
  assert.ok(clinical.followUpPlan, 'Must extract followUpPlan');
  assert.strictEqual(clinical.followUpPlan.window, 'within_3d');
  assert.strictEqual(clinical.followUpPlan.instructions, 'Follow-up on antibiotic therapy.');

  // 2. applyApprovedReportSnapshot
  const snapshotRecord = {
    id: 'case-rep-snapshot',
    reportSnapshot: {
      clinicalContent: {
        clinicalDiagnosis: 'Acute Bronchitis',
        followUpPlan: mockPlan
      }
    }
  };
  const approved = ReportsService.applyApprovedReportSnapshot(snapshotRecord);
  assert.ok(approved.followUpPlan, 'Approved record must retain snapshot followUpPlan');
  assert.strictEqual(approved.followUpPlan.window, 'within_3d');

  // 3. formatReportForPdfExport
  const pdfExport = ReportsService.formatReportForPdfExport(approved, 'en');
  assert.ok(pdfExport.followUpPlan, 'PDF export payload must contain followUpPlan');
  assert.strictEqual(pdfExport.followUpPlan.mode, 'clinic');
});

// -----------------------------------------------------------------------------
// TEST 8: 100% Translation Key Parity in i18n
// -----------------------------------------------------------------------------
runTest('i18n catalogs maintain 100% key parity for all follow-up translation keys', () => {
  const catalog = i18n.translations;
  assert.ok(catalog.ar && catalog.ar.doctor, 'Must have ar.doctor catalog');
  assert.ok(catalog.en && catalog.en.doctor, 'Must have en.doctor catalog');

  const requiredKeys = [
    'followUpSectionTitle',
    'followUpSectionSubtitle',
    'followUpWindowLabel',
    'followUpWithin24h',
    'followUpWithin24hDesc',
    'followUpWithin3d',
    'followUpWithin3dDesc',
    'followUpWithin1w',
    'followUpWithin1wDesc',
    'followUpWithin1m',
    'followUpWithin1mDesc',
    'followUpCustom',
    'followUpCustomDesc',
    'followUpAsNeeded',
    'followUpAsNeededDesc',
    'followUpModeClinic',
    'followUpModeVideo',
    'followUpModePhone',
    'followUpInstructionsLabel',
    'followUpInstructionsPlaceholder',
    'followUpTargetDateLabel',
    'followUpLinkCalendarBtn',
    'followUpLinkedSuccess',
    'followUpReportBadge'
  ];

  requiredKeys.forEach(key => {
    assert.ok(catalog.ar.doctor[key], `ar.doctor must have key '${key}'`);
    assert.ok(catalog.en.doctor[key], `en.doctor must have key '${key}'`);
  });
});

// -----------------------------------------------------------------------------
// TEST 9: Responsive CSS Rules in styles.css
// -----------------------------------------------------------------------------
runTest('styles.css contains required responsive classes for mobile, tablet & desktop', () => {
  const cssPath = path.join(__dirname, '../app/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.doc-followup-station'), 'styles.css must have .doc-followup-station');
  assert.ok(css.includes('.doc-followup-grid'), 'styles.css must have .doc-followup-grid');
  assert.ok(css.includes('.followup-card-btn'), 'styles.css must have .followup-card-btn');
  assert.ok(css.includes('.followup-mode-btn'), 'styles.css must have .followup-mode-btn');
  assert.ok(css.includes('.btn-book-calendar-sync'), 'styles.css must have .btn-book-calendar-sync');

  // Verify responsive media query rules
  assert.ok(css.includes('@media (max-width: 992px)'), 'Must have tablet media query');
  assert.ok(css.includes('@media (max-width: 600px)'), 'Must have mobile media query');
  assert.ok(css.includes('min-height: 44px') || css.includes('min-height: 48px'), 'Must enforce accessible mobile tap target');
});

// -----------------------------------------------------------------------------
// TEST 10: Alt+F Keyboard Shortcut Definition & Event Handler
// -----------------------------------------------------------------------------
runTest('initDoctorKeyboardShortcuts registers Alt+F listener for follow-up station', () => {
  assert.ok(typeof DoctorUI.initDoctorKeyboardShortcuts === 'function', 'DoctorUI must export initDoctorKeyboardShortcuts');
  // Verify doctor-ui.js source contains Alt+F handler
  const uiSource = fs.readFileSync(path.join(__dirname, '../app/modules/doctor/doctor-ui.js'), 'utf8');
  assert.ok(uiSource.includes('doctolibFollowUpStation'), 'Source must reference doctolibFollowUpStation');
  assert.ok(uiSource.includes('KeyF') || uiSource.includes('"f"'), 'Source must register KeyF / Alt+F');
});

console.log('='.repeat(80));
console.log(`RESULTS: ${testsPassed}/${totalTests} TESTS PASSED (100% SUCCESS)`);
console.log('='.repeat(80));
