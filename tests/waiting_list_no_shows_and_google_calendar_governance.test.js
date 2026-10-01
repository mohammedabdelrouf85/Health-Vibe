/**
 * Health Vibe AI - Waiting List, No-Show Tracking & Google Calendar Integration Test Suite
 *
 * Verifies:
 * 1. Waiting List: priority ordering (urgent > priority > routine), FIFO, duplicate prevention, and RBAC view isolation.
 * 2. No-Show Tracking: strict recording of WHO (actorUid, role) and WHY (reason), patient risk thresholds, clinic stats.
 * 3. Slot Offering Policy: automated offer on cancellation and rescheduling, temporary hold window.
 * 4. Anti-Double Booking: slot holds block concurrent third-party booking; atomic acceptance; cascading on decline/expiry.
 * 5. Google Calendar Consent & Least-Privilege: requires affirmative doctor consent; enforces minimal 'calendar.events' scope.
 * 6. Zero-PHI Event Minimization: external Google Calendar events contain zero diagnoses, vitals, or medications.
 * 7. Synchronization: booking creation, rescheduling, and cancellation sync to external calendar projection.
 * 8. Authoritative Source of Truth (SoT) & Conflict Reconciliation: Health Vibe DB strictly overrides external discrepancies.
 * 9. Express REST API Endpoints verification.
 */

const assert = require('assert');
const http = require('http');
const app = require('../backend/server');
const schedulingService = require('../backend/scheduling-service');
const waitingListService = require('../backend/waiting-list-service');
const googleCalendarService = require('../backend/google-calendar-service');

console.log("\n==================================================================");
console.log("📅 HEALTH VIBE AI: WAITING LIST, NO-SHOW & GOOGLE CALENDAR TESTS");
console.log("   Priority Policy, Anti-Double Booking, Consent & Source of Truth");
console.log("==================================================================\n");

// Helper mock DB simulating Firestore
function createMockDb() {
  const store = new Map();
  const db = {
    _store: store,
    collection(colName) {
      return {
        doc(docId) {
          const key = `${colName}/${docId}`;
          return {
            id: docId,
            get: async () => {
              const exists = store.has(key);
              const data = exists ? JSON.parse(JSON.stringify(store.get(key))) : undefined;
              return { id: docId, exists, data: () => data };
            },
            set: async (val, opts = {}) => {
              if (opts.merge && store.has(key)) {
                store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(val)) });
              } else {
                store.set(key, JSON.parse(JSON.stringify(val)));
              }
            },
            update: async (val) => {
              if (!store.has(key)) throw new Error(`Doc ${key} does not exist for update.`);
              store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(val)) });
            },
            delete: async () => {
              store.delete(key);
            }
          };
        },
        where: () => ({
          where: () => ({
            get: async () => ({ docs: [] })
          }),
          get: async () => ({ docs: [] })
        })
      };
    },
    runTransaction: async (updateFunction) => {
      const transaction = {
        get: async (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
        delete: (ref) => ref.delete()
      };
      return await updateFunction(transaction);
    }
  };
  return db;
}

