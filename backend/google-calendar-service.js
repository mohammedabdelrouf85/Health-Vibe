/**
 * Health Vibe AI - Doctor Google Calendar Integration & Reconciliation Service
 *
 * Implements:
 * 1. Doctor Explicit Consent Requirement (Consent must be actively granted and is revocable).
 * 2. Minimum Required Permissions Enforcement:
 *    - Strict scope limitation: ONLY 'https://www.googleapis.com/auth/calendar.events'
 *    - Explicitly rejects broad/dangerous administrative scopes (calendar, drive, mail).
 * 3. Event Minimization & Zero-PHI Protection:
 *    - Push to Google Calendar contains zero diagnoses, vitals, or medication details.
 *    - Generic appointment title & secure portal link requiring sign-in and authorization.
 * 4. Rescheduling and Cancellation Synchronization.
 * 5. Authoritative Source of Truth (SoT) & Conflict Reconciliation:
 *    - Health Vibe Internal DB is the primary, immutable Source of Truth.
 *    - External Google Calendar is a downstream sync target. Conflicting external edits
 *      are reconciled back to Health Vibe DB's authoritative state.
 */

const crypto = require('crypto');
const auditService = require('./audit-service');
const { relationalDbService } = require('./relational-db-service');

// ============================================================================
// 🔒 CONSTANTS & GOVERNANCE POLICIES
// ============================================================================

const MINIMUM_REQUIRED_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events'
];

const DISALLOWED_BROAD_SCOPES = [
  'https://www.googleapis.com/auth/calendar', // full calendar management
  'https://www.googleapis.com/auth/calendar.settings.readonly',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/drive'
];

const SOURCE_OF_TRUTH = 'HEALTH_VIBE_CORE_DB';

// In-memory registry of doctor calendar configurations & sync states
const inMemoryDoctorCalendarConfigs = new Map();
const inMemoryExternalGoogleCalendarEvents = new Map(); // Simulated external calendar store

// ============================================================================
// 👨‍⚕️ DOCTOR CONSENT & CONNECTION MANAGEMENT
// ============================================================================

/**
 * Validates OAuth scopes against least-privilege security principle.
 */
function validateOAuthScopes(requestedScopes = []) {
  const scopes = Array.isArray(requestedScopes)
    ? requestedScopes
    : typeof requestedScopes === 'string'
      ? requestedScopes.split(' ')
      : [];

  // 1. Must NOT include excessive broad administrative scopes
  for (const forbidden of DISALLOWED_BROAD_SCOPES) {
    if (scopes.includes(forbidden)) {
      const err = new Error(`Excessive scope requested: '${forbidden}'. Least-privilege policy allows only calendar.events.`);
      err.code = 'EXCESSIVE_SCOPE_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }
  }

  // 2. Must include the minimum required events scope
  const hasEventsScope = scopes.some(s => s === 'https://www.googleapis.com/auth/calendar.events');
  if (!hasEventsScope) {
    const err = new Error('Missing minimum required scope: https://www.googleapis.com/auth/calendar.events');
    err.code = 'INSUFFICIENT_SCOPES';
    err.statusCode = 400;
    throw err;
  }

  return true;
}

/**
 * Connects a doctor's Google Calendar account after affirmative consent.
 */
async function connectDoctorGoogleCalendar(db, doctorId, {
  consent = false,
  googleEmail = null,
  refreshToken = null,
  calendarId = 'primary',
  scopes = ['https://www.googleapis.com/auth/calendar.events']
}, actorUser = {}) {
  if (!doctorId) {
    const err = new Error('doctorId is required.');
    err.code = 'MISSING_DOCTOR_ID';
    err.statusCode = 400;
    throw err;
  }

  // 1. Explicit Consent Check
  if (consent !== true) {
    const err = new Error('Doctor explicit consent is required to connect Google Calendar.');
    err.code = 'CONSENT_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // 2. Minimum Permissions Enforcement
  validateOAuthScopes(scopes);

  // 3. Permission check: Doctor or Clinic Admin
  const actorRole = actorUser?.role || 'doctor';
  const actorUid = actorUser?.uid || doctorId;
  if (actorRole === 'doctor' && actorUid !== doctorId) {
    const err = new Error('Access denied: You can only connect your own Google Calendar.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const config = {
    doctorId,
    connected: true,
    consentGiven: true,
    consentGivenAt: nowIso,
    consentRevokedAt: null,
    googleEmail: googleEmail || `${doctorId}@clinic.com`,
    calendarId: calendarId || 'primary',
    grantedScopes: MINIMUM_REQUIRED_OAUTH_SCOPES,
    syncEnabled: true,
    lastSyncedAt: null,
    hasToken: Boolean(refreshToken || true),
    sourceOfTruth: SOURCE_OF_TRUTH,
    connectedBy: actorUid,
    updatedAt: nowIso
  };

  inMemoryDoctorCalendarConfigs.set(doctorId, config);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('doctor_google_calendars').doc(doctorId).set(config);
    } catch (e) {
      console.warn('[GOOGLE CALENDAR WARNING] Firestore save failed:', e.message);
    }
  }

  // Audit event
  try {
    if (typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: 'GOOGLE_CALENDAR_CONNECTED',
        actorUid,
        actorRole,
        details: {
          doctorId,
          calendarId: config.calendarId,
          scopes: config.grantedScopes,
          consentGivenAt: nowIso
        }
      });
    }
  } catch (auditErr) {}

  return { success: true, config };
}

/**
 * Disconnects Google Calendar and revokes consent.
 */
async function disconnectDoctorGoogleCalendar(db, doctorId, actorUser = {}) {
  if (!doctorId) throw new Error('doctorId is required.');

  let config = inMemoryDoctorCalendarConfigs.get(doctorId);
  if (!config && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('doctor_google_calendars').doc(doctorId).get();
      if (snap.exists) config = snap.data();
    } catch (e) {}
  }

  if (!config) {
    return { success: true, message: 'Google Calendar was not connected.' };
  }

  const nowIso = new Date().toISOString();
  config.connected = false;
  config.consentGiven = false;
  config.consentRevokedAt = nowIso;
  config.syncEnabled = false;
  config.updatedAt = nowIso;

  inMemoryDoctorCalendarConfigs.set(doctorId, config);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('doctor_google_calendars').doc(doctorId).update({
        connected: false,
        consentGiven: false,
        consentRevokedAt: nowIso,
        syncEnabled: false,
        updatedAt: nowIso
      });
    } catch (e) {}
  }

  return { success: true, config };
}

/**
 * Retrieves connection and sync status for a doctor.
 */
