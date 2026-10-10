/**
 * Health Vibe AI - Blood Clotting & Blood Disorders Clinical Service
 *
 * SPECIFICATION & ARCHITECTURAL FOUNDATION:
 * 1. Multi-Condition Hematology Registry:
 *    - "Blood clotting" does not represent one single disease.
 *    - Encompasses Thrombosis (DVT, PE), Thrombophilia, Bleeding Disorders (Hemophilia, vWD),
 *      Anticoagulation Monitoring (VKA/Warfarin INR, DOACs), and Thrombocytopenias.
 * 2. Medical Reviewer Specification Management:
 *    - Allows medical reviewers (hematologists/internists) to inspect, define, and customize
 *      supported conditions, required clinical fields, and laboratory panels before logic execution.
 *    - Tracks reviewer provenance, license, versioning, and readiness status.
 * 3. Human-in-the-Loop & Non-Diagnostic Boundary:
 *    - Strictly NO automated AI diagnoses.
 *    - Strictly NO invented laboratory results (only real, persisted, validated labs).
 *    - Formal diagnosis, treatment decisions, and signed reports require verified physician input.
 * 4. Architectural Reuse:
 *    - Integrates with existing patient records, cases, doctor assignment, permissions,
 *      assessments, audit logs, file attachments, and reports.
 */

const crypto = require('crypto');

let clinicalInfoExchangeService = null;
try {
  clinicalInfoExchangeService = require('./clinical-info-exchange-service');
} catch (e) {
  // Graceful fallback for isolated test environments
}

let auditService = null;
try {
  auditService = require('./audit-service');
} catch (e) {
  // Graceful fallback
}

// In-Memory Storage for fast test execution and caching
const conditionsRegistry = new Map(); // conditionId -> condition spec
const labCatalogStore = new Map(); // testCode -> lab parameter definition
const bloodDisordersCasesStore = new Map(); // caseId -> case object
const patientCasesIndex = new Map(); // patientId -> array of caseIds
const followupProtocolsStore = new Map(); // patientId -> followup protocol
const approvedReportsStore = new Map(); // reportId -> report object

// Constants & Enums
const CONDITION_CATEGORIES = {
  THROMBOSIS: 'THROMBOSIS',                   // Venous / Arterial Thromboembolism (DVT, PE)
  THROMBOPHILIA: 'THROMBOPHILIA',             // Hypercoagulability & Prothrombotic Tendencies
  ANTICOAGULATION: 'ANTICOAGULATION',         // Anticoagulant & Antiplatelet Management
  BLEEDING: 'BLEEDING',                       // Coagulopathies & Bleeding Diatheses (Hemophilia, vWD)
  PLATELET: 'PLATELET'                        // Thrombocytopenia & Platelet Dysfunctions
};

const SPECIFICATION_STATUS = {
  DRAFT_SPECIFICATION: 'DRAFT_SPECIFICATION',
  UNDER_SPECIALIST_REVIEW: 'UNDER_SPECIALIST_REVIEW',
  ACTIVE_SUPPORTED: 'ACTIVE_SUPPORTED',
  ARCHIVED: 'ARCHIVED'
};

