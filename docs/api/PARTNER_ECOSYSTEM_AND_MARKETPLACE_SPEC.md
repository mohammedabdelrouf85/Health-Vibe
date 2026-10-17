# Health Vibe AI - B2B Partner Ecosystem, Marketplace & Security Architecture Specification

**Document Version:** 1.0.0  
**Effective Date:** 2026-10-07  
**Status:** Approved & Stable  

---

## 1. Executive Summary & Architecture Principles

Health Vibe AI is a smart respiratory clinical assessment and telehealth platform. This specification defines the enterprise integration architecture that connects healthcare partners (hospitals, EMR providers, telehealth apps, and diagnostic networks) to the Health Vibe core services.

### Core Architecture Tenets
1. **Zero-Trust Security**: No client-side role assertions or unauthenticated mutations. Every request is verified server-side.
2. **Organization Isolation**: Complete multi-tenant data boundaries. Organization A cannot view, query, modify, or cancel resources owned by Organization B.
3. **Cryptographic Key Storage**: Partner API keys are stored solely as cryptographic SHA-256 hashes. Plaintext keys are shown only once at provisioning time.
4. **Granular Least Privilege**: Scoped permissions govern all access. A partner cannot perform operations outside their granted scopes.
5. **Signed Webhooks & Anti-Replay Protection**: Webhook payloads are signed using HMAC-SHA256 with timestamp headers (`t=...`) to prevent tampering and replay attacks.
6. **Automatic Exponential Backoff**: Webhook dispatchers and the official SDK automatically retry transient failures (HTTP 429 and 5xx) with exponential backoff.

---

## 2. Functional Scope Definitions

### 2.1 Doctor Marketplace Scope
* **Purpose**: Provide a directory of credentialed, licensed healthcare specialists for consultation and secondary respiratory assessment reviews.
* **In-Scope**:
  * Listing active, verified medical specialists.
  * Public practitioner metadata: Name, clinical specialty, institutional affiliation, verification badge (`HEALTH_VIBE_CERTIFIED`), accepted consultation modalities (in-clinic and telehealth video), verified patient satisfaction ratings.
  * Multi-dimensional filtering: Specialty slug, clinic identifier, consultation type (telehealth only), and keyword search.
* **Out-of-Scope (Restricted)**:
  * Unverified applicants or pending candidates (`status: pending`).
  * Suspended doctors or doctors with revoked licenses.
  * Personal PII: Personal mobile numbers, private residential addresses, national identification numbers, or direct financial records.

### 2.2 Specialty Discovery Scope
* **Purpose**: Standardized taxonomy of clinical respiratory domains to enable accurate triage and appointment dispatch.
* **In-Scope**:
  * Clinical specialty identification (`spec_pulmonology`, `spec_allergy_immunology`, `spec_critical_care`, `spec_ent`, `spec_internal_medicine`).
  * Bilingual metadata (English and Arabic names, scopes of practice).
  * Diagnostic condition associations (e.g., Asthma, COPD, Pneumonia, Sleep Apnea, ARDS recovery, Chronic Cough).
  * High-performance, low-latency cached delivery.

### 2.3 Booking Engine Scope
* **Purpose**: Concurrency-safe clinical consultation reservation across physical clinics and remote video channels.
* **In-Scope**:
  * Real-time slot reservation across a 7-day rolling window.
  * **Anti-Double-Booking Concurrency Lock**:
    * **Doctor Slot Lock**: Prevents conflicting bookings for the same doctor on the same date and slot (`409 DOCTOR_SLOT_UNAVAILABLE`).
    * **Patient Self-Overlap Lock**: Prevents a patient from booking multiple overlapping consultations (`409 PATIENT_SCHEDULE_CONFLICT`).
  * **Cancellation Lifecycle**:
    * Structured cancellation initiated by patient, doctor, clinic admin, or authorized partner.
    * Mandates audit cancellation reason and sets `cancelledAt` timestamp.
    * **Idempotency Guard**: Rejects repeat cancellations of already cancelled appointments (`400 APPOINTMENT_ALREADY_CANCELLED`).
    * Immediate release of the cancelled slot back to the public booking availability pool.
  * Real-time webhook emission (`appointment.booked`, `appointment.cancelled`).

### 2.4 Doctor Verification Policy Scope
* **Purpose**: Zero-trust credentialing ensuring only vetted, board-certified clinicians practice on the platform.
* **Core Requirements**:
  1. `REQ_LICENSE`: Active, unencumbered medical practice license validated against national health authorities.
  2. `REQ_DEGREE`: Accredited medical degree (MBBCh, MD, MBBS) from a recognized university.
  3. `REQ_BOARD`: Postgraduate board certification or fellowship in Pulmonology, Allergy, or Critical Care.
  4. `REQ_GOOD_STANDING`: Clean disciplinary and malpractice record (no active suspensions).
  5. `REQ_AFFILIATION`: Formal affiliation with an accredited clinic or hospital partner.
* **Revocation Policy**:
  * Triggered upon license expiration, regulatory sanction, or substantiated clinical malpractice.
  * Instant revocation of custom claims (`role: patient`), invalidation of active session privileges, and real-time removal from the marketplace directory.
  * Webhook emission: `doctor.verification_revoked`.

### 2.5 Complaints & Incident Reporting Scope
* **Purpose**: Patient and partner grievance management with service-level agreement (SLA) enforcement.
* **Categories**:
  * `clinical_care`, `misdiagnosis_concern`, `delay_or_cancellation`, `unprofessional_conduct`, `billing_dispute`, `technical_issue`.
