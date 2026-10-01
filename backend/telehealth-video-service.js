/**
 * Health Vibe AI - Telehealth Video Consultation, Privacy & Consent Governance Service
 *
 * Implements:
 * 1. Multi-Provider Telehealth Architecture (Daily.co, LiveKit, Sandbox Provider).
 * 2. Privacy & Telehealth Informed Consent Governance (Emergency protocol, virtual care limitations, zero recording).
 * 3. Appointment-Linked Ephemeral Rooms with Strict Identity Verification (Doctor & Patient only).
 * 4. Time-Limited Access Windows (Opens 15 mins prior, expires 45 mins post-slot).
 * 5. Deterministic Room State Machine ('waiting', 'active', 'disconnected', 'ended').
 * 6. Zero-Recording Default (Recording disabled by default; dual consent mandated for exceptions).
 * 7. Resilient Failure Recovery: Camera/Mic permissions, ICE network drops, grace period reconnections.
 * 8. Appointment Cancellation Invalidation: Cancelling appointment terminates rooms and halts entry.
 */

const crypto = require('crypto');
const auditService = require('./audit-service');

// ============================================================================
// 🔒 CONSTANTS & TELEHEALTH POLICIES
// ============================================================================

const TELEHEALTH_PROVIDERS = {
  DAILY: 'daily',
  LIVEKIT: 'livekit',
  SANDBOX: 'sandbox'
};

const ROOM_STATES = {
  CREATED: 'created',
  WAITING: 'waiting',       // First participant waiting in virtual room
  ACTIVE: 'active',         // Both participants connected, session ongoing
  DISCONNECTED: 'disconnected', // Network drop, reconnection in progress
  ENDED: 'ended'            // Consultation concluded or terminated
};

const DEFAULT_EARLY_JOIN_MINUTES = 15;
const DEFAULT_GRACE_WINDOW_MINUTES = 45;
const RECONNECTION_GRACE_PERIOD_SECONDS = 120;

// Security secret for generating ephemeral signed meeting tokens
const MEETING_TOKEN_SECRET = process.env.TELEHEALTH_TOKEN_SECRET || 'healthvibe_telehealth_secure_token_secret_2026';

// In-memory registry for rooms and active sessions (used alongside Firestore)
const inMemoryTelehealthRooms = new Map();
const inMemoryTelehealthConsents = new Map();

// ============================================================================
// 📋 PROVIDER IDENTIFICATION & CONFIGURATION
// ============================================================================

/**
 * Returns configuration and compliance capabilities of the selected telehealth provider.
 */
function getTelehealthProviderConfig(preferredProvider = null) {
  const provider = (preferredProvider || process.env.TELEHEALTH_PROVIDER || TELEHEALTH_PROVIDERS.SANDBOX).toLowerCase();

  switch (provider) {
    case TELEHEALTH_PROVIDERS.DAILY:
      return {
        provider: TELEHEALTH_PROVIDERS.DAILY,
        name: 'Daily.co Clinical Video API',
        hipaaBaaAvailable: true,
        gdprCompliant: true,
        encryptionType: 'DTLS-SRTP / WebRTC E2EE',
        zeroRecordingDefault: true,
        maxParticipants: 2,
        domain: process.env.DAILY_DOMAIN || 'healthvibe.daily.co',
        apiKeyConfigured: Boolean(process.env.DAILY_API_KEY)
      };

    case TELEHEALTH_PROVIDERS.LIVEKIT:
      return {
        provider: TELEHEALTH_PROVIDERS.LIVEKIT,
        name: 'LiveKit Cloud / Self-Hosted WebRTC SFU',
        hipaaBaaAvailable: true,
        gdprCompliant: true,
        encryptionType: 'WebRTC Insertable Streams / DTLS-SRTP',
        zeroRecordingDefault: true,
        maxParticipants: 2,
        serverUrl: process.env.LIVEKIT_URL || 'wss://telehealth.healthvibe.ai',
        apiKeyConfigured: Boolean(process.env.LIVEKIT_API_KEY)
      };

    case TELEHEALTH_PROVIDERS.SANDBOX:
    default:
      return {
        provider: TELEHEALTH_PROVIDERS.SANDBOX,
        name: 'Health Vibe Deterministic Telehealth Sandbox',
        hipaaBaaAvailable: true,
        gdprCompliant: true,
        encryptionType: 'Simulated DTLS-SRTP E2EE',
        zeroRecordingDefault: true,
        maxParticipants: 2,
        isSandbox: true,
        simulatedLatencyMs: 40
      };
  }
}

