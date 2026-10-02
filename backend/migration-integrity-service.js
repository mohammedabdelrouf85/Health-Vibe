/**
 * Health Vibe AI - Versioned Data Migration & Integrity-Check Service
 *
 * Implements:
 * 1. Diagnostic Schema Analysis & Integrity Verification (Legacy fields, missing refs, orphans, invalid versions).
 * 2. Read-Only Dry Run with aggregate counts and PII-redacted examples.
 * 3. Idempotent, Resumable Batch Migration Engine with stateful checkpoints.
 * 4. Clinical Truth Preservation: Never invents missing clinical facts (temp, BP, etc. remain null/unrecorded).
 * 5. Full Preservation of Legacy Values via `_legacyMigrationArchive`.
 * 6. Deterministic Rollback & Recovery Routine.
 * 7. Comprehensive Audit Trail & Checkpoint Persistence.
 */

const crypto = require('crypto');

// Target Canonical Schema Version
const CANONICAL_SCHEMA_VERSION = '2.1.0';

// Known Valid Statuses in Health Vibe
const VALID_CASE_STATUSES = new Set([
  'draft',
  'submitted',
  'triaged',
  'assigned',
  'under_review',
  'more_info_requested',
  'approved',
  'rejected',
  'escalated',
  'closed',
  'pending' // legacy alias for submitted/triaged
]);

class MigrationIntegrityService {
  constructor() {
    this.resetStoreForTesting();
  }

  resetStoreForTesting() {
    this.checkpoints = new Map(); // checkpointId -> checkpointObj
    this.auditRecords = [];       // Array(auditRecord)
    this.migrationRuns = new Map(); // runId -> runObj
  }

  // =============================================================================
  // 1. DATA REDACTION HELPER (FOR AUDIT & DRY RUN REPORTS)
  // =============================================================================

  redactSensitiveData(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    const cloned = JSON.parse(JSON.stringify(doc));

    const redactString = (str) => {
      if (typeof str !== 'string' || str.length <= 2) return '***';
      if (str.includes('@')) {
        const [user, domain] = str.split('@');
        return `${user.charAt(0)}***@***.${domain.split('.').pop()}`;
      }
      return `${str.charAt(0)}***${str.charAt(str.length - 1)}`;
    };

    if (cloned.name) cloned.name = redactString(cloned.name);
    if (cloned.patientName) cloned.patientName = redactString(cloned.patientName);
    if (cloned.email) cloned.email = redactString(cloned.email);
    if (cloned.patientEmail) cloned.patientEmail = redactString(cloned.patientEmail);
    if (cloned.nationalId) cloned.nationalId = cloned.nationalId.slice(0, 4) + '******' + cloned.nationalId.slice(-2);
    if (cloned.phone) cloned.phone = cloned.phone.slice(0, 3) + '****' + cloned.phone.slice(-2);

    return cloned;
  }

  // =============================================================================
  // 2. SCHEMA INTEGRITY CHECK & DIAGNOSTICS (PER DOCUMENT)
  // =============================================================================

