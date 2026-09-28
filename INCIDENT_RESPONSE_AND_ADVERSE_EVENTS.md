# Health Vibes AI - Incident Response & Clinical Adverse Event Procedures

**Document Version:** 1.0.0  
**Effective Date:** 2026-09-29  
**Review Cycle:** Semi-Annual  
**Classification:** Confidential - Health Vibes Clinical & Security Operations  
**Compliance Parity:** ISO/IEC 27035, NIST SP 800-61 Rev. 2, HIPAA Security Rule (§ 164.308), Egyptian Personal Data Protection Law (Law 151/2020), Good Clinical Governance Standards.

---

## 1. Executive Governance & RACI Framework

| Role | Key Responsibilities | Primary Contact |
|---|---|---|
| **Incident Commander (IC)** | Directs security and technical containment, assigns task owners, approves recovery plans. | `security@healthvibe.ai` |
| **System Owner (SO)** | Authorizes cross-system shutdowns, credential revocations, and major policy decisions. | `badr46694@gmail.com` |
| **Clinical Safety Lead (CMO)** | Evaluates clinical adverse events, incorrect medical content, halts AI triage engines. | Clinical Lead |
| **Data Protection Officer (DPO)** | Directs statutory breach notifications, legal compliance, and regulatory submissions. | `privacy@healthvibe.ai` |
| **Lead Infrastructure Engineer** | Executes rollbacks, database restoration, firewall configurations, and failovers. | DevOps / SRE Team |

---

## 2. Severity Classification Matrix

| Severity | Operational Definition | Response SLA | Executive Escalation |
|---|---|---|---|
| **P0 / Sev-1 (Critical)** | Active credential compromise of admin/owner; mass PHI leak; total service outage; incorrect clinical advice presenting immediate patient hazard. | $\le 15\text{ mins}$ | Immediate emergency bridge: IC, SO, CMO, DPO. |
| **P1 / Sev-2 (High)** | Single clinic data leak; critical feature failure (triage offline); isolated incorrect medical report discovered before patient action. | $\le 1\text{ hour}$ | Alert IC, CMO, and System Owner within 30 min. |
| **P2 / Sev-3 (Medium)** | Intermittent high latency ($p95 > 2\text{s}$); non-PHI telemetry leak; localized doctor dashboard error. | $\le 4\text{ hours}$ | Security & Reliability team daily standup. |
| **P3 / Sev-4 (Low)** | Minor cosmetic bug, localized UI error with zero clinical or security impact. | Next Sprint | Standard ticketing. |

---

## 3. Practical Procedure 1: System & Credential Compromise

### 3.1 Ownership
- **Primary Owner:** Lead Security Engineer (Incident Commander).
- **Executive Approver:** System Owner (`badr46694@gmail.com`).

### 3.2 Escalation Workflow
1. Automated alert triggered via `INCREASED_FAILURES`, anomalous IP/subnet login (`session_management_security`), or suspicious custom claim modification.
2. IC opens an Incident record in the **Incident Register** (`inc_<timestamp>_<hash>`).
3. If admin credentials or Firebase service accounts are implicated, immediately escalate to **Sev-1**.

### 3.3 Evidence Preservation
1. **Freeze Audit Trail:** Snapshot Firestore `audit_events` and append-only disk logs.
2. **Cryptographic Fingerprinting:** Generate SHA-256 hash of server memory state, session caches (`activeUserSessions`), and access logs. Store hashes in `.deployments/incident-evidence/`.
3. **Capture Forensic Context:** Record offending IP addresses, subnet masks, User-Agents, incoming `traceId` correlation tags, and Firebase UID.
4. **Zero-Destruction Rule:** Do not delete compromised accounts or modify database documents directly; set `disabled: true`, `status: 'suspended'`, or increment `authzVersion`.

### 3.4 Containment & Recovery
1. **Universal Token Invalidation:** Execute server-authoritative revocation:
   ```javascript
   await admin.auth().revokeRefreshTokens(compromisedUid);
   await db.collection('users').doc(compromisedUid).update({
     authzVersion: admin.firestore.FieldValue.increment(1),
     suspended: true
   });
   ```
