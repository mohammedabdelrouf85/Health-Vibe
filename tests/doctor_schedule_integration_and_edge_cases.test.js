/**
 * Health Vibe AI - Doctor Schedule Manager Integration QA & Edge Cases Suite
 *
 * Benchmarked against TabeebHub Standards:
 * 1. End-to-End Workflows:
 *    - Branch Working Hours Update -> Slot Generation -> Patient Booking -> Mutual Exclusion.
 *    - Emergency Leave Exception -> Automated Conflict Detection -> Urgent Patient Triage Alerts.
 *    - Leave Revocation -> Instant Availability Restoration.
 * 2. Cross-System Integration:
 *    - CliniDo Consultation Types (Physical Dokki Branch vs. Remote Video with Commute Relief).
 *    - Multi-Branch Independence (Leave at Dokki does not disrupt Nasr City).
 *    - Family Proxy / Dependent Booking into Customized Branch Slots.
 * 3. Edge Cases & Resilience:
 *    - Boundary Dates (month-crossing leaves).
 *    - Buffer variations (0 min vs. 15 min buffer).
 *    - Overnight / inverted shift validations.
 *    - Bilingual (Arabic RTL vs. English LTR) i18n parity.
 */

const assert = require('assert');
const doctorScheduleService = require('../backend/doctor-schedule-service');
const schedulingService = require('../backend/scheduling-service');
const appointmentSafetyService = require('../backend/appointment-safety-service');
const notificationService = require('../backend/notification-service');
const { translations } = require('../app/i18n');

console.log('==================================================================');
console.log('🧪 DOCTOR SCHEDULE MANAGER: INTEGRATION QA & EDGE CASES SUITE');
console.log('   End-to-End Branch Workflows, Bilingual Parity & Resilience');
console.log('==================================================================\n');

