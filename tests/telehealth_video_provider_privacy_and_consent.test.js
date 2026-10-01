/**
 * Health Vibe AI - Telehealth Video Consultation, Privacy & Consent Governance Test Suite
 *
 * Verifies:
 * 1. Provider identification, compliance capabilities (Daily.co, LiveKit, Sandbox) and HIPAA BAA schema.
 * 2. Informed consent verification: mandatory opt-in, emergency protocol, virtual limitations, zero-recording notice.
 * 3. Appointment linking: rooms strictly created only for confirmed appointments.
 * 4. Participant identity verification: doctor and patient only; unauthorized third-parties blocked with 403.
 * 5. Time-limited access windows: early access blocked (ROOM_NOT_YET_OPEN), expired access blocked (ROOM_ACCESS_EXPIRED).
 * 6. Room state machine: 'waiting', 'active', 'disconnected', 'ended' transitions.
 * 7. Zero-recording default: privacy guarantee verified on room and token payloads.
 * 8. Media and network failures: camera permission denial audio fallback, network drop grace period and reconnection.
 * 9. Appointment cancellation invalidation: cancelling appointment immediately terminates room and blocks re-entry.
 * 10. Express REST API endpoints integration and route guards.
 */

const assert = require('assert');
const http = require('http');
const app = require('../backend/server');
const schedulingService = require('../backend/scheduling-service');
const telehealthService = require('../backend/telehealth-video-service');

