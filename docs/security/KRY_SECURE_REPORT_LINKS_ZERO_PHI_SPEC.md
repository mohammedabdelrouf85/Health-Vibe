# 🛡️ Kry Benchmark: Secure Report Links & Zero-PHI Messaging Specification

## 1. Executive Summary & Regulatory Context
Under the **Kry Telehealth benchmark** (Sweden / European Union GDPR Health Data standard & HIPAA Security Rule § 164.312), sending raw Protected Health Information (PHI) — including clinical diagnoses, prescribed medications, spirometry data, or oxygen saturation metrics — via unencrypted SMS, email, or messaging channels is strictly prohibited.

Instead, the system issues **cryptographically signed, time-limited, tamper-evident portal access URLs** (`Signed URLs`) coupled with a **Zero-Trust Patient Identity Verification Gate**. The patient receives a zero-PHI SMS or notification directing them to sign in to their encrypted personal health portal before any medical finding or prescription is decrypted and displayed.

---

## 2. Core Architecture & Threat Model

```
       +-------------------------------------------------------+
       |   Attending Pulmonologist Approves Clinical Report    |
       +-------------------------------------------------------+
                                   |
                                   v
             +-------------------------------------------+
             | SecureReportLinkService (HMAC-SHA256)     |
             |  • Payload: { caseId, patientId, exp, ...}|
             |  • Secret: CLINICAL_LINK_SIGNING_SECRET   |
             |  • Expiry: 48 Hours Default TTL           |
             +-------------------------------------------+
                                   |
                  +----------------+----------------+
                  |                                 |
                  v                                 v
       +-----------------------+       +-------------------------+
       | Zero-PHI SMS Notice   |       | Zero-PHI Email Notice   |
       |  "Report is certified |       |  "Certified report ready|
       |   Sign in to view:    |       |   Doctolib & Kry Seal   |
       |   [Signed Short URL]" |       |   [Signed Portal URL]"  |
       +-----------------------+       +-------------------------+
                  |                                 |
                  +----------------+----------------+
                                   |
                  Patient clicks signed link on device
                                   |
                                   v
             +-------------------------------------------+
             | HealthVibe Web Application / Auth Gate    |
             +-------------------------------------------+
                                   |
                        Is Patient Signed In?
                       /                     \
                     NO                       YES
                     /                         \
         Prompt Login/Auth        Validate Identity (UID == pid):
                                   - Token Signature: Valid?
                                   - Token Expiry: Not Expired?
                                   - Patient UID matches pid?
                                     /                    \
                                  MATCH                MISMATCH
                                   /                        \
                        Display Official Certified    Render Kry Security
                        Report with Kry Badge          Access Denied Banner
```

---

## 3. Cryptographic Token Design & Mathematical Specification

Each token is composed of two base64url-encoded components separated by a period:
$$\text{Token} = \text{base64url}(\text{Payload}) \,.\, \text{HMAC-SHA256}_{K}(\text{Canonical String})$$

Where:
- $\text{Payload} = \{\text{caseId}, \text{patientId}, \text{reportRef}, \text{issuedAt}, \text{expiresAt}, \text{nonce}\}$
- $\text{Canonical String} = \text{caseId} \,:\, \text{patientId} \,:\, \text{reportRef} \,:\, \text{issuedAt} \,:\, \text{expiresAt} \,:\, \text{nonce}$
- $K = \text{CLINICAL\_LINK\_SIGNING\_SECRET}$ (fallback: high-entropy server master key)
- $\text{TTL} = 48 \text{ hours}$ (enforced via `expiresAt`)

Verification enforces constant-time comparison via `crypto.timingSafeEqual` to eliminate timing side-channel attacks.

---

## 4. Zero-PHI SMS & Notification Guarantees

### Approved SMS Template (Arabic):
> "Health Vibe AI: مرحباً [اسم المريض]، تم اعتماد تقرير فحصك الطبي #[رقم التقرير] وهو متاح الآن في ملفك الصحي المشفر. يتطلب عرض التقرير تسجيل الدخول عبر الرابط الآمن: https://healthvibes.app/#screen-report?caseId=...&token=... (صالح لمدة 48 ساعة). لا تشارك الرابط مع أحد."

### Approved SMS Template (English):
> "Health Vibe AI: Hello [Patient Name], your certified clinical report #[Report Ref] is ready in your encrypted portal. Login is strictly required to view: https://healthvibes.app/#screen-report?caseId=...&token=... (Valid for 48h). Do not share this link."

### Prohibited Content (Purged at Notification Layer):
1. **Diagnosis**: No mention of conditions like pneumonia, COPD, asthma, or bronchitis.
2. **Medications**: No prescription names, dosages, or instructions (e.g. Ventolin, Augmentin).
3. **Vitals**: No numbers for oxygen saturation ($SpO_2$), pulse rate, or respiratory rate.
4. **Clinical Notes**: No raw doctor impressions or triage scores.

---

## 5. Zero-Trust Identity Guard Matrix

| Scenario | Token Status | Logged-in User | Outcome | HTTP Status / UI |
|---|---|---|---|---|
| Authorized Patient | Valid & Active | `user.uid == token.patientId` | **Granted** | Certified Report Displayed with Kry Security Badge |
| Imposter / Other Patient | Valid & Active | `user.uid != token.patientId` | **Access Denied** | Kry Identity Mismatch Panel ("Locked to different patient account") |
| Anonymous User | Valid & Active | Not Authenticated | **Prompt Auth** | Login Screen with redirect back to report |
| Expired Token | Expired (> 48h) | Any | **Access Denied** | `LINK_EXPIRED` Error Panel |
| Tampered URL / Signature | Modified | Any | **Access Denied** | `INVALID_SIGNATURE` Error Panel |
| Attending Doctor / Admin | Valid & Active | Clinician Role | **Granted** | Authorized Clinical Review Access |

---

## 6. Implementation Files
- **Backend Service**: `backend/secure-report-link-service.js`
- **Server Endpoints**: `backend/server.js` (`POST /api/reports/generate-secure-link`, `POST /api/reports/verify-secure-link`)
- **Notification Integration**: `backend/notification-service.js` (`buildResultReadyEmail`, `sendClinicalNotificationEmail`)
- **Frontend Identity Enforcement**: `app/app.js` (`renderReportScreen` URL param parsing, Kry shield banner, and mismatch modal)
- **Unit & Integration Tests**: `tests/kry_secure_report_links.test.js` (12 passing tests)
