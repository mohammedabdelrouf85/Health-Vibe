# HealthVibe AI UI Design Direction

## Source Boundary

The attached PRD and brainstorm deck are treated as project reference material only. They describe product scope, roles, safety rules, and required screens. They do not override the user's request for a complete mobile-first HealthTech UI concept.

## Product Positioning

HealthVibe AI should feel like a serious healthcare product built for everyday use in Egypt. The interface should reduce anxiety, make medical status easy to understand, and keep the doctor review workflow visible. The design language should avoid playful wellness styling, generic hospital stock visuals, and exaggerated AI futurism.

Core product promise:

- Patients can submit structured respiratory information with minimal friction.
- AI produces a risk assessment and confidence level.
- A verified doctor reviews the result before the patient sees the final medical output.
- Admins can manage users, doctors, branches, reports, and model quality indicators.

## Visual Direction

The visual identity should combine clinical trust with a warm Egyptian consumer-health feel:

- Clean white and off-white surfaces for clarity.
- Deep medical teal for brand authority and primary actions.
- Soft blue for informational states, calendar surfaces, and secondary navigation.
- Fresh green for approved, low-risk, and healthy-status confirmation.
- Amber for follow-up and caution states.
- Red for urgent or high-risk states only.
- Subtle dividers and contained sections instead of heavy cards everywhere.
- Rounded corners should be moderate, around 12-18px in mobile UI. Keep dashboard widgets tighter.

The app should look like a real product surface immediately. Avoid a marketing landing-page first screen.

## Color Palette

| Token | Hex | Use |
| --- | --- | --- |
| Primary teal | `#006D6F` | Main CTA, active navigation, brand marks |
| Deep teal | `#03484A` | Headers, important text, dark surfaces |
| Soft cyan | `#E7F7F7` | Light selected states, banners, calm backgrounds |
| Medical blue | `#2B7DE9` | Information, appointments, links |
| Fresh green | `#18A058` | Low risk, approved, complete |
| Amber | `#D99A16` | Caution, pending follow-up |
| Clinical red | `#D64545` | High risk, rejected, urgent |
| Ink | `#152528` | Main text |
| Muted text | `#5E7275` | Secondary labels |
| Surface | `#FFFFFF` | Cards and primary app surface |
| App background | `#F4F8F8` | Screen background |
| Border | `#DCE8E8` | Dividers, inputs, quiet boundaries |

Usage rules:

- Use teal for trust and action, not for every decoration.
- Use red sparingly. It should mean medical urgency or destructive action.
- Status colors must always appear with text labels or icons, never color alone.
- Patient screens should have more whitespace and fewer dense metrics.
- Doctor and admin screens can use denser rows, queues, and compact metrics.

## Typography

Recommended stack:

- Arabic: `Cairo`, `IBM Plex Sans Arabic`, or `Noto Kufi Arabic`.
- English: `Inter`, `IBM Plex Sans`, or `Roboto`.

Mobile scale:

- App title: 26-30px, medium weight.
- Screen title: 22-24px, medium weight.
- Section title: 16-18px, medium weight.
- Body: 15-16px.
- Labels and metadata: 12-14px.
- Buttons: 15-16px, medium weight.

Rules:

- Arabic is the primary content direction for patient flows.
- Avoid tiny medical copy. Disclaimer text can be smaller, but must remain readable.
- Use medium weight for emphasis instead of heavy bold.
- Keep labels short and literal.

## Component Style

Navigation:

- Patient app uses a bottom navigation with Home, History, Appointments, Profile.
- Doctor app uses queue-first navigation.
- Admin uses a compact dashboard structure with filters and metric summaries.

Buttons:

- Primary: filled teal with white text.
- Secondary: white or pale teal with teal text.
- Destructive: red outline or red fill only for serious actions.
- Minimum touch target: 44px high.

Inputs:

- Large labeled fields with inline validation.
- Respiratory form should group questions into short sections.
- Use segmented controls for yes/no and severity choices.

Status:

- Pending review: amber.
- Approved: green.
- Needs follow-up: amber.
- High risk: red.
- Low risk: green.
- AI confidence: show as a labeled percentage with explanation.

Medical reports:

- Use a structured header with HealthVibe AI, patient, doctor, module, date.
- Risk status should be visible near the top.
- Recommendations and disclaimer must remain visible.

