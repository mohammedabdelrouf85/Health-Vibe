# Telehealth Video Consultation, Privacy & Consent Governance
**Health Vibe AI — Clinical WebRTC, Provider Evaluation & Remote Patient Care Architecture**

---

## 1. Executive Summary & Regulatory Purpose

In compliance with HIPAA, GDPR-Health, Egyptian Data Protection Law No. 151, and Egyptian Medical Syndicate Telemedicine Guidelines, virtual clinical consultations must provide a secure, confidential, and technically resilient environment for respiratory assessments.

This governance specification defines:
1. **Telehealth Provider Selection**: Comprehensive evaluation of HIPAA-compliant WebRTC architectures (Daily.co, LiveKit, Sandbox fallback).
2. **Informed Consent & Emergency Protocols**: Affirmative opt-in required prior to consultation entry, mandating acknowledgment of virtual limitations and acute respiratory emergency protocols (e.g., dialing 123 for SpO2 desaturation < 88%).
3. **Appointment-Linked Ephemeral Rooms**: Rooms are created **only for confirmed appointments**, preventing unverified or impromptu consultations.
4. **Strict Participant Identity Verification**: Entry is restricted exclusively to the assigned doctor and the scheduled patient. Unauthorized third parties are rejected with `403 UNAUTHORIZED_PARTICIPANT`.
5. **Time-Limited Access Windows**: Token access opens 15 minutes prior to the slot start and expires 45 minutes after the slot ends.
6. **Deterministic Room State Machine**: Tracking `created`, `waiting`, `active`, `disconnected`, and `ended` states with complete audit logging.
7. **Zero-Recording Default (Privacy Guarantee)**: Consultations are **never recorded by default**. Any recording exception requires explicit dual affirmative consent (both doctor and patient).
8. **Hardware & Network Failure Resilience**: Graceful degradation to audio-only on camera permission denial, and temporary disconnection states with a 120-second reconnection grace period.
9. **Cancellation Invalidation**: Cancelling an appointment automatically terminates active rooms and halts entry.

---

## 2. Telehealth Provider Evaluation & Architecture

| Evaluation Dimension | Daily.co (Primary Cloud WebRTC) | LiveKit (Self-Hosted / Cloud SFU) | Sandbox Provider (Dev/Testing) |
| :--- | :--- | :--- | :--- |
| **Protocol** | WebRTC SFU / P2P Mesh | WebRTC SFU (Pion Go) | In-Memory Simulated WebRTC |
| **HIPAA BAA Availability** | Yes (Signed BAA) | Yes (Cloud BAA or Self-Hosted) | N/A (Local / Isolated) |
| **Encryption Standard** | Mandatory DTLS-SRTP, optional E2EE | WebRTC Insertable Streams / DTLS-SRTP | Simulated DTLS-SRTP |
| **Zero-Recording Guarantee** | Yes (`enable_recording: false` enforced) | Yes (`record: false` enforced) | Yes (Memory only, zero recording) |
| **Meeting Token Security** | Cryptographic HMAC-SHA256 tokens | Cryptographic JWT tokens | HMAC-SHA256 signed meeting tokens |
| **Max Participants** | 2 (Strict 1-on-1 Clinical Room) | 2 (Strict 1-on-1 Clinical Room) | 2 (Strict 1-on-1 Clinical Room) |
| **Network Resilience** | Adaptive bitrate, automatic ICE restart | Simulcast & Dynacast SFU | Reconnection grace period (120s) |

---

## 3. Telehealth Informed Consent & Emergency Protocol

Before entering a virtual consultation, patients must affirmative grant informed consent:
```json
{
  "consentGiven": true,
  "emergencyProtocolAcknowledged": true,
  "virtualLimitationsUnderstood": true,
  "recordingNoticeAcknowledged": true
}
```

### 3.1 Clinical Emergency Protocol (Acute Respiratory Flare-Up)
- In pulmonary medicine, remote assessment cannot perform immediate endotracheal intubation or arterial blood gas (ABG) sampling.
- If the patient exhibits acute signs of failure (severe cyanosis, SpO2 < 88%, respiratory rate > 30 bpm, or confusion), the consultation interface guides the patient to immediately dial Egyptian Emergency Ambulance (`123`) or local emergency services.

### 3.2 Non-Recording Guarantee
- The patient is provided clear notice that clinical video consultations are **strictly confidential and not recorded**.
- Server configurations enforce `recordingEnabled: false` across room creation and ephemeral token issuance.

---

## 4. Participant Identity Verification & Access Windows

