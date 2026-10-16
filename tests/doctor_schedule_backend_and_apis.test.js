/**
 * Health Vibe AI - Doctor Schedule Manager Backend & APIs Test Suite
 *
 * Benchmarked against TabeebHub Standards:
 * Multi-branch Egyptian clinics, working hours, buffers, emergency leave exceptions,
 * and automated multi-channel notification dispatching with strict Zero-PHI security.
 */

const assert = require('assert');
const doctorScheduleService = require('../backend/doctor-schedule-service');
const schedulingService = require('../backend/scheduling-service');
const notificationService = require('../backend/notification-service');
const auditService = require('../backend/audit-service');
const analyticsService = require('../backend/analytics-service');

console.log('==================================================================');
console.log('🗓️ DOCTOR SCHEDULE MANAGER: BACKEND & APIS SUITE');
console.log('   Egyptian Branches, Shift Durations, Emergency Leaves & Alerts');
console.log('==================================================================\n');

// Mock in-memory Firestore DB
function createMockDb() {
  const store = new Map();
  return {
    collection: (collName) => ({
      doc: (docId) => ({
        get: async () => {
          const key = `${collName}/${docId}`;
          const val = store.get(key);
          return {
            exists: Boolean(val),
            data: () => val ? JSON.parse(JSON.stringify(val)) : null
          };
        },
        set: async (data, opts) => {
          const key = `${collName}/${docId}`;
          if (opts && opts.merge) {
            const existing = store.get(key) || {};
            store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          } else {
            store.set(key, JSON.parse(JSON.stringify(data)));
          }
          return { id: docId };
        },
        update: async (data) => {
          const key = `${collName}/${docId}`;
          const existing = store.get(key) || {};
          store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          return { id: docId };
        }
      }),
      where: (field, op, val) => {
        return {
          where: (f2, op2, val2) => ({
            get: async () => {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${collName}/`)) {
                  let match = false;
                  if (op === '==' && v[field] === val) match = true;
                  if (op === 'in' && Array.isArray(val) && val.includes(v[field])) match = true;
                  let match2 = false;
                  if (op2 === '==' && v[f2] === val2) match2 = true;
                  if (op2 === 'in' && Array.isArray(val2) && val2.includes(v[f2])) match2 = true;
                  if (match && match2) {
                    docs.push({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) });
                  }
                }
              }
              return { empty: docs.length === 0, docs, forEach: (fn) => docs.forEach(fn) };
            }
          }),
          get: async () => {
            const docs = [];
            for (const [k, v] of store.entries()) {
              if (k.startsWith(`${collName}/`)) {
                if (op === '==' && v[field] === val) {
                  docs.push({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) });
                } else if (op === 'in' && Array.isArray(val) && val.includes(v[field])) {
                  docs.push({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) });
                }
              }
            }
            return { empty: docs.length === 0, docs, forEach: (fn) => docs.forEach(fn) };
          }
        };
      },
      add: async (data) => {
        const id = 'gen_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        store.set(`${collName}/${id}`, JSON.parse(JSON.stringify(data)));
        return { id };
      }
    }),
    _store: store
  };
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runAll() {
  const db = createMockDb();

  console.log('--- 1. Egyptian Branches Catalog & Default Working Hours ---');

  await runTest('should export all primary Egyptian branches with governorates', async () => {
    const branches = doctorScheduleService.EGYPT_BRANCHES;
    assert(branches.cairo_nasr_city, 'cairo_nasr_city branch missing');
    assert(branches.cairo_maadi, 'cairo_maadi branch missing');
    assert(branches.giza_dokki, 'giza_dokki branch missing');
    assert(branches.alex_smouha, 'alex_smouha branch missing');
    assert.strictEqual(branches.giza_dokki.governorate, 'Giza');
    assert.strictEqual(branches.alex_smouha.governorate, 'Alexandria');
  });

  await runTest('getDoctorSchedule should return default schedule when no custom schedule exists', async () => {
    const schedule = await doctorScheduleService.getDoctorSchedule(db, 'dr_tarek_01');
    assert.strictEqual(schedule.doctorId, 'dr_tarek_01');
    assert(schedule.branches.cairo_nasr_city, 'Default branches should be populated');
    assert.strictEqual(schedule.branches.cairo_nasr_city.bufferBetweenSlotsMinutes, 5);
    assert.strictEqual(schedule.branches.cairo_nasr_city.workingDays.friday.active, false);
    assert.strictEqual(schedule.branches.cairo_nasr_city.workingDays.sunday.active, true);
  });

  console.log('\n--- 2. Branch Schedule Modifications & Validations ---');

  await runTest('updateBranchSchedule should reject invalid slot durations with error', async () => {
    await assert.rejects(
      async () => {
        await doctorScheduleService.updateBranchSchedule(db, {
          doctorId: 'dr_tarek_01',
          branchId: 'cairo_nasr_city',
          slotDurationMinutes: 25 // Invalid
        });
      },
      /INVALID_SLOT_DURATION/
    );
  });

  await runTest('updateBranchSchedule should reject inverted working hours (end before start)', async () => {
    await assert.rejects(
      async () => {
        await doctorScheduleService.updateBranchSchedule(db, {
          doctorId: 'dr_tarek_01',
          branchId: 'cairo_nasr_city',
          workingDays: {
            monday: { active: true, start: '18:00', end: '10:00' }
          }
        });
      },
      /INVALID_HOURS_FOR_MONDAY/
    );
  });

  await runTest('updateBranchSchedule should save custom schedule and dispatch confirmation notification', async () => {
    notificationService.clearNotificationHistoryLog();
    const result = await doctorScheduleService.updateBranchSchedule(db, {
      doctorId: 'dr_tarek_01',
      branchId: 'giza_dokki',
      slotDurationMinutes: 20,
      bufferBetweenSlotsMinutes: 10,
      workingDays: {
        sunday: { active: true, start: '10:00', end: '16:00', slotDurationMinutes: 20, maxCapacity: 15 }
      },
      updatedBy: 'dr_tarek_01',
      userRole: 'doctor'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.schedule.branches.giza_dokki.bufferBetweenSlotsMinutes, 10);
    assert.strictEqual(result.schedule.branches.giza_dokki.slotDurationMinutes, 20);

    // Verify confirmation notification recorded
    const historyObj = await notificationService.getUserNotificationHistory(db, 'dr_tarek_01');
    const updateNotif = (historyObj.notifications || []).find(n => n.eventType === 'doctor_schedule_updated');
    assert(updateNotif, 'Should dispatch doctor_schedule_updated notification to doctor');
  });

  console.log('\n--- 3. Emergency Leaves & Conflicting Booking Notifications ---');

  await runTest('addDoctorLeaveException should reject invalid date range (endDate before startDate)', async () => {
    await assert.rejects(
      async () => {
        await doctorScheduleService.addDoctorLeaveException(db, {
          doctorId: 'dr_tarek_01',
          startDate: '2026-11-20',
          endDate: '2026-11-15',
          reasonType: 'vacation'
        });
      },
      /END_DATE_BEFORE_START/
    );
  });

  await runTest('addDoctorLeaveException should detect conflicting bookings and notify affected patients', async () => {
    // Seed an existing confirmed appointment on leave date
    await db.collection('appointments').doc('appt_conflict_01').set({
      id: 'appt_conflict_01',
      doctorId: 'dr_tarek_01',
      patientId: 'patient_omar_conflict',
      patientEmail: 'omar@example.com',
      date: '2026-11-15',
      slotId: 'slot_1000',
      branchId: 'giza_dokki',
      status: 'confirmed'
    });

    notificationService.clearNotificationHistoryLog();

    const leave = await doctorScheduleService.addDoctorLeaveException(db, {
      doctorId: 'dr_tarek_01',
      branchId: 'giza_dokki',
      startDate: '2026-11-14',
      endDate: '2026-11-16',
      reasonType: 'medical_emergency',
      notes: 'Attending medical urgent symposium',
      emergencyOverride: true,
      requestedBy: 'dr_tarek_01'
    });

    assert(leave.id, 'Leave ID should be created');
    assert.strictEqual(leave.conflictingAppointmentsCount, 1, 'Should detect 1 conflicting appointment');

    // Verify affected patient received urgent reschedule alert
    const patientHistObj = await notificationService.getUserNotificationHistory(db, 'patient_omar_conflict');
    const patientAlert = (patientHistObj.notifications || []).find(n => n.eventType === 'doctor_leave_exception');
    assert(patientAlert, 'Affected patient must receive doctor_leave_exception alert');
    assert(patientAlert.urgent, 'Patient leave conflict notification must be urgent');
    assert(patientAlert.message.includes('اعتذار') || patientAlert.message.includes('نعتذر'), 'Message must explain doctor leave');

    // Verify doctor received confirmation with affected count
    const doctorHistObj = await notificationService.getUserNotificationHistory(db, 'dr_tarek_01');
    const docAlert = (doctorHistObj.notifications || []).find(n => n.eventType === 'doctor_leave_exception');
    assert(docAlert, 'Doctor must receive confirmation of recorded leave');
  });

  console.log('\n--- 4. Dynamic Leave Integration with Appointment Booking Service ---');

  await runTest('bookAppointmentTransaction should reject booking on dynamic doctor leave date with DOCTOR_ON_LEAVE', async () => {
    await assert.rejects(
      async () => {
        await schedulingService.bookAppointmentTransaction(db, {
          patientId: 'patient_test_leave',
          patientName: 'Test Patient',
          doctorId: 'dr_tarek_01',
          doctorName: 'Dr. Tarek',
          date: '2026-11-15', // Matches active leave from previous test
          slotId: 'slot_1000',
          branchId: 'giza_dokki',
          clinicId: 'clinic_cairo_main',
          consultationType: 'clinic'
        }, { uid: 'patient_test_leave', role: 'patient' });
      },
      (err) => {
        assert.strictEqual(err.code, 'DOCTOR_ON_LEAVE');
        return true;
      }
    );
  });

  await runTest('rescheduleAppointmentTransaction should reject reschedule to dynamic leave date with DOCTOR_ON_LEAVE', async () => {
    // Seed an initial appointment on an open date
    await db.collection('appointments').doc('appt_to_resched').set({
      id: 'appt_to_resched',
      patientId: 'pat_resched_leave',
      patientName: 'Resched Patient',
      doctorId: 'dr_tarek_01',
      doctorName: 'Dr. Tarek',
      date: '2026-11-10',
      slotId: 'slot_1000',
      branchId: 'giza_dokki',
      clinicId: 'clinic_cairo_main',
      status: 'confirmed'
    });

    await assert.rejects(
      async () => {
        await schedulingService.rescheduleAppointmentTransaction(db, {
          appointmentId: 'appt_to_resched',
          newDate: '2026-11-15', // On doctor leave
          newSlotId: 'slot_1100',
          reason: 'Want earlier time'
        }, { uid: 'pat_resched_leave', role: 'patient' });
      },
      (err) => {
        assert.strictEqual(err.code, 'DOCTOR_ON_LEAVE');
        return true;
      }
    );
  });

  console.log('\n--- 5. Leave Revocation & Availability Restoration ---');

  await runTest('revokeDoctorLeaveException should restore doctor availability', async () => {
    const schedule = await doctorScheduleService.getDoctorSchedule(db, 'dr_tarek_01');
    const targetLeave = schedule.leaves.find(l => l.startDate === '2026-11-14');
    assert(targetLeave, 'Target leave must exist');

    const revokeResult = await doctorScheduleService.revokeDoctorLeaveException(db, {
      doctorId: 'dr_tarek_01',
      leaveId: targetLeave.id,
      revokedBy: 'dr_tarek_01'
    });

    assert.strictEqual(revokeResult.success, true);
    assert.strictEqual(revokeResult.leave.status, 'cancelled');

    // Confirm isDoctorOnLeave returns false
    const onLeaveNow = doctorScheduleService.isDoctorOnLeave(
      (await doctorScheduleService.getDoctorSchedule(db, 'dr_tarek_01')).leaves,
      'giza_dokki',
      '2026-11-15'
    );
    assert.strictEqual(onLeaveNow, false, 'Doctor must no longer be on leave after revocation');
  });

  console.log('\n--- 6. Slot Generation & Capacity Calculation ---');

  await runTest('getAvailableDoctorSlots should calculate discrete intervals respecting buffers', async () => {
    // Branch with 20 min slots and 10 min buffer (step = 30 mins) from 10:00 to 12:00 -> 10:00, 10:30, 11:00, 11:30
    await doctorScheduleService.updateBranchSchedule(db, {
      doctorId: 'dr_slot_calc',
      branchId: 'alex_smouha',
      slotDurationMinutes: 20,
      bufferBetweenSlotsMinutes: 10,
      workingDays: {
        monday: { active: true, start: '10:00', end: '12:00', slotDurationMinutes: 20 }
      }
    });

    const slots = await doctorScheduleService.getAvailableDoctorSlots(db, {
      doctorId: 'dr_slot_calc',
      branchId: 'alex_smouha',
      date: '2026-11-02', // A Monday
      bookedSlotIds: ['slot_1030'] // slot at 10:30 already booked
    });

    assert.strictEqual(slots.length, 3, 'Should generate 3 available slots after filtering booked one');
    assert.strictEqual(slots[0].time, '10:00');
    assert.strictEqual(slots[1].time, '11:00');
    assert.strictEqual(slots[2].time, '11:30');
    assert.strictEqual(slots[0].durationMinutes, 20);
  });

  console.log('\n--- 7. Zero PHI Security Verification ---');

  await runTest('schedule and leave management must strictly forbid clinical PHI attributes in telemetry', async () => {
    // Test that passing forbidden clinical data into doctor telemetry throws error
    await assert.rejects(
      async () => {
        await analyticsService.logTelemetryEvent(db, {
          eventType: analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
          userId: 'dr_tarek_01',
          doctorId: 'dr_tarek_01',
          branchId: 'giza_dokki',
          diagnosis: 'Severe Asthma', // FORBIDDEN
          timestamp: new Date().toISOString()
        });
      },
      /MEDICAL_TEXT_PROHIBITED/
    );
  });

  console.log('\n--- 8. Server REST API Route Contracts & RBAC ---');

  await runTest('backend/server.js should register all doctor-schedules REST routes with RBAC', () => {
    const fs = require('fs');
    const path = require('path');
    const serverCode = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    assert(
      serverCode.includes("app.get('/api/doctor-schedules/branches'"),
      'GET /api/doctor-schedules/branches must be registered'
    );
    assert(
      serverCode.includes("app.get('/api/doctor-schedules/:doctorId'"),
      'GET /api/doctor-schedules/:doctorId must be registered'
    );
    assert(
      serverCode.includes("app.put('/api/doctor-schedules/:doctorId/branches/:branchId'"),
      'PUT /api/doctor-schedules/:doctorId/branches/:branchId must be registered'
    );
    assert(
      serverCode.includes("app.post('/api/doctor-schedules/:doctorId/leaves'"),
      'POST /api/doctor-schedules/:doctorId/leaves must be registered'
    );
    assert(
      serverCode.includes("app.delete('/api/doctor-schedules/:doctorId/leaves/:leaveId'"),
      'DELETE /api/doctor-schedules/:doctorId/leaves/:leaveId must be registered'
    );
    assert(
      serverCode.includes("app.get('/api/doctor-schedules/:doctorId/slots'"),
      'GET /api/doctor-schedules/:doctorId/slots must be registered'
    );
    assert(
      serverCode.includes('requireAuth') && serverCode.includes('requireVerifiedEmail'),
      'Mutation endpoints must enforce requireAuth and requireVerifiedEmail'
    );
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
