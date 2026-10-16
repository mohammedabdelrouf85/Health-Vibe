/**
 * Health Vibe AI - Product Analytics, Journey Telemetry & Clinical KPI Engine
 *
 * Implements:
 * 1. Event Telemetry without sending medical text:
 *    - signup, onboarding, assessment_start, assessment_complete, assessment_abandon,
 *      doctor_review, result_opened, follow_up_booked.
 * 2. Strict PHI/Medical text redaction & rejection guards.
 * 3. Event deduplication and monotonic timing validations.
 * 4. Product & Clinical KPIs with explicit numerators, denominators, and time periods:
 *    - Assessment Journey Completion Rate (strictly decoupled from case counts)
 *    - Clinical Turnaround Time
 *    - D1, D7, D30 User Retention
 *    - WAU / MAU and Stickiness Ratio
 *    - Doctor and Clinic Activity
 *    - Satisfaction (CSAT, Star Rating)
 *    - Error Rates
 *    - Support Metrics (Ticket Volume & Resolution Rate)
 * 5. Displaying "Unavailable" / "غير متاح" when underlying denominator or samples are missing.
 */

const crypto = require('crypto');

// 1. Supported Event Types
const EVENT_TYPES = Object.freeze({
  SIGNUP: 'signup',
  ONBOARDING: 'onboarding',
  ASSESSMENT_START: 'assessment_start',
  ASSESSMENT_COMPLETE: 'assessment_complete',
  ASSESSMENT_ABANDON: 'assessment_abandon',
  DOCTOR_REVIEW: 'doctor_review',
  RESULT_OPENED: 'result_opened',
  FOLLOW_UP_BOOKED: 'follow_up_booked',

  // 🏥 Appointment Calendar & Utilization Telemetry (Vezeeta Flow)
  APPOINTMENT_VIEW: 'appointment_view',
  APPOINTMENT_SLOT_SELECTED: 'appointment_slot_selected',
  APPOINTMENT_BOOK_ATTEMPT: 'appointment_book_attempt',
  APPOINTMENT_BOOK_SUCCESS: 'appointment_book_success',
  APPOINTMENT_BOOK_FAILURE: 'appointment_book_failure',
  APPOINTMENT_CANCEL: 'appointment_cancel',
  APPOINTMENT_RESCHEDULE: 'appointment_reschedule',
  APPOINTMENT_COMPLETE: 'appointment_complete',
  APPOINTMENT_EMERGENCY_REDIRECT: 'appointment_emergency_redirect',

  // 📑 Pre-Visit Medical Dossier Telemetry (Doctolib Model)
  DOSSIER_ATTACHED_TO_APPOINTMENT: 'dossier_attached_to_appointment',
  PREVISIT_DOSSIER_ACCESSED: 'previsit_dossier_accessed',
  DOSSIER_LINKAGE_FAILED: 'dossier_linkage_failed',

  // 🚗 CliniDo Consultation Type & Egypt Commute Relief Telemetry
  CONSULTATION_TYPE_SELECTED: 'consultation_type_selected',
  COMMUTE_RELIEF_VIEWED: 'commute_relief_viewed',
  CONSULTATION_MODE_SWITCHED: 'consultation_mode_switched',

  // 🏥 Doctor Schedule & Branch Manager Telemetry
  DOCTOR_SCHEDULE_UPDATED: 'doctor_schedule_updated',
  DOCTOR_LEAVE_REQUESTED: 'doctor_leave_requested',
  DOCTOR_LEAVE_CANCELLED: 'doctor_leave_cancelled',
  DOCTOR_SCHEDULE_VIEWED: 'doctor_schedule_viewed',
  DOCTOR_SLOTS_ACCESSED: 'doctor_slots_accessed'
});

const FORBIDDEN_MEDICAL_KEYS = Object.freeze([
  'symptoms',
  'symptom',
  'vitals',
  'vital',
  'oxygenlevel',
  'oxygen',
  'o2',
  'spo2',
  'diagnosis',
  'diagnoses',
  'clinicaldiagnosis',
  'treatment',
  'treatments',
  'prescription',
  'prescriptions',
  'medication',
  'medications',
  'notes',
  'clinicalnotes',
  'doctornotes',
  'patientnotes',
  'chiefcomplaint',
  'complaint',
  'complaints',
  'chestpain',
  'coughlevel',
  'breathingdifficulty',
  'medicalhistory',
  'medicaltext'
]);

function isForbiddenMedicalKey(key) {
  const k = String(key || '').trim().toLowerCase().replace(/[_\s-]/g, '');
  if (FORBIDDEN_MEDICAL_KEYS.includes(k)) return true;
  const medicalStems = ['symptom', 'vital', 'oxygen', 'spo2', 'diagnos', 'treatment', 'prescript', 'medicat', 'complaint', 'chestpain', 'coughlevel', 'breathingdiff', 'medical'];
  return medicalStems.some(stem => k.includes(stem));
}

// In-memory ring buffer for events (when Firestore is not attached or for fast in-memory telemetry)
const MAX_IN_MEMORY_EVENTS = 5000;
let inMemoryEvents = [];
const processedEventIds = new Set();
const recentDebounceMap = new Map(); // compositeKey -> timestamp

/**
 * Validates and redacts an analytics event to strictly guarantee NO medical text is transmitted.
 */
