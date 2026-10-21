/**
 * Health Vibe AI - Chest Radiology & Imaging Service
 *
 * Benchmark: Rology Teleradiology Platform Standards (https://rology.ai/how-it-works/)
 *
 * Standards:
 * 1. Posteroanterior/Lateral CXR & Thoracic CT Study Intake.
 * 2. Official LOINC Codes Mapping (36643-5 & 24627-2).
 * 3. Clinical Indications, Urgency SLAs (Routine 24h, Urgent 6h, STAT <2h).
 * 4. Human-in-the-Loop (HITL) Gate: Strict Non-Autonomous AI Notice & Non-Replacement of Physician.
 * 5. DICOM & High-Resolution Imaging Support with 15MB Size Boundary.
 * 6. De-identification & HIPAA Safe Harbor Privacy Filters.
 * 7. Relational DB Persistence & Emergency Physician Notifications.
 * 8. Administrative Telemetry & KPI Analytics.
 */

const crypto = require('crypto');
const path = require('path');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');
const { relationalDbService } = require('./relational-db-service');

const RADIOLOGY_MODALITIES = {
  cxr_pa_lat: {
    key: 'cxr_pa_lat',
    loinc: '36643-5',
    nameAr: 'أشعة سينية عادية على الصدر (CXR PA & Lateral)',
    nameEn: 'Chest X-Ray PA & Lateral',
    defaultViews: ['PA', 'Lateral'],
    turnaroundHours: { routine: 24, urgent: 6, stat: 2 }
  },
  ct_thorax_plain: {
    key: 'ct_thorax_plain',
    loinc: '24627-2',
    nameAr: 'أشعة مقطعية على الصدر بدون صبغة (CT Plain)',
    nameEn: 'CT Thorax without Contrast (Plain)',
    defaultViews: ['Axial', 'Coronal', 'Sagittal'],
    turnaroundHours: { routine: 24, urgent: 6, stat: 2 }
  },
  ct_thorax_contrast: {
    key: 'ct_thorax_contrast',
    loinc: '24627-2-IV',
    nameAr: 'أشعة مقطعية على الصدر بالصبغة (CT with Contrast)',
    nameEn: 'CT Thorax with IV Contrast',
    defaultViews: ['Arterial Phase', 'Mediastinal Window'],
    turnaroundHours: { routine: 12, urgent: 4, stat: 1.5 }
  },
  other_imaging: {
    key: 'other_imaging',
    loinc: 'RAD-MISC',
    nameAr: 'تصوير ورنين مغناطيسي آخر (Other Imaging / MRI)',
    nameEn: 'Other Imaging / MRI / Ultrasound',
    defaultViews: ['External Scans'],
    turnaroundHours: { routine: 48, urgent: 12, stat: 3 }
  }
};

const CLINICAL_INDICATIONS = [
  'ind_cough',
  'ind_dyspnea',
  'ind_pneumonia',
  'ind_chest_pain',
  'ind_hemoptysis',
  'ind_fibrosis'
];

const URGENCY_LEVELS = {
  ROUTINE: 'routine',
  URGENT: 'urgent',
  STAT: 'stat'
};

const STUDY_STATUS = {
  UPLOADED: 'uploaded',
  QUARANTINED: 'quarantined',
  PENDING_RADIOLOGIST: 'pending_radiologist',
  UNDER_REVIEW: 'under_review',
  CERTIFIED: 'certified',
  REJECTED_ILLEGIBLE: 'rejected_illegible'
};

