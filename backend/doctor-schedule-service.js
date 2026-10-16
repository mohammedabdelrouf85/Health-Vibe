// @ts-check
/**
 * @fileoverview Doctor Schedule & Branch Manager Service
 * Manages Egyptian clinic branches, working hours, buffers, emergency leaves, slot availability,
 * and multi-channel notification dispatching with zero-PHI telemetry integration.
 */

const analyticsService = require('./analytics-service');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');

const { EVENT_TYPES, logTelemetryEvent } = analyticsService;

/**
 * Egyptian Clinic Branches Catalog with governorate and operational parameters
 */
const EGYPT_BRANCHES = Object.freeze({
  cairo_nasr_city: {
    id: 'cairo_nasr_city',
    nameAr: 'عيادة مدينة نصر - القاهرة',
    nameEn: 'Nasr City Clinic - Cairo',
    governorate: 'Cairo',
    addressAr: 'شارع عباس العقاد، مدينة نصر، القاهرة',
    addressEn: 'Abbas El-Akkad St, Nasr City, Cairo',
    phone: '+20 2 2401 0000',
    slotIntervalMinutes: 30,
    openHour: '09:00',
    closeHour: '21:00'
  },
  cairo_maadi: {
    id: 'cairo_maadi',
    nameAr: 'عيادة المعادي - القاهرة',
    nameEn: 'Maadi Clinic - Cairo',
    governorate: 'Cairo',
    addressAr: 'شارع النصر، المعادي الجديدة، القاهرة',
    addressEn: 'El-Nasr St, New Maadi, Cairo',
    phone: '+20 2 2516 0000',
    slotIntervalMinutes: 30,
    openHour: '10:00',
    closeHour: '22:00'
  },
  giza_dokki: {
    id: 'giza_dokki',
    nameAr: 'عيادة الدقي - الجيزة',
    nameEn: 'Dokki Clinic - Giza',
    governorate: 'Giza',
    addressAr: 'ميدان المساحة، الدقي، الجيزة',
    addressEn: 'Mesaha Square, Dokki, Giza',
    phone: '+20 2 3760 0000',
    slotIntervalMinutes: 30,
    openHour: '09:00',
    closeHour: '21:00'
  },
  alex_smouha: {
    id: 'alex_smouha',
    nameAr: 'عيادة سموحة - الإسكندرية',
    nameEn: 'Smouha Clinic - Alexandria',
    governorate: 'Alexandria',
    addressAr: 'شارع فوزي معاذ، سموحة، الإسكندرية',
    addressEn: 'Fawzi Moaz St, Smouha, Alexandria',
    phone: '+20 3 4200 000',
    slotIntervalMinutes: 30,
    openHour: '10:00',
    closeHour: '20:00'
  }
});

/**
 * Valid consultation slot durations in minutes
 */
const VALID_SLOT_DURATIONS = [15, 20, 30, 45, 60];

/**
 * Standard default working days template
 */
const DEFAULT_BRANCH_HOURS = Object.freeze({
  sunday: { active: true, start: '09:00', end: '17:00', slotDurationMinutes: 30, maxCapacity: 16 },
  monday: { active: true, start: '09:00', end: '17:00', slotDurationMinutes: 30, maxCapacity: 16 },
  tuesday: { active: true, start: '09:00', end: '17:00', slotDurationMinutes: 30, maxCapacity: 16 },
  wednesday: { active: true, start: '09:00', end: '17:00', slotDurationMinutes: 30, maxCapacity: 16 },
  thursday: { active: true, start: '09:00', end: '17:00', slotDurationMinutes: 30, maxCapacity: 16 },
  friday: { active: false, start: '00:00', end: '00:00', slotDurationMinutes: 30, maxCapacity: 0 },
  saturday: { active: true, start: '10:00', end: '15:00', slotDurationMinutes: 30, maxCapacity: 10 }
});

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Creates default schedule structure for a doctor
 * @param {string} doctorId 
 */
function createDefaultSchedule(doctorId) {
  const branches = {};
  for (const branchId of Object.keys(EGYPT_BRANCHES)) {
    branches[branchId] = {
      branchId,
      bufferBetweenSlotsMinutes: 5,
      slotDurationMinutes: 30,
      workingDays: JSON.parse(JSON.stringify(DEFAULT_BRANCH_HOURS))
    };
  }

  return {
    doctorId,
    branches,
    leaves: [],
    updatedAt: new Date().toISOString()
  };
}

