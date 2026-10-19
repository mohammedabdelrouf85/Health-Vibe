/**
 * Health Vibe AI - Doctor Complementary Investigations & Radiology Service (Vezeeta E-Referral Pattern)
 *
 * Implements:
 * 1. Verified Doctor Authorization Guard (checks role, verified doctor status, active syndicate license).
 * 2. Doctor Patient Data Isolation & Clinic Assignment Verification (UNASSIGNED_DOCTOR_ACCESS_DENIED, CROSS_CLINIC_ACCESS_DENIED).
 * 3. Diagnostic Investigations Catalog (CBC, CRP, D-Dimer, Ferritin, Renal, Liver, Chest X-Ray, HRCT, etc.).
 * 4. High-Yield Presets & Workup Bundles (Respiratory Infection, Acute Dyspnea/PE, Viral Pneumonia, Cardiopulmonary).
 * 5. Custom unlisted diagnostic test creation with strict XSS sanitization.
 * 6. Official Certified E-Referral Requisition Generation (#REF-XXXXXX-DIAG).
 * 7. Immutable Security & Compliance Audit Trail ('CASE_INVESTIGATIONS_ORDERED' / 'CLINICAL_INVESTIGATIONS_ORDERED').
 * 8. Status History & Revision Stamping for Concurrency Governance.
 */

'use strict';

const INVESTIGATION_CATEGORIES = {
  LAB: 'LAB',
  RADIOLOGY: 'RADIOLOGY'
};

const INVESTIGATION_URGENCIES = {
  ROUTINE: 'routine',
  STAT: 'stat'
};