async function runTests() {
  const db = createMockDb();
  waitingListService.clearWaitingListMemoryStore();
  googleCalendarService.clearGoogleCalendarMemoryStore();
  schedulingService.clearMemorySlotLocks();

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Waiting List Joining, Priority Tiers & Duplicate Prevention
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Waiting List Priority Tiers, FIFO Ordering & Validation');

  const targetDate = '2026-10-15';
  const doctorId = 'dr_mona';

  // 1A: Routine patient joins first
  const entryRoutine = await waitingListService.addToWaitingList(db, {
    patientId: 'usr_pat_routine',
    patientName: 'Omar Zaki',
    patientEmail: 'omar.zaki@example.com',
    doctorId,
    desiredDate: targetDate,
    urgencyTier: 'routine',
    notes: 'Routine checkup'
  }, { uid: 'usr_pat_routine', role: 'patient' });

  assert.strictEqual(entryRoutine.status, 'active');
  assert.strictEqual(entryRoutine.urgencyRank, 1);

  // 1B: Priority patient joins second
  const entryPriority = await waitingListService.addToWaitingList(db, {
    patientId: 'usr_pat_priority',
    patientName: 'Laila Hassan',
    patientEmail: 'laila.hassan@example.com',
    doctorId,
    desiredDate: targetDate,
    urgencyTier: 'priority',
    notes: 'Moderate asthma flare'
  }, { uid: 'usr_pat_priority', role: 'patient' });
  assert.strictEqual(entryPriority.urgencyRank, 2);

  // 1C: Urgent patient joins third
  const entryUrgent = await waitingListService.addToWaitingList(db, {
    patientId: 'usr_pat_urgent',
    patientName: 'Tarek Mansour',
    patientEmail: 'tarek.mansour@example.com',
    doctorId,
    desiredDate: targetDate,
    urgencyTier: 'urgent',
    notes: 'Severe respiratory distress assessment'
  }, { uid: 'usr_pat_urgent', role: 'patient' });
  assert.strictEqual(entryUrgent.urgencyRank, 3);

  // 1D: Duplicate entry prevention
  await assert.rejects(
    async () => waitingListService.addToWaitingList(db, {
      patientId: 'usr_pat_urgent',
      doctorId,
      desiredDate: targetDate
    }, { uid: 'usr_pat_urgent', role: 'patient' }),
    err => err.code === 'DUPLICATE_WAITING_LIST_ENTRY',
    'Must prevent duplicate active waiting list entry for same patient, doctor, and date'
  );

  // 1E: Query list sorted by policy: Urgent (3) > Priority (2) > Routine (1)
  const orderedList = await waitingListService.getWaitingList(db, {
    doctorId,
    desiredDate: targetDate
  }, { role: 'clinic_admin' });

  assert.strictEqual(orderedList.length, 3);
  assert.strictEqual(orderedList[0].patientId, 'usr_pat_urgent', 'Urgent tier must rank 1st');
  assert.strictEqual(orderedList[1].patientId, 'usr_pat_priority', 'Priority tier must rank 2nd');
  assert.strictEqual(orderedList[2].patientId, 'usr_pat_routine', 'Routine tier must rank 3rd');

  // 1F: Patient RBAC isolation: Omar can only see his own entry
  const omarView = await waitingListService.getWaitingList(db, {}, { uid: 'usr_pat_routine', role: 'patient' });
  assert.strictEqual(omarView.length, 1);
  assert.strictEqual(omarView[0].patientId, 'usr_pat_routine');

  console.log('  ✓ Waiting list priority tier sorting confirmed (Urgent > Priority > Routine).');
  console.log('  ✓ Duplicate active waiting list entries rejected.');
  console.log('  ✓ Patient data access isolation strictly enforced.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Strict No-Show Tracking with Attribution (WHO & WHY)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: No-Show Tracking, Attribution (WHO & WHY) & Risk Thresholds');

  // Book an appointment first
  const apptForNoShow = await schedulingService.bookAppointmentTransaction(db, {
    appointmentId: 'appt_test_noshow_001',
    patientId: 'usr_chronic_noshow_patient',
    patientName: 'Nader Fouad',
    doctorId: 'dr_mona',
    clinicId: 'clinic_cairo_main',
    date: '2026-10-14',
    slotId: 'slot_1000',
    timeSlot: '10:00 صباحاً'
  }, { uid: 'usr_chronic_noshow_patient', email: 'nader@example.com', role: 'patient' });

  // 2A: Patient attempts to mark no-show -> REJECTED (403 ACCESS_DENIED)
  await assert.rejects(
    async () => waitingListService.recordNoShow(db, {
      appointmentId: apptForNoShow.id,
      reason: 'I could not make it'
    }, { uid: 'usr_chronic_noshow_patient', role: 'patient' }),
    err => err.code === 'ACCESS_DENIED',
    'Patients must NOT be allowed to mark appointments as No-Show'
  );

  // 2B: Doctor attempts to mark no-show WITHOUT a reason -> REJECTED (400 MISSING_NO_SHOW_REASON)
  await assert.rejects(
    async () => waitingListService.recordNoShow(db, {
      appointmentId: apptForNoShow.id,
      reason: '' // Empty reason
    }, { uid: 'dr_mona', role: 'doctor' }),
    err => err.code === 'MISSING_NO_SHOW_REASON',
    'Recording No-Show must require a non-empty reason explaining WHY'
  );

  // 2C: Doctor marks no-show with valid reason -> SUCCESS
  const noShowResult = await waitingListService.recordNoShow(db, {
    appointmentId: apptForNoShow.id,
    reason: 'Patient did not arrive within 30 minutes of appointment time and did not answer triage call',
    notes: 'Phone rang with no response.'
  }, { uid: 'dr_mona', role: 'doctor', email: 'dr.mona@healthvibe.ai' });

  assert.strictEqual(noShowResult.success, true);
  assert.strictEqual(noShowResult.appointment.status, 'no_show');
  assert.strictEqual(noShowResult.appointment.noShowRecordedBy, 'dr_mona');
  assert.strictEqual(noShowResult.appointment.noShowReason.includes('did not arrive'), true);

  // Verify change history captured WHO and WHY
  const lastHistory = noShowResult.appointment.history.slice(-1)[0];
  assert.strictEqual(lastHistory.action, 'NO_SHOW_RECORDED');
  assert.strictEqual(lastHistory.actorUid, 'dr_mona');
  assert.strictEqual(lastHistory.actorRole, 'doctor');
  assert.strictEqual(lastHistory.reason.includes('did not arrive'), true);

  // 2D: Track patient metrics & High Risk Threshold
  // Record 2 more no-shows for this patient to hit threshold >= 3
  await db.collection('appointments').doc('appt_test_noshow_002').set({
    id: 'appt_test_noshow_002',
    patientId: 'usr_chronic_noshow_patient',
    doctorId: 'dr_mona',
    clinicId: 'clinic_cairo_main',
    date: '2026-10-14',
    slotId: 'slot_1030',
    status: 'confirmed'
  });
  await db.collection('appointments').doc('appt_test_noshow_003').set({
    id: 'appt_test_noshow_003',
    patientId: 'usr_chronic_noshow_patient',
    doctorId: 'dr_mona',
    clinicId: 'clinic_cairo_main',
    date: '2026-10-14',
    slotId: 'slot_1100',
    status: 'confirmed'
  });

  await waitingListService.recordNoShow(db, {
    appointmentId: 'appt_test_noshow_002',
    reason: 'Second unexcused absence'
  }, { uid: 'dr_mona', role: 'doctor' });

  const thirdNoShow = await waitingListService.recordNoShow(db, {
    appointmentId: 'appt_test_noshow_003',
    reason: 'Third unexcused absence'
  }, { uid: 'dr_mona', role: 'doctor' });

  assert.strictEqual(thirdNoShow.patientMetrics.noShowCount, 3);
  assert.strictEqual(thirdNoShow.patientMetrics.hasHighNoShowRisk, true, 'Threshold of 3 must trigger high risk flag');

  // Clinic summary
  const clinicStats = await waitingListService.getClinicNoShowStats(db, 'clinic_cairo_main', { role: 'clinic_admin' });
  assert.ok(clinicStats.totalNoShows >= 3);
  assert.strictEqual(clinicStats.highRiskPatientCount, 1);

  console.log('  ✓ No-Show status change strictly mandates recording WHO and WHY.');
  console.log('  ✓ Patients barred from marking no-show (staff only).');
  console.log('  ✓ Patient no-show metrics and High Risk Threshold (>= 3) successfully flagged.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Slot Release to Waiting List via Cancellation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Cancellation Slot Release & Automated Waiting List Offering');

  // Existing appointment on 2026-10-15 slot_10_00
  const apptToCancel = await schedulingService.bookAppointmentTransaction(db, {
    appointmentId: 'appt_to_cancel_101',
    patientId: 'usr_pat_original',
    patientName: 'Karim Adel',
    doctorId: 'dr_mona',
    clinicId: 'clinic_cairo_main',
    date: targetDate,
    slotId: 'slot_1000',
    timeSlot: '10:00 صباحاً'
  }, { uid: 'usr_pat_original', email: 'karim@example.com', role: 'patient' });

  // Cancel appointment -> Frees slot_1000
  const cancelResult = await schedulingService.cancelAppointmentTransaction(db, apptToCancel.id, {
    uid: 'usr_pat_original',
    role: 'patient'
  }, { reason: 'Travel emergency' });

  assert.strictEqual(cancelResult.success, true);
  assert.strictEqual(cancelResult.status, 'cancelled');

  // Verify that the freed slot was immediately offered to the top waiting list candidate (usr_pat_urgent)
  const urgentEntry = waitingListService._inMemoryWaitingList.get(entryUrgent.id);
  assert.strictEqual(urgentEntry.status, 'offered');
  assert.strictEqual(urgentEntry.offeredSlot.slotId, 'slot_1000');
  assert.strictEqual(urgentEntry.offeredSlot.date, targetDate);
  assert.ok(urgentEntry.offerExpiresAt);

  console.log('  ✓ Appointment cancellation atomically released slot.');
  console.log('  ✓ Slot automatically offered to top-ranked waiting list candidate (Tarek Mansour - Urgent).\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Anti-Double-Booking Protection on Offered Slots
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Anti-Double-Booking Protection on Offered Slots');

  // 4A: Third-party patient (e.g. random patient) attempts to book the offered slot
  await assert.rejects(
    async () => schedulingService.bookAppointmentTransaction(db, {
      appointmentId: 'appt_intruder_booking_attempt',
      patientId: 'usr_pat_intruder',
      patientName: 'Intruder Patient',
      doctorId: 'dr_mona',
      clinicId: 'clinic_cairo_main',
      date: targetDate,
      slotId: 'slot_1000',
      timeSlot: '10:00 صباحاً'
    }, { uid: 'usr_pat_intruder', email: 'intruder@example.com', role: 'patient' }),
    err => err.code === 'DOCTOR_SLOT_OFFER_HOLD',
    'Third-party booking must be blocked while slot is on offer hold'
  );

  // 4B: Another patient attempts to accept an offer not addressed to them
  await assert.rejects(
    async () => waitingListService.acceptWaitingListOffer(db, {
      waitingListId: entryUrgent.id
    }, { uid: 'usr_pat_routine', role: 'patient' }),
    err => err.code === 'ACCESS_DENIED',
    'Unauthorized patient cannot accept someone else offer'
  );

  // 4C: The legitimate offered candidate (usr_pat_urgent) accepts the offer!
  const acceptedResult = await waitingListService.acceptWaitingListOffer(db, {
    waitingListId: entryUrgent.id,
    bookingService: schedulingService
  }, { uid: 'usr_pat_urgent', role: 'patient' });

  assert.strictEqual(acceptedResult.success, true);
  assert.strictEqual(acceptedResult.waitingListEntry.status, 'booked');
  assert.strictEqual(acceptedResult.appointment.patientId, 'usr_pat_urgent');
  assert.strictEqual(acceptedResult.appointment.status, 'confirmed');

  // 4D: Now that it is confirmed, subsequent bookings fail with DOCTOR_SLOT_CONFLICT
  await assert.rejects(
    async () => schedulingService.bookAppointmentTransaction(db, {
      appointmentId: 'appt_another_attempt',
      patientId: 'usr_pat_another',
      doctorId: 'dr_mona',
      clinicId: 'clinic_cairo_main',
      date: targetDate,
      slotId: 'slot_1000',
      timeSlot: '10:00 صباحاً'
    }, { uid: 'usr_pat_another', role: 'patient' }),
    err => err.code === 'DOCTOR_SLOT_CONFLICT',
    'Confirmed appointment slot must remain strictly locked'
  );

  console.log('  ✓ Anti-double-booking verified: Third-parties blocked by offer hold.');
  console.log('  ✓ Eligible candidate converted offer to confirmed appointment atomically.');
  console.log('  ✓ Subsequent concurrent booking blocked by confirmed slot lock.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Cascading Offers on Decline
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: Cascading Slot Offers on Candidate Decline');

  // Book and reschedule another slot on targetDate (slot_1030) to test cascade
  const apptToReschedule = await schedulingService.bookAppointmentTransaction(db, {
    appointmentId: 'appt_for_reschedule_202',
    patientId: 'usr_pat_original_2',
    doctorId: 'dr_mona',
    clinicId: 'clinic_cairo_main',
    date: targetDate,
    slotId: 'slot_1030',
    timeSlot: '10:30 صباحاً'
  }, { uid: 'usr_pat_original_2', role: 'patient' });

  // Reschedule to slot_1100 -> Frees slot_1030
  await schedulingService.rescheduleAppointmentTransaction(db, {
    appointmentId: apptToReschedule.id,
    newDate: targetDate,
    newSlotId: 'slot_1100',
    reason: 'Doctor consultation reschedule'
  }, { uid: 'usr_pat_original_2', role: 'patient' });

  // Old slot_1030 freed -> Automatically offered to next in line (usr_pat_priority)
  const priorityEntry = waitingListService._inMemoryWaitingList.get(entryPriority.id);
  assert.strictEqual(priorityEntry.status, 'offered');
  assert.strictEqual(priorityEntry.offeredSlot.slotId, 'slot_1030');

  // Priority candidate declines the offer
  await waitingListService.declineWaitingListOffer(db, {
    waitingListId: priorityEntry.id,
    reason: 'Cannot attend morning slot'
  }, { uid: 'usr_pat_priority', role: 'patient' });

  assert.strictEqual(priorityEntry.status, 'declined');

  // Offer must immediately cascade to the next candidate (usr_pat_routine)!
  const routineEntry = waitingListService._inMemoryWaitingList.get(entryRoutine.id);
  assert.strictEqual(routineEntry.status, 'offered');
  assert.strictEqual(routineEntry.offeredSlot.slotId, 'slot_1030');

  console.log('  ✓ Rescheduling atomically released old slot and offered it to waiting list.');
  console.log('  ✓ Candidate decline cleanly triggered automatic cascade to next eligible patient.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Google Calendar Integration: Consent & Least-Privilege Scopes
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 6: Google Calendar Integration: Doctor Consent & Least Privilege Scopes');

  // 6A: Connect without consent -> REJECTED (400 CONSENT_REQUIRED)
  await assert.rejects(
    async () => googleCalendarService.connectDoctorGoogleCalendar(db, 'dr_mona', {
      consent: false,
      googleEmail: 'dr.mona@clinic.com'
    }, { uid: 'dr_mona', role: 'doctor' }),
    err => err.code === 'CONSENT_REQUIRED',
    'Doctor consent must be required to enable Google Calendar sync'
  );

  // 6B: Requesting excessive broad scopes -> REJECTED (403 EXCESSIVE_SCOPE_FORBIDDEN)
  await assert.rejects(
    async () => googleCalendarService.connectDoctorGoogleCalendar(db, 'dr_mona', {
      consent: true,
      scopes: ['https://www.googleapis.com/auth/calendar'] // Broad administrative scope
    }, { uid: 'dr_mona', role: 'doctor' }),
    err => err.code === 'EXCESSIVE_SCOPE_FORBIDDEN',
    'Excessive broad scopes must be rejected under least privilege governance'
  );

  // 6C: Connect with affirmative consent and minimum required 'calendar.events' scope -> SUCCESS
  const connectResult = await googleCalendarService.connectDoctorGoogleCalendar(db, 'dr_mona', {
    consent: true,
    googleEmail: 'dr.mona.samy@healthvibe.clinic',
    calendarId: 'primary',
    scopes: ['https://www.googleapis.com/auth/calendar.events']
  }, { uid: 'dr_mona', role: 'doctor' });

  assert.strictEqual(connectResult.success, true);
  assert.strictEqual(connectResult.config.connected, true);
  assert.strictEqual(connectResult.config.consentGiven, true);
  assert.deepStrictEqual(connectResult.config.grantedScopes, ['https://www.googleapis.com/auth/calendar.events']);

  console.log('  ✓ Affirmative doctor consent strictly enforced.');
  console.log('  ✓ Least-privilege governance verified: Excessive scopes blocked, minimal events scope accepted.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 7: Zero-PHI Event Minimization in External Google Calendar
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 7: Zero-PHI Event Minimization in External Google Calendar');

  const sensitiveAppointment = {
    id: 'appt_clinical_gcal_001',
    patientId: 'usr_pat_secret_99',
    patientName: 'Sensitive Patient Name',
    doctorId: 'dr_mona',
    doctorNameEn: 'Dr. Mona Samy',
    clinicNameEn: 'Specialized Chest Clinic',
    clinicAddressEn: 'Abbas El-Akkad St, Cairo',
    clinicTimeZone: 'Africa/Cairo',
    date: '2026-10-18',
    slotId: 'slot_1130',
    timeSlotEn: '11:30 AM',
    status: 'confirmed',
    // Medical details present in internal record:
    diagnosis: 'Severe Chronic Obstructive Pulmonary Disease with SpO2 86%',
    medications: ['Prednisolone 40mg', 'Salbutamol Inhaler'],
    symptoms: 'Productive purulent cough with nocturnal dyspnea'
  };

  const gcalPayload = googleCalendarService.buildGoogleCalendarEventPayload(sensitiveAppointment);

  // Assertions: Event title and description must be generic and contain ZERO PHI
  const forbiddenTerms = [
    'copd', 'spo2', '86%', 'prednisolone', 'salbutamol', 'dyspnea', 'purulent', 'cough'
  ];

  const fullEventText = `${gcalPayload.summary} ${gcalPayload.description}`.toLowerCase();
  for (const term of forbiddenTerms) {
    assert.strictEqual(
      fullEventText.includes(term),
      false,
      `External Google Calendar event must NOT contain sensitive PHI '${term}'!`
    );
  }

  // Generic sanitized title & description verified
  assert.strictEqual(gcalPayload.summary, 'Health Vibe Consultation - Dr. Mona Samy');
  assert.ok(gcalPayload.description.includes('Confidential Clinical Consultation'));
  assert.ok(gcalPayload.description.includes('https://healthvibe.ai/app/index.html?screen=appointments'));
  assert.strictEqual(gcalPayload.attendees.length, 0, 'Patient email must NOT be leaked to external attendee list');

  console.log('  ✓ PHI Minimization verified: Zero diagnoses, vitals, or medications leaked to Google Calendar.');
  console.log('  ✓ Confidential summary and portal authentication deep link verified.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 8: Syncing Lifecycle: Booking, Rescheduling & Cancellation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 8: Synchronization Lifecycle (Creation, Reschedule & Cancellation)');

  // 8A: Booking synchronization
  const syncCreate = await googleCalendarService.syncAppointmentCreated(db, sensitiveAppointment);
  assert.strictEqual(syncCreate.synced, true);
  assert.ok(syncCreate.eventId);

  const storedEvent = googleCalendarService._inMemoryExternalGoogleCalendarEvents.get(syncCreate.eventId);
  assert.strictEqual(storedEvent.status, 'confirmed');

  // 8B: Rescheduling synchronization
  const rescheduledAppointment = {
    ...sensitiveAppointment,
    googleCalendarEventId: syncCreate.eventId,
    date: '2026-10-19',
    slotId: 'slot_1200',
    timeSlotEn: '12:00 PM'
  };
  const syncReschedule = await googleCalendarService.syncAppointmentRescheduled(db, rescheduledAppointment);
  assert.strictEqual(syncReschedule.synced, true);

  const updatedExternal = googleCalendarService._inMemoryExternalGoogleCalendarEvents.get(syncCreate.eventId);
  assert.strictEqual(updatedExternal.start.dateTime, '2026-10-19T12:00:00');

  // 8C: Cancellation synchronization
  const syncCancel = await googleCalendarService.syncAppointmentCancelled(db, rescheduledAppointment, 'Patient requested');
  assert.strictEqual(syncCancel.synced, true);

  const cancelledExternal = googleCalendarService._inMemoryExternalGoogleCalendarEvents.get(syncCreate.eventId);
  assert.strictEqual(cancelledExternal.status, 'cancelled');

  console.log('  ✓ Appointment creation synced to Google Calendar event.');
  console.log('  ✓ Rescheduling updated external event start/end datetime.');
  console.log('  ✓ Cancellation updated external event status to cancelled.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 9: Authoritative Source of Truth & Conflict Reconciliation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 9: Authoritative Source of Truth (SoT) & Conflict Reconciliation');

  // Persist authoritative appointment to mock DB
  const authoritativeAppt = {
    id: 'appt_authoritative_sot_999',
    patientId: 'usr_pat_alpha',
    doctorId: 'dr_mona',
    date: '2026-10-22',
    slotId: 'slot_1000',
    timeSlot: '10:00 صباحاً',
    timeSlotEn: '10:00 AM',
    status: 'confirmed',
    googleCalendarEventId: 'gcal_evt_appt_authoritative_sot_999'
  };
  await db.collection('appointments').doc(authoritativeAppt.id).set(authoritativeAppt);

  // Sync initial state
  await googleCalendarService.syncAppointmentCreated(db, authoritativeAppt);

  // Simulate external rogue conflict: Someone edits the event in Google Calendar to another date (2026-10-25)
  // or marks it deleted externally!
  const rogueExternalEvent = {
    id: 'gcal_evt_appt_authoritative_sot_999',
    start: { dateTime: '2026-10-25T14:00:00' },
    status: 'tentative'
  };
  googleCalendarService._inMemoryExternalGoogleCalendarEvents.set('gcal_evt_appt_authoritative_sot_999', rogueExternalEvent);

  // Run reconciliation
  const reconcileResult = await googleCalendarService.reconcileGoogleCalendarEvent(db, authoritativeAppt.id);

  assert.strictEqual(reconcileResult.reconciled, true);
  assert.strictEqual(reconcileResult.hadConflict, true);
  assert.strictEqual(reconcileResult.sourceOfTruth, 'HEALTH_VIBE_CORE_DB');
  assert.strictEqual(reconcileResult.action, 'EXTERNAL_OVERWRITTEN_TO_MATCH_HEALTH_VIBE');

  // Verify external event was restored to match authoritative Health Vibe record (2026-10-22, status: confirmed)
  const reconciledExternal = googleCalendarService._inMemoryExternalGoogleCalendarEvents.get('gcal_evt_appt_authoritative_sot_999');
  assert.strictEqual(reconciledExternal.start.dateTime.slice(0, 10), '2026-10-22');
  assert.strictEqual(reconciledExternal.status, 'confirmed');

  console.log('  ✓ System Source of Truth (SoT) strictly established as HEALTH_VIBE_CORE_DB.');
  console.log('  ✓ External Google Calendar conflicts automatically detected and overwritten.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 10: Express REST Endpoints Integration
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 10: Express REST Endpoints Integration');

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;

      // 10A: Unauthenticated access to /api/appointments/waiting-list must return 401
      http.get(`http://127.0.0.1:${port}/api/appointments/waiting-list`, (res) => {
        try {
          assert.strictEqual(res.statusCode, 401, 'Unauthenticated waiting list access must return 401');

          // 10B: Unauthenticated access to /api/doctors/google-calendar/status must return 401
          http.get(`http://127.0.0.1:${port}/api/doctors/google-calendar/status`, (res2) => {
            server.close();
            try {
              assert.strictEqual(res2.statusCode, 401, 'Unauthenticated Google Calendar status must return 401');
              console.log('  ✓ Express REST endpoints protected by requireAuth.');
              console.log('  ✓ Waiting list, No-Show and Google Calendar routes verified.\n');
              resolve();
            } catch (e) { reject(e); }
          }).on('error', e => { server.close(); reject(e); });

        } catch (e) { server.close(); reject(e); }
      }).on('error', e => { server.close(); reject(e); });
    });
  });

  console.log('==================================================================');
  console.log('🎉 ALL WAITING LIST, NO-SHOW & GOOGLE CALENDAR TESTS PASSED (100%)');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
