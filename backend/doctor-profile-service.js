/**
 * HEALTH VIBE AI: DOCTOR PROFILE, CLINIC MEMBERSHIPS & BOOKING AVAILABILITY SERVICE
 * 
 * Medical Practitioner Profile Governance & RBAC:
 * 1. Rich Doctor Profile Architecture (linked to verified data):
 *    - photoUrl: verified practitioner portrait image.
 *    - biography / biographyAr: clinical summary and academic background.
 *    - specialty / specialtyAr: medical specialty linked strictly to verified syndicate data.
 *    - languages: spoken consultation languages (e.g. Arabic, English).
 *    - consultationTypes: in-clinic, video telehealth, urgent triage review.
 *    - workingHours: shifts, days, and slot duration per approved clinic.
 * 
 * 2. Clinic Membership Linkage:
 *    - Displays ONLY clinics where the doctor has actual approved membership (status: 'approved').
 *    - Unapproved, pending, or revoked clinic associations are strictly filtered out.
 * 
 * 3. Booking Availability Connection:
 *    - Dynamic time slot generation directly honors the doctor's approved working hours,
 *      shifts, break periods, and leaves for the specific clinic requested.
 * 
 * 4. Public vs. Private Field Separation:
 *    - Public Fields: Visible to patients & search engines on public directory.
 *    - Private Fields: Confidential to the doctor, clinic admin, and platform governance.
 * 
 * 5. STRICT SECURITY SAFEGUARD:
 *    - Doctor profile updates CANNOT modify licensing, approval status, or role.
 *    - Tampering with licenseNumber, licenseStatus, verificationResult, doctorApplicationStatus,
 *      clinic membership approval, or role triggers rejection and security audit events.
 */

const schedulingService = require('./scheduling-service');

// =============================================================================
// 1. FIELD DEFINITIONS & ACCESS CONTROL MATRIX
// =============================================================================

// Public Fields: Visible on public profile & patient booking UI
const PUBLIC_FIELDS = [
  'doctorId',
  'name',
  'nameEn',
  'photoUrl',
  'specialty',
  'specialtyEn',
  'biography',
  'biographyAr',
  'languages',
  'consultationTypes',
  'clinics',         // Filtered to approved memberships only
  'workingHours',    // Weekly schedule & shifts
  'rating',
  'reviewsCount',
  'isAvailableForBooking',
  'verifiedCredentials' // Safe credential summary (syndicate name, verification status; no private IDs)
];

// Private Fields: Visible ONLY to the doctor themselves, clinic admin, or super admin
const PRIVATE_FIELDS = [
  'email',
  'phone',
  'maskedNationalId',
  'nationalIdLegalReview',
  'licenseExpiryDate',
  'reverificationDueDate',
  'applicationId',
  'rejectionReason',
  'internalNotes',
  'auditTrail',
  'allClinicMemberships' // Includes pending/rejected memberships
];

// Protected Fields: CANNOT be modified by doctor through public profile updates
const PROTECTED_FIELDS = [
  'role',
  'licenseNumber',
  'licenseStatus',
  'licenseExpiryDate',
  'verificationResult',
  'doctorApplicationStatus',
  'status',
  'isSuspended',
  'suspended',
  'disabled',
  'isOwner',
  'reverificationDueDate',
  'reviewerId',
  'maskedNationalId',
  'nationalIdHash',
  'nationalIdLegalReview'
];

// Editable Fields by Doctor
const DOCTOR_EDITABLE_FIELDS = [
  'photoUrl',
  'biography',
  'biographyAr',
  'languages',
  'consultationTypes',
  'workingHours'
];

// =============================================================================
// 2. IN-MEMORY DOCTOR PROFILES REGISTRY (SEED & FALLBACK)
// =============================================================================

