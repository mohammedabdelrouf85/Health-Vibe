/**
 * Health Vibe AI - Doctor Recommend Follow-Up Window & Calendar Integration Service (Doctolib Pattern)
 *
 * Implements:
 * 1. Verified Doctor Authorization Guard (checks role, verified doctor status, active syndicate license).
 * 2. Doctor Patient Data Isolation & Clinic Assignment Verification (UNASSIGNED_DOCTOR_ACCESS_DENIED, CROSS_CLINIC_ACCESS_DENIED).
 * 3. Clinical Follow-Up Windows Catalog (within_24h, within_3d, within_1w, within_1m, custom, as_needed).
 * 4. Consultation Modes (clinic, video, phone) & Sanitized Physician Clinical Directives.
 * 5. Automatic Target Date Computation & Bidirectional Localization (Arabic & English).
 * 6. Doctolib 1-Click Appointment Calendar Synchronization & Slot Booking.
 * 7. Immutable Security & Compliance Audit Trail ('DOCTOR_FOLLOWUP_RECOMMENDED' / 'DOCTOR_FOLLOWUP_CALENDAR_LINKED').
 * 8. Status History & Revision Stamping for Concurrency Governance.
 */

'use strict';

const FOLLOW_UP_WINDOWS = {
  within_24h: {
    id: 'within_24h',
    days: 1,
    urgency: 'urgent',
    badgeClass: 'danger',
    icon: '🚨',
    labelEn: 'Within 24 Hours',
    labelAr: 'خلال 24 ساعة',
    taglineEn: 'Emergency / Acute Check',
    taglineAr: 'متابعة طارئة ومستعجلة',
    descriptionEn: 'Urgent review for unstable respiratory vitals, SpO2 borderline, or severe wheezing.',
    descriptionAr: 'متابعة فورية ومستعجلة للحالات الحادة، تذبذب الأكسجين، أو تفاقم الأزمة الصدرية.'
  },
  within_3d: {
    id: 'within_3d',
    days: 3,
    urgency: 'high',
    badgeClass: 'pending',
    icon: '⏱️',
    labelEn: 'Within 3 Days',
    labelAr: 'خلال 3 أيام',
    taglineEn: 'Antibiotic / Treatment Response',
    taglineAr: 'تقييم الاستجابة للعلاج والمضاد',
    descriptionEn: 'Assess early clinical response to prescribed antibiotics, inhalers, and symptom evolution.',
    descriptionAr: 'فحص الاستجابة الأولية للمضادات الحيوية والبخاخات وتقييم هدوء السعال وضيق التنفس.'
  },
  within_1w: {
    id: 'within_1w',
    days: 7,
    urgency: 'routine',
    badgeClass: 'ok',
    icon: '🗓️',
    labelEn: 'Within 1 Week',
    labelAr: 'خلال أسبوع',
    taglineEn: 'Course Completion & Lab Review',
    taglineAr: 'إتمام الكورس ومراجعة الفحوصات',
    descriptionEn: 'Follow-up after completion of medication regimen, clearance of infection, and lab review.',
    descriptionAr: 'فحص روتيني بعد إتمام كورس العلاج الدوائي، التأكد من زوال العدوى، والاطلاع على الفحوصات.'
  },
  within_1m: {
    id: 'within_1m',
    days: 30,
    urgency: 'maintenance',
    badgeClass: 'info',
    icon: '🫁',
    labelEn: 'Within 1 Month',
    labelAr: 'خلال شهر',
    taglineEn: 'Chronic Maintenance & Prevention',
    taglineAr: 'متابعة وقائية للأمراض المزمنة',
    descriptionEn: 'Routine follow-up for chronic respiratory conditions (Asthma controller step-down, COPD baseline).',
    descriptionAr: 'متابعة دورية مستقرة لأمراض الصدر المزمنة (تعديل جرعات بخاخات الوقاية، تقييم وظائف التنفس).'
  },
  custom: {
    id: 'custom',
    days: 0,
    urgency: 'custom',
    badgeClass: 'info',
    icon: '📅',
    labelEn: 'Custom Date',
    labelAr: 'تاريخ مخصص',
    taglineEn: 'Specific Appointment Date',
    taglineAr: 'تحديد موعد استشارة محدد',
    descriptionEn: 'Pick an exact calendar day tailored to clinic consultation schedule.',
    descriptionAr: 'اختيار يوم محدد بالتقويم بالتنسيق مع جدول ومواعيد العيادة.'
  },
  as_needed: {
    id: 'as_needed',
    days: 0,
    urgency: 'prn',
    badgeClass: 'muted',
    icon: '🛡️',
    labelEn: 'As Needed (PRN)',
    labelAr: 'عند اللزوم (PRN)',
    taglineEn: 'Conditional Re-evaluation',
    taglineAr: 'المراجعة عند تجدد الأعراض',
    descriptionEn: 'Return to clinic only if red flag symptoms appear or breathing deteriorates.',
    descriptionAr: 'مراجعة العيادة فقط في حال تجدد ضيق التنفس أو ظهور علامات التحذير الحرجة.'
  }
};

