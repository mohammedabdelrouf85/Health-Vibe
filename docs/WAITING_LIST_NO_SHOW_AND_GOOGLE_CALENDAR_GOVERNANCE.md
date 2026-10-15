# Waiting List, No-Show Tracking & Google Calendar Integration Governance
**Health Vibe AI — Clinical Scheduling, Slot Allocation & Calendar Synchronization**

---

## 1. Executive Summary & Purpose

Clinical appointment availability directly affects patient health outcomes and clinic operational efficiency. In specialized pulmonary and respiratory care, vacant slots caused by late cancellations or patient no-shows lead to idle medical capacity, while high-acuity patients endure prolonged waiting periods.

This governance specification defines:
1. **Prioritized Patient Waiting List**: Categorization by clinical urgency tiers (`urgent`, `priority`, `routine`) with deterministic FIFO tie-breaking, duplicate entry prevention, and strict RBAC patient data isolation.
2. **Automated Slot Offering Policy & Anti-Double-Booking**: When an appointment is cancelled or rescheduled, the released slot is immediately placed on a temporary offer hold for the highest-ranked waiting candidate, preventing third-party race conditions and double bookings.
3. **Strict No-Show Attribution & Audit**: Transitioning an appointment to `no_show` strictly mandates recording **WHO** changed the status (`actorUid`, `actorRole`) and **WHY** (non-empty clinical reason). Patients are barred from marking no-shows. High-risk patients (>= 3 no-shows) are automatically flagged.
4. **Google Calendar Integration with Doctor Consent & Least-Privilege Scopes**:
   - Synchronization is activated **only after explicit doctor consent**.
   - OAuth scopes are restricted strictly to `https://www.googleapis.com/auth/calendar.events` (minimal event access, rejecting broad calendar administrative or email/drive permissions).
   - **Zero-PHI Event Minimization**: Events pushed to Google Calendar contain zero clinical diagnoses, vitals, or prescribed medications; instead, they feature generic consultation titles and secure deep links requiring portal authentication.
5. **Authoritative Source of Truth (SoT) & Conflict Reconciliation**:
   - The Health Vibe database (`HEALTH_VIBE_CORE_DB`) is the sole authoritative Source of Truth.
   - External modifications in Google Calendar that conflict with internal records are automatically detected and reconciled/overwritten to reflect the authoritative clinical state.

---

## 2. Waiting List Lifecycle & Slot Offering State Machine

```
   [Patient Joins] ──> [ACTIVE] 
                          │
            Slot Released │ (Cancellation or Reschedule)
                          ▼
                      [OFFERED]  <── (Slot Locked with Hold Window: 15 min)
                          │
          ┌───────────────┴───────────────┐
          │                               │
(Accepts Offer)              (Declines / TTL Expires)
          │                               │
          ▼                               ▼
      [BOOKED]                [DECLINED] / [EXPIRED]
(Confirmed Slot Created)                  │
                                          ▼
                             [Cascade to Next Candidate]
```

### 2.1 Priority Scoring Policy
Candidates on the waiting list are ranked deterministically:
1. **Urgency Tier Weight**:
   - `urgent` (Rank 3): Critical symptoms, acute respiratory distress, post-discharge follow-ups.
   - `priority` (Rank 2): Moderate flare-ups, diagnostic test reviews.
   - `routine` (Rank 1): Periodic reviews, general check-ups.
2. **FIFO Tie-Breaker**:
   - If two candidates share the same urgency rank, the earlier `createdAt` timestamp takes precedence.
3. **Slot Matching**:
   - Candidate must match the `doctorId` and `desiredDate`.

### 2.2 Anti-Double-Booking Locks
- When a slot is offered, an atomic record is placed in `appointment_locks`:
  `status: 'offered_hold'`, `offeredToPatientId: candidate.patientId`, `expiresAt: now + 15m`.
- Any regular patient booking attempt for this slot is rejected with `409 DOCTOR_SLOT_OFFER_HOLD`.
- Only the offered candidate can accept the slot before expiration via `POST /api/appointments/waiting-list/:id/accept`.

---

## 3. Strict No-Show Tracking & Attribution Architecture

### 3.1 Mandatory Attribution Fields (WHO & WHY)
Marking an appointment as `no_show` (`POST /api/appointments/:id/no-show` or status update) enforces:
- **WHO (`actorUid`, `actorRole`)**: Only clinical staff (`doctor`, `clinic_admin`, `super_admin`) can mark an appointment as no-show. Patients attempting this action receive `403 ACCESS_DENIED`.
- **WHY (`reason`)**: A non-empty reason is mandatory (e.g., "Patient did not arrive within 30 minutes and did not answer phone"). Requests without a reason are rejected with `400 MISSING_NO_SHOW_REASON`.
- **Change History**: The appointment document's `history` array immutably records `action: 'NO_SHOW_RECORDED'`, the actor, timestamp, and explanation.

### 3.2 Longitudinal Metrics & High-Risk Threshold
- Patient no-show metrics are tracked in `patient_no_show_metrics`.
- **Threshold**: When a patient accumulates **3 or more no-shows**, `hasHighNoShowRisk: true` is triggered.
- Clinic dashboards display aggregated no-show statistics and list high-risk patients for proactive clinical follow-up.