2. **Rotate Secrets:** Rotate Firebase Service Account keys, JWT signing keys, and external API keys (`WHATSAPP_API_TOKEN`, `SMTP_PASS`, `GEMINI_API_KEY`).
3. **IP Blacklisting & Firewall Hardening:** Update cloud firewall rules to deny source IPs identified in forensic analysis.
4. **State Verification:** Run `npm run test:security` and `npm run test:session` to verify no lingering unauthorized sessions remain.

### 3.5 Communications
- **Internal:** Post containment status updates to private incident channel every 30 minutes.
- **External Partners:** If clinic admin credentials were breached, notify clinic director within 2 hours.
- **Post-Mortem:** Deliver formal Root Cause Analysis (RCA) within 5 business days.

---

## 4. Practical Procedure 2: Data Leaks & PHI Breaches

### 4.1 Ownership
- **Primary Owner:** Data Protection Officer (DPO) & Lead Security Engineer.

### 4.2 Escalation Workflow
1. Identify exposure source (e.g. public Cloud Storage bucket, unauthorized API response, logging of unmasked PHI).
2. Triage exposed data categories:
   - Level A: Clinical diagnoses, SpO2, doctor consultation notes.
   - Level B: National ID numbers, full patient names, phone numbers.
   - Level C: Anonymized triage metrics, technical error telemetry.
3. If Level A or B data is accessed by unauthorized actors, classify as **Sev-1 Data Breach**.

### 4.3 Evidence Preservation
1. **Preserve Access Logs:** Capture GCP Cloud Storage object access logs and HTTP request logs matching affected resource paths (`case_files/*`, `/api/patient/*`).
2. **Record Blast Radius:** Document exact count of affected patient records, matching document IDs, and access timestamps in the Incident Register.
3. **Chain of Custody:** Hash and store forensic logs into an isolated storage container accessible only to the DPO and legal counsel.

### 4.4 Containment & Recovery
1. **Instant Access Severing:** Revoke public URLs, enforce strict Storage Rules (`storage.rules`), and terminate public read permissions.
2. **Quarantine Compromised Records:** Move affected files to quarantine state:
   ```javascript
   await db.collection('case_files').doc(fileId).update({
     availability: 'quarantined',
     quarantineReason: 'DATA_BREACH_CONTAINMENT'
   });
   ```
3. **Purge Cache & Endpoints:** Flush CDN caches, reset client cache headers, and purge server-side memory ring buffers.

### 4.5 Communications & Statutory Notifications
1. **Egyptian Data Protection Authority (EDPA) & Regulators:** If required by Law 151/2020, submit formal notification within **72 hours** detailing:
   - Nature of the breach and categories of affected data.
   - Measures taken to contain and mitigate the breach.
   - Contact details of DPO.
2. **Affected Patients:** Transparent notification provided via registered email and secure SMS, stating what data was exposed and corrective steps taken.

---

## 5. Practical Procedure 3: Service Outages & Cloud Failures

### 5.1 Ownership
- **Primary Owner:** Infrastructure Lead & Reliability Engineer (SRE).
- **Secondary Owner:** System Owner.

### 5.2 Escalation Workflow
1. Automatic alert dispatched from Monitoring Engine:
   - High Failure Rate Alert ($\ge 10\%$ errors across sliding window).
   - High Latency Alert ($p95 \ge 2000\text{ms}$).
   - Health Probe failure detected by `/api/monitoring/uptime`.
2. SRE confirms downtime and initiates Sev-1 bridge if core assessment or appointment workflows are blocked.

### 5.3 Evidence Preservation
1. Dump current in-memory error buffer via `GET /api/monitoring/errors/summary`.
2. Record node process resource usage (CPU, memory, active handles).
3. Export Cloud Functions and Cloud Run stdout/stderr logs for the 15-minute window surrounding the incident.

### 5.4 Recovery & Self-Healing
1. **Fast Rollback:** If triggered by recent deployment, execute one-click rollback:
   ```bash
   node scripts/rollback.js --env=staging # or production
   ```
