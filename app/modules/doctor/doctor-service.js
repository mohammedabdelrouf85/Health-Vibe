/**
 * Health Vibe AI - Doctor Data Service
 * 
 * Manages clinical queue filtering, case sorting, SLA calculation,
 * and diagnostic presets.
 */

(function (global) {
  "use strict";

  function getCaseOxygenValue(c) {
    const value = Number(c && (c.o2 ?? c.oxygenLevel ?? c.assessment?.oxygenLevel ?? c.assessment?.o2));
    return Number.isFinite(value) ? value : 0;
  }

  function getCaseSubmittedMillis(c) {
    if (!c) return 0;
    const value = c.submittedAt || c.createdAt || c.created_at || c.date || c.assessment?.submittedAt;
    if (!value) return 0;
    if (value.toMillis) return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getCaseWaitingMinutes(c, nowMs = Date.now()) {
    const start = getCaseSubmittedMillis(c);
    return start > 0 ? Math.max(0, Math.floor((nowMs - start) / 60000)) : 0;
  }

  function formatElapsedMinutes(minutes, isEn = false) {
    const total = Number(minutes) || 0;
    if (total < 60) return isEn ? `${total} min` : `${total} دقيقة`;
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours < 24) return isEn ? `${hours}h ${mins}m` : `${hours}س ${mins}د`;
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return isEn ? `${days}d ${rest}h` : `${days}ي ${rest}س`;
  }

  function getCasePriorityKey(c) {
    const priority = String(c?.priority || c?.risk || c?.assessment?.aiTriage?.priority || "").toLowerCase();
    const o2 = getCaseOxygenValue(c);
    if (priority.includes("urgent") || priority.includes("emergency") || priority.includes("عاجل") || (o2 > 0 && o2 < 90)) return "urgent";
    if (priority.includes("high") || priority.includes("medium") || priority.includes("عالية") || (o2 >= 90 && o2 < 93)) return "high";
    return "normal";
  }

  function getPriorityMeta(priority, isEn = false) {
    const key = priority || "normal";
    const meta = {
      urgent: { weight: 3, pill: "danger", en: "Urgent", ar: "عاجل" },
      high: { weight: 2, pill: "pending", en: "High", ar: "أولوية عالية" },
      normal: { weight: 1, pill: "ok", en: "Routine", ar: "عادية" }
    };
    const item = meta[key] || meta.normal;
    return { ...item, label: isEn ? item.en : item.ar };
  }

  function getCaseSlaInfo(c, isEn = false, nowMs = Date.now()) {
    const priority = getCasePriorityKey(c);
    const target = priority === "urgent" ? 15 : (priority === "high" ? 30 : 120);
    const elapsed = getCaseWaitingMinutes(c, nowMs);
    const respondedAt = getCaseSubmittedMillis(c?.reviewStartedAt || c?.firstReviewedAt || c?.underReviewAt || c?.approvedAt || c?.updatedAt);
    const responseMinutes = respondedAt && getCaseSubmittedMillis(c)
      ? Math.max(0, Math.floor((respondedAt - getCaseSubmittedMillis(c)) / 60000))
      : null;
    const compare = responseMinutes ?? elapsed;
    const met = compare <= target;
    return {
      priority,
      target,
      elapsed,
      responseMinutes,
      met,
      label: isEn
        ? `SLA ${target} min - ${met ? "on track" : "overdue"}`
        : `SLA ${target} دقيقة - ${met ? "ضمن الوقت" : "متأخر"}`
    };
  }

  function parseDoctorRecommendations(rawText) {
    return String(rawText || "")
      .split(/\r?\n|[;؛]/)
      .map(item => item.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter(Boolean);
  }

  /**
   * Pure filtering and sorting for doctor queue cases.
   */
  function filterDoctorQueue(cases = [], options = {}) {
    const {
      filter = "all",
      priority = "all",
      sort = "waiting_desc",
      search = "",
      doctorUid = "",
      doctorEmail = "",
      nowMs = Date.now()
    } = options;

    let items = Array.isArray(cases) ? [...cases] : [];

    // Filter by doctor assignment & status
    if (filter === "assigned_to_me" && (doctorUid || doctorEmail)) {
      items = items.filter(c => {
        const uid = doctorUid;
        const email = String(doctorEmail).toLowerCase();
        return (c.assignedDoctorId && c.assignedDoctorId === uid) ||
          (c.doctorId && c.doctorId === uid) ||
          (c.doctorUid && c.doctorUid === uid) ||
          (c.assignedDoctorEmail && String(c.assignedDoctorEmail).toLowerCase() === email) ||
          (c.doctorEmail && String(c.doctorEmail).toLowerCase() === email);
      });
    } else if (filter === "urgent") {
      items = items.filter(c => getCasePriorityKey(c) === "urgent");
    } else if (filter === "unassigned") {
      items = items.filter(c => !c.assignedDoctorId && !c.doctorId && !c.doctorUid);
    } else if (filter !== "all") {
      items = items.filter(c => String(c.status || "").toLowerCase() === filter.toLowerCase());
    }

    // Filter by priority
    if (priority && priority !== "all") {
      items = items.filter(c => getCasePriorityKey(c) === priority.toLowerCase());
    }

    // Filter by search query
    if (search) {
      const q = String(search).toLowerCase();
      items = items.filter(c => {
        const text = [
          c.id,
          c.patientName,
          c.patientId,
          c.symptoms,
          c.symptomsEn,
          c.notes,
          c.status
        ].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }

    // Sort items
    items.sort((a, b) => {
      if (sort === "waiting_desc") {
        return getCaseSubmittedMillis(b) - getCaseSubmittedMillis(a);
      }
      if (sort === "waiting_asc") {
        return getCaseSubmittedMillis(a) - getCaseSubmittedMillis(b);
      }
      if (sort === "priority_desc") {
        const pA = getPriorityMeta(getCasePriorityKey(a)).weight;
        const pB = getPriorityMeta(getCasePriorityKey(b)).weight;
        return pB - pA;
      }
      return 0;
    });

    return items;
  }

  const DoctorService = {
    getCaseOxygenValue,
    getCaseSubmittedMillis,
    getCaseWaitingMinutes,
    formatElapsedMinutes,
    getCasePriorityKey,
    getPriorityMeta,
    getCaseSlaInfo,
    parseDoctorRecommendations,
    filterDoctorQueue
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorService = DoctorService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorService;
  }
})(typeof window !== "undefined" ? window : globalThis);
