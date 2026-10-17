# Push Notifications, Token Lifecycle & Cross-Account Isolation Governance
**Health Vibe AI — Clinical Communication & Device Security Architecture**

---

## 1. Executive Summary & Regulatory Purpose

In compliance with HIPAA, GDPR-Health, and Egyptian Data Protection Law No. 151, push notifications delivered to user devices (browsers, iOS APNs, Android FCM) must balance timely clinical alerts with rigorous patient confidentiality.

This governance specification defines:
1. **Explicit, Revocable User Consent**: Push tokens can never be registered without prior affirmative consent. Subscriptions may be revoked by the user at any time.
2. **Device Token Lifecycle & Expiration Cleanup**: Tracking device IDs, platforms, last active timestamps, and automatic TTL expiration.
3. **Cross-Account Shared Device Isolation**: When Account B registers or authenticates on a shared device (e.g., family iPad, clinic kiosk), any token linked to previous Account A on that device is instantly revoked, eliminating cross-account leakage.
4. **Device Logout Invalidation**: Logging out of a device immediately deactivates push delivery to that device.
5. **Zero-PHI Push Scrubbing**: Raw diagnoses, medications, lab values, or vitals are strictly forbidden in push payloads. Only concise, generic notices ("New medical update available") and protected deep links are delivered.
6. **Authentication & RBAC Route Protection**: Sensitive clinical data can only be viewed after explicit authentication and role-based authorization in the web portal.
7. **Quiet Hours & Emergency Bypass**: Non-urgent notifications respect user quiet hours and timezones; urgent clinical alerts immediately bypass quiet hours.

---

## 2. Token Lifecycle & Consent State Machine