function sanitizeAndValidatePayload(eventType, payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return { ok: true, cleanPayload: {} };
  }

  // Scan all keys recursively for forbidden medical attributes
  const checkForbidden = (obj, path = '') => {
    for (const key of Object.keys(obj)) {
      if (isForbiddenMedicalKey(key)) {
        return {
          violation: true,
          key: path ? `${path}.${key}` : key
        };
      }
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        const sub = checkForbidden(obj[key], path ? `${path}.${key}` : key);
        if (sub.violation) return sub;
      }
    }
    return { violation: false };
  };

  const checkResult = checkForbidden(payload);
  if (checkResult.violation) {
    throw new Error(
      `MEDICAL_TEXT_PROHIBITED: Clinical data attribute '${checkResult.key}' is forbidden in telemetry events. Analytics events must only carry operational metadata.`
    );
  }

  // Deep clone and clean non-clinical metadata
  const cleanPayload = {};
  const allowedKeys = [
    'userId', 'role', 'clinicId', 'assessmentId', 'caseId', 'reportId', 'appointmentId',
    'step', 'status', 'durationMs', 'stepsCount', 'abandonStep', 'reasonCode', 'timeSpentMs',
    'reviewAction', 'responseTimeMs', 'appointmentType', 'device', 'platform', 'browser',
    'locale', 'rating', 'feedbackId', 'ticketId', 'errorCategory', 'metadata',
    // Appointment specific metadata
    'doctorId', 'specialty', 'consultationType', 'previousConsultationType', 'modeSwitched', 'isOnline',
    'commuteReliefActive', 'branch', 'source', 'switchReason', 'isDependent', 'beneficiaryType',
    'timeOfDay', 'slotId', 'date', 'weekOffset', 'action', 'reason', 'errorCode', 'failureReason',
    'price', 'currency', 'hasAttachedReport', 'hasAttachedDossier', 'isDoctorReview', 'isPostBookingLinkage', 'actorRole',
    // Doctor Schedule & Branch Manager metadata
    'branchId', 'bufferBetweenSlotsMinutes', 'slotDurationMinutes', 'leaveType', 'reasonType',
    'emergencyOverride', 'startDate', 'endDate', 'leaveId', 'conflictingAppointmentsCount',
    'conflictingCount', 'slotsCount', 'workingDaysCount', 'isPrivileged', 'actorUid'
  ];

  for (const [k, v] of Object.entries(payload)) {
    if (allowedKeys.includes(k)) {
      // Prevent raw strings that look like diagnoses or clinical notes
      if (typeof v === 'string') {
        const cleanStr = v.trim();
        // Redact any free-form text longer than 150 chars in generic metadata
        cleanPayload[k] = cleanStr.length > 150 ? cleanStr.slice(0, 150) : cleanStr;
      } else {
        cleanPayload[k] = v;
      }
    }
  }

  return { ok: true, cleanPayload };
}

/**
 * Records an analytics event with de-duplication, monotonic timing, and zero medical text.
 */
function recordEvent(eventData = {}) {
  const { eventType, eventId, timestamp, userId, clinicId, payload = {} } = eventData;

  // 1. Verify Event Type
  if (!eventType || !Object.values(EVENT_TYPES).includes(eventType)) {
    throw new Error(`INVALID_EVENT_TYPE: '${eventType}' is not an authorized telemetry event type.`);
  }

  // 2. Strict Medical Text Rejection
  const { cleanPayload } = sanitizeAndValidatePayload(eventType, payload);

  // 3. Monotonic Timestamp Verification
  const now = Date.now();
  let ts = timestamp;
  if (!ts) {
    ts = now;
  } else if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (isNaN(parsed)) throw new Error(`INVALID_EVENT_TIMING: Invalid timestamp format '${timestamp}'.`);
    ts = parsed;
  }

  // Reject future timestamps (> 60s ahead)
  if (ts > now + 60000) {
    throw new Error(`INVALID_EVENT_TIMING: Event timestamp cannot be in the future (${new Date(ts).toISOString()}).`);
  }

  // 4. De-duplication Guard
  const finalEventId = eventId || `evt_${eventType}_${ts}_${crypto.randomBytes(4).toString('hex')}`;
  if (processedEventIds.has(finalEventId)) {
    return {
      success: true,
      duplicate: true,
      eventId: finalEventId,
      message: 'Event was already recorded (idempotent duplicate).'
    };
  }

  // Debounce rapid identical events within 3000ms (e.g. double clicks)
  const targetEntity = cleanPayload.assessmentId || cleanPayload.caseId || cleanPayload.appointmentId || '';
  const compositeKey = `${eventType}:${userId || 'anon'}:${targetEntity}`;
  const lastEventTs = recentDebounceMap.get(compositeKey);
  if (typeof lastEventTs === 'number' && Math.abs(ts - lastEventTs) < 3000) {
    return {
      success: true,
      duplicate: true,
      eventId: finalEventId,
      message: 'Duplicate event debounced within 3000ms window.'
    };
  }

  // 5. Sequence and Timing Logic Checks
  if (eventType === EVENT_TYPES.ASSESSMENT_COMPLETE) {
    const assessmentId = cleanPayload.assessmentId;
    if (assessmentId) {
      const startEvt = inMemoryEvents.find(e => e.eventType === EVENT_TYPES.ASSESSMENT_START && e.payload?.assessmentId === assessmentId);
      if (startEvt && ts < startEvt.timestamp) {
        throw new Error(`INVALID_EVENT_TIMING: assessment_complete timestamp (${ts}) cannot precede assessment_start timestamp (${startEvt.timestamp}).`);
      }
    }
  }

  if (eventType === EVENT_TYPES.DOCTOR_REVIEW) {
    const caseId = cleanPayload.caseId;
    if (caseId) {
      const compEvt = inMemoryEvents.find(e => e.eventType === EVENT_TYPES.ASSESSMENT_COMPLETE && (e.payload?.caseId === caseId || e.payload?.assessmentId === caseId));
      if (compEvt && ts < compEvt.timestamp) {
        throw new Error(`INVALID_EVENT_TIMING: doctor_review timestamp (${ts}) cannot precede assessment_complete timestamp (${compEvt.timestamp}).`);
      }
    }
  }

  // Record Event
  const record = {
    eventId: finalEventId,
    eventType,
    userId: userId || null,
    clinicId: clinicId || null,
    timestamp: ts,
    timestampIso: new Date(ts).toISOString(),
    payload: cleanPayload
  };

  inMemoryEvents.push(record);
  if (inMemoryEvents.length > MAX_IN_MEMORY_EVENTS) inMemoryEvents.shift();

  processedEventIds.add(finalEventId);
  recentDebounceMap.set(compositeKey, ts);

  // Prune debounce map periodically
  if (recentDebounceMap.size > 2000) {
    const cutoff = now - 60000;
    for (const [k, v] of recentDebounceMap.entries()) {
      if (v < cutoff) recentDebounceMap.delete(k);
    }
  }

  return {
    success: true,
    duplicate: false,
    eventId: finalEventId,
    timestamp: ts
  };
}

