/**
 * Health Vibe AI - Appointments Data Service
 * 
 * Manages clinical appointment slot calculations, doctor shift schedules,
 * approved leaves, and anti-double-booking checks.
 */

(function (global) {
  "use strict";

  const AVAILABLE_APPOINTMENT_SLOTS = [
    { id: "slot_1000", timeAr: "10:00 صباحًا", timeEn: "10:00 AM", periodAr: "استشارة صباحية - 20 دقيقة", periodEn: "Morning Consultation - 20 min" },
    { id: "slot_1130", timeAr: "11:30 صباحًا", timeEn: "11:30 AM", periodAr: "استشارة ومتابعة سريرية", periodEn: "Clinical Review & Follow-up" },
    { id: "slot_1600", timeAr: "04:00 مساءً", timeEn: "04:00 PM", periodAr: "عيادة مسائية مبكرة", periodEn: "Early Evening Clinic" },
    { id: "slot_1830", timeAr: "06:30 مساءً", timeEn: "06:30 PM", periodAr: "جلسة مراجعة تنفسية متخصصة", periodEn: "Specialized Respiratory Review" },
    { id: "slot_2000", timeAr: "08:00 مساءً", timeEn: "08:00 PM", periodAr: "استشارة مسائية متقدمة", periodEn: "Late Evening Telehealth" }
  ];

  const CLINICS_REGISTRY = {
    clinic_cairo_main: {
      clinicId: "clinic_cairo_main",
      name: "عيادة الصدر والرعاية التنفسية التخصصية",
      nameEn: "Specialized Chest & Respiratory Clinic",
      timeZone: "Africa/Cairo",
      operatingHours: { open: "09:00", close: "21:00", workingDays: [0, 1, 2, 3, 4] }
    },
    clinic_riyadh_pulmonary: {
      clinicId: "clinic_riyadh_pulmonary",
      name: "مركز الرياض المتقدم للرعاية التنفسية",
      nameEn: "Riyadh Advanced Pulmonary Care Center",
      timeZone: "Asia/Riyadh",
      operatingHours: { open: "09:00", close: "21:00", workingDays: [0, 1, 2, 3, 4] }
    }
  };

  const DOCTORS_WORK_SCHEDULES = {
    dr_mona: {
      doctorId: "dr_mona",
      name: "د. منى سامي",
      nameEn: "Dr. Mona Samy",
      specialty: "أمراض الصدر والحساسية",
      specialtyEn: "Pulmonology & Allergy",
      clinicId: "clinic_cairo_main",
      timeZone: "Africa/Cairo",
      licenseNumber: "EGY-MED-449102",
      weeklySchedule: {
        workingDays: [0, 1, 2, 3, 4],
        shifts: [{ start: "10:00", end: "13:00" }, { start: "16:00", end: "20:30" }],
        slotDurationMinutes: 30,
        breakPeriods: [{ start: "13:00", end: "16:00", label: "Mid-day Rounds" }]
      },
      leaves: [
        {
          id: "leave_mona_conf",
          startDate: "2026-10-10",
          endDate: "2026-10-12",
          reason: "International Pulmonology Summit",
          reasonAr: "المؤتمر الدولي لأمراض الصدر"
        }
      ]
    },
    dr_ahmed: {
      doctorId: "dr_ahmed",
      name: "د. أحمد السيد",
      nameEn: "Dr. Ahmed El-Sayed",
      specialty: "استشاري الأمراض الصدرية والعناية المركزة",
      specialtyEn: "Critical Care & Pulmonary Consultant",
      clinicId: "clinic_cairo_main",
      timeZone: "Africa/Cairo",
      licenseNumber: "EGY-MED-381044",
      weeklySchedule: {
        workingDays: [0, 1, 2, 3, 4],
        shifts: [{ start: "11:30", end: "15:00" }, { start: "16:00", end: "20:30" }],
        slotDurationMinutes: 30,
        breakPeriods: [{ start: "15:00", end: "16:00", label: "ICU Rounds" }]
      },
      leaves: [
        {
          id: "leave_ahmed_annual",
          startDate: "2026-10-15",
          endDate: "2026-10-18",
          reason: "Annual Leave",
          reasonAr: "إجازة سنوية معتمدة"
        }
      ]
    }
  };

  function checkDoctorLeaveClient(doctor, dateStr) {
    if (!doctor || !Array.isArray(doctor.leaves)) return { onLeave: false };
    for (const leave of doctor.leaves) {
      if (leave.startDate && leave.endDate && dateStr >= leave.startDate && dateStr <= leave.endDate) {
        return { onLeave: true, leave };
      }
      if (leave.date === dateStr) {
        return { onLeave: true, leave };
      }
    }
    return { onLeave: false };
  }

  function calculateSlotsForDoctor(doctor, dateStr) {
    if (!doctor) {
      return { available: false, reason: "NO_DOCTOR", slots: [] };
    }
    const clinic = CLINICS_REGISTRY[doctor.clinicId] || CLINICS_REGISTRY.clinic_cairo_main;
    const timeZone = doctor.timeZone || clinic.timeZone || "Africa/Cairo";

    // Check approved leaves
    const leaveCheck = checkDoctorLeaveClient(doctor, dateStr);
    if (leaveCheck.onLeave) {
      return {
        available: false,
        reason: "ON_LEAVE",
        leave: leaveCheck.leave,
        clinic,
        timeZone,
        slots: []
      };
    }

    // Check working days
    const [year, month, day] = dateStr.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
    const schedule = doctor.weeklySchedule || {};
    const workingDays = schedule.workingDays || [0, 1, 2, 3, 4];

    if (!workingDays.includes(dayOfWeek)) {
      return {
        available: false,
        reason: "OFF_DAY",
        clinic,
        timeZone,
        slots: []
      };
    }

    // Build shifts slots
    const generated = [];
    const shifts = schedule.shifts || [{ start: "10:00", end: "18:00" }];
    const breaks = schedule.breakPeriods || [];
    const slotDuration = schedule.slotDurationMinutes || 30;

    shifts.forEach(shift => {
      const [startH, startM] = shift.start.split(":").map(Number);
      const [endH, endM] = shift.end.split(":").map(Number);
      let cur = startH * 60 + startM;
      const end = endH * 60 + endM;

      while (cur + slotDuration <= end) {
        const slotStartH = Math.floor(cur / 60);
        const slotStartM = cur % 60;
        const timeStr = `${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}`;

        const inBreak = breaks.some(b => {
          const [bStartH, bStartM] = b.start.split(":").map(Number);
          const [bEndH, bEndM] = b.end.split(":").map(Number);
          const bStart = bStartH * 60 + bStartM;
          const bEnd = bEndH * 60 + bEndM;
          return cur >= bStart && cur < bEnd;
        });

        if (!inBreak) {
          const isPm = slotStartH >= 12;
          const displayH = slotStartH % 12 || 12;
          const timeEn = `${String(displayH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
          const timeAr = `${String(displayH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")} ${isPm ? "مساءً" : "صباحًا"}`;

          generated.push({
            id: `slot_${timeStr.replace(":", "")}`,
            time: timeStr,
            timeEn,
            timeAr,
            duration: slotDuration,
            clinicId: doctor.clinicId,
            timeZone
          });
        }
        cur += slotDuration;
      }
    });

    return {
      available: true,
      reason: null,
      clinic,
      timeZone,
      slots: generated
    };
  }

  const AppointmentsService = {
    AVAILABLE_APPOINTMENT_SLOTS,
    CLINICS_REGISTRY,
    DOCTORS_WORK_SCHEDULES,
    checkDoctorLeaveClient,
    calculateSlotsForDoctor
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AppointmentsService = AppointmentsService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppointmentsService;
  }
})(typeof window !== "undefined" ? window : globalThis);
