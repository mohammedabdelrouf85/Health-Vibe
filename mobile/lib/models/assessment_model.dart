class VitalsData {
  final double oxygenLevel; // SpO2 percentage e.g. 96.0
  final bool isLowOxygen;
  final bool isCriticalOxygen;
  final String unit;
  final double temperature; // e.g. 37.2
  final String temperatureUnit;
  final int respiratoryRate; // breaths/min e.g. 18
  final String respiratoryRateUnit;

  VitalsData({
    required this.oxygenLevel,
    bool? isLowOxygen,
    bool? isCriticalOxygen,
    this.unit = '%',
    required this.temperature,
    this.temperatureUnit = '°C',
    required this.respiratoryRate,
    this.respiratoryRateUnit = 'breaths/min',
  })  : isLowOxygen = isLowOxygen ?? (oxygenLevel < 92),
        isCriticalOxygen = isCriticalOxygen ?? (oxygenLevel < 88);

  factory VitalsData.fromJson(Map<String, dynamic> json) {
    final oxygen = (json['oxygenLevel'] as num?)?.toDouble() ?? 98.0;
    return VitalsData(
      oxygenLevel: oxygen,
      isLowOxygen: json['isLowOxygen'] as bool? ?? (oxygen < 92),
      isCriticalOxygen: json['isCriticalOxygen'] as bool? ?? (oxygen < 88),
      unit: json['unit']?.toString() ?? '%',
      temperature: (json['temperature'] as num?)?.toDouble() ?? 37.0,
      temperatureUnit: json['temperatureUnit']?.toString() ?? '°C',
      respiratoryRate: (json['respiratoryRate'] as num?)?.toInt() ?? 18,
      respiratoryRateUnit: json['respiratoryRateUnit']?.toString() ?? 'breaths/min',
    );
  }

  Map<String, dynamic> toJson() => {
    'oxygenLevel': oxygenLevel,
    'isLowOxygen': isLowOxygen,
    'isCriticalOxygen': isCriticalOxygen,
    'unit': unit,
    'temperature': temperature,
    'temperatureUnit': temperatureUnit,
    'respiratoryRate': respiratoryRate,
    'respiratoryRateUnit': respiratoryRateUnit,
  };
}

class SymptomsData {
  final String breathingDifficulty; // 'no', 'mild', 'moderate', 'severe'
  final String coughSeverity; // 'none', 'mild', 'moderate', 'severe'
  final int durationDays;
  final String chestPain; // 'no', 'mild', 'severe'
  final String symptomProgression; // 'improving', 'stable', 'worsening'
  final String recentInfection; // 'no', 'yes', 'unknown'
  final String asthmaCopd; // 'no', 'yes', 'unknown'

  SymptomsData({
    this.breathingDifficulty = 'no',
    this.coughSeverity = 'none',
    this.durationDays = 1,
    this.chestPain = 'no',
    this.symptomProgression = 'stable',
    this.recentInfection = 'no',
    this.asthmaCopd = 'unknown',
  });

  factory SymptomsData.fromJson(Map<String, dynamic> json) {
    return SymptomsData(
      breathingDifficulty: json['breathingDifficulty']?.toString() ?? 'no',
      coughSeverity: json['coughSeverity']?.toString() ?? 'none',
      durationDays: (json['durationDays'] as num?)?.toInt() ?? 1,
      chestPain: json['chestPain']?.toString() ?? 'no',
      symptomProgression: json['symptomProgression']?.toString() ?? 'stable',
      recentInfection: json['recentInfection']?.toString() ?? 'no',
      asthmaCopd: json['asthmaCopd']?.toString() ?? 'unknown',
    );
  }

  Map<String, dynamic> toJson() => {
    'breathingDifficulty': breathingDifficulty,
    'coughSeverity': coughSeverity,
    'durationDays': durationDays,
    'chestPain': chestPain,
    'symptomProgression': symptomProgression,
    'recentInfection': recentInfection,
    'asthmaCopd': asthmaCopd,
  };
}

class PrivacyConsentData {
  final bool accepted;
  final String version;
  final String acceptedAt;
  final bool dataProcessing;
  final bool aiAdvisory;
  final bool notifications;

  PrivacyConsentData({
    this.accepted = true,
    this.version = 'HealthVibe-Privacy-v1.0',
    String? acceptedAt,
    this.dataProcessing = true,
    this.aiAdvisory = true,
    this.notifications = true,
  }) : acceptedAt = acceptedAt ?? DateTime.now().toUtc().toIso8601String();

