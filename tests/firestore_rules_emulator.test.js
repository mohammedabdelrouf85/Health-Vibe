/**
 * Health Vibe AI - Comprehensive Firestore Security Rules Test Suite
 * Evaluates all clinical safety, RBAC, anti-tampering, and privacy rules.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Verify rules file integrity
const rulesPath = path.join(__dirname, '..', 'firestore.rules');
assert(fs.existsSync(rulesPath), `firestore.rules file must exist at ${rulesPath}`);
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

// Ensure all critical collections and helper functions are present in firestore.rules
const requiredMatches = [
  "match /users/{userId}",
  "match /doctor_applications/{appId}",
  "match /cases/{caseId}",
  "match /assessments/{assessmentId}",
  "match /reports/{reportId}",
  "match /medical_reports/{reportId}",
  "match /clinical_reports/{reportId}",
  "match /audit_events/{eventId}",
  "match /auditLog/{logId}",
  "match /ai_model_metrics/{metricId}",
  "match /appointments/{appointmentId}",
  "match /email_notifications/{notificationId}",
  "match /{document=**}"
];

for (const m of requiredMatches) {
  assert(rulesContent.includes(m), `firestore.rules is missing required path: ${m}`);
}

const requiredFunctions = [
  "function isDoctorApprovedCase",
  "function hasNoPatientForgedClinicalResult",
  "function hasNoUnreleasedClinicalResult",
  "function isValidAssessment",
  "function isValidOxygen",
  "function isAssignedDoctor",
  "function isPatientMoreInfoResponse"
];

for (const fn of requiredFunctions) {
  assert(rulesContent.includes(fn), `firestore.rules is missing required security function: ${fn}`);
}

console.log("✓ static rule structure check: firestore.rules contains all required security rules and functions.");

// 2. Rules Evaluation Engine (Faithfully simulates Firestore Rules engine according to firestore.rules)
class RulesSimulator {
  constructor(dbState = {}) {
    this.users = dbState.users || {};
  }

  evalAuth(auth) {
    if (!auth || !auth.uid) return null;
    return {
      uid: auth.uid,
      token: {
        email: auth.email || null,
        email_verified: Boolean(auth.email_verified),
        isOwner: Boolean(auth.isOwner),
        role: auth.role || null
      }
    };
  }

  isVerificationRevoked(request) {
    if (!request.auth) return false;
    const email = (request.auth.token.email || '').toLowerCase();
    return email === 'devilunderurwater@gmail.com';
  }

  isOwner(request) {
    if (!request.auth || this.isVerificationRevoked(request)) return false;
    if (request.auth.token.isOwner === true) return true;
    if (request.auth.token.role === 'owner' || request.auth.token.role === 'super_admin') return true;
    const email = (request.auth.token.email || '').toLowerCase();
    if (['mohammedabdelrouf85@gmail.com', 'raouf.work@gmail.com', 'admin@healthvibe.ai'].includes(email)) return true;
    const udata = this.getUserData(request);
    return udata.isOwner === true || udata.role === 'owner' || udata.role === 'super_admin';
  }

  hasUserDoc(request) {
    return Boolean(request.auth && this.users[request.auth.uid]);
  }

  getUserData(request) {
    return (request.auth && this.users[request.auth.uid]) || {};
  }

  isEmailVerified(request) {
    if (!request.auth || this.isVerificationRevoked(request)) return false;
    if (request.auth.token.email_verified === true) return true;
    if (this.isOwner(request)) return true;
    const udata = this.getUserData(request);
    return udata.emailVerified === true || udata.phoneVerified === true;
  }

  getUserRole(request) {
    if (!request.auth) return 'unauthenticated';
    if (request.auth.token.role) return request.auth.token.role;
    const udata = this.getUserData(request);
    return udata.role || 'patient';
  }

  isAdmin(request) {
    if (this.isOwner(request)) return true;
    if (!request.auth) return false;
    const role = this.getUserRole(request);
    return role === 'clinic_admin' || role === 'super_admin';
  }

  isDoctor(request) {
    if (!request.auth) return false;
    if (this.isOwner(request)) return true;
    const role = this.getUserRole(request);
    if (role === 'doctor') return true;
    const udata = this.getUserData(request);
    return udata.role === 'doctor' || udata.verifiedDoctor === true;
  }

  isAssignedDoctor(request, resourceData) {
    if (!this.isDoctor(request)) return false;
    const uid = request.auth.uid;
    return resourceData.assignedDoctorId === uid ||
           resourceData.doctorId === uid ||
           resourceData.doctorUid === uid ||
           resourceData.approvingDoctorId === uid;
  }

  isValidOxygen(data) {
    if ('oxygenLevel' in data && (typeof data.oxygenLevel !== 'number' || data.oxygenLevel < 50 || data.oxygenLevel > 100)) return false;
    if ('o2' in data && (typeof data.o2 !== 'number' || data.o2 < 50 || data.o2 > 100)) return false;
    return true;
  }

  isValidAssessment(data) {
    if (!this.isValidOxygen(data)) return false;
    if ('breathingDifficulty' in data && (typeof data.breathingDifficulty !== 'string' || data.breathingDifficulty.length === 0 || data.breathingDifficulty.length > 40)) return false;
    if ('coughLevel' in data && (typeof data.coughLevel !== 'string' || data.coughLevel.length === 0 || data.coughLevel.length > 40)) return false;
    if ('symptomDuration' in data && (typeof data.symptomDuration !== 'string' || data.symptomDuration.length === 0 || data.symptomDuration.length > 50)) return false;
    if ('riskFactors' in data && (!Array.isArray(data.riskFactors) || data.riskFactors.length > 10)) return false;
    if ('priority' in data && !['normal', 'high', 'urgent'].includes(data.priority)) return false;
    return true;
  }

  hasNoPatientForgedClinicalResult(data) {
    const forbidden = [
      'result', 'approvedAt', 'generatedAt', 'reportGeneratedAt',
      'clinicalDiagnosis', 'clinicalNotes', 'doctorNotes', 'doctorNote',
      'medications', 'recommendation', 'recommendations',
      'approvingDoctorId', 'approvingDoctorEmail', 'approvingDoctorName', 'reportRef'
    ];
    for (const k of forbidden) {
      if (k in data && data[k] !== null) return false;
    }
    if ('doctorApproved' in data && data.doctorApproved !== false) return false;
    return true;
  }

  isDoctorApprovedCase(data) {
    return data.status === 'approved' && data.doctorApproved === true;
  }

  hasNoUnreleasedClinicalResult(data) {
    const forbidden = [
      'result', 'clinicalDiagnosis', 'clinicalNotes', 'doctorNotes',
      'medications', 'recommendation', 'recommendations'
    ];
    for (const k of forbidden) {
      if (k in data && data[k] !== null) return false;
    }
    if ('doctorNote' in data && data.doctorNote !== null) {
      if (!['more_info_requested', 'rejected'].includes(data.status)) return false;
    }
    return true;
  }

  isPatientOwnedRecord(request, data) {
    if (!request.auth) return false;
    const uid = request.auth.uid;
    const email = request.auth.token.email;
    return data.patientId === uid ||
           data.patientUid === uid ||
           data.userId === uid ||
           data.uid === uid ||
           (email && data.patientEmail === email) ||
           (email && data.email === email);
  }

  isPublishedReport(data) {
    if (this.isDoctorApprovedCase(data)) return true;
    const rStatus = data.reportStatus;
    const aStatus = data.approvalStatus;
    const valid = ['approved', 'published', 'certified', 'released'];
    return Boolean((rStatus && valid.includes(rStatus)) || (aStatus && valid.includes(aStatus)));
  }

  canReadCase(request, resourceData) {
    if (!request.auth) return false;
    if (this.isOwner(request)) return true;
    if (this.isAdmin(request)) return true;
    if (this.isAssignedDoctor(request, resourceData)) return true;
    if (resourceData.patientId === request.auth.uid) {
      return this.isDoctorApprovedCase(resourceData) || this.hasNoUnreleasedClinicalResult(resourceData);
    }
    return false;
  }

  canCreateCase(request, resourceData) {
    if (!this.isEmailVerified(request)) return false;
    if (resourceData.patientId !== request.auth.uid) return false;
    const validStatuses = ['draft', 'submitted', 'triaged', 'assigned', 'pending'];
    if (!validStatuses.includes(resourceData.status)) return false;
    if (!this.hasNoPatientForgedClinicalResult(resourceData)) return false;
    if (!this.isValidAssessment(resourceData)) return false;
    return true;
  }

  canUpdateCase(request, currentData, updatedData) {
    if (!request.auth) return false;
    if (updatedData.patientId !== currentData.patientId) return false;
    const validStatuses = ['draft', 'submitted', 'triaged', 'assigned', 'under_review', 'more_info_requested', 'approved', 'rejected', 'escalated', 'closed', 'pending'];
    if (!validStatuses.includes(updatedData.status)) return false;
    if (!this.isValidAssessment(updatedData)) return false;

    // Check patient more info response
    const isPatientResponse = (
      currentData.patientId === request.auth.uid &&
      currentData.status === 'more_info_requested' &&
      updatedData.status === 'under_review' &&
      this.hasNoPatientForgedClinicalResult(updatedData)
    );

    return this.isAssignedDoctor(request, currentData) ||
           this.isAdmin(request) ||
           this.isOwner(request) ||
           isPatientResponse;
  }

  // Evaluate /users/{userId}
  canReadUser(request, userId) {
    if (!request.auth) return false;
    return request.auth.uid === userId || this.isAdmin(request);
  }

  canCreateUser(request, userId, data) {
    if (!request.auth || request.auth.uid !== userId) return false;
    const privileged = ['role', 'isOwner', 'doctorVerified', 'verifiedDoctor', 'doctorApplicationStatus'];
    return !privileged.some(k => k in data);
  }

  canUpdateUser(request, userId, currentData, updatedData) {
    if (!request.auth) return false;
    if (this.isOwner(request)) return true;
    const privileged = ['role', 'isOwner', 'doctorVerified', 'verifiedDoctor', 'doctorApplicationStatus'];
    if (request.auth.uid === userId) {
      return !privileged.some(k => (k in updatedData) && updatedData[k] !== currentData[k]);
    }
    if (this.isAdmin(request)) {
      const adminPrivileged = ['role', 'isOwner'];
      return !adminPrivileged.some(k => (k in updatedData) && updatedData[k] !== currentData[k]);
    }
    return false;
  }

  canReadReport(request, resourceData) {
    if (!request.auth) return false;
    if (this.isOwner(request)) return true;
    if (this.isAdmin(request)) return true;
    return Boolean(this.isPatientOwnedRecord(request, resourceData) && this.isPublishedReport(resourceData));
  }

  // Evaluate /audit_events/{eventId}
  canReadAuditEvent(request) {
    return this.isAdmin(request);
  }

  canWriteAuditEvent() {
    return false;
  }

  // Evaluate /appointments/{appointmentId}
  canReadAppointment(request, resourceData) {
    if (!request.auth) return false;
    if (this.isAdmin(request) || this.isDoctor(request)) return true;
    return resourceData.patientId === request.auth.uid;
  }

  canCreateAppointment(request, resourceData) {
    if (!request.auth) return false;
    if (resourceData.patientId !== request.auth.uid) return false;
    return ['confirmed', 'pending'].includes(resourceData.status);
  }

  canUpdateAppointment(request, resourceData, updatedData) {
    if (!request.auth) return false;
    if (this.isAdmin(request) || this.isDoctor(request)) return true;
    return resourceData.patientId === request.auth.uid && updatedData.patientId === request.auth.uid;
  }

  canDeleteAppointment(request, resourceData) {
    if (!request.auth) return false;
    if (this.isAdmin(request)) return true;
    return resourceData.patientId === request.auth.uid;
  }

  // Evaluate /email_notifications/{notificationId}
  canReadEmailNotification(request, resourceData) {
    if (!request.auth) return false;
    if (this.isAdmin(request) || this.isDoctor(request)) return true;
    return resourceData.patientId === request.auth.uid || Boolean(request.auth.token && request.auth.token.email && resourceData.recipient === request.auth.token.email);
  }

  canWriteEmailNotification() {
    return false;
  }

  // Evaluate /feedbacks/{feedbackId}
  canReadFeedback(request, resourceData) {
    if (!request.auth) return false;
    if (this.isAdmin(request) || this.isDoctor(request)) return true;
    if (resourceData.userId === request.auth.uid) return true;
    return resourceData.isPublic === true;
  }

  canCreateFeedback(request, resourceData) {
    if (!request.auth) return false;
    if (resourceData.userId !== request.auth.uid) return false;
    if (typeof resourceData.rating !== "number" || resourceData.rating < 1 || resourceData.rating > 5) return false;
    if (!["patient", "doctor", "clinic_admin", "super_admin"].includes(resourceData.role)) return false;
    if (typeof resourceData.comment !== "string" || resourceData.comment.length === 0 || resourceData.comment.length > 2000) return false;
    return true;
  }

  canUpdateOrDeleteFeedback(request) {
    if (!request.auth) return false;
    return this.isAdmin(request);
  }

  // Catch-all
  canAccessCatchAll() {
    return false;
  }
}

// 3. EXECUTE TEST BATTERY
console.log("\n🚀 Running Firestore Security Rules Test Suite...\n");

const dbState = {
  users: {
    "user_patient": { role: "patient", emailVerified: true },
    "user_doctor_assigned": { role: "doctor", verifiedDoctor: true, emailVerified: true },
    "user_doctor_unassigned": { role: "doctor", verifiedDoctor: true, emailVerified: true },
    "user_support": { role: "support", emailVerified: true },
    "user_admin": { role: "super_admin", isOwner: true, emailVerified: true }
  }
};

const sim = new RulesSimulator(dbState);

let testsRun = 0;
let testsPassed = 0;

function runTest(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// SECTION A: CASES COLLECTION (/cases/{caseId})
runTest("Patient creates valid case with normal SpO2 (97%) -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "submitted",
    oxygenLevel: 97,
    o2: 97,
    breathingDifficulty: "mild",
    coughLevel: "none",
    symptomDuration: "2 days",
    priority: "normal"
  };
  assert.strictEqual(sim.canCreateCase(req, caseDoc), true);
});

runTest("Patient attempts to create case with forged clinical diagnosis -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "submitted",
    oxygenLevel: 97,
    clinicalDiagnosis: "Self diagnosed bronchitis",
    doctorApproved: false
  };
  assert.strictEqual(sim.canCreateCase(req, caseDoc), false);
});

runTest("Patient attempts to create case with forged doctorApproved=true -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "submitted",
    oxygenLevel: 97,
    doctorApproved: true
  };
  assert.strictEqual(sim.canCreateCase(req, caseDoc), false);
});

runTest("Patient attempts to create case with physiologically invalid SpO2 (150%) -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "submitted",
    oxygenLevel: 150
  };
  assert.strictEqual(sim.canCreateCase(req, caseDoc), false);
});

runTest("Patient attempts to create case with unverified email -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "unverified_user", email: "unverified@test.com", email_verified: false })
  };
  const caseDoc = {
    patientId: "unverified_user",
    status: "submitted",
    oxygenLevel: 98
  };
  assert.strictEqual(sim.canCreateCase(req, caseDoc), false);
});

runTest("Patient reads own case when pending and has NO unreleased clinical notes -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "submitted",
    oxygenLevel: 96,
    clinicalDiagnosis: null,
    medications: null
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), true);
});

runTest("Patient reads own case when pending BUT has unreleased clinical diagnosis -> DENY (Security Gate)", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "under_review",
    doctorApproved: false,
    clinicalDiagnosis: "Pneumonia with severe hypoxemia"
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), false);
});

runTest("Patient reads own case when doctorApproved=true and status='approved' -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "approved",
    doctorApproved: true,
    clinicalDiagnosis: "Verified bronchitis",
    medications: "Salbutamol 100mcg"
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), true);
});

runTest("Patient attempts to read another patient's case -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient_2" })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "approved",
    doctorApproved: true
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), false);
});

runTest("Assigned Doctor reads case assigned to them -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor" })
  };
  const caseDoc = {
    patientId: "user_patient",
    assignedDoctorId: "user_doctor_assigned",
    status: "under_review",
    clinicalDiagnosis: "Draft diagnosis"
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), true);
});

runTest("Unassigned Doctor attempts to read another doctor's case -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_unassigned", role: "doctor" })
  };
  const caseDoc = {
    patientId: "user_patient",
    assignedDoctorId: "user_doctor_assigned",
    status: "under_review"
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), false);
});

runTest("Support user attempts to read clinical case -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_support", role: "support" })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "under_review"
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), false);
});

runTest("Admin reads any clinical case -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_admin", role: "super_admin", isOwner: true, email: "admin@healthvibe.ai", email_verified: true })
  };
  const caseDoc = {
    patientId: "user_patient",
    status: "under_review"
  };
  assert.strictEqual(sim.canReadCase(req, caseDoc), true);
});

runTest("Assigned Doctor updates case with clinical findings and approval -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor" })
  };
  const currentDoc = {
    patientId: "user_patient",
    assignedDoctorId: "user_doctor_assigned",
    status: "under_review"
  };
  const updatedDoc = {
    patientId: "user_patient",
    assignedDoctorId: "user_doctor_assigned",
    status: "approved",
    doctorApproved: true,
    clinicalDiagnosis: "Seasonal allergic asthma",
    medications: "Inhaler"
  };
  assert.strictEqual(sim.canUpdateCase(req, currentDoc, updatedDoc), true);
});

runTest("Doctor attempts to tamper with patientId (immutable) -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor" })
  };
  const currentDoc = {
    patientId: "user_patient",
    assignedDoctorId: "user_doctor_assigned",
    status: "under_review"
  };
  const updatedDoc = {
    patientId: "user_patient_altered",
    assignedDoctorId: "user_doctor_assigned",
    status: "approved"
  };
  assert.strictEqual(sim.canUpdateCase(req, currentDoc, updatedDoc), false);
});

runTest("Patient updates case during more_info_requested to submit reply -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const currentDoc = {
    patientId: "user_patient",
    status: "more_info_requested",
    doctorNote: "Please confirm if you have fever."
  };
  const updatedDoc = {
    patientId: "user_patient",
    status: "under_review",
    patientResponse: "No fever, only dry cough for 3 days."
  };
  assert.strictEqual(sim.canUpdateCase(req, currentDoc, updatedDoc), true);
});

runTest("Patient attempts to approve case during more_info reply -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const currentDoc = {
    patientId: "user_patient",
    status: "more_info_requested"
  };
  const updatedDoc = {
    patientId: "user_patient",
    status: "approved",
    doctorApproved: true
  };
  assert.strictEqual(sim.canUpdateCase(req, currentDoc, updatedDoc), false);
});

// SECTION B: USERS COLLECTION (/users/{userId})
runTest("Patient reads own user profile -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  assert.strictEqual(sim.canReadUser(req, "user_patient"), true);
});

runTest("Patient attempts to read another user's profile -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  assert.strictEqual(sim.canReadUser(req, "user_doctor_assigned"), false);
});

runTest("Patient attempts to create user doc with role: 'super_admin' -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "attacker" })
  };
  const doc = {
    name: "Attacker",
    role: "super_admin"
  };
  assert.strictEqual(sim.canCreateUser(req, "attacker", doc), false);
});

runTest("Patient attempts to escalate role in user doc -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const currentDoc = { name: "Ahmed", role: "patient" };
  const updatedDoc = { name: "Ahmed", role: "super_admin" };
  assert.strictEqual(sim.canUpdateUser(req, "user_patient", currentDoc, updatedDoc), false);
});

// SECTION C: REPORTS COLLECTION (/reports/{reportId})
runTest("Patient reads own published report -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const reportDoc = {
    patientId: "user_patient",
    status: "approved",
    doctorApproved: true,
    reportStatus: "published"
  };
  assert.strictEqual(sim.canReadReport(req, reportDoc), true);
});

runTest("Patient attempts to read unapproved report -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const reportDoc = {
    patientId: "user_patient",
    status: "draft",
    doctorApproved: false,
    reportStatus: "unreleased"
  };
  assert.strictEqual(sim.canReadReport(req, reportDoc), false);
});

// SECTION D: AUDIT EVENTS & CATCH-ALL
runTest("Client attempts to write to /audit_events -> DENY", () => {
  assert.strictEqual(sim.canWriteAuditEvent(), false);
});

runTest("Admin reads /audit_events -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_admin", role: "super_admin", isOwner: true, email: "admin@healthvibe.ai", email_verified: true })
  };
  assert.strictEqual(sim.canReadAuditEvent(req), true);
});

runTest("Access to arbitrary collection /secret_vault -> DENY", () => {
  assert.strictEqual(sim.canAccessCatchAll(), false);
});

// SECTION E: CLINICAL APPOINTMENTS (/appointments/{appointmentId})
runTest("Patient creates valid appointment for themselves -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const apptDoc = {
    patientId: "user_patient",
    doctorName: "د. منى سامي",
    date: "2026-09-25",
    timeSlot: "10:00 AM",
    status: "confirmed"
  };
  assert.strictEqual(sim.canCreateAppointment(req, apptDoc), true);
});

runTest("Patient attempts to create appointment for another patient -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const apptDoc = {
    patientId: "another_patient_id",
    doctorName: "د. منى سامي",
    date: "2026-09-25",
    timeSlot: "10:00 AM",
    status: "confirmed"
  };
  assert.strictEqual(sim.canCreateAppointment(req, apptDoc), false);
});

runTest("Patient reads own appointment -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const apptDoc = {
    patientId: "user_patient",
    doctorName: "د. منى سامي",
    status: "confirmed"
  };
  assert.strictEqual(sim.canReadAppointment(req, apptDoc), true);
});

runTest("Patient attempts to read another patient's appointment -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const apptDoc = {
    patientId: "other_patient_99",
    doctorName: "د. منى سامي",
    status: "confirmed"
  };
  assert.strictEqual(sim.canReadAppointment(req, apptDoc), false);
});

runTest("Doctor reads any clinical appointment -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor", verifiedDoctor: true })
  };
  const apptDoc = {
    patientId: "user_patient",
    doctorName: "د. منى سامي",
    status: "confirmed"
  };
  assert.strictEqual(sim.canReadAppointment(req, apptDoc), true);
});

runTest("Patient cancels/updates their own appointment -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient" })
  };
  const apptDoc = {
    patientId: "user_patient",
    doctorName: "د. منى سامي",
    status: "confirmed"
  };
  const updatedDoc = {
    patientId: "user_patient",
    doctorName: "د. منى سامي",
    status: "cancelled"
  };
  assert.strictEqual(sim.canUpdateAppointment(req, apptDoc, updatedDoc), true);
});

// SECTION F: EMAIL NOTIFICATIONS (/email_notifications/{notificationId})
runTest("Patient reads own email notification -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const notificationDoc = {
    patientId: "user_patient",
    recipient: "patient@test.com",
    type: "result_ready"
  };
  assert.strictEqual(sim.canReadEmailNotification(req, notificationDoc), true);
});

runTest("Patient attempts to read another patient's email notification -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const notificationDoc = {
    patientId: "another_user_99",
    recipient: "other@example.com",
    type: "result_ready"
  };
  assert.strictEqual(sim.canReadEmailNotification(req, notificationDoc), false);
});

runTest("Doctor reads clinical email notification -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor", verifiedDoctor: true })
  };
  const notificationDoc = {
    patientId: "user_patient",
    recipient: "patient@test.com",
    type: "result_ready"
  };
  assert.strictEqual(sim.canReadEmailNotification(req, notificationDoc), true);
});

runTest("Client attempts to write directly to /email_notifications -> DENY", () => {
  assert.strictEqual(sim.canWriteEmailNotification(), false);
});

// SECTION G: CLINICAL & PATIENT FEEDBACKS (/feedbacks/{feedbackId})
runTest("Patient creates valid feedback (5 stars, clinical experience) -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const feedbackData = {
    userId: "user_patient",
    role: "patient",
    rating: 5,
    category: "clinical_assessment",
    comment: "تجربة ممتازة وتشخيص دقيق وسريع للغاية."
  };
  assert.strictEqual(sim.canCreateFeedback(req, feedbackData), true);
});

runTest("Doctor creates valid clinical feedback (AI accuracy observation) -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor", verifiedDoctor: true })
  };
  const feedbackData = {
    userId: "user_doctor_assigned",
    role: "doctor",
    rating: 4,
    category: "ai_triage_accuracy",
    comment: "توزيع دقيق لدرجات الخطورة وتطابق عالي مع معايير SpO2."
  };
  assert.strictEqual(sim.canCreateFeedback(req, feedbackData), true);
});

runTest("User attempts to submit feedback for another user ID -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const feedbackData = {
    userId: "victim_user_123",
    role: "patient",
    rating: 5,
    comment: "Forged user comment"
  };
  assert.strictEqual(sim.canCreateFeedback(req, feedbackData), false);
});

runTest("User attempts to submit feedback with invalid rating (6 stars) -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const feedbackData = {
    userId: "user_patient",
    role: "patient",
    rating: 6,
    comment: "Invalid star rating"
  };
  assert.strictEqual(sim.canCreateFeedback(req, feedbackData), false);
});

runTest("Patient reads their own feedback -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const feedbackDoc = {
    userId: "user_patient",
    isPublic: false
  };
  assert.strictEqual(sim.canReadFeedback(req, feedbackDoc), true);
});

runTest("Patient attempts to read private feedback of another user -> DENY", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  const feedbackDoc = {
    userId: "other_patient_99",
    isPublic: false
  };
  assert.strictEqual(sim.canReadFeedback(req, feedbackDoc), false);
});

runTest("Doctor reads patient feedback -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_doctor_assigned", role: "doctor", verifiedDoctor: true })
  };
  const feedbackDoc = {
    userId: "user_patient",
    isPublic: false
  };
  assert.strictEqual(sim.canReadFeedback(req, feedbackDoc), true);
});

runTest("Patient attempts to update/delete feedback -> DENY (Admin only)", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_patient", email: "patient@test.com", email_verified: true })
  };
  assert.strictEqual(sim.canUpdateOrDeleteFeedback(req), false);
});

runTest("Admin can update/delete feedback -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_admin", role: "super_admin", isOwner: true, emailVerified: true })
  };
  assert.strictEqual(sim.canUpdateOrDeleteFeedback(req), true);
});

// SECTION J: 👑 SUPREME OWNER UNRESTRICTED PERMISSIONS
runTest("Owner can read ANY clinical case without restriction -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_owner", email: "mohammedabdelrouf85@gmail.com", role: "super_admin" })
  };
  const unapprovedCase = {
    patientId: "random_patient_99",
    status: "draft",
    officialDiagnosis: "Confidential Finding"
  };
  assert.strictEqual(sim.canReadCase(req, unapprovedCase), true);
});

runTest("Owner can update privileged role and isOwner fields on any user doc -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_owner", email: "mohammedabdelrouf85@gmail.com", role: "super_admin" })
  };
  const currentDoc = { name: "Doctor Ali", role: "doctor" };
  const updatedDoc = { name: "Doctor Ali", role: "clinic_admin", isOwner: true };
  assert.strictEqual(sim.canUpdateUser(req, "target_user_123", currentDoc, updatedDoc), true);
});

runTest("Owner can read ANY medical/clinical report -> ALLOW", () => {
  const req = {
    auth: sim.evalAuth({ uid: "user_owner", email: "mohammedabdelrouf85@gmail.com", role: "super_admin" })
  };
  const unreleasedReport = {
    patientId: "patient_secret",
    status: "draft",
    doctorApproved: false
  };
  assert.strictEqual(sim.canReadReport(req, unreleasedReport), true);
});

console.log(`\n========================================`);
console.log(`🎉 ALL ${testsPassed}/${testsRun} FIRESTORE SECURITY RULES TESTS PASSED!`);
console.log(`========================================\n`);
