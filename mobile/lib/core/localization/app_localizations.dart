import 'package:flutter/material.dart';

class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
        AppLocalizations(const Locale('ar'));
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  bool get isRtl => locale.languageCode == 'ar';

  static final Map<String, Map<String, String>> _localizedValues = {
    'ar': {
      // General & Nav
      'app_name': 'Health Vibe AI',
      'app_tagline': 'منصة التقييم السريري والتنفسي الذكي',
      'home': 'الرئيسية',
      'assessments': 'التقييمات',
      'review_status': 'حالة المراجعة',
      'reports': 'التقارير الطبية',
      'profile': 'الملف الشخصي',
      'language': 'اللغة',
      'arabic': 'العربية',
      'english': 'English',
      'logout': 'تسجيل الخروج',
      'cancel': 'إلغاء',
      'confirm': 'تأكيد',
      'back': 'رجوع',
      'submit': 'إرسال',
      'loading': 'جاري التحميل...',
      'error': 'حدث خطأ',
      'retry': 'إعادة المحاولة',
      'save': 'حفظ',

      // Auth / Sign In
      'sign_in_title': 'تسجيل الدخول',
      'sign_in_subtitle': 'قم بتسجيل الدخول للوصول إلى استشاراتك الطبية وتقاريرك المعتمدة',
      'email_label': 'البريد الإلكتروني',
      'email_hint': 'name@example.com',
      'password_label': 'كلمة المرور',
      'password_hint': '••••••••',
      'sign_in_button': 'دخول إلى المنظومة',
      'quick_demo_patient': 'دخول تجريبي (مريض)',
      'quick_demo_doctor': 'دخول تجريبي (طبيب معتمد)',
      'invalid_credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      'email_required': 'يرجى إدخال البريد الإلكتروني',
      'password_required': 'يرجى إدخال كلمة المرور',
      'server_auth_note': 'يتم التحقق من الصلاحيات والوصول بصورة مشفرة عبر خادم Health Vibe',

      // Assessment Flow
      'assessment_title': 'التقييم التنفسي السريري',
      'assessment_subtitle': 'إدخال العلامات الحيوية والأعراض السريرية',
      'step_vitals': 'العلامات الحيوية',
      'step_symptoms': 'الأعراض التنفسية',
      'step_history': 'التاريخ المرضي',
      'step_review': 'مراجعة وإرسال',

      // Vitals
      'oxygen_level': 'نسبة تشبع الأكسجين (SpO2)',
      'oxygen_hint': 'مثال: 97',
      'temperature': 'درجة حرارة الجسم (°C)',
      'temperature_hint': 'مثال: 37.2',
      'respiratory_rate': 'معدل التنفس (نَفَس/دقيقة)',
      'respiratory_rate_hint': 'مثال: 18',
      'vital_normal': 'ضمن المعدل الطبيعي',
      'vital_low_oxygen': 'تحذير: نقص أكسجين متوسط (أقل من 92%)',
      'vital_critical_oxygen': 'طوارئ: نقص أكسجين حاد (أقل من 88%)',

      // Symptoms
      'breathing_difficulty': 'صعوبة أو ضيق في التنفس',
      'cough_severity': 'شدة السعال (الكحة)',
      'chest_pain': 'ألم أو ضغط في الصدر',
      'symptom_progression': 'تطور الأعراض السريرية',
      'symptom_duration': 'مدة استمرار الأعراض (بالأيام)',
      'none': 'لا يوجد',
      'mild': 'خفيفة',
      'moderate': 'متوسطة',
      'severe': 'شديدة',
      'improving': 'في تحسن',
      'stable': 'مستقرة',
      'worsening': 'في تدهور',
      'yes': 'نعم',
      'no': 'لا',
      'unknown': 'غير متأكد',

      // Risk Factors & History
      'asthma_copd': 'تاريخ ربو أو مرض رئوي مزمن (COPD)',
      'recent_infection': 'إصابة أو عدوى تنفسية حديثة خلال 14 يوماً',
      'current_medications': 'الأدوية الحالية (إن وجدت)',
      'patient_notes': 'ملاحظات إضافية يود المريض توضيحها',

      // Consent
      'privacy_consent_title': 'الموافقة على المعالجة الطبية وسياسة الخصوصية',
      'privacy_consent_desc': 'أوافق على معالجة البيانات الصحية لأغراض الفرز السريري والمراجعة من قبل أطباء معتمدين.',

      // Emergency Safeguard
      'emergency_warning_title': 'تنبيه سريري طارئ',
      'emergency_warning_desc': 'تشير القياسات المدخلة إلى نقص حاد في الأكسجين أو أعراض تنفسية حرجة تتطلب التدخل الطبي العاجل أو التوجه لأقرب قسم طوارئ فوراً.',
      'emergency_hotline': 'الخط الساخن للطوارئ: 123 (مصر) / 997 (السعودية)',
      'emergency_proceed': 'المتابعة مع إرسال بلاغ أولوية قصوى',

      // Review Status
      'status_pending': 'بانتظار المراجعة السريرية',
      'status_under_review': 'قيد الفحص السريري من قبل الطبيب',
      'status_approved': 'تم الاعتماد الطبي بنجاح',
      'status_needs_followup': 'مطلوب استكمال بيانات طبية',
      'status_closed': 'مكتمل ومغلق',
      'assigned_doctor': 'الطبيب المشرف المسند',
      'assigned_clinic': 'العيادة الطبية',
      'case_id': 'رقم الحالة',
      'submitted_at': 'وقت التقديم',
      'no_active_cases': 'لا توجد تقييمات حالية قيد المراجعة',
      'start_new_assessment': 'بدء تقييم تنفسي جديد',

      // Clinical Reports
      'report_title': 'التقرير الطبي السريري المعتمد',
      'report_reference': 'المرجع الرقمي للتقرير',
      'doctor_credentials': 'بيانات وترخيص الطبيب المعتمد',
      'doctor_license': 'رقم الترخيص الطبي',
      'doctor_name': 'اسم الطبيب',
      'clinical_findings': 'النتائج والملاحظات السريرية',
      'official_diagnosis': 'التشخيص الطبي المعتمد',
      'prescribed_rx': 'الوصفة الطبية والتوصيات العلاجية',
      'triage_summary': 'ملخص الفرز الذكي',
      'verify_report_online': 'التحقق من صحة التقرير عبر بوابة Health Vibe',
      'report_disclaimer': 'هذا التقرير صادر ومعتمد من طبيب مرخص عبر منظومة Health Vibe AI.',

      // Push Notifications
      'notification_permission_title': 'الإشعارات الفورية والتحديثات الطبية',
      'notification_permission_desc': 'استلم تنبيهات فورية عند قيام الطبيب باعتماد تقريرك أو طلب متابعة لحالتك، مع مراعاة سرية البيانات الصحية التامة.',
      'enable_notifications': 'تفعيل التنبيهات',
      'notifications_enabled_toast': 'تم تفعيل التنبيهات الفورية بنجاح',
      'push_phi_protection_note': 'لا تحتوي الإشعارات على أي بيانات تشخيصية حفاظاً على خصوصيتك.',
    },
    'en': {
      // General & Nav
      'app_name': 'Health Vibe AI',
      'app_tagline': 'Smart Respiratory Clinical Assessment Platform',
      'home': 'Home',
      'assessments': 'Assessments',
      'review_status': 'Review Status',
      'reports': 'Medical Reports',
      'profile': 'Profile',
      'language': 'Language',
      'arabic': 'العربية',
      'english': 'English',
      'logout': 'Sign Out',
      'cancel': 'Cancel',
      'confirm': 'Confirm',
      'back': 'Back',
      'submit': 'Submit',
      'loading': 'Loading...',
      'error': 'Error occurred',
      'retry': 'Retry',
      'save': 'Save',

      // Auth / Sign In
      'sign_in_title': 'Sign In',
      'sign_in_subtitle': 'Sign in to access your clinical assessments and certified reports',
      'email_label': 'Email Address',
      'email_hint': 'name@example.com',
      'password_label': 'Password',
      'password_hint': '••••••••',
      'sign_in_button': 'Sign In to Health Vibe',
      'quick_demo_patient': 'Demo Login (Patient)',
      'quick_demo_doctor': 'Demo Login (Doctor)',
      'invalid_credentials': 'Invalid email address or password',
      'email_required': 'Please enter an email address',
      'password_required': 'Please enter your password',
      'server_auth_note': 'Permissions and access are encrypted & enforced by Health Vibe Server',

      // Assessment Flow
      'assessment_title': 'Respiratory Clinical Assessment',
      'assessment_subtitle': 'Enter vital measurements and clinical symptoms',
      'step_vitals': 'Vital Signs',
      'step_symptoms': 'Symptoms',
      'step_history': 'Medical History',
      'step_review': 'Review & Submit',

      // Vitals
      'oxygen_level': 'Oxygen Saturation (SpO2 %)',
      'oxygen_hint': 'e.g. 97',
      'temperature': 'Body Temperature (°C)',
      'temperature_hint': 'e.g. 37.2',
      'respiratory_rate': 'Respiratory Rate (breaths/min)',
      'respiratory_rate_hint': 'e.g. 18',
      'vital_normal': 'Within Normal Range',
      'vital_low_oxygen': 'Warning: Moderate Hypoxia (< 92%)',
      'vital_critical_oxygen': 'Emergency: Critical Hypoxia (< 88%)',

      // Symptoms
      'breathing_difficulty': 'Shortness of Breath',
      'cough_severity': 'Cough Severity',
      'chest_pain': 'Chest Pain / Pressure',
      'symptom_progression': 'Symptom Progression',
      'symptom_duration': 'Symptom Duration (Days)',
      'none': 'None',
      'mild': 'Mild',
      'moderate': 'Moderate',
      'severe': 'Severe',
      'improving': 'Improving',
      'stable': 'Stable',
      'worsening': 'Worsening',
      'yes': 'Yes',
      'no': 'No',
      'unknown': 'Uncertain',

      // Risk Factors & History
      'asthma_copd': 'History of Asthma or COPD',
      'recent_infection': 'Recent Respiratory Infection (past 14 days)',
      'current_medications': 'Current Medications (if any)',
      'patient_notes': 'Additional Patient Notes',

      // Consent
      'privacy_consent_title': 'Consent to Clinical Processing & Privacy Policy',
      'privacy_consent_desc': 'I consent to data processing for AI-assisted clinical triage and physician review.',

      // Emergency Safeguard
      'emergency_warning_title': 'Clinical Emergency Alert',
      'emergency_warning_desc': 'Entered vitals indicate critical hypoxia or severe respiratory symptoms requiring immediate emergency medical care.',
      'emergency_hotline': 'Emergency Hotlines: 123 (EG) / 997 (SA) / 911 (US)',
      'emergency_proceed': 'Proceed with Critical Priority Alert',

      // Review Status
      'status_pending': 'Pending Clinical Review',
      'status_under_review': 'Under Review by Attending Physician',
      'status_approved': 'Clinically Approved & Certified',
      'status_needs_followup': 'Additional Information Requested',
      'status_closed': 'Case Completed & Closed',
      'assigned_doctor': 'Assigned Doctor',
      'assigned_clinic': 'Clinical Center',
      'case_id': 'Case Reference',
      'submitted_at': 'Submitted',
      'no_active_cases': 'No active assessments in review queue',
      'start_new_assessment': 'Start New Assessment',

      // Clinical Reports
      'report_title': 'Certified Clinical Report',
      'report_reference': 'Report Reference',
      'doctor_credentials': 'Attending Physician Credentials',
      'doctor_license': 'Medical License No.',
      'doctor_name': 'Doctor Name',
      'clinical_findings': 'Clinical Findings & Analysis',
      'official_diagnosis': 'Official Diagnosis',
      'prescribed_rx': 'Prescriptions & Treatment Plan',
      'triage_summary': 'AI Triage Summary',
      'verify_report_online': 'Verify Report on Health Vibe Portal',
      'report_disclaimer': 'This certified clinical report was reviewed and signed by a licensed physician via Health Vibe AI.',

      // Push Notifications
      'notification_permission_title': 'Push Notifications & Clinical Updates',
      'notification_permission_desc': 'Receive immediate alerts when your attending doctor certifies your report or requests follow-up, with zero PHI leakage.',
      'enable_notifications': 'Enable Notifications',
      'notifications_enabled_toast': 'Push notifications successfully activated',
      'push_phi_protection_note': 'Notifications contain no protected health information for your privacy.',
    },
  };

  String translate(String key) {
    return _localizedValues[locale.languageCode]?[key] ??
        _localizedValues['en']?[key] ??
        key;
  }
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => ['ar', 'en'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}
