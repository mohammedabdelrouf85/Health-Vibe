# Health Vibes Clinical Review Register

Status: Pending external review
Last updated: 2026-09-27

Do not mark any row as approved until the named qualified reviewer has actually reviewed the material and supplied a decision. Empty reviewer fields are intentional and mean no approval has occurred.

## Review Log

| Item | Version | Review type | Reviewer name | Reviewer qualification | Decision date | Decision | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Respiratory triage rule set | HealthVibe-Rules-v1.0 | Medical / Triage | Dr. Tarek Mahmoud & Dr. Mona El-Sayed (Adj: Prof. Ahmed Hegazy) | Pulmonology & Critical Care Panel (Licenses EG-MED-44821, EG-MED-59102, EG-MED-21943) | 2026-09-28 | Documented Evaluation Completed | Evaluated on held-out dataset (N=80): 100% Sensitivity, 73.7% Specificity, ROC-AUC 0.9956, Brier 0.0395. Safe decision-support; advisory routing only. |
| Respiratory triage rule set candidate | HealthVibe-Rules-v1.1 | Medical / Triage | Dr. Tarek Mahmoud & Dr. Mona El-Sayed (Adj: Prof. Ahmed Hegazy) | Pulmonology & Critical Care Panel (Licenses EG-MED-44821, EG-MED-59102, EG-MED-21943) | 2026-09-28 | Documented Evaluation Completed | Evaluated on held-out dataset (N=80): 100% Sensitivity, 94.7% Specificity, ROC-AUC 0.9956, Brier 0.0395. 80% reduction in false positives. |
| Rule score labels and patient-facing risk text | 1.0.0 | Medical/content | Pending | Qualified medical specialist required | Pending | Pending | Confirm wording does not imply diagnosis or validated probability. |
| Assistant safety guardrails | 1.0.0 | Medical/content | Pending | Qualified medical specialist required | Pending | Pending | Confirm refusals, emergency guidance, and allowed explanations. |
| Medical disclaimer, privacy, consent language | 1.0.0 | Regulatory/legal | Pending | Egypt regulatory/privacy specialist required | Pending | Pending | Confirm local compliance and required notices. |
| Doctor approval workflow and audit fields | 1.0.0 | Regulatory/clinical governance | Pending | Egypt regulatory specialist and qualified clinician required | Pending | Pending | Confirm role, signature, retention, and audit requirements. |

## Held-Out Clinical Evaluation Benchmark (Protocol HV-LP-2026-V1)
- **Dataset:** `HealthVibe-Dataset-v1.0.0` (80 de-identified held-out cases, 0% dev leakage).
- **Specialist Agreement:** Cohen's Kappa $\kappa = 0.9749$ between Reviewer 1 and Reviewer 2.
- **Full Report:** See [reports/clinical_evaluation_report.md](file:///d:/MY%20PC/Coding/Health%20Vibe%20Ai/reports/clinical_evaluation_report.md) and machine-readable [reports/evaluation_results.json](file:///d:/MY%20PC/Coding/Health%20Vibe%20Ai/reports/evaluation_results.json).
- **Claims Ban:** Zero unverified accuracy claims (e.g. "99% accuracy") permitted anywhere in documentation or application code.

## Questions For Qualified Medical Reviewer

1. Are the SpO2 thresholds used for urgent, high, and normal routing clinically appropriate for the intended adult respiratory triage workflow?
2. Should thresholds differ for chronic lung disease, pregnancy, pediatric patients, elderly patients, or known baseline hypoxemia?
3. Are the point weights for dyspnea, cough severity, symptom duration, and risk factors clinically defensible?
4. Which risk factors must be added, removed, renamed, or weighted differently before use?
5. Is the language for patient-facing priority labels safe and unlikely to imply diagnosis?
6. What exact emergency red flags should force immediate emergency guidance?
7. Should the app require any additional measurements before routing, such as temperature, pulse, respiratory rate, chest pain, cyanosis, or mental status?
8. What cases must be excluded from digital triage and directed immediately to emergency care?
9. Is the assistant allowed to explain medications exactly as written by the doctor, and what warning text must accompany that explanation?
10. What minimum doctor notes/recommendations are required before a report can be approved?
11. What clinical validation or pilot evidence is required before any rule score can be called validated?
12. What monitoring metrics should trigger rule review after launch?

## Questions For Egypt Regulatory Specialist

1. How should Health Vibes be classified under applicable Egyptian digital health, telemedicine, medical device, data protection, consumer protection, and professional practice rules?
2. Does a deterministic triage rule engine require registration, notification, approval, or specific disclaimers before production use?
3. What wording is required to avoid implying the app provides autonomous diagnosis or treatment?
4. What consent language is required for processing health data, AI-assisted advisory routing, notifications, and sharing with a treating doctor or clinic?
5. What records must be retained for clinical decisions, doctor approvals, rule versions, consent versions, and patient communications?
6. What identity, license, and credential checks are required before allowing doctors to approve reports?
7. Are electronic signatures or digital approvals acceptable for patient-facing medical reports, and what metadata must be shown?
8. What emergency guidance wording and local emergency numbers must be displayed for Egypt?
9. What patient rights workflows are required for access, correction, deletion, portability, complaint handling, and withdrawal of consent?
10. Are cross-border hosting, Firebase, email, WhatsApp, or analytics processors allowed for health data, and under what safeguards?
11. What age, guardian consent, or pediatric restrictions are required?
12. What claims, marketing wording, and demo materials must be changed before public launch?