const STANDARD_LAB_CATALOG = {
  INR: {
    testCode: 'INR',
    nameEn: 'International Normalized Ratio (INR)',
    nameAr: 'النسبة المعيارية الدولية للسيولة (INR)',
    category: 'COAGULATION',
    validUnits: ['ratio', 'INR', ''],
    canonicalUnit: 'ratio',
    standardRefRange: { low: 0.8, high: 1.2, unit: 'ratio' },
    therapeuticRefRanges: {
      standardVka: { targetMin: 2.0, targetMax: 3.0, indication: 'DVT/PE/AFib Prophylaxis' },
      mechanicalValve: { targetMin: 2.5, targetMax: 3.5, indication: 'Mechanical Mitral Valve' }
    },
    isQuantitative: true,
    minBound: 0.5,
    maxBound: 15.0
  },
  PT: {
    testCode: 'PT',
    nameEn: 'Prothrombin Time (PT)',
    nameAr: 'وقت البروثرومبين (PT)',
    category: 'COAGULATION',
    validUnits: ['seconds', 'sec', 's'],
    canonicalUnit: 'seconds',
    standardRefRange: { low: 11.0, high: 13.5, unit: 'seconds' },
    isQuantitative: true,
    minBound: 5.0,
    maxBound: 120.0
  },
  APTT: {
    testCode: 'APTT',
    nameEn: 'Activated Partial Thromboplastin Time (aPTT)',
    nameAr: 'وقت الثرومبوبلاستين الجزئي المفعل (aPTT)',
    category: 'COAGULATION',
    validUnits: ['seconds', 'sec', 's'],
    canonicalUnit: 'seconds',
    standardRefRange: { low: 25.0, high: 35.0, unit: 'seconds' },
    isQuantitative: true,
    minBound: 10.0,
    maxBound: 200.0
  },
  D_DIMER: {
    testCode: 'D_DIMER',
    nameEn: 'D-Dimer (Fibrin Degradation)',
    nameAr: 'الدي دايمر (نواتج تحلل الفبرين)',
    category: 'THROMBOSIS_MARKER',
    validUnits: ['ug/mL', 'ng/mL', 'mg/L', 'ug/L'],
    canonicalUnit: 'ug/mL',
    standardRefRange: { low: 0.0, high: 0.5, unit: 'ug/mL' },
    isQuantitative: true,
    minBound: 0.0,
    maxBound: 50.0
  },
  PLATELET_COUNT: {
    testCode: 'PLATELET_COUNT',
    nameEn: 'Platelet Count (Thrombocytes)',
    nameAr: 'عدد الصفائح الدموية',
    category: 'CELL_COUNT',
    validUnits: ['x10^9/L', '/uL', '10*3/uL', 'k/uL'],
    canonicalUnit: 'x10^9/L',
    standardRefRange: { low: 150.0, high: 450.0, unit: 'x10^9/L' },
    isQuantitative: true,
    minBound: 5.0,
    maxBound: 2000.0
  },
  FIBRINOGEN: {
    testCode: 'FIBRINOGEN',
    nameEn: 'Fibrinogen (Factor I)',
    nameAr: 'الفيبرينوجين (العامل الأول)',
    category: 'COAGULATION_FACTOR',
    validUnits: ['mg/dL', 'g/L'],
    canonicalUnit: 'mg/dL',
    standardRefRange: { low: 200.0, high: 400.0, unit: 'mg/dL' },
    isQuantitative: true,
    minBound: 20.0,
    maxBound: 1200.0
  },
  FACTOR_VIII: {
    testCode: 'FACTOR_VIII',
    nameEn: 'Factor VIII Activity (Hemophilia A)',
    nameAr: 'نشاط العامل الثامن (الهيموفيليا أ)',
    category: 'SPECIALIZED_FACTOR',
    validUnits: ['%', 'IU/dL'],
    canonicalUnit: '%',
    standardRefRange: { low: 50.0, high: 150.0, unit: '%' },
    isQuantitative: true,
    minBound: 0.1,
    maxBound: 300.0
  },
  FACTOR_IX: {
    testCode: 'FACTOR_IX',
    nameEn: 'Factor IX Activity (Hemophilia B)',
    nameAr: 'نشاط العامل التاسع (الهيموفيليا ب)',
    category: 'SPECIALIZED_FACTOR',
    validUnits: ['%', 'IU/dL'],
    canonicalUnit: '%',
    standardRefRange: { low: 50.0, high: 150.0, unit: '%' },
    isQuantitative: true,
    minBound: 0.1,
    maxBound: 300.0
  },
  ANTI_XA: {
    testCode: 'ANTI_XA',
    nameEn: 'Anti-Factor Xa Assay (LMWH / DOAC)',
    nameAr: 'فحص مضاد العامل العاشر النشط (LMWH / DOAC)',
    category: 'MONITORING',
    validUnits: ['IU/mL'],
    canonicalUnit: 'IU/mL',
    standardRefRange: { low: 0.5, high: 1.2, unit: 'IU/mL' },
    isQuantitative: true,
    minBound: 0.05,
    maxBound: 5.0
  }
};

// Seed default lab catalog
Object.values(STANDARD_LAB_CATALOG).forEach(item => {
  labCatalogStore.set(item.testCode, item);
});