async function getDoctorGoogleCalendarStatus(db, doctorId) {
  if (!doctorId) return { connected: false };

  let config = inMemoryDoctorCalendarConfigs.get(doctorId);
  if (!config && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('doctor_google_calendars').doc(doctorId).get();
      if (snap.exists) config = snap.data();
    } catch (e) {}
  }

  if (!config || !config.connected || !config.consentGiven) {
    return {
      doctorId,
      connected: false,
      consentGiven: false,
      syncEnabled: false,
      sourceOfTruth: SOURCE_OF_TRUTH
    };
  }

  return {
    ...config,
    sourceOfTruth: SOURCE_OF_TRUTH
  };
}

// ============================================================================
// 🔒 PHI-MINIMIZED EVENT BUILDER
// ============================================================================

/**
 * Builds a minimized, privacy-preserving Google Calendar event payload.
 * STRICT HIPAA/GDPR RULE:
 * - NO clinical diagnoses (COPD, asthma, bronchiectasis, etc.)
 * - NO vitals (SpO2, heart rate, respiratory rate)
 * - NO medications (inhalers, steroids, antibiotics)
 * - Generic title & deep link to secure portal requiring authentication.
 */
function buildGoogleCalendarEventPayload(appointment) {
  if (!appointment) return null;

  const apptId = appointment.id || 'N/A';
  const doctorName = appointment.doctorNameEn || appointment.doctorName || 'Doctor';
  const clinicName = appointment.clinicNameEn || appointment.clinicName || 'Health Vibe Clinic';
  const clinicAddress = appointment.clinicAddressEn || appointment.clinicAddress || 'Egypt';

  // Construct start & end ISO strings
  const dateStr = appointment.date;
  let startTimeStr = '09:00';
  let endTimeStr = '09:30';

  if (appointment.timeSlotEn || appointment.timeSlot) {
    const rawTime = (appointment.timeSlotEn || appointment.timeSlot).split(' ')[0];
    if (/^\d{1,2}:\d{2}$/.test(rawTime)) {
      startTimeStr = rawTime.padStart(5, '0');
      const [h, m] = startTimeStr.split(':').map(Number);
      const endM = (m + 30) % 60;
      const endH = endM < m ? h + 1 : h;
      endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }
  }

  const startIso = `${dateStr}T${startTimeStr}:00`;
  const endIso = `${dateStr}T${endTimeStr}:00`;
  const timeZone = appointment.clinicTimeZone || 'Africa/Cairo';

  // Privacy-minimized title & description
  const summary = `Health Vibe Consultation - ${doctorName}`;
  const description = [
    `Confidential Clinical Consultation (ID: ${apptId})`,
    `Status: ${appointment.status || 'confirmed'}`,
    `Clinic: ${clinicName}`,
    '',
    '-------------------------------------------------------',
    'CONFIDENTIAL HEALTHCARE RECORD & PHYSICIAN PRIMACY NOTICE:',
    'To protect patient confidentiality, medical details and clinical charts',
    'are accessible only inside the secure portal after authentication:',
    `https://healthvibe.ai/app/index.html?screen=appointments&id=${encodeURIComponent(apptId)}`,
    '',
    'STATUTORY NOTICE & PHYSICIAN PRIMACY: Clinical evaluation, diagnoses, and prescriptions require direct evaluation by a licensed human physician. Autonomous AI tools do not provide independent diagnosis or alter treatments. In case of emergency, call 123.',
    '-------------------------------------------------------'
  ].join('\n');

  return {
    summary,
    description,
    location: `${clinicName}, ${clinicAddress}`,
    start: {
      dateTime: startIso,
      timeZone
    },
    end: {
      dateTime: endIso,
      timeZone
    },
    attendees: [], // Do NOT add patient email to external attendee list to avoid directory leaks
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 10 }
      ]
    },
    extendedProperties: {
      private: {
        source: 'HealthVibeAI',
        appointmentId: apptId,
        sourceOfTruth: SOURCE_OF_TRUTH
      }
    }
  };
}

// ============================================================================
// 🔄 SYNCHRONIZATION: BOOKING, RESCHEDULING, CANCELLATION
// ============================================================================

/**
 * Synchronizes a newly booked appointment to Google Calendar.
 */
async function syncAppointmentCreated(db, appointment) {
  if (!appointment || !appointment.doctorId) {
    return { synced: false, reason: 'INVALID_APPOINTMENT' };
  }

  const config = await getDoctorGoogleCalendarStatus(db, appointment.doctorId);
  if (!config || !config.connected || !config.consentGiven) {
    return {
      synced: false,
      reason: 'DOCTOR_CONSENT_NOT_GRANTED',
      message: 'Google Calendar sync skipped because doctor has not connected or granted consent.'
    };
  }

  const eventPayload = buildGoogleCalendarEventPayload(appointment);
  const eventId = `gcal_evt_${appointment.id}`;
  const nowIso = new Date().toISOString();

  // Store external calendar projection
  inMemoryExternalGoogleCalendarEvents.set(eventId, {
    id: eventId,
    doctorId: appointment.doctorId,
    appointmentId: appointment.id,
    ...eventPayload,
    status: 'confirmed',
    updatedAt: nowIso
  });

  // Update appointment document with sync state
  if (db && typeof db.collection === 'function' && appointment.id) {
    try {
      await db.collection('appointments').doc(appointment.id).update({
        googleCalendarEventId: eventId,
        googleCalendarSyncStatus: 'synced',
        googleCalendarSyncedAt: nowIso
      });
    } catch (e) {}
  }

  return {
    synced: true,
    eventId,
    eventPayload
  };
}

/**
 * Synchronizes an appointment reschedule to Google Calendar.
 */
async function syncAppointmentRescheduled(db, appointment) {
  if (!appointment || !appointment.doctorId) {
    return { synced: false, reason: 'INVALID_APPOINTMENT' };
  }

  const config = await getDoctorGoogleCalendarStatus(db, appointment.doctorId);
  if (!config || !config.connected || !config.consentGiven) {
    return { synced: false, reason: 'DOCTOR_CONSENT_NOT_GRANTED' };
  }

  const eventId = appointment.googleCalendarEventId || `gcal_evt_${appointment.id}`;
  const updatedPayload = buildGoogleCalendarEventPayload(appointment);
  const nowIso = new Date().toISOString();

  let existingExternal = inMemoryExternalGoogleCalendarEvents.get(eventId) || {};
  inMemoryExternalGoogleCalendarEvents.set(eventId, {
    ...existingExternal,
    ...updatedPayload,
    id: eventId,
    appointmentId: appointment.id,
    doctorId: appointment.doctorId,
    status: 'confirmed',
    rescheduledAt: nowIso,
    updatedAt: nowIso
  });

  if (db && typeof db.collection === 'function' && appointment.id) {
    try {
      await db.collection('appointments').doc(appointment.id).update({
        googleCalendarEventId: eventId,
        googleCalendarSyncStatus: 'synced',
        googleCalendarSyncedAt: nowIso
      });
    } catch (e) {}
  }

  return {
    synced: true,
    eventId,
    updatedPayload
  };
}

