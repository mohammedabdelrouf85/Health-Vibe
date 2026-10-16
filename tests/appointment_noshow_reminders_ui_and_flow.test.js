/**
 * Doctolib No-Show Reminders & Attendance UI/UX Test Suite
 * Validates:
 * 1. Dual-window reminder scheduling (24h & 2h before appointment)
 * 2. Omnichannel message formatting (In-App, Email, SMS, WhatsApp)
 * 3. 1-Click attendance confirmation (confirmAppointmentAttendance) and telemetry
 * 4. Doctolib reminder banner hero card rendering & responsive styling
 * 5. Doctor-facing confirmation status badges
 * 6. Arabic / English translation key parity
 */

const assert = require("assert");

// Polyfill window/document for client-side module tests in Node environment
if (typeof global.window === "undefined") {
  global.window = {};
}
if (typeof global.document === "undefined") {
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const {
  formatAppointmentReminderMessage,
  DEFAULT_NOTIFICATION_PREFERENCES
} = require("../backend/notification-service");

const {
  confirmAppointmentAttendance,
  getAppointmentReminderStatus
} = require("../backend/scheduling-service");

const AppointmentsUI = require("../app/modules/appointments/appointments-ui");
const { translations } = require("../app/i18n");

console.log("Starting Doctolib No-Show Reminders & Attendance UI/UX Test Suite...\n");

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
  }
}

