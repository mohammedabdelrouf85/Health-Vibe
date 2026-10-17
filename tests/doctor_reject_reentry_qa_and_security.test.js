/**
 * HEALTH VIBE AI: DOCTOR INTAKE REJECT & RE-ENTRY QA, SECURITY & MEDICAL RESEARCH TEST SUITE (K HEALTH)
 * 
 * Verifies:
 * 1. Clinical Research & Real-World Usage Scenarios (Medical Research / QA):
 *    - Scenario 1A: Incomplete Measurements (missing SpO2 & BP) -> Re-entry request for vital signs.
 *    - Scenario 1B: Contradictory Vitals (implausible SpO2 sensor artifact) -> Re-entry with resting instructions.
 *    - Scenario 1C: Unreadable Attachments (blurry lab report photo) -> Re-entry for clear document photo.
 *    - Scenario 1D: Symptom-History Discrepancy (conflicting answers) -> Re-entry for clarification.
 *    - Scenario 1E: Definitive Clinical Rejection (out-of-scope intake) -> Formal rejection with audit record.
 * 2. Doctor-Patient Data Isolation & Cross-Doctor Access Prevention:
 *    - Assigned Doctor: Authorized to issue re-entry or definitive rejection.
 *    - Unassigned Doctor: Strictly blocked with 403 UNASSIGNED_DOCTOR_ACCESS_DENIED.
 *    - Snooping Blocked: Unassigned Doctor blocked from reading re-entry telemetry.
 *    - Super Admin: Permitted emergency clinical and supervisory access.
 * 3. Multi-Tenant Clinic Isolation:
 *    - Cross-Clinic Doctor access strictly blocked (403 CROSS_CLINIC_ACCESS_DENIED).
 *    - Multi-clinic accredited doctor verified.
 * 4. Security Attack Surface Hardening & Privilege Escalation Prevention:
 *    - Stored XSS injection sanitized from physician notes.
 *    - Privilege escalation rejected for non-doctors (patient, nurse).
 *    - Unapproved doctor applicants rejected (403 DOCTOR_NOT_VERIFIED).
 *    - Suspended or revoked doctor licenses barred (403 DOCTOR_LICENSE_INACTIVE).
 *    - Mandatory minimum 10-char note strictly enforced.
 *    - Empty re-entry fields blocked.
 *    - Closed and archived cases strictly protected from modification (400 CASE_CLOSED).
 * 5. UI Access Isolation & Security Guards:
 *    - openRejectReentryModal blocks unassigned doctors with security toast.
 *    - Assigned doctor mounts modal with accessible key controls.
 *    - renderReentryStatusAlertBanner renders prominent clinical governance warning banner.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const rejectReentryService = require('../backend/reject-reentry-service');
const doctorUI = require('../app/modules/doctor/doctor-ui');
const DoctorService = require('../app/modules/doctor/doctor-service');

console.log('================================================================================');
console.log('🧪 HEALTH VIBE AI: DOCTOR REJECT & RE-ENTRY QA, SECURITY & RESEARCH TEST SUITE');
console.log('   Clinical Scenarios, Patient Isolation, Security Gates & UI Controls (K Health)');
console.log('================================================================================\n');

// Mock In-Memory Firestore Database
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
      audit_logs: new MockFirestoreCollection('audit_logs'),
      notifications: new MockFirestoreCollection('notifications')
    };
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockFirestoreCollection(name);
    }
    return this.collections[name];
  }
}

// Global browser DOM mocks for UI testing
const mockToastMessages = [];
global.showToast = (msg) => { mockToastMessages.push(msg); };
global.currentLanguage = 'ar';
global.auth = { currentUser: { uid: 'doc_primary_101', email: 'primary@cairo-clinic.eg' } };

const mockElements = new Map();
function createMockElement(id, tagName = "div") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: "",
    textContent: "",
    innerHTML: "",
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      contains: function(c) { return this._classes.has(c); }
    },
    dataset: {},
    setAttribute: function(name, val) { this[name] = val; },
    removeAttribute: function(name) { delete this[name]; },
    getAttribute: function(name) { return this[name] || null; },
    focus: function() {},
    addEventListener: function(event, handler) { this[`_on_${event}`] = handler; },
    removeEventListener: function(event) { delete this[`_on_${event}`]; },
    dispatchEvent: function(evt) {
      if (this[`_on_${evt.type}`]) this[`_on_${evt.type}`](evt);
    },
    remove: function() { mockElements.delete(id); },
    querySelectorAll: function() { return []; }
  };
  mockElements.set(id, el);
  return el;
}

global.document = {
  activeElement: null,
  getElementById: (id) => mockElements.get(id) || null,
  createElement: (tag) => createMockElement(`dyn_${Date.now()}_${Math.random()}`, tag),
  body: {
    appendChild: (child) => { mockElements.set(child.id, child); }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

(async () => {
  let passedSections = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1: CLINICAL RESEARCH USAGE SCENARIOS (K HEALTH PATTERN)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('▶ SECTION 1: Clinical Research & Real-World Usage Scenarios (K Health Pattern) ...');
  {
    const db = new MockFirestoreDb();
    const attendingDoctor = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Tarek Mahmoud, MD',
      doctorLicense: 'EG-MED-44829',
      specialty: 'Pulmonology / Critical Care'
    };
    const user = { uid: 'doc_attending_1', email: 'dr.tarek@healthvibe.test' };

    // SCENARIO 1A: Incomplete Measurements (Missing SpO2 and BP)
    await db.collection('cases').doc('case_scen_1a').set({
      id: 'case_scen_1a',
      status: 'under_review',
      patientId: 'patient_ahmed_1',
      assignedDoctorId: 'doc_attending_1',
      symptoms: ['shortness of breath']
    });

    const res1a = await rejectReentryService.processRejectReentry({
      caseId: 'case_scen_1a',
      mode: 'reentry',
      reasonCategory: 'INCOMPLETE_MEASUREMENTS',
      requiredFields: ['spo2', 'blood_pressure'],
      doctorNote: 'Baseline oxygen saturation (SpO2) and seated blood pressure were omitted from initial submission. Safe triage requires these vitals.',
      user,
      doctorProfile: attendingDoctor,
      db
    });

    assert.strictEqual(res1a.success, true);
    assert.strictEqual(res1a.targetStatus, 'more_info_requested');
    assert.strictEqual(res1a.mode, 'reentry');

    const updated1a = (await db.collection('cases').doc('case_scen_1a').get()).data();
    assert.strictEqual(updated1a.status, 'more_info_requested');
    assert.strictEqual(updated1a.isReentryRequest, true);
    assert.deepStrictEqual(updated1a.requiredFields, ['spo2', 'blood_pressure']);

    // Check Audit Log
    const auditLogs1a = await db.collection('audit_logs').where('caseId', '==', 'case_scen_1a').get();
    assert.strictEqual(auditLogs1a.docs.length, 1);
    assert.strictEqual(auditLogs1a.docs[0].data().eventType, 'CASE_REJECTED_REENTRY_REQUESTED');

    // Check Patient Notification
    const notifs1a = await db.collection('notifications').where('caseId', '==', 'case_scen_1a').get();
    assert.strictEqual(notifs1a.docs.length, 1);
    assert.strictEqual(notifs1a.docs[0].data().type, 'intake_reentry_requested');
    assert.deepStrictEqual(notifs1a.docs[0].data().requiredFields, ['spo2', 'blood_pressure']);

    // SCENARIO 1B: Contradictory Vitals (Implausible SpO2 sensor artifact)
    await db.collection('cases').doc('case_scen_1b').set({
      id: 'case_scen_1b',
      status: 'under_review',
      patientId: 'patient_sara_2',
      assignedDoctorId: 'doc_attending_1',
      o2: 68,
      symptoms: ['mild dry cough', 'speaking in full sentences', 'no respiratory distress']
    });

    const res1b = await rejectReentryService.processRejectReentry({
      caseId: 'case_scen_1b',
      mode: 'reentry',
      reasonCategory: 'CONTRADICTORY_VITALS',
      requiredFields: ['spo2'],
      doctorNote: 'Reported SpO2 reading of 68% is physiologically implausible given absence of dyspnea and normal speech. Please warm your hands, rest for 5 minutes, and retake the pulse oximeter reading.',
      user,
      doctorProfile: attendingDoctor,
      db
    });
    assert.strictEqual(res1b.targetStatus, 'more_info_requested');
    assert.deepStrictEqual(res1b.reentryRecord.requiredFields, ['spo2']);

    // SCENARIO 1C: Unreadable Attachments (Blurry lab photo)
    await db.collection('cases').doc('case_scen_1c').set({
      id: 'case_scen_1c',
      status: 'under_review',
      patientId: 'patient_karim_3',
      assignedDoctorId: 'doc_attending_1',
      attachments: ['https://storage.healthvibe/blurry_cbc.jpg']
    });

    const res1c = await rejectReentryService.processRejectReentry({
      caseId: 'case_scen_1c',
      mode: 'reentry',
      reasonCategory: 'UNREADABLE_ATTACHMENTS',
      requiredFields: ['attachments'],
      doctorNote: 'The uploaded lab report photo is blurry and cropped; hemoglobin and platelet counts are illegible. Please upload a clear, flat photo taken under good lighting.',
      user,
      doctorProfile: attendingDoctor,
      db
    });
    assert.strictEqual(res1c.targetStatus, 'more_info_requested');
    assert.deepStrictEqual(res1c.reentryRecord.requiredFields, ['attachments']);

    // SCENARIO 1D: Symptom-History Discrepancy
    await db.collection('cases').doc('case_scen_1d').set({
      id: 'case_scen_1d',
      status: 'under_review',
      patientId: 'patient_mona_4',
      assignedDoctorId: 'doc_attending_1',
      symptoms: ['chest tightness'],
      pastHistory: 'No prior pulmonary or cardiac conditions'
    });

    const res1d = await rejectReentryService.processRejectReentry({
      caseId: 'case_scen_1d',
      mode: 'reentry',
      reasonCategory: 'CLINICAL_INCONSISTENCY',
      requiredFields: ['symptoms_detail', 'medications'],
      doctorNote: 'Intake answers indicate no chronic lung disease, but current medications list daily Symbicort inhaler. Please clarify your diagnosis and medication schedule.',
      user,
      doctorProfile: attendingDoctor,
      db
    });
    assert.strictEqual(res1d.targetStatus, 'more_info_requested');
    assert.deepStrictEqual(res1d.reentryRecord.requiredFields, ['symptoms_detail', 'medications']);

    // SCENARIO 1E: Definitive Clinical Rejection
    await db.collection('cases').doc('case_scen_1e').set({
      id: 'case_scen_1e',
      status: 'under_review',
      patientId: 'patient_hossam_5',
      assignedDoctorId: 'doc_attending_1',
      symptoms: ['cosmetic scar revision request']
    });

    const res1e = await rejectReentryService.processRejectReentry({
      caseId: 'case_scen_1e',
      mode: 'definitive_reject',
      reasonCategory: 'OTHER_CLINICAL_JUSTIFICATION',
      doctorNote: 'Submitted intake is outside the clinical scope of urgent acute respiratory telemedicine triage. Rejection finalized.',
      user,
      doctorProfile: attendingDoctor,
      db
    });

    assert.strictEqual(res1e.targetStatus, 'rejected');
    const updated1e = (await db.collection('cases').doc('case_scen_1e').get()).data();
    assert.strictEqual(updated1e.status, 'rejected');
    assert.strictEqual(updated1e.isReentryRequest, false);
    assert.strictEqual(updated1e.reentryMode, 'definitive_reject');
    assert.strictEqual(updated1e.doctorApproved, false);
    assert.ok(updated1e.rejectedAt);

    passedSections++;
    console.log('  ✓ All 5 clinical scenarios (Incomplete, Contradictory, Unreadable, Discrepancy, Definitive Reject) validated.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2: DOCTOR-PATIENT DATA ISOLATION & ASSIGNMENT ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ SECTION 2: Doctor-Patient Data Isolation & Cross-Doctor Access Prevention ...');
  {
    const db = new MockFirestoreDb();

    // Doctor A: Assigned Primary Clinician
    const doctorA = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Ayman Fouad',
      doctorLicense: 'EG-MED-11001'
    };
    const userA = { uid: 'doc_a', email: 'ayman@clinic-alpha.eg' };

    // Doctor B: Unassigned Intruder
    const doctorB = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Bahaa Kamal',
      doctorLicense: 'EG-MED-22002'
    };
    const userB = { uid: 'doc_b', email: 'bahaa@clinic-alpha.eg' };

    // Case assigned explicitly to Doctor A
    await db.collection('cases').doc('case_assigned_doc_a').set({
      id: 'case_assigned_doc_a',
      patientId: 'patient_confidential_99',
      assignedDoctorId: 'doc_a',
      assignedDoctorEmail: 'ayman@clinic-alpha.eg',
      status: 'under_review'
    });

    // 2A. Doctor A (Assigned) is ALLOWED to request re-entry
    const resA = await rejectReentryService.processRejectReentry({
      caseId: 'case_assigned_doc_a',
      mode: 'reentry',
      reasonCategory: 'INCOMPLETE_MEASUREMENTS',
      requiredFields: ['spo2'],
      doctorNote: 'Assigned physician requesting verified oxygen saturation.',
      user: userA,
      doctorProfile: doctorA,
      db
    });
    assert.strictEqual(resA.success, true);
    assert.strictEqual(resA.targetStatus, 'more_info_requested');

    // 2B. Doctor B (Unassigned) MUST BE BLOCKED from rejecting Doctor A's patient
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_assigned_doc_a',
          mode: 'definitive_reject',
          reasonCategory: 'OTHER_CLINICAL_JUSTIFICATION',
          doctorNote: 'Unauthorized rejection attempt by unassigned practitioner.',
          user: userB,
          doctorProfile: doctorB,
          db
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
        assert.ok(err.message.includes('assigned clinician'));
        return true;
      }
    );

    // 2C. SNOOPING BLOCKED: Doctor B MUST BE BLOCKED from inspecting re-entry details
    await assert.rejects(
      async () => {
        await rejectReentryService.getCaseRejectReentryStatus('case_assigned_doc_a', {
          db,
          user: userB,
          doctorProfile: doctorB
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
        return true;
      }
    );

    // 2D. Doctor A (Assigned) CAN query status details
    const statusA = await rejectReentryService.getCaseRejectReentryStatus('case_assigned_doc_a', {
      db,
      user: userA,
      doctorProfile: doctorA
    });
    assert.strictEqual(statusA.success, true);
    assert.strictEqual(statusA.isReentryRequest, true);
    assert.deepStrictEqual(statusA.requiredFields, ['spo2']);

    // 2E. Super Admin Emergency Access Allowed
    const superAdmin = { uid: 'super_admin_01', email: 'admin@healthvibe.com', role: 'super_admin' };
    const adminStatus = await rejectReentryService.getCaseRejectReentryStatus('case_assigned_doc_a', {
      db,
      user: superAdmin,
      doctorProfile: superAdmin
    });
    assert.strictEqual(adminStatus.success, true);

    passedSections++;
    console.log('  ✓ Patient data isolation strictly enforced: Unassigned doctors blocked with 403 UNASSIGNED_DOCTOR_ACCESS_DENIED.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3: MULTI-TENANT CLINIC ISOLATION ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ SECTION 3: Multi-Tenant Clinic Isolation ...');
  {
    const db = new MockFirestoreDb();

    // Doctor from Clinic Cairo
    const docCairo = {
      role: 'doctor',
      verifiedDoctor: true,
      clinicId: 'clinic-cairo',
      name: 'Dr. Cairo Attending'
    };
    const userCairo = { uid: 'doc_cairo_1', email: 'cairo@healthvibe.eg', clinicId: 'clinic-cairo' };

    // Doctor from Clinic Alexandria
    const docAlex = {
      role: 'doctor',
      verifiedDoctor: true,
      clinicId: 'clinic-alexandria',
      name: 'Dr. Alex Attending'
    };
    const userAlex = { uid: 'doc_alex_1', email: 'alex@healthvibe.eg', clinicId: 'clinic-alexandria' };

    // Case belonging to Clinic Cairo
    await db.collection('cases').doc('case_cairo_tenant_01').set({
      id: 'case_cairo_tenant_01',
      clinicId: 'clinic-cairo',
      status: 'under_review'
    });

    // 3A. Doctor from Clinic Cairo has access
    const cairoResult = await rejectReentryService.processRejectReentry({
      caseId: 'case_cairo_tenant_01',
      mode: 'reentry',
      reasonCategory: 'INCOMPLETE_MEASUREMENTS',
      requiredFields: ['spo2'],
      doctorNote: 'Clinic Cairo physician requesting verified vital signs.',
      user: userCairo,
      doctorProfile: docCairo,
      db
    });
    assert.strictEqual(cairoResult.success, true);

    // 3B. Doctor from Clinic Alexandria REJECTED with CROSS_CLINIC_ACCESS_DENIED
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_cairo_tenant_01',
          mode: 'definitive_reject',
          reasonCategory: 'OTHER_CLINICAL_JUSTIFICATION',
          doctorNote: 'Cross-clinic unauthorized rejection attempt.',
          user: userAlex,
          doctorProfile: docAlex,
          db
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'CROSS_CLINIC_ACCESS_DENIED');
        return true;
      }
    );

    // 3C. Multi-Clinic Doctor with clinic array membership allowed
    const multiClinicDoc = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Multi Regional',
      clinics: [{ id: 'clinic-cairo', status: 'approved' }, { id: 'clinic-giza', status: 'approved' }]
    };
    const userMulti = { uid: 'doc_multi_1', email: 'multi@healthvibe.eg' };

    const multiResult = await rejectReentryService.processRejectReentry({
      caseId: 'case_cairo_tenant_01',
      mode: 'reentry',
      reasonCategory: 'CONTRADICTORY_VITALS',
      requiredFields: ['temperature'],
      doctorNote: 'Multi-clinic accredited clinician requesting accurate temperature reading.',
      user: userMulti,
      doctorProfile: multiClinicDoc,
      db
    });
    assert.strictEqual(multiResult.success, true);

    passedSections++;
    console.log('  ✓ Multi-tenant clinic isolation verified: Cross-clinic rejections blocked with 403.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 4: SECURITY HARDENING & ATTACK SURFACE VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ SECTION 4: Security Attack Surface Hardening & Sanitization ...');
  {
    const db = new MockFirestoreDb();
    const approvedDoctor = {
      role: 'doctor',
      verifiedDoctor: true,
      name: 'Dr. Security Auditor',
      doctorLicense: 'EG-SEC-7700'
    };
    const user = { uid: 'doc_sec', email: 'sec@healthvibe.test' };

    await db.collection('cases').doc('case_sec_target').set({
      id: 'case_sec_target',
      status: 'under_review'
    });

    // ATTACK 4A: Stored XSS Attempt in doctorNote
    const maliciousPayload = `<script>fetch('/steal?c=' + document.cookie);</script><iframe src="evil.com"></iframe><img src=x onerror=alert(1)> Pulse oximeter was off-finger. Please rest and re-measure.`;
    const xssResult = await rejectReentryService.processRejectReentry({
      caseId: 'case_sec_target',
      mode: 'reentry',
      reasonCategory: 'CONTRADICTORY_VITALS',
      requiredFields: ['spo2'],
      doctorNote: maliciousPayload,
      user,
      doctorProfile: approvedDoctor,
      db
    });

    assert.strictEqual(xssResult.success, true);
    // Ensure scripts, iframes, and images were completely stripped
    assert.ok(!xssResult.reentryRecord.rejectionReason.includes('<script>'), 'Script tags must be stripped');
    assert.ok(!xssResult.reentryRecord.rejectionReason.includes('<iframe'), 'Iframe tags must be stripped');
    assert.ok(!xssResult.reentryRecord.rejectionReason.includes('<img'), 'Image tags must be stripped');
    assert.ok(xssResult.reentryRecord.rejectionReason.includes('Pulse oximeter was off-finger'), 'Clean clinical rationale preserved');

    // ATTACK 4B: Privilege Escalation Attempt (Patient attempting to reject intake)
    const patientUser = { uid: 'pat_attacker', email: 'patient@healthvibe.test', role: 'patient' };
    const patientProfile = { role: 'patient', name: 'Malicious Patient' };
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_sec_target',
          mode: 'definitive_reject',
          reasonCategory: 'OTHER_CLINICAL_JUSTIFICATION',
          doctorNote: 'I want to reject this intake myself without a physician.',
          user: patientUser,
          doctorProfile: patientProfile,
          db
        });
      },
      (err) => err.code === 'INSUFFICIENT_ROLE' && err.statusCode === 403
    );

    // ATTACK 4C: Unapproved Doctor Applicant
    const pendingDoctor = { role: 'doctor', doctorApplicationStatus: 'pending', verifiedDoctor: false };
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_sec_target',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Pending applicant attempting clinical action.',
          user,
          doctorProfile: pendingDoctor,
          db
        });
      },
      (err) => err.code === 'DOCTOR_NOT_VERIFIED' && err.statusCode === 403
    );

    // ATTACK 4D: Suspended Doctor License Attempt
    const suspendedDoctor = { role: 'doctor', doctorApplicationStatus: 'approved', licenseStatus: 'suspended' };
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_sec_target',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Suspended doctor attempting to issue intake re-entry request.',
          user,
          doctorProfile: suspendedDoctor,
          db
        });
      },
      (err) => err.code === 'DOCTOR_LICENSE_INACTIVE' && err.statusCode === 403
    );

    // ATTACK 4E: Mandatory Note Enforcement (< 10 chars)
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_sec_target',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Short',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'MANDATORY_NOTE_REQUIRED' && err.statusCode === 400
    );

    // ATTACK 4F: Empty Re-entry Fields
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_sec_target',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: [],
          doctorNote: 'Valid note for clinical testing with empty fields list.',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'REQUIRED_FIELDS_EMPTY' && err.statusCode === 400
    );

    // ATTACK 4G: Tampering with Closed/Archived Cases
    await db.collection('cases').doc('case_closed_archive').set({
      id: 'case_closed_archive',
      status: 'closed'
    });
    await assert.rejects(
      async () => {
        await rejectReentryService.processRejectReentry({
          caseId: 'case_closed_archive',
          mode: 'reentry',
          reasonCategory: 'INCOMPLETE_MEASUREMENTS',
          requiredFields: ['spo2'],
          doctorNote: 'Attempting to alter already closed and archived case.',
          user,
          doctorProfile: approvedDoctor,
          db
        });
      },
      (err) => err.code === 'CASE_CLOSED' && err.statusCode === 400
    );

    passedSections++;
    console.log('  ✓ Stored XSS sanitized, role privilege escalation barred, and closed case protection verified.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 5: UI ACCESS ISOLATION & BANNER RENDERING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ SECTION 5: UI Access Isolation & Security Banner Rendering ...');
  {
    const primaryDoctor = { uid: 'doc_primary_101', email: 'primary@cairo-clinic.eg' };
    const intruderDoctor = { uid: 'doc_intruder_202', email: 'intruder@other.eg' };

    const foreignCase = {
      id: 'case_foreign_ui_99',
      patientName: 'عمر خالد',
      status: 'under_review',
      assignedDoctorId: 'doc_other_attending',
      assignedDoctorEmail: 'other@clinic.eg'
    };

    // 5A. openRejectReentryModal blocks unassigned doctor with access restriction toast
    global.cases = [foreignCase];
    global.auth = { currentUser: intruderDoctor };
    mockToastMessages.length = 0;

    doctorUI.openRejectReentryModal('case_foreign_ui_99', 'reentry');
    assert.strictEqual(mockToastMessages.length, 1, 'Security toast message must be emitted');
    assert.ok(mockToastMessages[0].includes('مقيد بالطبيب المكلف بمتابعتها حصراً'), 'Toast explains assignment restriction');

    // Ensure modal mount point was NOT created
    assert.strictEqual(mockElements.has('doctorRejectModalMountPoint'), false, 'Modal dialog must NOT mount for unauthorized doctor');

    // 5B. openRejectReentryModal mounts dialog for assigned doctor
    global.auth = { currentUser: primaryDoctor };
    const myCase = {
      id: 'case_my_ui_101',
      patientName: 'مريم سعيد',
      status: 'under_review',
      assignedDoctorId: primaryDoctor.uid
    };
    global.cases = [myCase];

    doctorUI.openRejectReentryModal('case_my_ui_101', 'reentry');
    assert.strictEqual(mockElements.has('doctorRejectModalMountPoint'), true, 'Modal dialog mounts for assigned doctor');

    // 5C. renderReentryStatusAlertBanner renders prominent governance warning banner
    const reenteredCase = {
      id: 'case_flagged_101',
      status: 'more_info_requested',
      isReentryRequest: true,
      reentryCategory: 'CONTRADICTORY_VITALS',
      rejectionReason: 'SpO2 reading of 70% contradicts normal speech. Please rest and re-measure.',
      requiredFields: ['spo2', 'blood_pressure']
    };

    const bannerHtmlAr = doctorUI.renderReentryStatusAlertBanner(reenteredCase, false);
    assert.ok(bannerHtmlAr.includes('reentry-status-alert-banner'), 'Must contain banner container class');
    assert.ok(bannerHtmlAr.includes('تم رفض التقييم المبدئي — بانتظار إعادة إدخال المريض للقياسات'), 'Must have Arabic headline');
    assert.ok(bannerHtmlAr.includes('قياسات أو مؤشرات حيوية متناقضة'), 'Must render category label');
    assert.ok(bannerHtmlAr.includes('SpO2 reading of 70% contradicts'), 'Must render doctor instruction quote');
    assert.ok(bannerHtmlAr.includes('reentry-field-pill'), 'Must render field pills');

    const bannerHtmlEn = doctorUI.renderReentryStatusAlertBanner(reenteredCase, true);
    assert.ok(bannerHtmlEn.includes('Assessment Intake Rejected — Awaiting Patient Re-entry'), 'Must have English headline');
    assert.ok(bannerHtmlEn.includes('Contradictory / Implausible Vital Readings'), 'Must render English category');

    passedSections++;
    console.log('  ✓ UI modal isolation, access restriction toast, and re-entry alert banner verified.');
  }

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passedSections} QA, SECURITY & RESEARCH TEST SUITES PASSED (100% SUCCESS)`);
  console.log('================================================================================\n');

})().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