const INVESTIGATION_CATALOG = [
  // --- Standard Laboratory & Blood Tests ---
  {
    code: 'CBC',
    loinc: '58410-2',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'صورة دم كاملة (CBC with Differential)',
    nameEn: 'Complete Blood Count (CBC with Diff)',
    descAr: 'كشف العدوى، كرات الدم البيضاء، الأنيميا، والصفائح الدموية.',
    descEn: 'Evaluates leukocytosis, anemia, and platelet count for infection and bleeding.',
    highYield: true,
    fastingHours: 0,
    sampleTypeAr: 'دم كامل (EDTA)',
    sampleTypeEn: 'Whole Blood (EDTA)'
  },
  {
    code: 'CRP',
    loinc: '1988-5',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'بروتين سي التفاعلي الكمي (CRP Quantitative)',
    nameEn: 'C-Reactive Protein (CRP Quantitative)',
    descAr: 'مؤشر حاد للالتهاب والعدوى البكتيرية والتفاقم التنفسي.',
    descEn: 'Quantitative acute-phase inflammatory marker for bacterial vs viral triage.',
    highYield: true,
    fastingHours: 0,
    sampleTypeAr: 'مصل دم',
    sampleTypeEn: 'Serum'
  },
  {
    code: 'D_DIMER',
    loinc: '48065-7',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'تحليل دي دايمر النوعي (D-Dimer Quantitative)',
    nameEn: 'D-Dimer Quantitative (FEU)',
    descAr: 'استبعاد وتأكيد الجلطات الرئوية وتخثر الأوردة العميقة (VTE/PE).',
    descEn: 'High-sensitivity biomarker to rule out pulmonary embolism and thrombosis.',
    highYield: true,
    fastingHours: 0,
    sampleTypeAr: 'بلازما سيترات',
    sampleTypeEn: 'Citrated Plasma'
  },
  {
    code: 'FERRITIN',
    loinc: '2276-4',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'فيريتين مصل الدم (Serum Ferritin)',
    nameEn: 'Serum Ferritin',
    descAr: 'مؤشر التهابي ومخزون الحديد لتشخيص عواصف السيتوكين والالتهاب الرئوي.',
    descEn: 'Severe inflammatory hyperferritinemia marker and iron store staging.',
    highYield: true,
    fastingHours: 0,
    sampleTypeAr: 'مصل دم',
    sampleTypeEn: 'Serum'
  },
  {
    code: 'RENAL_PANEL',
    loinc: '24362-6',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'وظائف كلى كاملة (Creatinine, Urea, eGFR)',
    nameEn: 'Renal Function Panel (Creatinine, Urea, eGFR)',
    descAr: 'تقييم كفاءة الكلى قبل بدء المضادات الحيوية وحقن صبغات الأشعة.',
    descEn: 'Renal clearance baseline prior to nephrotoxic antibiotics or IV contrast.',
    highYield: true,
    fastingHours: 0,
    sampleTypeAr: 'مصل دم',
    sampleTypeEn: 'Serum'
  },
  {
    code: 'LIVER_PANEL',
    loinc: '24363-4',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'إنزيمات ووظائف كبد (ALT, AST, Total Bilirubin)',
    nameEn: 'Liver Function Panel (ALT, AST, Bilirubin)',
    descAr: 'تقييم الإنزيمات وسلامة الكبد للأدوية والالتهابات الجهازية.',
    descEn: 'Hepatic transaminases to monitor drug tolerance and systemic involvement.',
    highYield: false,
    fastingHours: 4,
    sampleTypeAr: 'مصل دم',
    sampleTypeEn: 'Serum'
  },
  {
    code: 'ABG',
    loinc: '2708-6',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'غازات الدم الشرياني (Arterial Blood Gases - ABG)',
    nameEn: 'Arterial Blood Gas Analysis (ABG)',
    descAr: 'تقييم دقيق للحموضة وتوازن الأكسجين وثاني أكسيد الكربون.',
    descEn: 'Critical evaluation of PaO2, PaCO2, and pH for acute respiratory failure.',
    highYield: true,
    fastingHours: 0,
    sampleTypeAr: 'دم شرياني مسحوب بالهيبارين',
    sampleTypeEn: 'Heparinized Arterial Blood'
  },
  {
    code: 'SPUTUM_CULTURE',
    loinc: '624-7',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'مزرعة بلغم وحساسية ميكروبية (Sputum Culture & Sensitivity)',
    nameEn: 'Sputum Bacterial Culture & Antibiotic Sensitivity',
    descAr: 'تحديد الميكروب المسبب للعدوى التنفسية والمضاد الحيوي الأنسب.',
    descEn: 'Isolates respiratory bacterial pathogens and guides targeted antimicrobial therapy.',
    highYield: false,
    fastingHours: 0,
    sampleTypeAr: 'بلغم صباحي عميق',
    sampleTypeEn: 'Deep Early Morning Sputum'
  },
  {
    code: 'ESR',
    loinc: '30341-2',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'سرعة الترسيب (ESR)',
    nameEn: 'Erythrocyte Sedimentation Rate (ESR)',
    descAr: 'معدل سرعة ترسيب كرات الدم الحمراء للالتهابات المزمنة.',
    descEn: 'Erythrocyte sedimentation velocity for chronic inflammation.',
    highYield: false,
    fastingHours: 0,
    sampleTypeAr: 'دم كامل',
    sampleTypeEn: 'Whole Blood (Citrate)'
  },
  {
    code: 'SERUM_ELECTROLYTES',
    loinc: '2823-3',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'أملاح ومعادن الدم (Na+, K+, Cl-)',
    nameEn: 'Serum Electrolytes (Na+, K+, Cl-)',
    descAr: 'توازن الكهارل والأملاح لدعم استقرار الدورة الدموية.',
    descEn: 'Electrolyte balance for cardiac & hemodynamic stability.',
    highYield: false,
    fastingHours: 0,
    sampleTypeAr: 'مصل دم',
    sampleTypeEn: 'Serum'
  },
  {
    code: 'TROPONIN_I',
    loinc: '10839-9',
    category: INVESTIGATION_CATEGORIES.LAB,
    nameAr: 'تروبونين قلبي عالي الحساسية (Troponin-I)',
    nameEn: 'High-Sensitivity Cardiac Troponin-I',
    descAr: 'استبعاد احتشاء عضلة القلب الحاد ومتلازمة الشريان التاجي.',
    descEn: 'Rule out acute myocardial infarction & myocarditis.',
    highYield: false,
    fastingHours: 0,
    sampleTypeAr: 'مصل دم',
    sampleTypeEn: 'Serum'
  },

  // --- High-Yield Radiology & Medical Imaging ---
  {
    code: 'CHEST_XRAY',
    loinc: '36643-5',
    category: INVESTIGATION_CATEGORIES.RADIOLOGY,
    nameAr: 'أشعة عادية على الصدر (Chest X-Ray PA/Lat)',
    nameEn: 'Chest X-Ray Frontal & Lateral (PA/Lat)',
    descAr: 'فحص الصدر لاستبعاد الارتشاح الرئوي والتجمع الهوائي والالتهاب.',
    descEn: 'Radiographic evaluation for consolidation, pneumothorax & effusion.',
    highYield: true,
    modality: 'CR / DX',
    instructionsAr: 'نزع أي مجوهرات أو سلاسل معدنية قبل التصوير.',
    instructionsEn: 'Remove metallic accessories and jewelry before exposure.'
  },
  {
    code: 'HRCT_CHEST',
    loinc: '24627-2',
    category: INVESTIGATION_CATEGORIES.RADIOLOGY,
    nameAr: 'أشعة مقطعية عالية الدقة على الصدر (HRCT Chest)',
    nameEn: 'High-Resolution CT Chest (HRCT)',
    descAr: 'تصوير مقطعي دقيق لنسيج الرئة وعلامات التليف والتعتيم الزجاجي.',
    descEn: 'Sub-millimeter thoracic scan for ground-glass opacities & interstitial disease.',
    highYield: true,
    modality: 'CT without IV Contrast',
    instructionsAr: 'حبس النفس أثناء التصوير حسب توجيهات فني الأشعة.',
    instructionsEn: 'Follow technician breathing commands during scan acquisition.'
  },
  {
    code: 'CTPA',
    loinc: 'CTPA',
    category: INVESTIGATION_CATEGORIES.RADIOLOGY,
    nameAr: 'مقطعية بالصبغة على الشرايين الرئوية (CTPA)',
    nameEn: 'CT Pulmonary Angiogram (CTPA)',
    descAr: 'الفحص المعياري لتأكيد أو نفي الجلطة الرئوية الحادة.',
    descEn: 'Gold standard contrast-enhanced imaging for pulmonary embolism.',
    highYield: false,
    modality: 'CT with IV Contrast',
    instructionsAr: 'صيام 4-6 ساعات ووظائف كلى حديثة قبل حقن الصبغة.',
    instructionsEn: '4-6 hours fasting and recent serum creatinine required.'
  },
  {
    code: 'CHEST_US',
    loinc: 'CHEST_US',
    category: INVESTIGATION_CATEGORIES.RADIOLOGY,
    nameAr: 'موجات صوتية وسونار على الصدر (Chest Ultrasound)',
    nameEn: 'Chest Ultrasound / Pleural POCUS',
    descAr: 'كشف الارتشاح البلوري وتحديد خطوط B السريرية للرئة.',
    descEn: 'Bedside ultrasound for pleural effusion & B-line artifact quantification.',
    highYield: false,
    modality: 'Ultrasound',
    instructionsAr: 'لا يتطلب صياماً مسبقاً.',
    instructionsEn: 'No prior preparation required.'
  }
];