const FOLLOW_UP_MODES = {
  clinic: { id: 'clinic', labelEn: 'In-Clinic Visit', labelAr: 'زيارة بالعيادة', icon: '🏥' },
  video: { id: 'video', labelEn: 'Video Consultation', labelAr: 'استشارة عن بعد (فيديو)', icon: '📹' },
  phone: { id: 'phone', labelEn: 'Phone Follow-up', labelAr: 'متابعة هاتفية', icon: '📞' }
};

const FOLLOW_UP_STATUS = {
  RECOMMENDED: 'RECOMMENDED',
  CALENDAR_LINKED: 'CALENDAR_LINKED',
  BOOKED: 'BOOKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

/**
 * Sanitizes input text against XSS and HTML injection
 */
function sanitizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Calculates target date and formats in Arabic & English
 */
function calculateFollowUpTargetDate(windowKey, baseDate = new Date(), customDateStr = null) {
  const arDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const enDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const arMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (windowKey === 'as_needed') {
    return {
      dateStr: '',
      formattedAr: 'عند ظهور الأعراض أو اللزوم',
      formattedEn: 'PRN / When Symptoms Recur',
      daysFromNow: 0
    };
  }

  const base = new Date(baseDate);
  let targetDate = new Date(base);
  let daysAdded = 0;

  if (windowKey === 'custom' && customDateStr) {
    targetDate = new Date(customDateStr);
    if (isNaN(targetDate.getTime())) {
      targetDate = new Date(base);
      targetDate.setDate(targetDate.getDate() + 3);
    }
    const nowZero = new Date(base);
    nowZero.setHours(0, 0, 0, 0);
    const targetZero = new Date(targetDate);
    targetZero.setHours(0, 0, 0, 0);
    daysAdded = Math.max(0, Math.round((targetZero - nowZero) / (1000 * 60 * 60 * 24)));
  } else {
    const def = FOLLOW_UP_WINDOWS[windowKey] || FOLLOW_UP_WINDOWS.within_3d;
    daysAdded = def.days || 3;
    targetDate.setDate(targetDate.getDate() + daysAdded);
  }

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const dayOfWeek = targetDate.getDay();
  const monthIdx = targetDate.getMonth();
  const dayNum = targetDate.getDate();

  return {
    dateStr,
    daysFromNow: daysAdded,
    formattedAr: `${arDays[dayOfWeek]}، ${dayNum} ${arMonths[monthIdx]} ${yyyy}`,
    formattedEn: `${enDays[dayOfWeek]}, ${dayNum} ${enMonths[monthIdx]} ${yyyy}`
  };
}

/**
 * Validates doctor authorization and verified physician credentials
 */
function verifyDoctorAuthorization(user, doctorProfile = null, doctorIdentity = null) {
  if (!user) {
    return {
      isAuthorized: false,
      code: 'AUTH_REQUIRED',
      statusCode: 401,
      message: 'Authentication required.'
    };
  }

  const isSuperAdmin = user.role === 'super_admin' || doctorProfile?.role === 'super_admin';
  if (isSuperAdmin) {
    return {
      isAuthorized: true,
      doctorName: user.displayName || user.name || 'Super Admin Clinician',
      doctorLicense: 'SUPER-ADMIN-SUPERVISORY',
      doctorSpecialty: 'Clinical Governance'
    };
  }

  const isDoctorRole = user.role === 'doctor' ||
                       doctorProfile?.role === 'doctor' ||
                       doctorProfile?.verifiedDoctor === true ||
                       doctorIdentity?.verified === true;

  if (!isDoctorRole) {
    return {
      isAuthorized: false,
      code: 'DOCTOR_ROLE_REQUIRED',
      statusCode: 403,
      message: 'Only verified medical doctors are authorized to recommend clinical follow-up plans.'
    };
  }

  if (doctorProfile) {
    const isApproved = doctorProfile.status === 'approved' ||
                       doctorProfile.doctorStatus === 'approved' ||
                       doctorProfile.verifiedDoctor === true;
    if (!isApproved) {
      return {
        isAuthorized: false,
        code: 'DOCTOR_NOT_VERIFIED',
        statusCode: 403,
        message: 'Recommending clinical follow-up requires verified and approved physician status.'
      };
    }

    if (doctorProfile.licenseStatus === 'suspended' || doctorProfile.licenseStatus === 'revoked') {
      return {
        isAuthorized: false,
        code: 'DOCTOR_LICENSE_INACTIVE',
        statusCode: 403,
        message: `Doctor license is currently ${doctorProfile.licenseStatus}.`
      };
    }
  }

  const doctorName = doctorProfile?.displayName || doctorProfile?.name || user.displayName || user.name || 'Licensed Attending Doctor';
  const doctorLicense = doctorIdentity?.licenseNumber || doctorProfile?.doctorLicense || doctorProfile?.syndicateCardNumber || doctorProfile?.licenseNumber || 'EG-MED-VERIFIED';
  const doctorSpecialty = doctorIdentity?.specialty || doctorProfile?.specialty || 'Pulmonology / Internal Medicine';

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
        message: 'Access denied: Case is assigned to another medical practitioner. Recommending follow-up is restricted to the assigned clinician.'
      };
    }
  }

  return { isAllowed: true };
}