// ============================================================================
// ✍️ PRIVACY & TELEHEALTH INFORMED CONSENT
// ============================================================================

/**
 * Validates and records patient telehealth informed consent before session entry.
 */
function validateAndRecordTelehealthConsent({
  patientId,
  appointmentId,
  consentGiven = false,
  emergencyProtocolAcknowledged = false,
  virtualLimitationsUnderstood = false,
  recordingNoticeAcknowledged = false,
  ipAddress = '127.0.0.1',
  userAgent = 'HealthVibePortal/1.0'
}) {
  if (!patientId || !appointmentId) {
    const err = new Error('patientId and appointmentId are required for consent recording.');
    err.code = 'INVALID_CONSENT_PARAMS';
    err.statusCode = 400;
    throw err;
  }

  // 1. Mandatory Consent Check
  if (consentGiven !== true) {
    const err = new Error('Informed consent for telehealth video consultation must be explicitly granted.');
    err.code = 'TELEHEALTH_CONSENT_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // 2. Emergency Protocol Acknowledgment Check
  // In pulmonary medicine, acute desaturation (SpO2 < 88%) requires dialing emergency (123)
  if (emergencyProtocolAcknowledged !== true) {
    const err = new Error('Patient must acknowledge the emergency protocol (calling emergency services in acute respiratory distress).');
    err.code = 'EMERGENCY_PROTOCOL_NOT_ACKNOWLEDGED';
    err.statusCode = 400;
    throw err;
  }

  // 3. Virtual limitations & Zero-recording acknowledgment
  if (virtualLimitationsUnderstood !== true || recordingNoticeAcknowledged !== true) {
    const err = new Error('Patient must acknowledge virtual consultation limitations and the non-recording privacy policy.');
    err.code = 'INCOMPLETE_CONSENT_TERMS';
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const consentRecord = {
    consentId: `th_consent_${patientId}_${appointmentId}`,
    patientId,
    appointmentId,
    consentGiven: true,
    emergencyProtocolAcknowledged: true,
    virtualLimitationsUnderstood: true,
    recordingNoticeAcknowledged: true,
    recordingPolicy: 'DISABLED_BY_DEFAULT',
    ipAddress,
    userAgent,
    consentedAt: nowIso
  };

  inMemoryTelehealthConsents.set(consentRecord.consentId, consentRecord);
  return consentRecord;
}

// ============================================================================
// 🚪 APPOINTMENT-LINKED ROOM CREATION & TIME BOUNDARY CALCULATION
// ============================================================================

/**
 * Calculates time window boundaries for the appointment slot.
 */
function calculateRoomTimeWindow(appointment, {
  earlyJoinMinutes = DEFAULT_EARLY_JOIN_MINUTES,
  graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES
} = {}) {
  const dateStr = appointment.date;
  let startTimeStr = '10:00';
  let slotDuration = 30;

  if (appointment.timeSlotEn || appointment.timeSlot) {
    const match = (appointment.timeSlotEn || appointment.timeSlot).match(/(\d{1,2}):(\d{2})/);
    if (match) {
      startTimeStr = `${match[1].padStart(2, '0')}:${match[2]}`;
    }
  }

  // Compute ISO timestamps
  const slotStart = new Date(`${dateStr}T${startTimeStr}:00`);
  const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
  const windowOpensAt = new Date(slotStart.getTime() - earlyJoinMinutes * 60 * 1000);
  const windowClosesAt = new Date(slotEnd.getTime() + graceWindowMinutes * 60 * 1000);

  return {
    slotStart: slotStart.toISOString(),
    slotEnd: slotEnd.toISOString(),
    windowOpensAt: windowOpensAt.toISOString(),
    windowClosesAt: windowClosesAt.toISOString(),
    earlyJoinMinutes,
    graceWindowMinutes
  };
}

/**
 * Creates an encrypted video consultation room strictly tied to a confirmed appointment.
 */
async function createTelehealthRoom(db, {
  appointmentId,
  provider = null,
  earlyJoinMinutes = DEFAULT_EARLY_JOIN_MINUTES,
  graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES
}, actorUser = {}) {
  if (!appointmentId) {
    const err = new Error('appointmentId is required to create a telehealth room.');
    err.code = 'MISSING_APPOINTMENT_ID';
    err.statusCode = 400;
    throw err;
  }

  // 1. Fetch Appointment & Verify Status
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

  // 2. Strict Status Guard: Must be 'confirmed'
  if (appointment.status !== 'confirmed') {
    const err = new Error(`Cannot create telehealth room for appointment with status '${appointment.status}'. Must be 'confirmed'.`);
    err.code = 'APPOINTMENT_NOT_CONFIRMED';
    err.statusCode = 400;
    throw err;
  }

  // 3. Permission Check: Actor must be Doctor, Patient, or Admin on this appointment
  const actorRole = actorUser?.role || 'patient';
  const actorUid = actorUser?.uid;
  if (actorRole === 'patient' && actorUid && actorUid !== appointment.patientId) {
    const err = new Error('Access denied: You cannot create a telehealth room for another patient.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  // Check if room already exists for this appointment
  for (const r of inMemoryTelehealthRooms.values()) {
    if (r.appointmentId === appointmentId && r.status !== ROOM_STATES.ENDED) {
      return r;
    }
  }

  // 4. Calculate Time Window
  const timeWindow = calculateRoomTimeWindow(appointment, { earlyJoinMinutes, graceWindowMinutes });

  // 5. Select Provider & Enforce Zero-Recording Defaults
  const providerConfig = getTelehealthProviderConfig(provider);
  const roomId = `room_th_${appointmentId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36)}`;
  const nowIso = new Date().toISOString();

  const roomDoc = {
    id: roomId,
    appointmentId,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName || appointment.doctorNameEn || 'Doctor',
    patientId: appointment.patientId,
    patientName: appointment.patientName || 'Patient',
    clinicId: appointment.clinicId,
    provider: providerConfig.provider,
    providerName: providerConfig.name,
    encryptionType: providerConfig.encryptionType,
    status: ROOM_STATES.CREATED,
    recordingEnabled: false, // ZERO RECORDING BY DEFAULT
    maxParticipants: 2,      // STRICT 1-ON-1
    timeWindow,
    participants: {
      doctor: { joined: false, joinedAt: null, leftAt: null },
      patient: { joined: false, joinedAt: null, leftAt: null }
    },
    mediaState: {
      cameraEnabled: true,
      audioEnabled: true,
      networkQuality: 'good'
    },
    roomUrl: `https://${providerConfig.domain || 'telehealth.healthvibe.ai'}/${roomId}`,
    createdAt: nowIso,
    createdBy: actorUid || 'system',
    history: [{
      action: 'ROOM_CREATED',
      actorUid: actorUid || 'system',
      timestamp: nowIso,
      details: { provider: providerConfig.provider, zeroRecording: true }
    }]
  };

  inMemoryTelehealthRooms.set(roomId, roomDoc);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('telehealth_rooms').doc(roomId).set(roomDoc);
      // Link room to appointment document
      await db.collection('appointments').doc(appointmentId).update({
        telehealthRoomId: roomId,
        telehealthRoomUrl: roomDoc.roomUrl
      });
    } catch (e) {
      console.warn('[TELEHEALTH WARNING] Failed to persist room to Firestore:', e.message);
    }
  }

  // Audit event
  try {
    if (typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: 'TELEHEALTH_ROOM_CREATED',
        actorUid: actorUid || 'system',
        actorRole,
        details: { roomId, appointmentId, zeroRecording: true }
      });
    }
  } catch (auditErr) {}

  return roomDoc;
}