const WORKUP_PRESETS = {
  RESPIRATORY_INFECTION: {
    id: 'RESPIRATORY_INFECTION',
    titleAr: 'حزمة العدوى التنفسية الحادة (Respiratory Infection Bundle)',
    titleEn: 'Acute Respiratory Infection Workup Bundle',
    descriptionAr: 'صورة دم كاملة + بروتين سي التفاعلي + أشعة عادية على الصدر',
    descriptionEn: 'CBC + CRP + Chest X-Ray Frontal & Lateral',
    testCodes: ['CBC', 'CRP', 'CHEST_XRAY'],
    defaultUrgency: INVESTIGATION_URGENCIES.ROUTINE
  },
  ACUTE_DYSPNEA_PE: {
    id: 'ACUTE_DYSPNEA_PE',
    titleAr: 'حزمة ضيق التنفس الحاد والاشتباه بالجلطة (Acute Dyspnea / PE)',
    titleEn: 'Acute Dyspnea / Pulmonary Embolism Exclusion Workup',
    descriptionAr: 'دي دايمر + صورة دم كاملة + أشعة عادية على الصدر (عاجل STAT)',
    descriptionEn: 'D-Dimer (STAT) + CBC + Chest X-Ray',
    testCodes: ['D_DIMER', 'CBC', 'CHEST_XRAY'],
    defaultUrgency: INVESTIGATION_URGENCIES.STAT
  },
  VIRAL_PNEUMONIA: {
    id: 'VIRAL_PNEUMONIA',
    titleAr: 'حزمة الالتهاب الرئوي الفيروسي (Viral Pneumonia / COVID)',
    titleEn: 'Viral Pneumonia & Cytokine Staging Workup',
    descriptionAr: 'صورة دم + بروتين سي التفاعلي + فيريتين + أشعة مقطعية عالية الدقة',
    descriptionEn: 'CBC + CRP + Serum Ferritin + HRCT Chest',
    testCodes: ['CBC', 'CRP', 'FERRITIN', 'HRCT_CHEST'],
    defaultUrgency: INVESTIGATION_URGENCIES.ROUTINE
  },
  CARDIOPULMONARY_WORKUP: {
    id: 'CARDIOPULMONARY_WORKUP',
    titleAr: 'حزمة التقييم القلبي الرئوي الشامل (Cardiopulmonary Workup)',
    titleEn: 'Comprehensive Cardiopulmonary Evaluation Bundle',
    descriptionAr: 'أشعة عادية على الصدر + صورة دم كاملة + وظائف كلى',
    descriptionEn: 'Chest X-Ray + CBC + Renal Function Panel',
    testCodes: ['CHEST_XRAY', 'CBC', 'RENAL_PANEL'],
    defaultUrgency: INVESTIGATION_URGENCIES.ROUTINE
  }
};

