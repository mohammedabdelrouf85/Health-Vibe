# Approved clinical content and physician identity

Patient report HTML (including print), result summaries, assistant answers and
result-ready email must display saved clinical fields only. Empty medication
fields mean no medication was recorded: display `غير مسجل` / `Not recorded`.
Never use vitals, general notes, presets, or an AI synthesis to fill a missing
prescription, diagnosis, or recommendation. Doctor-selected presets remain an
explicit editor action; blank editor fields are not auto-filled at approval.

Case approval now waits for `/api/doctor/approve-clinical-case`. The backend
preserves empty medications and loads physician identity from an approved
`doctor_applications` document for the authenticated physician. Request-body
names/licenses and editable user profile values are not identity sources.
The approved application ID and identity are stored with the report. Patient
views refresh identity through an authenticated, case-authorized API lookup;
missing or unavailable verified records display the missing-value label,
including for legacy reports. No historical record is automatically rewritten.

Approved reports now create an immutable `reportSnapshot` on the case and a
linked `clinical_reports/{caseId}_vN` revision document. The snapshot freezes
patient and case details, recorded results, doctor notes, recommendations,
verified doctor identity, disclaimer text, report/model/rule versions, approval
dates, and generated dates at the moment of approval. Report rendering prefers
that snapshot, so later edits to a doctor application, doctor profile, patient
profile, or operational case fields do not alter older approved reports.

Each approval records `approvalHistory[]` with the revision ID, version number,
approving doctor, approval time, and signature workflow
`doctor_electronic_approval_v1`. New approved versions increment
`reportRevisionNumber`, link to `previousReportRevisionId`, and keep the
original case ID for revision history access.

Reports can be withdrawn only through the backend doctor endpoint with a
required reason. Withdrawal records who withdrew the active revision, when, and
why, marks the linked revision unpublished, and preserves the prior approved
snapshot for audit/history instead of deleting or rewriting it.

`firestore.rules` prevents direct client approval or replacement of protected
identity and approved clinical fields. Deploy the backend and these rules with
the frontend. Backend configuration is required for approval; a backend failure
must not fall back to direct Firestore approval. This change does not deploy
Firebase rules or services by itself.

Validation: `npm run test:clinical` executes real Express approval/identity
handlers with Firebase SDK/storage stubs, actual report/result renderers, and
assistant branches in a minimal DOM harness. It covers empty/null/omitted/blank
medications in Arabic and English, verified identity rather than forged request
values, denial for unrelated patients, missing credentials, missing vitals,
unapproved assistant responses, and backend failures. `npm test` includes this
regression suite. The existing rules test inspects/simulates rules; a live
Firestore emulator was not available in this workspace, so it is not a rules
emulator validation or a production Firebase integration test.
