import '../core/constants/api_endpoints.dart';
import '../core/network/api_client.dart';
import '../models/assessment_model.dart';
import 'assessment_service.dart';

class ReviewStatusService {
  static final ReviewStatusService instance = ReviewStatusService._internal();
  final ApiClient _apiClient;
  final AssessmentService _assessmentService;

  ReviewStatusService._internal({ApiClient? apiClient, AssessmentService? assessmentService})
      : _apiClient = apiClient ?? ApiClient.instance,
        _assessmentService = assessmentService ?? AssessmentService.instance;

  factory ReviewStatusService.withMocks({ApiClient? apiClient, AssessmentService? assessmentService}) =>
      ReviewStatusService._internal(apiClient: apiClient, assessmentService: assessmentService);

  /// Fetches cases list for patient or doctor queue
  Future<ApiResponse<List<AssessmentModel>>> getPatientCases({String? patientId}) async {
    final response = await _apiClient.get(ApiEndpoints.cases, requiresAuth: true);

    if (response.isSuccess && response.data != null) {
      final listRaw = response.data!['cases'] as List<dynamic>? ?? [];
      final models = listRaw
          .map((item) => AssessmentModel.fromJson(item as Map<String, dynamic>))
          .toList();
      return ApiResponse(isSuccess: true, statusCode: response.statusCode, data: models);
    }

    // Return current local session cases or realistic seed case if list is empty
    final localCases = List<AssessmentModel>.from(_assessmentService.localCases);
    if (localCases.isEmpty) {
      localCases.add(
        AssessmentModel(
          caseId: 'case_2026_demo_01',
          patientId: patientId ?? 'usr_patient_demo',
          patientName: 'أحمد محمود',
          patientEmail: 'patient@example.com',
          assignedDoctorId: 'usr_doctor_mona',
          assignedDoctorName: 'د. منى سامي',
          clinicId: 'clinic_cairo_main',
          clinicName: 'مركز القاهرة التخصصي للصدر',
          status: 'approved',
          vitals: VitalsData(
            oxygenLevel: 96,
            temperature: 37.1,
            respiratoryRate: 18,
          ),
          symptoms: SymptomsData(
            breathingDifficulty: 'mild',
            coughSeverity: 'moderate',
            durationDays: 3,
            chestPain: 'no',
            symptomProgression: 'improving',
          ),
          privacyConsent: PrivacyConsentData(),
          aiTriage: AiTriageData(
            priority: 'normal',
            risk: 'منخفض',
            riskEn: 'Low',
            ruleScorePoints: 2,
          ),
          createdAt: DateTime.now().subtract(const Duration(hours: 4)),
        ),
      );
    }

    return ApiResponse(isSuccess: true, statusCode: 200, data: localCases);
  }

  /// Simulates doctor transition for testing review lifecycle
  Future<AssessmentModel?> simulateDoctorApproval(String caseId) async {
    final cases = _assessmentService.localCases;
    for (int i = 0; i < cases.length; i++) {
      if (cases[i].caseId == caseId) {
        final existing = cases[i];
        final updated = AssessmentModel(
          schemaVersion: existing.schemaVersion,
          caseId: existing.caseId,
          patientId: existing.patientId,
          patientName: existing.patientName,
          patientEmail: existing.patientEmail,
          assignedDoctorId: existing.assignedDoctorId ?? 'usr_doctor_mona',
          assignedDoctorName: existing.assignedDoctorName ?? 'د. منى سامي',
          clinicId: existing.clinicId,
          clinicName: existing.clinicName,
          status: 'approved',
          vitals: existing.vitals,
          symptoms: existing.symptoms,
          privacyConsent: existing.privacyConsent,
          aiTriage: existing.aiTriage,
          medications: existing.medications,
          notes: existing.notes,
          createdAt: existing.createdAt,
        );
        return updated;
      }
    }
    return null;
  }
}
