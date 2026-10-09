/**
 * Health Vibe AI - Security & Unusual Access Monitoring Type Declarations
 */

export type UnusualAccessType =
  | 'RAPID_FAILED_LOGINS'
  | 'HIGH_VOLUME_EHR_ACCESS'
  | 'PRIVILEGED_ROUTE_PROBE'
  | 'MALICIOUS_PATH_PROBE'
  | 'CROSS_TENANT_VIOLATION'
  | 'OFF_HOURS_ACTIVITY_SPIKE';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AnomalyStatus = 'ACTIVE' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';

export interface UnusualAccessAlert {
  alertId: string;
  type: UnusualAccessType;
  severity: AnomalySeverity;
  riskScore: number; // 0 to 100
  status: AnomalyStatus;
  targetIdentifier: string;
  description: string;
  detectedAt: string;
  updatedAt: string;
  clientFingerprint: string;
  userAgent?: string | null;
  ipSubnetMask: string;
  metadata: Record<string, any>;
  escalatedIncidentId?: string | null;
  resolution?: {
    resolvedBy: string;
    resolvedAt: string;
    resolutionNotes: string;
    isFalsePositive: boolean;
  } | null;
}

export interface SecurityMetrics {
  totalMonitoredRequests: number;
  maliciousPathProbesBlocked: number;
  rapidLoginFailuresDetected: number;
  ehrHarvestingAlertsDetected: number;
  crossTenantViolationsDetected: number;
  privilegedProbesDetected: number;
  totalAlertsGenerated: number;
  currentlyActiveAlerts: number;
  criticalActiveAlerts: number;
  timestamp: string;
}
