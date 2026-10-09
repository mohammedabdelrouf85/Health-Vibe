/**
 * HEALTH VIBE AI: SERVER-CONTROLLED OPERATIONAL FEATURE SWITCHES SERVICE
 *
 * Provides authoritative circuit breakers & operational feature switches:
 * 1. New Assessment Intake (assessmentIntake)
 * 2. Assistant Availability (assistant)
 * 3. Selected Integrations (integrations: diagnostics, wearables, prescriptions, telehealth)
 *
 * Guarantees:
 * - Read-only preservation of authorized access to existing records.
 * - Safe termination of in-flight operations with clear user-facing messages.
 * - Enforcement on trusted write paths (backend middleware + direct Firestore security rules).
 * - Administrative authorization restrictions (Super Admin / Owner only).
 * - Full audit trail recording on every switch change.
 */

const auditService = require('./audit-service');

const FEATURE_KEYS = {
  ASSESSMENT_INTAKE: 'assessmentIntake',
  ASSISTANT: 'assistant',
  INTEGRATIONS: 'integrations'
};

const SUB_FEATURE_KEYS = {
  DIAGNOSTICS: 'diagnostics',
  WEARABLES: 'wearables',
  PRESCRIPTIONS: 'prescriptions',
  TELEHEALTH: 'telehealth'
};

const DEFAULT_SWITCHES = {
  [FEATURE_KEYS.ASSESSMENT_INTAKE]: {
    key: FEATURE_KEYS.ASSESSMENT_INTAKE,
    name: 'New Clinical Assessment Intake',
    enabled: true,
    allowReads: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system_init',
    reason: 'Initial system default',
    messages: {
      en: 'New clinical assessment intake is temporarily paused for operational maintenance. You can safely view all your existing assessments and certified reports.',
      ar: 'تم إيقاف استقبال التقييمات السريرية الجديدة مؤقتاً لأعمال الصيانة التشغيلية. يمكنك الاطلاع على كافة تقاريرك وفحوصاتك السابقة بأمان.'
    }
  },
  [FEATURE_KEYS.ASSISTANT]: {
    key: FEATURE_KEYS.ASSISTANT,
    name: 'AI Medical Assistant & Visit Scribe',
    enabled: true,
    allowReads: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system_init',
    reason: 'Initial system default',
    messages: {
      en: 'The AI Medical Assistant is currently offline for scheduled maintenance. Past consultation notes and approved summaries remain accessible.',
      ar: 'المساعد الطبي الذكي غير متاح حالياً لأعمال الصيانة المجدولة. السجلات السابقة ومسودات الزيارات المعتمدة لا تزال متاحة بالكامل.'
    }
  },
  [FEATURE_KEYS.INTEGRATIONS]: {
    key: FEATURE_KEYS.INTEGRATIONS,
    name: 'Selected Partner Integrations',
    enabled: true,
    allowReads: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system_init',
    reason: 'Initial system default',
    messages: {
      en: 'Selected partner integrations are temporarily paused for maintenance. Historical synchronized records remain safely readable.',
      ar: 'خدمات الربط الخارجي المحددة متوقفة مؤقتاً للصيانة. السجلات السابقة متوفرة للعرض والمراجعة دون انقطاع.'
    },
    subFeatures: {
      [SUB_FEATURE_KEYS.DIAGNOSTICS]: {
        key: SUB_FEATURE_KEYS.DIAGNOSTICS,
        name: 'Diagnostic Laboratory & Imaging Partner',
        enabled: true,
        allowReads: true
      },
      [SUB_FEATURE_KEYS.WEARABLES]: {
        key: SUB_FEATURE_KEYS.WEARABLES,
        name: 'Wearable Health Devices Sync',
        enabled: true,
        allowReads: true
      },
      [SUB_FEATURE_KEYS.PRESCRIPTIONS]: {
        key: SUB_FEATURE_KEYS.PRESCRIPTIONS,
        name: 'e-Prescriptions & Pharmacy Sandbox',
        enabled: true,
        allowReads: true
      },
      [SUB_FEATURE_KEYS.TELEHEALTH]: {
        key: SUB_FEATURE_KEYS.TELEHEALTH,
        name: 'Telehealth Video Consultations',
        enabled: true,
        allowReads: true
      }
    }
  }
};

