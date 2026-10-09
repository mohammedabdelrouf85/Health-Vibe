import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/assessment_model.dart';
import '../../services/review_status_service.dart';
import '../widgets/status_badge.dart';
import 'report_detail_screen.dart';
import 'assessment_flow_screen.dart';

class ReviewStatusScreen extends StatefulWidget {
  final Locale currentLocale;

  const ReviewStatusScreen({super.key, required this.currentLocale});

  @override
  State<ReviewStatusScreen> createState() => _ReviewStatusScreenState();
}

class _ReviewStatusScreenState extends State<ReviewStatusScreen> {
  bool _isLoading = true;
  List<AssessmentModel> _cases = [];
  String _selectedFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadCases();
  }

  Future<void> _loadCases() async {
    setState(() => _isLoading = true);
    final response = await ReviewStatusService.instance.getPatientCases();
    if (mounted) {
      setState(() {
        _isLoading = false;
        if (response.isSuccess && response.data != null) {
          _cases = response.data!;
        }
      });
    }
  }

  List<AssessmentModel> get _filteredCases {
    if (_selectedFilter == 'all') return _cases;
    return _cases.where((c) => c.status == _selectedFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: Text(
          l10n.translate('review_status'),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.textPrimary,
        elevation: 1,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: l10n.translate('retry'),
            onPressed: _loadCases,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _loadCases,
              color: AppColors.primary,
              child: Column(
                children: [
                  // Filter Chips
                  Container(
                    color: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _buildFilterChip(
                            label: l10n.isRtl ? 'الكل' : 'All',
                            filterValue: 'all',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterChip(
                            label: l10n.translate('status_pending'),
                            filterValue: 'pending',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterChip(
                            label: l10n.translate('status_under_review'),
                            filterValue: 'under_review',
                          ),
                          const SizedBox(width: 8),
                          _buildFilterChip(
                            label: l10n.translate('status_approved'),
                            filterValue: 'approved',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.cardBorder),

                  // Cases List
                  Expanded(
                    child: _filteredCases.isEmpty
                        ? _buildEmptyState(l10n)
                        : ListView.separated(
                            padding: const EdgeInsets.all(16.0),
                            itemCount: _filteredCases.length,
                            separatorBuilder: (ctx, idx) => const SizedBox(height: 12),
                            itemBuilder: (ctx, index) {
                              return _buildCaseCard(_filteredCases[index], l10n);
                            },
                          ),
                  ),
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => AssessmentFlowScreen(currentLocale: widget.currentLocale),
            ),
          );
        },
        backgroundColor: AppColors.primary,
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        label: Text(
          l10n.translate('start_new_assessment'),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  Widget _buildFilterChip({required String label, required String filterValue}) {
    final isSelected = _selectedFilter == filterValue;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      selectedColor: AppColors.primaryLight,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.primaryDark : AppColors.textSecondary,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
        fontSize: 12,
      ),
      side: BorderSide(
        color: isSelected ? AppColors.primary : AppColors.cardBorder,
      ),
      onSelected: (_) => setState(() => _selectedFilter = filterValue),
    );
  }

  Widget _buildCaseCard(AssessmentModel caseItem, AppLocalizations l10n) {
    final isApproved = caseItem.status == 'approved';
    final doctorName = caseItem.assignedDoctorName ??
        (l10n.isRtl ? 'في انتظار إسناد الطبيب' : 'Awaiting Physician Assignment');

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.tag_rounded, size: 16, color: AppColors.textSecondary),
                  Text(
                    caseItem.caseId,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
              StatusBadge(status: caseItem.status, isCompact: true),
            ],
          ),
          const SizedBox(height: 12),

          // Assigned Doctor & Clinic
          Row(
            children: [
              const Icon(Icons.medical_services_outlined, size: 16, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${l10n.translate('assigned_doctor')}: $doctorName',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
          if (caseItem.clinicName != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.local_hospital_outlined, size: 16, color: AppColors.textSecondary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${l10n.translate('assigned_clinic')}: ${caseItem.clinicName}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),

          // Vitals Summary Row
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.backgroundLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildMetric(
                  'SpO2',
                  '${caseItem.vitals.oxygenLevel.toInt()}%',
                  caseItem.vitals.isCriticalOxygen
                      ? AppColors.triageCritical
                      : (caseItem.vitals.isLowOxygen
                          ? AppColors.triageModerate
                          : AppColors.statusApproved),
                ),
                _buildMetric(
                  l10n.isRtl ? 'الحرارة' : 'Temp',
                  '${caseItem.vitals.temperature}°C',
                  AppColors.textPrimary,
                ),
                _buildMetric(
                  l10n.isRtl ? 'التنفس' : 'Resp Rate',
                  '${caseItem.vitals.respiratoryRate}/min',
                  AppColors.textPrimary,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Action Button
          if (isApproved) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ReportDetailScreen(
                        caseId: caseItem.caseId,
                        currentLocale: widget.currentLocale,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.verified_rounded, size: 18, color: Colors.white),
                label: Text(
                  l10n.isRtl ? 'عرض التقرير الطبي المعتمد' : 'View Certified Report',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.statusApproved,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ] else ...[
            Row(
              children: [
                const Icon(Icons.sync_rounded, size: 14, color: AppColors.statusPending),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    l10n.isRtl
                        ? 'الحالة في انتظار إتمام فحص وتصديق الطبيب الاستشاري'
                        : 'Awaiting clinical review and certification by physician',
                    style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMetric(String label, String value, Color color) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: color),
        ),
      ],
    );
  }

  Widget _buildEmptyState(AppLocalizations l10n) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.assignment_late_outlined, size: 56, color: AppColors.textMuted),
            const SizedBox(height: 16),
            Text(
              l10n.translate('no_active_cases'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
