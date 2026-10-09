import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/clinical_report_model.dart';
import '../../services/report_service.dart';

class ReportDetailScreen extends StatefulWidget {
  final String caseId;
  final Locale currentLocale;

  const ReportDetailScreen({
    super.key,
    required this.caseId,
    required this.currentLocale,
  });

  @override
  State<ReportDetailScreen> createState() => _ReportDetailScreenState();
}

class _ReportDetailScreenState extends State<ReportDetailScreen> {
  bool _isLoading = true;
  ClinicalReportModel? _report;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    _fetchReport();
  }

  Future<void> _fetchReport() async {
    setState(() => _isLoading = true);
    final res = await ReportService.instance.getReportForCase(widget.caseId);
    if (mounted) {
      setState(() {
        _isLoading = false;
        _report = res.data;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: Text(
          l10n.translate('report_title'),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.textPrimary,
        elevation: 1,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _report == null
              ? Center(child: Text(l10n.translate('error')))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Certified Header Banner
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.statusApproved.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: AppColors.statusApproved.withOpacity(0.3),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: AppColors.statusApproved,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.verified_rounded,
                                color: Colors.white,
                                size: 24,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    l10n.translate('report_title'),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15,
                                      color: AppColors.statusApproved,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${l10n.translate('report_reference')}: ${_report!.reportReference}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textPrimary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Attending Physician Provenance Card
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.cardBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.badge_outlined, color: AppColors.primary, size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  l10n.translate('doctor_credentials'),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                            const Divider(height: 20, color: AppColors.cardBorder),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      l10n.translate('doctor_name'),
                                      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _report!.doctorName,
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                    ),
                                  ],
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      l10n.translate('doctor_license'),
                                      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                                    ),
                                    const SizedBox(height: 2),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.primaryLight,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        _report!.doctorLicense,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 12,
                                          color: AppColors.primaryDark,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Official Diagnosis Section
                      _buildSectionCard(
                        title: l10n.translate('official_diagnosis'),
                        icon: Icons.assignment_turned_in_outlined,
                        content: _report!.diagnosis,
                        color: AppColors.primary,
                      ),
                      const SizedBox(height: 16),

                      // Prescribed Rx & Treatment
                      _buildSectionCard(
                        title: l10n.translate('prescribed_rx'),
                        icon: Icons.medication_outlined,
                        content: _report!.prescriptions,
                        color: AppColors.secondary,
                      ),
                      const SizedBox(height: 16),

                      // Clinical Recommendations
                      _buildSectionCard(
                        title: l10n.isRtl ? 'التوصيات السريرية والمتابعة' : 'Clinical Recommendations',
                        icon: Icons.lightbulb_outline_rounded,
                        content: _report!.recommendations,
                        color: AppColors.statusPending,
                      ),
                      const SizedBox(height: 16),

                      // Verification & Integrity Box
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.cardBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.qr_code_2_rounded, color: AppColors.primary, size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  l10n.translate('verify_report_online'),
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: AppColors.backgroundLight,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'https://healthvibe.ai${_report!.verificationUrl}',
                                      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  TextButton.icon(
                                    onPressed: () {
                                      setState(() => _copied = true);
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            l10n.isRtl
                                                ? 'تم نسخ رابط التحقق بنجاح'
                                                : 'Verification link copied to clipboard',
                                          ),
                                          duration: const Duration(seconds: 2),
                                        ),
                                      );
                                    },
                                    icon: Icon(_copied ? Icons.check : Icons.copy, size: 14),
                                    label: Text(_copied ? 'Copied' : 'Copy', style: const TextStyle(fontSize: 11)),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              l10n.translate('report_disclaimer'),
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required String content,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            content,
            style: const TextStyle(fontSize: 13, height: 1.5, color: AppColors.textPrimary),
          ),
        ],
      ),
    );
  }
}
