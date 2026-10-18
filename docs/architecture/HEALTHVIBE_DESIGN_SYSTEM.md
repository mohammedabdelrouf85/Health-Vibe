# Health Vibe AI — Unified Design System & Brand Guidelines
**Document ID:** #78 — P0 Critical  
**Standard Benchmark:** Doctolib / Kry / Docus AI  
**Author:** Mohamed (Lead Architect / Product Owner)  
**Effective Date:** 2026-10-18  
**Status:** ✅ APPROVED & ENFORCED

---

## 1. Executive Summary & Design Philosophy

Health Vibe AI is an AI-assisted clinical decision support and tele-triage platform for Egyptian and MENA healthcare. The visual design system must balance **clinical trust, soothing aesthetics, and rapid accessibility**.

Inspired by global clinical platforms like **Doctolib (France)** and **Kry (Nordics)**:
- **Zero Urgency Theatre:** Avoid aggressive alarms, flashing reds, or panic-inducing visuals.
- **Reassuring Confidence:** Primary actions use calming, authoritative **Medical Teal** (`#006D6F`), supported by **Medical Blue** (`#2B7DE9`) for scheduling and tele-consultations.
- **Strict Touch Ergonomics:** Every interactive element adheres to a minimum touch target of **44×44px** (WCAG 2.1 AA / AAA Target Size).
- **Bilingual Typographic Harmony:** Seamless rendering between Arabic (**Cairo / Tajawal**) and English/Clinical (**Inter / System UI**).

---

## 2. Color Palette & Medical Design Tokens

All colors are strictly mapped to CSS Custom Properties in `app/styles.css`. Direct hardcoded hex values in component markup are prohibited.

### 2.1 Core Brand & Clinical Colors

| Role | Color Name | Light Mode (Default) | Dark Mode (Clinical Night) | CSS Token | Usage & Semantics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary** | Medical Teal | `#006D6F` / `#0F766E` | `#09B8B6` | `var(--teal)` | Main CTAs, active navigation, certified marks |
| **Primary Light** | Soft Cyan | `#E7F7F7` | `#0E2E31` | `var(--cyan)` / `var(--teal-light)` | Banners, card highlights, selected chips |
| **Secondary** | Medical Blue | `#2B7DE9` | `#38BDF8` | `var(--blue)` | Appointments, telehealth, booking links |
| **Success** | Clinical Green | `#18A058` / `#16A34A` | `#22C55E` | `var(--green)` | Low risk, doctor approved, confirmed |
| **Warning** | Clinical Amber | `#D99A16` / `#D97706` | `#F59E0B` | `var(--amber)` | Triage caution, pending physician review |
| **Urgent** | Medical Red | `#D64545` / `#DC2626` | `#EF4444` | `var(--red)` | Critical triage alert, emergency referral only |

### 2.2 Neutral & Surface Tokens

| Token | Light Value | Dark Value | CSS Token | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **App Background** | `#F8FAFC` | `#07191B` | `var(--bg)` | Page backdrop |
| **Card Surface** | `#FFFFFF` | `#0D2427` | `var(--surface)` | Modals, consultation cards, questionnaires |
| **Secondary Surface** | `#F1F5F9` | `#112D30` | `var(--surface-2)` | Inputs, subtle sidebars, table headers |
| **Primary Ink** | `#0F172A` | `#E2F0EE` | `var(--ink)` | High-contrast readable body text (12:1) |
| **Muted Ink** | `#334155` | `#B0D8D6` | `var(--muted)` | Timestamps, secondary labels (WCAG AA >= 4.5:1) |
| **Subtle Border** | `#CBD5E1` | `#1E3F42` | `var(--line)` | Section dividers, input outlines |

---

## 3. Bilingual Typography System

The typography scale balances mobile legibility for elderly respiratory patients with high information density required by physicians.

### 3.1 Font Families
- **Arabic (Primary):** `'Cairo', 'Tajawal', 'IBM Plex Sans Arabic', -apple-system, sans-serif`
- **English / Clinical Data (Secondary):** `'Inter', 'Roboto', 'Segoe UI', system-ui, sans-serif`
- **Monospace (Prescriptions, Dosages, IDs):** `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace`

### 3.2 Type Hierarchy & Scale

| Style Level | Mobile Size | Desktop Size | Weight | Line Height | CSS Helper Class |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `28px` | `36px - 44px` | 800 (Extrabold) | `1.15` | `.hv-text-hero` |
| **Screen Title (H1)** | `22px` | `26px` | 700 (Bold) | `1.25` | `.hv-text-title` |
| **Section Title (H2)**| `18px` | `20px` | 700 (Bold) | `1.30` | `.hv-text-subtitle` |
| **Card Header (H3)** | `16px` | `17px` | 600 (Semibold) | `1.35` | `.hv-text-h3` |
| **Body (Standard)** | `15px` | `15px` | 400 (Regular) | `1.60` | `.hv-text-body` |
| **Caption / Labels** | `13px` | `13px` | 500 (Medium) | `1.40` | `.hv-text-caption` |
| **Legal / Disclaimer**| `12px` | `12px` | 400 (Regular) | `1.50` | `.hv-text-disclaimer` |

---

