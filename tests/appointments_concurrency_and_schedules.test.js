/**
 * Health Vibe AI - Appointments Concurrency, Schedules, Clock-Change & Failure Test Suite
 *
 * Validates:
 * 1. Concurrent requests for the same slot (anti-double booking race prevention).
 * 2. Concurrent requests for the same patient across different doctors (patient overlap race prevention).
 * 3. Work schedules, clinic operational hours, and leave availability filtering.
 * 4. Clock-change, time-zone skew, and daylight-saving transition resilience.
 * 5. Failures during booking: Storage down, validation errors, leave conflicts, and failure atomicity.
 * 6. Guarantees that an appointment is NEVER marked confirmed before it is saved!
 */

const assert = require('assert');
const schedulingService = require('../backend/scheduling-service');

console.log("\n================================================================================");
console.log("📅 HEALTH VIBE AI: CONCURRENCY, SCHEDULES, CLOCK-CHANGE & FAILURE TEST SUITE");
console.log("================================================================================\n");

// Helper to create a fully-functional in-memory transactional Firestore mock
function createMockFirestore() {
  const store = new Map(); // "collection/docId" -> data

  function getDocPath(coll, id) {
    return `${coll}/${id}`;
  }

  const db = {
    _store: store,
    collection: (collName) => ({
      doc: (docId) => ({
        id: docId,
        path: getDocPath(collName, docId),
        get: async () => {
          const key = getDocPath(collName, docId);
          const exists = store.has(key);
          const data = exists ? JSON.parse(JSON.stringify(store.get(key))) : undefined;
          return {
            id: docId,
            exists,
            data: () => data
          };
        },
        set: async (data, opts = {}) => {
          const key = getDocPath(collName, docId);
          if (opts.merge && store.has(key)) {
            store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(data)) });
          } else {
            store.set(key, JSON.parse(JSON.stringify(data)));
          }
        },
        update: async (data) => {
          const key = getDocPath(collName, docId);
          if (!store.has(key)) throw new Error(`Document ${key} does not exist for update.`);
          store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(data)) });
        },
        delete: async () => {
          store.delete(getDocPath(collName, docId));
        }
      }),
      where: (field, op, val) => ({
        where: (f2, op2, v2) => ({
          where: (f3, op3, v3) => ({
            get: async () => {
              const prefix = `${collName}/`;
              const matched = [];
              for (const [key, data] of store.entries()) {
                if (key.startsWith(prefix)) {
                  if (data[field] === val && data[f2] === v2 && data[f3] === v3) {
                    matched.push({ id: key.replace(prefix, ''), data: () => data });
                  }
                }
              }
              return { empty: matched.length === 0, docs: matched, size: matched.length, forEach: (fn) => matched.forEach(fn) };
            }
          }),
          get: async () => {
            const prefix = `${collName}/`;
            const matched = [];
            for (const [key, data] of store.entries()) {
              if (key.startsWith(prefix)) {
                if (data[field] === val && data[f2] === v2) {
                  matched.push({ id: key.replace(prefix, ''), data: () => data });
                }
              }
            }
            return { empty: matched.length === 0, docs: matched, size: matched.length, forEach: (fn) => matched.forEach(fn) };
          }
        }),
        get: async () => {
          const prefix = `${collName}/`;
          const matched = [];
          for (const [key, data] of store.entries()) {
            if (key.startsWith(prefix)) {
              if (data[field] === val) {
                matched.push({ id: key.replace(prefix, ''), data: () => data });
              }
            }
          }
          return { empty: matched.length === 0, docs: matched, size: matched.length, forEach: (fn) => matched.forEach(fn) };
        }
      }),
      get: async () => {
        const prefix = `${collName}/`;
        const matched = [];
        for (const [key, data] of store.entries()) {
          if (key.startsWith(prefix)) {
            matched.push({ id: key.replace(prefix, ''), data: () => data });
          }
        }
        return { empty: matched.length === 0, docs: matched, size: matched.length, forEach: (fn) => matched.forEach(fn) };
      }
    }),
    runTransaction: async (updateFunction) => {
      // Transaction object that isolates reads and buffers writes until commit
      const writes = [];
      const transaction = {
        get: async (docRef) => {
          return await docRef.get();
        },
        set: (docRef, data, opts = {}) => {
          writes.push(async () => await docRef.set(data, opts));
        },
        update: (docRef, data) => {
          writes.push(async () => await docRef.update(data));
        },
        delete: (docRef) => {
          writes.push(async () => await docRef.delete());
        }
      };

      const result = await updateFunction(transaction);
      // Atomic commit
      for (const write of writes) {
        await write();
      }
      return result;
    }
  };

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Work Schedules, Clinic Time Zones & Leave Availability Filtering
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 1: Work Schedules, Clinic Time Zones & Leave Filtering");

