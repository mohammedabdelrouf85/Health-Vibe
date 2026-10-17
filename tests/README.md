# HealthVibe AI — Test Suite (`tests/`)

HealthVibe AI features a rigorous, multi-layered automated test suite comprising **174+ test suites** verifying security, medical accuracy, accessibility, database isolation, and clinical governance.

---

## 🧪 Test Categories

```
tests/
├── Security & Penetration
│   ├── permission_penetration_test.test.js
│   ├── malicious_input_and_physiological_check.test.js
│   ├── csp_security_headers.test.js
│   ├── app_check.test.js
│   ├── mfa_security.test.js
│   ├── strict_aes256_at_rest_encryption.test.js
│   └── strict_https_tls13_enforcement.test.js
│
├── Clinical & Medical Governance
│   ├── clinical_input_parsing.test.js
│   ├── clinical_report_integrity.test.js
│   ├── critical_symptoms_emergency_check.test.js
│   ├── false_negative_analysis_and_threshold_tuning.test.js
│   ├── strict_respiratory_clinical_question_and_labels.test.js
│   └── rules_governance_and_safety_register.test.js
│
├── Multi-Specialty Modules
│   ├── diabetes_module.test.js
│   ├── chronic_hypertension_module.test.js
│   ├── obesity_module.test.js
│   └── blood_disorders_module.test.js
│
├── Multi-Tenancy & Data Isolation
│   ├── api_clinic_isolation.test.js
│   ├── data_isolation.test.js
│   ├── multi_tenant_organization.test.js
│   └── strict_doctor_assigned_queries.test.js
│
└── End-to-End & Browser Tests
    ├── e2e_happy_path.test.js
    ├── e2e_real_browser.test.js
    └── two_browser_tabs_approval_conflict.test.js
```

---

## 🏃 Running Tests

```bash
# Run all core unit & integration tests
npm test

# Run critical security tests
npm run test:permission-penetration
npm run test:malicious-input

# Run repository structure audit
npm run test:repo-structure
```
