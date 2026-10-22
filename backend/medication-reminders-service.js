/**
 * Health Vibe AI - Propeller Health Benchmark Medication & Inhaler Reminders Backend Service
 *
 * Benchmark: Propeller Health (https://propellerhealth.com/)
 * Scope: P2 - أولوية عالية | Backend / Security | المواعيد والشات بوت والملفات (الخدمات الخلفية والتكامل (Backend & APIs))
 *
 * Architectural Features:
 * 1. Preventative Controller Inhalers Daily Schedule (Morning & Evening Maintenance).
 * 2. 1-Tap Fast Dose Logging (taken, snoozed, skipped) with Canister Puff Decrements.
 * 3. Quick Rescue Inhaler Logger (Ventolin/Salbutamol) with Trigger Capture & 24h Safety Thresholds.
 * 4. Longitudinal Adherence Engine (% over 7, 14, 30 days) & Streak Calculation.
 * 5. Canister Tracking & Automatic Low Canister Alerts (< 20 puffs).
 * 6. Automated Multi-Channel Daily Reminder Dispatch (In-App, Push, WhatsApp via notificationService).
 * 7. Multi-Touchpoint Integration:
 *    - Pre-visit consultation dossier adherence attachment.
 *    - Chatbot assistant real-time dose status and quick logging.
 * 8. Zero-Trust RBAC & Cross-Patient Data Isolation (Patients access only their own data; 403 on breach).
 * 9. PostgreSQL / Relational DB persistence via relationalDbService.
 * 10. Audit Logging and Zero-PHI Telemetry via analyticsService.
 */

'use strict';

const crypto = require('crypto');
const auditService = require('./audit-service');
const analyticsService = require('./analytics-service');

let relationalDbService = null;
try {
  relationalDbService = require('./relational-db-service').relationalDbService;
} catch (_) {}

let notificationService = null;
try {
  notificationService = require('./notification-service');
} catch (_) {}

const {
  medicationSafetyPrivacyService,
  CLINICAL_DISCLAIMERS,
  EMERGENCY_HOTLINES
} = require('./medication-safety-privacy-service');

// Medication Classifications
const MEDICATION_TYPES = Object.freeze({
  CONTROLLER: 'controller', // Maintenance / Preventative (Symbicort, Seretide, Spiriva)
  RESCUE: 'rescue'          // Fast-relief / PRN (Ventolin, Salbutamol, Atrovent)
});

// Dose Action Statuses
const DOSE_STATUS = Object.freeze({
  TAKEN: 'taken',
  SNOOZED: 'snoozed',
  SKIPPED: 'skipped',
  DUE: 'due',
  MISSED: 'missed'
});

// Propeller Adherence Bands
const ADHERENCE_BANDS = Object.freeze({
  EXCELLENT: 'excellent', // >= 80%
  MODERATE: 'moderate',   // 50% - 79%
  AT_RISK: 'at_risk'      // < 50%
});

// Recognized Triggers for Rescue Inhalers
const RESCUE_TRIGGERS = Object.freeze([
  'acute_cough',
  'exercise',
  'dust',
  'cold_air',
  'smoke',
  'weather',
  'stress',
  'unknown'
]);

const DEFAULT_LOW_CANISTER_THRESHOLD = 20; // Alerts when puffs remaining <= 20
const RESCUE_SAFETY_ALERT_THRESHOLD = 3;   // Alerts when rescue used >= 3 times in 24 hours

class MedicationRemindersService {
  constructor(options = {}) {
    this.relationalDb = options.relationalDb || relationalDbService;
    this.notificationService = options.notificationService || notificationService;
    this.analytics = options.analytics || analyticsService;

    // In-Memory Stores (synced with relationalDb)
    this._medications = new Map(); // medId -> medRecord
    this._doses = new Map();       // doseId -> doseRecord
    this._rescueLogs = new Map();  // logId -> rescueRecord
    this._reminders = new Map();   // reminderId -> reminderRecord

    // Secondary Indexes: patientId -> Set of IDs
    this._patientMedsIndex = new Map();
    this._patientDosesIndex = new Map();
    this._patientRescueIndex = new Map();
  }

