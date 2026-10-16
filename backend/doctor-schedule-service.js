// @ts-check
/**
 * @fileoverview Doctor Schedule & Branch Manager Service
 * Manages Egyptian clinic branches, working hours, buffers, emergency leaves, and slot availability.
 * Features zero-PHI telemetry integration.
 */

import analyticsPkg from './analytics-service.js';
const { EVENT_TYPES, logTelemetryEvent } = analyticsPkg;

/**
 * Egyptian Clinic Branches Catalog with governorate and operational parameters
 */
export const EGYPT_BRANCHES = Object.freeze({
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
 * Standard default working days template
 */
export const DEFAULT_BRANCH_HOURS = Object.freeze({
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
export async function getDoctorSchedule(db, doctorId) {
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
 * Update working hours and slot parameters for a doctor at a branch
 * @param {any} db 
 * @param {{ doctorId: string, branchId: string, workingDays: Record<string, any>, bufferBetweenSlotsMinutes?: number, updatedBy?: string }} params 
 */
export async function updateBranchSchedule(db, params) {
  const { doctorId, branchId, workingDays, bufferBetweenSlotsMinutes = 5, updatedBy = doctorId } = params;
  if (!doctorId) throw new Error('DOCTOR_ID_REQUIRED');
  if (!branchId || (!EGYPT_BRANCHES[branchId] && branchId !== 'all')) {
    throw new Error('INVALID_BRANCH_ID');
  }

  const schedule = await getDoctorSchedule(db, doctorId);
  if (!schedule.branches[branchId]) {
    schedule.branches[branchId] = {
      branchId,
      bufferBetweenSlotsMinutes,
      workingDays: JSON.parse(JSON.stringify(DEFAULT_BRANCH_HOURS))
    };
  }

  schedule.branches[branchId].bufferBetweenSlotsMinutes = Number(bufferBetweenSlotsMinutes) || 0;
  if (workingDays && typeof workingDays === 'object') {
    schedule.branches[branchId].workingDays = {
      ...schedule.branches[branchId].workingDays,
      ...workingDays
    };
  }
  schedule.updatedAt = new Date().toISOString();

  if (db && typeof db.collection === 'function') {
    await db.collection('doctor_schedules').doc(doctorId).set(schedule, { merge: true });

    // Telemetry: strictly zero PHI
    await logTelemetryEvent(db, {
      eventType: EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
      userId: updatedBy,
      doctorId,
      branchId,
      bufferBetweenSlotsMinutes: schedule.branches[branchId].bufferBetweenSlotsMinutes,
      timestamp: schedule.updatedAt
    });
  }

  return { success: true, branchId, schedule };
}

/**
 * Request or record an emergency leave / exception
 * @param {any} db 
 * @param {{ doctorId: string, branchId: string, startDate: string, endDate: string, reasonType: string, notes?: string, emergencyOverride?: boolean, requestedBy?: string }} params 
 */
export async function addDoctorLeaveException(db, params) {
  const {
    doctorId,
    branchId = 'all',
    startDate,
    endDate,
    reasonType = 'personal',
    notes = '',
    emergencyOverride = false,
    requestedBy = doctorId
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
    status: emergencyOverride ? 'approved' : 'approved',
    createdAt: new Date().toISOString(),
    createdBy: requestedBy
  };

  schedule.leaves = schedule.leaves || [];
  schedule.leaves.push(leaveRecord);
  schedule.updatedAt = new Date().toISOString();

  if (db && typeof db.collection === 'function') {
    await db.collection('doctor_schedules').doc(doctorId).set(schedule, { merge: true });

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

  return leaveRecord;
}

/**
 * Cancel or revoke a doctor's leave
 * @param {any} db 
 * @param {{ doctorId: string, leaveId: string, revokedBy?: string }} params 
 */
export async function revokeDoctorLeaveException(db, params) {
  const { doctorId, leaveId, revokedBy = doctorId } = params;
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
export function isDoctorOnLeave(leaves = [], branchId, dateStr) {
  const checkDate = new Date(dateStr);
  return leaves.some(l => {
    if (l.status !== 'approved') return false;
    if (l.branchId !== 'all' && l.branchId !== branchId) return false;
    const start = new Date(l.startDate);
    const end = new Date(l.endDate);
    // Include full day of end date
    end.setHours(23, 59, 59, 999);
    return checkDate >= start && checkDate <= end;
  });
}

/**
 * Generate available time slots for a doctor on a specific date at a branch
 * @param {any} db 
 * @param {{ doctorId: string, branchId: string, date: string, bookedSlotIds?: string[] }} params 
 */
export async function getAvailableDoctorSlots(db, params) {
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
  const slotMinutes = dayConfig.slotDurationMinutes || 30;
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
export async function isDoctorAvailableAtTime(db, params) {
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