  factory PrivacyConsentData.fromJson(Map<String, dynamic> json) {
    return PrivacyConsentData(
      accepted: json['accepted'] == true,
      version: json['version']?.toString() ?? 'HealthVibe-Privacy-v1.0',
      acceptedAt: json['acceptedAt']?.toString() ?? DateTime.now().toUtc().toIso8601String(),
      dataProcessing: json['dataProcessing'] == true,
      aiAdvisory: json['aiAdvisory'] == true,
      notifications: json['notifications'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'accepted': accepted,
    'version': version,
    'acceptedAt': acceptedAt,
    'dataProcessing': dataProcessing,
    'aiAdvisory': aiAdvisory,
    'notifications': notifications,
  };
}

class AiTriageData {
  final String priority; // 'urgent', 'high', 'moderate', 'normal'
  final String risk; // 'حرج', 'مرتفع', 'متوسط', 'منخفض'
  final String riskEn; // 'Critical', 'High', 'Moderate', 'Low'
  final int ruleScorePoints;
  final List<String> triggeredRuleIds;

  AiTriageData({
    this.priority = 'normal',
    this.risk = 'منخفض',
    this.riskEn = 'Low',
    this.ruleScorePoints = 0,
    this.triggeredRuleIds = const [],
  });

  factory AiTriageData.fromJson(Map<String, dynamic> json) {
    final rules = json['triggeredRules'] as List<dynamic>? ?? [];
    return AiTriageData(
      priority: json['priority']?.toString() ?? 'normal',
      risk: json['risk']?.toString() ?? 'منخفض',
      riskEn: json['riskEn']?.toString() ?? 'Low',
      ruleScorePoints: (json['ruleScorePoints'] as num?)?.toInt() ?? 0,
      triggeredRuleIds: rules.map((r) => r is Map ? r['id']?.toString() ?? '' : r.toString()).toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'priority': priority,
    'risk': risk,
    'riskEn': riskEn,
    'ruleScorePoints': ruleScorePoints,
    'triggeredRuleIds': triggeredRuleIds,
  };
}

class AssessmentModel {
  final String schemaVersion;
  final String caseId;
  final String patientId;
  final String patientName;
  final String patientEmail;
  final String? assignedDoctorId;
  final String? assignedDoctorName;
  final String? clinicId;
  final String? clinicName;
  final String status; // 'pending', 'under_review', 'approved', 'needs_followup', 'closed'
  final VitalsData vitals;
  final SymptomsData symptoms;
  final PrivacyConsentData privacyConsent;
  final AiTriageData? aiTriage;
  final String? medications;
  final String? notes;
  final DateTime createdAt;

  AssessmentModel({
    this.schemaVersion = '1.0.0',
    required this.caseId,
    required this.patientId,
    required this.patientName,
    required this.patientEmail,
    this.assignedDoctorId,
    this.assignedDoctorName,
    this.clinicId,
    this.clinicName,
    this.status = 'pending',
    required this.vitals,
    required this.symptoms,
    required this.privacyConsent,
    this.aiTriage,
    this.medications,
    this.notes,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  factory AssessmentModel.fromJson(Map<String, dynamic> json) {
    final assessmentMap = json['assessment'] as Map<String, dynamic>? ?? {};
    final vitalsJson = assessmentMap['vitals'] as Map<String, dynamic>? ?? json['vitals'] as Map<String, dynamic>? ?? {};
    final symptomsJson = assessmentMap['symptoms'] as Map<String, dynamic>? ?? json['symptoms'] as Map<String, dynamic>? ?? {};
    final consentJson = json['privacyConsent'] as Map<String, dynamic>? ?? {};
    final triageJson = assessmentMap['aiTriage'] as Map<String, dynamic>? ?? json['aiTriage'] as Map<String, dynamic>?;

    return AssessmentModel(
      schemaVersion: json['schemaVersion']?.toString() ?? '1.0.0',
      caseId: json['caseId']?.toString() ?? json['id']?.toString() ?? '',
      patientId: json['patientId']?.toString() ?? '',
      patientName: json['patientName']?.toString() ?? '',
      patientEmail: json['patientEmail']?.toString() ?? '',
      assignedDoctorId: json['assignedDoctorId']?.toString(),
      assignedDoctorName: json['assignedDoctorName']?.toString(),
      clinicId: json['clinicId']?.toString(),
      clinicName: json['clinicName']?.toString(),
      status: json['status']?.toString() ?? 'pending',
      vitals: VitalsData.fromJson(vitalsJson),
      symptoms: SymptomsData.fromJson(symptomsJson),
      privacyConsent: PrivacyConsentData.fromJson(consentJson),
      aiTriage: triageJson != null ? AiTriageData.fromJson(triageJson) : null,
      medications: assessmentMap['medications'] is Map
          ? (assessmentMap['medications'] as Map)['current']?.toString()
          : assessmentMap['medications']?.toString(),
      notes: assessmentMap['notes']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toApiPayload() {
    return {
      'schemaVersion': schemaVersion,
      'caseId': caseId,
      'patientId': patientId,
      'patientName': patientName,
      'patientEmail': patientEmail,
      'assignedDoctorId': assignedDoctorId,
      'clinicId': clinicId,
      'status': status,
      'privacyConsent': privacyConsent.toJson(),
      'assessment': {
        'vitals': vitals.toJson(),
        'symptoms': symptoms.toJson(),
        'medications': {'current': medications ?? '', 'status': medications != null ? 'provided' : 'none'},
        'notes': notes ?? '',
      },
    };
  }
}
