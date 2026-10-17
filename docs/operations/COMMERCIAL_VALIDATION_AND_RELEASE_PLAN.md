# Health Vibe AI - Commercial Demand Validation & Phased Release Roadmap

**Version:** 1.0.0  
**Effective Date:** 2026-10-07  
**Status:** Approved  

---

## 1. Commercial Demand Validation Framework

Prior to rolling out broad architectural capabilities to the public and enterprise partners, each feature cluster is gated against validated market demand.

```
       [Market Discovery]
               │
               ▼
   [Validation Signal Met?] ──► NO ──► Re-iterate on Pilot Offer
               │ YES
               ▼
      [Small Phased Release]
               │
               ▼
    [Automated Test Gates]
               │
               ▼
     [Production Rollout]
```

### 1.1 Commercial Validation Signals & Metrics
| Metric | Target Threshold | Validation Tool / Signal |
| :--- | :--- | :--- |
| **Pilot Clinic Commitment** | 3 Signed Memorandums of Understanding (MOUs) | Contracted pilot clinics in pulmonary & allergy medicine |
| **Consultation Demand** | $\ge 100$ completed bookings in 30 days | Real booking transactions across pilot clinics |
| **Partner Integration Need** | $\ge 2$ enterprise partners requesting API keys | Inbound partner requests for EMR/EHR automated booking sync |
| **Doctor Supply Density** | $\ge 15$ verified specialists across 3 specialties | Complete verification dossiers submitted |
| **Complaint SLA Performance** | $100\%$ urgent complaints resolved within 4h | Automated audit log metrics |

---

## 2. Phased Release Strategy

To minimize deployment risk and ensure zero downtime, the implementation is partitioned into 4 distinct, incremental releases.

---

### Release 1.0: Core Booking Engine & Marketplace Discovery
* **Focus**: Stable public and patient-facing booking foundation.
* **Included Components**:
  * Clinical Specialties Discovery (`GET /api/v1/marketplace/specialties`)
  * Verified Doctor Marketplace Directory (`GET /api/v1/marketplace/doctors`)
  * Clinical Appointments Booking (`POST /api/v1/appointments/book`)
  * Concurrency Lock (Doctor Slot Conflict & Patient Self-Overlap Protection)
  * Appointment Cancellation Workflow (`POST /api/v1/appointments/:id/cancel`)
* **Commercial Gate to Proceed**:
  * 3 Pilot clinics successfully live-tested.
  * Zero double-booking collisions under peak load.
* **Status**: **READY FOR DEPLOYMENT** (Test Suite `appointments_booking.test.js` & `partner_ecosystem_marketplace.test.js` passing).

---

### Release 1.1: Trust, Safety & Verification Governance
* **Focus**: Clinical credential auditing, regulatory compliance, and incident resolution.
* **Included Components**:
  * Published Verification Policy Standards (`GET /api/v1/verification/policy`)
  * Server-Authoritative Verification Revocation (`POST /api/admin/revoke-doctor-verification`)
  * Role Demotion and Session Invalidation on Revocation
  * Patient & Partner Complaints Ingestion (`POST /api/v1/complaints/submit`)
  * Complaint SLA Calculation (Urgent 4h, High 24h, Medium 72h, Low 7d)
  * Administrative Resolution & Audit Trail (`POST /api/admin/complaints/:id/resolve`)
* **Commercial Gate to Proceed**:
  * 100% of onboarded doctors verified against official medical registries.
  * Clinical advisory committee sign-off on complaint categories.
* **Status**: **READY FOR DEPLOYMENT** (Test Suite `partner_ecosystem_marketplace.test.js` passing).

---

### Release 1.2: B2B Partner Ecosystem & Signed Webhooks
* **Focus**: Secure third-party integrations, enterprise isolation, and event streaming.
* **Included Components**:
  * Cryptographic Partner API Key Generation (`hv_live_...` / `hv_test_...`)
  * Zero-Plaintext SHA-256 Key Storage in Firestore
  * Granular Permission Scopes (`specialties:read`, `doctors:read`, `appointments:*`, `complaints:write`)
  * Multi-Tenant Organization Boundary Isolation (`org-alpha` vs `org-beta`)
  * Sliding-Window Rate Limiting per Key
  * Immediate Partner Permission Revocation (`POST /api/org/:orgId/partner-keys/:keyId/revoke`)
  * Signed Webhooks Engine with HMAC-SHA256 (`X-HealthVibe-Signature: t=...,v1=...`)
  * Anti-Replay Timestamp Tolerance (300 seconds)
  * Automated Webhook Delivery Retries with Exponential Backoff (3 attempts)
* **Commercial Gate to Proceed**:
  * At least 1 commercial hospital or diagnostic partner ready to consume automated webhooks in staging.
* **Status**: **READY FOR DEPLOYMENT** (Test Suite `partner_ecosystem_marketplace.test.js` passing).

---

### Release 2.0: Official Partner SDK & Developer Portal
* **Focus**: Frictionless developer experience and client-side resiliency.
* **Included Components**:
  * Official Node.js / TypeScript SDK Client (`HealthVibePartnerClient`)
  * Automated Client-Side Retries on HTTP 429 and 5xx errors
  * Built-in Cryptographic Signature Verification Helper
  * Sandbox Testing Environment (`hv_test_...` keys)
  * Interactive API Reference Documentation (`API_REFERENCE_STABLE.md`)
* **Commercial Gate to Proceed**:
  * Partner developer onboarding time reduced to $< 1$ business day.
* **Status**: **READY FOR PACKAGING & DISTRIBUTION** (SDK integrated and validated in test suite).

---

## 3. Rollback & Fail-Safe Strategy

1. **Feature Flag Isolation**: All partner endpoints live under `/api/v1/...` and can be gated independently without altering core patient web experiences.
2. **Key Revocation Kill-Switch**: In the event of partner key compromise, administrators can revoke the key instantly via `/api/org/:orgId/partner-keys/:keyId/revoke` with zero propagation delay.
3. **Audit Log Traceability**: Every critical mutation (`APPOINTMENT_BOOKED`, `APPOINTMENT_CANCELLED`, `PARTNER_KEY_REVOKED`, `DOCTOR_VERIFICATION_REVOKED`, `COMPLAINT_SUBMITTED`) records an immutable timestamped event in `audit_events`.