// Seed Initial Medically Reviewable Condition Specifications
const INITIAL_CONDITION_REGISTRY = [
  {
    conditionId: 'dvt_pe_thrombosis',
    nameEn: 'Venous Thromboembolism (DVT / PE)',
    nameAr: 'الانصمام الخثاري الوريدي (جلطات الساق والرئة)',
    category: CONDITION_CATEGORIES.THROMBOSIS,
    descriptionEn: 'Deep vein thrombosis and pulmonary embolism clinical evaluation, recurrence risk assessment, and diagnostic workup review.',
    descriptionAr: 'التقييم السريري لجلطات الأوردة العميقة والانصمام الرئوي ومراجعة مؤشرات التخثر ومخاطر الانتكاس.',
    clinicalGuidelinesRef: 'ASH 2020 / CHEST 2021 VTE Guidelines',
    status: SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
    requiredClinicalFields: [
      'clotAnatomicalLocation',
      'priorVteEpisodes',
      'provokingFactors', // surgery, immobilization, trauma, active cancer
      'activeAnticoagulant',
      'symptomsDurationDays',
      'swellingAndPainSeverity'
    ],
    requiredLabPanels: ['D_DIMER', 'PT', 'INR', 'APTT', 'PLATELET_COUNT'],
    optionalLabPanels: ['FIBRINOGEN'],
    specificationVersion: 1,
    lastReviewedBy: null,
    lastReviewedAt: null,
    reviewerNotes: 'Awaiting hematologist review for Egyptian Thrombosis Protocol adaptation.'
  },
  {
    conditionId: 'thrombophilia_screening',
    nameEn: 'Thrombophilia & Hypercoagulability Evaluation',
    nameAr: 'تقييم أهبة التخثر وفرط التجلط الوراثي والمكتسب',
    category: CONDITION_CATEGORIES.THROMBOPHILIA,
    descriptionEn: 'Investigation of inherited and acquired thrombophilic states following unprovoked thrombosis or family history.',
    descriptionAr: 'فحص عوامل أهبة التخثر الوراثية والمكتسبة بعد الإصابة بجلطات غير مبررة أو وجود تاريخ عائلي.',
    clinicalGuidelinesRef: 'ISTH 2022 Guidelines on Thrombophilia Testing',
    status: SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
    requiredClinicalFields: [
      'firstDegreeFamilyHistory',
      'unprovokedVsProvokedHistory',
      'obstetricHistoryPregnancyLoss',
      'ageAtFirstThromboticEvent'
    ],
    requiredLabPanels: ['PT', 'INR', 'APTT', 'PLATELET_COUNT', 'FIBRINOGEN'],
    optionalLabPanels: ['D_DIMER'],
    specificationVersion: 1,
    lastReviewedBy: null,
    lastReviewedAt: null,
    reviewerNotes: 'Specialist review required to specify timing relative to acute thrombosis or active anticoagulation.'
  },
  {
    conditionId: 'vka_inr_monitoring',
    nameEn: 'Vitamin K Antagonist (Warfarin) INR Monitoring',
    nameAr: 'متابعة العلاج بمضادات فيتامين ك ومستوى السيولة (INR)',
    category: CONDITION_CATEGORIES.ANTICOAGULATION,
    descriptionEn: 'Outpatient international normalized ratio tracking, time in therapeutic range (TTR) follow-up, and dose titration review.',
    descriptionAr: 'متابعة النسبة المعيارية الدولية للسيولة ومعدل الوقت داخل النطاق العلاجي للمرضى على علاج الوارفارين.',
    clinicalGuidelinesRef: 'ACCP CHEST Guidelines on Antithrombotic Therapy',
    status: SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
    requiredClinicalFields: [
      'currentDailyDoseMg',
      'targetInrRange',
      'clinicalIndicationForVka',
      'bleedingSymptomsScreen', // hematuria, epistaxis, melena, hematoma
      'interactingMedications',
      'dietaryVitaminKChanges'
    ],
    requiredLabPanels: ['INR', 'PT'],
    optionalLabPanels: ['PLATELET_COUNT'],
    specificationVersion: 1,
    lastReviewedBy: null,
    lastReviewedAt: null,
    reviewerNotes: 'Awaiting medical review on bleeding alert thresholds and dose adjustment workflow.'
  },
  {
    conditionId: 'bleeding_coagulopathy',
    nameEn: 'Congenital & Acquired Bleeding Disorders (Hemophilia / vWD)',
    nameAr: 'اضطرابات النزف واعتلالات التخثر (الهيموفيليا وفون فيليبراند)',
    category: CONDITION_CATEGORIES.BLEEDING,
    descriptionEn: 'Diagnostic history and factor monitoring for Hemophilia A/B, von Willebrand disease, and rare factor deficiencies.',
    descriptionAr: 'متابعة التاريخ السريري ومستويات عوامل التخثر لمرضى الهيموفيليا ومرض فون فيليبراند واعتلالات التخثر النادرة.',
    clinicalGuidelinesRef: 'WFH (World Federation of Hemophilia) Guidelines 2020',
    status: SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
    requiredClinicalFields: [
      'bleedingPhenotype', // joint bleeds, soft tissue, mucous membranes
      'familyHistoryBleeding',
      'priorHemostaticChallenges', // surgery, dental extraction
      'factorReplacementRegimen'
    ],
    requiredLabPanels: ['PT', 'APTT', 'PLATELET_COUNT', 'FIBRINOGEN', 'FACTOR_VIII', 'FACTOR_IX'],
    optionalLabPanels: ['INR'],
    specificationVersion: 1,
    lastReviewedBy: null,
    lastReviewedAt: null,
    reviewerNotes: 'Requires pediatric and adult hematologist sign-off on factor assay reference standards.'
  },
  {
    conditionId: 'thrombocytopenia_investigation',
    nameEn: 'Quantitative Platelet Disorders & Thrombocytopenia',
    nameAr: 'نقص الصفائح الدموية واضطراباتها الكمية',
    category: CONDITION_CATEGORIES.PLATELET,
    descriptionEn: 'Evaluation of low platelet count, immune thrombocytopenia (ITP), drug-induced causes, and bleeding risk.',
    descriptionAr: 'تقييم نقص الصفائح الدموية المناعي والدوائي ودرجة خطورة النزف المصاحبة.',
    clinicalGuidelinesRef: 'ASH 2019 Guidelines for Immune Thrombocytopenia (ITP)',
    status: SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
    requiredClinicalFields: [
      'mucocutaneousBleedingSigns', // petechiae, purpura, oral blisters
      'recentViralInfections',
      'heparinExposureWithin14Days',
      'splenomegalyPresence',
      'priorNadirPlateletCount'
    ],
    requiredLabPanels: ['PLATELET_COUNT', 'APTT', 'PT'],
    optionalLabPanels: ['FIBRINOGEN'],
    specificationVersion: 1,
    lastReviewedBy: null,
    lastReviewedAt: null,
    reviewerNotes: 'Specialist definition required for differential exclusions before automated case acceptance.'
  }
];