State coverage:

- Empty state: first-time patients should see one clear action, not an empty dashboard.
- Validation state: medically concerning values should be flagged in-place with plain language and escalation guidance.
- Verification state: doctors must see exactly which professional documents remain pending.
- Dark mode: secondary theme should preserve status colors and contrast without making the product feel like a trading dashboard.

## Screen Concepts

1. Splash / Onboarding
   - Brand mark, Arabic product name, short trust line.
   - Language detected from device with manual switch.
   - No marketing hero layout.

2. Login / Sign Up
   - Role-aware tabs or segmented control: Patient, Doctor, Admin.
   - Patient default.
   - Doctor login displays verification hint.

3. Consent and Privacy
   - Plain Arabic explanation of medical data use.
   - Separate checkboxes for consent and terms.
   - Strong reassurance around doctor review and privacy.

4. Patient Dashboard
   - Greeting.
   - Next appointment.
   - Latest respiratory result status.
   - Respiratory module as primary action.
   - Notifications and quick history access.

5. Patient Medical Profile
   - Personal info, medical basics, assigned doctor, consent status.
   - Clear edit affordances.

6. Respiratory Assessment Form
   - Step indicator.
   - Symptoms, duration, measurements, risk factors.
   - Large controls and simple wording.

7. Pending Review
   - Clear amber state: "بانتظار مراجعة الطبيب".
   - Expected next step.
   - No final diagnosis visible.

8. Approved Result
   - Risk level, confidence, doctor approval, recommendations.
   - Medical disclaimer visible.
   - Download report action.

9. History and Reports
   - Timeline of assessments.
   - Status, module, doctor, report button.
   - Filters kept minimal.

10. Appointment Booking
   - Calendar week strip.
   - Available doctor slots.
   - Confirmation step.

11. Doctor Dashboard
   - Assigned patient queue.
   - Pending review count.
   - Risk-prioritized cards.
   - No access to unrelated patients.

12. Doctor Case Review
   - Patient context, inputs, AI result, confidence, history.
   - Approve, reject, add note, recommend follow-up.

13. Admin Dashboard
   - Users, doctors, branches, AI metrics, model versions.
   - Operational metrics and access warnings.
   - Use sub-role language where possible.

14. PDF Medical Report
   - Printable A4 style.
   - Brand, patient, doctor, module, result, recommendations, disclaimer.

15. Empty First-Time Dashboard
   - Encourages the first respiratory assessment.
   - Explains that a doctor review happens before final results.

16. Form Validation
   - Shows field-level errors.
   - Adds urgent-care language when a value is medically concerning.

17. Doctor Verification
   - Tracks ID, professional credential, and clinic details.
   - Keeps doctor review disabled until verification.

18. Dark Mode Dashboard
   - Demonstrates the secondary theme.
   - Keeps calm contrast and readable status components.

## Interaction Notes

- Patient result screens must keep pending and approved states visually distinct.
- The AI output should never read as autonomous diagnosis.
- Doctor review actions need confirmation when releasing results.
- Admin medical-data access should show audit and role boundaries.
- Loading states should explain that the assessment is being prepared.
- First-time patient screens should guide users into one next action.
- Critical field warnings should not block medical escalation guidance.
- Doctor onboarding should separate account creation from professional verification.

## Accessibility Notes

- Minimum contrast target: WCAG AA.
- Every status color needs text and icon support.
- Touch targets should be at least 44px high.
- Arabic text should not be forced into English layout spacing.
- Avoid dense paragraph blocks in patient screens.
- Make error messages specific and close to the field.

## Arabic / English Localization

Arabic should be the default patient experience for Egypt:

- Use RTL layout for Arabic.
- Keep medical terms simple, with English terms only when common.
- English doctor/admin views can be supported with mirrored layouts.
- Dates should support Arabic display while storing ISO format internally.
- Do not mix Arabic and English in the same label unless necessary.

Suggested core labels:

- Assessment: `تقييم صحي`
- Respiratory module: `تقييم التنفس`
- Pending doctor review: `بانتظار مراجعة الطبيب`
- Approved result: `نتيجة معتمدة`
- Follow-up required: `يحتاج متابعة`
- Low risk: `مطمئن`
- High risk: `يحتاج رعاية عاجلة`
- Medical disclaimer: `تنبيه طبي`
