/**
 * Health Vibe AI - Private Cloud Storage, Encryption & Ephemeral Signed URLs Backend Test Suite
 * Benchmark: Amwell Telehealth Platform (https://amwell.com/)
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  cloudStorageSignedUrlsService,
  SCAN_STATUS,
  ENCRYPTION_MODES,
  DEFAULT_TTL_SECONDS
} = require('../backend/cloud-storage-signed-urls-service');

async function runTestSuite() {
  console.log('\n==================================================================');
  console.log('🔒 HEALTH VIBE AI: PRIVATE CLOUD STORAGE & SIGNED URLS BACKEND SUITE');
  console.log('   Benchmark: Amwell Telehealth Standard (AES-256 & 15m Ephemeral URLs)');
  console.log('==================================================================\n');

  let passed = 0;
  cloudStorageSignedUrlsService.resetStoreForTesting();

  const mockPatient = { uid: 'patient_amwell_001', role: 'patient' };
  const mockDoctor = { uid: 'doctor_pulmo_001', role: 'doctor' };
  const mockAdmin = { uid: 'admin_001', role: 'super_admin' };
  const mockAttacker = { uid: 'unauthorized_stranger', role: 'patient' };

  // TEST 1: Service Initialization & Security Constants
  try {
    console.log('▶ TEST 1: Service Initialization & Security Constants');
    assert.strictEqual(typeof cloudStorageSignedUrlsService.registerPrivateUpload, 'function');
    assert.strictEqual(typeof cloudStorageSignedUrlsService.generateSignedUrl, 'function');
    assert.strictEqual(typeof cloudStorageSignedUrlsService.verifySignedToken, 'function');
    assert.strictEqual(SCAN_STATUS.CLEAN, 'clean');
    assert.strictEqual(SCAN_STATUS.SCANNING, 'scanning');
    assert.strictEqual(SCAN_STATUS.INFECTED, 'infected');
    assert.strictEqual(ENCRYPTION_MODES.AES_256_GCM, 'AES-256-GCM');
    assert.strictEqual(DEFAULT_TTL_SECONDS, 900); // 15 minutes (Amwell standard)
    console.log('  ✓ Service properly initialized with Amwell standard defaults.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // TEST 2: Private Cloud Bucket Upload Registration & AES-256 Encryption
  let uploadResult = null;
  try {
    console.log('▶ TEST 2: Private Cloud Bucket Registration & At-Rest Encryption');
    uploadResult = await cloudStorageSignedUrlsService.registerPrivateUpload({
      patientId: mockPatient.uid,
      fileName: 'Chest_XRay_PA_Lateral.png',
      fileSize: 2048500,
      mimeType: 'image/png',
      category: 'radiology_cxr',
      source: 'patient_vault'
    });

    assert.ok(uploadResult.fileId.startsWith('sec_file_'), 'File ID should have secure prefix');
    assert.strictEqual(uploadResult.patientId, mockPatient.uid);
    assert.strictEqual(uploadResult.bucketName, 'health-vibe-private-vault');
    assert.strictEqual(uploadResult.encryption.mode, 'AES-256-GCM');
    assert.strictEqual(uploadResult.encryption.encryptedAtRest, true);
    assert.strictEqual(uploadResult.scanStatus, SCAN_STATUS.CLEAN);
    assert.strictEqual(uploadResult.availability, 'available');
    assert.strictEqual(uploadResult.malwareScanResult.clean, true);
    console.log('  ✓ Upload registered in private bucket with AES-256 encryption & clean scan.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // TEST 3: Anti-Malware Engine Blocks Executable / Malicious Payloads
  try {
    console.log('▶ TEST 3: Anti-Malware Engine Prohibits Executables & Scripts');
    await assert.rejects(async () => {
      await cloudStorageSignedUrlsService.registerPrivateUpload({
        patientId: mockPatient.uid,
        fileName: 'malicious_virus.exe',
        fileSize: 50000,
        mimeType: 'application/octet-stream',
        category: 'other'
      });
    }, /Executable file extension/);

    await assert.rejects(async () => {
      await cloudStorageSignedUrlsService.registerPrivateUpload({
        patientId: mockPatient.uid,
        fileName: 'script.bat',
        fileSize: 1000,
        mimeType: 'text/plain',
        category: 'other'
      });
    }, /Executable file extension/);
    console.log('  ✓ Anti-malware engine strictly rejected malicious executables.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // TEST 4: Ephemeral Signed URL Generation & HMAC-SHA256 Signatures
  let signed = null;
  try {
    console.log('▶ TEST 4: Ephemeral Signed URL Generation (15m TTL)');
    signed = cloudStorageSignedUrlsService.generateSignedUrl({
      fileId: uploadResult.fileId,
      requestingUser: mockPatient,
      ttlSeconds: 900
    });

    assert.strictEqual(signed.success, true);
    assert.strictEqual(signed.fileId, uploadResult.fileId);
    assert.ok(signed.signedUrl.includes('/api/storage/secure-file/'), 'URL must route to secure file endpoint');
    assert.ok(signed.token.includes(uploadResult.fileId), 'Token must incorporate fileId');
    assert.strictEqual(signed.ttlSeconds, 900);
    assert.ok(signed.expiresAt > Math.floor(Date.now() / 1000), 'Expiration must be in the future');
    console.log('  ✓ Ephemeral signed URL generated with strict 15-minute validity.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // TEST 5: Signed URL Verification & Expiration Enforcement
  try {
    console.log('▶ TEST 5: Signed URL Verification & Expiration Enforcement');
    const verification = cloudStorageSignedUrlsService.verifySignedToken(uploadResult.fileId, signed.token, mockPatient);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.file.fileId, uploadResult.fileId);
    assert.ok(verification.remainingSeconds > 0 && verification.remainingSeconds <= 900);

    // Expired token test
    const expiredToken = `${uploadResult.fileId}.${Math.floor(Date.now() / 1000) - 100}.nonce123.sig123`;
    const expiredVerification = cloudStorageSignedUrlsService.verifySignedToken(uploadResult.fileId, expiredToken, mockPatient);
    assert.strictEqual(expiredVerification.valid, false);
    assert.strictEqual(expiredVerification.error, 'SIGNED_URL_EXPIRED');

    // Tampered signature test
    const tamperedToken = `${uploadResult.fileId}.${Math.floor(Date.now() / 1000) + 500}.nonce123.invalidSig999`;
    const tamperedVerification = cloudStorageSignedUrlsService.verifySignedToken(uploadResult.fileId, tamperedToken, mockPatient);
    assert.strictEqual(tamperedVerification.valid, false);
    assert.strictEqual(tamperedVerification.error, 'SIGNATURE_INVALID');

    // Token revocation test
    cloudStorageSignedUrlsService.revokeSignedToken(signed.token);
    const revokedVerification = cloudStorageSignedUrlsService.verifySignedToken(uploadResult.fileId, signed.token, mockPatient);
    assert.strictEqual(revokedVerification.valid, false);
    assert.strictEqual(revokedVerification.error, 'TOKEN_REVOKED');
    console.log('  ✓ Token verification enforces expiry, cryptographic integrity & instant revocation.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // TEST 6: Zero-Trust RBAC Protection (Patient / Doctor / Admin Isolation)
  try {
    console.log('▶ TEST 6: Zero-Trust RBAC Access Governance');
    // Fresh signed url
    const freshSigned = cloudStorageSignedUrlsService.generateSignedUrl({
      fileId: uploadResult.fileId,
      requestingUser: mockPatient
    });
    assert.strictEqual(freshSigned.success, true);

    // Assigned Doctor can generate signed URL
    const docSigned = cloudStorageSignedUrlsService.generateSignedUrl({
      fileId: uploadResult.fileId,
      requestingUser: mockDoctor
    });
    assert.strictEqual(docSigned.success, true);

    // Admin can generate signed URL
    const adminSigned = cloudStorageSignedUrlsService.generateSignedUrl({
      fileId: uploadResult.fileId,
      requestingUser: mockAdmin
    });
    assert.strictEqual(adminSigned.success, true);

    // Unauthorized stranger blocked
    assert.throws(() => {
      cloudStorageSignedUrlsService.generateSignedUrl({
        fileId: uploadResult.fileId,
        requestingUser: mockAttacker
      });
    }, /Access denied/);
    console.log('  ✓ Zero-Trust RBAC guarantees patient PHI confidentiality.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // TEST 7: Appointments & Chatbot Integration Context
  try {
    console.log('▶ TEST 7: Appointments & Chatbot Integration Helpers');
    const linkResult = await cloudStorageSignedUrlsService.linkFileToAppointment({
      fileId: uploadResult.fileId,
      appointmentId: 'appt_2026_test',
      requestingUser: mockPatient
    });
    assert.strictEqual(linkResult.success, true);
    assert.strictEqual(linkResult.appointmentId, 'appt_2026_test');

    const chatContextAr = cloudStorageSignedUrlsService.generateChatbotSecureContext(mockPatient.uid, { lang: 'ar' });
    assert.strictEqual(chatContextAr.verifiedFilesCount, 1);
    assert.ok(chatContextAr.filesSummary.includes('Private Cloud Bucket'));

    const chatContextEn = cloudStorageSignedUrlsService.generateChatbotSecureContext(mockPatient.uid, { lang: 'en' });
    assert.strictEqual(chatContextEn.verifiedFilesCount, 1);
    assert.ok(chatContextEn.filesSummary.includes('Encrypted in Private Bucket'));
    console.log('  ✓ Successfully tested appointment dossier linking & chatbot contexts.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // TEST 8: Backend Server REST API Route Definitions in server.js
  try {
    console.log('▶ TEST 8: Backend Server REST API Endpoints in server.js');
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    assert.ok(serverContent.includes('/api/storage/upload-private'), 'POST /api/storage/upload-private route must be defined');
    assert.ok(serverContent.includes('/api/storage/signed-url'), 'POST /api/storage/signed-url route must be defined');
    assert.ok(serverContent.includes('/api/storage/secure-file/:fileId'), 'GET /api/storage/secure-file/:fileId route must be defined');
    assert.ok(serverContent.includes('/api/storage/patient-files/:patientId'), 'GET /api/storage/patient-files/:patientId route must be defined');
    assert.ok(serverContent.includes('/api/storage/scan/:fileId'), 'POST /api/storage/scan/:fileId route must be defined');
    assert.ok(serverContent.includes('/api/storage/link-appointment'), 'POST /api/storage/link-appointment route must be defined');
    assert.ok(serverContent.includes('/api/storage/chatbot-context/:patientId'), 'GET /api/storage/chatbot-context/:patientId route must be defined');
    assert.ok(serverContent.includes('/api/storage/file/:fileId'), 'DELETE /api/storage/file/:fileId route must be defined');

    console.log('  ✓ All 8 storage & signed URL REST API endpoints verified in server.js.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 8 FAILED:', err.message);
  }

  console.log('==================================================================');
  if (passed === 8) {
    console.log('🎉 ALL 8 PRIVATE CLOUD STORAGE BACKEND TESTS PASSED!');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${8 - passed} tests failed.`);
    process.exit(1);
  }
}

runTestSuite();