// Seed initial conditions
INITIAL_CONDITION_REGISTRY.forEach(cond => {
  conditionsRegistry.set(cond.conditionId, cond);
});

// Helper for Arabic digit normalization
function normalizeArabicDigits(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9')
    .replace(/[٫,]/g, '.');
}

// =============================================================================
// 1. MEDICAL REVIEWER SPECIFICATION MANAGEMENT
// =============================================================================

/**
 * Retrieves the full registry of supported hematological conditions and their review status.
 */
function getRegisteredConditions() {
  return Array.from(conditionsRegistry.values());
}

/**
 * Retrieves a single condition specification by conditionId.
 */
function getConditionById(conditionId) {
  return conditionsRegistry.get(conditionId) || null;
}

/**
 * Allows a verified medical reviewer (licensed doctor) to define, update, or approve
 * a condition specification before clinical logic is implemented.
 */
function defineOrUpdateConditionSpecification({
  conditionId,
  nameEn,
  nameAr,
  category,
  descriptionEn,
  descriptionAr,
  clinicalGuidelinesRef,
  requiredClinicalFields = [],
  requiredLabPanels = [],
  optionalLabPanels = [],
  status = SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
  reviewerNotes = '',
  reviewingDoctor
}) {
  if (!conditionId || typeof conditionId !== 'string') {
    const err = new Error('conditionId is required.');
    err.code = 'INVALID_CONDITION_ID';
    throw err;
  }

  // Doctor Role Authorization Check
  if (!reviewingDoctor || reviewingDoctor.role !== 'doctor') {
    const err = new Error('Access denied: Only a licensed medical reviewer can define or update condition specifications.');
    err.code = 'ACCESS_DENIED_DOCTOR_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.status && reviewingDoctor.status !== 'approved') {
    const err = new Error('Doctor credentials not approved for clinical review.');
    err.code = 'UNAPPROVED_DOCTOR';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.isLicenseExpired || reviewingDoctor.licenseStatus === 'revoked') {
    const err = new Error('Doctor license is expired or revoked.');
    err.code = 'INVALID_DOCTOR_LICENSE';
    err.statusCode = 403;
    throw err;
  }

  const existing = conditionsRegistry.get(conditionId);
  const nowIso = new Date().toISOString();
  const nextVersion = existing ? (existing.specificationVersion || 1) + 1 : 1;

  const updatedSpec = {
    conditionId,
    nameEn: nameEn || existing?.nameEn || conditionId,
    nameAr: nameAr || existing?.nameAr || conditionId,
    category: category || existing?.category || CONDITION_CATEGORIES.THROMBOSIS,
    descriptionEn: descriptionEn || existing?.descriptionEn || '',
    descriptionAr: descriptionAr || existing?.descriptionAr || '',
    clinicalGuidelinesRef: clinicalGuidelinesRef || existing?.clinicalGuidelinesRef || 'Clinical Guidelines',
    status: status || existing?.status || SPECIFICATION_STATUS.UNDER_SPECIALIST_REVIEW,
    requiredClinicalFields: Array.isArray(requiredClinicalFields) ? requiredClinicalFields : (existing?.requiredClinicalFields || []),
    requiredLabPanels: Array.isArray(requiredLabPanels) ? requiredLabPanels : (existing?.requiredLabPanels || []),
    optionalLabPanels: Array.isArray(optionalLabPanels) ? optionalLabPanels : (existing?.optionalLabPanels || []),
    specificationVersion: nextVersion,
    lastReviewedBy: {
      uid: reviewingDoctor.uid,
      name: reviewingDoctor.name || reviewingDoctor.displayName || 'Medical Reviewer',
      licenseNumber: reviewingDoctor.licenseNumber || 'VERIFIED-DOC',
      specialty: reviewingDoctor.specialty || 'Hematologist'
    },
    lastReviewedAt: nowIso,
    reviewerNotes: String(reviewerNotes || existing?.reviewerNotes || '').trim(),
    updatedAt: nowIso
  };

  conditionsRegistry.set(conditionId, updatedSpec);

  // Record Audit Event
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      auditService.recordAuditEvent(null, {
        type: 'RECORD_UPDATED',
        actor: updatedSpec.lastReviewedBy,
        action: 'BLOOD_DISORDERS_CONDITION_SPEC_UPDATED',
        details: { conditionId, version: nextVersion, status }
      }).catch(() => {});
    } catch (e) {}
  }

  return updatedSpec;
}

