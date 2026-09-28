/**
 * Health Vibe AI - Certified Clinical Patient Timeline & History Test Suite
 *
 * Verifies:
 * 1. Multi-source history aggregation across all 7 sources:
 *    - Assessments (clinical evaluations, triage, SpO2)
 *    - Reports (certified diagnostic reports)
 *    - Appointments (scheduled, completed, cancelled)
 *    - Attachments (medical case files, lab results)
 *    - Medications (active prescriptions, dosages)
 *    - Chronic conditions (clinical baselines, allergies)
 *    - Doctor notes (public clinical instructions)
 * 2. Empty records handling (graceful empty state and structure).
 * 3. Prevention of internal doctor notes being shown to patients:
 *    - Confidential/internal notes are strictly scrubbed and NEVER returned to patient.
 *    - Only patient-facing clinical advice and instructions are permitted for display.
 * 4. Clinician access to internal notes:
 *    - Authorized doctors/admins can see internal notes, badged with isInternal: true.
 * 5. Search capability across keywords (symptoms, medications, doctors, diagnosis).
 * 6. Filtering by type ('assessment', 'appointment', etc.).
 * 7. Filtering by date range (startDate, endDate).
 * 8. Enforcement of Zero-Trust data permissions (cross-patient access blocked with 403).
 * 9. Links to original records for seamless patient and doctor navigation.
 */

const assert = require('assert');
const {
  TIMELINE_TYPES,
  buildPatientTimeline,
  verifyTimelineAccess
} = require('../backend/timeline-service');
const app = require('../backend/server');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: UNIFIED PATIENT TIMELINE TEST SUITE');
console.log('   Multi-Source History, Search, Filters, RBAC & Notes Redaction');
console.log('==================================================================\n');

// Mock Firestore Database Engine for Deterministic Testing
function createMockDb(initialData = {}) {
  const store = {
    cases: initialData.cases || [],
    clinical_reports: initialData.clinical_reports || [],
    appointments: initialData.appointments || [],
    case_files: initialData.case_files || [],
    users: initialData.users || {}
  };

  return {
    collection(name) {
      const records = store[name] || [];
      return {
        where(field, op, val) {
          const filtered = records.filter(r => {
            if (op === '==') return r[field] === val;
            if (op === 'in') return Array.isArray(val) && val.includes(r[field]);
            return true;
          });
          return {
            where(field2, op2, val2) {
              const subFiltered = filtered.filter(r => op2 === '==' ? r[field2] === val2 : true);
              return {
                async get() {
                  return {
                    empty: subFiltered.length === 0,
                    docs: subFiltered.map(d => ({ id: d.id, data: () => d })),
                    forEach(cb) { subFiltered.forEach(d => cb({ id: d.id, data: () => d })); }
                  };
                }
              };
            },
            async get() {
              return {
                empty: filtered.length === 0,
                docs: filtered.map(d => ({ id: d.id, data: () => d })),
                forEach(cb) { filtered.forEach(d => cb({ id: d.id, data: () => d })); }
              };
            }
          };
        },
        doc(id) {
          return {
            async get() {
              const u = store.users[id];
              return {
                exists: Boolean(u),
                id,
                data: () => u || {}
              };
            }
          };
        }
      };
    }
  };
}

