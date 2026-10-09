import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/user_session.dart';
import '../../services/auth_service.dart';
import '../../services/notification_service.dart';
import '../widgets/language_selector.dart';
import '../widgets/status_badge.dart';
import 'assessment_flow_screen.dart';
import 'review_status_screen.dart';
import 'report_detail_screen.dart';
import 'sign_in_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  final Locale currentLocale;
  final ValueChanged<Locale> onLocaleChanged;

  const HomeDashboardScreen({
    super.key,
    required this.currentLocale,
    required this.onLocaleChanged,
  });

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  UserSession? _user;
  bool _pushNotificationsActive = false;

  @override
  void initState() {
    super.initState();
    _user = AuthService.instance.currentUser;
    _pushNotificationsActive = NotificationService.instance.isRegistered;
  }

  Future<void> _handleSignOut() async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.translate('logout')),
        content: Text(
          l10n.isRtl
              ? 'هل أنت متأكد من رغبتك في تسجيل الخروج؟ سيتم مسح الرموز الأمنية المشفرة من الجهاز.'
              : 'Are you sure you want to sign out? Secure session tokens will be purged.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.translate('cancel')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.statusNeedsFollowup),
            child: Text(l10n.translate('confirm'), style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await AuthService.instance.signOut();
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => SignInScreen(
              currentLocale: widget.currentLocale,
              onLocaleChanged: widget.onLocaleChanged,
            ),
          ),
        );
      }
    }
  }

  Future<void> _enablePushNotifications() async {
    final l10n = AppLocalizations.of(context);
    final token = 'fcm_token_mob_${DateTime.now().millisecondsSinceEpoch}';

    final res = await NotificationService.instance.registerDeviceToken(
      token: token,
      explicitConsent: true,
    );

    if (res.isSuccess && mounted) {
      setState(() {
        _pushNotificationsActive = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.translate('notifications_enabled_toast')),
          backgroundColor: AppColors.statusApproved,
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final displayName = _user?.displayName.isNotEmpty == true
        ? _user!.displayName
        : (l10n.isRtl ? 'المستخدم السريري' : 'Clinical User');
    final role = _user?.role ?? 'patient';
    final isDoc = _user?.isDoctor == true;

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 1,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.health_and_safety, color: AppColors.primary, size: 20),
            ),
            const SizedBox(width: 8),
            Text(
              l10n.translate('app_name'),
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10.0),
            child: LanguageSelector(
              currentLocale: widget.currentLocale,
              onLocaleChanged: widget.onLocaleChanged,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: AppColors.textSecondary),
            tooltip: l10n.translate('logout'),
            onPressed: _handleSignOut,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Greeting Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.primary, AppColors.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.25),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: Colors.white.withOpacity(0.2),
                        radius: 24,
                        child: Icon(
                          isDoc ? Icons.medical_services : Icons.person,
                          color: Colors.white,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              displayName,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _user?.email ?? '',
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.85),
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isDoc ? (l10n.isRtl ? 'طبيب معتمد' : 'Doctor') : (l10n.isRtl ? 'مريض مسجل' : 'Patient'),
                          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Notification Opt-in Card
            if (!_pushNotificationsActive) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.secondary.withOpacity(0.3)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.02),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.secondary.withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.notifications_active_outlined, color: AppColors.secondary, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.translate('notification_permission_title'),
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            l10n.translate('push_phi_protection_note'),
                            style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: _enablePushNotifications,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.secondary,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: Text(
                        l10n.translate('enable_notifications'),
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Core Clinical Journeys Header
            Text(
              l10n.isRtl ? 'الخدمات السريرية المتاحة' : 'Clinical Services',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),

            // Journey 1: New Assessment
            _buildJourneyCard(
              title: l10n.translate('assessment_title'),
              subtitle: l10n.translate('assessment_subtitle'),
              icon: Icons.monitor_heart_outlined,
              iconColor: AppColors.primary,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => AssessmentFlowScreen(currentLocale: widget.currentLocale),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),

            // Journey 2: Review Status
            _buildJourneyCard(
              title: l10n.translate('review_status'),
              subtitle: l10n.isRtl
                  ? 'متابعة مراحل تدقيق الحالة واعتماد الطبيب في الوقت الفعلي'
                  : 'Track real-time review progress and doctor assignment',
              icon: Icons.checklist_rtl_rounded,
              iconColor: AppColors.statusPending,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ReviewStatusScreen(currentLocale: widget.currentLocale),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),

            // Journey 3: Certified Medical Reports
            _buildJourneyCard(
              title: l10n.translate('reports'),
              subtitle: l10n.isRtl
                  ? 'استعراض التقارير المعتمدة وترخيص الطبيب ورمز التحقق'
                  : 'View certified physician reports and verification seal',
              icon: Icons.verified_user_outlined,
              iconColor: AppColors.statusApproved,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ReportDetailScreen(
                      caseId: 'case_2026_demo_01',
                      currentLocale: widget.currentLocale,
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 20),

            // Recent Case Status Snippet
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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        l10n.isRtl ? 'آخر تقييم سريري' : 'Latest Clinical Assessment',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      const StatusBadge(status: 'approved', isCompact: true),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _buildVitalSnippet(
                        label: 'SpO2',
                        value: '96%',
                        color: AppColors.statusApproved,
                      ),
                      const SizedBox(width: 16),
                      _buildVitalSnippet(
                        label: l10n.isRtl ? 'الحرارة' : 'Temp',
                        value: '37.1 °C',
                        color: AppColors.primary,
                      ),
                      const SizedBox(width: 16),
                      _buildVitalSnippet(
                        label: l10n.isRtl ? 'التنفس' : 'Resp Rate',
                        value: '18 /min',
                        color: AppColors.primary,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildJourneyCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.cardBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconColor, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios_rounded, size: 16, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildVitalSnippet({
    required String label,
    required String value,
    required Color color,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color),
        ),
      ],
    );
  }
}
