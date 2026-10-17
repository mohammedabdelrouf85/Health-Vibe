/**
 * Health Vibe AI - Brute-Force Defense & Security Monitoring Test Suite
 * Validates Requirement 74 & 75:
 * 1. 5 consecutive failed attempts trigger 15-minute temporary lockout.
 * 2. Security monitoring logs recorded with masked PII.
 * 3. Successful authentication resets consecutive counter.
 * 4. Super Admin unlock endpoint governance.
 */

const assert = require('assert');
const authLockoutService = require('../backend/auth-lockout-service');

async function runTests() {
  console.log('==================================================================');
  console.log('🛡️  HEALTH VIBE AI: AUTH LOCKOUT & SECURITY MONITORING TEST SUITE');
  console.log('==================================================================\n');

  const testEmail = 'doctor.testing.lockout@healthvibe.ai';
  const testIp = '197.100.20.45';

  // Test 1: Check initial status
  console.log('▶ TEST 1: Initial Status Check');
  const initialStatus = authLockoutService.checkLockout(testEmail, testIp);
  assert.strictEqual(initialStatus.locked, false, 'Account should not be locked initially');
  console.log('  ✓ Account not locked initially.');

  // Test 2: Consecutive failed attempts increment until threshold 5
  console.log('\n▶ TEST 2: Consecutive Failed Attempts (Threshold 5)');
  for (let i = 1; i <= 4; i++) {
    const res = await authLockoutService.recordFailedAttempt({
      email: testEmail,
      ip: testIp,
      reason: 'wrong_password',
      userAgent: 'TestBrowser/1.0'
    });
    assert.strictEqual(res.locked, false, `Attempt ${i} should not lock yet`);
    assert.strictEqual(res.attempts, i, `Attempts should be ${i}`);
    assert.strictEqual(res.remainingAttempts, 5 - i, `Remaining should be ${5 - i}`);
  }
  console.log('  ✓ Attempts 1 through 4 recorded properly without locking.');

  // Test 3: 5th failure triggers 15-minute lockout
  console.log('\n▶ TEST 3: 5th Failed Attempt Triggers 15-Minute Lockout');
  const lockResult = await authLockoutService.recordFailedAttempt({
    email: testEmail,
    ip: testIp,
    reason: 'wrong_password_5th',
    userAgent: 'TestBrowser/1.0'
  });
  assert.strictEqual(lockResult.locked, true, '5th attempt must trigger lockout');
  assert.ok(lockResult.waitSec > 800, 'Wait seconds should be approx 900s (15 min)');
  assert.strictEqual(lockResult.attempts, 5, 'Attempts count should be 5');

  const statusAfterLock = authLockoutService.checkLockout(testEmail, testIp);
  assert.strictEqual(statusAfterLock.locked, true, 'checkLockout must return locked: true');
  console.log(`  ✓ 5th attempt successfully locked user for ${lockResult.waitSec} seconds.`);

  // Test 4: Security Monitoring Logs Integrity
  console.log('\n▶ TEST 4: Security Monitoring Logs Audit & PII Masking');
  const logs = authLockoutService.getSecurityMonitoringLogs({ emailMasked: 'd***t@healthvibe.ai' });
  assert.ok(logs.length > 0, 'Should have security monitoring logs');
  const latestLog = logs[0];
  const emailMaskedVal = latestLog.target?.emailMasked || latestLog.emailMasked || '';
  assert.ok(emailMaskedVal.includes('***'), 'Email must be masked in security logs');
  assert.ok(!latestLog.rawPassword, 'Password must never be logged');
  console.log('  ✓ Security monitoring logs verified with masked PII and zero secret leaks.');

  // Test 5: Super Admin Unlock
  console.log('\n▶ TEST 5: Super Admin Account Unlock Governance');
  const unlockResult = await authLockoutService.clearLockout(testEmail, 'super_admin_test_uid');
  assert.strictEqual(unlockResult.cleared, true, 'Lockout must be cleared by Super Admin');

  const statusAfterEmailUnlock = authLockoutService.checkLockout(testEmail);
  assert.strictEqual(statusAfterEmailUnlock.locked, false, 'User email must be unlocked after admin action');

  // Also unlock IP
  await authLockoutService.clearLockout(testIp, 'super_admin_test_uid');
  const statusAfterFullUnlock = authLockoutService.checkLockout(testEmail, testIp);
  assert.strictEqual(statusAfterFullUnlock.locked, false, 'Account and IP must both be unlocked');
  console.log('  ✓ Super Admin unlock successfully reinstated account access.');

  // Test 6: Successful login resets counter
  console.log('\n▶ TEST 6: Successful Login Resets Consecutive Counter');
  await authLockoutService.recordFailedAttempt({ email: testEmail, ip: testIp, reason: 'mistype' });
  const resetRes = authLockoutService.recordSuccessfulLogin({ email: testEmail, ip: testIp });
  assert.strictEqual(resetRes.cleared, true, 'Counter must be reset on successful login');
  const finalCheck = authLockoutService.checkLockout(testEmail, testIp);
  assert.strictEqual(finalCheck.locked, false);
  console.log('  ✓ Successful login clears sliding failure window.');

  console.log('\n==================================================================');
  console.log('🎉 ALL AUTH LOCKOUT & SECURITY MONITORING TESTS PASSED (100%)');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