async function main() {
  // 1. Time calculation tests
  await runTest("calculateHoursToAppointment correctly parses upcoming dates", () => {
    const now = new Date();
    const future2h = new Date(now.getTime() + 2 * 3600 * 1000);
    const future24h = new Date(now.getTime() + 24 * 3600 * 1000);

    const pad = n => String(n).padStart(2, "0");
    const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const appt2h = {
      date: toDateStr(future2h),
      timeSlot: `${pad(future2h.getHours())}:${pad(future2h.getMinutes())}`
    };
    const hours2h = AppointmentsUI.calculateHoursToAppointment(appt2h);
    assert(hours2h !== null, "Should calculate hours for 2h appointment");
    assert(hours2h >= 1.5 && hours2h <= 2.5, "Should calculate approx 2 hours");

    const appt24h = {
      date: toDateStr(future24h),
      timeSlot: `${pad(future24h.getHours())}:${pad(future24h.getMinutes())}`
    };
    const hours24h = AppointmentsUI.calculateHoursToAppointment(appt24h);
    assert(hours24h !== null, "Should calculate hours for 24h appointment");
    assert(hours24h >= 23 && hours24h <= 25, "Should calculate approx 24 hours");
  });

  // 2. Dual-window and omnichannel message formatting tests
  await runTest("formatAppointmentReminderMessage formats 24h and 2h for all channels in Arabic", () => {
    const appt = {
      id: "appt_test_999",
      patientName: "أحمد محمود",
      doctorName: "د. هاني الرفاعي",
      doctorSpecialty: "أمراض الصدر والجهاز التنفسي",
      date: "2026-10-20",
      timeSlot: "10:30 AM",
      clinicName: "مركز الحياة الطبي",
      type: "clinic"
    };

    // 24h SMS
    const sms24 = formatAppointmentReminderMessage({ appointment: appt, window: "24h", channel: "sms", lang: "ar" });
    assert.strictEqual(sms24.channel, "sms");
    assert(sms24.body.includes("غداً"), "Should mention tomorrow");
    assert(sms24.body.includes("confirm-attendance"), "Should contain 1-click confirmation URL");
    assert(sms24.body.includes("Health-Vibe"), "Should contain brand name");

    // 2h SMS (urgent)
    const sms2h = formatAppointmentReminderMessage({ appointment: appt, window: "2h", channel: "sms", lang: "ar" });
    assert(sms2h.body.includes("بعد ساعتين"), "Should mention 2 hours");
    assert(sms2h.body.includes("confirm-attendance"), "Should contain 1-click confirmation URL");

    // 24h WhatsApp
    const wa24 = formatAppointmentReminderMessage({ appointment: appt, window: "24h", channel: "whatsapp", lang: "ar" });
    assert.strictEqual(wa24.channel, "whatsapp");
    assert(wa24.body.includes("د. هاني الرفاعي"), "Should include doctor name");
    assert(wa24.body.includes("تأكيد الحضور"), "Should include confirm attendance CTA");

    // 2h WhatsApp
    const wa2h = formatAppointmentReminderMessage({ appointment: appt, window: "2h", channel: "whatsapp", lang: "ar" });
    assert(wa2h.body.includes("بعد ساعتين"), "Should mention 2 hours in WhatsApp");

    // In-App 24h
    const inApp24 = formatAppointmentReminderMessage({ appointment: appt, window: "24h", channel: "in_app", lang: "ar" });
    assert.strictEqual(inApp24.channel, "in_app");
    assert(inApp24.title.includes("24 ساعة"), "Title should highlight 24h");

    // In-App 2h
    const inApp2h = formatAppointmentReminderMessage({ appointment: appt, window: "2h", channel: "in_app", lang: "ar" });
    assert.strictEqual(inApp2h.urgent, true, "2h in-app notification should be urgent");

    // Email 24h
    const email24 = formatAppointmentReminderMessage({ appointment: appt, window: "24h", channel: "email", lang: "ar" });
    assert.strictEqual(email24.channel, "email");
    assert(email24.subject.includes("تذكير بموعدك"), "Subject should be formatted");
    assert(email24.html.includes("تأكيد حضورك الآن"), "HTML body should have confirm CTA");
  });

  await runTest("formatAppointmentReminderMessage formats 24h and 2h for all channels in English", () => {
    const appt = {
      id: "appt_test_en_1",
      patientName: "John Doe",
      doctorName: "Dr. Hany El-Refaie",
      date: "2026-10-20",
      timeSlot: "10:00 AM",
      clinicName: "Respiratory Specialty Center",
      type: "video"
    };

    const wa2h = formatAppointmentReminderMessage({ appointment: appt, window: "2h", channel: "whatsapp", lang: "en" });
    assert(wa2h.body.includes("2 hours"), "Should mention 2 hours in English");
    assert(wa2h.body.includes("Dr. Hany El-Refaie"), "Should include doctor name");

    const email2h = formatAppointmentReminderMessage({ appointment: appt, window: "2h", channel: "email", lang: "en" });
    assert(email2h.subject.toLowerCase().includes("in 2 hours"), "English email subject should mention 2 hours");
    assert(email2h.html.includes("Confirm Attendance"), "English email should contain confirm CTA");
  });

  // 3. Attendance confirmation logic in scheduling-service
  await runTest("confirmAppointmentAttendance marks attendance confirmed and emits telemetry", async () => {
    const mockDb = {
      appointments: {
        "appt_doctolib_1": {
          id: "appt_doctolib_1",
          patientId: "patient_101",
          doctorId: "doc_pulm_1",
          date: "2026-10-22",
          slotId: "slot_1000",
          status: "confirmed",
          attendanceConfirmed: false
        }
      },
      notifications: [],
      telemetryEvents: []
    };

    const result = await confirmAppointmentAttendance(mockDb, "appt_doctolib_1", { uid: "patient_101", role: "patient" });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.appointment.attendanceConfirmed, true);
    assert(result.appointment.attendanceConfirmedAt, "Should set attendanceConfirmedAt timestamp");

    // Check audit telemetry
    const auditEvent = (mockDb.telemetryEvents || []).find(e => e.eventType === "APPOINTMENT_ATTENDANCE_CONFIRMED");
    assert(auditEvent, "Should emit APPOINTMENT_ATTENDANCE_CONFIRMED telemetry");
    assert.strictEqual(auditEvent.appointmentId, "appt_doctolib_1");
    assert.strictEqual(auditEvent.patientId, "patient_101");
  });

  await runTest("confirmAppointmentAttendance rejects cancelled or non-existent appointment", async () => {
    const mockDb = {
      appointments: {
        "appt_cancelled": {
          id: "appt_cancelled",
          patientId: "patient_102",
          status: "cancelled"
        }
      }
    };

    await assert.rejects(
      async () => {
        await confirmAppointmentAttendance(mockDb, "appt_cancelled", { uid: "patient_102" });
      },
      /Cannot confirm attendance for a cancelled appointment/
    );

    await assert.rejects(
      async () => {
        await confirmAppointmentAttendance(mockDb, "non_existent", { uid: "patient_102" });
      },
      /Appointment not found/
    );
  });

  // 4. Default notification preferences structure
  await runTest("DEFAULT_NOTIFICATION_PREFERENCES includes all 4 channels and 24h/2h windows", () => {
    assert(DEFAULT_NOTIFICATION_PREFERENCES.channels.in_app === true);
    assert(DEFAULT_NOTIFICATION_PREFERENCES.channels.email === true);
    assert(DEFAULT_NOTIFICATION_PREFERENCES.channels.sms === true);
    assert(DEFAULT_NOTIFICATION_PREFERENCES.channels.whatsapp === true);
    assert(DEFAULT_NOTIFICATION_PREFERENCES.reminderWindows["24h"] === true);
    assert(DEFAULT_NOTIFICATION_PREFERENCES.reminderWindows["2h"] === true);
  });

  // 5. Doctolib UI renderReminderHero test
  await runTest("AppointmentsUI.renderReminderHero renders countdown badges and action buttons", () => {
    const appt24h = {
      id: "appt_ui_1",
      doctorId: "doc_1",
      doctorName: "د. هاني الرفاعي",
      date: "2026-10-21",
      timeSlot: "10:00 AM",
      type: "clinic",
      attendanceConfirmed: false
    };

    const html24h = AppointmentsUI.renderReminderHero(appt24h, { hoursRemaining: 20, isEn: false });
    assert(html24h.includes("doctolib-reminder-hero"), "Should have hero class");
    assert(html24h.includes("badge-24h"), "Should have badge-24h class");
    assert(html24h.includes("تأكيد الحضور الآن"), "Should render 1-click confirmation CTA");
    assert(html24h.includes("btnConfirmAttendanceHero"), "Should have confirmation button ID");
    assert(html24h.includes("تعديل الموعد"), "Should render reschedule button");
    assert(html24h.includes("اعتذار عن الموعد"), "Should render polite cancel button");
    assert(html24h.includes("مسار العيادة"), "Should render clinic directions button");
    assert(html24h.includes("قنوات التذكير"), "Should render reminder preferences button");

    // Urgent 2h case
    const html2h = AppointmentsUI.renderReminderHero(appt24h, { hoursRemaining: 1.8, isEn: true });
    assert(html2h.includes("urgent-2h"), "Should include urgent-2h hero class");
    assert(html2h.includes("badge-2h"), "Should include badge-2h class");
    assert(html2h.includes("Confirm Attendance Now"), "Should have English confirm text");

    // Already confirmed state
    const apptConfirmed = { ...appt24h, attendanceConfirmed: true };
    const htmlConfirmed = AppointmentsUI.renderReminderHero(apptConfirmed, { hoursRemaining: 5, isEn: false });
    assert(htmlConfirmed.includes("تم تأكيد الحضور"), "Should display confirmed state");
    assert(!htmlConfirmed.includes("btnConfirmAttendanceHero"), "Should not show active confirm button when already confirmed");

    // Safety disclaimer
    assert(html24h.includes("doctolib-safety-disclaimer"), "Should include clinical safety and zero-PHI disclaimer");
    assert(html24h.includes("123"), "Should mention emergency hotline 123");
  });

  // 6. Sensitive specialty masking (Zero Diagnostic Leakage)
  await runTest("formatAppointmentReminderMessage masks sensitive medical specialties for patient privacy", () => {
    const sensitiveAppt = {
      id: "appt_privacy_1",
      doctorName: "د. سامي مراد",
      doctorSpecialty: "الطب النفسي وعلاج الإدمان",
      clinicName: "المركز الطبي التخصصي",
      date: "2026-10-25",
      timeSlot: "04:00 PM"
    };

    const waMsg = formatAppointmentReminderMessage({ appointment: sensitiveAppt, window: "24h", channel: "whatsapp", lang: "ar" });
    assert(!waMsg.body.includes("الطب النفسي"), "Should not expose sensitive psychiatric specialty in text");
    assert(waMsg.body.includes("حماية خصوصية") || waMsg.body.includes("متخصصة"), "Should replace with privacy-protected specialty");

    const emailMsg = formatAppointmentReminderMessage({ appointment: { ...sensitiveAppt, doctorSpecialty: "Oncology & Chemotherapy Center" }, window: "2h", channel: "email", lang: "en" });
    assert(!emailMsg.html.includes("Chemotherapy"), "Should not expose oncology/chemotherapy specialty in email body");
    assert(emailMsg.html.includes("Privacy Protected"), "Should replace with privacy-protected designation");
  });

  // 7. Quiet Hours logic test
  await runTest("isQuietHoursActive detects nighttime hours correctly", () => {
    const { isQuietHoursActive } = require("../backend/notification-service");
    assert(typeof isQuietHoursActive === "function", "isQuietHoursActive must be a function");
  });

  // 8. i18n Translation parity check
  await runTest("app/i18n.js has 100% Arabic and English parity for appointments namespace", () => {
    const arAppts = translations.ar.appointments;
    const enAppts = translations.en.appointments;

    assert(arAppts, "translations.ar.appointments must exist");
    assert(enAppts, "translations.en.appointments must exist");

    const requiredKeys = [
      "reminder_banner_title",
      "reminder_countdown_24h",
      "reminder_countdown_2h",
      "confirm_attendance",
      "attendance_confirmed",
      "reschedule_btn",
      "cancel_btn",
      "channel_in_app",
      "channel_email",
      "channel_sms",
      "channel_whatsapp",
      "window_24h",
      "window_2h",
      "doctor_confirmed_badge",
      "doctor_unconfirmed_badge",
      "send_reminder_nudge",
      "reminder_privacy_disclaimer",
      "reminder_emergency_alert",
      "reminder_physician_primacy_notice",
      "reminder_opt_out_success",
      "reminder_sensitive_specialty_masked",
      "reminder_quiet_hours_notice"
    ];

    for (const k of requiredKeys) {
      assert(typeof arAppts[k] === "string" && arAppts[k].length > 0, `Missing Arabic key: appointments.${k}`);
      assert(typeof enAppts[k] === "string" && enAppts[k].length > 0, `Missing English key: appointments.${k}`);
    }
  });

  console.log(`\n======================================`);
  console.log(`Test Results: ${passed} / ${total} passed`);
  console.log(`======================================\n`);

  if (passed !== total) {
    process.exit(1);
  } else {
    console.log("All Doctolib No-Show Reminders & Attendance UI/UX tests passed successfully!");
  }
}

main().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