```
   [Confirmed Appointment] ──> [Room Created] 
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    │                                                               │
[Early Join Window: -15m]                                [Window Closed: +45m]
    │                                                               │
    ▼                                                               ▼
(403 ROOM_NOT_YET_OPEN)                                 (403 ROOM_ACCESS_EXPIRED)
```

1. **Identity Verification**:
   - `doctor`: `actorUser.uid === appointment.doctorId`.
   - `patient`: `actorUser.uid === appointment.patientId`.
   - Any third party (even an authenticated user with a valid account) is rejected with `403 UNAUTHORIZED_PARTICIPANT`.
2. **Time-Limited Access**:
   - Room entry opens 15 minutes prior to scheduled slot start. Early attempts are blocked with `ROOM_NOT_YET_OPEN` reporting minutes remaining.
   - Room entry expires 45 minutes after scheduled slot end. Late attempts are blocked with `ROOM_ACCESS_EXPIRED`.
3. **Signed Ephemeral Tokens**:
   - Issued tokens are short-lived HMAC-SHA256 signed tokens containing user UID, assigned role, room ID, expiration timestamp, and zero-recording flag.

---

## 5. Room State Machine & Failure Recovery

```
                     ┌───────────────┐
                     │    CREATED    │
                     └───────┬───────┘
                             │ (1st participant joins)
                             ▼
                     ┌───────────────┐
                     │    WAITING    │
                     └───────┬───────┘
                             │ (2nd participant joins)
                             ▼
                     ┌───────────────┐
        ┌───────────>│    ACTIVE     │<───────────┐
        │            └───────┬───────┘            │
        │                    │ (Network drop)     │
        │                    ▼                    │
        │            ┌───────────────┐            │
        │ (Reconnected) DISCONNECTED │────────────┘
        └────────────│ (Grace: 120s) │ (Grace timeout)
                     └───────┬───────┘
                             │ (Ended by user / expired / cancelled)
                             ▼
                     ┌───────────────┐
                     │     ENDED     │
                     └───────────────┘
```

### 5.1 Device & Media Failure Handling
- **Camera Permission Denied**: The room does not abort; it automatically activates **audio-only fallback mode**, ensuring the clinical consultation proceeds with clear voice communication while guiding the patient on browser device permissions.
- **Microphone Blocked**: Prompts the user that bidirectional audio is mandatory for telehealth.
- **Network Drops**: Temporary ICE connection drops transition the session to `disconnected`. A **120-second grace period** allows the user to reconnect seamlessly without restarting the consultation.

### 5.2 Appointment Cancellation Invalidation
- When an appointment is cancelled via `cancelAppointmentTransaction`:
  - `terminateRoomsForAppointment(db, appointmentId)` immediately terminates active rooms (`status: 'ended'`, `endReason: 'APPOINTMENT_CANCELLED'`).
  - Subsequent join attempts by either participant are blocked with `400 APPOINTMENT_CANCELLED`.

---

## 6. REST API Specifications

### 6.1 Create Telehealth Room
- **Endpoint**: `POST /api/telehealth/rooms/create`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "appointmentId": "appt_1790270000000",
    "provider": "daily"
  }
  ```
- **Responses**:
  - `201 Created`: Room created and linked to appointment.
  - `400 Bad Request`: Appointment not confirmed or missing ID.

### 6.2 Join Telehealth Room
- **Endpoint**: `POST /api/telehealth/rooms/:roomId/join`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "consent": {
      "consentGiven": true,
      "emergencyProtocolAcknowledged": true,
      "virtualLimitationsUnderstood": true,
      "recordingNoticeAcknowledged": true
    }
  }
  ```
- **Responses**:
  - `200 OK`: Ephemeral signed meeting token issued (`meetingToken`), room state, and encryption metadata.
  - `400 Bad Request`: Incomplete informed consent or cancelled appointment.
  - `403 Forbidden`: Unauthorized participant, room not yet open, or room expired.

### 6.3 Handle Media Failure
- **Endpoint**: `POST /api/telehealth/rooms/:roomId/failure`
- **Request Body**:
  ```json
  {
    "failureType": "camera_permission_denied"
  }
  ```
- **Responses**:
  - `200 OK`: Switched to `audio_only` fallback mode.

### 6.4 Conclude Telehealth Room
- **Endpoint**: `POST /api/telehealth/rooms/:roomId/end`
- **Request Body**:
  ```json
  {
    "reason": "Clinical consultation concluded"
  }
  ```
- **Responses**:
  - `200 OK`: Room terminated and tokens invalidated.
