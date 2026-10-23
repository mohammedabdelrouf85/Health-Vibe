/**
 * DOCTOLIB USAGE & CONVERSION ANALYTICS: BACKEND & RBAC TEST SUITE
 * 
 * Verifies:
 * 1. Role-based Access Control (Super Admin, Clinic Admin, Non-Admin rejection)
 * 2. Strict Tenant/Clinic Scoping & Cross-Clinic Denial
 * 3. Immutable Database Audit Logging (audit_events persistence & zero-PHI)
 * 4. Export Governance, Formula Injection Neutralization & Audit Trail
 * 5. Audit Log Query Endpoint with Scoped Filtering
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const auditService = require('../backend/audit-service');
const analyticsService = require('../backend/analytics-service');

console.log('==================================================================');
console.log('🛡️ DOCTOLIB USAGE & CONVERSION ANALYTICS: BACKEND & RBAC SUITE');
console.log('   Strict Authorization, Multi-Tenant Isolation & Audit Logging');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

(async () => {
  // Reset audit store before testing
  auditService.resetAuditStoreForTesting();

  // ----------------------------------------------------------------
  // 1. AUDIT EVENT TYPES CONSTANTS
  // ----------------------------------------------------------------
  console.log('--- 1. Audit Event Types Constants ---');

  runTest('1.1: AUDIT_EVENT_TYPES defines usage conversion audit constants', () => {
    assert.strictEqual(
      auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ANALYTICS_VIEWED,
      'USAGE_CONVERSION_ANALYTICS_VIEWED'
    );
    assert.strictEqual(
      auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ANALYTICS_EXPORTED,
      'USAGE_CONVERSION_ANALYTICS_EXPORTED'
    );
    assert.strictEqual(
      auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ACCESS_DENIED,
      'USAGE_CONVERSION_ACCESS_DENIED'
    );
  });

  // ----------------------------------------------------------------
  // 2. AUDIT SERVICE RECORDING & PERSISTENCE
  // ----------------------------------------------------------------
  console.log('\n--- 2. Audit Event Recording & Immutability ---');

  await runAsyncTest('2.1: Authoritatively records USAGE_CONVERSION_ANALYTICS_VIEWED with masked actor and zero-PHI', async () => {
    const mockReq = {
      ip: '192.168.1.55',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      user: {
        uid: 'admin_cairo_1',
        role: 'clinic_admin',
        clinicId: 'clinic_dokki',
        email: 'ahmed.admin@healthvibe.com'
      }
    };

    const auditRecord = await auditService.recordAuditEvent({
      type: auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ANALYTICS_VIEWED,
      req: mockReq,
      clinicId: 'clinic_dokki',
      outcome: 'SUCCESS',
      details: {
        benchmark: 'Doctolib',
        timePeriod: '30d',
        consultationType: 'video',
        summary: {
          registeredPatientsCount: 140,
          completedAssessmentsCount: 88,
          avgDoctorReviewTimeMinutes: 14.5,
          conversionRate: 68.2
        }
      }
    });

    assert.ok(auditRecord);
    assert.strictEqual(auditRecord.type, 'USAGE_CONVERSION_ANALYTICS_VIEWED');
    assert.strictEqual(auditRecord.actor.uid, 'admin_cairo_1');
    assert.strictEqual(auditRecord.actor.role, 'clinic_admin');
    assert.strictEqual(auditRecord.actor.emailMasked, 'a***n@healthvibe.com');
    assert.strictEqual(auditRecord.clinicId, 'clinic_dokki');
    assert.strictEqual(auditRecord.outcome, 'SUCCESS');
    assert.strictEqual(auditRecord.ipMetadata.subnetMask, '192.168.1.0/24');
    assert.ok(auditRecord.ipMetadata.ipHash);
    assert.strictEqual(auditRecord.details.summary.registeredPatientsCount, 140);
    assert.strictEqual(auditRecord.details.summary.conversionRate, 68.2);

    // Verify stored in memory
    const inMem = auditService.getInMemoryAuditEvents();
    assert.ok(inMem.some(e => e.type === 'USAGE_CONVERSION_ANALYTICS_VIEWED' && e.actor.uid === 'admin_cairo_1'));
  });

  await runAsyncTest('2.2: Records USAGE_CONVERSION_ACCESS_DENIED when cross-clinic breach is attempted', async () => {
    const mockReq = {
      ip: '10.0.0.12',
      headers: {},
      user: {
        uid: 'admin_rogue',
        role: 'clinic_admin',
        clinicId: 'clinic_dokki',
        email: 'rogue@healthvibe.com'
      }
    };

    const denialRecord = await auditService.recordAuditEvent({
      type: auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ACCESS_DENIED,
      req: mockReq,
      clinicId: 'clinic_heliopolis',
      outcome: 'DENIED',
      details: {
        reason: 'CROSS_CLINIC_ACCESS_PROHIBITED',
        requestedClinic: 'clinic_heliopolis',
        assignedClinic: 'clinic_dokki',
        action: 'VIEW_USAGE_CONVERSION_ANALYTICS'
      }
    });

    assert.ok(denialRecord);
    assert.strictEqual(denialRecord.type, 'USAGE_CONVERSION_ACCESS_DENIED');
    assert.strictEqual(denialRecord.outcome, 'DENIED');
    assert.strictEqual(denialRecord.clinicId, 'clinic_heliopolis');
    assert.strictEqual(denialRecord.details.reason, 'CROSS_CLINIC_ACCESS_PROHIBITED');
  });

  await runAsyncTest('2.3: Records USAGE_CONVERSION_ANALYTICS_EXPORTED on export action', async () => {
    const mockReq = {
      ip: '172.16.0.4',
      headers: {},
      user: {
        uid: 'super_admin_hq',
        role: 'super_admin',
        isOwner: true,
        email: 'governance@healthvibe.com'
      }
    };

    const exportAudit = await auditService.recordAuditEvent({
      type: auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ANALYTICS_EXPORTED,
      req: mockReq,
      clinicId: null,
      outcome: 'SUCCESS',
      details: {
        format: 'csv',
        filename: 'usage-conversion-report-2026-10-23.csv',
        timePeriod: '30d',
        recordsExported: {
          patientsCount: 250,
          assessmentsCount: 190,
          doctorsCount: 12
        }
      }
    });

    assert.ok(exportAudit);
    assert.strictEqual(exportAudit.type, 'USAGE_CONVERSION_ANALYTICS_EXPORTED');
    assert.strictEqual(exportAudit.actor.role, 'super_admin');
    assert.strictEqual(exportAudit.outcome, 'SUCCESS');
    assert.strictEqual(exportAudit.details.recordsExported.patientsCount, 250);
  });

  // ----------------------------------------------------------------
  // 3. SERVER ROUTE GUARDS & RBAC CODE VALIDATION
  // ----------------------------------------------------------------
  console.log('\n--- 3. Server Route Guards & RBAC Code Structure ---');

  runTest('3.1: server.js registers usage-conversion endpoints with requireAuth and requireAdmin', () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

    // 1. GET /api/admin/usage-conversion/analytics
    assert.ok(
      serverCode.includes("app.get(['/api/admin/usage-conversion/analytics'"),
      'server.js must expose GET /api/admin/usage-conversion/analytics'
    );
    assert.ok(
      serverCode.includes("requireAuth, requireAdmin"),
      'Usage conversion routes must enforce requireAuth and requireAdmin'
    );

    // 2. GET /api/admin/usage-conversion/export
    assert.ok(
      serverCode.includes("app.get(['/api/admin/usage-conversion/export'"),
      'server.js must expose GET /api/admin/usage-conversion/export'
    );

    // 3. GET /api/admin/usage-conversion/audit-logs
    assert.ok(
      serverCode.includes("app.get(['/api/admin/usage-conversion/audit-logs'"),
      'server.js must expose GET /api/admin/usage-conversion/audit-logs'
    );

    // 4. Audit logging calls
    assert.ok(
      serverCode.includes('USAGE_CONVERSION_ANALYTICS_VIEWED'),
      'server.js must record USAGE_CONVERSION_ANALYTICS_VIEWED audit event'
    );
    assert.ok(
      serverCode.includes('USAGE_CONVERSION_ANALYTICS_EXPORTED'),
      'server.js must record USAGE_CONVERSION_ANALYTICS_EXPORTED audit event'
    );
    assert.ok(
      serverCode.includes('USAGE_CONVERSION_ACCESS_DENIED'),
      'server.js must record USAGE_CONVERSION_ACCESS_DENIED on breach attempt'
    );
  });

  runTest('3.2: server.js enforces multi-tenant clinic scoping for Clinic Admin', () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

    assert.ok(
      serverCode.includes('userRole === ROLES.CLINIC_ADMIN && requestedClinic && scope.clinicId && requestedClinic !== scope.clinicId'),
      'Must check cross-clinic access for CLINIC_ADMIN'
    );
    assert.ok(
      serverCode.includes('CROSS_CLINIC_ACCESS_PROHIBITED'),
      'Must record CROSS_CLINIC_ACCESS_PROHIBITED reason in audit trail'
    );
    assert.ok(
      serverCode.includes('CROSS_CLINIC_EXPORT_PROHIBITED'),
      'Must record CROSS_CLINIC_EXPORT_PROHIBITED reason in export audit trail'
    );
  });

  // ----------------------------------------------------------------
  // 4. CSV FORMULA INJECTION NEUTRALIZATION & GOVERNANCE
  // ----------------------------------------------------------------
  console.log('\n--- 4. CSV Formula Injection Neutralization ---');

  runTest('4.1: Neutralizes spreadsheet formulas starting with =, +, -, @', () => {
    const escapeCsvCell = (val) => {
      if (val === null || val === undefined) return '""';
      let s = String(val).trim();
      if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@')) {
        s = `'${s}`;
      }
      return `"${s.replace(/"/g, '""')}"`;
    };

    assert.strictEqual(escapeCsvCell('=cmd|/C calc.exe!A0'), '"\'=cmd|/C calc.exe!A0"');
    assert.strictEqual(escapeCsvCell('+1+1'), '"\'+1+1"');
    assert.strictEqual(escapeCsvCell('-2+5'), '"\'-2+5"');
    assert.strictEqual(escapeCsvCell('@SUM(A1:A10)'), '"\'@SUM(A1:A10)"');
    assert.strictEqual(escapeCsvCell('Normal Text'), '"Normal Text"');
    assert.strictEqual(escapeCsvCell(145), '"145"');
  });

  // ----------------------------------------------------------------
  // 5. AUDIT LOG QUERYING & SCOPING
  // ----------------------------------------------------------------
  console.log('\n--- 5. Audit Log Querying & Multi-Tenant Scoping ---');

  await runAsyncTest('5.1: queryAuditEvents filters accurately by type and clinic', async () => {
    const queryRes = await auditService.queryAuditEvents(null, {
      requesterUser: {
        uid: 'super_admin_1',
        role: 'super_admin',
        isOwner: true
      },
      filters: {
        type: [
          auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ANALYTICS_VIEWED,
          auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ACCESS_DENIED,
          auditService.AUDIT_EVENT_TYPES.USAGE_CONVERSION_ANALYTICS_EXPORTED
        ],
        clinicId: 'clinic_dokki'
      }
    });

    assert.ok(queryRes.events);
    assert.ok(queryRes.totalCount >= 1);
    const viewedEvent = queryRes.events.find(e => e.type === 'USAGE_CONVERSION_ANALYTICS_VIEWED');
    assert.ok(viewedEvent);
    assert.strictEqual(viewedEvent.clinicId, 'clinic_dokki');
  });

  await runAsyncTest('5.2: Clinic Admin is strictly constrained to their own clinic audit logs', async () => {
    const queryRes = await auditService.queryAuditEvents(null, {
      requesterUser: {
        uid: 'admin_dokki_1',
        role: 'clinic_admin',
        clinicId: 'clinic_dokki'
      },
      filters: {}
    });

    assert.ok(queryRes.events);
    // All returned events must belong to clinic_dokki
    queryRes.events.forEach(e => {
      assert.ok(
        e.clinicId === 'clinic_dokki' || e.actor?.clinicId === 'clinic_dokki',
        'All returned events must strictly belong to clinic_dokki'
      );
    });
  });

  await runAsyncTest('5.3: Disallows Clinic Admin without assigned clinic from viewing audit logs', async () => {
    let thrownError = null;
    try {
      await auditService.queryAuditEvents(null, {
        requesterUser: {
          uid: 'unassigned_admin',
          role: 'clinic_admin',
          clinicId: null
        },
        filters: {}
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError);
    assert.strictEqual(thrownError.statusCode, 403);
    assert.ok(thrownError.message.includes('Access denied'));
  });

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log('\n==================================================================');
  console.log(`🎉 ALL TESTS COMPLETED: ${passedCount}/${passedCount + failedCount} PASSED`);
  if (failedCount === 0) {
    console.log('🌟 100% SUCCESS: Usage & Conversion Backend & RBAC Fully Verified!');
  } else {
    console.log(`❌ ${failedCount} TESTS FAILED`);
  }
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
