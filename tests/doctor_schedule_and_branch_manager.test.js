// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EGYPT_BRANCHES,
  DEFAULT_BRANCH_HOURS,
  getDoctorSchedule,
  updateBranchSchedule,
  addDoctorLeaveException,
  revokeDoctorLeaveException,
  getAvailableDoctorSlots,
  isDoctorAvailableAtTime
} from '../backend/doctor-schedule-service.js';
import {
  EGYPT_BRANCH_CATALOG,
  formatBranchLabel,
  calculateShiftDurationHours,
  validateLeaveDateRange,
  buildDoctorLeavePayload
} from '../app/modules/doctor-schedule/doctor-schedule-service.js';
import { translations } from '../app/i18n.js';
import analyticsPkg from '../backend/analytics-service.js';
const { EVENT_TYPES, logTelemetryEvent } = analyticsPkg;

test('Doctor Schedule & Branch Manager - Egyptian Branches & Default Working Hours', async (t) => {
  await t.test('Egyptian branches catalog contains expected clinics with governorate metadata', () => {
    assert.ok(EGYPT_BRANCHES.cairo_nasr_city, 'Nasr City branch must exist');
    assert.ok(EGYPT_BRANCHES.cairo_maadi, 'Maadi branch must exist');
    assert.ok(EGYPT_BRANCHES.giza_dokki, 'Dokki branch must exist');
    assert.ok(EGYPT_BRANCHES.alex_smouha, 'Smouha branch must exist');

    assert.equal(EGYPT_BRANCHES.cairo_nasr_city.governorate, 'Cairo');
    assert.equal(EGYPT_BRANCHES.giza_dokki.governorate, 'Giza');
    assert.equal(EGYPT_BRANCHES.alex_smouha.governorate, 'Alexandria');
    assert.equal(EGYPT_BRANCHES.cairo_nasr_city.slotIntervalMinutes, 30);
  });

  await t.test('Client-side branch catalog mirrors backend branches with bilingual labels', () => {
    assert.equal(EGYPT_BRANCH_CATALOG.length, Object.keys(EGYPT_BRANCHES).length);
    const nasrCity = EGYPT_BRANCH_CATALOG.find(b => b.id === 'cairo_nasr_city');
    assert.ok(nasrCity);
    assert.ok(nasrCity.nameAr.includes('مدينة نصر'));
    assert.ok(nasrCity.nameEn.includes('Nasr City'));

    assert.equal(formatBranchLabel('cairo_nasr_city', 'ar'), nasrCity.nameAr);
    assert.equal(formatBranchLabel('cairo_nasr_city', 'en'), nasrCity.nameEn);
    assert.equal(formatBranchLabel('unknown_branch', 'en'), 'unknown_branch');
  });

  await t.test('Shift duration calculation utility returns accurate hours', () => {
    assert.equal(calculateShiftDurationHours('09:00', '17:00'), 8);
    assert.equal(calculateShiftDurationHours('10:00', '14:30'), 4.5);
    assert.equal(calculateShiftDurationHours('18:00', '18:00'), 0);
  });
});

