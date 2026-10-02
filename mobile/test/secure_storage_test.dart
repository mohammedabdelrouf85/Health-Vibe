import 'package:flutter_test/flutter_test.dart';
import 'package:health_vibe_mobile/core/security/secure_storage_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SecureStorageService Vault Tests', () {
    late SecureStorageService storage;

    setUp(() async {
      storage = SecureStorageService.instance;
      await storage.initialize(customKey: 'TestCustomMasterKey_2026_SecureVault');
      await storage.wipeAll();
    });

    test('writes and reads encrypted values successfully', () async {
      await storage.write(key: 'secret_jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      final retrieved = await storage.read(key: 'secret_jwt');
      expect(retrieved, equals('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    });

    test('saveAuthSession persists tokens and user role securely', () async {
      await storage.saveAuthSession(
        idToken: 'token_abc123',
        userId: 'usr_patient_99',
        role: 'patient',
        email: 'patient@example.com',
      );

      expect(await storage.getIdToken(), equals('token_abc123'));
      expect(await storage.getUserId(), equals('usr_patient_99'));
      expect(await storage.getUserRole(), equals('patient'));
      expect(await storage.hasValidSession(), isTrue);
    });

    test('wipeAll purges all authentication tokens on logout', () async {
      await storage.saveAuthSession(
        idToken: 'active_token',
        userId: 'usr_patient_44',
        role: 'patient',
      );
      expect(await storage.hasValidSession(), isTrue);

      await storage.wipeAll();

      expect(await storage.getIdToken(), isNull);
      expect(await storage.getUserId(), isNull);
      expect(await storage.hasValidSession(), isFalse);
    });
  });
}
