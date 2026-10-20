/**
 * HEALTH VIBE AI: DOCTOR PATIENT DIRECTORY & MULTI-DIMENSIONAL SEARCH SERVICE
 * Benchmark: Practo Clinical Patient Directory Standard
 * 
 * Features:
 * 1. Deep Multi-Field Search (Name AR/EN, MRN/File#, National ID, Phone, Symptoms, Diagnosis, Case ID)
 * 2. Multi-Dimension Filtering (Workflow Status & Clinical Risk/Priority)
 * 3. Quick Triage Filter Engine (Critical SpO2 < 90%, Awaiting Patient, Replied, Private Notes, Stale Revisions)
 * 4. Advanced Clinical Sorting (Lowest SpO2, SLA Waiting Time, Priority Weight, Name A-Z, Newest)
 * 5. Strict Zero-Trust Data Isolation (Cross-Doctor Quarantine & Sandbox Partitioning)
 * 6. Authoritative Enterprise Audit Trail Logging (DOCTOR_PATIENT_DIRECTORY_SEARCHED / FILTERED)
 */

const { AUDIT_EVENT_TYPES, recordAuditEvent } = require('./audit-service');

/**
 * Normalizes oxygen reading from multiple possible case schema shapes.
 */
function getCaseOxygen(c) {
  const val = Number(c && (c.o2 ?? c.oxygenLevel ?? c.assessment?.oxygenLevel ?? c.assessment?.o2));
  return Number.isFinite(val) ? val : 0;
}

/**
 * Derives normalized clinical priority key (urgent, high, normal).
 */
function getNormalizedPriority(c) {
  const p = String(c?.priority || c?.risk || c?.assessment?.aiTriage?.priority || "").toLowerCase();
  const o2 = getCaseOxygen(c);
  if (p.includes("urgent") || p.includes("emergency") || p.includes("عاجل") || (o2 > 0 && o2 < 90)) {
    return "urgent";
  }
  if (p.includes("high") || p.includes("medium") || p.includes("عالية") || (o2 >= 90 && o2 < 93)) {
    return "high";
  }
  return "normal";
}

/**
 * Checks if record is a test, mock, or sandbox demo item.
 */
function isTestOrMockCase(c) {
  if (!c) return false;
  if (c.isTest || c.isMock || c.isDemo || c.testEnvironment || c.sandbox) return true;
  const str = `${c.id || ''} ${c.patientId || ''} ${c.patientEmail || ''} ${c.name || ''} ${c.patientName || ''}`.toLowerCase();
  return str.includes("test_") || str.includes("mock_") || str.includes("demo_") || str.includes("@example.com") || str.includes("sandbox");
}

/**
 * Pure function: Filters, triages, sorts, and paginates cases for the authorized doctor.
 */