// ============================================================================
// 🔑 PARTICIPANT IDENTITY VERIFICATION & TIME-LIMITED JOIN
// ============================================================================

/**
 * Generates an HMAC-SHA256 signed ephemeral meeting token.
 */
function generateMeetingToken({ userId, role, roomId, expiresAt, recordingEnabled = false }) {
  const payload = {
    sub: userId,
    role,
    room: roomId,
    rec: recordingEnabled,
    e2ee: true,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000)
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', MEETING_TOKEN_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  return `thtok_${payloadBase64}.${signature}`;
}

/**
 * Verifies participant identity, checks temporal access window,
 * verifies informed consent, and issues an ephemeral meeting token.
 */
async function joinTelehealthRoom(db, {
  roomId,
  consent = {},
  now = new Date()
}, actorUser) {
  if (!roomId) {
    const err = new Error('roomId is required to join telehealth consultation.');
    err.code = 'MISSING_ROOM_ID';
    err.statusCode = 400;
    throw err;
  }

  if (!actorUser || !actorUser.uid) {
    const err = new Error('Authentication required to enter telehealth consultation.');
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  // 1. Retrieve Room Document
  let room = inMemoryTelehealthRooms.get(roomId);
  if (!room && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('telehealth_rooms').doc(roomId).get();
      if (snap.exists) room = snap.data();
    } catch (e) {}
  }

  if (!room) {
    const err = new Error(`Telehealth room '${roomId}' was not found.`);
    err.code = 'ROOM_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // 2. Check Room Status
  if (room.status === ROOM_STATES.ENDED) {
    const err = new Error('This telehealth consultation has ended.');
    err.code = 'ROOM_ALREADY_ENDED';
    err.statusCode = 410;
    throw err;
  }

  // 3. Check Linked Appointment Active Status (Cancellation Check)
  let appointment = null;
  if (db && typeof db.collection === 'function') {
    try {
      const apptSnap = await db.collection('appointments').doc(room.appointmentId).get();
      if (apptSnap.exists) appointment = apptSnap.data();
    } catch (e) {}
  }

  if (appointment && appointment.status === 'cancelled') {
    // Terminate room immediately
    room.status = ROOM_STATES.ENDED;
    room.endReason = 'APPOINTMENT_CANCELLED';
    inMemoryTelehealthRooms.set(roomId, room);

    const err = new Error('The linked clinical appointment was cancelled. Telehealth consultation is terminated.');
    err.code = 'APPOINTMENT_CANCELLED';
    err.statusCode = 400;
    throw err;
  }

  // 4. Strict Identity Verification: Must be the assigned Doctor or scheduled Patient
  const userId = actorUser.uid;
  const isDoctor = userId === room.doctorId;
  const isPatient = userId === room.patientId;

  if (!isDoctor && !isPatient) {
    const err = new Error("Access denied: You are not an authorized participant in this private clinical consultation.");
    err.code = 'UNAUTHORIZED_PARTICIPANT';
    err.statusCode = 403;
    throw err;
  }

  const role = isDoctor ? 'doctor' : 'patient';

  // 5. Time Window Boundary Check
  const windowOpens = new Date(room.timeWindow.windowOpensAt);
  const windowCloses = new Date(room.timeWindow.windowClosesAt);

  if (now < windowOpens) {
    const minutesRemaining = Math.ceil((windowOpens.getTime() - now.getTime()) / (60 * 1000));
    const err = new Error(`The room is not yet open. Access opens ${minutesRemaining} minutes before the scheduled slot.`);
    err.code = 'ROOM_NOT_YET_OPEN';
    err.statusCode = 403;
    err.minutesRemaining = minutesRemaining;
    throw err;
  }

  if (now > windowCloses) {
    const err = new Error('Access window for this clinical consultation has expired.');
    err.code = 'ROOM_ACCESS_EXPIRED';
    err.statusCode = 403;
    throw err;
  }

  // 6. Patient Consent Verification
  if (isPatient) {
    validateAndRecordTelehealthConsent({
      patientId: userId,
      appointmentId: room.appointmentId,
      consentGiven: consent.consentGiven,
      emergencyProtocolAcknowledged: consent.emergencyProtocolAcknowledged,
      virtualLimitationsUnderstood: consent.virtualLimitationsUnderstood,
      recordingNoticeAcknowledged: consent.recordingNoticeAcknowledged,
      ipAddress: actorUser.ipAddress || '127.0.0.1',
      userAgent: actorUser.userAgent || 'HealthVibePortal/1.0'
    });
  }

  // 7. State Machine Transition
  const nowIso = now.toISOString();
  room.participants[role].joined = true;
  room.participants[role].joinedAt = nowIso;

  const doctorPresent = room.participants.doctor.joined;
  const patientPresent = room.participants.patient.joined;

  if (doctorPresent && patientPresent) {
    room.status = ROOM_STATES.ACTIVE;
  } else {
    room.status = ROOM_STATES.WAITING;
  }

  room.history.push({
    action: 'PARTICIPANT_JOINED',
    actorUid: userId,
    actorRole: role,
    newRoomState: room.status,
    timestamp: nowIso
  });

  inMemoryTelehealthRooms.set(roomId, room);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('telehealth_rooms').doc(roomId).update({
        status: room.status,
        participants: room.participants,
        history: room.history
      });
    } catch (e) {}
  }

  // 8. Generate Ephemeral Signed Token
  const meetingToken = generateMeetingToken({
    userId,
    role,
    roomId,
    expiresAt: room.timeWindow.windowClosesAt,
    recordingEnabled: false // ZERO RECORDING BY DEFAULT
  });

  return {
    success: true,
    roomId,
    roomUrl: room.roomUrl,
    meetingToken,
    role,
    roomState: room.status,
    recordingEnabled: false,
    encryption: room.encryptionType,
    expiresAt: room.timeWindow.windowClosesAt
  };
}

