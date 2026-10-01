/**
 * Health Vibe AI - Clinical Schemas & EHR Core Type Definitions
 * Ambient TypeScript type declarations for gradual type-safety across backend & client.
 */

export type CaseStatus = 
  | 'submitted'
  | 'triaged'
  | 'assigned'
  | 'under_review'
  | 'more_info_requested'
  | 'approved'
  | 'escalated'
  | 'rejected'
  | 'closed';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface VitalSigns {
  spo2?: number;
  pulse?: number;
  respiratoryRate?: number;
  temperature?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
}

export interface PatientDemographics {
  patientId: string;
  name: string;
  email?: string;
  phone?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  chronicConditions?: string[];
  allergies?: string[];
}

export interface TriggeredClinicalRule {
  id: string;
  ar: string;
  en: string;
  points: number;
  version: string;
}

export interface TriageEvaluation {
  ruleEngineVersion: string;
  ruleScorePoints: number;
  ruleScoreLabelAr: string;
  ruleScoreLabelEn: string;
  priority: PriorityLevel;
  triggeredRules: TriggeredClinicalRule[];
  isClinicallyValidated: boolean;
}

export interface StatusHistoryEntry {
  status: CaseStatus;
  changedAt: string;
  changedBy: string;
  changedByName?: string;
  changedByRole: 'patient' | 'doctor' | 'admin' | 'system';
  note?: string;
}

export interface ClinicalCase {
  id: string;
  patientId: string;
  clinicId?: string | null;
  status: CaseStatus;
  priority: PriorityLevel;
  vitals: VitalSigns;
  symptoms: string[];
  durationDays: number;
  triage: TriageEvaluation;
  statusHistory: StatusHistoryEntry[];
  assignedDoctorId?: string | null;
  clinicalDiagnosis?: string | null;
  prescriptions?: string[];
  recommendations?: string[];
  submittedAt: string;
  updatedAt: string;
}

export interface ExtractedLabItem {
  id: string;
  testKey: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
  confidence: number;
  rawSnippet: string;
  isManuallyCorrected: boolean;
  correctionHistory: Array<{
    itemId: string;
    originalState: { value: string; unit: string };
    correctedState: { value: string; unit: string };
    correctedBy: string;
    timestamp: string;
  }>;
}

export interface OcrDraft {
  draftId: string;
  fileId: string;
  caseId?: string | null;
  patientId?: string | null;
  reviewStatus: 'draft' | 'under_review' | 'approved_by_doctor' | 'rejected_by_doctor';
  isApprovedFact: boolean;
  requiresDoctorReview: boolean;
  confidence: number;
  qualityScore: 'high' | 'medium' | 'poor';
  tests: ExtractedLabItem[];
  pageImage: string;
  extractedText: string;
  createdAt: string;
}