## 4. Universal Button System (Doctolib Standard)

Buttons are the primary interactive vehicle for medical decisions. They must be unmistakable, comfortable for touch, and convey state unambiguously.

### 4.1 Button Hierarchy & Variants

```
┌────────────────────────────────────────────────────────┐
│  [ Primary Teal CTA ]      --> .hv-btn-primary         │
│  [ Secondary Medical Blue] --> .hv-btn-secondary       │
│  [ Subtle Outline ]        --> .hv-btn-outline         │
│  [ Soft Cyan Chip ]        --> .hv-btn-soft            │
│  [ Danger / Critical ]     --> .hv-btn-danger          │
└────────────────────────────────────────────────────────┘
```

1. **Primary Medical CTA (`.hv-btn-primary` / `.solid-button`)**:
   - Background: Gradient `linear-gradient(135deg, var(--teal), #004d4f)`
   - Text: `#FFFFFF`, Weight: 700
   - Purpose: "ابدأ الفرز الآن", "تأكيد الحجز", "اعتماد التقرير الطبي".
2. **Secondary Medical Blue (`.hv-btn-secondary`)**:
   - Background: `#2B7DE9`, Hover: `#1E67C9`
   - Text: `#FFFFFF`
   - Purpose: "حجز موعد عيادة", "بدء استشارة الفيديو (Telehealth)".
3. **Outline / Neutral (`.hv-btn-outline` / `.outline-button`)**:
   - Background: `var(--surface)`, Border: `1px solid var(--line)`
   - Text: `var(--ink)`, Hover: `var(--teal)`
   - Purpose: "تعديل البيانات", "عرض التفاصيل", "إلغاء".
4. **Soft Cyan (`.hv-btn-soft` / `.soft-button`)**:
   - Background: `var(--cyan)`, Border: `1px solid color-mix(in srgb, var(--teal) 20%, transparent)`
   - Text: `var(--teal)`
   - Purpose: "فلترة حسب التخصص", "تحميل المرفقات", "إعادة المحاولة".
5. **Danger / Clinical Alert (`.hv-btn-danger` / `.danger-button`)**:
   - Background: `#FDECEC` (Light) / `rgba(239, 68, 68, 0.2)` (Dark)
   - Border: `1px solid var(--red)`
   - Text: `var(--red)`
   - Purpose: "طوارئ سريرية", "إلغاء الاستشارة المؤكدة", "حذف الحساب".

### 4.2 Standard Sizes (Touch Ergonomics)

| Size Modifier | Height | Padding (Inline) | Font Size | Border Radius | Primary Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Large (`.hv-btn-lg`)** | `52px` | `24px` | `16px` | `14px` | Hero CTAs, Sticky bottom booking bars |
| **Medium (`.hv-btn-md` / Default)** | `44px` | `18px` | `14.5px` | `12px` | Forms, modal actions, card triggers |
| **Small (`.hv-btn-sm`)** | `36px` | `12px` | `13px` | `10px` | Doctor queues, inline table actions |
| **Full Width (`.hv-btn-block`)** | `100%` width | — | — | — | Mobile sheet modals, checkout flows |

### 4.3 Button Interaction & Safety States

- **Hover:** Subtle elevation (`translateY(-1px)`) and luminous shadow (`box-shadow: 0 8px 20px rgba(0, 109, 111, 0.2)`).
- **Focus-Visible:** Accessible high-contrast outline (`outline: 3px solid #FFFFFF; outline-offset: 3px; box-shadow: 0 0 0 6px var(--teal)`).
- **Disabled (`:disabled`, `[aria-disabled="true"]`):** `opacity: 0.55; cursor: not-allowed; pointer-events: none;`.
- **Loading State (`.is-loading`, `[aria-busy="true"]`):** Reassuring circular spinner centered, text made transparent, clicks suppressed to eliminate double submissions.

---

## 5. Clinical Badges & Status Chips

Status indicators must pair color with both an icon and an unambiguous localized label:

| Status Code | Badge Class | Visual Style | Localized Arabic Label |
| :--- | :--- | :--- | :--- |
| **Low Risk** | `.hv-badge-success` | Soft Green + Dark Green Text | مطمئن / منخفض الخطورة |
| **Review Required** | `.hv-badge-warning` | Soft Amber + Dark Amber Text | بانتظار مراجعة الطبيب |
| **High Risk** | `.hv-badge-danger` | Soft Red + Dark Red Text | يحتاج رعاية عاجلة |
| **Telehealth / Info** | `.hv-badge-info` | Soft Blue + Dark Blue Text | استشارة فيديو |

---

## 6. Implementation Checklist & Governance

1. **Tokens Definition:** Defined in `:root` and `html[data-theme="light/dark"]` in `app/styles.css`.
2. **HTML Classes:** Standardize using `.hv-btn`, `.hv-btn-primary`, `.hv-btn-secondary`, `.hv-btn-outline`, `.hv-btn-soft`, `.hv-btn-danger`.
3. **Legacy Compatibility:** `.solid-button`, `.outline-button`, `.soft-button` inherit the same minimum 44px touch targets and focus rings.
4. **Audit Requirement:** Zero hardcoded inline button heights below 44px on any patient or doctor flow.