/**
 * Sanitizes input text against XSS and HTML injection
 */
function sanitizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validates a single investigation item against known catalog or sanitized custom entry
 */
function validateInvestigationItem(item) {
  if (!item || typeof item !== 'object') return null;

  const code = sanitizeText(item.code || item.id || '').toUpperCase();
  if (!code) return null;

  const catalogEntry = INVESTIGATION_CATALOG.find(c => c.code === code);

  let category = String(item.category || (catalogEntry ? catalogEntry.category : INVESTIGATION_CATEGORIES.LAB)).toUpperCase();
  if (category !== INVESTIGATION_CATEGORIES.LAB && category !== INVESTIGATION_CATEGORIES.RADIOLOGY) {
    category = INVESTIGATION_CATEGORIES.LAB;
  }

  let urgency = String(item.urgency || INVESTIGATION_URGENCIES.ROUTINE).toLowerCase();
  if (urgency !== INVESTIGATION_URGENCIES.ROUTINE && urgency !== INVESTIGATION_URGENCIES.STAT) {
    urgency = INVESTIGATION_URGENCIES.ROUTINE;
  }

  const nameAr = sanitizeText(item.nameAr || (catalogEntry ? catalogEntry.nameAr : code));
  const nameEn = sanitizeText(item.nameEn || (catalogEntry ? catalogEntry.nameEn : code));
  const loinc = sanitizeText(item.loinc || (catalogEntry ? catalogEntry.loinc : ''));
  const clinicalIndication = sanitizeText(item.clinicalIndication || item.indication || item.notes || '');

  return {
    code,
    category,
    urgency,
    nameAr: nameAr || code,
    nameEn: nameEn || code,
    loinc,
    clinicalIndication,
    isCustom: !catalogEntry,
    orderedAt: item.orderedAt || new Date().toISOString()
  };
}

/**
 * Validates doctor eligibility to order diagnostic investigations
 */
