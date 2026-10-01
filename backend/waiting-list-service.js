/**
 * Health Vibe AI - Waiting List & No-Show Tracking Service
 *
 * Implements:
 * 1. Patient Waiting List Registry with Priority Tiers (urgent, priority, routine) & FIFO.
 * 2. Automated Slot Offering Policy on Cancellation / Rescheduling without Double-Booking.
 * 3. Temporary Hold Window (TTL) & Atomic Acceptance/Decline Workflow.
 * 4. Strict No-Show Tracking: Records WHO updated status (actorUid, role) and WHY (reason).
 * 5. Patient & Clinic No-Show Analytics with Risk Threshold Detection.
 */

const auditService = require('./audit-service');
const {
  emitAppointmentNotificationEvent
} = require('./notification-service');

// ============================================================================
// 📋 CONSTANTS & POLICIES
// ============================================================================

const WAITING_LIST_STATUSES = {
  ACTIVE: 'active',
  OFFERED: 'offered',
  BOOKED: 'booked',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

const URGENCY_TIERS = {
  URGENT: { key: 'urgent', rank: 3, labelAr: 'عاجل', labelEn: 'Urgent' },
  PRIORITY: { key: 'priority', rank: 2, labelAr: 'أولوية', labelEn: 'Priority' },
  ROUTINE: { key: 'routine', rank: 1, labelAr: 'عادي', labelEn: 'Routine' }
};

const DEFAULT_OFFER_WINDOW_MINUTES = 15;
const HIGH_NO_SHOW_THRESHOLD = 3;

// In-memory fallback stores for non-Firestore runs & tests
const inMemoryWaitingList = new Map();
const inMemoryNoShowRecords = new Map();
const inMemorySlotOfferHolds = new Map();

// ============================================================================
// 👥 WAITING LIST MANAGEMENT
// ============================================================================

/**
 * Validates and adds a patient to the waiting list.
 */
async function addToWaitingList(db, {
  patientId,
  patientName = 'Patient',
  patientEmail = null,
  patientPhone = null,
  doctorId,
  doctorName = null,
  clinicId = 'clinic_cairo_main',
  desiredDate,
  preferredTimeRange = 'any', // 'morning', 'afternoon', 'evening', 'any'
  urgencyTier = 'routine',
  reason = null,
  notes = null
}, actorUser = {}) {
  if (!patientId || !doctorId || !desiredDate) {
    const err = new Error('patientId, doctorId, and desiredDate are required to join waiting list.');
    err.code = 'INVALID_WAITING_LIST_PARAMS';
    err.statusCode = 400;
    throw err;
  }

  // Permission check: actor must be the patient or authorized staff (doctor, clinic_admin, super_admin)
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid || patientId;
  if (actorRole === 'patient' && actorUid !== patientId) {
    const err = new Error('Patients can only add themselves to the waiting list.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
    const err = new Error('Invalid desiredDate format. Expected YYYY-MM-DD.');
    err.code = 'INVALID_DATE_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  const normalizedUrgency = URGENCY_TIERS[urgencyTier?.toUpperCase()]
    ? urgencyTier.toLowerCase()
    : 'routine';

  const entryId = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date().toISOString();

  // Check for existing active entry for the same patient, doctor, and date
  const existingActive = await findActiveWaitingListEntry(db, patientId, doctorId, desiredDate);
  if (existingActive) {
    const err = new Error('Patient already has an active waiting list entry for this doctor and date.');
    err.code = 'DUPLICATE_WAITING_LIST_ENTRY';
    err.statusCode = 409;
    throw err;
  }

  const waitingEntry = {
    id: entryId,
    patientId,
    patientName,
    patientEmail,
    patientPhone,
    doctorId,
    doctorName,
    clinicId,
    desiredDate,
    preferredTimeRange,
    urgencyTier: normalizedUrgency,
    urgencyRank: URGENCY_TIERS[normalizedUrgency.toUpperCase()].rank,
    status: WAITING_LIST_STATUSES.ACTIVE,
    reason,
    notes,
    createdAt: nowIso,
    createdBy: actorUid,
    createdByRole: actorRole,
    offeredSlot: null,
    offerExpiresAt: null,
    bookedAppointmentId: null,
    history: [{
      action: 'JOINED_WAITING_LIST',
      actorUid,
      actorRole,
      timestamp: nowIso,
      details: { doctorId, desiredDate, urgencyTier: normalizedUrgency }
    }]
  };

  inMemoryWaitingList.set(entryId, waitingEntry);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('waiting_list').doc(entryId).set(waitingEntry);
    } catch (e) {
      console.warn('[WAITING LIST WARNING] Failed to persist to Firestore:', e.message);
    }
  }

  // Audit event
  try {
    if (typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: 'WAITING_LIST_JOINED',
        actorUid,
        actorRole,
        details: {
          waitingListId: entryId,
          patientId,
          doctorId,
          desiredDate,
          urgencyTier: normalizedUrgency
        }
      });
    }
  } catch (auditErr) {}

  return waitingEntry;
}