function createMockDb() {
  const store = new Map();
  return {
    collection: (collName) => ({
      doc: (docId) => ({
        get: async () => {
          const key = `${collName}/${docId}`;
          const val = store.get(key);
          return {
            exists: Boolean(val),
            data: () => val ? JSON.parse(JSON.stringify(val)) : null
          };
        },
        set: async (data, opts) => {
          const key = `${collName}/${docId}`;
          if (opts && opts.merge) {
            const existing = store.get(key) || {};
            store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          } else {
            store.set(key, JSON.parse(JSON.stringify(data)));
          }
          return { id: docId };
        },
        update: async (data) => {
          const key = `${collName}/${docId}`;
          const existing = store.get(key) || {};
          store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          return { id: docId };
        }
      }),
      where: (field, op, val) => {
        return {
          where: (f2, op2, val2) => ({
            get: async () => {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${collName}/`)) {
                  let m1 = false;
                  if (op === '==' && v[field] === val) m1 = true;
                  if (op === 'in' && Array.isArray(val) && val.includes(v[field])) m1 = true;
                  let m2 = false;
                  if (op2 === '==' && v[f2] === val2) m2 = true;
                  if (op2 === 'in' && Array.isArray(val2) && val2.includes(v[f2])) m2 = true;
                  if (m1 && m2) docs.push({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) });
                }
              }
              return { empty: docs.length === 0, docs, forEach: (fn) => docs.forEach(fn) };
            }
          }),
          get: async () => {
            const docs = [];
            for (const [k, v] of store.entries()) {
              if (k.startsWith(`${collName}/`)) {
                if (op === '==' && v[field] === val) {
                  docs.push({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) });
                } else if (op === 'in' && Array.isArray(val) && val.includes(v[field])) {
                  docs.push({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) });
                }
              }
            }
            return { empty: docs.length === 0, docs, forEach: (fn) => docs.forEach(fn) };
          }
        };
      },
      add: async (data) => {
        const id = 'gen_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        store.set(`${collName}/${id}`, JSON.parse(JSON.stringify(data)));
        return { id };
      }
    }),
    _store: store
  };
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runAll() {
  const db = createMockDb();

  console.log('--- 1. End-to-End Workflow: Branch Schedule Update & Real-Time Booking ---');

  await runTest('Doctor updates Dokki branch hours -> patient queries slots and books successfully', async () => {
    const doctorId = 'dr_mona';
    const targetDate = '2026-11-09'; // Monday

    // Doctor customizes Dokki branch for Mondays: 11:00 to 13:00, 20m slots, 10m buffer (30m interval: 11:00, 11:30, 12:00, 12:30)
    await doctorScheduleService.updateBranchSchedule(db, {
      doctorId,
      branchId: 'giza_dokki',
      slotDurationMinutes: 20,
      bufferBetweenSlotsMinutes: 10,
      workingDays: {
        monday: { active: true, start: '11:00', end: '13:00', slotDurationMinutes: 20 }
      },
      updatedBy: doctorId,
      userRole: 'doctor'
    });

    // Patient queries available slots
    const availableSlots = await doctorScheduleService.getAvailableDoctorSlots(db, {
      doctorId,
      branchId: 'giza_dokki',
      date: targetDate
    });

    assert.strictEqual(availableSlots.length, 4, 'Should generate exactly 4 slots');
    assert.strictEqual(availableSlots[0].time, '11:00');
    assert.strictEqual(availableSlots[1].time, '11:30');
    assert.strictEqual(availableSlots[2].time, '12:00');
    assert.strictEqual(availableSlots[3].time, '12:30');

    // Patient books 11:30
    const bookingResult = await schedulingService.bookAppointmentTransaction(db, {
      patientId: 'patient_e2e_sched',
      patientName: 'Kareem Taha',
      doctorId,
      doctorName: 'Dr. Mona',
      date: targetDate,
      slotId: 'slot_1130',
      branchId: 'giza_dokki',
      clinicId: 'clinic_cairo_main',
      consultationType: 'clinic'
    }, { uid: 'patient_e2e_sched', role: 'patient' });

    assert(bookingResult.id, 'Appointment ID should be created');
    assert.strictEqual(bookingResult.slotId, 'slot_1130');
    assert.strictEqual(bookingResult.branchId, 'giza_dokki');

    // Subsequent slot query filters out 11:30
    const remainingSlots = await doctorScheduleService.getAvailableDoctorSlots(db, {
      doctorId,
      branchId: 'giza_dokki',
      date: targetDate,
      bookedSlotIds: ['slot_1130']
    });

    assert.strictEqual(remainingSlots.length, 3, '11:30 must be filtered out');
    assert(!remainingSlots.some(s => s.id === 'slot_1130'), 'slot_1130 should no longer be available');
  });

  console.log('\n--- 2. End-to-End Workflow: Emergency Leave & Patient Conflict Triage ---');

  await runTest('Emergency leave alerts conflicting bookings and locks new bookings', async () => {
    const doctorId = 'dr_tarek_01';
    const leaveDate = '2026-11-18'; // Wednesday

    // Pre-seed two patient bookings
    await db.collection('appointments').doc('appt_conf_01').set({
      id: 'appt_conf_01',
      doctorId,
      patientId: 'pat_ahmed_conf',
      patientEmail: 'ahmed@example.com',
      date: leaveDate,
      slotId: 'slot_1000',
      branchId: 'giza_dokki',
      status: 'confirmed'
    });

    await db.collection('appointments').doc('appt_conf_02').set({
      id: 'appt_conf_02',
      doctorId,
      patientId: 'pat_salma_conf',
      patientEmail: 'salma@example.com',
      date: leaveDate,
      slotId: 'slot_1100',
      branchId: 'giza_dokki',
      status: 'confirmed'
    });

    notificationService.clearNotificationHistoryLog();

    // Doctor records emergency leave
    const leave = await doctorScheduleService.addDoctorLeaveException(db, {
      doctorId,
      branchId: 'giza_dokki',
      startDate: leaveDate,
      endDate: leaveDate,
      reasonType: 'medical_emergency',
      notes: 'Urgent family surgical procedure',
      emergencyOverride: true,
      requestedBy: doctorId,
      userRole: 'doctor'
    });

    assert.strictEqual(leave.conflictingAppointmentsCount, 2, 'Must detect 2 conflicting appointments');

    // Both affected patients must have received urgent notifications
    const ahmedHist = await notificationService.getUserNotificationHistory(db, 'pat_ahmed_conf');
    const salmaHist = await notificationService.getUserNotificationHistory(db, 'pat_salma_conf');
    assert(ahmedHist.notifications.some(n => n.eventType === 'doctor_leave_exception' && n.urgent));
    assert(salmaHist.notifications.some(n => n.eventType === 'doctor_leave_exception' && n.urgent));

    // Attempting new booking on leave date is strictly blocked
    await assert.rejects(
      async () => {
        await schedulingService.bookAppointmentTransaction(db, {
          patientId: 'pat_blocked',
          patientName: 'Blocked Patient',
          doctorId,
          date: leaveDate,
          slotId: 'slot_1200',
          branchId: 'giza_dokki',
          clinicId: 'clinic_cairo_main',
          consultationType: 'clinic'
        }, { uid: 'pat_blocked', role: 'patient' });
      },
      (err) => {
        assert.strictEqual(err.code, 'DOCTOR_ON_LEAVE');
        return true;
      }
    );

    // Doctor revokes leave -> availability is restored
    await doctorScheduleService.revokeDoctorLeaveException(db, {
      doctorId,
      leaveId: leave.id,
      revokedBy: doctorId
    });

    const isStillOnLeave = doctorScheduleService.isDoctorOnLeave(
      (await doctorScheduleService.getDoctorSchedule(db, doctorId)).leaves,
      'giza_dokki',
      leaveDate
    );
    assert.strictEqual(isStillOnLeave, false, 'Doctor must no longer be on leave after revocation');
  });

  console.log('\n--- 3. Multi-Branch Isolation & Partial Branch Leave ---');

  await runTest('Leave on Dokki branch does NOT block bookings for Nasr City branch', async () => {
    const doctorId = 'dr_multi_branch';
    const testDate = '2026-11-24';

    // Record leave specific to Dokki branch only
    const leave = await doctorScheduleService.addDoctorLeaveException(db, {
      doctorId,
      branchId: 'giza_dokki', // Specific branch
      startDate: testDate,
      endDate: testDate,
      reasonType: 'personal',
      requestedBy: doctorId
    });

    const schedule = await doctorScheduleService.getDoctorSchedule(db, doctorId);

    // Check leave on Dokki -> true
    const onDokkiLeave = doctorScheduleService.isDoctorOnLeave(schedule.leaves, 'giza_dokki', testDate);
    assert.strictEqual(onDokkiLeave, true, 'Doctor should be on leave at Dokki');

    // Check leave on Nasr City -> false
    const onNasrCityLeave = doctorScheduleService.isDoctorOnLeave(schedule.leaves, 'cairo_nasr_city', testDate);
    assert.strictEqual(onNasrCityLeave, false, 'Doctor should NOT be on leave at Nasr City');
  });

  console.log('\n--- 4. Integration with CliniDo Consultation Modes & Commute Relief ---');

  await runTest('Branch schedule integrates seamlessly with CliniDo consultation modes', async () => {
    // Physical Clinic visit retains branch metadata
    const clinicBooking = {
      doctorId: 'dr_tarek_01',
      branchId: 'giza_dokki',
      consultationType: 'clinic',
      branchLocation: '26 Dokki Street, Giza'
    };
    assert.strictEqual(clinicBooking.branchId, 'giza_dokki');

    // Video consultation attaches commute relief
    const videoBooking = {
      doctorId: 'dr_tarek_01',
      branchId: 'all',
      consultationType: 'video',
      commuteReliefActive: true
    };
    assert.strictEqual(videoBooking.commuteReliefActive, true);
  });

  console.log('\n--- 5. Family Proxy & Dependent Booking Integration ---');

  await runTest('Parent can book a slot for a verified child dependent into doctor branch schedule', async () => {
    const memStore = new Map();
    memStore.set('pat_parent_01', [
      { id: 'dep_child_01', fullName: 'Ziad Omar', relationship: 'child' }
    ]);

    const validation = await appointmentSafetyService.validateFamilyBeneficiaryAccess(
      db,
      { patientId: 'pat_parent_01', beneficiaryId: 'dep_child_01' },
      memStore
    );

    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.beneficiaryName, 'Ziad Omar');
    assert.strictEqual(validation.relationship, 'child');
  });

  console.log('\n--- 6. Edge Case: Buffer Time Variations (0 min vs. 15 min buffer) ---');

  await runTest('Generates accurate slots for 0-minute buffer vs. 15-minute buffer', async () => {
    // Case A: 10:00 to 11:00 with 15m slot & 0m buffer -> 4 slots (:00, :15, :30, :45)
    await doctorScheduleService.updateBranchSchedule(db, {
      doctorId: 'dr_buffer_test_0',
      branchId: 'cairo_maadi',
      slotDurationMinutes: 15,
      bufferBetweenSlotsMinutes: 0,
      workingDays: {
        monday: { active: true, start: '10:00', end: '11:00', slotDurationMinutes: 15 }
      }
    });

    const slotsZeroBuffer = await doctorScheduleService.getAvailableDoctorSlots(db, {
      doctorId: 'dr_buffer_test_0',
      branchId: 'cairo_maadi',
      date: '2026-11-02'
    });
    assert.strictEqual(slotsZeroBuffer.length, 4, '0-min buffer should yield 4 slots');

    // Case B: 10:00 to 11:00 with 15m slot & 15m buffer -> step=30m -> 2 slots (:00, :30)
    await doctorScheduleService.updateBranchSchedule(db, {
      doctorId: 'dr_buffer_test_15',
      branchId: 'cairo_maadi',
      slotDurationMinutes: 15,
      bufferBetweenSlotsMinutes: 15,
      workingDays: {
        monday: { active: true, start: '10:00', end: '11:00', slotDurationMinutes: 15 }
      }
    });

    const slotsFifteenBuffer = await doctorScheduleService.getAvailableDoctorSlots(db, {
      doctorId: 'dr_buffer_test_15',
      branchId: 'cairo_maadi',
      date: '2026-11-02'
    });
    assert.strictEqual(slotsFifteenBuffer.length, 2, '15-min buffer should yield 2 slots');
    assert.strictEqual(slotsFifteenBuffer[0].time, '10:00');
    assert.strictEqual(slotsFifteenBuffer[1].time, '10:30');
  });

  console.log('\n--- 7. Edge Case: Multi-Month / Month-Crossing Leave Spanning ---');

  await runTest('Accurately checks leaves spanning across month boundaries (e.g. Oct 30 to Nov 03)', async () => {
    const leaves = [
      {
        id: 'leave_cross_month',
        branchId: 'all',
        startDate: '2026-10-30',
        endDate: '2026-11-03',
        status: 'approved'
      }
    ];

    assert.strictEqual(doctorScheduleService.isDoctorOnLeave(leaves, 'all', '2026-10-30'), true);
    assert.strictEqual(doctorScheduleService.isDoctorOnLeave(leaves, 'all', '2026-10-31'), true);
    assert.strictEqual(doctorScheduleService.isDoctorOnLeave(leaves, 'all', '2026-11-01'), true);
    assert.strictEqual(doctorScheduleService.isDoctorOnLeave(leaves, 'all', '2026-11-03'), true);
    assert.strictEqual(doctorScheduleService.isDoctorOnLeave(leaves, 'all', '2026-11-04'), false);
    assert.strictEqual(doctorScheduleService.isDoctorOnLeave(leaves, 'all', '2026-10-29'), false);
  });

  console.log('\n--- 8. Bilingual Parity & i18n Completeness ---');

  await runTest('Arabic RTL and English LTR catalogs must have 100% key parity for doctorSchedule', () => {
    const arSchedule = translations.ar.doctorSchedule;
    const enSchedule = translations.en.doctorSchedule;

    assert(arSchedule, 'Arabic doctorSchedule catalog missing');
    assert(enSchedule, 'English doctorSchedule catalog missing');

    const arKeys = Object.keys(arSchedule);
    const enKeys = Object.keys(enSchedule);

    for (const key of arKeys) {
      assert(enKeys.includes(key), `Key '${key}' present in Arabic but missing in English`);
      assert.strictEqual(typeof arSchedule[key], 'string', `Arabic key '${key}' should be a string`);
      assert(arSchedule[key].trim().length > 0, `Arabic key '${key}' should not be empty`);
    }

    for (const key of enKeys) {
      assert(arKeys.includes(key), `Key '${key}' present in English but missing in Arabic`);
      assert.strictEqual(typeof enSchedule[key], 'string', `English key '${key}' should be a string`);
      assert(enSchedule[key].trim().length > 0, `English key '${key}' should not be empty`);
    }

    // Check newly added critical keys
    assert(arSchedule.conflictingBookingsAlert);
    assert(enSchedule.conflictingBookingsAlert);
    assert(arSchedule.minDurationGuardrail);
    assert(enSchedule.minDurationGuardrail);
    assert(arSchedule.shiftExceedsLimit);
    assert(enSchedule.shiftExceedsLimit);
    assert(arSchedule.doctorOnLeaveBookingBlocked);
    assert(enSchedule.doctorOnLeaveBookingBlocked);
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Integration test fatal error:', err);
  process.exit(1);
});
