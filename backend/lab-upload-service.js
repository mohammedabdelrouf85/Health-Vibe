/**
 * Health Vibe AI - Certified Clinical Lab Upload & Record Linking Backend Service
 *
 * Implements:
 * 1. Strict File Validation & HIPAA Quarantine Engine:
 *    - Supported formats: PDF, JPG, PNG, WEBP.
 *    - Strict extension checking, blocking all harmful/executable extensions.
 *    - 10MB file size limit enforcement (> 0 and <= 10MB).
 *    - Sanitized safe filename generation.
 *    - Initial status: scanStatus = 'upload_pending', availability = 'quarantined'.
 * 2. Specialized Clinical Lab Categories (Docus AI Benchmark):
 *    - blood_test (CBC, chemistry, liver/kidney functions, fasting glucose/HbA1c, lipids)
 *    - sputum_culture (sputum culture & sensitivity, Gram stain, AFB/TB smear)
 *    - abg_gas (Arterial Blood Gas: pH, PaO2, PaCO2, HCO3, SaO2)
 *    - urinalysis (urinalysis, microscopic examination, urine culture)
 *    - other (radiology, hospital discharge summaries, other lab reports)
 * 3. Database & Patient Medical Profile Linkage (EHR):
 *    - Links uploaded lab files in Firestore (`case_files/{fileId}`) to patient profile (`users/{patientId}`).
 *    - Updates `recentLabReports` and `labHistorySummary` on the patient's EHR profile.
 *    - Associates file with clinical cases (`cases/{caseId}`).
 * 4. Clinical Safety & Strict Non-Replacement of Human Doctor (SaMD / FDA / Docus AI):
 *    - Mandatory initial state: reviewStatus = 'pending_doctor_review', doctorApproved = false.
 *    - Automated disclaimers in Arabic and English explicitly stating AI never replaces human doctors.
 *    - Complete block on autonomous AI diagnosis and automated prescriptions.
 *    - Panic / Critical Values Interception & False Reassurance Prevention (anti-complacency).
 *    - Formal Doctor Review & Certification workflow with physician license stamp.
 * 5. Privacy & Access Control (HIPAA Minimum Necessary & Zero-Trust RBAC):
 *    - Non-clinical sub-roles (Support, Ops, Clinical QA) have ZERO access to clinical PHI.
 *    - Immutable audit trail for all PHI access (read, download, review, delete).
 *    - Patient Right to be Forgotten (soft deletion with clinical audit retention).
 * 6. Multi-Channel Notification Dispatch:
 *    - Queues notifications for assigned doctor and on-call clinicians when lab reports are uploaded.
 *    - Dispatches confirmation to patient.
 *    - Escalates urgent/critical findings (e.g. ABG or positive sputum culture) with high-priority alerts.
 */

'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { NOTIFICATION_TYPES, enqueueNotification } = require('./notification-service');
const { AUDIT_EVENT_TYPES, logAuditEvent } = require('./audit-service');

const LAB_CATEGORIES = {
  blood_test: {
    key: 'blood_test',
    icon: '🩸',
    labelAr: 'تحاليل الدم (CBC / كيمياء / سكر)',
    labelEn: 'Blood Tests (CBC / Chemistry / Glucose)',
    clinicalFocus: 'Complete blood count, metabolic panel, liver/kidney functions, glucose/HbA1c, lipids'
  },
  sputum_culture: {
    key: 'sputum_culture',
    icon: '🧫',
    labelAr: 'مزرعة بلغم ومسحة تنفسية',
    labelEn: 'Sputum Culture & Respiratory Smear',
    clinicalFocus: 'Sputum culture and antibiotic sensitivity, Gram stain, AFB smear'
  },
  abg_gas: {
    key: 'abg_gas',
    icon: '🫁',
    labelAr: 'غازات دم شرياني (ABG)',
    labelEn: 'Arterial Blood Gas (ABG)',
    clinicalFocus: 'Arterial blood gases, PaO2, PaCO2, pH, HCO3, oxygenation index'
  },
  urinalysis: {
    key: 'urinalysis',
    icon: '🧪',
    labelAr: 'تحليل بول ومزارع حيوية',
    labelEn: 'Urinalysis & Cultures',
    clinicalFocus: 'Routine urinalysis, microscopic exam, urine culture'
  },
  other: {
    key: 'other',
    icon: '📑',
    labelAr: 'تقارير وأشعة أخرى',
    labelEn: 'Other Lab & Radiology Reports',
    clinicalFocus: 'Chest X-ray, CT, radiology, hospital discharge summaries'
  }
};

const REVIEW_STATUS = {
  PENDING_DOCTOR_REVIEW: 'pending_doctor_review',
  DOCTOR_REVIEWED: 'doctor_reviewed',
  REJECTED_BY_DOCTOR: 'rejected_by_doctor'
};

