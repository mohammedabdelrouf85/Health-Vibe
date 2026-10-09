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

  const AdminService = {
    parseKpiTimestamp,
    calculateKpiMetrics,
    calculateAssessmentJourneyMetrics,
    EVENT_TYPES,
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
