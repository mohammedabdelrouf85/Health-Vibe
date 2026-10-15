# Health Vibe AI: WhatsApp, OTP & Messaging Governance Specification

> **Official Architecture & Security Standard — Health Vibe AI Platform**  
> *Compliant with Meta WhatsApp Cloud API Guidelines, HIPAA Administrative Safeguards, and Anti-Abuse Standards*

---

## 1. Executive Summary

This document specifies the server-side architecture, provider configuration, security lifecycle, and delivery governance for **WhatsApp Business Messaging and One-Time Password (OTP) verification** within the **Health Vibe AI** platform.

### Core Principles
1. **Multi-Provider Architecture**: Direct integration with **Meta WhatsApp Business Cloud API (Graph API v20.0)** as the primary tier, **Twilio WhatsApp API** as secondary failover, and a deterministic **Sandbox Provider** for automated test suites and local development.
2. **Zero Code Disclosure**: OTP codes are cryptographically generated and stored exclusively as salted **HMAC-SHA256** digests. Plaintext codes are **never** returned in API responses, audit trails, server logs, or delivery records.
3. **Strict Expiration & Attempt Limits**: 5-minute (300 seconds) Time-To-Live (TTL); maximum of 5 verification attempts per code before immediate revocation and caller lockout.
4. **Anti-Replay / Code Reuse Prevention**: Upon successful verification, the code hash is permanently marked as consumed and deleted from active registries. Subsequent attempts with the identical code are strictly refused.
5. **Abuse & Rate-Limiting Engine**: 60-second request cooldown, maximum 5 requests/hour per phone, 10 requests/24h per phone, 15 requests/hour per IP address, and in-flight mutex deduplication.
6. **Messaging Consent & Channel Preferences**: Explicit opt-in tracking with timestamps, IP logging, and category-based gating (Transactional Security OTP vs. Appointment Reminders vs. Clinical Reports vs. Marketing).
7. **Security Isolation (Phone vs. Email / Identity)**: Phone verification verifies possession of the mobile number (`phoneVerified: true`). It **strictly does NOT** substitute for email verification (`emailVerified`), doctor licensing, or syndicate credential reviews.

---

## 2. Provider Selection & Configuration

```
                             ┌──────────────────────────────────────┐
                             │       Health Vibe AI Server          │
                             │      (backend/whatsapp-bot.js)       │
                             └──────────────────┬───────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
    ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
    │   Meta WhatsApp Cloud    │   │      Twilio WhatsApp     │   │     Sandbox Provider     │
    │   API v20.0 (Primary)    │   │   (Secondary / Failover) │   │     (CI/CD & Testing)    │
    └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

### 2.1 Provider Selection Priority
* If `process.env.WHATSAPP_PROVIDER === 'sandbox'` or `NODE_ENV === 'test'` → **Sandbox Provider**.
* If `process.env.WHATSAPP_PROVIDER === 'twilio'` → **Twilio WhatsApp API**.
* Default (Production) → **Meta WhatsApp Business Cloud API**.

### 2.2 Environment Configuration Schema

| Environment Variable | Provider | Purpose | Security Policy |
| :--- | :--- | :--- | :--- |
| `WHATSAPP_PROVIDER` | Core | `'meta_cloud'`, `'twilio'`, or `'sandbox'` | Set in `.env.[env]` |
| `WHATSAPP_API_TOKEN` | Meta | Permanent System User Access Token | Encrypted Secret; Never logged |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta | 15-digit sender telephone ID | Public Meta Asset Identifier |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta | WABA (WhatsApp Business Account) ID | Management Asset Identifier |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`| Meta | Handshake token for webhook challenge | Shared Secret |
| `WHATSAPP_APP_SECRET` | Meta | For `X-Hub-Signature-256` webhook validation| Cryptographic Secret |
| `TWILIO_ACCOUNT_SID` | Twilio | Account SID | Masked in admin inspects |
| `TWILIO_AUTH_TOKEN` | Twilio | Auth Token for Basic Auth | Encrypted Secret |
| `TWILIO_WHATSAPP_FROM` | Twilio | Registered sender (`whatsapp:+14155238886`) | E.164 phone string |
| `OTP_HASH_SECRET` | Core | HMAC secret key for OTP digests | 256-bit entropy secret |

---

## 3. Server-Side OTP Security Lifecycle

### 3.1 Code Generation & Hashing
```javascript
const code = crypto.randomInt(100000, 1000000).toString(); // 6 digits
const codeHash = crypto
  .createHmac('sha256', process.env.OTP_HASH_SECRET)
  .update(`${userId}:${cleanPhone}:${code}`)
  .digest('hex');
```
* The plaintext code is passed only to the transport provider for immediate dispatch.
* Active storage (`activeOtps`) stores only: `{ codeHash, expiresAt, createdAt, attempts, phoneNumber, deliveryId }`.

### 3.2 Response Sanitization (No Code Disclosure)
```json
{
  "success": true,
  "expiresInSeconds": 300,
  "retryAfterSeconds": 60,
  "provider": "meta_cloud",
  "maskedPhone": "+201 **** 5678",
  "message": "تم إرسال كود التفعيل السري تلقائياً عبر بوت الواتساب."
}
```
* The secret code is **strictly omitted** from the response payload.

