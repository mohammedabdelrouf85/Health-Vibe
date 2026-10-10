# Health Vibe AI - Stable Partner API Reference (v1)

**Base URL (Production):** `https://api.healthvibe.ai`  
**Base URL (Staging):** `https://staging.healthvibe.ai`  
**Version:** `v1`  
**Authentication:** `X-API-Key: hv_live_...` or `Authorization: Bearer <ID_TOKEN>`  

---

## 1. Authentication & Headers

All requests made by third-party B2B partners require a valid API key passed via header:
```http
X-API-Key: hv_live_abcdef0123456789abcdef0123456789
Content-Type: application/json
Accept: application/json
```

### Standard Rate Limit Headers
```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 60
```

---

## 2. Doctor Marketplace & Specialty Discovery

### 2.1 List Clinical Specialties
Discover available clinical domains with descriptions and diagnostic condition tags.

* **Method & Path:** `GET /api/v1/marketplace/specialties`
* **Required Scope:** `specialties:read` (or public)
* **Response (200 OK):**
```json
{
  "success": true,
  "version": "v1",
  "specialties": [
    {
      "id": "spec_pulmonology",
      "slug": "pulmonology",
      "nameEn": "Pulmonology & Respiratory Medicine",
      "nameAr": "أمراض الصدر والجهاز التنفسي",
      "descriptionEn": "Diagnosis and treatment of respiratory disorders including asthma, COPD, pneumonia, and sleep apnea.",
      "descriptionAr": "تشخيص وعلاج أمراض الجهاز التنفسي والانسداد الرئوي والربو والتهابات الرئة.",
      "commonConditions": ["Asthma", "COPD", "Pneumonia", "Bronchitis", "Sleep Apnea"],
      "telehealthEligible": true,
      "doctorCount": 14
    }
  ]
}
```

### 2.2 Search & Filter Verified Doctors
Query credential-verified healthcare practitioners.

* **Method & Path:** `GET /api/v1/marketplace/doctors`
* **Query Parameters:**
  * `specialty` *(optional, string)*: Filter by exact specialty name.
  * `clinicId` *(optional, string)*: Filter by clinic ID.
  * `telehealthOnly` *(optional, boolean)*: Set to `true` to filter for doctors supporting remote video consultations.
  * `search` *(optional, string)*: Keyword search across doctor names and clinical fields.
* **Required Scope:** `doctors:read` (or public)
* **Response (200 OK):**
```json
{
  "success": true,
  "version": "v1",
  "count": 1,
  "doctors": [
    {
      "id": "doctor_123",
      "name": "د. منى سامي",
      "specialty": "Pulmonology",
      "clinic": "عيادة الصدر والرعاية التنفسية",
      "clinicId": "clinic-a1",
      "orgId": "org-alpha",
      "verified": true,
      "verificationBadge": "HEALTH_VIBE_CERTIFIED",
      "consultationTypes": ["in_clinic", "video"],
      "rating": 4.9,
      "reviewCount": 38
    }
  ]
}
```

---

## 3. Clinical Booking Engine

### 3.1 Book Clinical Consultation
Create a confirmed appointment with anti-double-booking concurrency lock.

* **Method & Path:** `POST /api/v1/appointments/book`
* **Required Scope:** `appointments:write`
* **Request Body:**
```json
{
  "doctorId": "doctor_123",
  "doctorName": "د. منى سامي",
  "date": "2026-10-15",
  "timeSlot": "10:00 صباحًا",
  "slotId": "slot_1000",
  "type": "video",
  "patientId": "pat_9988",
  "patientName": "طارق محمود",
  "notes": "متابعة أكسجين وسعال حاد",
  "clinicId": "clinic-a1"
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "version": "v1",
  "appointment": {
    "id": "appt_1790270000000_a1b2",
    "patientId": "pat_9988",
    "patientName": "طارق محمود",
    "doctorId": "doctor_123",
    "doctorName": "د. منى سامي",
    "clinicId": "clinic-a1",
    "orgId": "org-alpha",
    "date": "2026-10-15",
    "timeSlot": "10:00 صباحًا",
    "type": "video",
    "status": "confirmed",
    "createdAt": 1790270000000
  }
}
```
* **Conflict Responses:**
  * `409 DOCTOR_SLOT_UNAVAILABLE`: The doctor already has a confirmed booking for this slot.
  * `409 PATIENT_SCHEDULE_CONFLICT`: The patient already has a confirmed booking for this slot.

### 3.2 Cancel Appointment
Cancel an appointment with organization isolation and non-repeat guards.

* **Method & Path:** `POST /api/v1/appointments/:id/cancel`
* **Required Scope:** `appointments:cancel`
* **Request Body:**
```json
{
  "reason": "المريض يرغب في تأجيل الموعد للأسبوع القادم"
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "version": "v1",
  "appointmentId": "appt_1790270000000_a1b2",
  "status": "cancelled",
  "cancelledAt": 1790270050000
}
```
* **Error Responses:**
  * `400 APPOINTMENT_ALREADY_CANCELLED`: Repeat cancellation attempt blocked.
  * `403 ORGANIZATION_ISOLATION_VIOLATION`: Partner attempting to modify foreign organization appointment.
  * `404 APPOINTMENT_NOT_FOUND`: Appointment does not exist.

