# Accessibility Review

Date: 2026-09-29

Scope: shared public landing page, app shell, navigation, core modal/dialog patterns, toast/error announcements, focus visibility, target sizes, contrast-oriented styling, text scaling, and reduced-motion behavior.

Automated check: `npm run audit:a11y` runs axe-core in a real browser and writes a detailed local report to `output/accessibility-audit.md`.

Current automated result: no WCAG A/AA axe violations on the audited static viewport, and custom checks pass for 44px visible targets, named dialogs, live regions, reduced-motion CSS, and visible focus styling.

Manual review notes:

- Keyboard navigation was reviewed for shared navigation, skip link, authentication dialog, legal modal, and emergency/confirmation dialog patterns.
- Dialogs now expose names/descriptions, modal semantics, focus trapping, Escape handling where close controls exist, and focus restoration.
- Toast and app error messages are mirrored to live regions for assistive technology announcements.
- Status and emergency patterns include text/icons in addition to color.
- Motion-heavy UI has a `prefers-reduced-motion` path.

Remaining issues and limits:

- This review is not a full compliance claim. Automated checks do not replace assistive-technology testing.
- Authenticated patient, doctor, admin, and support workflows still need role-specific keyboard and screen-reader passes with representative Firebase data.
- Third-party Firebase/Google authentication UI and browser permission prompts are outside the static audit.
- Some dynamically generated clinical/admin cards in `app/app.js` should continue to be sampled as real production data and edge states are added.
