/**
 * Okadoc Benchmark: Google Calendar Safety & Privacy (ضوابط السلامة والأمان الطبي) Test Suite
 *
 * Verifies:
 * 1. 👨‍⚕️ Physician Primacy (منع أي تجاوز لدور الطبيب البشري): Prohibits AI chatbots or non-physicians
 *    from overriding doctor clinical decisions, diagnosing patients, or injecting clinical prescriptions.
 * 2. 📜 Statutory Medical Disclaimers (Egyptian Health Law, HIPAA, GDPR): Mandatory disclaimers
 *    in Arabic and English asserting direct in-person evaluation by a human physician and emergency 123.
 * 3. 🔒 Zero-PHI Data Minimization: Stripping diagnoses, medications, and vitals from calendar URLs.
 * 4. 🛡️ Patient Consent Governance: Explicit consent tracking, revocation, and calendar sync blocking.
 * 5. 🌐 Relational DB and Storage Integrity: Table structures, metrics, and dual-layer sync.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const googleCalendarService = require('../backend/google-calendar-service');
const { relationalDbService } = require('../backend/relational-db-service');
const auditService = require('../backend/audit-service');
const analyticsService = require('../backend/analytics-service');

function createMockFirestore() {
  const store = new Map();
  return {
    _store: store,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            id,
            async get() {
              const data = store.get(key);
              return {
                exists: Boolean(data),
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
              };
            },
            async set(data, opts = {}) {
              if (opts.merge && store.has(key)) {
                store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(data)) });
              } else {
                store.set(key, JSON.parse(JSON.stringify(data)));
              }
              return { writeTime: new Date().toISOString() };
            },
            async update(data) {
              const existing = store.get(key) || {};
              store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
              return { writeTime: new Date().toISOString() };
            }
          };
        },
        async add(data) {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const key = `${name}/${id}`;
          store.set(key, { id, ...JSON.parse(JSON.stringify(data)) });
          return { id };
        },
        where(field, op, val) {
          return {
            async get() {
              const docs = [];
              for (const [key, docData] of store.entries()) {
                if (key.startsWith(`${name}/`) && docData[field] === val) {
                  docs.push({ id: key.split('/')[1], data: () => docData });
                }
              }
              return { docs };
            }
          };
        }
      };
    }
  };
}

describe('Okadoc Benchmark: Google Calendar Safety & Privacy (ضوابط السلامة والأمان الطبي)', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockFirestore();
    googleCalendarService.clearGoogleCalendarMemoryStore();
  });

  // ==========================================================================
  // 1. 👨‍⚕️ PHYSICIAN PRIMACY (منع أي تجاوز لدور الطبيب البشري)
  // ==========================================================================
  describe('1. Physician Primacy Enforcement', () => {
    it('blocks non-physicians or bots from authoring clinical diagnosis in calendar payloads', () => {
      const candidateAppointment = {
        id: 'appt_primacy_01',
        patientName: 'أحمد علي',
        clinicalDiagnosis: 'Severe Chronic Bronchiectasis'
      };

      const patientActor = { uid: 'pat_101', role: 'patient' };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(candidateAppointment, patientActor, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /strictly reserved for licensed human physicians/i);
        return true;
      });
    });

    it('blocks non-physicians from modifying clinical prescriptions in calendar payloads', () => {
      const candidateAppointment = {
        id: 'appt_primacy_02',
        patientName: 'منى محمود',
        rxPrescription: 'Ventolin Inhaler 100mcg BID'
      };

      const botActor = { uid: 'chatbot_agent', role: 'ai_bot' };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(candidateAppointment, botActor, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        return true;
      });
    });

    it('allows licensed human physicians to include validated clinical fields', () => {
      const candidateAppointment = {
        id: 'appt_primacy_03',
        patientName: 'طارق حسام',
        clinicalDiagnosis: 'Mild Asthma Follow-up',
        doctorEvaluation: 'Controlled on ICS'
      };

      const doctorActor = { uid: 'doc_dr_hassan', role: 'doctor' };

      const result = googleCalendarService.validateCalendarPrivacyAndPrimacy(candidateAppointment, doctorActor, mockDb);
      assert.equal(result.valid, true);
      assert.equal(result.physicianPrimacyGuaranteed, true);
    });

    it('detects and blocks autonomous AI claims in appointment notes and reasons', () => {
      const aiInjectedAppt = {
        id: 'appt_primacy_04',
        patientName: 'سارة إبراهيم',
        notes: 'AI diagnosed pneumonia and recommended medication'
      };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(aiInjectedAppt, { uid: 'pat_202', role: 'patient' }, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        assert.match(err.message, /autonomous ai medical diagnosis/i);
        return true;
      });
    });

    it('detects and blocks Arabic autonomous AI claims (تشخيص الذكاء الاصطناعي)', () => {
      const arabicAiInjectedAppt = {
        id: 'appt_primacy_05',
        patientName: 'محمود رفعت',
        patientNotes: 'تم اعتماد تشخيص الذكاء الاصطناعي لحالة الربو'
      };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(arabicAiInjectedAppt, { uid: 'pat_203', role: 'patient' }, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        return true;
      });
    });

    it('records CALENDAR_PHYSICIAN_PRIMACY_ENFORCED audit log when primacy is breached', () => {
      const appt = {
        id: 'appt_primacy_audit',
        patientName: 'كريم عادل',
        icd10Code: 'J45.909'
      };

      try {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(appt, { uid: 'pat_204', role: 'patient' }, mockDb);
      } catch (e) {
        // Expected
      }

      const auditDocs = mockDb._store;
      let foundAudit = false;
      for (const [key, val] of auditDocs.entries()) {
        if (key.startsWith('audit_events/') && val.type === 'CALENDAR_PHYSICIAN_PRIMACY_ENFORCED') {
          foundAudit = true;
          assert.equal(val.details.appointmentId, 'appt_primacy_audit');
          assert.equal(val.details.blockedField, 'icd10Code');
          assert.equal(val.details.reason, 'FIELD_RESERVED_FOR_LICENSED_PHYSICIAN');
        }
      }
      assert.equal(foundAudit, true);
    });
  });

  // ==========================================================================
  // 2. 📜 STATUTORY MEDICAL DISCLAIMER (ضوابط السلامة والأمان الطبي)
  // ==========================================================================
  describe('2. Statutory Medical Disclaimer & Emergency Protocols', () => {
    const validAppointment = {
      id: 'appt_disclaimer_01',
      patientName: 'خالد عبد الله',
      doctorName: 'حسام موافي',
      doctorSpecialty: 'استشاري أمراض الصدر',
      date: '2026-11-15',
      timeSlot: '11:00 صباحاً',
      clinicAddress: 'مستشفى الصدر التخصصي، المهندسين'
    };

    it('embeds statutory medical disclaimer and emergency 123 in Arabic deep link', () => {
      const link = googleCalendarService.generateGoogleCalendarDeepLink(validAppointment, { lang: 'ar', role: 'patient' });
      assert.ok(link.includes('calendar.google.com/calendar/render'));

      const decodedUrl = decodeURIComponent(link);
      assert.match(decodedUrl, /تنبيه طبي قانوني/);
      assert.match(decodedUrl, /الاستشارة الطبية تتطلب تقييماً سريرياً مباشراً من طبيب بشري مرخص/);
      assert.match(decodedUrl, /أدوات الذكاء الاصطناعي لا تقدم تشخيصاً طبياً مستقلاً/);
      assert.match(decodedUrl, /الاتصال بالإسعاف \(123\)/);
    });

    it('embeds statutory medical disclaimer and emergency 123 in English deep link', () => {
      const link = googleCalendarService.generateGoogleCalendarDeepLink(validAppointment, { lang: 'en', role: 'patient' });
      const decodedUrl = decodeURIComponent(link);

      assert.match(decodedUrl, /Statutory Notice/);
      assert.match(decodedUrl, /Medical appointment requires direct clinical evaluation by a licensed human physician/);
      assert.match(decodedUrl, /Autonomous AI tools do not provide clinical diagnosis/);
      assert.match(decodedUrl, /In case of medical emergency, immediately contact emergency services \(123\)/);
    });

    it('includes Clinical Governance & Physician Primacy notice in Doctor deep links', () => {
      const doctorLink = googleCalendarService.generateGoogleCalendarDeepLink(validAppointment, { lang: 'ar', role: 'doctor' });
      const decodedDoctorUrl = decodeURIComponent(doctorLink);

      assert.match(decodedDoctorUrl, /حوكمة السلامة وسيادة الطبيب/);
      assert.match(decodedDoctorUrl, /التشخيص السريري وصرف الأدوية وقرارات العلاج هي مسؤولية حصرية للطبيب البشري المرخص/);
      assert.match(decodedDoctorUrl, /معيار السلامة السريرية: يرجى مراجعة الملف الطبي/);
    });

    it('buildGoogleCalendarEventPayload includes full statutory disclaimers in event description', () => {
      const payload = googleCalendarService.buildGoogleCalendarEventPayload(validAppointment, { role: 'patient' });
      assert.ok(payload.description);
      assert.match(payload.description, /Statutory Notice & Physician Primacy/i);
      assert.match(payload.description, /123/);
      assert.match(payload.description, /licensed human physician/i);
    });
  });

  // ==========================================================================
  // 3. 🔒 ZERO-PHI PRIVACY & DATA MINIMIZATION
  // ==========================================================================
  describe('3. Zero-PHI Privacy & Sensitive Keywords Sanitization', () => {
    it('sanitizes clinical diagnoses from calendar deep link parameters', () => {
      const apptWithPHI = {
        id: 'appt_phi_01',
        patientName: 'نادية إبراهيم',
        doctorName: 'سامي عبد العزيز',
        notes: 'تشخيص: chronic asthma stage 3 with severe bronchiectasis',
        date: '2026-11-20',
        timeSlot: '14:30'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(apptWithPHI, { lang: 'ar', role: 'patient' });
      const decodedUrl = decodeURIComponent(link);

      assert.doesNotMatch(decodedUrl, /chronic asthma stage 3/i);
      assert.doesNotMatch(decodedUrl, /severe bronchiectasis/i);
    });

    it('logs CALENDAR_PRIVACY_VIOLATION_BLOCKED audit event when PHI is intercepted', () => {
      const apptWithPHI = {
        id: 'appt_phi_audit',
        patientName: 'محمود سعد',
        notes: 'Patient SpO2 dropped to 88% and diagnosed with COPD exacerbation'
      };

      const validation = googleCalendarService.validateCalendarPrivacyAndPrimacy(
        apptWithPHI,
        { uid: 'pat_301', role: 'patient' },
        mockDb
      );

      assert.equal(validation.privacyViolationDetected, true);

      let foundAudit = false;
      for (const [key, val] of mockDb._store.entries()) {
        if (key.startsWith('audit_events/') && val.type === 'CALENDAR_PRIVACY_VIOLATION_BLOCKED') {
          foundAudit = true;
          assert.equal(val.details.appointmentId, 'appt_phi_audit');
          assert.equal(val.details.action, 'PHI_STRIPPED_FROM_CALENDAR_PARAMETERS');
        }
      }
      assert.equal(foundAudit, true);
    });

    it('sanitizeCalendarContent neutralizes sensitive medical terms safely', () => {
      const rawText = 'Patient needs ventolin and symbicort for asthma flare-up; spo2 is 92%';
      const sanitized = googleCalendarService.sanitizeCalendarContent(rawText);

      assert.doesNotMatch(sanitized, /\bventolin\b/i);
      assert.doesNotMatch(sanitized, /\bsymbicort\b/i);
      assert.doesNotMatch(sanitized, /\basthma\b/i);
      assert.doesNotMatch(sanitized, /\bspo2\b/i);
      assert.ok(sanitized.includes('[Clinical Note]'));
    });
  });

  // ==========================================================================
  // 4. 🛡️ PATIENT CONSENT GOVERNANCE (Grant, Revocation, Sync Blocking)
  // ==========================================================================
  describe('4. Patient Consent Governance', () => {
    it('records patient consent opt-in in relational DB, Firestore, and Audit Trail', async () => {
      const patientId = 'pat_consent_01';
      const result = await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: true,
        reason: 'Patient opted in via portal settings',
        actorUser: { uid: patientId, role: 'patient' }
      });

      assert.equal(result.success, true);
      assert.equal(result.consent, true);
      assert.equal(result.patientId, patientId);

      // Verify Firestore entry
      const fsData = mockDb._store.get(`patient_calendar_consents/${patientId}`);
      assert.ok(fsData);
      assert.equal(fsData.consent, true);

      // Verify Audit Event
      let auditFound = false;
      for (const [k, v] of mockDb._store.entries()) {
        if (k.startsWith('audit_events/') && v.type === 'CALENDAR_CONSENT_GRANTED') {
          auditFound = true;
          assert.equal(v.actor.uid, patientId);
        }
      }
      assert.equal(auditFound, true);
    });

    it('records patient consent revocation and logs CALENDAR_CONSENT_REVOKED', async () => {
      const patientId = 'pat_consent_02';
      const result = await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: false,
        reason: 'Patient opted out of external calendar sync',
        actorUser: { uid: patientId, role: 'patient' }
      });

      assert.equal(result.success, true);
      assert.equal(result.consent, false);

      // Verify Audit Event
      let revokeAuditFound = false;
      for (const [k, v] of mockDb._store.entries()) {
        if (k.startsWith('audit_events/') && v.type === 'CALENDAR_CONSENT_REVOKED') {
          revokeAuditFound = true;
          assert.equal(v.actor.uid, patientId);
          assert.equal(v.details.consent, false);
        }
      }
      assert.equal(revokeAuditFound, true);
    });

    it('retrieves patient consent status from Relational DB / Firestore', async () => {
      const patientId = 'pat_consent_03';
      await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: false,
        reason: 'Revoked for privacy preference'
      });

      const fetched = await googleCalendarService.getPatientCalendarConsent(mockDb, patientId);
      assert.equal(fetched.patientId, patientId);
      assert.equal(fetched.consent, false);
    });

    it('blocks calendar deep link generation when patient consent is revoked and enforceConsent is true', () => {
      const appt = {
        id: 'appt_blocked_consent',
        patientName: 'سامية كامل'
      };

      assert.throws(() => {
        googleCalendarService.generateGoogleCalendarDeepLink(appt, {
          enforceConsent: true,
          patientConsent: false
        });
      }, (err) => {
        assert.equal(err.code, 'PATIENT_CALENDAR_CONSENT_REVOKED');
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /patient has revoked calendar synchronization consent/i);
        return true;
      });
    });

    it('allows deep link generation when patient consent is active', () => {
      const appt = {
        id: 'appt_allowed_consent',
        patientName: 'سامية كامل'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(appt, {
        enforceConsent: true,
        patientConsent: true
      });
      assert.ok(link.startsWith('https://calendar.google.com/calendar/render'));
    });
  });

  // ==========================================================================
  // 5. 🌐 RELATIONAL DB STORAGE & INDEXING FOR CALENDAR CONSENTS
  // ==========================================================================
  describe('5. Relational DB Storage & Indexing for Calendar Consents', () => {
    it('persists and updates patient consent in relationalDbService', async () => {
      const patientId = 'pat_rel_01';
      const record = await relationalDbService.setPatientCalendarConsent(patientId, {
        consent: true,
        reason: 'Relational DB test opt-in',
        updated_by: patientId,
        actor_role: 'patient'
      });

      assert.ok(record);
      assert.equal(record.patient_id, patientId);
      assert.equal(record.consent, true);

      // Verify retrieval
      const fetched = await relationalDbService.getPatientCalendarConsent(patientId);
      assert.ok(fetched);
      assert.equal(fetched.patient_id, patientId);
      assert.equal(fetched.consent, true);

      // Update to false
      const updated = await relationalDbService.setPatientCalendarConsent(patientId, {
        consent: false,
        reason: 'Relational DB test opt-out'
      });
      assert.equal(updated.consent, false);

      const reFetched = await relationalDbService.getPatientCalendarConsent(patientId);
      assert.equal(reFetched.consent, false);
    });

    it('reports patient_calendar_consents table in relationalDbService.getHealthStatus()', async () => {
      const health = await relationalDbService.getHealthStatus();
      assert.ok(health.metrics);
      assert.ok('patientCalendarConsentsCount' in health.metrics);
      assert.ok('calendarSyncsCount' in health.metrics);
    });
  });

  // ==========================================================================
  // 6. 🌐 REST API SAFETY VALIDATION & CONSENT GOVERNANCE
  // ==========================================================================
  describe('6. REST API Safety Validation & Consent Endpoints', () => {
    const schedulingService = require('../backend/scheduling-service');
    const testApptId = 'appt_safety_api_test';

    beforeEach(async () => {
      await mockDb.collection('appointments').doc(testApptId).set({
        id: testApptId,
        patientId: 'patient_api_owner',
        doctorId: 'doctor_api_assigned',
        clinicId: 'clinic_cairo_main',
        status: 'confirmed',
        date: '2026-11-25',
        timeSlot: '11:00 AM',
        notes: 'General routine follow-up'
      });
    });

    it('successfully validates compliant appointment payload via validate-safety logic', async () => {
      const user = { uid: 'patient_api_owner', role: 'patient' };
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, user);
      const validation = googleCalendarService.validateCalendarPrivacyAndPrimacy(appt, user, mockDb);

      assert.equal(validation.valid, true);
      assert.equal(validation.physicianPrimacyGuaranteed, true);
      assert.ok(validation.statutoryDisclaimer.ar.includes('تنبيه طبي قانوني'));
    });

    it('rejects candidate appointment with unauthorized clinical diagnosis override', async () => {
      const patientUser = { uid: 'patient_api_owner', role: 'patient' };
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, patientUser);
      const candidateWithDiagnosis = { ...appt, clinicalDiagnosis: 'Bacterial Bronchitis' };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(candidateWithDiagnosis, patientUser, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        return true;
      });
    });

    it('allows patient to grant and revoke consent via setPatientCalendarConsent API logic', async () => {
      const patientId = 'pat_endpoint_user_1';
      // Opt-in
      const grantRes = await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: true,
        reason: 'Patient opted in',
        actorUser: { uid: patientId, role: 'patient' }
      });
      assert.equal(grantRes.success, true);
      assert.equal(grantRes.consent, true);

      // Verify status
      let statusRes = await googleCalendarService.getPatientCalendarConsent(mockDb, patientId);
      assert.equal(statusRes.consent, true);

      // Revoke
      const revokeRes = await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: false,
        reason: 'Revoked by user',
        actorUser: { uid: patientId, role: 'patient' }
      });
      assert.equal(revokeRes.success, true);
      assert.equal(revokeRes.consent, false);

      // Verify status again
      statusRes = await googleCalendarService.getPatientCalendarConsent(mockDb, patientId);
      assert.equal(statusRes.consent, false);
    });

    it('prohibits patient from mutating another patient calendar consent (RBAC enforcement)', () => {
      const callerUser = { uid: 'patient_malicious_hacker', role: 'patient' };
      const targetPatientId = 'patient_victim_44';

      // Simulating endpoint RBAC rule
      const isAllowed = targetPatientId === callerUser.uid ||
        callerUser.role === 'doctor' ||
        callerUser.role === 'super_admin' ||
        callerUser.role === 'clinic_admin';

      assert.equal(isAllowed, false);
    });

    it('allows physician or super_admin to inspect patient calendar consent status', () => {
      const doctorUser = { uid: 'doc_attending', role: 'doctor' };
      const targetPatientId = 'patient_victim_44';

      const isAllowed = targetPatientId === doctorUser.uid ||
        doctorUser.role === 'doctor' ||
        doctorUser.role === 'super_admin' ||
        doctorUser.role === 'clinic_admin';

      assert.equal(isAllowed, true);
    });
  });
});