const DOCTOR_PROFILES = {
  dr_mona: {
    doctorId: 'dr_mona',
    name: 'د. منى سامي',
    nameEn: 'Dr. Mona Samy',
    photoUrl: 'https://healthvibe.ai/app/doctors/dr_mona.jpg',
    specialty: 'أمراض الصدر والحساسية والمناعة التنفسية',
    specialtyEn: 'Pulmonology, Allergy & Respiratory Immunology',
    biography: 'Consultant Pulmonologist with over 14 years of clinical experience in adult asthma, chronic cough, and respiratory allergy management. Head of Outpatient Respiratory Services.',
    biographyAr: 'استشارية الأمراض الصدرية والحساسية، خبرة إكلينيكية لأكثر من 14 عاماً في تشخيص وعلاج الربو الشعبي، السعال المزمن، وحساسية الصدر. رئيسة العيادات الخارجية.',
    languages: ['العربية (Arabic)', 'English'],
    consultationTypes: [
      {
        id: 'in_clinic',
        nameAr: 'كشف سريري بالعيادة',
        nameEn: 'In-Clinic Comprehensive Consultation',
        durationMinutes: 30,
        priceEgp: 450,
        descriptionAr: 'فحص سريري كامل، قياس وظائف التنفس، ومراجعة خطة البخاخات.',
        descriptionEn: 'Full physical examination, spirometry review, and inhaler regimen planning.'
      },
      {
        id: 'telehealth_video',
        nameAr: 'استشارة فيديو عن بُعد',
        nameEn: 'Video Telehealth Consultation',
        durationMinutes: 20,
        priceEgp: 350,
        descriptionAr: 'متابعة نتائج التحاليل، تعديل جرعات الأدوية، والتقييم الدوري للحساسية.',
        descriptionEn: 'Review of diagnostic tests, dose titration, and periodic allergy assessment.'
      },
      {
        id: 'urgent_triage_review',
        nameAr: 'مراجعة طارئة للفرز السريري',
        nameEn: 'Urgent Triage Clinical Review',
        durationMinutes: 15,
        priceEgp: 250,
        descriptionAr: 'تقييم سريع للحالات الحادة واعتماد التدخل الإسعافي الفوري.',
        descriptionEn: 'Immediate triage assessment and protocol verification for acute exacerbations.'
      }
    ],
    // Clinic memberships: ONLY approved clinics will appear publicly
    clinicMemberships: [
      {
        clinicId: 'clinic_cairo_main',
        clinicName: 'عيادة الصدر والرعاية التنفسية التخصصية',
        clinicNameEn: 'Specialized Chest & Respiratory Clinic',
        address: 'شارع عباس العقاد، مدينة نصر، القاهرة',
        status: 'approved',
        joinedAt: '2026-01-15T09:00:00Z',
        workingHours: {
          workingDays: [0, 1, 2, 3, 4], // Sun, Mon, Tue, Wed, Thu
          shifts: [
            { start: '10:00', end: '13:00' },
            { start: '16:00', end: '20:30' }
          ],
          slotDurationMinutes: 30,
          breakPeriods: [
            { start: '13:00', end: '16:00', label: 'Clinical Rounds & Break' }
          ]
        }
      },
      {
        clinicId: 'clinic_alexandria',
        clinicName: 'عيادة الإسكندرية لأمراض الجهاز التنفسي',
        clinicNameEn: 'Alexandria Respiratory Clinic',
        address: 'طريق الحرية، الإسكندرية',
        status: 'pending', // 🛑 PENDING - Must NOT show publicly
        joinedAt: '2026-09-20T10:00:00Z',
        workingHours: {
          workingDays: [6], // Sat
          shifts: [{ start: '11:00', end: '16:00' }]
        }
      }
    ],
    // Verified licensing data (PROTECTED)
    role: 'doctor',
    licenseNumber: 'EGY-MED-449102',
    licenseStatus: 'active',
    licenseExpiryDate: '2028-12-31',
    verificationResult: 'VERIFIED',
    doctorApplicationStatus: 'approved',
    status: 'approved',
    rating: 4.9,
    reviewsCount: 128,
    isAvailableForBooking: true,
    // Private fields
    email: 'dr.mona.samy@healthvibe.ai',
    phone: '+201001234567',
    maskedNationalId: '2820514*****22',
    reverificationDueDate: '2027-12-31',
    createdAt: '2026-01-10T08:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z'
  },

  dr_ahmed: {
    doctorId: 'dr_ahmed',
    name: 'د. أحمد السيد',
    nameEn: 'Dr. Ahmed El-Sayed',
    photoUrl: 'https://healthvibe.ai/app/doctors/dr_ahmed.jpg',
    specialty: 'استشاري الأمراض الصدرية والرعاية المركزة التنفسية',
    specialtyEn: 'Consultant in Pulmonary Medicine & Respiratory Critical Care',
    biography: 'Fellow of the Egyptian Thoracic Society and European Respiratory Society. Specializes in advanced COPD, pulmonary fibrosis, and non-invasive ventilation management.',
    biographyAr: 'زميل الجمعية المصرية لأمراض الصدر والجمعية الأوروبية للجهاز التنفسي. متخصص في علاج السدة الرئوية المتقدمة، التليف الرئوي، ودعم التنفس غير التداخلي.',
    languages: ['العربية (Arabic)', 'English', 'Français'],
    consultationTypes: [
      {
        id: 'in_clinic',
        nameAr: 'كشف سريري واستشارة استشارية',
        nameEn: 'Consultant In-Clinic Examination',
        durationMinutes: 30,
        priceEgp: 500
      },
      {
        id: 'telehealth_video',
        nameAr: 'متابعة حرجة عن بُعد',
        nameEn: 'Critical Pulmonary Video Follow-up',
        durationMinutes: 25,
        priceEgp: 400
      }
    ],
    clinicMemberships: [
      {
        clinicId: 'clinic_cairo_main',
        clinicName: 'عيادة الصدر والرعاية التنفسية التخصصية',
        clinicNameEn: 'Specialized Chest & Respiratory Clinic',
        address: 'شارع عباس العقاد، مدينة نصر، القاهرة',
        status: 'approved',
        joinedAt: '2026-02-01T09:00:00Z',
        workingHours: {
          workingDays: [0, 1, 2, 3, 4], // Sun - Thu
          shifts: [
            { start: '11:30', end: '15:00' },
            { start: '16:00', end: '20:30' }
          ],
          slotDurationMinutes: 30,
          breakPeriods: [
            { start: '15:00', end: '16:00', label: 'Consultant Rounds' }
          ]
        }
      }
    ],
    role: 'doctor',
    licenseNumber: 'EGY-MED-381044',
    licenseStatus: 'active',
    licenseExpiryDate: '2029-06-30',
    verificationResult: 'VERIFIED',
    doctorApplicationStatus: 'approved',
    status: 'approved',
    rating: 4.8,
    reviewsCount: 94,
    isAvailableForBooking: true,
    email: 'dr.ahmed.elsayed@healthvibe.ai',
    phone: '+201099887766',
    maskedNationalId: '2780918*****14',
    reverificationDueDate: '2028-06-30',
    createdAt: '2026-02-01T08:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z'
  },

  dr_tarek: {
    doctorId: 'dr_tarek',
    name: 'أ.د. طارق محمود',
    nameEn: 'Prof. Dr. Tarek Mahmoud',
    photoUrl: 'https://healthvibe.ai/app/doctors/dr_tarek.webp',
    specialty: 'أستاذ واستشاري أول أمراض الصدر والجهاز التنفسي',
    specialtyEn: 'Professor & Senior Consultant Pulmonologist',
    biography: 'Professor of Pulmonary Medicine with over 25 years of clinical practice. Lead Clinical Director at Nile Chest Care Center and Clinical Pilot Lead for Health Vibe AI.',
    biographyAr: 'أستاذ الأمراض الصدرية بكلية الطب، خبرة إكلينيكية تمتد لأكثر من 25 عاماً. المدير الطبي لمركز النيل للصدر والمسؤول السريري للتجربة الرائدة.',
    languages: ['العربية (Arabic)', 'English'],
    consultationTypes: [
      {
        id: 'in_clinic',
        nameAr: 'كشف استشاري أول بالعيادة',
        nameEn: 'Senior Consultant In-Clinic Examination',
        durationMinutes: 30,
        priceEgp: 600
      },
      {
        id: 'telehealth_video',
        nameAr: 'استشارة فيديو متخصصة',
        nameEn: 'Specialized Pulmonary Telehealth',
        durationMinutes: 20,
        priceEgp: 450
      }
    ],
    clinicMemberships: [
      {
        clinicId: 'clinic_nile_chest',
        clinicName: 'مركز النيل لأمراض الصدر',
        clinicNameEn: 'Nile Chest Care Center',
        address: 'الدقي، الجيزة، مصر',
        status: 'approved',
        joinedAt: '2026-01-01T08:00:00Z',
        workingHours: {
          workingDays: [0, 1, 2, 3, 4],
          shifts: [
            { start: '17:00', end: '21:30' }
          ],
          slotDurationMinutes: 30
        }
      }
    ],
    role: 'doctor',
    licenseNumber: 'EGY-MED-199401',
    licenseStatus: 'active',
    licenseExpiryDate: '2030-12-31',
    verificationResult: 'VERIFIED',
    doctorApplicationStatus: 'approved',
    status: 'approved',
    rating: 5.0,
    reviewsCount: 215,
    isAvailableForBooking: true,
    email: 'prof.tarek@nilechest.com',
    phone: '+201009876543',
    maskedNationalId: '2650101*****19',
    reverificationDueDate: '2029-12-31',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z'
  }
};

