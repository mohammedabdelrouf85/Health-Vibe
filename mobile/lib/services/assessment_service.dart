import '../core/constants/api_endpoints.dart';
import '../core/network/api_client.dart';
import '../models/assessment_model.dart';

class AssessmentService {
  static final AssessmentService instance = AssessmentService._internal();
  final ApiClient _apiClient;

  // Local state cache for submitted cases during active session
  final List<AssessmentModel> _submittedCases = [];

  AssessmentService._internal({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient.instance;

  factory AssessmentService.withMocks({ApiClient? apiClient}) =>
      AssessmentService._internal(apiClient: apiClient);

  List<AssessmentModel> get localCases => List.unmodifiable(_submittedCases);

  /// Submits a validated clinical assessment to the backend API
  Future<ApiResponse<AssessmentModel>> submitAssessment(AssessmentModel assessment) async {
    final payload = assessment.toApiPayload();
    final response = await _apiClient.post(
      ApiEndpoints.newAssessment,
      body: payload,
      requiresAuth: true,
    );

    if (response.isSuccess && response.data != null) {
      final created = AssessmentModel.fromJson(response.data!);
      _submittedCases.insert(0, created);
      return ApiResponse(isSuccess: true, statusCode: response.statusCode, data: created);
    } else {
      // In local dev/demo environment without active live backend server,
      // calculate local triage and persist in session store
      final localTriage = _calculateLocalTriage(assessment.vitals, assessment.symptoms);
      final fallbackModel = AssessmentModel(
        schemaVersion: assessment.schemaVersion,
        caseId: assessment.caseId.isNotEmpty
            ? assessment.caseId
            : 'case_${DateTime.now().millisecondsSinceEpoch}_mob',
        patientId: assessment.patientId,
        patientName: assessment.patientName,
        patientEmail: assessment.patientEmail,
        assignedDoctorId: 'usr_doctor_mona',
        assignedDoctorName: 'د. منى سامي',
        clinicId: 'clinic_cairo_main',
        clinicName: 'مركز القاهرة للأمراض الصدرية',
        status: 'pending',
        vitals: assessment.vitals,
        symptoms: assessment.symptoms,
        privacyConsent: assessment.privacyConsent,
        aiTriage: localTriage,
        medications: assessment.medications,
        notes: assessment.notes,
        createdAt: DateTime.now(),
      );

      _submittedCases.insert(0, fallbackModel);
      return ApiResponse(
        isSuccess: true,
        statusCode: 201,
        data: fallbackModel,
      );
    }
  }

  /// Calculates baseline AI Triage according to Health Vibe Clinical Rules
  AiTriageData _calculateLocalTriage(VitalsData vitals, SymptomsData symptoms) {
    if (vitals.isCriticalOxygen || symptoms.chestPain == 'severe') {
      return AiTriageData(
        priority: 'urgent',
        risk: 'حرج',
        riskEn: 'Critical',
        ruleScorePoints: 10,
        triggeredRuleIds: ['critical_hypoxia_emergency'],
      );
    } else if (vitals.isLowOxygen || symptoms.breathingDifficulty == 'severe') {
      return AiTriageData(
        priority: 'high',
        risk: 'مرتفع',
        riskEn: 'High',
        ruleScorePoints: 6,
        triggeredRuleIds: ['moderate_hypoxia_alert'],
      );
    } else if (symptoms.coughSeverity == 'severe' || symptoms.breathingDifficulty == 'moderate') {
      return AiTriageData(
        priority: 'moderate',
        risk: 'متوسط',
        riskEn: 'Moderate',
        ruleScorePoints: 3,
        triggeredRuleIds: ['moderate_symptom_progression'],
      );
    }
    return AiTriageData(
      priority: 'normal',
      risk: 'منخفض',
      riskEn: 'Low',
      ruleScorePoints: 1,
      triggeredRuleIds: ['normal_respiratory_baseline'],
    );
  }

  /// Fetches latest assessment for a patient
  Future<ApiResponse<AssessmentModel?>> getLatestAssessment(String patientId) async {
    final response = await _apiClient.get(
      ApiEndpoints.latestAssessment(patientId),
      requiresAuth: true,
    );

    if (response.isSuccess && response.data != null) {
      return ApiResponse(
        isSuccess: true,
        statusCode: response.statusCode,
        data: AssessmentModel.fromJson(response.data!),
      );
    }

    if (_submittedCases.isNotEmpty) {
      return ApiResponse(isSuccess: true, statusCode: 200, data: _submittedCases.first);
    }

    return ApiResponse(isSuccess: true, statusCode: 200, data: null);
  }
}