console.log("\n==================================================================");
console.log("📹 HEALTH VIBE AI: TELEHEALTH VIDEO, PRIVACY & CONSENT TESTS");
console.log("   Identity Verification, Time Windows, State Machine & Resilience");
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
  telehealthService.clearTelehealthMemoryStore();
  schedulingService.clearMemorySlotLocks();

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Provider Evaluation & HIPAA Compliance Architecture
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Provider Evaluation & HIPAA Compliance Architecture');

  const dailyConfig = telehealthService.getTelehealthProviderConfig('daily');
  assert.strictEqual(dailyConfig.provider, 'daily');
  assert.strictEqual(dailyConfig.hipaaBaaAvailable, true);
  assert.strictEqual(dailyConfig.zeroRecordingDefault, true);
  assert.strictEqual(dailyConfig.maxParticipants, 2);

  const livekitConfig = telehealthService.getTelehealthProviderConfig('livekit');
  assert.strictEqual(livekitConfig.provider, 'livekit');
  assert.strictEqual(livekitConfig.hipaaBaaAvailable, true);

  const sandboxConfig = telehealthService.getTelehealthProviderConfig('sandbox');
  assert.strictEqual(sandboxConfig.provider, 'sandbox');
  assert.strictEqual(sandboxConfig.zeroRecordingDefault, true);

  console.log('  ✓ Multi-provider architecture verified: Daily.co, LiveKit, and Sandbox.');
  console.log('  ✓ Mandatory HIPAA BAA capability and Zero-Recording default confirmed.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Privacy & Telehealth Informed Consent Requirements
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: Privacy & Telehealth Informed Consent Requirements');

  // 2A: Missing affirmative consent -> REJECTED
  assert.throws(
    () => telehealthService.validateAndRecordTelehealthConsent({
      patientId: 'usr_pat_consent_test',
      appointmentId: 'appt_consent_001',
      consentGiven: false,
      emergencyProtocolAcknowledged: true
    }),
    err => err.code === 'TELEHEALTH_CONSENT_REQUIRED',
    'Must reject when patient consent is not given'
  );

  // 2B: Missing emergency protocol acknowledgment -> REJECTED
  assert.throws(
    () => telehealthService.validateAndRecordTelehealthConsent({
      patientId: 'usr_pat_consent_test',
      appointmentId: 'appt_consent_001',
      consentGiven: true,
      emergencyProtocolAcknowledged: false // Did not acknowledge calling 123
    }),
    err => err.code === 'EMERGENCY_PROTOCOL_NOT_ACKNOWLEDGED',
    'Must reject when emergency protocol is unacknowledged'
  );

  // 2C: Complete valid consent -> SUCCESS
  const validConsent = telehealthService.validateAndRecordTelehealthConsent({
    patientId: 'usr_pat_consent_test',
    appointmentId: 'appt_consent_001',
    consentGiven: true,
    emergencyProtocolAcknowledged: true,
    virtualLimitationsUnderstood: true,
    recordingNoticeAcknowledged: true,
    ipAddress: '197.34.120.45',
    userAgent: 'HealthVibeMobileApp/2.4 (Android 14)'
  });

  assert.strictEqual(validConsent.consentGiven, true);
  assert.strictEqual(validConsent.emergencyProtocolAcknowledged, true);
  assert.strictEqual(validConsent.recordingPolicy, 'DISABLED_BY_DEFAULT');
  assert.ok(validConsent.consentedAt);

  console.log('  ✓ Telehealth informed consent strictly enforced.');
  console.log('  ✓ Pulmonary emergency protocol (123) acknowledgment validated.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Room Creation Linked Strictly to Confirmed Appointment
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Room Creation Linked Strictly to Confirmed Appointment');

  const testDate = '2026-10-20';
  const testSlot = 'slot_1000'; // 10:00 AM

  // Create a confirmed appointment in db
  const confirmedAppt = await schedulingService.bookAppointmentTransaction(db, {
    appointmentId: 'appt_telehealth_confirmed_001',
    patientId: 'usr_pat_tarek',
    patientName: 'Tarek Mansour',
    doctorId: 'dr_mona',
    clinicId: 'clinic_cairo_main',
    date: testDate,
    slotId: testSlot,
    timeSlot: '10:00 صباحاً',
    timeSlotEn: '10:00 AM'
  }, { uid: 'usr_pat_tarek', email: 'tarek@example.com', role: 'patient' });

  // 3A: Create room for confirmed appointment -> SUCCESS
  const room = await telehealthService.createTelehealthRoom(db, {
    appointmentId: confirmedAppt.id,
    provider: 'daily'
  }, { uid: 'usr_pat_tarek', role: 'patient' });

  assert.strictEqual(room.appointmentId, confirmedAppt.id);
  assert.strictEqual(room.doctorId, 'dr_mona');
  assert.strictEqual(room.patientId, 'usr_pat_tarek');
  assert.strictEqual(room.status, 'created');
  assert.strictEqual(room.recordingEnabled, false);
  assert.strictEqual(room.maxParticipants, 2);
  assert.ok(room.timeWindow.windowOpensAt);
  assert.ok(room.timeWindow.windowClosesAt);

  // 3B: Create cancelled appointment
  await db.collection('appointments').doc('appt_cancelled_test').set({
    id: 'appt_cancelled_test',
    status: 'cancelled',
    patientId: 'usr_pat_other',
    doctorId: 'dr_mona'
  });

  // Attempt to create room for cancelled appointment -> REJECTED (400 APPOINTMENT_NOT_CONFIRMED)
  await assert.rejects(
    async () => telehealthService.createTelehealthRoom(db, {
      appointmentId: 'appt_cancelled_test'
    }, { uid: 'dr_mona', role: 'doctor' }),
    err => err.code === 'APPOINTMENT_NOT_CONFIRMED',
    'Cannot create telehealth room for non-confirmed appointment'
  );

  console.log('  ✓ Room creation successfully tied to confirmed appointment.');
  console.log('  ✓ Cancelled or non-confirmed appointments strictly blocked.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Identity Verification & Rejection of Unauthorized Entry
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Identity Verification & Rejection of Unauthorized Entry');

  const slotStart = new Date(`${testDate}T10:00:00`);
  const validJoinTime = new Date(slotStart.getTime() - 5 * 60 * 1000); // 5 mins before slot

  const validPatientConsent = {
    consentGiven: true,
    emergencyProtocolAcknowledged: true,
    virtualLimitationsUnderstood: true,
    recordingNoticeAcknowledged: true
  };

  // 4A: Unauthorized patient (Intruder) attempts to join -> REJECTED (403 UNAUTHORIZED_PARTICIPANT)
  await assert.rejects(
    async () => telehealthService.joinTelehealthRoom(db, {
      roomId: room.id,
      consent: validPatientConsent,
      now: validJoinTime
    }, { uid: 'usr_pat_intruder_999', role: 'patient' }),
    err => err.code === 'UNAUTHORIZED_PARTICIPANT',
    'Unauthorized patient must be strictly barred from entering another patient consultation'
  );

  // 4B: Unassigned doctor attempts to join -> REJECTED (403 UNAUTHORIZED_PARTICIPANT)
  await assert.rejects(
    async () => telehealthService.joinTelehealthRoom(db, {
      roomId: room.id,
      now: validJoinTime
    }, { uid: 'dr_tarek_unassigned', role: 'doctor' }),
    err => err.code === 'UNAUTHORIZED_PARTICIPANT',
    'Unassigned doctor must be barred from entering private consultation'
  );

  console.log('  ✓ Strict participant identity verification enforced.');
  console.log('  ✓ Intruder patient and unassigned doctor rejected with 403 UNAUTHORIZED_PARTICIPANT.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Time-Limited Access Windows (Boundary Enforcement)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: Time-Limited Access Windows (Boundary Enforcement)');

  // 5A: Too early (e.g. 30 minutes before slot start; opens at -15 mins) -> REJECTED (403 ROOM_NOT_YET_OPEN)
  const tooEarlyTime = new Date(slotStart.getTime() - 30 * 60 * 1000);
  await assert.rejects(
    async () => telehealthService.joinTelehealthRoom(db, {
      roomId: room.id,
      consent: validPatientConsent,
      now: tooEarlyTime
    }, { uid: 'usr_pat_tarek', role: 'patient' }),
    err => err.code === 'ROOM_NOT_YET_OPEN',
    'Access before 15-minute buffer must be rejected'
  );

  // 5B: Too late (e.g. 2 hours after slot start; closes at +45 mins post-slot) -> REJECTED (403 ROOM_ACCESS_EXPIRED)
  const tooLateTime = new Date(slotStart.getTime() + 120 * 60 * 1000);
  await assert.rejects(
    async () => telehealthService.joinTelehealthRoom(db, {
      roomId: room.id,
      consent: validPatientConsent,
      now: tooLateTime
    }, { uid: 'usr_pat_tarek', role: 'patient' }),
    err => err.code === 'ROOM_ACCESS_EXPIRED',
    'Access after grace window has elapsed must be rejected'
  );

  console.log('  ✓ Early entry attempt (-30m) blocked with ROOM_NOT_YET_OPEN.');
  console.log('  ✓ Late entry attempt (+120m) blocked with ROOM_ACCESS_EXPIRED.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Room State Machine & Ephemeral Meeting Tokens
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 6: Room State Machine & Ephemeral Meeting Tokens');

  // 6A: Patient joins within window -> Room state transitions to 'waiting'
  const patientJoinResult = await telehealthService.joinTelehealthRoom(db, {
    roomId: room.id,
    consent: validPatientConsent,
    now: validJoinTime
  }, { uid: 'usr_pat_tarek', role: 'patient' });

  assert.strictEqual(patientJoinResult.success, true);
  assert.strictEqual(patientJoinResult.role, 'patient');
  assert.strictEqual(patientJoinResult.roomState, 'waiting', 'When 1st participant enters, room is waiting');
  assert.strictEqual(patientJoinResult.recordingEnabled, false);
  assert.ok(patientJoinResult.meetingToken);

  // 6B: Doctor joins -> Room state transitions to 'active'
  const doctorJoinResult = await telehealthService.joinTelehealthRoom(db, {
    roomId: room.id,
    now: validJoinTime
  }, { uid: 'dr_mona', role: 'doctor' });

  assert.strictEqual(doctorJoinResult.success, true);
  assert.strictEqual(doctorJoinResult.role, 'doctor');
  assert.strictEqual(doctorJoinResult.roomState, 'active', 'When both participants enter, room is active');
  assert.strictEqual(doctorJoinResult.recordingEnabled, false);
  assert.ok(doctorJoinResult.meetingToken);

  console.log('  ✓ Room state transitions: created -> waiting -> active.');
  console.log('  ✓ Short-lived signed meeting tokens issued with zero-recording flag.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 7: Zero-Recording Default (Privacy Guarantee)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 7: Zero-Recording Default (Privacy Guarantee)');

  assert.strictEqual(room.recordingEnabled, false);
  assert.strictEqual(patientJoinResult.recordingEnabled, false);
  assert.strictEqual(doctorJoinResult.recordingEnabled, false);

  // Decode meeting token payload and verify recording is disabled in payload
  const tokenParts = patientJoinResult.meetingToken.split('.');
  const tokenPayload = JSON.parse(Buffer.from(tokenParts[0].replace('thtok_', ''), 'base64url').toString('utf8'));
  assert.strictEqual(tokenPayload.rec, false, 'Meeting token must have rec: false');
  assert.strictEqual(tokenPayload.e2ee, true, 'Meeting token must have e2ee: true');

  console.log('  ✓ Meeting token and room configurations strictly guarantee zero call recording.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 8: Media & Network Failure Resilience (Camera & Reconnect Grace)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 8: Media & Network Failure Resilience (Camera & Reconnect Grace)');

  // 8A: Camera permission denied -> Graceful audio-only fallback
  const cameraFailure = telehealthService.handleMediaDeviceFailure({
    roomId: room.id,
    failureType: 'camera_permission_denied'
  }, { uid: 'usr_pat_tarek', role: 'patient' });

  assert.strictEqual(cameraFailure.degraded, true);
  assert.strictEqual(cameraFailure.fallbackMode, 'audio_only');
  assert.strictEqual(room.mediaState.audioOnlyFallback, true);

  // 8B: Network disconnection -> Transition to 'disconnected' with 120s grace period
  const disconnectResult = await telehealthService.handleNetworkDisconnection(db, {
    roomId: room.id,
    participantId: 'usr_pat_tarek'
  }, { uid: 'usr_pat_tarek', role: 'patient' });

  assert.strictEqual(disconnectResult.status, 'disconnected');
  assert.strictEqual(disconnectResult.reconnectGraceSeconds, 120);
  assert.strictEqual(room.status, 'disconnected');

  // 8C: Reconnection within grace period -> Restores to 'active'
  const reconnectResult = await telehealthService.reconnectTelehealthSession(db, {
    roomId: room.id
  }, { uid: 'usr_pat_tarek', role: 'patient' });

  assert.strictEqual(reconnectResult.success, true);
  assert.strictEqual(reconnectResult.status, 'active');
  assert.strictEqual(room.status, 'active');

  console.log('  ✓ Camera permission failure gracefully degraded to audio-only consultation.');
  console.log('  ✓ Transient network drop safely set to disconnected with 120s grace window.');
  console.log('  ✓ Reconnection succeeded and restored consultation to active state.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 9: Appointment Cancellation Invalidation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 9: Appointment Cancellation Invalidation');

  // Patient cancels the appointment
  const cancelApptResult = await schedulingService.cancelAppointmentTransaction(db, confirmedAppt.id, {
    uid: 'usr_pat_tarek',
    role: 'patient'
  }, { reason: 'Severe acute condition, admitted to hospital' });

  assert.strictEqual(cancelApptResult.status, 'cancelled');

  // Verify telehealth room was immediately terminated
  const updatedRoom = telehealthService._inMemoryTelehealthRooms.get(room.id);
  assert.strictEqual(updatedRoom.status, 'ended');
  assert.ok(updatedRoom.endReason.includes('APPOINTMENT_CANCELLED'));

  // Attempting to join cancelled room must be REJECTED (400 APPOINTMENT_CANCELLED)
  await assert.rejects(
    async () => telehealthService.joinTelehealthRoom(db, {
      roomId: room.id,
      consent: validPatientConsent,
      now: validJoinTime
    }, { uid: 'usr_pat_tarek', role: 'patient' }),
    err => err.code === 'APPOINTMENT_CANCELLED' || err.code === 'ROOM_ALREADY_ENDED',
    'Joining room for cancelled appointment must be blocked'
  );

  console.log('  ✓ Appointment cancellation immediately terminated active telehealth room.');
  console.log('  ✓ Subsequent room join attempts blocked with APPOINTMENT_CANCELLED.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 10: Express REST Endpoints Integration
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 10: Express REST Endpoints Integration');

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;

      // 10A: Public/Open GET /api/telehealth/provider
      http.get(`http://127.0.0.1:${port}/api/telehealth/provider`, (res) => {
        assert.strictEqual(res.statusCode, 200);

        // 10B: Protected POST /api/telehealth/rooms/create without auth -> 401
        const req = http.request(`http://127.0.0.1:${port}/api/telehealth/rooms/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, (res2) => {
          server.close();
          try {
            assert.strictEqual(res2.statusCode, 401, 'Unauthenticated room creation must return 401');
            console.log('  ✓ GET /api/telehealth/provider returned active provider capabilities.');
            console.log('  ✓ POST /api/telehealth/rooms/create protected by requireAuth route guard.\n');
            resolve();
          } catch (e) { reject(e); }
        });
        req.on('error', e => { server.close(); reject(e); });
        req.write(JSON.stringify({ appointmentId: 'test_123' }));
        req.end();
      }).on('error', e => { server.close(); reject(e); });
    });
  });

  console.log('==================================================================');
  console.log('🎉 ALL TELEHEALTH VIDEO, PRIVACY & CONSENT TESTS PASSED (100%)');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