/**
 * Get doctor's multi-branch schedule and leave exceptions
 * @param {any} db 
 * @param {string} doctorId 
 */
async function getDoctorSchedule(db, doctorId) {
  if (!doctorId) throw new Error('DOCTOR_ID_REQUIRED');

  if (db && typeof db.collection === 'function') {
    const docRef = db.collection('doctor_schedules').doc(doctorId);
    const snap = await docRef.get();
    if (snap.exists && typeof snap.data === 'function') {
      const data = snap.data();
      if (data) return data;
    }
  }

  return createDefaultSchedule(doctorId);
}

/**
 * Find confirmed or rescheduled appointments for a doctor within a date range
 * @param {any} db 
 * @param {{ doctorId: string, branchId?: string, startDate: string, endDate: string }} params 
 */
async function findConflictingAppointments(db, params) {
  const { doctorId, branchId, startDate, endDate } = params;
  if (!db || typeof db.collection !== 'function' || !doctorId) return [];

  try {
    const colRef = db.collection('appointments');
    let query = colRef.where('doctorId', '==', doctorId);
    const snap = await query.get();
    if (!snap || !snap.docs) return [];

    return snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(appt => {
        if (appt.status !== 'confirmed' && appt.status !== 'rescheduled') return false;
        if (branchId && branchId !== 'all' && appt.branchId && appt.branchId !== branchId) return false;
        if (appt.date < startDate || appt.date > endDate) return false;
        return true;
      });
  } catch (err) {
    console.warn('[DOCTOR SCHEDULE] Could not fetch conflicting appointments:', err.message);
    return [];
  }
}

/**
 * Update working hours, slot duration, and buffer for a doctor at a branch
 * @param {any} db 
 * @param {{ doctorId: string, branchId: string, workingDays?: Record<string, any>, slotDurationMinutes?: number, bufferBetweenSlotsMinutes?: number, updatedBy?: string, userRole?: string }} params 
 */
async function updateBranchSchedule(db, params) {
  const {
    doctorId,
    branchId,
    workingDays,
    slotDurationMinutes,
    bufferBetweenSlotsMinutes = 5,
    updatedBy = doctorId,
    userRole = 'doctor'
  } = params;

  if (!doctorId) throw new Error('DOCTOR_ID_REQUIRED');
  if (!branchId || (!EGYPT_BRANCHES[branchId] && branchId !== 'all')) {
    throw new Error('INVALID_BRANCH_ID');
  }

  if (slotDurationMinutes !== undefined && !VALID_SLOT_DURATIONS.includes(Number(slotDurationMinutes))) {
    throw new Error('INVALID_SLOT_DURATION: Supported durations are 15, 20, 30, 45, or 60 minutes.');
  }

  // Validate working days format
  if (workingDays && typeof workingDays === 'object') {
    for (const [day, cfg] of Object.entries(workingDays)) {
      if (cfg && cfg.active) {
        if (!cfg.start || !cfg.end) {
          throw new Error(`INVALID_HOURS_FOR_${day.toUpperCase()}: Start and end times required for active days.`);
        }
        const [sh, sm] = cfg.start.split(':').map(Number);
        const [eh, em] = cfg.end.split(':').map(Number);
        if (eh * 60 + em <= sh * 60 + sm) {
          throw new Error(`INVALID_HOURS_FOR_${day.toUpperCase()}: End time must be after start time.`);
        }
      }
    }
  }

  const schedule = await getDoctorSchedule(db, doctorId);
  const targetBranches = branchId === 'all' ? Object.keys(EGYPT_BRANCHES) : [branchId];

  for (const bId of targetBranches) {
    if (!schedule.branches[bId]) {
      schedule.branches[bId] = {
        branchId: bId,
        bufferBetweenSlotsMinutes,
        slotDurationMinutes: slotDurationMinutes || 30,
        workingDays: JSON.parse(JSON.stringify(DEFAULT_BRANCH_HOURS))
      };
    }

    schedule.branches[bId].bufferBetweenSlotsMinutes = Number(bufferBetweenSlotsMinutes) || 0;
    if (slotDurationMinutes !== undefined) {
      schedule.branches[bId].slotDurationMinutes = Number(slotDurationMinutes);
    }
    if (workingDays && typeof workingDays === 'object') {
      schedule.branches[bId].workingDays = {
        ...schedule.branches[bId].workingDays,
        ...workingDays
      };
    }
  }
  schedule.updatedAt = new Date().toISOString();

  // Save to database
  if (db && typeof db.collection === 'function') {
    await db.collection('doctor_schedules').doc(doctorId).set(schedule, { merge: true });

    // Multi-channel Notification to Doctor/Clinic
    try {
      if (typeof notificationService?.recordNotificationHistory === 'function') {
        await notificationService.recordNotificationHistory(db, {
          userId: doctorId,
          eventType: 'doctor_schedule_updated',
          title: 'تم تحديث جدول العمل وساعات الفروع بنجاح',
          message: `تم حفظ مواعيد العمل الجديدة لفرع ${branchId === 'all' ? 'جميع الفروع' : branchId}.`,
          urgent: false,
          metadata: { doctorId, branchId, bufferBetweenSlotsMinutes }
        });
      }
    } catch (_) {}

    // Security Audit Event
    try {
      if (typeof auditService?.recordAuditEvent === 'function') {
        await auditService.recordAuditEvent(db, {
          type: 'DOCTOR_SCHEDULE_UPDATED',
          actorUid: updatedBy,
          actorRole: userRole,
          targetUserId: doctorId,
          clinicId: branchId,
          outcome: 'SUCCESS',
          details: {
            doctorId,
            branchId,
            bufferBetweenSlotsMinutes,
            slotDurationMinutes: slotDurationMinutes || 30
          }
        });
      }
    } catch (_) {}

    // Telemetry: strictly zero PHI
    await logTelemetryEvent(db, {
      eventType: EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
      userId: updatedBy,
      doctorId,
      branchId,
      bufferBetweenSlotsMinutes: Number(bufferBetweenSlotsMinutes) || 0,
      timestamp: schedule.updatedAt
    });
  }

  return { success: true, branchId, schedule };
}