// =============================================================================
// 2. LABORATORY PARAMETER CATALOG & VALIDATION
// =============================================================================

function getStandardLabCatalog() {
  return Array.from(labCatalogStore.values());
}

function getLabParameter(testCode) {
  return labCatalogStore.get(testCode) || null;
}

/**
 * Validates a single structured laboratory measurement.
 * Never silently coerces invalid text into numbers.
 * Rejects negative values, future timestamps, and unsupported units.
 */
function validateLabMeasurement({
  testCode,
  value,
  unit,
  referenceRange = null,
  collectedAt,
  reportingLab,
  attachedLabReportFiles = []
}) {
  if (!testCode || typeof testCode !== 'string') {
    const err = new Error('testCode is required for laboratory measurement.');
    err.code = 'MISSING_TEST_CODE';
    throw err;
  }

  const normalizedCode = testCode.trim().toUpperCase();
  const catalogEntry = labCatalogStore.get(normalizedCode);

  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    const err = new Error(`Value for lab test '${normalizedCode}' cannot be empty.`);
    err.code = 'EMPTY_LAB_VALUE';
    throw err;
  }

  // Parse Numeric Value
  const cleanedValStr = normalizeArabicDigits(value);
  const numVal = Number(cleanedValStr);

  if (isNaN(numVal)) {
    const err = new Error(`Invalid non-numeric value for lab test '${normalizedCode}': ${value}`);
    err.code = 'INVALID_LAB_NUMERIC_VALUE';
    throw err;
  }

  if (numVal < 0) {
    const err = new Error(`Laboratory value cannot be negative for '${normalizedCode}': ${numVal}`);
    err.code = 'NEGATIVE_LAB_VALUE';
    throw err;
  }

  if (catalogEntry) {
    if (numVal < catalogEntry.minBound || numVal > catalogEntry.maxBound) {
      const err = new Error(`Laboratory value ${numVal} exceeds physiological boundaries [${catalogEntry.minBound} - ${catalogEntry.maxBound}] for '${normalizedCode}'.`);
      err.code = 'LAB_VALUE_OUT_OF_BOUNDS';
      throw err;
    }
  }

  // Unit validation
  let validatedUnit = unit || (catalogEntry ? catalogEntry.canonicalUnit : '');
  if (catalogEntry && unit && !catalogEntry.validUnits.includes(unit)) {
    const err = new Error(`Unsupported unit '${unit}' for lab test '${normalizedCode}'. Valid units: [${catalogEntry.validUnits.join(', ')}]`);
    err.code = 'INVALID_LAB_UNIT';
    throw err;
  }

  // Timestamp validation
  const now = Date.now();
  const collectedTimestamp = collectedAt ? new Date(collectedAt).getTime() : now;
  if (isNaN(collectedTimestamp)) {
    const err = new Error('Invalid collection date/time.');
    err.code = 'INVALID_COLLECTION_TIME';
    throw err;
  }
  if (collectedTimestamp > now + 60000) {
    const err = new Error(`Specimen collection timestamp cannot be in the future (${collectedAt}).`);
    err.code = 'FUTURE_LAB_TIMESTAMP';
    throw err;
  }

  return {
    testCode: normalizedCode,
    testName: catalogEntry ? catalogEntry.nameEn : normalizedCode,
    testNameAr: catalogEntry ? catalogEntry.nameAr : normalizedCode,
    value: numVal,
    unit: validatedUnit,
    referenceRange: referenceRange || (catalogEntry ? catalogEntry.standardRefRange : null),
    collectedAt: new Date(collectedTimestamp).toISOString(),
    reportingLab: String(reportingLab || 'Clinical Laboratory').trim(),
    attachedLabReportFiles: Array.isArray(attachedLabReportFiles) ? attachedLabReportFiles : []
  };
}

// =============================================================================
// 3. STRUCTURED PATIENT INFORMATION & CASE INTAKE
// =============================================================================

/**
 * Creates or updates a structured blood disorder clinical case.
 * Does NOT generate automatic diagnoses or invent lab results.
 */
