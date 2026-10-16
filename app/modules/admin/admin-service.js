/**
 * Health Vibe AI - Admin Data Service
 * 
 * Computes clinical & operational KPI metrics (completion rate, physician response time,
 * report turnaround time, SLA compliance) and filters audit logs.
 */

(function (global) {
  "use strict";

  function parseKpiTimestamp(val) {
    if (!val) return 0;
    if (typeof val === "number" && !isNaN(val)) return val;
    if (val.toMillis && typeof val.toMillis === "function") return val.toMillis();
    if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1e6) : 0);
    if (typeof val === "string") {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return parsed;
    }
    if (val instanceof Date) return val.getTime();
    return 0;
  }

  function calculateKpiMetrics(cases = [], options = {}) {
    const timeRange = options.timeRange || "all";
    const priorityFilter = options.priority || "all";
    const clinicFilter = (options.clinicId || options.clinic || "").trim().toLowerCase();
    const startDate = options.startDate || options.from;
    const endDate = options.endDate || options.to;

    // Filter out demo/test data
    const realCases = cases.filter(c => {
      if (!c) return false;
      if (typeof global.isRealProductionRecord === "function") {
        return global.isRealProductionRecord(c);
      }
      return !c.isDemo && !c.isTest && !c.isMock && !c.isSeed &&
        !String(c.id || "").startsWith("demo_") &&
        !String(c.id || "").startsWith("test_") &&
        !String(c.id || "").startsWith("mock_");
    });

    // Apply Clinic filter
    let clinicFiltered = realCases;
    if (clinicFilter && clinicFilter !== "all") {
      clinicFiltered = clinicFiltered.filter(c => {
        const cId = String(c.clinicId || c.clinic || c.branchId || "").trim().toLowerCase();
        return cId === clinicFilter;
      });
    }

    // Apply Time Range / Date Range filter
    const now = Date.now();
    let minTs = 0;
    let maxTs = Infinity;

    if (startDate) minTs = parseKpiTimestamp(startDate);
    if (endDate) {
      const parsedEnd = parseKpiTimestamp(endDate);
      if (typeof endDate === "string" && endDate.length === 10) {
        maxTs = parsedEnd + (24 * 60 * 60 * 1000 - 1);
      } else {
        maxTs = parsedEnd;
      }
    }

    if (!startDate && !endDate) {
      if (timeRange === "today") {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        minTs = d.getTime();
        maxTs = now;
      } else if (timeRange === "7d") {
        minTs = now - (7 * 24 * 60 * 60 * 1000);
        maxTs = now;
      } else if (timeRange === "30d") {
        minTs = now - (30 * 24 * 60 * 60 * 1000);
        maxTs = now;
      }
    }

    let filtered = clinicFiltered.filter(c => {
      const ts = parseKpiTimestamp(c.submittedAt || c.createdAt || c.timestamp || c.updatedAt);
      return (minTs === 0 || ts >= minTs) && (maxTs === Infinity || ts <= maxTs);
    });

    // Apply Priority filter
    if (priorityFilter && priorityFilter !== "all") {
      filtered = filtered.filter(c => {
        const o2 = Number(c.oxygenLevel) || Number(c.o2);
        const prio = String(c.priority || c.risk || "").toLowerCase();
        if (priorityFilter === "urgent") return (o2 > 0 && o2 < 90) || prio === "urgent";
        if (priorityFilter === "high") return (o2 >= 90 && o2 < 93) || prio === "high";
        if (priorityFilter === "normal") return o2 >= 93 || prio === "normal" || (!c.priority && o2 >= 90);
        return true;
      });
    }

    // 1. COMPLETION RATE METRICS
    const totalCases = filtered.length;
    const completedCases = filtered.filter(c => c.status === "approved" || c.doctorApproved === true || c.status === "closed");
    const pendingCases = filtered.filter(c => !["approved", "rejected", "closed"].includes(c.status));
    const urgentCases = filtered.filter(c => (Number(c.oxygenLevel) > 0 && Number(c.oxygenLevel) < 90) || String(c.priority || c.risk || "").toLowerCase() === "urgent");
    const urgentCompletedCases = urgentCases.filter(c => c.status === "approved" || c.doctorApproved === true || c.status === "closed");

    const completionRate = totalCases > 0
      ? Math.round((completedCases.length / totalCases) * 100)
      : 0;

    const urgentCompletionRate = urgentCases.length > 0
      ? Math.round((urgentCompletedCases.length / urgentCases.length) * 100)
      : 0;

    // 2. RESPONSE TIME METRICS
    const responseTimes = [];
    const urgentResponseTimes = [];

    filtered.forEach(c => {
      const submitTs = parseKpiTimestamp(c.submittedAt || c.createdAt || c.timestamp);
      const responseTs = parseKpiTimestamp(
        c.firstReviewedAt || c.reviewedAt || c.moreInfoRequestedAt || c.approvedAt || c.rejectedAt ||
        (c.statusHistory && c.statusHistory.length > 1 ? c.statusHistory[1].changedAt || c.statusHistory[1].timestamp : null)
      );

      if (submitTs > 0 && responseTs >= submitTs) {
        const diffMin = Math.max(0.5, (responseTs - submitTs) / 60000);
        responseTimes.push(diffMin);

        const o2 = Number(c.oxygenLevel) || Number(c.o2);
        if ((o2 > 0 && o2 < 90) || String(c.priority || c.risk || "").toLowerCase() === "urgent") {
          urgentResponseTimes.push(diffMin);
        }
      }
    });

    responseTimes.sort((a, b) => a - b);
    const hasResponseData = responseTimes.length > 0;

    const avgResponseTimeMinutes = hasResponseData
      ? Number((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1))
      : 0;

    const medianResponseTimeMinutes = hasResponseData
      ? Number(responseTimes[Math.floor(responseTimes.length / 2)].toFixed(1))
      : 0;

    const responseSlaComplianceRate = hasResponseData
      ? Math.round((responseTimes.filter(t => t <= 30).length / responseTimes.length) * 100)
      : 0;

    // 3. REPORT TURNAROUND TIME (TAT) METRICS
    const turnaroundTimes = [];

    completedCases.forEach(c => {
      const submitTs = parseKpiTimestamp(c.submittedAt || c.createdAt || c.timestamp);
      const approvedTs = parseKpiTimestamp(c.approvedAt || c.reportGeneratedAt || c.generatedAt || c.certifiedAt || c.reviewedAt);

      if (submitTs > 0 && approvedTs >= submitTs) {
        const diffMin = Math.max(1, (approvedTs - submitTs) / 60000);
        turnaroundTimes.push(diffMin);
      }
    });

    turnaroundTimes.sort((a, b) => a - b);
    const hasTurnaroundData = turnaroundTimes.length > 0;

    const avgTurnaroundMinutes = hasTurnaroundData
      ? Number((turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length).toFixed(1))
      : 0;

    const medianTurnaroundMinutes = hasTurnaroundData
      ? Number(turnaroundTimes[Math.floor(turnaroundTimes.length / 2)].toFixed(1))
      : 0;

    const turnaroundSlaComplianceRate = hasTurnaroundData
      ? Math.round((turnaroundTimes.filter(t => t <= 120).length / turnaroundTimes.length) * 100)
      : 0;

    // 4. PATIENTS PER DAY FROM ACTUAL EVENTS
    const distinctPatientIds = new Set();
    filtered.forEach(c => {
      const pid = c.patientId || c.patientUid || c.userId;
      if (pid) distinctPatientIds.add(String(pid));
    });

    let daysInPeriod = 1;
    if (minTs > 0 && maxTs < Infinity && maxTs > minTs) {
      daysInPeriod = Math.max(1, Math.ceil((maxTs - minTs) / (24 * 60 * 60 * 1000)));
    } else if (timeRange === "7d") {
      daysInPeriod = 7;
    } else if (timeRange === "30d") {
      daysInPeriod = 30;
    } else if (timeRange === "all" && filtered.length > 1) {
      const tsList = filtered.map(c => parseKpiTimestamp(c.submittedAt || c.createdAt || c.timestamp)).filter(t => t > 0);
      if (tsList.length > 1) {
        const minT = Math.min(...tsList);
        const maxT = Math.max(...tsList);
        daysInPeriod = Math.max(1, Math.ceil((maxT - minT) / (24 * 60 * 60 * 1000)));
      }
    }

    const hasPatientsData = distinctPatientIds.size > 0;
    const patientsPerDayValue = hasPatientsData
      ? Number((distinctPatientIds.size / daysInPeriod).toFixed(2))
      : null;

    // 5. WORKLOAD FROM ACTUAL ACTIVE EVENTS
    const activeCases = filtered.filter(c => ["pending", "submitted", "triaged", "assigned", "under_review"].includes(c.status));
    const doctorWorkloadMap = new Map();
    activeCases.forEach(c => {
      const docName = c.approvingDoctorName || c.assignedDoctorName || c.doctorName || "Unassigned";
      doctorWorkloadMap.set(docName, (doctorWorkloadMap.get(docName) || 0) + 1);
    });
    const activeDoctorCount = Array.from(doctorWorkloadMap.keys()).filter(k => k !== "Unassigned").length;
    const hasWorkloadData = activeCases.length > 0 && activeDoctorCount > 0;
    const avgWorkloadPerDoctor = hasWorkloadData
      ? Number((activeCases.length / activeDoctorCount).toFixed(1))
      : null;

    return {
      totalCases,
      completedCases: completedCases.length,
      pendingCases: pendingCases.length,
      urgentCases: urgentCases.length,
      urgentCompletedCases: urgentCompletedCases.length,
      completionRate,
      urgentCompletionRate,
      avgResponseTimeMinutes,
      medianResponseTimeMinutes,
      responseSlaComplianceRate,
      avgTurnaroundMinutes,
      medianTurnaroundMinutes,
      turnaroundSlaComplianceRate,

      // Enhanced event-based metrics with availability indicators
      responseTime: {
        avgMinutes: hasResponseData ? avgResponseTimeMinutes : null,
        medianMinutes: hasResponseData ? medianResponseTimeMinutes : null,
        display: hasResponseData ? `${avgResponseTimeMinutes} min` : "Unavailable",
        displayAr: hasResponseData ? `${avgResponseTimeMinutes} دقيقة` : "غير متاح",
        isAvailable: hasResponseData
      },
      approvalTime: {
        avgMinutes: hasTurnaroundData ? avgTurnaroundMinutes : null,
        medianMinutes: hasTurnaroundData ? medianTurnaroundMinutes : null,
        display: hasTurnaroundData ? `${avgTurnaroundMinutes} min` : "Unavailable",
        displayAr: hasTurnaroundData ? `${avgTurnaroundMinutes} دقيقة` : "غير متاح",
        isAvailable: hasTurnaroundData
      },
      patientsPerDay: {
        value: patientsPerDayValue,
        distinctPatients: distinctPatientIds.size,
        daysCount: daysInPeriod,
        display: hasPatientsData ? `${patientsPerDayValue} patients/day` : "Unavailable",
        displayAr: hasPatientsData ? `${patientsPerDayValue} مريض/يوم` : "غير متاح",
        isAvailable: hasPatientsData
      },
      workload: {
        avgWorkloadPerDoctor,
        totalActiveCases: activeCases.length,
        activeDoctorCount,
        display: hasWorkloadData ? `${avgWorkloadPerDoctor} cases/doc` : "Unavailable",
        displayAr: hasWorkloadData ? `${avgWorkloadPerDoctor} حالة/طبيب` : "غير متاح",
        isAvailable: hasWorkloadData
      },
      display: {
        responseTime: hasResponseData ? `${avgResponseTimeMinutes} min` : "Unavailable",
        approvalTime: hasTurnaroundData ? `${avgTurnaroundMinutes} min` : "Unavailable",
        patientsPerDay: hasPatientsData ? `${patientsPerDayValue} patients/day` : "Unavailable",
        workload: hasWorkloadData ? `${avgWorkloadPerDoctor} cases/doc` : "Unavailable",
        completionRate: totalCases > 0 ? `${completionRate}%` : "Unavailable"
      },
      displayAr: {
        responseTime: hasResponseData ? `${avgResponseTimeMinutes} دقيقة` : "غير متاح",
        approvalTime: hasTurnaroundData ? `${avgTurnaroundMinutes} دقيقة` : "غير متاح",
        patientsPerDay: hasPatientsData ? `${patientsPerDayValue} مريض/يوم` : "غير متاح",
        workload: hasWorkloadData ? `${avgWorkloadPerDoctor} حالة/طبيب` : "غير متاح",
        completionRate: totalCases > 0 ? `${completionRate}%` : "غير متاح"
      }
    };
  }

  function calculateAssessmentJourneyMetrics(events = [], options = {}) {
    const starts = events.filter(e => e.eventType === 'assessment_start').length;
    const completes = events.filter(e => e.eventType === 'assessment_complete').length;
    const abandons = events.filter(e => e.eventType === 'assessment_abandon').length;
    const persistedCases = options.persistedCasesCount !== undefined ? options.persistedCasesCount : completes;

    const completionRate = starts > 0 ? Number(((completes / starts) * 100).toFixed(1)) : null;
    const abandonmentRate = starts > 0 ? Number(((abandons / starts) * 100).toFixed(1)) : null;

    return {
      starts,
      completes,
      abandons,
      persistedCasesCount: persistedCases,
      completionRate,
      abandonmentRate,
      completionRateDisplay: completionRate !== null ? `${completionRate}%` : 'Unavailable',
      completionRateDisplayAr: completionRate !== null ? `${completionRate}%` : 'غير متاح',
      distinctionNote: 'Cases count reflects database persistence, while assessment-journey completion rate measures patient progression from start to finish.'
    };
  }

  const EVENT_TYPES = Object.freeze({
    SIGNUP: 'signup',
    ONBOARDING: 'onboarding',
    ASSESSMENT_START: 'assessment_start',
    ASSESSMENT_COMPLETE: 'assessment_complete',
    ASSESSMENT_ABANDON: 'assessment_abandon',
    DOCTOR_REVIEW: 'doctor_review',
    RESULT_OPENED: 'result_opened',
    FOLLOW_UP_BOOKED: 'follow_up_booked'
  });

  const SUPPORT_TICKET_TYPES = Object.freeze({
    EXPERIENCE_RATING: 'experience_rating',
    BUG_REPORT: 'bug_report',
    INACCURATE_INFORMATION: 'inaccurate_information',
    FEATURE_REQUEST: 'feature_request',
    ACCOUNT_RECOVERY: 'account_recovery',
    CONTACT_FORM: 'contact_form'
  });

  function filterTickets(tickets = [], filters = {}) {
    if (!Array.isArray(tickets)) return [];
    return tickets.filter(t => {
      if (filters.type && filters.type !== 'all' && t.type !== filters.type) return false;
      if (filters.status && filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.priority && filters.priority !== 'all' && t.priority !== filters.priority) return false;
      if (filters.search && filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        const content = `${t.ticketId || ''} ${t.subject || ''} ${t.comment || ''} ${t.userName || ''}`.toLowerCase();
        if (!content.includes(q)) return false;
      }
      return true;
    });
  }

  function calculateTicketMetrics(tickets = []) {
    const total = tickets.length;
    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress').length;
    const escalated = tickets.filter(t => t.status === 'escalated').length;
    const resolved = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
    const resolutionRate = total > 0 ? Number(((resolved / total) * 100).toFixed(1)) : null;

    return {
      total,
      open,
      inProgress,
      escalated,
      resolved,
      resolutionRate,
      resolutionRateDisplay: resolutionRate !== null ? `${resolutionRate}%` : 'Unavailable',
      resolutionRateDisplayAr: resolutionRate !== null ? `${resolutionRate}%` : 'غير متاح'
    };
  }

  const APPOINTMENT_EVENT_TYPES = Object.freeze({
    APPOINTMENT_VIEW: 'appointment_view',
    APPOINTMENT_SLOT_SELECTED: 'appointment_slot_selected',
    APPOINTMENT_BOOK_ATTEMPT: 'appointment_book_attempt',
    APPOINTMENT_BOOK_SUCCESS: 'appointment_book_success',
    APPOINTMENT_BOOK_FAILURE: 'appointment_book_failure',
    APPOINTMENT_CANCEL: 'appointment_cancel',
    APPOINTMENT_RESCHEDULE: 'appointment_reschedule',
    APPOINTMENT_COMPLETE: 'appointment_complete',
    APPOINTMENT_EMERGENCY_REDIRECT: 'appointment_emergency_redirect',
    CONSULTATION_TYPE_SELECTED: 'consultation_type_selected',
    COMMUTE_RELIEF_VIEWED: 'commute_relief_viewed',
    CONSULTATION_MODE_SWITCHED: 'consultation_mode_switched',
    DOCTOR_SCHEDULE_UPDATED: 'doctor_schedule_updated',
    DOCTOR_LEAVE_REQUESTED: 'doctor_leave_requested',
    DOCTOR_LEAVE_CANCELLED: 'doctor_leave_cancelled',
    DOCTOR_SCHEDULE_VIEWED: 'doctor_schedule_viewed',
    DOCTOR_SLOTS_ACCESSED: 'doctor_slots_accessed',
    // ⚡ Okadoc 1-Click Telemetry Events
    APPOINTMENT_RESCHEDULE_ATTEMPT: 'appointment_reschedule_attempt',
    APPOINTMENT_RESCHEDULE_SUCCESS: 'appointment_reschedule_success',
    APPOINTMENT_RESCHEDULE_FAILURE: 'appointment_reschedule_failure',
    APPOINTMENT_CANCEL_ATTEMPT: 'appointment_cancel_attempt',
    APPOINTMENT_CANCEL_SUCCESS: 'appointment_cancel_success',
    APPOINTMENT_CANCEL_FAILURE: 'appointment_cancel_failure',
    RECIPROCAL_NOTIFICATION_DISPATCHED: 'reciprocal_notification_dispatched',
    ONE_CLICK_REBOOK_CLICKED: 'one_click_rebook_clicked',
    ONE_CLICK_REBOOK_SUCCESS: 'one_click_rebook_success',
    CALENDAR_ICS_DOWNLOADED: 'calendar_ics_downloaded',
    VIEW: 'appointment_view',
    SLOT_SELECTED: 'appointment_slot_selected',
    BOOK_ATTEMPT: 'appointment_book_attempt',
    BOOK_SUCCESS: 'appointment_book_success',
    BOOK_FAILURE: 'appointment_book_failure',
    CANCEL: 'appointment_cancel',
    RESCHEDULE: 'appointment_reschedule',
    COMPLETE: 'appointment_complete',
    EMERGENCY_REDIRECT: 'appointment_emergency_redirect',
    RESCHEDULE_ATTEMPT: 'appointment_reschedule_attempt',
    RESCHEDULE_SUCCESS: 'appointment_reschedule_success',
    CANCEL_ATTEMPT: 'appointment_cancel_attempt',
    CANCEL_SUCCESS: 'appointment_cancel_success'
  });

  function calculateAppointmentKpis(appointments = [], options = {}) {
    const isEn = Boolean(options.isEn);
    const events = options.events || [];
    const realAppointments = (appointments || []).filter(a => {
      if (!a) return false;
      return !a.isDemo && !a.isMock && !String(a.id || '').startsWith('demo_');
    });

    const clinicFilter = (options.clinicId || options.clinic || '').trim().toLowerCase();
    const filteredAppts = clinicFilter && clinicFilter !== 'all'
      ? realAppointments.filter(a => String(a.clinicId || '').trim().toLowerCase() === clinicFilter)
      : realAppointments;

    const total = filteredAppts.length;
    const confirmed = filteredAppts.filter(a => a.status === 'confirmed').length;
    const completed = filteredAppts.filter(a => a.status === 'completed').length;
    const cancelled = filteredAppts.filter(a => a.status === 'cancelled').length;
    const rescheduled = filteredAppts.filter(a => a.status === 'rescheduled').length;

    let telehealthCount = 0;
    let videoCount = 0;
    let inClinicCount = 0;
    let followupCount = 0;
    let commuteReliefCount = 0;
    let eveningCount = 0;
    let morningCount = 0;
    let dependentCount = 0;
    let selfCount = 0;
    const docUtilization = new Map();

    filteredAppts.forEach(a => {
      const rawType = String(a.consultationType || (a.isOnlineConsultation || a.isOnline ? 'video' : 'clinic')).toLowerCase();
      const isOnline = rawType === 'video' || rawType === 'telehealth' || rawType === 'followup' || a.isOnlineConsultation === true;
      const isCommuteRelief = Boolean(a.commuteReliefActive || rawType === 'video' || rawType === 'followup');

      if (rawType === 'video' || rawType === 'telehealth') {
        videoCount++;
        telehealthCount++;
      } else if (rawType === 'followup') {
        followupCount++;
        telehealthCount++;
      } else {
        inClinicCount++;
      }

      if (isCommuteRelief) {
        commuteReliefCount++;
      }

      const slot = String(a.slotId || '');
      const timeStr = String(a.time || a.timeOfDay || '').toLowerCase();
      let isEvening = false;
      if (timeStr.includes('evening') || timeStr.includes('pm') || slot.includes('evening') || slot.includes('pm')) {
        isEvening = true;
      } else if (timeStr.includes('morning') || timeStr.includes('am') || slot.includes('morning') || slot.includes('am')) {
        isEvening = false;
      } else {
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/) || slot.match(/_(\d{1,2})-(\d{2})/);
        if (timeMatch) {
          isEvening = parseInt(timeMatch[1], 10) >= 16;
        } else {
          const num = parseInt(timeStr.replace(/\D/g, '') || slot.replace(/\D/g, ''), 10);
          const h = !isNaN(num) && num >= 100 ? Math.floor(num / 100) : num;
          isEvening = !isNaN(h) && h >= 16;
        }
      }

      if (isEvening) {
        eveningCount++;
      } else {
        morningCount++;
      }

      const isDep = a.isDependent === true || a.dependentId || (a.beneficiaryId && a.beneficiaryId !== 'self') || a.beneficiaryType === 'dependent' || a.beneficiaryType === 'family';
      if (isDep) {
        dependentCount++;
      } else {
        selfCount++;
      }

      const docId = a.doctorId || a.doctorName || 'unassigned';
      docUtilization.set(docId, (docUtilization.get(docId) || 0) + 1);
    });

    const attempts = events.filter(e => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === 'appointment_book_attempt';
    }).length;

    const successes = events.filter(e => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === 'appointment_book_success';
    }).length;

    const emergencyIntercepts = events.filter(e => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === 'appointment_emergency_redirect';
    }).length;

    // ⚡ Okadoc Events Telemetry Extraction
    const matchEvt = (e, target) => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === target.toLowerCase();
    };

    const reschedAttempts = events.filter(e => matchEvt(e, 'appointment_reschedule_attempt')).length;
    const reschedSuccesses = events.filter(e => matchEvt(e, 'appointment_reschedule_success') || matchEvt(e, 'appointment_reschedule')).length;
    const reschedFailures = events.filter(e => matchEvt(e, 'appointment_reschedule_failure')).length;

    const cancelAttempts = events.filter(e => matchEvt(e, 'appointment_cancel_attempt')).length;
    const cancelSuccesses = events.filter(e => matchEvt(e, 'appointment_cancel_success') || matchEvt(e, 'appointment_cancel')).length;
    const cancelFailures = events.filter(e => matchEvt(e, 'appointment_cancel_failure')).length;

    const reciprocalDispatches = events.filter(e => matchEvt(e, 'reciprocal_notification_dispatched')).length;
    const rebookClicks = events.filter(e => matchEvt(e, 'one_click_rebook_clicked')).length;
    const rebookSuccesses = events.filter(e => matchEvt(e, 'one_click_rebook_success')).length;
    const icsDownloads = events.filter(e => matchEvt(e, 'calendar_ics_downloaded')).length;

    const rescheduleReasonsBreakdown = {
      conflict: 0,
      emergency: 0,
      recovered: 0,
      commute: 0,
      doctor_request: 0,
      other: 0
    };
    const cancellationReasonsBreakdown = {
      conflict: 0,
      emergency: 0,
      recovered: 0,
      commute: 0,
      doctor_request: 0,
      other: 0
    };
    const initiatorBreakdown = {
      patientCount: 0,
      clinicCount: 0,
      doctorCount: 0
    };

    function categorizeReason(raw) {
      if (!raw) return 'other';
      const str = String(raw).toLowerCase();
      if (str.includes('conflict') || str.includes('تعارض') || str.includes('ميعاد') || str.includes('مواعيد') || str.includes('schedule') || str.includes('busy')) return 'conflict';
      if (str.includes('emergency') || str.includes('طوارئ') || str.includes('طارئ') || str.includes('urgent')) return 'emergency';
      if (str.includes('recover') || str.includes('تحسن') || str.includes('شفاء') || str.includes('better') || str.includes('healed')) return 'recovered';
      if (str.includes('commute') || str.includes('traffic') || str.includes('زحام') || str.includes('مواصلات') || str.includes('طريق') || str.includes('distance')) return 'commute';
      if (str.includes('doctor') || str.includes('clinic') || str.includes('طبيب') || str.includes('عيادة') || str.includes('hospital')) return 'doctor_request';
      return 'other';
    }

    function tallyInitiator(role) {
      const r = String(role || 'patient').toLowerCase();
      if (r === 'doctor') initiatorBreakdown.doctorCount++;
      else if (r === 'clinic_admin' || r === 'clinic' || r === 'admin' || r === 'super_admin') initiatorBreakdown.clinicCount++;
      else initiatorBreakdown.patientCount++;
    }

    filteredAppts.forEach(a => {
      if (a.status === 'rescheduled' || a.rescheduledAt || (Array.isArray(a.history) && a.history.some(h => h.action === 'RESCHEDULED'))) {
        const lastResched = Array.isArray(a.history) ? [...a.history].reverse().find(h => h.action === 'RESCHEDULED') : null;
        const cat = categorizeReason(lastResched?.reason || lastResched?.details?.reason || a.rescheduleReason);
        rescheduleReasonsBreakdown[cat] = (rescheduleReasonsBreakdown[cat] || 0) + 1;
        tallyInitiator(lastResched?.actorRole || a.rescheduledByRole || a.rescheduledBy);
      }
      if (a.status === 'cancelled' || a.cancelledAt || (Array.isArray(a.history) && a.history.some(h => h.action === 'CANCELLED'))) {
        const lastCancel = Array.isArray(a.history) ? [...a.history].reverse().find(h => h.action === 'CANCELLED') : null;
        const cat = categorizeReason(lastCancel?.reason || lastCancel?.details?.reason || a.cancelReason || a.cancellationReason);
        cancellationReasonsBreakdown[cat] = (cancellationReasonsBreakdown[cat] || 0) + 1;
        tallyInitiator(lastCancel?.actorRole || a.cancelledByRole || a.cancelledBy);
      }
    });

    events.forEach(e => {
      const p = e.payload || e.properties || {};
      if (matchEvt(e, 'appointment_reschedule_success') || matchEvt(e, 'appointment_reschedule')) {
        const cat = categorizeReason(p.reason || p.rescheduleReason);
        rescheduleReasonsBreakdown[cat] = (rescheduleReasonsBreakdown[cat] || 0) + 1;
        tallyInitiator(p.initiatorRole || p.actorRole || p.role);
      }
      if (matchEvt(e, 'appointment_cancel_success') || matchEvt(e, 'appointment_cancel')) {
        const cat = categorizeReason(p.reason || p.cancelReason || p.cancellationReason);
        cancellationReasonsBreakdown[cat] = (cancellationReasonsBreakdown[cat] || 0) + 1;
        tallyInitiator(p.initiatorRole || p.actorRole || p.role);
      }
    });

    const effectiveReschedSuccesses = reschedSuccesses > 0 ? reschedSuccesses : rescheduled;
    const effectiveReschedAttempts = reschedAttempts > 0 ? reschedAttempts : (effectiveReschedSuccesses + reschedFailures);
    const rescheduleRate = total > 0 ? Number(((effectiveReschedSuccesses / total) * 100).toFixed(1)) : null;
    const rescheduleSuccessRate = effectiveReschedAttempts > 0 ? Number(((effectiveReschedSuccesses / effectiveReschedAttempts) * 100).toFixed(1)) : null;

    const effectiveCancelSuccesses = cancelSuccesses > 0 ? cancelSuccesses : cancelled;
    const effectiveCancelAttempts = cancelAttempts > 0 ? cancelAttempts : (effectiveCancelSuccesses + cancelFailures);
    const cancellationSuccessRate = effectiveCancelAttempts > 0 ? Number(((effectiveCancelSuccesses / effectiveCancelAttempts) * 100).toFixed(1)) : null;

    const totalModifications = effectiveReschedSuccesses + effectiveCancelSuccesses;
    const reciprocalAlertDispatchRate = totalModifications > 0 ? Number(((reciprocalDispatches / totalModifications) * 100).toFixed(1)) : (reciprocalDispatches > 0 ? 100.0 : null);

    const clinicInitiatedCancels = cancellationReasonsBreakdown.doctor_request + initiatorBreakdown.clinicCount;
    const rebookDenom = rebookClicks > 0 ? rebookClicks : (clinicInitiatedCancels > 0 ? clinicInitiatedCancels : (rebookSuccesses > 0 ? rebookSuccesses : 0));
    const oneClickRebookRate = rebookDenom > 0 ? Number(((rebookSuccesses / rebookDenom) * 100).toFixed(1)) : null;

    const denominatorSuccess = attempts > 0 ? attempts : (total > 0 ? total : null);
    const numeratorSuccess = successes > 0 ? successes : (confirmed + completed);
    const bookingSuccessRate = denominatorSuccess && denominatorSuccess > 0
      ? Number(((numeratorSuccess / denominatorSuccess) * 100).toFixed(1))
      : null;

    const telehealthRatio = total > 0 ? Number(((telehealthCount / total) * 100).toFixed(1)) : null;
    const inClinicRatio = total > 0 ? Number(((inClinicCount / total) * 100).toFixed(1)) : null;
    const cancellationRate = total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : null;

    const totalCategorizedSlots = morningCount + eveningCount;
    const eveningPreferenceRate = totalCategorizedSlots > 0 ? Number(((eveningCount / totalCategorizedSlots) * 100).toFixed(1)) : null;
    const morningPreferenceRate = totalCategorizedSlots > 0 ? Number(((morningCount / totalCategorizedSlots) * 100).toFixed(1)) : null;
    const familyDependentRate = total > 0 ? Number(((dependentCount / total) * 100).toFixed(1)) : null;
    const selfBookingRate = total > 0 ? Number(((selfCount / total) * 100).toFixed(1)) : null;

    const commuteReliefRate = total > 0 ? Number(((commuteReliefCount / total) * 100).toFixed(1)) : null;
    const estimatedTrafficHoursSaved = Number((commuteReliefCount * 1.5).toFixed(1));
    const videoRatio = total > 0 ? Number(((videoCount / total) * 100).toFixed(1)) : null;
    const followupRatio = total > 0 ? Number(((followupCount / total) * 100).toFixed(1)) : null;

    const consultationTypeBreakdown = {
      video: { count: videoCount, ratio: videoRatio },
      clinic: { count: inClinicCount, ratio: inClinicRatio },
      followup: { count: followupCount, ratio: followupRatio },
      commuteRelief: { count: commuteReliefCount, rate: commuteReliefRate, estimatedTrafficHoursSaved }
    };

    const docUtilizationMap = {};
    docUtilization.forEach((count, docId) => {
      docUtilizationMap[docId] = { bookings: count, doctorId: docId };
    });

    // 🗓️ Doctor Schedule & Branch Manager Analytics
    const scheduleUpdates = events.filter(e => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === 'doctor_schedule_updated';
    });
    const leaveRequests = events.filter(e => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === 'doctor_leave_requested';
    });
    const leaveCancellations = events.filter(e => {
      const t = (e.eventType || e.type || '').toLowerCase();
      return t === 'doctor_leave_cancelled';
    });

    const scheduleUpdateCount = scheduleUpdates.length;
    const leaveRequestsCount = leaveRequests.length;
    const leaveCancellationsCount = leaveCancellations.length;

    let totalSlotDuration = 0;
    let durationCount = 0;
    const branchScheduleBreakdown = {
      cairo_nasr_city: 0,
      cairo_maadi: 0,
      giza_dokki: 0,
      alex_smouha: 0
    };

    scheduleUpdates.forEach(e => {
      const p = e.payload || e.properties || {};
      if (p.slotDurationMinutes) {
        totalSlotDuration += Number(p.slotDurationMinutes);
        durationCount++;
      }
      const b = p.branchId || '';
      if (b === 'all') {
        branchScheduleBreakdown.cairo_nasr_city++;
        branchScheduleBreakdown.cairo_maadi++;
        branchScheduleBreakdown.giza_dokki++;
        branchScheduleBreakdown.alex_smouha++;
      } else if (branchScheduleBreakdown[b] !== undefined) {
        branchScheduleBreakdown[b]++;
      }
    });

    const averageSlotDurationMinutes = durationCount > 0
      ? Math.round(totalSlotDuration / durationCount)
      : 30;

    const configuredBranchesCount = Object.values(branchScheduleBreakdown).filter(c => c > 0).length;
    const branchCoverageRate = Number(((configuredBranchesCount / 4) * 100).toFixed(1));

    const naText = isEn ? 'Unavailable' : 'غير متاح';

    return {
      summary: {
        totalBookings: total,
        totalCompleted: completed,
        totalCancelled: cancelled,
        totalRescheduled: rescheduled,
        bookingSuccessRate,
        cancellationRate,
        rescheduleRate,
        rescheduleSuccessRate,
        cancellationSuccessRate,
        reciprocalAlertDispatchRate,
        oneClickRebookRate,
        telehealthRatio,
        inClinicRatio,
        commuteReliefCount,
        commuteReliefRate,
        estimatedTrafficHoursSaved,
        consultationTypeBreakdown: {
          video: videoCount,
          clinic: inClinicCount,
          followup: followupCount,
          commuteRelief: commuteReliefCount
        },
        eveningPreferenceRate,
        morningPreferenceRate,
        familyDependentRate,
        selfBookingRate,
        emergencyRedirects: emergencyIntercepts,
        // Okadoc summary fields
        reschedAttempts,
        reschedSuccesses: effectiveReschedSuccesses,
        cancelAttempts,
        cancelSuccesses: effectiveCancelSuccesses,
        reciprocalDispatches,
        rebookClicks,
        rebookSuccesses,
        icsDownloads,
        rescheduleReasonsBreakdown,
        cancellationReasonsBreakdown,
        initiatorBreakdown,
        // Doctor Schedule metrics
        scheduleUpdateCount,
        leaveRequestsCount,
        leaveCancellationsCount,
        averageSlotDurationMinutes,
        branchCoverageRate,
        branchScheduleBreakdown
      },
      total,
      confirmed,
      completed,
      cancelled,
      rescheduled,
      telehealthCount,
      videoCount,
      followupCount,
      inClinicCount,
      commuteReliefCount,
      commuteReliefRate,
      commuteReliefRateDisplay: commuteReliefRate !== null ? `${commuteReliefRate}%` : naText,
      commuteReliefRateDisplayAr: commuteReliefRate !== null ? `${commuteReliefRate}%` : 'غير متاح',
      estimatedTrafficHoursSaved,
      estimatedTrafficHoursSavedDisplay: isEn ? `${estimatedTrafficHoursSaved} hrs traffic saved` : `${estimatedTrafficHoursSaved} ساعة زحام موفرة`,
      consultationTypeBreakdown,
      morningCount,
      eveningCount,
      selfCount,
      dependentCount,
      emergencyInterceptions: emergencyIntercepts,
      bookingSuccessRate,
      bookingSuccessRateDisplay: bookingSuccessRate !== null ? `${bookingSuccessRate}%` : naText,
      bookingSuccessRateDisplayAr: bookingSuccessRate !== null ? `${bookingSuccessRate}%` : 'غير متاح',
      telehealthRatio,
      telehealthRatioDisplay: telehealthRatio !== null ? `${telehealthRatio}%` : naText,
      telehealthRatioDisplayAr: telehealthRatio !== null ? `${telehealthRatio}%` : 'غير متاح',
      inClinicRatio,
      inClinicRatioDisplay: inClinicRatio !== null ? `${inClinicRatio}%` : naText,
      inClinicRatioDisplayAr: inClinicRatio !== null ? `${inClinicRatio}%` : 'غير متاح',
      eveningPreferenceRate,
      eveningPreferenceRateDisplay: eveningPreferenceRate !== null ? `${eveningPreferenceRate}%` : naText,
      eveningPreferenceRateDisplayAr: eveningPreferenceRate !== null ? `${eveningPreferenceRate}%` : 'غير متاح',
      familyDependentRate,
      scheduleUpdateCount,
      scheduleUpdateCountDisplay: `${scheduleUpdateCount}`,
      leaveRequestsCount,
      leaveRequestsCountDisplay: `${leaveRequestsCount}`,
      leaveCancellationsCount,
      averageSlotDurationMinutes,
      averageSlotDurationDisplay: isEn ? `${averageSlotDurationMinutes} mins avg` : `${averageSlotDurationMinutes} دقيقة متوسط`,
      branchCoverageRate,
      branchCoverageDisplay: isEn ? `${branchCoverageRate}% branches active` : `${branchCoverageRate}% فروع نشطة`,
      branchScheduleBreakdown,
      familyDependentRateDisplay: familyDependentRate !== null ? `${familyDependentRate}%` : naText,
      familyDependentRateDisplayAr: familyDependentRate !== null ? `${familyDependentRate}%` : 'غير متاح',
      cancellationRate,
      cancellationRateDisplay: cancellationRate !== null ? `${cancellationRate}%` : naText,
      cancellationRateDisplayAr: cancellationRate !== null ? `${cancellationRate}%` : 'غير متاح',
      // ⚡ Okadoc Displays
      rescheduleRate,
      rescheduleRateDisplay: rescheduleRate !== null ? `${rescheduleRate}%` : naText,
      rescheduleRateDisplayAr: rescheduleRate !== null ? `${rescheduleRate}%` : 'غير متاح',
      rescheduleSuccessRate,
      rescheduleSuccessRateDisplay: rescheduleSuccessRate !== null ? `${rescheduleSuccessRate}%` : naText,
      rescheduleSuccessRateDisplayAr: rescheduleSuccessRate !== null ? `${rescheduleSuccessRate}%` : 'غير متاح',
      cancellationSuccessRate,
      cancellationSuccessRateDisplay: cancellationSuccessRate !== null ? `${cancellationSuccessRate}%` : naText,
      cancellationSuccessRateDisplayAr: cancellationSuccessRate !== null ? `${cancellationSuccessRate}%` : 'غير متاح',
      reciprocalAlertDispatchRate,
      reciprocalAlertDispatchRateDisplay: reciprocalAlertDispatchRate !== null ? `${reciprocalAlertDispatchRate}%` : naText,
      reciprocalAlertDispatchRateDisplayAr: reciprocalAlertDispatchRate !== null ? `${reciprocalAlertDispatchRate}%` : 'غير متاح',
      oneClickRebookRate,
      oneClickRebookRateDisplay: oneClickRebookRate !== null ? `${oneClickRebookRate}%` : naText,
      oneClickRebookRateDisplayAr: oneClickRebookRate !== null ? `${oneClickRebookRate}%` : 'غير متاح',
      rescheduleReasonsBreakdown,
      cancellationReasonsBreakdown,
      initiatorBreakdown,
      doctorUtilization: docUtilizationMap,
      doctorUtilizationList: Array.from(docUtilization.entries()).map(([doctorId, count]) => ({ doctorId, count }))
    };
  }

  const AdminService = {
    parseKpiTimestamp,
    calculateKpiMetrics,
    calculateAssessmentJourneyMetrics,
    calculateAppointmentKpis,
    EVENT_TYPES,
    APPOINTMENT_EVENT_TYPES,
    SUPPORT_TICKET_TYPES,
    filterTickets,
    calculateTicketMetrics
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AdminService = AdminService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AdminService;
  }
})(typeof window !== "undefined" ? window : globalThis);
