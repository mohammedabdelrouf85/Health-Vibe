-- =============================================================================
-- HEALTH VIBE AI: SECURE RELATIONAL DATABASE SCHEMA (PostgreSQL / Supabase)
-- Reference: PRD Page 16 - Technical Correction & Architecture Guideline:
-- "Kaggle is NOT a Production Database. Kaggle is strictly an offline training
-- dataset repository. Patient accounts, medical profiles, and Patient History
-- MUST reside in a dedicated, secure managed relational database (PostgreSQL/Supabase)."
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ACCOUNTS & IDENTITY (Users, Credentials & RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) CHECK (password_hash IS NULL OR password_hash ~ '^\$(2[abxy]|argon2id)\$'),
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'clinic_admin', 'support', 'ops', 'clinical_qa', 'super_admin')),
    phone VARCHAR(32),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_verification', 'deactivated')),
    preferred_language VARCHAR(8) NOT NULL DEFAULT 'ar' CHECK (preferred_language IN ('ar', 'en')),
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
CREATE INDEX IF NOT EXISTS idx_accounts_firebase_uid ON accounts(firebase_uid);

-- -----------------------------------------------------------------------------
-- 2. DOCTOR PROFILES & VERIFICATION
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    syndicate_id VARCHAR(64) NOT NULL UNIQUE,
    specialty VARCHAR(100) NOT NULL DEFAULT 'Pulmonology',
    verification_status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
    verification_documents JSONB DEFAULT '[]'::jsonb,
    clinic_id VARCHAR(128),
    clinic_name VARCHAR(150),
    consultation_fee NUMERIC(10, 2) DEFAULT 0.00,
    active_cases_count INT NOT NULL DEFAULT 0,
    sla_minutes INT NOT NULL DEFAULT 15,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by_admin_id UUID REFERENCES accounts(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doctor_profiles_syndicate ON doctor_profiles(syndicate_id);
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_status ON doctor_profiles(verification_status);

-- -----------------------------------------------------------------------------
-- 3. PATIENTS & CLINICAL PROFILES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    date_of_birth DATE,
    gender VARCHAR(16) CHECK (gender IN ('male', 'female', 'other', 'undisclosed')),
    blood_group VARCHAR(8) CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')),
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(32),
    assigned_doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL,
    chronic_conditions JSONB DEFAULT '[]'::jsonb,
    allergies JSONB DEFAULT '[]'::jsonb,
    current_medications JSONB DEFAULT '[]'::jsonb,
    medical_consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    consent_accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_account_id ON patients(account_id);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients(assigned_doctor_id);

-- -----------------------------------------------------------------------------
-- 4. CLINICAL CASES & PRE-TRIAGE (Operational cases)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    assigned_doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL,
    disease_module VARCHAR(64) NOT NULL DEFAULT 'respiratory' CHECK (disease_module IN ('respiratory', 'diabetes', 'hypertension', 'obesity', 'blood_disorders')),
    triage_level VARCHAR(32) NOT NULL DEFAULT 'moderate' CHECK (triage_level IN ('routine', 'moderate', 'urgent', 'critical')),
    vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
    symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_risk_score NUMERIC(5, 4),
    ai_confidence NUMERIC(5, 4),
    ai_differential_analysis JSONB DEFAULT '{}'::jsonb,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'pending_doctor_review' CHECK (approval_status IN ('pending_doctor_review', 'approved_certified', 'rejected', 'escalated')),
    doctor_notes TEXT,
    doctor_diagnosis TEXT,
    doctor_signature JSONB,
    certified_at TIMESTAMP WITH TIME ZONE,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    encrypted_phi_payload TEXT,
    encryption_iv VARCHAR(32),
    encryption_auth_tag VARCHAR(32),
    encryption_algorithm VARCHAR(32) DEFAULT 'AES-256-GCM',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_case_approved_requires_verified_doctor_signature CHECK (
        approval_status != 'approved_certified' OR (
            assigned_doctor_id IS NOT NULL 
            AND certified_at IS NOT NULL 
            AND doctor_notes IS NOT NULL 
            AND doctor_signature IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_cases_patient_id ON clinical_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_doctor_id ON clinical_cases(assigned_doctor_id);
CREATE INDEX IF NOT EXISTS idx_cases_approval_status ON clinical_cases(approval_status);

-- -----------------------------------------------------------------------------
-- 5. PATIENT HISTORY & LONGITUDINAL MEDICAL TIMELINE (PRD Section 9 & 13.1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    case_id UUID REFERENCES clinical_cases(id) ON DELETE SET NULL,
    disease_module VARCHAR(64) NOT NULL CHECK (disease_module IN ('respiratory', 'diabetes', 'hypertension', 'obesity', 'blood_disorders', 'general_consultation')),
    event_type VARCHAR(64) NOT NULL DEFAULT 'assessment_certified' CHECK (event_type IN ('assessment_certified', 'vitals_logged', 'doctor_note_added', 'prescription_issued', 'lab_result_attached')),
    clinical_revision INT NOT NULL DEFAULT 1,
    summary TEXT NOT NULL,
    diagnosis TEXT,
    certified_by_doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL,
    doctor_name VARCHAR(150),
    vitals_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    symptoms_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    treatment_recommendations JSONB DEFAULT '[]'::jsonb,
    report_pdf_url TEXT,
    report_qr_hash VARCHAR(128),
    is_patient_visible BOOLEAN NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_history_patient_id ON patient_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_history_recorded_at ON patient_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_history_module ON patient_history(disease_module);

-- -----------------------------------------------------------------------------
-- 6. IMMUTABLE SECURITY & AUDIT TRAIL (HIPAA, GDPR Art. 30, PRD Medical Audit)
-- Records every VIEW, MODIFY, and APPROVE operation on clinical/medical records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target_record VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    actor_role VARCHAR(32), -- backwards-compatible alias for role
    resource_type VARCHAR(64),
    resource_id VARCHAR(128),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_record);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- STRICT IMMUTABILITY TRIGGER: Prevents any UPDATE or DELETE operations on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_logs_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_AUDIT_LOG_VIOLATION: audit_logs records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_tampering ON audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_tampering
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_tampering();

-- -----------------------------------------------------------------------------
-- 7. ENCRYPTED CLOUD REPORTS (AES-256-GCM AT-REST CLOUD STORAGE) - PRD Page 10
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encrypted_cloud_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR(128) UNIQUE NOT NULL,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    case_id UUID REFERENCES clinical_cases(id) ON DELETE CASCADE,
    storage_path VARCHAR(512) NOT NULL,
    cloud_bucket VARCHAR(128) NOT NULL DEFAULT 'health-vibes-a4b3b.firebasestorage.app',
    encryption_algorithm VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
    key_id VARCHAR(64) NOT NULL DEFAULT 'hv-aes256-key-v1',
    encryption_iv VARCHAR(32) NOT NULL,
    encryption_auth_tag VARCHAR(32) NOT NULL,
    original_size_bytes INT NOT NULL,
    encrypted_size_bytes INT NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    server_side_encryption VARCHAR(32) NOT NULL DEFAULT 'AES256',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_encrypted_reports_patient ON encrypted_cloud_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_reports_case ON encrypted_cloud_reports(case_id);

-- -----------------------------------------------------------------------------
-- 8. KAGGLE TRAINING EXPERIMENTS METADATA (STRICTLY ISOLATED FROM OPERATIONAL DATA)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_training_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(128) NOT NULL,
    model_version VARCHAR(32) NOT NULL,
    training_data_source VARCHAR(255) NOT NULL, -- e.g., 'kaggle/respiratory-sound-database-v2'
    dataset_sha256 VARCHAR(64) NOT NULL,
    license_type VARCHAR(64) NOT NULL, -- e.g., 'CC-BY-4.0', 'Open-Database-License'
    features_list JSONB NOT NULL,
    training_samples_count INT NOT NULL,
    evaluation_metrics JSONB NOT NULL, -- accuracy, precision, recall, f1, auc
    confusion_matrix JSONB,
    zero_pii_certified BOOLEAN NOT NULL DEFAULT TRUE,
    trained_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ml_training_model_version ON ml_training_registry(model_name, model_version);

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Patients can only view and edit their own patient records
CREATE POLICY patient_self_access ON patients
    FOR ALL
    USING (account_id = auth.uid());

-- Patients can only view their certified patient history
CREATE POLICY patient_history_self_view ON patient_history
    FOR SELECT
    USING (
        patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
        AND is_patient_visible = TRUE
    );

-- Doctors can view history of their assigned patients
CREATE POLICY doctor_patient_history_access ON patient_history
    FOR ALL
    USING (
        certified_by_doctor_id IN (SELECT id FROM doctor_profiles WHERE account_id = auth.uid())
        OR patient_id IN (SELECT id FROM patients WHERE assigned_doctor_id IN (SELECT id FROM doctor_profiles WHERE account_id = auth.uid()))
    );

-- Doctors can ONLY view patients assigned to them
CREATE POLICY doctor_assigned_patients_only ON patients
    FOR SELECT
    USING (
        assigned_doctor_id IN (SELECT id FROM doctor_profiles WHERE account_id = auth.uid())
        OR id IN (SELECT patient_id FROM clinical_cases WHERE assigned_doctor_id IN (SELECT id FROM doctor_profiles WHERE account_id = auth.uid()))
    );

-- Doctors can ONLY view and manage clinical cases assigned to them
CREATE POLICY doctor_assigned_cases_only ON clinical_cases
    FOR ALL
    USING (
        assigned_doctor_id IN (SELECT id FROM doctor_profiles WHERE account_id = auth.uid())
    );

-- Audit logs are strictly INSERT and SELECT only (No UPDATE or DELETE allowed under any circumstance)
CREATE POLICY audit_logs_immutable_insert ON audit_logs
    FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY audit_logs_immutable_select ON audit_logs
    FOR SELECT
    USING (TRUE);

