/**
 * Health Vibe AI - Notification Engine & Scheduler Test Suite
 * 
 * Verifies:
 * 1. Complete templates for:
 *    - result ready
 *    - information requested
 *    - doctor assigned
 *    - escalation
 *    - appointment changes (booked, rescheduled, cancelled, reminder)
 *    - verification (OTP code)
 * 2. Production SMTP requirement: Prevents simulated success when NODE_ENV === 'production' without valid credentials.
 * 3. Provider acceptance verification: Checks info.accepted/info.rejected without claiming delivery merely on send.
 * 4. Delivery recording: Transitions status to 'delivered' only upon verified receipt/webhook.
 * 5. Queue state machine: pending -> processing -> sent/failed, retry backoff, and idempotency deduplication.
 * 6. Appointment reminder scheduling and automatic cancellation on appointment cancellation/rescheduling.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES,
  buildResultReadyEmail,
  buildMoreInfoEmail,
  buildDoctorAssignedEmail,
  buildEscalationEmail,
  buildAppointmentEmail,
  buildVerificationEmail,
  buildNotificationEmailTemplate,
  sendClinicalNotificationEmail,
  enqueueNotification,
  processNotificationQueue,
  recordDeliveryConfirmation,
  scheduleAppointmentReminder,
  cancelAppointmentReminders,
  startReminderScheduler,
  stopReminderScheduler,
  clearSentEmailsLog,
  getSentEmailsLog
} = require('../backend/notification-service');

console.log("\n==================================================================");
console.log("🔔 HEALTH VIBE AI: NOTIFICATION ENGINE & SCHEDULER TEST SUITE");
console.log("==================================================================\n");

// -----------------------------------------------------------------------------
// In-Memory Mock Firestore Database for Unit Testing
// -----------------------------------------------------------------------------
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
              return {
                id,
                exists: true,
                data: () => JSON.parse(JSON.stringify(colMap.get(id)))
              };
            }
          };
        },
        where(field, op, val) {
          let filters = [{ field, op, val }];
          const queryObj = {
            where(f2, op2, val2) {
              filters.push({ field: f2, op: op2, val: val2 });
              return queryObj;
            },
            orderBy() {
              return queryObj;
            },
            limit(num) {
              queryObj._limit = num;
              return queryObj;
            },
            async get() {
              let results = [];
              for (const [docId, docData] of colMap.entries()) {
                let match = true;
                for (const flt of filters) {
                  const actualVal = docData[flt.field];
                  if (flt.op === '==') {
                    if (actualVal !== flt.val) match = false;
                  } else if (flt.op === 'in') {
                    if (!Array.isArray(flt.val) || !flt.val.includes(actualVal)) match = false;
                  } else if (flt.op === '<=') {
                    if (actualVal === undefined || actualVal > flt.val) match = false;
                  } else if (flt.op === '>=') {
                    if (actualVal === undefined || actualVal < flt.val) match = false;
                  }
                }
                if (match) {
                  results.push({
                    id: docId,
                    exists: true,
                    data: () => JSON.parse(JSON.stringify(docData))
                  });
                }
              }
              if (queryObj._limit && results.length > queryObj._limit) {
                results = results.slice(0, queryObj._limit);
              }
              return {
                empty: results.length === 0,
                size: results.length,
                docs: results,
                forEach: (fn) => results.forEach(fn)
              };
            }
          };
          return queryObj;
        },
        async get() {
          const results = [];
          for (const [docId, docData] of colMap.entries()) {
            results.push({
              id: docId,
              exists: true,
              data: () => JSON.parse(JSON.stringify(docData))
            });
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
    async runTransaction(updateFunction) {
      const transaction = {
        async get(docRef) {
          return docRef.get();
        },
        set(docRef, data, options) {
          return docRef.set(data, options);
        },
        update(docRef, data) {
          return docRef.update(data);
        },
        delete(docRef) {
          return docRef.delete();
        }
      };
      return updateFunction(transaction);
    }
  };
}

(async () => {
  try {
    // -------------------------------------------------------------------------
    // TEST 1: All 6 Notification Template Builders
    // -------------------------------------------------------------------------
    console.log("▶ TEST 1: Verification of All 6 Clinical Email Templates");

    // 1. Result Ready
    const tResult = buildResultReadyEmail({
      patientName: "نور الدين",
      caseId: "CASE-9001",
      reportRef: "HV-REP-9001",
      doctorName: "د. هاني عثمان",
      doctorSpecialty: "طب باطني",
      clinicalDiagnosis: "التهاب معوي حاد",
      medications: "مضاد حيوي ومحلول جفاف",
      recommendations: ["شرب سوائل بكميات كافية", "حمية خفيفة لمدة 3 أيام"],
      appUrl: "https://app.healthvibe.ai"
    });
    assert(tResult.subject.includes("HV-REP-9001"), "Result Ready subject must include reportRef");
    assert(tResult.html.includes("نور الدين"), "Result Ready HTML must address patient");
    assert(tResult.html.includes("التهاب معوي حاد"), "Result Ready HTML must include diagnosis");
    console.log("  ✓ 1. Result Ready template verified.");

    // 2. Information Requested
    const tMoreInfo = buildMoreInfoEmail({
      patientName: "سارة كمال",
      caseId: "CASE-9002",
      doctorName: "د. إيمان سامي",
      moreInfoNote: "يرجى تقديم قراءة قياس ضغط الدم الصباحية.",
      appUrl: "https://app.healthvibe.ai"
    });
    assert(tMoreInfo.subject.includes("مطلوب استكمال بيانات"), "Information Requested subject check");
    assert(tMoreInfo.html.includes("قراءة قياس ضغط الدم الصباحية"), "Information Requested note check");
    console.log("  ✓ 2. Information Requested template verified.");

    // 3. Doctor Assigned
    const tDocAssigned = buildDoctorAssignedEmail({
      patientName: "خالد سعيد",
      caseId: "CASE-9003",
      doctorName: "د. ياسمين رضوان",
      doctorSpecialty: "طب الأطفال",
      clinicName: "عيادة النزهة",
      appUrl: "https://app.healthvibe.ai"
    });
    assert(tDocAssigned.subject.includes("تعيين الطبيب"), "Doctor Assigned subject check");
    assert(tDocAssigned.html.includes("د. ياسمين رضوان"), "Doctor Assigned doctor name check");
    assert(tDocAssigned.html.includes("عيادة النزهة"), "Doctor Assigned clinic check");
    console.log("  ✓ 3. Doctor Assigned template verified.");

    // 4. Escalation
    const tEscalation = buildEscalationEmail({
      patientName: "عمر فاروق",
      caseId: "CASE-9004",
      severityLevel: "CRITICAL",
      criticalFindings: "انخفاض حاد في ضغط الدم وتباطؤ دقات القلب",
      escalationReason: "حالة طارئة تتطلب تدخلاً فورياً",
      appUrl: "https://app.healthvibe.ai"
    });
    assert(tEscalation.subject.includes("تصعيد الحالة السريرية"), "Escalation subject check");
    assert(tEscalation.html.includes("انخفاض حاد في ضغط الدم"), "Escalation critical findings check");
    assert(tEscalation.html.includes("CRITICAL"), "Escalation severity check");
    console.log("  ✓ 4. Clinical Escalation template verified.");

    // 5. Appointment Changes (booked, rescheduled, cancelled, reminder)
    const apptBase = {
      patientName: "مريم حسن",
      doctorName: "د. كريم جلال",
      clinicName: "مركز الحياة الطبي",
      slotStart: "2026-10-05T10:00:00.000Z",
      slotEnd: "2026-10-05T10:30:00.000Z",
      timeZone: "Africa/Cairo"
    };

    const tBooked = buildAppointmentEmail({ ...apptBase, changeType: 'booked' });
    assert(tBooked.subject.includes("تأكيد حجز موعدك"), "Appointment booked subject check");
    assert(tBooked.html.includes("تأكيد حجز الموعد الطبي"), "Appointment booked body check");

    const tRescheduled = buildAppointmentEmail({
      ...apptBase,
      changeType: 'rescheduled',
      previousSlotStart: "2026-10-04T09:00:00.000Z"
    });
    assert(tRescheduled.subject.includes("تعديل موعدك الطبي"), "Appointment rescheduled subject check");
    assert(tRescheduled.html.includes("تعديل موعد الاستشارة الطبية"), "Appointment rescheduled body check");

    const tCancelled = buildAppointmentEmail({
      ...apptBase,
      changeType: 'cancelled',
      cancellationReason: "طلب المريض إعادة الجدولة لاحقاً"
    });
    assert(tCancelled.subject.includes("إلغاء موعدك الطبي"), "Appointment cancelled subject check");
    assert(tCancelled.html.includes("طلب المريض إعادة الجدولة لاحقاً"), "Appointment cancelled reason check");

    const tReminder = buildAppointmentEmail({ ...apptBase, changeType: 'reminder' });
    assert(tReminder.subject.includes("تذكير: موعد استشارتك"), "Appointment reminder subject check");
    console.log("  ✓ 5. Appointment Changes templates (booked, rescheduled, cancelled, reminder) verified.");

    // 6. Verification (OTP Code / Email Verification)
    const tVerify = buildVerificationEmail({
      recipientName: "أحمد عبد الله",
      code: "847291",
      purpose: "تأكيد تسجيل الحساب والتحقق الثنائي",
      appUrl: "https://app.healthvibe.ai"
    });
    assert(tVerify.subject.includes("847291"), "Verification subject includes security code");
    assert(tVerify.html.includes("847291"), "Verification HTML displays code prominently");
    assert(tVerify.html.includes("تأكيد تسجيل الحساب والتحقق الثنائي"), "Verification purpose check");
    console.log("  ✓ 6. Account Verification template verified.");

    // Master dispatcher check
    const dispatched = buildNotificationEmailTemplate('verification', { recipientName: "أحمد", code: "123456" });
    assert.strictEqual(dispatched.subject, tVerify.subject.replace('847291', '123456'));
    console.log("  ✓ buildNotificationEmailTemplate dispatcher routing confirmed.");

    // -------------------------------------------------------------------------
    // TEST 2: Production SMTP Requirement & Prevention of Simulated Success
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 2: Production SMTP Enforcement (No Simulated Success in Prod)");

    const prevNodeEnv = process.env.NODE_ENV;
    const prevSmtpHost = process.env.SMTP_HOST;
    const prevSmtpUser = process.env.SMTP_USER;
    const prevSmtpPass = process.env.SMTP_PASS;

    try {
      // Simulate production environment with missing SMTP credentials
      process.env.NODE_ENV = 'production';
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      let threwExpectedError = false;
      try {
        await sendClinicalNotificationEmail({
          type: 'verification',
          patientEmail: 'user@example.com',
          code: '999888'
        });
      } catch (err) {
        threwExpectedError = true;
        assert.strictEqual(err.code || err.message, 'SMTP_CONFIGURATION_REQUIRED');
      }

      assert.strictEqual(
        threwExpectedError,
        true,
        "Production dispatch MUST refuse simulated fallback and throw SMTP_CONFIGURATION_REQUIRED"
      );
      console.log("  ✓ Production mode strictly prevents simulated success when SMTP is unconfigured.");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevSmtpHost) process.env.SMTP_HOST = prevSmtpHost;
      if (prevSmtpUser) process.env.SMTP_USER = prevSmtpUser;
      if (prevSmtpPass) process.env.SMTP_PASS = prevSmtpPass;
    }

    // -------------------------------------------------------------------------
    // TEST 3: Provider Acceptance Verification & Delivery Truthfulness
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 3: Provider Acceptance Verification (Sent != Delivered)");

    const db = createMockFirestore();
    clearSentEmailsLog();

    const dispatchResult = await sendClinicalNotificationEmail({
      type: 'doctor_assigned',
      patientEmail: 'patient.target@example.com',
      patientName: 'عصام كمال',
      doctorName: 'د. سامح',
      db
    });

    assert.strictEqual(dispatchResult.success, true, "Dispatch should be accepted by transport");
    assert.strictEqual(dispatchResult.status, NOTIFICATION_STATUS.SENT, "Initial status MUST be 'sent'");
    assert.strictEqual(dispatchResult.providerAccepted, true, "Provider acceptance must be explicitly true");
    assert.strictEqual(dispatchResult.delivered, false, "Delivered MUST be false on send (not falsely claimed)");
    assert(dispatchResult.messageId, "Message ID must be present");

    // Inspect Firestore doc created in email_notifications
    const notifDocSnap = await db.collection('email_notifications').doc(dispatchResult.notificationId).get();
    assert(notifDocSnap.exists, "Notification record must be saved in Firestore");
    const notifData = notifDocSnap.data();
    assert.strictEqual(notifData.status, 'sent', "Stored status must be 'sent'");
    assert.strictEqual(notifData.delivered, false, "Stored delivered flag must be false");
    console.log("  ✓ Provider acceptance verified: email recorded as 'sent' without false delivery claim.");

    // -------------------------------------------------------------------------
    // TEST 4: Delivery Confirmation Recording via Webhook / Receipt
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 4: Delivery Confirmation Recording");

    const deliveryTimestamp = new Date().toISOString();
    const deliveryResult = await recordDeliveryConfirmation(db, {
      messageId: dispatchResult.messageId,
      notificationId: dispatchResult.notificationId,
      recipient: 'patient.target@example.com',
      deliveredAt: deliveryTimestamp,
      providerMetadata: { smtpCode: 250, dsn: '2.0.0 OK' }
    });

    assert.strictEqual(deliveryResult.success, true, "Delivery confirmation must succeed");
    assert.strictEqual(deliveryResult.status, NOTIFICATION_STATUS.DELIVERED, "Status must now be 'delivered'");

    // Verify stored doc in email_notifications is updated to 'delivered'
    const updatedNotifSnap = await db.collection('email_notifications').doc(dispatchResult.notificationId).get();
    const updatedData = updatedNotifSnap.data();
    assert.strictEqual(updatedData.status, 'delivered', "Status updated to 'delivered'");
    assert.strictEqual(updatedData.delivered, true, "Delivered flag is now true");
    assert.strictEqual(updatedData.deliveredAt, deliveryTimestamp, "Delivered timestamp stamped");
    assert.strictEqual(updatedData.providerMetadata.smtpCode, 250, "Provider metadata preserved");

    // Verify delivery receipt logged in delivery_receipts
    const receiptSnap = await db.collection('delivery_receipts').where('notificationId', '==', dispatchResult.notificationId).get();
    assert.strictEqual(receiptSnap.size, 1, "Delivery receipt must be registered in delivery_receipts");
    console.log("  ✓ Delivery confirmed and recorded in database with proof metadata.");

    // -------------------------------------------------------------------------
    // TEST 5: Durable Notification Queue, States & Idempotency Deduplication
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 5: Queue State Machine & Duplicate Prevention");

    const idempotencyKey = "TEST_IDEMPOTENCY_KEY_001";
    const enqueueResult1 = await enqueueNotification(db, {
      type: 'verification',
      recipient: 'secure.user@example.com',
      payload: { recipientName: 'مستخدم آمن', code: '456789' },
      idempotencyKey
    });

    assert.strictEqual(enqueueResult1.status, NOTIFICATION_STATUS.PENDING, "Initial queue item status is 'pending'");
    assert.strictEqual(enqueueResult1.idempotencyKey, idempotencyKey);
    const queueId = enqueueResult1.queueId;

    // Test duplicate enqueueing with identical idempotencyKey
    const enqueueResult2 = await enqueueNotification(db, {
      type: 'verification',
      recipient: 'secure.user@example.com',
      payload: { recipientName: 'مستخدم آمن', code: '456789' },
      idempotencyKey
    });

    assert.strictEqual(enqueueResult2.duplicatePrevented, true, "Duplicate enqueueing must be prevented");
    assert.strictEqual(enqueueResult2.queueId, queueId, "Returns existing queueId");

    // Verify only 1 record exists in notification_queue
    const queueSnapshot = await db.collection('notification_queue').where('idempotencyKey', '==', idempotencyKey).get();
    assert.strictEqual(queueSnapshot.size, 1, "Exactly one queue entry exists");
    console.log("  ✓ Idempotency deduplication prevented duplicate queue submission.");

    // Process the queue
    const processStats = await processNotificationQueue(db, { batchSize: 5 });
    assert.strictEqual(processStats.processed, 1, "Should have processed 1 queue item");
    assert.strictEqual(processStats.sent, 1, "Should have successfully sent 1 queue item");

    // Verify queue item status transitioned to 'sent'
    const processedDoc = await db.collection('notification_queue').doc(queueId).get();
    assert.strictEqual(processedDoc.data().status, NOTIFICATION_STATUS.SENT, "Queue item transitioned to 'sent'");
    assert(processedDoc.data().messageId, "Queue item has messageId stamped");
    console.log("  ✓ Notification queue processed item from 'pending' to 'sent'.");

    // -------------------------------------------------------------------------
    // TEST 6: Queue Retry Engine with Exponential Backoff
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 6: Queue Failure & Retry Exponential Backoff");

    const retryIdempotency = "RETRY_TEST_KEY_999";
    const failingItem = await enqueueNotification(db, {
      type: 'verification',
      recipient: 'fail.test@example.com',
      payload: { recipientName: 'فشل تجريبي', code: '000000' },
      idempotencyKey: retryIdempotency
    });

    // Simulate failure during dispatch
    process.env.SIMULATE_EMAIL_FAILURE = 'true';
    const retryProcess1 = await processNotificationQueue(db, { batchSize: 5 });
    delete process.env.SIMULATE_EMAIL_FAILURE;

    assert.strictEqual(retryProcess1.retried, 1, "Queue processing should record 1 retry scheduled");

    // Check item state in queue
    const retryDoc1 = await db.collection('notification_queue').doc(failingItem.queueId).get();
    const retryData1 = retryDoc1.data();
    assert.strictEqual(retryData1.status, NOTIFICATION_STATUS.PENDING, "Item remains 'pending' for retry");
    assert.strictEqual(retryData1.retryCount, 1, "retryCount incremented to 1");
    assert(new Date(retryData1.scheduledAt) > new Date(), "Next scheduledAt has exponential backoff");
    console.log("  ✓ Failure correctly updated retryCount and scheduled exponential backoff.");

    // Now test exceeding max retries
    await db.collection('notification_queue').doc(failingItem.queueId).update({
      retryCount: 4,
      maxRetries: 4,
      scheduledAt: new Date(Date.now() - 1000).toISOString()
    });

    process.env.SIMULATE_EMAIL_FAILURE = 'true';
    const retryProcess2 = await processNotificationQueue(db, { batchSize: 5 });
    delete process.env.SIMULATE_EMAIL_FAILURE;

    const deadLetterDoc = await db.collection('notification_queue').doc(failingItem.queueId).get();
    assert.strictEqual(deadLetterDoc.data().status, NOTIFICATION_STATUS.FAILED, "Item permanently marked 'failed' after max retries");
    console.log("  ✓ Item transitioned to 'failed' after exceeding max retries.");

    // -------------------------------------------------------------------------
    // TEST 7: Appointment Reminder Scheduling & Automatic Cancellation
    // -------------------------------------------------------------------------
    console.log("\n▶ TEST 7: Appointment Reminder Scheduler & Cancellation");

    const testApptId = "APPT-REMINDER-TEST-77";
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000); // 36 hours in future
    const appointmentDoc = {
      id: testApptId,
      patientId: 'patient_77',
      patientName: 'زياد طارق',
      patientEmail: 'ziad.patient@example.com',
      doctorId: 'doc_55',
      doctorName: 'د. سامح',
      clinicName: 'مركز الشروق',
      slotStart: tomorrow.toISOString(),
      slotEnd: new Date(tomorrow.getTime() + 30 * 60 * 1000).toISOString(),
      status: 'confirmed'
    };

    // 1. Schedule reminder
    const reminderResult = await scheduleAppointmentReminder(db, appointmentDoc, { hoursBefore: 24 });
    assert.strictEqual(reminderResult.success, true, "Reminder scheduling must succeed");
    assert.strictEqual(reminderResult.status, 'pending', "Reminder is queued as pending");
    assert(reminderResult.scheduledAt, "Scheduled timestamp is defined");

    // 2. Verify reminder is in queue
    const reminderQueueSnap = await db.collection('notification_queue')
      .where('idempotencyKey', '==', `appt_reminder_${testApptId}`)
      .get();
    assert.strictEqual(reminderQueueSnap.size, 1, "Appointment reminder enqueued");

    // 3. Cancel appointment reminders
    const cancelRes = await cancelAppointmentReminders(db, testApptId, 'Appointment cancelled by patient');
    assert.strictEqual(cancelRes.cancelledCount, 1, "Should have cancelled 1 pending reminder");

    // 4. Verify reminder status in queue is 'cancelled'
    const cancelledDoc = await db.collection('notification_queue').doc(reminderResult.queueId).get();
    assert.strictEqual(cancelledDoc.data().status, NOTIFICATION_STATUS.CANCELLED, "Reminder status must be 'cancelled'");
    assert.strictEqual(cancelledDoc.data().cancellationReason, 'Appointment cancelled by patient');
    console.log("  ✓ Appointment reminder scheduled and cleanly cancelled upon appointment cancellation.");

    // 5. Test Scheduler background worker start & stop
    const intervalRef = startReminderScheduler(db, { intervalMs: 60000 });
    assert(intervalRef !== null, "Scheduler interval reference should be active");
    stopReminderScheduler();
    console.log("  ✓ Reminder scheduler background timer start/stop cycle verified.");

    console.log("\n==================================================================");
    console.log("🎉 ALL NOTIFICATION ENGINE & SCHEDULER TESTS PASSED WITH 100% SUCCESS!");
    console.log("==================================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  }
})();