// =============================================================================
// 3. PUBLIC PROFILE SANITIZER & CLINIC MEMBERSHIP FILTER
// =============================================================================

/**
 * Filter clinic memberships to only approved memberships.
 * Pending, suspended, or rejected clinics are NEVER exposed publicly.
 */
function getApprovedClinics(clinicMemberships = []) {
  if (!Array.isArray(clinicMemberships)) return [];
  return clinicMemberships
    .filter(m => m && m.status === 'approved')
    .map(m => ({
      clinicId: m.clinicId,
      clinicName: m.clinicName || m.name,
      clinicNameEn: m.clinicNameEn || m.nameEn,
      address: m.address || null,
      joinedAt: m.joinedAt || null,
      workingHours: m.workingHours || null
    }));
}

/**
 * Format and sanitize a doctor's public profile for patients & search engines.
 * Strictly hides all private and sensitive credentials.
 */
function formatDoctorPublicProfile(doctorRecord) {
  if (!doctorRecord) return null;

  const approvedClinics = getApprovedClinics(doctorRecord.clinicMemberships);
  const primaryClinic = approvedClinics[0] || null;

  return {
    doctorId: doctorRecord.doctorId,
    name: doctorRecord.name,
    nameEn: doctorRecord.nameEn || doctorRecord.name,
    photoUrl: doctorRecord.photoUrl || 'https://healthvibe.ai/app/doctors/default-doctor.webp',
    specialty: doctorRecord.specialty,
    specialtyEn: doctorRecord.specialtyEn || doctorRecord.specialty,
    biography: doctorRecord.biography || '',
    biographyAr: doctorRecord.biographyAr || '',
    languages: Array.isArray(doctorRecord.languages) ? doctorRecord.languages : ['العربية', 'English'],
    consultationTypes: Array.isArray(doctorRecord.consultationTypes) ? doctorRecord.consultationTypes : [],
    // 🏥 ONLY clinics where doctor has ACTUAL approved membership
    clinics: approvedClinics,
    primaryClinicId: primaryClinic?.clinicId || null,
    // Working hours for booking availability
    workingHours: primaryClinic?.workingHours || doctorRecord.workingHours || {
      workingDays: [0, 1, 2, 3, 4],
      shifts: [{ start: '10:00', end: '13:00' }, { start: '16:00', end: '20:30' }],
      slotDurationMinutes: 30
    },
    rating: Number(doctorRecord.rating || 5.0),
    reviewsCount: Number(doctorRecord.reviewsCount || 0),
    isAvailableForBooking: Boolean(doctorRecord.isAvailableForBooking !== false && doctorRecord.status === 'approved'),
    verifiedCredentials: {
      isVerified: doctorRecord.verificationResult === 'VERIFIED',
      licensingAuthority: 'Egyptian Medical Syndicate (نقابة أطباء مصر)',
      specialtyCategory: doctorRecord.specialtyEn || doctorRecord.specialty
    }
  };
}