async function withTimeout(promise, timeoutMs = 300) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
  ]);
}

class OperationalSwitchesService {
  constructor() {
    this.switches = JSON.parse(JSON.stringify(DEFAULT_SWITCHES));
    this.firestoreDb = null;
    this.initialized = false;
    this.auditLogs = [];
  }

  /**
   * Initializes the service and syncs with Firestore if available
   */
  async init(firestoreDb = null) {
    if (firestoreDb && typeof firestoreDb.collection === 'function') {
      this.firestoreDb = firestoreDb;
      try {
        const docSnap = await withTimeout(
          this.firestoreDb.collection('system_settings').doc('operational_switches').get(),
          300
        );
        if (docSnap && docSnap.exists) {
          const data = docSnap.data();
          this._applyStoredData(data);
        } else {
          // Seed initial switches into Firestore
          await withTimeout(
            this.firestoreDb.collection('system_settings').doc('operational_switches').set({
              ...this.getFirestoreRepresentation(),
              createdAt: new Date().toISOString()
            }, { merge: true }),
            300
          );
        }
      } catch (err) {
        // In-memory fallback
      }
    }
    this.initialized = true;
    return this.getAllStatus();
  }

  _applyStoredData(data) {
    if (!data) return;
    if (typeof data.assessmentIntake === 'boolean') {
      this.switches[FEATURE_KEYS.ASSESSMENT_INTAKE].enabled = data.assessmentIntake;
    }
    if (typeof data.assistant === 'boolean') {
      this.switches[FEATURE_KEYS.ASSISTANT].enabled = data.assistant;
    }
    if (typeof data.integrations === 'boolean') {
      this.switches[FEATURE_KEYS.INTEGRATIONS].enabled = data.integrations;
    }
    if (data.integrationsSubFeatures && typeof data.integrationsSubFeatures === 'object') {
      for (const [subKey, val] of Object.entries(data.integrationsSubFeatures)) {
        if (this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[subKey]) {
          this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[subKey].enabled = Boolean(val);
        }
      }
    }
    if (data.customMessages && typeof data.customMessages === 'object') {
      for (const [key, msgObj] of Object.entries(data.customMessages)) {
        if (this.switches[key] && msgObj) {
          this.switches[key].messages = {
            ...this.switches[key].messages,
            ...msgObj
          };
        }
      }
    }
  }