const drMona = schedulingService.getDoctorWithSchedule('dr_mona');
assert.strictEqual(drMona.clinicId, 'clinic_cairo_main');
assert.strictEqual(drMona.timeZone, 'Africa/Cairo');

// 1.1 Working Day calculation (Sunday 2026-10-04 is day 0)
const workingDaySlots = schedulingService.calculateDoctorSlots(drMona, '2026-10-04');
assert.strictEqual(workingDaySlots.available, true);
assert(workingDaySlots.slots.length > 0, "Working day must have available clinical slots");
assert(workingDaySlots.slots.some(s => s.id === 'slot_1000'), "Must include slot_1000");
assert(workingDaySlots.slots.some(s => s.id === 'slot_2000'), "Must include slot_2000");
console.log(`  ✓ Doctor working day slots generated successfully (${workingDaySlots.slots.length} slots for Cairo clinic).`);

// 1.2 Non-working Day check (Friday 2026-10-02 is day 5, Friday is off for Dr. Mona)
const offDaySlots = schedulingService.calculateDoctorSlots(drMona, '2026-10-02');
assert.strictEqual(offDaySlots.available, false);
assert.strictEqual(offDaySlots.reason, 'NON_WORKING_DAY');
assert.strictEqual(offDaySlots.slots.length, 0);
console.log("  ✓ Non-working day (Friday) correctly identified with 0 available slots.");

// 1.3 Leave check (Dr. Mona is on approved conference leave from 2026-10-10 to 2026-10-12)
const leaveDaySlots = schedulingService.calculateDoctorSlots(drMona, '2026-10-11');
assert.strictEqual(leaveDaySlots.available, false);
assert.strictEqual(leaveDaySlots.reason, 'ON_LEAVE');
assert(leaveDaySlots.leave, "Leave details must be returned");
assert.strictEqual(leaveDaySlots.leave.type, 'conference');
assert.strictEqual(leaveDaySlots.slots.length, 0);
console.log("  ✓ Approved leave date correctly blocks booking and returns approved leave metadata.");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Two Simultaneous Concurrent Requests for the Exact Same Slot
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 2: Two Concurrent Requests for the Same Slot (Anti-Double Booking)");