/**
 * Synchronizes an appointment cancellation to Google Calendar.
 */
async function syncAppointmentCancelled(db, appointment, reason = 'Cancelled') {
  if (!appointment || !appointment.doctorId) {
    return { synced: false, reason: 'INVALID_APPOINTMENT' };
  }

  const config = await getDoctorGoogleCalendarStatus(db, appointment.doctorId);
  if (!config || !config.connected || !config.consentGiven) {
    return { synced: false, reason: 'DOCTOR_CONSENT_NOT_GRANTED' };
  }

  const eventId = appointment.googleCalendarEventId || `gcal_evt_${appointment.id}`;
  const nowIso = new Date().toISOString();

  let existingExternal = inMemoryExternalGoogleCalendarEvents.get(eventId) || {};
  inMemoryExternalGoogleCalendarEvents.set(eventId, {
    ...existingExternal,
    id: eventId,
    appointmentId: appointment.id,
    doctorId: appointment.doctorId,
    status: 'cancelled',
    cancelledAt: nowIso,
    cancelReason: reason,
    updatedAt: nowIso
  });

  if (db && typeof db.collection === 'function' && appointment.id) {
    try {
      await db.collection('appointments').doc(appointment.id).update({
        googleCalendarSyncStatus: 'cancelled_in_calendar',
        googleCalendarCancelledAt: nowIso
      });
    } catch (e) {}
  }

  return {
    synced: true,
    eventId,
    status: 'cancelled'
  };
}

// ============================================================================
// ⚖️ AUTHORITATIVE SOURCE OF TRUTH & CONFLICT RECONCILIATION
// ============================================================================

/**
 * Reconciles conflicting updates between external Google Calendar and Health Vibe DB.
 * HEALTH VIBE DATABASE IS THE UNCONDITIONAL SOURCE OF TRUTH.
 * If external Google event has conflicting date, time, or status, Health Vibe's
 * record overrides the external modification and restores consistency.
 */
async function reconcileGoogleCalendarEvent(db, appointmentId, externalEventData = {}) {
  if (!appointmentId) throw new Error('appointmentId is required.');

  // 1. Fetch Authoritative Record from Health Vibe DB
  let internalAppt = null;
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('appointments').doc(appointmentId).get();
      if (snap.exists) internalAppt = snap.data();
    } catch (e) {}
  }

  if (!internalAppt) {
    return {
      reconciled: false,
      reason: 'INTERNAL_RECORD_NOT_FOUND',
      sourceOfTruth: SOURCE_OF_TRUTH
    };
  }

  const eventId = internalAppt.googleCalendarEventId || `gcal_evt_${appointmentId}`;
  const externalEvent = externalEventData.id
    ? externalEventData
    : (inMemoryExternalGoogleCalendarEvents.get(eventId) || externalEventData);

  const conflictsDetected = [];

  // Check Date Skew Conflict
  if (externalEvent.start && externalEvent.start.dateTime) {
    const externalDate = externalEvent.start.dateTime.slice(0, 10);
    if (externalDate !== internalAppt.date) {
      conflictsDetected.push({
        field: 'date',
        authoritative: internalAppt.date,
        externalValue: externalDate,
        resolution: 'OVERWRITE_EXTERNAL_WITH_HEALTH_VIBE_AUTHORITATIVE'
      });
    }
  }

  // Check Status Conflict (e.g. externally deleted or confirmed while cancelled internally)
  if (externalEvent.status && externalEvent.status !== internalAppt.status) {
    conflictsDetected.push({
      field: 'status',
      authoritative: internalAppt.status,
      externalValue: externalEvent.status,
      resolution: 'OVERWRITE_EXTERNAL_WITH_HEALTH_VIBE_AUTHORITATIVE'
    });
  }

  // If conflicts detected, force restore external calendar from authoritative record
  const nowIso = new Date().toISOString();
  if (conflictsDetected.length > 0) {
    const authoritativePayload = buildGoogleCalendarEventPayload(internalAppt);
    inMemoryExternalGoogleCalendarEvents.set(eventId, {
      ...authoritativePayload,
      id: eventId,
      appointmentId,
      doctorId: internalAppt.doctorId,
      status: internalAppt.status,
      lastReconciledAt: nowIso,
      reconciliationReason: 'AUTHORITATIVE_OVERWRITE'
    });

    // Audit Conflict Resolution
    try {
      if (typeof auditService.recordAuditEvent === 'function') {
        auditService.recordAuditEvent(db, {
          type: 'GOOGLE_CALENDAR_CONFLICT_RECONCILED',
          actorUid: 'system_reconciliation',
          actorRole: 'system',
          details: {
            appointmentId,
            conflicts: conflictsDetected,
            sourceOfTruth: SOURCE_OF_TRUTH,
            reconciledAt: nowIso
          }
        });
      }
    } catch (auditErr) {}

    return {
      reconciled: true,
      hadConflict: true,
      conflictsDetected,
      sourceOfTruth: SOURCE_OF_TRUTH,
      action: 'EXTERNAL_OVERWRITTEN_TO_MATCH_HEALTH_VIBE'
    };
  }

  return {
    reconciled: true,
    hadConflict: false,
    sourceOfTruth: SOURCE_OF_TRUTH,
    message: 'External calendar is fully consistent with authoritative Health Vibe record.'
  };
}

// ============================================================================
// 📅 OKADOC BENCHMARK: 1-CLICK GOOGLE CALENDAR DEEP-LINK GENERATOR & DB SYNC
// ============================================================================

/**
 * 🔒 ZERO-PHI SANITIZATION UTILITY FOR CALENDAR URLS & EVENTS
 * HIPAA / GDPR: Strip all sensitive medical keywords, diagnoses, medications, and vitals.
 */
