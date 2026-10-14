# Health Vibe AI - فصل بيانات التدريب عن التشغيل وقاعدة البيانات العلائقية (PRD Page 16)

## 📌 1. المرجع والمتطلب التقني الإلزامي من وثيقة متطلبات المنتج (PRD)

تنص **الصفحة 16 (القسم 13.1 - تصحيح تقني مهم)** من وثيقة متطلبات المنتج (PRD) على الآتي حرفياً:

> **تصحيح تقني مهم:**
> **"Kaggle ليس Production Database.** يمكن استخدامه كمصدر Datasets للتدريب/التجربة فقط.
> قاعدة بيانات المرضى والحسابات والـ Patient History يجب أن تكون **قاعدة بيانات آمنة منفصلة علائقية مُدارة (PostgreSQL / Supabase)** في مرحلة الإنتاج."

---

## 🛡️ 2. مبدأ الفصل المعماري التام (Architectural Separation Boundary)

```mermaid
graph TD
    subgraph "Machine Learning Offline Sandbox (تدريب وتحليل فقط)"
        K1[Kaggle Datasets<br/>Respiratory Sound Database / Benchmarks] -->|Read-only Ingestion| K2[Data Preprocessing & De-identification]
        K2 -->|Zero-Leakage Checks| K3[Model Training & Cross-Validation]
        K3 -->|Statistical Metrics & Artifacts Only| K4[Trained Model Weights<br/>Decision Tree / Classifier Matrix]
    end

    subgraph "Operational Production Boundary (بيئة التشغيل المباشرة)"
        P1[Mobile / Web Frontend<br/>Patients, Doctors, Clinics] -->|HTTPS / TLS 1.3 + JWT| API[Secure Backend API]
        API -->|Decision Support Only| K4
        API -->|Strict RLS & ACID Transactions| RDBMS[(Managed Relational Database<br/>PostgreSQL / Supabase)]
        
        subgraph "Secure Relational Tables"
            R1[accounts<br/>Auth, Credentials & Roles]
            R2[patients<br/>Demographics & Consents]
            R3[doctor_profiles<br/>Syndicate Licensure & SLAs]
            R4[clinical_cases<br/>Pre-Triage & Vitals SpO2]
            R5[patient_history<br/>Longitudinal Certified Timeline]
            R6[audit_logs<br/>Immutable HIPAA & GDPR Trail]
        end
        
        RDBMS --- R1
        RDBMS --- R2
        RDBMS --- R3
        RDBMS --- R4
        RDBMS --- R5
        RDBMS --- R6
    end
```

---

## 🔒 3. قواعد الحماية الصارمة لبيانات المرضى (Zero-Leakage Protection)

1. **حظر تام لاستخدام Kaggle كقاعدة بيانات تشغيلية:**
   - خدمة `KaggleTrainingService` تفرض استثناء معماري فوري (`KAGGLE_NOT_PRODUCTION_DATABASE`) عند محاولة استدعاء أي عمليات حفظ حسابات أو سجلات طبية على مصادر تدريب Kaggle.
   - خدمة `RelationalDatabaseService` تفحص منشأ البيانات وتمنع حقن أي سجلات غير موثقة في الجداول التشغيلية (`KAGGLE_OPERATIONAL_WRITE_BLOCKED`).

2. **التدريب على بيانات منزوعة الهوية (Safe Harbor De-identification):**
   - تخضع أي عينة تدريبية لفحص إلزامي لخلوها من كافة المعرفات الـ 18 وفق معيار HIPAA (الأسماء، الهواتف، الأرقام القومية، العناوين، وبطاقات الدفع).

3. **حفظ الحسابات والـ Patient History في قاعدة بيانات علائقية متوافقة مع ACID:**
   - جدول `accounts`: تشفير كلمات المرور، تتبع عدد محاولات الدخول الخاطئة لمنع هجمات القوة الغاشمة، وفصل الصلاحيات (RBAC).
   - جدول `patient_history`: سجل طبي زمني غير قابل للتعديل (Immutable Append-only)، يوثق رقم المراجعة السريرية (`clinical_revision`)، توقيع الطبيب المعالج، لقطة المؤشرات الحيوية (`vitals_snapshot`)، والتوصيات العلاجية.

---

## 🗄️ 4. مخطط الكيانات والعلاقات (Relational ERD)

```mermaid
erDiagram
    accounts ||--o| doctor_profiles : "1 to 1"
    accounts ||--o| patients : "1 to 1"
    accounts ||--o{ audit_logs : "creates"
    patients ||--o{ clinical_cases : "submits"
    patients ||--o{ patient_history : "owns"
    doctor_profiles ||--o{ clinical_cases : "reviews"
    doctor_profiles ||--o{ patient_history : "certifies"
    clinical_cases ||--o| patient_history : "generates upon approval"

    accounts {
        uuid id PK
        string email UK
        string password_hash
        string full_name
        string role
        boolean email_verified
        boolean is_owner
        timestamp created_at
    }

    patients {
        uuid id PK
        uuid account_id FK
        date date_of_birth
        string blood_group
        uuid assigned_doctor_id FK
        boolean medical_consent_accepted
    }

    doctor_profiles {
        uuid id PK
        uuid account_id FK
        string syndicate_id UK
        string specialty
        string verification_status
        int sla_minutes
    }

    clinical_cases {
        uuid id PK
        uuid patient_id FK
        uuid assigned_doctor_id FK
        string disease_module
        string triage_level
        jsonb vitals
        string approval_status
    }

    patient_history {
        uuid id PK
        uuid patient_id FK
        uuid case_id FK
        string disease_module
        int clinical_revision
        string summary
        string diagnosis
        uuid certified_by_doctor_id FK
        jsonb vitals_snapshot
        jsonb treatment_recommendations
        timestamp recorded_at
    }

    audit_logs {
        uuid id PK
        uuid account_id FK
        string action
        string resource_type
        string resource_id
        timestamp timestamp
    }
```

---

## 🛡️ 5. سياسات أمان مستوى الصفوف (Row Level Security - RLS)

تضمن السياسات في [schema.sql](file:///d:/MY%20PC/Coding/Health%20Vibe%20Ai/backend/db/schema.sql) الآتي على مستوى محرك قاعدة البيانات:
- **خصوصية المريض:** لا يستطيع المريض قراءة أو تعديل أي سجل في `patients` أو `patient_history` إلا إذا كان مرتبطاً بـ `auth.uid()` الخاص به.
- **حدود وصول الطبيب:** لا يستطيع الطبيب قراءة السجلات السريرية والـ History إلا للمرضى المسندين إليه رسمياً أو الحالات التي قام بمراجعتها واعتمادها.
- **جدول التدقيق غير القابل للتعديل:** جدول `audit_logs` يقبل الإضافة فقط (`FOR INSERT WITH CHECK (TRUE)`) ومحمي من أي عمليات `UPDATE` أو `DELETE` لضمان الامتثال لمتطلبات HIPAA و GDPR Art. 30.