### 3.3 Verification Rules
1. **Format Validation**: Exactly 6 numeric digits.
2. **Anti-Replay**: Check `consumedOtps`. If code hash was already used, reject with `CODE_ALREADY_USED`.
3. **Existence**: If no record in `activeOtps`, reject with `CODE_NOT_FOUND`.
4. **TTL Expiration**: If `now > record.expiresAt`, delete record and reject with `CODE_EXPIRED`.
5. **Phone Match**: Submitted phone must match `record.phoneNumber`.
6. **Attempt Limit**: Increment attempts. If `attempts >= 5` and mismatch, immediately revoke code and reject with `TOO_MANY_FAILED_ATTEMPTS`.
7. **Timing-Safe Match**: Evaluate using `crypto.timingSafeEqual()`.
8. **Consumption**: On valid match, delete from `activeOtps` and register in `consumedOtps` (retained for 60 minutes) to prevent replay.

---

## 4. Abuse Prevention & Quotas

| Control Layer | Threshold | Action on Violation |
| :--- | :--- | :--- |
| **Request Cooldown** | 60 seconds per phone / user | `429 OTP_RATE_LIMITED` with `retryAfterSeconds` header |
| **In-Flight Lock** | 1 concurrent request per phone | `429 CONCURRENT_REQUEST_BLOCKED` |
| **Hourly Phone Quota** | Max 5 requests per 60 minutes | `429 HOURLY_RATE_LIMIT_EXCEEDED` with wait minutes |
| **Daily Phone Quota** | Max 10 requests per 24 hours | `429 DAILY_RATE_LIMIT_EXCEEDED` |
| **IP Address Quota** | Max 15 requests per 60 minutes | `429 IP_RATE_LIMIT_EXCEEDED` |
| **Verification Lockout** | 5 consecutive wrong submissions | Code revoked + 15-minute verification lockout |

---

## 5. Messaging Consent & Channel Preferences

### 5.1 Consent Record Schema
```javascript
{
  userId: "patient_123",
  phoneNumberMasked: "+201 **** 5678",
  phoneNumberHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  consentGiven: true,
  consentTimestamp: "2026-10-01T14:40:00.000Z",
  consentIp: "197.100.20.10",
  channels: {
    whatsapp: true,
    sms: false,
    email: true
  },
  categories: {
    security_otp: true,          // Transactional exemption: user-initiated
    appointment_reminders: true, // Requires opt-in consent
    clinical_reports: true,      // Requires opt-in consent
    triage_followups: true,      // Requires opt-in consent
    marketing: false             // Default opt-out
  }
}
```

### 5.2 Category Gating Engine
* **`security_otp`**: Transactional, user-initiated authentication codes are permitted without prior marketing consent.
* **`appointment_reminders` & `clinical_reports`**: Checked against `canSendNotification()`. If consent is absent or channel is toggled off, dispatch is blocked with `CONSENT_REQUIRED` or `CHANNEL_DISABLED_BY_USER`.

---

## 6. Delivery Records Ledger & Webhook Reconciliation

### 6.1 Record Attributes
* `recordId`: Unique internal audit identifier (`del_...`).
* `messageId`: Provider message tracking identifier (`wamid....`, `SM...`, or `sand_...`).
* `recipientMasked`: Masked phone number (`+201 **** 5678`).
* `recipientHash`: One-way SHA-256 digest of phone for index search without leaking PII.
* `provider`: `'meta_cloud'`, `'twilio'`, or `'sandbox'`.
* `templateName`: Name of registered template.
* `status`: `'queued'`, `'sent'`, `'delivered'`, `'read'`, `'failed'`.
* `dispatchLatencyMs`: Round-trip provider network execution duration.
* `errorReason`: Sanitized provider error reason.

### 6.2 Webhook Status Handshake & Updates
* Handshake endpoint: `GET /api/bot/webhook?hub.mode=subscribe&hub.challenge=...`
* Status event handler: `POST /api/bot/webhook` reconciles incoming status transitions (`sent` → `delivered` → `read` or `failed`) and updates the delivery records ledger.

---

## 7. Sandbox Testing Controls

The sandbox provider provides complete simulation of all network conditions without external API overhead:

```javascript
// Simulate network latency (e.g. 150ms)
whatsappBot.setSandboxMode({ enabled: true, simulateDelayMs: 150 });

// Simulate provider outage (HTTP 503)
whatsappBot.setSandboxMode({
  enabled: true,
  simulateFailure: true,
  failReason: 'META_SERVICE_UNAVAILABLE_503'
});

// Reset to clean sandbox state
whatsappBot.resetSandbox();
```

---

## 8. Strict Security Isolation (Phone vs. Email & Identity)

> [!CAUTION]
> **Phone verification is NOT a substitute for Email or Identity verification.**

1. **Email Independence**: When `/api/bot/verify-code` succeeds:
   - Sets `phoneVerified: true`, `phoneVerifiedAt`, and `phoneNumber`.
   - **Does NOT** set `emailVerified: true` in Firestore or Firebase Auth.
   - Email verification must still be completed via the designated email verification loop.
2. **Doctor Licensing Protection**: Phone verification **under no circumstances** approves a doctor application, updates `doctorApplicationStatus`, or alters medical syndicate licensing standing.