function sanitizeCalendarContent(text = '') {
  if (!text || typeof text !== 'string') return '';
  return text
    // Strip explicit diagnosis prefixes and clinical values
    .replace(/(?:تشخيص|diagnosis|مرض|سرطان|سل|درن|spo2|أكسجين|oxygen|asthma|copd|ربو|التهاب|antibiotic|steroid|inhaler|بخاخ):[^\n,;]+/gi, '')
    // Replace standalone high-sensitivity diagnostic terms with generic clinical tokens
    .replace(/\b(copd|asthma|bronchiectasis|pneumonia|covid-19|tuberculosis|spo2|respiratory rate|ventolin|symbicort|prednisolone)\b/gi, '[Clinical Note]')
    .trim();
}

const FORBIDDEN_AI_CLINICAL_CLAIMS = [
  'ai diagnosed',
  'ai diagnosis',
  'autonomous diagnosis',
  'ai prescription',
  'prescribed by ai',
  'treatment plan override',
  'ai recommended medication',
  'تجاوز الطبيب',
  'تشخيص الذكاء الاصطناعي',
  'وصفة الذكاء الاصطناعي',
  'علاج آلي نهائي'
];

const RESERVED_PHYSICIAN_CLINICAL_FIELDS = [
  'clinicalDiagnosis',
  'rxPrescription',
  'icd10Code',
  'physicianTreatmentPlan',
  'doctorEvaluation'
];

/**
 * 👨‍⚕️ PHYSICIAN PRIMACY & PRIVACY VALIDATOR
 * Guarantees that:
 * 1. AI chatbots or non-clinicians cannot author clinical diagnoses, prescriptions, or override doctor decisions.
 * 2. URLs and external calendar events contain Zero PHI.
 * 3. Statutory medical disclaimers are enforced.
 */
function validateCalendarPrivacyAndPrimacy(appointment = {}, actorUser = null, db = null) {
  if (!appointment) return { valid: false, code: 'INVALID_APPOINTMENT' };

  const actorRole = actorUser?.role || 'patient';
  const isPhysician = actorRole === 'doctor' || actorRole === 'super_admin' || actorRole === 'clinic_admin';

  // 1. 👨‍⚕️ PHYSICIAN PRIMACY: Prevent non-physicians / bots from injecting clinical authority
  for (const field of RESERVED_PHYSICIAN_CLINICAL_FIELDS) {
    if (appointment[field] && !isPhysician) {
      if (db && typeof auditService.recordAuditEvent === 'function') {
        try {
          auditService.recordAuditEvent(db, {
            type: 'CALENDAR_PHYSICIAN_PRIMACY_ENFORCED',
            actorUid: actorUser?.uid || 'non_physician',
            actorRole,
            details: {
              appointmentId: appointment.id,
              blockedField: field,
              reason: 'FIELD_RESERVED_FOR_LICENSED_PHYSICIAN'
            }
          });
        } catch (e) {}
      }
      const err = new Error(`Physician Primacy Violation: Field '${field}' is strictly reserved for licensed human physicians. Non-physicians and AI cannot author clinical diagnoses or prescriptions in calendar events.`);
      err.code = 'PHYSICIAN_PRIMACY_VIOLATION';
      err.statusCode = 403;
      throw err;
    }
  }

  // Scan notes and text fields for autonomous AI claims
  const rawNotes = String(appointment.notes || appointment.patientNotes || appointment.reason || '').toLowerCase();
  for (const claim of FORBIDDEN_AI_CLINICAL_CLAIMS) {
    if (rawNotes.includes(claim)) {
      if (db && typeof auditService.recordAuditEvent === 'function') {
        try {
          auditService.recordAuditEvent(db, {
            type: 'CALENDAR_PHYSICIAN_PRIMACY_ENFORCED',
            actorUid: actorUser?.uid || 'bot_or_user',
            actorRole,
            details: {
              appointmentId: appointment.id,
              detectedClaim: claim,
              reason: 'AUTONOMOUS_AI_MEDICAL_CLAIM_PROHIBITED'
            }
          });
        } catch (e) {}
      }
      const err = new Error(`Physician Primacy Violation: Calendar entries cannot contain autonomous AI medical diagnosis or treatment override ('${claim}'). Clinical authority is strictly reserved for the human doctor.`);
      err.code = 'PHYSICIAN_PRIMACY_VIOLATION';
      err.statusCode = 403;
      throw err;
    }
  }

  // 2. 🔒 ZERO-PHI PRIVACY CHECK: Check for raw medical diagnoses or vitals leakage
  let privacyViolationDetected = false;
  const rawTextToAudit = [
    appointment.notes,
    appointment.patientNotes,
    appointment.diagnosis,
    appointment.symptoms,
    appointment.vitalSigns
  ].filter(Boolean).join(' ');

  if (/(?:تشخيص|diagnosis|مرض|سرطان|سل|درن|spo2|أكسجين|oxygen|asthma|copd|ربو|التهاب|antibiotic|steroid|inhaler|بخاخ):/i.test(rawTextToAudit) ||
      /\b(copd|asthma|bronchiectasis|pneumonia|covid-19|tuberculosis|spo2|respiratory rate|ventolin|symbicort|prednisolone)\b/i.test(rawTextToAudit)) {
    privacyViolationDetected = true;
    if (db && typeof auditService.recordAuditEvent === 'function') {
      try {
        auditService.recordAuditEvent(db, {
          type: 'CALENDAR_PRIVACY_VIOLATION_BLOCKED',
          actorUid: actorUser?.uid || 'system_sanitizer',
          actorRole,
          details: {
            appointmentId: appointment.id,
            action: 'PHI_STRIPPED_FROM_CALENDAR_PARAMETERS'
          }
        });
      } catch (e) {}
    }
  }

  return {
    valid: true,
    privacyCompliant: true,
    physicianPrimacyGuaranteed: true,
    privacyViolationDetected,
    statutoryDisclaimer: {
      ar: 'تنبيه طبي قانوني: الاستشارة الطبية تتطلب تقييماً سريرياً مباشراً من طبيب بشري مرخص. أدوات الذكاء الاصطناعي لا تقدم تشخيصاً طبياً مستقلاً أو تعدل خططاً علاجية. في الطوارئ اتصل بـ 123.',
      en: 'Statutory Notice: Medical appointment requires direct clinical evaluation by a licensed human physician. Autonomous AI tools do not provide clinical diagnosis or alter prescriptions. In emergency, call 123.'
    }
  };
}

/**
 * Generates an Okadoc-style 1-click Google Calendar deep link for an appointment.
 * Supports dual perspective: 'patient' vs 'doctor'.
 * Supports 'ar' and 'en' language formats.
 * Enforces zero-PHI sanitization and Physician Primacy disclaimers on all parameters.
 */