async function recordPatientBloodDisorderCase({
  patientId,
  conditionId,
  patientInfo = {},
  clinicalIntake = {},
  labResults = [],
  attachedFiles = [],
  clinicId = null,
  assignedDoctorId = null,
  authorizedUser
}) {
  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    throw err;
  }

  if (!conditionId) {
    const err = new Error('conditionId is required.');
    err.code = 'MISSING_CONDITION_ID';
    throw err;
  }

  const conditionSpec = conditionsRegistry.get(conditionId);
  if (!conditionSpec) {
    const err = new Error(`Condition '${conditionId}' is not registered in the medical catalog.`);
    err.code = 'UNREGISTERED_CONDITION';
    throw err;
  }

  // Server-side Authorization Check
  if (authorizedUser) {
    const isDoctor = authorizedUser.role === 'doctor';
    const isAdmin = authorizedUser.role === 'clinic_admin' || authorizedUser.role === 'super_admin' || authorizedUser.role === 'owner';
    const isSelf = authorizedUser.uid === patientId;

    if (!isSelf && !isDoctor && !isAdmin) {
      const err = new Error('Access denied: Unauthorized to submit blood disorder case for this patient.');
      err.code = 'ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }
  }

  // Validate and structure lab results (strictly real, verified measurements)
  const validatedLabs = [];
  if (Array.isArray(labResults)) {
    for (const item of labResults) {
      if (item && item.testCode) {
        validatedLabs.push(validateLabMeasurement(item));
      }
    }
  }

  const nowIso = new Date().toISOString();
  const caseId = `case_bd_${patientId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Assemble Structured Case (Explicitly NO automated diagnosis!)
  const bloodDisorderCase = {
    id: caseId,
    caseId,
    caseType: 'blood_disorders',
    patientId,
    patientName: patientInfo.name || patientInfo.patientName || 'Patient',
    clinicId: clinicId || null,
    assignedDoctorId: assignedDoctorId || null,
    conditionId,
    conditionNameEn: conditionSpec.nameEn,
    conditionNameAr: conditionSpec.nameAr,
    conditionCategory: conditionSpec.category,

    // Structured Patient Clinical History & Intake
    patientInfo: {
      patientId,
      name: patientInfo.name || 'Patient',
      age: patientInfo.age || null,
      gender: patientInfo.gender || null,
      bloodGroup: patientInfo.bloodGroup || null
    },
    clinicalIntake: {
      indication: clinicalIntake.indication || conditionSpec.nameEn,
      thromboticHistory: Array.isArray(clinicalIntake.thromboticHistory) ? clinicalIntake.thromboticHistory : [],
      bleedingHistory: Array.isArray(clinicalIntake.bleedingHistory) ? clinicalIntake.bleedingHistory : [],
      activeAnticoagulant: clinicalIntake.activeAnticoagulant || 'none', // e.g. Warfarin, Rivaroxaban, Enoxaparin, none
      anticoagulantDose: clinicalIntake.anticoagulantDose || '',
      lastDoseTakenAt: clinicalIntake.lastDoseTakenAt || null,
      targetInr: clinicalIntake.targetInr || null,
      provokingRiskFactors: Array.isArray(clinicalIntake.provokingRiskFactors) ? clinicalIntake.provokingRiskFactors : [],
      presentingSymptoms: Array.isArray(clinicalIntake.presentingSymptoms) ? clinicalIntake.presentingSymptoms : [],
      symptomOnsetDays: clinicalIntake.symptomOnsetDays || null,
      pregnancyStatus: clinicalIntake.pregnancyStatus || 'none',
      patientNotes: String(clinicalIntake.patientNotes || '').trim()
    },

    // Structured Laboratory Results (Only genuine entries)
    laboratoryResults: validatedLabs,
    attachedFiles: Array.isArray(attachedFiles) ? attachedFiles : [],

    // Human Medical Review State (STRICTLY NO AI DIAGNOSIS!)
    clinicalDiagnosis: null, // Left empty for physician diagnosis
    clinicalNotes: null,
    internalDoctorNotes: null,
    managementPlan: null,
    anticoagulationAdjustment: null,

    status: 'pending', // pending -> under_review -> approved -> follow_up
    clinicalRevision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    submittedAt: nowIso,
    doctorApproved: false,
    approvedAt: null,
    approvingDoctor: null,
    reportRef: null
  };

  bloodDisordersCasesStore.set(caseId, bloodDisorderCase);

  const existingList = patientCasesIndex.get(patientId) || [];
  existingList.unshift(caseId);
  patientCasesIndex.set(patientId, existingList);

  // Register in clinical information exchange service if available
  if (clinicalInfoExchangeService && typeof clinicalInfoExchangeService.registerCase === 'function') {
    try {
      clinicalInfoExchangeService.registerCase(bloodDisorderCase);
    } catch (e) {}
  }

  return bloodDisorderCase;
}

/**
 * Appends new structured laboratory measurements to an existing case.
 */
function recordCaseLabResults({ caseId, labMeasurements = [], recordedByDoctor = null }) {
  const c = bloodDisordersCasesStore.get(caseId);
  if (!c) {
    const err = new Error(`Case '${caseId}' not found.`);
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const validated = [];
  for (const item of labMeasurements) {
    if (item && item.testCode) {
      validated.push(validateLabMeasurement(item));
    }
  }

  c.laboratoryResults.push(...validated);
  c.clinicalRevision = (c.clinicalRevision || 1) + 1;
  c.updatedAt = new Date().toISOString();

  return {
    caseId,
    newLabsCount: validated.length,
    totalLabsCount: c.laboratoryResults.length,
    clinicalRevision: c.clinicalRevision
  };
}

// =============================================================================
// 4. DOCTOR REVIEW, CERTIFIED REPORT & FOLLOW-UP
// =============================================================================

/**
 * Authoritative Physician Review & Approval of a Blood Disorder Case.
 * Physician explicitly defines the diagnosis, management plan, and follow-up.
 * Strictly blocks automated diagnosis generation.
 */
async function reviewAndApproveBloodDisorderCase({
  caseId,
  reviewingDoctor,
  clinicalDiagnosis,
  clinicalNotes = '',
  internalNotes = '',
  treatmentPlan = '',
  recommendations = '',
  followUpSchedule = {}
}) {
  const c = bloodDisordersCasesStore.get(caseId);
  if (!c) {
    const err = new Error(`Case '${caseId}' not found.`);
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Doctor Role & License Authorization Check
  if (!reviewingDoctor || reviewingDoctor.role !== 'doctor') {
    const err = new Error('Access denied: Only a licensed physician can approve blood disorder cases.');
    err.code = 'ACCESS_DENIED_DOCTOR_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.status && reviewingDoctor.status !== 'approved') {
    const err = new Error('Doctor credentials not approved.');
    err.code = 'UNAPPROVED_DOCTOR';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.isLicenseExpired || reviewingDoctor.licenseStatus === 'revoked') {
    const err = new Error('Doctor license is expired or revoked.');
    err.code = 'INVALID_DOCTOR_LICENSE';
    err.statusCode = 403;
    throw err;
  }

  // Doctor Assignment Check
  if (c.assignedDoctorId && c.assignedDoctorId !== reviewingDoctor.uid && !reviewingDoctor.isOwner) {
    const err = new Error('Access denied: This case is assigned to another attending physician.');
    err.code = 'CASE_ASSIGNED_TO_OTHER_DOCTOR';
    err.statusCode = 403;
    throw err;
  }

  // HUMAN-IN-THE-LOOP RULE: Do not create automatic diagnoses!
  // Physician MUST explicitly provide the diagnosis.
  if (!clinicalDiagnosis || typeof clinicalDiagnosis !== 'string' || clinicalDiagnosis.trim().length === 0) {
    const err = new Error('Medical review required: Physician must explicitly enter a clinical diagnosis. Automatic diagnoses are strictly prohibited.');
    err.code = 'PHYSICIAN_DIAGNOSIS_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const reportRef = `HV-HEM-${caseId.slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  // Cryptographic Signature
  const signaturePayload = `${reportRef}|${c.patientId}|${reviewingDoctor.uid}|${clinicalDiagnosis.trim()}|${nowIso}`;
  const signatureHash = crypto.createHmac('sha256', process.env.REPORT_SIGNING_KEY || 'hv-hem-signing-key-2026')
    .update(signaturePayload)
    .digest('hex');

  // Update Case Record
  c.clinicalDiagnosis = clinicalDiagnosis.trim();
  c.clinicalNotes = clinicalNotes.trim();
  c.internalDoctorNotes = internalNotes.trim(); // strictly quarantined
  c.managementPlan = treatmentPlan.trim() || recommendations.trim();
  c.status = 'approved';
  c.doctorApproved = true;
  c.approvedAt = nowIso;
  c.reportRef = reportRef;
  c.approvingDoctor = {
    uid: reviewingDoctor.uid,
    name: reviewingDoctor.name || reviewingDoctor.displayName || 'Physician',
    licenseNumber: reviewingDoctor.licenseNumber || 'HEM-LIC-VERIFIED',
    specialty: reviewingDoctor.specialty || 'Hematologist / Internist'
  };
  c.clinicalRevision = (c.clinicalRevision || 1) + 1;
  c.updatedAt = nowIso;

  // Generate Approved Certified Report Snapshot
  const certifiedReport = {
    reportId: `rep_${reportRef}`,
    reportRef,
    caseId,
    patientId: c.patientId,
    patientName: c.patientName,
    conditionId: c.conditionId,
    conditionNameEn: c.conditionNameEn,
    conditionNameAr: c.conditionNameAr,
    clinicalDiagnosis: c.clinicalDiagnosis,
    managementPlan: c.managementPlan,
    clinicalNotes: c.clinicalNotes,
    // Note: internalDoctorNotes are strictly quarantined and EXCLUDED from certified report!
    laboratoryResultsSummary: c.laboratoryResults.map(l => ({
      testCode: l.testCode,
      testName: l.testName,
      value: l.value,
      unit: l.unit,
      referenceRange: l.referenceRange,
      collectedAt: l.collectedAt
    })),
    approvingDoctor: c.approvingDoctor,
    digitalSignature: {
      algorithm: 'HMAC-SHA256',
      signatureHash,
      signedAt: nowIso
    },
    certifiedAt: nowIso,
    verificationUrl: `/api/reports/verify/${reportRef}`
  };

  approvedReportsStore.set(c.patientId, certifiedReport);

  // If follow-up schedule provided, store protocol
  if (followUpSchedule && (followUpSchedule.nextLabDate || followUpSchedule.monitoringFrequency)) {
    prescribeFollowUpProtocol({
      caseId,
      patientId: c.patientId,
      prescribingDoctor: reviewingDoctor,
      nextLabDate: followUpSchedule.nextLabDate,
      monitoringFrequency: followUpSchedule.monitoringFrequency,
      targetGoals: followUpSchedule.targetGoals,
      redFlagSymptoms: followUpSchedule.redFlagSymptoms,
      instructions: followUpSchedule.instructions
    });
  }

  // Audit event
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      auditService.recordAuditEvent(null, {
        type: 'CASE_APPROVED',
        actor: c.approvingDoctor,
        action: 'BLOOD_DISORDERS_CASE_APPROVED',
        details: { caseId, reportRef, conditionId: c.conditionId }
      }).catch(() => {});
    } catch (e) {}
  }

  return {
    success: true,
    case: c,
    report: certifiedReport
  };
}

