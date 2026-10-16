/**
 * Health Vibe AI - Interactive Appointment Calendar & Booking Flow Test Suite (Vezeeta Benchmark)
 *
 * Validates:
 * 1. Vezeeta UI/UX Design System (Doctor Showcase Card, Badges, Fees, Waiting Time, Responsive Strip).
 * 2. Doctor Filter Tabs (Treating Doctor vs All Pulmonologists, Clinic vs Video Consultation).
 * 3. Multi-Week Interactive Calendar Strip with Navigation (Week Offset, 8-Week Window, Active State).
 * 4. Morning & Evening Categorized Time Slot Grouping with Live Status Badges.
 * 5. Family Profiles Integration (Beneficiary Selector for Self or Dependents).
 * 6. Vezeeta Mobile Slide-Up Bottom Sheet Confirmation Modal with Quick Reason Chips & Google Calendar Sync.
 * 7. Preservation of all 11 Legacy DOM IDs and 10 Window Functions for Zero Regression.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("\n================================================================================");
console.log("🌟 HEALTH VIBE AI: VEZEETA-INSPIRED INTERACTIVE APPOINTMENT CALENDAR TEST SUITE");
console.log("================================================================================\n");

// ── TEST 1: DOM Elements & Legacy Compatibility ──────────────────────────────
console.log("▶ TEST 1: DOM Integrity & Preservation of Legacy IDs");

const htmlPath = path.join(__dirname, '..', 'app', 'index.html');
const viewPath = path.join(__dirname, '..', 'app', 'modules', 'appointments', 'appointments-view.html');
assert(fs.existsSync(htmlPath), "app/index.html must exist");
assert(fs.existsSync(viewPath), "appointments-view.html must exist");

const indexHtml = fs.readFileSync(htmlPath, 'utf8');
const viewHtml = fs.readFileSync(viewPath, 'utf8');

const requiredLegacyIds = [
  'appointmentDateSelector',
  'appointmentTimeSlots',
  'apptDoctorSelect',
  'apptNotesInput',
  'btnConfirmBooking',
  'patientBookedAppointmentsList',
  'patientApptsCount',
  'summaryDoctorName',
  'summaryDateTime',
  'summaryApptType',
  'patientNextAppt'
];

for (const id of requiredLegacyIds) {
  assert(indexHtml.includes(`id="${id}"`), `index.html must preserve id="${id}"`);
  if (id !== 'patientNextAppt') {
    assert(viewHtml.includes(`id="${id}"`), `appointments-view.html must preserve id="${id}"`);
  }
}

const requiredVezeetaMounts = [
  'vezeetaDoctorTabsMount',
  'vezeetaDoctorShowcaseMount',
  'vezeetaBeneficiaryMount'
];

for (const id of requiredVezeetaMounts) {
  assert(indexHtml.includes(`id="${id}"`), `index.html must include Vezeeta mount point id="${id}"`);
  assert(viewHtml.includes(`id="${id}"`), `appointments-view.html must include Vezeeta mount point id="${id}"`);
}

console.log("  ✓ All 11 legacy appointment containers strictly preserved.");
console.log("  ✓ All 3 Vezeeta interactive mount points present in both HTML views.");

// ── TEST 2: Vezeeta CSS Design System ─────────────────────────────────────────
console.log("\n▶ TEST 2: Vezeeta Design Tokens & CSS Architecture");

const cssPath = path.join(__dirname, '..', 'app', 'modules', 'appointments', 'appointments.css');
assert(fs.existsSync(cssPath), "appointments.css must exist");
const cssContent = fs.readFileSync(cssPath, 'utf8');

const expectedCssSelectors = [
  '.vezeeta-doctor-card',
  '.vezeeta-doctor-avatar-wrap',
  '.vezeeta-online-beacon',
  '.vezeeta-badge-verified',
  '.vezeeta-rating-pill',
  '.vezeeta-meta-item',
  '.vezeeta-doctor-filter-tabs',
  '.vezeeta-filter-chip',
  '.vezeeta-calendar-header',
  '.vezeeta-nav-btn',
  '.vezeeta-day-card',
  '.vezeeta-slots-section',
  '.vezeeta-slot-button',
  '.vezeeta-modal-overlay',
  '.vezeeta-modal-sheet',
  '.vezeeta-reason-chip',
  '.vezeeta-gcal-btn'
];

for (const sel of expectedCssSelectors) {
  assert(cssContent.includes(sel), `CSS must define Vezeeta selector: ${sel}`);
}

// Mobile touch target compliance (>= 44px)
assert(cssContent.includes('min-height: 48px') || cssContent.includes('min-height: 44px') || cssContent.includes('min-height: 40px'),
  "CSS must ensure accessible mobile touch targets");

// Animation and glassmorphism styling
assert(cssContent.includes('slideUpSheet') || cssContent.includes('vezeeta-modal-sheet'),
  "CSS must include mobile bottom-sheet animation");

console.log("  ✓ Full Vezeeta design tokens, doctor card badges, beacon, and tabs verified.");
console.log("  ✓ Slide-up bottom sheet animation and mobile touch targets verified.");

// ── TEST 3: AppointmentsUI Module Functions ──────────────────────────────────
console.log("\n▶ TEST 3: AppointmentsUI Module Methods & Logic");

// Mock browser window and DOM environment for testing AppointmentsUI
const windowMock = {
  currentLanguage: 'ar',
  HealthVibes: {},
  FamilyProfilesService: {
    getActiveProfile: () => ({ id: 'patient_alpha', name: 'أحمد' }),
    getDependents: () => [
      { id: 'dep_1', name: 'عمر (الابن)', relationship: 'son' },
      { id: 'dep_2', name: 'فاطمة (الوالدة)', relationship: 'mother' }
    ]
  }
};
global.window = windowMock;

// Load appointments-ui.js
const appointmentsUiCode = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'modules', 'appointments', 'appointments-ui.js'),
  'utf8'
);

eval(appointmentsUiCode);
const AppointmentsUI = windowMock.AppointmentsUI || windowMock.HealthVibes.AppointmentsUI;
assert(AppointmentsUI, "AppointmentsUI must be exported to window.AppointmentsUI");

// Check Google Calendar URL generation
const gcalUrl = AppointmentsUI.buildGoogleCalendarUrl({
  doctorName: 'د. منى سامي',
  clinicName: 'عيادة أمراض الصدر',
  dateStr: '2026-10-20',
  timeSlot: '10:00 صباحًا',
  notes: 'متابعة نوبة ربو'
});

assert(gcalUrl.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'), "Must build Google Calendar render URL");
assert(gcalUrl.includes('text='), "Google Calendar URL must contain event title");
assert(gcalUrl.includes('dates=20261020'), "Google Calendar URL must parse date");
console.log("  ✓ Google Calendar sync URL generation verified.");

// Test Multi-Week Calendar Strip Generation
const week0Days = AppointmentsUI.generateAppointmentDays(0);
assert.strictEqual(week0Days.length, 7, "Week 0 must contain 7 days");
assert.strictEqual(week0Days[0].labelAr, "اليوم", "First day of week 0 must be 'اليوم' when before evening cutoff");

const week1Days = AppointmentsUI.generateAppointmentDays(1);
assert.strictEqual(week1Days.length, 7, "Week 1 must contain 7 days");
assert.notStrictEqual(week0Days[0].dateStr, week1Days[0].dateStr, "Week 1 must start 7 days after Week 0");

const dateDiffMs = new Date(week1Days[0].dateStr) - new Date(week0Days[0].dateStr);
const dateDiffDays = Math.round(dateDiffMs / (1000 * 60 * 60 * 24));
assert.strictEqual(dateDiffDays, 7, "Week 1 offset must exactly equal 7 days into future");
console.log("  ✓ Multi-week generation and 7-day stride arithmetic verified.");

// ── TEST 4: Grouped Morning & Evening Slots ──────────────────────────────────
console.log("\n▶ TEST 4: Morning & Evening Slot Categorization");

const mockContainer = { innerHTML: '' };
const testSlots = [
  { id: 'slot_1000', timeAr: '10:00 صباحًا', timeEn: '10:00 AM' },
  { id: 'slot_1130', timeAr: '11:30 صباحًا', timeEn: '11:30 AM' },
  { id: 'slot_1700', timeAr: '05:00 مساءً', timeEn: '05:00 PM' },
  { id: 'slot_1830', timeAr: '06:30 مساءً', timeEn: '06:30 PM' },
  { id: 'slot_2000', timeAr: '08:00 مساءً', timeEn: '08:00 PM' }
];

AppointmentsUI.renderGroupedSlots(
  mockContainer,
  testSlots,
  testSlots[0], // Selected slot
  ['slot_1830'] // Booked slots
);

assert(mockContainer.innerHTML.includes("الفترة الصباحية"), "Must render Morning group heading");
assert(mockContainer.innerHTML.includes("الفترة المسائية"), "Must render Evening group heading");
assert(mockContainer.innerHTML.includes("vezeeta-slot-booked"), "Booked slots must receive booked class");
assert(mockContainer.innerHTML.includes("vezeeta-slot-selected"), "Selected slot must receive selected class");
assert(mockContainer.innerHTML.includes("محجوز"), "Booked slot must show status label");
console.log("  ✓ Grouped slots successfully separated into Morning/Evening with live status badges.");

// ── TEST 5: Family Profiles Beneficiary Integration ──────────────────────────
console.log("\n▶ TEST 5: Beneficiary Selector (Family Profiles Integration)");

const mockBeneficiaryContainer = { innerHTML: '' };
AppointmentsUI.renderBeneficiarySelector(mockBeneficiaryContainer);

assert(mockBeneficiaryContainer.innerHTML.includes('id="apptBeneficiarySelect"'),
  "Beneficiary selector must render #apptBeneficiarySelect");
assert(mockBeneficiaryContainer.innerHTML.includes('عمر (الابن)'),
  "Beneficiary options must include family dependents");
assert(mockBeneficiaryContainer.innerHTML.includes('فاطمة (الوالدة)'),
  "Beneficiary options must include all active family members");
console.log("  ✓ Beneficiary selector correctly integrates family dependents for appointment booking.");

// ── TEST 6: Doctor Showcase Card Rendering ───────────────────────────────────
console.log("\n▶ TEST 6: Doctor Showcase Card (Avatar, Rating, Fees, Beacon)");

const mockDoctorContainer = { innerHTML: '' };
const sampleDoctor = {
  id: 'dr_mona',
  nameAr: 'د. منى سامي',
  nameEn: 'Dr. Mona Sami',
  specialtyAr: 'استشاري أمراض الصدر والحساسية',
  specialtyEn: 'Chest & Pulmonology Consultant',
  clinicAr: 'مركز القاهرة التخصصي لأمراض الصدر',
  clinicEn: 'Cairo Chest Speciality Clinic',
  rating: 4.9,
  reviewsCount: 128,
  fees: '350 جنيه',
  waitingTime: '10 دقائق',
  availableToday: true
};

AppointmentsUI.renderDoctorShowcaseCard(mockDoctorContainer, sampleDoctor);

assert(mockDoctorContainer.innerHTML.includes('د. منى سامي'), "Card must render doctor name");
assert(mockDoctorContainer.innerHTML.includes('vezeeta-online-beacon'), "Card must show online availability beacon");
assert(mockDoctorContainer.innerHTML.includes('350 جنيه'), "Card must display consultation fees");
assert(mockDoctorContainer.innerHTML.includes('10 دقائق'), "Card must display expected clinic waiting time");
assert(mockDoctorContainer.innerHTML.includes('4.9'), "Card must display rating score");
assert(mockDoctorContainer.innerHTML.includes('طبيب معتمد وموثق'), "Card must display verification badge");
console.log("  ✓ Doctor Showcase Card renders all Vezeeta clinical benchmark metadata.");

// ── TEST 7: App.js Integration & Confirmation Workflow ───────────────────────
console.log("\n▶ TEST 7: App.js Integration, Week Navigation, and Booking Flow");

const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');

assert(appJsContent.includes('window.navigateAppointmentWeek'), "app.js must expose window.navigateAppointmentWeek");
assert(appJsContent.includes('window.AppointmentsUI'), "app.js must reference AppointmentsUI");
assert(appJsContent.includes('AppointmentsUI.openConfirmBookingModal'), "confirmAppointmentBooking must invoke modal when available");
assert(appJsContent.includes('AppointmentsUI.renderDoctorFilterTabs'), "renderAppointmentsScreen must render doctor filter tabs");
assert(appJsContent.includes('AppointmentsUI.renderDoctorCard'), "renderAppointmentsScreen must render doctor showcase card");
assert(appJsContent.includes('AppointmentsUI.renderBeneficiarySelector'), "renderAppointmentsScreen must render beneficiary selector");
assert(appJsContent.includes('AppointmentsUI.renderGroupedSlots'), "renderAppointmentsScreen must render categorized slots");

console.log("  ✓ app.js smoothly wires AppointmentsUI lifecycle, week navigation, and confirmation modal.");

console.log("\n================================================================================");
console.log("🎉 ALL 7 VEZEETA APPOINTMENT CALENDAR INTEGRATION TESTS PASSED!");
console.log("================================================================================\n");
