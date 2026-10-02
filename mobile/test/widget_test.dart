import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:health_vibe_mobile/main.dart';
import 'package:health_vibe_mobile/core/localization/app_localizations.dart';
import 'package:health_vibe_mobile/ui/widgets/status_badge.dart';
import 'package:health_vibe_mobile/ui/widgets/vital_input_field.dart';

void main() {
  group('Mobile Widget Rendering & UI Component Tests', () {
    testWidgets('Renders HealthVibeMobileApp with Sign-In screen by default', (WidgetTester tester) async {
      await tester.pumpWidget(
        const HealthVibeMobileApp(
          initialLocale: Locale('ar'),
          hasActiveSession: false,
        ),
      );
      await tester.pumpAndSettle();

      // Verify Brand title is rendered
      expect(find.text('Health Vibe AI'), findsOneWidget);

      // Verify Sign-in button exists
      expect(find.text('دخول إلى المنظومة'), findsOneWidget);

      // Verify Demo login buttons exist
      expect(find.text('دخول تجريبي (مريض)'), findsOneWidget);
      expect(find.text('دخول تجريبي (طبيب معتمد)'), findsOneWidget);
    });

    testWidgets('Renders StatusBadge with correct Arabic label and styling', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const Scaffold(
            body: Center(
              child: StatusBadge(status: 'approved'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تم الاعتماد الطبي بنجاح'), findsOneWidget);
      expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    });

    testWidgets('VitalInputField displays label, unit, and warning cue', (WidgetTester tester) async {
      final controller = TextEditingController(text: '85');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: VitalInputField(
              label: 'تشبع الأكسجين',
              hint: '95',
              unit: '%',
              icon: Icons.air,
              controller: controller,
              warningMessage: 'نقص أكسجين حاد',
              warningColor: Colors.red,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تشبع الأكسجين'), findsOneWidget);
      expect(find.text('%'), findsOneWidget);
      expect(find.text('نقص أكسجين حاد'), findsOneWidget);
    });
  });
}