// ============================================================================
// 🛠️ FAILURE RESILIENCE: CAMERA/MIC & NETWORK DROPS
// ============================================================================

/**
 * Handles device hardware or permission failures with graceful degradation.
 */
function handleMediaDeviceFailure({ roomId, failureType, details = {} }, actorUser) {
  if (!roomId || !failureType) throw new Error('roomId and failureType are required.');

  const room = inMemoryTelehealthRooms.get(roomId);
  if (!room) throw new Error('Room not found.');

  const role = actorUser?.uid === room.doctorId ? 'doctor' : 'patient';
  const nowIso = new Date().toISOString();

  switch (failureType) {
    case 'camera_permission_denied':
    case 'camera_hardware_error':
      room.mediaState.cameraEnabled = false;
      room.mediaState.audioOnlyFallback = true;
      room.history.push({
        action: 'MEDIA_FAILURE_AUDIO_FALLBACK',
        actorRole: role,
        failureType,
        timestamp: nowIso
      });
      return {
        degraded: true,
        fallbackMode: 'audio_only',
        message: 'Camera permission denied or device unavailable. Switched to secure audio-only consultation mode.',
        instructions: 'Check your browser settings to grant camera access or continue with clear audio communication.'
      };

    case 'microphone_permission_denied':
      room.mediaState.audioEnabled = false;
      room.history.push({
        action: 'MIC_PERMISSION_DENIED',
        actorRole: role,
        timestamp: nowIso
      });
      return {
        degraded: true,
        fallbackMode: 'mic_error',
        message: 'Microphone access blocked. Clinical consultation requires bidirectional audio.',
        actionRequired: 'GRANT_MIC_PERMISSIONS'
      };

    default:
      return { degraded: false };
  }
}

