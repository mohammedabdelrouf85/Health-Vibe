# Health Vibe AI: Doctor Profile, Clinic Membership & Booking Availability Governance

> **Medical Governance & Security Standard — Health Vibe AI Platform**  
> *Compliant with Egyptian Medical Syndicate Standards, HIPAA Administrative Safeguards, and Role-Based Access Control (RBAC)*

---

## 1. Executive Summary

This specification establishes the clinical, architectural, and security governance for practitioner profiles within the **Health Vibe AI** ecosystem. It resolves critical requirements:

1. **Rich Doctor Profiles**: Structured practitioner presentation including high-resolution portrait photos, bilingual professional biographies, clinical specialties, spoken languages, transparent consultation types (with durations and fees), and operational working hours.
2. **Strict Public vs. Private Field Segregation**: Public patient-facing directories strictly omit personal contact identifiers, masked national IDs, legal compliance reviews, internal administrative audit trails, and syndicate re-verification schedules.
3. **Approved Clinic Membership Filtering**: Practitioners may be associated with multiple clinical facilities, but patient-facing profiles and booking calendars **strictly expose only facilities where membership has been formally approved** by the clinic administrator. Unapproved, pending, or paused affiliations are completely suppressed.
4. **Working Hours & Dynamic Booking Availability**: Daily shifts, break windows, non-working days, and approved clinical leaves directly determine bookable appointment slots. Booking is strictly prohibited if a practitioner lacks approved membership at the requested clinic.
5. **Zero-Trust Tamper Prevention**: Practitioners can edit their biographical narratives, spoken languages, and consultation menu, but **under no circumstances can public-profile self-service endpoints modify licensing numbers, syndicate verification statuses, license expiration dates, approval statuses, clinic membership approvals, or user roles**.

---

## 2. Field Classification Matrix: Public vs. Private

| Field Name | Type | Visibility | Editable By | Description & Security Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `doctorId` | String | **Public** | System | Unique immutable practitioner identifier. |
| `name` / `nameEn` | String | **Public** | Syndicate / Admin | Official registered practitioner name. |
| `photoUrl` | String (URL) | **Public** | Doctor, Admin | Professional clinical portrait. |
| `specialty` / `specialtyEn`| String | **Public** | Syndicate / Admin | Syndicate-certified medical subspecialty. |
| `biography` / `biographyAr`| Text | **Public** | Doctor, Admin | Clinical background, subspecialty focus, and qualifications. |
| `languages` | Array[String] | **Public** | Doctor, Admin | Spoken languages for patient consultations (e.g. Arabic, English). |
| `consultationTypes` | Array[Object] | **Public** | Doctor, Clinic Admin | In-clinic, telehealth video, or urgent triage with durations & pricing. |
| `clinics` | Array[Object] | **Public** | Clinic Admin (Approval) | **Only approved clinic memberships** (`status === 'approved'`). |
| `workingHours` | Object | **Public** | Doctor, Clinic Admin | Weekly working days, shift intervals, breaks, and slot durations. |
| `rating` / `reviewsCount` | Number | **Public** | System | Aggregated clinical patient satisfaction rating. |
| `verifiedCredentials` | Object | **Public** | System | Verified syndicate accreditation badge (without leaking private ID). |
| `isAvailableForBooking` | Boolean | **Public** | Doctor, Clinic Admin | Master switch for online appointment scheduling. |
| `email` | String | **Private** | Doctor, Super Admin | Internal account authentication and notification email. |
| `phone` | String | **Private** | Doctor, Super Admin | Private direct phone number (not exposed to public). |
| `maskedNationalId` | String | **Private** | Super Admin | Masked Egyptian National ID (e.g., `2850914****123`). |
| `nationalIdLegalReview` | Object | **Private** | Compliance Officer | Legal review verification timestamp and syndicate auditor ID. |
| `licenseNumber` | String | **Private / Protected** | Medical Syndicate / Super Admin | Syndicate registration number (EGY-MED-XXXXXX). |
| `licenseStatus` | String | **Private / Protected** | Medical Syndicate / Super Admin | Syndicate standing: `active`, `suspended`, `under_review`. |
| `licenseExpiryDate` | ISO Date | **Private / Protected** | Medical Syndicate / Super Admin | Syndicate re-licensing deadline. |
| `reverificationDueDate`| ISO Date | **Private** | Compliance Officer | Internal credential audit cycle deadline. |
| `applicationId` | String | **Private** | Admin | Onboarding application tracking identifier. |
| `rejectionReason` | String | **Private** | Admin | Internal rationale if an application or membership is refused. |
| `auditTrail` | Array[Object] | **Private** | System | Immutable ledger of profile and credential modifications. |

---

## 3. RBAC Permissions & Tampering Protection

### 3.1 Prohibited Modifications by Doctor (`PATCH /api/doctor/profile`)