2. **Circuit Breaker:** Automatically degrade non-critical services (background notification processing, analytics) to preserve clinical triage and appointment booking.
3. **Database Failover & Re-indexing:** In case of Firestore index lock or corruption, deploy verified indexes:
   ```bash
   npx firebase-tools deploy --only firestore:indexes
   ```
4. **Restore From Validated Snapshot:** If data corruption occurred, invoke Disaster Recovery plan (`BACKUP_AND_RESTORE_PLAN.md`) using SHA-256 verified snapshot.

### 5.5 Communications
1. **Live Status Banner:** Publish incident banner on `app/index.html` alerting users to scheduled recovery in progress.
2. **Clinic Notifications:** Send automated WhatsApp and email notification to active clinic dispatchers regarding offline fallback protocols.

---

## 6. Practical Procedure 4: Incorrect Medical Content & Clinical Adverse Events

### 6.1 Ownership
- **Primary Owner:** Chief Medical Officer (Clinical Lead).
- **Technical Co-Owner:** Lead AI / Backend Engineer.

### 6.2 Escalation Workflow
1. Triggered when:
   - Clinician flags an inaccurate risk score, SpO2 misinterpretation, or invalid triage advice.
   - Patient or doctor files report via `POST /api/incidents` with type `incorrect_medical_content`.
   - Automated discrepancy monitor detects rule score variance.
2. CMO escalates to **Clinical Sev-1** if patient safety is compromised, or **Clinical Sev-2** if captured prior to clinical action.

### 6.3 Evidence Preservation
1. **Freeze Complete Clinical Case Record:**
   - Case ID, patient baseline parameters (SpO2, heart rate, symptoms, duration).
   - Active triage rule engine version (`HealthVibe-Rules-v1.0`).
   - Prompt inputs, raw LLM completion, and traceId (`trc_*`).
   - Audit trail snapshot of clinician review status.
2. **Do Not Delete:** Lock the document with `status: 'clinically_quarantined'` to prevent alteration of forensic medical evidence.

### 6.4 Containment & Recovery
1. **Quarantine Report:** Immediately revoke patient visibility for the affected report:
   ```javascript
   await db.collection('clinical_reports').doc(reportId).update({
     visibility: 'quarantined',
     clinicalReviewStatus: 'under_investigation',
     quarantinedReason: 'SUSPECTED_INCORRECT_MEDICAL_CONTENT',
     quarantinedAt: admin.firestore.FieldValue.serverTimestamp()
   });
   ```
2. **Halt Flawed Model / Rule Version:** Fallback to deterministic triage engine; block flawed rule set version from processing further assessments.
3. **Clinical Re-Evaluation:** Qualified medical specialist conducts immediate manual case review and certifies a corrected report.
4. **Log into Clinical Review Register:** Append formal incident review entry in `CLINICAL_REVIEW_REGISTER.md`.

### 6.5 Communications
1. **Direct Patient Contact:** Reviewing clinician directly contacts patient by phone within 1 hour if clinical risk exists, clarifying correct medical guidance and emergency routing.
2. **Treating Clinic Notification:** Issue formal clinical correction memorandum to attending clinic staff.
3. **Regulatory Log:** Record in Health Vibes Clinical Governance Archive for quality assurance audit.

---

## 7. Incident & Adverse Event Verification Drill Schedule

To maintain continuous operational readiness, Health Vibes executes mandatory scheduled drills:

| Drill Type | Frequency | Target Objective | Success Criteria |
|---|---|---|---|
| **Credential Revocation & Account Compromise** | Quarterly | Invalidate sessions across all active tokens. | Complete token rejection $\le 60\text{s}$. |
| **Data Leak Containment** | Semi-Annual | Isolate exposed storage bucket and revoke tokens. | Quarantine achieved $\le 5\text{ mins}$. |
| **Service Outage & Rollback** | Monthly | Restore previous release via rollback script. | Recovery complete $\le 10\text{ mins}$. |
| **Clinical Content Retraction** | Quarterly | Retract report, notify patient, issue certified correction. | Patient outreach $\le 60\text{ mins}$. |
