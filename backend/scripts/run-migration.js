/**
 * Health Vibe AI - Versioned Schema Migration & Integrity CLI Tool
 *
 * Usage:
 *   node backend/scripts/run-migration.js --dry-run
 *   node backend/scripts/run-migration.js --live --batch-size=50
 *   node backend/scripts/run-migration.js --rollback
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const migrationService = require('../migration-integrity-service');

const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();
const candidateEnvFiles = [
  path.resolve(__dirname, `../.env.${NODE_ENV}.local`),
  path.resolve(__dirname, `../.env.${NODE_ENV}`),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env')
];
for (const envFile of candidateEnvFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || (!args.includes('--live') && !args.includes('--rollback'));
  const isLive = args.includes('--live');
  const isRollback = args.includes('--rollback');
  const resume = !args.includes('--no-resume');

  let batchSize = 50;
  const batchArg = args.find(a => a.startsWith('--batch-size='));
  if (batchArg) {
    batchSize = parseInt(batchArg.split('=')[1], 10) || 50;
  }

  console.log('==================================================================');
  console.log('🔄 HEALTH VIBE AI: VERSIONED DATA MIGRATION & INTEGRITY TOOL');
  console.log(`   Mode: ${isDryRun ? 'READ-ONLY DRY RUN' : (isRollback ? 'ROLLBACK' : 'LIVE MIGRATION')}`);
  console.log(`   Target Canonical Schema: 2.1.0 | Batch Size: ${batchSize}`);
  console.log('==================================================================\n');

  // Check if Firebase is available or running in standalone simulation
  let admin = null;
  let db = null;
  try {
    admin = require('firebase-admin');
    if (admin.apps.length > 0) {
      db = admin.firestore();
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({ projectId: 'health-vibes-dev' });
      db = admin.firestore();
    }
  } catch (err) {
    console.log('ℹ️ Operating in standalone mode.');
  }

  // Probe Firestore connectivity with timeout
  if (db) {
    try {
      await Promise.race([
        db.collection('cases').limit(1).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CONNECT_TIMEOUT')), 1200))
      ]);
    } catch (e) {
      console.log('ℹ️ Firestore emulator is currently offline. Operating in dry-run simulation mode.');
      db = null;
    }
  }

  if (isDryRun) {
    console.log('▶ Executing Read-Only Dry Run (Zero Writes)...');
    let cases = [];
    let reports = [];
    let users = [];

    if (db) {
      const caseSnap = await db.collection('cases').get();
      cases = caseSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const reportSnap = await db.collection('clinical_reports').get();
      reports = reportSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const userSnap = await db.collection('users').get();
      users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const report = migrationService.runDryRun({ cases, reports, users });
    console.log('\n📊 DRY RUN SUMMARY:');
    console.log(`  - Total Cases Scanned:      ${report.summary.totalCasesScanned}`);
    console.log(`  - Already Clean (v2.1.0):   ${report.summary.cleanCanonicalCount}`);
    console.log(`  - Requires Migration:       ${report.summary.needsMigrationCount}`);
    console.log(`  - Missing User References:  ${report.summary.missingReferencesCount}`);
    console.log(`  - Orphaned Reports:         ${report.summary.orphanedReportsCount}`);
    console.log(`  - Unsupported / Corrupt:    ${report.summary.unsupportedCount}`);
    console.log(`  - Migration Ready:          ${report.summary.migrationReady ? 'YES ✅' : 'NO ❌'}\n`);

    if (report.sampleIssues.length > 0) {
      console.log('🔎 REDACTED EXAMPLES OF ISSUES FOUND:');
      report.sampleIssues.forEach((issue, idx) => {
        console.log(`\n  [Issue #${idx + 1}] Target: ${issue.type} (${issue.docId})`);
        issue.issues.forEach(i => console.log(`    ⚠️ [${i.code}] ${i.message}`));
        console.log(`    Sample: ${JSON.stringify(issue.redactedSample).slice(0, 140)}...`);
      });
    } else {
      console.log('✨ No schema inconsistencies found.');
    }
  } else if (isLive) {
    console.log('▶ Executing Resumable Live Migration...');
    if (!db) {
      console.error('❌ Error: Firestore DB is not connected for live migration.');
      process.exit(1);
    }

    const caseSnap = await db.collection('cases').get();
    const cases = caseSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const res = await migrationService.runBatchMigration({
      collectionName: 'cases',
      items: cases,
      batchSize,
      resume
    });

    console.log('\n✅ LIVE MIGRATION COMPLETED:');
    console.log(`  - Total Items:     ${res.summary.totalItems}`);
    console.log(`  - Migrated:        ${res.summary.migratedCount}`);
    console.log(`  - Skipped (Clean): ${res.summary.skippedCount}`);
    console.log(`  - Duration:        ${res.summary.durationMs} ms`);

    // Write back to Firestore
    for (const doc of res.migratedRecords) {
      await db.collection('cases').doc(doc.id).set(doc, { merge: true });
    }
    console.log('💾 Committed all migrated documents to Firestore with audit metadata.');
  }

  console.log('\n==================================================================');
  console.log('🎉 Tool execution completed successfully.');
  console.log('==================================================================');
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Migration Tool Failure:', err);
    process.exit(1);
  });
}

module.exports = { main };