```
              ┌───────────────────────────┐
              │ User denies consent       │ ──> [400 CONSENT_REQUIRED]
              └───────────────────────────┘
                            │ (consent: true)
                            ▼
              ┌───────────────────────────┐
              │   ACTIVE SUBSCRIPTION     │
              │ (userId, deviceId, token) │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │ (Device Logout)   │ (Account Switch)  │ (TTL Expiry / 60d)
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ REVOKED_LOGOUT│   │REVOKED_SWITCH │   │EXPIRED_PURGED │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 2.1 Consent Enforcement
- Every push subscription registration (`POST /api/notifications/push-subscription`) requires `consent: true`.
- If `consent` is false, null, or missing, the API rejects the request with code `CONSENT_REQUIRED`.
- Consent records store IP address, user agent, granted timestamp, and revocation capability.

### 2.2 Cross-Account Shared Device Isolation
- Clinics and households often share tablets or computers.
- If Device `D1` was previously registered to Patient Ahmed, and Patient Hossam subsequently signs in on Device `D1`, `pushNotificationService` immediately detects device collision:
  ```javascript
  // Previous registration on device D1 is invalidated
  existingSub.status = 'revoked';
  existingSub.revokedReason = 'ACCOUNT_SWITCHED_ON_DEVICE';
  ```
- Any subsequent notification dispatched to Patient Ahmed will **never** trigger Device `D1`.

### 2.3 Logout Invalidation
- When a user signs out (`POST /api/auth/logout`), the client sends its current `deviceId`.
- The backend revokes the active push token for that device immediately, preventing notification delivery to a logged-out device.

---

## 3. Zero-PHI Payload Scrubbing & Concise Messaging

Under healthcare confidentiality standards, lock-screen notifications can be viewed by anyone in physical proximity to the device. Therefore, push notifications **must never** contain Protected Health Information (PHI).

| Event Type | Unsafe Payload (FORBIDDEN) | Sanitized Payload (ENFORCED) | Destination |
| :--- | :--- | :--- | :--- |
| **Result Ready** | "Patient has severe COPD with SpO2 84%. Prescribed Prednisolone." | **Title:** "Health Vibe: New medical update available"<br>**Body:** "A clinical assessment report has been updated. Sign in to review your results securely." | `/app/index.html?screen=report&caseId=...` |
| **Escalation / Emergency** | "Critical oxygen desaturation detected (SpO2 < 88%). Seek emergency room." | **Title:** "Health Vibe: Urgent Clinical Alert"<br>**Body:** "An urgent update requires your immediate attention. Please sign in to the portal now." | `/app/index.html?screen=emergency&caseId=...` |
| **Appointment Reminder** | "Consultation for Chronic Respiratory Disease on Oct 5 with Dr. Mona." | **Title:** "Health Vibe: Upcoming Appointment Reminder"<br>**Body:** "You have a scheduled clinical consultation. Open the app to view details." | `/app/index.html?screen=appointments&id=...` |
| **More Info Requested** | "Doctor requested sputum culture report and chest CT." | **Title:** "Health Vibe: Action Required"<br>**Body:** "Your care team requested additional clinical information. Please open your secure inbox." | `/app/index.html?screen=chat&caseId=...` |

### 3.1 Content Access Authentication Gate
- Destination URLs generated in the push notification point to `/app/index.html?screen=...`.
- If an unauthenticated user or an unauthorized third party accesses the destination URL or clinical API (`GET /api/notifications` or `/api/cases/:id`), the backend returns `401 Unauthorized` or `403 Forbidden`.
- The user must provide a valid session token (via secure HTTP-only cookies or Bearer JWT) to load clinical reports.

---

## 4. Quiet Hours & Urgent Bypass Architecture

The push notification service integrates with `getUserNotificationPreferences`:
1. **User Channel Muting**: If `preferences.channels.push === false`, dispatches are suppressed with `CHANNEL_DISABLED`.
2. **Quiet Hours Evaluation**: When quiet hours are enabled (e.g., 22:00 to 08:00 in user's IANA time zone), non-urgent notifications are deferred with status `QUIET_HOURS_ACTIVE` and a calculated `resumeAt` timestamp.
3. **Urgent Escalation Override**: If an event has `urgent: true`, `priority: 'critical'`, or `eventType: 'escalation'`, quiet hours are **bypassed immediately** with `bypassedQuietHours: true` to ensure critical patient care delivery.

---

## 5. REST API Specifications

### 5.1 Register Push Subscription
- **Endpoint**: `POST /api/notifications/push-subscription`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "token": "fcm_token_device_abc123",
    "deviceId": "dev_pixel_9_pro",
    "platform": "android",
    "browser": "Chrome Mobile",
    "consent": true
  }
  ```
- **Responses**:
  - `201 Created`: Subscription registered and active.
  - `400 Bad Request`: Missing token, deviceId, or consent.
  - `401 Unauthorized`: Unauthenticated request.

### 5.2 Revoke Push Subscription
- **Endpoint**: `DELETE /api/notifications/push-subscription`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "deviceId": "dev_pixel_9_pro",
    "token": "fcm_token_device_abc123"
  }
  ```
- **Responses**:
  - `200 OK`: Subscription revoked.
  - `400 Bad Request`: Neither `deviceId` nor `token` provided.

### 5.3 User Logout & Device Token Invalidation
- **Endpoint**: `POST /api/auth/logout`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "deviceId": "dev_pixel_9_pro"
  }
  ```
- **Responses**:
  - `200 OK`: User logged out and device push token revoked.

---

## 6. Verification & Automated Test Coverage

The test suite `tests/push_notifications_and_account_switching_governance.test.js` exercises all scenarios:
- **Test 1**: Explicit user consent requirement (`consent: true` enforced; refusal rejected).
- **Test 2**: Multi-device management and independent device revocation.
- **Test 3**: Token TTL expiration and automatic cleanup.
- **Test 4**: Cross-account shared device isolation (User A token revoked when User B registers).
- **Test 5**: Device logout token invalidation.
- **Test 6**: Zero-PHI payload scrubbing (diagnoses, medications, and vitals scrubbed).
- **Test 7**: Route guards on deep-link clinical content (unauthenticated requests return 401).
- **Test 8**: User preferences and quiet hours calculation with urgent clinical escalation bypass.
- **Test 9**: Express REST API endpoints validation.
