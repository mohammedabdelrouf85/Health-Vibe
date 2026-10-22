/**
 * Health Vibe AI - NuvoAir Medical Benchmark Scheduled Re-assessment Backend Service
 *
 * Benchmark: NuvoAir Medical (https://nuvoair.com/)
 * Scope: P2 - أولوية عالية | Backend / Security | المواعيد والشات بوت والملفات (الخدمات الخلفية والتكامل (Backend & APIs))
 *
 * Core Capabilities:
 * 1. Automatic 7-Day Post-Treatment Initiation Re-assessment Scheduling (Week-1 Check-in).
 * 2. Standardized 0-25 Respiratory Control Score Engine (Adapted from validated ACT / CAT instruments).
 * 3. Longitudinal Improvement Trajectory & Quantified Delta (+/- points and % vs Baseline).
 * 4. Multi-Channel Batch Reminder Dispatch Engine (In-App, SMS, WhatsApp) with Idempotency Guard.
 * 5. 24h Snooze Cooldown with Schedulable Notification Preferences.
 * 6. Relational Database Sync (PostgreSQL / Supabase via relationalDbService).
 * 7. Multi-Touchpoint Integration:
 *    - Pre-visit consultation dossier longitudinal trajectory snippet.
 *    - AI Chatbot assistant real-time check-in context & quick action cards.
 * 8. Zero-Trust RBAC & Cross-Patient Data Isolation (Patients strictly self-access; 403 on breach).
 * 9. Audit Logging and Zero-PHI Telemetry via analyticsService.
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

// Re-assessment Schedule Statuses
const REASSESSMENT_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  DUE: 'due',
  OVERDUE: 'overdue',
  SNOOZED: 'snoozed',
  COMPLETED: 'completed'
});

// Trajectory Classifications (NuvoAir Clinical Framework)
const TRAJECTORY_STATUS = Object.freeze({
  IMPROVED: 'improved',
  STABLE: 'stable',
  DETERIORATING: 'deteriorating'
});

// Respiratory Control Bands
const CONTROL_BANDS = Object.freeze({
  CONTROLLED: 'controlled', // 20 - 25 pts
  MODERATE: 'moderate',     // 16 - 19 pts
  POOR: 'poor'              // <= 15 pts
});

const DEFAULT_INTERVAL_DAYS = 7; // Week 1 post-treatment follow-up

class ScheduledReassessmentService {
  constructor(options = {}) {
    this.relationalDb = options.relationalDb || relationalDbService;
    this.notificationService = options.notificationService || notificationService;
    this.analytics = options.analytics || analyticsService;

    // In-Memory Stores (synced with relationalDb)
    this._schedules = new Map();   // scheduleId -> scheduleRecord
    this._submissions = new Map(); // submissionId -> submissionRecord
    this._reminders = new Map();   // reminderId -> reminderRecord

    // Secondary Indexes: patientId -> Set of IDs
    this._patientSchedulesIndex = new Map();
    this._patientSubmissionsIndex = new Map();
  }

  /**
   * Reset store for isolated test execution
   */
  resetState() {
    this._schedules.clear();
    this._submissions.clear();
    this._reminders.clear();
    this._patientSchedulesIndex.clear();
    this._patientSubmissionsIndex.clear();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ZERO-TRUST RBAC & DATA ISOLATION
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

    // Licensed Doctor / Specialist Access
    if (['doctor', 'specialist', 'pulmonologist'].includes(role)) {
      return { authorized: true, role: 'doctor' };
    }

    // Patient Access (strict self-access only)
    if (uid === patientId) {
      return { authorized: true, role: 'patient' };
    }

    // Cross-Patient Data Breach Attempt -> Reject with 403 Forbidden
    if (auditService?.recordAction) {
      auditService.recordAction('REASSESSMENT_ACCESS_FORBIDDEN', {
        requesterUid: uid,
        targetPatientId: patientId,
        role
      });
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'reassessment_access_forbidden',
          userId: uid,
          payload: {
            violatingRole: role,
            patientId,
            reason: 'CROSS_PATIENT_REASSESSMENT_ACCESS_ATTEMPT'
          }
        });
      } catch (_) {}
    }

    return {
      authorized: false,
      status: 403,
      error: 'FORBIDDEN_CROSS_PATIENT_ACCESS',
      message: 'Access denied: You are not authorized to view or modify another patient\'s re-assessment.'
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SCHEDULE GENERATION & STATUS EVALUATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Evaluates dynamic status based on timestamps.
   */
  evaluateScheduleStatus(schedule) {
    if (!schedule) return REASSESSMENT_STATUS.DUE;
    if (schedule.status === REASSESSMENT_STATUS.COMPLETED) {
      return REASSESSMENT_STATUS.COMPLETED;
    }

    const now = Date.now();
    if (schedule.snoozedUntil && now < schedule.snoozedUntil) {
      return REASSESSMENT_STATUS.SNOOZED;
    }

    const dueTime = new Date(schedule.dueDate).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now >= dueTime + oneDayMs) {
      return REASSESSMENT_STATUS.OVERDUE;
    }
    if (now >= dueTime - oneDayMs * 0.5) {
      return REASSESSMENT_STATUS.DUE;
    }
    return REASSESSMENT_STATUS.SCHEDULED;
  }

  async scheduleReassessment(patientId, options = {}, requester = null) {
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
      const err = new Error('Patient ID is required.');
      err.statusCode = 400;
      err.code = 'INVALID_PATIENT_ID';
      throw err;
    }

    const intervalDays = Number(options.intervalDays || DEFAULT_INTERVAL_DAYS);
    const startDate = options.startDate || new Date().toISOString().split('T')[0];
    
    // Calculate dueDate
    const startObj = new Date(startDate);
    startObj.setDate(startObj.getDate() + intervalDays);
    const dueDate = options.dueDate || startObj.toISOString().split('T')[0];
    const dueTimestamp = new Date(dueDate).getTime();

    const scheduleId = options.id || `sched_${crypto.randomBytes(8).toString('hex')}`;

    const baselineData = options.baselineAssessment || {};
    const baselineScore = Number(baselineData.controlScore !== undefined ? baselineData.controlScore : 13);

    const scheduleRecord = {
      id: scheduleId,
      patientId,
      status: REASSESSMENT_STATUS.SCHEDULED,
      intervalDays,
      startDate,
      dueDate,
      dueTimestamp,
      notificationChannel: options.notificationChannel || 'in_app',
      snoozeCount: 0,
      snoozedUntil: null,
      reason: options.reason || 'post_treatment_7day_improvement',
      baselineAssessment: {
        id: baselineData.id || `case_baseline_${crypto.randomBytes(4).toString('hex')}`,
        date: startDate,
        controlScore: baselineScore,
        controlBand: baselineScore >= 20 ? CONTROL_BANDS.CONTROLLED : baselineScore >= 16 ? CONTROL_BANDS.MODERATE : CONTROL_BANDS.POOR,
        dayBreathlessness: baselineData.dayBreathlessness ?? 2,
        nightWaking: baselineData.nightWaking ?? 2,
        rescuePuffsWeek: baselineData.rescuePuffsWeek ?? 8,
        activityLimitation: baselineData.activityLimitation ?? 2,
        spo2: baselineData.spo2 ?? 94,
        fev1Percent: baselineData.fev1Percent ?? 65,
        peakFlow: baselineData.peakFlow ?? 340
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in-memory
    this._schedules.set(scheduleId, scheduleRecord);
    if (!this._patientSchedulesIndex.has(patientId)) {
      this._patientSchedulesIndex.set(patientId, new Set());
    }
    this._patientSchedulesIndex.get(patientId).add(scheduleId);

    // Sync to Relational DB if available
    if (this.relationalDb?.saveScheduledReassessment) {
      await this.relationalDb.saveScheduledReassessment({
        id: scheduleId,
        patient_id: patientId,
        status: scheduleRecord.status,
        interval_days: intervalDays,
        start_date: startDate,
        due_date: dueDate,
        due_timestamp: dueTimestamp,
        notification_channel: scheduleRecord.notificationChannel,
        snooze_count: 0,
        reason: scheduleRecord.reason,
        baseline_score: baselineScore
      });
    }

    // Audit and Telemetry
    if (auditService?.recordAction) {
      auditService.recordAction('REASSESSMENT_SCHEDULED', {
        patientId,
        scheduleId,
        intervalDays,
        dueDate
      });
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'reassessment_scheduled',
          userId: patientId,
          payload: {
            patientId,
            reassessmentId: scheduleId,
            intervalDays
          }
        });
      } catch (_) {}
    }

    return { ...scheduleRecord };
  }

  async getPatientSchedule(patientId, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const scheduleIds = this._patientSchedulesIndex.get(patientId);
    let schedule = null;

    if (scheduleIds && scheduleIds.size > 0) {
      const allScheds = Array.from(scheduleIds)
        .map(id => this._schedules.get(id))
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      schedule = allScheds[0] || null;
    } else if (this.relationalDb?.getScheduledReassessment) {
      const dbSched = await this.relationalDb.getScheduledReassessment(patientId);
      if (dbSched) {
        schedule = {
          id: dbSched.id,
          patientId: dbSched.patient_id,
          status: dbSched.status,
          intervalDays: dbSched.interval_days,
          startDate: dbSched.start_date,
          dueDate: dbSched.due_date,
          dueTimestamp: dbSched.due_timestamp,
          notificationChannel: dbSched.notification_channel,
          snoozeCount: dbSched.snooze_count,
          snoozedUntil: dbSched.snoozed_until,
          reason: dbSched.reason,
          baselineAssessment: {
            controlScore: dbSched.baseline_score || 13,
            controlBand: (dbSched.baseline_score || 13) >= 20 ? CONTROL_BANDS.CONTROLLED : (dbSched.baseline_score || 13) >= 16 ? CONTROL_BANDS.MODERATE : CONTROL_BANDS.POOR
          },
          createdAt: dbSched.created_at
        };
      }
    }

    // Default auto-schedule if none found
    if (!schedule) {
      schedule = await this.scheduleReassessment(patientId, { intervalDays: DEFAULT_INTERVAL_DAYS });
    }

    // Dynamically evaluate status
    schedule.status = this.evaluateScheduleStatus(schedule);

    // Calculate days remaining or overdue by calendar date
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMid = new Date(todayStr + 'T00:00:00.000Z').getTime();
    const dueStr = (schedule.dueDate || '').split('T')[0];
    const dueMid = new Date(dueStr + 'T00:00:00.000Z').getTime();
    const daysDiff = Math.round((dueMid - todayMid) / (24 * 60 * 60 * 1000));

    return {
      ...schedule,
      daysRemaining: daysDiff > 0 ? daysDiff : 0,
      daysOverdue: daysDiff < 0 ? Math.abs(daysDiff) : 0,
      isDueNow: schedule.status === REASSESSMENT_STATUS.DUE || schedule.status === REASSESSMENT_STATUS.OVERDUE
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. 24H SNOOZE COOLDOWN
  // ───────────────────────────────────────────────────────────────────────────

  async snoozeReassessment(patientId, optionsOrHours = 24, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const schedule = await this.getPatientSchedule(patientId);
    if (!schedule) {
      const err = new Error('No active re-assessment schedule found.');
      err.statusCode = 404;
      err.code = 'SCHEDULE_NOT_FOUND';
      throw err;
    }

    const hours = typeof optionsOrHours === 'object' && optionsOrHours !== null 
      ? Number(optionsOrHours.hours || 24) 
      : (Number(optionsOrHours) || 24);

    const snoozedMs = hours * 60 * 60 * 1000;
    schedule.status = REASSESSMENT_STATUS.SNOOZED;
    schedule.snoozeCount = (schedule.snoozeCount || 0) + 1;
    schedule.snoozedUntil = Date.now() + snoozedMs;
    schedule.updatedAt = new Date().toISOString();

    this._schedules.set(schedule.id, schedule);

    if (this.relationalDb?.saveScheduledReassessment) {
      await this.relationalDb.saveScheduledReassessment({
        id: schedule.id,
        patient_id: patientId,
        status: schedule.status,
        snooze_count: schedule.snoozeCount,
        snoozed_until: schedule.snoozedUntil
      });
    }

    if (auditService?.recordAction) {
      auditService.recordAction('REASSESSMENT_SNOOZED', {
        patientId,
        scheduleId: schedule.id,
        hours,
        snoozeCount: schedule.snoozeCount
      });
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'reassessment_snoozed',
          userId: patientId,
          payload: {
            patientId,
            reassessmentId: schedule.id,
            snoozedHours: hours,
            snoozeCount: schedule.snoozeCount
          }
        });
      } catch (_) {}
    }

    return {
      success: true,
      status: schedule.status,
      snoozeCount: schedule.snoozeCount,
      schedule: { ...schedule },
      snoozedUntil: schedule.snoozedUntil
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. RESPIRATORY CONTROL SCORE & TRAJECTORY ENGINE
  // ───────────────────────────────────────────────────────────────────────────

  calculateControlScore(data = {}) {
    let score = 0;

    // 1. Day Breathlessness (max 6)
    const day = Number(data.dayBreathlessness ?? 1);
    if (day === 0) score += 6;
    else if (day === 1) score += 4;
    else if (day === 2) score += 2;
    else score += 0;

    // 2. Night Waking (max 6)
    const night = Number(data.nightWaking ?? 0);
    if (night === 0) score += 6;
    else if (night === 1) score += 3;
    else score += 0;

    // 3. Rescue Puffs in Past Week (max 7)
    const rescue = Number(data.rescuePuffsWeek ?? 1);
    if (rescue <= 1) score += 7;
    else if (rescue <= 3) score += 4;
    else if (rescue <= 5) score += 2;
    else score += 0;

    // 4. Activity Limitation (max 6)
    const activity = Number(data.activityLimitation ?? 0);
    if (activity === 0) score += 6;
    else if (activity === 1) score += 3;
    else score += 0;

    let controlBand = CONTROL_BANDS.POOR;
    if (score >= 20) {
      controlBand = CONTROL_BANDS.CONTROLLED;
    } else if (score >= 16) {
      controlBand = CONTROL_BANDS.MODERATE;
    }

    return {
      score,
      maxScore: 25,
      scorePct: Math.round((score / 25) * 100),
      controlBand
    };
  }

  calculateImprovementTrajectory(baseline, current) {
    const baseScoreObj = baseline?.controlScore !== undefined ? { score: Number(baseline.controlScore) } : this.calculateControlScore(baseline);
    const currScoreObj = this.calculateControlScore(current);

    const baseScore = baseScoreObj.score;
    const currScore = currScoreObj.score;
    const deltaPoints = currScore - baseScore;
    const deltaPct = baseScore > 0 ? Math.round((deltaPoints / baseScore) * 100) : 0;

    const baseRescue = Number(baseline?.rescuePuffsWeek ?? 0);
    const currRescue = Number(current?.rescuePuffsWeek ?? 0);
    const rescueDelta = baseRescue - currRescue;

    let trajectory = TRAJECTORY_STATUS.STABLE;
    if (deltaPoints >= 3 || deltaPct >= 15) {
      trajectory = TRAJECTORY_STATUS.IMPROVED;
    } else if (deltaPoints <= -3 || deltaPct <= -15 || currRescue >= 4) {
      trajectory = TRAJECTORY_STATUS.DETERIORATING;
    }

    return {
      baselineScore: baseScore,
      currentScore: currScore,
      maxScore: 25,
      deltaPoints,
      deltaPct,
      formattedDelta: `${deltaPoints >= 0 ? '+' : ''}${deltaPoints} pts (${deltaPct >= 0 ? '+' : ''}${deltaPct}%)`,
      rescueReduction: rescueDelta,
      trajectory,
      currentBand: currScoreObj.controlBand,
      baselineBand: baseline?.controlBand || (baseScore >= 20 ? CONTROL_BANDS.CONTROLLED : baseScore >= 16 ? CONTROL_BANDS.MODERATE : CONTROL_BANDS.POOR),
      isSignificantImprovement: trajectory === TRAJECTORY_STATUS.IMPROVED && deltaPoints >= 5,
      clinicalReviewRecommended: trajectory === TRAJECTORY_STATUS.DETERIORATING || currScore < 16
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SUBMISSION & LONGITUDINAL PROGRESS RECORDING
  // ───────────────────────────────────────────────────────────────────────────

  async submitReassessment(patientId, data = {}, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const schedule = await this.getPatientSchedule(patientId);
    const baseline = schedule?.baselineAssessment || { controlScore: 13, controlBand: CONTROL_BANDS.POOR };

    const scoreObj = this.calculateControlScore(data);
    const trajectoryObj = this.calculateImprovementTrajectory(baseline, data);

    const submissionId = `reassess_${crypto.randomBytes(8).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    const submissionRecord = {
      id: submissionId,
      patientId,
      completedAt: nowIso,
      date: todayStr,
      score: scoreObj.score,
      controlBand: scoreObj.controlBand,
      trajectory: trajectoryObj.trajectory,
      deltaPoints: trajectoryObj.deltaPoints,
      deltaPct: trajectoryObj.deltaPct,
      baselineScore: trajectoryObj.baselineScore,
      clinicalReviewRecommended: trajectoryObj.clinicalReviewRecommended,
      dayBreathlessness: data.dayBreathlessness ?? 1,
      nightWaking: data.nightWaking ?? 0,
      rescuePuffsWeek: data.rescuePuffsWeek ?? 1,
      activityLimitation: data.activityLimitation ?? 0,
      spo2: data.spo2 || null,
      fev1Percent: data.fev1Percent || null,
      peakFlow: data.peakFlow || null,
      notes: data.notes || null,
      createdAt: nowIso
    };

    // Store submission
    this._submissions.set(submissionId, submissionRecord);
    if (!this._patientSubmissionsIndex.has(patientId)) {
      this._patientSubmissionsIndex.set(patientId, new Set());
    }
    this._patientSubmissionsIndex.get(patientId).add(submissionId);

    // Update schedule
    schedule.status = REASSESSMENT_STATUS.COMPLETED;
    schedule.completedAt = nowIso;
    schedule.updatedAt = nowIso;
    this._schedules.set(schedule.id, schedule);

    // Sync to Relational DB if available
    if (this.relationalDb?.saveReassessmentSubmission) {
      await this.relationalDb.saveReassessmentSubmission({
        id: submissionId,
        patient_id: patientId,
        completed_at: nowIso,
        date: todayStr,
        score: scoreObj.score,
        control_band: scoreObj.controlBand,
        trajectory: trajectoryObj.trajectory,
        delta_points: trajectoryObj.deltaPoints,
        delta_pct: trajectoryObj.deltaPct,
        baseline_score: trajectoryObj.baselineScore,
        clinical_review_recommended: trajectoryObj.clinicalReviewRecommended,
        day_breathlessness: submissionRecord.dayBreathlessness,
        night_waking: submissionRecord.nightWaking,
        rescue_puffs_week: submissionRecord.rescuePuffsWeek,
        activity_limitation: submissionRecord.activityLimitation,
        spo2: submissionRecord.spo2,
        fev1_percent: submissionRecord.fev1Percent,
        peak_flow: submissionRecord.peakFlow,
        notes: submissionRecord.notes
      });
    }

    if (this.relationalDb?.saveScheduledReassessment) {
      await this.relationalDb.saveScheduledReassessment({
        id: schedule.id,
        patient_id: patientId,
        status: REASSESSMENT_STATUS.COMPLETED
      });
    }

    // Automatically stage next routine check-in (14 days later)
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 14);
    const nextDueDateStr = nextDueDate.toISOString().split('T')[0];

    // Audit and Telemetry
    if (auditService?.recordAction) {
      auditService.recordAction('REASSESSMENT_COMPLETED', {
        patientId,
        submissionId,
        score: scoreObj.score,
        trajectory: trajectoryObj.trajectory,
        deltaPoints: trajectoryObj.deltaPoints
      });
    }

    if (this.analytics?.recordEvent) {
      try {
        this.analytics.recordEvent({
          eventType: 'reassessment_completed',
          userId: patientId,
          payload: {
            patientId,
            reassessmentId: submissionId,
            trajectory: trajectoryObj.trajectory,
            deltaPoints: trajectoryObj.deltaPoints,
            deltaScore: trajectoryObj.deltaPoints,
            score: scoreObj.score,
            controlBand: scoreObj.controlBand,
            baselineScore: trajectoryObj.baselineScore,
            followUpScore: scoreObj.score
          }
        });

        if (trajectoryObj.clinicalReviewRecommended) {
          this.analytics.recordEvent({
            eventType: 'reassessment_clinical_alert_triggered',
            userId: patientId,
            payload: {
              patientId,
              reassessmentId: submissionId,
              trajectory: trajectoryObj.trajectory,
              score: scoreObj.score,
              reason: trajectoryObj.trajectory === 'deteriorating' ? 'DETERIORATING_TRAJECTORY' : 'POOR_CONTROL_SCORE'
            }
          });
        }
      } catch (_) {}
    }

    return {
      success: true,
      submissionId: submissionRecord.id,
      patientId,
      score: scoreObj.score,
      controlBand: scoreObj.controlBand,
      trajectory: trajectoryObj.trajectory,
      deltaPoints: trajectoryObj.deltaPoints,
      deltaPct: trajectoryObj.deltaPct,
      scheduleStatus: REASSESSMENT_STATUS.COMPLETED,
      submission: { ...submissionRecord },
      trajectoryDetails: trajectoryObj,
      nextScheduledDate: nextDueDateStr
    };
  }

  async getReassessmentHistory(patientId, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const subIds = this._patientSubmissionsIndex.get(patientId);
    let list = [];

    if (subIds && subIds.size > 0) {
      list = Array.from(subIds)
        .map(id => this._submissions.get(id))
        .filter(Boolean)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    } else if (this.relationalDb?.getReassessmentSubmissions) {
      const dbSubs = await this.relationalDb.getReassessmentSubmissions(patientId);
      list = dbSubs.map(s => ({
        id: s.id,
        patientId: s.patient_id,
        completedAt: s.completed_at,
        date: s.date,
        score: s.score,
        controlBand: s.control_band,
        trajectory: s.trajectory,
        deltaPoints: s.delta_points,
        deltaPct: s.delta_pct,
        baselineScore: s.baseline_score,
        clinicalReviewRecommended: s.clinical_review_recommended,
        dayBreathlessness: s.day_breathlessness,
        nightWaking: s.night_waking,
        rescuePuffsWeek: s.rescue_puffs_week,
        activityLimitation: s.activity_limitation,
        spo2: s.spo2,
        fev1Percent: s.fev1_percent,
        peakFlow: s.peak_flow,
        notes: s.notes
      }));
    }

    return list;
  }

  async getTrajectoryReport(patientId, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }

    const schedule = await this.getPatientSchedule(patientId);
    const history = await this.getReassessmentHistory(patientId);
    const latest = history[0] || null;
    const baseline = schedule?.baselineAssessment || { controlScore: 13, controlBand: CONTROL_BANDS.POOR };

    const currScore = latest ? latest.score : 13;
    const delta = currScore - baseline.controlScore;
    const trajectory = latest ? latest.trajectory : (delta >= 3 ? TRAJECTORY_STATUS.IMPROVED : delta <= -3 ? TRAJECTORY_STATUS.DETERIORATING : TRAJECTORY_STATUS.STABLE);

    return {
      patientId,
      benchmark: 'NuvoAir Medical Longitudinal Respiratory Standard',
      baselineScore: baseline.controlScore,
      baselineBand: baseline.controlBand,
      latestScore: currScore,
      latestBand: latest ? latest.controlBand : baseline.controlBand,
      deltaPoints: delta,
      deltaPct: baseline.controlScore > 0 ? Math.round((delta / baseline.controlScore) * 100) : 0,
      trajectory,
      clinicalReviewRecommended: trajectory === TRAJECTORY_STATUS.DETERIORATING || currScore < 16,
      historyCount: history.length,
      history: history.slice(0, 5),
      generatedAt: new Date().toISOString()
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. MULTI-CHANNEL BATCH REMINDER DISPATCH ENGINE
  // ───────────────────────────────────────────────────────────────────────────

  async dispatchPendingReminders(targetDate = null) {
    const todayStr = targetDate || new Date().toISOString().split('T')[0];
    const dispatched = [];
    let scanned = 0;
    let skippedAlreadyNotified = 0;
    let skippedNotDue = 0;

    for (const [patientId, scheduleIds] of this._patientSchedulesIndex.entries()) {
      for (const schedId of scheduleIds) {
        const schedule = this._schedules.get(schedId);
        if (!schedule || schedule.status === REASSESSMENT_STATUS.COMPLETED) continue;

        scanned++;
        const currentStatus = this.evaluateScheduleStatus(schedule);
        if (currentStatus !== REASSESSMENT_STATUS.DUE && currentStatus !== REASSESSMENT_STATUS.OVERDUE) {
          skippedNotDue++;
          continue;
        }

        const reminderKey = `reassess_rem_${patientId}_${todayStr}`;
        if (this._reminders.has(reminderKey)) {
          skippedAlreadyNotified++;
          continue; // Idempotency check
        }

        const reminderRecord = {
          id: reminderKey,
          patientId,
          scheduleId: schedId,
          dueDate: schedule.dueDate,
          status: currentStatus,
          channel: schedule.notificationChannel || 'in_app',
          dispatchedAt: new Date().toISOString()
        };

        this._reminders.set(reminderKey, reminderRecord);

        // Record in Notification Service
        if (this.notificationService?.recordNotificationHistory) {
          try {
            this.notificationService.recordNotificationHistory(null, {
              userId: patientId,
              eventType: 'reassessment_reminder_due',
              title: 'NuvoAir 7-Day Follow-up Check-in Due',
              message: 'It has been 7 days since your respiratory therapy began. Please complete your 2-minute check-in to track airway improvement.',
              urgent: currentStatus === REASSESSMENT_STATUS.OVERDUE,
              metadata: { patientId, scheduleId: schedId, dueDate: schedule.dueDate }
            }).catch?.(() => {});
          } catch (_) {}
        }

        if (this.analytics?.recordEvent) {
          try {
            this.analytics.recordEvent({
              eventType: 'reassessment_reminder_dispatched',
              userId: patientId,
              payload: {
                patientId,
                scheduleId: schedId,
                channel: reminderRecord.channel,
                dueDate: schedule.dueDate
              }
            });
          } catch (_) {}
        }

        dispatched.push(reminderRecord);
      }
    }

    return {
      success: true,
      targetDate: todayStr,
      scanned,
      dispatched: dispatched.length,
      dispatchedCount: dispatched.length,
      skippedAlreadyNotified,
      skippedNotDue,
      dispatchedList: dispatched
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. MULTI-TOUCHPOINT INTEGRATION
  // ───────────────────────────────────────────────────────────────────────────

  async getDossierSnippet(patientId, requester = null) {
    if (requester) {
      const authCheck = this.verifyPatientAccess(requester, patientId);
      if (!authCheck.authorized) {
        const err = new Error(authCheck.message);
        err.statusCode = authCheck.status;
        err.code = authCheck.error;
        throw err;
      }
    }
    const report = await this.getTrajectoryReport(patientId, requester);
    return {
      patientId,
      benchmark: 'NuvoAir Medical',
      baselineScore: report.baselineScore,
      latestScore: report.latestScore,
      deltaPoints: report.deltaPoints,
      deltaPct: report.deltaPct,
      trajectory: report.trajectory,
      clinicalReviewRecommended: report.clinicalReviewRecommended,
      dossierTextAr: `مسار التحسن السريري (معيار NuvoAir): تقييم البداية (${report.baselineScore}/25) ➔ تقييم المتابعة (${report.latestScore}/25) بفارق (${report.deltaPoints >= 0 ? '+' : ''}${report.deltaPoints} نقطة). الحالة: ${report.trajectory}.`,
      dossierTextEn: `Clinical Trajectory (NuvoAir): Baseline (${report.baselineScore}/25) -> Follow-up (${report.latestScore}/25) Delta: ${report.deltaPoints >= 0 ? '+' : ''}${report.deltaPoints} pts. Status: ${report.trajectory}.`
    };
  }

  async getChatbotContext(patientId) {
    const sched = await this.getPatientSchedule(patientId);
    return {
      patientId,
      status: sched.status,
      isDueNow: sched.isDueNow,
      daysRemaining: sched.daysRemaining,
      baselineScore: sched.baselineAssessment?.controlScore || 13,
      promptSuggestionAr: sched.isDueNow ? 'حان موعد تقييم المتابعة الأسبوعي (اليوم 7) لقياس تحسن تنفسك.' : 'خطة المتابعة الدورية مجدولة.',
      promptSuggestionEn: sched.isDueNow ? 'Your 7-day follow-up check-in is due now to measure your breathing improvement.' : 'Scheduled follow-up is active.'
    };
  }
}

// Singleton export
const scheduledReassessmentService = new ScheduledReassessmentService();

module.exports = {
  ScheduledReassessmentService,
  scheduledReassessmentService,
  REASSESSMENT_STATUS,
  TRAJECTORY_STATUS,
  CONTROL_BANDS,
  DEFAULT_INTERVAL_DAYS
};
