import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/assessment_model.dart';
import '../../services/assessment_service.dart';
import '../../services/auth_service.dart';
import '../widgets/vital_input_field.dart';
import 'review_status_screen.dart';

class AssessmentFlowScreen extends StatefulWidget {
  final Locale currentLocale;

  const AssessmentFlowScreen({super.key, required this.currentLocale});

  @override
  State<AssessmentFlowScreen> createState() => _AssessmentFlowScreenState();
}

class _AssessmentFlowScreenState extends State<AssessmentFlowScreen> {
  final _formKey = GlobalKey<FormState>();

  // Vitals Controllers
  final _oxygenController = TextEditingController(text: '96');
  final _temperatureController = TextEditingController(text: '37.0');
  final _respRateController = TextEditingController(text: '18');

  // Symptoms State
  String _breathingDifficulty = 'no';
  String _coughSeverity = 'mild';
  String _chestPain = 'no';
  String _symptomProgression = 'stable';
  int _durationDays = 2;

  // History & Notes State
  String _asthmaCopd = 'unknown';
  String _recentInfection = 'no';
  final _medicationsController = TextEditingController();
  final _notesController = TextEditingController();

  // Consent
  bool _consentAccepted = true;

  // Real-time Vitals Safeguard State
  String? _oxygenWarning;
  Color? _oxygenColor;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _checkOxygenThreshold(_oxygenController.text);
  }

  @override
  void dispose() {
    _oxygenController.dispose();
    _temperatureController.dispose();
    _respRateController.dispose();
    _medicationsController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _checkOxygenThreshold(String value) {
    final numVal = double.tryParse(value);
    if (numVal == null) {
      setState(() {
        _oxygenWarning = null;
        _oxygenColor = null;
      });
      return;
    }

    final l10n = AppLocalizations.of(context);
    if (numVal < 88) {
      setState(() {
        _oxygenWarning = l10n.translate('vital_critical_oxygen');
        _oxygenColor = AppColors.triageCritical;
      });
    } else if (numVal < 92) {
      setState(() {
        _oxygenWarning = l10n.translate('vital_low_oxygen');
        _oxygenColor = AppColors.triageModerate;
      });
    } else {
      setState(() {
        _oxygenWarning = l10n.translate('vital_normal');
        _oxygenColor = AppColors.statusApproved;
      });
    }
  }

  Future<void> _submitAssessment() async {
    if (!_formKey.currentState!.validate()) return;
    final l10n = AppLocalizations.of(context);

    if (!_consentAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.isRtl
                ? 'يرجى الموافقة على معالجة البيانات الصحية للمتابعة'
                : 'Please accept clinical data processing consent to proceed',
          ),
          backgroundColor: AppColors.statusNeedsFollowup,
        ),
      );
      return;
    }

    final spo2 = double.tryParse(_oxygenController.text) ?? 96.0;

    // Trigger Emergency Dialog Safeguard if vitals are critically compromised
    if (spo2 < 88 || _chestPain == 'severe') {
      final proceed = await _showEmergencyAlertModal();
      if (proceed != true) return;
    }

    setState(() {
      _isSubmitting = true;
    });

    final user = AuthService.instance.currentUser;
    final vitals = VitalsData(
      oxygenLevel: spo2,
      temperature: double.tryParse(_temperatureController.text) ?? 37.0,
      respiratoryRate: int.tryParse(_respRateController.text) ?? 18,
    );

    final symptoms = SymptomsData(
      breathingDifficulty: _breathingDifficulty,
      coughSeverity: _coughSeverity,
      durationDays: _durationDays,
      chestPain: _chestPain,
      symptomProgression: _symptomProgression,
      recentInfection: _recentInfection,
      asthmaCopd: _asthmaCopd,
    );

    final consent = PrivacyConsentData(
      accepted: _consentAccepted,
      version: 'HealthVibe-Privacy-v1.0',
    );

    final assessment = AssessmentModel(
      caseId: 'case_${DateTime.now().millisecondsSinceEpoch}',
      patientId: user?.uid ?? 'usr_patient_demo',
      patientName: user?.displayName ?? 'أحمد محمود',
      patientEmail: user?.email ?? 'patient@healthvibe.ai',
      clinicId: user?.clinicId ?? 'clinic_cairo_main',
      status: 'pending',
      vitals: vitals,
      symptoms: symptoms,
      privacyConsent: consent,
      medications: _medicationsController.text.trim().isNotEmpty
          ? _medicationsController.text.trim()
          : null,
      notes: _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null,
    );

    final result = await AssessmentService.instance.submitAssessment(assessment);

    setState(() {
      _isSubmitting = false;
    });

    if (result.isSuccess && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.isRtl
                ? 'تم تسجيل التقييم السريري بنجاح، وهو الآن قيد المراجعة'
                : 'Clinical assessment submitted successfully and placed in review queue',
          ),
          backgroundColor: AppColors.statusApproved,
        ),
      );

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ReviewStatusScreen(currentLocale: widget.currentLocale),
        ),
      );
    }
  }

  Future<bool?> _showEmergencyAlertModal() {
    final l10n = AppLocalizations.of(context);
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Row(
          children: [
            const Icon(Icons.emergency_rounded, color: AppColors.triageCritical, size: 28),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                l10n.translate('emergency_warning_title'),
                style: const TextStyle(
                  color: AppColors.triageCritical,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.translate('emergency_warning_desc'),
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.triageCritical.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.triageCritical.withOpacity(0.3)),
              ),
              child: Text(
                l10n.translate('emergency_hotline'),
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                  color: AppColors.triageCritical,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.translate('cancel')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.triageCritical,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(
              l10n.translate('emergency_proceed'),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: Text(
          l10n.translate('assessment_title'),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.textPrimary,
        elevation: 1,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Section 1: Vital Signs
              _buildSectionHeader(
                title: l10n.translate('step_vitals'),
                icon: Icons.speed_rounded,
              ),
              const SizedBox(height: 12),
              VitalInputField(
                label: l10n.translate('oxygen_level'),
                hint: l10n.translate('oxygen_hint'),
                unit: '%',
                icon: Icons.air_rounded,
                controller: _oxygenController,
                warningMessage: _oxygenWarning,
                warningColor: _oxygenColor,
                onChanged: _checkOxygenThreshold,
                validator: (val) {
                  final n = double.tryParse(val ?? '');
                  if (n == null || n < 50 || n > 100) return 'Valid SpO2 is 50-100%';
                  return null;
                },
              ),
              VitalInputField(
                label: l10n.translate('temperature'),
                hint: l10n.translate('temperature_hint'),
                unit: '°C',
                icon: Icons.thermostat_rounded,
                controller: _temperatureController,
                validator: (val) {
                  final n = double.tryParse(val ?? '');
                  if (n == null || n < 34 || n > 43) return 'Valid temp is 34-43 °C';
                  return null;
                },
              ),
              VitalInputField(
                label: l10n.translate('respiratory_rate'),
                hint: l10n.translate('respiratory_rate_hint'),
                unit: 'breaths/min',
                icon: Icons.waves_rounded,
                controller: _respRateController,
                validator: (val) {
                  final n = int.tryParse(val ?? '');
                  if (n == null || n < 6 || n > 60) return 'Valid rate is 6-60';
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Section 2: Symptoms
              _buildSectionHeader(
                title: l10n.translate('step_symptoms'),
                icon: Icons.sick_outlined,
              ),
              const SizedBox(height: 12),
              _buildRadioCard(
                title: l10n.translate('breathing_difficulty'),
                options: [
                  {'val': 'no', 'label': l10n.translate('none')},
                  {'val': 'mild', 'label': l10n.translate('mild')},
                  {'val': 'moderate', 'label': l10n.translate('moderate')},
                  {'val': 'severe', 'label': l10n.translate('severe')},
                ],
                currentValue: _breathingDifficulty,
                onSelected: (val) => setState(() => _breathingDifficulty = val),
              ),
              const SizedBox(height: 12),
              _buildRadioCard(
                title: l10n.translate('cough_severity'),
                options: [
                  {'val': 'none', 'label': l10n.translate('none')},
                  {'val': 'mild', 'label': l10n.translate('mild')},
                  {'val': 'moderate', 'label': l10n.translate('moderate')},
                  {'val': 'severe', 'label': l10n.translate('severe')},
                ],
                currentValue: _coughSeverity,
                onSelected: (val) => setState(() => _coughSeverity = val),
              ),
              const SizedBox(height: 12),
              _buildRadioCard(
                title: l10n.translate('chest_pain'),
                options: [
                  {'val': 'no', 'label': l10n.translate('none')},
                  {'val': 'mild', 'label': l10n.translate('mild')},
                  {'val': 'severe', 'label': l10n.translate('severe')},
                ],
                currentValue: _chestPain,
                onSelected: (val) => setState(() => _chestPain = val),
              ),
              const SizedBox(height: 12),
              _buildRadioCard(
                title: l10n.translate('symptom_progression'),
                options: [
                  {'val': 'improving', 'label': l10n.translate('improving')},
                  {'val': 'stable', 'label': l10n.translate('stable')},
                  {'val': 'worsening', 'label': l10n.translate('worsening')},
                ],
                currentValue: _symptomProgression,
                onSelected: (val) => setState(() => _symptomProgression = val),
              ),
              const SizedBox(height: 16),

              // Section 3: History & Notes
              _buildSectionHeader(
                title: l10n.translate('step_history'),
                icon: Icons.history_edu_rounded,
              ),
              const SizedBox(height: 12),
              _buildRadioCard(
                title: l10n.translate('asthma_copd'),
                options: [
                  {'val': 'no', 'label': l10n.translate('no')},
                  {'val': 'yes', 'label': l10n.translate('yes')},
                  {'val': 'unknown', 'label': l10n.translate('unknown')},
                ],
                currentValue: _asthmaCopd,
                onSelected: (val) => setState(() => _asthmaCopd = val),
              ),
              const SizedBox(height: 12),
              _buildRadioCard(
                title: l10n.translate('recent_infection'),
                options: [
                  {'val': 'no', 'label': l10n.translate('no')},
                  {'val': 'yes', 'label': l10n.translate('yes')},
                ],
                currentValue: _recentInfection,
                onSelected: (val) => setState(() => _recentInfection = val),
              ),
              const SizedBox(height: 16),

              // Section 4: Consent & Submission
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.cardBorder),
                ),
                child: CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _consentAccepted,
                  onChanged: (val) => setState(() => _consentAccepted = val == true),
                  title: Text(
                    l10n.translate('privacy_consent_title'),
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  subtitle: Text(
                    l10n.translate('privacy_consent_desc'),
                    style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  ),
                  activeColor: AppColors.primary,
                  controlAffinity: ListTileControlAffinity.leading,
                ),
              ),
              const SizedBox(height: 24),

              // Submit Button
              ElevatedButton(
                onPressed: _isSubmitting ? null : _submitAssessment,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 2,
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.send_rounded, size: 18),
                          const SizedBox(width: 8),
                          Text(
                            l10n.translate('submit'),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader({required String title, required IconData icon}) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppColors.primary),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
      ],
    );
  }

  Widget _buildRadioCard({
    required String title,
    required List<Map<String, String>> options,
    required String currentValue,
    required ValueChanged<String> onSelected,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8.0,
            runSpacing: 8.0,
            children: options.map((opt) {
              final isSelected = opt['val'] == currentValue;
              return ChoiceChip(
                label: Text(opt['label']!),
                selected: isSelected,
                selectedColor: AppColors.primaryLight,
                labelStyle: TextStyle(
                  color: isSelected ? AppColors.primaryDark : AppColors.textSecondary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  fontSize: 12,
                ),
                side: BorderSide(
                  color: isSelected ? AppColors.primary : AppColors.cardBorder,
                ),
                onSelected: (_) => onSelected(opt['val']!),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