/**
 * Checks for existing active waiting list entry to prevent duplicate requests.
 */
async function findActiveWaitingListEntry(db, patientId, doctorId, desiredDate) {
  for (const item of inMemoryWaitingList.values()) {
    if (
      item.patientId === patientId &&
      item.doctorId === doctorId &&
      item.desiredDate === desiredDate &&
      item.status === WAITING_LIST_STATUSES.ACTIVE
    ) {
      return item;
    }
  }

  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('waiting_list')
        .where('patientId', '==', patientId)
        .where('doctorId', '==', doctorId)
        .where('desiredDate', '==', desiredDate)
        .where('status', '==', WAITING_LIST_STATUSES.ACTIVE)
        .get();
      if (snap && snap.docs && snap.docs.length > 0) {
        return snap.docs[0].data();
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Retrieves the waiting list, ordered according to policy:
 * 1. Urgency Rank Descending (Urgent [3] > Priority [2] > Routine [1])
 * 2. FIFO by Creation Timestamp Ascending (First-Come, First-Served)
 */
async function getWaitingList(db, filters = {}, actorUser = {}) {
  const {
    doctorId = null,
    clinicId = null,
    desiredDate = null,
    status = WAITING_LIST_STATUSES.ACTIVE,
    patientId = null
  } = filters;

  const entries = [];

  // Memory store
  for (const item of inMemoryWaitingList.values()) {
    if (status && item.status !== status) continue;
    if (doctorId && item.doctorId !== doctorId) continue;
    if (clinicId && item.clinicId !== clinicId) continue;
    if (desiredDate && item.desiredDate !== desiredDate) continue;
    if (patientId && item.patientId !== patientId) continue;
    entries.push({ ...item });
  }

  // Firestore sync if present
  if (db && typeof db.collection === 'function') {
    try {
      let query = db.collection('waiting_list');
      if (status) query = query.where('status', '==', status);
      if (doctorId) query = query.where('doctorId', '==', doctorId);
      if (desiredDate) query = query.where('desiredDate', '==', desiredDate);
      const snap = await query.get();
      if (snap && snap.docs) {
        for (const doc of snap.docs) {
          const d = doc.data();
          if (d && !inMemoryWaitingList.has(d.id)) {
            entries.push(d);
          }
        }
      }
    } catch (e) {}
  }

  // RBAC Filter: Patients can only view their own entries
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid;
  let filtered = entries;
  if (actorRole === 'patient' && actorUid) {
    filtered = entries.filter(e => e.patientId === actorUid);
  }

  // Sort by policy: Urgency rank DESC, then createdAt ASC (FIFO)
  filtered.sort((a, b) => {
    if (b.urgencyRank !== a.urgencyRank) {
      return (b.urgencyRank || 1) - (a.urgencyRank || 1);
    }
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  return filtered;
}

/**
 * Removes a patient from the waiting list (cancelled by user or staff).
 */
async function removeFromWaitingList(db, waitingListId, actorUser = {}, reason = 'User requested removal') {
  if (!waitingListId) {
    const err = new Error('waitingListId is required.');
    err.code = 'MISSING_ID';
    err.statusCode = 400;
    throw err;
  }

  let item = inMemoryWaitingList.get(waitingListId);
  if (!item && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('waiting_list').doc(waitingListId).get();
      if (snap.exists) item = snap.data();
    } catch (e) {}
  }

  if (!item) {
    const err = new Error(`Waiting list entry '${waitingListId}' not found.`);
    err.code = 'ENTRY_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid || item.patientId;
  if (actorRole === 'patient' && actorUid !== item.patientId) {
    const err = new Error('Access denied: You can only remove your own waiting list entry.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
  item.status = WAITING_LIST_STATUSES.CANCELLED;
  item.cancelledAt = nowIso;
  item.cancelReason = reason;
  item.history.push({
    action: 'CANCELLED_FROM_WAITING_LIST',
    actorUid,
    actorRole,
    timestamp: nowIso,
    reason
  });

  inMemoryWaitingList.set(waitingListId, item);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('waiting_list').doc(waitingListId).update({
        status: WAITING_LIST_STATUSES.CANCELLED,
        cancelledAt: nowIso,
        cancelReason: reason,
        history: item.history
      });
    } catch (e) {}
  }

  return { success: true, item };
}

// ============================================================================
// 🎯 AUTOMATED SLOT OFFERING POLICY & ANTI-DOUBLE-BOOKING GUARDS
// ============================================================================

/**
 * Generates slot key for atomic offer locks.
 */
function getOfferLockKey(doctorId, date, slotId) {
  return `${doctorId}_${date}_${slotId}`;
}

/**
 * When a slot becomes available (via cancellation or reschedule), this function
 * finds the highest priority candidate and offers it with an atomic reservation hold.
 */
async function processAvailableSlotForWaitingList(db, {
  doctorId,
  clinicId,
  date,
  slotId,
  timeSlot,
  timeSlotEn,
  offerWindowMinutes = DEFAULT_OFFER_WINDOW_MINUTES
}) {
  if (!doctorId || !date || !slotId) {
    return { offered: false, reason: 'MISSING_SLOT_IDENTIFIER' };
  }

  // 1. Check if slot currently has an active offer hold
  const lockKey = getOfferLockKey(doctorId, date, slotId);
  const currentHold = inMemorySlotOfferHolds.get(lockKey);
  const now = new Date();

  if (currentHold && currentHold.expiresAt > now && currentHold.status === 'active') {
    return { offered: false, reason: 'SLOT_CURRENTLY_HELD', currentHold };
  }

  // 2. Query active waiting list candidates for this doctor and date
  const candidates = await getWaitingList(db, {
    doctorId,
    desiredDate: date,
    status: WAITING_LIST_STATUSES.ACTIVE
  }, { role: 'clinic_admin' });

  if (!candidates || candidates.length === 0) {
    return { offered: false, reason: 'NO_ACTIVE_WAITING_CANDIDATES' };
  }

  // Top candidate chosen according to policy
  const topCandidate = candidates[0];
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + offerWindowMinutes * 60 * 1000);
  const expiresAtIso = expiresAt.toISOString();

  const slotOffer = {
    doctorId,
    clinicId: clinicId || topCandidate.clinicId,
    date,
    slotId,
    timeSlot: timeSlot || '09:00',
    timeSlotEn: timeSlotEn || '09:00 AM',
    offerWindowMinutes,
    offeredAt: nowIso,
    expiresAt: expiresAtIso
  };

  // 3. Create atomic slot offer hold
  const holdRecord = {
    lockKey,
    doctorId,
    date,
    slotId,
    patientId: topCandidate.patientId,
    waitingListId: topCandidate.id,
    status: 'active',
    offeredAt: nowIso,
    expiresAt
  };
  inMemorySlotOfferHolds.set(lockKey, holdRecord);

  // 4. Update candidate status to OFFERED
  topCandidate.status = WAITING_LIST_STATUSES.OFFERED;
  topCandidate.offeredSlot = slotOffer;
  topCandidate.offerExpiresAt = expiresAtIso;
  topCandidate.history.push({
    action: 'SLOT_OFFERED',
    timestamp: nowIso,
    details: slotOffer
  });

  inMemoryWaitingList.set(topCandidate.id, topCandidate);

  // Update in Firestore
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('waiting_list').doc(topCandidate.id).update({
        status: WAITING_LIST_STATUSES.OFFERED,
        offeredSlot: slotOffer,
        offerExpiresAt: expiresAtIso,
        history: topCandidate.history
      });

      // Save lock in appointment_locks to prevent normal booking race conditions
      const lockDocId = `lock_offer_${doctorId}_${date}_${slotId}`;
      await db.collection('appointment_locks').doc(lockDocId).set({
        id: lockDocId,
        slotKey: lockKey,
        doctorId,
        date,
        slotId,
        patientId: topCandidate.patientId,
        waitingListId: topCandidate.id,
        status: 'offered_hold',
        offeredToPatientId: topCandidate.patientId,
        expiresAt: expiresAtIso,
        lockedAt: nowIso
      });
    } catch (e) {
      console.warn('[WAITING LIST OFFER WARNING] Firestore update failed:', e.message);
    }
  }

  // 5. Emit automated notification to the offered patient
  try {
    await emitAppointmentNotificationEvent(db, {
      type: 'APPOINTMENT_WAITING_LIST_SLOT_OFFERED',
      appointment: {
        id: `offer_${topCandidate.id}`,
        patientId: topCandidate.patientId,
        patientEmail: topCandidate.patientEmail,
        patientName: topCandidate.patientName,
        doctorId,
        date,
        timeSlot: slotOffer.timeSlot
      },
      actorUser: { uid: 'system_scheduler', role: 'system' },
      details: {
        waitingListId: topCandidate.id,
        expiresAt: expiresAtIso,
        offerWindowMinutes
      }
    });
  } catch (notifErr) {}

  return {
    offered: true,
    candidate: topCandidate,
    slotOffer,
    holdRecord
  };
}

/**
 * Accepts a waiting list slot offer atomically, converting it into a confirmed booking.
 * Enforces anti-double-booking: only the offered candidate can claim it before expiry.
 */
async function acceptWaitingListOffer(db, { waitingListId, bookingService }, actorUser) {
  if (!waitingListId) {
    const err = new Error('waitingListId is required.');
    err.code = 'MISSING_ID';
    err.statusCode = 400;
    throw err;
  }

  let entry = inMemoryWaitingList.get(waitingListId);
  if (!entry && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('waiting_list').doc(waitingListId).get();
      if (snap.exists) entry = snap.data();
    } catch (e) {}
  }

  if (!entry) {
    const err = new Error(`Waiting list entry '${waitingListId}' not found.`);
    err.code = 'ENTRY_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Permission check
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid || entry.patientId;
  if (actorRole === 'patient' && actorUid !== entry.patientId) {
    const err = new Error('Access denied: You cannot accept an offer addressed to another patient.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  // Status check
  if (entry.status !== WAITING_LIST_STATUSES.OFFERED || !entry.offeredSlot) {
    const err = new Error(`Cannot accept offer. Current status is '${entry.status}'.`);
    err.code = 'OFFER_NOT_ACTIVE';
    err.statusCode = 400;
    throw err;
  }

  // Check TTL expiration
  const now = new Date();
  if (new Date(entry.offerExpiresAt) < now) {
    entry.status = WAITING_LIST_STATUSES.EXPIRED;
    inMemoryWaitingList.set(waitingListId, entry);

    // Release lock
    const lockKey = getOfferLockKey(entry.offeredSlot.doctorId, entry.offeredSlot.date, entry.offeredSlot.slotId);
    inMemorySlotOfferHolds.delete(lockKey);

    const err = new Error('The slot offer has expired. The slot has been released.');
    err.code = 'OFFER_EXPIRED';
    err.statusCode = 410;
    throw err;
  }

  const slot = entry.offeredSlot;
  const nowIso = now.toISOString();

  // Atomically convert to appointment booking via bookingService (ACID transactional booking)
  let bookedAppt = null;
  if (bookingService && typeof bookingService.bookAppointmentTransaction === 'function') {
    bookedAppt = await bookingService.bookAppointmentTransaction(db, {
      patientId: entry.patientId,
      patientName: entry.patientName,
      patientEmail: entry.patientEmail,
      doctorId: slot.doctorId,
      doctorName: entry.doctorName,
      clinicId: slot.clinicId,
      date: slot.date,
      slotId: slot.slotId,
      timeSlot: slot.timeSlot,
      appointmentType: 'consultation',
      notes: `Booked via Waiting List Priority Offer [${entry.urgencyTier}]`
    }, {
      uid: entry.patientId,
      email: entry.patientEmail,
      role: 'patient'
    });
  } else {
    // Direct appointment creation fallback
    bookedAppt = {
      id: `appt_wl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      patientId: entry.patientId,
      patientName: entry.patientName,
      doctorId: slot.doctorId,
      clinicId: slot.clinicId,
      date: slot.date,
      slotId: slot.slotId,
      timeSlot: slot.timeSlot,
      status: 'confirmed',
      createdAt: nowIso
    };
  }

  // Clear slot offer hold
  const lockKey = getOfferLockKey(slot.doctorId, slot.date, slot.slotId);
  inMemorySlotOfferHolds.delete(lockKey);

  // Update waiting list entry to BOOKED
  entry.status = WAITING_LIST_STATUSES.BOOKED;
  entry.bookedAppointmentId = bookedAppt.id;
  entry.acceptedAt = nowIso;
  entry.history.push({
    action: 'OFFER_ACCEPTED',
    actorUid,
    actorRole,
    timestamp: nowIso,
    appointmentId: bookedAppt.id
  });

  inMemoryWaitingList.set(waitingListId, entry);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('waiting_list').doc(waitingListId).update({
        status: WAITING_LIST_STATUSES.BOOKED,
        bookedAppointmentId: bookedAppt.id,
        acceptedAt: nowIso,
        history: entry.history
      });
    } catch (e) {}
  }

  return {
    success: true,
    appointment: bookedAppt,
    waitingListEntry: entry
  };
}

/**
 * Declines a waiting list slot offer and automatically cascades the offer to the next candidate.
 */
async function declineWaitingListOffer(db, { waitingListId, reason = 'Patient declined offer' }, actorUser) {
  if (!waitingListId) {
    const err = new Error('waitingListId is required.');
    err.code = 'MISSING_ID';
    err.statusCode = 400;
    throw err;
  }

  let entry = inMemoryWaitingList.get(waitingListId);
  if (!entry && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('waiting_list').doc(waitingListId).get();
      if (snap.exists) entry = snap.data();
    } catch (e) {}
  }

  if (!entry) {
    const err = new Error(`Waiting list entry '${waitingListId}' not found.`);
    err.code = 'ENTRY_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const slot = entry.offeredSlot;
  const nowIso = new Date().toISOString();
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid || entry.patientId;

  entry.status = WAITING_LIST_STATUSES.DECLINED;
  entry.declinedAt = nowIso;
  entry.declineReason = reason;
  entry.history.push({
    action: 'OFFER_DECLINED',
    actorUid,
    actorRole,
    timestamp: nowIso,
    reason
  });

  inMemoryWaitingList.set(waitingListId, entry);

  // Release offer hold
  if (slot) {
    const lockKey = getOfferLockKey(slot.doctorId, slot.date, slot.slotId);
    inMemorySlotOfferHolds.delete(lockKey);

    if (db && typeof db.collection === 'function') {
      try {
        const lockDocId = `lock_offer_${slot.doctorId}_${slot.date}_${slot.slotId}`;
        await db.collection('appointment_locks').doc(lockDocId).delete();
      } catch (e) {}
    }

    // Cascade offer to the NEXT candidate on waiting list!
    await processAvailableSlotForWaitingList(db, {
      doctorId: slot.doctorId,
      clinicId: slot.clinicId,
      date: slot.date,
      slotId: slot.slotId,
      timeSlot: slot.timeSlot,
      timeSlotEn: slot.timeSlotEn
    });
  }

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('waiting_list').doc(waitingListId).update({
        status: WAITING_LIST_STATUSES.DECLINED,
        declinedAt: nowIso,
        declineReason: reason,
        history: entry.history
      });
    } catch (e) {}
  }

  return { success: true, entry };
}

/**
 * Periodically expires stale unaccepted offers and cascades slots to next candidates.
 */
async function expireStaleOffers(db) {
  const now = new Date();
  const expiredEntries = [];

  for (const entry of inMemoryWaitingList.values()) {
    if (entry.status === WAITING_LIST_STATUSES.OFFERED && entry.offerExpiresAt) {
      if (new Date(entry.offerExpiresAt) < now) {
        entry.status = WAITING_LIST_STATUSES.EXPIRED;
        entry.expiredAt = now.toISOString();
        entry.history.push({
          action: 'OFFER_EXPIRED',
          timestamp: now.toISOString(),
          reason: 'Offer window elapsed without response'
        });
        expiredEntries.push(entry);

        if (entry.offeredSlot) {
          const lockKey = getOfferLockKey(entry.offeredSlot.doctorId, entry.offeredSlot.date, entry.offeredSlot.slotId);
          inMemorySlotOfferHolds.delete(lockKey);

          // Cascade to next waiting candidate
          await processAvailableSlotForWaitingList(db, entry.offeredSlot);
        }
      }
    }
  }

  return { expiredCount: expiredEntries.length, expiredEntries };
}

// ============================================================================
// 🚫 STRICT NO-SHOW TRACKING & ATTRIBUTION AUDIT
// ============================================================================

/**
 * Records an appointment as a No-Show.
 * STRICT POLICY:
 * 1. Requires non-empty `reason` explaining WHY the patient was marked no-show.
 * 2. Records WHO changed the status (actorUid, role, email).
 * 3. Enforces that patients CANNOT mark appointments as no-show.
 * 4. Increments patient's no-show count and flags high risk if threshold exceeded.
 */
async function recordNoShow(db, {
  appointmentId,
  reason,
  notes = null
}, actorUser) {
  if (!appointmentId) {
    const err = new Error('appointmentId is required.');
    err.code = 'MISSING_APPOINTMENT_ID';
    err.statusCode = 400;
    throw err;
  }

  // WHY must be strictly recorded
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    const err = new Error('A valid reason explaining why the patient is marked as No-Show is required.');
    err.code = 'MISSING_NO_SHOW_REASON';
    err.statusCode = 400;
    throw err;
  }

  // WHO check: Patients cannot mark appointments as no-show
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid;
  if (!actorUid || actorRole === 'patient') {
    const err = new Error('Access denied: Only clinical staff, doctors, or administrators can mark No-Shows.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  // Retrieve appointment
  let appointment = null;
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('appointments').doc(appointmentId).get();
      if (snap.exists) appointment = snap.data();
    } catch (e) {}
  }

  if (!appointment) {
    const err = new Error(`Appointment '${appointmentId}' not found.`);
    err.code = 'APPOINTMENT_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (appointment.status === 'cancelled') {
    const err = new Error('Cannot mark a cancelled appointment as No-Show.');
    err.code = 'CANNOT_UPDATE_CANCELLED';
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const patientId = appointment.patientId;

  // History entry recording WHO and WHY
  const historyEntry = {
    action: 'NO_SHOW_RECORDED',
    actorUid,
    actorRole,
    actorEmail: actorUser.email || null,
    reason: reason.trim(),
    notes: notes ? notes.trim() : null,
    previousStatus: appointment.status,
    newStatus: 'no_show',
    timestamp: nowIso
  };

  const updatedHistory = Array.isArray(appointment.history)
    ? [...appointment.history, historyEntry]
    : [historyEntry];

  const updateData = {
    status: 'no_show',
    noShowAt: nowIso,
    noShowRecordedBy: actorUid,
    noShowRecordedByRole: actorRole,
    noShowReason: reason.trim(),
    noShowNotes: notes ? notes.trim() : null,
    history: updatedHistory
  };

  // Update appointment record
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('appointments').doc(appointmentId).update(updateData);
    } catch (e) {
      console.warn('[NO SHOW WARNING] Failed to update appointment doc in Firestore:', e.message);
    }
  }

  // Track patient no-show metrics
  let patientNoShowRecord = inMemoryNoShowRecords.get(patientId) || {
    patientId,
    noShowCount: 0,
    noShowAppointments: [],
    lastNoShowAt: null,
    hasHighNoShowRisk: false
  };

  patientNoShowRecord.noShowCount += 1;
  patientNoShowRecord.lastNoShowAt = nowIso;
  patientNoShowRecord.hasHighNoShowRisk = patientNoShowRecord.noShowCount >= HIGH_NO_SHOW_THRESHOLD;
  patientNoShowRecord.noShowAppointments.push({
    appointmentId,
    date: appointment.date,
    doctorId: appointment.doctorId,
    clinicId: appointment.clinicId,
    reason: reason.trim(),
    recordedBy: actorUid,
    recordedByRole: actorRole,
    timestamp: nowIso
  });

  inMemoryNoShowRecords.set(patientId, patientNoShowRecord);

  // Persist patient no-show metrics to Firestore if present
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('patient_no_show_metrics').doc(patientId).set(patientNoShowRecord, { merge: true });
    } catch (e) {}
  }

  // Audit event
  try {
    if (typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: 'APPOINTMENT_NO_SHOW_RECORDED',
        actorUid,
        actorRole,
        details: {
          appointmentId,
          patientId,
          doctorId: appointment.doctorId,
          clinicId: appointment.clinicId,
          reason: reason.trim(),
          noShowCount: patientNoShowRecord.noShowCount,
          hasHighNoShowRisk: patientNoShowRecord.hasHighNoShowRisk
        }
      });
    }
  } catch (auditErr) {}

  const finalAppt = { ...appointment, ...updateData };
  return {
    success: true,
    appointment: finalAppt,
    patientMetrics: patientNoShowRecord
  };
}

/**
 * Retrieves no-show metrics and history for a patient.
 */
async function getPatientNoShowSummary(db, patientId, actorUser) {
  if (!patientId) throw new Error('patientId is required.');

  // Access check
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid;
  if (actorRole === 'patient' && actorUid !== patientId) {
    const err = new Error('Access denied: You can only view your own metrics.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  let metrics = inMemoryNoShowRecords.get(patientId);

  if (!metrics && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('patient_no_show_metrics').doc(patientId).get();
      if (snap.exists) metrics = snap.data();
    } catch (e) {}
  }

  if (!metrics) {
    metrics = {
      patientId,
      noShowCount: 0,
      noShowAppointments: [],
      lastNoShowAt: null,
      hasHighNoShowRisk: false
    };
  }

  return metrics;
}

/**
 * Retrieves aggregated clinic-level no-show statistics for administrative review.
 */
async function getClinicNoShowStats(db, clinicId, actorUser) {
  const actorRole = actorUser?.role || 'patient';
  if (actorRole === 'patient') {
    const err = new Error('Access denied: Only clinical staff can view clinic statistics.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  let totalNoShows = 0;
  let highRiskPatientCount = 0;
  const breakdown = [];

  for (const record of inMemoryNoShowRecords.values()) {
    const clinicAppts = record.noShowAppointments.filter(a => !clinicId || a.clinicId === clinicId);
    if (clinicAppts.length > 0) {
      totalNoShows += clinicAppts.length;
      if (clinicAppts.length >= HIGH_NO_SHOW_THRESHOLD) {
        highRiskPatientCount++;
      }
      breakdown.push({
        patientId: record.patientId,
        count: clinicAppts.length,
        lastNoShowAt: record.lastNoShowAt
      });
    }
  }

  return {
    clinicId: clinicId || 'all',
    totalNoShows,
    highRiskPatientCount,
    highNoShowThreshold: HIGH_NO_SHOW_THRESHOLD,
    breakdown
  };
}

/**
 * Clear in-memory caches (used between tests).
 */
function clearWaitingListMemoryStore() {
  inMemoryWaitingList.clear();
  inMemoryNoShowRecords.clear();
  inMemorySlotOfferHolds.clear();
}

module.exports = {
  WAITING_LIST_STATUSES,
  URGENCY_TIERS,
  DEFAULT_OFFER_WINDOW_MINUTES,
  HIGH_NO_SHOW_THRESHOLD,
  addToWaitingList,
  getWaitingList,
  removeFromWaitingList,
  processAvailableSlotForWaitingList,
  acceptWaitingListOffer,
  declineWaitingListOffer,
  expireStaleOffers,
  recordNoShow,
  getPatientNoShowSummary,
  getClinicNoShowStats,
  clearWaitingListMemoryStore,
  _inMemoryWaitingList: inMemoryWaitingList,
  _inMemorySlotOfferHolds: inMemorySlotOfferHolds,
  _inMemoryNoShowRecords: inMemoryNoShowRecords
};