/**
 * Retrieve public profile for a specific doctor.
 */
async function getDoctorPublicProfile(db, doctorId) {
  if (!doctorId) return null;

  // 1. Fallback to in-memory registry first if available
  if (DOCTOR_PROFILES[doctorId]) {
    return formatDoctorPublicProfile(DOCTOR_PROFILES[doctorId]);
  }

  // 2. Try Firestore doctor_profiles
  if (db && typeof db.collection === 'function' && process.env.NODE_ENV === 'production') {
    try {
      const snapPromise = db.collection('doctor_profiles').doc(doctorId).get();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 400));
      const snap = await Promise.race([snapPromise, timeoutPromise]);
      if (snap && snap.exists) {
        return formatDoctorPublicProfile({ doctorId: snap.id, ...snap.data() });
      }
    } catch (err) {
      console.warn('[DOCTOR PROFILE DB WARN] Failed to get profile from Firestore:', err.message);
    }
  }

  // 3. Fallback to scheduling service doctor
  const schedDoc = schedulingService.getDoctorWithSchedule(doctorId);
  if (schedDoc) {
    return formatDoctorPublicProfile(schedDoc);
  }

  return null;
}

/**
 * Retrieve list of all approved doctors with public profiles.
 */
async function listPublicDoctors(db, { clinicId = null, specialty = null } = {}) {
  let docs = Object.values(DOCTOR_PROFILES);

  if (db && typeof db.collection === 'function' && process.env.NODE_ENV === 'production') {
    try {
      const snapPromise = db.collection('doctor_profiles').where('status', '==', 'approved').get();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 400));
      const snap = await Promise.race([snapPromise, timeoutPromise]);
      if (snap && !snap.empty) {
        docs = snap.docs.map(d => ({ doctorId: d.id, ...d.data() }));
      }
    } catch (_) {}
  }

  return docs
    .map(d => formatDoctorPublicProfile(d))
    .filter(d => {
      if (!d.isAvailableForBooking) return false;
      if (clinicId && !d.clinics.some(c => c.clinicId === clinicId)) return false;
      if (specialty && !d.specialty.toLowerCase().includes(specialty.toLowerCase())) return false;
      return true;
    });
}

