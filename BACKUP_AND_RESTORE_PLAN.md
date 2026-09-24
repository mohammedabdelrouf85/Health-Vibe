# 🛡️ Health Vibe AI - Enterprise Clinical Backup & Disaster Recovery (DR) Plan

**Version:** 1.0.0  
**Status:** Approved & Implemented  
**Classification:** Restricted / Compliance & Clinical Operations  
**Compliance Standards:** HIPAA Security Rule (§ 164.308(a)(7)), GDPR (Article 32), ISO 27001  

---

## 1. Executive Summary & Objectives

Health Vibe AI provides critical clinical respiratory assessment and certified physician reporting. Data availability, zero-loss durability, and rapid disaster recovery are fundamental to patient safety and clinical continuity.

This Disaster Recovery & Backup Plan defines the architectural policies, automated procedures, and technical mechanisms for:
1. Continuous data replication and Point-In-Time Recovery (PITR).
2. Automated daily and weekly cold backups across multi-region storage.
3. Rapid disaster recovery (DR) failover with strict SLA boundaries.
4. Cryptographic integrity verification via SHA-256 manifests.
5. Strict auditability of all backup and restoration actions.

---

## 2. Recovery Objectives (RPO & RTO)

| Metric | Target | Description | Technical Implementation |
| :--- | :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **< 15 minutes** (Operational DB)<br>**0 minutes** (Certified Reports) | Maximum acceptable data loss window during a catastrophic regional outage. | Cloud Firestore Point-In-Time Recovery (PITR) with continuous incremental transaction logging. |
| **RTO (Recovery Time Objective)** | **< 30 minutes** | Maximum allowable downtime before full clinical assessment services are restored. | Automated multi-region cold failover scripts and server-authoritative snapshot restoration. |
| **Data Retention** | **7 Years** | Mandatory retention period for medical diagnosis, clinical triage, and certified reports. | Multi-tier Cloud Storage: Hot (30d) -> Nearline (1y) -> Coldline/Archive (7y). |

---

## 3. Data Scopes & Classifications

The backup architecture encompasses four discrete clinical and operational tiers:

```
+--------------------------------------------------------------------------------+
|                        HEALTH VIBE AI DATA ECOSYSTEM                           |
+--------------------------------------------------------------------------------+
        |                                                                |
        v                                                                v
[1. Cloud Firestore Databases]                          [2. Cloud Storage Media]
 - /users (Profiles & Roles)                             - Certified PDF Clinical Reports
 - /cases (Triage, Audio, AI diagnosis)                  - Patient Audio Recordings
 - /appointments (Schedules & Slots)                     - Electronic Signatures
 - /feedbacks (Quality metrics)                                  |
 - /audit_events (Immutable logs)                                v
 - /email_notifications (Dispatch logs)                 [3. Identity & Auth]
                                                         - Firebase Auth User Registry
                                                         - Custom Claims & Tokens
```

1. **Transactional Clinical Database (Cloud Firestore):**
   - Collections: `cases`, `users`, `appointments`, `feedbacks`, `audit_events`, `email_notifications`.
   - Backup Type: Firestore Managed Export + PITR (continuous logging up to 7 days).
2. **Clinical Digital Assets (Cloud Storage):**
   - Media: Patient breathing audio, certified PDF doctor reports, clinical signatures.
   - Backup Type: Multi-region object versioning (`versioning: Enabled`) and cross-region bucket replication.
3. **Authentication & Identity Directory (Firebase Auth):**
   - Accounts: Passwords (scrypt-hashed), custom claims (roles: `doctor`, `clinic_admin`, `super_admin`).
   - Backup Type: Daily automated user export (`firebase auth:export`).
4. **Configuration & Infrastructure as Code:**
   - Security Rules: `firestore.rules`, `storage.rules`.
   - App Configuration: Environment variables, CORS policies, App Check secrets.
   - Backup Type: Version-controlled Git repository with cryptographic release tags.

---

## 4. Architectural Protection Mechanisms

### 4.1. Point-In-Time Recovery (PITR)
- Firestore Point-In-Time Recovery (PITR) is enabled across all production instances.
- Allows granular database restoration to **any second** within the trailing 7 days.
- Mitigates accidental database truncation, developer error, or malicious tampering within minutes.

### 4.2. Multi-Region Geo-Redundancy
- Operational database resides in GCP multi-region configuration (`us-central` or `eur3`).
- Daily snapshots are automatically mirrored to an isolated, geographically distinct cold bucket:
  `gs://health-vibe-backups-{region}/`