test('Doctor Schedule & Branch Manager - Doctor Schedule Retrieval & Modification', async (t) => {
  const mockDb = {
    _collections: {
      doctor_schedules: {},
      telemetry: {}
    },
    collection(name) {
      if (!this._collections[name]) this._collections[name] = {};
      return {
        doc: (id) => ({
          get: async () => ({
            exists: Boolean(mockDb._collections[name][id]),
            data: () => mockDb._collections[name][id]
          }),
          set: async (data, opts) => {
            if (opts && opts.merge) {
              mockDb._collections[name][id] = { ...(mockDb._collections[name][id] || {}), ...data };
            } else {
              mockDb._collections[name][id] = data;
            }
          }
        }),
        add: async (data) => {
          const id = 'tel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          mockDb._collections[name][id] = data;
          return { id };
        }
      };
    }
  };

  const doctorId = 'dr_ahmed_ramzy';

  await t.test('getDoctorSchedule returns default template if doctor has no prior custom schedule', async () => {
    const schedule = await getDoctorSchedule(mockDb, doctorId);
    assert.equal(schedule.doctorId, doctorId);
    assert.ok(schedule.branches.cairo_nasr_city);
    assert.ok(schedule.branches.giza_dokki);
    assert.equal(schedule.leaves.length, 0);
  });

  await t.test('updateBranchSchedule modifies working hours and dispatches DOCTOR_SCHEDULE_UPDATED telemetry', async () => {
    const customDays = {
      sunday: { active: true, start: '10:00', end: '16:00', slotDurationMinutes: 30, maxCapacity: 12 },
      tuesday: { active: true, start: '12:00', end: '18:00', slotDurationMinutes: 30, maxCapacity: 12 },
      friday: { active: false, start: '00:00', end: '00:00', slotDurationMinutes: 30, maxCapacity: 0 }
    };

    const result = await updateBranchSchedule(mockDb, {
      doctorId,
      branchId: 'cairo_nasr_city',
      workingDays: customDays,
      bufferBetweenSlotsMinutes: 10,
      updatedBy: doctorId
    });

    assert.equal(result.success, true);
    assert.equal(result.branchId, 'cairo_nasr_city');
    assert.equal(result.schedule.branches.cairo_nasr_city.bufferBetweenSlotsMinutes, 10);
    assert.equal(result.schedule.branches.cairo_nasr_city.workingDays.sunday.start, '10:00');

    // Check telemetry event
    const telemetryEvents = Object.values(mockDb._collections.telemetry);
    const scheduleEvent = telemetryEvents.find(e => e.eventType === EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED);
    assert.ok(scheduleEvent, 'DOCTOR_SCHEDULE_UPDATED event must be recorded');
    assert.equal(scheduleEvent.doctorId, doctorId);
    assert.equal(scheduleEvent.branchId, 'cairo_nasr_city');
    assert.equal(scheduleEvent.bufferBetweenSlotsMinutes, 10);
  });

  await t.test('addDoctorLeaveException adds emergency leave and dispatches DOCTOR_LEAVE_REQUESTED telemetry', async () => {
    const leave = await addDoctorLeaveException(mockDb, {
      doctorId,
      branchId: 'all',
      startDate: '2026-11-01',
      endDate: '2026-11-03',
      reasonType: 'medical_emergency',
      notes: 'Attending critical clinical training workshop',
      emergencyOverride: true,
      requestedBy: doctorId
    });

    assert.ok(leave.id);
    assert.equal(leave.status, 'approved'); // emergency auto-approval
    assert.equal(leave.emergencyOverride, true);

    const updatedSchedule = await getDoctorSchedule(mockDb, doctorId);
    assert.equal(updatedSchedule.leaves.length, 1);
    assert.equal(updatedSchedule.leaves[0].id, leave.id);

    // Verify telemetry
    const telemetryEvents = Object.values(mockDb._collections.telemetry);
    const leaveEvent = telemetryEvents.find(e => e.eventType === EVENT_TYPES.DOCTOR_LEAVE_REQUESTED);
    assert.ok(leaveEvent, 'DOCTOR_LEAVE_REQUESTED event must be recorded');
    assert.equal(leaveEvent.leaveType, 'medical_emergency');
    assert.equal(leaveEvent.emergencyOverride, true);
  });

  await t.test('revokeDoctorLeaveException cancels active leave and dispatches DOCTOR_LEAVE_CANCELLED', async () => {
    const schedule = await getDoctorSchedule(mockDb, doctorId);
    const leaveId = schedule.leaves[0].id;

    const revoked = await revokeDoctorLeaveException(mockDb, {
      doctorId,
      leaveId,
      revokedBy: doctorId
    });

    assert.equal(revoked.success, true);
    assert.equal(revoked.leave.status, 'cancelled');

    const updated = await getDoctorSchedule(mockDb, doctorId);
    assert.equal(updated.leaves[0].status, 'cancelled');

    const telemetryEvents = Object.values(mockDb._collections.telemetry);
    const cancelEvent = telemetryEvents.find(e => e.eventType === EVENT_TYPES.DOCTOR_LEAVE_CANCELLED);
    assert.ok(cancelEvent, 'DOCTOR_LEAVE_CANCELLED event must be recorded');
    assert.equal(cancelEvent.leaveId, leaveId);
  });
});

