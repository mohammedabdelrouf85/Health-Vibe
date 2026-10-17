# HealthVibe AI — Documentation Hub

Welcome to the central documentation repository for **HealthVibe AI**, the smart clinical respiratory assessment and chronic disease management platform.

This directory provides structured access to all technical specifications, clinical governance protocols, security standards, regulatory evaluations, and operational blueprints.

---

## 🗂️ Documentation Structure

```
docs/
├── architecture/      # System architecture, event models, and technical specifications
├── clinical/          # Clinical governance, question sets, safety registers, and medical rules
├── security/          # Penetration tests, RBAC specifications, encryption, and threat models
├── legal/             # Terms of service, privacy policy, medical disclaimer, and compliance
├── api/               # Stable API references, data schemas, and partner contracts
└── operations/        # Deployment runbooks, backup/restore plans, pilot records, and pitch materials
```

---

## 🏛️ 1. Architecture (`docs/architecture/`)

- [ARCHITECTURAL_EVALUATION_AND_ROADMAP.md](file:///docs/architecture/ARCHITECTURAL_EVALUATION_AND_ROADMAP.md) — Comprehensive technical roadmap and architectural evaluations.
- [CLINICAL_SCRIBE_AND_VISIT_ASSISTANT_ARCHITECTURE.md](file:///docs/architecture/CLINICAL_SCRIBE_AND_VISIT_ASSISTANT_ARCHITECTURE.md) — Ambient clinical scribe and consultation note assistant.
- [DOCTOR_APPROVED_CASE_FOLLOWUP_ARCHITECTURE.md](file:///docs/architecture/DOCTOR_APPROVED_CASE_FOLLOWUP_ARCHITECTURE.md) — Longitudinal patient follow-up architecture and scheduled notifications.
- [EXTERNAL_API_ABSTRACTION_AND_FALLBACK_SPEC.md](file:///docs/architecture/EXTERNAL_API_ABSTRACTION_AND_FALLBACK_SPEC.md) — Resilient third-party API gateway and circuit breaker specification.
- [LIGHT_DARK_MODE_MEDICAL_THEME_SPEC.md](file:///docs/architecture/LIGHT_DARK_MODE_MEDICAL_THEME_SPEC.md) — WCAG 2.1 AAA accessible theme system with medical tricolor risk tokens.
- [REASSURING_ML_LOADING_AND_ANTI_DOUBLE_SUBMIT_SPEC.md](file:///docs/architecture/REASSURING_ML_LOADING_AND_ANTI_DOUBLE_SUBMIT_SPEC.md) — UX guardrails preventing double submission and displaying reassuring triage feedback.

---

## 🩺 2. Clinical Governance & Protocols (`docs/clinical/`)

- [CLINICAL_GOVERNANCE_BRIEF.md](file:///docs/clinical/CLINICAL_GOVERNANCE_BRIEF.md) — Clinical advisory board mandate and medical oversight protocol.
- [CLINICAL_REPORT_INTEGRITY.md](file:///docs/clinical/CLINICAL_REPORT_INTEGRITY.md) — Mandatory specialist doctor approval, digital signatures, and tamper-evident SHA-256 seals.
- [CLINICAL_REVIEW_REGISTER.md](file:///docs/clinical/CLINICAL_REVIEW_REGISTER.md) — Log of certified physician peer reviews and diagnostic validations.
- [RESPIRATORY_CLINICAL_QUESTION_AND_LABELS.md](file:///docs/clinical/RESPIRATORY_CLINICAL_QUESTION_AND_LABELS.md) — Clinical triage question bank and evidence-based label definitions.
- [SPECIALTY_CLINICAL_REQUIREMENTS_AND_ACCEPTANCE_CRITERIA.md](file:///docs/clinical/SPECIALTY_CLINICAL_REQUIREMENTS_AND_ACCEPTANCE_CRITERIA.md) — Specialty requirements for Pulmonology, Cardiology, and Endocrinology.
- [RISK_QUALITY_AND_SAFETY_REGISTER.md](file:///docs/clinical/RISK_QUALITY_AND_SAFETY_REGISTER.md) — Risk assessment matrix and hazard mitigation strategies.
- [CHRONIC_DISEASE_EXPANSION_SCOPES.md](file:///docs/clinical/CHRONIC_DISEASE_EXPANSION_SCOPES.md) — Expansion scope for Hypertension, Diabetes, Obesity, and Blood Disorders.
- [DOCUS_AI_MANDATORY_DOCTOR_NOTE_SPEC.md](file:///docs/clinical/DOCUS_AI_MANDATORY_DOCTOR_NOTE_SPEC.md) — Physician mandatory clinical commentary before finalizing patient reports.
- [ROLOGY_DOCTOR_REVIEW_COCKPIT_SPEC.md](file:///docs/clinical/ROLOGY_DOCTOR_REVIEW_COCKPIT_SPEC.md) — High-throughput doctor review dashboard and queue management.
- [WEARABLE_HEALTH_DATA_INTEGRATION.md](file:///docs/clinical/WEARABLE_HEALTH_DATA_INTEGRATION.md) — Ingestion of continuous $SpO_2$, heart rate, and step count telemetry.
- [MEDICAL_OCR_AND_CLINICAL_EXTRACTION_GOVERNANCE.md](file:///docs/clinical/MEDICAL_OCR_AND_CLINICAL_EXTRACTION_GOVERNANCE.md) — Automated lab report OCR, value boundary enforcement, and human-in-the-loop review.

---

## 🔒 3. Security, RBAC & Protection (`docs/security/`)

- [SECURITY_ASSESSMENT_AND_LOAD_TEST_REPORT.md](file:///docs/security/SECURITY_ASSESSMENT_AND_LOAD_TEST_REPORT.md) — Full penetration test report, DDoS resiliency, and load benchmark results.
- [SECURITY_RBAC_CHANGELOG.md](file:///docs/security/SECURITY_RBAC_CHANGELOG.md) — 3-Tier role-based access control separation (Patient, Doctor, Admin).
- [PERMISSION_PENETRATION_TEST_SPEC.md](file:///docs/security/PERMISSION_PENETRATION_TEST_SPEC.md) — Cross-tenant isolation verification and unauthorized route guard tests.
- [MALICIOUS_INPUT_AND_PHYSIOLOGICAL_VALIDATION_SPEC.md](file:///docs/security/MALICIOUS_INPUT_AND_PHYSIOLOGICAL_VALIDATION_SPEC.md) — SQL Injection, XSS sanitization, and physiological boundary checks.
- [KRY_SECURE_REPORT_LINKS_ZERO_PHI_SPEC.md](file:///docs/security/KRY_SECURE_REPORT_LINKS_ZERO_PHI_SPEC.md) — Expiring, cryptographically signed zero-PHI patient report links.
- [CRITICAL_FLOWS_TESTING_SPEC.md](file:///docs/security/CRITICAL_FLOWS_TESTING_SPEC.md) — Automated verification of end-to-end patient assessment to certified PDF report pipeline.
- [PUSH_NOTIFICATIONS_AND_ACCOUNT_ISOLATION_GOVERNANCE.md](file:///docs/security/PUSH_NOTIFICATIONS_AND_ACCOUNT_ISOLATION_GOVERNANCE.md) — Strict token isolation preventing cross-account notification leaks.
- [OTP_AND_WHATSAPP_MESSAGING_GOVERNANCE.md](file:///docs/security/OTP_AND_WHATSAPP_MESSAGING_GOVERNANCE.md) — Cryptographically generated OTP verification via WhatsApp Business Cloud API.
- [TELEHEALTH_VIDEO_PRIVACY_AND_CONSENT_GOVERNANCE.md](file:///docs/security/TELEHEALTH_VIDEO_PRIVACY_AND_CONSENT_GOVERNANCE.md) — End-to-end encrypted video consults with explicit patient consent.

---

## ⚖️ 4. Legal & Regulatory Compliance (`docs/legal/`)

- [MEDICAL_DISCLAIMER.md](file:///docs/legal/MEDICAL_DISCLAIMER.md) — Triage-assist status disclaimer and emergency escalation notices.
- [PRIVACY_POLICY.md](file:///docs/legal/PRIVACY_POLICY.md) — Patient privacy rights and data governance under Egyptian Data Protection Law No. 151/2020.
- [TERMS_OF_SERVICE.md](file:///docs/legal/TERMS_OF_SERVICE.md) — User agreements, acceptable use policies, and clinical liability limitations.
- [ACCOUNT_DELETION_WORKFLOW.md](file:///docs/legal/ACCOUNT_DELETION_WORKFLOW.md) — Patient right-to-be-forgotten lifecycle balanced with medical audit retention laws.

---

## 🔌 5. API Reference & Partner Contracts (`docs/api/`)

- [API_REFERENCE_STABLE.md](file:///docs/api/API_REFERENCE_STABLE.md) — Versioned HTTP API specifications for authentication, assessments, and reports.
- [PARTNER_ECOSYSTEM_AND_MARKETPLACE_SPEC.md](file:///docs/api/PARTNER_ECOSYSTEM_AND_MARKETPLACE_SPEC.md) — Standardized diagnostic lab and pharmacy e-prescription integration contracts.

---

## 🚀 6. Operations & Commercial Readiness (`docs/operations/`)

- [BACKUP_AND_RESTORE_PLAN.md](file:///docs/operations/BACKUP_AND_RESTORE_PLAN.md) — Automated daily backups, RPO < 1 hour, RTO < 4 hours, and disaster recovery drills.
- [INCIDENT_RESPONSE_AND_ADVERSE_EVENTS.md](file:///docs/operations/INCIDENT_RESPONSE_AND_ADVERSE_EVENTS.md) — Clinical safety incident protocols and severity tiers.
- [PILOT_PLAN_AND_CLINICAL_ONBOARDING.md](file:///docs/operations/PILOT_PLAN_AND_CLINICAL_ONBOARDING.md) — Step-by-step hospital and clinic onboarding playbook.
- [PILOT_CASE_STUDY_NILE_CHEST.md](file:///docs/operations/PILOT_CASE_STUDY_NILE_CHEST.md) — Real-world pilot results and doctor efficiency metrics at Nile Chest Center.
- [GRADUAL_EXPANSION_PLAN.md](file:///docs/operations/GRADUAL_EXPANSION_PLAN.md) — Tiered rollout roadmap across Governorates in Egypt and MENA.
- [COMMERCIAL_VALIDATION_AND_RELEASE_PLAN.md](file:///docs/operations/COMMERCIAL_VALIDATION_AND_RELEASE_PLAN.md) — B2B clinic subscription tiers, feature flags, and billing ledgers.
- [PLANS_AND_SUBSCRIPTION_MODEL.md](file:///docs/operations/PLANS_AND_SUBSCRIPTION_MODEL.md) — Pricing tiers for Individual Patients, Private Clinics, and Hospital Networks.
- [ARABIC_HEALTH_CONTENT_PLAN.md](file:///docs/operations/ARABIC_HEALTH_CONTENT_PLAN.md) — Medically vetted Arabic health awareness library and SEO strategy.
- [BRAND_AND_IDENTITY_GUIDE.md](file:///docs/operations/BRAND_AND_IDENTITY_GUIDE.md) — Visual design tokens, typography, logo guidelines, and brand voice.
