/**
 * HEALTH VIBE AI: LAB UPLOAD INTEGRATION QA & EDGE CASES TEST SUITE
 *
 * Verifies end-to-end integration and edge cases across:
 * 1. File boundary conditions: exactly 10MB passes, 10MB + 1 byte fails, 0 bytes fails.
 * 2. Double extensions & malicious obfuscation defense (.pdf.exe, .jpg.sh, .png.php).
 * 3. Arabic Unicode filenames, special characters, and path traversal sanitization.
 * 4. Integration with Appointments: linking lab reports to pre-visit consultation packages.
 * 5. Integration with AI Chatbot: context generation, non-replacement directives, panic values.
 * 6. Integration with Unified Patient Timeline: multi-source aggregation, bilingual badges.
 * 7. Integration with Doctor Queue & Case Workflow: case attachment, category filtering.
 * 8. 100% Bilingual Arabic & English parity across all categories, disclaimers, and UI strings.
 * 9. Backend Server API endpoints completeness and routing integrity.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const labUploadService = require('../backend/lab-upload-service');
const timelineService = require('../backend/timeline-service');
const i18n = require('../app/i18n');

const {
  LAB_CATEGORIES,
  REVIEW_STATUS,
  CLINICAL_DISCLAIMERS,
  MAX_FILE_SIZE,
  SCAN_STATUS,
  AVAILABILITY,
  validateLabFileUpload,
  getSafeLabStorageFileName,
  registerLabFileUpload,
  linkLabReportToAppointment,
  getLabReportsForAppointment,
  generateChatbotLabContext,
  linkLabReportToCase,
  certifyLabReportByDoctor,
  getPatientLabReports
} = labUploadService;

// Mock in-memory database
function createMockDb() {
  const store = new Map();

  function getCol(name) {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  }

  return {
    _store: store,
    collection(name) {
      const col = getCol(name);
      return {
        doc(id) {
          return {
            async get() {
              const data = col.get(id);
              return {
                exists: Boolean(data),
                id,
                data: () => data ? { ...data } : undefined
              };
            },
            async set(data, opts = {}) {
              if (opts.merge && col.has(id)) {
                const prev = col.get(id);
                col.set(id, { ...prev, ...data });
              } else {
                col.set(id, { ...data });
              }
              return true;
            },
            async update(data) {
              const prev = col.get(id) || {};
              col.set(id, { ...prev, ...data });
              return true;
            }
          };
        },
        where(field, op, val) {
          const createQuery = (filters) => ({
            where(nextField, nextOp, nextVal) {
              return createQuery([...filters, { field: nextField, op: nextOp, val: nextVal }]);
            },
            limit(num) {
              return {
                async get() {
                  let results = Array.from(col.entries()).map(([id, data]) => ({ id, ...data }));
                  for (const f of filters) {
                    if (f.op === '==') {
                      results = results.filter(item => item[f.field] === f.val);
                    }
                  }
                  return {
                    docs: results.slice(0, num).map(data => ({
                      id: data.id,
                      data: () => data
                    }))
                  };
                }
              };
            },
            async get() {
              let results = Array.from(col.entries()).map(([id, data]) => ({ id, ...data }));
              for (const f of filters) {
                if (f.op === '==') {
                  results = results.filter(item => item[f.field] === f.val);
                }
              }
              return {
                docs: results.map(data => ({
                  id: data.id,
                  data: () => data
                }))
              };
            }
          });
          return createQuery([{ field, op, val }]);
        }
      };
    }
  };
}

async function runTestSuite() {
  console.log('\n==================================================================');
  console.log('🧪 HEALTH VIBE AI: LAB UPLOAD INTEGRATION QA & EDGE CASES');
  console.log('   Docus AI Benchmark: Appointments, Chatbot, Timeline & Bilingual');
  console.log('==================================================================\n');

  const db = createMockDb();
  const testPatient = { uid: 'patient_edge_001', role: 'patient', name: 'أحمد محمود رضوان' };
  const testDoctor = {
    uid: 'doctor_edge_002',
    role: 'doctor',
    verifiedDoctor: true,
    name: 'د. يوسف حسني',
    licenseNumber: 'EGY-MED-8491-PULM'
  };

  // =========================================================================
  // TEST 1: File Size Boundary Conditions (10MB Limit, Empty Files)
  // =========================================================================
  console.log('▶ TEST 1: File Size Boundary Conditions (10MB Exact Limit, 0-byte)');
  
  // Exact 10MB passes
  const exact10MB = 10 * 1024 * 1024;
  const valid10MB = validateLabFileUpload({
    fileName: 'large_cbc_scan.pdf',
    contentType: 'application/pdf',
    size: exact10MB
  });
  assert.strictEqual(valid10MB.isValid, true, 'Exactly 10MB must be valid');

  // 10MB + 1 byte fails
  assert.throws(
    () => validateLabFileUpload({
      fileName: 'too_large.pdf',
      contentType: 'application/pdf',
      size: exact10MB + 1
    }),
    err => err.code === 'FILE_TOO_LARGE' && err.statusCode === 400,
    '10MB + 1 byte must be rejected'
  );

  // 0 bytes fails
  assert.throws(
    () => validateLabFileUpload({
      fileName: 'empty.pdf',
      contentType: 'application/pdf',
      size: 0
    }),
    err => err.code === 'EMPTY_FILE' && err.statusCode === 400,
    '0-byte file must be rejected'
  );

  // Negative size fails
  assert.throws(
    () => validateLabFileUpload({
      fileName: 'negative.pdf',
      contentType: 'application/pdf',
      size: -100
    }),
    err => err.code === 'EMPTY_FILE' && err.statusCode === 400,
    'Negative size must be rejected'
  );
  console.log('  ✓ File size boundary strictly enforced: 10MB allowed, >10MB rejected, 0-byte rejected.');

  // =========================================================================
  // TEST 2: Double Extensions, Executable Obfuscation & Case-Insensitivity
  // =========================================================================
  console.log('\n▶ TEST 2: Double Extensions, Executable Obfuscation & Case-Insensitivity');

  // Double extension with executable terminal
  assert.throws(
    () => validateLabFileUpload({
      fileName: 'patient_results.pdf.exe',
      contentType: 'application/pdf',
      size: 50000
    }),
    err => err.code === 'UNSUPPORTED_EXTENSION' || err.code === 'BLOCKED_EXECUTABLE_EXTENSION',
    'report.pdf.exe must be rejected'
  );

  assert.throws(
    () => validateLabFileUpload({
      fileName: 'sputum_culture.jpg.sh',
      contentType: 'image/jpeg',
      size: 50000
    }),
    err => err.code === 'UNSUPPORTED_EXTENSION' || err.code === 'BLOCKED_EXECUTABLE_EXTENSION',
    'culture.jpg.sh must be rejected'
  );

  // Case-insensitive extensions and MIME types
  const upperCaseValid = validateLabFileUpload({
    fileName: 'ARTERIAL_BLOOD_GAS.PDF',
    contentType: 'APPLICATION/PDF',
    size: 200000
  });
  assert.strictEqual(upperCaseValid.isValid, true, 'Uppercase extensions and MIMEs must pass');

  const mixedCaseValid = validateLabFileUpload({
    fileName: 'sputum_smear.JpEg',
    contentType: 'image/jpeg',
    size: 150000
  });
  assert.strictEqual(mixedCaseValid.isValid, true, 'Mixed case extensions must pass');
  console.log('  ✓ Double extension attack vectors blocked; case-insensitive extensions parsed cleanly.');

  // =========================================================================
  // TEST 3: Arabic Filenames, Path Traversal & Long Name Sanitization
  // =========================================================================
  console.log('\n▶ TEST 3: Arabic Unicode Filenames, Path Traversal & Long Name Sanitization');

  // Arabic filename
  const arabicSafe = getSafeLabStorageFileName('تحليل وظائف كبد وكلى دم.pdf');
  assert.ok(arabicSafe.includes('تحليل_وظائف_كبد_وكلى_دم'), 'Arabic characters must be preserved in sanitized filename');
  assert.ok(arabicSafe.endsWith('.pdf'), 'Extension must be preserved');

  // Path Traversal injection
  const traversalSafe = getSafeLabStorageFileName('../../../etc/passwd.jpg');
  assert.ok(!traversalSafe.includes('../'), 'Path traversal characters must be sanitized');
  assert.ok(traversalSafe.endsWith('.jpg'), 'Extension must be preserved');

  // Windows illegal chars
  const illegalSafe = getSafeLabStorageFileName('lab:test*culture?file.png');
  assert.ok(!illegalSafe.includes(':') && !illegalSafe.includes('*') && !illegalSafe.includes('?'));
  assert.ok(illegalSafe.endsWith('.png'));

  // Extra long filename (> 255 chars)
  const longName = 'a'.repeat(300) + '.pdf';
  const truncatedSafe = getSafeLabStorageFileName(longName);
  assert.ok(truncatedSafe.length <= 90, 'Extremely long filename must be safely truncated');
  assert.ok(truncatedSafe.endsWith('.pdf'));
  console.log('  ✓ Arabic Unicode preserved; path traversal stripped; long names trimmed safely.');

  // =========================================================================
  // TEST 4: Integration with Appointments System
  // =========================================================================
  console.log('\n▶ TEST 4: Integration with Clinical Appointments System');

  // 1. Create a lab report
  const labReg = await registerLabFileUpload(db, {
    patientId: testPatient.uid,
    fileName: 'pre_visit_cbc.pdf',
    contentType: 'application/pdf',
    size: 300000,
    labCategory: 'blood_test',
    labNotes: 'تحاليل للمعاينة قبل موعد كشف الصدر'
  }, testPatient);

  // 2. Mock an existing appointment
  const apptId = 'appt_telehealth_901';
  await db.collection('appointments').doc(apptId).set({
    id: apptId,
    patientId: testPatient.uid,
    doctorId: testDoctor.uid,
    doctorName: testDoctor.name,
    date: '2026-10-25',
    timeSlot: '07:00 PM',
    status: 'confirmed',
    attachedLabReportIds: []
  });

  // 3. Link lab report to appointment
  const linkApptRes = await linkLabReportToAppointment(db, {
    fileId: labReg.fileId,
    appointmentId: apptId
  }, testPatient);

  assert.strictEqual(linkApptRes.success, true);
  assert.strictEqual(linkApptRes.appointmentId, apptId);

  // 4. Retrieve lab reports for appointment
  const apptReports = await getLabReportsForAppointment(db, apptId, testDoctor);
  assert.strictEqual(apptReports.length, 1);
  assert.strictEqual(apptReports[0].id, labReg.fileId);
  assert.strictEqual(apptReports[0].labCategory, 'blood_test');
  console.log('  ✓ Lab report linked to appointment package and retrieved for doctor pre-consultation.');

  // =========================================================================
  // TEST 5: Integration with AI Chatbot & Clinical Assistant
  // =========================================================================
  console.log('\n▶ TEST 5: Integration with AI Chatbot & Clinical Assistant');

  // 1. Generate Arabic chatbot context
  const chatContextAr = await generateChatbotLabContext(db, testPatient.uid, { lang: 'ar' });
  assert.strictEqual(chatContextAr.hasReports, true);
  assert.ok(chatContextAr.context.includes('ملخص التحاليل المرفوعة للمريض'));
  assert.ok(chatContextAr.context.includes(CLINICAL_DISCLAIMERS.ar.slice(0, 30)));
  assert.ok(chatContextAr.context.includes('pre_visit_cbc.pdf'));

  // 2. Generate English chatbot context
  const chatContextEn = await generateChatbotLabContext(db, testPatient.uid, { lang: 'en' });
  assert.strictEqual(chatContextEn.hasReports, true);
  assert.ok(chatContextEn.context.includes('Uploaded Lab Reports Summary'));
  assert.ok(chatContextEn.context.includes('pre_visit_cbc.pdf'));

  // 3. Upload a Critical ABG lab report and test Chatbot panic escalation
  const abgPanicReg = await registerLabFileUpload(db, {
    patientId: testPatient.uid,
    fileName: 'emergency_abg.pdf',
    contentType: 'application/pdf',
    size: 250000,
    labCategory: 'abg_gas',
    extractedValues: { pO2: 50, pH: 7.20 } // Critical hypoxemia + acidosis
  }, testPatient);

  const panicChatContext = await generateChatbotLabContext(db, testPatient.uid, { lang: 'ar' });
  assert.strictEqual(panicChatContext.hasPanicValue, true);
  assert.ok(panicChatContext.context.includes('⚠️ توجد مؤشرات حرجة تتطلب التوجيه الفوري للطوارئ.'));
  console.log('  ✓ AI Chatbot receives non-diagnostic lab context; triggers immediate ER warning on panic values.');

  // =========================================================================
  // TEST 6: Integration with Unified Patient Timeline & EHR
  // =========================================================================
  console.log('\n▶ TEST 6: Integration with Unified Patient Timeline (Bilingual Badges)');

  // Feed the mock DB with case_files containing our registered lab report
  const timelineResult = await timelineService.buildPatientTimeline({
    patientId: testPatient.uid,
    db,
    requestingUser: testPatient
  });


  assert.ok(Array.isArray(timelineResult.timeline), 'Timeline items must be an array');
  const labTimelineItems = timelineResult.timeline.filter(item => item.category === 'lab_report');
  assert.ok(labTimelineItems.length >= 1, 'Timeline must include aggregated lab report items');


  const firstLabItem = labTimelineItems[0];
  assert.ok(firstLabItem.title.includes('🧪 فحص معملي'), 'Arabic title must feature lab badge');
  assert.ok(firstLabItem.titleEn.includes('🧪 Laboratory Test'), 'English title must feature lab badge');
  assert.ok(firstLabItem.details.reviewStatus, 'Review status must be present in details');
  console.log('  ✓ Lab reports seamlessly aggregate into patient timeline with bilingual badges and review status.');

  // =========================================================================
  // TEST 7: Integration with Doctor Queue & Case Workflow
  // =========================================================================
  console.log('\n▶ TEST 7: Integration with Doctor Review Queue & Case Workflow');

  // Create clinical case
  const caseId = 'case_resp_777';
  await db.collection('cases').doc(caseId).set({
    id: caseId,
    patientId: testPatient.uid,
    status: 'assigned',
    assignedDoctorId: testDoctor.uid,
    attachedFileIds: []
  });

  // Link lab report to case
  const linkCaseRes = await linkLabReportToCase(db, {
    fileId: abgPanicReg.fileId,
    caseId,
    actorUid: testPatient.uid
  }, testPatient);

  assert.strictEqual(linkCaseRes.success, true);
  const updatedCase = await db.collection('cases').doc(caseId).get();
  assert.ok(updatedCase.data().attachedFileIds.includes(abgPanicReg.fileId), 'Case must contain linked lab report ID');

  // Doctor reviews and certifies report
  const certifyRes = await certifyLabReportByDoctor(db, {
    fileId: abgPanicReg.fileId,
    clinicalNotes: 'تم فحص غازات الدم الشرياني وملاحظة نقص الأكسجين، تم بدء جلسة الأكسجين الإسعافية.',
    urgencyLevel: 'urgent'
  }, testDoctor);

  assert.strictEqual(certifyRes.success, true);
  assert.strictEqual(certifyRes.reviewStatus, REVIEW_STATUS.DOCTOR_REVIEWED);

  // Category filtering query
  const abgOnly = await getPatientLabReports(db, {
    patientId: testPatient.uid,
    labCategory: 'abg_gas'
  }, testPatient);

  assert.ok(abgOnly.length >= 1);
  assert.ok(abgOnly.every(r => r.labCategory === 'abg_gas'), 'Filtering must strictly return requested category');
  console.log('  ✓ Case linking, doctor certification, and category-filtered querying verified.');

  // =========================================================================
  // TEST 8: 100% Bilingual Arabic & English Parity (Categories, Disclaimers, i18n)
  // =========================================================================
  console.log('\n▶ TEST 8: 100% Bilingual Arabic & English Parity across All Components');

  // Categories parity
  const allCats = Object.values(LAB_CATEGORIES);
  for (const cat of allCats) {
    assert.ok(cat.labelAr && cat.labelAr.length > 0, `Missing labelAr for ${cat.key}`);
    assert.ok(cat.labelEn && cat.labelEn.length > 0, `Missing labelEn for ${cat.key}`);
  }

  // Disclaimers parity
  assert.ok(CLINICAL_DISCLAIMERS.ar.includes('لا يحلان محل الطبيب البشري'));
  assert.ok(CLINICAL_DISCLAIMERS.en.includes('NEVER replace licensed human physicians'));

  // i18n module parity
  const { translations } = i18n;
  assert.ok(translations.ar.labUpload, 'i18n.ar.labUpload must exist');
  assert.ok(translations.en.labUpload, 'i18n.en.labUpload must exist');
  const arKeys = Object.keys(translations.ar.labUpload);
  const enKeys = Object.keys(translations.en.labUpload);
  assert.strictEqual(arKeys.length, enKeys.length, 'i18n AR and EN labUpload key counts must match');
  for (const k of arKeys) {
    assert.ok(enKeys.includes(k), `Missing key in EN: ${k}`);
  }
  console.log('  ✓ 100% bilingual parity confirmed across categories, disclaimers, and UI localization.');

  // =========================================================================
  // TEST 9: Backend Server Routes Verification in server.js
  // =========================================================================
  console.log('\n▶ TEST 9: Backend Server Routes Verification in backend/server.js');
  const serverJsPath = path.join(__dirname, '../backend/server.js');
  const serverSource = fs.readFileSync(serverJsPath, 'utf8');

  const requiredRoutes = [
    '/api/lab-upload/categories',
    '/api/lab-upload/register',
    '/api/lab-upload/patient/:patientId',
    '/api/lab-upload/:fileId/scan-result',
    '/api/lab-upload/:fileId/link-case',
    '/api/lab-upload/:fileId/link-appointment',
    '/api/lab-upload/chatbot-context/:patientId',
    '/api/lab-upload/:fileId',
    '/api/lab-upload/:fileId/doctor-review',
    '/api/lab-upload/:fileId/doctor-reject',
    '/api/lab-upload/safety-evaluation',
    '/api/lab-upload/:fileId/disclaimer'
  ];

  for (const route of requiredRoutes) {
    assert.ok(serverSource.includes(route), `server.js must define route: ${route}`);
  }
  console.log(`  ✓ All ${requiredRoutes.length} REST API routes confirmed in backend/server.js.`);

  console.log('\n==================================================================');
  console.log('🎉 ALL 9 LAB UPLOAD INTEGRATION QA & EDGE CASES TESTS PASSED!');
  console.log('==================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ INTEGRATION QA TEST SUITE FAILED:', err);
  process.exit(1);
});
