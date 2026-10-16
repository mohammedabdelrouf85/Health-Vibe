# Health Vibe AI - Doctor Assignment & Workload Balancing Specification
**Task ID:** Mohamed | #59 | مهمة تطوير (Task) | P0 - حرج جداً | Backend / Security | ربط المريض بالطبيب (Doctor Assignment)  
**Industry Benchmark:** One Medical Primary Care / Attending Physician Model  
**Standards Compliance:** HIPAA Security Rule, Egyptian Medical Syndicate Telehealth Regulations, GDPR Article 9 (Health Data)

---

## 1. Executive Summary & Clinical Rationale
In high-trust clinical environments like **One Medical**, patient care cannot exist in an anonymous vacuum. Every patient must have a designated, accountable **Attending Physician (الطبيب المعالج المخصص)** who oversees the patient's longitudinal respiratory assessments, clinical history, and diagnostic reports.

Health Vibe AI enforces this relationship via a **Dual-Mode Doctor Assignment Engine**:
1. **Mode A — Patient Choice (اختيار المريض)**:
   Patients can browse and select their preferred certified Pulmonologist from active, verified practitioners.
2. **Mode B — Automatic Workload-Balanced Distribution (التوزيع التلقائي العادل)**:
   If a patient does not select a specific clinician (or opts for automated matching), the system assigns an available verified Pulmonologist based on a **Least-Connection / Least-Loaded algorithm**, ensuring no single doctor is overwhelmed while maintaining rapid SLA turnaround times (< 15 minutes).

---

## 2. Architecture & Data Schema

### 2.1 Attending Physician Data Contract
Every patient's record across both Firestore and the relational PostgreSQL database encapsulates an immutable assignment block:

```json
{
  "attendingPhysician": {
    "doctorId": "dr_tarek_mahmoud_44821",
    "doctorUid": "dr_tarek_mahmoud_44821",
    "doctorName": "د. طارق محمود",
    "doctorNameEn": "Dr. Tarek Mahmoud",
    "syndicateId": "DOC-PULMO-44821",
    "specialty": "Pulmonology (أمراض الصدر والحساسية)",
    "clinicId": "clinic-pulmo-care",
    "clinicName": "مركز رعاية الجهاز التنفسي التخصصي (معتمد)",
    "assignmentMode": "patient_choice | auto_workload_balanced",
    "assignedBy": "patient | system | admin",
    "assignedAt": "2026-10-17T01:45:00.000Z",
    "status": "active"
  }
}
```

### 2.2 Relational PostgreSQL Schema Mapping
- **`patients` Table**:
  - `assigned_doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL`
  - Enforced via Row Level Security (RLS) policy `doctor_assigned_patients_only`.
- **`doctor_profiles` Table**:
  - `active_cases_count INT NOT NULL DEFAULT 0`
  - `max_capacity INT NOT NULL DEFAULT 50`
  - `verification_status VARCHAR(32) NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended'))`
  - `sla_minutes INT NOT NULL DEFAULT 15`

---

## 3. Workload-Balancing Algorithm (Mode B)

When an automatic assignment is triggered:
1. **Filter Active Verified Pool**:
   $$\text{Eligible Doctors} = \{ d \in \text{Doctors} \mid d.\text{status} = \text{'verified'} \land d.\text{license} = \text{'active'} \land d.\text{activeCases} < d.\text{maxCapacity} \land d.\text{available} = \text{true} \}$$
2. **Caseload Minimization**:
   $$d^* = \arg\min_{d \in \text{Eligible Doctors}} (d.\text{activeCasesCount})$$
3. **Tie-Breaker Rule**:
   If multiple physicians have identical minimal active caseloads, the physician with the oldest assignment timestamp ($\min(d.\text{lastAssignedAt})$) is chosen to maintain uniform round-robin distribution.
4. **Caseload Counter Atomic Increment**:
   The chosen physician's `activeCasesCount` is atomically incremented by 1 in the relational database and cache.

---

## 4. Zero-Trust Access Control & Horizontal Isolation

1. **Horizontal Boundary Enforcement**:
   A doctor cannot query or view medical profiles or assessments of patients not assigned to them (`403 PATIENT_NOT_ASSIGNED_TO_DOCTOR`).
2. **Reassignment Audit Trail**:
   When reassignment occurs (e.g., patient moves clinic, or doctor takes sabbatical):
   - Previous doctor's `activeCasesCount` is decremented.
   - New doctor is assigned.
   - An immutable audit entry is appended to `audit_logs` tracking `actorId`, `actorRole`, `previousDoctorId`, `newDoctorId`, and `clinicalReason`.

---

## 5. API Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/doctors/available-pulmonologists` | Authenticated | Lists verified pulmonologists eligible for assignment. |
| `POST` | `/api/patient/assign-doctor` | Patient / Admin | Assigns attending physician (Mode A or Mode B). |
| `GET` | `/api/patient/assigned-doctor` | Patient / Assigned Doctor / Admin | Retrieves assigned attending physician details. |
| `POST` | `/api/patient/reassign-doctor` | Patient / Admin | Reassigns doctor with formal reason and audit trail. |

---

## 6. Frontend Patient Experience (One Medical UX)

1. **Medical Onboarding (`#screen-complete-medical-profile`)**:
   - `cmpDoctorSelect` dropdown allows selecting verified pulmonologists directly or choosing **"توزيع تلقائي عادل على أطباء الصدر المتاحين (One Medical Model)"**.
2. **Patient Dashboard (`#screen-patient`)**:
   - Displays a verified Attending Physician badge (`#patientAssignedDoctorCard`) showcasing the doctor's name, Syndicate ID, specialty, and clinic affiliation.
   - Informs the patient that their cases are evaluated by their designated clinician.