/**
 * Prescribes follow-up monitoring protocol (e.g. repeat INR in 14 days, follow-up ultrasound).
 */
function prescribeFollowUpProtocol({
  caseId,
  patientId,
  prescribingDoctor,
  nextLabDate = null,
  monitoringFrequency = 'weekly',
  targetGoals = '',
  redFlagSymptoms = [],
  instructions = ''
}) {
  const nowIso = new Date().toISOString();
  const protocol = {
    protocolId: `proto_${patientId}_${Date.now()}`,
    caseId,
    patientId,
    prescribingDoctor: {
      uid: prescribingDoctor.uid,
      name: prescribingDoctor.name || prescribingDoctor.displayName || 'Physician',
      licenseNumber: prescribingDoctor.licenseNumber || 'LIC-VERIFIED'
    },
    nextLabDate,
    monitoringFrequency,
    targetGoals: String(targetGoals || '').trim(),
    redFlagSymptoms: Array.isArray(redFlagSymptoms) ? redFlagSymptoms : [
      'Severe sudden shortness of breath',
      'Uncontrolled bleeding from gums or minor cuts',
      'Sudden swelling or redness in extremities'
    ],
    instructions: String(instructions || '').trim(),
    createdAt: nowIso,
    status: 'active'
  };

  followupProtocolsStore.set(patientId, protocol);
  return protocol;
}