---

## 4. Google Calendar Integration & Zero-PHI Minimization

### 4.1 Consent & Scope Governance
| Parameter | Policy | Enforced Value |
| :--- | :--- | :--- |
| **Doctor Consent** | Mandatory affirmative opt-in | `consent: true` (revocable anytime) |
| **Granted Scopes** | Least-privilege minimal access | `['https://www.googleapis.com/auth/calendar.events']` |
| **Forbidden Scopes** | Broad administrative scopes | `calendar`, `calendar.settings`, `mail`, `drive` (Strictly rejected with 403) |
| **External Attendees** | Zero external directory leaks | `attendees: []` (Patient email omitted from external calendar) |

### 4.2 PHI Minimization Comparison

| Field | Unsafe Raw Payload (STRICTLY FORBIDDEN) | Sanitized Google Calendar Event (ENFORCED) |
| :--- | :--- | :--- |
| **Summary** | "COPD Consultation for Tarek (SpO2 86%)" | `"Health Vibe Consultation - Dr. Mona Samy"` |
| **Description** | "Patient on Prednisolone 40mg with nocturnal dyspnea and purulent sputum." | `"Confidential Clinical Consultation (ID: appt_123)\nStatus: Confirmed\nClinic: Specialized Chest Clinic\n\nTo view clinical charts securely, sign in to the portal:\nhttps://healthvibe.ai/app/index.html?screen=appointments"` |
| **Location** | Clinic Room / Telehealth Link | `"Specialized Chest Clinic, Abbas El-Akkad St, Cairo"` |

---

## 5. System Source of Truth (SoT) & Conflict Reconciliation

1. **Source of Truth Principle**:
   - The Health Vibe database is the primary authoritative Source of Truth (`SOURCE_OF_TRUTH = 'HEALTH_VIBE_CORE_DB'`).
   - Google Calendar is purely a downstream synchronization projection.
2. **Conflict Detection**:
   - `reconcileGoogleCalendarEvent(db, appointmentId)` audits discrepancies between internal records and external calendar events.
   - If an external user or tool changes the event date, time, or status in Google Calendar:
     - Health Vibe detects the skew.
     - Health Vibe DB's authoritative state **overwrites and restores** the external Google Calendar event.
     - An audit record `GOOGLE_CALENDAR_CONFLICT_RECONCILED` is logged.

---

## 6. REST API Specifications

### 6.1 Waiting List Endpoints
- `POST /api/appointments/waiting-list`: Add patient to waiting list (`doctorId`, `desiredDate`, `urgencyTier`).
- `GET /api/appointments/waiting-list`: View waiting list (filtered by RBAC).
- `POST /api/appointments/waiting-list/:id/accept`: Atomically convert offer into confirmed appointment.
- `POST /api/appointments/waiting-list/:id/decline`: Decline offer and cascade to next candidate.
- `DELETE /api/appointments/waiting-list/:id`: Remove entry from waiting list.

### 6.2 No-Show Tracking Endpoints
- `POST /api/appointments/:id/no-show`: Mark appointment as No-Show with mandatory `reason`.
- `GET /api/appointments/no-shows/patient/:patientId`: Get patient no-show history and risk flag.
- `GET /api/appointments/no-shows/clinic/:clinicId`: Get clinic aggregate no-show metrics.

### 6.3 Google Calendar Endpoints
- `POST /api/doctors/google-calendar/connect`: Connect with doctor consent & minimal scopes.
- `DELETE /api/doctors/google-calendar/disconnect`: Revoke consent and disable sync.
- `GET /api/doctors/google-calendar/status`: Retrieve connection status and SoT confirmation.
- `POST /api/doctors/google-calendar/reconcile/:appointmentId`: Reconcile external discrepancies against Health Vibe DB.

---

## 7. Verification & Automated Test Coverage

The test suite `tests/waiting_list_no_shows_and_google_calendar_governance.test.js` covers 10 comprehensive tests:
- **Test 1**: Priority sorting (`urgent` > `priority` > `routine`), FIFO, duplicate prevention, and RBAC isolation.
- **Test 2**: No-show tracking requiring WHO and WHY, rejection of patient-initiated no-shows, and high-risk threshold calculation.
- **Test 3**: Automated slot release upon cancellation and offer generation to top waiting candidate.
- **Test 4**: Anti-double-booking locks preventing third-party booking during offer hold and atomic acceptance.
- **Test 5**: Automatic offer cascading to next eligible candidate upon decline or expiration.
- **Test 6**: Google Calendar doctor consent check and least-privilege scope enforcement.
- **Test 7**: Zero-PHI event minimization verifying complete absence of diagnoses, vitals, or medications.
- **Test 8**: End-to-end sync lifecycle for creation, rescheduling, and cancellation.
- **Test 9**: Authoritative Source of Truth verification and external conflict overwrite reconciliation.
- **Test 10**: Express REST API endpoints authentication and route protection.
