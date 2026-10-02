class ClinicalReportModel {
  final String reportReference; // e.g. "HV-REP-89_NUITV"
  final String caseId;
  final String patientName;
  final String? patientAge;
  final String doctorName;
  final String doctorLicense;
  final String diagnosis;
  final String recommendations;
  final String prescriptions;
  final double? oxygenLevel;
  final DateTime approvedAt;
  final String? verificationUrl;

  ClinicalReportModel({
    required this.reportReference,
    required this.caseId,
    required this.patientName,
    this.patientAge,
    required this.doctorName,
    required this.doctorLicense,
    required this.diagnosis,
    required this.recommendations,
    required this.prescriptions,
    this.oxygenLevel,
    DateTime? approvedAt,
    this.verificationUrl,
  }) : approvedAt = approvedAt ?? DateTime.now();

  factory ClinicalReportModel.fromJson(Map<String, dynamic> json) {
    final report = json['report'] as Map<String, dynamic>? ?? json;
    final doctor = report['doctor'] as Map<String, dynamic>? ?? {};
    final vitals = json['vitals'] as Map<String, dynamic>? ?? {};

    return ClinicalReportModel(
      reportReference: report['reportReference']?.toString() ??
          report['reference']?.toString() ??
          'HV-REP-${json['caseId'] ?? "GEN"}',
      caseId: json['caseId']?.toString() ?? report['caseId']?.toString() ?? '',
      patientName: json['patientName']?.toString() ?? report['patientName']?.toString() ?? '',
      patientAge: json['patientAge']?.toString() ?? report['patientAge']?.toString(),
      doctorName: doctor['name']?.toString() ??
          report['doctorName']?.toString() ??
          report['attendingDoctor']?.toString() ??
          'د. منى سامي',
      doctorLicense: doctor['license']?.toString() ??
          report['doctorLicense']?.toString() ??
          'HV-MD-LIC-20491',
      diagnosis: report['diagnosis']?.toString() ??
          report['certifiedDiagnosis']?.toString() ??
          'فحص سريري تنفسي مستقر مع توصيات للمتابعة',
      recommendations: report['recommendations']?.toString() ??
          'الراحة التامة، ترطيب مجرى التنفس، ومراقبة تشبع الأكسجين يومياً.',
      prescriptions: report['prescriptions']?.toString() ??
          report['prescribedRx']?.toString() ??
          'Salbutamol Inhaler (عند اللزوم)',
      oxygenLevel: (vitals['oxygenLevel'] as num?)?.toDouble() ?? (report['oxygenLevel'] as num?)?.toDouble(),
      approvedAt: report['approvedAt'] != null
          ? DateTime.tryParse(report['approvedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      verificationUrl: report['verificationUrl']?.toString() ??
          '/api/reports/verify/${report['reportReference'] ?? json['caseId']}',
    );
  }

  Map<String, dynamic> toJson() => {
    'reportReference': reportReference,
    'caseId': caseId,
    'patientName': patientName,
    'doctorName': doctorName,
    'doctorLicense': doctorLicense,
    'diagnosis': diagnosis,
    'recommendations': recommendations,
    'prescriptions': prescriptions,
    'oxygenLevel': oxygenLevel,
    'approvedAt': approvedAt.toIso8601String(),
    'verificationUrl': verificationUrl,
  };
}