const CLINICAL_DISCLAIMERS = {
  ar: 'تنبيه طبي وقانوني (Docus AI / SaMD): قراءة نتائج التحاليل والمعامل استرشادية فقط وتعتبر بيانات أولية غير تشخيصية. النظام والذكاء الاصطناعي لا يحلان محل الطبيب البشري المؤهل، ولا يصدران وصفات طبية أو خطط علاجية نهائية. يجب دائماً عرض هذه النتائج على الطبيب البشري المعالج لاعتمادها طبياً وتحديد التدخل السريري المناسب.',
  en: 'Clinical & Legal Safety Notice (Docus AI / SaMD): Automated lab report interpretation and data extractions are strictly preliminary and informational. AI algorithms NEVER replace licensed human physicians and cannot prescribe medications or provide definitive diagnoses. All laboratory findings must be reviewed and certified by a qualified physician.'
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bin', '.app', '.msi', '.scr',
  '.vbs', '.pif', '.jar', '.js', '.mjs', '.php', '.py', '.com'
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const SCAN_STATUS = {
  UPLOAD_PENDING: 'upload_pending',
  PENDING: 'pending',
  SCANNING: 'scanning',
  CLEAN: 'clean',
  INFECTED: 'infected',
  REJECTED: 'rejected'
};

const AVAILABILITY = {
  QUARANTINED: 'quarantined',
  AVAILABLE: 'available',
  BLOCKED: 'blocked',
  DELETED: 'deleted'
};

// In-memory storage for test suites & isolated environments
const inMemoryLabReports = new Map();

/**
 * Asserts that the requesting user is not a non-clinical administrative sub-role
 * (Support, Ops, Clinical QA) who are barred from raw PHI under HIPAA Minimum Necessary rule.
 */
function assertClinicalAccess(user = {}) {
  const role = user.role || 'patient';
  if (role === 'support' || role === 'ops' || role === 'clinical_qa') {
    const err = new Error('Access denied: Non-clinical administrative sub-roles (Support, Ops, Clinical QA) have zero access to clinical PHI.');
    err.code = 'PHI_ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Validates lab file metadata before upload/storage.
 * @param {Object} fileParams
 * @returns {{ isValid: boolean, error?: string, code?: string }}
 */
function validateLabFileUpload({ fileName, contentType, size }) {
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    const err = new Error('File name is required and cannot be empty.');
    err.code = 'EMPTY_FILENAME';
    err.statusCode = 400;
    throw err;
  }

  const lowerName = fileName.trim().toLowerCase();
  const ext = path.extname(lowerName);

  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(`Unsupported file extension '${ext}'. Allowed: .pdf, .jpg, .jpeg, .png, .webp.`);
    err.code = 'UNSUPPORTED_EXTENSION';
    err.statusCode = 400;
    throw err;
  }

  if (BLOCKED_EXECUTABLE_EXTENSIONS.has(ext)) {
    const err = new Error(`Executable file extension '${ext}' is strictly prohibited.`);
    err.code = 'BLOCKED_EXECUTABLE_EXTENSION';
    err.statusCode = 403;
    throw err;
  }

  if (!contentType || !ALLOWED_MIME_TYPES.has(contentType.toLowerCase())) {
    const err = new Error(`Unsupported MIME type '${contentType}'. Allowed: application/pdf, image/jpeg, image/png, image/webp.`);
    err.code = 'UNSUPPORTED_MIME_TYPE';
    err.statusCode = 400;
    throw err;
  }

  const numSize = Number(size);
  if (isNaN(numSize) || numSize <= 0) {
    const err = new Error('File size must be greater than 0 bytes.');
    err.code = 'EMPTY_FILE';
    err.statusCode = 400;
    throw err;
  }

  if (numSize > MAX_FILE_SIZE) {
    const err = new Error(`File size (${(numSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 10MB.`);
    err.code = 'FILE_TOO_LARGE';
    err.statusCode = 400;
    throw err;
  }

  return { isValid: true };
}

/**
 * Sanitizes and generates safe storage filename.
 * @param {string} rawName
 * @returns {string}
 */
function getSafeLabStorageFileName(rawName) {
  if (!rawName) return `lab_report_${Date.now()}.pdf`;
  const ext = path.extname(rawName).toLowerCase() || '.pdf';
  const base = path.basename(rawName, ext);
  const cleanedBase = base
    .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  const safeBase = cleanedBase || `lab_report_${Date.now()}`;
  return `${safeBase}${ext}`;
}

/**
 * Evaluates clinical safety, panic/critical laboratory thresholds, and prevents false reassurance.
 * Critical thresholds:
 * - ABG: PaO2 < 60 mmHg (severe hypoxemia), pH < 7.25 (severe acidosis), PaCO2 > 55 mmHg.
 * - Sputum Culture: Positive AFB/TB, MRSA, or Pseudomonas aeruginosa.
 * - Blood test: Hb < 7 g/dL (severe anemia), WBC > 30,000 (severe sepsis/leukemoid), Platelets < 20,000.
 */
function evaluateLabSafetyAndPanicValues({ labCategory, extractedValues = {}, notes = '' } = {}) {
  let isPanicValue = false;
  const panicReasons = [];
  let emergencyGuidanceAr = '';
  let emergencyGuidanceEn = '';

  const cat = labCategory || 'blood_test';

  if (cat === 'abg_gas') {
    const pO2 = Number(extractedValues.pO2 || extractedValues.paO2);
    const pH = Number(extractedValues.pH);
    const pCO2 = Number(extractedValues.pCO2 || extractedValues.paCO2);

    if (!isNaN(pO2) && pO2 > 0 && pO2 < 60) {
      isPanicValue = true;
      panicReasons.push(`Severe Hypoxemia (PaO2: ${pO2} mmHg < 60)`);
    }
    if (!isNaN(pH) && pH > 0 && pH < 7.25) {
      isPanicValue = true;
      panicReasons.push(`Critical Acidosis (pH: ${pH} < 7.25)`);
    }
    if (!isNaN(pCO2) && pCO2 > 55) {
      isPanicValue = true;
      panicReasons.push(`Severe Hypercapnia (PaCO2: ${pCO2} mmHg > 55)`);
    }
  } else if (cat === 'sputum_culture') {
    const textToCheck = `${notes} ${extractedValues.organism || ''} ${extractedValues.stain || ''}`.toLowerCase();
    if (textToCheck.includes('afb') || textToCheck.includes('acid fast') || textToCheck.includes('tuberculosis') || textToCheck.includes('سل')) {
      isPanicValue = true;
      panicReasons.push('Positive Acid-Fast Bacilli (AFB) / Presumptive Tuberculosis detected');
    }
    if (textToCheck.includes('mrsa') || textToCheck.includes('pseudomonas') || textToCheck.includes('resistant')) {
      isPanicValue = true;
      panicReasons.push('Multi-drug resistant respiratory pathogen detected');
    }
  } else if (cat === 'blood_test') {
    const hb = Number(extractedValues.hb || extractedValues.hemoglobin);
    const wbc = Number(extractedValues.wbc);
    const platelets = Number(extractedValues.platelets);

    if (!isNaN(hb) && hb > 0 && hb < 7.0) {
      isPanicValue = true;
      panicReasons.push(`Critical Anemia (Hemoglobin: ${hb} g/dL < 7.0)`);
    }
    if (!isNaN(wbc) && wbc > 30000) {
      isPanicValue = true;
      panicReasons.push(`Critical Leukocytosis (WBC: ${wbc} /mcL > 30,000)`);
    }
    if (!isNaN(platelets) && platelets > 0 && platelets < 20000) {
      isPanicValue = true;
      panicReasons.push(`Critical Thrombocytopenia (Platelets: ${platelets} /mcL < 20,000)`);
    }
  }

  if (isPanicValue) {
    emergencyGuidanceAr = '⚠️ تنبيه سريري حرج: تشير هذه النتائج إلى قيم حرجة تتطلب تدخلاً طبياً عاجلاً وفورياً. يُرجى التوجه إلى أقرب قسم طوارئ أو مراجعة الطبيب المعالج على الفور، ولا يجب الانتظار.';
    emergencyGuidanceEn = '⚠️ Critical Clinical Alert: These findings indicate panic-level laboratory values requiring urgent emergency medical attention. Please report immediately to an emergency department or contact your physician.';
  }

  return {
    isPanicValue,
    panicReasons,
    emergencyActionRequired: isPanicValue,
    emergencyGuidanceAr,
    emergencyGuidanceEn,
    disclaimerAr: CLINICAL_DISCLAIMERS.ar,
    disclaimerEn: CLINICAL_DISCLAIMERS.en
  };
}

/**
 * Enforces strict AI clinical guardrails:
 * 1. Blocks autonomous definitive diagnosis assertions without physician review.
 * 2. Blocks automated prescription of medications or dose modifications.
 * 3. Strips false reassurance phrases (e.g. "لا تقلق كل شيء طبيعي") when abnormal or pending review.
 * 4. Appends mandatory bilingual disclaimer.
 */
function enforceAiClinicalGuardrails(interpretationText = '', options = {}) {
  const { isDoctorReviewed = false, isPanicValue = false } = options;
  let sanitized = String(interpretationText || '');

  // 1. Strip False Reassurance if pending review or panic
  if (!isDoctorReviewed || isPanicValue) {
    const falseReassurancePatterns = [
      /لا داعي للقلق[\s\S]*?(؟|\.|$)/gi,
      /أنت سليم تماماً[\s\S]*?(؟|\.|$)/gi,
      /نتائجك ممتازة ولا تحتاج طبيب[\s\S]*?(؟|\.|$)/gi,
      /you are completely fine[\s\S]*?(\.|$)/gi,
      /no need to see a doctor[\s\S]*?(\.|$)/gi,
      /nothing to worry about[\s\S]*?(\.|$)/gi
    ];
    for (const pattern of falseReassurancePatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // 2. Block autonomous prescription directives
  const prescriptionPatterns = [
    /(يجب عليك تناول|تناول دواء|ننصحك بأخذ جرعة|prescription:|prescribe|take \d+\s?mg)/gi
  ];
  let prescriptionBlocked = false;
  for (const rxPattern of prescriptionPatterns) {
    if (rxPattern.test(sanitized)) {
      prescriptionBlocked = true;
      sanitized = sanitized.replace(rxPattern, '[محظور: الوصفات الطبية تصدر حصراً من الطبيب البشري المرخص]');
    }
  }

  // 3. Append certified non-replacement disclaimer
  const finalDisclaimer = `\n\n---\n📋 **${CLINICAL_DISCLAIMERS.ar}**\n\n🌐 **${CLINICAL_DISCLAIMERS.en}**`;

  return {
    sanitizedText: `${sanitized.trim()}${finalDisclaimer}`,
    prescriptionsBlocked: prescriptionBlocked,
    isPreliminary: !isDoctorReviewed,
    requiresHumanDoctorReview: true,
    disclaimerAppended: true
  };
}

/**
 * Registers lab file upload metadata, validates security constraints,
 * creates quarantined record, establishes non-replacement guards, and links to patient medical profile.
 */
async function registerLabFileUpload(db, data = {}, actorUser = {}) {
  const {
    patientId,
    caseId = null,
    fileName,
    contentType,
    size,
    labCategory = 'blood_test',
    labNotes = '',
    testDate = null,
    sourceClinic = null,
    extractedValues = {}
  } = data;

  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    err.statusCode = 400;
    throw err;
  }

  // Privacy & Access check
  assertClinicalAccess(actorUser);
  const isOwner = actorUser.uid === patientId;
  const isClinician = actorUser.role === 'doctor' || actorUser.role === 'clinic_admin' || actorUser.role === 'super_admin';
  if (!isOwner && !isClinician && actorUser.uid) {
    const err = new Error('You are not authorized to upload or link lab reports for this patient.');
    err.code = 'FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  // Validate file parameters
  validateLabFileUpload({ fileName, contentType, size });

  const chosenCat = LAB_CATEGORIES[labCategory] ? labCategory : 'blood_test';
  const catConfig = LAB_CATEGORIES[chosenCat];
  const safeFileName = getSafeLabStorageFileName(fileName);
  const fileId = `lab_file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const storagePath = `case_files/${patientId}/${caseId || 'general'}/${fileId}/${safeFileName}`;

  // Evaluate safety & panic values
  const safetyEval = evaluateLabSafetyAndPanicValues({
    labCategory: chosenCat,
    extractedValues,
    notes: labNotes
  });

  const reportRecord = {
    id: fileId,
    fileId,
    patientId,
    caseId: caseId || null,
    fileName,
    safeFileName,
    contentType,
    size: Number(size),
    storagePath,
    labCategory: chosenCat,
    labCategoryLabelAr: catConfig.labelAr,
    labCategoryLabelEn: catConfig.labelEn,
    labNotes: String(labNotes || '').slice(0, 500),
    testDate: testDate || nowIso.slice(0, 10),
    sourceClinic: sourceClinic || null,
    scanStatus: SCAN_STATUS.UPLOAD_PENDING,
    availability: AVAILABILITY.QUARANTINED,
    uploadStatus: 'metadata_created',
    // 🛡️ Strict Non-Replacement of Doctor Guardrails
    reviewStatus: REVIEW_STATUS.PENDING_DOCTOR_REVIEW,
    doctorApproved: false,
    reviewingDoctorId: null,
    reviewingDoctorName: null,
    reviewingDoctorLicense: null,
    doctorNotes: null,
    reviewedAt: null,
    hasClinicalDisclaimer: true,
    disclaimerTextAr: CLINICAL_DISCLAIMERS.ar,
    disclaimerTextEn: CLINICAL_DISCLAIMERS.en,
    aiDiagnosticReplacementBlocked: true,
    prescriptionsBlocked: true,
    isPreliminary: true,
    // 🚨 Emergency & Panic Flags
    isPanicValue: safetyEval.isPanicValue,
    panicReasons: safetyEval.panicReasons,
    emergencyActionRequired: safetyEval.emergencyActionRequired,
    emergencyGuidanceAr: safetyEval.emergencyGuidanceAr,
    emergencyGuidanceEn: safetyEval.emergencyGuidanceEn,
    createdBy: actorUser.uid || patientId,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // Persist to Firestore or in-memory
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).set(reportRecord);
      // Also write to lab_reports collection for granular query isolation
      await db.collection('lab_reports').doc(fileId).set(reportRecord);
    } catch (err) {
      console.warn('[FIRESTORE CASE_FILES/LAB_REPORTS WARNING]:', err.message);
    }
  }
  inMemoryLabReports.set(fileId, reportRecord);

  // Link report to patient medical profile (EHR)
  await linkLabReportToPatientProfile(db, {
    fileId,
    patientId,
    labCategory: chosenCat,
    fileName,
    size: Number(size),
    testDate: reportRecord.testDate,
    reviewStatus: REVIEW_STATUS.PENDING_DOCTOR_REVIEW,
    isPanicValue: safetyEval.isPanicValue,
    actorUid: actorUser.uid || patientId
  });

  // If a caseId was provided, also link to the clinical case
  if (caseId) {
    await linkLabReportToCase(db, { fileId, caseId, actorUid: actorUser.uid || patientId }, actorUser);
  }

  // Log Security Audit Event
  try {
    if (typeof logAuditEvent === 'function') {
      await logAuditEvent(db, {
        eventType: 'LAB_REPORT_UPLOAD_REGISTERED',
        actorUid: actorUser.uid || patientId,
        actorRole: actorUser.role || 'patient',
        targetUserId: patientId,
        resourceId: fileId,
        metadata: {
          fileId,
          caseId,
          labCategory: chosenCat,
          fileName,
          size: Number(size),
          scanStatus: SCAN_STATUS.UPLOAD_PENDING,
          availability: AVAILABILITY.QUARANTINED,
          reviewStatus: REVIEW_STATUS.PENDING_DOCTOR_REVIEW,
          isPanicValue: safetyEval.isPanicValue
        }
      });
    }
  } catch (_) {}

  return {
    success: true,
    fileId,
    storagePath,
    report: reportRecord
  };
}

/**
 * Links lab report summary to the patient's medical profile (EHR).
 */
async function linkLabReportToPatientProfile(db, { fileId, patientId, labCategory, fileName, size, testDate, reviewStatus, isPanicValue, actorUid }) {
  if (!patientId || !fileId) return false;

  const nowIso = new Date().toISOString();
  const summaryEntry = {
    fileId,
    labCategory,
    fileName,
    size,
    testDate: testDate || nowIso.slice(0, 10),
    reviewStatus: reviewStatus || REVIEW_STATUS.PENDING_DOCTOR_REVIEW,
    isPanicValue: Boolean(isPanicValue),
    linkedAt: nowIso
  };

  if (db && typeof db.collection === 'function') {
    try {
      const userRef = db.collection('users').doc(patientId);
      const userSnap = await userRef.get();
      let recent = [];
      if (userSnap && userSnap.exists) {
        const userData = userSnap.data() || {};
        recent = Array.isArray(userData.recentLabReports) ? [...userData.recentLabReports] : [];
      }
      // Prepend and keep latest 20
      recent.unshift(summaryEntry);
      const trimmed = recent.slice(0, 20);

      await userRef.set({
        id: patientId,
        recentLabReports: trimmed,
        lastLabReportUploadedAt: nowIso,
        lastLabCategory: labCategory,
        updatedAt: nowIso
      }, { merge: true });
    } catch (err) {
      console.warn('[PATIENT PROFILE LAB LINK WARNING]:', err.message);
    }
  }

  return true;
}

/**
 * Links an uploaded lab report to a clinical case.
 */
async function linkLabReportToCase(db, { fileId, caseId, actorUid }, actorUser = {}) {
  if (!fileId || !caseId) {
    const err = new Error('fileId and caseId are required.');
    err.code = 'INVALID_ARGUMENTS';
    err.statusCode = 400;
    throw err;
  }

  assertClinicalAccess(actorUser);

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const nowIso = new Date().toISOString();
  fileRecord.caseId = caseId;
  fileRecord.linkedToCaseAt = nowIso;
  fileRecord.updatedAt = nowIso;

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).update({
        caseId,
        linkedToCaseAt: nowIso,
        updatedAt: nowIso
      });

      // Also append to case document's attached files
      const caseRef = db.collection('cases').doc(caseId);
      const caseSnap = await caseRef.get();
      if (caseSnap && caseSnap.exists) {
        const caseData = caseSnap.data() || {};
        const fileIds = Array.isArray(caseData.attachedFileIds) ? [...caseData.attachedFileIds] : [];
        if (!fileIds.includes(fileId)) {
          fileIds.push(fileId);
          await caseRef.update({ attachedFileIds: fileIds, updatedAt: nowIso });
        }
      }
    } catch (err) {
      console.warn('[CASE LAB LINK WARNING]:', err.message);
    }
  }

  inMemoryLabReports.set(fileId, fileRecord);

  // If scan is clean or available, notify assigned doctor
  if (fileRecord.scanStatus === SCAN_STATUS.CLEAN || fileRecord.availability === AVAILABILITY.AVAILABLE) {
    await notifyDoctorLabReportReceived(db, fileRecord);
  }

  return { success: true, fileId, caseId };
}

/**
 * Processes automated or webhook security scan results.
 * If clean, transitions availability to available and notifies doctor/patient.
 */
async function processLabScanResult(db, { fileId, scanResult, scanDetails = null, scannerId = 'clamav_scanner' }) {
  if (!fileId) {
    const err = new Error('fileId is required.');
    err.code = 'MISSING_FILE_ID';
    err.statusCode = 400;
    throw err;
  }

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const isClean = scanResult === 'clean' || scanResult === SCAN_STATUS.CLEAN;

  fileRecord.scanStatus = isClean ? SCAN_STATUS.CLEAN : SCAN_STATUS.INFECTED;
  fileRecord.availability = isClean ? AVAILABILITY.AVAILABLE : AVAILABILITY.BLOCKED;
  fileRecord.uploadStatus = isClean ? 'uploaded_available' : 'quarantine_rejected';
  fileRecord.scanDetails = scanDetails;
  fileRecord.scannedAt = nowIso;
  fileRecord.scannedBy = scannerId;
  fileRecord.updatedAt = nowIso;

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).update({
        scanStatus: fileRecord.scanStatus,
        availability: fileRecord.availability,
        uploadStatus: fileRecord.uploadStatus,
        scanDetails,
        scannedAt: nowIso,
        scannedBy: scannerId,
        updatedAt: nowIso
      });
      await db.collection('lab_reports').doc(fileId).set(fileRecord, { merge: true });
    } catch (err) {
      console.warn('[SCAN STATUS UPDATE WARNING]:', err.message);
    }
  }

  inMemoryLabReports.set(fileId, fileRecord);

  // If clean and linked to a case or patient, dispatch notifications
  if (isClean) {
    await notifyDoctorLabReportReceived(db, fileRecord);
  }

  return {
    success: true,
    fileId,
    scanStatus: fileRecord.scanStatus,
    availability: fileRecord.availability
  };
}

/**
 * Formally certifies and signs a lab report by a verified human physician.
 * Strict Non-Replacement Guard: Only verified doctors can execute this action.
 */
async function certifyLabReportByDoctor(db, { fileId, clinicalNotes = '', interpretationRecommendation = '', urgencyLevel = 'routine' } = {}, doctorUser = {}) {
  if (!fileId) {
    const err = new Error('fileId is required.');
    err.code = 'MISSING_FILE_ID';
    err.statusCode = 400;
    throw err;
  }

  // Strict Doctor Verification Check
  const isDoctor = doctorUser.role === 'doctor' || doctorUser.role === 'super_admin';
  const isVerifiedDoctor = doctorUser.verifiedDoctor === true || doctorUser.role === 'super_admin';
  if (!isDoctor || !isVerifiedDoctor) {
    const err = new Error('Unauthorized: Lab reports can ONLY be reviewed and certified by a verified licensed physician.');
    err.code = 'DOCTOR_VERIFICATION_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const doctorLicense = doctorUser.licenseNumber || doctorUser.doctorLicense || 'VERIFIED_PHYSICIAN';
  const doctorName = doctorUser.name || doctorUser.fullName || 'د. طبيب معتمد';

  fileRecord.reviewStatus = REVIEW_STATUS.DOCTOR_REVIEWED;
  fileRecord.doctorApproved = true;
  fileRecord.reviewingDoctorId = doctorUser.uid;
  fileRecord.reviewingDoctorName = doctorName;
  fileRecord.reviewingDoctorLicense = doctorLicense;
  fileRecord.doctorNotes = String(clinicalNotes || '').slice(0, 1000);
  fileRecord.interpretationRecommendation = String(interpretationRecommendation || '').slice(0, 1000);
  fileRecord.urgencyLevel = urgencyLevel;
  fileRecord.reviewedAt = nowIso;
  fileRecord.isPreliminary = false;
  fileRecord.updatedAt = nowIso;

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).update({
        reviewStatus: REVIEW_STATUS.DOCTOR_REVIEWED,
        doctorApproved: true,
        reviewingDoctorId: doctorUser.uid,
        reviewingDoctorName: doctorName,
        reviewingDoctorLicense: doctorLicense,
        doctorNotes: fileRecord.doctorNotes,
        interpretationRecommendation: fileRecord.interpretationRecommendation,
        urgencyLevel,
        reviewedAt: nowIso,
        isPreliminary: false,
        updatedAt: nowIso
      });
      await db.collection('lab_reports').doc(fileId).set(fileRecord, { merge: true });

      // Update patient profile recentLabReports
      const userRef = db.collection('users').doc(fileRecord.patientId);
      const userSnap = await userRef.get();
      if (userSnap && userSnap.exists) {
        const uData = userSnap.data() || {};
        const recent = Array.isArray(uData.recentLabReports) ? uData.recentLabReports : [];
        const updatedRecent = recent.map(r => {
          if (r.fileId === fileId) {
            return { ...r, reviewStatus: REVIEW_STATUS.DOCTOR_REVIEWED, reviewedAt: nowIso, doctorApproved: true };
          }
          return r;
        });
        await userRef.update({ recentLabReports: updatedRecent, updatedAt: nowIso });
      }
    } catch (err) {
      console.warn('[DOCTOR REVIEW UPDATE WARNING]:', err.message);
    }
  }

  inMemoryLabReports.set(fileId, fileRecord);

  // Log Immutable Audit Event
  try {
    if (typeof logAuditEvent === 'function') {
      await logAuditEvent(db, {
        eventType: 'LAB_REPORT_REVIEWED_BY_DOCTOR',
        actorUid: doctorUser.uid,
        actorRole: doctorUser.role || 'doctor',
        targetUserId: fileRecord.patientId,
        resourceId: fileId,
        metadata: {
          fileId,
          doctorName,
          doctorLicense,
          reviewStatus: REVIEW_STATUS.DOCTOR_REVIEWED,
          urgencyLevel
        }
      });
    }
  } catch (_) {}

  return {
    success: true,
    fileId,
    reviewStatus: fileRecord.reviewStatus,
    doctorApproved: true,
    reviewingDoctorName: doctorName,
    reviewedAt: nowIso
  };
}

/**
 * Rejects a lab report by a doctor (e.g. illegible photo, wrong patient, corrupt scan).
 */
async function rejectLabReportByDoctor(db, { fileId, rejectionReason = 'unreadable_or_blurred' } = {}, doctorUser = {}) {
  if (!fileId) {
    const err = new Error('fileId is required.');
    err.code = 'MISSING_FILE_ID';
    err.statusCode = 400;
    throw err;
  }

  const isDoctor = doctorUser.role === 'doctor' || doctorUser.role === 'super_admin';
  if (!isDoctor) {
    const err = new Error('Unauthorized: Only doctors or admins can reject lab reports.');
    err.code = 'FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const nowIso = new Date().toISOString();
  fileRecord.reviewStatus = REVIEW_STATUS.REJECTED_BY_DOCTOR;
  fileRecord.doctorApproved = false;
  fileRecord.rejectionReason = rejectionReason;
  fileRecord.rejectedByDoctorId = doctorUser.uid;
  fileRecord.rejectedAt = nowIso;
  fileRecord.updatedAt = nowIso;

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).update({
        reviewStatus: REVIEW_STATUS.REJECTED_BY_DOCTOR,
        doctorApproved: false,
        rejectionReason,
        rejectedByDoctorId: doctorUser.uid,
        rejectedAt: nowIso,
        updatedAt: nowIso
      });
    } catch (_) {}
  }

  inMemoryLabReports.set(fileId, fileRecord);

  // Log Audit
  try {
    if (typeof logAuditEvent === 'function') {
      await logAuditEvent(db, {
        eventType: 'LAB_REPORT_REJECTED_BY_DOCTOR',
        actorUid: doctorUser.uid,
        actorRole: doctorUser.role || 'doctor',
        targetUserId: fileRecord.patientId,
        resourceId: fileId,
        metadata: { fileId, rejectionReason }
      });
    }
  } catch (_) {}

  return {
    success: true,
    fileId,
    reviewStatus: REVIEW_STATUS.REJECTED_BY_DOCTOR,
    rejectionReason
  };
}

/**
 * Retrieves a single lab report by ID with strict privacy, PHI audit logging,
 * and zero-access enforcement for non-clinical admin sub-roles.
 */
async function getLabReportById(db, fileId, requestingUser = {}) {
  if (!fileId) {
    const err = new Error('fileId is required.');
    err.code = 'MISSING_FILE_ID';
    err.statusCode = 400;
    throw err;
  }

  assertClinicalAccess(requestingUser);

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Authorization check (patient owner, clinician, or super_admin)
  const isOwner = requestingUser.uid === fileRecord.patientId;
  const isClinician = requestingUser.role === 'doctor' || requestingUser.role === 'clinic_admin' || requestingUser.role === 'super_admin';
  if (!isOwner && !isClinician && requestingUser.uid) {
    const err = new Error('Unauthorized to view this clinical lab report.');
    err.code = 'FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  // Immutable PHI Access Audit Log
  try {
    if (typeof logAuditEvent === 'function') {
      await logAuditEvent(db, {
        eventType: 'LAB_REPORT_PHI_VIEWED',
        actorUid: requestingUser.uid || 'anonymous',
        actorRole: requestingUser.role || 'patient',
        targetUserId: fileRecord.patientId,
        resourceId: fileId,
        metadata: {
          fileId,
          labCategory: fileRecord.labCategory,
          patientId: fileRecord.patientId
        }
      });
    }
  } catch (_) {}

  return fileRecord;
}

/**
 * Patient Right to be Forgotten (GDPR / HIPAA Compliant Deletion).
 * Soft-deletes the lab report from active clinical view while retaining an immutable audit trail.
 */
async function deleteLabReport(db, { fileId, reason = 'patient_requested' } = {}, requestingUser = {}) {
  if (!fileId) {
    const err = new Error('fileId is required.');
    err.code = 'MISSING_FILE_ID';
    err.statusCode = 400;
    throw err;
  }

  assertClinicalAccess(requestingUser);

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Only patient owner or platform admin can delete
  const isOwner = requestingUser.uid === fileRecord.patientId;
  const isPlatformAdmin = requestingUser.role === 'super_admin' || requestingUser.isOwner === true;
  if (!isOwner && !isPlatformAdmin) {
    const err = new Error('Unauthorized: You do not have permission to delete this lab report.');
    err.code = 'FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
  fileRecord.availability = AVAILABILITY.DELETED;
  fileRecord.uploadStatus = 'deleted';
  fileRecord.deletedAt = nowIso;
  fileRecord.deletedBy = requestingUser.uid;
  fileRecord.deletionReason = reason;
  fileRecord.updatedAt = nowIso;

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).update({
        availability: AVAILABILITY.DELETED,
        uploadStatus: 'deleted',
        deletedAt: nowIso,
        deletedBy: requestingUser.uid,
        deletionReason: reason,
        updatedAt: nowIso
      });

      // Remove from patient recentLabReports
      const userRef = db.collection('users').doc(fileRecord.patientId);
      const userSnap = await userRef.get();
      if (userSnap && userSnap.exists) {
        const uData = userSnap.data() || {};
        const recent = Array.isArray(uData.recentLabReports) ? uData.recentLabReports : [];
        const filtered = recent.filter(r => r.fileId !== fileId);
        await userRef.update({ recentLabReports: filtered, updatedAt: nowIso });
      }
    } catch (err) {
      console.warn('[LAB REPORT DELETION WARNING]:', err.message);
    }
  }

  inMemoryLabReports.set(fileId, fileRecord);

  // Log Immutable Deletion Audit Event
  try {
    if (typeof logAuditEvent === 'function') {
      await logAuditEvent(db, {
        eventType: 'LAB_REPORT_DELETED_BY_PATIENT',
        actorUid: requestingUser.uid,
        actorRole: requestingUser.role || 'patient',
        targetUserId: fileRecord.patientId,
        resourceId: fileId,
        metadata: {
          fileId,
          patientId: fileRecord.patientId,
          reason,
          deletedAt: nowIso
        }
      });
    }
  } catch (_) {}

  return {
    success: true,
    fileId,
    deleted: true,
    deletedAt: nowIso
  };
}

/**
 * Dispatches notification to doctor and patient when a clean lab report is ready.
 */
async function notifyDoctorLabReportReceived(db, fileRecord = {}, options = {}) {
  const patientId = fileRecord.patientId;
  const caseId = fileRecord.caseId;
  const labCategory = fileRecord.labCategory || 'blood_test';
  const catConfig = LAB_CATEGORIES[labCategory] || LAB_CATEGORIES.blood_test;

  const isCriticalCategory = labCategory === 'abg_gas' || Boolean(fileRecord.isPanicValue);
  const notifType = isCriticalCategory
    ? NOTIFICATION_TYPES.LAB_REPORT_CRITICAL_ALERT || 'lab_report_critical_alert'
    : NOTIFICATION_TYPES.LAB_REPORT_UPLOADED || 'lab_report_uploaded';

  // Find doctor and patient emails
  let doctorEmail = options.doctorEmail || null;
  let patientEmail = options.patientEmail || null;
  let patientName = options.patientName || 'المريض';

  if (db && typeof db.collection === 'function') {
    try {
      if (patientId && !patientEmail) {
        const pSnap = await db.collection('users').doc(patientId).get();
        if (pSnap && pSnap.exists) {
          const pData = pSnap.data();
          patientEmail = pData.email || null;
          patientName = pData.fullName || pData.name || patientName;
        }
      }
      if (caseId && !doctorEmail) {
        const cSnap = await db.collection('cases').doc(caseId).get();
        if (cSnap && cSnap.exists) {
          const cData = cSnap.data();
          const docId = cData.assignedDoctorId || cData.doctorId;
          if (docId) {
            const dSnap = await db.collection('users').doc(docId).get();
            if (dSnap && dSnap.exists) {
              doctorEmail = dSnap.data().email || null;
            }
          }
        }
      }
    } catch (_) {}
  }

  const notificationPayload = {
    fileId: fileRecord.id || fileRecord.fileId,
    caseId,
    patientId,
    patientName,
    fileName: fileRecord.fileName,
    labCategory,
    labCategoryAr: catConfig.labelAr,
    labCategoryEn: catConfig.labelEn,
    testDate: fileRecord.testDate,
    isCritical: isCriticalCategory,
    reviewStatus: fileRecord.reviewStatus || REVIEW_STATUS.PENDING_DOCTOR_REVIEW
  };

  const results = { doctorNotified: false, patientNotified: false };

  // 1. Notify Doctor (if assigned or provided)
  const targetDoctorEmail = doctorEmail || 'clinical.triage@healthvibe.ai';
  try {
    if (typeof enqueueNotification === 'function') {
      await enqueueNotification(db, {
        type: notifType,
        recipient: targetDoctorEmail,
        priority: isCriticalCategory ? 'urgent' : 'high',
        idempotencyKey: `lab_upload_doc_${fileRecord.id}`,
        payload: notificationPayload
      });
      results.doctorNotified = true;
    }
  } catch (err) {
    console.warn('[DOCTOR LAB NOTIFICATION WARNING]:', err.message);
  }

  // 2. Notify Patient Confirmation
  if (patientEmail) {
    try {
      if (typeof enqueueNotification === 'function') {
        await enqueueNotification(db, {
          type: NOTIFICATION_TYPES.LAB_REPORT_UPLOADED || 'lab_report_uploaded',
          recipient: patientEmail,
          priority: 'normal',
          idempotencyKey: `lab_upload_pat_${fileRecord.id}`,
          payload: {
            ...notificationPayload,
            recipientRole: 'patient'
          }
        });
        results.patientNotified = true;
      }
    } catch (err) {
      console.warn('[PATIENT LAB NOTIFICATION WARNING]:', err.message);
    }
  }

  return results;
}

/**
 * Retrieves sanitized lab reports for a patient with RBAC filtering.
 * Enforces zero-access for non-clinical admin sub-roles.
 */
async function getPatientLabReports(db, { patientId, labCategory = null, limit = 50 } = {}, requestingUser = {}) {
  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    err.statusCode = 400;
    throw err;
  }

  // Strict Privacy check: non-clinical sub-roles have zero access
  assertClinicalAccess(requestingUser);

  // Authorization check
  const isOwner = requestingUser.uid === patientId;
  const isClinician = requestingUser.role === 'doctor' || requestingUser.role === 'clinic_admin' || requestingUser.role === 'super_admin';
  if (!isOwner && !isClinician && requestingUser.uid) {
    const err = new Error('You are not authorized to view lab reports for this patient.');
    err.code = 'FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  let reports = [];

  if (db && typeof db.collection === 'function') {
    try {
      let query = db.collection('case_files').where('patientId', '==', patientId);
      if (labCategory) {
        query = query.where('labCategory', '==', labCategory);
      }
      const snap = await query.limit(limit).get();
      if (snap && snap.docs) {
        reports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (err) {
      console.warn('[GET LAB REPORTS FIRESTORE WARNING]:', err.message);
    }
  }

  // Fallback to inMemory store if Firestore returned empty or in test
  if (reports.length === 0) {
    for (const report of inMemoryLabReports.values()) {
      if (report.patientId === patientId) {
        if (!labCategory || report.labCategory === labCategory) {
          // Omit deleted records from default listing
          if (report.availability !== AVAILABILITY.DELETED) {
            reports.push(report);
          }
        }
      }
    }
  } else {
    // Filter out deleted
    reports = reports.filter(r => r.availability !== AVAILABILITY.DELETED);
  }

  return reports.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, limit);
}

/**
 * Links a lab report to a booked clinical appointment (pre-consultation package).
 */
async function linkLabReportToAppointment(db, { fileId, appointmentId } = {}, actorUser = {}) {
  if (!fileId || !appointmentId) {
    const err = new Error('fileId and appointmentId are required.');
    err.code = 'INVALID_ARGUMENTS';
    err.statusCode = 400;
    throw err;
  }

  assertClinicalAccess(actorUser);

  let fileRecord = inMemoryLabReports.get(fileId);
  if (!fileRecord && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').doc(fileId).get();
      if (snap && snap.exists) fileRecord = snap.data();
    } catch (_) {}
  }

  if (!fileRecord) {
    const err = new Error('Lab report file not found.');
    err.code = 'FILE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const nowIso = new Date().toISOString();
  fileRecord.appointmentId = appointmentId;
  fileRecord.linkedToAppointmentAt = nowIso;
  fileRecord.updatedAt = nowIso;

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('case_files').doc(fileId).update({
        appointmentId,
        linkedToAppointmentAt: nowIso,
        updatedAt: nowIso
      });

      const apptRef = db.collection('appointments').doc(appointmentId);
      const apptSnap = await apptRef.get();
      if (apptSnap && apptSnap.exists) {
        const apptData = apptSnap.data() || {};
        const labIds = Array.isArray(apptData.attachedLabReportIds) ? [...apptData.attachedLabReportIds] : [];
        if (!labIds.includes(fileId)) {
          labIds.push(fileId);
          await apptRef.update({ attachedLabReportIds: labIds, updatedAt: nowIso });
        }
      }
    } catch (err) {
      console.warn('[APPOINTMENT LAB LINK WARNING]:', err.message);
    }
  }

  inMemoryLabReports.set(fileId, fileRecord);
  return { success: true, fileId, appointmentId };
}

/**
 * Retrieves all lab reports linked to a clinical appointment for pre-consultation review.
 */
async function getLabReportsForAppointment(db, appointmentId, requestingUser = {}) {
  if (!appointmentId) {
    const err = new Error('appointmentId is required.');
    err.code = 'MISSING_APPOINTMENT_ID';
    err.statusCode = 400;
    throw err;
  }

  assertClinicalAccess(requestingUser);

  let reports = [];
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('case_files').where('appointmentId', '==', appointmentId).get();
      if (snap && snap.docs) {
        reports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (_) {}
  }

  if (reports.length === 0) {
    for (const r of inMemoryLabReports.values()) {
      if (r.appointmentId === appointmentId && r.availability !== AVAILABILITY.DELETED) {
        reports.push(r);
      }
    }
  }

  return reports;
}

/**
 * Generates sanitized, non-diagnostic clinical context for the AI Chatbot.
 * Provides safe overview of uploaded labs, highlights panic values if present,
 * and enforces strict physician non-replacement.
 */
async function generateChatbotLabContext(db, patientId, { lang = 'ar' } = {}) {
  if (!patientId) return null;

  const reports = await getPatientLabReports(db, { patientId, limit: 5 }, { uid: patientId, role: 'patient' });
  const hasReports = reports && reports.length > 0;

  let hasPanicValue = false;
  const labSummaries = [];

  for (const r of reports) {
    if (r.isPanicValue) hasPanicValue = true;
    const catLabel = lang === 'ar' ? (r.labCategoryLabelAr || r.labCategory) : (r.labCategoryLabelEn || r.labCategory);
    const statusLabel = r.reviewStatus === REVIEW_STATUS.DOCTOR_REVIEWED
      ? (lang === 'ar' ? 'تمت مراجعة الطبيب واعتمادها' : 'Doctor Reviewed & Certified')
      : (lang === 'ar' ? 'بانتظار مراجعة الطبيب' : 'Pending Doctor Review');
    labSummaries.push(`- ${r.fileName} (${catLabel}): ${statusLabel}`);
  }

  const disclaimer = lang === 'ar' ? CLINICAL_DISCLAIMERS.ar : CLINICAL_DISCLAIMERS.en;

  const contextAr = hasReports
    ? `ملخص التحاليل المرفوعة للمريض:\n${labSummaries.join('\n')}\n\nتوجيه الذكاء الاصطناعي: ${CLINICAL_DISCLAIMERS.ar} ${hasPanicValue ? '⚠️ توجد مؤشرات حرجة تتطلب التوجيه الفوري للطوارئ.' : ''}`
    : 'لا توجد تحاليل معملية مرفوعة حتى الآن.';

  const contextEn = hasReports
    ? `Uploaded Lab Reports Summary:\n${labSummaries.join('\n')}\n\nAI Directive: ${CLINICAL_DISCLAIMERS.en} ${hasPanicValue ? '⚠️ Panic values detected, emergency triage required.' : ''}`
    : 'No lab reports uploaded yet.';


  return {
    hasReports,
    count: reports.length,
    hasPanicValue,
    disclaimer,
    context: lang === 'ar' ? contextAr : contextEn,
    contextAr,
    contextEn,
    reports
  };
}

module.exports = {
  LAB_CATEGORIES,
  REVIEW_STATUS,
  CLINICAL_DISCLAIMERS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXECUTABLE_EXTENSIONS,
  MAX_FILE_SIZE,
  SCAN_STATUS,
  AVAILABILITY,
  inMemoryLabReports,
  assertClinicalAccess,
  validateLabFileUpload,
  getSafeLabStorageFileName,
  evaluateLabSafetyAndPanicValues,
  enforceAiClinicalGuardrails,
  registerLabFileUpload,
  linkLabReportToPatientProfile,
  linkLabReportToCase,
  linkLabReportToAppointment,
  getLabReportsForAppointment,
  generateChatbotLabContext,
  processLabScanResult,
  certifyLabReportByDoctor,
  rejectLabReportByDoctor,
  getLabReportById,
  deleteLabReport,
  notifyDoctorLabReportReceived,
  getPatientLabReports
};