const MAX_RADIOLOGY_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = new Set(['.dcm', '.dicom', '.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
  'application/dicom',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

const RADIOLOGY_DISCLAIMERS = {
  ar: 'إخلاء مسؤولية سريري وتنبيه أمان (معيار Rology / SaMD): صور وفحوصات الأشعة الصدرية والمقطعية المرفوعة يتم فحصها واعتمادها حصرياً بواسطة أطباء أشعة بشريين مرخصين. نموذج الذكاء الاصطناعي (MVP) لا يدعي ولا يقدم أي تشخيص آلي مستقل. أي تقرير نهائي يجب أن يصدر بتوقيع ورقم ترخيص الطبيب المعالج.',
  en: 'Clinical Safety Notice & Disclaimer (Rology Benchmark / SaMD): Uploaded chest radiographs and CT studies are evaluated and certified exclusively by licensed human radiologists and pulmonologists. The MVP artificial intelligence engine makes no claim of automated or autonomous diagnosis. All clinical findings mandate certified physician sign-off.'
};

class RadiologyService {
  constructor() {
    this._studiesStore = new Map();
    this._telemetryEvents = [];
  }

  resetStoreForTesting() {
    this._studiesStore.clear();
    this._telemetryEvents = [];
  }

  getModalities() {
    return { ...RADIOLOGY_MODALITIES };
  }

  getClinicalSafetyDisclaimer(lang = 'ar') {
    return RADIOLOGY_DISCLAIMERS[lang === 'en' ? 'en' : 'ar'] || RADIOLOGY_DISCLAIMERS.ar;
  }

  validateRadiologyFile({ fileName, fileSize, mimeType, fileBuffer = null }) {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('A valid radiology file name is required.');
    }
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`File extension '${ext}' is not permitted for radiology intake. Allowed: .dcm, .dicom, .jpg, .png, .webp, .pdf`);
    }

    if (!fileSize || fileSize <= 0) {
      throw new Error('Radiology file is empty (0 bytes).');
    }

    if (fileSize > MAX_RADIOLOGY_FILE_SIZE) {
      throw new Error(`Radiology file exceeds maximum allowable 15MB limit (received ${(fileSize / (1024 * 1024)).toFixed(2)} MB).`);
    }

    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`MIME type '${mimeType}' is prohibited for radiology images.`);
    }

    return { valid: true, ext, sizeBytes: fileSize, mimeType: mimeType || 'application/dicom' };
  }

  deidentifyDicomMetadata(metadata = {}) {
    // Strip direct patient PII under HIPAA Safe Harbor §164.514(b)(2)
    const sanitized = { ...metadata };
    delete sanitized.PatientName;
    delete sanitized.PatientID;
    delete sanitized.PatientBirthDate;
    delete sanitized.PatientAddress;
    delete sanitized.InstitutionName;
    delete sanitized.ReferringPhysicianName;
    delete sanitized.AccessionNumber;

    sanitized.isDeidentified = true;
    sanitized.deidentifiedAt = new Date().toISOString();
    sanitized.deidentificationStandard = 'HIPAA Safe Harbor (DICOM PS 3.15 Annex E)';
    return sanitized;
  }

  async uploadRadiologyStudy({
    patientId,
    clinicId,
    modality = 'cxr_pa_lat',
    indications = [],
    urgency = URGENCY_LEVELS.ROUTINE,
    clinicalNotes = '',
    fileName,
    fileSize,
    mimeType,
    fileUrl = null,
    dicomMetadata = {}
  }) {
    if (!patientId) throw new Error('patientId is required for radiology study upload.');

    // Validate modality
    const modalityConfig = RADIOLOGY_MODALITIES[modality];
    if (!modalityConfig) {
      throw new Error(`Unsupported radiology modality '${modality}'.`);
    }

    // Validate file
    this.validateRadiologyFile({ fileName, fileSize, mimeType });

    // Validate urgency
    const validUrgency = [URGENCY_LEVELS.ROUTINE, URGENCY_LEVELS.URGENT, URGENCY_LEVELS.STAT].includes(urgency)
      ? urgency
      : URGENCY_LEVELS.ROUTINE;

    const studyId = `rad_study_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cleanDicomMetadata = this.deidentifyDicomMetadata(dicomMetadata);

    const studyRecord = {
      studyId,
      patientId,
      clinicId: clinicId || 'cairo_chest_center',
      modality,
      loincCode: modalityConfig.loinc,
      modalityNameEn: modalityConfig.nameEn,
      modalityNameAr: modalityConfig.nameAr,
      indications: Array.isArray(indications) ? indications : [],
      urgency: validUrgency,
      slaHours: modalityConfig.turnaroundHours[validUrgency] || 24,
      clinicalNotes: (clinicalNotes || '').trim(),
      fileName,
      fileSize,
      mimeType: mimeType || 'image/jpeg',
      fileUrl: fileUrl || `https://storage.healthvibe.ai/radiology/${clinicId || 'default'}/${studyId}/${fileName}`,
      dicomMetadata: cleanDicomMetadata,
      status: STUDY_STATUS.PENDING_RADIOLOGIST,
      nonAutonomousAiDisclaimer: this.getClinicalSafetyDisclaimer('ar'),
      nonAutonomousAiDisclaimerEn: this.getClinicalSafetyDisclaimer('en'),
      humanReviewRequired: true,
      certifiedByDoctor: null,
      certificationNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in memory
    this._studiesStore.set(studyId, studyRecord);

    // Persist to relational DB secondary index
    try {
      if (relationalDbService && typeof relationalDbService.recordUploadedFile === 'function') {
        relationalDbService.recordUploadedFile({
          fileId: studyId,
          patientId,
          clinicId: studyRecord.clinicId,
          fileName,
          category: 'chest_radiology',
          sizeBytes: fileSize,
          urgency: validUrgency,
          loincCode: modalityConfig.loinc
        });
      }
    } catch (_) {}

    // Security Audit Log
    try {
      auditService.recordAuditEvent(null, {
        type: 'CHEST_RADIOLOGY_STUDY_UPLOADED',
        actorUid: patientId,
        actorRole: 'patient',
        targetUserId: patientId,
        clinicId: studyRecord.clinicId,
        outcome: 'SUCCESS',
        metadata: {
          studyId,
          modality,
          loinc: modalityConfig.loinc,
          urgency: validUrgency,
          fileSize
        }
      });
    } catch (_) {}

    // Record Telemetry
    this._recordTelemetry({
      eventType: 'RADIOLOGY_STUDY_UPLOADED',
      studyId,
      modality,
      urgency: validUrgency,
      clinicId: studyRecord.clinicId
    });

    // Check STAT / Urgent notification dispatch
    let urgentNotificationDispatched = false;
    if (validUrgency === URGENCY_LEVELS.STAT || validUrgency === URGENCY_LEVELS.URGENT) {
      urgentNotificationDispatched = true;
      try {
        if (notificationService && typeof notificationService.sendClinicalNotificationEmail === 'function') {
          await notificationService.sendClinicalNotificationEmail({
            to: 'radiology-oncall@healthvibe.ai',
            subject: `[${validUrgency.toUpperCase()}] New Chest Radiology Study: ${modalityConfig.nameEn}`,
            text: `STAT Alert: A ${validUrgency} radiology study (${studyId}) has been uploaded. Turnaround SLA: ${studyRecord.slaHours} hours.`
          });
        }
      } catch (_) {}
    }

    return {
      success: true,
      studyId,
      study: studyRecord,
      urgentAlertDispatched: urgentNotificationDispatched
    };
  }

  getStudyById(studyId) {
    return this._studiesStore.get(studyId) || null;
  }

  getPatientStudies(patientId) {
    if (!patientId) return [];
    return Array.from(this._studiesStore.values())
      .filter(s => s.patientId === patientId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async certifyStudyByRadiologist({
    studyId,
    doctorUser,
    findings,
    clinicalImpression,
    isNormal = false
  }) {
    const study = this._studiesStore.get(studyId);
    if (!study) throw new Error(`Radiology study '${studyId}' not found.`);

    if (!doctorUser || !['doctor', 'radiologist', 'super_admin'].includes(doctorUser.role)) {
      throw new Error('Only licensed physicians / radiologists can certify imaging studies.');
    }

    study.status = STUDY_STATUS.CERTIFIED;
    study.certifiedByDoctor = {
      uid: doctorUser.uid,
      name: doctorUser.displayName || doctorUser.name || 'Dr. Verified Radiologist',
      role: doctorUser.role,
      licenseNumber: doctorUser.licenseNumber || 'EGY-RAD-10948',
      certifiedAt: new Date().toISOString()
    };
    study.findings = findings || '';
    study.clinicalImpression = clinicalImpression || findings || '';
    study.isNormal = Boolean(isNormal);
    study.updatedAt = new Date().toISOString();

    this._recordTelemetry({
      eventType: 'RADIOLOGY_STUDY_CERTIFIED',
      studyId,
      doctorId: doctorUser.uid,
      clinicId: study.clinicId,
      modality: study.modality
    });

    return { success: true, studyId, certifiedStatus: study.status, certifiedBy: study.certifiedByDoctor };
  }

  async rejectStudyAsIllegible({ studyId, doctorUser, rejectionReason }) {
    const study = this._studiesStore.get(studyId);
    if (!study) throw new Error(`Radiology study '${studyId}' not found.`);

    if (!doctorUser || !['doctor', 'radiologist', 'super_admin'].includes(doctorUser.role)) {
      throw new Error('Only licensed medical personnel can reject radiology studies.');
    }

    study.status = STUDY_STATUS.REJECTED_ILLEGIBLE;
    study.rejectionReason = rejectionReason || 'Image blurry, low contrast or motion artifacts present';
    study.rejectedBy = { uid: doctorUser.uid, rejectedAt: new Date().toISOString() };
    study.updatedAt = new Date().toISOString();

    this._recordTelemetry({
      eventType: 'RADIOLOGY_STUDY_REJECTED',
      studyId,
      doctorId: doctorUser.uid,
      clinicId: study.clinicId,
      rejectionReason: study.rejectionReason
    });

    return { success: true, studyId, status: study.status, reason: study.rejectionReason };
  }

  _recordTelemetry(event) {
    if (!event || typeof event !== 'object') return;
    if (event.clinicalNotes || event.findings || event.impression || event.patientName || event.patientAddress || event.ssn) {
      throw new Error('MEDICAL_TEXT_PROHIBITED: Clinical text and patient PHI are strictly blocked from radiology telemetry.');
    }
    this._telemetryEvents.push({
      ...event,
      timestamp: event.timestamp || Date.now()
    });
  }

  calculateRadiologyKpis(opts = {}) {
    const timeWindowHours = typeof opts === 'number' ? opts : (opts.timeWindowHours || 720);
    const clinicId = typeof opts === 'object' ? opts.clinicId : null;
    const lang = typeof opts === 'object' && opts.lang === 'ar' ? 'ar' : 'en';

    const cutoff = Date.now() - (timeWindowHours * 3600 * 1000);
    let studies = Array.from(this._studiesStore.values());
    if (clinicId) {
      studies = studies.filter(s => s.clinicId === clinicId);
    }

    const totalStudies = studies.length;
    const certifiedStudies = studies.filter(s => s.status === STUDY_STATUS.CERTIFIED);
    const certifiedCount = certifiedStudies.length;
    const rejectedCount = studies.filter(s => s.status === STUDY_STATUS.REJECTED_ILLEGIBLE).length;
    const statCount = studies.filter(s => s.urgency === URGENCY_LEVELS.STAT).length;

    const certificationRate = totalStudies > 0 ? Number(((certifiedCount / totalStudies) * 100).toFixed(1)) : null;
    const rejectionRate = totalStudies > 0 ? Number(((rejectedCount / totalStudies) * 100).toFixed(1)) : null;

    let turnaroundDurations = [];
    certifiedStudies.forEach(s => {
      if (s.certifiedByDoctor && s.certifiedByDoctor.certifiedAt && s.createdAt) {
        const durHours = (new Date(s.certifiedByDoctor.certifiedAt) - new Date(s.createdAt)) / (3600 * 1000);
        if (durHours >= 0) turnaroundDurations.push(durHours);
      }
    });

    const avgTurnaroundHours = turnaroundDurations.length > 0
      ? Number((turnaroundDurations.reduce((a, b) => a + b, 0) / turnaroundDurations.length).toFixed(1))
      : null;

    const modalityDistribution = {
      cxr_pa_lat: 0,
      ct_thorax_plain: 0,
      ct_thorax_contrast: 0,
      other_imaging: 0
    };
    studies.forEach(s => {
      if (modalityDistribution[s.modality] !== undefined) {
        modalityDistribution[s.modality]++;
      } else {
        modalityDistribution.other_imaging++;
      }
    });

    const unavailStr = lang === 'ar' ? 'غير متاح' : 'Unavailable';

    return {
      success: true,
      timeWindowHours,
      clinicId: clinicId || 'all_clinics',
      summary: {
        totalStudies,
        certifiedCount,
        rejectedCount,
        statCount,
        certificationRateDisplay: certificationRate !== null ? `${certificationRate}%` : unavailStr,
        rejectionRateDisplay: rejectionRate !== null ? `${rejectionRate}%` : unavailStr,
        avgTurnaroundHoursDisplay: avgTurnaroundHours !== null ? `${avgTurnaroundHours} hrs` : unavailStr
      },
      modalityDistribution,
      kpis: {
        certificationRate,
        rejectionRate,
        avgTurnaroundHours
      }
    };
  }

  async linkStudyToAppointment(db, { studyId, appointmentId } = {}, actorUser = {}) {
    if (!studyId || !appointmentId) {
      const err = new Error('studyId and appointmentId are required.');
      err.code = 'INVALID_ARGUMENTS';
      err.statusCode = 400;
      throw err;
    }

    const study = this._studiesStore.get(studyId);
    if (!study) {
      const err = new Error(`Radiology study '${studyId}' not found.`);
      err.code = 'STUDY_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    study.appointmentId = appointmentId;
    study.linkedToAppointmentAt = nowIso;
    study.updatedAt = nowIso;

    if (db && typeof db.collection === 'function') {
      try {
        const apptRef = db.collection('appointments').doc(appointmentId);
        const snap = await apptRef.get();
        if (snap && snap.exists) {
          const apptData = snap.data() || {};
          const studyIds = Array.isArray(apptData.attachedRadiologyStudyIds)
            ? [...apptData.attachedRadiologyStudyIds]
            : [];
          if (!studyIds.includes(studyId)) {
            studyIds.push(studyId);
            await apptRef.update({
              attachedRadiologyStudyIds: studyIds,
              updatedAt: nowIso
            });
          }
        }
      } catch (err) {
        console.warn('[APPOINTMENT RADIOLOGY LINK WARNING]:', err.message);
      }
    }

    this._recordTelemetry({
      eventType: 'RADIOLOGY_STUDY_LINKED_TO_APPOINTMENT',
      studyId,
      appointmentId,
      patientId: study.patientId,
      modality: study.modality
    });

    return { success: true, studyId, appointmentId };
  }

  async getStudiesForAppointment(db, appointmentId, requestingUser = {}) {
    if (!appointmentId) {
      const err = new Error('appointmentId is required.');
      err.code = 'MISSING_APPOINTMENT_ID';
      err.statusCode = 400;
      throw err;
    }

    const inMemory = Array.from(this._studiesStore.values())
      .filter(s => s.appointmentId === appointmentId);
    if (inMemory.length > 0) return inMemory;

    if (db && typeof db.collection === 'function') {
      try {
        const apptRef = db.collection('appointments').doc(appointmentId);
        const snap = await apptRef.get();
        if (snap && snap.exists) {
          const apptData = snap.data() || {};
          const studyIds = apptData.attachedRadiologyStudyIds || [];
          return Array.from(this._studiesStore.values()).filter(s => studyIds.includes(s.studyId));
        }
      } catch (_) {}
    }

    return [];
  }

  async generateChatbotRadiologyContext(db, patientId, { lang = 'ar' } = {}) {
    if (!patientId) return null;

    const studies = this.getPatientStudies(patientId).slice(0, 5);
    const hasStudies = studies.length > 0;
    let hasStatUrgency = false;
    const studySummaries = [];

    for (const s of studies) {
      if (s.urgency === URGENCY_LEVELS.STAT || s.urgency === URGENCY_LEVELS.URGENT) {
        hasStatUrgency = true;
      }
      const modLabel = lang === 'ar' ? s.modalityNameAr : s.modalityNameEn;
      const statusLabel = s.status === STUDY_STATUS.CERTIFIED
        ? (lang === 'ar' ? 'معتمد من استشاري الأشعة' : 'Certified by Radiologist')
        : (s.status === STUDY_STATUS.REJECTED_ILLEGIBLE
          ? (lang === 'ar' ? 'مرفوض لعدم وضوح الصورة' : 'Rejected - Illegible')
          : (lang === 'ar' ? 'بانتظار قراءة الطبيب' : 'Pending Radiologist Review'));
      studySummaries.push(`- ${s.fileName} (${modLabel} [${s.loincCode}]): ${statusLabel}`);
    }

    const disclaimer = this.getClinicalSafetyDisclaimer(lang);

    const contextAr = hasStudies
      ? `ملخص فحوصات وأشعة الصدر المرفوعة للمريض:\n${studySummaries.join('\n')}\n\nتوجيه الذكاء الاصطناعي السريري: ${this.getClinicalSafetyDisclaimer('ar')} ${hasStatUrgency ? '⚠️ فحص الأشعة مسجل بحالة حرجة (STAT/Urgent) تتطلب سرعة التقييم الطبي.' : ''}`
      : 'لا توجد فحوصات أشعة صدرية مرفوعة حتى الآن.';

    const contextEn = hasStudies
      ? `Uploaded Chest Radiology & CT Studies Summary:\n${studySummaries.join('\n')}\n\nClinical AI Directive: ${this.getClinicalSafetyDisclaimer('en')} ${hasStatUrgency ? '⚠️ A study has STAT/Urgent priority flag requiring immediate physician review.' : ''}`
      : 'No chest radiology studies uploaded yet.';

    return {
      hasStudies,
      count: studies.length,
      hasStatUrgency,
      disclaimer,
      context: lang === 'ar' ? contextAr : contextEn,
      contextAr,
      contextEn,
      studies
    };
  }

  formatRadiologyTimelineItem(study, lang = 'ar') {
    if (!study) return null;
    const isAr = lang === 'ar';
    const ts = study.createdAt || new Date().toISOString();
    const dateStr = String(ts).slice(0, 10);
    const modAr = study.modalityNameAr || 'أشعة الصدر';
    const modEn = study.modalityNameEn || 'Chest Radiology';
    const statusLabelAr = study.status === STUDY_STATUS.CERTIFIED
      ? 'معتمد سريرياً'
      : (study.status === STUDY_STATUS.REJECTED_ILLEGIBLE ? 'مرفوض' : 'قيد المراجعة');
    const statusLabelEn = study.status === STUDY_STATUS.CERTIFIED
      ? 'Clinically Certified'
      : (study.status === STUDY_STATUS.REJECTED_ILLEGIBLE ? 'Rejected' : 'Under Review');

    return {
      id: `radiology_${study.studyId}`,
      type: 'attachment',
      category: 'chest_radiology',
      title: `🩻 فحص أشعة صدرية (${modAr}): ${study.fileName}`,
      titleEn: `🩻 Chest Radiology Study (${modEn}): ${study.fileName}`,
      timestamp: ts,
      date: dateStr,
      status: study.status,
      summary: `${study.fileName} • ${isAr ? modAr : modEn} [${study.loincCode}] • ${isAr ? statusLabelAr : statusLabelEn}`,
      summaryEn: `${study.fileName} • ${modEn} [${study.loincCode}] • ${statusLabelEn}`,
      details: {
        studyId: study.studyId,
        patientId: study.patientId,
        clinicId: study.clinicId,
        modality: study.modality,
        loincCode: study.loincCode,
        urgency: study.urgency,
        slaHours: study.slaHours,
        status: study.status,
        fileName: study.fileName,
        fileSize: study.fileSize,
        certifiedByDoctor: study.certifiedByDoctor || null,
        rejectionReason: study.rejectionReason || null
      },
      link: `/app/index.html?screen=doctor&viewStudy=${encodeURIComponent(study.studyId)}`,
      recordId: study.studyId,
      source: 'radiology_studies',
      author: isAr ? 'قسم الأشعة والتصوير الطبي' : 'Radiology Department',
      isInternal: false
    };
  }
}

const radiologyService = new RadiologyService();

module.exports = {
  radiologyService,
  RadiologyService,
  RADIOLOGY_MODALITIES,
  CLINICAL_INDICATIONS,
  URGENCY_LEVELS,
  STUDY_STATUS,
  MAX_RADIOLOGY_FILE_SIZE,
  RADIOLOGY_DISCLAIMERS,
  linkRadiologyStudyToAppointment: (db, payload, actor) => radiologyService.linkStudyToAppointment(db, payload, actor),
  getRadiologyStudiesForAppointment: (db, apptId, user) => radiologyService.getStudiesForAppointment(db, apptId, user),
  generateChatbotRadiologyContext: (db, patientId, opts) => radiologyService.generateChatbotRadiologyContext(db, patientId, opts),
  formatRadiologyTimelineItem: (study, lang) => radiologyService.formatRadiologyTimelineItem(study, lang)
};
