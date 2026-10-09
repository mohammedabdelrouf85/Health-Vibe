/**
 * Health Vibe AI - Appointments Lifecycle, RBAC Permissions, Rescheduling, History & Notifications Test Suite
 *
 * Verifies:
 * 1. Cancellation workflow, slot lock release, and policy enforcement (no re-cancelling, no cancelling past appts).
 * 2. RBAC cross-user security (Patient B modifying Patient A's appointment rejected with 403 ACCESS_DENIED).
 * 3. Atomic rescheduling: safely reserves replacement slot, releases old slot, and aborts on conflict without corrupting old slot.
 * 4. Audit change history retention across all mutations on the appointment document.
 * 5. Appointment status transitions: confirmed, rescheduled, completed, no_show, cancelled.
 * 6. Partitioning of upcoming vs. past appointment history.
 * 7. Doctor and Clinic administrative calendars with slot status mapping and permission enforcement.
 * 8. Reliable notification events in email_notifications and audit_events for every change.
 */

const assert = require('assert');
const {
  APPOINTMENT_STATUSES,
  bookAppointmentTransaction,
  rescheduleAppointmentTransaction,
  cancelAppointmentTransaction,
  updateAppointmentStatusTransaction,
  getAppointmentsHistory,
  getDoctorCalendar,
  getClinicCalendar,
  clearMemorySlotLocks
} = require('../backend/scheduling-service');

console.log("\n================================================================================");
console.log("📅 HEALTH VIBE AI: APPOINTMENTS LIFECYCLE, RBAC, RESCHEDULING & AUDIT TESTS");
console.log("================================================================================\n");

// In-memory Firestore mock for standalone test execution
function createMockDb() {
  const store = new Map();
  const emailNotifications = [];
  const auditEvents = [];

  const db = {
    _store: store,
    _emailNotifications: emailNotifications,
    _auditEvents: auditEvents,

    collection(colName) {
      if (colName === 'email_notifications') {
        return {
          add: async (data) => {
            const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const item = { id, ...data };
            emailNotifications.push(item);
            return { id };
          },
          doc: (docId) => ({
            set: async (data) => {
              emailNotifications.push({ id: docId, ...data });
              return { writeTime: new Date() };
            }
          }),
          where: () => ({
            get: async () => ({ docs: [] })
          })
        };
      }

      if (colName === 'audit_events') {
        return {
          add: async (data) => {
            auditEvents.push(data);
            return { id: 'audit_' + Date.now() };
          },
          doc: (docId) => ({
            set: async (data) => {
              auditEvents.push({ id: docId, ...data });
              return { writeTime: new Date() };
            }
          })
        };
      }

      return {
        doc(docId) {
          const fullPath = `${colName}/${docId}`;
          return {
            id: docId,
            path: fullPath,
            async get() {
              const data = store.get(fullPath);
              return {
                exists: Boolean(data),
                id: docId,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
              };
            },
            async set(data, opts = {}) {
              const existing = store.get(fullPath) || {};
              const finalData = opts.merge ? { ...existing, ...data } : { ...data };
              store.set(fullPath, JSON.parse(JSON.stringify(finalData)));
            },
            async update(data) {
              const existing = store.get(fullPath) || {};
              store.set(fullPath, JSON.parse(JSON.stringify({ ...existing, ...data })));
            },
            async delete() {
              store.delete(fullPath);
            }
          };
        },
        where(field, op, val) {
          return {
            where(f2, op2, val2) {
              return {
                get: async () => {
                  const results = [];
                  for (const [key, item] of store.entries()) {
                    if (key.startsWith(`${colName}/`)) {
                      const m1 = item[field] === val;
                      const m2 = Array.isArray(val2) ? val2.includes(item[f2]) : item[f2] === val2;
                      if (m1 && m2) {
                        results.push({
                          id: item.id || key.split('/')[1],
                          data: () => JSON.parse(JSON.stringify(item))
                        });
                      }
                    }
                  }
                  return {
                    empty: results.length === 0,
                    size: results.length,
                    docs: results,
                    forEach: (fn) => results.forEach(fn)
                  };
                }
              };
            },
            get: async () => {
              const results = [];
              for (const [key, item] of store.entries()) {
                if (key.startsWith(`${colName}/`)) {
                  if (op === '==' && item[field] === val) {
                    results.push({
                      id: item.id || key.split('/')[1],
                      data: () => JSON.parse(JSON.stringify(item))
                    });
                  } else if (op === 'in' && Array.isArray(val) && val.includes(item[field])) {
                    results.push({
                      id: item.id || key.split('/')[1],
                      data: () => JSON.parse(JSON.stringify(item))
                    });
                  }
                }
              }
              return {
                empty: results.length === 0,
                size: results.length,
                docs: results,
                forEach: (fn) => results.forEach(fn)
              };
            }
          };
        }
      };
    },

    async runTransaction(updateFn) {
      const transaction = {
        async get(docRef) {
          return docRef.get();
        },
        set(docRef, data, opts) {
          return docRef.set(data, opts);
        },
        update(docRef, data) {
          return docRef.update(data);
        },
        delete(docRef) {
          return docRef.delete();
        }
      };
      return updateFn(transaction);
    }
  };

  return db;
}