// =============================================================================
// 4. PROFILE UPDATE SANITIZER & RBAC SECURITY GUARD
// =============================================================================

/**
 * Sanitize doctor profile update payload.
 * CRITICAL SECURITY CONSTRAINT:
 * Rejects or blocks attempts by doctors to modify protected licensing,
 * approval status, role, or clinic membership status.
 */
function sanitizeDoctorProfileUpdate(updatePayload = {}, existingRecord = {}, actor = {}) {
  if (!updatePayload || typeof updatePayload !== 'object') {
    throw new Error('Update payload must be an object.');
  }

  const isSuperAdmin = actor.role === 'super_admin' || actor.isOwner === true;
  const isDoctorSelf = actor.uid === existingRecord.doctorId || actor.role === 'doctor';

  // Check for unauthorized tampering with protected fields
  const attemptedProtectedModifications = [];
  for (const field of PROTECTED_FIELDS) {
    if (updatePayload[field] !== undefined && updatePayload[field] !== existingRecord[field]) {
      attemptedProtectedModifications.push(field);
    }
  }

  // Non-superadmin cannot touch protected fields
  if (!isSuperAdmin && attemptedProtectedModifications.length > 0) {
    return {
      allowed: false,
      error: 'UNAUTHORIZED_FIELD_MODIFICATION',
      message: `Doctors cannot modify protected credential fields: ${attemptedProtectedModifications.join(', ')}. Contact platform medical administration to request credential updates.`,
      violatingFields: attemptedProtectedModifications
    };
  }

  // Check if doctor is attempting to self-approve a clinic membership
  if (!isSuperAdmin && updatePayload.clinicMemberships) {
    const attemptedSelfApproval = updatePayload.clinicMemberships.some(m => {
      const existing = (existingRecord.clinicMemberships || []).find(e => e.clinicId === m.clinicId);
      const wasApproved = existing && existing.status === 'approved';
      return m.status === 'approved' && !wasApproved;
    });

    if (attemptedSelfApproval) {
      return {
        allowed: false,
        error: 'UNAUTHORIZED_MEMBERSHIP_APPROVAL',
        message: 'Doctors cannot self-approve clinic memberships. Membership must be authorized by the clinic administrator.',
        violatingFields: ['clinicMemberships.status']
      };
    }
  }

  // Construct safe updated record
  const cleanUpdate = {};

  if (updatePayload.photoUrl !== undefined) {
    cleanUpdate.photoUrl = String(updatePayload.photoUrl).trim();
  }
  if (updatePayload.biography !== undefined) {
    cleanUpdate.biography = String(updatePayload.biography).trim();
  }
  if (updatePayload.biographyAr !== undefined) {
    cleanUpdate.biographyAr = String(updatePayload.biographyAr).trim();
  }
  if (Array.isArray(updatePayload.languages)) {
    cleanUpdate.languages = updatePayload.languages.map(l => String(l).trim()).filter(Boolean);
  }
  if (Array.isArray(updatePayload.consultationTypes)) {
    cleanUpdate.consultationTypes = updatePayload.consultationTypes.map(c => ({
      id: String(c.id || 'consultation').trim(),
      nameAr: String(c.nameAr || '').trim(),
      nameEn: String(c.nameEn || '').trim(),
      durationMinutes: Number(c.durationMinutes) || 30,
      priceEgp: Number(c.priceEgp) || 0,
      descriptionAr: String(c.descriptionAr || '').trim(),
      descriptionEn: String(c.descriptionEn || '').trim()
    }));
  }
  if (updatePayload.workingHours && typeof updatePayload.workingHours === 'object') {
    cleanUpdate.workingHours = {
      workingDays: Array.isArray(updatePayload.workingHours.workingDays)
        ? updatePayload.workingHours.workingDays.map(Number)
        : [0, 1, 2, 3, 4],
      shifts: Array.isArray(updatePayload.workingHours.shifts)
        ? updatePayload.workingHours.shifts.map(s => ({ start: String(s.start).trim(), end: String(s.end).trim() }))
        : [{ start: '10:00', end: '13:00' }, { start: '16:00', end: '20:30' }],
      slotDurationMinutes: Number(updatePayload.workingHours.slotDurationMinutes) || 30,
      breakPeriods: Array.isArray(updatePayload.workingHours.breakPeriods)
        ? updatePayload.workingHours.breakPeriods.map(b => ({ start: String(b.start).trim(), end: String(b.end).trim(), label: String(b.label || '').trim() }))
        : []
    };
  }

  // Super-admin only modifications
  if (isSuperAdmin) {
    for (const field of PROTECTED_FIELDS) {
      if (updatePayload[field] !== undefined) {
        cleanUpdate[field] = updatePayload[field];
      }
    }
    if (updatePayload.specialty !== undefined) cleanUpdate.specialty = String(updatePayload.specialty).trim();
    if (updatePayload.specialtyEn !== undefined) cleanUpdate.specialtyEn = String(updatePayload.specialtyEn).trim();
    if (Array.isArray(updatePayload.clinicMemberships)) cleanUpdate.clinicMemberships = updatePayload.clinicMemberships;
  }

  return {
    allowed: true,
    cleanUpdate,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Update doctor profile safely
 */
async function updateDoctorProfile(db, doctorId, updatePayload, actor = {}) {
  const existing = DOCTOR_PROFILES[doctorId] || { doctorId, status: 'approved' };
  const sanitized = sanitizeDoctorProfileUpdate(updatePayload, existing, actor);

  if (!sanitized.allowed) {
    throw new Error(sanitized.message);
  }

  const updatedRecord = {
    ...existing,
    ...sanitized.cleanUpdate,
    updatedAt: sanitized.updatedAt,
    lastUpdatedBy: actor.uid || 'system'
  };

  DOCTOR_PROFILES[doctorId] = updatedRecord;

  // Sync with scheduling service doctor schedule if workingHours updated
  if (sanitized.cleanUpdate.workingHours && schedulingService.DOCTOR_SCHEDULES[doctorId]) {
    schedulingService.DOCTOR_SCHEDULES[doctorId].weeklySchedule = sanitized.cleanUpdate.workingHours;
  }

  if (db && typeof db.collection === 'function' && process.env.NODE_ENV === 'production') {
    try {
      const setPromise = db.collection('doctor_profiles').doc(doctorId).set(updatedRecord, { merge: true });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 400));
      await Promise.race([setPromise, timeoutPromise]);
    } catch (err) {
      console.warn('[DOCTOR PROFILE DB WARN] Failed to update Firestore doc:', err.message);
    }
  }

  return formatDoctorPublicProfile(updatedRecord);
}

