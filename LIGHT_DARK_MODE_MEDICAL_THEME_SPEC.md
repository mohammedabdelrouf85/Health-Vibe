# 🌓 Health Vibe AI: Light & Dark Mode Medical Theme Specification

## 1. Executive Summary & Design Vision
In respiratory and pulmonary clinical software (**Health Vibe AI**), visual clarity and eye comfort are paramount:
- Clinicians work in varying lighting conditions (night shifts, dim hospital wards, and brightly lit clinical offices).
- Elderly patients and respiratory sufferers experience eye fatigue, photophobia, and visual acuity impairment.
- Triage warning colors (**Green**, **Yellow/Amber**, **Red**) must convey clinical urgency instantaneously without visual ambiguity or color vibration.

This specification sets the standards for **Light Mode** and **Dark Mode** with an eye-comfort medical identity and uncompromised tri-color triage warning visibility.

---

## 2. Core Medical Palette Tokens

### 2.1 Dark Mode (Soothing Clinical Slate-Teal)
| Token | Value | Clinical Purpose | WCAG Contrast |
|---|---|---|---|
| `--bg` | `#07191b` | Deep soothing clinical backdrop | Reduces nocturnal glare & battery drain |
| `--surface` | `#0d2427` | Primary card and workspace surface | 11.7:1 vs `--ink` |
| `--surface-2` | `#112d30` | Elevated inputs, secondary cards | 9.5:1 vs `--ink` |
| `--surface-3` | `#16363a` | Hover states, active dropdowns | High tactile feedback |
| `--line` | `#1e3f42` | Subtle clinical dividers | Soft structure without harsh lines |
| `--teal` | `#09b8b6` | Clinical primary brand accent | Luminous clinical identity |
| `--ink` | `#e2f0ee` | Primary typography | 11.7:1 on `--bg` (WCAG AAA) |
| `--muted` | `#b0d8d6` | Secondary typography / metadata | 10.5:1 on `--surface` (WCAG AAA) |

### 2.2 Light Mode (Clean Clinical Alabaster)
| Token | Value | Clinical Purpose | WCAG Contrast |
|---|---|---|---|
| `--bg` | `#f8fafc` | Soft clinical alabaster canvas | Eye-friendly, avoids pure white glare |
| `--surface` | `#ffffff` | Pure white medical cards & panels | Crisp clinical baseline |
| `--surface-2` | `#f8fafc` | Input backgrounds, subtle wells | Clear field boundaries |
| `--line` | `#cbd5e1` | Slate border lines | Clean definition without visual noise |
| `--teal` | `#0f766e` | Deep clinical teal accent | 5.47:1 vs white (WCAG AA) |
| `--ink` | `#0f172a` | Primary medical text | 17.85:1 on white (WCAG AAA) |
| `--muted` | `#334155` | Secondary text & labels | 10.35:1 on white (WCAG AAA) |

---

## 3. Tri-Color Triage Warning System (Green, Amber, Red)

The three clinical risk tiers follow strict colorimetry standards:

```
+-----------------------------------------------------------------------------------+
| CLINICAL TRIAGE TIER | DARK MODE VALUE        | LIGHT MODE VALUE       | CONTRAST |
+----------------------+------------------------+------------------------+----------+
| 🟢 Green (Normal)    | Text: #4ade80          | Text: #15803d          | >= 5.0:1 |
|                      | Bg:   rgba(34,197,94,.16)| Bg: rgba(22,163,74,.12)| (AA/AAA) |
+----------------------+------------------------+------------------------+----------+
| 🟡 Amber (Caution)   | Text: #fbbf24          | Text: #b45309          | >= 5.0:1 |
|                      | Bg:  rgba(245,158,11,.18)| Bg: rgba(245,158,11,.12)(AA/AAA)|
+----------------------+------------------------+------------------------+----------+
| 🔴 Red (Critical)    | Text: #f87171          | Text: #b91c1c / #dc2626| >= 5.8:1 |
|                      | Bg:  rgba(239,68,68,.20)| Bg:  rgba(239,68,68,.12)| (AA/AAA) |
+----------------------+------------------------+------------------------+----------+
```

### 3.1 Mathematical Contrast Verification
1. **Green Tier (Normal SpO2 >= 95% / Stable / Low Risk / Approved):**
   - **Dark Mode**: `#4ade80` on `#0d2427` = **9.28:1** (Exceeds WCAG AAA)
   - **Light Mode**: `#15803d` on `#ffffff` = **5.02:1** (Exceeds WCAG AA)
2. **Yellow/Amber Tier (Moderate SpO2 90-94% / Caution / Under Review / Pending):**
   - **Dark Mode**: `#fbbf24` on `#0d2427` = **9.69:1** (Exceeds WCAG AAA)
   - **Light Mode**: `#b45309` on `#ffffff` = **5.02:1** (Exceeds WCAG AA - never washed out yellow!)
3. **Red Tier (Critical SpO2 < 90% / Emergency / Urgent / High Risk / Rejected):**
   - **Dark Mode**: `#f87171` on `#0d2427` = **5.85:1** (Exceeds WCAG AA)
   - **Light Mode**: `#b91c1c` on `#ffffff` = **6.47:1** (Exceeds WCAG AA)

---

## 4. DOM Binding, Bootloader & Persistence
- **Bootloader (`app/theme-boot.js`)**: Executes synchronously in `<head>` before page rendering to eliminate flash of unstyled content (FOUC). Sets `hv-theme-light` / `hv-theme-dark` classes and `data-theme` attribute.
- **Application Controller (`app/app.js`)**: Provides `applyTheme(theme)`, `toggleTheme()`, and synchronizes floating FAB and navigation toggle buttons.
- **Persistence**: Saved to `localStorage.getItem("hv_theme")`.
- **CSS Selectors Supported**:
  - Dark: `html.hv-theme-dark body, html[data-theme="dark"] body, [data-theme="dark"], body.dark`
  - Light: `html.hv-theme-light body, html[data-theme="light"] body, [data-theme="light"], body.light`

---

## 5. Verification & Test Coverage
- `tests/light_dark_theme_medical_tricolor.test.js`: 5 test suites validating contrast math and token parity.
- `tests/theme_light_mode_wcag.test.js`: 6 test suites validating WCAG compliance.
- `tests/theme_system.test.js`: 4 test suites validating toggle state persistence.
- `tests/strict_prd_page11_tricolor_risk_system.test.js`: 5 test suites validating PRD Page 11 risk needles and color boundaries.