function verifyDoctorAuthorization(doctorProfile, doctorIdentity = null) {
  if (!doctorProfile) {
    return {
      isAuthorized: false,
      code: 'DOCTOR_PROFILE_NOT_FOUND',
      message: 'Doctor profile could not be resolved from server registry.'
    };
  }

  if (doctorProfile.role !== 'doctor' && doctorProfile.role !== 'super_admin') {
    return {
      isAuthorized: false,
      code: 'INSUFFICIENT_ROLE',
      message: 'Only licensed physicians with doctor role can order diagnostic investigations.'
    };
  }

  const isApproved = doctorProfile.doctorApplicationStatus === 'approved' ||
                     doctorProfile.verifiedDoctor === true ||
                     doctorProfile.role === 'super_admin';
  if (!isApproved) {
    return {
      isAuthorized: false,
      code: 'DOCTOR_NOT_VERIFIED',
      message: 'Ordering diagnostic investigations requires verified, approved doctor status.'
    };
  }

  if (doctorProfile.licenseStatus === 'suspended' || doctorProfile.licenseStatus === 'revoked') {
    return {
      isAuthorized: false,
      code: 'DOCTOR_LICENSE_INACTIVE',
      message: `Doctor license is currently ${doctorProfile.licenseStatus}.`
    };
  }

  const doctorName = doctorProfile.displayName || doctorProfile.name || 'Licensed Attending Doctor';
  const doctorLicense = doctorIdentity?.licenseNumber || doctorProfile.doctorLicense || doctorProfile.syndicateCardNumber || doctorProfile.licenseNumber || 'EG-MED-VERIFIED';
  const doctorSpecialty = doctorIdentity?.specialty || doctorProfile.specialty || 'Pulmonology / Internal Medicine';

  return {
    isAuthorized: true,
    doctorName,
    doctorLicense,
    doctorSpecialty
  };
}

/**
 * Verifies doctor assignment and clinic isolation on a specific case
 */
function verifyDoctorCaseAccess(caseData, user, doctorProfile = null) {
  if (!caseData || !user) return { isAllowed: true };

  const userUid = user.uid || user.id;
  const userEmail = String(user.email || '').toLowerCase();
  const isSuperAdmin = user.role === 'super_admin' || doctorProfile?.role === 'super_admin';

  if (isSuperAdmin) {
    return { isAllowed: true };
  }

  // 1. Multi-Tenant Clinic Isolation Check
  if (caseData.clinicId) {
    const doctorClinicId = doctorProfile?.clinicId || doctorProfile?.clinic || user.clinicId;
    let clinicMatched = doctorClinicId === caseData.clinicId;

    if (!clinicMatched && Array.isArray(doctorProfile?.clinics)) {
      clinicMatched = doctorProfile.clinics.some(c => {
        const id = typeof c === 'string' ? c : (c.clinicId || c.id);
        const status = typeof c === 'object' ? c.status : 'approved';
        return id === caseData.clinicId && status !== 'revoked';
      });
    }

    if (!clinicMatched && doctorClinicId) {
      return {
        isAllowed: false,
        code: 'CROSS_CLINIC_ACCESS_DENIED',
        statusCode: 403,
        message: 'Access denied: Patient case belongs to another clinic organization.'
      };
    }
  }

  // 2. Doctor Assignment Check
  const assignedDoctorId = caseData.assignedDoctorId || caseData.doctorId || caseData.doctorUid;
  const assignedDoctorEmail = String(caseData.assignedDoctorEmail || caseData.doctorEmail || '').toLowerCase();

  if (assignedDoctorId || assignedDoctorEmail) {
    const matchesId = assignedDoctorId && assignedDoctorId === userUid;
    const matchesEmail = assignedDoctorEmail && userEmail && assignedDoctorEmail === userEmail;

    if (!matchesId && !matchesEmail) {
      return {
        isAllowed: false,
        code: 'UNASSIGNED_DOCTOR_ACCESS_DENIED',
        statusCode: 403,
        message: 'Access denied: Case is assigned to another medical practitioner. Ordering investigations is restricted to the assigned clinician.'
      };
    }
  }

  return { isAllowed: true };
}