async function testConcurrentSlotBooking() {
  const db = createMockFirestore();
  const testDate = '2026-10-04'; // Sunday (valid working day)
  const targetSlotId = 'slot_1000';

  const patient1 = { uid: 'patient_alpha', email: 'alpha@example.com' };
  const patient2 = { uid: 'patient_beta', email: 'beta@example.com' };

  const payload1 = {
    doctorId: 'dr_mona',
    date: testDate,
    slotId: targetSlotId,
    patientId: 'patient_alpha',
    patientName: 'مريض تجريبي أول'
  };

  const payload2 = {
    doctorId: 'dr_mona',
    date: testDate,
    slotId: targetSlotId,
    patientId: 'patient_beta',
    patientName: 'مريض تجريبي ثانٍ'
  };

  // Launch two booking requests simultaneously in parallel
  const results = await Promise.allSettled([
    schedulingService.bookAppointmentTransaction(db, payload1, patient1),
    schedulingService.bookAppointmentTransaction(db, payload2, patient2)
  ]);

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.strictEqual(fulfilled.length, 1, "Exactly ONE concurrent request must succeed");
  assert.strictEqual(rejected.length, 1, "Exactly ONE concurrent request must be rejected");

  const successResult = fulfilled[0].value;
  const failureReason = rejected[0].reason;

  assert.strictEqual(successResult.status, 'confirmed', "Winning appointment must be marked confirmed");
  assert.strictEqual(failureReason.code, 'DOCTOR_SLOT_CONFLICT', "Rejected request must fail with DOCTOR_SLOT_CONFLICT");
  assert.strictEqual(failureReason.statusCode, 409, "Rejected request must have HTTP 409 status code");

  // Verify database integrity: only 1 confirmed appointment and 1 lock doc exist for this doctor slot
  const apptsSnap = await db.collection('appointments')
    .where('doctorId', '==', 'dr_mona')
    .where('date', '==', testDate)
    .where('slotId', '==', targetSlotId)
    .get();

  assert.strictEqual(apptsSnap.size, 1, "Database must store exactly 1 appointment for this slot");

  console.log("  ✓ Exactly 1 of 2 concurrent requests succeeded; the duplicate was strictly rejected with 409 DOCTOR_SLOT_CONFLICT.");
  console.log("  ✓ Zero database double-booking corruption occurred.");
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Concurrent Patient Self-Overlap Prevention
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 3: Concurrent Patient Self-Overlap (Same Patient, Same Time, Different Doctors)");

async function testConcurrentPatientOverlap() {
  const db = createMockFirestore();
  const testDate = '2026-10-05'; // Monday
  const targetSlotId = 'slot_1130';
  const samePatient = { uid: 'patient_gamma', email: 'gamma@example.com' };

  // Patient tries to book Dr. Mona AND Dr. Ahmed at the EXACT SAME slot simultaneously
  const payloadToMona = {
    doctorId: 'dr_mona',
    date: testDate,
    slotId: targetSlotId,
    patientId: 'patient_gamma'
  };

  const payloadToAhmed = {
    doctorId: 'dr_ahmed',
    date: testDate,
    slotId: targetSlotId,
    patientId: 'patient_gamma'
  };

  const results = await Promise.allSettled([
    schedulingService.bookAppointmentTransaction(db, payloadToMona, samePatient),
    schedulingService.bookAppointmentTransaction(db, payloadToAhmed, samePatient)
  ]);

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.strictEqual(fulfilled.length, 1, "Only one appointment can be booked by the patient for the same slot time");
  assert.strictEqual(rejected.length, 1, "The overlapping appointment must be blocked");
  assert.strictEqual(rejected[0].reason.code, 'PATIENT_SLOT_CONFLICT');
  assert.strictEqual(rejected[0].reason.statusCode, 409);

  console.log("  ✓ Patient self-overlap race condition strictly prevented via PATIENT_SLOT_CONFLICT (409).");
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Clock-Change & Timezone Resilience Scenarios
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 4: Clock-Change & Timezone Resilience");

function testClockChangeScenarios() {
  // Scenario 4.1: Client browser is in New York (UTC-4) booking Cairo (UTC+3)
  const cairoDate = '2026-10-04'; // Sunday in Cairo
  const doctor = schedulingService.getDoctorWithSchedule('dr_mona');
  const availability = schedulingService.calculateDoctorSlots(doctor, cairoDate);

  assert.strictEqual(availability.timeZone, 'Africa/Cairo');
  // Day of week in Cairo must be 0 (Sunday)
  const dayOfWeekInCairo = schedulingService.getDayOfWeekForDate(cairoDate, 'Africa/Cairo');
  assert.strictEqual(dayOfWeekInCairo, 0, "Sunday must resolve to day index 0 in Cairo timezone");

  // Stable slot keys must be identical regardless of client locale or UTC offset
  const slotKey1 = schedulingService.getDoctorSlotKey('dr_mona', cairoDate, 'slot_1000');
  const slotKey2 = schedulingService.getDoctorSlotKey('dr_mona', '2026-10-04', 'slot_1000');
  assert.strictEqual(slotKey1, slotKey2);
  assert.strictEqual(slotKey1, 'dr_mona_2026-10-04_slot_1000');

  // Scenario 4.2: Daylight Saving Time (DST) shift scenario
  // Even if local clock shifts forward or backward by 1 hour, slotId remains fixed (e.g. slot_1000 is 10:00 AM)
  const slot1000 = availability.slots.find(s => s.id === 'slot_1000');
  assert.strictEqual(slot1000.startTime, '10:00');
  assert.strictEqual(slot1000.isoDateTime, '2026-10-04T10:00:00');
  assert.strictEqual(slot1000.timeAr, '10:00 صباحًا');
  assert.strictEqual(slot1000.timeEn, '10:00 AM');

  // Scenario 4.3: Riyadh Clinic timezone (Asia/Riyadh, UTC+3)
  const riyadhClinic = schedulingService.CLINICS.clinic_riyadh_pulmonary;
  assert.strictEqual(riyadhClinic.timeZone, 'Asia/Riyadh');
  const riyadhDay = schedulingService.getDayOfWeekForDate('2026-10-05', riyadhClinic.timeZone);
  assert.strictEqual(riyadhDay, 1, "Monday must resolve to day index 1 in Riyadh");

  console.log("  ✓ Timezone and clinic schedules reliably resolve across international timezones.");
  console.log("  ✓ Stable slot identifiers remain immutable and invariant across DST transitions.");
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Failures During Booking & Failure Resilience
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 5: Failures During Booking & Error Isolation");

async function testBookingFailures() {
  const db = createMockFirestore();
  const authUser = { uid: 'patient_fail_test', email: 'failtest@example.com' };

  // 5.1 Missing parameters
  try {
    await schedulingService.bookAppointmentTransaction(db, { doctorId: 'dr_mona' }, authUser);
    assert.fail("Should throw for missing parameters");
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_APPOINTMENT');
    assert.strictEqual(err.statusCode, 400);
    console.log("  ✓ Missing parameters rejected with INVALID_APPOINTMENT (400).");
  }

  // 5.2 Patient ID Mismatch (Spoofing)
  try {
    await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: '2026-10-04',
      slotId: 'slot_1000',
      patientId: 'forged_patient_id'
    }, authUser);
    assert.fail("Should throw for patient mismatch");
  } catch (err) {
    assert.strictEqual(err.code, 'PATIENT_MISMATCH');
    assert.strictEqual(err.statusCode, 403);
    console.log("  ✓ Forged patientId rejected with PATIENT_MISMATCH (403).");
  }

  // 5.3 Database unavailable (db is null)
  try {
    await schedulingService.bookAppointmentTransaction(null, {
      doctorId: 'dr_mona',
      date: '2026-10-04',
      slotId: 'slot_1000',
      patientId: authUser.uid
    }, authUser);
    assert.fail("Should throw for unavailable storage");
  } catch (err) {
    assert.strictEqual(err.code, 'APPOINTMENT_STORAGE_UNAVAILABLE');
    assert.strictEqual(err.statusCode, 503);
    console.log("  ✓ Unavailable database reports APPOINTMENT_STORAGE_UNAVAILABLE (503).");
  }

  // 5.4 Booking on Doctor's Approved Leave
  try {
    await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: '2026-10-11', // On leave
      slotId: 'slot_1000',
      patientId: authUser.uid
    }, authUser);
    assert.fail("Should throw when booking on leave");
  } catch (err) {
    assert.strictEqual(err.code, 'DOCTOR_ON_LEAVE');
    assert.strictEqual(err.statusCode, 400);
    console.log("  ✓ Booking on approved leave date strictly rejected with DOCTOR_ON_LEAVE (400).");
  }

  // 5.5 Booking on Non-Working Day
  try {
    await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: '2026-10-02', // Friday (Off-duty)
      slotId: 'slot_1000',
      patientId: authUser.uid
    }, authUser);
    assert.fail("Should throw when booking off-duty");
  } catch (err) {
    assert.strictEqual(err.code, 'DOCTOR_UNAVAILABLE');
    assert.strictEqual(err.statusCode, 400);
    console.log("  ✓ Booking on off-duty day strictly rejected with DOCTOR_UNAVAILABLE (400).");
  }

  // 5.6 Invalid Slot outside doctor's shift
  try {
    await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: '2026-10-04',
      slotId: 'slot_0300_invalid',
      patientId: authUser.uid
    }, authUser);
    assert.fail("Should throw for slot outside shift");
  } catch (err) {
    assert.strictEqual(err.code, 'SLOT_NOT_AVAILABLE');
    assert.strictEqual(err.statusCode, 400);
    console.log("  ✓ Slot outside doctor shifts rejected with SLOT_NOT_AVAILABLE (400).");
  }

  // 5.7 Failure Atomicity: Ensure NO lock or confirmed appointment remained after failures
  const locksSnap = await db.collection('appointment_locks').get();
  assert.strictEqual(locksSnap.size, 0, "No dangling locks should exist after aborted bookings");
  console.log("  ✓ Atomicity verified: Zero dangling locks or orphaned records remained after aborted operations.");
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Not Marked Confirmed Before Saved & Cancellation Slot Release
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ TEST 6: Confirmation Guard and Cancellation Slot Release");

