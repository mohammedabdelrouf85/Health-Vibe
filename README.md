# 🩺 Health Vibe AI

> **Smart Respiratory Clinical Assessment & Triage Decision-Support Platform**  
> AI-assisted, physician-approved respiratory clinical triage, longitudinal health monitoring, and appointment scheduling.

---

## 📁 Project Architecture & Directories

Health Vibe AI is organized into clean, dedicated directories:

| Directory | Purpose |
|---|---|
| [`app/`](./app) | Frontend Single-Page Application (SPA) with modular component views |
| [`app/modules/`](./app/modules) | Feature modules (`auth/`, `patient/`, `doctor/`, `admin/`, `appointments/`, `assessment/`, `reports/`) |
| [`backend/`](./backend) | Secure Express & Firebase Cloud Functions API with clinical governance |
| [`docs/`](./docs) | Complete project documentation, specifications, clinical protocols, and PRDs |
| [`tests/`](./tests) | Comprehensive automated test suite (60+ unit, integration, and security suites) |
| [`reports/`](./reports) | Clinical audit reports, load testing, and E2E browser evaluations |
| [`records/`](./records) | Clinical feedback registers, audit trails, and migration registries |
| [`templates/`](./templates) | Clinical letters of intent, pilot onboarding templates, and agreements |

---

## 🚀 Quick Start

### 1. Installation
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run serve
# or run ./serve.ps1 / start-server.bat
```

### 3. Run Automated Tests
```bash
npm test
npm run test:modules
npm run test:appointments-audit
npm run test:concurrency
```

For complete architectural documentation, visit [`app/modules/README.md`](./app/modules/README.md) and [`docs/`](./docs).
