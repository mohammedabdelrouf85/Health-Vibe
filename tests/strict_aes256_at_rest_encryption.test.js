/**
 * HEALTH VIBE AI: STRICT AES-256 AT-REST ENCRYPTION TEST SUITE
 * 
 * Verifies compliance with User Request 37:
 * "تفعيل تشفير AES-256 لقاعدة البيانات وملفات تقارير الـ PDF المخزنة على السحابة لحماية السجلات الصحية."
 * 
 * Enforces:
 * 1. AES-256-GCM (Authenticated Encryption with Associated Data - AEAD).
 * 2. 256-bit cryptographic keys, 96-bit random IVs, and 128-bit authentication tags.
 * 3. Tamper-proof integrity: modifying ciphertext or auth tag fails immediately.
 * 4. Binary envelope encryption for clinical PDF reports stored in cloud buckets.
 * 5. Field-level at-rest encryption for database clinical health records (PHI).
 * 6. Cloud Object Storage Server-Side Encryption (SSE-AES256) headers.
 * 7. PostgreSQL / Supabase schema support and Express server endpoints.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('==================================================================');
console.log('🔐 HEALTH VIBE AI: AES-256 AT-REST ENCRYPTION TEST SUITE');
console.log('   PRD Page 10 Compliance: Database & Cloud PDF Report Protection');
console.log('==================================================================\n');

(async function runTests() {
  const {
    encryptionService,
    ALGORITHM,
    IV_LENGTH,
    AUTH_TAG_LENGTH,
    ACTIVE_KEY_ID
  } = require('../backend/encryption-service');

  // ── TEST 1: Cryptographic Algorithm & Key Parameters ─────────────────────
  console.log('▶ TEST 1: Cryptographic Algorithm & Key Strength Parameters');

  assert.strictEqual(ALGORITHM, 'aes-256-gcm', 'Must use authenticated aes-256-gcm algorithm');
  assert.strictEqual(encryptionService.masterKey.length, 32, 'Master key must be exactly 32 bytes (256 bits)');
  assert.strictEqual(IV_LENGTH, 12, 'GCM IV must be 12 bytes (96 bits)');
  assert.strictEqual(AUTH_TAG_LENGTH, 16, 'GCM Auth Tag must be 16 bytes (128 bits)');

  console.log(`  ✓ Algorithm: ${ALGORITHM.toUpperCase()} (NIST SP 800-38D Standard)`);
  console.log(`  ✓ Key Length: ${encryptionService.masterKey.length * 8} bits (AES-256)`);
  console.log(`  ✓ IV Nonce Length: ${IV_LENGTH * 8} bits | Auth Tag: ${AUTH_TAG_LENGTH * 8} bits\n`);

  // ── TEST 2: Encryption Randomization & Nonce Uniqueness ────────────────────
  console.log('▶ TEST 2: Semantic Security & IV Randomization');

  const sensitiveClinicalData = 'Diagnosis: Severe Acute Bronchitis; SpO2: 89%; Notes: Immediate Oxygen Required';
  const envelope1 = encryptionService.encrypt(sensitiveClinicalData);
  const envelope2 = encryptionService.encrypt(sensitiveClinicalData);

  // Both envelopes must decrypt back to original plaintext
  assert.strictEqual(encryptionService.decrypt(envelope1), sensitiveClinicalData);
  assert.strictEqual(encryptionService.decrypt(envelope2), sensitiveClinicalData);

  // But ciphertexts and IVs must be completely distinct (randomized nonces)
  assert.notStrictEqual(envelope1.iv, envelope2.iv, 'IVs must be uniquely generated per operation');
  assert.notStrictEqual(envelope1.ciphertext, envelope2.ciphertext, 'Ciphertexts must differ due to unique IVs');
  assert.notStrictEqual(envelope1.authTag, envelope2.authTag, 'Auth tags must differ');

  console.log('  ✓ Unique IV generation verified (Zero nonce reuse).');
  console.log('  ✓ Ciphertext randomization verified for identical clinical inputs.\n');

  // ── TEST 3: Authenticated Tamper Detection (AEAD Integrity) ───────────────
  console.log('▶ TEST 3: Authenticated Tamper Detection (AEAD Integrity Guard)');

  const originalEnvelope = encryptionService.encrypt('Confidential Clinical Assessment: Patient is stable.');

  // 1. Tamper with ciphertext (modify 1 hex character)
  const tamperedCiphertext = originalEnvelope.ciphertext.slice(0, -1) + (originalEnvelope.ciphertext.slice(-1) === 'a' ? 'b' : 'a');
  const tamperedEnvelope1 = { ...originalEnvelope, ciphertext: tamperedCiphertext };

  assert.throws(() => {
    encryptionService.decrypt(tamperedEnvelope1);
  }, (err) => err.message.includes('DECRYPTION_AUTH_FAILED'), 'Tampered ciphertext must fail authentication');

  // 2. Tamper with auth tag (modify 1 hex character)
  const tamperedAuthTag = originalEnvelope.authTag.slice(0, -1) + (originalEnvelope.authTag.slice(-1) === '0' ? '1' : '0');
  const tamperedEnvelope2 = { ...originalEnvelope, authTag: tamperedAuthTag };

  assert.throws(() => {
    encryptionService.decrypt(tamperedEnvelope2);
  }, (err) => err.message.includes('DECRYPTION_AUTH_FAILED'), 'Tampered auth tag must fail authentication');

  // 3. Mismatching Associated Data (AAD)
  const aadEnvelope = encryptionService.encrypt('Secret note', 'patientId:pat-100');
  assert.throws(() => {
    encryptionService.decrypt(aadEnvelope, 'patientId:pat-999'); // Wrong patient AAD!
  }, (err) => err.message.includes('DECRYPTION_AUTH_FAILED'), 'Mismatching AAD must fail authentication');

  console.log('  ✓ Tampered ciphertext rejected with DECRYPTION_AUTH_FAILED.');
  console.log('  ✓ Tampered authentication tag rejected.');
  console.log('  ✓ AAD context binding confirmed (Prevents cross-patient ciphertext swaps).\n');

  // ── TEST 4: Binary Envelope Encryption for Cloud PDF Reports ──────────────
  console.log('▶ TEST 4: Binary Envelope Encryption for Cloud PDF Reports');

  // Create realistic synthetic PDF buffer with standard %PDF-1.7 header
  const samplePdfContent = '%PDF-1.7\n1 0 obj\n<< /Title (Health Vibe Certified Clinical Report) /Patient (HV-SYNTH-001) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
  const originalPdfBuffer = Buffer.from(samplePdfContent, 'utf8');

  // Encrypt PDF buffer
  const encryptedPkg = encryptionService.encryptPdfBuffer(originalPdfBuffer, { reportId: 'REP-CLIN-2026-99' });

  assert.strictEqual(encryptedPkg.reportId, 'REP-CLIN-2026-99');
  assert.strictEqual(encryptedPkg.algorithm, 'AES-256-GCM');
  assert.strictEqual(encryptedPkg.encrypted, true);
  assert.strictEqual(encryptedPkg.originalBytesCount, originalPdfBuffer.length);
  assert.ok(encryptedPkg.encryptedBytesCount > 0);
  assert.ok(encryptedPkg.ciphertextBuffer && Buffer.isBuffer(encryptedPkg.ciphertextBuffer));

  // The ciphertext must NOT leak the %PDF magic header
  const isHeaderLeaked = encryptedPkg.ciphertextBuffer.slice(0, 4).toString('ascii') === '%PDF';
  assert.strictEqual(isHeaderLeaked, false, 'Ciphertext must obscure %PDF file signature');

  // Decrypt PDF buffer
  const decryptedPdfBuffer = encryptionService.decryptPdfBuffer(
    encryptedPkg.ciphertextBuffer,
    encryptedPkg.iv,
    encryptedPkg.authTag,
    encryptedPkg.reportId
  );

  // Assert exact byte-for-byte equality
  assert.deepStrictEqual(decryptedPdfBuffer, originalPdfBuffer, 'Decrypted PDF must match original bytes exactly');
  assert.strictEqual(decryptedPdfBuffer.slice(0, 4).toString('ascii'), '%PDF', 'Decrypted buffer must restore valid %PDF header');

  // Retrieve through storage cache
  const cachedDecryptedBuffer = encryptionService.getDecryptedReportById('REP-CLIN-2026-99');
  assert.deepStrictEqual(cachedDecryptedBuffer, originalPdfBuffer);

  console.log(`  ✓ Original PDF size: ${originalPdfBuffer.length} bytes | Encrypted size: ${encryptedPkg.encryptedBytesCount} bytes`);
  console.log('  ✓ Magic header %PDF successfully obscured in ciphertext.');
  console.log('  ✓ Roundtrip decryption verified: Exact byte-for-byte match restored.\n');

  // ── TEST 5: Database Field-Level Clinical Encryption ──────────────────────
  console.log('▶ TEST 5: Database Field-Level Encryption for Clinical Records (PHI)');

  const rawCaseRecord = {
    id: 'case-uuid-101',
    patientId: 'patient-uuid-500',
    approvalStatus: 'approved_certified',
    clinicalNotes: 'Bilateral expiratory rhonchi. Prescribed Salbutamol inhaler.',
    diagnosis: 'Bronchial Asthma Acute Exacerbation',
    symptoms: ['wheezing', 'chest_tightness'],
    vitals: { spo2: 91, heartRate: 98 }
  };

  // Encrypt sensitive fields
  const encryptedCaseRecord = encryptionService.encryptRecordFields(rawCaseRecord);

  // Administrative fields remain in plaintext for indexing/queries
  assert.strictEqual(encryptedCaseRecord.id, 'case-uuid-101');
  assert.strictEqual(encryptedCaseRecord.patientId, 'patient-uuid-500');
  assert.strictEqual(encryptedCaseRecord.approvalStatus, 'approved_certified');
  assert.strictEqual(encryptedCaseRecord._isEncryptedAtRest, true);

  // Clinical health fields must be encrypted envelopes
  assert.strictEqual(encryptedCaseRecord.clinicalNotes.encrypted, true);
  assert.ok(encryptedCaseRecord.clinicalNotes.ciphertext);
  assert.strictEqual(encryptedCaseRecord.diagnosis.encrypted, true);
  assert.ok(encryptedCaseRecord.diagnosis.ciphertext);
  assert.strictEqual(encryptedCaseRecord.vitals.encrypted, true);
  assert.ok(encryptedCaseRecord.vitals.ciphertext);

  // Decrypt clinical record upon authorized fetch
  const decryptedCaseRecord = encryptionService.decryptRecordFields(encryptedCaseRecord);

  assert.strictEqual(decryptedCaseRecord.clinicalNotes, rawCaseRecord.clinicalNotes);
  assert.strictEqual(decryptedCaseRecord.diagnosis, rawCaseRecord.diagnosis);
  assert.deepStrictEqual(decryptedCaseRecord.symptoms, rawCaseRecord.symptoms);
  assert.deepStrictEqual(decryptedCaseRecord.vitals, rawCaseRecord.vitals);

  console.log('  ✓ Administrative fields remain queryable (id, patientId, status).');
  console.log('  ✓ Sensitive clinical fields encrypted at-rest with AES-256-GCM.');
  console.log('  ✓ Seamless record-level decryption verified upon authorized read.\n');

  // ── TEST 6: Cloud Object Storage SSE-AES256 Headers ───────────────────────
  console.log('▶ TEST 6: Cloud Object Storage SSE-AES256 Headers');

  const sseHeaders = encryptionService.getCloudStorageEncryptionHeaders();
  assert.strictEqual(sseHeaders['x-goog-encryption-algorithm'], 'AES256');
  assert.strictEqual(sseHeaders['x-goog-server-side-encryption'], 'AES256');
  assert.strictEqual(sseHeaders['x-amz-server-side-encryption'], 'AES256');
  assert.strictEqual(sseHeaders['X-HealthVibe-At-Rest-Encryption'], 'AES-256-GCM');

  const statusReport = encryptionService.getEncryptionStatusReport();
  assert.strictEqual(statusReport.atRestEncryptionEnforced, true);
  assert.strictEqual(statusReport.keyLengthBits, 256);

  console.log('  ✓ Google Cloud Storage Server-Side Encryption header verified (AES256).');
  console.log('  ✓ Compliance report confirms AES-256 at-rest coverage.\n');

  // ── TEST 7: PostgreSQL / Supabase Schema DDL Inspection ───────────────────
  console.log('▶ TEST 7: PostgreSQL / Supabase Schema DDL Inspection (backend/db/schema.sql)');

  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../backend/db/schema.sql'), 'utf8');

  // Check columns in clinical_cases
  assert.ok(schemaSql.includes('encrypted_phi_payload TEXT'), 'Must include encrypted_phi_payload in schema.sql');
  assert.ok(schemaSql.includes('encryption_iv VARCHAR(32)'), 'Must include encryption_iv in schema.sql');
  assert.ok(schemaSql.includes('encryption_auth_tag VARCHAR(32)'), 'Must include encryption_auth_tag in schema.sql');
  assert.ok(schemaSql.includes("encryption_algorithm VARCHAR(32) DEFAULT 'AES-256-GCM'"), 'Must include encryption_algorithm in schema.sql');

  // Check table encrypted_cloud_reports
  assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS encrypted_cloud_reports'), 'Must define encrypted_cloud_reports table');
  assert.ok(schemaSql.includes("server_side_encryption VARCHAR(32) NOT NULL DEFAULT 'AES256'"), 'Must enforce server_side_encryption in encrypted_cloud_reports');

  console.log('  ✓ schema.sql verified with AES-256 at-rest encrypted columns.');
  console.log('  ✓ schema.sql verified with encrypted_cloud_reports table.\n');

  // ── TEST 8: Express Server Routes Verification ────────────────────────────
  console.log('▶ TEST 8: Express Server Routes Verification');

  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  assert.ok(serverJsContent.includes("app.get('/api/security/encryption-status'"), 'Must expose GET /api/security/encryption-status');
  assert.ok(serverJsContent.includes("app.post('/api/reports/encrypt-pdf'"), 'Must expose POST /api/reports/encrypt-pdf');
  assert.ok(serverJsContent.includes("app.get('/api/reports/:reportId/download-decrypted'"), 'Must expose GET /api/reports/:reportId/download-decrypted');

  console.log('  ✓ Routes /api/security/encryption-status, /api/reports/encrypt-pdf, & /download-decrypted registered.\n');

  console.log('==================================================================');
  console.log('🎉 ALL AES-256 AT-REST ENCRYPTION TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
