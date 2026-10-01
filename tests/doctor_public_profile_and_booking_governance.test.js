/**
 * Health Vibe AI - Doctor Profile, Clinic Membership & Booking Governance Test Suite
 * 
 * Verifies:
 * 1. Rich doctor profile fields: photo, biography, specialty, languages, consultation types, working hours.
 * 2. Strict public vs. private field segregation (no national ID, personal contact, internal notes in public profile).
 * 3. Shows ONLY clinics where the doctor has actual approved membership.
 * 4. Working hours directly connected to booking availability slots.
 * 5. Strict security guard: doctor profile updates CANNOT modify licensing, approval status, or role.
 * 6. Clinic admin membership management for assigned clinic.
 * 7. Express API endpoints (/api/doctors/public, /api/doctors/public/:doctorId, /api/doctors/:doctorId/availability).
 */

const assert = require('assert');
const http = require('http');

const doctorService = require('../backend/doctor-profile-service');
const app = require('../backend/server');

const {
  PUBLIC_FIELDS,
  PRIVATE_FIELDS,
  PROTECTED_FIELDS,
  DOCTOR_PROFILES,
  getApprovedClinics,
  formatDoctorPublicProfile,
  getDoctorPublicProfile,
  listPublicDoctors,
  sanitizeDoctorProfileUpdate,
  updateDoctorProfile,
  updateDoctorClinicMembership,
  calculateDoctorBookingAvailability
} = doctorService;

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: DOCTOR PROFILE & BOOKING GOVERNANCE TESTS');
console.log('   Public Fields, Approved Memberships, Availability & Tamper Guards');
console.log('==================================================================\n');