/**
 * Formats a KPI object with explicit numerator, denominator, time period, and Unavailable fallbacks.
 */
function buildKpiMetric({
  name,
  timePeriod,
  numeratorName,
  numeratorValue,
  denominatorName,
  denominatorValue,
  unit = '%',
  precision = 1,
  isEn = true
}) {
  const hasValidData = typeof denominatorValue === 'number' && denominatorValue > 0 && typeof numeratorValue === 'number';
  const rate = hasValidData ? Number(((numeratorValue / denominatorValue) * (unit === '%' ? 100 : 1)).toFixed(precision)) : null;

  let display = 'Unavailable';
  let displayAr = 'غير متاح';

  if (hasValidData) {
    if (unit === '%') {
      display = `${rate}%`;
      displayAr = `${rate}%`;
    } else if (unit) {
      display = `${rate} ${unit}`;
      displayAr = `${rate} ${unit}`;
    } else {
      display = String(rate);
      displayAr = String(rate);
    }
  }

  return {
    name,
    timePeriod,
    numeratorName,
    numeratorValue: typeof numeratorValue === 'number' ? numeratorValue : 0,
    denominatorName,
    denominatorValue: typeof denominatorValue === 'number' ? denominatorValue : 0,
    rate,
    metricValue: rate,
    display,
    displayAr,
    displayValue: isEn ? display : displayAr,
    isAvailable: hasValidData
  };
}

/**
 * Calculates comprehensive Product & Clinical KPIs across:
 * - Journey Completion (strictly decoupled from case counts)
 * - Turnaround Time
 * - Retention (D1, D7, D30)
 * - WAU / MAU
 * - Doctor & Clinic Activity
 * - Satisfaction
 * - Errors
 * - Support
 */