/**
 * Request or record an emergency leave / exception with conflicting booking alerts
 * @param {any} db 
 * @param {{ doctorId: string, branchId?: string, startDate: string, endDate: string, reasonType?: string, notes?: string, emergencyOverride?: boolean, requestedBy?: string, userRole?: string }} params 
 */
async function addDoctorLeaveException(db, params) {
  const {
    doctorId,
    branchId = 'all',
    startDate,
    endDate,
    reasonType = 'personal',
    notes = '',
    emergencyOverride = false,
    requestedBy = doctorId,
    userRole = 'doctor'
  } = params;

  if (!doctorId) throw new Error('DOCTOR_ID_REQUIRED');
  if (!startDate || !endDate) throw new Error('START_AND_END_DATE_REQUIRED');
  if (new Date(startDate) > new Date(endDate)) throw new Error('END_DATE_BEFORE_START');

  const schedule = await getDoctorSchedule(db, doctorId);
  const leaveId = 'leave_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const leaveRecord = {
    id: leaveId,
    doctorId,
    branchId,
    startDate,
    endDate,
    reasonType,
    notes: String(notes || '').trim(),
    emergencyOverride: Boolean(emergencyOverride),
    status: 'approved',
    createdAt: new Date().toISOString(),
    createdBy: requestedBy
  };

  schedule.leaves = schedule.leaves || [];
  schedule.leaves.push(leaveRecord);
  schedule.updatedAt = new Date().toISOString();

  // Find conflicting patient bookings in the leave window
  const conflictingAppointments = await findConflictingAppointments(db, {
    doctorId,
    branchId,
    startDate,
    endDate
  });

  if (db && typeof db.collection === 'function') {
    await db.collection('doctor_schedules').doc(doctorId).set(schedule, { merge: true });

    // Notify affected patients about schedule conflict & provide direct reschedule assistance
    for (const appt of conflictingAppointments) {
      if (appt.patientId) {
        try {
          if (typeof notificationService?.recordNotificationHistory === 'function') {
            await notificationService.recordNotificationHistory(db, {
              userId: appt.patientId,
              eventType: 'doctor_leave_exception',
              title: 'تنبيه عاجل: اعتذار الطبيب عن موعد الكشف',
              message: `نعتذر لك عن إلغاء الموعد بسبب اعتذار الطبيب لظرف طارئ بتاريخ ${appt.date}. يرجى الضغط لاختيار موعد بديل فوراً دون رسوم إضافية.`,
              urgent: true,
              metadata: {
                appointmentId: appt.id,
                doctorId,
                originalDate: appt.date,
                originalSlotId: appt.slotId,
                action: 'reschedule_required'
              }
            });
          }

          if (typeof notificationService?.enqueueNotification === 'function') {
            await notificationService.enqueueNotification(db, {
              type: notificationService.NOTIFICATION_TYPES.DOCTOR_LEAVE_EXCEPTION || 'doctor_leave_exception',
              recipient: appt.patientEmail || appt.patientPhone || appt.patientId,
              priority: 'high',
              payload: {
                appointmentId: appt.id,
                doctorId,
                date: appt.date,
                reasonType
              }
            });
          }
        } catch (err) {
          console.warn('[DOCTOR LEAVE] Failed to notify affected patient:', err.message);
        }
      }
    }

    // Confirmation notification to doctor
    try {
      if (typeof notificationService?.recordNotificationHistory === 'function') {
        await notificationService.recordNotificationHistory(db, {
          userId: doctorId,
          eventType: 'doctor_leave_exception',
          title: 'تم اعتماد الإجازة / الظرف الطارئ',
          message: `تم تسجيل إجازتك بنجاح من ${startDate} إلى ${endDate}. عدد المواعيد المتأثرة التي تم تنبيهها: ${conflictingAppointments.length}.`,
          urgent: false,
          metadata: { leaveId, startDate, endDate, affectedCount: conflictingAppointments.length }
        });
      }
    } catch (_) {}

    // Security Audit Event
    try {
      if (typeof auditService?.recordAuditEvent === 'function') {
        await auditService.recordAuditEvent(db, {
          type: 'DOCTOR_LEAVE_REQUESTED',
          actorUid: requestedBy,
          actorRole: userRole,
          targetUserId: doctorId,
          clinicId: branchId,
          outcome: 'SUCCESS',
          details: {
            leaveId,
            doctorId,
            branchId,
            reasonType,
            startDate,
            endDate,
            emergencyOverride: Boolean(emergencyOverride),
            affectedAppointmentsCount: conflictingAppointments.length
          }
        });
      }
    } catch (_) {}

    // Telemetry: zero PHI (do not log notes as they may contain text)
    await logTelemetryEvent(db, {
      eventType: EVENT_TYPES.DOCTOR_LEAVE_REQUESTED,
      userId: requestedBy,
      doctorId,
      branchId,
      leaveType: reasonType,
      emergencyOverride: Boolean(emergencyOverride),
      startDate,
      endDate
    });
  }

  return {
    ...leaveRecord,
    conflictingAppointmentsCount: conflictingAppointments.length,
    conflictingAppointments
  };
}