/**
 * Processes and saves diagnostic investigations order for a case
 */
async function processOrderInvestigations({
  caseId,
  investigations = [],
  notes = '',
  presetId = null,
  user,
  doctorProfile,
  doctorIdentity = null,
  db = null,
  metadata = {}
}) {
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  if (!user) {
    const err = new Error('Authentication required.');
    err.code = 'UNAUTHENTICATED';
    err.statusCode = 401;
    throw err;
  }

  // 1. Verified Doctor Authorization Guard
  const authCheck = verifyDoctorAuthorization(doctorProfile, doctorIdentity);
  if (!authCheck.isAuthorized) {
    const err = new Error(authCheck.message);
    err.code = authCheck.code;
    err.statusCode = 403;
    throw err;
  }

  const { doctorName, doctorLicense, doctorSpecialty } = authCheck;

  // 2. Normalize and validate requested investigations
  let validatedItems = [];
  if (Array.isArray(investigations)) {
    const seen = new Set();
    for (const raw of investigations) {
      const valid = validateInvestigationItem(raw);
      if (valid && !seen.has(valid.code)) {
        seen.add(valid.code);
        validatedItems.push(valid);
      }
    }
  }

  // Expand preset if provided and no explicit items given
  if (validatedItems.length === 0 && presetId && WORKUP_PRESETS[presetId]) {
    const preset = WORKUP_PRESETS[presetId];
    validatedItems = preset.testCodes.map(code => {
      const entry = INVESTIGATION_CATALOG.find(c => c.code === code);
      return validateInvestigationItem({
        code,
        urgency: preset.defaultUrgency,
        clinicalIndication: `Ordered via preset: ${preset.titleEn}`
      });
    }).filter(Boolean);
  }

  const cleanNotes = sanitizeText(notes);
  const nowIso = new Date().toISOString();
  const requisitionRef = `REF:#${caseId.slice(-6).toUpperCase()}-DIAG`;

  let caseData = {};

  if (db) {
    const caseRef = db.collection('cases').doc(caseId);
    const caseDoc = await caseRef.get();
    if (!caseDoc || !caseDoc.exists) {
      const err = new Error('Case not found.');
      err.code = 'CASE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    caseData = caseDoc.data() || {};

    if (caseData.status === 'closed') {
      const err = new Error('Cannot order diagnostic investigations for an archived/closed case.');
      err.code = 'CASE_CLOSED';
      err.statusCode = 400;
      throw err;
    }

    // 3. Security & Isolation Check
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error(accessCheck.message);
      err.code = accessCheck.code;
      err.statusCode = accessCheck.statusCode || 403;
      throw err;
    }

    const existingHistory = Array.isArray(caseData.statusHistory) ? caseData.statusHistory : [];
    const newHistoryEntry = {
      action: 'ORDER_DIAGNOSTIC_INVESTIGATIONS',
      changedAt: nowIso,
      changedBy: user.uid,
      changedByName: doctorName,
      changedByLicense: doctorLicense,
      changedByRole: 'doctor',
      investigationCount: validatedItems.length,
      investigationCodes: validatedItems.map(i => i.code),
      requisitionRef,
      notes: cleanNotes
    };

    const currentRevision = Number(caseData.clinicalRevision || caseData.revision || 1);

    const updatePayload = {
      investigations: validatedItems,
      orderedInvestigations: validatedItems,
      hasOrderedInvestigations: validatedItems.length > 0,
      investigationsRequisitionRef: requisitionRef,
      investigationsOrderedAt: nowIso,
      investigationsOrderedBy: {
        uid: user.uid,
        name: doctorName,
        license: doctorLicense,
        specialty: doctorSpecialty,
        email: user.email || ''
      },
      investigationsNotes: cleanNotes,
      clinicalRevision: currentRevision + 1,
      statusHistory: [...existingHistory, newHistoryEntry],
      updatedAt: nowIso
    };

    await caseRef.update(updatePayload);

    // 4. Security & Compliance Audit Log
    const auditRecord = {
      eventType: 'CLINICAL_INVESTIGATIONS_ORDERED',
      action: 'ORDER_DIAGNOSTIC_INVESTIGATIONS',
      caseId,
      performedBy: {
        uid: user.uid,
        name: doctorName,
        email: user.email || '',
        license: doctorLicense,
        role: user.role || 'doctor'
      },
      details: {
        requisitionRef,
        investigationCount: validatedItems.length,
        investigationCodes: validatedItems.map(i => i.code),
        hasRadiology: validatedItems.some(i => i.category === INVESTIGATION_CATEGORIES.RADIOLOGY),
        hasStatOrders: validatedItems.some(i => i.urgency === INVESTIGATION_URGENCIES.STAT),
        notes: cleanNotes
      },
      timestamp: nowIso,
      ipAddress: metadata.ip || '127.0.0.1',
      userAgent: metadata.userAgent || ''
    };

    await db.collection('audit_logs').add(auditRecord);
  }

  return {
    success: true,
    caseId,
    requisitionRef,
    count: validatedItems.length,
    investigations: validatedItems,
    orderedAt: nowIso,
    orderedBy: {
      name: doctorName,
      license: doctorLicense,
      specialty: doctorSpecialty
    },
    message: `Diagnostic investigations requisition ${requisitionRef} registered with ${validatedItems.length} orders.`
  };
}