async function runTestSuite() {
  const testPatientId = 'patient_tarek_101';
  const otherPatientId = 'patient_sarah_202';
  const doctorUid = 'doc_mona_888';

  // Seed sample clinical data
  const sampleData = {
    users: {
      [testPatientId]: {
        uid: testPatientId,
        name: 'طارق محمود',
        email: 'tarek@example.com',
        createdAt: '2026-01-10T08:00:00.000Z',
        medicalProfile: {
          medicalHistory: {
            chronicConditions: [
              { name: 'الربو الشعبي المزمن (Asthma)', severity: 'متوسط', diagnosedDate: '2025-03-15' },
              { name: 'ضغط الدم المرتفع', severity: 'خفيف', diagnosedDate: '2024-11-20' }
            ],
            allergies: ['البنسلين (Penicillin)', 'حبوب اللقاح الغبارية'],
            medications: [
              { name: 'سالبوتامول بخاخ (Ventolin)', dosage: '100mcg', frequency: 'عند اللزوم', prescribedAt: '2026-02-01T10:00:00.000Z' }
            ]
          },
          clinicLinkage: {
            clinicId: 'clinic_cairo_main',
            linkedDoctorId: doctorUid
          }
        }
      }
    },
    cases: [
      {
        id: 'case_asthma_01',
        patientId: testPatientId,
        patientName: 'طارق محمود',
        status: 'approved',
        triageLevel: 'أصفر (متوسط)',
        triageScore: 8,
        oxygenLevel: 94,
        symptoms: ['كحة جافة', 'ضيق في التنفس عند الحركة'],
        clinicalDiagnosis: 'نوبة ربو شعبي متوسطة مع استقرار في المؤشرات الحيوية.',
        clinicalNotes: 'يرجى الالتزام ببخاخ الموسع وتجنب تيارات الهواء الباردة.',
        doctorNote: 'يرجى الالتزام ببخاخ الموسع وتجنب تيارات الهواء الباردة.',
        internalNotes: 'CONFIDENTIAL: Suspected steroid non-adherence. Monitor SpO2 trend closely before escalating therapy.',
        privateNotes: 'Staff note: Patient seemed anxious during consultation.',
        approvingDoctorName: 'د. منى سامي',
        doctorSpecialty: 'استشاري أمراض صدرية',
        reportRef: 'HV-REP-ASTHMA01',
        medications: 'بخاخ بيكلوميثازون 200 مكجم مرتين يومياً',
        attachments: [
          { name: 'prescriptions_history.pdf', fileType: 'application/pdf', size: 245000, downloadUrl: 'https://storage.healthvibe.ai/presc1.pdf' }
        ],
        createdAt: '2026-09-15T09:30:00.000Z',
        approvedAt: '2026-09-15T11:00:00.000Z'
      },
      {
        id: 'case_followup_02',
        patientId: testPatientId,
        patientName: 'طارق محمود',
        status: 'pending',
        triageLevel: 'أخضر (منخفض)',
        triageScore: 3,
        oxygenLevel: 98,
        symptoms: ['كحة خفيفة صباحية'],
        createdAt: '2026-09-25T14:15:00.000Z'
      }
    ],
    clinical_reports: [
      {
        id: 'rep_asthma_01',
        patientId: testPatientId,
        caseId: 'case_asthma_01',
        reportRef: 'HV-REP-ASTHMA01',
        clinicalDiagnosis: 'نوبة ربو شعبي متوسطة مع استقرار في المؤشرات الحيوية.',
        approvingDoctorName: 'د. منى سامي',
        doctorSpecialty: 'استشاري أمراض صدرية',
        approvedAt: '2026-09-15T11:00:00.000Z'
      }
    ],
    appointments: [
      {
        id: 'appt_pulm_77',
        patientId: testPatientId,
        doctorId: doctorUid,
        doctorName: 'د. منى سامي',
        doctorSpecialty: 'استشاري أمراض صدرية',
        clinicName: 'عيادة الصدر التخصصية',
        date: '2026-09-20',
        timeSlot: '11:30 AM',
        slotStart: '2026-09-20T11:30:00.000Z',
        status: 'confirmed',
        type: 'video',
        reason: 'متابعة نوبة الربو بعد العلاج'
      }
    ],
    case_files: [
      {
        id: 'file_chest_xray_99',
        patientId: testPatientId,
        caseId: 'case_asthma_01',
        fileName: 'chest_xray_pa.png',
        fileType: 'image/png',
        fileSize: 1450000,
        downloadUrl: 'https://storage.healthvibe.ai/xray99.png',
        scanStatus: 'clean',
        uploadedAt: '2026-09-15T09:35:00.000Z'
      }
    ]
  };

  const db = createMockDb(sampleData);

  // -----------------------------------------------------------------------------
  // TEST 1: Multi-Source History Aggregation (Assessments, Reports, Appts, etc.)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: Multi-Source History Aggregation');
  {
    const requestingPatient = { uid: testPatientId, role: 'patient' };
    const result = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient
    });

    assert.strictEqual(result.success, true, 'Timeline query must succeed');
    assert.ok(result.timeline.length > 5, 'Timeline must aggregate items across all sources');

    const typesFound = new Set(result.timeline.map(item => item.type));
    console.log(`  ✓ Aggregated ${result.timeline.length} items across types:`, Array.from(typesFound).join(', '));

    assert(typesFound.has(TIMELINE_TYPES.ASSESSMENT), 'Must include assessments');
    assert(typesFound.has(TIMELINE_TYPES.REPORT), 'Must include certified reports');
    assert(typesFound.has(TIMELINE_TYPES.APPOINTMENT), 'Must include appointments');
    assert(typesFound.has(TIMELINE_TYPES.ATTACHMENT), 'Must include attachments');
    assert(typesFound.has(TIMELINE_TYPES.MEDICATION), 'Must include medications');
    assert(typesFound.has(TIMELINE_TYPES.CONDITION), 'Must include chronic conditions');
    assert(typesFound.has(TIMELINE_TYPES.DOCTOR_NOTE), 'Must include doctor notes permitted for display');

    // Chronological ordering check
    for (let i = 0; i < result.timeline.length - 1; i++) {
      const timeCurrent = new Date(result.timeline[i].timestamp).getTime();
      const timeNext = new Date(result.timeline[i + 1].timestamp).getTime();
      assert(timeCurrent >= timeNext, `Timeline items must be sorted descending: ${result.timeline[i].timestamp} vs ${result.timeline[i + 1].timestamp}`);
    }
    console.log('  ✓ Chronological sorting verified (newest first).');
  }

  // -----------------------------------------------------------------------------
  // TEST 2: Prevention of Internal Doctor Notes Being Shown to Patients
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Prevention of Internal Doctor Notes Being Shown to Patients');
  {
    const requestingPatient = { uid: testPatientId, role: 'patient' };
    const patientTimeline = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient
    });

    // Verify patient NEVER sees internal notes
    const leakedInternalNotes = patientTimeline.timeline.filter(item => {
      if (item.isInternal === true) return true;
      if (item.details && item.details.isInternal === true) return true;
      if (item.summary && item.summary.includes('CONFIDENTIAL: Suspected steroid non-adherence')) return true;
      if (item.details?.note && item.details.note.includes('CONFIDENTIAL')) return true;
      return false;
    });

    assert.strictEqual(leakedInternalNotes.length, 0, 'Internal notes MUST NOT be exposed to patient under any circumstance!');

    // Verify patient DOES receive the permitted patient-facing notes
    const publicDoctorNotes = patientTimeline.timeline.filter(item => item.type === TIMELINE_TYPES.DOCTOR_NOTE);
    assert.ok(publicDoctorNotes.length > 0, 'Patient must receive permitted patient-facing doctor notes');
    assert(publicDoctorNotes[0].summary.includes('الالتزام ببخاخ الموسع'), 'Public note text must match clinical advice');
    assert.strictEqual(publicDoctorNotes[0].isInternal, false, 'Public note must have isInternal: false');

    console.log('  ✓ Confirmed: 0 internal notes leaked to patient; permitted public advice preserved.');
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Clinician View Includes Internal Notes Badged as Confidential
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Clinician Access to Internal Notes');
  {
    const requestingDoctor = { uid: doctorUid, role: 'doctor' };
    const doctorTimeline = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingDoctor
    });

    const internalNotes = doctorTimeline.timeline.filter(item => item.isInternal === true);
    assert.ok(internalNotes.length > 0, 'Authorized doctor must be able to view internal notes');
    assert(internalNotes[0].summary.includes('Suspected steroid non-adherence'), 'Internal note content preserved for doctor');
    assert.strictEqual(internalNotes[0].status, 'confidential', 'Internal note must be tagged confidential');

    console.log('  ✓ Authorized doctor receives internal notes badged as confidential.');
  }

  // -----------------------------------------------------------------------------
  // TEST 4: Empty Records Handling
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Empty Records Handling');
  {
    const emptyDb = createMockDb();
    const emptyPatientId = 'patient_empty_999';
    const requestingPatient = { uid: emptyPatientId, role: 'patient' };

    const emptyResult = await buildPatientTimeline({
      db: emptyDb,
      patientId: emptyPatientId,
      requestingUser: requestingPatient
    });

    assert.strictEqual(emptyResult.success, true, 'Empty query must succeed cleanly');
    assert.strictEqual(emptyResult.count, 0, 'Count must be 0 for new patient');
    assert.deepStrictEqual(emptyResult.timeline, [], 'Timeline must be an empty array');

    console.log('  ✓ Empty patient records handled gracefully with clean empty array.');
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Filtering by Type
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Filtering by Type');
  {
    const requestingPatient = { uid: testPatientId, role: 'patient' };

    // 1. Filter appointments only
    const apptOnly = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient,
      type: TIMELINE_TYPES.APPOINTMENT
    });
    assert(apptOnly.timeline.length > 0, 'Must find appointment');
    assert(apptOnly.timeline.every(i => i.type === TIMELINE_TYPES.APPOINTMENT), 'All items must be appointments');

    // 2. Filter medications only
    const medOnly = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient,
      type: TIMELINE_TYPES.MEDICATION
    });
    assert(medOnly.timeline.length > 0, 'Must find medications');
    assert(medOnly.timeline.every(i => i.type === TIMELINE_TYPES.MEDICATION), 'All items must be medications');

    console.log('  ✓ Type filtering strictly limits results to requested categories.');
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Filtering by Date Range
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Filtering by Date Range');
  {
    const requestingPatient = { uid: testPatientId, role: 'patient' };

    // Window between 2026-09-18 and 2026-09-22 (Only the appointment on 2026-09-20 falls here)
    const dateFiltered = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient,
      startDate: '2026-09-18',
      endDate: '2026-09-22'
    });

    assert.strictEqual(dateFiltered.timeline.length, 1, 'Exactly 1 event should fall in this date window');
    assert.strictEqual(dateFiltered.timeline[0].type, TIMELINE_TYPES.APPOINTMENT);
    assert.strictEqual(dateFiltered.timeline[0].date, '2026-09-20');

    console.log('  ✓ Date range filtering accurately bounds timeline window.');
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Search Filtering across Records
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Keyword Search');
  {
    const requestingPatient = { uid: testPatientId, role: 'patient' };

    // Search for medication name 'Ventolin'
    const searchVentolin = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient,
      search: 'Ventolin'
    });
    assert(searchVentolin.timeline.length > 0, 'Search should find Ventolin record');
    assert(searchVentolin.timeline.some(i => i.summary.includes('Ventolin') || i.title.includes('Ventolin')));

    // Search for X-ray attachment
    const searchXray = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient,
      search: 'xray'
    });
    assert(searchXray.timeline.length > 0, 'Search should find X-ray file attachment');
    assert(searchXray.timeline[0].type === TIMELINE_TYPES.ATTACHMENT);

    console.log('  ✓ Keyword search locates relevant entries across disparate sources.');
  }

  // -----------------------------------------------------------------------------
  // TEST 8: Zero-Trust RBAC & Cross-Patient Unauthorized Access Blocking
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Cross-Patient Unauthorized Access Blocking');
  {
    // Patient Bob tries to access Patient Alice's timeline
    const maliciousRequester = { uid: otherPatientId, role: 'patient', email: 'sarah@example.com' };

    await assert.rejects(
      async () => {
        await buildPatientTimeline({
          db,
          patientId: testPatientId,
          requestingUser: maliciousRequester
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403, 'Cross-patient access must be rejected with 403 FORBIDDEN');
        assert.strictEqual(err.code, 'ACCESS_DENIED', 'Error code must be ACCESS_DENIED');
        return true;
      },
      'Unauthorized patient must not be allowed to read another patient\'s timeline'
    );

    console.log('  ✓ Cross-patient snooping attempt blocked with 403 ACCESS_DENIED.');
  }

  // -----------------------------------------------------------------------------
  // TEST 9: Links to Original Clinical Records
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 9: Links to Original Records');
  {
    const requestingPatient = { uid: testPatientId, role: 'patient' };
    const result = await buildPatientTimeline({
      db,
      patientId: testPatientId,
      requestingUser: requestingPatient
    });

    for (const item of result.timeline) {
      assert(typeof item.link === 'string' && item.link.length > 0, `Item ${item.id} must have a valid link`);
      assert(typeof item.recordId === 'string' && item.recordId.length > 0, `Item ${item.id} must reference its original recordId`);
    }

    console.log('  ✓ Every timeline item contains clickable link and provenance recordId.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 9 PATIENT TIMELINE TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================================\n');
}

runTestSuite().catch(err => {
  console.error('❌ TIMELINE TEST SUITE FAILED:', err);
  process.exit(1);
});
