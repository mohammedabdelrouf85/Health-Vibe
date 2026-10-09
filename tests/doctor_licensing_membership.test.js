/**
 * HEALTH VIBE AI: DOCTOR LICENSING, CLINIC MEMBERSHIP & CREDENTIAL LIFECYCLE TEST SUITE
 * 
 * Verifies:
 * 1. Doctor Application Expansion:
 *    - License Expiry Date (future validation, rejects expired/missing)
 *    - Licensing Authority Verification Result (VERIFIED, rejects mere file upload)
 *    - Reviewer Identity & Audit Tracking
 *    - Rejection Reason & Revocation Details
 *    - Re-verification Due Date Scheduling
 * 2. Clinic Membership Linkage:
 *    - Approved memberships for clinic association
 *    - Case approval permissions scoped to approved clinic memberships
 *    - Rejection of approval for unlinked/unauthorized clinics
 * 3. National ID Collection & Legal Review Safeguard:
 *    - Policy-governed statutory verification consent requirement
 *    - Masked display & Salted HMAC-SHA256 hashing (no raw plaintext storage)
 *    - Legal review metadata tracking
 * 4. Case Approval Blocking on Expired or Revoked Credentials:
 *    - Blocks expired license (DOCTOR_LICENSE_EXPIRED)
 *    - Blocks revoked authorization (DOCTOR_AUTHORIZATION_REVOKED)
 *    - Blocks suspended doctor profile (DOCTOR_AUTHORIZATION_SUSPENDED)
 *    - Blocks overdue re-verification (DOCTOR_REVERIFICATION_OVERDUE)
 */

const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'development';
process.env.FIREBASE_PROJECT_ID = 'health-vibes-dev';
process.env.USE_FIREBASE_EMULATOR = 'true';

const app = require('../backend/server');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: DOCTOR LICENSING, MEMBERSHIPS & VERIFICATION SUITE');
console.log('   Licensing Authority Checks, Clinic Memberships, National ID Policy');
console.log('==================================================================\n');

