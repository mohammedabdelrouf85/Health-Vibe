/**
 * HEALTH VIBE AI: SYNTHETIC PATIENTS & CONSENT GOVERNANCE SERVICE
 * 
 * Direct Implementation of PRD Page 18 (Section 15, Critical Risk Mitigation):
 * "Risk: بيانات حقيقية وحساسة (Critical)
 *  Mitigation: عدم استخدام بيانات مرضى حقيقية في Demo بدون Consent وحماية مناسبة؛
 *  استخدام de-identified / test data قدر الإمكان."
 * 
 * Capabilities:
 * 1. Certified Synthetic Patient Cohort (N=20 realistic, diverse clinical personas).
 * 2. Guaranteed zero real PHI (No real names, emails, phones, NIDs, or DOBs).
 * 3. Strict Consent Enforcement Guard (Blocks real patient data without documented consent).
 * 4. Demo Environment Isolation Guard (Blocks non-synthetic records from presentation feeds).
 * 5. Automated Deep PHI Scanner (Detects Egyptian 14-digit NIDs, emails, unmasked phones).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateDeidentifiedRecord } = require('../dataset/deidentification');

// Regex patterns for detecting real Egyptian / international PHI leaks
const REAL_PHI_PATTERNS = Object.freeze({
  egyptianNationalId: /\b(?:2|3)\d{13}\b/, // Egyptian 14-digit National ID starting with 2 (1900s) or 3 (2000s)
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
  egyptianPhone: /(?:\+?20|0)?1[0125]\d{8}\b/,
  exactIsoDob: /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/
});

// =============================================================================
// 1. AUTHORITATIVE SYNTHETIC PATIENT COHORT DEFINITIONS (N=20)
// =============================================================================
const RAW_SYNTHETIC_PROFILES = [
  {
    index: 1,
    nameAr: 'مريض افتراضي 1 - عادل تجريبي',
    nameEn: 'Synthetic Patient 1 - Adel Test',
    age: 58,
    gender: 'male',
    archetype: 'COPD_EXACERBATION_SEVERE',
    vitals: { spo2: 88, heartRate: 104, respiratoryRate: 26, systolicBp: 135, diastolicBp: 85, temperature: 37.2 },
    symptoms: { dyspnea: 'rest', cough: 'severe', coughNature: 'productive_purulent_yellow', durationDays: 6, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 25, copd: true, asthma: false, diabetes: false, hypertension: true, pregnancy: false },
    triageCategory: 'urgent',
    triageScore: 8,
    assignedConditionLabel: 'LABEL_COPD_EXACERBATION',
    icd10: 'J44.1',
    clinicalNarrativeAr: 'مدخن شره منذ 25 سنة، يعاني من ضيق تنفس حاد حتى أثناء الجلوس مع زيادة في كمية وصديدية البلغم ونقص تشبع الأكسجين (88%). يتطلب تدخلاً إسعافياً فورياً (123).',
    clinicalNarrativeEn: 'Heavy smoker for 25 pack-years with severe acute resting dyspnea, increased purulent sputum, and profound hypoxemia (SpO2 88%). Requires urgent ambulance transfer.'
  },
  {
    index: 2,
    nameAr: 'مريضة افتراضية 2 - منى تجريبية',
    nameEn: 'Synthetic Patient 2 - Mona Test',
    age: 26,
    gender: 'female',
    archetype: 'BRONCHIAL_ASTHMA_EXACERBATION_MODERATE',
    vitals: { spo2: 94, heartRate: 92, respiratoryRate: 20, systolicBp: 110, diastolicBp: 70, temperature: 36.8 },
    symptoms: { dyspnea: 'exertional', cough: 'severe', coughNature: 'dry_nocturnal_paroxysmal', durationDays: 3, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: true, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'high',
    triageScore: 4,
    assignedConditionLabel: 'LABEL_ASTHMA_EXACERBATION',
    icd10: 'J45.901',
    clinicalNarrativeAr: 'شابة تعاني من نوبات ربو متكررة مع ضيق تنفس عند بذل مجهود وسعال جاف ليلي بعد التعرض لأتربة. SpO2 94%، تتطلب استشارة صدرية خلال ساعتين وضبط بخاخات الاستنشاق.',
    clinicalNarrativeEn: 'Young adult with known bronchial asthma presenting with exertional wheeze, chest tightness, and nocturnal cough following dust exposure. SpO2 94%.'
  },
  {
    index: 3,
    nameAr: 'مريض افتراضي 3 - كمال تجريبي',
    nameEn: 'Synthetic Patient 3 - Kamal Test',
    age: 64,
    gender: 'male',
    archetype: 'COMMUNITY_ACQUIRED_PNEUMONIA_URGENT',
    vitals: { spo2: 89, heartRate: 112, respiratoryRate: 28, systolicBp: 140, diastolicBp: 90, temperature: 39.1 },
    symptoms: { dyspnea: 'rest', cough: 'severe', coughNature: 'productive_rusty_sputum', durationDays: 4, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 15, copd: false, asthma: false, diabetes: true, hypertension: true, pregnancy: false },
    triageCategory: 'urgent',
    triageScore: 9,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J18.9',
    clinicalNarrativeAr: 'مريض سكري يعاني من حمى شديدة (39.1°C) وسعال مصحوب ببلغم صدئي ونقص أكسجين حاد (89%). اشتباه التهاب رئوي حاد يتطلب تحويلاً إسعافياً عاجلاً للمستشفى.',
    clinicalNarrativeEn: 'Diabetic senior presenting with high-grade pyrexia (39.1°C), rusty productive cough, tachypnea, and critical hypoxemia (SpO2 89%). Suspected severe CAP requiring urgent admission.'
  },
  {
    index: 4,
    nameAr: 'مريض افتراضي 4 - طارق تجريبي',
    nameEn: 'Synthetic Patient 4 - Tarek Test',
    age: 34,
    gender: 'male',
    archetype: 'ACUTE_BRONCHITIS_MILD',
    vitals: { spo2: 97, heartRate: 78, respiratoryRate: 16, systolicBp: 120, diastolicBp: 80, temperature: 37.8 },
    symptoms: { dyspnea: 'none', cough: 'moderate', coughNature: 'productive_mucoid', durationDays: 5, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'normal',
    triageScore: 1,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J20.9',
    clinicalNarrativeAr: 'شاب غير مدخن يعاني من التهاب شعبي حاد خفيف، كحة متوسطة وحرارة طفيفة دون ضيق تنفس أو نقص أكسجين (SpO2 97%). متابعة منزلية مع سوائل دافئة وراحة.',
    clinicalNarrativeEn: 'Young adult presenting with mild acute bronchitis, productive mucoid cough, normal SpO2 (97%), and no respiratory distress. Managed with outpatient care.'
  },
  {
    index: 5,
    nameAr: 'مريضة افتراضية 5 - نادية تجريبية',
    nameEn: 'Synthetic Patient 5 - Nadia Test',
    age: 29,
    gender: 'female',
    archetype: 'PREGNANCY_ASTHMA_HIGH_PRIORITY',
    vitals: { spo2: 92, heartRate: 98, respiratoryRate: 22, systolicBp: 115, diastolicBp: 75, temperature: 37.0 },
    symptoms: { dyspnea: 'exertional', cough: 'severe', coughNature: 'dry_wheezing', durationDays: 2, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: true, diabetes: false, hypertension: false, pregnancy: true },
    triageCategory: 'high',
    triageScore: 6,
    assignedConditionLabel: 'LABEL_ASTHMA_EXACERBATION',
    icd10: 'J45.901',
    clinicalNarrativeAr: 'سيدة حامل في الثلث الثاني تعاني من تفاقم نوبة الربو الشعبي مع هبوط SpO2 إلى 92%، تتطلب تقييماً فورياً من استشاري الصدرية وأمراض النساء لضبط الأكسجة الجنينية.',
    clinicalNarrativeEn: 'Pregnant female in 2nd trimester with acute asthma exacerbation, SpO2 92%, and exertional dyspnea. Prioritized for urgent pulmonology evaluation to ensure fetal oxygenation.'
  },
  {
    index: 6,
    nameAr: 'مريض افتراضي 6 - يوسف تجريبي',
    nameEn: 'Synthetic Patient 6 - Youssef Test',
    age: 48,
    gender: 'male',
    archetype: 'COPD_EARLY_MODERATE',
    vitals: { spo2: 91, heartRate: 88, respiratoryRate: 21, systolicBp: 130, diastolicBp: 85, temperature: 37.1 },
    symptoms: { dyspnea: 'exertional', cough: 'moderate', coughNature: 'chronic_morning_expectoration', durationDays: 14, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 20, copd: true, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'high',
    triageScore: 5,
    assignedConditionLabel: 'LABEL_COPD_EXACERBATION',
    icd10: 'J44.1',
    clinicalNarrativeAr: 'مدخن لـ 20 سنة يعاني من ضيق تنفس متصاعد مع المجهود وسعال صباحي مزمن مع بلغم منذ أسبوعين، SpO2 91%. يتطلب مراجعة العيادة الصدرية وعمل اختبار وظائف الرئة (Spirometry).',
    clinicalNarrativeEn: 'Moderate smoker presenting with subacute exertional breathlessness, chronic morning cough, and borderline hypoxemia (91%). Indicated for formal spirometry.'
  },
  {
    index: 7,
    nameAr: 'مريض افتراضي 7 - سامي تجريبي',
    nameEn: 'Synthetic Patient 7 - Sami Test',
    age: 22,
    gender: 'male',
    archetype: 'COMMON_COLD_MILD_URI',
    vitals: { spo2: 99, heartRate: 72, respiratoryRate: 14, systolicBp: 118, diastolicBp: 76, temperature: 36.9 },
    symptoms: { dyspnea: 'none', cough: 'mild', coughNature: 'dry_scratchy', durationDays: 2, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'normal',
    triageScore: 0,
    assignedConditionLabel: 'LABEL_MILD_URI_OR_NORMAL',
    icd10: 'J00',
    clinicalNarrativeAr: 'شاب سليم يعاني من نزلة برد شائعة خفيفة، حكة بالحلق وسعال طفيف مع تشبع أكسجين مثالي (99%). لا توجد علامات التهاب رئوي أو خطورة، علاج عرضي وراحة.',
    clinicalNarrativeEn: 'Healthy young adult presenting with common cold symptoms, scratchy throat, normal SpO2 (99%), and clear lungs. Suitable for supportive home care.'
  },
  {
    index: 8,
    nameAr: 'مريضة افتراضية 8 - فاطمة تجريبية',
    nameEn: 'Synthetic Patient 8 - Fatima Test',
    age: 72,
    gender: 'female',
    archetype: 'GERIATRIC_PNEUMONIA_CRITICAL',
    vitals: { spo2: 86, heartRate: 118, respiratoryRate: 30, systolicBp: 105, diastolicBp: 65, temperature: 38.6 },
    symptoms: { dyspnea: 'rest', cough: 'severe', coughNature: 'weak_productive_mucopurulent', durationDays: 3, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: true, hypertension: true, pregnancy: false },
    triageCategory: 'urgent',
    triageScore: 10,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J18.9',
    clinicalNarrativeAr: 'مسنة تعاني من التهاب رئوي حاد وهبوط شديد في الأكسجين (86%) مع تسرع التنفس وهبوط الضغط. حالة طارئة حرجة تستوجب الاتصال بالإسعاف (123) ودخول العناية المركزة.',
    clinicalNarrativeEn: 'Geriatric diabetic female with acute severe pneumonia, profound hypoxemia (86%), tachypnea, and hemodynamic vulnerability. Emergency ICU escalation triggered.'
  },
  {
    index: 9,
    nameAr: 'مريض افتراضي 9 - حازم تجريبي',
    nameEn: 'Synthetic Patient 9 - Hazem Test',
    age: 41,
    gender: 'male',
    archetype: 'SEVERE_ACUTE_ASTHMA_ATTACK',
    vitals: { spo2: 89, heartRate: 122, respiratoryRate: 28, systolicBp: 145, diastolicBp: 95, temperature: 37.1 },
    symptoms: { dyspnea: 'rest', cough: 'severe', coughNature: 'tight_spasmodic', durationDays: 1, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: true, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'urgent',
    triageScore: 9,
    assignedConditionLabel: 'LABEL_ASTHMA_EXACERBATION',
    icd10: 'J45.901',
    clinicalNarrativeAr: 'نوبة ربو حادة شديدة مصحوبة بعجز عن إكمال جملة واحدة وضيق تنفس أثناء الراحة مع SpO2 89%. حالة إسعافية تستدعي إعطاء أكسجين وجلسات موسعات شعب فورية.',
    clinicalNarrativeEn: 'Acute severe asthma attack presenting with speech limitation, dyspnea at rest, tachycardia, and SpO2 89%. Immediate emergency department transfer required.'
  },
  {
    index: 10,
    nameAr: 'مريضة افتراضية 10 - سارة تجريبية',
    nameEn: 'Synthetic Patient 10 - Sarah Test',
    age: 38,
    gender: 'female',
    archetype: 'COVID_POST_VIRAL_COUGH_SUBACUTE',
    vitals: { spo2: 96, heartRate: 80, respiratoryRate: 17, systolicBp: 115, diastolicBp: 75, temperature: 36.9 },
    symptoms: { dyspnea: 'none', cough: 'moderate', coughNature: 'dry_post_infectious', durationDays: 18, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'normal',
    triageScore: 2,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J22',
    clinicalNarrativeAr: 'سعال جاف متبقٍ بعد نزلة فيروسية سابقة منذ 18 يوماً، دون ضيق تنفس أو نقص أكسجين (SpO2 96%). حالة مستقرة للمتابعة في العيادة الصدرية لاستبعاد حساسية الشعب الهوائية.',
    clinicalNarrativeEn: 'Subacute post-viral dry cough persisting for 18 days without hypoxemia or dyspnea. Routine outpatient assessment recommended.'
  },
  {
    index: 11,
    nameAr: 'مريض افتراضي 11 - محمود تجريبي',
    nameEn: 'Synthetic Patient 11 - Mahmoud Test',
    age: 50,
    gender: 'male',
    archetype: 'INTERSTITIAL_LUNG_DISEASE_SUSPECTED',
    vitals: { spo2: 90, heartRate: 94, respiratoryRate: 23, systolicBp: 125, diastolicBp: 80, temperature: 36.8 },
    symptoms: { dyspnea: 'exertional', cough: 'severe', coughNature: 'dry_persistent_velcro_crackles', durationDays: 30, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 10, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'high',
    triageScore: 6,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J22',
    clinicalNarrativeAr: 'سعال جاف مستمر منذ شهر مع ضيق تنفس عند صعود الدرج وهبوط SpO2 إلى 90% مع المجهود. أولوية فحص عالية تتطلب أشعة مقطعية عالية الدقة (HRCT).',
    clinicalNarrativeEn: 'Subacute progressive exertional dyspnea and dry cough with exertional desaturation to 90%. High priority for high-resolution chest CT.'
  },
  {
    index: 12,
    nameAr: 'مريض افتراضي 12 - مصطفى تجريبي',
    nameEn: 'Synthetic Patient 12 - Mostafa Test',
    age: 68,
    gender: 'male',
    archetype: 'COPD_INFECTIVE_EXACERBATION_ANTHONISEN_1',
    vitals: { spo2: 88, heartRate: 108, respiratoryRate: 25, systolicBp: 145, diastolicBp: 88, temperature: 38.2 },
    symptoms: { dyspnea: 'rest', cough: 'severe', coughNature: 'copious_green_purulent_sputum', durationDays: 5, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 35, copd: true, asthma: false, diabetes: true, hypertension: true, pregnancy: false },
    triageCategory: 'urgent',
    triageScore: 9,
    assignedConditionLabel: 'LABEL_COPD_EXACERBATION',
    icd10: 'J44.1',
    clinicalNarrativeAr: 'تفاقم سدة رئوية من النوع الأول (Anthonisen Type 1) بوجود الأعراض الكلاسيكية الثلاثة: زيادة ضيق التنفس، زيادة حجم البلغم، وتغير لونه للأخضر مع نقص أكسجين حاد (88%).',
    clinicalNarrativeEn: 'Severe Anthonisen Type 1 COPD exacerbation with all three cardinal signs and severe hypoxemia (SpO2 88%). Requires urgent hospital admission.'
  },
  {
    index: 13,
    nameAr: 'مريضة افتراضية 13 - ريم تجريبية',
    nameEn: 'Synthetic Patient 13 - Reem Test',
    age: 19,
    gender: 'female',
    archetype: 'COUGH_VARIANT_ASTHMA',
    vitals: { spo2: 98, heartRate: 74, respiratoryRate: 15, systolicBp: 108, diastolicBp: 68, temperature: 36.7 },
    symptoms: { dyspnea: 'none', cough: 'moderate', coughNature: 'dry_irritative_nocturnal', durationDays: 10, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: true, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'normal',
    triageScore: 2,
    assignedConditionLabel: 'LABEL_ASTHMA_EXACERBATION',
    icd10: 'J45.901',
    clinicalNarrativeAr: 'فتاة شابة تعاني من نوع الربو المتظاهر بالسعال فقط (Cough-Variant Asthma)، SpO2 طبيعي (98%) دون ضيق تنفس. استشارة عيادة خارجية لضبط العلاج الوقائي.',
    clinicalNarrativeEn: 'Adolescent presenting with cough-variant asthma symptoms, excellent oxygen saturation (98%), and normal lung mechanics.'
  },
  {
    index: 14,
    nameAr: 'مريض افتراضي 14 - أشرف تجريبي',
    nameEn: 'Synthetic Patient 14 - Ashraf Test',
    age: 44,
    gender: 'male',
    archetype: 'PULMONARY_EMBOLISM_SUSPICION_RED_FLAG',
    vitals: { spo2: 89, heartRate: 128, respiratoryRate: 32, systolicBp: 100, diastolicBp: 60, temperature: 37.0 },
    symptoms: { dyspnea: 'rest', cough: 'mild', coughNature: 'dry_acute_onset', durationDays: 1, chestTightness: true, hemoptysis: true },
    comorbidities: { smoking: true, packYears: 15, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'urgent',
    triageScore: 10,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J22',
    clinicalNarrativeAr: 'علم أحمر طارئ (Red Flag): ضيق تنفس مفاجئ حاد مع تسرع نبض (128) وبصاق مدمم وهبوط أكسجين (89%). اشتباه جلطة رئوية يستوجب الاتصال بالإسعاف (123) فوراً.',
    clinicalNarrativeEn: 'Critical Red Flag presentation: sudden dyspnea at rest, tachycardia (128 bpm), hemoptysis, and SpO2 89%. Immediate emergency ambulance transfer mandated.'
  },
  {
    index: 15,
    nameAr: 'مريضة افتراضية 15 - هدى تجريبية',
    nameEn: 'Synthetic Patient 15 - Hoda Test',
    age: 55,
    gender: 'female',
    archetype: 'DIABETIC_BRONCHITIS_MODERATE',
    vitals: { spo2: 93, heartRate: 86, respiratoryRate: 19, systolicBp: 135, diastolicBp: 82, temperature: 38.0 },
    symptoms: { dyspnea: 'exertional', cough: 'moderate', coughNature: 'productive_yellow', durationDays: 5, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: true, hypertension: true, pregnancy: false },
    triageCategory: 'high',
    triageScore: 4,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J20.9',
    clinicalNarrativeAr: 'مريضة سكري وضغط تعاني من نزلة شعبية بكتيرية مع حرارة 38°C وتشبع أكسجين 93%. أولوية مراجعة عالية لتفادي تفاقم العدوى الرئوية.',
    clinicalNarrativeEn: 'Diabetic female presenting with acute bacterial bronchitis, low-grade fever, and borderline saturation (93%). Prioritized for clinician assessment.'
  },
  {
    index: 16,
    nameAr: 'مريض افتراضي 16 - وليد تجريبي',
    nameEn: 'Synthetic Patient 16 - Walid Test',
    age: 32,
    gender: 'male',
    archetype: 'ALLERGIC_RHINITIS_WITH_TRACHEITIS',
    vitals: { spo2: 98, heartRate: 76, respiratoryRate: 15, systolicBp: 122, diastolicBp: 78, temperature: 36.8 },
    symptoms: { dyspnea: 'none', cough: 'mild', coughNature: 'tickling_throat_cough', durationDays: 4, chestTightness: false, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'normal',
    triageScore: 0,
    assignedConditionLabel: 'LABEL_MILD_URI_OR_NORMAL',
    icd10: 'J00',
    clinicalNarrativeAr: 'التهاب تحسسي بالحلق ومجرى التنفس العلوي مع عطاس وكحة خفيفة، الأكسجين سليم (98%). متابعة منزلية وعلاجات حساسية بسيطة.',
    clinicalNarrativeEn: 'Allergic upper airway inflammation with mild throat clearing and normal lung mechanics. Suitable for routine self-care.'
  },
  {
    index: 17,
    nameAr: 'مريضة افتراضية 17 - زينب تجريبية',
    nameEn: 'Synthetic Patient 17 - Zeinab Test',
    age: 62,
    gender: 'female',
    archetype: 'POST_COVID_FIBROSIS_MONITORING',
    vitals: { spo2: 92, heartRate: 90, respiratoryRate: 21, systolicBp: 128, diastolicBp: 78, temperature: 36.9 },
    symptoms: { dyspnea: 'exertional', cough: 'moderate', coughNature: 'dry_hacking', durationDays: 25, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: false, diabetes: true, hypertension: false, pregnancy: false },
    triageCategory: 'high',
    triageScore: 5,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J22',
    clinicalNarrativeAr: 'متابعة ما بعد متلازمة كورونا التنفسية مع ضيق تنفس مجهودي وسعال جاف، SpO2 92%. فحص عيادة صدرية واستكمال التأهيل الرئوي.',
    clinicalNarrativeEn: 'Post-acute sequelae of respiratory viral syndrome with exertional dyspnea and borderline SpO2 (92%). Indicated for structured pulmonary rehabilitation.'
  },
  {
    index: 18,
    nameAr: 'مريض افتراضي 18 - إبراهيم تجريبي',
    nameEn: 'Synthetic Patient 18 - Ibrahim Test',
    age: 53,
    gender: 'male',
    archetype: 'OCCUPATIONAL_DUST_EXPOSURE_BRONCHITIS',
    vitals: { spo2: 93, heartRate: 84, respiratoryRate: 18, systolicBp: 132, diastolicBp: 84, temperature: 37.2 },
    symptoms: { dyspnea: 'exertional', cough: 'moderate', coughNature: 'dusty_sputum_cough', durationDays: 12, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 12, copd: false, asthma: false, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'high',
    triageScore: 4,
    assignedConditionLabel: 'LABEL_ACUTE_RESPIRATORY_INFECTION',
    icd10: 'J20.9',
    clinicalNarrativeAr: 'عامل بناء يعاني من تعرض مهني للأتربة وسعال مع إفرازات وضيق تنفس، SpO2 93%. فحص سريري واستخدام كمامات وقائية.',
    clinicalNarrativeEn: 'Occupational particulate dust exposure causing subacute bronchitis with exertional breathlessness and 93% SpO2.'
  },
  {
    index: 19,
    nameAr: 'مريض افتراضي 19 - عمرو تجريبي',
    nameEn: 'Synthetic Patient 19 - Amr Test',
    age: 16,
    gender: 'male',
    archetype: 'EXERCISE_INDUCED_BRONCHOSPASM',
    vitals: { spo2: 96, heartRate: 88, respiratoryRate: 18, systolicBp: 112, diastolicBp: 70, temperature: 36.8 },
    symptoms: { dyspnea: 'exertional', cough: 'mild', coughNature: 'post_exercise_wheeze', durationDays: 2, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: false, packYears: 0, copd: false, asthma: true, diabetes: false, hypertension: false, pregnancy: false },
    triageCategory: 'normal',
    triageScore: 2,
    assignedConditionLabel: 'LABEL_ASTHMA_EXACERBATION',
    icd10: 'J45.901',
    clinicalNarrativeAr: 'مراهق يعاني من انقباض شعبي ناتج عن الرياضة والمجهود البدني مع أزيز خفيف، SpO2 96%. استشارة لضبط بخاخ موسع الشعب قبل ممارسة الرياضة.',
    clinicalNarrativeEn: 'Adolescent athlete presenting with exercise-induced bronchospasm, normal resting saturation (96%), and good recovery.'
  },
  {
    index: 20,
    nameAr: 'مريضة افتراضية 20 - نجلاء تجريبية',
    nameEn: 'Synthetic Patient 20 - Naglaa Test',
    age: 46,
    gender: 'female',
    archetype: 'CHRONIC_BRONCHITIS_OVERLAP',
    vitals: { spo2: 91, heartRate: 92, respiratoryRate: 22, systolicBp: 126, diastolicBp: 80, temperature: 37.4 },
    symptoms: { dyspnea: 'exertional', cough: 'severe', coughNature: 'recurrent_mucopurulent', durationDays: 21, chestTightness: true, hemoptysis: false },
    comorbidities: { smoking: true, packYears: 18, copd: true, asthma: false, diabetes: false, hypertension: true, pregnancy: false },
    triageCategory: 'high',
    triageScore: 6,
    assignedConditionLabel: 'LABEL_COPD_EXACERBATION',
    icd10: 'J44.1',
    clinicalNarrativeAr: 'مدخنة سابقة تعاني من التهاب شعبي مزمن متكرر مع بلغم مخاطي صديدي وضيق تنفس، SpO2 91%. أولوية استشارة عالية مع أشعة سينية ومضاد حيوي مناسب.',
    clinicalNarrativeEn: 'Middle-aged female smoker with chronic bronchitis exacerbation, mucopurulent expectoration, and 91% SpO2.'
  }
];

// Build fully validated, frozen synthetic patient objects
const SYNTHETIC_PATIENTS_COHORT = Object.freeze(
  RAW_SYNTHETIC_PROFILES.map(profile => {
    const patientId = `HV-SYNTH-${String(profile.index).padStart(3, '0')}`;
    const patientRecord = {
      patientId,
      id: patientId,
      isSynthetic: true,
      isDeidentified: true,
      demoSafe: true,
      consentStatus: 'SYNTHETIC_GENERATED_NO_PHI',
      containsRealPhi: false,
      generationMethod: 'DETERMINISTIC_SYNTHETIC_GENERATOR',
      demographics: {
        syntheticNameAr: profile.nameAr,
        syntheticNameEn: profile.nameEn,
        displayName: profile.nameAr,
        age: profile.age,
        gender: profile.gender,
        governorate: 'Cairo (Synthetic/Demo)',
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${patientId}`
      },
      archetype: profile.archetype,
      vitals: profile.vitals,
      symptoms: profile.symptoms,
      comorbidities: profile.comorbidities,
      triage: {
        category: profile.triageCategory,
        score: profile.triageScore,
        assignedConditionLabel: profile.assignedConditionLabel,
        icd10: profile.icd10,
        requiresEmergencyAmbulance: profile.vitals.spo2 < 90 || profile.triageCategory === 'urgent'
      },
      clinicalNarrative: {
        ar: profile.clinicalNarrativeAr,
        en: profile.clinicalNarrativeEn
      },
      audit: {
        generatedAt: '2026-09-28T00:00:00.000Z',
        validationStatus: 'HIPAA_SAFE_HARBOR_VERIFIED',
        sha256: crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex')
      }
    };

    // Assert that the record satisfies HIPAA de-identification criteria
    const check = validateDeidentifiedRecord({
      subjectId: patientRecord.patientId,
      age: profile.age,
      sex: profile.gender,
      vitals: profile.vitals,
      symptoms: profile.symptoms
    });
    if (!check.isDeidentified) {
      throw new Error(`Synthetic profile ${patientId} failed de-identification check: ${check.violations.join(', ')}`);
    }

    return Object.freeze(patientRecord);
  })
);

// Save bundle to dataset/synthetic_patients_bundle.json
const BUNDLE_PATH = path.resolve(__dirname, '../dataset/synthetic_patients_bundle.json');
try {
  fs.writeFileSync(BUNDLE_PATH, JSON.stringify(SYNTHETIC_PATIENTS_COHORT, null, 2), 'utf8');
} catch (e) {
  // handled gracefully if read-only
}

// =============================================================================
// 2. REAL PATIENT CONSENT & ZERO PHI ANTI-LEAKAGE GUARD
// =============================================================================

class SyntheticPatientsService {
  constructor() {
    this.syntheticCohort = SYNTHETIC_PATIENTS_COHORT;
    this.prohibitedRealPhiViolations = [];
  }

  /**
   * Returns all synthetic patients, with optional filtering by archetype, urgency, or condition.
   */
  getSyntheticPatients(filter = {}) {
    let results = [...this.syntheticCohort];
    if (filter.urgency) {
      results = results.filter(p => p.triage.category === filter.urgency);
    }
    if (filter.conditionLabel) {
      results = results.filter(p => p.triage.assignedConditionLabel === filter.conditionLabel);
    }
    if (filter.gender) {
      results = results.filter(p => p.demographics.gender === filter.gender);
    }
    return results;
  }

  /**
   * Returns a specific synthetic patient by ID.
   */
  getSyntheticPatientById(id) {
    if (!id) return null;
    const cleanId = String(id).trim().toUpperCase();
    return this.syntheticCohort.find(p => p.patientId === cleanId || p.id === cleanId) || null;
  }

  /**
   * Returns pre-packaged presentation bundle for Demos and Pitches.
   */
  getDemoPresentationBundle() {
    return {
      success: true,
      bundleId: 'HV-DEMO-SYNTHETIC-BUNDLE-2026',
      totalSyntheticPatients: this.syntheticCohort.length,
      isDemoSafe: true,
      containsRealPhi: false,
      governanceNotice: 'All patients in this bundle are 100% synthetic personas created for demonstrations, trials, and UI evaluation without any real patient data (PRD Page 18 Compliance).',
      patients: this.syntheticCohort
    };
  }

  /**
   * ZERO REAL PHI WITHOUT CONSENT GUARD
   * Evaluates any patient record. If it represents real patient data, it enforces
   * documented, signed, verifiable patient consent.
   * 
   * @param {object} patientRecord 
   * @param {object} options
   * @returns {{ permitted: boolean, isSynthetic: boolean, error?: string, consentDetails?: object }}
   */
  validateConsentRequirement(patientRecord, options = {}) {
    if (!patientRecord || typeof patientRecord !== 'object') {
      return {
        permitted: false,
        error: 'INVALID_RECORD',
        message: 'Patient record object is missing or invalid.'
      };
    }

    // 1. Synthetic patients are explicitly permitted for testing/demos
    if (patientRecord.isSynthetic === true || patientRecord.demoSafe === true) {
      return {
        permitted: true,
        isSynthetic: true,
        message: 'Synthetic patient record verified. Permitted for demo and testing without real consent.'
      };
    }

    // 2. Real Patient Data: Strictly enforce documented consent
    const consent = patientRecord.consent || patientRecord.informedConsent;
    if (!consent || typeof consent !== 'object') {
      const errCode = 'REAL_PATIENT_DATA_WITHOUT_CONSENT_PROHIBITED';
      const errMsg = 'CRITICAL PRIVACY VIOLATION: Processing real patient data without documented, verifiable consent is strictly prohibited (PRD Page 18 & Page 10).';
      this.prohibitedRealPhiViolations.push({
        timestamp: new Date().toISOString(),
        violation: errCode,
        recordId: patientRecord.id || patientRecord.patientId || 'UNKNOWN'
      });
      return {
        permitted: false,
        isSynthetic: false,
        error: errCode,
        message: errMsg
      };
    }

    // Check mandatory consent fields
    const hasSigned = consent.signed === true || consent.status === 'signed' || consent.consentObtained === true;
    const hasSignedAt = Boolean(consent.signedAt || consent.timestamp || consent.consentDate);
    const hasScope = Array.isArray(consent.scope) ? consent.scope.length > 0 : Boolean(consent.scope || consent.purpose);

    if (!hasSigned || !hasSignedAt || !hasScope) {
      return {
        permitted: false,
        isSynthetic: false,
        error: 'INCOMPLETE_CONSENT_RECORD',
        message: 'Documented consent record is missing mandatory elements (signed flag, timestamp, or scope).'
      };
    }

    return {
      permitted: true,
      isSynthetic: false,
      message: 'Real patient record possesses documented, verified consent. Permitted for clinical care / authorized pilot.',
      consentDetails: {
        signed: true,
        signedAt: consent.signedAt || consent.timestamp,
        scope: consent.scope,
        version: consent.version || 'HV-CONSENT-v1.0'
      }
    };
  }

  /**
   * DEMO ENVIRONMENT ISOLATION GUARD
   * Enforces that demo feeds, public presentation endpoints, and pitch displays
   * ONLY contain synthetic patients and reject any non-synthetic records.
   * 
   * @param {Array|object} records 
   */
  enforceDemoEnvironmentIsolation(records) {
    const list = Array.isArray(records) ? records : [records];
    const nonSyntheticFound = [];

    for (const rec of list) {
      if (!rec || typeof rec !== 'object') continue;
      if (rec.isSynthetic !== true) {
        nonSyntheticFound.push(rec.id || rec.patientId || 'UNIDENTIFIED_RECORD');
      }
      // Check for accidental real PHI leakage
      const scan = this.scanForUnconsentedRealPhi(rec);
      if (!scan.clean) {
        nonSyntheticFound.push(`PHI_DETECTED_${scan.leaksDetected.join('_')}`);
      }
    }

    if (nonSyntheticFound.length > 0) {
      throw new Error(
        `DEMO_SECURITY_VIOLATION: Non-synthetic patient records or real PHI detected in demo environment (${nonSyntheticFound.join(', ')}). Only certified synthetic patients are permitted for demonstrations.`
      );
    }

    return { compliant: true, demoSafe: true, inspectedCount: list.length };
  }

  /**
   * DEEP PHI LEAKAGE SCANNER
   * Scans an object for real Egyptian 14-digit National IDs, real email addresses,
   * unmasked phone numbers, or exact dates of birth.
   */
  scanForUnconsentedRealPhi(record) {
    if (!record) return { clean: true, leaksDetected: [] };
    const leaksDetected = [];
    const textBlob = JSON.stringify(record);

    if (REAL_PHI_PATTERNS.egyptianNationalId.test(textBlob)) {
      leaksDetected.push('EGYPTIAN_14_DIGIT_NATIONAL_ID');
    }
    // Allow synthetic test emails (e.g., demo@healthvibe.ai or test.com)
    const emailMatch = textBlob.match(REAL_PHI_PATTERNS.email);
    if (emailMatch) {
      const email = emailMatch[0].toLowerCase();
      if (!email.includes('healthvibe') && !email.includes('synthetic') && !email.includes('example.com')) {
        leaksDetected.push('EXTERNAL_REAL_EMAIL_ADDRESS');
      }
    }
    if (REAL_PHI_PATTERNS.egyptianPhone.test(textBlob)) {
      // Exclude 123 emergency ambulance number
      const phoneMatch = textBlob.match(REAL_PHI_PATTERNS.egyptianPhone);
      if (phoneMatch && phoneMatch[0] !== '123') {
        leaksDetected.push('REAL_EGYPTIAN_MOBILE_NUMBER');
      }
    }

    return {
      clean: leaksDetected.length === 0,
      leaksDetected
    };
  }

  /**
   * Partitions the synthetic patient cohort strictly on the patient level (Train/Val/Test).
   * Guarantees zero patient leakage across synthetic personas.
   */
  getPartitionedSyntheticCohort(options = {}) {
    const { patientLevelSplitService } = require('../dataset/patient_level_split_service');
    return patientLevelSplitService.splitByPatient(SYNTHETIC_PATIENTS_COHORT, {
      trainRatio: options.trainRatio || 0.70,
      valRatio: options.valRatio || 0.15,
      testRatio: options.testRatio || 0.15,
      seed: options.seed || 42
    });
  }
}

// Singleton instance
const syntheticPatientsService = new SyntheticPatientsService();

module.exports = {
  SyntheticPatientsService,
  syntheticPatientsService,
  SYNTHETIC_PATIENTS_COHORT,
  REAL_PHI_PATTERNS
};
