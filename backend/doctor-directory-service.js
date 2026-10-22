/**
 * Health Vibe AI - Doctor Directory by Governorate & Region (Vezeeta benchmark)
 * Tasks #657 (Backend), #658 (Safety & Privacy), #660 (Analytics)
 *
 * Lets a patient find a chest (pulmonology) or internal-medicine doctor in their
 * governorate / region of Egypt.
 * Safety & privacy rules:
 *  - Only license-VERIFIED and active doctors are ever listed.
 *  - The public card never exposes a doctor's personal phone, national ID,
 *    email or full license number.
 *  - Search analytics store region/specialty only — never the patient's identity.
 *  - Results are ordered by objective criteria (availability, then name);
 *    any sponsored placement must be explicitly labelled.
 */

'use strict';

const kit = require('./feature-kit');

const REGIONS = {
  cairo: { ar: 'القاهرة', en: 'Cairo', governorates: ['cairo'] },
  giza: { ar: 'الجيزة', en: 'Giza', governorates: ['giza'] },
  alexandria: { ar: 'الإسكندرية', en: 'Alexandria', governorates: ['alexandria'] },
  delta: {
    ar: 'الدلتا', en: 'Delta',
    governorates: ['qalyubia', 'dakahlia', 'gharbia', 'sharqia', 'monufia', 'kafr_el_sheikh', 'beheira', 'damietta']
  },
  upper_egypt: {
    ar: 'الصعيد', en: 'Upper Egypt',
    governorates: ['faiyum', 'beni_suef', 'minya', 'asyut', 'sohag', 'qena', 'luxor', 'aswan']
  }
};

const GOVERNORATES = {
  cairo: { ar: 'القاهرة', en: 'Cairo' }, giza: { ar: 'الجيزة', en: 'Giza' },
  alexandria: { ar: 'الإسكندرية', en: 'Alexandria' }, qalyubia: { ar: 'القليوبية', en: 'Qalyubia' },
  dakahlia: { ar: 'الدقهلية', en: 'Dakahlia' }, gharbia: { ar: 'الغربية', en: 'Gharbia' },
  sharqia: { ar: 'الشرقية', en: 'Sharqia' }, monufia: { ar: 'المنوفية', en: 'Monufia' },
  kafr_el_sheikh: { ar: 'كفر الشيخ', en: 'Kafr El Sheikh' }, beheira: { ar: 'البحيرة', en: 'Beheira' },
  damietta: { ar: 'دمياط', en: 'Damietta' }, faiyum: { ar: 'الفيوم', en: 'Faiyum' },
  beni_suef: { ar: 'بني سويف', en: 'Beni Suef' }, minya: { ar: 'المنيا', en: 'Minya' },
  asyut: { ar: 'أسيوط', en: 'Asyut' }, sohag: { ar: 'سوهاج', en: 'Sohag' },
  qena: { ar: 'قنا', en: 'Qena' }, luxor: { ar: 'الأقصر', en: 'Luxor' }, aswan: { ar: 'أسوان', en: 'Aswan' }
};

const SPECIALTIES = {
  chest: { ar: 'أمراض صدرية', en: 'Chest / Pulmonology' },
  internal_medicine: { ar: 'باطنة', en: 'Internal Medicine' }
};

const PUBLIC_FIELDS = [
  'id', 'nameAr', 'nameEn', 'specialty', 'governorate', 'region', 'area', 'areaAr', 'clinicName', 'clinicNameAr',
  'consultationModes', 'nextAvailable', 'yearsExperience', 'languages', 'sponsored', 'isDemo'
];

function regionOf(governorate) {
  return Object.keys(REGIONS).find(r => REGIONS[r].governorates.includes(governorate)) || null;
}

function normalizeArabic(s) {
  return String(s || '').toLowerCase()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652]/g, '').trim();
}

