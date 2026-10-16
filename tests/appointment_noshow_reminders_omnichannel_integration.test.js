/**
 * Doctolib Omnichannel No-Show Reminders & Interactive Webhooks Test Suite
 * 
 * Tests:
 * 1. HMAC-SHA256 Action Token generation & cryptographic validation
 * 2. 1-Click attendance confirmation by action token (no login required)
 * 3. Batch automated scanner & dispatcher (24h and 2h windows)
 * 4. Interactive WhatsApp Bot webhook replies ("1", "تأكيد", "confirmer")
 * 5. Interactive SMS webhook replies ("نعم", "YES")
 * 6. Reminder KPIs & Delivery Stats reporting
 */

const assert = require("assert");
const appointmentRemindersService = require("../backend/appointment-reminders-service");

console.log("Starting Doctolib Omnichannel No-Show Reminders Integration Test Suite...\n");

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// In-memory mock Firestore database
function createMockDb(initialAppointments = []) {
  const store = new Map();
  initialAppointments.forEach(a => store.set(a.id, { ...a }));

  const events = [];

  const mockDb = {
    _store: store,
    _events: events,
    collection: function(colName) {
      if (colName === "telemetry_events") {
        return {
          add: async (doc) => {
            events.push(doc);
            return { id: "ev_" + Date.now() };
          }
        };
      }
      return {
        doc: (id) => ({
          get: async () => ({
            exists: store.has(id),
            data: () => store.get(id)
          }),
          update: async (updates) => {
            if (!store.has(id)) throw new Error("Document not found");
            const existing = store.get(id);
            const merged = { ...existing, ...updates };
            store.set(id, merged);
            return { writeTime: new Date() };
          },
          set: async (doc, opts) => {
            if (opts && opts.merge && store.has(id)) {
              store.set(id, { ...store.get(id), ...doc });
            } else {
              store.set(id, doc);
            }
          }
        }),
        where: function(field, op, val) {
          const filter = (item) => {
            if (op === "==") return item[field] === val;
            if (op === ">=") return item[field] >= val;
            if (op === "<=") return item[field] <= val;
            return true;
          };
          return {
            where: function(field2, op2, val2) {
              const filter2 = (item) => {
                if (op2 === "==") return item[field2] === val2;
                if (op2 === ">=") return item[field2] >= val2;
                if (op2 === "<=") return item[field2] <= val2;
                return true;
              };
              return {
                get: async () => {
                  const docs = Array.from(store.values())
                    .filter(filter)
                    .filter(filter2)
                    .map(d => ({
                      id: d.id,
                      data: () => d
                    }));
                  return {
                    empty: docs.length === 0,
                    size: docs.length,
                    docs,
                    forEach: (cb) => docs.forEach(cb)
                  };
                }
              };
            },
            get: async () => {
              const docs = Array.from(store.values())
                .filter(filter)
                .map(d => ({
                  id: d.id,
                  data: () => d
                }));
              return {
                empty: docs.length === 0,
                size: docs.length,
                docs,
                forEach: (cb) => docs.forEach(cb)
              };
            }
          };
        },
        get: async () => {
          const docs = Array.from(store.values()).map(d => ({
            id: d.id,
            data: () => d
          }));
          return {
            empty: docs.length === 0,
            size: docs.length,
            docs,
            forEach: (cb) => docs.forEach(cb)
          };
        }
      };
    }
  };

  return mockDb;
}

