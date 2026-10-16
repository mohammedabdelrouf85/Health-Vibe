/**
 * Health Vibe AI - Doctor Schedule & Branch Manager Service (TabeebHub Benchmark)
 * 
 * Provides:
 * 1. Branch profile definitions & multi-branch schedule registry (Dokki, Heliopolis, Telehealth, Alexandria).
 * 2. Working days (0 = Sunday to 6 = Saturday) and shift configuration (Morning, Evening, Custom).
 * 3. Consultation duration (15, 20, 30, 45, 60 min) and buffer time between appointments.
 * 4. Break periods & clinical rounds management.
 * 5. Leave & vacation blocking (annual, conference, emergency).
 * 6. Live deterministic slot generator for patient booking preview.
 * 7. Schedule validation guardrails (end > start, no overlapping shifts, minimum working days).
 * 8. Persistence to localStorage and optional synchronization with backend.
 */

(function (global) {
  "use strict";

  // Days of week mapping (Sunday = 0, Saturday = 6)
  const DAYS_OF_WEEK = [
    { dayIndex: 0, key: "sun", nameAr: "الأحد", nameEn: "Sunday", shortAr: "أحد", shortEn: "Sun" },
    { dayIndex: 1, key: "mon", nameAr: "الإثنين", nameEn: "Monday", shortAr: "إثنين", shortEn: "Mon" },
    { dayIndex: 2, key: "tue", nameAr: "الثلاثاء", nameEn: "Tuesday", shortAr: "ثلاثاء", shortEn: "Tue" },
    { dayIndex: 3, key: "wed", nameAr: "الأربعاء", nameEn: "Wednesday", shortAr: "أربعاء", shortEn: "Wed" },
    { dayIndex: 4, key: "thu", nameAr: "الخميس", nameEn: "Thursday", shortAr: "خميس", shortEn: "Thu" },
    { dayIndex: 5, key: "fri", nameAr: "الجمعة", nameEn: "Friday", shortAr: "جمعة", shortEn: "Fri" },
    { dayIndex: 6, key: "sat", nameAr: "السبت", nameEn: "Saturday", shortAr: "سبت", shortEn: "Sat" }
  ];

  // Standard duration options in minutes
  const DURATION_OPTIONS = [15, 20, 30, 45, 60];

  // Standard buffer times in minutes
  const BUFFER_OPTIONS = [0, 5, 10, 15];

  // Default Branch Registry (TabeebHub multi-branch model)
  const DEFAULT_BRANCHES = [
    {
      id: "branch_dokki_central",
      clinicId: "clinic_cairo_main",
      nameAr: "فرع الدقي المركزي (شارع التحرير)",
      nameEn: "Dokki Central Branch (Tahrir St)",
      shortNameAr: "الدقي المركزي",
      shortNameEn: "Dokki Central",
      cityAr: "الجيزة",
      cityEn: "Giza",
      addressAr: "شارع التحرير، الدقي، بجوار محطة المترو",
      addressEn: "Tahrir St, Dokki, next to Metro Station",
      isPrimary: true,
      isOnline: false,
      consultationTypes: ["clinic", "followup"],
      phone: "+20 2 3749 0001",
      schedule: {
        workingDays: [0, 1, 2, 3, 4], // Sun - Thu
        shifts: [
          { id: "shift_1", nameAr: "الفترة الصباحية", nameEn: "Morning Shift", start: "10:00", end: "13:00" },
          { id: "shift_2", nameAr: "الفترة المسائية", nameEn: "Evening Shift", start: "16:00", end: "20:30" }
        ],
        slotDurationMinutes: 30,
        bufferMinutes: 5,
        breakPeriods: [
          { id: "brk_1", labelAr: "المرور السريري واستراحة الغداء", labelEn: "Clinical Rounds & Lunch", start: "13:00", end: "16:00" }
        ]
      }
    },
    {
      id: "branch_heliopolis",
      clinicId: "clinic_heliopolis",
      nameAr: "فرع مصر الجديدة (شارع الميرغني)",
      nameEn: "Heliopolis Branch (El-Merghany St)",
      shortNameAr: "مصر الجديدة",
      shortNameEn: "Heliopolis",
      cityAr: "القاهرة",
      cityEn: "Cairo",
      addressAr: "شارع الميرغني، مصر الجديدة",
      addressEn: "El-Merghany St, Heliopolis, Cairo",
      isPrimary: false,
      isOnline: false,
      consultationTypes: ["clinic"],
      phone: "+20 2 2418 0002",
      schedule: {
        workingDays: [1, 3, 6], // Mon, Wed, Sat
        shifts: [
          { id: "shift_1", nameAr: "الفترة المسائية", nameEn: "Evening Shift", start: "17:00", end: "21:30" }
        ],
        slotDurationMinutes: 30,
        bufferMinutes: 0,
        breakPeriods: []
      }
    },
    {
      id: "branch_telehealth_virtual",
      clinicId: "clinic_telehealth_virtual",
      nameAr: "العيادة الافتراضية (استشارات الفيديو والمتابعة عن بُعد)",
      nameEn: "Virtual Telehealth Clinic (Remote Video & Follow-ups)",
      shortNameAr: "عن بُعد (فيديو)",
      shortNameEn: "Telehealth (Video)",
      cityAr: "عن بُعد / مصر",
      cityEn: "Remote / Egypt",
      addressAr: "جلسات استشارية رقمية مشفرة لتقليل مشقة المواصلات",
      addressEn: "Encrypted digital consultations to relieve Cairo commute burden",
      isPrimary: false,
      isOnline: true,
      consultationTypes: ["video", "followup"],
      phone: "+20 100 000 9999",
      schedule: {
        workingDays: [0, 1, 2, 3, 4, 5, 6], // All week
        shifts: [
          { id: "shift_1", nameAr: "فترة الصباح عن بُعد", nameEn: "Morning Remote Shift", start: "09:00", end: "11:30" },
          { id: "shift_2", nameAr: "فترة المساء المرنة", nameEn: "Evening Flexible Shift", start: "20:30", end: "22:30" }
        ],
        slotDurationMinutes: 20,
        bufferMinutes: 5,
        breakPeriods: []
      }
    },
    {
      id: "branch_alexandria",
      clinicId: "clinic_alexandria",
      nameAr: "فرع الإسكندرية (طريق الحرية)",
      nameEn: "Alexandria Branch (Al-Horreya Ave)",
      shortNameAr: "الإسكندرية",
      shortNameEn: "Alexandria",
      cityAr: "الإسكندرية",
      cityEn: "Alexandria",
      addressAr: "طريق الحرية، الإسكندرية",
      addressEn: "Al-Horreya Ave, Alexandria",
      isPrimary: false,
      isOnline: false,
      consultationTypes: ["clinic"],
      phone: "+20 3 4870 0003",
      schedule: {
        workingDays: [2, 5], // Tue, Fri
        shifts: [
          { id: "shift_1", nameAr: "عيادة الإسكندرية", nameEn: "Alexandria Shift", start: "11:00", end: "16:00" }
        ],
        slotDurationMinutes: 30,
        bufferMinutes: 0,
        breakPeriods: []
      }
    }
  ];

  // Quick Schedule Presets for Fast Setup
  const SCHEDULE_PRESETS = [
    {
      id: "preset_egypt_standard",
      nameAr: "دوام عيادات مصر النموذجي (صباحي + مسائي)",
      nameEn: "Standard Egyptian Dual Shift (10am-1pm & 4pm-8:30pm)",
      workingDays: [0, 1, 2, 3, 4],
      shifts: [
        { id: "shift_1", nameAr: "الفترة الصباحية", nameEn: "Morning Shift", start: "10:00", end: "13:00" },
        { id: "shift_2", nameAr: "الفترة المسائية", nameEn: "Evening Shift", start: "16:00", end: "20:30" }
      ],
      slotDurationMinutes: 30,
      bufferMinutes: 5,
      breakPeriods: [
        { id: "brk_1", labelAr: "المرور السريري واستراحة الغداء", labelEn: "Clinical Rounds & Lunch", start: "13:00", end: "16:00" }
      ]
    },
    {
      id: "preset_evening_only",
      nameAr: "عيادة مسائية مكثفة (5م - 10م)",
      nameEn: "Evening Intensive Clinic (5pm - 10pm)",
      workingDays: [0, 1, 2, 3, 4, 6],
      shifts: [
        { id: "shift_1", nameAr: "الفترة المسائية", nameEn: "Evening Shift", start: "17:00", end: "22:00" }
      ],
      slotDurationMinutes: 20,
      bufferMinutes: 0,
      breakPeriods: []
    },
    {
      id: "preset_telehealth_light",
      nameAr: "استشارات عن بُعد سريعة (صباحية ومسائية)",
      nameEn: "Light Remote Telehealth (Morning & Late Evening)",
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      shifts: [
        { id: "shift_1", nameAr: "فترة الصباح", nameEn: "Morning Shift", start: "09:00", end: "11:30" },
        { id: "shift_2", nameAr: "فترة المساء", nameEn: "Evening Shift", start: "20:30", end: "23:00" }
      ],
      slotDurationMinutes: 20,
      bufferMinutes: 5,
      breakPeriods: []
    }
  ];

  // In-memory working copies (keyed by doctorId or default 'current_doctor')
  const doctorSchedulesStore = new Map();
  const doctorLeavesStore = new Map();

  /**
   * Helper: Clone deep
   */
  function cloneData(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Helper: Parse "HH:MM" string to minutes from midnight
   */
  function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;
    const parts = timeStr.trim().split(":");
    const hours = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    return hours * 60 + mins;
  }

  /**
   * Helper: Convert minutes from midnight to "HH:MM"
   */
  function minutesToTime(minutes) {
    const total = Math.max(0, Math.min(1439, Math.floor(minutes)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  /**
   * Helper: Format time string "HH:MM" to localized display
   */
  function formatDisplayTime(timeStr, isEn = false) {
    if (!timeStr) return "";
    const [hStr, mStr] = timeStr.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr || "00";
    const isPm = h >= 12;
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;

    const formattedHour = String(h).padStart(2, "0");
    if (isEn) {
      return `${formattedHour}:${m} ${isPm ? "PM" : "AM"}`;
    }
    return `${formattedHour}:${m} ${isPm ? "مساءً" : "صباحًا"}`;
  }

  /**
   * Validate a single shift
   */
  function validateShift(shift) {
    const errors = [];
    if (!shift || !shift.start || !shift.end) {
      errors.push({ code: "EMPTY_SHIFT_TIMES", messageAr: "يرجى تحديد وقت بدء ونهاية الفترة", messageEn: "Start and end times are required" });
      return { valid: false, errors };
    }
    const startMins = timeToMinutes(shift.start);
    const endMins = timeToMinutes(shift.end);

    if (endMins <= startMins) {
      errors.push({ code: "END_BEFORE_START", messageAr: "وقت نهاية الفترة يجب أن يكون بعد وقت البدء", messageEn: "Shift end time must be after start time" });
    } else if (endMins - startMins < 30) {
      errors.push({ code: "SHIFT_TOO_SHORT", messageAr: "أقصر فترة عمل مقبولة هي 30 دقيقة", messageEn: "Minimum shift duration is 30 minutes" });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate an entire branch schedule
   */
  function validateSchedule(schedule) {
    const errors = [];

    if (!schedule) {
      return { valid: false, errors: [{ code: "NO_SCHEDULE", messageAr: "الجدول غير موجود", messageEn: "Schedule is missing" }] };
    }

    // 1. Working days
    if (!Array.isArray(schedule.workingDays) || schedule.workingDays.length === 0) {
      errors.push({ code: "NO_WORKING_DAYS", messageAr: "يجب اختيار يوم عمل واحد على الأقل", messageEn: "At least one working day must be selected" });
    }

    // 2. Shifts
    if (!Array.isArray(schedule.shifts) || schedule.shifts.length === 0) {
      errors.push({ code: "NO_SHIFTS", messageAr: "يجب تحديد فترة عمل واحدة على الأقل", messageEn: "At least one shift must be configured" });
    } else {
      // Validate each shift
      schedule.shifts.forEach((s, idx) => {
        const res = validateShift(s);
        if (!res.valid) {
          res.errors.forEach(err => {
            errors.push({
              code: `${err.code}_SHIFT_${idx + 1}`,
              messageAr: `فترة العمل (${idx + 1}): ${err.messageAr}`,
              messageEn: `Shift (${idx + 1}): ${err.messageEn}`
            });
          });
        }
      });

      // Check shift overlaps
      for (let i = 0; i < schedule.shifts.length; i++) {
        const s1 = schedule.shifts[i];
        const s1Start = timeToMinutes(s1.start);
        const s1End = timeToMinutes(s1.end);

        for (let j = i + 1; j < schedule.shifts.length; j++) {
          const s2 = schedule.shifts[j];
          const s2Start = timeToMinutes(s2.start);
          const s2End = timeToMinutes(s2.end);

          if (s1Start < s2End && s2Start < s1End) {
            errors.push({
              code: "SHIFTS_OVERLAP",
              messageAr: `تداخل بين فترتي العمل: (${s1.start} - ${s1.end}) مع (${s2.start} - ${s2.end})`,
              messageEn: `Shift overlap detected between (${s1.start} - ${s1.end}) and (${s2.start} - ${s2.end})`
            });
          }
        }
      }
    }

    // 3. Slot duration
    const duration = Number(schedule.slotDurationMinutes) || 30;
    if (duration < 10 || duration > 120) {
      errors.push({ code: "INVALID_SLOT_DURATION", messageAr: "مدة الكشف يجب أن تكون بين 10 و 120 دقيقة", messageEn: "Slot duration must be between 10 and 120 minutes" });
    }

    // 4. Breaks validation
    if (Array.isArray(schedule.breakPeriods) && schedule.breakPeriods.length > 0) {
      schedule.breakPeriods.forEach((b, idx) => {
        const bStart = timeToMinutes(b.start);
        const bEnd = timeToMinutes(b.end);
        if (bEnd <= bStart) {
          errors.push({
            code: `INVALID_BREAK_${idx + 1}`,
            messageAr: `فترة الاستراحة (${idx + 1}): وقت النهاية يجب أن يكون بعد البدء`,
            messageEn: `Break period (${idx + 1}): end time must be after start time`
          });
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Deterministic Live Slot Generator for a specific date and branch
   */
  function generateSlotsForDate(schedule, dateStr, leaves = [], isEn = false) {
    if (!schedule || !dateStr) {
      return { available: false, reason: "INVALID_PARAMETERS", reasonAr: "بيانات غير مكتملة", reasonEn: "Incomplete parameters", slots: [] };
    }

    // Parse date
    const [year, month, day] = dateStr.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    // 1. Day off check
    const workingDays = Array.isArray(schedule.workingDays) ? schedule.workingDays : [0, 1, 2, 3, 4];
    if (!workingDays.includes(dayOfWeek)) {
      const dayMeta = DAYS_OF_WEEK.find(d => d.dayIndex === dayOfWeek) || {};
      return {
        available: false,
        reason: "DAY_OFF",
        reasonAr: `عيادة الطبيب لا تعمل في يوم (${dayMeta.nameAr || "هذا اليوم"})`,
        reasonEn: `Doctor does not have scheduled hours on (${dayMeta.nameEn || "this day"})`,
        slots: [],
        dayMeta
      };
    }

    // 2. Doctor Leave check
    const activeLeave = leaves.find(l => {
      if (!l.startDate || !l.endDate) return false;
      return dateStr >= l.startDate && dateStr <= l.endDate;
    });

    if (activeLeave) {
      return {
        available: false,
        reason: "ON_LEAVE",
        leave: activeLeave,
        reasonAr: `الطبيب في إجازة معتمدة: ${activeLeave.reasonAr || activeLeave.reason || "عطلة"}`,
        reasonEn: `Doctor is on approved leave: ${activeLeave.reason || activeLeave.reasonAr || "Vacation"}`,
        slots: []
      };
    }

    // 3. Generate slots from shifts
    const slotDuration = Number(schedule.slotDurationMinutes) || 30;
    const buffer = Number(schedule.bufferMinutes) || 0;
    const step = slotDuration + buffer;
    const breakPeriods = Array.isArray(schedule.breakPeriods) ? schedule.breakPeriods : [];
    const shifts = Array.isArray(schedule.shifts) ? schedule.shifts : [];

    const generatedSlots = [];

    shifts.forEach((shift, sIdx) => {
      const shiftStartMins = timeToMinutes(shift.start);
      const shiftEndMins = timeToMinutes(shift.end);

      let curr = shiftStartMins;
      let slotIndex = 1;

      while (curr + slotDuration <= shiftEndMins) {
        const slotStartStr = minutesToTime(curr);
        const slotEndStr = minutesToTime(curr + slotDuration);

        // Check if overlaps with any break period
        const isDuringBreak = breakPeriods.some(b => {
          const bStart = timeToMinutes(b.start);
          const bEnd = timeToMinutes(b.end);
          return curr < bEnd && (curr + slotDuration) > bStart;
        });

        if (!isDuringBreak) {
          const slotId = `slot_${slotStartStr.replace(":", "")}`;
          const isMorning = curr < 720; // before 12:00 PM
          const periodAr = isMorning ? "الفترة الصباحية" : "الفترة المسائية";
          const periodEn = isMorning ? "Morning Shift" : "Evening Shift";

          generatedSlots.push({
            id: slotId,
            shiftIndex: sIdx,
            shiftNameAr: shift.nameAr || periodAr,
            shiftNameEn: shift.nameEn || periodEn,
            startTime: slotStartStr,
            endTime: slotEndStr,
            durationMinutes: slotDuration,
            timeAr: formatDisplayTime(slotStartStr, false),
            timeEn: formatDisplayTime(slotStartStr, true),
            periodAr,
            periodEn,
            isMorning
          });
        }

        curr += step;
        slotIndex++;
      }
    });

    const morningCount = generatedSlots.filter(s => s.isMorning).length;
    const eveningCount = generatedSlots.filter(s => !s.isMorning).length;

    return {
      available: generatedSlots.length > 0,
      reason: generatedSlots.length > 0 ? "AVAILABLE" : "NO_SLOTS_IN_SHIFT",
      reasonAr: generatedSlots.length > 0 ? "المواعيد متاحة للحجز" : "لا توجد فترات كافية للحجز في هذا اليوم",
      reasonEn: generatedSlots.length > 0 ? "Slots available for booking" : "No available slots generated for this shift",
      slots: generatedSlots,
      totalCapacity: generatedSlots.length,
      morningCount,
      eveningCount
    };
  }

  /**
   * Initialize or retrieve branches for a doctor
   */
  function getDoctorBranches(doctorId = "current_doctor") {
    const key = `hv_doctor_branches_${doctorId}`;
    if (!doctorSchedulesStore.has(key)) {
      let loaded = null;
      try {
        if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem(key);
          if (raw) loaded = JSON.parse(raw);
        }
      } catch (e) {}

      if (!loaded || !Array.isArray(loaded) || loaded.length === 0) {
        loaded = cloneData(DEFAULT_BRANCHES);
      }
      doctorSchedulesStore.set(key, loaded);
    }
    return cloneData(doctorSchedulesStore.get(key));
  }

  /**
   * Save updated branches schedule
   */
  function saveDoctorBranches(doctorId = "current_doctor", branches = []) {
    const key = `hv_doctor_branches_${doctorId}`;
    doctorSchedulesStore.set(key, cloneData(branches));
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, JSON.stringify(branches));
      }
    } catch (e) {}
    return true;
  }

  /**
   * Retrieve doctor leaves
   */
  function getDoctorLeaves(doctorId = "current_doctor") {
    const key = `hv_doctor_leaves_${doctorId}`;
    if (!doctorLeavesStore.has(key)) {
      let loaded = null;
      try {
        if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem(key);
          if (raw) loaded = JSON.parse(raw);
        }
      } catch (e) {}

      if (!loaded || !Array.isArray(loaded)) {
        // Sample default leave for demonstration
        loaded = [
          {
            id: "leave_conf_2026",
            startDate: "2026-11-10",
            endDate: "2026-11-12",
            type: "conference",
            reason: "International Pulmonology Summit",
            reasonAr: "المؤتمر السنوي لأمراض الجهاز التنفسي والحساسية"
          }
        ];
      }
      doctorLeavesStore.set(key, loaded);
    }
    return cloneData(doctorLeavesStore.get(key));
  }

  /**
   * Add a new leave
   */
  function addDoctorLeave(doctorId = "current_doctor", leaveData = {}) {
    if (!leaveData.startDate || !leaveData.endDate) {
      throw new Error("Both start date and end date are required for a leave.");
    }
    if (leaveData.endDate < leaveData.startDate) {
      throw new Error("Leave end date cannot be earlier than start date.");
    }

    const leaves = getDoctorLeaves(doctorId);
    const newLeave = {
      id: `leave_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      startDate: leaveData.startDate,
      endDate: leaveData.endDate,
      type: leaveData.type || "annual",
      reason: leaveData.reason || "Scheduled Vacation",
      reasonAr: leaveData.reasonAr || "إجازة مجدولة معتمدة",
      createdAt: new Date().toISOString()
    };
    leaves.push(newLeave);

    const key = `hv_doctor_leaves_${doctorId}`;
    doctorLeavesStore.set(key, leaves);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, JSON.stringify(leaves));
      }
    } catch (e) {}

    return newLeave;
  }

  /**
   * Remove a leave
   */
  function removeDoctorLeave(doctorId = "current_doctor", leaveId) {
    let leaves = getDoctorLeaves(doctorId);
    leaves = leaves.filter(l => l.id !== leaveId);
    const key = `hv_doctor_leaves_${doctorId}`;
    doctorLeavesStore.set(key, leaves);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, JSON.stringify(leaves));
      }
    } catch (e) {}
    return true;
  }

  /**
   * Apply a preset schedule to a branch
   */
  function applyPresetToBranch(branch, presetId) {
    const preset = SCHEDULE_PRESETS.find(p => p.id === presetId);
    if (!preset || !branch) return branch;

    branch.schedule = {
      workingDays: [...preset.workingDays],
      shifts: cloneData(preset.shifts),
      slotDurationMinutes: preset.slotDurationMinutes,
      bufferMinutes: preset.bufferMinutes || 0,
      breakPeriods: cloneData(preset.breakPeriods || [])
    };
    return branch;
  }

  // Export module
  const DoctorScheduleService = {
    DAYS_OF_WEEK,
    DURATION_OPTIONS,
    BUFFER_OPTIONS,
    DEFAULT_BRANCHES,
    SCHEDULE_PRESETS,
    timeToMinutes,
    minutesToTime,
    formatDisplayTime,
    validateShift,
    validateSchedule,
    generateSlotsForDate,
    getDoctorBranches,
    saveDoctorBranches,
    getDoctorLeaves,
    addDoctorLeave,
    removeDoctorLeave,
    applyPresetToBranch
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorScheduleService;
  }
  if (typeof global !== "undefined") {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.DoctorScheduleService = DoctorScheduleService;
  }
})(typeof window !== "undefined" ? window : global);
