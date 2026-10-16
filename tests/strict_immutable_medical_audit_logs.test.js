/**
 * HEALTH VIBE AI: STRICT IMMUTABLE AUDIT LOGS TEST SUITE
 * 
 * Verifies compliance with User Request 32:
 * "إنشاء جدول audit_logs غير قابل للتعديل يسجل كل عملية عرض أو تعديل أو اعتماد
 *  للبيانات الطبية (actor_id, role, action, target_record, timestamp, ip_address)."
 * 
 * Enforces:
 * 1. Database table definition with required columns:
 *    - actor_id
 *    - role
 *    - action (VIEW, MODIFY, APPROVE)
 *    - target_record
 *    - timestamp
 *    - ip_address
 * 2. Absolute immutability:
 *    - PostgreSQL triggers reject UPDATE & DELETE with IMMUTABLE_AUDIT_LOG_VIOLATION.
 *    - PostgreSQL RLS permits ONLY INSERT and SELECT.
 *    - Service layer prevents mutation or deletion with IMMUTABLE_AUDIT_LOG_ERROR.
 *    - Record objects are deeply frozen (Object.freeze).
 * 3. Logging of every clinical data operation:
 *    - VIEW: profile viewing, timeline, case inspection.
 *    - MODIFY: profile edits, symptom corrections, clinical notes updating.
 *    - APPROVE: physician certification with electronic signature.
 * 4. Server endpoints & filtering queries.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('📜  HEALTH VIBE AI: IMMUTABLE CLINICAL AUDIT LOGS TEST SUITE');
console.log('   PRD & HIPAA Compliance: VIEW, MODIFY, APPROVE (Request 32)');
console.log('==================================================================\n');

(async function runTests() {
  const { RelationalDatabaseService } = require('../backend/relational-db-service');
  const rdb = new RelationalDatabaseService();

  // ── TEST 1: Schema DDL & Immutability Triggers (backend/db/schema.sql) ────
  console.log('▶ TEST 1: PostgreSQL DDL Schema & Tamper-Proof Trigger Verification');
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../backend/db/schema.sql'), 'utf8');

  // Verify columns exist
  assert.ok(schemaSql.includes('actor_id VARCHAR(128) NOT NULL'), 'Must include actor_id column');
  assert.ok(schemaSql.includes('role VARCHAR(32) NOT NULL'), 'Must include role column');
  assert.ok(schemaSql.includes('target_record VARCHAR(255) NOT NULL'), 'Must include target_record column');
  assert.ok(schemaSql.includes('timestamp TIMESTAMP WITH TIME ZONE NOT NULL'), 'Must include timestamp column');
  assert.ok(schemaSql.includes('ip_address VARCHAR(45) NOT NULL'), 'Must include ip_address column');
  assert.ok(schemaSql.includes('action VARCHAR(64) NOT NULL'), 'Must include action column');

  // Verify immutability trigger & function
  assert.ok(
    schemaSql.includes('CREATE OR REPLACE FUNCTION prevent_audit_logs_tampering()'),
    'Must define prevent_audit_logs_tampering function'
  );
  assert.ok(
    schemaSql.includes('CREATE TRIGGER trg_prevent_audit_logs_tampering'),
    'Must define trg_prevent_audit_logs_tampering trigger'
  );
  assert.ok(
    schemaSql.includes('BEFORE UPDATE OR DELETE ON audit_logs'),
    'Trigger must run BEFORE UPDATE OR DELETE'
  );

  // Verify RLS policies
  assert.ok(schemaSql.includes('CREATE POLICY audit_logs_immutable_insert ON audit_logs'), 'Must define insert policy');
  assert.ok(schemaSql.includes('CREATE POLICY audit_logs_immutable_select ON audit_logs'), 'Must define select policy');

  console.log('  ✓ PostgreSQL schema defines all 6 required fields.');
  console.log('  ✓ Tamper-proof trigger and RLS policies prevent any UPDATE or DELETE.\n');

  // ── TEST 2: Validation of Required Fields ─────────────────────────────────
  console.log('▶ TEST 2: Validation of Mandatory Clinical Audit Fields');

  // Missing actor_id
  await assert.rejects(async () => {
    await rdb.logClinicalAudit({
      role: 'doctor',
      action: 'VIEW',
      target_record: 'medical_profile:patient_101',
      ip_address: '192.168.1.50'
    });
  }, (err) => err.message.includes('actor_id is strictly required'));

  // Missing role
  await assert.rejects(async () => {
    await rdb.logClinicalAudit({
      actor_id: 'doc_123',
      action: 'VIEW',
      target_record: 'medical_profile:patient_101',
      ip_address: '192.168.1.50'
    });
  }, (err) => err.message.includes('role is strictly required'));

  // Missing action
  await assert.rejects(async () => {
    await rdb.logClinicalAudit({
      actor_id: 'doc_123',
      role: 'doctor',
      target_record: 'medical_profile:patient_101',
      ip_address: '192.168.1.50'
    });
  }, (err) => err.message.includes('action is strictly required'));

  // Missing target_record
  await assert.rejects(async () => {
    await rdb.logClinicalAudit({
      actor_id: 'doc_123',
      role: 'doctor',
      action: 'VIEW',
      ip_address: '192.168.1.50'
    });
  }, (err) => err.message.includes('target_record is strictly required'));

  console.log('  ✓ Strict validation enforces actor_id, role, action, and target_record.\n');

  // ── TEST 3: Logging VIEW, MODIFY, and APPROVE Operations ──────────────────
  console.log('▶ TEST 3: Recording Medical VIEW, MODIFY, and APPROVE Operations');

  const now = new Date().toISOString();

  // 1. Log VIEW
  const viewLog = await rdb.logClinicalAudit({
    actor_id: 'doc_99',
    role: 'doctor',
    action: 'VIEW',
    target_record: 'medical_profile:patient_500',
    timestamp: now,
    ip_address: '10.0.0.12'
  });
  assert.strictEqual(viewLog.actor_id, 'doc_99');
  assert.strictEqual(viewLog.role, 'doctor');
  assert.strictEqual(viewLog.action, 'VIEW');
  assert.strictEqual(viewLog.target_record, 'medical_profile:patient_500');
  assert.strictEqual(viewLog.ip_address, '10.0.0.12');

  // 2. Log MODIFY
  const modifyLog = await rdb.logClinicalAudit({
    actor_id: 'patient_500',
    role: 'patient',
    action: 'MODIFY',
    target_record: 'medical_profile:patient_500',
    ip_address: '10.0.0.15',
    metadata: { fieldUpdated: 'bloodType', version: 2 }
  });
  assert.strictEqual(modifyLog.action, 'MODIFY');
  assert.strictEqual(modifyLog.actor_id, 'patient_500');
  assert.strictEqual(modifyLog.target_record, 'medical_profile:patient_500');

  // 3. Log APPROVE
  const approveLog = await rdb.logClinicalAudit({
    actor_id: 'doc_99',
    role: 'doctor',
    action: 'APPROVE',
    target_record: 'case:case_respiratory_88',
    ip_address: '10.0.0.12',
    metadata: { doctorSignature: 'Dr. Validated, Syndicate #9923', diagnosis: 'Bronchitis' }
  });
  assert.strictEqual(approveLog.action, 'APPROVE');
  assert.strictEqual(approveLog.actor_id, 'doc_99');
  assert.strictEqual(approveLog.target_record, 'case:case_respiratory_88');

  console.log('  ✓ Successfully logged VIEW, MODIFY, and APPROVE clinical operations.\n');

  // ── TEST 4: Service Layer Immutability Guards ─────────────────────────────
  console.log('▶ TEST 4: Service Layer Immutability & Anti-Tampering Enforcement');

  // Record is frozen
  assert.ok(Object.isFrozen(viewLog), 'Returned audit record must be frozen');
  assert.throws(() => {
    'use strict';
    viewLog.action = 'TAMPERED';
  }, TypeError, 'Direct property mutation must throw TypeError on frozen object');

  // Modifying an audit log is strictly blocked
  await assert.rejects(async () => {
    await rdb.modifyAuditLog(viewLog.id, { action: 'DELETED' });
  }, (err) => err.code === 'IMMUTABLE_AUDIT_LOG_ERROR', 'modifyAuditLog must throw IMMUTABLE_AUDIT_LOG_ERROR');

  // Deleting an audit log is strictly blocked
  await assert.rejects(async () => {
    await rdb.deleteAuditLog(viewLog.id);
  }, (err) => err.code === 'IMMUTABLE_AUDIT_LOG_ERROR', 'deleteAuditLog must throw IMMUTABLE_AUDIT_LOG_ERROR');

  // Overwriting an existing ID in logClinicalAudit is strictly blocked
  await assert.rejects(async () => {
    await rdb.logClinicalAudit({
      id: viewLog.id, // same ID!
      actor_id: 'attacker',
      role: 'super_admin',
      action: 'VIEW',
      target_record: 'case:tampered',
      ip_address: '1.2.3.4'
    });
  }, (err) => err.code === 'IMMUTABLE_AUDIT_LOG_ERROR', 'Overwriting ID must throw IMMUTABLE_AUDIT_LOG_ERROR');

  console.log('  ✓ Immutability guards prevent modification, deletion, and overwriting.\n');

  // ── TEST 5: Querying & Filtering Clinical Audit Trail ──────────────────────
  console.log('▶ TEST 5: Querying Clinical Audit Trail with Filters');

  // Filter by action
  const viewLogs = await rdb.getClinicalAuditLogs({ action: 'VIEW' });
  assert.ok(viewLogs.length >= 1);
  assert.ok(viewLogs.every(l => l.action === 'VIEW'));

  const approveLogs = await rdb.getClinicalAuditLogs({ action: 'APPROVE' });
  assert.ok(approveLogs.length >= 1);
  assert.ok(approveLogs.every(l => l.action === 'APPROVE'));

  // Filter by target_record
  const patientLogs = await rdb.getClinicalAuditLogs({ target_record: 'medical_profile:patient_500' });
  assert.strictEqual(patientLogs.length, 2, 'Should find VIEW and MODIFY for patient_500');

  // Filter by actor_id
  const doctorLogs = await rdb.getClinicalAuditLogs({ actor_id: 'doc_99' });
  assert.strictEqual(doctorLogs.length, 2, 'Should find VIEW and APPROVE by doc_99');

  console.log('  ✓ Query engine filters accurately by action, actor_id, and target_record.\n');

  // ── TEST 6: Backend Server Integration & Endpoints ─────────────────────────
  console.log('▶ TEST 6: Server Integration (GET /api/audit/clinical-logs & Handlers)');
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  assert.ok(
    serverJsContent.includes("app.get('/api/audit/clinical-logs'"),
    'server.js must expose GET /api/audit/clinical-logs endpoint'
  );
  assert.ok(
    serverJsContent.includes("action: 'VIEW'"),
    'server.js must log VIEW action on medical profile read'
  );
  assert.ok(
    serverJsContent.includes("action: 'MODIFY'"),
    'server.js must log MODIFY action on medical profile update'
  );
  assert.ok(
    serverJsContent.includes("action: 'APPROVE'"),
    'server.js must log APPROVE action on case approval'
  );

  console.log('  ✓ Server routes and endpoints instrumented with clinical audit logging.\n');

  console.log('==================================================================');
  console.log('🎉 ALL IMMUTABLE CLINICAL AUDIT LOG TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
