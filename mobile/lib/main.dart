import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'core/constants/app_colors.dart';
import 'core/localization/app_localizations.dart';
import 'core/security/secure_storage_service.dart';
import 'services/auth_service.dart';
import 'ui/screens/home_dashboard_screen.dart';
import 'ui/screens/sign_in_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize secure storage vault
  await SecureStorageService.instance.initialize();

  // Attempt to restore existing authenticated session
  final session = await AuthService.instance.restoreSession();

  // Load persisted language preference or default to Arabic
  final savedLang = await SecureStorageService.instance.getLanguage();
  final initialLocale = Locale(savedLang ?? 'ar');

  runApp(HealthVibeMobileApp(
    initialLocale: initialLocale,
    hasActiveSession: session != null,
  ));
}

class HealthVibeMobileApp extends StatefulWidget {
  final Locale initialLocale;
  final bool hasActiveSession;

  const HealthVibeMobileApp({
    super.key,
    required this.initialLocale,
    required this.hasActiveSession,
  });

  @override
  State<HealthVibeMobileApp> createState() => _HealthVibeMobileAppState();
}

class _HealthVibeMobileAppState extends State<HealthVibeMobileApp> {
  late Locale _currentLocale;

  @override
  void initState() {
    super.initState();
    _currentLocale = widget.initialLocale;
  }

  void _changeLocale(Locale newLocale) {
    setState(() {
      _currentLocale = newLocale;
    });
    SecureStorageService.instance.write(
      key: SecureStorageService.keyLanguage,
      value: newLocale.languageCode,
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Health Vibe AI',
      debugShowCheckedModeBanner: false,
      locale: _currentLocale,
      supportedLocales: const [
        Locale('ar'),
        Locale('en'),
      ],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primary,
          secondary: AppColors.secondary,
          surface: AppColors.surfaceLight,
        ),
        fontFamily: _currentLocale.languageCode == 'ar' ? 'Cairo' : 'Inter',
        scaffoldBackgroundColor: AppColors.backgroundLight,
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
        ),
      ),
      home: widget.hasActiveSession
          ? HomeDashboardScreen(
              currentLocale: _currentLocale,
              onLocaleChanged: _changeLocale,
            )
          : SignInScreen(
              currentLocale: _currentLocale,
              onLocaleChanged: _changeLocale,
            ),
    );
  }
}
