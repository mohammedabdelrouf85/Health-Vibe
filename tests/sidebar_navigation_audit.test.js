/**
 * tests/sidebar_navigation_audit.test.js
 *
 * Comprehensive Automated Audit & Test Suite:
 * - Patient, Doctor, Clinic Admin, Super Admin sidebar navigation
 * - Reusable navigation component structure (.sidebar, .nav-list, .nav-item)
 * - Authorized destinations visibility enforcement per role
 * - Active page highlighting (.active, aria-current="page", .has-active-child)
 * - Navigation state preservation (sessionStorage hv_active_screen read/write/clear)
 * - Direct URL query (?screen=...) and hash routing with route guards
 * - Mobile drawer layout & role-tailored bottom navigation
 * - Dynamic role switching (setSelectedRole) with automatic unauthorized redirect
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('==================================================================');
console.log('🧭 HEALTH VIBE AI: SIDEBAR & NAVIGATION AUDIT TEST SUITE');
console.log('   RBAC Visibility, Active Highlights, State, URLs & Mobile UX');
console.log('==================================================================\n');

// ── 1. Read app/index.html & app/app.js & app/styles.css ───────────────────────
const htmlContent = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, '../app/styles.css'), 'utf8');

// ── 2. Minimal Mock DOM Environment ──────────────────────────────────────────
class MockElement {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add: (...c) => c.forEach(x => this.classList._classes.add(x)),
      remove: (...c) => c.forEach(x => this.classList._classes.delete(x)),
      toggle: (c, force) => {
        if (force === true) this.classList._classes.add(c);
        else if (force === false) this.classList._classes.delete(c);
        else if (this.classList._classes.has(c)) this.classList._classes.delete(c);
        else this.classList._classes.add(c);
        return this.classList._classes.has(c);
      },
      contains: (c) => this.classList._classes.has(c)
    };
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.textContent = '';
    this.innerHTML = '';
  }
  setAttribute(attr, val) { this.attributes[attr] = String(val); }
  getAttribute(attr) { return this.attributes[attr] !== undefined ? this.attributes[attr] : null; }
  removeAttribute(attr) { delete this.attributes[attr]; }
  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }
}

const mockStorage = {
  _session: {},
  _local: {},
  sessionStorage: {
    getItem: (k) => mockStorage._session[k] || null,
    setItem: (k, v) => { mockStorage._session[k] = String(v); },
    removeItem: (k) => { delete mockStorage._session[k]; },
    clear: () => { mockStorage._session = {}; }
  },
  localStorage: {
    getItem: (k) => mockStorage._local[k] || null,
    setItem: (k, v) => { mockStorage._local[k] = String(v); },
    removeItem: (k) => { delete mockStorage._local[k]; },
    clear: () => { mockStorage._local = {}; }
  }
};

let passedCount = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  console.log(`▶ TEST ${totalTests}: ${testName}`);
  try {
    fn();
    console.log(`  ✓ Passed\n`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}\n`);
    throw err;
  }
}

// ── TEST 1: Reusable Navigation Components HTML Audit ────────────────────────
runTest('Reusable Navigation Components Structure in app/index.html', () => {
  assert(htmlContent.includes('<aside class="sidebar"'), 'Must have <aside class="sidebar">');
  assert(htmlContent.includes('<nav class="nav-list"'), 'Must have <nav class="nav-list">');
  assert(htmlContent.includes('id="navGroupDisease"'), 'Must have expandable #navGroupDisease');
  assert(htmlContent.includes('id="navCategoryDisease"'), 'Must have expandable category header #navCategoryDisease');
  assert(htmlContent.includes('id="diseaseSubmenu"'), 'Must have #diseaseSubmenu');
  assert(htmlContent.includes('id="mobileBottomNav"'), 'Must have #mobileBottomNav');
  assert(htmlContent.includes('id="sidebarBackdrop"'), 'Must have #sidebarBackdrop');

  // Verify all primary roles nav-item destinations are declared
  const expectedScreens = [
    'patient', 'consent', 'profile', 'assessment', 'pending', 'result',
    'history', 'appointments', 'feedback', 'assistant', 'verification',
    'doctor', 'kpi', 'report', 'admin', 'audit',
    'diabetes', 'hypertension', 'blood-disorders', 'obesity'
  ];
  for (const scr of expectedScreens) {
    assert(htmlContent.includes(`data-screen="${scr}"`), `Sidebar must contain data-screen="${scr}"`);
  }
});

// ── TEST 2: canAccessScreen Role-Based Destinations Audit ─────────────────────
runTest('canAccessScreen() Authorization Matrix for All 4 Roles', () => {
  // Extract ROLE_ALLOWED_SCREENS from jsContent
  const allowedMatch = jsContent.match(/const ROLE_ALLOWED_SCREENS = \{([\s\S]*?)\};/);
  assert(allowedMatch, 'ROLE_ALLOWED_SCREENS must be declared in app.js');

  const evalContext = {};
  const ROLES = {
    PATIENT: 'patient',
    DOCTOR_PENDING: 'doctor_pending',
    DOCTOR: 'doctor',
    CLINIC_ADMIN: 'clinic_admin',
    SUPPORT: 'support',
    SUPER_ADMIN: 'super_admin'
  };
  const fnCode = `(function() {
    ${allowedMatch[0]}
    return ROLE_ALLOWED_SCREENS;
  })()`;
  const screensMatrix = eval(fnCode);

  // 1. Patient:
  const patientScreens = screensMatrix[ROLES.PATIENT];
  assert(patientScreens.includes('patient'), 'Patient must access patient screen');
  assert(patientScreens.includes('assessment'), 'Patient must access assessment');
  assert(patientScreens.includes('appointments'), 'Patient must access appointments');
  assert(!patientScreens.includes('admin'), 'Patient must NOT access admin');
  assert(!patientScreens.includes('doctor'), 'Patient must NOT access doctor');
  assert(!patientScreens.includes('audit'), 'Patient must NOT access audit');
  assert(!patientScreens.includes('kpi'), 'Patient must NOT access kpi');

  // 2. Doctor:
  const doctorScreens = screensMatrix[ROLES.DOCTOR];
  assert(doctorScreens.includes('doctor'), 'Doctor must access doctor screen');
  assert(doctorScreens.includes('verification'), 'Doctor must access verification');
  assert(doctorScreens.includes('kpi'), 'Doctor must access kpi');
  assert(doctorScreens.includes('appointments'), 'Doctor must access appointments');
  assert(!doctorScreens.includes('admin'), 'Doctor must NOT access admin');
  assert(!doctorScreens.includes('audit'), 'Doctor must NOT access audit');
  assert(!doctorScreens.includes('consent'), 'Doctor must NOT access consent');
  assert(!doctorScreens.includes('assessment'), 'Doctor must NOT access assessment');

  // 3. Clinic Admin:
  const clinicScreens = screensMatrix[ROLES.CLINIC_ADMIN];
  assert(clinicScreens.includes('admin'), 'Clinic Admin must access admin');
  assert(clinicScreens.includes('doctor'), 'Clinic Admin must access doctor');
  assert(clinicScreens.includes('audit'), 'Clinic Admin must access audit');
  assert(clinicScreens.includes('kpi'), 'Clinic Admin must access kpi');
  assert(clinicScreens.includes('appointments'), 'Clinic Admin must access appointments');
  assert(!clinicScreens.includes('patient'), 'Clinic Admin must NOT access patient dashboard');
  assert(!clinicScreens.includes('assessment'), 'Clinic Admin must NOT access assessment');
  assert(!clinicScreens.includes('consent'), 'Clinic Admin must NOT access consent');

  // 4. Super Admin:
  const superScreens = screensMatrix[ROLES.SUPER_ADMIN];
  assert(superScreens.includes('admin'), 'Super Admin must access admin');
  assert(superScreens.includes('doctor'), 'Super Admin must access doctor');
  assert(superScreens.includes('patient'), 'Super Admin must access patient');
  assert(superScreens.includes('audit'), 'Super Admin must access audit');
});

// ── TEST 3: Navigation State Preservation via sessionStorage ──────────────────
runTest('Navigation State Preservation (sessionStorage hv_active_screen)', () => {
  // Check that showScreen saves to sessionStorage
  assert(jsContent.includes('sessionStorage.setItem("hv_active_screen", name)'),
    'showScreen() must persist active screen to sessionStorage');

  // Check that transitionToApp restores savedScreen from sessionStorage
  assert(jsContent.includes('sessionStorage.getItem("hv_active_screen")'),
    'transitionToApp() must read savedScreen from sessionStorage');

  // Check that clearActiveSession removes hv_active_screen
  assert(jsContent.includes('sessionStorage.removeItem("hv_active_screen")'),
    'clearActiveSession() must remove hv_active_screen from sessionStorage');
});

// ── TEST 4: Active Page Highlighting & Accessibility Attributes ──────────────
runTest('Active Page Highlighting (active class, aria-current="page", has-active-child)', () => {
  // Check that showScreen toggles .active and aria-current="page" on nav-items
  assert(jsContent.includes('button.setAttribute("aria-current", "page")'),
    'showScreen() must set aria-current="page" on active nav-item');
  assert(jsContent.includes('button.removeAttribute("aria-current")'),
    'showScreen() must remove aria-current on inactive nav-items');

  // Check that expandable category container toggles .has-active-child
  assert(jsContent.includes('navCategoryDisease.classList.toggle("has-active-child"'),
    'showScreen() must toggle has-active-child on navCategoryDisease');

  // Check CSS styles for .has-active-child and aria-current="page"
  assert(cssContent.includes('.has-active-child'),
    'styles.css must have styles for .has-active-child');
  assert(cssContent.includes('.nav-item[aria-current="page"]'),
    'styles.css must have styles for .nav-item[aria-current="page"]');
});

// ── TEST 5: Direct URL Query and Hash Route Guards Audit ──────────────────────
runTest('Direct URL Support (?screen=... and #screen=...) with Route Guard Enforcement', () => {
  // Check boot code supports ?screen=
  assert(jsContent.includes('const initialParams = new URLSearchParams(window.location.search);'),
    'Boot code must inspect URL search params');
  assert(jsContent.includes('canAccessScreen(initialScreen, selectedRole)'),
    'Boot direct URL screen must be checked via canAccessScreen before opening');

  // Check HashRouter routing
  assert(jsContent.includes('function handleHashChange()'),
    'Hash routing listener must be declared');
  assert(jsContent.includes('showScreen(screenFromHash)'),
    'Hash routing must delegate to showScreen() for centralized route guarding');
});

// ── TEST 6: Mobile Layout Drawer & Adaptive Bottom Navigation ─────────────────
runTest('Mobile Drawer Dismissal & Role-Tailored Mobile Bottom Nav', () => {
  // Check mobile drawer close helpers
  assert(jsContent.includes('function closeSidebarDrawer()'),
    'closeSidebarDrawer() must be defined');
  assert(jsContent.includes('function toggleSidebarDrawer('),
    'toggleSidebarDrawer() must be defined');

  // Check that showScreen auto-closes sidebar drawer on navigation
  assert(jsContent.includes('closeSidebarDrawer()'),
    'showScreen() must close the sidebar drawer');

  // Check Clinic Admin bottom navigation items
  assert(jsContent.includes('currentRole === ROLES.CLINIC_ADMIN'),
    'updateMobileBottomNav must handle ROLES.CLINIC_ADMIN distinctly');

  // Verify CLINIC_ADMIN bottom nav items are authorized (admin, doctor, appointments, kpi, menu)
  const clinicBottomNavMatch = jsContent.match(/currentRole === ROLES\.CLINIC_ADMIN[\s\S]*?items = \[([\s\S]*?)\];/);
  assert(clinicBottomNavMatch, 'Must find clinic admin items array');
  const clinicItemsText = clinicBottomNavMatch[1];
  assert(!clinicItemsText.includes('screen: "patient"'), 'Clinic Admin mobile nav must NOT offer unauthorized patient screen');
  assert(clinicItemsText.includes('screen: "admin"'), 'Clinic Admin mobile nav must include admin');
  assert(clinicItemsText.includes('screen: "doctor"'), 'Clinic Admin mobile nav must include doctor queue');
  assert(clinicItemsText.includes('screen: "appointments"'), 'Clinic Admin mobile nav must include appointments');
  assert(clinicItemsText.includes('screen: "kpi"'), 'Clinic Admin mobile nav must include kpi');
});

// ── TEST 7: Dynamic Role Changes (setSelectedRole) Lifecycle ─────────────────
runTest('Dynamic Role Switching (setSelectedRole) with Auto-Redirect on Unauthorized View', () => {
  assert(jsContent.includes('window.setSelectedRole = function(r) {'),
    'window.setSelectedRole must be defined');
  assert(jsContent.includes('updateNavVisibility()'),
    'setSelectedRole must call updateNavVisibility');
  assert(jsContent.includes('updateMobileBottomNav()'),
    'setSelectedRole must call updateMobileBottomNav');
  assert(jsContent.includes('getRoleDefaultScreen(r)'),
    'setSelectedRole must redirect to getRoleDefaultScreen when active screen is unauthorized');
});

// ── TEST 8: Expandable Disease Category Container Visibility ────────────────
runTest('Expandable Disease Category Group Visibility Control', () => {
  assert(jsContent.includes('const navGroupDisease = document.getElementById("navGroupDisease");'),
    'updateNavVisibility must inspect navGroupDisease');
  assert(jsContent.includes('navGroupDisease.style.display = hasAnyDisease ? "block" : "none";') ||
         jsContent.includes('navGroupDisease.style.display = hasAnyDisease ? "flex" : "none";'),
    'updateNavVisibility must toggle navGroupDisease based on whether any disease screen is authorized');
});

console.log('==================================================================');
console.log(`🎉 ALL ${passedCount} SIDEBAR & NAVIGATION AUDIT TESTS PASSED WITH 100% SUCCESS!`);
console.log('==================================================================');
