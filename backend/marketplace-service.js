/**
 * Health Vibe AI - Clinical Marketplace, Specialty Discovery & Verification Policy Service
 * 
 * Provides:
 * 1. Standardized Clinical Specialties Discovery Catalog
 * 2. Doctor Credential Verification Standards & Policy Specification
 * 3. Clinical & Service Complaints Lifecycle & SLA Management
 */

// ── 1. CLINICAL SPECIALTIES CATALOG ──────────────────────────────────────────
const CLINICAL_SPECIALTIES = [
  {
    id: 'spec_pulmonology',
    slug: 'pulmonology',
    nameEn: 'Pulmonology & Respiratory Medicine',
    nameAr: 'أمراض الصدر والجهاز التنفسي',
    descriptionEn: 'Diagnosis and treatment of respiratory disorders including asthma, COPD, pneumonia, and sleep apnea.',
    descriptionAr: 'تشخيص وعلاج أمراض الجهاز التنفسي والانسداد الرئوي والربو والتهابات الرئة.',
    commonConditions: ['Asthma', 'COPD', 'Pneumonia', 'Bronchitis', 'Sleep Apnea', 'Interstitial Lung Disease'],
    telehealthEligible: true,
    requiresInPersonVitals: false,
    doctorCount: 14
  },
  {
    id: 'spec_allergy_immunology',
    slug: 'allergy-immunology',
    nameEn: 'Allergy & Clinical Immunology',
    nameAr: 'الحساسية والمناعة السريرية',
    descriptionEn: 'Comprehensive management of environmental and respiratory allergies, chronic cough, and allergic rhinitis.',
    descriptionAr: 'إدارة متخصصة لحساسية الصدر والجهاز التنفسي والسعال المزمن والتهاب الأنف التحسسي.',
    commonConditions: ['Allergic Asthma', 'Allergic Rhinitis', 'Chronic Cough', 'Drug Allergies', 'Immunodeficiency'],
    telehealthEligible: true,
    requiresInPersonVitals: false,
    doctorCount: 8
  },
  {
    id: 'spec_critical_care',
    slug: 'critical-care',
    nameEn: 'Critical Care & Intensive Respiratory Medicine',
    nameAr: 'العناية المركزة وطب الجهاز التنفسي الحرج',
    descriptionEn: 'Acute post-ICU pulmonary rehabilitation, invasive/non-invasive ventilation follow-ups, and severe acute distress.',
    descriptionAr: 'متابعة ما بعد العناية المركزة والتأهيل الرئوي للمرضى الذين يحتاجون رعاية تنفسية متقدمة.',
    commonConditions: ['ARDS Recovery', 'Post-Extubation Care', 'Severe Respiratory Failure', 'Oxygen Dependency'],
    telehealthEligible: true,
    requiresInPersonVitals: true,
    doctorCount: 5
  },
  {
    id: 'spec_ent',
    slug: 'ent-otolaryngology',
    nameEn: 'ENT & Upper Airway Medicine',
    nameAr: 'الأنف والأذن والحنجرة ومجرى الهواء العلوي',
    descriptionEn: 'Upper respiratory tract obstructions, chronic sinusitis, stridor, and vocal cord dysfunction.',
    descriptionAr: 'علاج انسداد مجرى الهواء العلوي والتهاب الجيوب الأنفية المزمن واضطرابات الأحبال الصوتية.',
    commonConditions: ['Chronic Sinusitis', 'Upper Airway Resistance', 'Vocal Cord Dysfunction', 'Stridor'],
    telehealthEligible: true,
    requiresInPersonVitals: false,
    doctorCount: 9
  },
  {
    id: 'spec_internal_medicine',
    slug: 'internal-medicine',
    nameEn: 'Internal Medicine & Cardiopulmonary Health',
    nameAr: 'الأمراض الباطنية وصحة القلب والرئتين',
    descriptionEn: 'Systemic diseases with respiratory manifestations, cardiopulmonary cross-assessment, and chronic comorbidities.',
    descriptionAr: 'تقييم الأمراض المزمنة ذات الأعراض التنفسية وتكامل وظائف القلب والرئتين.',
    commonConditions: ['Cardiopulmonary Dyspnea', 'Hypertensive Lung Disease', 'Diabetic Respiratory Complications'],
    telehealthEligible: true,
    requiresInPersonVitals: false,
    doctorCount: 12
  }
];

// ── 2. DOCTOR VERIFICATION POLICY SPECIFICATION ──────────────────────────────
const VERIFICATION_POLICY = {
  version: '2026.1',
  effectiveDate: '2026-01-01',
  minimumRequirements: [
    {
      code: 'REQ_LICENSE',
      title: 'Valid Medical License',
      description: 'Active and unencumbered medical practice license issued by a recognized governmental health ministry or medical licensing authority.',
      mandatory: true,
      verificationSource: 'National Healthcare Practitioner Registry'
    },
    {
      code: 'REQ_DEGREE',
      title: 'Accredited Medical Degree',
      description: 'Accredited MBBCh, MD, MBBS, or equivalent recognized qualification from an accredited medical university.',
      mandatory: true,
      verificationSource: 'Academic Credential Verification'
    },
    {
      code: 'REQ_BOARD',
      title: 'Specialty Board Certification',
      description: 'Postgraduate board certification or fellowship in Pulmonology, Internal Medicine, Allergy, or critical respiratory care.',
      mandatory: true,
      verificationSource: 'Specialty College / Board Registry'
    },
    {
      code: 'REQ_GOOD_STANDING',
      title: 'Certificate of Good Standing & Clean Disciplinary Record',
      description: 'No active suspensions, criminal sanctions, or malpractice findings in the past 36 months.',
      mandatory: true,
      verificationSource: 'Disciplinary Records Committee'
    },
    {
      code: 'REQ_AFFILIATION',
      title: 'Accredited Clinic or Hospital Affiliation',
      description: 'Verified clinical affiliation with a licensed medical facility or certified enterprise clinic.',
      mandatory: true,
      verificationSource: 'Institutional Partner Verification'
    }
  ],
  reviewSlaHours: 48,
  revocationTriggers: [
    'License expiration, revocation, or sanction by national health regulator',
    'Substantiated clinical malpractice or critical patient safety complaint',
    'Unauthorized sharing of partner credentials or clinical assessment data',
    'False representations in academic or clinical credentials'
  ]
};

// ── 3. COMPLAINTS & GRIEVANCES TAXONOMY ──────────────────────────────────────
const COMPLAINT_CATEGORIES = {
  CLINICAL_CARE: 'clinical_care',
  MISDIAGNOSIS_CONCERN: 'misdiagnosis_concern',
  DELAY_OR_CANCELLATION: 'delay_or_cancellation',
  UNPROFESSIONAL_CONDUCT: 'unprofessional_conduct',
  BILLING_DISPUTE: 'billing_dispute',
  TECHNICAL_ISSUE: 'technical_issue'
};

const COMPLAINT_SEVERITIES = {
  LOW: { id: 'low', slaHours: 168 },       // 7 days
  MEDIUM: { id: 'medium', slaHours: 72 },   // 3 days
  HIGH: { id: 'high', slaHours: 24 },       // 24 hours
  URGENT: { id: 'urgent', slaHours: 4 }     // 4 hours (clinical safety)
};

const COMPLAINT_STATUSES = {
  SUBMITTED: 'submitted',
  UNDER_INVESTIGATION: 'under_investigation',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed'
};

module.exports = {
  CLINICAL_SPECIALTIES,
  VERIFICATION_POLICY,
  COMPLAINT_CATEGORIES,
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES
};