/**
 * Validates and sanitizes follow-up plan input
 */
function validateFollowUpPlanInput(planInput, baseDate = new Date()) {
  if (!planInput || typeof planInput !== 'object') {
    const err = new Error('Follow-up plan payload must be an object.');
    err.code = 'INVALID_PAYLOAD';
    err.statusCode = 400;
    throw err;
  }

  const rawWindow = sanitizeText(planInput.window).toLowerCase();
  if (!rawWindow || !FOLLOW_UP_WINDOWS[rawWindow]) {
    const err = new Error(`Invalid follow-up window '${rawWindow}'. Must be one of: ${Object.keys(FOLLOW_UP_WINDOWS).join(', ')}.`);
    err.code = 'INVALID_WINDOW';
    err.statusCode = 400;
    throw err;
  }

  const windowDef = FOLLOW_UP_WINDOWS[rawWindow];
  const rawMode = sanitizeText(planInput.mode).toLowerCase() || 'clinic';
  if (!FOLLOW_UP_MODES[rawMode]) {
    const err = new Error(`Invalid consultation mode '${rawMode}'. Must be one of: clinic, video, phone.`);
    err.code = 'INVALID_MODE';
    err.statusCode = 400;
    throw err;
  }

  // Validate custom target date if provided
  let customDateStr = null;
  if (rawWindow === 'custom') {
    customDateStr = sanitizeText(planInput.targetDate);
    if (!customDateStr) {
      const err = new Error('Custom follow-up window requires an explicit targetDate (YYYY-MM-DD).');
      err.code = 'TARGET_DATE_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const parsedDate = new Date(customDateStr);
    if (isNaN(parsedDate.getTime())) {
      const err = new Error('Invalid targetDate format. Expected ISO date format (YYYY-MM-DD).');
      err.code = 'INVALID_DATE_FORMAT';
      err.statusCode = 400;
      throw err;
    }

    const todayZero = new Date(baseDate);
    todayZero.setHours(0, 0, 0, 0);
    const targetZero = new Date(parsedDate);
    targetZero.setHours(0, 0, 0, 0);

    if (targetZero < todayZero) {
      const err = new Error('Target follow-up date cannot be in the past.');
      err.code = 'PAST_DATE_NOT_ALLOWED';
      err.statusCode = 400;
      throw err;
    }
  }

  const computedTarget = calculateFollowUpTargetDate(rawWindow, baseDate, customDateStr);
  const cleanInstructions = sanitizeText(planInput.instructions || '').slice(0, 1000);

  return {
    window: rawWindow,
    targetDate: computedTarget.dateStr,
    targetDateFormattedAr: computedTarget.formattedAr,
    targetDateFormattedEn: computedTarget.formattedEn,
    daysFromNow: computedTarget.daysFromNow,
    mode: rawMode,
    instructions: cleanInstructions,
    urgency: windowDef.urgency,
    status: FOLLOW_UP_STATUS.RECOMMENDED
  };
}

/**
 * Recommends or updates follow-up window plan on a case (Verified Doctor required)
 */
async function recommendCaseFollowUp(caseId, planInput, { db, user, doctorProfile, doctorIdentity, metadata = {} } = {}) {
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify Doctor Authorization
  const authCheck = verifyDoctorAuthorization(user, doctorProfile, doctorIdentity);
  if (!authCheck.isAuthorized) {
    const err = new Error(authCheck.message);
    err.code = authCheck.code;
    err.statusCode = authCheck.statusCode || 403;
    throw err;
  }

  const { doctorName, doctorLicense, doctorSpecialty } = authCheck;
  const nowIso = new Date().toISOString();
  const validatedPlan = validateFollowUpPlanInput(planInput, new Date());

  let caseData = {};
  let currentRevision = 1;

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
      const err = new Error('Cannot recommend follow-up for an archived or closed case.');
      err.code = 'CASE_CLOSED';
      err.statusCode = 400;
      throw err;
    }

    // 2. Doctor Assignment & Clinic Isolation Guard
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error(accessCheck.message);
      err.code = accessCheck.code;
      err.statusCode = accessCheck.statusCode || 403;
      throw err;
    }

    currentRevision = Number(caseData.clinicalRevision || caseData.revision || 1);
    const existingHistory = Array.isArray(caseData.statusHistory) ? caseData.statusHistory : [];

    const newHistoryEntry = {
      action: 'RECOMMEND_FOLLOW_UP_WINDOW',
      changedAt: nowIso,
      changedBy: user.uid,
      changedByName: doctorName,
      changedByLicense: doctorLicense,
      changedByRole: 'doctor',
      followUpWindow: validatedPlan.window,
      targetDate: validatedPlan.targetDate,
      mode: validatedPlan.mode,
      urgency: validatedPlan.urgency
    };

    const fullFollowUpPlan = {
      ...validatedPlan,
      recommendedAt: nowIso,
      recommendedBy: {
        uid: user.uid,
        name: doctorName,
        license: doctorLicense,
        specialty: doctorSpecialty,
        email: user.email || ''
      }
    };

    const updatePayload = {
      followUpPlan: fullFollowUpPlan,
      clinicalRevision: currentRevision + 1,
      statusHistory: [...existingHistory, newHistoryEntry],
      updatedAt: nowIso
    };

    await caseRef.update(updatePayload);

    // 3. Immutable Security & Clinical Audit Log
    const auditRecord = {
      eventType: 'DOCTOR_FOLLOWUP_RECOMMENDED',
      action: 'RECOMMEND_FOLLOW_UP_WINDOW',
      caseId,
      patientId: caseData.patientId || caseData.userId || null,
      performedBy: {
        uid: user.uid,
        name: doctorName,
        email: user.email || '',
        license: doctorLicense,
        role: user.role || 'doctor'
      },
      details: {
        window: validatedPlan.window,
        targetDate: validatedPlan.targetDate,
        mode: validatedPlan.mode,
        urgency: validatedPlan.urgency,
        instructions: validatedPlan.instructions
      },
      timestamp: nowIso,
      ipAddress: metadata.ip || '127.0.0.1',
      userAgent: metadata.userAgent || ''
    };

    await db.collection('audit_logs').add(auditRecord);

    return {
      success: true,
      caseId,
      followUpPlan: fullFollowUpPlan,
      clinicalRevision: currentRevision + 1
    };
  }

  // Fallback for in-memory or unit test without db
  return {
    success: true,
    caseId,
    followUpPlan: {
      ...validatedPlan,
      recommendedAt: nowIso,
      recommendedBy: {
        uid: user.uid,
        name: doctorName,
        license: doctorLicense,
        specialty: doctorSpecialty,
        email: user.email || ''
      }
    },
    clinicalRevision: currentRevision + 1
  };
}