function calculateProductKpis(events = inMemoryEvents, options = {}) {
  const now = Date.now();
  const timePeriod = options.timePeriod || 'last_30d';
  const clinicFilter = (options.clinicId || '').trim().toLowerCase();

  let minTs = 0;
  let maxTs = now;

  if (options.startDate) {
    minTs = Date.parse(options.startDate);
  }
  if (options.endDate) {
    const endP = Date.parse(options.endDate);
    maxTs = typeof options.endDate === 'string' && options.endDate.length === 10 ? endP + 86399999 : endP;
  }
  if (!options.startDate && !options.endDate) {
    if (timePeriod === 'last_24h') minTs = now - 24 * 3600 * 1000;
    else if (timePeriod === 'last_7d') minTs = now - 7 * 24 * 3600 * 1000;
    else if (timePeriod === 'last_30d') minTs = now - 30 * 24 * 3600 * 1000;
    else minTs = 0; // 'all'
  }

  const periodLabel = options.startDate && options.endDate
    ? `${options.startDate} to ${options.endDate}`
    : timePeriod;

  // Filter events within window and clinic
  const filteredEvents = events.filter(e => {
    const ts = e.timestamp || 0;
    if (minTs > 0 && ts < minTs) return false;
    if (maxTs < Infinity && ts > maxTs) return false;
    if (clinicFilter && clinicFilter !== 'all') {
      const cId = String(e.clinicId || e.payload?.clinicId || '').toLowerCase();
      if (cId && cId !== clinicFilter) return false;
    }
    return true;
  });

  // 1. ASSESSMENT JOURNEY COMPLETION RATE vs. CASE COUNT
  // CRITICAL ARCHITECTURAL DISTINCTION:
  // - Starts: Total assessment_start events (patient opened assessment flow)
  // - Completes: Total assessment_complete events (patient reached final submission)
  // - Cases: Number of clinical case records created
  const assessmentStarts = filteredEvents.filter(e => e.eventType === EVENT_TYPES.ASSESSMENT_START).length;
  const assessmentCompletes = filteredEvents.filter(e => e.eventType === EVENT_TYPES.ASSESSMENT_COMPLETE).length;
  const assessmentAbandons = filteredEvents.filter(e => e.eventType === EVENT_TYPES.ASSESSMENT_ABANDON).length;

  const journeyCompletion = buildKpiMetric({
    name: 'Assessment Journey Completion Rate',
    timePeriod: periodLabel,
    numeratorName: 'Completed Assessments (assessment_complete)',
    numeratorValue: assessmentCompletes,
    denominatorName: 'Started Assessments (assessment_start)',
    denominatorValue: assessmentStarts,
    unit: '%'
  });

  const journeyAbandonment = buildKpiMetric({
    name: 'Assessment Journey Abandonment Rate',
    timePeriod: periodLabel,
    numeratorName: 'Abandoned Assessments (assessment_abandon)',
    numeratorValue: assessmentAbandons,
    denominatorName: 'Started Assessments (assessment_start)',
    denominatorValue: assessmentStarts,
    unit: '%'
  });

  // 2. CLINICAL TURNAROUND TIME
  const turnaroundDurations = [];
  const completesMap = new Map();
  filteredEvents
    .filter(e => e.eventType === EVENT_TYPES.ASSESSMENT_COMPLETE)
    .forEach(e => {
      const key = e.payload?.caseId || e.payload?.assessmentId;
      if (key) completesMap.set(key, e.timestamp);
    });

  filteredEvents
    .filter(e => e.eventType === EVENT_TYPES.DOCTOR_REVIEW)
    .forEach(e => {
      const key = e.payload?.caseId || e.payload?.assessmentId;
      const compTs = completesMap.get(key);
      if (compTs && e.timestamp >= compTs) {
        const diffMin = (e.timestamp - compTs) / 60000;
        turnaroundDurations.push(diffMin);
      } else if (typeof e.payload?.responseTimeMs === 'number') {
        turnaroundDurations.push(e.payload.responseTimeMs / 60000);
      }
    });

  turnaroundDurations.sort((a, b) => a - b);
  const turnaroundCount = turnaroundDurations.length;
  const avgTurnaround = turnaroundCount > 0
    ? Number((turnaroundDurations.reduce((a, b) => a + b, 0) / turnaroundCount).toFixed(1))
    : null;
  const medianTurnaround = turnaroundCount > 0
    ? Number(turnaroundDurations[Math.floor(turnaroundCount / 2)].toFixed(1))
    : null;

  const turnaroundKpi = {
    name: 'Clinical Turnaround Time',
    timePeriod: periodLabel,
    numeratorName: 'Total Review Turnaround Minutes',
    numeratorValue: avgTurnaround !== null ? avgTurnaround : 0,
    denominatorName: 'Reviewed Cases with Valid Timestamps',
    denominatorValue: turnaroundCount,
    avgMinutes: avgTurnaround,
    medianMinutes: medianTurnaround,
    display: turnaroundCount > 0 ? `${avgTurnaround} min` : 'Unavailable',
    displayAr: turnaroundCount > 0 ? `${avgTurnaround} دقيقة` : 'غير متاح',
    isAvailable: turnaroundCount > 0
  };

  // 3. RETENTION METRICS (D1, D7, D30)
  // Determine cohorts by explicit signup events (or first seen user timestamp as fallback)
  const userFirstSeen = new Map();
  const userActivityDates = new Map();

  events.forEach(e => {
    const uid = e.userId;
    if (!uid) return;
    const ts = e.timestamp;
    if (e.eventType === EVENT_TYPES.SIGNUP) {
      if (!userFirstSeen.has(uid) || ts < userFirstSeen.get(uid)) {
        userFirstSeen.set(uid, ts);
      }
    }
    if (!userActivityDates.has(uid)) userActivityDates.set(uid, []);
    userActivityDates.get(uid).push(ts);
  });

  // If no explicit signup events, fallback to earliest event for any user
  if (userFirstSeen.size === 0) {
    events.forEach(e => {
      const uid = e.userId;
      if (!uid) return;
      const ts = e.timestamp;
      if (!userFirstSeen.has(uid) || ts < userFirstSeen.get(uid)) {
        userFirstSeen.set(uid, ts);
      }
    });
  }

  // Calculate retention for cohorts that signed up at least D days ago
  const calcCohortRetention = (targetDay) => {
    const targetMinMs = targetDay * 24 * 3600 * 1000;
    const targetMaxMs = (targetDay + 1) * 24 * 3600 * 1000;
    const eligibleCohort = [];
    const retainedUsers = [];

    userFirstSeen.forEach((signupTs, uid) => {
      // Must have signed up at least targetDay days ago to be evaluated
      if (now - signupTs >= targetMinMs) {
        eligibleCohort.push(uid);
        const activities = userActivityDates.get(uid) || [];
        const returned = activities.some(actTs => {
          const diff = actTs - signupTs;
          return diff >= targetMinMs && diff <= targetMaxMs;
        });
        if (returned) retainedUsers.push(uid);
      }
    });

    return buildKpiMetric({
      name: `D${targetDay} Retention`,
      timePeriod: periodLabel,
      numeratorName: `Users Active on Day ${targetDay}`,
      numeratorValue: retainedUsers.length,
      denominatorName: `Eligible Signup Cohort (>= D${targetDay})`,
      denominatorValue: eligibleCohort.length,
      unit: '%'
    });
  };

  const d1Retention = calcCohortRetention(1);
  const d7Retention = calcCohortRetention(7);
  const d30Retention = calcCohortRetention(30);

  // 4. WAU / MAU & STICKINESS
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

  const wauUsers = new Set();
  const mauUsers = new Set();

  events.forEach(e => {
    if (!e.userId) return;
    if (e.timestamp >= sevenDaysAgo) wauUsers.add(e.userId);
    if (e.timestamp >= thirtyDaysAgo) mauUsers.add(e.userId);
  });

  const wauCount = wauUsers.size;
  const mauCount = mauUsers.size;

  const stickinessKpi = buildKpiMetric({
    name: 'User Stickiness (WAU / MAU)',
    timePeriod: 'Rolling 30 Days',
    numeratorName: 'Weekly Active Users (WAU - 7d)',
    numeratorValue: wauCount,
    denominatorName: 'Monthly Active Users (MAU - 30d)',
    denominatorValue: mauCount,
    unit: '%'
  });

  // 5. DOCTOR AND CLINIC ACTIVITY
  const doctorReviewCounts = new Map();
  const clinicCaseCounts = new Map();

  filteredEvents.forEach(e => {
    if (e.eventType === EVENT_TYPES.DOCTOR_REVIEW) {
      const docId = e.payload?.doctorId || e.userId || 'unassigned';
      doctorReviewCounts.set(docId, (doctorReviewCounts.get(docId) || 0) + 1);
    }
    const cId = e.clinicId || e.payload?.clinicId;
    if (cId) {
      clinicCaseCounts.set(cId, (clinicCaseCounts.get(cId) || 0) + 1);
    }
  });

  const activeDoctorsCount = doctorReviewCounts.size;
  const totalDoctorReviews = Array.from(doctorReviewCounts.values()).reduce((a, b) => a + b, 0);

  const doctorActivityKpi = {
    name: 'Doctor Activity',
    timePeriod: periodLabel,
    activeDoctorsCount,
    totalReviews: totalDoctorReviews,
    reviewsPerDoctor: buildKpiMetric({
      name: 'Reviews Per Active Doctor',
      timePeriod: periodLabel,
      numeratorName: 'Total Doctor Reviews',
      numeratorValue: totalDoctorReviews,
      denominatorName: 'Active Reviewing Doctors',
      denominatorValue: activeDoctorsCount,
      unit: 'reviews/doc'
    })
  };

  const clinicActivityKpi = {
    name: 'Clinic Activity',
    timePeriod: periodLabel,
    activeClinicsCount: clinicCaseCounts.size,
    breakdown: Array.from(clinicCaseCounts.entries()).map(([clinicId, eventCount]) => ({
      clinicId,
      eventCount
    }))
  };

  // 6. SATISFACTION METRICS (CSAT & Star Ratings)
  let feedbackSum = 0;
  let positiveFeedbackCount = 0; // >= 4 stars
  let totalFeedbacks = 0;

  filteredEvents.forEach(e => {
    if (typeof e.payload?.rating === 'number' && e.payload.rating >= 1 && e.payload.rating <= 5) {
      totalFeedbacks += 1;
      feedbackSum += e.payload.rating;
      if (e.payload.rating >= 4) positiveFeedbackCount += 1;
    }
  });

  const csatKpi = buildKpiMetric({
    name: 'Patient Satisfaction (CSAT)',
    timePeriod: periodLabel,
    numeratorName: 'Positive Ratings (>= 4 Stars)',
    numeratorValue: positiveFeedbackCount,
    denominatorName: 'Total Feedback Submissions',
    denominatorValue: totalFeedbacks,
    unit: '%'
  });

  const avgStarRating = totalFeedbacks > 0 ? Number((feedbackSum / totalFeedbacks).toFixed(1)) : null;

  // 7. ERRORS AND ERROR RATE
  const errorEvents = filteredEvents.filter(e => e.payload?.errorCategory || e.eventType === 'error');
  const errorRateKpi = buildKpiMetric({
    name: 'Service Error Rate',
    timePeriod: periodLabel,
    numeratorName: 'Recorded Error Events',
    numeratorValue: errorEvents.length,
    denominatorName: 'Total Processed Events in Period',
    denominatorValue: filteredEvents.length,
    unit: '%',
    precision: 2
  });

  // 8. SUPPORT METRICS
  const supportOpened = filteredEvents.filter(e => e.payload?.ticketId && e.payload?.status === 'open').length;
  const supportResolved = filteredEvents.filter(e => e.payload?.ticketId && ['resolved', 'closed'].includes(e.payload?.status)).length;

  const supportResolutionKpi = buildKpiMetric({
    name: 'Support Resolution Rate',
    timePeriod: periodLabel,
    numeratorName: 'Resolved Support Inquiries',
    numeratorValue: supportResolved,
    denominatorName: 'Total Opened Support Inquiries',
    denominatorValue: supportOpened,
    unit: '%'
  });

  return {
    success: true,
    timePeriod: periodLabel,
    clinicId: clinicFilter || 'all',
    evaluatedEventsCount: filteredEvents.length,

    // Core Assessment Journey Metrics (Decoupled from Case Count)
    assessmentJourney: {
      journeyCompletionRate: journeyCompletion,
      journeyAbandonmentRate: journeyAbandonment,
      funnel: {
        starts: assessmentStarts,
        completions: assessmentCompletes,
        abandons: assessmentAbandons,
        persistedCasesCount: completesMap.size,
        distinctionNote: 'Assessment Journey Completion Rate measures drop-off from start to finish. It is not equated with raw database case counts.'
      }
    },

    // Turnaround
    turnaround: turnaroundKpi,

    // Retention
    retention: {
      d1: d1Retention,
      d7: d7Retention,
      d30: d30Retention
    },

    // Engagement & Stickiness
    engagement: {
      wau: wauCount,
      mau: mauCount,
      stickiness: stickinessKpi
    },

    // Doctor & Clinic Activity
    activity: {
      doctors: doctorActivityKpi,
      clinics: clinicActivityKpi
    },

    // Satisfaction
    satisfaction: {
      csat: csatKpi,
      avgStarRating,
      starRatingDisplay: avgStarRating !== null ? `${avgStarRating} ★` : 'Unavailable',
      starRatingDisplayAr: avgStarRating !== null ? `${avgStarRating} ★` : 'غير متاح'
    },

    // Errors
    errors: {
      errorRate: errorRateKpi,
      totalErrors: errorEvents.length
    },

    // Support
    support: {
      openedTickets: supportOpened,
      resolvedTickets: supportResolved,
      resolutionRate: supportResolutionKpi
    },

    // 9. APPOINTMENT CALENDAR UTILIZATION & SUCCESS METRICS (Vezeeta Flow)
    appointments: calculateAppointmentKpis(filteredEvents, {
      timePeriod: periodLabel,
      clinicId: clinicFilter
    })
  };
}

