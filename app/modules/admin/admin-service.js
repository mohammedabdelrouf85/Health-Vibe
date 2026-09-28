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

    // Apply Time Range filter
    const now = Date.now();
    let minTs = 0;
    if (timeRange === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      minTs = d.getTime();
    } else if (timeRange === "7d") {
      minTs = now - (7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "30d") {
      minTs = now - (30 * 24 * 60 * 60 * 1000);
    }

    let filtered = realCases.filter(c => {
      const ts = parseKpiTimestamp(c.submittedAt || c.createdAt || c.timestamp || c.updatedAt);
      return minTs === 0 || ts >= minTs;
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

    const avgResponseTimeMinutes = responseTimes.length > 0
      ? Number((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1))
      : 0;

    const medianResponseTimeMinutes = responseTimes.length > 0
      ? Number(responseTimes[Math.floor(responseTimes.length / 2)].toFixed(1))
      : 0;

    const responseSlaComplianceRate = responseTimes.length > 0
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

    const avgTurnaroundMinutes = turnaroundTimes.length > 0
      ? Number((turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length).toFixed(1))
      : 0;

    const medianTurnaroundMinutes = turnaroundTimes.length > 0
      ? Number(turnaroundTimes[Math.floor(turnaroundTimes.length / 2)].toFixed(1))
      : 0;

    const turnaroundSlaComplianceRate = turnaroundTimes.length > 0
      ? Math.round((turnaroundTimes.filter(t => t <= 120).length / turnaroundTimes.length) * 100)
      : 0;

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
      turnaroundSlaComplianceRate
    };
  }

  const AdminService = {
    parseKpiTimestamp,
    calculateKpiMetrics
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AdminService = AdminService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AdminService;
  }
})(typeof window !== "undefined" ? window : globalThis);