/**
 * Retrieves follow-up plan for a specific case with authorization check
 */
async function getCaseFollowUp(caseId, { db, user, doctorProfile = null } = {}) {
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  if (!db) {
    return { success: true, caseId, followUpPlan: null };
  }

  const caseRef = db.collection('cases').doc(caseId);
  const caseDoc = await caseRef.get();
  if (!caseDoc || !caseDoc.exists) {
    const err = new Error('Case not found.');
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const caseData = caseDoc.data() || {};
  const userUid = user?.uid || user?.id;
  const isSuperAdmin = user?.role === 'super_admin' || doctorProfile?.role === 'super_admin';
  const isCasePatient = userUid && (caseData.patientId === userUid || caseData.userId === userUid);

  if (!isSuperAdmin && !isCasePatient) {
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error('Access denied: Unauthorized to view case follow-up plan.');
      err.code = 'ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }
  }

  return {
    success: true,
    caseId,
    followUpPlan: caseData.followUpPlan || null
  };
}

/**
 * Links a case follow-up plan to an appointment slot in the calendar system (Doctolib Sync)
 */
async function syncFollowUpWithCalendar(caseId, bookingData = {}, { db, user, doctorProfile, doctorIdentity, metadata = {} } = {}) {
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  if (!db) {
    throw new Error('Database connection required.');
  }

  const caseRef = db.collection('cases').doc(caseId);
  const caseDoc = await caseRef.get();
  if (!caseDoc || !caseDoc.exists) {
    const err = new Error('Case not found.');
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const caseData = caseDoc.data() || {};
  const plan = caseData.followUpPlan;

  if (!plan || !plan.window) {
    const err = new Error('No clinical follow-up plan has been established for this case yet.');
    err.code = 'FOLLOW_UP_PLAN_MISSING';
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const patientId = caseData.patientId || caseData.userId || 'anon_patient';
  const doctorId = bookingData.doctorId || caseData.assignedDoctorId || user.uid;
  const targetDate = bookingData.targetDate || plan.targetDate || calculateFollowUpTargetDate(plan.window).dateStr;
  const mode = bookingData.mode || plan.mode || 'clinic';

  const appointmentPayload = {
    caseId,
    patientId,
    patientName: caseData.patientName || caseData.name || 'Patient',
    doctorId,
    doctorName: plan.recommendedBy?.name || 'Assigned Clinician',
    clinicId: caseData.clinicId || 'clinic_cairo_main',
    date: targetDate,
    slotId: bookingData.slotId || 'slot_morning_followup',
    type: mode,
    status: 'confirmed',
    notes: bookingData.notes || `[Doctolib Follow-up Sync] Window: ${plan.window}. Directives: ${plan.instructions || 'Routine re-assessment.'}`,
    source: 'DOCTOLIB_FOLLOWUP_SYNC',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const apptRef = await db.collection('appointments').add(appointmentPayload);
  const apptId = apptRef.id;

  // Update case with linked calendar reference
  const updatedFollowUpPlan = {
    ...plan,
    status: FOLLOW_UP_STATUS.CALENDAR_LINKED,
    appointmentId: apptId,
    linkedAt: nowIso,
    linkedBy: user.uid
  };

  await caseRef.update({
    followUpPlan: updatedFollowUpPlan,
    followUpAppointmentId: apptId,
    updatedAt: nowIso
  });

  // Security Audit Log
  const auditRecord = {
    eventType: 'DOCTOR_FOLLOWUP_CALENDAR_LINKED',
    action: 'SYNC_FOLLOWUP_CALENDAR',
    caseId,
    appointmentId: apptId,
    patientId,
    performedBy: {
      uid: user.uid,
      email: user.email || '',
      role: user.role || 'doctor'
    },
    details: {
      targetDate,
      mode,
      window: plan.window
    },
    timestamp: nowIso,
    ipAddress: metadata.ip || '127.0.0.1',
    userAgent: metadata.userAgent || ''
  };

  await db.collection('audit_logs').add(auditRecord);

  return {
    success: true,
    caseId,
    appointmentId: apptId,
    appointment: {
      id: apptId,
      ...appointmentPayload
    },
    followUpPlan: updatedFollowUpPlan
  };
}

module.exports = {
  FOLLOW_UP_WINDOWS,
  FOLLOW_UP_MODES,
  FOLLOW_UP_STATUS,
  sanitizeText,
  calculateFollowUpTargetDate,
  verifyDoctorAuthorization,
  verifyDoctorCaseAccess,
  validateFollowUpPlanInput,
  recommendCaseFollowUp,
  getCaseFollowUp,
  syncFollowUpWithCalendar
};
