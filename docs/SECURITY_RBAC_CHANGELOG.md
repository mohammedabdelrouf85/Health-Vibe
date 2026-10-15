# RBAC Security Change Log

Date: 2026-09-27

## Role Matrix

| Role | Allowed operations |
| --- | --- |
| Patient | Manage own profile fields that are not privileged, create own clean cases in own clinic, read own released reports and own safe case history, book own appointments, submit own feedback. |
| Doctor Pending | Read own profile and application flow, create or cancel own pending doctor application, use non-clinical pending-doctor screens only. |
| Doctor | Read assigned clinical cases, update assigned case workflow through clinical status transitions, access verified doctor identity, submit clinical feedback, read linked appointments and clinical metrics. |
| Support | Read only support-safe aggregate operational metrics and own profile. Support is blocked from cases, reports, assessments, feedback lists, doctor identity, and clinical records. |
| Clinic Admin | Manage scoped clinic operations and non-clinical administration for the same clinic: users, suspension, verification, application decisions, audit, appointments, KPIs, and model metrics. Cannot approve clinical cases or assign global roles outside scope. |
| Super Admin | Manage trusted administrative permissions globally through audited backend APIs, including roles, suspensions, verification, doctor applications, audit, backup, and operational metrics. Clinical approvals remain doctor-only. |

## Server Changes

- Enforced revoked-token checks and `authzVersion` matching so stale tokens fail after privileged role changes.
- Made role, suspension, verification, doctor approval, and doctor rejection operations server-authoritative and audited.
- Preserved existing trusted custom claims when changing roles, suspension, verification, and doctor status.
- Scoped clinic-admin actions to the target user's or application's clinic and rejected forged request-body clinic IDs.
- Prevented self role edits and clinic-admin management of administrative accounts.
- Required approved doctor application identity before promoting a user to doctor.
- Blocked support from clinical identity/report access, including legacy cases where support was accidentally stored as `patientId`.
- Restricted feedback reads so doctors only see own or linked feedback and support cannot read raw clinical feedback.

## Rules Changes

- Added `authzVersion` checks to Firestore and Storage rules.
- Removed client writes to privileged user fields, audit events, report collections, and server-owned clinical approval fields.
- Restricted medical collections so owners can read released/safe content, doctors read assigned content, clinic admins read only same-clinic content, super admins read administrative/global content, and support is denied.
- Hardened clinic matching to prefer canonical `clinicId` before legacy aliases.
- Limited doctor applications to owner-created pending applications and owner cancellation; approvals and rejections now go through audited backend APIs.
- Updated case, appointment, feedback, KPI, and storage rules to reject direct foreign clinic IDs and request tampering.
- Synchronized root `firestore.rules` with `backend/firestore.rules`.

## Frontend Changes

- Rebuilt role screen and permission checks around explicit `ROLE_ALLOWED_SCREENS` and permission maps.
- Removed client-side fallback writes for role changes, doctor approvals/rejections, verification, and suspension.
- Matched navigation, direct route guards, and mobile navigation to the server/rules role matrix.
- Limited support UI to own profile and support-safe KPI aggregates.
- Stopped support paths from loading patient history, reports, or cached clinical details.
- Used backend APIs for user role, verification, suspension, and doctor application decisions.

## Verification

- `npm test` passes.
- Rules emulator validates Firestore and Storage rules.
- `tests/rbac_matrix.test.js` covers all six roles, direct links, request tampering, stale tokens, support clinical denial, audit records, and scoped admin behavior.