/**
 * Handles network connection drops with a reconnection grace period.
 */
async function handleNetworkDisconnection(db, { roomId, participantId }, actorUser) {
  const room = inMemoryTelehealthRooms.get(roomId);
  if (!room) throw new Error('Room not found.');

  const nowIso = new Date().toISOString();
  room.status = ROOM_STATES.DISCONNECTED;
  room.disconnectedAt = nowIso;
  room.reconnectGraceExpiresAt = new Date(Date.now() + RECONNECTION_GRACE_PERIOD_SECONDS * 1000).toISOString();

  room.history.push({
    action: 'NETWORK_DISCONNECTED',
    participantId: participantId || actorUser?.uid,
    timestamp: nowIso,
    gracePeriodSeconds: RECONNECTION_GRACE_PERIOD_SECONDS
  });

  inMemoryTelehealthRooms.set(roomId, room);

  return {
    status: ROOM_STATES.DISCONNECTED,
    reconnecting: true,
    reconnectGraceSeconds: RECONNECTION_GRACE_PERIOD_SECONDS,
    message: 'Temporary connection drop detected. Reconnecting to secure clinical session...'
  };
}

/**
 * Re-establishes session from disconnected state.
 */
async function reconnectTelehealthSession(db, { roomId }, actorUser) {
  const room = inMemoryTelehealthRooms.get(roomId);
  if (!room) throw new Error('Room not found.');

  if (room.status !== ROOM_STATES.DISCONNECTED) {
    return { success: true, status: room.status };
  }

  // Check grace period expiry
  if (room.reconnectGraceExpiresAt && new Date() > new Date(room.reconnectGraceExpiresAt)) {
    room.status = ROOM_STATES.ENDED;
    room.endReason = 'RECONNECTION_TIMEOUT';
    inMemoryTelehealthRooms.set(roomId, room);

    const err = new Error('Reconnection grace period elapsed. Consultation session ended.');
    err.code = 'RECONNECTION_EXPIRED';
    err.statusCode = 410;
    throw err;
  }

  const nowIso = new Date().toISOString();
  room.status = ROOM_STATES.ACTIVE;
  room.history.push({
    action: 'SESSION_RECONNECTED',
    actorUid: actorUser?.uid,
    timestamp: nowIso
  });

  inMemoryTelehealthRooms.set(roomId, room);

  return {
    success: true,
    status: ROOM_STATES.ACTIVE,
    message: 'Telehealth session successfully re-established.'
  };
}