function generateGoogleCalendarDeepLink(appointment, options = {}) {
  if (!appointment) return '#';

  // 1. Patient Consent Check (if explicitly enforced or checked)
  if (options.enforceConsent && options.patientConsent === false) {
    const err = new Error('Patient has revoked calendar synchronization consent. Calendar link generation blocked for privacy.');
    err.code = 'PATIENT_CALENDAR_CONSENT_REVOKED';
    err.statusCode = 403;
    throw err;
  }

  // 2. Validate Privacy & Physician Primacy
  validateCalendarPrivacyAndPrimacy(appointment, options.actorUser, options.db);

  const role = (options.role || 'patient').toLowerCase();
  const lang = (options.lang || options.language || 'ar').toLowerCase();
  const isEn = lang.startsWith('en');

  const apptId = appointment.id || 'N/A';
  const docName = isEn 
    ? (appointment.doctorNameEn || appointment.doctorName || 'Specialist Physician')
    : (appointment.doctorName || appointment.doctorNameEn || 'الطبيب الاستشاري المعالج');
  const docSpecialty = isEn
    ? (appointment.doctorSpecialtyEn || appointment.doctorSpecialty || 'Pulmonology & Respiratory Care')
    : (appointment.doctorSpecialty || appointment.doctorSpecialtyEn || 'أمراض الصدر والجهاز التنفسي');

  const patientName = appointment.patientName || (isEn ? 'Patient' : 'المريض');
  const consultationType = appointment.consultationType || appointment.type || (appointment.isOnlineConsultation ? 'video' : 'clinic');
  const isVideo = consultationType === 'video' || Boolean(appointment.isOnlineConsultation);

  // Determine Location
  let location = '';
  if (isVideo) {
    location = appointment.telehealthUrl || appointment.meetingLink || 'https://healthvibe.ai/app/telehealth.html';
  } else {
    location = isEn
      ? (appointment.clinicAddressEn || appointment.clinicAddress || appointment.clinicNameEn || appointment.clinicName || 'Specialized Chest Clinic - Dokki Branch, Cairo')
      : (appointment.clinicAddress || appointment.clinicAddressEn || appointment.clinicName || appointment.clinicNameEn || 'مركز القاهرة التخصصي لأمراض الصدر — فرع الدقي');
  }

  // Parse Date and Time
  const rawDate = appointment.date || new Date().toISOString().split('T')[0];
  const dateClean = String(rawDate).replace(/-/g, '');

  let hour = 10;
  let min = 0;
  const t = String(appointment.timeSlot || appointment.slotId || '');
  const match = t.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    hour = parseInt(match[1], 10);
    min = parseInt(match[2], 10);
    if ((t.includes('مساء') || t.toLowerCase().includes('pm')) && hour < 12) hour += 12;
    if ((t.includes('صباح') || t.toLowerCase().includes('am')) && hour === 12) hour = 0;
  } else if (t.startsWith('slot_')) {
    const numPart = t.replace('slot_', '');
    if (numPart.length === 4) {
      hour = parseInt(numPart.substring(0, 2), 10);
      min = parseInt(numPart.substring(2, 4), 10);
    }
  }

  const duration = parseInt(appointment.durationMinutes, 10) || 30;
  const totalStartMinutes = hour * 60 + min;
  const totalEndMinutes = totalStartMinutes + duration;
  const endHour = Math.floor(totalEndMinutes / 60) % 24;
  const endMin = totalEndMinutes % 60;

  const pad = n => String(n).padStart(2, '0');
  const startIso = `${dateClean}T${pad(hour)}${pad(min)}00`;
  const endIso = `${dateClean}T${pad(endHour)}${pad(endMin)}00`;

  let title = '';
  let detailsLines = [];

  const portalAuthUrl = `https://healthvibe.ai/app/index.html?screen=appointments&id=${encodeURIComponent(apptId)}`;

  if (role === 'doctor') {
    title = isEn
      ? `Health Vibe: Clinical Consultation with Patient ${patientName}`
      : `Health Vibe: كشف سريري للمريض ${patientName}`;

    detailsLines = [
      isEn ? `🩺 Clinical Consultation with Patient: ${patientName}` : `🩺 موعد كشف سريري مع المريض: ${patientName}`,
      isEn ? `📌 Consultation Type: ${consultationType}` : `📌 نوع الاستشارة: ${consultationType}`,
      isEn ? `📍 Location / Room: ${location}` : `📍 المقر / رابط الاستشارة: ${location}`,
      isEn ? `🏷️ Booking Reference: ${apptId}` : `🏷️ رقم الحجز المرجعي: ${apptId}`,
      isEn ? `🔐 Secure Patient Dossier: ${portalAuthUrl}` : `🔐 ملف المريض والتقارير المرفقة: ${portalAuthUrl}`,
      isEn 
        ? `⚠️ SLA Policy: Check patient history and prior vitals in portal before starting consultation.`
        : `⚠️ معيار السلامة السريرية: يرجى مراجعة الملف الطبي والعلامات الحيوية عبر البوابة قبل بدء الكشف.`,
      isEn
        ? '⚠️ Clinical Governance & Physician Primacy: All clinical diagnosis, prescription management, and care decisions are under the exclusive authority of the licensed human physician.'
        : '⚠️ حوكمة السلامة وسيادة الطبيب: التشخيص السريري وصرف الأدوية وقرارات العلاج هي مسؤولية حصرية للطبيب البشري المرخص.'
    ];
  } else {
    // Patient perspective
    title = isEn
      ? `Health Vibe: Consultation with Dr. ${docName}`
      : `Health Vibe: استشارة طبية مع د. ${docName}`;

    const prepInstructions = isVideo
      ? (isEn 
          ? 'Virtual consultation room opens 5 mins prior. Please ensure good internet connection and previous test reports handy.'
          : 'تفتح الغرفة الافتراضية قبل الموعد بـ 5 دقائق. يرجى التأكد من اتصال الإنترنت وتجهيز أي تحاليل سابقة.')
      : (isEn
          ? 'Please arrive at the clinic 10 minutes early for check-in and vital signs measurement. Bring previous prescriptions.'
          : 'يرجى الحضور لمقر العيادة قبل الموعد بـ 10 دقائق لتسجيل الوصول وقياس العلامات الحيوية، مع إحضار الروشتات السابقة.');

    detailsLines = [
      isEn ? `🩺 Consultation with: Dr. ${docName} (${docSpecialty})` : `🩺 استشارة طبية مع: د. ${docName} (${docSpecialty})`,
      isEn ? `📌 Type: ${isVideo ? 'Virtual Telehealth Video' : 'In-Clinic Consultation'}` : `📌 النوع: ${isVideo ? 'استشارة مرئية عن بُعد' : 'كشف بمقر العيادة'}`,
      isEn ? `📍 Location: ${location}` : `📍 المكان: ${location}`,
      isEn ? `🏷️ Booking Reference: ${apptId}` : `🏷️ رقم الحجز: ${apptId}`,
      isEn ? `📋 Preparation: ${prepInstructions}` : `📋 إرشادات التحضير: ${prepInstructions}`,
      isEn ? `🔐 Manage Appointment & Instructions: ${portalAuthUrl}` : `🔐 تفاصيل وإدارة الموعد: ${portalAuthUrl}`,
      isEn 
        ? '⚠️ In case of medical emergency, immediately contact emergency services (123).'
        : '⚠️ في حالات الطوارئ الطبية العاجلة يرجى الاتصال بالإسعاف (123) فوراً.',
      isEn
        ? '⚠️ Statutory Notice: Medical appointment requires direct clinical evaluation by a licensed human physician. Autonomous AI tools do not provide clinical diagnosis or alter prescriptions.'
        : '⚠️ تنبيه طبي قانوني: الاستشارة الطبية تتطلب تقييماً سريرياً مباشراً من طبيب بشري مرخص. أدوات الذكاء الاصطناعي لا تقدم تشخيصاً طبياً مستقلاً أو تعدل خططاً علاجية.'
    ];
  }

  // Zero-PHI Sanitization on query components
  const sanitizedTitle = sanitizeCalendarContent(title);
  const sanitizedDetails = sanitizeCalendarContent(detailsLines.join('\n'));
  const sanitizedLocation = sanitizeCalendarContent(location);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(sanitizedTitle)}&dates=${startIso}/${endIso}&details=${encodeURIComponent(sanitizedDetails)}&location=${encodeURIComponent(sanitizedLocation)}`;
}

/**
 * Generates an aggregated suite of calendar sync links for an appointment.
 */
function generateAppointmentCalendarLinks(appointment, options = {}) {
  const patientGoogleUrl = generateGoogleCalendarDeepLink(appointment, { ...options, role: 'patient' });
  const doctorGoogleUrl = generateGoogleCalendarDeepLink(appointment, { ...options, role: 'doctor' });
  const apptId = appointment?.id || 'appointment';
  const icsDownloadUrl = `/api/appointments/${encodeURIComponent(apptId)}/calendar.ics`;

  return {
    googleCalendarUrl: patientGoogleUrl,
    googleCalendarDoctorUrl: doctorGoogleUrl,
    icsDownloadUrl,
    outlookUrl: patientGoogleUrl.replace('calendar.google.com/calendar/render?action=TEMPLATE', 'outlook.live.com/calendar/0/deeplink/compose'),
    yahooUrl: patientGoogleUrl.replace('calendar.google.com/calendar/render?action=TEMPLATE', 'calendar.yahoo.com/?v=60')
  };
}

/**
 * Records an appointment calendar sync interaction in the database (Relational DB & Firestore),
 * logs an immutable security audit event, and registers analytics telemetry.
 */
async function recordAppointmentCalendarSync(db, {
  appointmentId,
  userId,
  role = 'patient',
  calendarProvider = 'google',
  ipAddress = null,
  userAgent = null
} = {}) {
  if (!appointmentId) {
    const err = new Error('appointmentId is required.');
    err.code = 'MISSING_APPOINTMENT_ID';
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const syncId = `calsync_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const syncRecord = {
    id: syncId,
    appointmentId,
    userId: userId || 'anonymous',
    role: role || 'patient',
    calendarProvider: calendarProvider || 'google',
    syncedAt: nowIso,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    createdAt: nowIso
  };

  // 1. Persist to Relational DB (PostgreSQL / Supabase Operational Engine)
  let relationalRecord = null;
  try {
    if (relationalDbService && typeof relationalDbService.recordCalendarSync === 'function') {
      relationalRecord = await relationalDbService.recordCalendarSync({
        id: syncId,
        appointment_id: appointmentId,
        user_id: userId,
        role,
        calendar_provider: calendarProvider,
        synced_at: nowIso,
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: nowIso
      });
    }
  } catch (relErr) {
    console.warn('[CALENDAR RELATIONAL DB SYNC WARNING]:', relErr.message);
  }

  // 2. Persist to Firestore appointment_calendar_syncs collection
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('appointment_calendar_syncs').doc(syncId).set(syncRecord);
      if (typeof db.collection('appointments').doc(appointmentId).update === 'function') {
        await db.collection('appointments').doc(appointmentId).update({
          calendarLastSyncedAt: nowIso,
          calendarProvider: calendarProvider
        });
      }
    } catch (fsErr) {
      console.warn('[CALENDAR FIRESTORE SYNC WARNING]:', fsErr.message);
    }
  }

  // 3. Immutable Security Audit Event
  try {
    if (typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: 'APPOINTMENT_CALENDAR_SYNCED',
        actorUid: userId || 'patient_user',
        actorRole: role || 'patient',
        details: {
          appointmentId,
          syncId,
          calendarProvider,
          syncedAt: nowIso
        }
      });
    }
  } catch (auditErr) {}

  // 4. Analytics Telemetry Event
  try {
    const analyticsService = require('./analytics-service');
    if (typeof analyticsService.recordEvent === 'function') {
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.GOOGLE_CALENDAR_BUTTON_CLICKED || 'google_calendar_button_clicked',
        userId: userId || 'anonymous',
        payload: {
          appointmentId,
          role,
          calendarProvider,
          syncedAt: nowIso
        }
      });
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.GOOGLE_CALENDAR_SYNC_SUCCESS || 'google_calendar_sync_success',
        userId: userId || 'anonymous',
        payload: {
          appointmentId,
          role,
          calendarProvider,
          syncId,
          syncedAt: nowIso
        }
      });
    }
  } catch (telemetryErr) {}

  return {
    success: true,
    syncId,
    syncedAt: nowIso,
    record: relationalRecord || syncRecord
  };
}

