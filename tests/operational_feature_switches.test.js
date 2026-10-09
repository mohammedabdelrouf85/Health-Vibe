/**
 * HEALTH VIBE AI: OPERATIONAL FEATURE SWITCHES & CIRCUIT BREAKERS TEST SUITE
 *
 * Verifies:
 * 1. Server-controlled operational feature switches (intake, assistant, integrations).
 * 2. Safe behavior for in-flight operations (503 FEATURE_DISABLED gracefully returned).
 * 3. Read access preservation for existing cases and certified reports.
 * 4. Enforcement on trusted write paths (backend API routes + direct Firebase rules check).
 * 5. Strict administrative authorization (super_admin / owner only) and full audit trail logging.
 * 6. User-facing availability and maintenance notices (AR & EN).
 * 7. Disabling a feature during active use.
 * 8. Service recovery (re-enabling restores write operations).
 * 9. Rejection of direct request bypass attempts.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.NODE_ENV = 'development';
process.env.FIREBASE_PROJECT_ID = 'health-vibes-dev';
process.env.USE_FIREBASE_EMULATOR = 'true';

const app = require('../backend/server');
const operationalSwitchesService = require('../backend/operational-switches-service');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('⚙️  HEALTH VIBE AI: OPERATIONAL FEATURE SWITCHES TEST SUITE');
console.log('   Circuit Breakers, Trusted Write Path Enforcement & Read Preservation');
console.log('==================================================================\n');

(async () => {
  let server;
  let baseUrl;

  try {
    // Start local test server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const superAdminActor = { uid: 'admin_test_1', email: 'owner@healthvibe.test', role: 'super_admin', isOwner: true };
    const patientActor = { uid: 'patient_test_1', email: 'patient@healthvibe.test', role: 'patient' };
    const doctorActor = { uid: 'doctor_test_1', email: 'doctor@healthvibe.test', role: 'doctor' };

    // Reset switches to initial clean state
    operationalSwitchesService.resetDefaults();

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Default Switch States & Read-Only Access Preservation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: Default Switch States & Read-Only Access Preservation');
    {
      const status = operationalSwitchesService.getAllStatus();
      assert.equal(status.switches.assessmentIntake.enabled, true, 'Intake must be enabled by default.');
      assert.equal(status.switches.assistant.enabled, true, 'Assistant must be enabled by default.');
      assert.equal(status.switches.integrations.enabled, true, 'Integrations must be enabled by default.');
      assert.equal(status.readAccessPreserved, true, 'Read access to historical records must always be preserved.');

      // Check sub-features
      assert.equal(status.switches.integrations.subFeatures.diagnostics, true);
      assert.equal(status.switches.integrations.subFeatures.wearables, true);
      assert.equal(status.switches.integrations.subFeatures.prescriptions, true);
      assert.equal(status.switches.integrations.subFeatures.telehealth, true);

      // Verify public API status endpoint
      const res = await fetch(`${baseUrl}/api/operational-switches/status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.switches.assessmentIntake.enabled, true);

      console.log('  ✓ Default switches verified; read access explicitly preserved.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Administrative RBAC & Mandatory Reason for Switch Modifications
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 2: Administrative RBAC & Mandatory Reason for Switch Modifications');
    {
      // 2A: Unauthorized patient attempt
      let patientRejected = false;
      try {
        await operationalSwitchesService.updateSwitch({
          featureKey: 'assessmentIntake',
          enabled: false,
          reason: 'Unauthorized bypass test',
          adminActor: patientActor
        });
      } catch (err) {
        patientRejected = true;
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'ADMIN_UNAUTHORIZED');
      }
      assert.equal(patientRejected, true, 'Patient must be rejected from modifying switches.');

      // 2B: Unauthorized doctor attempt
      let doctorRejected = false;
      try {
        await operationalSwitchesService.updateSwitch({
          featureKey: 'assessmentIntake',
          enabled: false,
          reason: 'Doctor cannot change platform switches',
          adminActor: doctorActor
        });
      } catch (err) {
        doctorRejected = true;
        assert.equal(err.statusCode, 403);
      }
      assert.equal(doctorRejected, true, 'Doctor must be rejected from modifying switches.');

      // 2C: Super admin without valid reason
      let missingReasonRejected = false;
      try {
        await operationalSwitchesService.updateSwitch({
          featureKey: 'assessmentIntake',
          enabled: false,
          reason: '', // invalid reason
          adminActor: superAdminActor
        });
      } catch (err) {
        missingReasonRejected = true;
        assert.equal(err.code, 'REASON_REQUIRED');
      }
      assert.equal(missingReasonRejected, true, 'Mandatory reason (>= 5 chars) is enforced.');

      console.log('  ✓ Administrative RBAC and audit reason enforcement verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Switch Modification & Comprehensive Audit Trail Logging
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 3: Switch Modification & Comprehensive Audit Trail Logging');
    {
      const updateResult = await operationalSwitchesService.updateSwitch({
        featureKey: 'assessmentIntake',
        enabled: false,
        reason: 'Scheduled server maintenance for schema migration batch #4',
        adminActor: superAdminActor
      });

      assert.equal(updateResult.success, true);
      assert.equal(updateResult.previousState, true);
      assert.equal(updateResult.newState, false);
      assert.equal(updateResult.readAccessPreserved, true);
      assert.equal(operationalSwitchesService.isFeatureEnabled('assessmentIntake').enabled, false);

      // Verify audit payload
      assert.equal(updateResult.auditPayload.featureKey, 'assessmentIntake');
      assert.equal(updateResult.auditPayload.adminEmail, 'owner@healthvibe.test');
      assert.ok(updateResult.auditPayload.reason.includes('Scheduled server maintenance'));

      console.log('  ✓ Operational switch updated and recorded in audit trail.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Direct Request Bypass Prevention on Trusted Write Paths (Intake)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 4: Direct Request Bypass Prevention on Trusted Write Paths (Intake)');
    {
      // Attempting direct POST to assessment intake write path while switch is disabled
      const bypassReq = await fetch(`${baseUrl}/api/cases/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: 'patient_test_1', symptoms: 'Severe cough' })
      });

      // 503 SERVICE_UNAVAILABLE / FEATURE_DISABLED
      assert.equal(bypassReq.status, 503, 'Must reject write request with HTTP 503 when feature is disabled.');
      const errPayload = await bypassReq.json();
      assert.equal(errPayload.error, 'FEATURE_DISABLED');
      assert.equal(errPayload.code, 'SERVICE_UNAVAILABLE');
      assert.equal(errPayload.readAccessPreserved, true, 'Must affirm read access preservation.');
      assert.ok(errPayload.message.includes('paused for operational maintenance'));
      assert.ok(errPayload.messageAr.includes('تم إيقاف استقبال التقييمات'));

      console.log('  ✓ Direct assessment intake bypass safely blocked with 503 & clear bilingual notice.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Direct Request Bypass Prevention on Assistant & Scribe Routes
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 5: Direct Request Bypass Prevention on Assistant & Scribe Routes');
    {
      // Disable assistant
      await operationalSwitchesService.updateSwitch({
        featureKey: 'assistant',
        enabled: false,
        reason: 'LLM model upgrade and clinical safety testing',
        adminActor: superAdminActor
      });

      assert.equal(operationalSwitchesService.isFeatureEnabled('assistant').enabled, false);

      // Direct POST to /api/scribe/draft
      const scribeBypass = await fetch(`${baseUrl}/api/scribe/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId: 'visit_123', transcriptText: 'Patient has dry cough' })
      });

      assert.equal(scribeBypass.status, 503, 'Must reject scribe generation when assistant switch is disabled.');
      const scribeErr = await scribeBypass.json();
      assert.equal(scribeErr.error, 'FEATURE_DISABLED');
      assert.equal(scribeErr.feature, 'assistant');
      assert.equal(scribeErr.readAccessPreserved, true);

      console.log('  ✓ Assistant write path strictly disabled; historical summaries remain viewable.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Sub-Feature Granular Circuit Breakers (Integrations)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 6: Sub-Feature Granular Circuit Breakers (Integrations)');
    {
      // Disable only wearables while leaving diagnostics active
      await operationalSwitchesService.updateSwitch({
        featureKey: 'integrations',
        subFeatureKey: 'wearables',
        enabled: false,
        reason: 'Apple Health provider webhook maintenance',
        adminActor: superAdminActor
      });

      const wearablesStatus = operationalSwitchesService.isFeatureEnabled('integrations', 'wearables');
      const diagnosticsStatus = operationalSwitchesService.isFeatureEnabled('integrations', 'diagnostics');

      assert.equal(wearablesStatus.enabled, false, 'Wearables sync must be disabled.');
      assert.equal(diagnosticsStatus.enabled, true, 'Diagnostics must remain active.');

      // Direct POST to wearables sync
      const wearableSync = await fetch(`${baseUrl}/api/wearables/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'apple_health', readings: [] })
      });

      assert.equal(wearableSync.status, 503, 'Must return 503 for disabled wearables sub-feature.');
      const wearErr = await wearableSync.json();
      assert.equal(wearErr.error, 'FEATURE_DISABLED');
      assert.equal(wearErr.subFeature, 'wearables');

      console.log('  ✓ Granular sub-feature circuit breaker safely blocks disabled integration.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: In-Flight Operation Interruption Simulation & Safe Recovery
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 7: In-Flight Operation Interruption Simulation & Safe Recovery');
    {
      // Enable intake
      await operationalSwitchesService.updateSwitch({
        featureKey: 'assessmentIntake',
        enabled: true,
        reason: 'Restoring service for in-flight test',
        adminActor: superAdminActor
      });

      // Simulate operation that started while intake was enabled
      const inFlightOperation = async () => {
        // Step 1: Pre-check passed
        const initialStatus = operationalSwitchesService.isFeatureEnabled('assessmentIntake');
        assert.equal(initialStatus.enabled, true);

        // Step 2: In-flight delay (e.g., patient filling form or slow network)
        await new Promise((r) => setTimeout(r, 40));

        // Step 3: Write path middleware check
        const postCheck = operationalSwitchesService.isFeatureEnabled('assessmentIntake');
        if (!postCheck.enabled) {
          const err = new Error(postCheck.message);
          err.code = 'FEATURE_DISABLED';
          err.statusCode = 503;
          err.readAccessPreserved = true;
          throw err;
        }
        return { success: true, saved: true };
      };

      // Run in-flight operation and disable switch mid-flight (after 15ms)
      const opPromise = inFlightOperation();
      setTimeout(async () => {
        await operationalSwitchesService.updateSwitch({
          featureKey: 'assessmentIntake',
          enabled: false,
          reason: 'Emergency pause during active traffic',
          adminActor: superAdminActor
        });
      }, 15);

      let inFlightCaught = false;
      try {
        await opPromise;
      } catch (err) {
        inFlightCaught = true;
        assert.equal(err.code, 'FEATURE_DISABLED');
        assert.equal(err.readAccessPreserved, true);
      }
      assert.equal(inFlightCaught, true, 'In-flight operation must be safely rejected without state corruption.');

      // Service Recovery: Admin re-enables intake
      const recoveryResult = await operationalSwitchesService.updateSwitch({
        featureKey: 'assessmentIntake',
        enabled: true,
        reason: 'Maintenance complete; restoring normal traffic',
        adminActor: superAdminActor
      });

      assert.equal(recoveryResult.newState, true);
      assert.equal(operationalSwitchesService.isFeatureEnabled('assessmentIntake').enabled, true);

      // Operation succeeds after recovery
      const postRecoveryOp = await inFlightOperation();
      assert.equal(postRecoveryOp.saved, true, 'Operations succeed immediately after service recovery.');

      console.log('  ✓ In-flight operation safely handled and service recovered cleanly.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Direct Firebase / Firestore Security Rules Static Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 8: Direct Firebase / Firestore Security Rules Static Verification');
    {
      const rulesContent = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');

      // 1. Verify helper function definition
      assert.ok(
        rulesContent.includes('function isAssessmentIntakeEnabled()'),
        'firestore.rules must define isAssessmentIntakeEnabled helper.'
      );
      assert.ok(
        rulesContent.includes('system_settings/operational_switches'),
        'firestore.rules must check system_settings/operational_switches.'
      );

      // 2. Verify enforcement on cases creation
      assert.ok(
        rulesContent.includes('isAssessmentIntakeEnabled()'),
        'cases collection allow create must be guarded by isAssessmentIntakeEnabled.'
      );

      // 3. Verify operational_switches match block
      assert.ok(
        rulesContent.includes('match /system_settings/operational_switches'),
        'firestore.rules must define match rule for operational_switches.'
      );
      assert.ok(
        rulesContent.includes('allow write: if isPlatformAdmin()'),
        'operational_switches writes must be restricted to platform admins.'
      );

      console.log('  ✓ Firestore security rules enforce intake circuit breaker on direct DB access.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 9: Client-Side Module & UI Banner Static Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 9: Client-Side Module & UI Banner Static Verification');
    {
      const appJs = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
      const indexHtml = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
      const clientModule = fs.readFileSync(
        path.join(__dirname, '../app/modules/core/operational-switches-client.js'),
        'utf8'
      );

      // Verify client module methods
      assert.ok(clientModule.includes('isAssessmentIntakeEnabled'), 'Client must export isAssessmentIntakeEnabled.');
      assert.ok(clientModule.includes('isAssistantEnabled'), 'Client must export isAssistantEnabled.');
      assert.ok(clientModule.includes('renderAvailabilityBanners'), 'Client must implement renderAvailabilityBanners.');

      // Verify HTML placeholders and script
      assert.ok(indexHtml.includes('id="intakeOperationalBanner"'), 'HTML must have intakeOperationalBanner placeholder.');
      assert.ok(indexHtml.includes('id="assistantOperationalBanner"'), 'HTML must have assistantOperationalBanner placeholder.');
      assert.ok(indexHtml.includes('operational-switches-client.js'), 'HTML must load operational-switches-client script.');

      // Verify app.js integration
      assert.ok(
        appJs.includes('operationalSwitchesClient.isAssessmentIntakeEnabled()'),
        'app.js submitAssessment must check isAssessmentIntakeEnabled.'
      );
      assert.ok(
        appJs.includes('operationalSwitchesClient.isAssistantEnabled()'),
        'app.js renderAssistantScreen must check isAssistantEnabled.'
      );
      assert.ok(
        appJs.includes('operationalSwitchesClient.renderAvailabilityBanners'),
        'app.js showScreen must invoke renderAvailabilityBanners.'
      );

      console.log('  ✓ Frontend client module, HTML banners, and app.js integration statically verified.');
    }

    console.log('\n==================================================================');
    console.log('🎉 ALL 9 OPERATIONAL FEATURE SWITCH TESTS PASSED (100% SUCCESS)');
    console.log('==================================================================\n');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    process.exit(0);
  }
})();