### 3.3 Get Appointment Details
* **Method & Path:** `GET /api/v1/appointments/:id`
* **Required Scope:** `appointments:read`
* **Response (200 OK):**
```json
{
  "success": true,
  "version": "v1",
  "appointment": {
    "id": "appt_1790270000000_a1b2",
    "status": "confirmed",
    "date": "2026-10-15",
    "timeSlot": "10:00 صباحًا"
  }
}
```

---

## 4. Doctor Verification Policy

### 4.1 Get Verification Standards
* **Method & Path:** `GET /api/v1/verification/policy`
* **Required Scope:** None (Public)
* **Response (200 OK):**
```json
{
  "success": true,
  "policy": {
    "version": "2026.1",
    "reviewSlaHours": 48,
    "minimumRequirements": [
      {
        "code": "REQ_LICENSE",
        "title": "Valid Medical License",
        "verificationSource": "National Healthcare Practitioner Registry"
      }
    ]
  }
}
```

### 4.2 Revoke Doctor Verification (Admin Only)
* **Method & Path:** `POST /api/admin/revoke-doctor-verification`
* **Required Auth:** Admin Token (`Bearer <JWT>`)
* **Request Body:**
```json
{
  "doctorUserId": "doc_user_456",
  "reason": "Medical license expired in national registry"
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "doctorUserId": "doc_user_456",
  "status": "revoked",
  "message": "Doctor credential verification has been successfully revoked."
}
```

---

## 5. Complaints & Incident Management

### 5.1 Submit Clinical or Service Complaint
* **Method & Path:** `POST /api/v1/complaints/submit`
* **Required Scope:** `complaints:write`
* **Request Body:**
```json
{
  "category": "clinical_care",
  "severity": "urgent",
  "subject": "Delayed response on critical respiratory consultation",
  "description": "Patient had acute dyspnea and waited beyond SLA.",
  "doctorId": "doc_user_456",
  "appointmentId": "appt_1790270000000_a1b2"
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "version": "v1",
  "complaint": {
    "id": "cmp_1790270000000_c3d4",
    "category": "clinical_care",
    "severity": "urgent",
    "slaHours": 4,
    "slaDeadline": 1790284400000,
    "status": "submitted",
    "createdAt": 1790270000000
  }
}
```

### 5.2 Resolve Complaint (Admin Only)
* **Method & Path:** `POST /api/admin/complaints/:id/resolve`
* **Required Auth:** Admin Token (`Bearer <JWT>`)
* **Request Body:**
```json
{
  "status": "resolved",
  "resolutionNotes": "Attending physician contacted patient, emergency respiratory triage dispatched.",
  "correctiveAction": "Priority clinical dispatch confirmed"
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "complaintId": "cmp_1790270000000_c3d4",
  "status": "resolved",
  "resolvedAt": 1790271000000
}
```

---

## 6. Partner API Key Governance

### 6.1 Create Partner Key
* **Method & Path:** `POST /api/org/:orgId/partner-keys/create`
* **Required Auth:** Organization Admin (`Bearer <JWT>`)
* **Request Body:**
```json
{
  "name": "Beta Hospital Telehealth Partner",
  "scopes": ["specialties:read", "doctors:read", "appointments:write", "appointments:cancel"],
  "environment": "live",
  "rateLimit": 120
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "orgId": "org-alpha",
  "keyId": "key_1790270000000_e5f6",
  "name": "Beta Hospital Telehealth Partner",
  "apiKey": "hv_live_839a9c2409f82bc1938d...",
  "maskedKey": "hv_live_83...938d",
  "scopes": ["specialties:read", "doctors:read", "appointments:write", "appointments:cancel"],
  "rateLimit": 120,
  "status": "active"
}
```

### 6.2 Revoke Partner Key
* **Method & Path:** `POST /api/org/:orgId/partner-keys/:keyId/revoke`
* **Required Auth:** Organization Admin (`Bearer <JWT>`)
* **Response (200 OK):**
```json
{
  "success": true,
  "orgId": "org-alpha",
  "keyId": "key_1790270000000_e5f6",
  "status": "revoked",
  "revokedAt": 1790272000000
}
```

---

## 7. Signed Webhooks Specification

Webhooks are dispatched via `POST` to the partner's registered URL.

### Headers Sent with Webhook
```http
Content-Type: application/json
X-HealthVibe-Signature: t=1728280000000,v1=5b9e02c63ef298138fa8e2bc...
X-HealthVibe-Event: appointment.cancelled
X-HealthVibe-Delivery-Id: del_1728280000_xyz
X-HealthVibe-Timestamp: 1728280000000
```

### Supported Webhook Events
* `appointment.booked`
* `appointment.cancelled`
* `doctor.verification_revoked`
* `complaint.created`
* `complaint.resolved`

### Signature Verification Code (Node.js SDK)
```javascript
const { HealthVibePartnerClient } = require('./sdk/healthvibe-sdk');

const isValid = HealthVibePartnerClient.verifyWebhookSignature(
  rawBodyString,
  req.headers['x-healthvibe-signature'],
  process.env.HEALTH_VIBE_WEBHOOK_SECRET,
  300 // 5-minute tolerance
);

if (!isValid.valid) {
  return res.status(401).send('Invalid signature');
}
```