* **Severities & SLA Deadlines**:
  * `urgent`: 4-hour resolution SLA (patient safety / severe clinical concerns).
  * `high`: 24-hour resolution SLA.
  * `medium`: 72-hour resolution SLA.
  * `low`: 168-hour (7-day) resolution SLA.
* **Lifecycle**:
  * `submitted` $\rightarrow$ `under_investigation` $\rightarrow$ `resolved` | `dismissed`.
  * Administrative resolution requires recorded corrective action notes and emits `complaint.resolved` webhooks.

---

## 3. Security, Keys & Organization Isolation

### 3.1 Partner API Key Design
* **Key Format**: `hv_<environment>_<48_hex_chars>`
  * Production: `hv_live_...`
  * Sandbox / Test: `hv_test_...`
* **Cryptographic Storage**:
  * Plaintext key is displayed to the administrator **only once** upon creation.
  * Firestore stores only the SHA-256 hash:
    $$\text{keyHash} = \text{SHA256}(\text{rawKey})$$
  * Database records contain: `{ keyId, orgId, name, keyHash, maskedKey, prefix, scopes, rateLimit, status, createdAt, revokedAt }`.
* **Immediate Revocation**:
  * Revoking a key sets `status: 'revoked'` and `revokedAt: Date.now()`.
  * Any request bearing a revoked key is rejected immediately with `401 PARTNER_KEY_REVOKED`.

### 3.2 Granular Permission Scopes (RBAC)
| Scope Identifier | Description | Allowed Operations |
| :--- | :--- | :--- |
| `specialties:read` | Read clinical specialties | `GET /api/v1/marketplace/specialties` |
| `doctors:read` | Query marketplace doctors | `GET /api/v1/marketplace/doctors` |
| `appointments:read` | View appointment details | `GET /api/v1/appointments/:id` |
| `appointments:write` | Create consultation booking | `POST /api/v1/appointments/book` |
| `appointments:cancel` | Cancel an appointment | `POST /api/v1/appointments/:id/cancel` |
| `complaints:write` | File clinical/service complaint | `POST /api/v1/complaints/submit` |
| `webhooks:receive` | Receive signed notifications | Webhook endpoint registration |
| `*` | Super-partner administrative wildcard | All partner operations |

### 3.3 Multi-Tenant Organization Isolation
* Every Partner API Key is bound immutably to a single `orgId`.
* When authenticating via `X-API-Key`, the server injects `req.partnerOrgId = keyDoc.orgId`.
* Resource Isolation Rules:
  * An appointment created by a partner inherits `appointment.orgId = req.partnerOrgId`.
  * When reading or cancelling an appointment:
    $$\text{assert}(appointment.orgId == req.partnerOrgId)$$
  * Violations immediately abort with `403 ORGANIZATION_ISOLATION_VIOLATION`.

### 3.4 Rate Limiting & Abuse Prevention
* Partner requests are throttled using an in-memory sliding window algorithm per `keyId`.
* Default limits:
  * Standard tier: 60 to 120 requests / minute.
  * Enterprise tier: Up to 1000 requests / minute.
* Standard Rate-Limit Response Headers:
  * `X-RateLimit-Limit`: Maximum requests allowed in window.
  * `X-RateLimit-Remaining`: Remaining request allowance.
  * `X-RateLimit-Reset`: Seconds until window reset.
  * `Retry-After`: Seconds to wait before retrying (sent on HTTP 429).

### 3.5 Signed Webhooks & Replay Defense
1. **Signature Construction**:
   $$\text{payloadString} = \text{JSON.stringify}(payload)$$
   $$\text{signaturePayload} = timestamp + "." + payloadString$$
   $$\text{signature} = \text{HMAC-SHA256}(\text{signingSecret}, \text{signaturePayload})$$
2. **Signature Header**:
   `X-HealthVibe-Signature: t=1728280000,v1=abcdef0123456789...`
3. **Verification Algorithm**:
   * Parse timestamp $t$ and signature $v_1$.
   * Validate age: $|Date.now() - t| \le 300\text{ seconds}$ (rejection on timestamp expiration).
   * Calculate expected signature over $t + "." + payloadString$.
   * Compare using `crypto.timingSafeEqual` (defense against timing side-channel attacks).
4. **Retry Engine with Exponential Backoff**:
   * Up to 3 attempts on HTTP 5xx or connection drops.
   * Backoff: $\text{delay} = \text{initialDelay} \times 2^{\text{attempt}-1}$.
   * Audit tracking: `attempts`, `statusCode`, `latencyMs`, `status: delivered | failed`.

---

## 4. Official Partner SDK Architecture

The official client (`HealthVibePartnerClient`) in `backend/sdk/healthvibe-sdk.js` wraps all stable endpoints:
* **Automatic Header Management**: Injects `X-API-Key` and `Content-Type`.
* **Automatic Resiliency**: Retries on network timeouts and 5xx / 429 status codes with exponential backoff.
* **Normalized Error Types**:
  * `HealthVibeApiError`
  * `HealthVibeAuthError` (401)
  * `HealthVibeForbiddenError` (403)
  * `HealthVibeRateLimitError` (429)
* **Cryptographic Helper**: `verifyWebhookSignature()` built into both static and instance contexts.