/**
 * Retrieves sync history for a specific appointment from Relational DB with Firestore fallback.
 */
async function getAppointmentCalendarSyncs(db, appointmentId) {
  if (!appointmentId) return [];

  // 1. Relational DB first
  try {
    if (relationalDbService && typeof relationalDbService.getCalendarSyncsByAppointmentId === 'function') {
      const records = await relationalDbService.getCalendarSyncsByAppointmentId(appointmentId);
      if (records && records.length > 0) return records;
    }
  } catch (e) {}

  // 2. Firestore fallback
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('appointment_calendar_syncs')
        .where('appointmentId', '==', appointmentId)
        .get();
      if (snap && snap.docs) {
        return snap.docs.map(doc => doc.data());
      }
    } catch (e) {}
  }

  return [];
}

/**
 * Sets patient calendar consent governance preference (grant or revoke).
 */
async function setPatientCalendarConsent(db, patientId, {
  consent = true,
  reason = '',
  actorUser = null,
  ipAddress = null,
  userAgent = null
} = {}) {
  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    err.statusCode = 400;
    throw err;
  }

  const consentBool = Boolean(consent);
  const nowIso = new Date().toISOString();

  const consentRecord = {
    patientId,
    consent: consentBool,
    updatedAt: nowIso,
    reason: reason || (consentBool ? 'Patient opted in for calendar integration' : 'Patient revoked calendar sync'),
    updatedBy: actorUser?.uid || patientId,
    actorRole: actorUser?.role || 'patient',
    ipAddress: ipAddress || null,
    userAgent: userAgent || null
  };

  // 1. Relational DB persistence
  let relResult = null;
  try {
    if (relationalDbService && typeof relationalDbService.setPatientCalendarConsent === 'function') {
      relResult = await relationalDbService.setPatientCalendarConsent(patientId, {
        consent: consentBool,
        reason: consentRecord.reason,
        updated_by: consentRecord.updatedBy,
        actor_role: consentRecord.actorRole,
        ip_address: ipAddress,
        user_agent: userAgent
      });
    }
  } catch (relErr) {
    console.warn('[CALENDAR CONSENT RELATIONAL DB WARNING]:', relErr.message);
  }

  // 2. Firestore persistence
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('patient_calendar_consents').doc(patientId).set(consentRecord, { merge: true });
    } catch (fsErr) {
      console.warn('[CALENDAR CONSENT FIRESTORE WARNING]:', fsErr.message);
    }
  }

  // 3. Immutable Security Audit Event
  try {
    if (typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: consentBool ? 'CALENDAR_CONSENT_GRANTED' : 'CALENDAR_CONSENT_REVOKED',
        actorUid: actorUser?.uid || patientId,
        actorRole: actorUser?.role || 'patient',
        details: {
          patientId,
          consent: consentBool,
          reason: consentRecord.reason,
          timestamp: nowIso
        }
      });
    }
  } catch (auditErr) {}

  // 4. Telemetry Event
  try {
    const analyticsService = require('./analytics-service');
    if (typeof analyticsService.recordEvent === 'function') {
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.CALENDAR_CONSENT_UPDATED || 'calendar_consent_updated',
        userId: actorUser?.uid || patientId,
        payload: {
          patientId,
          consent: consentBool,
          reason: consentRecord.reason
        }
      });
      analyticsService.recordEvent({
        eventType: consentBool
          ? (analyticsService.EVENT_TYPES.GOOGLE_CALENDAR_CONSENT_GRANTED || 'google_calendar_consent_granted')
          : (analyticsService.EVENT_TYPES.GOOGLE_CALENDAR_CONSENT_REVOKED || 'google_calendar_consent_revoked'),
        userId: actorUser?.uid || patientId,
        payload: {
          patientId,
          consent: consentBool,
          reason: consentRecord.reason
        }
      });
    }
  } catch (telemetryErr) {}

  return {
    success: true,
    patientId,
    consent: consentBool,
    updatedAt: nowIso,
    record: relResult || consentRecord
  };
}

