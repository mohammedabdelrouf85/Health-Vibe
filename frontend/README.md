# HealthVibe AI — Frontend Architecture (`frontend/`)

This directory houses the frontend client applications, design systems, and user interface modules for **HealthVibe AI**.

---

## 🏛️ Architecture Overview

The HealthVibe AI client suite is architected to provide accessible, multi-lingual (Arabic & English), and responsive experiences across web and mobile platforms:

```
frontend/
├── README.md               # Frontend system overview and engineering guidelines
├── package.json            # Frontend workspace dependencies and scripts
├── web/                    # Web client portal (Patient, Doctor, Admin, Clinic Landing)
├── mobile/                 # Cross-platform Flutter mobile application architecture
└── design-system/          # Tricolor medical tokens, typography, and accessibility guidelines
```

---

## 🌐 1. Web Client (`frontend/web/`)

- **Hosting & Serving:** Deployed to Firebase Hosting (`public: "app"`).
- **Core Technology:** Clean Vanilla JavaScript (ES2022+), HTML5, and responsive CSS3 variables without bulky framework bloat, guaranteeing sub-second initial load times across 3G mobile networks.
- **Portals & Roles:**
  - **Patient Portal:** Seamless symptom assessment questionnaire, longitudinal progress graphs, appointment booking, certified PDF report viewer.
  - **Doctor Cockpit:** Workload queue, differential diagnosis validation, audio consultation recording, digital signature, and secure report dispatch.
  - **Admin Workspace:** System analytics, doctor verification management, role governance, clinic subscriptions, and audit logs.
  - **Clinic Landing:** Bilingual B2B SaaS presentation, ROI calculator, and demo request pipeline.

---

## 📱 2. Mobile Client (`frontend/mobile/` & `mobile/`)

- **Framework:** Flutter / Dart (iOS, Android, and Desktop builds).
- **State Management:** Riverpod / Clean Architecture.
- **Offline Capabilities:** Local SQLite caching for offline symptom entries and asynchronous sync with Firebase Firestore.

---

## 🎨 3. Design System (`frontend/design-system/`)

### Tricolor Medical Risk Palette
- 🟢 **Low Risk (Green):** `#10b981` (Success, stable vitals, routine follow-up).
- 🟡 **Moderate Risk (Yellow/Amber):** `#f59e0b` (Caution, clinical review advised within 48h).
- 🔴 **High Risk / Emergency (Red):** `#ef4444` (Immediate physician intervention required).

### Accessibility & Internationalization (WCAG 2.1 AAA)
- **Bilingual Support:** Full Right-to-Left (RTL) Arabic typography (`Tajawal`, `Cairo`) and Left-to-Right (LTR) English (`Inter`).
- **Contrast Ratio:** $> 7:1$ across all primary interactive elements and text in both Light and Dark themes.
- **Responsive Layout:** Adaptive breakpoints for Mobile ($< 640\text{px}$), Tablet ($640-1024\text{px}$), and Desktop ($> 1024\text{px}$).
