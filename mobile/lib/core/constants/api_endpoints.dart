class ApiEndpoints {
  // In development, default to local backend or Android emulator loopback
  static String baseUrl = 'http://10.0.2.2:4000'; // Default Android emulator host; can be customized

  // Auth & Profile
  static String get login => '$baseUrl/api/auth/profile';
  static String get profile => '$baseUrl/api/auth/profile';
  static String get syncRole => '$baseUrl/api/user/sync-role';
  static String get logout => '$baseUrl/api/auth/logout';

  // Assessments
  static String get newAssessment => '$baseUrl/api/assessment/new';
  static String latestAssessment(String patientId) => '$baseUrl/api/patient/$patientId/assessments/latest';
  static String compareAssessments(String patientId) => '$baseUrl/api/patient/$patientId/assessments/compare';
  static String medicalSummary(String patientId) => '$baseUrl/api/patient/$patientId/medical-summary';

  // Cases & Review Status
  static String get cases => '$baseUrl/api/cases';
  static String caseDetail(String caseId) => '$baseUrl/api/cases/$caseId';

  // Reports
  static String reportDoctorIdentity(String caseId) => '$baseUrl/api/reports/$caseId/doctor-identity';
  static String verifyReport(String refOrId) => '$baseUrl/api/reports/verify/$refOrId';

  // Push Notifications
  static String get pushSubscription => '$baseUrl/api/notifications/push-subscription';
  static String get notificationPreferences => '$baseUrl/api/notifications/preferences';
  static String get notificationHistory => '$baseUrl/api/notifications/history';
}