Any payload submitted to `/api/doctor/profile` is passed through `doctorProfileService.sanitizeDoctorProfileUpdate()`. If a doctor attempts to submit any protected field, the request is immediately rejected with `403 FORBIDDEN` and an audit security event `UNAUTHORIZED_PROFILE_TAMPERING_ATTEMPT` is recorded.

**Strictly Blocked Fields for Doctor Updates:**
- `role` (Prevent privilege escalation to clinic admin or super admin)
- `licenseNumber` (Cannot alter syndicate registration number)
- `licenseStatus` (Cannot change active/suspended status)
- `licenseExpiryDate` (Cannot extend license expiration)
- `verificationResult` (Cannot self-verify credentials)
- `doctorApplicationStatus` (Cannot approve own onboarding)
- `status` (Cannot override administrative standing)
- `clinicMemberships` (Cannot self-approve clinic affiliations)
- `suspended` / `disabled` (Cannot lift disciplinary freezes)
- `isOwner` (Cannot assign owner privileges)

### 3.2 Permitted Self-Service Fields for Doctor
- `photoUrl` (Updated portrait photo)
- `biography` / `biographyAr` (Professional summary)
- `languages` (Spoken languages list)
- `consultationTypes` (Service menu, pricing, and consultation duration)
- `isAvailableForBooking` (Toggle booking availability)
- `workingHours` (Adjust working schedule within approved clinics)

---

## 4. Clinic Membership Governance

Practitioners often deliver care across multiple healthcare facilities. Health Vibe AI enforces strict two-way governance:

1. **Clinic Scoping**: Clinic administrators can only manage doctor memberships within their assigned `clinicId` (`POST /api/clinics/:clinicId/doctors/:doctorId/membership`).
2. **Approved Filter**: When `GET /api/doctors/public` or `GET /api/doctors/public/:doctorId` is invoked, `formatDoctorPublicProfile()` filters memberships:
   ```javascript
   function getApprovedClinics(clinicMemberships) {
     return clinicMemberships.filter(m => m.status === 'approved');
   }
   ```
   If Dr. Mona has an `approved` membership at `clinic_cairo_main` and a `pending` application at `clinic_alexandria`, **only** `clinic_cairo_main` is returned to patients.

---

## 5. Working Hours Linked to Booking Availability

The availability calculation engine (`calculateDoctorBookingAvailability`) connects physician shifts directly to bookable time slots:

1. **Clinic Membership Gate**: If a `clinicId` is specified, the practitioner must possess an `approved` membership at that clinic. Otherwise, booking is refused (`available: false`, `reason: 'NO_APPROVED_MEMBERSHIP_AT_CLINIC'`).
2. **Working Days Match**: The requested date's day of week (0 = Sun, ..., 6 = Sat) is verified against `workingHours.workingDays`. If not a working day, `reason: 'DOCTOR_NOT_WORKING_ON_THIS_DAY'` is returned.
3. **Leave Enforcements**: If the target date falls inside `doctorRecord.leaves[]` (e.g. Annual Leave, Medical Conference), all slots are blocked with `reason: 'DOCTOR_ON_LEAVE'`.
4. **Shift Slot Generation**: Slots are generated according to `slotDurationMinutes` (default: 30 minutes) across all defined shifts (e.g. `10:00 - 13:00` and `16:00 - 20:30`).
5. **Break Window Exclusion**: Times intersecting break periods (e.g. `13:00 - 16:00` or `Consultant Rounds`) are excluded from generated slots.
6. **Existing Appointment Deduplication**: Slots conflicting with existing scheduled appointments are marked `isBooked: true`.

---

## 6. API Route Contracts

### Public Directory
- `GET /api/doctors/public?clinicId=&specialty=`
  - **Auth**: None (Public)
  - **Output**: Array of sanitized doctor profiles with approved clinics only.

- `GET /api/doctors/public/:doctorId`
  - **Auth**: None (Public)
  - **Output**: Detailed sanitized doctor profile.

- `GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD&clinicId=`
  - **Auth**: None (Public)
  - **Output**: Dynamic booking slots, shift start/end, and availability state.

### Authenticated Doctor
- `GET /api/doctor/profile`
  - **Auth**: Required (`role: doctor`)
  - **Output**: Doctor's complete profile with membership statuses and credential alerts.

- `PATCH /api/doctor/profile`
  - **Auth**: Required (`role: doctor`)
  - **Payload**: Editable fields (`biography`, `languages`, `consultationTypes`, etc.)
  - **Tamper Rejection**: 403 Forbidden on protected credential/role fields.

### Clinic Administration
- `POST /api/clinics/:clinicId/doctors/:doctorId/membership`
  - **Auth**: Required (`role: clinic_admin` or `super_admin`)
  - **Payload**: `{ status: 'approved' | 'paused' | 'rejected' }`
  - **Scope**: Clinic admin can only update their assigned clinic.
