# HealthVibe AI — Backend Architecture (`backend/`)

This directory houses the Node.js / Express microservice architecture, Cloud Functions, database schemas, cryptographic security modules, and healthcare integrations for **HealthVibe AI**.

---

## 🏛️ Architecture Overview

The backend is built around a secure, HIPAA-ready, zero-trust medical architecture adhering to the Egyptian Personal Data Protection Law (Law No. 151/2020):

```
backend/
├── README.md                           # Backend system documentation and service catalog
├── server.js                           # Core Express API server and route handlers
├── firestore.rules                     # Declarative Firestore security and RBAC rules
├── db/                                 # Relational PostgreSQL and SQLite schemas
├── input-sanitization-service.js       # SQLi, XSS neutralization & physiological bounds
├── encryption-service.js               # AES-256-GCM medical record encryption at rest
├── password-security-service.js        # Bcrypt + SHA-256 peppered password hashing
├── audit-service.js                    # Tamper-evident immutable audit trails
├── clinical-reviewer-service.js        # Certified doctor validation and digital signing
├── notification-service.js             # Multi-channel notifications (WhatsApp, Email, Push)
└── ... (50+ specialized clinical services)
```

---

## 🔒 Security & Access Control (3-Tier RBAC)
1. **Patient Tier:** Access restricted strictly to own profile, appointments, and finalized reports.
2. **Doctor Tier:** Access restricted to assigned patient queues; requires verified medical license.
3. **Admin / Owner Tier:** System telemetry, clinic management, and billing with strict audit logging.

---

## 🚀 Running the Backend

```bash
# In development with local emulators
npm run dev:backend

# Or directly
node backend/server.js
```
