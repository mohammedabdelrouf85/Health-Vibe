/**
 * HEALTH VIBE AI: DOCTOR RISK OVERRIDE BACKEND & API TEST SUITE
 * 
 * Validates:
 * 1. Verified Doctor RBAC verification (doctorApplicationStatus === 'approved' || verifiedDoctor === true).
 * 2. Role enforcement (rejection of non-doctor, pending, or suspended practitioners).
 * 3. Mandatory clinical rationale (minimum 10 characters) and strict 5-category taxonomy.
 * 4. Priority validation (urgent, high, normal) and case state checking (cannot override closed cases).
 * 5. Firestore cases/{caseId} updates (priority, triageLevel, triageOverride, statusHistory).
 * 6. Audit Logging in audit_events collection ('TRIAGE_OVERRIDDEN_BY_CLINICIAN').
 * 7. AI model telemetry in ai_model_feedback collection for Infermedica continuous calibration.
 * 8. Status inspection and governance telemetry aggregation endpoints.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const triageOverrideService = require('../backend/triage-override-service');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: DOCTOR RISK OVERRIDE BACKEND & API TEST SUITE');
console.log('   RBAC, Verified Doctor Gate, Audit Logging & AI Telemetry');
console.log('==================================================================\n');

// Mock Firestore Database Implementation
class MockFirestoreCollection {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
  }

  doc(id) {
    return {
      get: async () => ({
        exists: this.docs.has(id),
        id,
        data: () => this.docs.get(id) || null
      }),
      update: async (patch) => {
        if (!this.docs.has(id)) throw new Error('Document does not exist');
        const current = this.docs.get(id);
        const updated = { ...current, ...patch };
        this.docs.set(id, updated);
        return { writeTime: new Date().toISOString() };
      },
      set: async (data) => {
        this.docs.set(id, { ...data });
        return { writeTime: new Date().toISOString() };
      }
    };
  }

  async add(data) {
    const id = `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.docs.set(id, { ...data, id });
    return { id };
  }

  where(field, op, val) {
    return {
      get: async () => {
        const matches = [];
        for (const [id, doc] of this.docs.entries()) {
          if (op === '==' && doc[field] === val) {
            matches.push({ id, data: () => doc });
          }
        }
        return { docs: matches, size: matches.length };
      }
    };
  }

  async get() {
    const list = [];
    for (const [id, doc] of this.docs.entries()) {
      list.push({ id, data: () => doc });
    }
    return { docs: list, size: list.length };
  }
}

class MockFirestoreDb {
  constructor() {
    this.collections = {
      cases: new MockFirestoreCollection('cases'),
      audit_events: new MockFirestoreCollection('audit_events'),
      ai_model_feedback: new MockFirestoreCollection('ai_model_feedback')
    };
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockFirestoreCollection(name);
    }
    return this.collections[name];
  }
}

(async () => {
  let passedTests = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Verified Doctor RBAC & Authorization Gate
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Verified Doctor RBAC & Authorization Verification ...');
  {
    // 1A. Approved Doctor with syndicate credentials
    const approvedDoctor = {
      role: 'doctor',
      name: 'Dr. Sarah Mansour',
      doctorApplicationStatus: 'approved',
      doctorLicense: 'EG-MED-77124',
      specialty: 'Pulmonology & Intensive Care'
    };
    const auth1 = triageOverrideService.verifyDoctorAuthorization(approvedDoctor);
    assert.strictEqual(auth1.isAuthorized, true, 'Approved doctor must be authorized');
    assert.strictEqual(auth1.doctorLicense, 'EG-MED-77124');
    assert.strictEqual(auth1.doctorSpecialty, 'Pulmonology & Intensive Care');

    // 1B. Doctor verified flag = true
    const flagVerifiedDoctor = {
      role: 'doctor',
      name: 'Dr. Omar Taha',
      verifiedDoctor: true,
      syndicateCardNumber: 'EG-MED-88301'
    };
    const auth2 = triageOverrideService.verifyDoctorAuthorization(flagVerifiedDoctor);
    assert.strictEqual(auth2.isAuthorized, true);
    assert.strictEqual(auth2.doctorLicense, 'EG-MED-88301');

    // 1C. Reject Non-Doctor Role (e.g. nurse, patient, clinic_admin)
    const patientRole = { role: 'patient', name: 'John Patient' };
    const auth3 = triageOverrideService.verifyDoctorAuthorization(patientRole);
    assert.strictEqual(auth3.isAuthorized, false);
    assert.strictEqual(auth3.code, 'INSUFFICIENT_ROLE');

    // 1D. Reject Doctor with pending application status
    const pendingDoctor = { role: 'doctor', doctorApplicationStatus: 'pending', verifiedDoctor: false };
    const auth4 = triageOverrideService.verifyDoctorAuthorization(pendingDoctor);
    assert.strictEqual(auth4.isAuthorized, false);
    assert.strictEqual(auth4.code, 'DOCTOR_NOT_VERIFIED');

    // 1E. Reject Suspended Doctor
    const suspendedDoctor = { role: 'doctor', doctorApplicationStatus: 'approved', licenseStatus: 'suspended' };
    const auth5 = triageOverrideService.verifyDoctorAuthorization(suspendedDoctor);
    assert.strictEqual(auth5.isAuthorized, false);
    assert.strictEqual(auth5.code, 'DOCTOR_LICENSE_INACTIVE');

    passedTests++;
    console.log('  ✓ Verified Doctor RBAC strictly enforced; pending or suspended doctors rejected.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Payload Validation (Priority, Reason, Category)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 2: Payload & Clinical Governance Validation ...');
  {
    const db = new MockFirestoreDb();
    const approvedDoctor = { role: 'doctor', verifiedDoctor: true, name: 'Dr. Khaled' };
    const user = { uid: 'doc_123', email: 'khaled@healthvibe.test' };

    // 2A. Invalid priority
    await assert.rejects(
      async () => {
        await triageOverrideService.processTriageOverride({
          caseId: 'case_001',
          overriddenPriority: 'critical_emergency', // not in ['urgent', 'high', 'normal']
          overrideReason: 'Patient looks very sick and exhausted clinically',
          overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'INVALID_OVERRIDE_PRIORITY' && err.statusCode === 400
    );

    // 2B. Missing / Short reason (< 10 chars)
    await assert.rejects(
      async () => {
        await triageOverrideService.processTriageOverride({
          caseId: 'case_001',
          overriddenPriority: 'urgent',
          overrideReason: 'Too sick', // 8 chars
          overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'MANDATORY_OVERRIDE_REASON_REQUIRED' && err.statusCode === 400
    );

    // 2C. Invalid Category
    await assert.rejects(
      async () => {
        await triageOverrideService.processTriageOverride({
          caseId: 'case_001',
          overriddenPriority: 'urgent',
          overrideReason: 'Comprehensive clinical evaluation shows accessory muscle use.',
          overrideCategory: 'CUSTOM_UNAPPROVED_CATEGORY',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'INVALID_OVERRIDE_CATEGORY' && err.statusCode === 400
    );

    // 2D. Unverified doctor rejected during processTriageOverride
    await assert.rejects(
      async () => {
        await triageOverrideService.processTriageOverride({
          caseId: 'case_001',
          overriddenPriority: 'urgent',
          overrideReason: 'Comprehensive clinical evaluation shows accessory muscle use.',
          overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
          user,
          doctorProfile: { role: 'doctor', doctorApplicationStatus: 'pending' },
          db
        });
      },
      (err) => err.code === 'DOCTOR_NOT_VERIFIED' && err.statusCode === 403
    );

    passedTests++;
    console.log('  ✓ Priority, rationale length, category taxonomy, and doctor authorization validated.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Case Lifecycle Check (Non-Existent & Closed Cases)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 3: Case Lifecycle & Closed Case Protection ...');
  {
    const db = new MockFirestoreDb();
    const approvedDoctor = { role: 'doctor', verifiedDoctor: true, name: 'Dr. Tariq' };
    const user = { uid: 'doc_tariq', email: 'tariq@healthvibe.test' };

    // 3A. Non-existent case
    await assert.rejects(
      async () => {
        await triageOverrideService.processTriageOverride({
          caseId: 'non_existent_case_999',
          overriddenPriority: 'urgent',
          overrideReason: 'Physical assessment confirms respiratory failure.',
          overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'CASE_NOT_FOUND' && err.statusCode === 404
    );

    // 3B. Closed & archived case rejection
    await db.collection('cases').doc('case_closed_001').set({
      id: 'case_closed_001',
      status: 'closed',
      priority: 'normal',
      triageLevel: 'normal'
    });

    await assert.rejects(
      async () => {
        await triageOverrideService.processTriageOverride({
          caseId: 'case_closed_001',
          overriddenPriority: 'urgent',
          overrideReason: 'Physical assessment confirms respiratory failure.',
          overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'CASE_CLOSED' && err.statusCode === 400
    );

    passedTests++;
    console.log('  ✓ 404 CASE_NOT_FOUND and 400 CASE_CLOSED lifecycle rules verified.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Successful Escalation Override Execution & Case Mutation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 4: Successful Escalation Override (Normal -> Urgent) ...');
  {
    const db = new MockFirestoreDb();
    const approvedDoctor = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Yasmine Nour',
      doctorLicense: 'EG-MED-99412',
      specialty: 'Pulmonology'
    };
    const user = { uid: 'doc_yasmine', email: 'yasmine@healthvibe.test' };

    await db.collection('cases').doc('case_active_101').set({
      id: 'case_active_101',
      status: 'submitted',
      priority: 'normal',
      triageLevel: 'normal',
      oxygenLevel: 94,
      symptoms: ['cough', 'dyspnea'],
      statusHistory: []
    });

    const result = await triageOverrideService.processTriageOverride({
      caseId: 'case_active_101',
      overriddenPriority: 'urgent',
      overrideReason: 'Pronounced suprasternal retractions and tachypnea (RR 34/min) at rest.',
      overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
      user,
      doctorProfile: approvedDoctor,
      db,
      metadata: { ip: '196.205.10.22', userAgent: 'HealthVibeClinic/1.0' }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.previousPriority, 'normal');
    assert.strictEqual(result.newPriority, 'urgent');
    assert.strictEqual(result.triageOverride.isOverridden, true);
    assert.strictEqual(result.triageOverride.overriddenPriority, 'urgent');
    assert.strictEqual(result.triageOverride.overrideCategory, 'CLINICAL_SIGNS_OF_EXHAUSTION');
    assert.strictEqual(result.triageOverride.overriddenBy.name, 'Dr. Yasmine Nour');
    assert.strictEqual(result.triageOverride.overriddenBy.license, 'EG-MED-99412');

    // Verify Firestore case update
    const caseDoc = await db.collection('cases').doc('case_active_101').get();
    const updatedCase = caseDoc.data();
    assert.strictEqual(updatedCase.priority, 'urgent');
    assert.strictEqual(updatedCase.triageLevel, 'urgent');
    assert.ok(updatedCase.triageOverride);
    assert.strictEqual(updatedCase.triageOverride.overriddenPriority, 'urgent');
    assert.ok(Array.isArray(updatedCase.statusHistory));
    assert.strictEqual(updatedCase.statusHistory.length, 1);
    assert.strictEqual(updatedCase.statusHistory[0].action, 'TRIAGE_OVERRIDE');
    assert.strictEqual(updatedCase.statusHistory[0].fromPriority, 'normal');
    assert.strictEqual(updatedCase.statusHistory[0].toPriority, 'urgent');
    assert.strictEqual(updatedCase.statusHistory[0].actor.license, 'EG-MED-99412');

    passedTests++;
    console.log('  ✓ Case document successfully updated with authoritative priority and status history.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Security & Compliance Audit Log Persistence ('audit_events')
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 5: Security & Compliance Audit Log Persistence ...');
  {
    const db = new MockFirestoreDb();
    const approvedDoctor = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Mahmoud Zaki',
      doctorLicense: 'EG-MED-44109',
      specialty: 'Internal Medicine'
    };
    const user = { uid: 'doc_zaki', email: 'zaki@healthvibe.test' };

    await db.collection('cases').doc('case_active_102').set({
      id: 'case_active_102',
      status: 'under_review',
      priority: 'high',
      triageLevel: 'high'
    });

    await triageOverrideService.processTriageOverride({
      caseId: 'case_active_102',
      overriddenPriority: 'normal',
      overrideReason: 'Pulse oximeter reading was an artifact due to cold extremities; SpO2 is 98% on warm repeat.',
      overrideCategory: 'ARTIFACT_CORRECTION',
      user,
      doctorProfile: approvedDoctor,
      db,
      metadata: { ip: '41.130.22.88', userAgent: 'Mozilla/5.0 DoctorClinic' }
    });

    const auditSnapshot = await db.collection('audit_events').get();
    assert.strictEqual(auditSnapshot.size, 1, 'Audit log event must be saved');

    const auditEvent = auditSnapshot.docs[0].data();
    assert.strictEqual(auditEvent.type, 'TRIAGE_OVERRIDDEN_BY_CLINICIAN');
    assert.strictEqual(auditEvent.caseId, 'case_active_102');
    assert.strictEqual(auditEvent.doctorId, 'doc_zaki');
    assert.strictEqual(auditEvent.doctorName, 'Dr. Mahmoud Zaki');
    assert.strictEqual(auditEvent.doctorLicense, 'EG-MED-44109');
    assert.strictEqual(auditEvent.verifiedDoctor, true);
    assert.strictEqual(auditEvent.originalPriority, 'high');
    assert.strictEqual(auditEvent.overriddenPriority, 'normal');
    assert.strictEqual(auditEvent.overrideCategory, 'ARTIFACT_CORRECTION');
    assert.strictEqual(auditEvent.ip, '41.130.22.88');
    assert.strictEqual(auditEvent.provenance, 'AI_INFERMEDICA_RULES_OVERRIDE');

    passedTests++;
    console.log('  ✓ TRIAGE_OVERRIDDEN_BY_CLINICIAN audit record logged with doctor identity and provenance.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Continuous AI Retraining Telemetry ('ai_model_feedback')
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 6: Continuous AI Model Calibration Telemetry (Infermedica) ...');
  {
    const db = new MockFirestoreDb();
    const approvedDoctor = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Amira Adel',
      doctorLicense: 'EG-MED-33819'
    };
    const user = { uid: 'doc_amira', email: 'amira@healthvibe.test' };

    await db.collection('cases').doc('case_active_103').set({
      id: 'case_active_103',
      status: 'submitted',
      priority: 'normal',
      triageLevel: 'normal',
      o2: 95,
      temperature: '38.6',
      heartRate: '118',
      duration: '4',
      symptoms: ['fever', 'cough', 'severe chest pain']
    });

    await triageOverrideService.processTriageOverride({
      caseId: 'case_active_103',
      overriddenPriority: 'urgent',
      overrideReason: 'Severe pleuritic chest pain with resting tachycardia and high fever warrants emergency workup.',
      overrideCategory: 'RAPID_TRAJECTORY',
      user,
      doctorProfile: approvedDoctor,
      db
    });

    const feedbackSnapshot = await db.collection('ai_model_feedback').where('feedbackType', '==', 'TRIAGE_RISK_OVERRIDE').get();
    assert.strictEqual(feedbackSnapshot.size, 1);

    const feedback = feedbackSnapshot.docs[0].data();
    assert.strictEqual(feedback.feedbackType, 'TRIAGE_RISK_OVERRIDE');
    assert.strictEqual(feedback.caseId, 'case_active_103');
    assert.strictEqual(feedback.originalAiPriority, 'normal');
    assert.strictEqual(feedback.physicianVerifiedPriority, 'urgent');
    assert.strictEqual(feedback.discordance, true);
    assert.strictEqual(feedback.direction, 'ESCALATED');
    assert.strictEqual(feedback.clinicalCategory, 'RAPID_TRAJECTORY');
    assert.strictEqual(feedback.calibratedForTraining, true);
    assert.strictEqual(feedback.modelEngine, 'Infermedica / HealthVibe-Rules-v1.0');
    assert.strictEqual(feedback.vitalsSnapshot.o2, 95);
    assert.strictEqual(feedback.vitalsSnapshot.heartRate, '118');
    assert.strictEqual(feedback.physician.license, 'EG-MED-33819');

    passedTests++;
    console.log('  ✓ Ground-truth AI feedback telemetry captured with full vitals snapshot and direction.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Case Triage Override Status Retrieval Endpoint
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 7: Case Triage Override Status Inspection Endpoint ...');
  {
    const db = new MockFirestoreDb();
    await db.collection('cases').doc('case_inspect_1').set({
      id: 'case_inspect_1',
      priority: 'urgent',
      triageLevel: 'urgent',
      triageOverride: {
        isOverridden: true,
        originalPriority: 'normal',
        overriddenPriority: 'urgent',
        overrideCategory: 'COMORBIDITY_RISK',
        overrideReason: 'Severe brittle asthma with active bronchospasm',
        overriddenBy: { name: 'Dr. Aly', license: 'EG-MED-12345' }
      }
    });

    const status = await triageOverrideService.getCaseTriageOverride('case_inspect_1', { db });
    assert.strictEqual(status.success, true);
    assert.strictEqual(status.isOverridden, true);
    assert.strictEqual(status.priority, 'urgent');
    assert.strictEqual(status.originalPriority, 'normal');
    assert.strictEqual(status.triageOverride.overrideCategory, 'COMORBIDITY_RISK');

    // Non-overridden case
    await db.collection('cases').doc('case_inspect_2').set({
      id: 'case_inspect_2',
      priority: 'high'
    });
    const nonOverridden = await triageOverrideService.getCaseTriageOverride('case_inspect_2', { db });
    assert.strictEqual(nonOverridden.isOverridden, false);
    assert.strictEqual(nonOverridden.priority, 'high');

    passedTests++;
    console.log('  ✓ Status inspection endpoint accurately returns override status and previous priority.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: AI Governance Telemetry Aggregation & Metrics
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 8: AI Feedback Telemetry Aggregation & Distribution ...');
  {
    const db = new MockFirestoreDb();
    
    // Seed feedback records
    await db.collection('ai_model_feedback').add({
      feedbackType: 'TRIAGE_RISK_OVERRIDE',
      direction: 'ESCALATED',
      clinicalCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION'
    });
    await db.collection('ai_model_feedback').add({
      feedbackType: 'TRIAGE_RISK_OVERRIDE',
      direction: 'ESCALATED',
      clinicalCategory: 'RAPID_TRAJECTORY'
    });
    await db.collection('ai_model_feedback').add({
      feedbackType: 'TRIAGE_RISK_OVERRIDE',
      direction: 'DE_ESCALATED',
      clinicalCategory: 'ARTIFACT_CORRECTION'
    });

    const telemetry = await triageOverrideService.getAiFeedbackTelemetry({ db });
    assert.strictEqual(telemetry.success, true);
    assert.strictEqual(telemetry.totalOverrides, 3);
    assert.strictEqual(telemetry.escalatedCount, 2);
    assert.strictEqual(telemetry.deescalatedCount, 1);
    assert.strictEqual(telemetry.categoryDistribution.CLINICAL_SIGNS_OF_EXHAUSTION, 1);
    assert.strictEqual(telemetry.categoryDistribution.RAPID_TRAJECTORY, 1);
    assert.strictEqual(telemetry.categoryDistribution.ARTIFACT_CORRECTION, 1);

    passedTests++;
    console.log('  ✓ Telemetry aggregation computes total overrides, escalation ratios, and category distributions.');
  }

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedTests} BACKEND & API ACCEPTANCE TESTS PASSED (100%)`);
  console.log('==================================================================');
})().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