const DEMO_DOCTORS = [
  { nameAr: 'د. أحمد سامي', nameEn: 'Dr. Ahmed Samy', specialty: 'chest', governorate: 'cairo', area: 'Nasr City', areaAr: 'مدينة نصر', clinicName: 'Nile Chest Clinic', clinicNameAr: 'عيادة نيل للصدر' },
  { nameAr: 'د. منى فاروق', nameEn: 'Dr. Mona Farouk', specialty: 'internal_medicine', governorate: 'cairo', area: 'Heliopolis', areaAr: 'مصر الجديدة', clinicName: 'Heliopolis Medical Center', clinicNameAr: 'مركز هليوبوليس الطبي' },
  { nameAr: 'د. كريم عادل', nameEn: 'Dr. Karim Adel', specialty: 'chest', governorate: 'giza', area: 'Dokki', areaAr: 'الدقي', clinicName: 'Dokki Respiratory Care', clinicNameAr: 'رعاية الدقي التنفسية' },
  { nameAr: 'د. هبة يوسف', nameEn: 'Dr. Heba Youssef', specialty: 'chest', governorate: 'alexandria', area: 'Smouha', areaAr: 'سموحة', clinicName: 'Alex Lung Center', clinicNameAr: 'مركز الإسكندرية للرئة' },
  { nameAr: 'د. محمود الشربيني', nameEn: 'Dr. Mahmoud El-Sherbiny', specialty: 'internal_medicine', governorate: 'dakahlia', area: 'Mansoura', areaAr: 'المنصورة', clinicName: 'Mansoura Internal Clinic', clinicNameAr: 'عيادة المنصورة للباطنة' },
  { nameAr: 'د. سارة النجار', nameEn: 'Dr. Sara El-Naggar', specialty: 'chest', governorate: 'gharbia', area: 'Tanta', areaAr: 'طنطا', clinicName: 'Tanta Chest Clinic', clinicNameAr: 'عيادة طنطا للصدر' },
  { nameAr: 'د. عمرو حسان', nameEn: 'Dr. Amr Hassan', specialty: 'chest', governorate: 'asyut', area: 'Asyut City', areaAr: 'مدينة أسيوط', clinicName: 'Upper Egypt Chest Center', clinicNameAr: 'مركز صعيد مصر للصدر' },
  { nameAr: 'د. نادية عبد الرحيم', nameEn: 'Dr. Nadia Abdelrahim', specialty: 'internal_medicine', governorate: 'aswan', area: 'Aswan City', areaAr: 'مدينة أسوان', clinicName: 'Aswan Family Clinic', clinicNameAr: 'عيادة أسوان للأسرة' }
];