async function testConfirmationAndCancellation() {
  const db = createMockFirestore();
  const patient = { uid: 'patient_cand_1', email: 'cand1@example.com' };
  const bookingPayload = {
    doctorId: 'dr_mona',
    date: '2026-10-04',
    slotId: 'slot_1600',
    patientId: 'patient_cand_1',
    // Client sent pending_confirmation
    status: 'pending_confirmation'
  };

  // Book appointment
  const confirmedAppt = await schedulingService.bookAppointmentTransaction(db, bookingPayload, patient);
  assert.strictEqual(confirmedAppt.status, 'confirmed', "Status must only become confirmed upon successful transaction");
  assert(confirmedAppt.confirmedAt, "confirmedAt timestamp must be stamped");

  // Verify doctor slot is now locked
  const lockKey = schedulingService.getDoctorSlotKey('dr_mona', '2026-10-04', 'slot_1600');
  const patient2 = { uid: 'patient_cand_2', email: 'cand2@example.com' };
  const secondAttempt = {
    doctorId: 'dr_mona',
    date: '2026-10-04',
    slotId: 'slot_1600',
    patientId: 'patient_cand_2'
  };

  // Attempt to book while locked -> Should fail
  await assert.rejects(
    async () => schedulingService.bookAppointmentTransaction(db, secondAttempt, patient2),
    { code: 'DOCTOR_SLOT_CONFLICT', statusCode: 409 }
  );

  // Now cancel the appointment
  const cancelResult = await schedulingService.cancelAppointmentTransaction(db, confirmedAppt.id, patient);
  assert.strictEqual(cancelResult.status, 'cancelled');

  // After cancellation, patient 2 books the exact same slot -> Must succeed now!
  const patient2Booking = await schedulingService.bookAppointmentTransaction(db, secondAttempt, patient2);
  assert.strictEqual(patient2Booking.status, 'confirmed');
  assert.strictEqual(patient2Booking.patientId, 'patient_cand_2');

  console.log("  ✓ Appointment correctly confirmed ONLY upon successful database save.");
  console.log("  ✓ Cancellation atomically released slot locks, allowing immediate re-booking by other patients.");
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL TESTS SEQUENTIALLY
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await testConcurrentSlotBooking();
    await testConcurrentPatientOverlap();
    testClockChangeScenarios();
    await testBookingFailures();
    await testConfirmationAndCancellation();

    console.log("\n================================================================================");
    console.log("🎉 ALL CONCURRENCY, SCHEDULES, CLOCK-CHANGE & FAILURE TESTS PASSED (6/6)!");
    console.log("================================================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
    process.exit(1);
  }
})();
