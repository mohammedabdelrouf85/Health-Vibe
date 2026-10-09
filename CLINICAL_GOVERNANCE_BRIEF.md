# Health Vibe AI Clinical Governance Brief

Status: Pending qualified medical and Egyptian regulatory review
Last updated: 2026-09-30

This document defines the current intended use of the Health Vibe AI assessment flow, rule engine, and assistant. It does not record clinical, legal, or regulatory approval. All approvals remain pending until qualified reviewers complete and sign their decisions.

## Target Users

| User | Intended use | Not intended for |
| --- | --- | --- |
| Patient | Submit respiratory assessment inputs, view doctor-approved reports, and read plain-language explanations of approved report content. | Self-diagnosis, medication decisions, emergency care delay, or replacing an in-person clinician. |
| Licensed doctor | Review submitted assessments, request more information, approve/reject/escalate cases, and write clinical notes/recommendations. | Blind approval without clinical judgment or physical examination when needed. |
| Clinic/admin user | Assign cases, manage operational queues, view aggregate metrics, and manage approved doctors. | Making clinical decisions unless separately qualified and acting as the treating clinician. |
| Support/operator | Help with account and workflow issues under access controls. | Accessing or interpreting clinical content outside authorized support scope. |

## Target Conditions And Cases

Current scope is respiratory triage support for patient-reported symptoms and SpO2-based risk flagging. The system is limited to routing, prioritization, and post-approval explanation of physician-authored report content.

Out of scope: definitive diagnosis, prescribing, dose changes, treatment initiation, imaging/lab interpretation as a standalone diagnostic act, pediatric/neonatal protocols unless explicitly reviewed, and emergency management beyond directing the patient to emergency services.

## Inputs

| Input group | Examples |
| --- | --- |
| Patient identity and consent | Authenticated user, privacy consent, data processing consent, AI advisory acknowledgement. |
| Vitals | SpO2 percentage within accepted input bounds. |
| Symptoms | Breathing difficulty, cough severity, symptom duration. |
| Risk factors | Asthma, smoking, pregnancy, no known factor, and future reviewed factors. |
| Uploaded/reference data | Patient-supplied files for physician review only. |
| Doctor review data | Clinical notes, diagnosis text, recommendations, medications, approval/rejection/escalation decision. |

## Outputs

| Output | Produced by | Safety boundary |
| --- | --- | --- |
| Triage priority | Deterministic rules | Advisory queueing signal only; not a diagnosis. |
| Rule score and triggered rules | Deterministic rules | Unvalidated model/rule score pending qualified review. |
| Patient report | Doctor approval workflow | Clinical content must come from doctor-saved fields only. |
| Assistant explanation | Locked assistant | Explains approved report content; refuses diagnosis, prescribing, dose changes, and pre-approval result interpretation. |
| Emergency guidance | Safety guardrail | Directs to emergency services when high-risk wording is detected; does not manage treatment. |

## Rule Engine Boundaries

The current rule engine uses fixed thresholds and points for SpO2, dyspnea, cough severity, symptom duration, and risk factors. It is intended to prioritize review and surface explainable rule triggers to clinicians.

The rule engine is not a validated diagnostic model, does not estimate probability of disease, does not certify severity independently, and must not be presented as clinically approved until actual qualified review is recorded. Historical cases should retain the exact rule version used at submission.

## Assistant Boundaries

The assistant may explain doctor-approved diagnosis text, medications, recommendations, doctor identity, and report metadata. It may summarize what the approved report says in simpler language.

The assistant must not provide independent diagnosis, prescribe medication, modify doses, suggest alternatives, infer unapproved results, or answer as if a pending case is certified. For emergencies, it should direct the patient to emergency services in Egypt where applicable, including ambulance number 123.