test('Doctor Schedule & Branch Manager - Slot Calculation & Leave Conflict Prevention', async (t) => {
  const mockDb = {
    _collections: {
      doctor_schedules: {},
      telemetry: {}
    },
    collection(name) {
      if (!this._collections[name]) this._collections[name] = {};
      return {
        doc: (id) => ({
          get: async () => ({
            exists: Boolean(mockDb._collections[name][id]),
            data: () => mockDb._collections[name][id]
          }),
          set: async (data, opts) => {
            if (opts && opts.merge) {
              mockDb._collections[name][id] = { ...(mockDb._collections[name][id] || {}), ...data };
            } else {
              mockDb._collections[name][id] = data;
            }
          }
        }),
        add: async (data) => {
          const id = 'tel_' + Date.now();
          mockDb._collections[name][id] = data;
          return { id };
        }
      };
    }
  };

  const doctorId = 'dr_sarah_nour';

  // Configure Sunday schedule: 09:00 - 12:00 (3 hours = 6 30-min slots)
  await updateBranchSchedule(mockDb, {
    doctorId,
    branchId: 'cairo_nasr_city',
    workingDays: {
      sunday: { active: true, start: '09:00', end: '12:00', slotDurationMinutes: 30, maxCapacity: 6 }
    },
    bufferBetweenSlotsMinutes: 0,
    updatedBy: doctorId
  });

  await t.test('Generates available slots on active working days', async () => {
    // 2026-11-08 is a Sunday
    const slots = await getAvailableDoctorSlots(mockDb, {
      doctorId,
      branchId: 'cairo_nasr_city',
      date: '2026-11-08',
      bookedSlotIds: ['slot_0930'] // 09:30 is already booked
    });

    assert.equal(slots.length, 5); // 6 total - 1 booked = 5
    assert.ok(!slots.find(s => s.id === 'slot_0930'));
    assert.ok(slots.find(s => s.id === 'slot_0900'));
    assert.ok(slots.find(s => s.id === 'slot_1000'));
  });

  await t.test('Returns zero slots on doctor leave/vacation day', async () => {
    // Add leave covering 2026-11-08
    await addDoctorLeaveException(mockDb, {
      doctorId,
      branchId: 'all',
      startDate: '2026-11-07',
      endDate: '2026-11-09',
      reasonType: 'vacation',
      emergencyOverride: true,
      requestedBy: doctorId
    });

    const slots = await getAvailableDoctorSlots(mockDb, {
      doctorId,
      branchId: 'cairo_nasr_city',
      date: '2026-11-08',
      bookedSlotIds: []
    });

    assert.equal(slots.length, 0, 'Should return 0 slots when doctor is on approved leave');

    const availability = await isDoctorAvailableAtTime(mockDb, {
      doctorId,
      branchId: 'cairo_nasr_city',
      date: '2026-11-08',
      time: '10:00'
    });

    assert.equal(availability.available, false);
    assert.equal(availability.reason, 'DOCTOR_ON_LEAVE');
  });

  await t.test('Client payload validation rejects invalid date ranges', () => {
    const invalidRange = validateLeaveDateRange('2026-11-10', '2026-11-05');
    assert.equal(invalidRange.valid, false);
    assert.equal(invalidRange.error, 'END_DATE_BEFORE_START');

    const validRange = validateLeaveDateRange('2026-11-05', '2026-11-10');
    assert.equal(validRange.valid, true);

    const payload = buildDoctorLeavePayload({
      branchId: 'cairo_nasr_city',
      startDate: '2026-11-05',
      endDate: '2026-11-10',
      reasonType: 'personal',
      notes: 'Attending family wedding'
    });
    assert.equal(payload.branchId, 'cairo_nasr_city');
    assert.equal(payload.reasonType, 'personal');
    assert.equal(payload.status, 'pending');
  });
});

test('Doctor Schedule & Branch Manager - Zero PHI Telemetry Protection', async (t) => {
  const mockDb = {
    _collections: { telemetry: {} },
    collection(name) {
      return {
        add: async (data) => {
          const id = 'tel_' + Date.now();
          mockDb._collections[name][id] = data;
          return { id };
        }
      };
    }
  };

  await t.test('Rejects medical notes and diagnostic keys in doctor schedule telemetry', async () => {
    await assert.rejects(
      async () => {
        await logTelemetryEvent(mockDb, {
          eventType: EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
          userId: 'dr_123',
          doctorId: 'dr_123',
          branchId: 'cairo_nasr_city',
          diagnosis: 'Severe respiratory condition' // FORBIDDEN KEY
        });
      },
      /MEDICAL_TEXT_PROHIBITED/
    );

    await assert.rejects(
      async () => {
        await logTelemetryEvent(mockDb, {
          eventType: EVENT_TYPES.DOCTOR_LEAVE_REQUESTED,
          userId: 'dr_123',
          doctorId: 'dr_123',
          symptoms: 'Fever and cough' // FORBIDDEN KEY
        });
      },
      /MEDICAL_TEXT_PROHIBITED/
    );
  });
});

test('Doctor Schedule & Branch Manager - Bilingual i18n Catalog Completeness', () => {
  const ar = translations.ar.doctorSchedule;
  const en = translations.en.doctorSchedule;

  assert.ok(ar, 'Arabic doctorSchedule translations must exist');
  assert.ok(en, 'English doctorSchedule translations must exist');

  const requiredKeys = [
    'title',
    'subtitle',
    'selectBranch',
    'branchCairoNasrCity',
    'branchCairoMaadi',
    'branchGizaDokki',
    'branchAlexSmouha',
    'weeklyWorkingHours',
    'daySunday',
    'dayMonday',
    'dayTuesday',
    'dayWednesday',
    'dayThursday',
    'dayFriday',
    'daySaturday',
    'activeDay',
    'inactiveDay',
    'startTime',
    'endTime',
    'slotDuration',
    'bufferTime',
    'leavesAndExceptions',
    'requestLeaveBtn',
    'emergencyOverrideBadge',
    'leaveReasonEmergency',
    'leaveReasonVacation',
    'leaveReasonConference',
    'leaveReasonPersonal',
    'leaveStatusApproved',
    'leaveStatusPending',
    'leaveStatusCancelled',
    'saveScheduleBtn',
    'scheduleSavedSuccess',
    'leaveSavedSuccess',
    'revokeLeaveBtn',
    'revokeLeaveSuccess',
    'confirmRevokeLeave',
    'invalidDateRange'
  ];

  for (const key of requiredKeys) {
    assert.ok(ar[key] && ar[key].trim().length > 0, `Arabic translation missing for key: doctorSchedule.${key}`);
    assert.ok(en[key] && en[key].trim().length > 0, `English translation missing for key: doctorSchedule.${key}`);
  }
});