function filterAndSortAssignedPatients(caseRecords = [], options = {}) {
  const {
    doctorId = null,
    doctorEmail = null,
    isOwner = false,
    search = "",
    status = "all",
    priority = "all",
    quickFilter = "all",
    sort = "waiting_desc",
    isSandbox = false,
    page = 1,
    limit = 50
  } = options;

  const normalizedDoctorEmail = String(doctorEmail || "").toLowerCase();

  // 1. Strict Zero-Trust Cross-Doctor Data Isolation
  let pool = (caseRecords || []).filter(c => {
    if (!c) return false;
    if (c.status === "draft" || c.status === "DRAFT") return false;

    // Strict boundary: Only cases assigned to this doctor (unless Super Admin/Owner)
    if (!isOwner && doctorId) {
      const assignedId = c.assignedDoctorId || c.doctorId || c.doctorUid;
      const assignedEmail = String(c.assignedDoctorEmail || c.doctorEmail || "").toLowerCase();
      const isAssigned = (assignedId && assignedId === doctorId) || (assignedEmail && assignedEmail === normalizedDoctorEmail);
      if (!isAssigned) return false;
    }

    // Strict boundary: Quarantine test/mock records from authentic patient lists
    const isMock = isTestOrMockCase(c);
    if (isSandbox) {
      return isMock;
    } else {
      return !isMock;
    }
  });

  // Calculate live triage counts across the doctor's accessible pool
  const triageStats = {
    total: pool.length,
    critical_spo2: pool.filter(c => {
      const o2 = getCaseOxygen(c);
      const p = String(c.priority || c.risk || "").toLowerCase();
      return (o2 > 0 && o2 < 90) || p.includes("urgent") || p.includes("عاجل");
    }).length,
    awaiting_patient: pool.filter(c => {
      const s = String(c.status || "").toLowerCase();
      const hasReplied = Boolean(c.patientResponse || c.followUpResponse || c.moreInfoResponse);
      return s.includes("more_info") && !hasReplied;
    }).length,
    patient_replied: pool.filter(c => Boolean(c.patientResponse || c.followUpResponse || c.moreInfoResponse)).length,
    with_private_notes: pool.filter(c => Boolean(c.privateDoctorNotes || c.privateNotes)).length,
    stale_revision: pool.filter(c => {
      const currentRev = Number(c.reportRevisionNumber || c.clinicalRevision || 1);
      const reviewedRev = Number(c.reviewedRevision || c.expectedRevision || 1);
      return c.isStaleRevision === true || currentRev > reviewedRev;
    }).length
  };

  // 2. Status Filtering
  if (status && status !== "all") {
    const s = String(status).toLowerCase();
    if (s === "under_review") {
      pool = pool.filter(c => String(c.status).toLowerCase() === "under_review");
    } else if (s === "assigned") {
      pool = pool.filter(c => ["assigned", "triaged", "pending", "submitted"].includes(String(c.status).toLowerCase()));
    } else if (s === "more_info_requested") {
      pool = pool.filter(c => String(c.status).toLowerCase() === "more_info_requested");
    } else if (s === "approved") {
      pool = pool.filter(c => String(c.status).toLowerCase() === "approved");
    } else if (s === "closed_escalated") {
      pool = pool.filter(c => ["closed", "escalated", "rejected"].includes(String(c.status).toLowerCase()));
    }
  }

  // 3. Clinical Priority Filtering
  if (priority && priority !== "all") {
    pool = pool.filter(c => getNormalizedPriority(c) === String(priority).toLowerCase());
  }

  // 4. Quick Triage Filtering
  if (quickFilter && quickFilter !== "all") {
    const qf = String(quickFilter).toLowerCase();
    if (qf === "critical_spo2") {
      pool = pool.filter(c => {
        const o2 = getCaseOxygen(c);
        const p = String(c.priority || c.risk || "").toLowerCase();
        return (o2 > 0 && o2 < 90) || p.includes("urgent") || p.includes("عاجل");
      });
    } else if (qf === "awaiting_patient") {
      pool = pool.filter(c => {
        const s = String(c.status || "").toLowerCase();
        const hasReplied = Boolean(c.patientResponse || c.followUpResponse || c.moreInfoResponse);
        return s.includes("more_info") && !hasReplied;
      });
    } else if (qf === "patient_replied") {
      pool = pool.filter(c => Boolean(c.patientResponse || c.followUpResponse || c.moreInfoResponse));
    } else if (qf === "with_private_notes") {
      pool = pool.filter(c => Boolean(c.privateDoctorNotes || c.privateNotes));
    } else if (qf === "stale_revision") {
      pool = pool.filter(c => {
        const currentRev = Number(c.reportRevisionNumber || c.clinicalRevision || 1);
        const reviewedRev = Number(c.reviewedRevision || c.expectedRevision || 1);
        return c.isStaleRevision === true || currentRev > reviewedRev;
      });
    }
  }

  // 5. Deep Multi-Field Search
  const queryTerm = String(search || "").trim().toLowerCase();
  if (queryTerm) {
    pool = pool.filter(c => {
      const fields = [
        c.id, c.reportRef, c.caseId,
        c.patientId, c.patientUid,
        c.patientName, c.patientNameEn, c.name, c.nameEn,
        c.nationalId, c.civilId, c.patientNationalId,
        c.fileNumber, c.patientFileNo, c.medicalRecordNumber, c.mrn,
        c.patientEmail, c.userEmail,
        c.patientPhone, c.phone, c.mobile,
        c.symptoms, c.symptomsEn,
        c.clinicalDiagnosis, c.doctorNote, c.notes, c.patientNotes,
        c.moreInfoNote, c.privateDoctorNotes, c.privateNotes,
        c.assessment?.chiefComplaint, c.chiefComplaint
      ];
      const haystack = fields.filter(Boolean).map(v => String(v).toLowerCase()).join(" ");
      return haystack.includes(queryTerm);
    });
  }

  // 6. Advanced Clinical Sorting
  const statusWeights = {
    under_review: 1,
    assigned: 2,
    triaged: 3,
    pending: 3,
    submitted: 4,
    more_info_requested: 5,
    escalated: 2,
    approved: 6,
    closed: 7,
    rejected: 8
  };

  pool.sort((a, b) => {
    const o2A = getCaseOxygen(a) || 999;
    const o2B = getCaseOxygen(b) || 999;
    const pWeightA = getNormalizedPriority(a) === "urgent" ? 3 : (getNormalizedPriority(a) === "high" ? 2 : 1);
    const pWeightB = getNormalizedPriority(b) === "urgent" ? 3 : (getNormalizedPriority(b) === "high" ? 2 : 1);
    const timeA = new Date(a.submittedAt || a.createdAt || a.date || 0).getTime();
    const timeB = new Date(b.submittedAt || b.createdAt || b.date || 0).getTime();
    const nameA = String(a.name || a.patientName || a.nameEn || a.patientNameEn || "").trim();
    const nameB = String(b.name || b.patientName || b.nameEn || b.patientNameEn || "").trim();

    if (sort === "oxygen_asc") {
      if (o2A !== o2B) return o2A - o2B;
      return pWeightB - pWeightA;
    }
    if (sort === "patient_name_asc") {
      return nameA.localeCompare(nameB, "ar", { sensitivity: "base" });
    }
    if (sort === "priority_desc" && pWeightA !== pWeightB) {
      return pWeightB - pWeightA;
    }
    if (sort === "waiting_desc" && timeA !== timeB) {
      return timeA - timeB; // Older timestamp waited longer
    }
    if (sort === "newest" && timeA !== timeB) {
      return timeB - timeA;
    }
    if (sort === "status") {
      const wA = statusWeights[String(a.status).toLowerCase()] || 99;
      const wB = statusWeights[String(b.status).toLowerCase()] || 99;
      if (wA !== wB) return wA - wB;
    }
    return timeA - timeB;
  });

  // 7. Pagination
  const total = pool.length;
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const safePage = Math.max(1, Number(page) || 1);
  const totalPages = Math.ceil(total / safeLimit) || 1;
  const startIndex = (safePage - 1) * safeLimit;
  const paginatedCases = pool.slice(startIndex, startIndex + safeLimit);

  return {
    success: true,
    total,
    count: paginatedCases.length,
    page: safePage,
    limit: safeLimit,
    totalPages,
    triageStats,
    cases: paginatedCases
  };
}