- Bucket access is strictly locked with GCP Object Locking / Bucket Retention Policy (WORM - Write Once, Read Many).

### 4.3. Encryption at Rest & In Transit
- All backup archives are encrypted at rest using **AES-256** (FIPS 140-2 validated).
- Optional support for Customer-Managed Encryption Keys (**CMEK**) using Google Cloud KMS.
- All network transit during backup and restore enforces **TLS 1.3** and strict HMAC tokens.

---

## 5. Automated Backup Engine (SHA-256 Manifest)

Every generated backup bundle produces a cryptographic manifest:

```json
{
  "backupId": "backup_2026-09-25T01-00-00Z_7x9a",
  "version": "1.0.0",
  "environment": "production",
  "initiator": "automated_cron | admin_uid",
  "timestamp": "2026-09-25T01:00:00.000Z",
  "collections": {
    "users": 1420,
    "cases": 5890,
    "appointments": 412,
    "feedbacks": 350,
    "audit_events": 12400,
    "email_notifications": 4800
  },
  "totalRecords": 25272,
  "archiveFormat": "ndjson.gz",
  "checksum": {
    "algorithm": "SHA-256",
    "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "pitrWindowStart": "2026-09-18T01:00:00.000Z"
}
```

---

## 6. Restoration Procedures & Disaster Recovery Runbook

```
                         [ Catastrophic Event Detected ]
                                       |
                                       v
                   [ 1. Declare Disaster Recovery Mode ]
                   - Activate DR Team (Owner, Lead Admin)
                   - Switch DNS to Maintenance Status Page
                                       |
                                       v
                   [ 2. Validate Backup Integrity ]
                   - Pull latest snapshot from cold storage
                   - Verify SHA-256 manifest hash against recorded audit log
                   - Verify PITR availability if granular point recovery is needed
                                       |
                                       v
                   [ 3. Execute Sandbox Validation (Dry-Run) ]
                   - Restore snapshot into isolated Staging/Emulator instance
                   - Execute automated integrity & RBAC test suite (`npm test`)
                   - Validate schema invariants: cases, users, appointments
                                       |
                                       v
                   [ 4. Restore to Production Database ]
                   - Issue server-authoritative restore with confirmation token
                   - Apply delta transaction logs via PITR
                   - Verify system counts and database consistency
                                       |
                                       v
                   [ 5. Post-Recovery Verification & Health Check ]
                   - Run `/api/health` and verify all collections accessible
                   - Conduct doctor triage test and report download verification
                   - Log DR resolution event in `audit_events`
                   - Re-enable live production routing
```

### Safety Restraints on Restoration:
- **No Blind Overwrite:** Restoring requires an explicit server-side confirmation token (`CONFIRM_RESTORE_<BACKUP_ID>`).
- **Audit Logging:** Every restore operation writes a high-priority `DATABASE_RESTORE_EXECUTED` event to the immutable audit trail.
- **Dry-Run Validation:** Restoration scripts support a `--dry-run` flag to verify archive contents without mutating the live datastore.

---

## 7. DR Testing Drills & Maintenance Schedule

| Cadence | Exercise | Responsible Role | Success Criteria |
| :--- | :--- | :--- | :--- |
| **Daily** | Automated Snapshot Export & Integrity Hash Check | Automated Service | Backup generated, SHA-256 verified, 0 errors. |
| **Monthly** | Cold Storage Restore Drill in Staging Sandbox | Lead DevOps / Admin | Full restore executed within < 20 minutes; 100% test pass. |
| **Quarterly** | Unannounced Tabletop Disaster Failover Simulation | System Owner & Clinical Lead | Complete end-to-end failover to standby region within RTO. |
| **Annually** | Comprehensive HIPAA & Security Audit Review | Chief Medical Officer & Security Auditor | Formal certification of backup logs and compliance records. |

---

## 8. Summary of API Endpoints

- `POST /api/admin/backup/create`: Generates an on-demand clinical snapshot with SHA-256 hash.
- `GET /api/admin/backup/list`: Lists available snapshots, record counts, and status.
- `POST /api/admin/backup/verify`: Cryptographically validates snapshot integrity against corruption or tampering.
- `POST /api/admin/backup/restore`: Executes a staged or live restoration guarded by authentication and confirmation tokens.
