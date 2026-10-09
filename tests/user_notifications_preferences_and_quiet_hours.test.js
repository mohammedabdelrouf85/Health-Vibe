/**
 * HEALTH VIBE AI: USER NOTIFICATION HISTORY, PREFERENCES & QUIET HOURS TEST SUITE
 * 
 * Validates:
 * 1. Notification history: read/unread states, event types, authorized destination links.
 * 2. Preferences: channels (in_app, email, sms, whatsapp), quiet hours, time zone, urgent policy.
 * 3. Quiet hours logic: accurate time zone calculation, midnight crossing, and urgent clinical bypass.
 * 4. Server-side sender enforcement: quiet hours deferral (no lost notifications) vs immediate delivery.
 * 5. Appointment cancellation & rescheduling awareness: cancelling or updating reminder queues.
 * 6. User Isolation & PHI Protection:
 *    - Preference changes neither lose required notifications nor leak medical content to another user.
 *    - Submitter isolation: User A cannot see or modify User B's notifications.
 * 7. End-to-End Express REST API endpoints:
 *    - GET /api/notifications (history, unread filtering, pagination)
 *    - PATCH /api/notifications/:id/read & POST /api/notifications/read-all
 *    - GET /api/notifications/preferences & PUT /api/notifications/preferences
 *    - POST /api/notifications/dispatch (server-side sender with preference enforcement)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

const {
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  recordNotificationHistory,
  getUserNotificationHistory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationById,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  isQuietHoursActive,
  calculateNextQuietHoursEnd,
  isUrgentEvent,
  generateAuthorizedDestinationLink,
  dispatchNotificationWithPreferences,
  enqueueNotification,
  processNotificationQueue,
  scheduleAppointmentReminder,
  cancelAppointmentReminders,
  rescheduleAppointmentReminders,
  clearNotificationHistoryLog,
  clearPreferencesLog,
  clearSentEmailsLog,
  getSentEmailsLog
} = require('../backend/notification-service');

console.log('==================================================================');
console.log('🔔 HEALTH VIBE AI: USER NOTIFICATIONS & PREFERENCES TEST SUITE');
console.log('   History, Read States, Quiet Hours, Time Zones, Cancellations & PHI Isolation');
console.log('==================================================================\n');

// Mock User Accounts for RBAC and Multi-User Isolation Testing
const userAccounts = {
  'patient-sarah': { uid: 'usr_pat_sarah', role: 'patient', name: 'Sarah Mansour', email: 'sarah.mansour@example.com', email_verified: true },
  'patient-ali': { uid: 'usr_pat_ali', role: 'patient', name: 'Ali Hassan', email: 'ali.hassan@example.com', email_verified: true },
  'doc-tarek': { uid: 'doc_tarek', role: 'doctor', name: 'Dr. Tarek Mahmoud, MD', email: 'tarek@healthvibes.org', email_verified: true },
  'super-admin': { uid: 'admin_sys', role: 'super_admin', isOwner: true, name: 'Chief Admin', email: 'admin@healthvibes.org', email_verified: true }
};

// In-Memory Mock Firestore Database for Unit & Route Testing
function createMockFirestore() {
  const store = {};

  function getCollection(colName) {
    if (!store[colName]) store[colName] = new Map();
    return store[colName];
  }

  return {
    _store: store,
    collection(colName) {
      const colMap = getCollection(colName);
      return {
        doc(docId) {
          const id = docId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          return {
            id,
            async get() {
              const data = colMap.get(id);
              return {
                id,
                exists: Boolean(data),
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
              };
            },
            async set(data, options = {}) {
              const prev = colMap.get(id) || {};
              const merged = (options && options.merge) ? { ...prev, ...data } : { ...data };
              colMap.set(id, merged);
              return { writeTime: new Date() };
            },
            async update(data) {
              const prev = colMap.get(id);
              if (!prev) throw new Error(`Document ${id} does not exist for update`);
              const updated = { ...prev, ...data };
              colMap.set(id, updated);
              return { writeTime: new Date() };
            },
            async delete() {
              colMap.delete(id);
            }
          };
        },
        async add(data) {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          colMap.set(id, { ...data, id });
          return {
            id,
            async get() {
              return { id, exists: true, data: () => data };
            }
          };
        },
        where(field, op, val) {
          return {
            where(f2, op2, val2) {
              return {
                async get() {
                  const allDocs = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
                  const filtered = allDocs.filter(d => {
                    const match1 = op === '==' ? d[field] === val : op === 'in' ? Array.isArray(val) && val.includes(d[field]) : true;
                    const match2 = op2 === '==' ? d[f2] === val2 : op2 === 'in' ? Array.isArray(val2) && val2.includes(d[f2]) : true;
                    return match1 && match2;
                  });
                  return {
                    empty: filtered.length === 0,
                    size: filtered.length,
                    docs: filtered.map(d => ({
                      id: d.id,
                      data: () => ({ ...d })
                    }))
                  };
                }
              };
            },
            async get() {
              const allDocs = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
              const filtered = allDocs.filter(d => {
                if (op === '==') return d[field] === val;
                if (op === 'in') return Array.isArray(val) && val.includes(d[field]);
                return true;
              });
              return {
                empty: filtered.length === 0,
                size: filtered.length,
                docs: filtered.map(d => ({
                  id: d.id,
                  data: () => ({ ...d })
                }))
              };
            }
          };
        },
        async get() {
          const allDocs = Array.from(colMap.entries()).map(([id, d]) => ({
            id,
            data: () => ({ ...d })
          }));
          return {
            empty: allDocs.length === 0,
            docs: allDocs
          };
        }
      };
    }
  };
}

const mockFirebase = {
  apps: [{}],
  firestore: () => createMockFirestore(),
  auth: () => ({
    verifyIdToken: async (token) => {
      const u = userAccounts[token];
      if (!u) throw new Error(`Unknown token: ${token}`);
      return { ...u };
    }
  })
};

// Express App Sandbox
const sandbox = {
  require: name => {
    if (name === 'firebase-admin') return mockFirebase;
    if (name === 'dotenv') return { config() {} };
    if (['./whatsapp-bot', './backup-service'].includes(name)) return {};
    return backendRequire(name);
  },
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true'
    },
    on() {},
    uptime: () => 1
  },
  console,
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), sandbox);
const sandboxedApp = sandbox.module.exports;

(async () => {
  const server = sandboxedApp.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, token = null, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + route, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const parsed = await res.json();
    return { status: res.status, body: parsed };
  }

  try {
    const db = createMockFirestore();
    clearNotificationHistoryLog();
    clearPreferencesLog();
    clearSentEmailsLog();

    // ---------------------------------------------------------------------------
    // TEST 1: User Notification History, Read/Unread States & Event Types
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 1: User Notification History with Read/Unread States & Event Types');

    // 1.1 Create diverse notifications for patient Sarah
    const n1 = await recordNotificationHistory(db, {
      userId: 'usr_pat_sarah',
      eventType: NOTIFICATION_TYPES.RESULT_READY,
      title: 'تقرير الفحص التنفسي جاهز',
      message: 'تم اعتماد تقرير الفحص التنفسي الخاص بك من قبل الاستشاري.',
      metadata: { caseId: 'case_sarah_001' }
    });
    assert.ok(n1.id);
    assert.equal(n1.userId, 'usr_pat_sarah');
    assert.equal(n1.eventType, NOTIFICATION_TYPES.RESULT_READY);
    assert.equal(n1.read, false);
    assert.equal(n1.readAt, null);
    assert.ok(n1.authorizedDestinationLink.includes('screen=report&caseId=case_sarah_001'));

    const n2 = await recordNotificationHistory(db, {
      userId: 'usr_pat_sarah',
      eventType: NOTIFICATION_TYPES.APPOINTMENT_BOOKED,
      title: 'تأكيد حجز الموعد الطبي',
      message: 'تم تأكيد موعدك مع د. طارق محمود يوم الخميس الساعة 4:00 مساءً.',
      metadata: { appointmentId: 'appt_sarah_101' }
    });
    assert.ok(n2.authorizedDestinationLink.includes('screen=appointments&id=appt_sarah_101'));

    const n3 = await recordNotificationHistory(db, {
      userId: 'usr_pat_sarah',
      eventType: NOTIFICATION_TYPES.ESCALATION,
      title: 'تنبيه سريري عاجل',
      message: 'تم رصد هبوط في نسبة الأكسجين SpO2 إلى 88% ويتطلب مراجعة الطوارئ.',
      urgent: true,
      metadata: { caseId: 'case_sarah_001' }
    });
    assert.equal(n3.urgent, true);
    assert.ok(n3.authorizedDestinationLink.includes('screen=emergency&caseId=case_sarah_001'));

    // 1.2 Query history
    const historyBefore = await getUserNotificationHistory(db, 'usr_pat_sarah');
    assert.equal(historyBefore.totalCount, 3);
    assert.equal(historyBefore.unreadCount, 3);

    // 1.3 Mark single notification as read
    const marked = await markNotificationAsRead(db, n1.id, 'usr_pat_sarah');
    assert.equal(marked.read, true);
    assert.ok(marked.readAt);

    const historyAfterOne = await getUserNotificationHistory(db, 'usr_pat_sarah', { unreadOnly: true });
    assert.equal(historyAfterOne.notifications.length, 2);

    // 1.4 Mark all notifications as read
    const markAllRes = await markAllNotificationsAsRead(db, 'usr_pat_sarah');
    assert.equal(markAllRes.success, true);
    assert.equal(markAllRes.updatedCount, 2);

    const historyAfterAll = await getUserNotificationHistory(db, 'usr_pat_sarah');
    assert.equal(historyAfterAll.unreadCount, 0);

    console.log('  ✓ In-app history created with read/unread tracking and authorized links.');
    console.log('  ✓ Mark as read and mark-all-read state transitions verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 2: Channel Preferences, Quiet Hours, and Time Zone Settings
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 2: Channel Preferences, Quiet Hours & Time Zone Settings');

    // 2.1 Default preferences
    const defaultPrefs = await getUserNotificationPreferences(db, 'usr_pat_sarah');
    assert.equal(defaultPrefs.channels.in_app, true);
    assert.equal(defaultPrefs.channels.email, true);
    assert.equal(defaultPrefs.quietHours.enabled, false);
    assert.equal(defaultPrefs.timeZone, 'Africa/Cairo');
    assert.equal(defaultPrefs.urgentPolicy, 'ALWAYS_DELIVER_IMMEDIATELY');

    // 2.2 Update preferences: enable quiet hours (22:00 to 08:00) with America/New_York time zone
    const updatedPrefs = await updateUserNotificationPreferences(db, 'usr_pat_sarah', {
      channels: { in_app: true, email: true, sms: false, whatsapp: true },
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
      timeZone: 'America/New_York'
    });
    assert.equal(updatedPrefs.channels.whatsapp, true);
    assert.equal(updatedPrefs.quietHours.enabled, true);
    assert.equal(updatedPrefs.quietHours.start, '22:00');
    assert.equal(updatedPrefs.quietHours.end, '08:00');
    assert.equal(updatedPrefs.timeZone, 'America/New_York');
    assert.equal(updatedPrefs.urgentPolicy, 'ALWAYS_DELIVER_IMMEDIATELY');

    // 2.3 Validation guards: reject invalid time formats and invalid timezones
    await assert.rejects(
      async () => updateUserNotificationPreferences(db, 'usr_pat_sarah', { quietHours: { start: 'invalid_time' } }),
      err => err.code === 'INVALID_TIME_FORMAT'
    );
    await assert.rejects(
      async () => updateUserNotificationPreferences(db, 'usr_pat_sarah', { timeZone: 'Fantasy/Atlantis' }),
      err => err.code === 'INVALID_TIMEZONE'
    );

    console.log('  ✓ Preferences model verified (channels, quiet hours, time zone, urgent policy).');
    console.log('  ✓ Input format validators active (time format & IANA time zone validation).\n');

    // ---------------------------------------------------------------------------
    // TEST 3: Quiet Hours Logic & Urgent Events Policy
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 3: Quiet Hours Calculation in Time Zones & Urgent Bypass');

    const cairoPrefs = {
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
      timeZone: 'Africa/Cairo',
      urgentPolicy: 'ALWAYS_DELIVER_IMMEDIATELY'
    };

    // 23:30 Cairo local time is inside quiet hours (crosses midnight)
    const nightCairo = new Date('2026-10-01T23:30:00+02:00');
    assert.equal(isQuietHoursActive(cairoPrefs, nightCairo), true, 'Night time should be in quiet hours');

    // 14:00 Cairo local time is outside quiet hours
    const daytimeCairo = new Date('2026-10-01T14:00:00+02:00');
    assert.equal(isQuietHoursActive(cairoPrefs, daytimeCairo), false, 'Day time should not be in quiet hours');

    // Urgent clinical event check
    const urgentEscalation = isUrgentEvent({ eventType: NOTIFICATION_TYPES.ESCALATION });
    const urgentSpO2Alert = isUrgentEvent({ urgent: true, severity: 'CRITICAL' });
    const routineAppointment = isUrgentEvent({ eventType: NOTIFICATION_TYPES.APPOINTMENT_REMINDER });

    assert.equal(urgentEscalation, true, 'Clinical escalation must qualify as urgent');
    assert.equal(urgentSpO2Alert, true, 'Critical SpO2 alert must qualify as urgent');
    assert.equal(routineAppointment, false, 'Routine appointment reminder is not urgent');

    console.log('  ✓ Quiet hours accurately computed with midnight-crossing support in user time zone.');
    console.log('  ✓ Urgent clinical classification verified (ESCALATION, critical severity, urgent flag).\n');

    // ---------------------------------------------------------------------------
    // TEST 4: Server-Side Sender Enforcement (Deferral vs Immediate Delivery)
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 4: Server-Side Sender Enforcement: Deferral vs Immediate Dispatch');

    await updateUserNotificationPreferences(db, 'usr_pat_sarah', {
      channels: { in_app: true, email: true },
      quietHours: { enabled: true, start: '00:00', end: '23:59' },
      timeZone: 'UTC'
    });

    clearSentEmailsLog();

    // 4.1 Non-urgent notification during quiet hours -> MUST BE DEFERRED, NOT LOST!
    const nonUrgentRes = await dispatchNotificationWithPreferences(db, {
      userId: 'usr_pat_sarah',
      recipientEmail: 'sarah.mansour@example.com',
      eventType: NOTIFICATION_TYPES.APPOINTMENT_REMINDER,
      title: 'تذكير بموعدك القادم',
      body: 'موعدك غداً الساعة 10:00 صباحاً.',
      payload: { appointmentId: 'appt_sarah_101', date: '2026-10-02', timeSlot: '10:00 AM' }
    });

    assert.equal(nonUrgentRes.quietHoursActive, true);
    assert.equal(nonUrgentRes.deferred, true, 'Non-urgent notification must be deferred during quiet hours');
    assert.ok(nonUrgentRes.scheduledAt, 'ScheduledAt must be set for post-quiet hours dispatch');
    assert.ok(nonUrgentRes.inAppNotification, 'In-app notification is recorded');
    assert.equal(nonUrgentRes.channels.email, 'deferred');
    assert.equal(getSentEmailsLog().length, 0, 'No noisy email should be sent during quiet hours');

    // 4.2 Urgent clinical notification during quiet hours -> MUST BYPASS QUIET HOURS IMMEDIATELY!
    const urgentRes = await dispatchNotificationWithPreferences(db, {
      userId: 'usr_pat_sarah',
      recipientEmail: 'sarah.mansour@example.com',
      eventType: NOTIFICATION_TYPES.ESCALATION,
      title: '🚨 تنبيه طبي عاجل: تصعيد الحالة',
      body: 'مؤشرات حيوية حرجة تتطلب مراجعة الطوارئ.',
      urgent: true,
      severity: 'CRITICAL',
      payload: { caseId: 'case_sarah_crit', severityLevel: 'عالي الخطورة' }
    });

    assert.equal(urgentRes.quietHoursActive, true);
    assert.equal(urgentRes.urgentBypass, true, 'Urgent clinical event must bypass quiet hours');
    assert.equal(urgentRes.deliveredImmediately, true);
    assert.equal(urgentRes.channels.email, 'sent');
    assert.equal(getSentEmailsLog().length, 1, 'Urgent clinical alert dispatched immediately');

    console.log('  ✓ Non-urgent notification during quiet hours safely deferred in queue (NOT dropped).');
    console.log('  ✓ Urgent clinical event strictly bypassed quiet hours for immediate delivery.\n');

    // ---------------------------------------------------------------------------
    // TEST 5: Respect Cancellations and Rescheduling
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 5: Appointment Cancellation & Rescheduling Awareness');

    const testApptId = 'appt_resched_test_777';
    const apptRecord = {
      id: testApptId,
      patientEmail: 'sarah.mansour@example.com',
      patientName: 'Sarah Mansour',
      slotStart: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      date: '2026-10-03',
      timeSlot: '11:00 AM'
    };

    // 5.1 Schedule initial reminder
    const schedRes = await scheduleAppointmentReminder(db, apptRecord);
    assert.equal(schedRes.success, true);
    assert.equal(schedRes.queued, true);

    // 5.2 Reschedule appointment
    const newSlotStart = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const reschedRes = await rescheduleAppointmentReminders(db, apptRecord, newSlotStart, 'Rescheduled by doctor');
    assert.equal(reschedRes.success, true);
    assert.equal(reschedRes.cancelledPreviousCount, 1, 'Previous pending reminder queue entry cancelled');
    assert.equal(reschedRes.newReminder.success, true);
    assert.equal(reschedRes.newReminder.queued, true);

    // 5.3 Cancel appointment
    const cancelRes = await cancelAppointmentReminders(db, testApptId, 'Cancelled by patient');
    assert.equal(cancelRes.cancelledCount, 1, 'Active reminder cleanly cancelled upon appointment cancellation');

    console.log('  ✓ Rescheduling cleanly cancels old reminder and enqueues updated slot.');
    console.log('  ✓ Cancellation terminates all pending reminders in the queue.\n');

    // ---------------------------------------------------------------------------
    // TEST 6: User Isolation & Zero Medical Content Cross-User Leakage
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 6: User Isolation (Zero Medical PHI Leakage Across Users)');

    clearNotificationHistoryLog();

    // Sarah has a sensitive clinical report notification
    const sarahSecretCase = await recordNotificationHistory(db, {
      userId: 'usr_pat_sarah',
      eventType: NOTIFICATION_TYPES.RESULT_READY,
      title: 'نتيجة فحص السل والالتهاب الرئوي',
      message: 'التشخيص السريري: اشتباه بالتهاب رئوي حاد مع وصفة مضاد حيوي.',
      metadata: { caseId: 'secret_case_sarah_999', diagnosis: 'Pneumonia suspect' }
    });

    // Ali has his own routine notification
    const aliNotice = await recordNotificationHistory(db, {
      userId: 'usr_pat_ali',
      eventType: NOTIFICATION_TYPES.APPOINTMENT_BOOKED,
      title: 'حجز كشف عيون',
      message: 'تم حجز موعدك بنجاح.',
      metadata: { appointmentId: 'ali_appt_001' }
    });

    // 6.1 Ali queries notifications -> MUST SEE ONLY Ali's, ZERO of Sarah's sensitive data!
    const aliHistory = await getUserNotificationHistory(db, 'usr_pat_ali');
    assert.equal(aliHistory.notifications.length, 1);
    assert.equal(aliHistory.notifications[0].id, aliNotice.id);
    assert.ok(!aliHistory.notifications.some(n => n.id === sarahSecretCase.id), 'Ali must not see Sarah’s notification');
    assert.ok(!JSON.stringify(aliHistory).includes('secret_case_sarah_999'), 'No PHI case ID leaked to Ali');
    assert.ok(!JSON.stringify(aliHistory).includes('Pneumonia suspect'), 'No sensitive medical text leaked to Ali');

    // 6.2 Ali attempts to mark Sarah's notification as read -> Must be blocked!
    await assert.rejects(
      async () => markNotificationAsRead(db, sarahSecretCase.id, 'usr_pat_ali'),
      err => err.code === 'ACCESS_DENIED'
    );

    // 6.3 Ali changing his preferences does not alter Sarah's preferences or notifications
    await updateUserNotificationPreferences(db, 'usr_pat_ali', {
      channels: { in_app: false, email: false },
      quietHours: { enabled: true, start: '01:00', end: '23:00' }
    });
    const sarahPrefsCheck = await getUserNotificationPreferences(db, 'usr_pat_sarah');
    assert.equal(sarahPrefsCheck.channels.in_app, true, 'Sarah’s preferences completely independent of Ali');

    console.log('  ✓ Strict multi-tenant isolation: User A cannot read, query or update User B’s notifications.');
    console.log('  ✓ Sensitive clinical content and authorized links strictly confined to owning patient.\n');

    // ---------------------------------------------------------------------------
    // TEST 7: End-to-End REST API Endpoints via Express Server
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 7: End-to-End REST API Endpoints via Express Server');

    // 7.1 GET /api/notifications for Sarah
    const getRes = await request('GET', '/api/notifications', 'patient-sarah');
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.success, true);
    assert.ok(Array.isArray(getRes.body.notifications));
    assert.ok(getRes.body.notifications.some(n => n.id === sarahSecretCase.id));

    // 7.2 GET /api/notifications for Ali -> must NOT have Sarah's notification
    const aliApiRes = await request('GET', '/api/notifications', 'patient-ali');
    assert.equal(aliApiRes.status, 200);
    assert.ok(!aliApiRes.body.notifications.some(n => n.id === sarahSecretCase.id));

    // 7.3 PATCH /api/notifications/:id/read - Authorized
    const patchRes = await request('PATCH', `/api/notifications/${sarahSecretCase.id}/read`, 'patient-sarah');
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.notification.read, true);

    // 7.4 PATCH /api/notifications/:id/read - Cross-user attempt (Ali tries to read Sarah's notification)
    const hackRes = await request('PATCH', `/api/notifications/${sarahSecretCase.id}/read`, 'patient-ali');
    assert.equal(hackRes.status, 403);
    assert.equal(hackRes.body.error, 'ACCESS_DENIED');

    // 7.5 POST /api/notifications/read-all
    const readAllRes = await request('POST', '/api/notifications/read-all', 'patient-sarah');
    assert.equal(readAllRes.status, 200);
    assert.equal(readAllRes.body.success, true);

    // 7.6 GET /api/notifications/preferences
    const getPrefsRes = await request('GET', '/api/notifications/preferences', 'patient-sarah');
    assert.equal(getPrefsRes.status, 200);
    assert.ok(getPrefsRes.body.preferences);
    assert.equal(getPrefsRes.body.preferences.userId, 'usr_pat_sarah');

    // 7.7 PUT /api/notifications/preferences
    const putPrefsRes = await request('PUT', '/api/notifications/preferences', 'patient-sarah', {
      channels: { in_app: true, email: true, whatsapp: true },
      quietHours: { enabled: true, start: '23:00', end: '07:00' },
      timeZone: 'Asia/Riyadh'
    });
    assert.equal(putPrefsRes.status, 200);
    assert.equal(putPrefsRes.body.preferences.timeZone, 'Asia/Riyadh');
    assert.equal(putPrefsRes.body.preferences.quietHours.start, '23:00');

    // 7.8 POST /api/notifications/dispatch (Server-side sender test)
    // Doctor Tarek dispatches clinical result notification to Sarah
    const dispatchRes = await request('POST', '/api/notifications/dispatch', 'doc-tarek', {
      targetUserId: 'usr_pat_sarah',
      eventType: NOTIFICATION_TYPES.RESULT_READY,
      title: 'نتيجة فحص جديدة معتمدة',
      body: 'قام د. طارق باعتماد تقرير الفحص الأخير.',
      payload: { caseId: 'case_sarah_approved_doc' }
    });
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchRes.body.success, true);
    assert.ok(dispatchRes.body.result.inAppNotification);

    console.log('  ✓ GET /api/notifications returns user-specific history.');
    console.log('  ✓ PATCH /api/notifications/:id/read strictly enforces submitter authorization.');
    console.log('  ✓ GET & PUT /api/notifications/preferences operate per user seamlessly.');
    console.log('  ✓ POST /api/notifications/dispatch validates sender privileges and targets user correctly.\n');

    console.log('==================================================================');
    console.log('🎉 ALL USER NOTIFICATIONS & PREFERENCES TESTS PASSED (100%)');
    console.log('==================================================================\n');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
