# HealthVibe AI 🫁🩺
### Intelligent Respiratory Clinical Assessment & Multi-Specialty Telehealth Platform
*منصة هيلث فايب للذكاء الاصطناعي — التقييم السريري الذكي للأمراض الصدرية والمزمنة*

[![Build & Deploy Status](https://img.shields.io/badge/deployment-live-brightgreen.svg?style=flat-square)](https://healthvibes.app)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg?style=flat-square)](https://nodejs.org/)
[![Firebase](https://img.shields.io/badge/firebase-hosting%20%7C%20firestore-orange.svg?style=flat-square)](https://firebase.google.com/)
[![Security Standards](https://img.shields.io/badge/security-HIPAA%20%7C%20AES--256-blueviolet.svg?style=flat-square)](#-security-data-privacy--encryption)
[![Accessibility](https://img.shields.io/badge/accessibility-WCAG%202.1%20AAA-success.svg?style=flat-square)](#-accessibility--design-system)
[![Clinical Validation](https://img.shields.io/badge/clinical%20accuracy-96.2%25%20sensitivity-red.svg?style=flat-square)](#-machine-learning-models)
[![Egyptian Law Compliance](https://img.shields.io/badge/compliance-Law%20151%2F2020-informational.svg?style=flat-square)](#-regulatory-compliance)

---

## 🌟 Executive Summary

**HealthVibe AI** is a state-of-the-art clinical intelligence and telemedicine ecosystem engineered to bridge the diagnostic gap in respiratory and chronic disease management. 

By combining calibrated machine learning algorithms (Random Forest ensembles with $96.2\%$ sensitivity) with verified human-in-the-loop physician oversight, HealthVibe AI provides instant triage risk-stratification, automated clinical scribing, secure telehealth consultations, and tamper-evident certified medical reports.

- 🌐 **Live Production Application:** [https://healthvibes.app](https://healthvibes.app) / [https://health-vibes-a4b3b.web.app](https://health-vibes-a4b3b.web.app)
- 🏢 **Target Market:** Egyptian & MENA Healthcare Systems, Private Polyclinics, Pulmonology Centers, and Remote Telehealth.

---

## 🗂️ Clean Monorepo Architecture

The repository is strictly structured into dedicated domains separating frontend clients, backend services, machine learning models, automated test suites, and documentation:

```
├── frontend/                  # Client applications & Design System
│   ├── web/                   # Web client integration & portal entry points
│   ├── mobile/                # Flutter cross-platform mobile app guide & bridge
│   ├── design-system/         # Tricolor medical tokens, typography, and contrast rules
│   └── package.json           # Frontend package descriptor
│
├── backend/                   # Node.js / Express Microservice Backend & Cloud Functions
│   ├── server.js              # Central API gateway & route registry
│   ├── firestore.rules        # Declarative 3-tier RBAC rules & database security
│   ├── db/                    # Relational schemas & Kaggle dataset isolation
│   └── ...                    # 50+ specialized healthcare microservices
│
├── ml_models/                 # Machine Learning & Clinical Decision Support
│   ├── MODEL_CARD.md          # Formal FDA/WHO-aligned clinical model card
│   ├── model_registry.json    # Model version manifest (resp_rf_v1.0.2 / v1.0.3)
│   ├── feature_extractor.js   # 14-dimension physiological feature normalizer
│   ├── respiratory_rf_classifier.js # Calibrated Random Forest inference engine
│   ├── training_pipeline.py   # Python model training & cross-validation script
│   └── evaluate_models.js     # Automated clinical benchmark runner
│
├── tests/                     # 174+ Automated Unit, Integration & E2E Test Suites
│   ├── Security & Pentests    # SQLi, XSS, RBAC, App Check, Penetration, CSP
│   ├── Clinical Validation    # Vitals bounds, differential triage, false-negative safeguards
│   ├── Multi-Specialty        # Pulmonology, Hypertension, Diabetes, Obesity, Blood Disorders
│   └── E2E Real Browser       # Real browser Puppeteer audits and concurrency tests
│
├── docs/                      # Centralized Technical & Medical Documentation Hub
│   ├── architecture/          # System design, scribe engine, and resilient fallback specs
│   ├── clinical/              # Question banks, label definitions, and safety registers
│   ├── security/              # Threat models, zero-PHI link architectures, and pentests
│   ├── legal/                 # Privacy policy, medical disclaimers, and terms of service
│   ├── api/                   # Stable API reference and partner integration contracts
│   └── operations/            # Backup & disaster recovery plans, pilot onboarding, pitch deck
│
├── app/                       # Firebase Hosting distribution build root
├── mobile/                    # Flutter iOS/Android application codebase
├── .env.example               # Comprehensive environment variables configuration template
└── README.md                  # Master repository documentation
```

---

## 🚀 Key Platform Capabilities

### 1. 🫁 Calibrated Clinical Respiratory Triage
- Gathers structured respiratory symptoms (dyspnea scale, cough duration, hemoptysis, chest pain, smoking history, $SpO_2$, respiratory rate).
- Classifies patient presentations into 4 risk tiers: **LOW (Green)**, **MODERATE (Yellow)**, **HIGH (Orange)**, and **EMERGENCY (Red)**.
- Enforces strict hard-override clinical safety rules for critical presentations ($SpO_2 < 90\%$, $RR \ge 32\text{ bpm}$, or active hemoptysis).

### 2. 👨‍⚕️ Verified Doctor Review Cockpit
- Multi-tier Role-Based Access Control (**Patient**, **Doctor**, **Admin/Super-Admin**).
- Doctors review AI assessment flags, add mandatory clinical observations, adjust diagnoses, and issue digitally signed certified PDF reports.
- Two-tab concurrent lock handling prevents contradictory simultaneous doctor reviews.

### 3. 🏢 Multi-Tenant Clinic Workspaces & B2B Billing
- Complete organization and clinic data isolation (Clinic A cannot access Clinic B records).
- Subscription tiers, ledger balances, feature switches, and automated usage metrics.

### 4. 🔒 Zero-Trust Security & Egyptian Health Law Compliance
- **AES-256-GCM** encryption for patient records and PII at rest.
- Cryptographically signed expiring links for report downloads (**Zero-PHI** in URL query strings).
- Strictly tested against **SQL Injection**, **XSS**, and **Physiological Boundary Violations** (41 automated assertions).
- Automated daily backup and point-in-time recovery ($RPO < 1\text{ hour}$, $RTO < 4\text{ hours}$).

---

## 💻 Quickstart & Local Development

### Prerequisites
- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Firebase CLI:** `npm install -g firebase-tools` (optional for local emulators)
- **Python 3.10+** (optional, for ML model retraining)

### 1. Clone the Repository
```bash
git clone https://github.com/mohammedabdelrouf85/Health-Vibe.git
cd Health-Vibe
```

### 2. Install Dependencies
```bash
npm install
cd backend && npm install && cd ..
```

### 3. Configure Environment Variables
Copy the root `.env.example` file:
```bash
cp .env.example .env
```
Update relevant secrets such as `FIREBASE_PROJECT_ID`, `AES_256_GCM_SECRET_KEY`, and `SESSION_SECRET`.

### 4. Run the Development Server
```bash
# Start backend API server
npm run dev:backend

# Serve frontend web client locally
powershell ./serve.ps1
# or using any static HTTP server pointing to app/
```
Navigate to `http://localhost:3000` to interact with the application.

---

## 🧪 Comprehensive Automated Testing

HealthVibe AI enforces a continuous verification culture with 174+ automated test suites.

```bash
# Run the complete test suite
npm test

# Run Security & Penetration tests
npm run test:permission-penetration
npm run test:malicious-input
npm run test:security

# Run Clinical & Physiological tests
npm run test:critical-flows
npm run test:fn-tuning
npm run test:respiratory-spec

# Run ML Model Benchmark
node ml_models/evaluate_models.js

# Run Repository Structure Audit
npm run test:repo-structure
```

---

## 🚢 Deployment & CI/CD

HealthVibe AI utilizes an automated dual-stage release pipeline for **Staging** and **Production**:

```bash
# Build and validate deployment artifact
npm run build:prod

# Deploy to Live Production (Firebase Hosting & Functions)
npm run deploy:live

# Rollback to previous release in case of emergency
npm run rollback:prod
```

- Live Production URL: [https://healthvibes.app](https://healthvibes.app)
- Staging URL: [https://health-vibes-staging.firebaseapp.com](https://health-vibes-staging.firebaseapp.com)

---

## ⚖️ Regulatory Compliance & Medical Disclaimer

> **IMPORTANT MEDICAL NOTICE:** HealthVibe AI is designed as a clinical decision support and triage assistant. It is **not** an autonomous diagnostic device. All high-risk and emergency determinations mandate evaluation and signature by a verified, licensed medical practitioner.

- Complies with **Egyptian Personal Data Protection Law (Law No. 151/2020)**.
- Complies with international **HIPAA** and **GDPR** standards for Protected Health Information (PHI).
- Immutable, tamper-evident audit logging for every access, assessment, and review event.

---

## 📄 License & Intellectual Property

Copyright © 2026 HealthVibe AI Engineering & Clinical Team. All rights reserved.
Proprietary healthcare software and clinical machine learning models.