  inspectCaseDocument(doc, { userRegistry = new Set(), doctorRegistry = new Set() } = {}) {
    const issues = [];
    const id = doc.id || 'unknown_id';
    const data = doc.data || doc;

    // 1. Version Analysis
    const rawVersion = data.schemaVersion;
    let versionCategory = 'legacy_v1_0';

    if (rawVersion === CANONICAL_SCHEMA_VERSION) {
      versionCategory = 'canonical_v2_1';
    } else if (rawVersion === '1.5.0' || rawVersion === '1.5') {
      versionCategory = 'transitional_v1_5';
    } else if (!rawVersion || rawVersion === '1.0' || rawVersion === '1.0.0') {
      versionCategory = 'legacy_v1_0';
    } else {
      versionCategory = 'unsupported_or_corrupt';
      issues.push({
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        field: 'schemaVersion',
        message: `Unrecognized or corrupt schema version '${rawVersion}'.`
      });
    }

    // 2. Status Validation
    if (!data.status || !VALID_CASE_STATUSES.has(data.status)) {
      issues.push({
        code: 'INVALID_STATUS',
        field: 'status',
        message: `Invalid or missing status '${data.status}'.`
      });
    }

    // 3. Inconsistent Legacy Fields
    if (data.o2 !== undefined && data.oxygenLevel === undefined && (!data.currentAssessment || data.currentAssessment.oxygenLevel === undefined)) {
      issues.push({
        code: 'LEGACY_FIELD_O2',
        field: 'o2',
        message: 'Legacy flat field \'o2\' present without canonical \'currentAssessment.oxygenLevel\'.'
      });
    }

    if (data.risk !== undefined && data.triageLevel === undefined) {
      issues.push({
        code: 'LEGACY_FIELD_RISK',
        field: 'risk',
        message: 'Legacy flat field \'risk\' present without canonical \'triageLevel\'.'
      });
    }

    if (typeof data.symptoms === 'string') {
      issues.push({
        code: 'INCONSISTENT_SYMPTOMS_FORMAT',
        field: 'symptoms',
        message: 'Symptoms stored as raw comma-separated string instead of structured array.'
      });
    }

    if (data.clinicalRevision === undefined || typeof data.clinicalRevision !== 'number') {
      issues.push({
        code: 'MISSING_CLINICAL_REVISION',
        field: 'clinicalRevision',
        message: 'Missing canonical integer \'clinicalRevision\'.'
      });
    }

    // 4. Missing Reference Verification (Foreign Key Integrity)
    if (data.patientId && userRegistry.size > 0 && !userRegistry.has(data.patientId)) {
      issues.push({
        code: 'MISSING_PATIENT_REFERENCE',
        field: 'patientId',
        message: `patientId '${data.patientId}' does not exist in user registry.`
      });
    }

    if (data.assignedDoctorId && doctorRegistry.size > 0 && !doctorRegistry.has(data.assignedDoctorId)) {
      issues.push({
        code: 'MISSING_DOCTOR_REFERENCE',
        field: 'assignedDoctorId',
        message: `assignedDoctorId '${data.assignedDoctorId}' does not exist in doctor registry.`
      });
    }

    return {
      docId: id,
      versionCategory,
      isClean: issues.length === 0 && versionCategory === 'canonical_v2_1',
      needsMigration: issues.length > 0 && versionCategory !== 'unsupported_or_corrupt',
      issues
    };
  }

  // =============================================================================
  // 3. READ-ONLY DRY RUN
  // =============================================================================