/**
 * Cancel or revoke a doctor's leave
 * @param {any} db 
 * @param {{ doctorId: string, leaveId: string, revokedBy?: string, userRole?: string }} params 
 */
async function revokeDoctorLeaveException(db, params) {
  const { doctorId, leaveId, revokedBy = doctorId, userRole = 'doctor' } = params;
  if (!doctorId || !leaveId) throw new Error('DOCTOR_AND_LEAVE_ID_REQUIRED');

  const schedule = await getDoctorSchedule(db, doctorId);
  const target = (schedule.leaves || []).find(l => l.id === leaveId);
  if (!target) throw new Error('LEAVE_NOT_FOUND');

  target.status = 'cancelled';
  target.revokedAt = new Date().toISOString();
  target.revokedBy = revokedBy;
  schedule.updatedAt = new Date().toISOString();

  if (db && typeof db.collection === 'function') {
    await db.collection('doctor_schedules').doc(doctorId).set(schedule, { merge: true });

    // Notification to doctor
    try {
      if (typeof notificationService?.recordNotificationHistory === 'function') {
        await notificationService.recordNotificationHistory(db, {
          userId: doctorId,
          eventType: 'doctor_leave_cancelled',
          title: 'تم إلغاء الإجازة وإعادة إتاحة المواعيد',
          message: `تم إلغاء الإجازة رقم ${leaveId} بنجاح وأصبحت فترات الحجز متاحة مجدداً للمرضى.`,
          urgent: false,
          metadata: { leaveId }
        });
      }
    } catch (_) {}

    // Audit event
    try {
      if (typeof auditService?.recordAuditEvent === 'function') {
        await auditService.recordAuditEvent(db, {
          type: 'DOCTOR_LEAVE_CANCELLED',
          actorUid: revokedBy,
          actorRole: userRole,
          targetUserId: doctorId,
          clinicId: target.branchId,
          outcome: 'SUCCESS',
          details: { leaveId, doctorId, branchId: target.branchId }
        });
      }
    } catch (_) {}

    await logTelemetryEvent(db, {
      eventType: EVENT_TYPES.DOCTOR_LEAVE_CANCELLED,
      userId: revokedBy,
      doctorId,
      leaveId,
      timestamp: target.revokedAt
    });
  }

  return { success: true, leave: target };
}