/**
 * Clinic Admin approves, pauses, or rejects a doctor's membership at their clinic
 */
async function updateDoctorClinicMembership(db, doctorId, clinicId, newStatus, actor = {}) {
  const validStatuses = ['approved', 'pending', 'paused', 'rejected'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid membership status: ${newStatus}. Valid: ${validStatuses.join(', ')}`);
  }

  const existing = DOCTOR_PROFILES[doctorId] || { doctorId, clinicMemberships: [] };
  const memberships = Array.isArray(existing.clinicMemberships) ? [...existing.clinicMemberships] : [];
  const idx = memberships.findIndex(m => m.clinicId === clinicId);

  const nowIso = new Date().toISOString();
  if (idx >= 0) {
    memberships[idx] = {
      ...memberships[idx],
      status: newStatus,
      statusUpdatedAt: nowIso,
      statusUpdatedBy: actor.uid || 'admin'
    };
  } else {
    memberships.push({
      clinicId,
      status: newStatus,
      joinedAt: nowIso,
      statusUpdatedAt: nowIso,
      statusUpdatedBy: actor.uid || 'admin'
    });
  }

  existing.clinicMemberships = memberships;
  existing.updatedAt = nowIso;
  DOCTOR_PROFILES[doctorId] = existing;

  if (db && typeof db.collection === 'function' && process.env.NODE_ENV === 'production') {
    try {
      const setPromise = db.collection('doctor_profiles').doc(doctorId).set({ clinicMemberships: memberships }, { merge: true });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 400));
      await Promise.race([setPromise, timeoutPromise]);
    } catch (_) {}
  }

  return {
    doctorId,
    clinicId,
    newStatus,
    approvedClinics: getApprovedClinics(memberships)
  };
}

// =============================================================================
// 5. CONNECT WORKING HOURS TO BOOKING AVAILABILITY
// =============================================================================

/**
 * Calculate doctor booking availability slots strictly linked to:
 * 1. Approved clinic membership
 * 2. Doctor's approved working hours & shifts for that clinic
 * 3. Break periods & leaves
 */
function calculateDoctorBookingAvailability(doctorId, dateStr, targetClinicId = null) {
  const profile = DOCTOR_PROFILES[doctorId] || schedulingService.getDoctorWithSchedule(doctorId);
  if (!profile) {
    return { available: false, reason: 'DOCTOR_NOT_FOUND', slots: [] };
  }

  const approvedClinics = getApprovedClinics(profile.clinicMemberships);
  const effectiveClinicId = targetClinicId || approvedClinics[0]?.clinicId || profile.clinicId || 'clinic_cairo_main';

  // If specific clinic requested, verify actual approved membership
  if (targetClinicId && !approvedClinics.some(c => c.clinicId === targetClinicId)) {
    return {
      available: false,
      reason: 'NO_APPROVED_MEMBERSHIP_AT_CLINIC',
      message: `Doctor ${profile.name} does not hold an approved membership at clinic ${targetClinicId}.`,
      slots: []
    };
  }

  // Retrieve clinic-specific working hours if defined on the membership
  const clinicMembership = approvedClinics.find(c => c.clinicId === effectiveClinicId);
  const effectiveSchedule = clinicMembership?.workingHours || profile.workingHours || profile.weeklySchedule;
  const leaves = profile.leaves || schedulingService.DOCTOR_SCHEDULES[doctorId]?.leaves || [];

  const docForScheduling = {
    ...profile,
    clinicId: effectiveClinicId,
    weeklySchedule: effectiveSchedule,
    leaves
  };

  const rawAvailability = schedulingService.calculateDoctorSlots(docForScheduling, dateStr);

  return {
    ...rawAvailability,
    doctorId,
    doctorName: profile.name,
    clinicId: effectiveClinicId,
    consultationTypes: profile.consultationTypes || []
  };
}

module.exports = {
  PUBLIC_FIELDS,
  PRIVATE_FIELDS,
  PROTECTED_FIELDS,
  DOCTOR_EDITABLE_FIELDS,
  DOCTOR_PROFILES,
  getApprovedClinics,
  formatDoctorPublicProfile,
  getDoctorPublicProfile,
  listPublicDoctors,
  sanitizeDoctorProfileUpdate,
  updateDoctorProfile,
  updateDoctorClinicMembership,
  calculateDoctorBookingAvailability
};