  runDryRun({
    cases = [],
    reports = [],
    users = [],
    doctors = [],
    sampleLimit = 5
  }) {
    const startTime = Date.now();
    const userRegistry = new Set(users.map(u => u.id || u.uid));
    const doctorRegistry = new Set(doctors.map(d => d.id || d.uid));
    const caseRegistry = new Set(cases.map(c => c.id));

    let totalCasesScanned = cases.length;
    let cleanCanonicalCount = 0;
    let needsMigrationCount = 0;
    let missingReferencesCount = 0;
    let unsupportedCount = 0;
    const sampleIssues = [];

    // 1. Analyze Cases
    for (const c of cases) {
      const inspection = this.inspectCaseDocument(c, { userRegistry, doctorRegistry });

      if (inspection.isClean) {
        cleanCanonicalCount++;
      } else if (inspection.versionCategory === 'unsupported_or_corrupt') {
        unsupportedCount++;
      } else {
        needsMigrationCount++;
      }

      const hasRefIssue = inspection.issues.some(i => i.code.includes('MISSING_') && i.code.includes('_REFERENCE'));
      if (hasRefIssue) missingReferencesCount++;

      if (inspection.issues.length > 0 && sampleIssues.length < sampleLimit) {
        sampleIssues.push({
          type: 'case',
          docId: inspection.docId,
          issues: inspection.issues,
          redactedSample: this.redactSensitiveData(c)
        });
      }
    }

    // 2. Analyze Orphaned Reports
    let orphanedReportsCount = 0;
    for (const r of reports) {
      const caseIdRef = r.caseId || r.originalCaseId;
      if (!caseIdRef || !caseRegistry.has(caseIdRef)) {
        orphanedReportsCount++;
        if (sampleIssues.length < sampleLimit) {
          sampleIssues.push({
            type: 'report',
            docId: r.id || 'unknown_report',
            issues: [{
              code: 'ORPHANED_REPORT',
              field: 'caseId',
              message: `Report references missing or deleted caseId '${caseIdRef}'.`
            }],
            redactedSample: this.redactSensitiveData(r)
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;

    const report = {
      mode: 'read_only_dry_run',
      timestamp: new Date().toISOString(),
      durationMs,
      summary: {
        totalCasesScanned,
        cleanCanonicalCount,
        needsMigrationCount,
        missingReferencesCount,
        orphanedReportsCount,
        unsupportedCount,
        migrationReady: unsupportedCount === 0
      },
      sampleIssues
    };

    this._logAudit('MIGRATION_DRY_RUN_COMPLETED', {
      durationMs,
      needsMigrationCount,
      orphanedReportsCount,
      unsupportedCount
    });

    return report;
  }

  // =============================================================================
  // 4. CANONICAL RECORD TRANSFORMATION (NEVER INVENTS FACTS)
  // =============================================================================

  transformToCanonical(doc) {
    const raw = doc.data ? doc.data : doc;
    const docId = doc.id || raw.id;

    // Idempotency: If already canonical v2.1.0 with revision and currentAssessment, return identical doc
    if (raw.schemaVersion === CANONICAL_SCHEMA_VERSION && raw.clinicalRevision && raw.currentAssessment && raw._legacyMigrationArchive) {
      return {
        isModified: false,
        canonicalDoc: raw
      };
    }

    // 1. Create Immutable Legacy Archive Snapshot (Preserves all original fields)
    const legacyArchive = raw._legacyMigrationArchive || {
      archivedAt: new Date().toISOString(),
      originalSchemaVersion: raw.schemaVersion || '1.0.0',
      originalRawFields: JSON.parse(JSON.stringify(raw))
    };

    // 2. Normalize Symptoms (String -> Array of strings)
    let normalizedSymptoms = [];
    if (Array.isArray(raw.symptoms)) {
      normalizedSymptoms = raw.symptoms.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof raw.symptoms === 'string' && raw.symptoms.trim().length > 0) {
      normalizedSymptoms = raw.symptoms
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    // 3. Normalize Measurements & Top-level aliases
    const oxygenLevel = raw.currentAssessment?.oxygenLevel !== undefined
      ? raw.currentAssessment.oxygenLevel
      : (raw.oxygenLevel !== undefined ? raw.oxygenLevel : (raw.o2 !== undefined ? raw.o2 : null));

    // CRITICAL CLINICAL SAFETY RULE: NEVER INVENT MISSING CLINICAL FACTS!
    // If not recorded in legacy data, remain null. Never fabricate 37.0°C or 120/80 mmHg.
    const temperature = raw.currentAssessment?.temperature !== undefined
      ? raw.currentAssessment.temperature
      : (raw.temperature !== undefined ? raw.temperature : null);

    const heartRate = raw.currentAssessment?.heartRate !== undefined
      ? raw.currentAssessment.heartRate
      : (raw.heartRate !== undefined ? raw.heartRate : null);

    const systolicBp = raw.currentAssessment?.systolicBp !== undefined
      ? raw.currentAssessment.systolicBp
      : (raw.systolicBp !== undefined ? raw.systolicBp : null);

    const diastolicBp = raw.currentAssessment?.diastolicBp !== undefined
      ? raw.currentAssessment.diastolicBp
      : (raw.diastolicBp !== undefined ? raw.diastolicBp : null);

    // 4. Normalize Status
    let status = raw.status || 'submitted';
    if (status === 'pending') status = 'submitted'; // Legacy 'pending' becomes canonical 'submitted'

    // 5. Normalize Triage Level
    let triageLevel = raw.triageLevel;
    if (!triageLevel && raw.risk) {
      const r = String(raw.risk).toLowerCase();
      if (r === 'low') triageLevel = 'low';
      else if (r === 'moderate' || r === 'medium') triageLevel = 'moderate';
      else if (r === 'high' || r === 'critical') triageLevel = 'high';
      else triageLevel = 'unassigned';
    } else if (!triageLevel) {
      triageLevel = 'unassigned';
    }

    // 6. Build Canonical Observation History
    const observationHistory = Array.isArray(raw.observationHistory) ? [...raw.observationHistory] : [];
    if (observationHistory.length === 0 && oxygenLevel !== null) {
      observationHistory.push({
        id: `obs_o2_baseline_${docId}`,
        type: 'oxygenLevel',
        value: oxygenLevel,
        unit: '%',
        measuredAt: raw.createdAt || new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        provenance: { source: 'legacy_migration', verified: false },
        cycle: 0
      });
    }

    // 7. Assemble Complete Canonical Document
    const canonicalDoc = {
      ...raw,
      id: docId,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      clinicalRevision: raw.clinicalRevision || 1,
      lastRevisionAt: raw.lastRevisionAt || raw.createdAt || new Date().toISOString(),
      status,
      triageLevel,
      currentAssessment: {
        oxygenLevel,
        temperature,
        heartRate,
        systolicBp,
        diastolicBp,
        symptoms: normalizedSymptoms
      },
      // Backward-compatible top-level aliases
      o2: oxygenLevel,
      oxygenLevel,
      temperature,
      heartRate,
      systolicBp,
      diastolicBp,
      symptoms: normalizedSymptoms,
      observationHistory,
      _legacyMigrationArchive: legacyArchive,
      migratedAt: new Date().toISOString()
    };

    return {
      isModified: true,
      canonicalDoc
    };
  }

  // =============================================================================
  // 5. RESUMABLE BATCH MIGRATION ENGINE WITH CHECKPOINTS
  // =============================================================================

  async runBatchMigration({
    collectionName = 'cases',
    items = [],
    batchSize = 50,
    runId = null,
    resume = true,
    simulatePartialFailureAtBatch = null // for testing resilience
  }) {
    const currentRunId = runId || `mig_run_${collectionName}_${Date.now()}`;
    const startTime = Date.now();

    // 1. Checkpoint Resolution
    const checkpointKey = `chk_${collectionName}`;
    let lastCheckpoint = this.checkpoints.get(checkpointKey);

    let startIndex = 0;
    let completedCount = 0;
    let skippedCount = 0;
    let currentBatchNum = 1;

    if (resume && lastCheckpoint && lastCheckpoint.status === 'in_progress') {
      startIndex = lastCheckpoint.lastProcessedIndex + 1;
      completedCount = lastCheckpoint.completedCount;
      currentBatchNum = lastCheckpoint.batchNumber + 1;
    }

    const migratedRecords = [];
    const totalItems = items.length;
    let i = startIndex;

    try {
      for (; i < totalItems; i += batchSize) {
        // Simulated failure injection for resilience validation
        if (simulatePartialFailureAtBatch && currentBatchNum === simulatePartialFailureAtBatch) {
          const err = new Error(`SIMULATED_TRANSIENT_FAILURE: Network interruption during batch ${currentBatchNum}`);
          err.code = 'MIGRATION_BATCH_INTERRUPTED';
          throw err;
        }

        const chunk = items.slice(i, i + batchSize);
        const batchMigrated = [];

        for (const doc of chunk) {
          const res = this.transformToCanonical(doc);
          if (res.isModified) {
            batchMigrated.push(res.canonicalDoc);
            completedCount++;
          } else {
            batchMigrated.push(res.canonicalDoc);
            skippedCount++;
          }
        }

        migratedRecords.push(...batchMigrated);

        // Update Checkpoint after successful batch commit
        const lastIndex = Math.min(i + batchSize - 1, totalItems - 1);
        const checkpoint = {
          checkpointId: `${checkpointKey}_${currentBatchNum}`,
          runId: currentRunId,
          collectionName,
          batchNumber: currentBatchNum,
          lastProcessedIndex: lastIndex,
          lastProcessedId: items[lastIndex]?.id,
          completedCount,
          skippedCount,
          status: lastIndex >= totalItems - 1 ? 'completed' : 'in_progress',
          updatedAt: new Date().toISOString()
        };

        this.checkpoints.set(checkpointKey, checkpoint);
        currentBatchNum++;
      }

      const durationMs = Date.now() - startTime;
      const finalCheckpoint = this.checkpoints.get(checkpointKey);
      if (finalCheckpoint) finalCheckpoint.status = 'completed';

      const runSummary = {
        runId: currentRunId,
        collectionName,
        totalItems,
        migratedCount: completedCount,
        skippedCount,
        status: 'completed',
        durationMs,
        completedAt: new Date().toISOString()
      };

      this.migrationRuns.set(currentRunId, runSummary);
      this._logAudit('MIGRATION_RUN_COMPLETED', runSummary);

      return {
        success: true,
        summary: runSummary,
        migratedRecords
      };

    } catch (err) {
      // Save In-Progress / Failed Checkpoint
      const failedCheckpoint = {
        checkpointId: `${checkpointKey}_failed`,
        runId: currentRunId,
        collectionName,
        batchNumber: currentBatchNum,
        lastProcessedIndex: i - 1 >= 0 ? i - 1 : 0,
        lastProcessedId: items[i - 1]?.id || null,
        completedCount,
        skippedCount,
        status: 'in_progress', // Ready for resume!
        lastError: err.message,
        failedAt: new Date().toISOString()
      };

      this.checkpoints.set(checkpointKey, failedCheckpoint);
      this._logAudit('MIGRATION_RUN_PAUSED_ON_ERROR', {
        runId: currentRunId,
        batchNumber: currentBatchNum,
        error: err.message
      });

      err.checkpoint = failedCheckpoint;
      err.migratedSoFar = migratedRecords;
      throw err;
    }
  }

  // =============================================================================
  // 6. ROLLBACK & RECOVERY ROUTINE
  // =============================================================================

  rollbackDocument(canonicalDoc) {
    if (!canonicalDoc || !canonicalDoc._legacyMigrationArchive) {
      const err = new Error('Cannot rollback document: Missing _legacyMigrationArchive.');
      err.code = 'ROLLBACK_ARCHIVE_MISSING';
      err.statusCode = 400;
      throw err;
    }

    const original = JSON.parse(JSON.stringify(canonicalDoc._legacyMigrationArchive.originalRawFields));
    this._logAudit('MIGRATION_DOCUMENT_ROLLED_BACK', { docId: original.id || canonicalDoc.id });
    return original;
  }

  rollbackBatch(canonicalDocs) {
    const rolledBack = [];
    for (const doc of canonicalDocs) {
      rolledBack.push(this.rollbackDocument(doc));
    }
    this._logAudit('MIGRATION_BATCH_ROLLED_BACK', { count: rolledBack.length });
    return rolledBack;
  }

  // =============================================================================
  // 7. CHECKPOINT & AUDIT QUERIES
  // =============================================================================

  getCheckpoint(collectionName = 'cases') {
    return this.checkpoints.get(`chk_${collectionName}`);
  }

  _logAudit(eventType, metadata = {}) {
    const entry = {
      id: `audit_mig_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      eventType,
      metadata
    };
    this.auditRecords.push(entry);
    return entry;
  }

  getAuditRecords() {
    return this.auditRecords;
  }
}

module.exports = new MigrationIntegrityService();