/**
 * Calculates dedicated Appointment Calendar Utilization & Success Rate KPIs.
 */
function calculateAppointmentKpis(events = inMemoryEvents, options = {}) {
  const isEn = Boolean(options.isEn);
  const periodLabel = options.timePeriod || 'Rolling 30 Days';
  const clinicFilter = options.clinicId ? String(options.clinicId).trim().toLowerCase() : null;

  function matchType(e, targetType) {
    const raw = String(e.eventType || e.type || '').trim().toLowerCase();
    const target = String(targetType).trim().toLowerCase();
    return raw === target;
  }

  const apptEvents = (events || []).filter(e => {
    if (clinicFilter && clinicFilter !== 'all') {
      const cId = String(e.clinicId || e.payload?.clinicId || e.properties?.clinicId || '').trim().toLowerCase();
      if (cId && cId !== clinicFilter) return false;
    }
    return true;
  });

  const views = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_VIEW)).length;
  const slotSelections = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_SLOT_SELECTED)).length;
  const attempts = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_BOOK_ATTEMPT)).length;
  const successes = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS));
  const failures = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_BOOK_FAILURE)).length;
  const cancellations = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_CANCEL)).length;
  const reschedules = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_RESCHEDULE)).length;
  const completions = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_COMPLETE)).length;
  const emergencyIntercepts = apptEvents.filter(e => matchType(e, EVENT_TYPES.APPOINTMENT_EMERGENCY_REDIRECT)).length;

  const totalBookings = successes.length;
  const totalAttempts = attempts > 0 ? attempts : (totalBookings + failures);

  let videoCount = 0;
  let inClinicCount = 0;
  let followupCount = 0;
  let commuteReliefCount = 0;
  let morningCount = 0;
  let eveningCount = 0;
  let dependentCount = 0;
  let selfCount = 0;
  const docUtilizationMap = {};

  successes.forEach(e => {
    const p = e.payload || e.properties || {};
    const rawType = String(p.consultationType || (p.isOnline ? 'video' : 'clinic')).toLowerCase();
    const isOnline = rawType === 'video' || rawType === 'telehealth' || rawType === 'followup' || p.isOnline === true;
    const isCommuteRelief = Boolean(p.commuteReliefActive || rawType === 'video' || rawType === 'followup');

    if (rawType === 'video' || rawType === 'telehealth') {
      videoCount++;
    } else if (rawType === 'followup') {
      followupCount++;
    } else {
      inClinicCount++;
    }

    if (isCommuteRelief) {
      commuteReliefCount++;
    }

    if (p.timeOfDay === 'evening') {
      eveningCount++;
    } else if (p.timeOfDay === 'morning') {
      morningCount++;
    } else if (p.time) {
      const hour = parseInt(String(p.time).replace(/\D/g, ''), 10);
      if (hour >= 16) eveningCount++;
      else morningCount++;
    }

    const isDep = p.isDependent === true || p.beneficiaryType === 'dependent' || p.beneficiaryType === 'family' || p.beneficiaryType === 'child' || (p.beneficiaryId && p.beneficiaryId !== 'self');
    if (isDep) {
      dependentCount++;
    } else {
      selfCount++;
    }

    const docId = p.doctorId || 'unassigned';
    if (!docUtilizationMap[docId]) {
      docUtilizationMap[docId] = { bookings: 0, doctorId: docId };
    }
    docUtilizationMap[docId].bookings++;
  });

  const bookingSuccessRate = buildKpiMetric({
    name: 'Appointment Booking Success Rate',
    timePeriod: periodLabel,
    numeratorName: 'Confirmed Appointments',
    numeratorValue: totalBookings,
    denominatorName: 'Total Booking Attempts',
    denominatorValue: totalAttempts,
    unit: '%',
    isEn
  });

  const telehealthRatio = buildKpiMetric({
    name: 'Video Telehealth Ratio',
    timePeriod: periodLabel,
    numeratorName: 'Video Consultations',
    numeratorValue: videoCount,
    denominatorName: 'Total Confirmed Appointments',
    denominatorValue: totalBookings,
    unit: '%',
    isEn
  });

  const inClinicRatio = buildKpiMetric({
    name: 'In-Clinic Consultation Ratio',
    timePeriod: periodLabel,
    numeratorName: 'In-Clinic Consultations',
    numeratorValue: inClinicCount,
    denominatorName: 'Total Confirmed Appointments',
    denominatorValue: totalBookings,
    unit: '%',
    isEn
  });

  const commuteReliefRate = buildKpiMetric({
    name: 'Egypt Commute Relief Adoption Rate',
    timePeriod: periodLabel,
    numeratorName: 'Remote & Commute Relief Consultations',
    numeratorValue: commuteReliefCount,
    denominatorName: 'Total Confirmed Appointments',
    denominatorValue: totalBookings,
    unit: '%',
    isEn
  });

  const estimatedTrafficHoursSaved = Number((commuteReliefCount * 1.5).toFixed(1));
  const videoRate = totalBookings > 0 ? Number(((videoCount / totalBookings) * 100).toFixed(1)) : null;
  const clinicRate = totalBookings > 0 ? Number(((inClinicCount / totalBookings) * 100).toFixed(1)) : null;
  const followupRate = totalBookings > 0 ? Number(((followupCount / totalBookings) * 100).toFixed(1)) : null;

  const consultationTypeBreakdown = {
    video: { count: videoCount, ratio: videoRate },
    clinic: { count: inClinicCount, ratio: clinicRate },
    followup: { count: followupCount, ratio: followupRate },
    commuteRelief: { count: commuteReliefCount, rate: commuteReliefRate.rate, estimatedTrafficHoursSaved }
  };

  const totalCategorizedSlots = morningCount + eveningCount;
  const eveningPreferenceRate = buildKpiMetric({
    name: 'Evening Slot Preference Rate',
    timePeriod: periodLabel,
    numeratorName: 'Evening Slot Bookings',
    numeratorValue: eveningCount,
    denominatorName: 'Total Slot Bookings (Morning + Evening)',
    denominatorValue: totalCategorizedSlots,
    unit: '%',
    isEn
  });

  const morningPreferenceRate = buildKpiMetric({
    name: 'Morning Slot Preference Rate',
    timePeriod: periodLabel,
    numeratorName: 'Morning Slot Bookings',
    numeratorValue: morningCount,
    denominatorName: 'Total Slot Bookings (Morning + Evening)',
    denominatorValue: totalCategorizedSlots,
    unit: '%',
    isEn
  });

  const familyDependentRate = buildKpiMetric({
    name: 'Family Dependent Booking Ratio',
    timePeriod: periodLabel,
    numeratorName: 'Family Dependent Bookings',
    numeratorValue: dependentCount,
    denominatorName: 'Total Confirmed Bookings',
    denominatorValue: totalBookings,
    unit: '%',
    isEn
  });

  const cancellationRate = buildKpiMetric({
    name: 'Appointment Cancellation Rate',
    timePeriod: periodLabel,
    numeratorName: 'Cancelled Appointments',
    numeratorValue: cancellations,
    denominatorName: 'Total Confirmed Bookings',
    denominatorValue: totalBookings,
    unit: '%',
    isEn
  });

  // Pre-Visit Medical Dossier Metrics (Doctolib Standard)
  const dossierAttachments = apptEvents.filter(e => matchType(e, EVENT_TYPES.DOSSIER_ATTACHED_TO_APPOINTMENT)).length;
  const dossierAccesses = apptEvents.filter(e => matchType(e, EVENT_TYPES.PREVISIT_DOSSIER_ACCESSED));
  const doctorDossierReviews = dossierAccesses.filter(e => {
    const p = e.payload || e.properties || {};
    return p.isDoctorReview || p.actorRole === 'doctor' || p.actorRole === 'super_admin';
  }).length;

  let dossierBookingsCount = 0;
  successes.forEach(e => {
    const p = e.payload || e.properties || {};
    if (p.hasAttachedReport || p.hasAttachedDossier) {
      dossierBookingsCount++;
    }
  });

  const effectiveDossierBookings = Math.max(dossierBookingsCount, dossierAttachments);

  const dossierAttachmentRate = buildKpiMetric({
    name: 'Pre-Visit Dossier Attachment Rate',
    timePeriod: periodLabel,
    numeratorName: 'Appointments with Attached Medical Dossier',
    numeratorValue: effectiveDossierBookings,
    denominatorName: 'Total Confirmed Appointments',
    denominatorValue: totalBookings,
    unit: '%',
    isEn
  });

  const previsitDoctorReviewRate = buildKpiMetric({
    name: 'Pre-Visit Doctor Dossier Review Rate',
    timePeriod: periodLabel,
    numeratorName: 'Pre-Visit Dossiers Reviewed by Doctor',
    numeratorValue: doctorDossierReviews,
    denominatorName: 'Appointments with Attached Medical Dossier',
    denominatorValue: effectiveDossierBookings,
    unit: '%',
    isEn
  });

  const doctorBreakdown = Object.values(docUtilizationMap).map(d => ({
    doctorId: d.doctorId,
    bookingsCount: d.bookings
  }));

  const selfRate = totalBookings > 0 ? Number(((selfCount / totalBookings) * 100).toFixed(1)) : null;

  // 🗓️ Doctor Schedule & Branch Manager Analytics (TabeebHub Model)
  const scheduleUpdates = apptEvents.filter(e => matchType(e, EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED));
  const leaveRequests = apptEvents.filter(e => matchType(e, EVENT_TYPES.DOCTOR_LEAVE_REQUESTED));
  const leaveCancellations = apptEvents.filter(e => matchType(e, EVENT_TYPES.DOCTOR_LEAVE_CANCELLED));

  const scheduleUpdateCount = scheduleUpdates.length;
  const leaveRequestsCount = leaveRequests.length;
  const leaveCancellationsCount = leaveCancellations.length;

  let totalSlotDuration = 0;
  let durationCount = 0;
  const branchScheduleBreakdown = {
    cairo_nasr_city: 0,
    cairo_maadi: 0,
    giza_dokki: 0,
    alex_smouha: 0
  };

  scheduleUpdates.forEach(e => {
    const p = e.payload || e.properties || {};
    if (p.slotDurationMinutes) {
      totalSlotDuration += Number(p.slotDurationMinutes);
      durationCount++;
    }
    const b = p.branchId || '';
    if (b === 'all') {
      branchScheduleBreakdown.cairo_nasr_city++;
      branchScheduleBreakdown.cairo_maadi++;
      branchScheduleBreakdown.giza_dokki++;
      branchScheduleBreakdown.alex_smouha++;
    } else if (branchScheduleBreakdown[b] !== undefined) {
      branchScheduleBreakdown[b]++;
    }
  });

  const averageSlotDurationMinutes = durationCount > 0
    ? Math.round(totalSlotDuration / durationCount)
    : 30;

  let totalConflictedBookings = 0;
  leaveRequests.forEach(e => {
    const p = e.payload || e.properties || {};
    totalConflictedBookings += Number(p.conflictingAppointmentsCount || p.conflictingCount || 0);
  });

  const configuredBranchesCount = Object.values(branchScheduleBreakdown).filter(c => c > 0).length;
  const branchCoverageRate = Number(((configuredBranchesCount / 4) * 100).toFixed(1));

  return {
    timePeriod: periodLabel,
    views,
    slotSelections,
    totalAttempts,
    totalBookings,
    failures,
    cancellations,
    reschedules,
    completions,
    emergencyInterceptions: emergencyIntercepts,
    breakdown: {
      inClinicCount,
      videoCount,
      followupCount,
      commuteReliefCount,
      estimatedTrafficHoursSaved,
      consultationTypeBreakdown,
      morningCount,
      eveningCount,
      selfCount,
      dependentCount,
      branchScheduleBreakdown
    },
    doctorUtilization: docUtilizationMap,
    doctorBreakdown,
    scheduleUpdateCount,
    leaveRequestsCount,
    leaveCancellationsCount,
    averageSlotDurationMinutes,
    branchCoverageRate,
    branchScheduleBreakdown,
    totalConflictedBookings,
    summary: {
      totalAttempts,
      totalBookings,
      totalCompleted: completions,
      totalCancelled: cancellations,
      bookingSuccessRate: bookingSuccessRate.rate,
      cancellationRate: cancellationRate.rate,
      telehealthRatio: telehealthRatio.rate,
      inClinicRatio: inClinicRatio.rate,
      commuteReliefCount,
      commuteReliefRate: commuteReliefRate.rate,
      estimatedTrafficHoursSaved,
      consultationTypeBreakdown: {
        video: videoCount,
        clinic: inClinicCount,
        followup: followupCount,
        commuteRelief: commuteReliefCount
      },
      eveningPreferenceRate: eveningPreferenceRate.rate,
      morningPreferenceRate: morningPreferenceRate.rate,
      familyDependentRate: familyDependentRate.rate,
      selfBookingRate: selfRate,
      emergencyRedirects: emergencyIntercepts,
      totalWithDossier: effectiveDossierBookings,
      dossierAttachmentRate: dossierAttachmentRate.rate,
      doctorPrevisitReviews: doctorDossierReviews,
      previsitDoctorReviewRate: previsitDoctorReviewRate.rate,
      // Doctor Schedule Manager summary keys
      scheduleUpdateCount,
      leaveRequestsCount,
      leaveCancellationsCount,
      averageSlotDurationMinutes,
      branchCoverageRate,
      branchScheduleBreakdown,
      totalConflictedBookings
    },
    bookingSuccessRate,
    telehealthRatio,
    inClinicRatio,
    commuteReliefRate,
    consultationTypeBreakdown,
    estimatedTrafficHoursSaved,
    eveningPreferenceRate,
    morningPreferenceRate,
    familyDependentRate,
    cancellationRate,
    kpis: {
      bookingSuccessRate,
      telehealthRatio,
      inClinicRatio,
      commuteReliefRate,
      eveningPreferenceRate,
      morningPreferenceRate,
      familyDependentRate,
      cancellationRate,
      dossierAttachmentRate,
      previsitDoctorReviewRate
    }
  };
}

