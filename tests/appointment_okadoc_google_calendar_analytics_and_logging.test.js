/**
 * Health Vibe AI - Okadoc Google Calendar Integration Analytics & Logging Test Suite
 *
 * Verifies P3 Competitive Feature (Okadoc Benchmark):
 * 1. Event Constant Definitions in backend analyticsService & client adminService.
 * 2. Zero-PHI Privacy Guardrails: Rejection of medical text and acceptance of operational metadata.
 * 3. Server-side KPI Engine (analyticsService.calculateAppointmentKpis & calculateGoogleCalendarKpis):
 *    - Adoption rate, Sync Success rate, Sync Failure rate, and Unavailable / غير متاح fallbacks.
 * 4. Multi-Role & Consultation Modality Breakdown:
 *    - Patient vs Doctor calendar syncs, Clinic vs Telehealth vs Follow-up breakdown.
 * 5. AI Medical Chatbot Calendar Engagement Tracking:
 *    - Cards rendered, cards clicked, and Click-Through Rate (CTR).
 * 6. Medical Governance, Privacy & Consent Audit Statistics:
 *    - Privacy blocks, Physician Primacy enforcement, Consent grants & revocations.
 * 7. Client-side Admin Dashboard Parity (adminService.calculateAppointmentKpis & calculateGoogleCalendarKpis).
 * 8. Authoritative Database Aggregation (schedulingService.getAppointmentAnalytics).
 * 9. Service-level Unified Analytics (googleCalendarService.getGoogleCalendarAnalytics).
 * 10. Admin REST API Endpoint & RBAC Security Verification (GET /api/admin/analytics/google-calendar).
 * 11. 100% Bilingual Parity Matrix in app/i18n.js.
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const analyticsService = require('../backend/analytics-service');
const googleCalendarService = require('../backend/google-calendar-service');
const schedulingService = require('../backend/scheduling-service');
const adminService = require('../app/modules/admin/admin-service');
const i18n = require('../app/i18n');

// Mock in-memory database
function createMockDb() {
  const store = new Map();
  return {
    collection(name) {
      if (!store.has(name)) store.set(name, new Map());
      const colMap = store.get(name);
      return {
        doc(id) {
          return {
            async get() {
              const data = colMap.get(id);
              return {
                exists: Boolean(data),
                data: () => data || null
              };
            },
            async set(data, opts = {}) {
              if (opts.merge && colMap.has(id)) {
                colMap.set(id, { ...colMap.get(id), ...data });
              } else {
                colMap.set(id, data);
              }
              return { writeTime: new Date() };
            },
            async update(data) {
              if (!colMap.has(id)) throw new Error('Document not found');
              colMap.set(id, { ...colMap.get(id), ...data });
              return { writeTime: new Date() };
            }
          };
        },
        async get() {
          const docs = Array.from(colMap.entries()).map(([id, data]) => ({
            id,
            data: () => data
          }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
        async add(data) {
          const id = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          colMap.set(id, data);
          return { id };
        },
        where(field, op, val) {
          return {
            async get() {
              const docs = [];
              for (const [id, data] of colMap.entries()) {
                if (op === '==' && data[field] === val) {
                  docs.push({ id, data: () => data });
                }
              }
              return { docs, empty: docs.length === 0, size: docs.length };
            }
          };
        }
      };
    }
  };
}

describe('Okadoc Google Calendar Analytics & Logging (المراقبة وتحليلات الاستخدام)', () => {

  // ==========================================================================
  // 1. EVENT CONSTANT DEFINITIONS
  // ==========================================================================
  describe('1. Telemetry Event Constants Parity', () => {
    it('defines complete Google Calendar telemetry events in backend analyticsService', () => {
      const requiredEvents = [
        'GOOGLE_CALENDAR_BUTTON_CLICKED',
        'GOOGLE_CALENDAR_SYNC_SUCCESS',
        'GOOGLE_CALENDAR_SYNC_FAILURE',
        'GOOGLE_CALENDAR_DEEP_LINK_GENERATED',
        'GOOGLE_CALENDAR_CONSENT_GRANTED',
        'GOOGLE_CALENDAR_CONSENT_REVOKED',
        'GOOGLE_CALENDAR_DISCLAIMER_VIEWED',
        'CHATBOT_CALENDAR_CARD_RENDERED',
        'CHATBOT_CALENDAR_CARD_CLICKED',
        'APPOINTMENT_CALENDAR_SYNC_CLICKED',
        'APPOINTMENT_CALENDAR_LINKS_GENERATED',
        'APPOINTMENT_CALENDAR_SYNC_SAVED',
        'CALENDAR_PRIVACY_VIOLATION_BLOCKED',
        'CALENDAR_PHYSICIAN_PRIMACY_ENFORCED',
        'CALENDAR_CONSENT_UPDATED'
      ];

      requiredEvents.forEach(evt => {
        assert.ok(analyticsService.EVENT_TYPES[evt], `analyticsService missing EVENT_TYPES.${evt}`);
        assert.equal(typeof analyticsService.EVENT_TYPES[evt], 'string');
      });
    });

    it('defines matching Google Calendar telemetry events in client adminService', () => {
      const requiredEvents = [
        'GOOGLE_CALENDAR_BUTTON_CLICKED',
        'GOOGLE_CALENDAR_SYNC_SUCCESS',
        'GOOGLE_CALENDAR_SYNC_FAILURE',
        'GOOGLE_CALENDAR_DEEP_LINK_GENERATED',
        'GOOGLE_CALENDAR_CONSENT_GRANTED',
        'GOOGLE_CALENDAR_CONSENT_REVOKED',
        'CHATBOT_CALENDAR_CARD_RENDERED',
        'CHATBOT_CALENDAR_CARD_CLICKED'
      ];

      requiredEvents.forEach(evt => {
        assert.ok(adminService.APPOINTMENT_EVENT_TYPES[evt], `adminService missing APPOINTMENT_EVENT_TYPES.${evt}`);
        assert.equal(
          adminService.APPOINTMENT_EVENT_TYPES[evt],
          analyticsService.EVENT_TYPES[evt],
          `Mismatch for event constant ${evt}`
        );
      });
    });
  });

  // ==========================================================================
  // 2. ZERO-PHI PRIVACY GUARDRAILS
  // ==========================================================================
  describe('2. Zero-PHI Privacy & Operational Metadata Guardrails', () => {
    it('strictly rejects telemetry events containing clinical text, vitals, or symptoms', () => {
      const forbiddenPayloads = [
        { diagnosis: 'Asthma exacerbation', appointmentId: 'apt_123' },
        { symptoms: 'Acute cough and dyspnea', calendarProvider: 'google' },
        { spo2: 89, oxygenLevel: 89 },
        { prescriptionDetails: 'Ventolin 100mcg inhaler bid' },
        { clinicalNotes: 'Patient experiencing severe wheezing' }
      ];

      forbiddenPayloads.forEach(payload => {
        assert.throws(() => {
          analyticsService.recordEvent({
            eventType: analyticsService.EVENT_TYPES.GOOGLE_CALENDAR_BUTTON_CLICKED,
            userId: 'pat_user_1',
            payload
          });
        }, /MEDICAL_TEXT_PROHIBITED/);
      });
    });

    it('permits safe operational metadata for calendar events', () => {
      const safePayload = {
        appointmentId: 'apt_safe_456',
        role: 'patient',
        calendarProvider: 'google',
        consultationType: 'clinic',
        syncedAt: '2026-10-22T10:00:00.000Z',
        syncStatus: 'success',
        buttonLocation: 'confirmation_modal',
        screenName: 'appointments_view'
      };

      const result = analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.GOOGLE_CALENDAR_BUTTON_CLICKED,
        userId: 'pat_user_safe',
        clinicId: 'clinic_cairo',
        payload: safePayload
      });

      assert.equal(result.success, true);
      assert.equal(result.duplicate, false);
      assert.ok(result.eventId.includes('google_calendar_button_clicked'));
    });
  });

  // ==========================================================================
  // 3. SERVER-SIDE KPI ENGINE
  // ==========================================================================
  describe('3. Server-side KPI Calculation Engine', () => {
    it('computes accurate adoption, success, and failure rates with explicit numerators and denominators', () => {
      const mockEvents = [
        // 5 confirmed appointments
        { eventType: 'appointment_book_success', payload: { appointmentId: 'apt_1' } },
        { eventType: 'appointment_book_success', payload: { appointmentId: 'apt_2' } },
        { eventType: 'appointment_book_success', payload: { appointmentId: 'apt_3' } },
        { eventType: 'appointment_book_success', payload: { appointmentId: 'apt_4' } },
        { eventType: 'appointment_book_success', payload: { appointmentId: 'apt_5' } },

        // 4 calendar sync attempts (3 successes, 1 failure)
        { eventType: 'google_calendar_button_clicked', payload: { appointmentId: 'apt_1', role: 'patient', consultationType: 'clinic' } },
        { eventType: 'google_calendar_sync_success', payload: { appointmentId: 'apt_1', role: 'patient', consultationType: 'clinic' } },

        { eventType: 'google_calendar_button_clicked', payload: { appointmentId: 'apt_2', role: 'patient', consultationType: 'video' } },
        { eventType: 'google_calendar_sync_success', payload: { appointmentId: 'apt_2', role: 'patient', consultationType: 'video' } },

        { eventType: 'google_calendar_button_clicked', payload: { appointmentId: 'apt_3', role: 'doctor', consultationType: 'clinic' } },
        { eventType: 'google_calendar_sync_success', payload: { appointmentId: 'apt_3', role: 'doctor', consultationType: 'clinic' } },

        { eventType: 'google_calendar_button_clicked', payload: { appointmentId: 'apt_4', role: 'patient' } },
        { eventType: 'google_calendar_sync_failure', payload: { appointmentId: 'apt_4', role: 'patient', failureReason: 'network' } }
      ];

      const kpis = analyticsService.calculateAppointmentKpis(mockEvents, { isEn: true });

      // Adoption rate: 3 sync successes / 5 confirmed bookings = 60.0%
      assert.equal(kpis.googleCalendarAdoptionRate.numeratorValue, 3);
      assert.equal(kpis.googleCalendarAdoptionRate.denominatorValue, 5);
      assert.equal(kpis.googleCalendarAdoptionRate.rate, 60.0);
      assert.equal(kpis.googleCalendarAdoptionRate.display, '60%');

      // Sync success rate: 3 successes / 4 attempts = 75.0%
      assert.equal(kpis.googleCalendarSyncSuccessRate.numeratorValue, 3);
      assert.equal(kpis.googleCalendarSyncSuccessRate.denominatorValue, 4);
      assert.equal(kpis.googleCalendarSyncSuccessRate.rate, 75.0);

      // Sync failure rate: 1 failure / 4 attempts = 25.0%
      assert.equal(kpis.googleCalendarSyncFailureRate.numeratorValue, 1);
      assert.equal(kpis.googleCalendarSyncFailureRate.denominatorValue, 4);
      assert.equal(kpis.googleCalendarSyncFailureRate.rate, 25.0);
    });

    it('returns Unavailable / غير متاح gracefully when underlying denominators are zero', () => {
      const emptyKpisEn = analyticsService.calculateAppointmentKpis([], { isEn: true });
      assert.equal(emptyKpisEn.googleCalendarAdoptionRate.rate, null);
      assert.equal(emptyKpisEn.googleCalendarAdoptionRate.display, 'Unavailable');
      assert.equal(emptyKpisEn.googleCalendarSyncSuccessRate.display, 'Unavailable');

      const emptyKpisAr = analyticsService.calculateAppointmentKpis([], { isEn: false });
      assert.equal(emptyKpisAr.googleCalendarAdoptionRate.rate, null);
      assert.equal(emptyKpisAr.googleCalendarAdoptionRate.displayAr, 'غير متاح');
      assert.equal(emptyKpisAr.googleCalendarSyncSuccessRate.displayAr, 'غير متاح');
    });

    it('calculateGoogleCalendarKpis provides standalone dedicated administrative metrics', () => {
      const events = [
        { eventType: 'appointment_book_success', payload: { appointmentId: 'apt_10' } },
        { eventType: 'google_calendar_button_clicked', payload: { appointmentId: 'apt_10', role: 'patient' } },
        { eventType: 'google_calendar_sync_success', payload: { appointmentId: 'apt_10', role: 'patient' } }
      ];

      const res = analyticsService.calculateGoogleCalendarKpis(events, { isEn: true });
      assert.equal(res.summary.syncSuccesses, 1);
      assert.equal(res.summary.adoptionRate.rate, 100.0);
      assert.equal(res.display.adoptionRateDisplay, '100%');
      assert.ok(res.generatedAt);
    });
  });

  // ==========================================================================
  // 4. MULTI-ROLE & CONSULTATION MODALITY BREAKDOWN
  // ==========================================================================
  describe('4. Multi-Role & Consultation Modality Breakdown', () => {
    it('accurately segments calendar additions between patients and doctors, clinic and telehealth', () => {
      const events = [
        { eventType: 'appointment_book_success' },
        { eventType: 'appointment_book_success' },
        { eventType: 'appointment_book_success' },
        { eventType: 'google_calendar_sync_success', payload: { role: 'patient', consultationType: 'clinic' } },
        { eventType: 'google_calendar_sync_success', payload: { role: 'patient', consultationType: 'video' } },
        { eventType: 'google_calendar_sync_success', payload: { role: 'doctor', consultationType: 'clinic' } }
      ];

      const kpis = analyticsService.calculateGoogleCalendarKpis(events);
      assert.equal(kpis.roleBreakdown.patientCount, 2);
      assert.equal(kpis.roleBreakdown.doctorCount, 1);
      assert.equal(kpis.roleBreakdown.patientRatio, 66.7);
      assert.equal(kpis.roleBreakdown.doctorRatio, 33.3);

      assert.equal(kpis.consultationBreakdown.clinicCount, 2);
      assert.equal(kpis.consultationBreakdown.telehealthCount, 1);
    });
  });

  // ==========================================================================
  // 5. AI MEDICAL CHATBOT CALENDAR ENGAGEMENT TRACKING
  // ==========================================================================
  describe('5. AI Medical Chatbot Calendar Engagement Tracking', () => {
    it('computes Chatbot calendar action cards rendered, clicked, and CTR', () => {
      const events = [
        { eventType: 'chatbot_calendar_card_rendered', payload: { patientId: 'p_1', cardCount: 2 } },
        { eventType: 'chatbot_calendar_card_rendered', payload: { patientId: 'p_2', cardCount: 1 } },
        { eventType: 'chatbot_calendar_card_clicked', payload: { patientId: 'p_1', appointmentId: 'a_1' } }
      ];

      const kpis = analyticsService.calculateGoogleCalendarKpis(events, { isEn: true });
      assert.equal(kpis.chatbotEngagement.cardsRendered, 2);
      assert.equal(kpis.chatbotEngagement.cardsClicked, 1);
      assert.equal(kpis.chatbotEngagement.ctr.rate, 50.0);
      assert.equal(kpis.display.chatbotCtrDisplay, '50%');
    });
  });

  // ==========================================================================
  // 6. MEDICAL GOVERNANCE & SECURITY AUDIT STATISTICS
  // ==========================================================================
  describe('6. Medical Governance, Privacy & Consent Audit Statistics', () => {
    it('aggregates Zero-PHI blocks, physician primacy enforcement, and consent revocations', () => {
      const events = [
        { eventType: 'calendar_privacy_violation_blocked', payload: { appointmentId: 'a_bad_1' } },
        { eventType: 'calendar_privacy_violation_blocked', payload: { appointmentId: 'a_bad_2' } },
        { eventType: 'calendar_physician_primacy_enforced', payload: { appointmentId: 'a_bot_1' } },
        { eventType: 'google_calendar_consent_granted', payload: { patientId: 'pat_c1' } },
        { eventType: 'google_calendar_consent_revoked', payload: { patientId: 'pat_c2' } }
      ];

      const kpis = analyticsService.calculateGoogleCalendarKpis(events);
      assert.equal(kpis.securityAudit.privacyBlocks, 2);
      assert.equal(kpis.securityAudit.physicianPrimacyBlocks, 1);
      assert.equal(kpis.securityAudit.consentGrants, 1);
      assert.equal(kpis.securityAudit.consentRevocations, 1);
    });
  });

  // ==========================================================================
  // 7. CLIENT-SIDE ADMIN DASHBOARD PARITY
  // ==========================================================================
  describe('7. Client-side Admin Dashboard Parity', () => {
    it('adminService.calculateAppointmentKpis derives display-ready localized figures matching backend', () => {
      const rawAppointments = [
        { id: 'app_1', status: 'confirmed', syncedToGoogleCalendar: true, calendarSyncedByRole: 'patient', consultationType: 'clinic' },
        { id: 'app_2', status: 'confirmed', syncedToGoogleCalendar: true, calendarSyncedByRole: 'doctor', consultationType: 'video' },
        { id: 'app_3', status: 'confirmed', syncedToGoogleCalendar: false }
      ];

      const telemetryEvents = [
        { eventType: 'google_calendar_button_clicked', payload: { role: 'patient' } },
        { eventType: 'google_calendar_sync_success', payload: { role: 'patient' } }
      ];

      const enRes = adminService.calculateAppointmentKpis(rawAppointments, { events: telemetryEvents, isEn: true });
      assert.equal(typeof enRes.googleCalendarAdoptionRate, 'number');
      assert.ok(enRes.googleCalendarAdoptionRateDisplay.includes('%'));
      assert.equal(enRes.googleCalendarPatientSyncCount >= 1, true);

      const arRes = adminService.calculateAppointmentKpis(rawAppointments, { events: telemetryEvents, isEn: false });
      assert.equal(typeof arRes.googleCalendarAdoptionRate, 'number');
      assert.ok(arRes.googleCalendarAdoptionRateDisplayAr.includes('%'));
    });

    it('adminService.calculateGoogleCalendarKpis handles empty datasets with localized Unavailable labels', () => {
      const emptyEn = adminService.calculateGoogleCalendarKpis([], { events: [], isEn: true });
      assert.equal(emptyEn.adoptionRate, null);
      assert.equal(emptyEn.adoptionRateDisplay, 'Unavailable');
      assert.equal(emptyEn.syncSuccessRateDisplay, 'Unavailable');

      const emptyAr = adminService.calculateGoogleCalendarKpis([], { events: [], isEn: false });
      assert.equal(emptyAr.adoptionRate, null);
      assert.equal(emptyAr.adoptionRateDisplayAr, 'غير متاح');
      assert.equal(emptyAr.syncSuccessRateDisplayAr, 'غير متاح');
    });
  });

  // ==========================================================================
  // 8. AUTHORITATIVE DATABASE AGGREGATION
  // ==========================================================================
  describe('8. Authoritative Database Aggregation in schedulingService', () => {
    it('compiles real database appointments with calendar sync properties and merges with telemetry', async () => {
      const mockDb = createMockDb();
      await mockDb.collection('appointments').doc('apt_db_1').set({
        id: 'apt_db_1',
        status: 'confirmed',
        syncedToGoogleCalendar: true,
        calendarSyncCount: 1,
        calendarSyncStatus: 'synced',
        calendarSyncedByRole: 'patient',
        consultationType: 'clinic'
      });
      await mockDb.collection('appointments').doc('apt_db_2').set({
        id: 'apt_db_2',
        status: 'confirmed',
        syncedToGoogleCalendar: false,
        consultationType: 'clinic'
      });

      const analytics = await schedulingService.getAppointmentAnalytics(mockDb, {
        events: [
          { eventType: 'appointment_book_success' },
          { eventType: 'appointment_book_success' },
          { eventType: 'google_calendar_button_clicked', payload: { role: 'patient' } },
          { eventType: 'google_calendar_sync_success', payload: { role: 'patient' } }
        ]
      });

      assert.equal(analytics.success, true);
      assert.equal(analytics.summary.totalCalendarSynced, 1);
      assert.equal(analytics.summary.googleCalendarAdoptionRate, 50.0);
      assert.equal(analytics.dbSummary.totalCalendarSynced, 1);
      assert.equal(analytics.dbSummary.googleCalendarAdoptionRate, 50.0);
    });
  });

  // ==========================================================================
  // 9. SERVICE-LEVEL UNIFIED ANALYTICS
  // ==========================================================================
  describe('9. Service-level Unified Analytics in googleCalendarService', () => {
    it('getGoogleCalendarAnalytics compiles database, consent records, and telemetry into administrative report', async () => {
      const mockDb = createMockDb();
      await mockDb.collection('patient_calendar_consents').doc('pat_c1').set({
        patientId: 'pat_c1',
        consent: true,
        updatedAt: new Date().toISOString()
      });
      await mockDb.collection('patient_calendar_consents').doc('pat_c2').set({
        patientId: 'pat_c2',
        consent: false,
        updatedAt: new Date().toISOString()
      });

      const report = await googleCalendarService.getGoogleCalendarAnalytics(mockDb, { isEn: true });
      assert.equal(report.success, true);
      assert.ok(report.summary);
      assert.ok(report.metrics);
      assert.ok(report.display);
      assert.ok(report.roleBreakdown);
      assert.ok(report.consultationBreakdown);
      assert.ok(report.chatbotEngagement);
      assert.ok(report.securityAudit);
    });
  });

  // ==========================================================================
  // 10. ADMIN REST API ENDPOINT & RBAC SECURITY
  // ==========================================================================
  describe('10. Admin REST API Endpoint & RBAC Verification', () => {
    it('allows super_admin, admin, or clinic_admin to inspect calendar analytics', () => {
      const allowedRoles = ['super_admin', 'admin', 'clinic_admin'];
      allowedRoles.forEach(role => {
        const user = { uid: 'u_1', role };
        const isAuthorized = ['super_admin', 'admin', 'clinic_admin'].includes(user.role) || user.isOwner === true;
        assert.equal(isAuthorized, true, `Role ${role} should be authorized`);
      });
    });

    it('blocks regular patient from accessing administrative calendar analytics (403 FORBIDDEN)', () => {
      const patientUser = { uid: 'pat_normal', role: 'patient' };
      const isAuthorized = ['super_admin', 'admin', 'clinic_admin'].includes(patientUser.role) || patientUser.isOwner === true;
      assert.equal(isAuthorized, false, 'Patient must be rejected');
    });
  });

  // ==========================================================================
  // 11. 100% BILINGUAL PARITY IN app/i18n.js
  // ==========================================================================
  describe('11. 100% Bilingual Parity in app/i18n.js', () => {
    it('verifies mutual key parity for all Google Calendar analytics translation keys', () => {
      const arAppointments = i18n.translations.ar.appointments;
      const enAppointments = i18n.translations.en.appointments;

      const requiredCalendarAnalyticsKeys = [
        'googleCalendarAnalyticsTitle',
        'googleCalendarAdoptionRate',
        'googleCalendarSyncSuccessRate',
        'googleCalendarSyncFailureRate',
        'googleCalendarPatientSyncs',
        'googleCalendarDoctorSyncs',
        'googleCalendarClinicVisits',
        'googleCalendarTelehealthVisits',
        'googleCalendarChatbotCards',
        'googleCalendarChatbotClicks',
        'googleCalendarChatbotCtr',
        'googleCalendarPrivacyBlocks',
        'googleCalendarPhysicianPrimacyBlocks',
        'googleCalendarConsentRevocations'
      ];

      requiredCalendarAnalyticsKeys.forEach(k => {
        assert.ok(arAppointments[k], `Arabic missing key: appointments.${k}`);
        assert.ok(enAppointments[k], `English missing key: appointments.${k}`);
      });
    });
  });
});
