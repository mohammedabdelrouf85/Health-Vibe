// @ts-check
/**
 * @fileoverview Doctor Schedule & Branch Manager Client Service
 * Provides helper functions, branch catalog, shift calculations, and DB operations
 * for doctors managing clinic working hours, buffers, and leaves.
 */

export const EGYPT_BRANCH_CATALOG = Object.freeze([
  {
    id: 'cairo_nasr_city',
    nameAr: 'عيادة مدينة نصر - القاهرة',
    nameEn: 'Nasr City Clinic - Cairo',
    governorate: 'Cairo',
    addressAr: 'شارع عباس العقاد، مدينة نصر، القاهرة',
    addressEn: 'Abbas El-Akkad St, Nasr City, Cairo'
  },
  {
    id: 'cairo_maadi',
    nameAr: 'عيادة المعادي - القاهرة',
    nameEn: 'Maadi Clinic - Cairo',
    governorate: 'Cairo',
    addressAr: 'شارع النصر، المعادي الجديدة، القاهرة',
    addressEn: 'El-Nasr St, New Maadi, Cairo'
  },
  {
    id: 'giza_dokki',
    nameAr: 'عيادة الدقي - الجيزة',
    nameEn: 'Dokki Clinic - Giza',
    governorate: 'Giza',
    addressAr: 'ميدان المساحة، الدقي، الجيزة',
    addressEn: 'Mesaha Square, Dokki, Giza'
  },
  {
    id: 'alex_smouha',
    nameAr: 'عيادة سموحة - الإسكندرية',
    nameEn: 'Smouha Clinic - Alexandria',
    governorate: 'Alexandria',
    addressAr: 'شارع فوزي معاذ، سموحة، الإسكندرية',
    addressEn: 'Fawzi Moaz St, Smouha, Alexandria'
  }
]);

export function formatBranchLabel(branchId, lang = 'ar') {
  const branch = EGYPT_BRANCH_CATALOG.find(b => b.id === branchId);
  if (!branch) return branchId;
  return lang === 'en' ? branch.nameEn : branch.nameAr;
}

export function calculateShiftDurationHours(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const startMins = (sh || 0) * 60 + (sm || 0);
  const endMins = (eh || 0) * 60 + (em || 0);
  if (endMins <= startMins) return 0;
  return Math.round(((endMins - startMins) / 60) * 10) / 10;
}

export function validateLeaveDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return { valid: false, error: 'DATES_REQUIRED' };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'INVALID_DATE_FORMAT' };
  }
  if (start > end) {
    return { valid: false, error: 'END_DATE_BEFORE_START' };
  }
  return { valid: true };
}

export function buildDoctorLeavePayload(params) {
  const {
    branchId = 'all',
    startDate,
    endDate,
    reasonType = 'personal',
    notes = '',
    emergencyOverride = false
  } = params;

  return {
    branchId,
    startDate,
    endDate,
    reasonType,
    notes: String(notes || '').trim(),
    emergencyOverride: Boolean(emergencyOverride),
    status: emergencyOverride ? 'approved' : 'pending',
    createdAt: new Date().toISOString()
  };
}

const DoctorScheduleService = {
  EGYPT_BRANCH_CATALOG,
  formatBranchLabel,
  calculateShiftDurationHours,
  validateLeaveDateRange,
  buildDoctorLeavePayload
};

if (typeof window !== 'undefined') {
  window.HealthVibes = window.HealthVibes || {};
  window.HealthVibes.DoctorScheduleService = DoctorScheduleService;
}

export default DoctorScheduleService;
