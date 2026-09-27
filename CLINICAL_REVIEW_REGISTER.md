# Health Vibes Clinical Review Register

Status: Pending external review
Last updated: 2026-09-27

Do not mark any row as approved until the named qualified reviewer has actually reviewed the material and supplied a decision. Empty reviewer fields are intentional and mean no approval has occurred.

## Review Log

| Item | Version | Review type | Reviewer name | Reviewer qualification | Decision date | Decision | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Respiratory triage rule set | HealthVibe-Rules-v1.0 | Medical | Pending | Qualified medical specialist required | Pending | Pending | No clinical approval recorded. |
| Respiratory triage rule set candidate | HealthVibe-Rules-v1.1 | Medical | Pending | Qualified medical specialist required | Pending | Pending | Candidate only; must not be treated as active clinical approval. |
| Rule score labels and patient-facing risk text | 1.0.0 | Medical/content | Pending | Qualified medical specialist required | Pending | Pending | Confirm wording does not imply diagnosis or validated probability. |
| Assistant safety guardrails | 1.0.0 | Medical/content | Pending | Qualified medical specialist required | Pending | Pending | Confirm refusals, emergency guidance, and allowed explanations. |
| Medical disclaimer, privacy, consent language | 1.0.0 | Regulatory/legal | Pending | Egypt regulatory/privacy specialist required | Pending | Pending | Confirm local compliance and required notices. |
| Doctor approval workflow and audit fields | 1.0.0 | Regulatory/clinical governance | Pending | Egypt regulatory specialist and qualified clinician required | Pending | Pending | Confirm role, signature, retention, and audit requirements. |

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

