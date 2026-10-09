import 'package:flutter_test/flutter_test.dart';
import 'package:health_vibe_mobile/core/security/secure_storage_service.dart';
import 'package:health_vibe_mobile/services/notification_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('NotificationService & PHI Isolation Tests', () {
    late NotificationService service;

    setUp(() async {
      await SecureStorageService.instance.initialize(customKey: 'TestNotificationVaultKey_2026');
      service = NotificationService.instance;
    });

    test('Requires explicit user consent for push token registration', () async {
      final res = await service.registerDeviceToken(
        token: 'fcm_token_123',
        explicitConsent: false,
      );

      expect(res.isSuccess, isFalse);
      expect(res.statusCode, equals(400));
      expect(res.errorMessage, contains('consent is required'));
    });

    test('Successfully registers device token when explicit consent is granted', () async {
      final res = await service.registerDeviceToken(
        token: 'fcm_token_abc_mobile',
        explicitConsent: true,
        customDeviceId: 'device_test_phone_01',
      );

      expect(res.isSuccess, isTrue);
      expect(service.isRegistered, isTrue);
      expect(service.currentDeviceId, equals('device_test_phone_01'));

      final storedToken = await SecureStorageService.instance.getPushToken();
      expect(storedToken, equals('fcm_token_abc_mobile'));
    });

    test('Unregisters device token on sign out to prevent cross-account leakage', () async {
      await service.registerDeviceToken(
        token: 'fcm_token_temp',
        explicitConsent: true,
      );
      expect(service.isRegistered, isTrue);

      await service.unregisterOnSignOut();

      expect(service.isRegistered, isFalse);
      expect(await SecureStorageService.instance.getPushToken(), isNull);
    });

    test('Enforces zero-PHI push notification scrubbing rule', () {
      // Safe, concise alerts allowed by security governance
      expect(NotificationService.isPayloadPhiSafe('Medical update available. Sign in to review.'), isTrue);
      expect(NotificationService.isPayloadPhiSafe('تم تحديث حالتك السريرية. يرجى الدخول للمراجعة.'), isTrue);

      // Sensitive leaks containing diagnosis or SpO2 must be blocked
      expect(NotificationService.isPayloadPhiSafe('Patient has severe asthma and SpO2 is 85%'), isFalse);
      expect(NotificationService.isPayloadPhiSafe('تم تسجيل تشخيص ربو حاد ونقص أكسجين'), isFalse);
      expect(NotificationService.isPayloadPhiSafe('Your COVID pneumonia diagnosis is certified'), isFalse);
    });
  });
}