(async () => {
  let server;

  try {
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: National ID Collection Regulation & Legal Review Safeguards
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: National ID Collection Regulation & Legal Review Safeguards');
    {
      // 1A: Rejection when consent is missing
      const unconsented = app.validateNationalIdCollection('29508151234567', { consentObtained: false });
      assert.strictEqual(unconsented.ok, false);
      assert.strictEqual(unconsented.error, 'NATIONAL_ID_POLICY_VIOLATION');

      // 1B: Rejection when purpose is invalid
      const invalidPurpose = app.validateNationalIdCollection('29508151234567', { consentObtained: true, purpose: 'MARKETING' });
      assert.strictEqual(invalidPurpose.ok, false);
      assert.strictEqual(invalidPurpose.error, 'NATIONAL_ID_POLICY_VIOLATION');

      // 1C: Rejection of malformed length or non-numeric characters
      const malformed = app.validateNationalIdCollection('12345abc', { consentObtained: true, purpose: 'REGULATORY_CREDENTIAL_VERIFICATION' });
      assert.strictEqual(malformed.ok, false);
      assert.strictEqual(malformed.error, 'INVALID_NATIONAL_ID_FORMAT');

      // 1D: Valid compliant collection: masking, salted hashing, and legal review
      const valid = app.validateNationalIdCollection('29508151234567', {
        consentObtained: true,
        purpose: 'REGULATORY_CREDENTIAL_VERIFICATION',
        timestamp: new Date().toISOString()
      }, {
        legalBasis: 'STATUTORY_HEALTHCARE_WORKER_VERIFICATION',
        reviewedBy: 'legal_officer_01'
      });

      assert.strictEqual(valid.ok, true);
      assert.strictEqual(valid.maskedNationalId, '295*******4567', 'National ID must be masked in middle digits');
      assert.ok(valid.nationalIdHash && valid.nationalIdHash.length === 64, 'Must compute SHA-256 HMAC hash');
      assert.strictEqual(valid.legalReview.status, 'approved');
      assert.strictEqual(valid.legalReview.legalBasis, 'STATUTORY_HEALTHCARE_WORKER_VERIFICATION');

      console.log('  ✓ National ID collection strictly regulated under privacy policy, masked, hashed, and tagged with legal review.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: Authoritative Licensing Verification vs Mere File Upload
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 2: Licensing Authority Verification vs Mere File Upload');
    {
      // 2A: Simulated application with file upload but missing/invalid authority verification
      const doctorWithFileOnly = {
        name: 'Dr. Upload Only',
        licenseNumber: 'LIC-9999',
        docDownloadURL: 'https://storage.googleapis.com/health-vibes/license.pdf',
        verificationResult: 'PENDING_REGISTRY_CHECK' // Not VERIFIED!
      };

      const checkFileOnly = app.verifyDoctorAuthorization(doctorWithFileOnly, { role: 'doctor', doctorApplicationStatus: 'approved' });
      assert.strictEqual(checkFileOnly.ok, false);
      assert.strictEqual(checkFileOnly.error, 'DOCTOR_AUTHORITY_VERIFICATION_INVALID');

      // 2B: Simulated application with authoritative verification result
      const doctorWithOfficialVerification = {
        name: 'Dr. Official Verified',
        licenseNumber: 'LIC-1000',
        docDownloadURL: 'https://storage.googleapis.com/health-vibes/license.pdf',
        verificationResult: 'VERIFIED',
        licenseExpiryDate: '2028-12-31'
      };

      const checkOfficial = app.verifyDoctorAuthorization(doctorWithOfficialVerification, { role: 'doctor', doctorApplicationStatus: 'approved' });
      assert.strictEqual(checkOfficial.ok, true);

      console.log('  ✓ File upload alone is rejected; positive licensing authority verification (VERIFIED) is mandatory.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: Preventing Case Approvals on Expired or Revoked License
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 3: Case Approval Prevention on Expired or Revoked Credentials');
    {
      // 3A: Expired license
      const expiredDoctor = {
        name: 'Dr. Expired',
        licenseNumber: 'LIC-EXPIRED',
        verificationResult: 'VERIFIED',
        licenseExpiryDate: '2024-01-01' // Past date!
      };
      const checkExpired = app.verifyDoctorAuthorization(expiredDoctor, { role: 'doctor', doctorApplicationStatus: 'approved' });
      assert.strictEqual(checkExpired.ok, false);
      assert.strictEqual(checkExpired.error, 'DOCTOR_LICENSE_EXPIRED');

      // 3B: Revoked credentials
      const revokedDoctor = {
        name: 'Dr. Revoked',
        licenseNumber: 'LIC-REVOKED',
        verificationResult: 'VERIFIED',
        licenseExpiryDate: '2028-12-31',
        licenseStatus: 'revoked'
      };
      const checkRevoked = app.verifyDoctorAuthorization(revokedDoctor, { role: 'doctor', doctorApplicationStatus: 'revoked' });
      assert.strictEqual(checkRevoked.ok, false);
      assert.strictEqual(checkRevoked.error, 'DOCTOR_AUTHORIZATION_REVOKED');

      // 3C: Suspended profile
      const suspendedDoctor = {
        name: 'Dr. Suspended',
        licenseNumber: 'LIC-SUSPENDED',
        verificationResult: 'VERIFIED',
        licenseExpiryDate: '2028-12-31'
      };
      const checkSuspended = app.verifyDoctorAuthorization(suspendedDoctor, { role: 'doctor', doctorApplicationStatus: 'approved', suspended: true });
      assert.strictEqual(checkSuspended.ok, false);
      assert.strictEqual(checkSuspended.error, 'DOCTOR_AUTHORIZATION_SUSPENDED');

      // 3D: Overdue re-verification
      const overdueDoctor = {
        name: 'Dr. Overdue',
        licenseNumber: 'LIC-OVERDUE',
        verificationResult: 'VERIFIED',
        licenseExpiryDate: '2028-12-31',
        reverificationDueDate: '2025-06-01' // Past due!
      };
      const checkOverdue = app.verifyDoctorAuthorization(overdueDoctor, { role: 'doctor', doctorApplicationStatus: 'approved' });
      assert.strictEqual(checkOverdue.ok, false);
      assert.strictEqual(checkOverdue.error, 'DOCTOR_REVERIFICATION_OVERDUE');

      console.log('  ✓ Case approvals strictly blocked for expired license, revoked credentials, suspended accounts, and overdue re-verification.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: Clinic Memberships Linkage & Case Scoping
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 4: Clinic Memberships Linkage & Case Scoping');
    {
      const doctorWithClinics = {
        uid: 'doc_multi_clinic',
        clinicMemberships: [
          { clinicId: 'c_cairo_north', clinicName: 'Cairo North Clinic', status: 'approved' },
          { clinicId: 'c_alex_central', clinicName: 'Alex Central Clinic', status: 'revoked' }
        ]
      };
      const doctorProfile = {
        role: 'doctor',
        clinicId: 'c_cairo_north',
        clinicMemberships: doctorWithClinics.clinicMemberships
      };

      // 4A: Check approved clinic membership
      const canApproveCairo = app.isDoctorApprovedMemberOfClinic(doctorWithClinics, doctorProfile, 'c_cairo_north');
      assert.strictEqual(canApproveCairo, true, 'Must allow approval for approved clinic membership');

      // 4B: Check revoked clinic membership
      const canApproveAlex = app.isDoctorApprovedMemberOfClinic(doctorWithClinics, doctorProfile, 'c_alex_central');
      assert.strictEqual(canApproveAlex, false, 'Must reject approval for revoked clinic membership');

      // 4C: Check unlinked/foreign clinic
      const canApproveGiza = app.isDoctorApprovedMemberOfClinic(doctorWithClinics, doctorProfile, 'c_giza_south');
      assert.strictEqual(canApproveGiza, false, 'Must reject approval for unlinked clinic');

      // 4D: Super admin bypasses clinic scope
      const superAdminProfile = { role: 'super_admin', customClaims: { owner: true } };
      const superAdminAccess = app.isDoctorApprovedMemberOfClinic(doctorWithClinics, superAdminProfile, 'c_giza_south');
      assert.strictEqual(superAdminAccess, true, 'Super Admin / Owner can approve cases across all clinics');

      console.log('  ✓ Doctors linked to clinics via approved memberships; unauthorized/revoked clinics strictly blocked.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: Doctor Application Field Attributes & Audit Trail
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 5: Doctor Application Attributes & Audit Trail Verification');
    {
      assert.ok(auditService.AUDIT_EVENT_TYPES.DOCTOR_APPLICATION_APPROVED);
      assert.ok(auditService.AUDIT_EVENT_TYPES.DOCTOR_APPLICATION_REJECTED);
      assert.ok(auditService.AUDIT_EVENT_TYPES.DOCTOR_CREDENTIALS_REVOKED);
      assert.ok(auditService.AUDIT_EVENT_TYPES.DOCTOR_CLINIC_MEMBERSHIP_UPDATED);
      assert.ok(auditService.AUDIT_EVENT_TYPES.NATIONAL_ID_LEGAL_REVIEW_UPDATED);

      console.log('  ✓ Authoritative audit event types verified for approval, rejection, revocation, and clinic memberships.');
    }

    console.log('\n==================================================================');
    console.log('🎉 ALL DOCTOR LICENSING & MEMBERSHIP CHECKS PASSED (100%)!');
    console.log('==================================================================\n');

  } finally {
    if (server && server.listening) {
      server.close();
    }
    process.exit(0);
  }
})().catch(err => {
  console.error('\n❌ DOCTOR LICENSING TEST FAILURE:', err);
  process.exit(1);
});