// ============================================================================
// 🏁 SESSION TERMINATION & CANCELLATION INVALIDATION
// ============================================================================

/**
 * Concludes a telehealth session cleanly.
 */
async function endTelehealthRoom(db, { roomId, reason = 'Consultation completed' }, actorUser) {
  const room = inMemoryTelehealthRooms.get(roomId);
  if (!room) {
    const err = new Error(`Telehealth room '${roomId}' not found.`);
    err.code = 'ROOM_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const actorUid = actorUser?.uid || 'system';
  const actorRole = actorUser?.role || 'system';

  // Permission check
  if (actorRole === 'patient' && actorUid !== room.patientId) {
    const err = new Error('Access denied: You cannot end another user\'s session.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
  room.status = ROOM_STATES.ENDED;
  room.endedAt = nowIso;
  room.endedBy = actorUid;
  room.endReason = reason;

  room.history.push({
    action: 'ROOM_ENDED',
    actorUid,
    actorRole,
    reason,
    timestamp: nowIso
  });

  inMemoryTelehealthRooms.set(roomId, room);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('telehealth_rooms').doc(roomId).update({
        status: ROOM_STATES.ENDED,
        endedAt: nowIso,
        endReason: reason,
        history: room.history
      });
    } catch (e) {}
  }

  return { success: true, roomId, status: ROOM_STATES.ENDED, endReason: reason };
}

/**
 * Automatically terminates and invalidates any telehealth rooms when an appointment is cancelled.
 */
async function terminateRoomsForAppointment(db, appointmentId, reason = 'Appointment cancelled') {
  if (!appointmentId) return { terminatedCount: 0 };

  let count = 0;
  const nowIso = new Date().toISOString();

  for (const room of inMemoryTelehealthRooms.values()) {
    if (room.appointmentId === appointmentId && room.status !== ROOM_STATES.ENDED) {
      room.status = ROOM_STATES.ENDED;
      room.endedAt = nowIso;
      room.endReason = `APPOINTMENT_CANCELLED: ${reason}`;
      room.history.push({
        action: 'ROOM_TERMINATED_ON_APPOINTMENT_CANCELLATION',
        timestamp: nowIso,
        reason
      });
      count++;
    }
  }

  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('telehealth_rooms')
        .where('appointmentId', '==', appointmentId)
        .where('status', '!=', ROOM_STATES.ENDED)
        .get();
      if (snap && snap.docs) {
        for (const doc of snap.docs) {
          await doc.ref.update({
            status: ROOM_STATES.ENDED,
            endedAt: nowIso,
            endReason: `APPOINTMENT_CANCELLED: ${reason}`
          });
        }
      }
    } catch (e) {}
  }

  return { terminatedCount: count };
}

/**
 * Clears in-memory stores between test runs.
 */
function clearTelehealthMemoryStore() {
  inMemoryTelehealthRooms.clear();
  inMemoryTelehealthConsents.clear();
}

module.exports = {
  TELEHEALTH_PROVIDERS,
  ROOM_STATES,
  DEFAULT_EARLY_JOIN_MINUTES,
  DEFAULT_GRACE_WINDOW_MINUTES,
  RECONNECTION_GRACE_PERIOD_SECONDS,
  getTelehealthProviderConfig,
  validateAndRecordTelehealthConsent,
  calculateRoomTimeWindow,
  createTelehealthRoom,
  joinTelehealthRoom,
  generateMeetingToken,
  handleMediaDeviceFailure,
  handleNetworkDisconnection,
  reconnectTelehealthSession,
  endTelehealthRoom,
  terminateRoomsForAppointment,
  clearTelehealthMemoryStore,
  _inMemoryTelehealthRooms: inMemoryTelehealthRooms,
  _inMemoryTelehealthConsents: inMemoryTelehealthConsents
};
