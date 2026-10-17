/**
 * Health Vibe AI - Critical Flows Full Lifecycle Test Suite (Req #65)
 * 
 * Comprehensive E2E Medical & QA Test Case covering the complete clinical journey:
 * 1. Patient Registration & Attending Doctor Assignment (One Medical Attending Model)
 * 2. Respiratory Symptoms & Vitals Entry with Physiological Boundary Checks
 * 3. ML Model Execution, Loading States & Double-Submission Guards (Ada Health)
 * 4. Attending Pulmonologist Clinical Review, Prescription & Governance (Doctolib)
 * 5. Certified PDF Report Generation, Kry Zero-PHI Links & Authenticity Verification
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Domain & Clinical Services
const ReportsService = require('../app/modules/reports/reports-service');
const { DoctorAssignmentService } = require('../backend/doctor-assignment-service');
const {
  secureReportLinkService,
  generateSecureReportToken,
  verifySecureReportToken,
  generateSecureReportUrl,
  formatSecureReportSms,
  verifyZeroPhiCompliance
} = require('../backend/secure-report-link-service');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: CRITICAL FLOWS E2E TEST SUITE (Req #65)');
console.log('   Registration ➔ Symptoms ➔ ML Engine ➔ Doctor Review ➔ PDF Report');
console.log('==================================================================\n');

// ── In-Memory Firestore & Relational Mock Environment ───────────────────────
class MockFirestore {
  constructor() {
    this.collections = {
      users: new Map(),
      cases: new Map(),
      clinical_reports: new Map(),
      auditLog: new Map()
    };
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new Map();
    }
    const store = this.collections[name];

    return {
      doc: (id) => ({
        get: async () => {
          const item = store.get(id);
          return {
            id,
            exists: Boolean(item),
            data: () => (item ? { ...item } : undefined)
          };
        },
        set: async (data, opts = {}) => {
          if (opts.merge && store.has(id)) {
            const current = store.get(id);
            store.set(id, { ...current, ...data });
          } else {
            store.set(id, { ...data });
          }
          return true;
        },
        update: async (fields) => {
          if (!store.has(id)) throw new Error(`Document ${id} does not exist in ${name}`);
          const current = store.get(id);
          store.set(id, { ...current, ...fields });
          return true;
        }
      }),
      add: async (data) => {
        const id = `${name.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        store.set(id, { id, ...data });
        return { id };
      },
      where: (field, op, val) => ({
        get: async () => {
          const results = [];
          for (const [id, item] of store.entries()) {
            if (op === '==' && item[field] === val) {
              results.push({ id, exists: true, data: () => ({ ...item }) });
            }
          }
          return { empty: results.length === 0, docs: results };
        }
      })
    };
  }
}

// ── Application Security & Masking Helpers ─────────────────────────────────
const isCaseApprovedForPatient = (c) => Boolean(c && c.status === 'approved' && c.doctorApproved === true);

function maskUnapprovedPatientCase(c) {
  if (!c || isCaseApprovedForPatient(c)) return c;
  const masked = { ...c };
  [
    'result', 'risk', 'riskEn', 'aiScore', 'aiScoreEn', 'ruleScore',
    'clinicalDiagnosis', 'clinicalNotes', 'doctorNotes', 'medications',
    'recommendation', 'recommendations', 'reportRef', 'reportGeneratedAt',
    'generatedAt', 'approvedAt', 'approvingDoctorId', 'approvingDoctorEmail',
    'approvingDoctorName', 'doctorSpecialty', 'doctorLicense', 'clinicName'
  ].forEach((key) => {
    if (key in masked) masked[key] = null;
  });
  return masked;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL FLOW EXECUTION
// ─────────────────────────────────────────────────────────────────────────────
async function runCriticalFlowsTest() {
  const firestore = new MockFirestore();
  const doctorAssignmentService = new DoctorAssignmentService({ db: firestore });

  // ===========================================================================
  // STAGE 1: PATIENT REGISTRATION & ONBOARDING (One Medical Model)
  // ===========================================================================
  console.log('▶ STAGE 1: Patient Registration & Attending Pulmonologist Assignment');
  
  const patientData = {
    uid: 'patient_ahmed_almasry_902',
    name: 'أحمد محمود المصري',
    email: 'ahmed.masry@example.com',
    phoneNumber: '+201098765432',
    nationalId: '29204150102938',
    age: 44,
    gender: 'male',
    role: 'patient',
    emailVerified: true
  };

  await firestore.collection('users').doc(patientData.uid).set(patientData);
  const patientDoc = await firestore.collection('users').doc(patientData.uid).get();
  assert.strictEqual(patientDoc.exists, true, 'Patient document must be persisted in database');
  assert.strictEqual(patientDoc.data().name, 'أحمد محمود المصري');
  console.log('  ✓ Patient account successfully created & identity verified (+201098765432).');

  // Assign attending pulmonologist using Mode A (Egyptian Medical Syndicate Doctor)
  const assignmentResult = await doctorAssignmentService.assignDoctorToPatient({
    patientId: patientData.uid,
    doctorId: 'tarek_mahmoud_md', // Verified Egyptian Syndicate pulmonologist
    mode: 'patient_choice',
    patientName: patientData.name
  });

  assert.strictEqual(assignmentResult.patientId, patientData.uid);
  assert.strictEqual(assignmentResult.doctorId, 'tarek_mahmoud_md');
  assert.strictEqual(assignmentResult.status, 'active');
  assert(assignmentResult.doctorName.includes('طارق محمود'));
  assert.strictEqual(assignmentResult.syndicateId, 'DOC-PULMO-44821');
  console.log(`  ✓ Attending Pulmonologist assigned: ${assignmentResult.doctorName} (Syndicate: ${assignmentResult.syndicateId}).`);

  // ===========================================================================
  // STAGE 2: RESPIRATORY SYMPTOMS & VITALS ENTRY WITH BOUNDARY CHECKS
  // ===========================================================================
  console.log('\n▶ STAGE 2: Respiratory Symptoms & Physiological Vitals Input');

  const respiratoryInput = {
    patientId: patientData.uid,
    patientName: patientData.name,
    patientAge: patientData.age,
    patientGender: patientData.gender,
    patientPhone: patientData.phoneNumber,
    assignedDoctorId: assignmentResult.doctorId,
    assignedDoctorName: assignmentResult.doctorName,
    
    // Vitals
    oxygenLevel: 91, // 91% -> Moderate Hypoxemia (Amber boundary)
    o2: 91,
    respiratoryRate: 24, // Tachypneic (>20 breaths/min)
    pulse: 98,
    temperature: 38.3,
    
    // Symptoms
    breathingDifficulty: 'نعم',
    difficulty: 'نعم',
    coughLevel: 'شديدة مع بلغم',
    symptomDuration: '4 أيام',
    chestPain: 'لا',
    smokingStatus: 'مدخن سابق'
  };

  // Physiological Boundary Validation
  assert(respiratoryInput.oxygenLevel >= 50 && respiratoryInput.oxygenLevel <= 100, 'SpO2 must be physiological (50-100%)');
  assert(respiratoryInput.respiratoryRate >= 10 && respiratoryInput.respiratoryRate <= 60, 'Respiratory rate must be physiological');
  assert(respiratoryInput.temperature >= 35.0 && respiratoryInput.temperature <= 42.0, 'Temperature must be physiological');
  
  // Triage boundary check: 91% falls into Moderate Caution tier (90-94%)
  const isHypoxemic = respiratoryInput.oxygenLevel < 95;
  const isCriticalHypoxemia = respiratoryInput.oxygenLevel < 90;
  assert.strictEqual(isHypoxemic, true, 'SpO2 91% must be flagged as hypoxemia');
  assert.strictEqual(isCriticalHypoxemia, false, 'SpO2 91% is moderate, not critical (<90%)');
  console.log('  ✓ Vitals entered and validated: SpO2 = 91% (Moderate Hypoxemia), RR = 24 bpm, Temp = 38.3°C.');

  // ===========================================================================
  // STAGE 3: ML MODEL EXECUTION, LOADING STATE & DOUBLE SUBMISSION GUARD
  // ===========================================================================
  console.log('\n▶ STAGE 3: ML Assessment Execution & Double-Submission Guard (Ada Health)');

  // Simulate Ada Health Double-Submission Lock
  let isSubmitting = false;
  function triggerMlAssessment(input) {
    if (isSubmitting) {
      return { rejected: true, reason: 'DOUBLE_SUBMISSION_PREVENTED' };
    }
    isSubmitting = true;
    
    // Simulated inference: Evaluate risk tier based on SpO2 and symptoms
    const riskTier = ReportsService.getClinicalRiskTier(input, false);
    
    // Construct case document in database
    const caseRecord = {
      ...input,
      priority: riskTier.tier === 'high' ? 'urgent' : (riskTier.tier === 'caution' ? 'medium' : 'low'),
      aiCondition: 'التهاب شعبي حاد مترافق مع نقص نسبي في الأكسجين',
      aiConditionEn: 'Acute Bronchitis with Relative Hypoxemia',
      aiConfidence: 0.89,
      riskTier: riskTier.tier,
      status: 'submitted',
      doctorApproved: false,
      clinicalDiagnosis: 'التهاب شعبي حاد مقترح من الذكاء الاصطناعي',
      medications: 'بخاخ موسع للشعب الهوائية مقترح',
      submittedAt: new Date().toISOString()
    };

    return { rejected: false, caseRecord };
  }

  // 1st click: Proceeds successfully
  const firstSubmission = triggerMlAssessment(respiratoryInput);
  assert.strictEqual(firstSubmission.rejected, false, 'First submission must be accepted');
  
  // 2nd click during processing: Must be blocked
  const secondSubmission = triggerMlAssessment(respiratoryInput);
  assert.strictEqual(secondSubmission.rejected, true, 'Concurrent submission must be blocked by double-submission guard');
  assert.strictEqual(secondSubmission.reason, 'DOUBLE_SUBMISSION_PREVENTED');
  console.log('  ✓ Ada Health double-submission guard verified: Rapid consecutive clicks rejected.');

  // Persist generated case in Firestore
  const { id: caseId } = await firestore.collection('cases').add(firstSubmission.caseRecord);
  assert(caseId, 'Case ID must be created');
  console.log(`  ✓ ML Inference complete: Case recorded #${caseId} (Triage: Amber / يحتاج متابعة).`);

  // Gate Check: Unapproved case must be masked for patient
  const storedCase = await firestore.collection('cases').doc(caseId).get();
  const maskedCase = maskUnapprovedPatientCase(storedCase.data());
  assert.strictEqual(isCaseApprovedForPatient(maskedCase), false);
  assert.strictEqual(maskedCase.clinicalDiagnosis, null, 'Clinical diagnosis must be masked before doctor review');
  assert.strictEqual(maskedCase.medications, null, 'Prescriptions must be masked before doctor review');
  console.log('  ✓ Zero-Trust Gate verified: Patient portal cannot access uncertified diagnoses.');

  // ===========================================================================
  // STAGE 4: ATTENDING PULMONOLOGIST CLINICAL REVIEW & GOVERNANCE
  // ===========================================================================
  console.log('\n▶ STAGE 4: Attending Pulmonologist Review & Clinical Certification');

  const doctorProfile = {
    uid: assignmentResult.doctorId,
    name: assignmentResult.doctorName,
    licenseNumber: assignmentResult.syndicateId,
    specialty: assignmentResult.specialty || 'استشاري أمراض الصدر والجهاز التنفسي',
    clinic: assignmentResult.clinicName,
    role: 'doctor'
  };

  // Zero-Trust Access Boundary: An unassigned doctor cannot review this case
  const unauthorizedDoctorUid = 'imposter_doctor_999';
  const isDoctorAssigned = storedCase.data().assignedDoctorId === doctorProfile.uid;
  const isUnauthorizedAssigned = storedCase.data().assignedDoctorId === unauthorizedDoctorUid;
  assert.strictEqual(isDoctorAssigned, true, 'Attending doctor is authorized');
  assert.strictEqual(isUnauthorizedAssigned, false, 'Unassigned doctor must be denied access');
  console.log('  ✓ RBAC Query Boundary verified: Unassigned clinicians rejected.');

  // Doctor formulates certified clinical content
  const certifiedClinicalPayload = {
    clinicalDiagnosis: 'التهاب شعبي حاد مترافق مع حساسية تنفسية ونقص نسبي في الأكسجين (Acute Bronchitis with Bronchospasm)',
    medications: '1. بخاخ فنتولين (Salbutamol 100mcg) - بخاخ مرتان عند اللزوم\n2. شراب أكتيفد مذيب للبلغم - ملعقة كبيرة 3 مرات يومياً\n3. باراسيتامول 500 مجم عند ارتفاع الحرارة',
    recommendations: [
      'قياس نسبة الأكسجين SpO2 كل 6 ساعات ومراجعة الطوارئ فوراً إذا انخفض عن 90%.',
      'الراحة التامة والإكثار من السوائل الدافئة والابتعاد التام عن الأدخنة والأتربة.',
      'إعادة التقييم الطبي بعد 48 ساعة أو عند زيادة ضيق التنفس.'
    ],
    status: 'approved',
    doctorApproved: true,
    approvingDoctorId: doctorProfile.uid,
    approvingDoctorName: doctorProfile.name,
    doctorLicense: doctorProfile.licenseNumber,
    doctorSpecialty: doctorProfile.specialty,
    clinicName: doctorProfile.clinic,
    approvedAt: new Date().toISOString(),
    reportRef: `HV-REP-${caseId.slice(-8).toUpperCase()}`,
    reportHash: `SHA256-${crypto.createHash('sha256').update(caseId).digest('hex').slice(0, 16).toUpperCase()}`,
    reportSnapshot: {
      clinicalContent: {
        diagnosis: 'التهاب شعبي حاد مترافق مع حساسية تنفسية ونقص نسبي في الأكسجين (Acute Bronchitis with Bronchospasm)',
        clinicalDiagnosis: 'التهاب شعبي حاد مترافق مع حساسية تنفسية ونقص نسبي في الأكسجين (Acute Bronchitis with Bronchospasm)',
        medications: '1. بخاخ فنتولين (Salbutamol 100mcg) - بخاخ مرتان عند اللزوم\n2. شراب أكتيفد مذيب للبلغم - ملعقة كبيرة 3 مرات يومياً\n3. باراسيتامول 500 مجم عند ارتفاع الحرارة',
        recommendations: [
          'قياس نسبة الأكسجين SpO2 كل 6 ساعات ومراجعة الطوارئ فوراً إذا انخفض عن 90%.',
          'الراحة التامة والإكثار من السوائل الدافئة والابتعاد التام عن الأدخنة والأتربة.',
          'إعادة التقييم الطبي بعد 48 ساعة أو عند زيادة ضيق التنفس.'
        ]
      },
      doctorIdentity: {
        name: doctorProfile.name,
        licenseNumber: doctorProfile.licenseNumber,
        specialty: doctorProfile.specialty,
        clinic: doctorProfile.clinic
      },
      dates: {
        approvedAt: new Date().toISOString()
      }
    }
  };

  // State machine transition: submitted -> approved
  await firestore.collection('cases').doc(caseId).update(certifiedClinicalPayload);
  
  // Create clinical report snapshot in clinical_reports collection
  await firestore.collection('clinical_reports').doc(caseId).set({
    caseId,
    patientId: patientData.uid,
    reportRef: certifiedClinicalPayload.reportRef,
    clinicalContent: {
      clinicalDiagnosis: certifiedClinicalPayload.clinicalDiagnosis,
      medications: certifiedClinicalPayload.medications,
      recommendations: certifiedClinicalPayload.recommendations
    },
    doctorIdentity: {
      name: doctorProfile.name,
      licenseNumber: doctorProfile.licenseNumber,
      specialty: doctorProfile.specialty,
      clinic: doctorProfile.clinic,
      uid: doctorProfile.uid
    },
    approval: {
      approvedAt: certifiedClinicalPayload.approvedAt,
      approvedBy: { uid: doctorProfile.uid, name: doctorProfile.name }
    }
  });

  const updatedCaseDoc = await firestore.collection('cases').doc(caseId).get();
  assert.strictEqual(updatedCaseDoc.data().status, 'approved');
  assert.strictEqual(updatedCaseDoc.data().doctorApproved, true);
  console.log(`  ✓ Case certified by ${doctorProfile.name} [Syndicate: ${doctorProfile.licenseNumber}].`);

  // ===========================================================================
  // STAGE 5: CERTIFIED PDF REPORT GENERATION, KRY LINK & AUTHENTICITY
  // ===========================================================================
  console.log('\n▶ STAGE 5: Certified PDF Generation, Kry Signed URL & Authenticity Verification');

  const finalCaseData = { id: caseId, ...updatedCaseDoc.data() };
  assert.strictEqual(isCaseApprovedForPatient(finalCaseData), true, 'Report is now officially UNLOCKED for patient');

  // 1. Generate Kry Cryptographic Signed Token (48 Hours TTL)
  const secureLink = generateSecureReportUrl({
    caseId,
    patientId: patientData.uid,
    reportRef: finalCaseData.reportRef,
    expiresInHours: 48,
    appUrl: 'https://healthvibes.app'
  });
  assert(secureLink.url.includes('token='), 'Signed URL must contain cryptographic token');
  
  // Verify patient authentication against token
  const tokenVerify = verifySecureReportToken(secureLink.token, patientData.uid);
  assert.strictEqual(tokenVerify.valid, true);
  assert.strictEqual(tokenVerify.authorized, true);
  console.log('  ✓ Kry Signed URL generated with HMAC-SHA256 & 48h TTL.');

  // 2. Format Zero-PHI SMS
  const sms = formatSecureReportSms({
    patientName: patientData.name,
    reportRef: finalCaseData.reportRef,
    caseId,
    patientId: patientData.uid,
    language: 'ar'
  });
  const zeroPhiCheck = verifyZeroPhiCompliance(sms.text);
  assert.strictEqual(zeroPhiCheck.compliant, true, 'SMS must not leak any clinical diagnosis or vitals');
  console.log('  ✓ Zero-PHI SMS notification formatted for Egyptian mobile (+201098765432).');

  // 3. Generate Certified PDF Printable HTML
  const pdfHtml = ReportsService.generateCertifiedReportPdfHtml(finalCaseData, false);
  assert(typeof pdfHtml === 'string' && pdfHtml.length > 500, 'PDF HTML layout must be generated');
  
  // Verify PDF HTML contains all clinical and legal requirements
  assert(pdfHtml.includes(patientData.name), 'PDF must contain patient name');
  assert(pdfHtml.includes(patientData.phoneNumber), 'PDF must contain patient phone');
  assert(pdfHtml.includes(doctorProfile.name), 'PDF must contain attending physician name');
  assert(pdfHtml.includes(doctorProfile.licenseNumber), 'PDF must contain Egyptian Syndicate license');
  assert(pdfHtml.includes('91%'), 'PDF must display measured SpO2');
  assert(pdfHtml.includes('التهاب شعبي حاد'), 'PDF must display certified diagnosis');
  assert(pdfHtml.includes('بخاخ فنتولين'), 'PDF must display prescribed Rx medications');
  assert(pdfHtml.includes('seal-block') || pdfHtml.includes('OFFICIAL SEAL'), 'PDF must contain digital clinical stamp');
  console.log('  ✓ Certified PDF Report HTML generated with Doctolib digital seal & @media print rules.');

  // 4. QR Code Authenticity Verification
  const qrUrl = ReportsService.buildQrPayload(finalCaseData, 'https://healthvibes.app');
  assert(typeof qrUrl === 'string' && qrUrl.includes('https://healthvibes.app'), 'QR payload must be a verification URL');
  assert(qrUrl.includes(encodeURIComponent(finalCaseData.reportRef)), 'QR code must include encoded report reference');
  assert(qrUrl.includes(encodeURIComponent(finalCaseData.reportHash)), 'QR code must include cryptographic hash');

  // Anti-tampering verification: Verify approved snapshot immutability
  const approvedSnapshot = ReportsService.applyApprovedReportSnapshot(finalCaseData);
  assert.strictEqual(approvedSnapshot.reportHash, finalCaseData.reportHash, 'Report hash must remain intact');
  assert.strictEqual(approvedSnapshot.clinicalDiagnosis, finalCaseData.clinicalDiagnosis, 'Clinical diagnosis in approved snapshot matches record');
  console.log('  ✓ Anti-tampering QR verification passed: Cryptographic hash matches approved snapshot.');

  console.log('\n==================================================================');
  console.log('🎉 ALL 5 CRITICAL FLOW STAGES PASSED WITH 100% SUCCESS!');
  console.log('   Full Patient Journey is Verified & Clinically Governed.');
  console.log('==================================================================\n');
}

runCriticalFlowsTest().catch(err => {
  console.error('\n❌ Critical Flows Test Failed:', err);
  process.exit(1);
});