/**
 * Check if doctor is on active approved leave for a specific date and branch
 * @param {Array<any>} leaves 
 * @param {string} branchId 
 * @param {string} dateStr YYYY-MM-DD
 */
function isDoctorOnLeave(leaves = [], branchId, dateStr) {
  const checkDate = new Date(dateStr);
  return leaves.some(l => {
    if (l.status !== 'approved') return false;
    if (l.branchId !== 'all' && l.branchId !== branchId) return false;
    const start = new Date(l.startDate);
    const end = new Date(l.endDate);
    end.setHours(23, 59, 59, 999);
    return checkDate >= start && checkDate <= end;
  });
}

/**
 * Generate available time slots for a doctor on a specific date at a branch
 * @param {any} db 
 * @param {{ doctorId: string, branchId: string, date: string, bookedSlotIds?: string[] }} params 
 */
async function getAvailableDoctorSlots(db, params) {
  const { doctorId, branchId, date, bookedSlotIds = [] } = params;
  if (!doctorId || !branchId || !date) return [];

  const schedule = await getDoctorSchedule(db, doctorId);
  if (isDoctorOnLeave(schedule.leaves, branchId, date)) {
    return [];
  }

  const branchConfig = schedule.branches[branchId];
  if (!branchConfig) return [];

  const dayOfWeek = DAY_NAMES[new Date(date).getDay()];
  const dayConfig = branchConfig.workingDays ? branchConfig.workingDays[dayOfWeek] : null;

  if (!dayConfig || !dayConfig.active) {
    return [];
  }

  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
  const [endHour, endMin] = dayConfig.end.split(':').map(Number);
  const slotMinutes = dayConfig.slotDurationMinutes || branchConfig.slotDurationMinutes || 30;
  const bufferMinutes = branchConfig.bufferBetweenSlotsMinutes || 0;
  const totalStepMinutes = slotMinutes + bufferMinutes;

  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;

  const slots = [];
  let currentMinutes = startTotalMinutes;

  while (currentMinutes + slotMinutes <= endTotalMinutes) {
    const slotHour = Math.floor(currentMinutes / 60);
    const slotMin = currentMinutes % 60;
    const timeFormatted = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
    const slotId = `slot_${String(slotHour).padStart(2, '0')}${String(slotMin).padStart(2, '0')}`;

    if (!bookedSlotIds.includes(slotId)) {
      slots.push({
        id: slotId,
        time: timeFormatted,
        durationMinutes: slotMinutes,
        branchId,
        doctorId,
        date
      });
    }

    currentMinutes += totalStepMinutes;
  }

  return slots;
}

/**
 * Check if a doctor is available at a given date, time, and branch
 * @param {any} db 
 * @param {{ doctorId: string, branchId: string, date: string, time: string }} params 
 */
async function isDoctorAvailableAtTime(db, params) {
  const { doctorId, branchId, date, time } = params;
  const schedule = await getDoctorSchedule(db, doctorId);

  if (isDoctorOnLeave(schedule.leaves, branchId, date)) {
    return { available: false, reason: 'DOCTOR_ON_LEAVE' };
  }

  const branchConfig = schedule.branches[branchId];
  if (!branchConfig) return { available: false, reason: 'BRANCH_NOT_CONFIGURED' };

  const dayOfWeek = DAY_NAMES[new Date(date).getDay()];
  const dayConfig = branchConfig.workingDays ? branchConfig.workingDays[dayOfWeek] : null;
  if (!dayConfig || !dayConfig.active) {
    return { available: false, reason: 'BRANCH_CLOSED_ON_DAY' };
  }

  const [reqHour, reqMin] = time.split(':').map(Number);
  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
  const [endHour, endMin] = dayConfig.end.split(':').map(Number);

  const reqTotal = reqHour * 60 + reqMin;
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;

  if (reqTotal < startTotal || reqTotal >= endTotal) {
    return { available: false, reason: 'OUTSIDE_WORKING_HOURS' };
  }

  return { available: true };
}

module.exports = {
  EGYPT_BRANCHES,
  VALID_SLOT_DURATIONS,
  DEFAULT_BRANCH_HOURS,
  getDoctorSchedule,
  updateBranchSchedule,
  addDoctorLeaveException,
  revokeDoctorLeaveException,
  findConflictingAppointments,
  isDoctorOnLeave,
  getAvailableDoctorSlots,
  isDoctorAvailableAtTime
};
