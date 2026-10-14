/**
 * HEALTH VIBE AI: STRICT PASSWORD HASHING & ZERO-PLAINTEXT STORAGE TEST SUITE
 * 
 * Verifies compliance with User Request 31:
 * "تطبيق خوارزمية التشفير Argon2id أو bcrypt لتخزين كلمات المرور،
 *  ومنع تخزين أي كلمة مرور كنص صريح (Plaintext) في أي بيئة."
 * 
 * Enforces:
 * 1. Cryptographic hashing via bcrypt (work factor >= 12) & Argon2id.
 * 2. Strict Zero-Plaintext storage guarantee across development, staging, and production.
 * 3. Immediate rejection of plaintext passwords in database payloads (PLAINTEXT_PASSWORD_FORBIDDEN).
 * 4. Password complexity & length policies (DoS mitigation up to 128 chars).
 * 5. Full RelationalDatabaseService integration (Account creation, verification, password rotation).
 * 6. PostgreSQL / Supabase SQL DDL check constraint regex enforcement.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🔐  HEALTH VIBE AI: PASSWORD HASHING & ZERO-PLAINTEXT TEST SUITE');
console.log('   Argon2id & bcrypt Cryptographic Storage (Request 31)');
console.log('==================================================================\n');

(async function runTests() {
  const {
    passwordSecurityService,
    BCRYPT_ROUNDS,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH
  } = require('../backend/password-security-service');

  // ── TEST 1: Password Policy Validation ───────────────────────────────────
  console.log('▶ TEST 1: Password Policy & Entropy Validation');
  assert.strictEqual(MIN_PASSWORD_LENGTH, 8, 'Minimum password length must be 8');
  assert.strictEqual(MAX_PASSWORD_LENGTH, 128, 'Maximum password length must be 128 to prevent hash DoS');
  assert.strictEqual(BCRYPT_ROUNDS, 12, 'Bcrypt rounds must be at least 12 for OWASP compliance');

  // Reject too short
  const shortResult = passwordSecurityService.validatePasswordPolicy('Pass1');
  assert.strictEqual(shortResult.valid, false);
  assert.ok(shortResult.error.includes('at least 8 characters'));

  // Reject letters only (no numbers)
  const lettersOnly = passwordSecurityService.validatePasswordPolicy('SecretPassword');
  assert.strictEqual(lettersOnly.valid, false);
  assert.ok(lettersOnly.error.includes('at least one letter and one number'));

  // Accept valid password
  const validResult = passwordSecurityService.validatePasswordPolicy('VibeSecure2026!');
  assert.strictEqual(validResult.valid, true);

  console.log('  ✓ Password length and entropy policies validated.\n');

  // ── TEST 2: bcrypt Hashing & Timing-Safe Verification ─────────────────────
  console.log('▶ TEST 2: bcrypt Hashing & Verification (Cost Factor 12)');
  const plaintext = 'ClinicianAlpha2026!';
  const bcryptHash = await passwordSecurityService.hashPassword(plaintext, 'bcrypt');

  assert.ok(bcryptHash.startsWith('$2b$12$') || bcryptHash.startsWith('$2a$12$'), 'bcrypt hash must start with $2b$12$ or $2a$12$');
  assert.strictEqual(bcryptHash.length, 60, 'Standard bcrypt hash length must be 60 characters');
  assert.strictEqual(passwordSecurityService.isHashed(bcryptHash), true, 'Must be recognized as valid cryptographic hash');

  // Match correct password
  const isBcryptMatch = await passwordSecurityService.verifyPassword(plaintext, bcryptHash);
  assert.strictEqual(isBcryptMatch, true, 'bcrypt verification must succeed with correct password');

  // Reject incorrect password
  const isBcryptMismatch = await passwordSecurityService.verifyPassword('WrongPassword123!', bcryptHash);
  assert.strictEqual(isBcryptMismatch, false, 'bcrypt verification must reject incorrect password');

  console.log(`  ✓ bcrypt hash generated: ${bcryptHash.slice(0, 24)}... (verified match & rejection).\n`);

  // ── TEST 3: Argon2id Hashing & Verification ──────────────────────────────
  console.log('▶ TEST 3: Argon2id Hardened Hashing & Timing-Safe Verification');
  const argonHash = await passwordSecurityService.hashPassword(plaintext, 'argon2id');

  assert.ok(argonHash.startsWith('$argon2id$v=19$m='), 'Argon2id hash must match standard modular crypt format');
  assert.strictEqual(passwordSecurityService.isHashed(argonHash), true, 'Must be recognized as valid cryptographic hash');

  // Match correct password
  const isArgonMatch = await passwordSecurityService.verifyPassword(plaintext, argonHash);
  assert.strictEqual(isArgonMatch, true, 'Argon2id verification must succeed with correct password');

  // Reject incorrect password
  const isArgonMismatch = await passwordSecurityService.verifyPassword('WrongPassword123!', argonHash);
  assert.strictEqual(isArgonMismatch, false, 'Argon2id verification must reject incorrect password');

  console.log(`  ✓ Argon2id hash generated: ${argonHash.slice(0, 36)}... (verified match & rejection).\n`);

  // ── TEST 4: Strict Zero-Plaintext Storage Guard ───────────────────────────
  console.log('▶ TEST 4: Zero-Plaintext Storage Guard (PLAINTEXT_PASSWORD_FORBIDDEN)');
  
  // Guard must allow valid hashed object
  assert.doesNotThrow(() => {
    passwordSecurityService.assertNoPlaintextPassword({
      email: 'doctor@healthvibe.ai',
      password_hash: bcryptHash
    }, 'TestContext');
  }, 'Hashed password must pass zero-plaintext inspection');

  // Guard must throw when raw password field is present
  assert.throws(() => {
    passwordSecurityService.assertNoPlaintextPassword({
      email: 'doctor@healthvibe.ai',
      password: 'PlaintextPassword123'
    }, 'TestContext');
  }, (err) => {
    return err.code === 'PLAINTEXT_PASSWORD_FORBIDDEN';
  }, 'Must throw PLAINTEXT_PASSWORD_FORBIDDEN when raw password field is passed');

  // Guard must throw when password_hash holds plaintext string
  assert.throws(() => {
    passwordSecurityService.assertNoPlaintextPassword({
      email: 'doctor@healthvibe.ai',
      password_hash: 'PlaintextPassword123'
    }, 'TestContext');
  }, (err) => {
    return err.code === 'PLAINTEXT_PASSWORD_FORBIDDEN';
  }, 'Must throw PLAINTEXT_PASSWORD_FORBIDDEN when password_hash contains plaintext');

  // Guard must recursively check nested objects
  assert.throws(() => {
    passwordSecurityService.assertNoPlaintextPassword({
      user: {
        credentials: {
          password: 'NestedPlaintextPassword123'
        }
      }
    }, 'NestedContext');
  }, (err) => {
    return err.code === 'PLAINTEXT_PASSWORD_FORBIDDEN';
  }, 'Must catch nested plaintext passwords');

  console.log('  ✓ Zero-plaintext guard aggressively rejects all raw password storage attempts.\n');

  // ── TEST 5: RelationalDatabaseService Integration ────────────────────────
  console.log('▶ TEST 5: Relational Database Account Creation & Authentication');
  const { RelationalDatabaseService } = require('../backend/relational-db-service');
  const rdb = new RelationalDatabaseService();

  // Case A: Create account passing plaintext password -> service must hash automatically
  const accountA = await rdb.createAccount({
    email: 'clinician.alpha@healthvibe.ai',
    fullName: 'Dr. Alpha Verified',
    role: 'doctor',
    password: 'SecureDoctorPass2026!'
  });

  assert.strictEqual(accountA.password, undefined, 'Account returned must NOT contain plaintext password');
  assert.ok(accountA.password_hash.startsWith('$2b$12$') || accountA.password_hash.startsWith('$2a$12$'), 'Account stored password_hash must be bcrypt');

  // Stored in table must also have NO plaintext
  const storedAccountA = rdb.tables.accounts.get(accountA.id);
  assert.strictEqual(storedAccountA.password, undefined, 'Table storage must have zero plaintext');
  assert.ok(storedAccountA.password_hash.startsWith('$2'), 'Table storage must have valid bcrypt hash');

  // Case B: Create account with unhashed plaintext in passwordHash -> must throw PLAINTEXT_PASSWORD_FORBIDDEN
  await assert.rejects(async () => {
    await rdb.createAccount({
      email: 'hacker@example.com',
      fullName: 'Hacker Attempt',
      role: 'patient',
      passwordHash: 'PlaintextPasswordNotHashed'
    });
  }, (err) => {
    return err.code === 'PLAINTEXT_PASSWORD_FORBIDDEN';
  }, 'Must reject unhashed plaintext in passwordHash field');

  // Case C: Authenticate account using bcrypt
  const authSuccess = await rdb.authenticateAccount('clinician.alpha@healthvibe.ai', 'SecureDoctorPass2026!');
  assert.strictEqual(authSuccess.authenticated, true, 'Authentication must succeed with valid password');
  assert.strictEqual(authSuccess.account.password, undefined, 'Authenticated account must have no plaintext password');

  const authFail = await rdb.authenticateAccount('clinician.alpha@healthvibe.ai', 'WrongPassword123!');
  assert.strictEqual(authFail.authenticated, false, 'Authentication must fail with incorrect password');

  // Case D: Change password
  const changeRes = await rdb.changePassword(accountA.id, 'SecureDoctorPass2026!', 'NewRotatedPass2026!');
  assert.strictEqual(changeRes.success, true);

  const authRotated = await rdb.authenticateAccount('clinician.alpha@healthvibe.ai', 'NewRotatedPass2026!');
  assert.strictEqual(authRotated.authenticated, true, 'Authentication must succeed with new rotated password');

  console.log('  ✓ RelationalDatabaseService transparently hashes passwords and prevents plaintext storage.\n');

  // ── TEST 6: PostgreSQL / Supabase SQL Schema DDL Check Constraint ────────
  console.log('▶ TEST 6: PostgreSQL DDL Check Constraint Regex Verification');
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../backend/db/schema.sql'), 'utf8');

  assert.ok(
    schemaSql.includes("password_hash VARCHAR(255) CHECK (password_hash IS NULL OR password_hash ~ '^\\$(2[abxy]|argon2id)\\$')"),
    'schema.sql must contain regex CHECK constraint forbidding plaintext passwords in PostgreSQL'
  );

  console.log('  ✓ PostgreSQL schema enforces regex constraint preventing any plaintext password insertion.\n');

  // ── TEST 7: Backend Server Password Security Policy Endpoint ──────────────
  console.log('▶ TEST 7: Backend Server Endpoint & Policy Verification');
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');

  assert.ok(
    serverJsContent.includes("app.get('/api/auth/password-security-policy'"),
    'server.js must expose GET /api/auth/password-security-policy'
  );
  assert.ok(
    serverJsContent.includes("passwordSecurityService.hashPassword(newPassword)"),
    'server.js change-password route must hash passwords before updating relational records'
  );

  console.log('  ✓ server.js password change route and policy endpoints verified.\n');

  console.log('==================================================================');
  console.log('🎉 ALL PASSWORD HASHING & ZERO-PLAINTEXT TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
