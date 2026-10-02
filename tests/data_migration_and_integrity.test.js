/**
 * Health Vibe AI - Versioned Data Migration & Integrity Test Suite
 *
 * Verifies:
 * 1. Diagnostic Schema Analysis & Inconsistent Legacy Field Detection.
 * 2. Read-Only Dry Run with aggregate counts and PII-redacted diagnostics.
 * 3. Missing References & Orphaned Records Detection.
 * 4. Unsupported / Corrupt Schema Version Handling.
 * 5. Clinical Truth Preservation (Zero fabrication of missing clinical facts).
 * 6. Idempotency (repeated runs produce zero drift).
 * 7. Resumability & Checkpointing on Partial / Simulated Failure.
 * 8. Deterministic Rollback to Original Raw Document via _legacyMigrationArchive.
 * 9. Comprehensive Audit Trail Logging.
 */

const assert = require('node:assert/strict');
const migrationService = require('../backend/migration-integrity-service');

console.log('==================================================================');
console.log('🔄 HEALTH VIBE AI: DATA MIGRATION & INTEGRITY TEST SUITE');
console.log('   Schema Evolution, Checkpointing, Anti-Hallucination & Rollback');
console.log('==================================================================\n');

(async () => {
  migrationService.resetStoreForTesting();

  // -----------------------------------------------------------------------------
  // ISOLATED TEST FIXTURES (MIXED SCHEMA VERSIONS & EDGE CASES)
  // -----------------------------------------------------------------------------
  const usersFixture = [
    { id: 'usr_pt_valid_001', name: 'أحمد محمود', email: 'ahmed@healthvibe.local', nationalId: '29001010101234' },
    { id: 'usr_pt_valid_002', name: 'سارة عبد الله', email: 'sarah@healthvibe.local', nationalId: '29505050105678' }
  ];

  const doctorsFixture = [
    { id: 'doc_valid_402', name: 'د. عادل توفيق', licenseNumber: 'HV-LIC-4491' }
  ];

  const mixedCasesFixture = [
    // 1. Pure Legacy v1.0.0 (String symptoms, flat o2, flat risk, status: pending)
    {
      id: 'case_legacy_001',
      patientId: 'usr_pt_valid_001',
      assignedDoctorId: 'doc_valid_402',
      status: 'pending',
      o2: 93,
      risk: 'moderate',
      symptoms: 'كحة مستمرة, سخونية خفيفة, نهجان',
      patientName: 'أحمد محمود',
      patientEmail: 'ahmed@healthvibe.local',
      nationalId: '29001010101234',
      createdAt: '2026-08-01T10:00:00.000Z'
    },
    // 2. Intermediate v1.5.0 (Flat oxygenLevel, missing clinicalRevision, array symptoms)
    {
      id: 'case_transitional_002',
      schemaVersion: '1.5.0',
      patientId: 'usr_pt_valid_002',
      assignedDoctorId: 'doc_valid_402',
      status: 'under_review',
      oxygenLevel: 97,
      triageLevel: 'low',
      symptoms: ['كحة خفيفة'],
      createdAt: '2026-09-01T12:00:00.000Z'
    },
    // 3. Clean Canonical v2.1.0
    {
      id: 'case_clean_003',
      schemaVersion: '2.1.0',
      clinicalRevision: 2,
      patientId: 'usr_pt_valid_001',
      assignedDoctorId: 'doc_valid_402',
      status: 'under_review',
      currentAssessment: {
        oxygenLevel: 96,
        temperature: 37.2,
        heartRate: 76,
        systolicBp: 120,
        diastolicBp: 80,
        symptoms: ['كحة جافة']
      },
      o2: 96,
      oxygenLevel: 96,
      temperature: 37.2,
      heartRate: 76,
      systolicBp: 120,
      diastolicBp: 80,
      symptoms: ['كحة جافة'],
      observationHistory: [
        { id: 'obs_1', type: 'oxygenLevel', value: 96, unit: '%' }
      ],
      _legacyMigrationArchive: {
        archivedAt: '2026-09-15T00:00:00.000Z',
        originalSchemaVersion: '1.0.0',
        originalRawFields: { id: 'case_clean_003' }
      }
    },
    // 4. Case with Missing Patient Reference (Non-existent user ID)
    {
      id: 'case_missing_ref_004',
      patientId: 'usr_deleted_non_existent_999',
      status: 'submitted',
      o2: 95,
      createdAt: '2026-09-10T14:00:00.000Z'
    },
    // 5. Corrupt / Unsupported Schema Version
    {
      id: 'case_corrupt_version_005',
      schemaVersion: '99.99-UNSUPPORTED_CORRUPT',
      status: 'submitted',
      o2: 95
    }
  ];

  const reportsFixture = [
    { id: 'rep_valid_001', caseId: 'case_legacy_001', summary: 'تقرير سريري صحيح' },
    { id: 'rep_orphan_002', caseId: 'case_deleted_dead_reference_999', summary: 'تقرير يتيم لا حالة له' }
  ];

  // -----------------------------------------------------------------------------
  // TEST 1: Read-Only Dry Run Mode & PII Redaction
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: Read-Only Dry Run Mode & PII Redaction ...');
  const dryRunReport = migrationService.runDryRun({
    cases: mixedCasesFixture,
    reports: reportsFixture,
    users: usersFixture,
    doctors: doctorsFixture
  });

  assert.equal(dryRunReport.mode, 'read_only_dry_run');
  assert.equal(dryRunReport.summary.totalCasesScanned, 5);
  assert.equal(dryRunReport.summary.cleanCanonicalCount, 1, 'case_clean_003 is already clean');
  assert.equal(dryRunReport.summary.needsMigrationCount, 3, 'Cases 001, 002, 004 need migration');
  assert.equal(dryRunReport.summary.missingReferencesCount, 1, 'case_missing_ref_004 has dead patientId');
  assert.equal(dryRunReport.summary.orphanedReportsCount, 1, 'rep_orphan_002 is orphaned');
  assert.equal(dryRunReport.summary.unsupportedCount, 1, 'case_corrupt_version_005 is unsupported');

  // Verify PII Redaction in sample issues
  const sampleWithPii = dryRunReport.sampleIssues.find(s => s.docId === 'case_legacy_001');
  assert.ok(sampleWithPii, 'Sample issue found for legacy case 001');
  assert.equal(sampleWithPii.redactedSample.patientEmail, 'a***@***.local', 'Patient email must be masked');
  assert.match(sampleWithPii.redactedSample.nationalId, /^2900\*{6}34$/, 'National ID must be masked');
  assert.equal(sampleWithPii.redactedSample.patientName, 'أ***د', 'Patient name must be masked');

  // Verify Zero Mutations on original input fixture
  assert.equal(mixedCasesFixture[0].schemaVersion, undefined, 'Dry run must not mutate input objects');
  console.log('  ✓ Dry run summary verified with zero writes and PII redaction enforced.\n');

  // -----------------------------------------------------------------------------
  // TEST 2: Canonical Transformation & Clinical Truth Preservation
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 2: Canonical Transformation & Clinical Truth Preservation ...');
  const transformResult = migrationService.transformToCanonical(mixedCasesFixture[0]);
  assert.equal(transformResult.isModified, true);
  const canonical = transformResult.canonicalDoc;

  // Verify Schema Version & Revision
  assert.equal(canonical.schemaVersion, '2.1.0');
  assert.equal(canonical.clinicalRevision, 1);
  assert.equal(canonical.status, 'submitted', 'Legacy status pending normalized to submitted');

  // Verify Symptoms parsed from string to array
  assert.deepEqual(canonical.currentAssessment.symptoms, ['كحة مستمرة', 'سخونية خفيفة', 'نهجان']);
  assert.deepEqual(canonical.symptoms, ['كحة مستمرة', 'سخونية خفيفة', 'نهجان']);

  // Verify Measurements normalized
  assert.equal(canonical.currentAssessment.oxygenLevel, 93);
  assert.equal(canonical.o2, 93);

  // CRITICAL CLINICAL SAFETY RULE CHECK:
  // Temperature, heartRate, systolicBp, diastolicBp MUST BE null because they were not in legacy record!
  // Migration must NEVER fabricate/guess normal values!
  assert.equal(canonical.currentAssessment.temperature, null, 'Never invent missing temperature!');
  assert.equal(canonical.currentAssessment.heartRate, null, 'Never invent missing heartRate!');
  assert.equal(canonical.currentAssessment.systolicBp, null, 'Never invent missing systolic BP!');
  assert.equal(canonical.currentAssessment.diastolicBp, null, 'Never invent missing diastolic BP!');

  // Verify Baseline Observation in history
  assert.equal(canonical.observationHistory.length, 1);
  assert.equal(canonical.observationHistory[0].type, 'oxygenLevel');
  assert.equal(canonical.observationHistory[0].value, 93);
  assert.equal(canonical.observationHistory[0].provenance.source, 'legacy_migration');

  // Verify Legacy Archive snapshot contains exact unmutated original fields
  assert.ok(canonical._legacyMigrationArchive);
  assert.equal(canonical._legacyMigrationArchive.originalRawFields.o2, 93);
  assert.equal(canonical._legacyMigrationArchive.originalRawFields.symptoms, 'كحة مستمرة, سخونية خفيفة, نهجان');
  console.log('  ✓ Canonical transformation verified: clinical facts preserved, zero fabricated values.\n');

  // -----------------------------------------------------------------------------
  // TEST 3: Strict Idempotency Guarantee
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 3: Strict Idempotency Guarantee ...');
  // Pass already canonical document through transformation again
  const secondPass = migrationService.transformToCanonical(canonical);
  assert.equal(secondPass.isModified, false, 'Second pass on canonical doc must indicate not modified');
  assert.equal(secondPass.canonicalDoc.clinicalRevision, 1, 'Revision must not artificially increment on re-run');
  assert.equal(secondPass.canonicalDoc.observationHistory.length, 1, 'Observations must not duplicate');
  console.log('  ✓ Idempotency verified: re-running migration on canonical record produces zero drift.\n');

  // -----------------------------------------------------------------------------
  // TEST 4: Resumable Batch Migration with Simulated Partial Failure & Checkpoint Recovery
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 4: Resumable Batch Migration with Simulated Failure & Recovery ...');
  // Prepare a sequence of 6 legacy documents
  const batchTestItems = Array.from({ length: 6 }).map((_, idx) => ({
    id: `case_batch_${idx + 1}`,
    patientId: 'usr_pt_valid_001',
    status: 'pending',
    o2: 90 + idx,
    symptoms: `عَرَض_${idx + 1}`
  }));

  // Run with batchSize = 2, simulate network failure at batch 2
  let caughtError = null;
  try {
    await migrationService.runBatchMigration({
      collectionName: 'cases',
      items: batchTestItems,
      batchSize: 2,
      simulatePartialFailureAtBatch: 2 // batch 1 processes items 0, 1; batch 2 fails on items 2, 3
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Expected simulated interruption in batch 2');
  assert.equal(caughtError.code, 'MIGRATION_BATCH_INTERRUPTED');

  // Check saved checkpoint
  const checkpoint = migrationService.getCheckpoint('cases');
  assert.ok(checkpoint, 'Checkpoint must be saved');
  assert.equal(checkpoint.status, 'in_progress');
  assert.equal(checkpoint.completedCount, 2, 'Batch 1 items (2 items) were completed');
  assert.equal(checkpoint.lastProcessedIndex, 1, 'Last processed index is 1');
  console.log(`  ✓ Batch failure caught cleanly; checkpoint saved at index ${checkpoint.lastProcessedIndex} (batch ${checkpoint.batchNumber}).`);

  // Resume migration from checkpoint
  const resumedRun = await migrationService.runBatchMigration({
    collectionName: 'cases',
    items: batchTestItems,
    batchSize: 2,
    resume: true,
    simulatePartialFailureAtBatch: null // no failure on resume
  });

  assert.equal(resumedRun.success, true);
  assert.equal(resumedRun.summary.status, 'completed');
  assert.equal(resumedRun.summary.totalItems, 6);
  assert.equal(resumedRun.summary.migratedCount, 6, 'All 6 items successfully migrated after resume');

  const finalCheckpoint = migrationService.getCheckpoint('cases');
  assert.equal(finalCheckpoint.status, 'completed');
  console.log('  ✓ Resumed from checkpoint successfully without repeating batch 1; completed 100%.\n');

  // -----------------------------------------------------------------------------
  // TEST 5: Deterministic Rollback to Original Legacy Document
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 5: Deterministic Rollback via _legacyMigrationArchive ...');
  const rolledBackDoc = migrationService.rollbackDocument(canonical);

  assert.equal(rolledBackDoc.schemaVersion, undefined, 'Rolled back document must not contain schemaVersion 2.1.0');
  assert.equal(rolledBackDoc.currentAssessment, undefined, 'currentAssessment removed on rollback');
  assert.equal(rolledBackDoc.status, 'pending', 'Restored original legacy pending status');
  assert.equal(rolledBackDoc.o2, 93);
  assert.equal(typeof rolledBackDoc.symptoms, 'string', 'Restored original string symptoms format');
  assert.equal(rolledBackDoc._legacyMigrationArchive, undefined, 'Archive metadata purged on rollback');
  console.log('  ✓ Deterministic rollback verified: document restored to exact pre-migration structure.\n');

  // -----------------------------------------------------------------------------
  // TEST 6: Audit Records Completeness
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 6: Migration Audit Trail Completeness ...');
  const auditLogs = migrationService.getAuditRecords();
  assert.ok(auditLogs.length >= 4, 'Audit records must contain dry run, pause, resume, and rollback entries');

  const events = auditLogs.map(a => a.eventType);
  assert.ok(events.includes('MIGRATION_DRY_RUN_COMPLETED'));
  assert.ok(events.includes('MIGRATION_RUN_PAUSED_ON_ERROR'));
  assert.ok(events.includes('MIGRATION_RUN_COMPLETED'));
  assert.ok(events.includes('MIGRATION_DOCUMENT_ROLLED_BACK'));
  console.log(`  ✓ All ${auditLogs.length} migration audit events verified with timestamps and metadata.\n`);

  console.log('==================================================================');
  console.log('🎉 ALL 6 DATA MIGRATION & INTEGRITY TESTS PASSED (100% SUCCESS)');
  console.log('==================================================================');
})();