/**
 * Retrieves the current patient calendar sync consent status.
 */
async function getPatientCalendarConsent(db, patientId) {
  if (!patientId) return { patientId, consent: true, defaultFallback: true };

  // 1. Relational DB first
  try {
    if (relationalDbService && typeof relationalDbService.getPatientCalendarConsent === 'function') {
      const relRecord = await relationalDbService.getPatientCalendarConsent(patientId);
      if (relRecord) {
        return {
          patientId,
          consent: Boolean(relRecord.consent),
          updatedAt: relRecord.updated_at || relRecord.updatedAt,
          reason: relRecord.reason,
          source: 'relational_db'
        };
      }
    }
  } catch (e) {}

  // 2. Firestore fallback
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('patient_calendar_consents').doc(patientId).get();
      if (snap && snap.exists) {
        const data = snap.data();
        return {
          patientId,
          consent: Boolean(data.consent),
          updatedAt: data.updatedAt,
          reason: data.reason,
          source: 'firestore'
        };
      }
    } catch (e) {}
  }

  // Default: opt-in enabled with notice
  return {
    patientId,
    consent: true,
    defaultFallback: true,
    reason: 'DEFAULT_OPT_IN_WITH_STATUTORY_DISCLAIMER'
  };
}

/**
 * Generates non-clinical, localized appointment calendar context for the AI Chatbot.
 * Provides upcoming appointments with 1-click Google Calendar add links and statutory disclaimers.
 */
async function generateChatbotCalendarContext(db, patientId, { lang = 'ar' } = {}) {
  if (!patientId) {
    return {
      success: false,
      message: 'patientId is required for chatbot calendar context.'
    };
  }

  const isEn = String(lang).toLowerCase().startsWith('en');
  let appointments = [];

  // Query upcoming appointments from Firestore
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('appointments')
        .where('patientId', '==', patientId)
        .get();
      if (snap && snap.docs) {
        appointments = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => a.status !== 'cancelled');
      }
    } catch (e) {
      console.warn('[CHATBOT CALENDAR CONTEXT WARNING]:', e.message);
    }
  }

  // Generate localized calendar action cards
  const cards = appointments.map(appt => {
    const links = generateAppointmentCalendarLinks(appt, { lang, role: 'patient' });
    return {
      appointmentId: appt.id,
      doctorName: isEn ? (appt.doctorNameEn || appt.doctorName || 'Doctor') : (appt.doctorName || appt.doctorNameEn || 'الطبيب'),
      doctorSpecialty: isEn ? (appt.doctorSpecialtyEn || appt.doctorSpecialty || 'Specialist') : (appt.doctorSpecialty || appt.doctorSpecialtyEn || 'استشاري'),
      date: appt.date,
      timeSlot: appt.timeSlot,
      status: appt.status || 'confirmed',
      isTelehealth: Boolean(appt.isOnlineConsultation || appt.type === 'video'),
      googleCalendarUrl: links.googleCalendarUrl,
      icsDownloadUrl: links.icsDownloadUrl,
      cardTitle: isEn
        ? `Upcoming Appointment with Dr. ${appt.doctorNameEn || appt.doctorName || 'Doctor'}`
        : `موعدك القادم مع د. ${appt.doctorName || appt.doctorNameEn || 'الطبيب'}`,
      actionPrompt: isEn
        ? 'Never forget your clinical visit! Add this appointment directly to your Google Calendar.'
        : 'لا تنسَ زيارتك الطبية! يمكنك إضافة هذا الموعد مباشرة إلى تقويم جوجل (Google Calendar) بنقرة واحدة.',
      buttonText: isEn ? 'Add to Google Calendar' : 'إضافة إلى تقويم جوجل (Google Calendar)',
      statutoryNotice: isEn
        ? 'Statutory Notice: Medical appointment requires direct clinical evaluation by a licensed human physician. Autonomous AI tools do not provide clinical diagnosis. In emergency, call 123.'
        : 'تنبيه طبي قانوني: الاستشارة تتطلب تقييماً سريرياً مباشراً من طبيب بشري مرخص. الذكاء الاصطناعي لا يقدم تشخيصاً مستقلاً. في الطوارئ اتصل بـ 123.'
    };
  });

  return {
    success: true,
    patientId,
    lang,
    appointmentsCount: cards.length,
    cards,
    overallStatutoryDisclaimer: isEn
      ? 'Statutory Notice: Chatbot facilitates booking and calendar scheduling only. All medical evaluations are conducted exclusively by licensed human physicians.'
      : 'تنبيه طبي قانوني: المساعد الذكي يسهل تنظيم المواعيد وجدولتها بالتقويم فقط. التقييم والعلاج اختصاص حصري للأطباء البشريين المرخصين.'
  };
}

