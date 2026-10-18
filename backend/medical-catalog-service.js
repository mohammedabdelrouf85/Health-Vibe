/**
 * Health Vibe AI - Medical Catalog Service
 * Reference Medical & Clinical Rules Layer (diseases_catalog, symptoms_catalog, clinical_rules)
 * 
 * Implements PRD Section 1.2, 7 & 19 and Architectural Rule:
 * Strictly separates reference medical knowledge from live operational patient records.
 */

const crypto = require('crypto');

// =============================================================================
// 1. REFERENCE DISEASES CATALOG (diseases_catalog)
// =============================================================================
const REFERENCE_DISEASES_CATALOG = [
  {
    diseaseId: 'DIS-RESP-001',
    code: 'J20.9',
    icd10Codes: ['J20.9', 'J22', 'J18.9'],
    nameEn: 'Acute Lower Respiratory Infection (LRTI / Acute Bronchitis / Suspected Pneumonia)',
    nameAr: 'عدوى الجهاز التنفسي السفلي الحادة (التهاب الشعب الهوائية الحاد / اشتباه الالتهاب الرئوي)',
    module: 'respiratory',
    associatedSymptoms: [
      { symptomKey: 'coughSeverity', weight: 0.35, severity: 'moderate-to-severe', isCardinal: true },
      { symptomKey: 'fever', weight: 0.25, severity: 'mild-to-high', isCardinal: true },
      { symptomKey: 'symptomDurationDays', weight: 0.20, severity: '<= 14 days', isCardinal: false },
      { symptomKey: 'shortnessOfBreathScale', weight: 0.20, severity: 'variable', isCardinal: false }
    ],
    redFlags: [
      { key: 'severe_hypoxemia', threshold: 'SpO2 < 90%', descriptionEn: 'Severe hypoxemia requiring immediate oxygen & ER dispatch', descriptionAr: 'نقص حاد بالأكسجين يستلزم نقلاً فورياً للطوارئ', emergencyTier: 'urgent' },
      { key: 'tachypnea', threshold: 'RR > 30 breaths/min', descriptionEn: 'Severe respiratory distress with tachypnea', descriptionAr: 'تسارع حاد في التنفس', emergencyTier: 'urgent' }
    ],
    spo2Thresholds: {
      emergency: '< 90%',
      cautionary: '90-92%',
      normal: '>= 93%'
    },
    recommendedLabs: [
      'Chest X-Ray (Posteroanterior & Lateral)',
      'Complete Blood Count (CBC with differential)',
      'C-Reactive Protein (CRP) / Procalcitonin',
      'Pulse Oximetry continuous monitoring',
      'Sputum Gram stain & culture (if productive cough)'
    ],
    clinicalGuidelinesRef: 'NICE LRTI Guidelines 2026 / WHO Guidelines for Community-Acquired Pneumonia',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  {
    diseaseId: 'DIS-RESP-002',
    code: 'J45.901',
    icd10Codes: ['J45.901', 'J45.41'],
    nameEn: 'Bronchial Asthma Exacerbation',
    nameAr: 'تفاقم / نوبة الربو الشعبي الحادة',
    module: 'respiratory',
    associatedSymptoms: [
      { symptomKey: 'shortnessOfBreathScale', weight: 0.35, severity: 'severe', isCardinal: true },
      { symptomKey: 'wheezing', weight: 0.30, severity: 'prominent expiratory wheeze', isCardinal: true },
      { symptomKey: 'asthmaCopdHistory', weight: 0.25, severity: 'known asthma history', isCardinal: true },
      { symptomKey: 'coughSeverity', weight: 0.10, severity: 'spasmodic dry cough', isCardinal: false }
    ],
    redFlags: [
      { key: 'silent_chest', threshold: 'Severe dyspnea with absent wheezing', descriptionEn: 'Impending respiratory arrest (silent chest)', descriptionAr: 'غياب أصوات التنفس لانسداد حرج بالقصبات (Silent Chest)', emergencyTier: 'urgent' },
      { key: 'inability_to_speak', threshold: 'Inability to complete sentences in one breath', descriptionEn: 'Acute severe asthma attack', descriptionAr: 'عجز عن إكمال جملة في نفس واحد', emergencyTier: 'urgent' }
    ],
    spo2Thresholds: {
      emergency: '< 90%',
      cautionary: '90-92%',
      normal: '>= 93%'
    },
    recommendedLabs: [
      'Peak Expiratory Flow (PEF) / Spirometry',
      'Pulse Oximetry continuous monitoring',
      'Arterial Blood Gas (ABG if SpO2 < 92%)',
      'Serum Electrolytes (Potassium monitoring post-SABA)'
    ],
    clinicalGuidelinesRef: 'GINA 2026 (Global Initiative for Asthma)',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  {
    diseaseId: 'DIS-RESP-003',
    code: 'J44.1',
    icd10Codes: ['J44.1', 'J44.0'],
    nameEn: 'Chronic Obstructive Pulmonary Disease (COPD) Exacerbation',
    nameAr: 'تفاقم مرض السدة الرئوية المزمنة (COPD Exacerbation)',
    module: 'respiratory',
    associatedSymptoms: [
      { symptomKey: 'shortnessOfBreathScale', weight: 0.35, severity: 'baseline worsening', isCardinal: true },
      { symptomKey: 'coughSeverity', weight: 0.25, severity: 'chronic productive cough', isCardinal: true },
      { symptomKey: 'sputumProduction', weight: 0.20, severity: 'increased volume or purulence', isCardinal: true },
      { symptomKey: 'smokingStatus', weight: 0.20, severity: 'long-term smoking history', isCardinal: false }
    ],
    redFlags: [
      { key: 'hypercapnic_coma', threshold: 'SpO2 < 88% with drowsiness', descriptionEn: 'Risk of acute hypercapnic respiratory failure', descriptionAr: 'اشتباه فشل تنفسي مع احتباس ثاني أكسيد الكربون', emergencyTier: 'urgent' },
      { key: 'peripheral_edema', threshold: 'New ankle swelling', descriptionEn: 'Cor pulmonale decompensation', descriptionAr: 'علامات فشل الجانب الأيمن للقلب (Cor Pulmonale)', emergencyTier: 'urgent' }
    ],
    spo2Thresholds: {
      emergency: '< 88%',
      cautionary: '88-92% (Target 88-92% in chronic CO2 retainers)',
      normal: '>= 93%'
    },
    recommendedLabs: [
      'Arterial Blood Gas (ABG to check PaCO2 & pH)',
      'Chest Radiograph (PA view)',
      'Electrocardiogram (ECG - evaluate right ventricular strain)',
      'Complete Blood Count (CBC - secondary polycythemia or leukocytosis)'
    ],
    clinicalGuidelinesRef: 'GOLD 2026 (Global Initiative for Chronic Obstructive Lung Disease)',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  {
    diseaseId: 'DIS-RESP-004',
    code: 'J00',
    icd10Codes: ['J00', 'J06.9'],
    nameEn: 'Mild Upper Respiratory Tract Infection (Common Cold / Viral URI)',
    nameAr: 'عدوى الجهاز التنفسي العلوي الخفيفة (النزلة البردية / احتقان الحلق الفيروسي)',
    module: 'respiratory',
    associatedSymptoms: [
      { symptomKey: 'coughSeverity', weight: 0.30, severity: 'mild ticklish cough', isCardinal: false },
      { symptomKey: 'shortnessOfBreathScale', weight: 0.10, severity: 'absent (scale 0-1)', isCardinal: false },
      { symptomKey: 'symptomDurationDays', weight: 0.30, severity: '2-7 days', isCardinal: false }
    ],
    redFlags: [],
    spo2Thresholds: {
      emergency: '< 90%',
      cautionary: '90-92%',
      normal: '>= 95%'
    },
    recommendedLabs: [
      'Conservative outpatient monitoring',
      'Optional Rapid Influenza / SARS-CoV-2 Antigen (if epidemiological risk)'
    ],
    clinicalGuidelinesRef: 'CDC / WHO Viral URI Clinical Management',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  // Chronic Disease Expansion Modules
  {
    diseaseId: 'DIS-CHRON-001',
    code: 'I10',
    icd10Codes: ['I10', 'I15.9'],
    nameEn: 'Essential Hypertension',
    nameAr: 'ارتفاع ضغط الدم الأساسي المزمن',
    module: 'cardiovascular',
    associatedSymptoms: [
      { symptomKey: 'systolicBP', weight: 0.50, severity: '>= 140 mmHg', isCardinal: true },
      { symptomKey: 'diastolicBP', weight: 0.30, severity: '>= 90 mmHg', isCardinal: true },
      { symptomKey: 'headache', weight: 0.20, severity: 'occipital morning headache', isCardinal: false }
    ],
    redFlags: [
      { key: 'hypertensive_crisis', threshold: 'BP > 180/120 with chest pain or neurological deficits', descriptionEn: 'Hypertensive emergency with end-organ damage', descriptionAr: 'أزمة فرط ضغط الدم الحادة مع اشتباه تضرر أعضاء حيوية', emergencyTier: 'urgent' }
    ],
    spo2Thresholds: { normal: '>= 95%' },
    recommendedLabs: ['Lipid Profile', 'Serum Creatinine & eGFR', 'Urinary Albumin-to-Creatinine Ratio', '12-lead ECG'],
    clinicalGuidelinesRef: 'ACC/AHA 2026 Hypertension Guidelines / ESC 2026',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  {
    diseaseId: 'DIS-CHRON-002',
    code: 'E11',
    icd10Codes: ['E11.9', 'E11.65'],
    nameEn: 'Type 2 Diabetes Mellitus',
    nameAr: 'مرض السكري من النوع الثاني',
    module: 'endocrinology',
    associatedSymptoms: [
      { symptomKey: 'fastingGlucose', weight: 0.40, severity: '>= 126 mg/dL', isCardinal: true },
      { symptomKey: 'hba1c', weight: 0.40, severity: '>= 6.5%', isCardinal: true },
      { symptomKey: 'polyuria_polydipsia', weight: 0.20, severity: 'increased thirst and urination', isCardinal: false }
    ],
    redFlags: [
      { key: 'diabetic_ketoacidosis_or_hhs', threshold: 'Glucose > 300 mg/dL with confusion, Kussmaul breathing or ketones', descriptionEn: 'Severe hyperglycemia / Hyperosmolar Hyperglycemic State', descriptionAr: 'غيبوبة فرط السكر أو الحماض الكيتوني', emergencyTier: 'urgent' }
    ],
    spo2Thresholds: { normal: '>= 95%' },
    recommendedLabs: ['HbA1c', 'Fasting Plasma Glucose', 'Comprehensive Metabolic Panel', 'Urine Microalbumin'],
    clinicalGuidelinesRef: 'ADA 2026 Standards of Medical Care in Diabetes',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  {
    diseaseId: 'DIS-CHRON-003',
    code: 'E66',
    icd10Codes: ['E66.0', 'E66.9'],
    nameEn: 'Overweight and Clinical Obesity',
    nameAr: 'زيادة الوزن والسمنة السريرية',
    module: 'metabolic',
    associatedSymptoms: [
      { symptomKey: 'bmi', weight: 0.60, severity: '>= 30.0 kg/m2', isCardinal: true },
      { symptomKey: 'waistCircumference', weight: 0.40, severity: '> 102cm (M) / > 88cm (F)', isCardinal: false }
    ],
    redFlags: [],
    spo2Thresholds: { normal: '>= 95%' },
    recommendedLabs: ['Fasting Lipid Panel', 'Fasting Blood Glucose / HbA1c', 'Liver Function Tests (ALT/AST for NAFLD)'],
    clinicalGuidelinesRef: 'WHO Obesity Guidelines / Endocrine Society 2026',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  },
  {
    diseaseId: 'DIS-CHRON-004',
    code: 'D50.9',
    icd10Codes: ['D50.9', 'D50.0'],
    nameEn: 'Iron Deficiency Anemia',
    nameAr: 'أنيميا نقص الحديد',
    module: 'hematology',
    associatedSymptoms: [
      { symptomKey: 'hemoglobin', weight: 0.50, severity: '< 13 g/dL (M) / < 12 g/dL (F)', isCardinal: true },
      { symptomKey: 'serumFerritin', weight: 0.30, severity: '< 30 ng/mL', isCardinal: true },
      { symptomKey: 'fatiguePica', weight: 0.20, severity: 'generalized weakness and pallor', isCardinal: false }
    ],
    redFlags: [
      { key: 'severe_anemia_hemodynamic', threshold: 'Hb < 7.0 g/dL with resting tachycardia or syncope', descriptionEn: 'Severe decompensated anemia requiring urgent transfusion', descriptionAr: 'أنيميا حادة متقدمة مع هبوط دوري بالدورة الدموية', emergencyTier: 'urgent' }
    ],
    spo2Thresholds: { normal: '>= 95%' },
    recommendedLabs: ['Complete Blood Count (CBC with RBC indices MCV, MCH)', 'Serum Ferritin', 'Total Iron Binding Capacity (TIBC) / Transferrin Saturation'],
    clinicalGuidelinesRef: 'British Society of Gastroenterology (BSG) / WHO Iron Deficiency Guidelines',
    ruleVersion: '1.0.0',
    updatedAt: new Date().toISOString()
  }
];

// =============================================================================
// 2. REFERENCE SYMPTOMS CATALOG (symptoms_catalog)
// =============================================================================
const REFERENCE_SYMPTOMS_CATALOG = [
  {
    symptomId: 'SYM-VITAL-001',
    key: 'oxygenLevel',
    labelEn: 'Blood Oxygen Saturation (SpO2)',
    labelAr: 'نسبة تشبع الأكسجين في الدم (SpO2)',
    category: 'vitals',
    inputType: 'numeric',
    unit: '%',
    validRange: {
      min: 50,
      max: 100,
      rejectEmpty: true,
      rejectNegative: true,
      rejectOverMax: true
    },
    criticalThresholds: {
      urgent: 90,     // < 90%
      high: 93,       // 90-92%
      normal: 93      // >= 93%
    },
    descriptionEn: 'Pulse oximeter reading measuring the percentage of oxygen-saturated hemoglobin.',
    descriptionAr: 'قراءة جهاز قياس نبضات القلب ونسبة الأكسجين المشبع في الدم.'
  },
  {
    symptomId: 'SYM-RESP-001',
    key: 'shortnessOfBreathScale',
    labelEn: 'Shortness of Breath / Dyspnea Severity',
    labelAr: 'شدة ضيق التنفس وصعوبة التنفس',
    labelArSimplified: 'نهجان وضيق في النفس (كرشة نفس)',
    egyptianColloquial: 'نهجان، كرشة نفس، صعوبة في سحب النفس، مش قادر ياخد نفسه',
    patientExplanationAr: 'الشعور بأن الهواء غير كافٍ أو الحاجة لبذل جهد مضاعف للتنفس، سواء أثناء الراحة أو بذل أي حركة بسيطة.',
    category: 'respiratory',
    inputType: 'scale_1_10',
    unit: 'score_1_10',
    validRange: { min: 1, max: 10, rejectEmpty: false },
    criticalThresholds: { urgent: 8, high: 5 },
    descriptionEn: 'Validated 1-to-10 numerical rating scale of dyspnea at rest or on minimal exertion.',
    descriptionAr: 'مقياس عددي من 1 إلى 10 لتقييم صعوبة التنفس أثناء الراحة أو بذل أقل مجهود.'
  },
  {
    symptomId: 'SYM-RESP-002',
    key: 'coughSeverity',
    labelEn: 'Cough Severity',
    labelAr: 'شدة السعال / الكحة',
    labelArSimplified: 'درجة ونوع الكحة (كحة ناشفة أو ببلغم)',
    egyptianColloquial: 'كحة ناشفة، كحة جافة، كحة ببلغم، شرقة مستمرة، كحة تحرق الزور',
    patientExplanationAr: 'تقييم شدة السعال ومدى تأثيره على النوم والأنشطة اليومية، سواء كانت كحة جافة ناشفة أو مصحوبة بإفرازات ومخاط.',
    category: 'respiratory',
    inputType: 'enum',
    allowedValues: ['none', 'mild', 'moderate', 'severe'],
    unit: 'categorical',
    validRange: { allowedValues: ['none', 'mild', 'moderate', 'severe'] },
    descriptionEn: 'Clinical cough classification: none, mild (occasional), moderate (disturbing daily tasks), severe (persistent, paroxysmal, or disrupting sleep).',
    descriptionAr: 'تصنيف السعال السريري: بدون، خفيف، متوسط، أو شديد يعيق النوم والأنشطة اليومية.'
  },
  {
    symptomId: 'SYM-RESP-004',
    key: 'wheezing',
    labelEn: 'Wheezing / Chest Whistling',
    labelAr: 'أزيز وصفير الصدر',
    labelArSimplified: 'صفير وتزييق بالصدر (خروشة مسموعة مع النفس)',
    egyptianColloquial: 'صفير في الصدر، تزييق، خروشة صدر تسمعها مع الزفير، صوت صفارة',
    patientExplanationAr: 'صوت صفير أو تزييق موسيقي يصدر من الصدر خصوصاً أثناء إخراج النفس (الزفير) نتيجة ضيق الشعب الهوائية وتجمع الإفرازات.',
    category: 'respiratory',
    inputType: 'boolean',
    unit: 'boolean',
    validRange: { allowedValues: [true, false, 'yes', 'no', 'unknown'] },
    descriptionEn: 'High-pitched whistling sound produced in the airways during breathing, prominent on expiration.',
    descriptionAr: 'صوت صفير حاد ومستمر صادر من الشعب الهوائية الضيقة.'
  },
  {
    symptomId: 'SYM-RESP-005',
    key: 'dyspneaOnExertion',
    labelEn: 'Dyspnea on Exertion',
    labelAr: 'ضيق التنفس الجهدي',
    labelArSimplified: 'نهجان عند المجهود أو المشي',
    egyptianColloquial: 'نهجان مع المشي، طلوع السلم، شغل البيت، الحركة البسيطة',
    patientExplanationAr: 'ظهور نهجان وسرعة تنفس ملحوظة فور بذل مجهود بسيط كالمشي أو صعود بضع درجات من السلم، ويخف فور الاستراحة.',
    category: 'respiratory',
    inputType: 'boolean',
    unit: 'boolean',
    validRange: { allowedValues: [true, false, 'yes', 'no', 'unknown'] },
    descriptionEn: 'Disproportionate breathlessness triggered by mild or moderate physical exertion.',
    descriptionAr: 'ضيق تنفس ملحوظ يظهر مع أقل نشاط بدني.'
  },
  {
    symptomId: 'SYM-RESP-006',
    key: 'coughType',
    labelEn: 'Cough Type (Dry vs Productive)',
    labelAr: 'طبيعة السعال (جاف أو رطب ببلغم)',
    labelArSimplified: 'نوع الكحة (كحة جافة ناشفة أو كحة ببلغم)',
    egyptianColloquial: 'كحة ناشفة، كحة ببلغم، كحة تطلع مخاط، شرقة جافة',
    patientExplanationAr: 'التمييز بين الكحة الناشفة المهيجة للحلق وبين الكحة الرطبة التي تخرج إفرازات ومخاط من الصدر.',
    category: 'respiratory',
    inputType: 'enum',
    allowedValues: ['dry', 'productive', 'none', 'unknown'],
    unit: 'categorical',
    validRange: { allowedValues: ['dry', 'productive', 'none', 'unknown'] },
    descriptionEn: 'Differentiation between dry irritative cough and wet productive sputum cough.',
    descriptionAr: 'التمييز السريري بين الكحة الجافة المهيجة والكحة الرطبة المصحوبة ببلغم.'
  },
  {
    symptomId: 'SYM-RESP-007',
    key: 'hemoptysis',
    labelEn: 'Hemoptysis (Coughing up Blood)',
    labelAr: 'نفث الدم / سعال مدمم',
    labelArSimplified: 'سعال مدمم (خروج دم أو عروق دم مع الكحة)',
    egyptianColloquial: 'كحة فيها دم، بلغم مدمم، عروق دم مع البصاق، دم طالع من الصدر',
    patientExplanationAr: 'خروج دم أحمر أو خيوط دموية مع السعال أو البلغم، ويعد علامة خطر حمراء تستوجب فحصاً طبياً فورياً.',
    category: 'respiratory',
    inputType: 'boolean',
    unit: 'boolean',
    validRange: { allowedValues: [true, false, 'yes', 'no', 'unknown'] },
    criticalThresholds: { urgent: true },
    descriptionEn: 'Expectoration of blood or blood-stained sputum from the bronchi, larynx, trachea, or lungs.',
    descriptionAr: 'خروج دم أحمر صريح أو بلغم مدمم من الجهاز التنفسي.'
  },
  {
    symptomId: 'SYM-GEN-001',
    key: 'symptomDurationDays',
    labelEn: 'Symptom Duration (Days)',
    labelAr: 'مدة استمرار الأعراض (بالأيام)',
    labelArSimplified: 'بقالك كام يوم بتعاني من الأعراض دي؟',
    egyptianColloquial: 'مدة التعب، بقالها كام يوم، بدأت من إمتى',
    patientExplanationAr: 'عدد الأيام التي مرت منذ بداية شعورك بالكحة أو النهجان أو السخونية.',
    category: 'duration',
    inputType: 'duration',
    unit: 'days',
    validRange: { min: 1, max: 365, rejectEmpty: true },
    descriptionEn: 'Total elapsed days since onset of acute respiratory or systemic symptoms.',
    descriptionAr: 'عدد الأيام المنقضية منذ بدء ظهور الأعراض التنفسية أو العامة.'
  },
  {
    symptomId: 'SYM-VITAL-002',
    key: 'respiratoryRate',
    labelEn: 'Respiratory Rate',
    labelAr: 'معدل التنفس (نفس في الدقيقة)',
    labelArSimplified: 'سرعة التنفس ولهثان الصدر',
    egyptianColloquial: 'سرعة النفس، لهثان، النفس سريع ورا بعضه',
    patientExplanationAr: 'عدد مرات الشهيق والزفير في الدقيقة الواحدة أثناء راحة المريض تماماً.',
    category: 'vitals',
    inputType: 'numeric',
    unit: 'breaths/min',
    validRange: { min: 5, max: 60, rejectEmpty: false },
    criticalThresholds: { urgentHigh: 30, urgentLow: 8 },
    descriptionEn: 'Number of breaths taken per minute.',
    descriptionAr: 'عدد مرات التنفس في الدقيقة الواحدة.'
  },
  {
    symptomId: 'SYM-VITAL-003',
    key: 'temperature',
    labelEn: 'Body Temperature',
    labelAr: 'درجة حرارة الجسم',
    labelArSimplified: 'السخونية ودرجة حرارة الجسم',
    egyptianColloquial: 'سخونية، حرارة عالية، حرقان، مصدع ومسخن',
    patientExplanationAr: 'قياس حرارة الجسم بمقياس الحرارة (الترمومتر)، والحرارة الطبيعية حوالي 37 مئوية.',
    category: 'vitals',
    inputType: 'numeric',
    unit: '°C',
    validRange: { min: 34.0, max: 43.0, rejectEmpty: false },
    criticalThresholds: { urgentFever: 39.5, urgentHypothermia: 35.0 },
    descriptionEn: 'Body temperature measured in degrees Celsius.',
    descriptionAr: 'درجة حرارة الجسم بالدرجات المئوية.'
  },
  {
    symptomId: 'SYM-RESP-003',
    key: 'chestPain',
    labelEn: 'Chest Pain or Discomfort',
    labelAr: 'ألم أو انزعاج في منطقة الصدر',
    labelArSimplified: 'ألم أو نغزة أو ثقل في الصدر',
    egyptianColloquial: 'نغزة في الصدر، شكة مع النفس، حجر على الصدر، وجع بالقفص الصدري',
    patientExplanationAr: 'وجع أو إحساس بنغزة وشكة تزيد غالباً مع أخذ نفس عميق أو الكحة، أو إحساس بضغط وثقل عاصر.',
    category: 'respiratory',
    inputType: 'boolean',
    unit: 'boolean',
    validRange: { allowedValues: [true, false, 'yes', 'no', 'unknown'] },
    descriptionEn: 'Presence of pleuritic, pressure-like, or stabbing chest pain.',
    descriptionAr: 'وجود ألم صدري حاد، ضاغط، أو مصاحب للتنفس العميق.'
  },
  {
    symptomId: 'SYM-HIST-001',
    key: 'asthmaCopdHistory',
    labelEn: 'Known History of Asthma or COPD',
    labelAr: 'تاريخ مرضي سابق بالربو الشعبي أو السدة الرئوية',
    labelArSimplified: 'حساسية صدر (ربو) أو سدة رئوية مزمنة',
    egyptianColloquial: 'عنده حساسية صدر، أزمة ربو، الصدر بيقفل، سدة رئوية من السجاير',
    patientExplanationAr: 'تشخيص طبي سابق من دكتور صدر بحساسية الشعب الهوائية أو أزمات الربو أو السدة الرئوية المزمنة.',
    category: 'history',
    inputType: 'boolean',
    unit: 'boolean',
    validRange: { allowedValues: [true, false, 'yes', 'no', 'unknown'] },
    descriptionEn: 'Documented physician diagnosis of bronchial asthma or COPD.',
    descriptionAr: 'تشخيص طبي موثق سابق للإصابة بالربو الشعبي أو السدة الرئوية المزمنة.'
  },
  {
    symptomId: 'SYM-HIST-002',
    key: 'recentInfection',
    labelEn: 'Recent Viral or Bacterial Upper Respiratory Infection',
    labelAr: 'عدوى فيروسية أو بكتيرية حديثة بالجهاز التنفسي',
    labelArSimplified: 'نزلة برد أو دور إنفلونزا حديث',
    egyptianColloquial: 'دور برد قريب، إنفلونزا الأيام اللي فاتت، احتقان زور',
    patientExplanationAr: 'إصابة حديثة بنزلة برد أو زكام أو التهاب بالحلق خلال الأسبوعين الماضيين.',
    category: 'history',
    inputType: 'boolean',
    unit: 'boolean',
    validRange: { allowedValues: [true, false, 'yes', 'no', 'unknown'] },
    descriptionEn: 'History of flu, cold, or sinus infection within the preceding 14 days.',
    descriptionAr: 'تاريخ مرضي لإنفلونزا أو نزلة برد خلال الأسبوعين الماضيين.'
  },
  {
    symptomId: 'SYM-PROG-001',
    key: 'symptomProgression',
    labelEn: 'Symptom Progression over 24-48 hours',
    labelAr: 'مسار تطور الأعراض خلال 24-48 ساعة',
    labelArSimplified: 'التعب بيزيد ولا بيتحسن ولا زي ما هو؟',
    egyptianColloquial: 'حالتك بتتحسن، ثابتة، ولا بتسوء وبتتدهور؟',
    patientExplanationAr: 'ملاحظة مسار حالتك الصحية في اليومين الأخيرين للمساعدة في تحديد سرعة التطور.',
    category: 'progression',
    inputType: 'enum',
    allowedValues: ['improving', 'stable', 'worsening', 'unknown'],
    unit: 'categorical',
    validRange: { allowedValues: ['improving', 'stable', 'worsening', 'unknown'] },
    descriptionEn: 'Direction of clinical trajectory: improving, stable, or acute worsening.',
    descriptionAr: 'اتجاه الحالة السريرية: تحسن، استقرار، أو تدهور سريع.'
  }
];

// =============================================================================
// 3. CLINICAL TRIAGE RULES (clinical_rules)
// =============================================================================
const REFERENCE_CLINICAL_RULES = [
  {
    ruleId: 'RULE-RESP-EMERGENCY-01',
    nameEn: 'Severe Hypoxemia Emergency Escalation',
    nameAr: 'قاعدة طوارئ نقص الأكسجين الحاد (SpO2 < 90%)',
    condition: 'oxygenLevel < 90',
    riskClass: 'urgent',
    baseScore: 10,
    isEmergencyRedFlag: true,
    actionEn: 'Immediate ambulance / ER referral (Call 123) with continuous supplemental oxygen.',
    actionAr: 'إحالة فورية لطوارئ المستشفى (اتصل بالإسعاف 123) مع تزويد فوري بالأكسجين.',
    guidelineRef: 'WHO Emergency Triage Assessment and Treatment (ETAT) / BTS Guidelines',
    ruleVersion: '1.0.0'
  },
  {
    ruleId: 'RULE-RESP-HIGH-02',
    nameEn: 'Moderate Hypoxemia or Severe Dyspnea',
    nameAr: 'قاعدة الأولوية العالية لنقص الأكسجين المعتدل أو ضيق التنفس الشديد',
    condition: '(oxygenLevel >= 90 && oxygenLevel < 93) || shortnessOfBreathScale >= 8',
    riskClass: 'high',
    baseScore: 6,
    isEmergencyRedFlag: false,
    actionEn: 'Urgent physician consultation within 2 to 4 hours with vital sign reassessment.',
    actionAr: 'استشارة طبيب عاجلة خلال ساعتين إلى 4 ساعات مع إعادة تقييم المؤشرات الحيوية.',
    guidelineRef: 'GOLD / GINA Moderate Exacerbation Protocols',
    ruleVersion: '1.0.0'
  },
  {
    ruleId: 'RULE-RESP-ROUTINE-03',
    nameEn: 'Mild Symptoms Outpatient Pathway',
    nameAr: 'قاعدة الفحص الروتيني للعيادات الخارجية (SpO2 >= 93% وبدون علامات خطر)',
    condition: 'oxygenLevel >= 93 && shortnessOfBreathScale < 8 && !chestPain',
    riskClass: 'normal',
    baseScore: 2,
    isEmergencyRedFlag: false,
    actionEn: 'Routine outpatient evaluation within 24 to 48 hours.',
    actionAr: 'متابعة روتينية بالعيادات الخارجية خلال 24 إلى 48 ساعة.',
    guidelineRef: 'Primary Care Respiratory Clinical Care Pathway',
    ruleVersion: '1.0.0'
  }
];

// =============================================================================
// 4. SIMPLIFIED EGYPTIAN MEDICAL DICTIONARY (Altibbi Patient-Centric Standard)
// Task #85: مراجعة القاموس الطبي العربي المبسط للأعراض التنفسية للمواطن المصري
// =============================================================================
const SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY = [
  {
    termId: 'DICT-RESP-001',
    clinicalTermAr: 'ضيق التنفس وصعوبة التنفس (Dyspnea)',
    clinicalTermEn: 'Shortness of Breath / Dyspnea',
    egyptianTerm: 'نهجان / كرشة نفس',
    egyptianSynonyms: ['نهجان', 'كرشة نفس', 'صعوبة في سحب النفس', 'الهوا مش مكفي', 'خنقة بالصدر'],
    simplifiedMeaningAr: 'إحساس بعدم كفاية الهواء عند أخذ النفس، أو الحاجة لبذل مجهود مضاعف لملء الرئتين سواء أثناء الجلوس أو المشي.',
    simplifiedMeaningEn: 'Sensation of difficult or uncomfortable breathing, feeling like you cannot get enough air into your lungs.',
    whenToSeeDoctorAr: 'إذا كان النهجان يمنعك من إكمال جملة واحدة دون توقف، أو يحدث فجأة، أو مصحوباً بزرقة بالشفاه أو ألم بالصدر.',
    redFlagsAr: ['نهجان حاد ومفاجئ', 'زرقة بالوجه أو الشفاه', 'عجز عن التحدث في جمل كاملة'],
    category: 'dyspnea',
    icd10: 'R06.0'
  },
  {
    termId: 'DICT-RESP-002',
    clinicalTermAr: 'ضيق التنفس الجهدي (Dyspnea on Exertion)',
    clinicalTermEn: 'Dyspnea on Exertion (DOE)',
    egyptianTerm: 'نهجان عند المجهود أو المشي',
    egyptianSynonyms: ['نهجان مع المشي', 'نهجان طلوع السلم', 'كرشة نفس مع الحركة', 'نهجان شغل البيت', 'بينهج من أقل حركة'],
    simplifiedMeaningAr: 'ظهور نهجان وسرعة تنفس ملحوظة فور بذل مجهود بدني بسيط كالمشي أو صعود درجات من السلم، ويخف بالراحة.',
    simplifiedMeaningEn: 'Shortness of breath triggered by physical activity such as walking or climbing stairs, relieved by rest.',
    whenToSeeDoctorAr: 'إذا بدأ النهجان يظهر مع مجهودات كانت سهلة سابقاً، أو كان مصحوباً بتورم في القدمين أو ثقل ضاغط بالصدر.',
    redFlagsAr: ['تدهور سريع في القدرة على بذل المجهود', 'ألم عاصر بالصدر يمتد للذراع'],
    category: 'dyspnea',
    icd10: 'R06.02'
  },
  {
    termId: 'DICT-RESP-003',
    clinicalTermAr: 'السعال الجاف (Dry / Non-productive Cough)',
    clinicalTermEn: 'Dry / Non-Productive Cough',
    egyptianTerm: 'كحة جافة (ناشفة بدون بلغم)',
    egyptianSynonyms: ['كحة ناشفة', 'كحة جافة', 'شرقة مستمرة', 'حرقان ودغدغة بالزور مع كحة', 'كحة نوبات بالليل'],
    simplifiedMeaningAr: 'كحة مجهدة ومزعجة بدون خروج أي مخاط أو إفرازات من الصدر، وغالباً تسبب شعوراً بالخدش أو الحكة بالحلق.',
    simplifiedMeaningEn: 'A tickling, irritating cough that produces no phlegm or mucus, often paroxysmal or nocturnal.',
    whenToSeeDoctorAr: 'إذا استمرت الكحة لأكثر من أسبوعين، أو كانت تمنع النوم تماماً، أو سببت قيئاً وألماً حاداً بالقفص الصدري.',
    redFlagsAr: ['كحة جافة مع سخونية شديدة ورعشة', 'نقص تشبع الأكسجين عن 93%'],
    category: 'cough',
    icd10: 'R05.1'
  },
  {
    termId: 'DICT-RESP-004',
    clinicalTermAr: 'السعال الرطب المصحوب ببلغم (Productive Cough)',
    clinicalTermEn: 'Productive / Wet Cough with Sputum',
    egyptianTerm: 'كحة ببلغم (كحة رطبة)',
    egyptianSynonyms: ['كحة ببلغم', 'كحة رطبة', 'بلغم على الصدر', 'صدر محتقن ببلغم', 'كحة بتطلع إفرازات'],
    simplifiedMeaningAr: 'كحة يخرج معها بلغم أو مخاط من مجرى التنفس، وقد يكون لون البلغم شفافاً أو أبيض أو مائلاً للصفرة أو الخضرة.',
    simplifiedMeaningEn: 'A wet cough that brings up mucus or phlegm from the lungs and bronchial airways.',
    whenToSeeDoctorAr: 'إذا تحول لون البلغم للأخضر الداكن أو البني، أو كان مصحوباً بحرارة عالية ورعشة، أو استمر لأكثر من 10 أيام.',
    redFlagsAr: ['بلغم صديدي مصحوب بحرارة تتجاوز 39 مئوية', 'صعوبة بالغة في التنفس'],
    category: 'cough',
    icd10: 'R05.2'
  },
  {
    termId: 'DICT-RESP-005',
    clinicalTermAr: 'الأزيز والصفير الصدري (Wheezing)',
    clinicalTermEn: 'Wheezing / Bronchospasm',
    egyptianTerm: 'صفير بالصدر وتزييق (خروشة مسموعة)',
    egyptianSynonyms: ['صفير بالصدر', 'تزييق الصدر', 'صوت صفارة مع النفس', 'خروشة بالصدر', 'تزييقة الشعب'],
    simplifiedMeaningAr: 'صوت صفير أو تزييق موسيقي يُسمع من الصدر خصوصاً أثناء إخراج النفس (الزفير) نتيجة ضيق الشعب الهوائية.',
    simplifiedMeaningEn: 'High-pitched whistling sound produced during breathing when airways become narrowed or constricted.',
    whenToSeeDoctorAr: 'عند تكرار نوبات الصفير، أو عدم الاستجابة لبخاخات التوسيع الإسعافية، أو ظهور صعوبة في التنفس.',
    redFlagsAr: ['اختفاء صوت الصفير فجأة مع صعوبة تنفس بالغة (Silent Chest)', 'عجز عن التحدث'],
    category: 'sounds',
    icd10: 'R06.2'
  },
  {
    termId: 'DICT-RESP-006',
    clinicalTermAr: 'نفث الدم / السعال المدمم (Hemoptysis)',
    clinicalTermEn: 'Hemoptysis / Blood in Sputum',
    egyptianTerm: 'سعال مدمم (خروج دم أو عروق دم مع الكحة)',
    egyptianSynonyms: ['كحة فيها دم', 'دم مع البلغم', 'عروق دم مع الكحة', 'بصق دم', 'نزيف مع الكحة'],
    simplifiedMeaningAr: 'خروج دم أحمر أو خيوط وعروق دموية مختلطة بالبلغم عند السعال، وهو عرض يستوجب دائماً تقييماً طبياً عاجلاً.',
    simplifiedMeaningEn: 'Coughing up blood or blood-stained mucus from the respiratory tract, requiring urgent clinical evaluation.',
    whenToSeeDoctorAr: 'فوراً ودون أي تأخير، حتى لو كانت مجرد عروق دم بسيطة، لاستبعاد العدوى الحادة أو النزيف الرئوي.',
    redFlagsAr: ['كمية دم صريحة تتجاوز ملعقة طعام', 'سعال مدمم مصحوب بهبوط بالضغط أو دوار'],
    category: 'emergency',
    icd10: 'R04.2'
  },
  {
    termId: 'DICT-RESP-007',
    clinicalTermAr: 'الألم الصدري الجنبي والموضعي (Chest Pain)',
    clinicalTermEn: 'Chest Pain / Discomfort',
    egyptianTerm: 'ألم أو نغزة أو ثقل في الصدر',
    egyptianSynonyms: ['نغزة في الصدر', 'شكة مع النفس', 'حجر على الصدر', 'وجع في القفص الصدري', 'ثقل عاصر'],
    simplifiedMeaningAr: 'وجع أو إحساس بنغزة وشكة تزيد غالباً مع أخذ نفس عميق أو الكحة، أو إحساس بضغط وثقل عاصر على القفص الصدري.',
    simplifiedMeaningEn: 'Pleuritic, sharp, or pressure-like pain in the chest that may worsen with deep breathing or coughing.',
    whenToSeeDoctorAr: 'فوراً إذا كان الألم حاداً ومفاجئاً أو ممتداً للكتف أو الفك أو مصحوباً بعرق بارد وغثيان (طوارئ 123).',
    redFlagsAr: ['ألم عاصر في منتصف الصدر يمتد للذراع الأيسر أو الفك', 'ألم حاد ومفاجئ مع نهجان'],
    category: 'chest_pain',
    icd10: 'R07.9'
  },
  {
    termId: 'DICT-RESP-008',
    clinicalTermAr: 'نقص تشبع الأكسجين الشرياني (Hypoxia / Hypoxemia)',
    clinicalTermEn: 'Arterial Oxygen Desaturation (SpO2 < 93%)',
    egyptianTerm: 'نقص نسبة الأكسجين في الدم',
    egyptianSynonyms: ['نقص الأكسجين', 'الأكسجين نازل', 'جهاز الأكسجين قاري قليل', 'أقل من 90'],
    simplifiedMeaningAr: 'انخفاض كمية الأكسجين التي يحملها الدم للأعضاء، ويقاس عبر مشبك الإصبع الصغير (Pulse Oximeter). الطبيعي 95% فأكثر.',
    simplifiedMeaningEn: 'Low level of oxygen in the blood measured by a pulse oximeter, normal is >= 95%.',
    whenToSeeDoctorAr: 'إذا كانت القراءة بين 90% و 92%، وفوراً لطوارئ المستشفى أو الاتصال بالإسعاف (123) إذا كانت أقل من 90%.',
    redFlagsAr: ['نسبة الأكسجين أقل من 90%', 'زرقة بالشفتين أو أطراف الأصابع'],
    category: 'emergency',
    icd10: 'R09.02'
  },
  {
    termId: 'DICT-RESP-009',
    clinicalTermAr: 'تسارع معدل التنفس (Tachypnea)',
    clinicalTermEn: 'Tachypnea / Rapid Breathing',
    egyptianTerm: 'سرعة التنفس ولهثان الصدر',
    egyptianSynonyms: ['سرعة التنفس', 'تنفس سريع', 'لهثان', 'نفسه ورا بعضه بسرعة', 'بينهج وقاعد'],
    simplifiedMeaningAr: 'تنفس أكثر من 20-25 مرة في الدقيقة عند الشخص البالغ وهو مرتاح، بحيث يبدو وكأنه يلهث دون بذل مجهود.',
    simplifiedMeaningEn: 'Abnormally rapid breathing rate, exceeding 20-25 breaths per minute in a resting adult.',
    whenToSeeDoctorAr: 'إذا كان معدل التنفس أكثر من 24 في الدقيقة أو مصحوباً بإجهاد بعضلات الرقبة والقفص الصدري.',
    redFlagsAr: ['معدل تنفس أكثر من 30 في الدقيقة', 'استخدام عضلات مساعدة للتنفس وانكماش الأضلاع'],
    category: 'dyspnea',
    icd10: 'R06.82'
  },
  {
    termId: 'DICT-RESP-010',
    clinicalTermAr: 'الربو الشعبي ونوبات حساسية الصدر (Bronchial Asthma)',
    clinicalTermEn: 'Bronchial Asthma / Reactive Airway Disease',
    egyptianTerm: 'حساسية الصدر والربو',
    egyptianSynonyms: ['حساسية صدر', 'أزمة ربو', 'نوبة ضيق شعب', 'الصدر بيقفل', 'حساسية موسمية'],
    simplifiedMeaningAr: 'التهاب مزمن وتضيق مؤقت في الشعب الهوائية يسبب نوبات متكررة من ضيق النفس والصفير والكحة خاصة بالليل أو مع التراب وتغير الجو.',
    simplifiedMeaningEn: 'Chronic inflammatory disorder of the airways causing recurrent episodes of wheezing, breathlessness, and cough.',
    whenToSeeDoctorAr: 'إذا لم تستجب النوبة لبخاخ الطوارئ، أو عند تكرار النوبات أكثر من مرتين أسبوعياً.',
    redFlagsAr: ['عجز عن إكمال جملة في نفس واحد', 'عدم استجابة لبخاخ الفنتولين أو موسع الشعب الإسعافي'],
    category: 'sounds',
    icd10: 'J45.9'
  }
];

class MedicalCatalogService {
  constructor() {
    this.diseases = new Map();
    this.symptoms = new Map();
    this.rules = new Map();
    this._loadInMem();
  }

  _loadInMem() {
    REFERENCE_DISEASES_CATALOG.forEach(d => this.diseases.set(d.diseaseId, d));
    REFERENCE_SYMPTOMS_CATALOG.forEach(s => this.symptoms.set(s.key, s));
    REFERENCE_CLINICAL_RULES.forEach(r => this.rules.set(r.ruleId, r));
  }

  getSimplifiedMedicalDictionary(category = null) {
    if (category) {
      return SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY.filter(item => item.category === category);
    }
    return SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY;
  }

  searchMedicalDictionary(query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY;

    return SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY.filter(item => {
      const matchAr = (item.clinicalTermAr && item.clinicalTermAr.toLowerCase().includes(q)) ||
                      (item.egyptianTerm && item.egyptianTerm.toLowerCase().includes(q)) ||
                      (item.simplifiedMeaningAr && item.simplifiedMeaningAr.toLowerCase().includes(q));
      const matchEn = (item.clinicalTermEn && item.clinicalTermEn.toLowerCase().includes(q)) ||
                      (item.simplifiedMeaningEn && item.simplifiedMeaningEn.toLowerCase().includes(q));
      const matchSynonyms = Array.isArray(item.egyptianSynonyms) &&
                            item.egyptianSynonyms.some(s => s.toLowerCase().includes(q));
      const matchIcd = item.icd10 && item.icd10.toLowerCase().includes(q);
      return matchAr || matchEn || matchSynonyms || matchIcd;
    });
  }

  getDiseases(module = null) {
    const list = Array.from(this.diseases.values());
    if (module) return list.filter(d => d.module === module);
    return list;
  }

  getDiseaseById(diseaseId) {
    return this.diseases.get(diseaseId) || null;
  }

  getSymptoms(category = null) {
    const list = Array.from(this.symptoms.values());
    if (category) return list.filter(s => s.category === category);
    return list;
  }

  getSymptomByKey(key) {
    return this.symptoms.get(key) || null;
  }

  getClinicalRules() {
    return Array.from(this.rules.values());
  }

  /**
   * Evaluates patient clinical inputs strictly against reference catalog and clinical rules.
   */
  evaluateAssessment(inputSnapshot) {
    const spo2 = Number(inputSnapshot.spo2 ?? inputSnapshot.oxygenLevel ?? 95);
    const dyspneaScale = Number(inputSnapshot.shortnessOfBreathScale ?? (inputSnapshot.hasDyspnea ? 6 : 1));
    const cough = String(inputSnapshot.coughSeverity ?? 'none').toLowerCase();
    const durationDays = Number(inputSnapshot.symptomDurationDays ?? 3);
    const chestPain = Boolean(inputSnapshot.chestPain === true || inputSnapshot.chestPain === 'yes');
    const asthmaCopd = Boolean(inputSnapshot.asthmaCopdHistory === true || inputSnapshot.asthmaCopdHistory === 'yes');

    let riskClass = 'normal';
    let riskScore = 20;
    let isEmergencyRedFlag = false;
    const topFactors = [];
    const matchedDiseases = [];

    // Red flag: severe hypoxemia
    if (spo2 < 90) {
      riskClass = 'urgent';
      riskScore = 95;
      isEmergencyRedFlag = true;
      topFactors.push({
        factor: 'Severe Hypoxemia',
        detail: `SpO2 reading of ${spo2}% is below critical threshold of 90%.`,
        severity: 'critical'
      });
    } else if (spo2 <= 92 || dyspneaScale >= 8 || chestPain) {
      riskClass = 'high';
      riskScore = 70;
      topFactors.push({
        factor: spo2 <= 92 ? 'Moderate Hypoxemia' : (dyspneaScale >= 8 ? 'Severe Dyspnea' : 'Chest Pain Discomfort'),
        detail: `SpO2: ${spo2}%, Dyspnea Scale: ${dyspneaScale}/10.`,
        severity: 'high'
      });
    } else {
      topFactors.push({
        factor: 'Vital Signs Within Acceptable Limits',
        detail: `SpO2: ${spo2}%, Duration: ${durationDays} days.`,
        severity: 'routine'
      });
    }

    // Match candidate diseases from reference catalog
    if (asthmaCopd) {
      matchedDiseases.push({
        diseaseId: 'DIS-RESP-002',
        code: 'J45.901',
        nameEn: 'Bronchial Asthma Exacerbation',
        nameAr: 'تفاقم / نوبة الربو الشعبي الحادة',
        matchConfidence: 0.85
      });
      matchedDiseases.push({
        diseaseId: 'DIS-RESP-003',
        code: 'J44.1',
        nameEn: 'COPD Exacerbation',
        nameAr: 'تفاقم مرض السدة الرئوية المزمنة (COPD Exacerbation)',
        matchConfidence: 0.75
      });
    } else if (cough.includes('severe') || cough.includes('moderate') || durationDays <= 14) {
      matchedDiseases.push({
        diseaseId: 'DIS-RESP-001',
        code: 'J20.9',
        nameEn: 'Acute Lower Respiratory Infection (LRTI / Suspected Pneumonia)',
        nameAr: 'عدوى الجهاز التنفسي السفلي الحادة',
        matchConfidence: 0.80
      });
    } else {
      matchedDiseases.push({
        diseaseId: 'DIS-RESP-004',
        code: 'J00',
        nameEn: 'Mild Upper Respiratory Tract Infection (Common Cold / Viral URI)',
        nameAr: 'عدوى الجهاز التنفسي العلوي الخفيفة',
        matchConfidence: 0.90
      });
    }

    return {
      riskClass,
      riskScore,
      isEmergencyRedFlag,
      topFactors,
      matchedDiseases,
      ruleVersion: '1.0.0',
      modelVersion: 'HealthVibe-Rules-v1.1'
    };
  }
}

const medicalCatalogService = new MedicalCatalogService();

module.exports = {
  medicalCatalogService,
  REFERENCE_DISEASES_CATALOG,
  REFERENCE_SYMPTOMS_CATALOG,
  REFERENCE_CLINICAL_RULES,
  SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY
};
