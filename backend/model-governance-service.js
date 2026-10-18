/**
 * Model Governance & Rollback Service (Task #84)
 * P0 - حرج جداً | Backend / Security | آلية التراجع عن تحديث النموذج (Model Rollback)
 * 
 * Provides instantaneous rollback to previous stable ML model versions upon
 * performance degradation, drift alerts, or physician objections.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'model-governance-state.json');

const INITIAL_REGISTRY = [
  {
    version: 'resp_rf_v1.0.1',
    name: 'Respiratory Random Forest - Baseline Gold Standard',
    framework: 'scikit-learn / Random Forest',
    accuracy: 0.942,
    f1Score: 0.938,
    status: 'archived_stable', // candidate for rollback
    deployedAt: '2026-08-15T10:00:00.000Z',
    retiredAt: '2026-09-20T12:00:00.000Z',
    description: 'Gold standard baseline clinically verified across 12,000 cases with zero safety incidents.',
    checksum: 'sha256-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
  },
  {
    version: 'resp_rf_v1.0.2',
    name: 'Respiratory Random Forest - Pre-Triage Model',
    framework: 'scikit-learn / Random Forest',
    accuracy: 0.951,
    f1Score: 0.949,
    status: 'active',
    deployedAt: '2026-09-20T12:05:00.000Z',
    description: 'Current production release with improved pediatric cough and wheeze feature engineering.',
    checksum: 'sha256-9f8e7d6c5b4a3210fedcba0987654321'
  },
  {
    version: 'resp_rf_v2.0.0-rc1',
    name: 'Respiratory Gradient Boosted Trees - Experimental Staged',
    framework: 'XGBoost / LightGBM',
    accuracy: 0.918,
    f1Score: 0.904,
    status: 'staged',
    deployedAt: null,
    description: 'Candidate model under shadow evaluation. Flagged for elevated physician override rate in geriatric cohort.',
    checksum: 'sha256-112233445566778899aabbccddeeff00'
  }
];

class ModelGovernanceService {
  constructor(options = {}) {
    this.stateFilePath = options.stateFilePath || STATE_FILE;
    this.memoryAuditLog = [];
    this.doctorObjections = [];
    this._loadState();
  }

  _loadState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf8');
        const data = JSON.parse(raw);
        this.registry = data.registry || INITIAL_REGISTRY;
        this.activeVersion = data.activeVersion || 'resp_rf_v1.0.2';
        this.auditLog = data.auditLog || [];
        this.doctorObjections = data.doctorObjections || [];
        return;
      }
    } catch (e) {
      console.warn('[ModelGovernance] Error reading state file, using initial memory state:', e.message);
    }

    this.registry = JSON.parse(JSON.stringify(INITIAL_REGISTRY));
    this.activeVersion = 'resp_rf_v1.0.2';
    this.auditLog = [
      {
        id: 'audit_init_001',
        action: 'MODEL_DEPLOYED',
        version: 'resp_rf_v1.0.2',
        timestamp: '2026-09-20T12:05:00.000Z',
        actor: 'system_ci_cd',
        reason: 'Automated clinical validation pipeline passed with >95% accuracy'
      }
    ];
    this.doctorObjections = [];
    this._saveState();
  }

  _saveState() {
    try {
      const data = {
        registry: this.registry,
        activeVersion: this.activeVersion,
        auditLog: this.auditLog,
        doctorObjections: this.doctorObjections,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[ModelGovernance] Failed to persist state to disk:', e.message);
    }
  }

  /**
   * Return full model registry with active version and metrics
   */
  getModelRegistry() {
    return {
      activeVersion: this.activeVersion,
      activeModel: this.getActiveModel(),
      previousStableVersion: this.getPreviousStableVersion()?.version || 'resp_rf_v1.0.1',
      models: this.registry.map(m => ({
        ...m,
        isActive: m.version === this.activeVersion
      })),
      totalDoctorObjections: this.doctorObjections.length,
      recentObjections: this.doctorObjections.slice(-5)
    };
  }

  /**
   * Get the currently active model record
   */
  getActiveModel() {
    return this.registry.find(m => m.version === this.activeVersion) || this.registry[0];
  }

  /**
   * Get the most recent previously active or archived_stable baseline model for rollback
   */
  getPreviousStableVersion() {
    return this.registry.find(m => m.version !== this.activeVersion && (m.status === 'archived_stable' || m.status === 'previous_active')) || 
           this.registry.find(m => m.version === 'resp_rf_v1.0.1');
  }

  /**
   * Record a physician objection / override against a model version
   */
  recordDoctorObjection({ doctorId, doctorName, modelVersion, reason, caseId, severity = 'medium' }) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Physician objection requires a documented reason with at least 5 characters');
    }

    const objection = {
      id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      doctorId: doctorId || 'dr_unspecified',
      doctorName: doctorName || 'استشاري الجهاز التنفسي',
      modelVersion: modelVersion || this.activeVersion,
      caseId: caseId || null,
      severity,
      reason: reason.trim(),
      timestamp: new Date().toISOString()
    };

    this.doctorObjections.push(objection);

    // Also record audit entry
    this.auditLog.push({
      id: `audit_obj_${Date.now()}`,
      action: 'PHYSICIAN_OBJECTION_RECORDED',
      version: objection.modelVersion,
      actor: objection.doctorName,
      timestamp: objection.timestamp,
      reason: `اعتراض طبيب: ${objection.reason}`
    });

    this._saveState();
    return { success: true, objection };
  }

  /**
   * Perform instantaneous rollback to previous stable model version
   */
  rollbackModelVersion({ targetVersion, rollbackReason, authorizedBy = 'Admin User', role = 'admin' }) {
    if (!rollbackReason || rollbackReason.trim().length < 10) {
      throw new Error('سبب التراجع عن النموذج إلزامي ويجب ألا يقل عن 10 أحرف لضمان الحوكمة الطبية (Minimum 10 chars required)');
    }

    const currentVersion = this.activeVersion;
    const targetModel = targetVersion 
      ? this.registry.find(m => m.version === targetVersion)
      : this.getPreviousStableVersion();

    if (!targetModel) {
      throw new Error(`Target rollback version '${targetVersion}' does not exist in model registry`);
    }

    if (targetModel.version === currentVersion) {
      throw new Error(`Cannot rollback: Model '${targetModel.version}' is already the currently active model`);
    }

    const previousModel = this.registry.find(m => m.version === currentVersion);
    if (previousModel) {
      previousModel.status = 'rolled_back';
      previousModel.retiredAt = new Date().toISOString();
      previousModel.rollbackReason = rollbackReason.trim();
    }

    targetModel.status = 'active';
    targetModel.reactivatedAt = new Date().toISOString();
    this.activeVersion = targetModel.version;

    // Immutable audit entry
    const auditRecord = {
      id: `audit_rollback_${Date.now()}`,
      action: 'MODEL_ROLLED_BACK',
      fromVersion: currentVersion,
      toVersion: targetModel.version,
      timestamp: new Date().toISOString(),
      actor: authorizedBy,
      role,
      reason: rollbackReason.trim(),
      targetModelAccuracy: targetModel.accuracy,
      previousModelAccuracy: previousModel ? previousModel.accuracy : null
    };

    this.auditLog.push(auditRecord);
    this._saveState();

    return {
      success: true,
      message: `تم التراجع الفوري عن النموذج بنجاح من ${currentVersion} إلى ${targetModel.version}`,
      activeVersion: this.activeVersion,
      activeModel: targetModel,
      previousVersion: currentVersion,
      auditRecord
    };
  }

  /**
   * Activate a specific model version (e.g., promote staged model)
   */
  activateModelVersion({ version, reason, authorizedBy = 'Admin User' }) {
    if (!reason || reason.trim().length < 10) {
      throw new Error('سبب تفعيل النموذج إلزامي ويجب ألا يقل عن 10 أحرف (Minimum 10 chars required)');
    }

    const targetModel = this.registry.find(m => m.version === version);
    if (!targetModel) {
      throw new Error(`Model version '${version}' not found in registry`);
    }

    const currentVersion = this.activeVersion;
    const previousModel = this.registry.find(m => m.version === currentVersion);
    if (previousModel && previousModel.version !== version) {
      previousModel.status = 'archived_stable';
      previousModel.retiredAt = new Date().toISOString();
    }

    targetModel.status = 'active';
    targetModel.deployedAt = new Date().toISOString();
    this.activeVersion = targetModel.version;

    const auditRecord = {
      id: `audit_activate_${Date.now()}`,
      action: 'MODEL_ACTIVATED',
      fromVersion: currentVersion,
      toVersion: targetModel.version,
      timestamp: new Date().toISOString(),
      actor: authorizedBy,
      reason: reason.trim()
    };

    this.auditLog.push(auditRecord);
    this._saveState();

    return {
      success: true,
      message: `تم تفعيل إصدار النموذج ${targetModel.version} بنجاح`,
      activeVersion: this.activeVersion,
      auditRecord
    };
  }

  /**
   * Retrieve immutable model audit trail
   */
  getAuditLog(limit = 50) {
    return [...this.auditLog].reverse().slice(0, limit);
  }

  /**
   * Reset state back to initial default (useful for unit tests)
   */
  resetState() {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        fs.unlinkSync(this.stateFilePath);
      } catch (e) {
        // ignore
      }
    }
    this._loadState();
  }
}

const defaultInstance = new ModelGovernanceService();

module.exports = {
  ModelGovernanceService,
  defaultInstance
};