function getFollowupProtocol(patientId) {
  return followupProtocolsStore.get(patientId) || null;
}

function getPatientCases(patientId) {
  const ids = patientCasesIndex.get(patientId) || [];
  return ids.map(id => bloodDisordersCasesStore.get(id)).filter(Boolean);
}

function getCaseById(caseId) {
  return bloodDisordersCasesStore.get(caseId) || null;
}

function getApprovedReport(patientId) {
  return approvedReportsStore.get(patientId) || null;
}

function resetBloodDisordersStoreForTesting() {
  bloodDisordersCasesStore.clear();
  patientCasesIndex.clear();
  followupProtocolsStore.clear();
  approvedReportsStore.clear();

  // Reset conditions to default seed
  conditionsRegistry.clear();
  INITIAL_CONDITION_REGISTRY.forEach(cond => {
    conditionsRegistry.set(cond.conditionId, { ...cond });
  });

  // Reset lab catalog
  labCatalogStore.clear();
  Object.values(STANDARD_LAB_CATALOG).forEach(item => {
    labCatalogStore.set(item.testCode, { ...item });
  });
}

module.exports = {
  CONDITION_CATEGORIES,
  SPECIFICATION_STATUS,
  STANDARD_LAB_CATALOG,
  normalizeArabicDigits,
  getRegisteredConditions,
  getConditionById,
  defineOrUpdateConditionSpecification,
  getStandardLabCatalog,
  getLabParameter,
  validateLabMeasurement,
  recordPatientBloodDisorderCase,
  recordCaseLabResults,
  reviewAndApproveBloodDisorderCase,
  prescribeFollowUpProtocol,
  getFollowupProtocol,
  getPatientCases,
  getCaseById,
  getApprovedReport,
  resetBloodDisordersStoreForTesting
};