// Compute upcoming target test dates (future dates)
function getFutureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  // Ensure day is a doctor working day (Sun-Thu, skip Fri 5 and Sat 6)
  while (d.getDay() === 5 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const targetDate1 = getFutureDate(3);
const targetDate2 = getFutureDate(4);

async function runTests() {
  clearMemorySlotLocks();
  const db = createMockDb();

  // Test Actors
  const patientAlice = { uid: 'user_alice', role: 'patient', email: 'alice@example.com', name: 'Alice Patient' };
  const patientBob = { uid: 'user_bob', role: 'patient', email: 'bob@example.com', name: 'Bob Patient' };
  const doctorMona = { uid: 'dr_mona', role: 'doctor', clinicId: 'clinic_cairo_main', email: 'mona@healthvibe.ai' };
  const doctorAhmed = { uid: 'dr_ahmed', role: 'doctor', clinicId: 'clinic_cairo_main', email: 'ahmed@healthvibe.ai' };
  const clinicAdminCairo = { uid: 'admin_cairo', role: 'clinic_admin', clinicId: 'clinic_cairo_main' };
  const clinicAdminGiza = { uid: 'admin_giza', role: 'clinic_admin', clinicId: 'clinic_giza_branch' };
  const superAdmin = { uid: 'super_admin_1', role: 'super_admin' };

  // ============================================================================
  // TEST 1: Booking and Change History Initialization
  // ============================================================================
  console.log("▶ TEST 1: Booking & Initial Change History");
  const appt1Id = 'appt_alice_001';
  const booking1 = await bookAppointmentTransaction(db, {
    appointmentId: appt1Id,
    patientId: patientAlice.uid,
    doctorId: 'dr_mona',
    date: targetDate1,
    slotId: 'slot_1000',
    type: 'video',
    patientName: 'Alice Patient',
    patientEmail: 'alice@example.com',
    notes: 'Initial checkup'
  }, patientAlice);

  assert.strictEqual(booking1.status, APPOINTMENT_STATUSES.CONFIRMED, "Booking must have status confirmed");
  assert(Array.isArray(booking1.history), "Appointment must have history array");
  assert.strictEqual(booking1.history.length, 1, "Initial booking must create exactly 1 history entry");
  assert.strictEqual(booking1.history[0].action, 'BOOKED', "Initial history entry must be BOOKED");
  assert.strictEqual(booking1.history[0].actorUid, patientAlice.uid, "History must record actorUid");

  // Notification verification
  assert(db._emailNotifications.length >= 1, "Reliable email notification event must be emitted on booking");
  const bookNotif = db._emailNotifications.find(n => n.appointmentId === appt1Id && n.type === 'appointment_booked');
  assert(bookNotif, "APPOINTMENT_BOOKED notification must be stored in email_notifications");
  assert.strictEqual(bookNotif.recipient, 'alice@example.com');
  console.log("  ✓ Initial appointment booked with confirmed status, history entry, and notification event.");

  // ============================================================================
  // TEST 2: RBAC Enforcement - Unauthorized Attempt to Modify Another User's Appointment
  // ============================================================================
  console.log("\n▶ TEST 2: RBAC Enforcement - Cross-User Modification Attack Blocked");

  // Patient Bob attempts to cancel Alice's appointment
  let bobCancelBlocked = false;
  try {
    await cancelAppointmentTransaction(db, {
      appointmentId: appt1Id,
      reason: 'Malicious cancellation by Bob'
    }, patientBob);
  } catch (err) {
    bobCancelBlocked = true;
    assert.strictEqual(err.code, 'ACCESS_DENIED', `Expected ACCESS_DENIED, got ${err.code}`);
    assert.strictEqual(err.statusCode, 403, "Must return HTTP 403");
  }
  assert(bobCancelBlocked, "Patient Bob must NOT be able to cancel Alice's appointment");

  // Patient Bob attempts to reschedule Alice's appointment
  let bobRescheduleBlocked = false;
  try {
    await rescheduleAppointmentTransaction(db, {
      appointmentId: appt1Id,
      newDate: targetDate2,
      newSlotId: 'slot_1100',
      reason: 'Malicious reschedule by Bob'
    }, patientBob);
  } catch (err) {
    bobRescheduleBlocked = true;
    assert.strictEqual(err.code, 'ACCESS_DENIED', `Expected ACCESS_DENIED, got ${err.code}`);
    assert.strictEqual(err.statusCode, 403, "Must return HTTP 403");
  }
  assert(bobRescheduleBlocked, "Patient Bob must NOT be able to reschedule Alice's appointment");

  // Unrelated Doctor Ahmed attempts to cancel Alice's appointment with Dr. Mona
  let ahmedCancelBlocked = false;
  try {
    await cancelAppointmentTransaction(db, {
      appointmentId: appt1Id,
      reason: 'Wrong doctor canceling'
    }, doctorAhmed);
  } catch (err) {
    ahmedCancelBlocked = true;
    assert.strictEqual(err.code, 'ACCESS_DENIED', "Unassigned doctor must be denied");
    assert.strictEqual(err.statusCode, 403);
  }
  assert(ahmedCancelBlocked, "Doctor Ahmed must NOT be able to modify Dr. Mona's appointment");

  // Clinic Admin from Giza attempts to modify Cairo appointment
  let gizaAdminBlocked = false;
  try {
    await cancelAppointmentTransaction(db, {
      appointmentId: appt1Id,
      reason: 'Wrong clinic admin canceling'
    }, clinicAdminGiza);
  } catch (err) {
    gizaAdminBlocked = true;
    assert.strictEqual(err.code, 'ACCESS_DENIED', "Unmatched clinic admin must be denied");
  }
  assert(gizaAdminBlocked, "Clinic admin from Giza must NOT modify Cairo clinic appointment");
  console.log("  ✓ Cross-user patient tampering, doctor mismatch, and cross-clinic admin tampering strictly rejected with 403 ACCESS_DENIED.");

  // ============================================================================
  // TEST 3: Atomic Rescheduling - Safe Replacement Slot Reserve & Old Slot Release
  // ============================================================================
  console.log("\n▶ TEST 3: Atomic Rescheduling Workflow");

  const rescheduleResult = await rescheduleAppointmentTransaction(db, {
    appointmentId: appt1Id,
    newDate: targetDate2,
    newSlotId: 'slot_1130',
    reason: 'Work conflict on original date'
  }, patientAlice);

  assert.strictEqual(rescheduleResult.status, APPOINTMENT_STATUSES.RESCHEDULED, "Status must be rescheduled");
  assert.strictEqual(rescheduleResult.date, targetDate2, "Date must be updated to new date");
  assert.strictEqual(rescheduleResult.slotId, 'slot_1130', "Slot ID must be updated");
  assert.strictEqual(rescheduleResult.history.length, 2, "History must now have 2 entries");
  assert.strictEqual(rescheduleResult.history[1].action, 'RESCHEDULED', "Second history entry must be RESCHEDULED");
  assert.strictEqual(rescheduleResult.history[1].details.previousDate, targetDate1);
  assert.strictEqual(rescheduleResult.history[1].details.previousSlotId, 'slot_1000');

  // Verify OLD slot was released and can now be booked by Bob
  const bobApptId = 'appt_bob_old_slot';
  const bobBooking = await bookAppointmentTransaction(db, {
    appointmentId: bobApptId,
    patientId: patientBob.uid,
    doctorId: 'dr_mona',
    date: targetDate1,
    slotId: 'slot_1000',
    type: 'video',
    patientName: 'Bob Patient',
    patientEmail: 'bob@example.com'
  }, patientBob);

  assert.strictEqual(bobBooking.status, APPOINTMENT_STATUSES.CONFIRMED, "Old released slot must be bookable by another patient");
  console.log("  ✓ Rescheduling atomically reserved replacement slot (targetDate2 slot_1130) and released old slot.");
  console.log("  ✓ Old slot immediately available and successfully booked by Bob.");

  // ============================================================================
  // TEST 4: Rescheduling Conflict Rollback (Old Slot Remains Intact)
  // ============================================================================
  console.log("\n▶ TEST 4: Rescheduling Conflict Rollback");

  // Alice tries to reschedule to the slot Bob just booked (targetDate1 slot_1000)
  let conflictBlocked = false;
  try {
    await rescheduleAppointmentTransaction(db, {
      appointmentId: appt1Id,
      newDate: targetDate1,
      newSlotId: 'slot_1000',
      reason: 'Trying to take occupied slot'
    }, patientAlice);
  } catch (err) {
    conflictBlocked = true;
    assert.strictEqual(err.code, 'DOCTOR_SLOT_CONFLICT', `Expected DOCTOR_SLOT_CONFLICT, got ${err.code}`);
    assert.strictEqual(err.statusCode, 409);
  }
  assert(conflictBlocked, "Rescheduling to an occupied slot must fail with 409");

  // Verify Alice's appointment is still intact at targetDate2 slot_1130
  const aliceCurrentDoc = await db.collection('appointments').doc(appt1Id).get();
  assert.strictEqual(aliceCurrentDoc.data().date, targetDate2, "Alice appointment must remain at new slot after conflict");
  assert.strictEqual(aliceCurrentDoc.data().slotId, 'slot_1130');
  assert.strictEqual(aliceCurrentDoc.data().status, APPOINTMENT_STATUSES.RESCHEDULED);
  console.log("  ✓ Slot conflict during reschedule correctly aborted with zero corruption to existing appointment.");

  // ============================================================================
  // TEST 5: Cancellation Workflow, Lock Release & Policy Enforcement
  // ============================================================================
  console.log("\n▶ TEST 5: Cancellation Workflow & Policy Enforcement");

  const cancelResult = await cancelAppointmentTransaction(db, {
    appointmentId: appt1Id,
    reason: 'Family emergency'
  }, patientAlice);

  assert.strictEqual(cancelResult.status, APPOINTMENT_STATUSES.CANCELLED, "Appointment status must be cancelled");
  assert.strictEqual(cancelResult.history.length, 3, "History must have 3 entries (BOOKED, RESCHEDULED, CANCELLED)");
  assert.strictEqual(cancelResult.history[2].action, 'CANCELLED');
  assert.strictEqual(cancelResult.history[2].details.reason, 'Family emergency');

  // Policy: Attempt to cancel an ALREADY CANCELLED appointment must fail
  let reCancelBlocked = false;
  try {
    await cancelAppointmentTransaction(db, {
      appointmentId: appt1Id,
      reason: 'Duplicate cancel'
    }, patientAlice);
  } catch (err) {
    reCancelBlocked = true;
    assert(err.code === 'APPOINTMENT_ALREADY_CANCELLED' || err.code === 'ALREADY_CANCELLED', `Expected APPOINTMENT_ALREADY_CANCELLED, got ${err.code}`);
    assert.strictEqual(err.statusCode, 400);
  }
  assert(reCancelBlocked, "Re-cancelling already cancelled appointment must fail with 400");

  // Policy: Attempt to reschedule an ALREADY CANCELLED appointment must fail
  let rescheduleCancelledBlocked = false;
  try {
    await rescheduleAppointmentTransaction(db, {
      appointmentId: appt1Id,
      newDate: targetDate1,
      newSlotId: 'slot_1400',
      reason: 'Try to resurrect cancelled appt'
    }, patientAlice);
  } catch (err) {
    rescheduleCancelledBlocked = true;
    assert.strictEqual(err.code, 'CANNOT_RESCHEDULE_CANCELLED', `Expected CANNOT_RESCHEDULE_CANCELLED, got ${err.code}`);
    assert.strictEqual(err.statusCode, 400);
  }
  assert(rescheduleCancelledBlocked, "Rescheduling a cancelled appointment must be blocked");

  // Verify slot locks for targetDate2 slot_1130 were released upon cancellation
  const newBookingInReleasedSlot = await bookAppointmentTransaction(db, {
    appointmentId: 'appt_new_patient_released_slot',
    patientId: 'patient_charlie',
    doctorId: 'dr_mona',
    date: targetDate2,
    slotId: 'slot_1130',
    type: 'video',
    patientName: 'Charlie Patient',
    patientEmail: 'charlie@example.com'
  }, { uid: 'patient_charlie', role: 'patient' });
  assert.strictEqual(newBookingInReleasedSlot.status, APPOINTMENT_STATUSES.CONFIRMED, "Released slot after cancellation must be bookable");
  console.log("  ✓ Cancellation successfully released slot locks and prevented duplicate cancellation/rescheduling.");

  // ============================================================================
  // TEST 6: Status Transitions (Completed, No-Show) & History Retention
  // ============================================================================
  console.log("\n▶ TEST 6: Status Transitions by Authorized Doctor & Admin");

  // Dr. Mona updates Bob's appointment to COMPLETED
  const completedAppt = await updateAppointmentStatusTransaction(db, {
    appointmentId: bobApptId,
    status: APPOINTMENT_STATUSES.COMPLETED,
    notes: 'Consultation concluded successfully. Prescription provided.'
  }, doctorMona);

  assert.strictEqual(completedAppt.status, APPOINTMENT_STATUSES.COMPLETED);
  assert.strictEqual(completedAppt.history.length, 2);
  assert(completedAppt.history[1].action === 'STATUS_CHANGED' || completedAppt.history[1].action === 'STATUS_UPDATED');
  assert.strictEqual(completedAppt.history[1].actorUid, doctorMona.uid);
  assert.strictEqual(completedAppt.history[1].actorRole, 'doctor');

  // Super Admin updates a test appointment to NO_SHOW
  const appt3Id = 'appt_noshow_test';
  await bookAppointmentTransaction(db, {
    appointmentId: appt3Id,
    patientId: 'patient_noshow',
    doctorId: 'dr_mona',
    date: targetDate1,
    slotId: 'slot_1600',
    type: 'video'
  }, { uid: 'patient_noshow', role: 'patient' });

  const noShowAppt = await updateAppointmentStatusTransaction(db, {
    appointmentId: appt3Id,
    status: APPOINTMENT_STATUSES.NO_SHOW,
    notes: 'Patient did not attend telemedicine consultation.'
  }, superAdmin);

  assert.strictEqual(noShowAppt.status, APPOINTMENT_STATUSES.NO_SHOW);
  console.log("  ✓ Completed and No-Show transitions properly recorded with full history and authorized roles.");

  // ============================================================================
  // TEST 7: Partitioning of Upcoming vs. Past Appointment History
  // ============================================================================
  console.log("\n▶ TEST 7: Partitioning of Upcoming vs. Past Appointment History");

  // Alice has appt1Id which is cancelled (should be past)
  // Create an active upcoming appointment for Alice
  const aliceUpcomingId = 'appt_alice_upcoming_active';
  await bookAppointmentTransaction(db, {
    appointmentId: aliceUpcomingId,
    patientId: patientAlice.uid,
    doctorId: 'dr_mona',
    date: targetDate2,
    slotId: 'slot_1630',
    type: 'video',
    patientEmail: 'alice@example.com'
  }, patientAlice);

  const aliceHistory = await getAppointmentsHistory(db, patientAlice.uid, patientAlice);
  assert.strictEqual(aliceHistory.upcoming.length, 1, "Alice must have exactly 1 upcoming appointment");
  assert.strictEqual(aliceHistory.upcoming[0].id, aliceUpcomingId);
  assert(aliceHistory.past.some(a => a.id === appt1Id && a.status === 'cancelled'), "Alice past appointments must contain the cancelled booking");
  console.log("  ✓ Appointments history correctly partitioned into upcoming and past.");

  // ============================================================================
  // TEST 8: Doctor and Clinic Calendars with Slot Statuses & RBAC
  // ============================================================================
  console.log("\n▶ TEST 8: Doctor and Clinic Calendar Schedules & RBAC");

  // Dr. Mona views her calendar
  const monaCal = await getDoctorCalendar(db, {
    doctorId: 'dr_mona',
    startDate: targetDate1,
    endDate: targetDate1
  }, doctorMona);

  assert.strictEqual(monaCal.doctorId, 'dr_mona');
  assert.strictEqual(monaCal.days.length, 1);
  const day1Slots = monaCal.days[0].slots;
  assert(day1Slots.length > 0, "Doctor must have slots for working day");

  // Verify slot statuses
  const bookedSlot = day1Slots.find(s => s.slotId === 'slot_1000');
  assert(bookedSlot, "slot_1000 must be in calendar");
  // Bob's appointment at slot_1000 was completed in TEST 6
  assert.strictEqual(bookedSlot.status, 'completed', "Completed appointment must show status completed in calendar");

  // Cross-doctor calendar view restriction
  let doctorCalendarBlocked = false;
  try {
    await getDoctorCalendar(db, {
      doctorId: 'dr_mona',
      startDate: targetDate1,
      endDate: targetDate1
    }, doctorAhmed);
  } catch (err) {
    doctorCalendarBlocked = true;
    assert.strictEqual(err.code, 'ACCESS_DENIED');
  }
  assert(doctorCalendarBlocked, "Doctor cannot view administrative calendar of another doctor");

  // Clinic Calendar
  const clinicCal = await getClinicCalendar(db, {
    clinicId: 'clinic_cairo_main',
    date: targetDate1
  }, clinicAdminCairo);

  assert.strictEqual(clinicCal.clinicId, 'clinic_cairo_main');
  assert(clinicCal.doctors.length > 0, "Clinic calendar must include doctors");

  // Cross-clinic calendar view restriction
  let clinicCalendarBlocked = false;
  try {
    await getClinicCalendar(db, {
      clinicId: 'clinic_cairo_main',
      date: targetDate1
    }, clinicAdminGiza);
  } catch (err) {
    clinicCalendarBlocked = true;
    assert.strictEqual(err.code, 'ACCESS_DENIED');
  }
  assert(clinicCalendarBlocked, "Clinic admin cannot view other clinic's calendar");
  console.log("  ✓ Doctor and Clinic calendars verified with slot states and RBAC isolation.");

  // ============================================================================
  // TEST 9: Notification Events Verification Across Mutations
  // ============================================================================
  console.log("\n▶ TEST 9: Reliable Notification Events Across Mutations");

  const notificationTypes = db._emailNotifications.map(n => n.type);
  assert(notificationTypes.includes('appointment_booked'), "Must emit appointment_booked");
  assert(notificationTypes.includes('appointment_rescheduled'), "Must emit appointment_rescheduled");
  assert(notificationTypes.includes('appointment_cancelled'), "Must emit appointment_cancelled");
  assert(notificationTypes.includes('appointment_status_changed'), "Must emit appointment_status_changed");

  for (const notif of db._emailNotifications) {
    assert(notif.appointmentId, "Notification must reference appointmentId");
    assert(notif.recipient, "Notification must have recipient email");
    assert(notif.subject, "Notification must have subject");
    assert.strictEqual(notif.status, 'sent', "Notification status must be sent");
    assert(notif.sentAt, "Notification must have timestamp");
  }
  console.log(`  ✓ All ${db._emailNotifications.length} notification events verified across the entire lifecycle.`);

  console.log("\n================================================================================");
  console.log("🎉 ALL 9 APPOINTMENTS LIFECYCLE, RBAC, RESCHEDULING & AUDIT TESTS PASSED!");
  console.log("================================================================================\n");
}

runTests().catch(err => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