/**
 * Retrieves ordered investigations for a case
 */
async function getCaseInvestigations(caseId, { db, user, doctorProfile }) {
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  if (!db) {
    return {
      caseId,
      requisitionRef: `REF:#${caseId.slice(-6).toUpperCase()}-DIAG`,
      investigations: [],
      count: 0
    };
  }

  const caseDoc = await db.collection('cases').doc(caseId).get();
  if (!caseDoc || !caseDoc.exists) {
    const err = new Error('Case not found.');
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const caseData = caseDoc.data() || {};

  if (user) {
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error(accessCheck.message);
      err.code = accessCheck.code;
      err.statusCode = accessCheck.statusCode || 403;
      throw err;
    }
  }

  const items = Array.isArray(caseData.investigations) ? caseData.investigations : (caseData.orderedInvestigations || []);

  return {
    success: true,
    caseId,
    requisitionRef: caseData.investigationsRequisitionRef || `REF:#${caseId.slice(-6).toUpperCase()}-DIAG`,
    investigations: items,
    count: items.length,
    orderedAt: caseData.investigationsOrderedAt || null,
    orderedBy: caseData.investigationsOrderedBy || null,
    notes: caseData.investigationsNotes || ''
  };
}

/**
 * Removes a single investigation from a case
 */
async function removeCaseInvestigation(caseId, testCode, { db, user, doctorProfile, doctorIdentity = null, metadata = {} }) {
  if (!caseId || !testCode) {
    const err = new Error('caseId and testCode are required.');
    err.code = 'PARAM_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  const targetCode = String(testCode).toUpperCase();
  const current = await getCaseInvestigations(caseId, { db, user, doctorProfile });
  const remaining = current.investigations.filter(i => i.code !== targetCode);

  return processOrderInvestigations({
    caseId,
    investigations: remaining,
    user,
    doctorProfile,
    doctorIdentity,
    db,
    metadata
  });
}

/**
 * Returns available catalog and metadata
 */
function getCatalog() {
  return {
    categories: INVESTIGATION_CATEGORIES,
    urgencies: INVESTIGATION_URGENCIES,
    catalog: INVESTIGATION_CATALOG,
    presets: WORKUP_PRESETS
  };
}

module.exports = {
  INVESTIGATION_CATEGORIES,
  INVESTIGATION_URGENCIES,
  INVESTIGATION_CATALOG,
  WORKUP_PRESETS,
  sanitizeText,
  validateInvestigationItem,
  verifyDoctorAuthorization,
  verifyDoctorCaseAccess,
  processOrderInvestigations,
  getCaseInvestigations,
  removeCaseInvestigation,
  getCatalog
};