async function runTests() {
  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Doctor Profile Architecture & Public/Private Field Segregation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Doctor Profile Architecture & Public/Private Field Segregation');

  const rawMona = DOCTOR_PROFILES.dr_mona;
  assert.ok(rawMona, 'dr_mona must exist in registry');
  assert.ok(rawMona.photoUrl, 'Doctor must have photoUrl');
  assert.ok(rawMona.biography, 'Doctor must have biography');
  assert.ok(rawMona.biographyAr, 'Doctor must have Arabic biography');
  assert.ok(rawMona.specialty, 'Doctor must have specialty');
  assert.ok(Array.isArray(rawMona.languages) && rawMona.languages.length >= 2, 'Doctor must have languages list');
  assert.ok(Array.isArray(rawMona.consultationTypes) && rawMona.consultationTypes.length >= 2, 'Doctor must have consultation types');
  assert.ok(rawMona.clinicMemberships, 'Doctor must have clinic memberships array');

  // Format public profile
  const publicMona = formatDoctorPublicProfile(rawMona);

  // Assert public fields are present
  assert.strictEqual(publicMona.doctorId, 'dr_mona');
  assert.strictEqual(publicMona.name, 'د. منى سامي');
  assert.strictEqual(publicMona.photoUrl, rawMona.photoUrl);
  assert.strictEqual(publicMona.specialty, rawMona.specialty);
  assert.ok(publicMona.biography.length > 20);
  assert.ok(publicMona.languages.includes('English'));
  assert.ok(publicMona.consultationTypes.some(c => c.id === 'in_clinic'));

  // 🛑 CRITICAL PRIVACY GUARANTEE: Private fields MUST NOT leak into public profile
  assert.strictEqual(publicMona.maskedNationalId, undefined, 'maskedNationalId must not be on public profile');
  assert.strictEqual(publicMona.nationalIdLegalReview, undefined, 'nationalIdLegalReview must not be on public profile');
  assert.strictEqual(publicMona.email, undefined, 'Private email must not be on public profile');
  assert.strictEqual(publicMona.phone, undefined, 'Private phone must not be on public profile');
  assert.strictEqual(publicMona.reverificationDueDate, undefined, 'reverificationDueDate must not be on public profile');

  console.log('  ✓ Verified rich profile: photoUrl, biography, specialty, languages, and consultation types.');
  console.log('  ✓ Privacy confirmed: Zero national ID, private phone/email, or internal review dates leaked.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Filter Clinics to Actual Approved Memberships ONLY
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: Filter Clinics to Actual Approved Memberships ONLY');

  // In raw data, dr_mona has 2 memberships:
  // 1. clinic_cairo_main (status: 'approved')
  // 2. clinic_alexandria (status: 'pending')
  assert.strictEqual(rawMona.clinicMemberships.length, 2, 'Raw profile has 2 memberships');

  const approvedOnly = getApprovedClinics(rawMona.clinicMemberships);
  assert.strictEqual(approvedOnly.length, 1, 'Only 1 clinic has approved membership');
  assert.strictEqual(approvedOnly[0].clinicId, 'clinic_cairo_main');

  // Confirm in public profile output
  assert.strictEqual(publicMona.clinics.length, 1);
  assert.strictEqual(publicMona.clinics[0].clinicId, 'clinic_cairo_main');
  assert.strictEqual(publicMona.clinics.some(c => c.clinicId === 'clinic_alexandria'), false, 'Pending clinic MUST NOT appear');

  console.log('  ✓ Approved clinic membership displayed (clinic_cairo_main).');
  console.log('  ✓ Pending clinic membership (clinic_alexandria) strictly filtered out.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Connect Working Hours to Booking Availability Slots
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Connect Working Hours to Booking Availability Slots');

  // 3A: Working day with scheduled shifts (Sunday 2026-10-04)
  const availWorkingDay = calculateDoctorBookingAvailability('dr_mona', '2026-10-04', 'clinic_cairo_main');
  assert.strictEqual(availWorkingDay.available, true, 'Doctor must be available on scheduled working day');
  assert.strictEqual(availWorkingDay.clinicId, 'clinic_cairo_main');
  assert.ok(availWorkingDay.slots.length > 5, 'Must generate time slots for working shifts');

  // Verify shift ranges (10:00-13:00 and 16:00-20:30)
  const slotTimes = availWorkingDay.slots.map(s => s.startTime);
  assert.ok(slotTimes.includes('10:00'), 'Morning shift start present');
  assert.ok(slotTimes.includes('16:00'), 'Evening shift start present');
  assert.strictEqual(slotTimes.includes('14:00'), false, 'Break period (13:00-16:00) must not contain slots');

  // 3B: Non-working day (Friday 2026-10-09)
  const availNonWorking = calculateDoctorBookingAvailability('dr_mona', '2026-10-09', 'clinic_cairo_main');
  assert.strictEqual(availNonWorking.available, false);
  assert.strictEqual(availNonWorking.reason, 'NON_WORKING_DAY');

  // 3C: Approved Leave (2026-10-11: Conference leave)
  const availLeave = calculateDoctorBookingAvailability('dr_mona', '2026-10-11', 'clinic_cairo_main');
  assert.strictEqual(availLeave.available, false);
  assert.strictEqual(availLeave.reason, 'ON_LEAVE');

  // 3D: Requesting booking at clinic where doctor has NO approved membership
  const availUnapprovedClinic = calculateDoctorBookingAvailability('dr_mona', '2026-10-04', 'clinic_alexandria');
  assert.strictEqual(availUnapprovedClinic.available, false);
  assert.strictEqual(availUnapprovedClinic.reason, 'NO_APPROVED_MEMBERSHIP_AT_CLINIC');

  console.log('  ✓ Working hours and shifts accurately generate booking slots.');
  console.log('  ✓ Breaks, non-working days, and approved leaves properly enforced.');
  console.log('  ✓ Booking blocked if doctor lacks approved membership at target clinic.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Strict Security Guard: Tamper Prevention on Licensing & Role
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Strict Security Guard: Tamper Prevention on Licensing & Role');

  const doctorActor = { uid: 'dr_mona', role: 'doctor', isOwner: false };

  // 4A: Attempt to escalate role to super_admin
  const roleTamper = sanitizeDoctorProfileUpdate({ role: 'super_admin' }, rawMona, doctorActor);
  assert.strictEqual(roleTamper.allowed, false, 'Doctor cannot modify role');
  assert.strictEqual(roleTamper.error, 'UNAUTHORIZED_FIELD_MODIFICATION');
  assert.ok(roleTamper.violatingFields.includes('role'));

  // 4B: Attempt to modify licenseNumber or verification status
  const licenseTamper = sanitizeDoctorProfileUpdate({ licenseNumber: 'FAKE-123', verificationResult: 'VERIFIED' }, rawMona, doctorActor);
  assert.strictEqual(licenseTamper.allowed, false);
  assert.ok(licenseTamper.violatingFields.includes('licenseNumber'));

  // 4C: Attempt to modify licenseExpiryDate
  const expiryTamper = sanitizeDoctorProfileUpdate({ licenseExpiryDate: '2035-01-01' }, rawMona, doctorActor);
  assert.strictEqual(expiryTamper.allowed, false);
  assert.ok(expiryTamper.violatingFields.includes('licenseExpiryDate'));

  // 4D: Attempt to self-approve clinic membership
  const selfApproveTamper = sanitizeDoctorProfileUpdate({
    clinicMemberships: [
      { clinicId: 'clinic_alexandria', status: 'approved' } // was pending
    ]
  }, rawMona, doctorActor);
  assert.strictEqual(selfApproveTamper.allowed, false);
  assert.strictEqual(selfApproveTamper.error, 'UNAUTHORIZED_MEMBERSHIP_APPROVAL');

  // 4E: Legitimate update of editable fields (biography, languages, consultationTypes)
  const legitUpdate = sanitizeDoctorProfileUpdate({
    biography: 'Updated consultation bio with 15 years experience.',
    languages: ['العربية', 'English', 'Deutsch'],
    consultationTypes: [
      { id: 'in_clinic', nameAr: 'كشف بالعيادة', nameEn: 'In-Clinic', durationMinutes: 30, priceEgp: 500 }
    ]
  }, rawMona, doctorActor);
  assert.strictEqual(legitUpdate.allowed, true);
  assert.strictEqual(legitUpdate.cleanUpdate.languages.length, 3);

  console.log('  ✓ Tampering blocked: Role escalation, licenseNumber, and expiry modifications rejected.');
  console.log('  ✓ Tampering blocked: Clinic membership self-approval strictly prohibited.');
  console.log('  ✓ Legitimate public profile updates (bio, languages, consultation types) authorized.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Clinic Admin Membership Management
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: Clinic Admin Membership Management');

  const adminActor = { uid: 'admin_cairo', role: 'clinic_admin' };
  // Admin approves clinic_alexandria membership
  const membershipResult = await updateDoctorClinicMembership(
    null,
    'dr_mona',
    'clinic_alexandria',
    'approved',
    adminActor
  );
  assert.strictEqual(membershipResult.newStatus, 'approved');
  assert.ok(membershipResult.approvedClinics.some(c => c.clinicId === 'clinic_alexandria'));

  // Now dr_mona public profile includes clinic_alexandria
  const monaUpdated = await getDoctorPublicProfile(null, 'dr_mona');
  assert.ok(monaUpdated.clinics.some(c => c.clinicId === 'clinic_alexandria'), 'Approved clinic now appears');

  console.log('  ✓ Clinic admin successfully authorized new clinic membership.');
  console.log('  ✓ Newly approved clinic now visible in public profile.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Express Endpoints Integration
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 6: Express Endpoints Integration');

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;

      // 1. GET /api/doctors/public
      http.get(`http://127.0.0.1:${port}/api/doctors/public`, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(data);
            assert.strictEqual(body.success, true);
            assert.ok(body.doctors.length >= 2);

            // 2. GET /api/doctors/public/dr_mona
            http.get(`http://127.0.0.1:${port}/api/doctors/public/dr_mona`, (res2) => {
              let data2 = '';
              res2.on('data', c => { data2 += c; });
              res2.on('end', () => {
                try {
                  assert.strictEqual(res2.statusCode, 200);
                  const body2 = JSON.parse(data2);
                  assert.strictEqual(body2.doctor.doctorId, 'dr_mona');
                  assert.ok(body2.doctor.photoUrl);
                  assert.ok(body2.doctor.clinics.length >= 1);

                  // 3. GET /api/doctors/dr_mona/availability?date=2026-10-04
                  http.get(`http://127.0.0.1:${port}/api/doctors/dr_mona/availability?date=2026-10-04`, (res3) => {
                    let data3 = '';
                    res3.on('data', c => { data3 += c; });
                    res3.on('end', () => {
                      server.close();
                      try {
                        assert.strictEqual(res3.statusCode, 200);
                        const body3 = JSON.parse(data3);
                        assert.strictEqual(body3.success, true);
                        assert.strictEqual(body3.availability.available, true);
                        assert.ok(body3.availability.slots.length > 0);
                        console.log('  ✓ Public doctors directory and availability endpoints verified.\n');
                        resolve();
                      } catch (e) { reject(e); }
                    });
                  }).on('error', e => { server.close(); reject(e); });
                } catch (e) { server.close(); reject(e); }
              });
            }).on('error', e => { server.close(); reject(e); });
          } catch (e) { server.close(); reject(e); }
        });
      }).on('error', e => { server.close(); reject(e); });
    });
  });

  console.log('==================================================================');
  console.log('🎉 ALL DOCTOR PROFILE & BOOKING GOVERNANCE TESTS PASSED (100%)');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ DOCTOR PROFILE TEST SUITE FAILURE:', err);
  process.exit(1);
});