class DoctorDirectoryService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.audit = kit.createAuditTrail('doctor_directory');
    this.analytics = kit.createAnalytics('doctor_directory');
    this.resetState({ seedDemo: true });
  }

  resetState({ seedDemo = false } = {}) {
    this.doctors = new Map();
    this.audit.reset();
    this.analytics.reset();
    if (seedDemo) this._seedDemo();
  }

  upsertDoctorListing(listing, user) {
    kit.requireAdmin(user);
    if (!SPECIALTIES[listing.specialty]) throw new kit.FeatureError('INVALID_SPECIALTY', 'Specialty must be chest or internal_medicine.');
    if (!GOVERNORATES[listing.governorate]) throw new kit.FeatureError('INVALID_GOVERNORATE', 'Unknown Egyptian governorate.');
    const id = listing.id || kit.newId('doc');
    const record = {
      consultationModes: ['clinic', 'video'],
      languages: ['ar'],
      yearsExperience: 0,
      sponsored: false,
      licenseVerified: false,
      active: true,
      ...this.doctors.get(id),
      ...listing,
      id,
      region: regionOf(listing.governorate)
    };
    this.doctors.set(id, record);
    this.audit.record('DIRECTORY_LISTING_UPSERTED', user, { doctorId: id, verified: record.licenseVerified });
    return this._publicCard(record);
  }

  /**
   * Search filters: region, governorate, specialty, mode ('clinic'|'video'), q (name/area, AR/EN).
   */
  search(filters = {}) {
    const { region, governorate, specialty, mode, q } = filters;
    if (region && !REGIONS[region]) throw new kit.FeatureError('INVALID_REGION', 'Unknown region.');
    if (governorate && !GOVERNORATES[governorate]) throw new kit.FeatureError('INVALID_GOVERNORATE', 'Unknown governorate.');
    if (specialty && !SPECIALTIES[specialty]) throw new kit.FeatureError('INVALID_SPECIALTY', 'Unknown specialty.');
    const query = normalizeArabic(kit.sanitizeText(q || '', 60));

    const results = [...this.doctors.values()]
      .filter(d => d.licenseVerified === true && d.active === true)
      .filter(d => !region || d.region === region)
      .filter(d => !governorate || d.governorate === governorate)
      .filter(d => !specialty || d.specialty === specialty)
      .filter(d => !mode || (d.consultationModes || []).includes(mode))
      .filter(d => !query || [d.nameAr, d.nameEn, d.area, d.areaAr, d.clinicName, d.clinicNameAr].some(f => normalizeArabic(f).includes(query)))
      .sort((a, b) => {
        if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
        const ta = a.nextAvailable ? new Date(a.nextAvailable).getTime() : Infinity;
        const tb = b.nextAvailable ? new Date(b.nextAvailable).getTime() : Infinity;
        return ta - tb || String(a.nameEn).localeCompare(String(b.nameEn));
      })
      .map(d => this._publicCard(d));

    // Identity-free analytics: only filters + result size.
    this.analytics.track('directory_search', {
      region: region || (governorate ? regionOf(governorate) : 'all'),
      governorate: governorate || null,
      specialty: specialty || 'all',
      resultCount: results.length
    });
    if (results.length === 0) this.analytics.track('directory_zero_results', { region: region || null, governorate: governorate || null, specialty: specialty || null });
    return { count: results.length, results };
  }

  recordProfileOpened(doctorId) {
    this.analytics.track('directory_profile_opened', { doctorId });
  }

  recordBookingStarted(doctorId) {
    this.analytics.track('directory_booking_started', { doctorId });
  }

  getFilterCatalog() {
    return {
      regions: Object.entries(REGIONS).map(([key, r]) => ({
        key, ar: r.ar, en: r.en,
        governorates: r.governorates.map(g => ({ key: g, ...GOVERNORATES[g] }))
      })),
      specialties: Object.entries(SPECIALTIES).map(([key, s]) => ({ key, ...s }))
    };
  }

  getAnalytics(user) {
    kit.requireAdmin(user);
    const searches = this.analytics.events('directory_search');
    const byRegion = {};
    Object.keys(REGIONS).forEach(r => { byRegion[r] = 0; });
    byRegion.all = 0;
    searches.forEach(e => { byRegion[e.props.region] = (byRegion[e.props.region] || 0) + 1; });
    const gaps = {};
    this.analytics.events('directory_zero_results').forEach(e => {
      const key = `${e.props.governorate || e.props.region || 'all'}:${e.props.specialty || 'all'}`;
      gaps[key] = (gaps[key] || 0) + 1;
    });
    return {
      searches: searches.length,
      searchesByRegion: byRegion,
      zeroResultSearches: this.analytics.count('directory_zero_results'),
      zeroResultRatePct: this.analytics.rate('directory_zero_results', 'directory_search'),
      coverageGaps: gaps,
      profileOpens: this.analytics.count('directory_profile_opened'),
      bookingStarts: this.analytics.count('directory_booking_started'),
      searchToBookingPct: this.analytics.rate('directory_booking_started', 'directory_search')
    };
  }

  getDoctor(doctorId) {
    const d = this.doctors.get(doctorId);
    return d && d.licenseVerified && d.active ? this._publicCard(d) : null;
  }

  // ── internals ──────────────────────────────────────────────────────────────
  _publicCard(d) {
    const card = {};
    PUBLIC_FIELDS.forEach(f => { if (d[f] !== undefined) card[f] = d[f]; });
    card.specialtyLabel = SPECIALTIES[d.specialty];
    card.governorateLabel = GOVERNORATES[d.governorate];
    card.regionLabel = d.region ? { ar: REGIONS[d.region].ar, en: REGIONS[d.region].en } : null;
    return card;
  }

  _seedDemo() {
    DEMO_DOCTORS.forEach((d, i) => {
      const id = `demo_doc_${i + 1}`;
      this.doctors.set(id, {
        ...d,
        id,
        region: regionOf(d.governorate),
        consultationModes: i % 3 === 2 ? ['clinic'] : ['clinic', 'video'],
        languages: ['ar', 'en'],
        yearsExperience: 8 + i,
        nextAvailable: new Date(this.now() + (i + 1) * 6 * 3600000).toISOString(),
        sponsored: false,
        licenseVerified: true,
        active: true,
        isDemo: true,
        // private fields — must never reach the public card
        personalPhone: '+2010000000' + i,
        licenseNumber: `EMS-${100000 + i}`
      });
    });
  }
}

const doctorDirectoryService = new DoctorDirectoryService();

module.exports = {
  DoctorDirectoryService,
  doctorDirectoryService,
  REGIONS,
  GOVERNORATES,
  SPECIALTIES,
  PUBLIC_FIELDS,
  regionOf,
  normalizeArabic
};