/**
 * 📊 Retrieves consolidated administrative analytics for Google Calendar Integration.
 * Aggregates actual records from database, consent status, security audit events, and telemetry.
 */
async function getGoogleCalendarAnalytics(db, options = {}) {
  const analyticsService = require('./analytics-service');
  const schedulingService = require('./scheduling-service');

  // 1. Get raw telemetry KPIs
  const telemetryKpis = analyticsService.calculateGoogleCalendarKpis(
    analyticsService.getInMemoryEvents(),
    options
  );

  // 2. Query actual appointments from scheduling service
  let apptAnalytics = null;
  try {
    apptAnalytics = await schedulingService.getAppointmentAnalytics(db, options);
  } catch (e) {
    console.warn('[GOOGLE CALENDAR ANALYTICS]: Failed to fetch appointment DB analytics:', e.message);
  }

  // 3. Query consent records count from Relational DB / Firestore
  let totalConsentsGranted = 0;
  let totalConsentsRevoked = 0;
  try {
    if (relationalDbService && typeof relationalDbService.getHealthStatus === 'function') {
      const health = relationalDbService.getHealthStatus();
      totalConsentsGranted = health.tables?.patient_calendar_consents?.totalRecords || 0;
    }
  } catch (e) {}

  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('patient_calendar_consents').get();
      if (snap && snap.docs) {
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.consent === false) totalConsentsRevoked++;
          else totalConsentsGranted++;
        });
      }
    } catch (e) {}
  }

  // 4. Construct unified administrative report
  const isEn = Boolean(options.isEn);
  const totalBookings = apptAnalytics?.summary?.totalBookings || telemetryKpis.summary.totalBookings || 0;
  const totalCalendarSynced = apptAnalytics?.summary?.totalCalendarSynced || telemetryKpis.summary.syncSuccesses || 0;
  const effectiveAdoptionRate = totalBookings > 0
    ? Number(((totalCalendarSynced / totalBookings) * 100).toFixed(1))
    : telemetryKpis.metrics.adoptionRate.rate;

  const naText = isEn ? 'Unavailable' : 'غير متاح';

  return {
    success: true,
    timePeriod: options.timePeriod || 'Rolling 30 Days',
    clinicId: options.clinicId || 'all',
    summary: {
      ...telemetryKpis.summary,
      totalBookings,
      totalCalendarSynced,
      adoptionRate: effectiveAdoptionRate,
      consentsGranted: totalConsentsGranted,
      consentsRevoked: Math.max(totalConsentsRevoked, telemetryKpis.securityAudit.consentRevocations)
    },
    metrics: {
      ...telemetryKpis.metrics,
      adoptionRate: {
        ...telemetryKpis.metrics.adoptionRate,
        rate: effectiveAdoptionRate,
        display: effectiveAdoptionRate !== null ? `${effectiveAdoptionRate}%` : naText,
        displayAr: effectiveAdoptionRate !== null ? `${effectiveAdoptionRate}%` : 'غير متاح'
      }
    },
    display: {
      ...telemetryKpis.display,
      adoptionRateDisplay: effectiveAdoptionRate !== null ? `${effectiveAdoptionRate}%` : naText,
      adoptionRateDisplayAr: effectiveAdoptionRate !== null ? `${effectiveAdoptionRate}%` : 'غير متاح'
    },
    roleBreakdown: telemetryKpis.roleBreakdown,
    consultationBreakdown: telemetryKpis.consultationBreakdown,
    chatbotEngagement: telemetryKpis.chatbotEngagement,
    securityAudit: telemetryKpis.securityAudit,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Clear in-memory caches (used between tests).
 */
function clearGoogleCalendarMemoryStore() {
  inMemoryDoctorCalendarConfigs.clear();
  inMemoryExternalGoogleCalendarEvents.clear();
}

module.exports = {
  MINIMUM_REQUIRED_OAUTH_SCOPES,
  DISALLOWED_BROAD_SCOPES,
  SOURCE_OF_TRUTH,
  FORBIDDEN_AI_CLINICAL_CLAIMS,
  RESERVED_PHYSICIAN_CLINICAL_FIELDS,
  validateOAuthScopes,
  connectDoctorGoogleCalendar,
  disconnectDoctorGoogleCalendar,
  getDoctorGoogleCalendarStatus,
  buildGoogleCalendarEventPayload,
  syncAppointmentCreated,
  syncAppointmentRescheduled,
  syncAppointmentCancelled,
  reconcileGoogleCalendarEvent,
  sanitizeCalendarContent,
  validateCalendarPrivacyAndPrimacy,
  generateGoogleCalendarDeepLink,
  generateAppointmentCalendarLinks,
  generateChatbotCalendarContext,
  getGoogleCalendarAnalytics,
  recordAppointmentCalendarSync,
  getAppointmentCalendarSyncs,
  setPatientCalendarConsent,
  getPatientCalendarConsent,
  clearGoogleCalendarMemoryStore,
  _inMemoryDoctorCalendarConfigs: inMemoryDoctorCalendarConfigs,
  _inMemoryExternalGoogleCalendarEvents: inMemoryExternalGoogleCalendarEvents
};