/**
 * Database query fetcher: Retrieves cases from Firestore and processes them.
 */
async function fetchAssignedPatients(db, options = {}) {
  const { doctorId, isOwner } = options;
  let rawCases = [];

  if (db && typeof db.collection === "function") {
    try {
      let queryRef = db.collection('cases');
      if (!isOwner && doctorId) {
        // Query doctor cases directly from Firestore index
        const snap = await queryRef.where('assignedDoctorId', '==', doctorId).get();
        if (!snap.empty) {
          rawCases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      } else {
        const snap = await queryRef.get();
        if (!snap.empty) {
          rawCases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      }
    } catch (err) {
      console.warn('[DOCTOR DIRECTORY DB FETCH FALLBACK]:', err.message);
      // Fallback: full collection fetch with in-memory isolation
      try {
        const fallbackSnap = await db.collection('cases').get();
        if (!fallbackSnap.empty) {
          rawCases = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      } catch (innerErr) {
        console.error('[DOCTOR DIRECTORY DB FETCH FAILED]:', innerErr.message);
      }
    }
  }

  return filterAndSortAssignedPatients(rawCases, options);
}

/**
 * Enterprise Audit Trail recording for patient directory query events.
 */
async function recordDirectoryAudit(db, {
  req,
  doctorId,
  doctorIdentity = {},
  clinicId = null,
  search = "",
  filters = {},
  totalMatched = 0
}) {
  if (!db) return;

  const hasSearch = Boolean(String(search || "").trim());
  const eventType = hasSearch 
    ? AUDIT_EVENT_TYPES.DOCTOR_PATIENT_DIRECTORY_SEARCHED 
    : AUDIT_EVENT_TYPES.DOCTOR_PATIENT_DIRECTORY_FILTERED;

  try {
    await recordAuditEvent(db, {
      type: eventType,
      req,
      clinicId,
      details: {
        doctorId,
        doctorName: doctorIdentity.name || 'Verified Doctor',
        licenseNumber: doctorIdentity.licenseNumber || 'Active Syndicate License',
        searchQuery: hasSearch ? String(search).substring(0, 80) : null,
        filtersApplied: {
          status: filters.status || 'all',
          priority: filters.priority || 'all',
          quickFilter: filters.quickFilter || 'all',
          sort: filters.sort || 'waiting_desc',
          isSandbox: Boolean(filters.isSandbox)
        },
        totalMatched
      }
    });
  } catch (err) {
    console.error('[DOCTOR DIRECTORY AUDIT LOG ERROR]:', err.message);
  }
}

module.exports = {
  getCaseOxygen,
  getNormalizedPriority,
  isTestOrMockCase,
  filterAndSortAssignedPatients,
  fetchAssignedPatients,
  recordDirectoryAudit
};
