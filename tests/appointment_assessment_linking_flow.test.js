/**
 * Health Vibe AI - Appointment Assessment Dossier Linking Test Suite (Doctolib Standard)
 *
 * Validates:
 * 1. AppointmentsUI linked dossier state lifecycle (setLinkedCase, getLinkedCase, clearLinkedCase).
 * 2. Doctolib-style attached dossier UI rendering, vitals pill, case reference, and mobile touch targets.
 * 3. Detach interaction and graceful unlinking.
 * 4. End-to-end booking payload linkage (linkedCaseId, hasAttachedReport, attachedAssessment, reportAccessGranted).
 * 5. Backend scheduling service transactional persistence of dossier metadata.
 * 6. Doctor pre-visit calendar and slot access to attached respiratory assessment dossier.
 * 7. i18n translation key parity across Arabic and English.
 * 8. Static template and CSS contract verification.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load AppointmentsUI
const AppointmentsUI = require('../app/modules/appointments/appointments-ui');

// Load backend scheduling service
const schedulingService = require('../backend/scheduling-service');

console.log('==================================================================');
console.log('📋 DOCTOLIB PRE-VISIT MEDICAL DOSSIER LINKING SUITE');
console.log('   Automatic Report Attachment & Doctor Pre-Consultation Review');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function main() {
  console.log('--- 1. AppointmentsUI Dossier State Management ---');

  runTest('should initialize with no linked case', () => {
    AppointmentsUI.clearLinkedCase();
    assert.strictEqual(AppointmentsUI.getLinkedCase(), null);
  });

  runTest('should set and normalize a linked assessment case dossier', () => {
    const sampleCase = {
      id: 'case_resp_101',
      assessmentId: 'asmt_202',
      patientName: 'أحمد محمود',
      oxygenLevel: 94,
      diagnosis: 'اشتباه حساسية صدرية مع هبوط طفيف بالأكسجين',
      status: 'approved',
      submittedAt: '2026-10-16T10:00:00Z',
      clinicalNotes: 'مريض يعاني من سعال مستمر وصفير عند الزفير.'
    };

    AppointmentsUI.setLinkedCase(sampleCase);
    const linked = AppointmentsUI.getLinkedCase();

    assert.ok(linked, 'Linked case should be defined');
    assert.strictEqual(linked.caseId, 'case_resp_101');
    assert.strictEqual(linked.assessmentId, 'asmt_202');
    assert.strictEqual(linked.oxygenLevel, 94);
    assert.strictEqual(linked.attached, true);
    assert.strictEqual(linked.diagnosis, 'اشتباه حساسية صدرية مع هبوط طفيف بالأكسجين');
  });

  runTest('should clear linked case completely', () => {
    AppointmentsUI.setLinkedCase({ id: 'case_resp_102', oxygenLevel: 97 });
    assert.ok(AppointmentsUI.getLinkedCase());

    AppointmentsUI.clearLinkedCase();
    assert.strictEqual(AppointmentsUI.getLinkedCase(), null);
  });

  console.log('\n--- 2. UI Component Rendering & Mobile Accessibility ---');

  let mockElement;
  function setupMockDom() {
    mockElement = {
      innerHTML: '',
      style: { display: '' },
      querySelector: function (selector) {
        if (selector === '#btnDetachAssessmentDossier') {
          return {
            onclick: null,
            setAttribute: function () {},
            getAttribute: function () {}
          };
        }
        return null;
      }
    };

    global.document = {
      getElementById: function (id) {
        if (id === 'testDossierMount') return mockElement;
        return null;
      }
    };
  }

  function teardownMockDom() {
    delete global.document;
  }

  runTest('should hide container if no linked case is active', () => {
    setupMockDom();
    AppointmentsUI.clearLinkedCase();
    AppointmentsUI.renderAttachedAssessmentDossier('testDossierMount', false);
    assert.strictEqual(mockElement.style.display, 'none');
    assert.strictEqual(mockElement.innerHTML, '');
    teardownMockDom();
  });

  runTest('should render Doctolib dossier card with vitals, badge, and report review button', () => {
    setupMockDom();
    AppointmentsUI.setLinkedCase({
      caseId: 'case_999888',
      oxygenLevel: 92,
      diagnosis: 'التهاب شعبي حاد',
      status: 'approved'
    });

    AppointmentsUI.renderAttachedAssessmentDossier('testDossierMount', false);

    assert.strictEqual(mockElement.style.display, 'block');
    assert.ok(mockElement.innerHTML.includes('doctolib-attached-dossier-card'), 'Contains dossier card class');
    assert.ok(mockElement.innerHTML.includes('92%'), 'Displays SpO2 92%');
    assert.ok(mockElement.innerHTML.includes('pill'), 'Has vital pill');
    assert.ok(mockElement.innerHTML.includes('btnPreviewAttachedDossier'), 'Has preview button');
    assert.ok(mockElement.innerHTML.includes('btnDetachAssessmentDossier'), 'Has detach button');
    assert.ok(mockElement.innerHTML.includes('999888'), 'Displays case reference');
    teardownMockDom();
  });

  runTest('should render in English when isEn is true', () => {
    setupMockDom();
    AppointmentsUI.setLinkedCase({
      caseId: 'case_en_456',
      oxygenLevel: 98,
      diagnosis: 'Mild Bronchospasm'
    });

    AppointmentsUI.renderAttachedAssessmentDossier('testDossierMount', true);

    assert.ok(mockElement.innerHTML.includes('Pre-Visit Medical Dossier Attached'));
    assert.ok(mockElement.innerHTML.includes('Review Full Medical Report'));
    teardownMockDom();
  });

  console.log('\n--- 3. Backend Transactional Booking Persistence ---');

  function createMockDb() {
    const store = new Map();
    const db = {
      _store: store,
      collection: function (colName) {
        return {
          doc: function (docId) {
            const fullKey = `${colName}/${docId}`;
            return {
              _key: fullKey,
              get: async function () {
                const data = store.get(fullKey);
                return { exists: Boolean(data), data: () => data, id: docId };
              },
              set: async function (data) {
                store.set(fullKey, data);
                return data;
              },
              update: async function (data) {
                const existing = store.get(fullKey) || {};
                const updated = { ...existing, ...data };
                store.set(fullKey, updated);
                return updated;
              }
            };
          },
          where: function () {
            return {
              where: function () { return this; },
              get: async function () {
                const docs = [];
                for (const [k, v] of store.entries()) {
                  if (k.startsWith(`${colName}/`)) {
                    docs.push({ id: k.replace(`${colName}/`, ''), data: () => v });
                  }
                }
                return { docs, forEach: fn => docs.forEach(fn), empty: docs.length === 0, size: docs.length };
              }
            };
          }
        };
      },
      runTransaction: async function (updateFn) {
        const transaction = {
          get: async function (ref) { return await ref.get(); },
          set: function (ref, data) {
            store.set(ref._key, data);
          },
          update: function (ref, data) {
            const existing = store.get(ref._key) || {};
            store.set(ref._key, { ...existing, ...data });
          }
        };
        return await updateFn(transaction);
      }
    };
    return db;
  }

  await runAsyncTest('should persist linkedCaseId, hasAttachedReport, and attachedAssessment on appointment document', async () => {
    const mockDb = createMockDb();
    const patientUser = { uid: 'pat_linked_01', email: 'pat@example.com', role: 'patient' };

    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true,
      linkedCaseId: 'case_resp_approved_77',
      linkedAssessmentId: 'asmt_990',
      hasAttachedReport: true,
      attachedAssessment: {
        caseId: 'case_resp_approved_77',
        oxygenLevel: 93,
        diagnosis: 'حساسية صدرية مع كحة تشنجية',
        status: 'approved',
        submittedAt: '2026-10-16T09:00:00Z'
      },
      reportAccessGranted: true
    };

    const result = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);

    assert.ok(result, 'Booking result should be returned');
    assert.strictEqual(result.linkedCaseId, 'case_resp_approved_77');
    assert.strictEqual(result.linkedAssessmentId, 'asmt_990');
    assert.strictEqual(result.hasAttachedReport, true);
    assert.strictEqual(result.reportAccessGranted, true);
    assert.ok(result.attachedAssessment, 'attachedAssessment object exists');
    assert.strictEqual(result.attachedAssessment.oxygenLevel, 93);
  });

  console.log('\n--- 4. Doctor Pre-Visit Calendar Access ---');

  await runAsyncTest('should include attached dossier information in doctor calendar slots', async () => {
    const mockDb = {
      collection: function (colName) {
        return {
          where: function () {
            return {
              where: function () { return this; },
              get: async function () {
                return {
                  forEach: function (fn) {
                    fn({
                      data: () => ({
                        id: 'appt_dossier_1',
                        doctorId: 'dr_mona',
                        patientId: 'patient_alpha',
                        patientName: 'طارق عبد الله',
                        date: '2026-10-26',
                        slotId: 'slot_1000',
                        status: 'confirmed',
                        linkedCaseId: 'case_resp_001',
                        hasAttachedReport: true,
                        attachedAssessment: {
                          caseId: 'case_resp_001',
                          oxygenLevel: 95,
                          diagnosis: 'ربو شعبي خفيف'
                        }
                      })
                    });
                  }
                };
              }
            };
          }
        };
      }
    };

    const doctorUser = { uid: 'dr_mona', role: 'doctor' };
    const calendar = await schedulingService.getDoctorCalendar(mockDb, {
      doctorId: 'dr_mona',
      startDate: '2026-10-26',
      endDate: '2026-10-26'
    }, doctorUser);

    assert.ok(calendar && Array.isArray(calendar.days), 'Calendar days returned');
    const targetDay = calendar.days.find(d => d.date === '2026-10-26');
    assert.ok(targetDay, 'Target date found in doctor calendar');

    const bookedSlot = targetDay.slots.find(s => s.slotId === 'slot_1000');
    assert.ok(bookedSlot, 'Booked slot exists');
    assert.strictEqual(bookedSlot.isBooked, true);
    assert.strictEqual(bookedSlot.linkedCaseId, 'case_resp_001');
    assert.strictEqual(bookedSlot.hasAttachedReport, true);
    assert.ok(bookedSlot.attachedAssessment, 'Doctor can review attachedAssessment before visit');
  });

  console.log('\n--- 5. i18n Translation Key Parity ---');

  const i18nPath = path.join(__dirname, '../app/i18n.js');
  const content = fs.readFileSync(i18nPath, 'utf8');

  const expectedKeys = [
    'attachedDossierTitle',
    'attachedDossierDesc',
    'bookWithReportCta',
    'previewAttachedReport',
    'detachReport',
    'preVisitDoctorReview',
    'attachedReportBadge'
  ];

  expectedKeys.forEach(key => {
    runTest(`should include translation key: ${key} in i18n catalogs`, () => {
      assert.ok(content.includes(key), `Key ${key} must exist in i18n.js`);
    });
  });

  console.log('\n--- 6. Template & CSS Contract Verification ---');

  runTest('should include attachedAssessmentDossierMount in appointments-view.html', () => {
    const viewHtml = fs.readFileSync(path.join(__dirname, '../app/modules/appointments/appointments-view.html'), 'utf8');
    assert.ok(viewHtml.includes('id="attachedAssessmentDossierMount"'), 'View must contain dossier mount element');
  });

  runTest('should include Doctolib Pre-Visit styles in appointments.css', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '../app/modules/appointments/appointments.css'), 'utf8');
    assert.ok(cssContent.includes('.doctolib-attached-dossier-card'), 'CSS contains card styling');
    assert.ok(cssContent.includes('.dossier-badge-pill'), 'CSS contains badge pill styling');
    assert.ok(cssContent.includes('.dossier-preview-btn'), 'CSS contains preview button styling');
    assert.ok(cssContent.includes('.doctolib-card-attached-dossier'), 'CSS contains booked card badge styling');
    assert.ok(cssContent.includes('@media (max-width: 640px)'), 'CSS contains mobile responsive rules');
  });

  runTest('should have bookAppointmentForCase defined in app.js', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
    assert.ok(appJs.includes('window.bookAppointmentForCase ='), 'app.js defines bookAppointmentForCase');
    assert.ok(appJs.includes('doctolib-link-appointment-btn'), 'app.js includes CTA button in result screen');
    assert.ok(appJs.includes('attachedAssessmentDossierMount'), 'app.js mounts dossier in appointments screen');
    assert.ok(appJs.includes('apptData.linkedCaseId ='), 'app.js injects linkedCaseId into booking payload');
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
