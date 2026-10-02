/**
 * HEALTH VIBE AI: ASYNCHRONOUS CONTEXT & AUTH LIFECYCLE TEST SUITE
 *
 * Verifies:
 * 1. Authentication-context generation identifiers (authGenerationId).
 * 2. Delayed request for account A completing after account B signs in (dropped, no UI pollution).
 * 3. In-flight request cancellation via AbortController registry on logout / switch.
 * 4. Unsubscribing all real-time Firestore listeners on auth change.
 * 5. In-memory cache purging and sensitive DOM scrubbing.
 * 6. Rapid case switching guard (caseGenerationId & CASE_CONTEXT_MISMATCH).
 * 7. Mid-flight permission revocation guard (PERMISSION_REVOKED).
 * 8. Clinic context isolation and switching (clinicGenerationId).
 * 9. Comprehensive lifecycle audit trail.
 * 10. Codebase integration in app.js and index.html.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const asyncContextManager = require('../app/modules/core/async-context-manager');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: ASYNC CONTEXT & AUTH LIFECYCLE TEST SUITE');
console.log('   Generations, Obsolete Guard, Cancellation, Unsub & Cache Purge');
console.log('==================================================================\n');

(async () => {
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Authentication-Context Generation Tracking and Invalidation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: Authentication-Context Generation Tracking and Invalidation');
    {
      asyncContextManager.reset();
      assert.equal(asyncContextManager.authGenerationId, 1, 'Initial generation ID must be 1.');

      const userA = { uid: 'user_patient_A', email: 'patientA@example.com', role: 'patient' };
      asyncContextManager.handleAuthChange('LOGIN', userA);

      assert.equal(asyncContextManager.authGenerationId, 2, 'Auth generation ID must increment on LOGIN.');
      assert.equal(asyncContextManager.currentContext.userId, 'user_patient_A');

      const snapshotA = asyncContextManager.captureContext();
      assert.equal(snapshotA.authGenerationId, 2);
      assert.equal(snapshotA.userId, 'user_patient_A');

      const checkA = asyncContextManager.isContextValid(snapshotA);
      assert.equal(checkA.valid, true, 'Snapshot must be valid while Account A is active.');

      // Sign out Account A
      asyncContextManager.handleAuthChange('LOGOUT');
      assert.equal(asyncContextManager.authGenerationId, 3, 'Auth generation ID must increment on LOGOUT.');
      assert.equal(asyncContextManager.currentContext.userId, null);

      const checkAAfterLogout = asyncContextManager.isContextValid(snapshotA);
      assert.equal(checkAAfterLogout.valid, false, 'Snapshot from previous session must be invalid after LOGOUT.');
      assert.equal(checkAAfterLogout.reason, 'AUTH_GENERATION_MISMATCH');

      console.log('  ✓ Generation ID increments and invalidates obsolete context snapshots.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Delayed Request for Account A Completing After Account B Signs In
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 2: Delayed Request for Account A Completing After Account B Signs In');
    {
      asyncContextManager.reset();

      // Step 1: Account A logs in
      const userA = { uid: 'user_patient_A', email: 'alice@healthvibe.test', role: 'patient' };
      asyncContextManager.handleAuthChange('LOGIN', userA);
      const snapshotAccountA = asyncContextManager.captureContext();

      // UI state placeholder
      let renderedPatientName = 'Alice';
      let uiUpdatedWithStaleData = false;

      // Simulated delayed network request for Account A (takes 50ms)
      const delayedRequestForAccountA = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            patientId: 'user_patient_A',
            confidentialDiagnosis: 'Severe Acute Bronchitis',
            labResults: ['SpO2: 89%', 'CRP: High']
          });
        }, 50);
      });

      // Step 2: Account A logs out and Account B logs in while request is still pending
      setTimeout(() => {
        const userB = { uid: 'user_patient_B', email: 'bob@healthvibe.test', role: 'patient' };
        asyncContextManager.handleAuthChange('SWITCH_ACCOUNT', userB);
        renderedPatientName = 'Bob';
      }, 20);

      // Step 3: Account A's delayed request finishes
      const delayedResult = await delayedRequestForAccountA;

      // Pre-application validation: recheck context validity
      const validation = asyncContextManager.isContextValid(snapshotAccountA, { requireSameUser: true });

      if (validation.valid) {
        // Obsolete data applied (BUG!)
        uiUpdatedWithStaleData = true;
        renderedPatientName = 'Alice (LEAKED)';
      } else {
        // Discarded correctly!
        uiUpdatedWithStaleData = false;
      }

      assert.equal(validation.valid, false, 'Delayed response for Account A must be rejected.');
      assert.equal(validation.reason, 'AUTH_GENERATION_MISMATCH');
      assert.equal(uiUpdatedWithStaleData, false, 'Stale clinical data must NOT update the interface.');
      assert.equal(renderedPatientName, 'Bob', 'Account B UI state must remain untouched.');

      // Also verify guardAsync helper behaves identically
      let guardCaught = false;
      try {
        await asyncContextManager.guardAsync(async () => {
          await new Promise((r) => setTimeout(r, 40));
          return { data: 'stale' };
        }, {
          contextOverrides: { authGenerationId: 999, userId: 'impostor' }
        });
      } catch (err) {
        guardCaught = true;
        assert.equal(err.isObsoleteContext, true, 'guardAsync must throw isObsoleteContext error.');
      }
      assert.equal(guardCaught, true, 'guardAsync must reject stale/mismatched execution.');

      console.log('  ✓ Delayed response for Account A was safely discarded; Account B UI unpolluted.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: In-Flight Request Cancellation via AbortController Registry
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 3: In-Flight Request Cancellation via AbortController Registry');
    {
      asyncContextManager.reset();
      asyncContextManager.handleAuthChange('LOGIN', { uid: 'user_1', role: 'doctor' });

      // Create 3 active requests
      const ctrl1 = asyncContextManager.createAbortController('fetch_cases');
      const ctrl2 = asyncContextManager.createAbortController('fetch_profile');
      const ctrl3 = asyncContextManager.createAbortController('fetch_analytics');

      assert.equal(asyncContextManager.activeAbortControllers.size, 3, 'Must track 3 active controllers.');
      assert.equal(ctrl1.signal.aborted, false);
      assert.equal(ctrl2.signal.aborted, false);
      assert.equal(ctrl3.signal.aborted, false);

      // User signs out -> must abort all in-flight requests immediately
      const cancelledCount = asyncContextManager.cancelAllRequests('AUTH_LOGOUT');

      assert.equal(cancelledCount, 3, 'Must cancel all 3 active requests.');
      assert.equal(ctrl1.signal.aborted, true, 'Controller 1 must be aborted.');
      assert.equal(ctrl2.signal.aborted, true, 'Controller 2 must be aborted.');
      assert.equal(ctrl3.signal.aborted, true, 'Controller 3 must be aborted.');
      assert.equal(asyncContextManager.activeAbortControllers.size, 0, 'Registry must be cleared.');

      console.log('  ✓ Central AbortController registry aborted all in-flight network requests.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Real-time Firestore Subscriptions Unsubscribed on Auth Change
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 4: Real-time Firestore Subscriptions Unsubscribed on Auth Change');
    {
      asyncContextManager.reset();
      asyncContextManager.handleAuthChange('LOGIN', { uid: 'doctor_1', role: 'doctor' });

      let patientCasesUnsubCalled = false;
      let doctorQueueUnsubCalled = false;
      let notificationsUnsubCalled = false;

      const unsubPatientCases = () => { patientCasesUnsubCalled = true; };
      const unsubDoctorQueue = () => { doctorQueueUnsubCalled = true; };
      const unsubNotifications = () => { notificationsUnsubCalled = true; };

      asyncContextManager.registerSubscription(unsubPatientCases, { type: 'patientCases' });
      asyncContextManager.registerSubscription(unsubDoctorQueue, { type: 'doctorQueue' });
      asyncContextManager.registerSubscription(unsubNotifications, { type: 'notifications' });

      assert.equal(asyncContextManager.activeSubscriptions.size, 3, 'Must track 3 active subscriptions.');

      // On logout or account switch:
      asyncContextManager.handleAuthChange('LOGOUT');

      assert.equal(patientCasesUnsubCalled, true, 'patientCases listener must be unsubscribed.');
      assert.equal(doctorQueueUnsubCalled, true, 'doctorQueue listener must be unsubscribed.');
      assert.equal(notificationsUnsubCalled, true, 'notifications listener must be unsubscribed.');
      assert.equal(asyncContextManager.activeSubscriptions.size, 0, 'Subscription registry must be empty.');

      console.log('  ✓ All active Firestore listeners automatically unsubscribed on auth change.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Sensitive In-Memory Caches Purged and DOM Scrubbing on Logout
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 5: Sensitive In-Memory Caches Purged and DOM Scrubbing on Logout');
    {
      asyncContextManager.reset();
      asyncContextManager.handleAuthChange('LOGIN', { uid: 'patient_secret', role: 'patient' });

      // Put sensitive data into internal cache
      asyncContextManager.setCache('patient_profile', {
        ssn: '123-45-6789',
        diagnosis: 'Stage 2 Hypertension',
        medications: ['Lisinopril 10mg']
      });

      assert.notEqual(asyncContextManager.getCache('patient_profile'), null, 'Cached profile must be accessible.');

      // Register external cache purger (e.g. for window._cachedUserDoc)
      let customStoreWiped = false;
      let simulatedCustomStore = { name: 'John Doe', bloodType: 'O+' };
      asyncContextManager.registerCachePurger(() => {
        simulatedCustomStore = null;
        customStoreWiped = true;
      });

      // Register DOM scrubber
      let domScrubbed = false;
      let mockDOM = {
        patientName: 'John Doe',
        doctorNote: 'Confidential psychiatric assessment',
        reviewPanelVisible: true
      };
      asyncContextManager.registerDomScrubber(() => {
        mockDOM.patientName = '';
        mockDOM.doctorNote = '';
        mockDOM.reviewPanelVisible = false;
        domScrubbed = true;
      });

      // User switches account
      asyncContextManager.handleAuthChange('SWITCH_ACCOUNT', { uid: 'patient_other' });

      // Internal cache must be cleared
      assert.equal(asyncContextManager.getCache('patient_profile'), null, 'Internal cache must be purged.');

      // External cache purger executed
      assert.equal(customStoreWiped, true, 'External cache purger must be called.');
      assert.equal(simulatedCustomStore, null, 'Custom store must be nullified.');

      // DOM scrubber executed
      assert.equal(domScrubbed, true, 'DOM scrubber must be called.');
      assert.equal(mockDOM.patientName, '', 'Sensitive patient name cleared from DOM.');
      assert.equal(mockDOM.doctorNote, '', 'Doctor notes cleared from DOM.');
      assert.equal(mockDOM.reviewPanelVisible, false, 'Review panel hidden.');

      console.log('  ✓ In-memory caches purged and sensitive UI scrubbed on session switch.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Rapid Case Switching Guard (caseGenerationId & CASE_CONTEXT_MISMATCH)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 6: Rapid Case Switching Guard (caseGenerationId)');
    {
      asyncContextManager.reset();
      asyncContextManager.handleAuthChange('LOGIN', { uid: 'dr_smith', role: 'doctor' });

      // Doctor clicks Case 101
      asyncContextManager.switchCase('case_101');
      assert.equal(asyncContextManager.currentContext.caseId, 'case_101');
      const case101Snapshot = asyncContextManager.captureContext();

      // Case 101 starts a network fetch (delayed)
      const fetchCase101 = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ id: 'case_101', patient: 'Patient A', diagnosis: 'Asthma' });
        }, 60);
      });

      // Before Case 101 finishes, doctor rapidly clicks Case 102
      setTimeout(() => {
        asyncContextManager.switchCase('case_102');
      }, 20);

      const case101Result = await fetchCase101;

      // When Case 101 finishes, validate against active case context
      const check101 = asyncContextManager.isContextValid(case101Snapshot, { requireSameCase: true });
      assert.equal(check101.valid, false, 'Case 101 response must be invalid because active case is Case 102.');
      assert.equal(check101.reason, 'CASE_CONTEXT_MISMATCH');

      // Now Case 102 snapshot
      const case102Snapshot = asyncContextManager.captureContext();
      const check102 = asyncContextManager.isContextValid(case102Snapshot, { requireSameCase: true });
      assert.equal(check102.valid, true, 'Case 102 response matches active case context.');

      console.log('  ✓ Rapid case switching prevents stale case data from overwriting active case.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Permission Revocation Mid-Flight Guard
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 7: Permission Revocation Mid-Flight Guard');
    {
      asyncContextManager.reset();
      asyncContextManager.handleAuthChange('LOGIN', {
        uid: 'dr_jane',
        role: 'doctor',
        permissions: ['REVIEW_CASE', 'APPROVE_REPORT']
      });

      const initialSnapshot = asyncContextManager.captureContext();

      // Pre-check with permission
      const initialCheck = asyncContextManager.isContextValid(initialSnapshot, {
        requiredPermission: 'APPROVE_REPORT'
      });
      assert.equal(initialCheck.valid, true, 'User initially holds APPROVE_REPORT permission.');

      // Revoke permission while approval operation is processing
      asyncContextManager.revokePermission('APPROVE_REPORT');

      // Post-check right before applying approval
      const revokedCheck = asyncContextManager.isContextValid(initialSnapshot, {
        requiredPermission: 'APPROVE_REPORT'
      });
      assert.equal(revokedCheck.valid, false, 'Post-check must fail once permission is revoked.');
      assert.equal(revokedCheck.reason, 'AUTH_GENERATION_MISMATCH'); // revokePermission increments authGenerationId

      // Even if checked directly against current permissions:
      assert.equal(asyncContextManager.currentContext.permissions.has('APPROVE_REPORT'), false);

      console.log('  ✓ Revoking permission invalidates in-flight actions and blocks execution.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Clinic Context Switching & Isolation (clinicGenerationId)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 8: Clinic Context Switching & Isolation');
    {
      asyncContextManager.reset();
      asyncContextManager.handleAuthChange('LOGIN', {
        uid: 'dr_clinic_user',
        role: 'doctor',
        clinicId: 'clinic_cairo_north'
      });

      const clinicAlphaSnapshot = asyncContextManager.captureContext();
      assert.equal(clinicAlphaSnapshot.clinicId, 'clinic_cairo_north');

      // Doctor switches clinic branch
      asyncContextManager.switchClinic('clinic_alex_south');

      const clinicAlphaCheck = asyncContextManager.isContextValid(clinicAlphaSnapshot, {
        requireSameClinic: true
      });
      assert.equal(clinicAlphaCheck.valid, false, 'Alpha clinic snapshot must be rejected after clinic switch.');
      assert.equal(clinicAlphaCheck.reason, 'CLINIC_CONTEXT_MISMATCH');

      const clinicBetaSnapshot = asyncContextManager.captureContext();
      const clinicBetaCheck = asyncContextManager.isContextValid(clinicBetaSnapshot, {
        requireSameClinic: true
      });
      assert.equal(clinicBetaCheck.valid, true, 'Alexandria clinic snapshot matches active clinic context.');

      console.log('  ✓ Clinic switching invalidates cross-clinic asynchronous data.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 9: Comprehensive Audit Trail Logging
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 9: Comprehensive Audit Trail Logging');
    {
      asyncContextManager.reset();

      // Trigger full lifecycle
      asyncContextManager.handleAuthChange('LOGIN', { uid: 'audit_user', permissions: ['PREVIEW'] });
      asyncContextManager.switchClinic('clinic_giza');
      asyncContextManager.switchCase('case_999');
      asyncContextManager.revokePermission('PREVIEW');
      asyncContextManager.handleAuthChange('LOGOUT');

      const logs = asyncContextManager.getAuditLogs();
      assert.ok(logs.length >= 6, 'Audit trail must record context events.');

      const eventTypes = logs.map((l) => l.eventType);
      assert.ok(eventTypes.includes('AUTH_CONTEXT_TRANSITIONED'), 'Must audit auth transitions.');
      assert.ok(eventTypes.includes('REQUESTS_ABORTED'), 'Must audit request cancellations.');
      assert.ok(eventTypes.includes('SUBSCRIPTIONS_UNSUBSCRIBED'), 'Must audit unsubscriptions.');
      assert.ok(eventTypes.includes('CACHES_PURGED'), 'Must audit cache purges.');
      assert.ok(eventTypes.includes('SENSITIVE_UI_SCRUBBED'), 'Must audit DOM scrubbing.');
      assert.ok(eventTypes.includes('CASE_SWITCHED'), 'Must audit case switching.');
      assert.ok(eventTypes.includes('PERMISSION_REVOKED'), 'Must audit permission revocation.');

      console.log(`  ✓ Audit trail logged ${logs.length} lifecycle security events.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 10: App.js and Index.html Integration Static Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 10: App.js and Index.html Integration Static Verification');
    {
      const appJs = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
      const indexHtml = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

      // Verify script inclusion in index.html
      assert.ok(
        indexHtml.includes('modules/core/async-context-manager.js'),
        'index.html must load async-context-manager.js script.'
      );

      // Verify app.js integration points
      assert.ok(
        appJs.includes('asyncContextManager.handleAuthChange("LOGOUT")'),
        'app.js leaveApp must invoke handleAuthChange("LOGOUT").'
      );
      assert.ok(
        appJs.includes('asyncContextManager.handleAuthChange("SWITCH_ACCOUNT")'),
        'app.js switchAccount must invoke handleAuthChange("SWITCH_ACCOUNT").'
      );
      assert.ok(
        appJs.includes('asyncContextManager.handleAuthChange("LOGIN"'),
        'app.js initHVAuthListener must invoke handleAuthChange("LOGIN").'
      );
      assert.ok(
        appJs.includes('asyncContextManager.switchCase'),
        'app.js selectDoctorCase must invoke switchCase.'
      );
      assert.ok(
        appJs.includes('asyncContextManager.createAbortController'),
        'app.js callBackend must use asyncContextManager.createAbortController.'
      );
      assert.ok(
        appJs.includes('initAsyncContextProtections'),
        'app.js must register DOM scrubbers and cache purgers via initAsyncContextProtections.'
      );

      console.log('  ✓ app.js and index.html integration points statically verified.');
    }

    console.log('\n==================================================================');
    console.log('✅ ALL 10 ASYNC CONTEXT & AUTH LIFECYCLE TESTS PASSED PERFECTLY!');
    console.log('==================================================================\n');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
})();