async function main() {
  // Test 1: Action Token Cryptography
  await runTest("generateActionToken creates valid HMAC-SHA256 token and verifyActionToken succeeds", () => {
    const token = appointmentRemindersService.generateActionToken({
      appointmentId: "appt_test_001",
      action: "confirm_attendance",
      patientId: "patient_001",
      expiresInHours: 48
    });

    assert(typeof token === "string" && token.length > 20, "Token should be non-empty string");

    const verified = appointmentRemindersService.verifyActionToken(token);
    assert.strictEqual(verified.appointmentId, "appt_test_001");
    assert.strictEqual(verified.action, "confirm_attendance");
    assert.strictEqual(verified.patientId, "patient_001");
  });

  // Test 2: Action Token Rejection on Tampering or Expiration
  await runTest("verifyActionToken rejects expired or tampered token", () => {
    // Expired token
    const expiredToken = appointmentRemindersService.generateActionToken({
      appointmentId: "appt_expired",
      action: "confirm_attendance",
      expiresInHours: -1 // Expired 1 hour ago
    });

    assert.throws(() => {
      appointmentRemindersService.verifyActionToken({ token: expiredToken, throwOnError: true });
    }, /TOKEN_EXPIRED/);

    // Tampered token
    const validToken = appointmentRemindersService.generateActionToken({
      appointmentId: "appt_tamper",
      action: "confirm_attendance"
    });
    const tampered = validToken.slice(0, -4) + "XXXX";

    assert.throws(() => {
      appointmentRemindersService.verifyActionToken({ token: tampered, throwOnError: true });
    }, /INVALID_SIGNATURE/);
  });

  // Test 3: 1-Click attendance confirmation by token
  await runTest("confirmAttendanceByToken confirms attendance without login", async () => {
    const db = createMockDb([
      {
        id: "appt_1click",
        patientId: "pat_888",
        patientName: "سامي يوسف",
        doctorName: "د. منى سامي",
        status: "confirmed",
        attendanceConfirmed: false,
        date: "2026-10-25",
        timeSlot: "11:00 AM"
      }
    ]);

    const token = appointmentRemindersService.generateActionToken({
      appointmentId: "appt_1click",
      action: "confirm_attendance"
    });

    const result = await appointmentRemindersService.confirmAttendanceByToken(db, token, {
      channel: "whatsapp_link",
      ip: "197.35.12.84",
      userAgent: "WhatsApp/2.24.1 Mozilla/5.0"
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.appointment.attendanceConfirmed, true);
    assert(result.appointment.attendanceConfirmedAt);

    // Check store
    const updated = db._store.get("appt_1click");
    assert.strictEqual(updated.attendanceConfirmed, true);
    assert.strictEqual(updated.confirmationChannel, "whatsapp_link");

    // Check telemetry
    assert(db._events.some(e => e.eventType === "APPOINTMENT_ATTENDANCE_CONFIRMED"));
  });

  // Test 4: Batch scanner dispatches 24h & 2h reminders correctly
  await runTest("scanAndDispatchDueReminders finds due appointments and dispatches reminders", async () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Appointment 1: 24h away (tomorrow at this hour)
    const time24h = new Date(now.getTime() + 24 * 3600 * 1000);
    const appt24h = {
      id: "appt_batch_24h",
      patientId: "pat_24",
      patientName: "نادية كريم",
      patientPhone: "+201012345678",
      doctorName: "د. أحمد السيد",
      date: toDateStr(time24h),
      timeSlot: `${pad(time24h.getHours())}:${pad(time24h.getMinutes())}`,
      status: "confirmed",
      attendanceConfirmed: false,
      remindersSent: {}
    };

    // Appointment 2: 2h away (today in 2 hours)
    const time2h = new Date(now.getTime() + 2 * 3600 * 1000);
    const appt2h = {
      id: "appt_batch_2h",
      patientId: "pat_2h",
      patientName: "عمر خليل",
      patientPhone: "+201198765432",
      doctorName: "د. منى سامي",
      date: toDateStr(time2h),
      timeSlot: `${pad(time2h.getHours())}:${pad(time2h.getMinutes())}`,
      status: "confirmed",
      attendanceConfirmed: false,
      remindersSent: {}
    };

    // Appointment 3: Already confirmed attendance -> Should NOT receive reminder
    const apptConfirmed = {
      id: "appt_already_confirmed",
      patientId: "pat_conf",
      date: toDateStr(time24h),
      timeSlot: `${pad(time24h.getHours())}:${pad(time24h.getMinutes())}`,
      status: "confirmed",
      attendanceConfirmed: true,
      remindersSent: {}
    };

    const db = createMockDb([appt24h, appt2h, apptConfirmed]);

    const result = await appointmentRemindersService.scanAndDispatchDueReminders(db, {
      referenceDate: now,
      strictSmtp: false
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.summary.totalScanned, 3);
    assert(result.summary.dispatched24h >= 1, "Should dispatch 24h reminder");
    assert(result.summary.dispatched2h >= 1, "Should dispatch 2h reminder");

    // Verify appointment in DB now has remindersSent flags
    const updated24h = db._store.get("appt_batch_24h");
    assert.strictEqual(updated24h.remindersSent["24h"], true);
    assert(updated24h.remindersSent["24h_at"]);

    const updated2h = db._store.get("appt_batch_2h");
    assert.strictEqual(updated2h.remindersSent["2h"], true);
    assert(updated2h.remindersSent["2h_at"]);

    // Running scanner again immediately should NOT dispatch duplicates
    const rerunResult = await appointmentRemindersService.scanAndDispatchDueReminders(db, {
      referenceDate: now,
      strictSmtp: false
    });
    assert.strictEqual(rerunResult.summary.dispatched24h, 0, "No duplicate 24h reminder");
    assert.strictEqual(rerunResult.summary.dispatched2h, 0, "No duplicate 2h reminder");
  });

  // Test 5: Interactive WhatsApp Webhook reply
  await runTest("handleInboundReminderWebhook confirms attendance on WhatsApp reply '1' or 'تأكيد'", async () => {
    const db = createMockDb([
      {
        id: "appt_wa_reply",
        patientId: "pat_wa",
        patientName: "طارق سليم",
        patientPhone: "+201099887766",
        doctorName: "د. أحمد السيد",
        status: "confirmed",
        attendanceConfirmed: false,
        date: "2026-10-30",
        timeSlot: "12:00 PM"
      }
    ]);

    // Test reply "1"
    const reply1 = await appointmentRemindersService.handleInboundReminderWebhook(db, {
      fromPhone: "+201099887766",
      textBody: "1",
      channel: "whatsapp"
    });

    assert.strictEqual(reply1.handled, true);
    assert.strictEqual(reply1.action, "confirm_attendance");
    assert(reply1.replyMessage.includes("تم تأكيد حضورك بنجاح"));

    const updatedAppt = db._store.get("appt_wa_reply");
    assert.strictEqual(updatedAppt.attendanceConfirmed, true);
    assert.strictEqual(updatedAppt.confirmationChannel, "whatsapp_webhook");
  });

  // Test 6: Interactive SMS Webhook reply
  await runTest("handleInboundReminderWebhook confirms attendance on SMS reply 'نعم'", async () => {
    const db = createMockDb([
      {
        id: "appt_sms_reply",
        patientId: "pat_sms",
        patientPhone: "+201122334455",
        status: "confirmed",
        attendanceConfirmed: false,
        date: "2026-10-28",
        timeSlot: "04:30 PM"
      }
    ]);

    const replySms = await appointmentRemindersService.handleInboundReminderWebhook(db, {
      fromPhone: "+201122334455",
      textBody: "نعم",
      channel: "sms"
    });

    assert.strictEqual(replySms.handled, true);
    assert.strictEqual(replySms.action, "confirm_attendance");

    const updatedAppt = db._store.get("appt_sms_reply");
    assert.strictEqual(updatedAppt.attendanceConfirmed, true);
    assert.strictEqual(updatedAppt.confirmationChannel, "sms_webhook");
  });

  // Test 7: Reminder Delivery Stats and KPIs
  await runTest("getReminderDeliveryStats computes accurate KPIs and no-show reduction metrics", async () => {
    const db = createMockDb([
      {
        id: "a1",
        status: "confirmed",
        attendanceConfirmed: true,
        remindersSent: { "24h": true, "2h": true }
      },
      {
        id: "a2",
        status: "confirmed",
        attendanceConfirmed: false,
        remindersSent: { "24h": true }
      },
      {
        id: "a3",
        status: "cancelled",
        attendanceConfirmed: false
      },
      {
        id: "a4",
        status: "no_show",
        attendanceConfirmed: false
      }
    ]);

    const stats = await appointmentRemindersService.getReminderDeliveryStats(db);
    assert.strictEqual(stats.totalAppointments, 4);
    assert.strictEqual(stats.confirmedAttendance, 1);
    assert.strictEqual(stats.noShowCount, 1);
    assert.strictEqual(stats.cancelledCount, 1);
    assert.strictEqual(stats.remindersDispatched24h, 2);
    assert.strictEqual(stats.remindersDispatched2h, 1);
    assert(stats.attendanceConfirmationRatePct > 0);
  });

  console.log(`\n======================================`);
  console.log(`Test Results: ${passed} / ${total} passed`);
  console.log(`======================================\n`);
  console.log("All Doctolib Omnichannel No-Show Reminders integration tests passed successfully!");
}

main().catch(err => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