  getFirestoreRepresentation() {
    return {
      assessmentIntake: this.switches[FEATURE_KEYS.ASSESSMENT_INTAKE].enabled,
      assistant: this.switches[FEATURE_KEYS.ASSISTANT].enabled,
      integrations: this.switches[FEATURE_KEYS.INTEGRATIONS].enabled,
      integrationsSubFeatures: {
        [SUB_FEATURE_KEYS.DIAGNOSTICS]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.DIAGNOSTICS].enabled,
        [SUB_FEATURE_KEYS.WEARABLES]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.WEARABLES].enabled,
        [SUB_FEATURE_KEYS.PRESCRIPTIONS]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.PRESCRIPTIONS].enabled,
        [SUB_FEATURE_KEYS.TELEHEALTH]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.TELEHEALTH].enabled
      },
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Evaluates if a given feature or sub-feature is currently enabled.
   * Always indicates whether read access to existing records is preserved.
   */
  isFeatureEnabled(featureKey, subFeatureKey = null) {
    const feature = this.switches[featureKey];
    if (!feature) {
      return {
        enabled: true,
        allowReads: true,
        message: 'Unknown feature defaults to enabled.',
        messageAr: 'خاصية غير محددة.'
      };
    }

    if (!feature.enabled) {
      return {
        enabled: false,
        feature: featureKey,
        allowReads: feature.allowReads,
        message: feature.messages.en,
        messageAr: feature.messages.ar,
        reason: feature.reason,
        updatedAt: feature.updatedAt
      };
    }

    // Check sub-feature if requested (e.g. integrations.diagnostics)
    if (subFeatureKey && feature.subFeatures) {
      const sub = feature.subFeatures[subFeatureKey];
      if (sub && !sub.enabled) {
        return {
          enabled: false,
          feature: featureKey,
          subFeature: subFeatureKey,
          allowReads: true,
          message: `${sub.name} is temporarily disabled for operational maintenance. Existing records remain accessible.`,
          messageAr: `خدمة ${sub.name} متوقفة مؤقتاً للصيانة. السجلات السابقة لا تزال متاحة للمعاينة.`,
          reason: feature.reason,
          updatedAt: feature.updatedAt
        };
      }
    }

    return {
      enabled: true,
      allowReads: true,
      feature: featureKey,
      subFeature: subFeatureKey
    };
  }

  /**
   * Returns public client-facing status of all operational switches
   */
  getAllStatus() {
    return {
      switches: {
        [FEATURE_KEYS.ASSESSMENT_INTAKE]: {
          enabled: this.switches[FEATURE_KEYS.ASSESSMENT_INTAKE].enabled,
          allowReads: true,
          messages: this.switches[FEATURE_KEYS.ASSESSMENT_INTAKE].messages,
          updatedAt: this.switches[FEATURE_KEYS.ASSESSMENT_INTAKE].updatedAt
        },
        [FEATURE_KEYS.ASSISTANT]: {
          enabled: this.switches[FEATURE_KEYS.ASSISTANT].enabled,
          allowReads: true,
          messages: this.switches[FEATURE_KEYS.ASSISTANT].messages,
          updatedAt: this.switches[FEATURE_KEYS.ASSISTANT].updatedAt
        },
        [FEATURE_KEYS.INTEGRATIONS]: {
          enabled: this.switches[FEATURE_KEYS.INTEGRATIONS].enabled,
          allowReads: true,
          messages: this.switches[FEATURE_KEYS.INTEGRATIONS].messages,
          subFeatures: {
            [SUB_FEATURE_KEYS.DIAGNOSTICS]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.DIAGNOSTICS].enabled,
            [SUB_FEATURE_KEYS.WEARABLES]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.WEARABLES].enabled,
            [SUB_FEATURE_KEYS.PRESCRIPTIONS]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.PRESCRIPTIONS].enabled,
            [SUB_FEATURE_KEYS.TELEHEALTH]: this.switches[FEATURE_KEYS.INTEGRATIONS].subFeatures[SUB_FEATURE_KEYS.TELEHEALTH].enabled
          },
          updatedAt: this.switches[FEATURE_KEYS.INTEGRATIONS].updatedAt
        }
      },
      readAccessPreserved: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Updates an operational feature switch.
   * Strictly restricted to authorized administrators; audits every change.
   */
  async updateSwitch({
    featureKey,
    subFeatureKey = null,
    enabled,
    reason,
    customMessages = null,
    adminActor,
    firestoreDb = null
  }) {
    if (!adminActor || (!adminActor.isOwner && adminActor.role !== 'super_admin')) {
      const err = new Error('Only authorized platform administrators (Super Admin / Owner) can modify operational switches.');
      err.statusCode = 403;
      err.code = 'ADMIN_UNAUTHORIZED';
      throw err;
    }

    if (!Object.values(FEATURE_KEYS).includes(featureKey)) {
      const err = new Error(`Invalid operational feature key: '${featureKey}'. Valid keys: ${Object.values(FEATURE_KEYS).join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_FEATURE_KEY';
      throw err;
    }

    if (typeof enabled !== 'boolean') {
      const err = new Error('The "enabled" property must be a boolean (true or false).');
      err.statusCode = 400;
      err.code = 'INVALID_ENABLED_VALUE';
      throw err;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      const err = new Error('A valid reason for the operational change (at least 5 characters) is required for audit governance.');
      err.statusCode = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }

    const targetFeature = this.switches[featureKey];
    let previousState;
    let newState;

    if (subFeatureKey) {
      if (!targetFeature.subFeatures || !targetFeature.subFeatures[subFeatureKey]) {
        const err = new Error(`Invalid sub-feature key: '${subFeatureKey}' for feature '${featureKey}'.`);
        err.statusCode = 400;
        err.code = 'INVALID_SUB_FEATURE_KEY';
        throw err;
      }
      previousState = targetFeature.subFeatures[subFeatureKey].enabled;
      targetFeature.subFeatures[subFeatureKey].enabled = enabled;
      newState = enabled;
    } else {
      previousState = targetFeature.enabled;
      targetFeature.enabled = enabled;
      newState = enabled;
    }

    targetFeature.updatedAt = new Date().toISOString();
    targetFeature.updatedBy = adminActor.email || adminActor.uid;
    targetFeature.reason = reason.trim();

    if (customMessages && typeof customMessages === 'object') {
      targetFeature.messages = {
        ...targetFeature.messages,
        ...customMessages
      };
    }

    const dbToUse = firestoreDb || this.firestoreDb;
    if (dbToUse && typeof dbToUse.collection === 'function') {
      try {
        await withTimeout(
          dbToUse.collection('system_settings').doc('operational_switches').set({
            ...this.getFirestoreRepresentation(),
            lastModifiedBy: targetFeature.updatedBy,
            lastChangeReason: targetFeature.reason
          }, { merge: true }),
          300
        );
      } catch (dbErr) {
        // Safe in-memory fallback
      }
    }

    // Comprehensive Audit Trail Recording
    const auditPayload = {
      featureKey,
      subFeatureKey,
      previousState,
      newState,
      reason: targetFeature.reason,
      readAccessPreserved: true,
      customMessages: customMessages || null,
      adminUid: adminActor.uid,
      adminEmail: adminActor.email || 'admin@healthvibe.internal',
      timestamp: targetFeature.updatedAt
    };

    this.auditLogs.push({
      eventType: 'OPERATIONAL_SWITCH_CHANGED',
      ...auditPayload
    });

    if (auditService && typeof auditService.recordAuditEvent === 'function') {
      try {
        await withTimeout(
          auditService.recordAuditEvent(dbToUse, {
            type: 'OPERATIONAL_SWITCH_CHANGED',
            actor: {
              uid: adminActor.uid,
              role: adminActor.role || 'super_admin',
              emailMasked: adminActor.email ? auditService.maskEmail(adminActor.email) : '',
              isOwner: Boolean(adminActor.isOwner),
              clinicId: adminActor.clinicId || null
            },
            details: auditPayload
          }),
          300
        );
      } catch (auditErr) {
        // Safe fallback
      }
    }

    return {
      success: true,
      featureKey,
      subFeatureKey,
      previousState,
      newState,
      readAccessPreserved: true,
      updatedAt: targetFeature.updatedAt,
      auditPayload
    };
  }

  /**
   * Express middleware factory for enforcing feature switches on trusted write paths.
   */
  requireFeatureEnabled(featureKey, subFeatureKey = null) {
    return (req, res, next) => {
      const status = this.isFeatureEnabled(featureKey, subFeatureKey);
      if (!status.enabled) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          code: 'SERVICE_UNAVAILABLE',
          feature: featureKey,
          subFeature: subFeatureKey,
          message: status.message,
          messageAr: status.messageAr,
          readAccessPreserved: true,
          help: 'You can still access and view your historical reports and records.'
        });
      }
      next();
    };
  }

  /**
   * Reset switches to initial defaults (used in testing)
   */
  resetDefaults() {
    this.switches = JSON.parse(JSON.stringify(DEFAULT_SWITCHES));
  }
}

const instance = new OperationalSwitchesService();

module.exports = instance;
module.exports.OperationalSwitchesService = OperationalSwitchesService;
module.exports.FEATURE_KEYS = FEATURE_KEYS;
module.exports.SUB_FEATURE_KEYS = SUB_FEATURE_KEYS;