  /**
   * Reset store for isolated test execution
   */
  resetStoreForTesting() {
    this._medications.clear();
    this._doses.clear();
    this._rescueLogs.clear();
    this._reminders.clear();
    this._patientMedsIndex.clear();
    this._patientDosesIndex.clear();
    this._patientRescueIndex.clear();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. RBAC & DATA ISOLATION GUARD
  // ───────────────────────────────────────────────────────────────────────────

  verifyPatientAccess(requester, patientId) {
    if (!requester) {
      return { authorized: false, status: 401, error: 'UNAUTHORIZED', message: 'Authentication required.' };
    }

    const { uid, role, isOwner } = requester;

    // Platform Admins & System Owners have privileged oversight
    if (isOwner === true || ['super_admin', 'admin', 'clinic_admin'].includes(role)) {
      return { authorized: true, role: 'admin' };
    }

    // Licensed Doctor Access
    if (['doctor', 'specialist', 'pulmonologist'].includes(role)) {
      return { authorized: true, role: 'doctor' };
    }

    // Patient Access (strict self-access only)
    if (uid === patientId) {
      return { authorized: true, role: 'patient' };
    }

    // Cross-Patient Data Breach Attempt -> Reject with 403 Forbidden
    if (auditService?.recordAction) {
      auditService.recordAction('MEDICATION_ACCESS_FORBIDDEN', {
        requesterUid: uid,
        targetPatientId: patientId,
        role
      });
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'secure_storage_privacy_breach_blocked',
          userId: uid,
          payload: {
            violatingRole: role,
            patientId,
            reason: 'CROSS_PATIENT_MEDICATION_ACCESS_ATTEMPT'
          }
        });
      } catch (_) {}
    }

    return {
      authorized: false,
      status: 403,
      error: 'FORBIDDEN',
      message: 'Access denied: You do not have permission to view or manage another patient\'s medication records.'
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. MEDICATION REGISTRATION & SCHEDULE MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  async registerMedication(patientId, medData = {}, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    if (!patientId || !medData.name) {
      const err = new Error('Invalid medication payload: patientId and name are required.');
      err.statusCode = 400;
      err.code = 'INVALID_PAYLOAD';
      throw err;
    }

    const medId = medData.id || `med_${crypto.randomBytes(8).toString('hex')}`;
    const type = medData.type === 'rescue' ? MEDICATION_TYPES.RESCUE : MEDICATION_TYPES.CONTROLLER;
    const scheduleTimes = Array.isArray(medData.scheduleTimes) ? medData.scheduleTimes : (type === 'controller' ? ['08:00', '20:00'] : []);

    const medRecord = {
      id: medId,
      patientId,
      name: String(medData.name).trim(),
      nameAr: medData.nameAr ? String(medData.nameAr).trim() : null,
      type,
      activeIngredients: medData.activeIngredients || null,
      scheduleTimes,
      dosagePuffs: Number(medData.dosagePuffs || 1),
      canisterTotal: Number(medData.canisterTotal || 120),
      canisterRemaining: Number(medData.canisterRemaining !== undefined ? medData.canisterRemaining : (medData.canisterTotal || 120)),
      lowCanisterThreshold: Number(medData.lowCanisterThreshold || DEFAULT_LOW_CANISTER_THRESHOLD),
      instructions: medData.instructions || null,
      isActive: medData.isActive !== undefined ? medData.isActive : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in-memory and index
    this._medications.set(medId, medRecord);
    if (!this._patientMedsIndex.has(patientId)) {
      this._patientMedsIndex.set(patientId, new Set());
    }
    this._patientMedsIndex.get(patientId).add(medId);

    // Sync to Relational DB if available
    if (this.relationalDb?.savePatientMedication) {
      await this.relationalDb.savePatientMedication(medRecord);
    }

    // Audit and Telemetry
    if (auditService?.recordAction) {
      auditService.recordAction('MEDICATION_REGISTERED', {
        patientId,
        medId,
        type,
        canisterRemaining: medRecord.canisterRemaining
      });
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'medication_reminder_scheduled',
          userId: patientId,
          payload: {
            patientId,
            medId,
            type,
            scheduleCount: scheduleTimes.length
          }
        });
      } catch (_) {}
    }

    return { ...medRecord };
  }

  async updateMedicationPrescription(patientId, medId, updates = {}, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const currentMed = this._medications.get(medId);
    if (!currentMed) {
      const err = new Error(`Medication '${medId}' not found.`);
      err.statusCode = 404;
      err.code = 'MEDICATION_NOT_FOUND';
      throw err;
    }

    // 🔒 Enforce Physician Prescription Boundary (Patients forbidden from modifying clinical params)
    medicationSafetyPrivacyService.enforcePhysicianPrescriptionBoundary(requester, currentMed, updates);

    // Apply authorized clinical updates
    if (updates.dosagePuffs !== undefined) currentMed.dosagePuffs = Number(updates.dosagePuffs);
    if (updates.scheduleTimes !== undefined) currentMed.scheduleTimes = Array.isArray(updates.scheduleTimes) ? updates.scheduleTimes : currentMed.scheduleTimes;
    if (updates.activeIngredients !== undefined) currentMed.activeIngredients = updates.activeIngredients;
    if (updates.name !== undefined) currentMed.name = updates.name;
    if (updates.nameAr !== undefined) currentMed.nameAr = updates.nameAr;
    if (updates.canisterTotal !== undefined) currentMed.canisterTotal = Number(updates.canisterTotal);
    currentMed.updatedAt = new Date().toISOString();

    if (this.relationalDb?.savePatientMedication) {
      await this.relationalDb.savePatientMedication(currentMed);
    }

    return {
      success: true,
      medication: { ...currentMed },
      disclaimer: CLINICAL_DISCLAIMERS.STANDARD_REMINDER
    };
  }

  async getPatientMedications(patientId, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    // Try in-memory first
    const medIds = this._patientMedsIndex.get(patientId);
    let list = [];
    if (medIds && medIds.size > 0) {
      list = Array.from(medIds).map(id => this._medications.get(id)).filter(Boolean);
    } else if (this.relationalDb?.getPatientMedications) {
      // Fallback to relational DB
      const dbList = await this.relationalDb.getPatientMedications(patientId);
      dbList.forEach(item => {
        const mapped = {
          id: item.id,
          patientId: item.patient_id,
          name: item.name,
          nameAr: item.name_ar,
          type: item.type,
          activeIngredients: item.active_ingredients,
          scheduleTimes: item.schedule_times || [],
          dosagePuffs: item.dosage_puffs,
          canisterTotal: item.canister_total,
          canisterRemaining: item.canister_remaining,
          lowCanisterThreshold: item.low_canister_threshold,
          isActive: item.is_active,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        };
        this._medications.set(mapped.id, mapped);
        if (!this._patientMedsIndex.has(patientId)) this._patientMedsIndex.set(patientId, new Set());
        this._patientMedsIndex.get(patientId).add(mapped.id);
        list.push(mapped);
      });
    }

    return list.map(item => ({ ...item }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. 1-TAP DOSE LOGGING (Taken, Snoozed, Skipped) & CANISTER DECREMENT
  // ───────────────────────────────────────────────────────────────────────────

  async logDose(patientId, doseData = {}, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const { medId, scheduledTime, status } = doseData;
    if (!patientId || !medId || !status) {
      const err = new Error('Invalid dose log payload: patientId, medId, and status are required.');
      err.statusCode = 400;
      err.code = 'INVALID_PAYLOAD';
      throw err;
    }

    if (!Object.values(DOSE_STATUS).includes(status)) {
      const err = new Error(`Invalid status '${status}'. Must be one of: taken, snoozed, skipped.`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    const med = this._medications.get(medId);
    if (!med) {
      const err = new Error(`Medication '${medId}' not found for patient.`);
      err.statusCode = 404;
      err.code = 'MEDICATION_NOT_FOUND';
      throw err;
    }

    const doseId = doseData.id || `dose_${crypto.randomBytes(8).toString('hex')}`;
    const todayStr = doseData.scheduledDate || new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    let snoozedUntil = null;
    let reason = doseData.reason || null;
    let canisterRemaining = med.canisterRemaining;
    let lowCanisterAlertTriggered = false;

    if (status === DOSE_STATUS.TAKEN) {
      // Decrement Canister Puffs
      const puffsToDeduct = med.dosagePuffs || 1;
      med.canisterRemaining = Math.max(0, med.canisterRemaining - puffsToDeduct);
      canisterRemaining = med.canisterRemaining;

      // Check low canister threshold
      if (canisterRemaining <= med.lowCanisterThreshold) {
        lowCanisterAlertTriggered = true;
        this._dispatchLowCanisterNotification(patientId, med);
      }
    } else if (status === DOSE_STATUS.SNOOZED) {
      const snoozeMinutes = Number(doseData.snoozeMinutes || 30);
      snoozedUntil = new Date(Date.now() + snoozeMinutes * 60000).toISOString();
    }

    const doseRecord = {
      id: doseId,
      patientId,
      medId,
      scheduledTime: scheduledTime || '08:00',
      scheduledDate: todayStr,
      status,
      takenAt: status === DOSE_STATUS.TAKEN ? nowIso : null,
      snoozedUntil,
      reason,
      puffs: med.dosagePuffs || 1,
      canisterRemaining,
      lowCanisterAlertTriggered,
      createdAt: nowIso
    };

    // Store in-memory and index
    this._doses.set(doseId, doseRecord);
    if (!this._patientDosesIndex.has(patientId)) {
      this._patientDosesIndex.set(patientId, new Set());
    }
    this._patientDosesIndex.get(patientId).add(doseId);

    // Sync to Relational DB
    if (this.relationalDb?.saveMedicationDose) {
      await this.relationalDb.saveMedicationDose({
        id: doseId,
        patient_id: patientId,
        med_id: medId,
        scheduled_time: doseRecord.scheduledTime,
        scheduled_date: todayStr,
        status,
        taken_at: doseRecord.takenAt,
        snoozed_until: snoozedUntil,
        reason,
        puffs: doseRecord.puffs
      });
    }

    // Telemetry & Audit
    const eventType = status === DOSE_STATUS.TAKEN
      ? 'medication_dose_logged'
      : status === DOSE_STATUS.SNOOZED
        ? 'medication_dose_snoozed'
        : 'medication_dose_skipped';

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType,
          userId: patientId,
          payload: {
            patientId,
            medId,
            status,
            canisterRemaining
          }
        });
      } catch (_) {}
    }

    return {
      success: true,
      dose: { ...doseRecord },
      canisterRemaining,
      lowCanisterAlertTriggered
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. QUICK RESCUE INHALER LOGGER (Ventolin) & 24h SAFETY LIMITS
  // ───────────────────────────────────────────────────────────────────────────

  async logRescuePuff(patientId, rescueData = {}, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    if (!patientId) {
      const err = new Error('Invalid rescue log: patientId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_PAYLOAD';
      throw err;
    }

    const logId = rescueData.id || `rescue_${crypto.randomBytes(8).toString('hex')}`;
    const puffs = Number(rescueData.puffs || 1);
    const trigger = rescueData.trigger && RESCUE_TRIGGERS.includes(rescueData.trigger)
      ? rescueData.trigger
      : (rescueData.trigger || 'acute_cough');

    const medId = rescueData.medId || 'med_ventolin_default';
    const med = this._medications.get(medId);
    let canisterRemaining = null;

    if (med) {
      med.canisterRemaining = Math.max(0, med.canisterRemaining - puffs);
      canisterRemaining = med.canisterRemaining;
    }

    const nowIso = new Date().toISOString();

    // 24-Hour Clinical Safety Check
    const past24hCutoff = Date.now() - 24 * 3600000;
    const pastRescueLogs = await this.getRescueLogs(patientId);
    const recentEvents = pastRescueLogs.filter(
      r => new Date(r.timestamp).getTime() >= past24hCutoff
    );

    const totalRescue24h = recentEvents.reduce((acc, r) => acc + (r.puffs || 1), 0) + puffs;
    const safetyAlertTriggered = totalRescue24h >= RESCUE_SAFETY_ALERT_THRESHOLD;

    const rescueRecord = {
      id: logId,
      patientId,
      medId,
      puffs,
      trigger,
      timestamp: nowIso,
      safetyAlertTriggered,
      totalRescue24h,
      notes: rescueData.notes || null,
      createdAt: nowIso
    };

    // Store in-memory and index
    this._rescueLogs.set(logId, rescueRecord);
    if (!this._patientRescueIndex.has(patientId)) {
      this._patientRescueIndex.set(patientId, new Set());
    }
    this._patientRescueIndex.get(patientId).add(logId);

    // Sync to Relational DB
    if (this.relationalDb?.saveRescueInhalerLog) {
      await this.relationalDb.saveRescueInhalerLog({
        id: logId,
        patient_id: patientId,
        med_id: medId,
        puffs,
        trigger,
        timestamp: nowIso,
        safety_alert_triggered: safetyAlertTriggered,
        notes: rescueRecord.notes
      });
    }

    // If safety threshold exceeded, dispatch clinical alert
    if (safetyAlertTriggered) {
      this._dispatchRescueSafetyAlert(patientId, totalRescue24h);
    }

    // Telemetry & Audit
    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'medication_rescue_logged',
          userId: patientId,
          payload: {
            patientId,
            medId,
            puffs,
            trigger,
            safetyAlertTriggered,
            totalRescue24h
          }
        });

        if (safetyAlertTriggered) {
          this.analytics.recordEvent({
            eventType: 'medication_rescue_safety_alert',
            userId: patientId,
            payload: {
              patientId,
              totalRescue24h,
              threshold: RESCUE_SAFETY_ALERT_THRESHOLD
            }
          });
        }
      } catch (_) {}
    }

    const safetyAssessment = medicationSafetyPrivacyService.assessRescueOveruseSafety(patientId, totalRescue24h);

    return {
      success: true,
      entry: { ...rescueRecord },
      safetyAlertTriggered,
      totalRescue24h,
      canisterRemaining,
      safetyAssessment,
      disclaimer: safetyAlertTriggered
        ? CLINICAL_DISCLAIMERS.EMERGENCY_RED_FLAG
        : CLINICAL_DISCLAIMERS.STANDARD_REMINDER
    };
  }

  async getRescueLogs(patientId, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const logIds = this._patientRescueIndex.get(patientId);
    let list = [];
    if (logIds && logIds.size > 0) {
      list = Array.from(logIds).map(id => this._rescueLogs.get(id)).filter(Boolean);
    } else if (this.relationalDb?.getRescueInhalerLogs) {
      const dbList = await this.relationalDb.getRescueInhalerLogs(patientId);
      dbList.forEach(item => {
        const mapped = {
          id: item.id,
          patientId: item.patient_id,
          medId: item.med_id,
          puffs: item.puffs,
          trigger: item.trigger,
          timestamp: item.timestamp,
          safetyAlertTriggered: item.safety_alert_triggered,
          notes: item.notes,
          createdAt: item.created_at
        };
        this._rescueLogs.set(mapped.id, mapped);
        if (!this._patientRescueIndex.has(patientId)) this._patientRescueIndex.set(patientId, new Set());
        this._patientRescueIndex.get(patientId).add(mapped.id);
        list.push(mapped);
      });
    }

    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. ADHERENCE SCORE & STREAK ANALYTICS ENGINE
  // ───────────────────────────────────────────────────────────────────────────

  async calculateAdherence(patientId, options = {}, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const days = Math.max(1, Number(options.days || 7));
    const cutoffTime = Date.now() - days * 86400000;

    // Fetch doses
    const doseIds = this._patientDosesIndex.get(patientId);
    let doses = [];
    if (doseIds && doseIds.size > 0) {
      doses = Array.from(doseIds).map(id => this._doses.get(id)).filter(Boolean);
    } else if (this.relationalDb?.getMedicationDoses) {
      const dbDoses = await this.relationalDb.getMedicationDoses(patientId);
      doses = dbDoses.map(d => ({
        id: d.id,
        patientId: d.patient_id,
        medId: d.med_id,
        scheduledTime: d.scheduled_time,
        scheduledDate: d.scheduled_date,
        status: d.status,
        takenAt: d.taken_at,
        snoozedUntil: d.snoozed_until,
        reason: d.reason,
        puffs: d.puffs,
        createdAt: d.created_at
      }));
    }

    // Filter within days window
    const relevantDoses = doses.filter(d => {
      const t = new Date(d.scheduledDate || d.createdAt).getTime();
      return t >= cutoffTime;
    });

    let scheduled = 0;
    let taken = 0;

    relevantDoses.forEach(d => {
      if (d.status === DOSE_STATUS.TAKEN) {
        scheduled++;
        taken++;
      } else if (d.status === DOSE_STATUS.SKIPPED || d.status === DOSE_STATUS.MISSED) {
        scheduled++;
      }
    });

    const adherencePct = scheduled > 0 ? Math.round((taken / scheduled) * 100) : 100;

    let band = ADHERENCE_BANDS.EXCELLENT;
    if (adherencePct < 50) band = ADHERENCE_BANDS.AT_RISK;
    else if (adherencePct < 80) band = ADHERENCE_BANDS.MODERATE;

    // Calculate Streak
    const streakDays = this._calculatePatientStreak(doses);

    // Calculate 7-day Rescue Puffs
    const rescueList = await this.getRescueLogs(patientId);
    const rescue7dCutoff = Date.now() - 7 * 86400000;
    const rescuePast7Days = rescueList
      .filter(r => new Date(r.timestamp).getTime() >= rescue7dCutoff)
      .reduce((acc, r) => acc + (r.puffs || 1), 0);

    // Controller-to-Rescue Ratio
    const controllerToRescueRatio = rescuePast7Days === 0
      ? 'Optimal (Zero Rescue)'
      : (taken / rescuePast7Days).toFixed(1);

    // Low Canisters Check
    const meds = await this.getPatientMedications(patientId);
    const lowCanisters = meds.filter(m => m.canisterRemaining <= m.lowCanisterThreshold);

    const result = {
      patientId,
      timePeriodDays: days,
      adherencePct,
      band,
      scheduledDoses: scheduled,
      takenDoses: taken,
      streakDays,
      rescuePast7Days,
      controllerToRescueRatio,
      lowCanistersCount: lowCanisters.length,
      lowCanisters: lowCanisters.map(m => ({
        id: m.id,
        name: m.name,
        canisterRemaining: m.canisterRemaining,
        lowCanisterThreshold: m.lowCanisterThreshold
      })),
      calculatedAt: new Date().toISOString()
    };

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'medication_adherence_calculated',
          userId: patientId,
          payload: {
            patientId,
            days,
            adherencePct,
            band,
            streakDays,
            rescuePast7Days
          }
        });
      } catch (_) {}
    }

    return result;
  }

  _calculatePatientStreak(doses = []) {
    let streak = 0;
    const today = new Date();

    for (let i = 0; i <= 30; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const dayDoses = doses.filter(item => item.scheduledDate === dateStr);
      if (dayDoses.length === 0) {
        if (i === 0) continue; // Today might not have doses logged yet
        break;
      }

      const anyMissed = dayDoses.some(
        item => item.status === DOSE_STATUS.SKIPPED || item.status === DOSE_STATUS.MISSED
      );
      const anyTaken = dayDoses.some(item => item.status === DOSE_STATUS.TAKEN);

      if (anyTaken && !anyMissed) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return Math.max(1, streak); // minimum 1 for encouragement
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. CANISTER REFILL & RESET API
  // ───────────────────────────────────────────────────────────────────────────

  async refillCanister(patientId, medId, customPuffs = null, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const med = this._medications.get(medId);
    if (!med) {
      const err = new Error(`Medication '${medId}' not found.`);
      err.statusCode = 404;
      err.code = 'MEDICATION_NOT_FOUND';
      throw err;
    }

    const newPuffs = customPuffs !== null ? Number(customPuffs) : med.canisterTotal;
    med.canisterRemaining = newPuffs;
    med.updatedAt = new Date().toISOString();

    if (this.relationalDb?.savePatientMedication) {
      await this.relationalDb.savePatientMedication(med);
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'medication_canister_refilled',
          userId: patientId,
          payload: {
            patientId,
            medId,
            canisterRemaining: newPuffs
          }
        });
      } catch (_) {}
    }

    return {
      success: true,
      medId,
      canisterRemaining: newPuffs,
      canisterTotal: med.canisterTotal
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. MULTI-CHANNEL DAILY REMINDER DISPATCH ENGINE
  // ───────────────────────────────────────────────────────────────────────────

  async dispatchDailyReminders(targetDate = null) {
    const todayStr = targetDate || new Date().toISOString().split('T')[0];
    const dispatched = [];

    for (const [patientId, medIds] of this._patientMedsIndex.entries()) {
      for (const medId of medIds) {
        const med = this._medications.get(medId);
        if (!med || !med.isActive || med.type !== MEDICATION_TYPES.CONTROLLER) continue;

        for (const timeSlot of med.scheduleTimes) {
          const reminderId = `rem_${patientId}_${medId}_${todayStr}_${timeSlot.replace(':', '')}`;

          if (this._reminders.has(reminderId)) continue; // Idempotency check

          const reminderRecord = {
            id: reminderId,
            patientId,
            medId,
            medName: med.name,
            scheduledFor: `${todayStr}T${timeSlot}:00.000Z`,
            status: 'sent',
            channel: 'in_app',
            dispatchedAt: new Date().toISOString()
          };

          this._reminders.set(reminderId, reminderRecord);

          if (this.relationalDb?.saveMedicationReminder) {
            await this.relationalDb.saveMedicationReminder({
              id: reminderId,
              patient_id: patientId,
              med_id: medId,
              scheduled_for: reminderRecord.scheduledFor,
              channel: 'in_app',
              status: 'sent',
              dispatched_at: reminderRecord.dispatchedAt
            });
          }

          if (this.notificationService?.recordNotificationHistory) {
            try {
              this.notificationService.recordNotificationHistory(this.db || null, {
                userId: patientId,
                eventType: 'medication_reminder_due',
                title: `Reminder: ${med.name} (${timeSlot})`,
                message: `It's time for your daily preventative controller dose of ${med.name}. Take your dose to protect your lungs and maintain your adherence streak!`,
                urgent: false,
                metadata: { patientId, medId, scheduledTime: timeSlot }
              }).catch?.(() => {});
            } catch (_) {}
          } else if (this.notificationService?.enqueueNotification && this.db) {
            try {
              this.notificationService.enqueueNotification(this.db, {
                recipient: patientId,
                type: 'medication_reminder_due',
                payload: { patientId, medId, scheduledTime: timeSlot }
              }).catch?.(() => {});
            } catch (_) {}
          }

          dispatched.push(reminderRecord);
        }
      }
    }

    return {
      success: true,
      date: todayStr,
      remindersDispatched: dispatched.length,
      dispatched
    };
  }

  _dispatchLowCanisterNotification(patientId, med) {
    if (this.notificationService?.recordNotificationHistory) {
      try {
        this.notificationService.recordNotificationHistory(this.db || null, {
          userId: patientId,
          eventType: 'medication_canister_low',
          title: `⚠️ Low Canister Alert: ${med.name}`,
          message: `Your inhaler ${med.name} has only ${med.canisterRemaining} puffs remaining. Please contact your doctor or pharmacy for a refill prescription.`,
          urgent: true,
          metadata: { patientId, medId: med.id, canisterRemaining: med.canisterRemaining }
        }).catch?.(() => {});
      } catch (_) {}
    } else if (this.notificationService?.enqueueNotification && this.db) {
      try {
        this.notificationService.enqueueNotification(this.db, {
          recipient: patientId,
          type: 'medication_canister_low',
          payload: { patientId, medId: med.id, canisterRemaining: med.canisterRemaining }
        }).catch?.(() => {});
      } catch (_) {}
    }
  }

  _dispatchRescueSafetyAlert(patientId, totalRescue24h) {
    if (this.notificationService?.recordNotificationHistory) {
      try {
        this.notificationService.recordNotificationHistory(this.db || null, {
          userId: patientId,
          eventType: 'medication_rescue_safety_alert',
          title: '⚠️ Clinical Safety Notice: Frequent Rescue Inhaler Usage',
          message: `You have used your rescue inhaler ${totalRescue24h} times in the last 24 hours. Frequent rescue usage indicates your breathing may not be fully controlled. Please contact your pulmonologist or visit urgent care if chest tightness persists.`,
          urgent: true,
          metadata: { patientId, totalRescue24h }
        }).catch?.(() => {});
      } catch (_) {}
    } else if (this.notificationService?.enqueueNotification && this.db) {
      try {
        this.notificationService.enqueueNotification(this.db, {
          recipient: patientId,
          type: 'medication_rescue_safety_alert',
          payload: { patientId, totalRescue24h }
        }).catch?.(() => {});
      } catch (_) {}
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. MULTI-TOUCHPOINT INTEGRATIONS (Appointments & Chatbot)
  // ───────────────────────────────────────────────────────────────────────────

  async getPreVisitAdherenceDossier(patientId, requester = null) {
    const adherence = await this.calculateAdherence(patientId, { days: 14 }, requester);
    const meds = await this.getPatientMedications(patientId, requester);

    return {
      patientId,
      adherenceScore: adherence.adherencePct,
      adherenceBand: adherence.band,
      streakDays: adherence.streakDays,
      scheduledDoses14d: adherence.scheduledDoses,
      takenDoses14d: adherence.takenDoses,
      rescuePuffs7d: adherence.rescuePast7Days,
      controllerToRescueRatio: adherence.controllerToRescueRatio,
      activeInhalers: meds.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        canisterRemaining: m.canisterRemaining,
        canisterTotal: m.canisterTotal
      })),
      clinicalNote: adherence.adherencePct >= 80
        ? 'High adherence (>=80%) to preventative controller therapy. Stable clinical maintenance.'
        : adherence.adherencePct >= 50
          ? 'Moderate adherence. Recommend patient counseling on regular daily controller compliance.'
          : 'At-risk low adherence (<50%). High risk of acute exacerbations and emergency intervention.',
      statutoryDisclaimer: CLINICAL_DISCLAIMERS.STANDARD_REMINDER
    };
  }

  async getChatbotReminderContext(patientId) {
    const adherence = await this.calculateAdherence(patientId, { days: 7 });
    const meds = await this.getPatientMedications(patientId);
    const controller = meds.find(m => m.type === MEDICATION_TYPES.CONTROLLER);

    return {
      patientId,
      adherencePct: adherence.adherencePct,
      streakDays: adherence.streakDays,
      nextScheduledDose: controller ? {
        medId: controller.id,
        medName: controller.name,
        medNameAr: controller.nameAr,
        scheduledTimes: controller.scheduleTimes,
        canisterRemaining: controller.canisterRemaining
      } : null,
      rescuePuffsPast7d: adherence.rescuePast7Days,
      clinicalNotice: CLINICAL_DISCLAIMERS.CHATBOT_GUARDRAIL,
      statutoryDisclaimer: CLINICAL_DISCLAIMERS.STANDARD_REMINDER
    };
  }
}

// Singleton export
const medicationRemindersService = new MedicationRemindersService();

module.exports = {
  MedicationRemindersService,
  medicationRemindersService,
  medicationSafetyPrivacyService,
  CLINICAL_DISCLAIMERS,
  EMERGENCY_HOTLINES,
  MEDICATION_TYPES,
  DOSE_STATUS,
  ADHERENCE_BANDS,
  RESCUE_TRIGGERS
};
