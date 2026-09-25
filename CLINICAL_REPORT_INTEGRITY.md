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