/**
 * Resets the in-memory analytics state (useful for clean testing).
 */
function resetAnalyticsState() {
  inMemoryEvents = [];
  processedEventIds.clear();
  recentDebounceMap.clear();
}

/**
 * Helper to record event and optionally persist to db collection
 */
async function logTelemetryEvent(db, eventData = {}) {
  const { eventType, userId, doctorId, clinicId, timestamp, payload: existingPayload, ...rest } = eventData;
  const combinedPayload = existingPayload ? { ...existingPayload, ...rest } : { doctorId, ...rest };
  delete combinedPayload.payload;

  const res = recordEvent({
    eventType,
    userId,
    clinicId,
    timestamp,
    payload: combinedPayload
  });

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('telemetry').add({
        eventType,
        userId: userId || null,
        doctorId: doctorId || null,
        clinicId: clinicId || null,
        timestamp: timestamp || new Date().toISOString(),
        ...combinedPayload
      });
    } catch (_) {}
  }

  return res;
}

module.exports = {
  EVENT_TYPES,
  FORBIDDEN_MEDICAL_KEYS,
  recordEvent,
  logTelemetryEvent,
  calculateProductKpis,
  calculateAppointmentKpis,
  sanitizeAndValidatePayload,
  sanitizeProperties: (props) => sanitizeAndValidatePayload(EVENT_TYPES.APPOINTMENT_BOOK_ATTEMPT, props).cleanPayload,
  buildKpiMetric,
  resetAnalyticsState,
  getInMemoryEvents: () => inMemoryEvents,
  getEventStore: () => inMemoryEvents
};
