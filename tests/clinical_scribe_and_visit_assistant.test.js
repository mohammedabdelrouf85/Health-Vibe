/**
 * Health Vibe AI - Clinical Scribe & Doctor Visit Assistant Test Suite
 *
 * Verifies:
 * 1. Mutual Audio Recording Consent Gating.
 * 2. Voice Note Summarization into Structured SOAP Draft.
 * 3. Provenance & Verbatim Source Linking for every clinical entity.
 * 4. Anti-Hallucination & Fidelity Engine:
 *    - Rejection/Quarantine of invented medications not in transcript.
 *    - Rejection/Quarantine of invented symptoms not in transcript.
 * 5. Transcription Noise & Low Confidence Segment Detection.
 * 6. Mandatory Physician Review & Edit Gate (HMAC-SHA256 signature).
 * 7. Dual Presentation Modes (Doctor Clinical Mode vs. Simplified Patient Mode).
 * 8. Reliable Evidence-Based Medical References Attachment.
 * 9. Audio Retention Policy & Auto-Purging.
 */

const assert = require('node:assert/strict');
const scribeService = require('../backend/clinical-scribe-service');

console.log('==================================================================');
console.log('🎙️ HEALTH VIBE AI: CLINICAL SCRIBE & VISIT ASSISTANT TEST SUITE');
console.log('   Audio Consent, Provenance, Anti-Hallucination & Dual Modes');
console.log('==================================================================\n');

(async () => {
  scribeService.resetScribeStoreForTesting();

  // Test Fixtures
  const approvedDoctor = {
    uid: 'doc_pulmo_adel_402',
    name: 'د. عادل توفيق',
    licenseNumber: 'HV-PULMO-LIC-4491',
    specialty: 'أمراض الصدر والجهاز التنفسي',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const suspendedDoctor = {
    uid: 'doc_suspended_111',
    name: 'طبيب موقوف',
    licenseNumber: 'HV-REVOKED-111',
    status: 'revoked',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  const patientId = 'usr_patient_hossam_45';
  const visitId = 'visit_clinic_8829';

  // Realistic consultation transcript & segments
  const validTranscriptText = `
    الطبيب: أهلاً بحضرتك يا أستاذ حسام، طمني إيه الشكوى النهاردة؟
    المريض: أهلاً يا دكتور، عندي كحة جافة بقالها 4 أيام ومش بنام منها، وحاسس بشوية سخونية خفيفة وتعب عام.
    الطبيب: هل في أي بلغم أو بصاق دموي أو ضيق تنفس شديد؟
    المريض: لأ يا دكتور، مفيش أي دم ومفيش ضيق تنفس شديد، بس الكحة مستمرة ومجهدة جداً.
    الطبيب: تمام، فحصنا الصدر بالسماعة وسليم، مفيش تزييق حاد، ونسبة الأكسجين 97% والنبض 76.
    الطبيب: التشخيص هو نزلة شعبية حادة بعد دور برد خفيف، مش محتاجين مضاد حيوي إطلاقاً.
    الطبيب: هنمشي على شراب مهدئ للسعال ليفودروبروبيزين levodropropizine 10 مل تلات مرات، وبنادول panadol عند اللزوم، ومشروبات دافية، ومتابعة لو الكحة زادت بعد أسبوع.
  `;

  const validTranscriptSegments = [
    { start: 5, end: 18, text: 'عندي كحة جافة بقالها 4 أيام ومش بنام منها، وحاسس بشوية سخونية خفيفة', confidence: 0.96 },
    { start: 20, end: 28, text: 'لأ يا دكتور، مفيش أي دم ومفيش ضيق تنفس شديد', confidence: 0.94 },
    { start: 35, end: 48, text: 'فحصنا الصدر بالسماعة وسليم ونسبة الأكسجين 97% والنبض 76', confidence: 0.92 },
    { start: 55, end: 70, text: 'هنمشي على شراب مهدئ للسعال ليفودروبروبيزين levodropropizine وبنادول panadol عند اللزوم', confidence: 0.95 }
  ];

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Audio Recording Consent Enforcement');
  // ---------------------------------------------------------------------------
  {
    // 1. Missing consent entirely
    await assert.rejects(
      async () => {
        await scribeService.createVisitVoiceDraft({
          visitId,
          patientId,
          doctorIdentity: approvedDoctor,
          recordingConsent: null,
          transcriptText: validTranscriptText
        });
      },
      err => {
        assert.equal(err.code, 'AUDIO_RECORDING_CONSENT_REQUIRED');
        return true;
      }
    );

    // 2. Patient declined consent
    await assert.rejects(
      async () => {
        await scribeService.createVisitVoiceDraft({
          visitId,
          patientId,
          doctorIdentity: approvedDoctor,
          recordingConsent: {
            consented: false,
            patientConsentGranted: false,
            doctorConsentGranted: true
          },
          transcriptText: validTranscriptText
        });
      },
      err => {
        assert.equal(err.code, 'AUDIO_RECORDING_CONSENT_REQUIRED');
        return true;
      }
    );

    console.log('  ✓ Audio recording consent strictly enforced: Processing blocked without mutual consent.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Structured SOAP Draft Generation with Verbatim Source Provenance');
  // ---------------------------------------------------------------------------
  let activeDraft;
  {
    const validConsent = {
      consented: true,
      patientConsentGranted: true,
      doctorConsentGranted: true,
      consentTimestamp: new Date().toISOString(),
      retentionPolicyDays: 14
    };

    const rawAudioMetadata = {
      audioFileId: 'audio_visit_8829_rec.m4a',
      durationSeconds: 180,
      rawAudioHash: 'sha256_mock_hash_898a'
    };

    activeDraft = await scribeService.createVisitVoiceDraft({
      visitId,
      patientId,
      patientName: 'حسام الدين عبد الله',
      doctorIdentity: approvedDoctor,
      recordingConsent: validConsent,
      rawAudioMetadata,
      transcriptText: validTranscriptText,
      transcriptSegments: validTranscriptSegments,
      clinicalContext: {
        clinicalImpression: 'Acute Bronchitis (Post-Viral)',
        icd10: 'J20.9',
        vitals: { spo2: 97, pulse: 76 }
      }
    });

    assert.equal(activeDraft.visitId, visitId);
    assert.equal(activeDraft.patientId, patientId);
    assert.equal(activeDraft.status, scribeService.DRAFT_STATUS.DRAFT);
    assert.equal(activeDraft.isDoctorApproved, false, 'Draft MUST start as unapproved');
    assert.equal(activeDraft.approvedBy, null);

    // Verify SOAP structure
    assert.ok(activeDraft.structuredSummary.subjective);
    assert.ok(activeDraft.structuredSummary.objective);
    assert.ok(activeDraft.structuredSummary.assessment);
    assert.ok(activeDraft.structuredSummary.plan);

    // Check Source Provenance Links on Symptoms and Medications
    const symptoms = activeDraft.structuredSummary.subjective.symptoms;
    assert.ok(symptoms.length > 0);
    for (const sym of symptoms) {
      assert.ok(sym.sourceLink, 'Every symptom must have a source link');
      assert.ok(sym.sourceLink.verbatimQuote.length > 0);
    }

    const medications = activeDraft.structuredSummary.plan.medications;
    assert.ok(medications.length > 0);
    for (const med of medications) {
      assert.ok(med.sourceLink, 'Every medication must have a source link');
      assert.ok(med.sourceLink.verbatimQuote.length > 0);
    }

    console.log('  ✓ Structured SOAP draft created with verbatim source links to transcript timestamps.');
    console.log('  ✓ Draft initial state confirmed as unapproved draft.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Anti-Hallucination & Anti-Invention Engine');
  // ---------------------------------------------------------------------------
  {
    // Test case A: Valid draft matching transcript (Zero hallucinations)
    const validAudit = scribeService.auditFidelityAndAntiHallucination(
      activeDraft.structuredSummary,
      validTranscriptText
    );
    assert.equal(validAudit.isGrounded, true);
    assert.equal(validAudit.hallucinatedCount, 0);

    // Test case B: Corrupted/Hallucinated draft with unmentioned medication and unmentioned symptom
    const hallucinatedSummary = {
      subjective: {
        symptoms: [
          { symptom: 'cough' }, // mentioned in transcript
          { symptom: 'chest pain' }, // NEVER mentioned in transcript!
          { symptom: 'hemoptysis' }  // Patient explicitly said "NO blood"!
        ]
      },
      plan: {
        medications: [
          { name: 'panadol' },      // mentioned in transcript
          { name: 'amoxicillin' },  // Doctor said NO ANTIBIOTICS! NEVER mentioned!
          { name: 'metformin' }     // Totally ungrounded invention!
        ]
      }
    };

    const hallucinationAudit = scribeService.auditFidelityAndAntiHallucination(
      hallucinatedSummary,
      validTranscriptText
    );

    assert.equal(hallucinationAudit.isGrounded, false);
    assert.ok(hallucinationAudit.hallucinatedCount >= 3);

    const flaggedMeds = hallucinationAudit.hallucinatedEntities.filter(e => e.type === 'MEDICATION');
    assert.ok(flaggedMeds.some(m => m.name === 'amoxicillin'));
    assert.ok(flaggedMeds.some(m => m.name === 'metformin'));

    const flaggedSymptoms = hallucinationAudit.hallucinatedEntities.filter(e => e.type === 'SYMPTOM');
    assert.ok(flaggedSymptoms.some(s => s.name === 'chest pain'));

    console.log('  ✓ Anti-Hallucination engine detected and quarantined unmentioned medications (Amoxicillin, Metformin).');
    console.log('  ✓ Anti-Invention engine detected ungrounded symptom inventions (Chest pain).');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Transcription Noise & Low Confidence Segments Detection');
  // ---------------------------------------------------------------------------
  {
    const noisySegments = [
      { start: 0, end: 10, text: 'صباح الخير يا دكتور', confidence: 0.95 },
      { start: 12, end: 18, text: '... صوت مش واضح وشوشة ...', confidence: 0.45 }, // Low confidence noise
      { start: 20, end: 30, text: 'عندي كحة مستمرة', confidence: 0.92 }
    ];

    const confAudit = scribeService.auditTranscriptionConfidence(noisySegments);
    assert.equal(confAudit.hasLowConfidenceSegments, true);
    assert.equal(confAudit.lowConfidenceSegmentsCount, 1);
    assert.equal(confAudit.lowConfidenceSegments[0].confidence, 0.45);
    assert.equal(confAudit.lowConfidenceSegments[0].warning, 'LOW_CONFIDENCE_TRANSCRIPTION');

    console.log('  ✓ Transcription noise and low-confidence audio segments detected for physician verification.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Mandatory Doctor Review, Edit & Cryptographic Approval Gate');
  // ---------------------------------------------------------------------------
  {
    // Suspended doctor cannot approve
    assert.throws(
      () => scribeService.reviewAndApproveDraft({
        draftId: activeDraft.draftId,
        doctorIdentity: suspendedDoctor
      }),
      /Only actively licensed and approved physicians can review and approve clinical notes/
    );

    // Approved doctor reviews, edits clinical notes, and approves
    const editedSummary = {
      ...activeDraft.structuredSummary,
      assessment: {
        clinicalImpression: 'Acute Viral Bronchitis (Confirmed and Reviewed)',
        icd10Suggested: 'J20.9',
        differentialDiagnoses: ['Mild Asthma Variant']
      }
    };

    const approvedDraft = scribeService.reviewAndApproveDraft({
      draftId: activeDraft.draftId,
      doctorIdentity: approvedDoctor,
      editedSummary,
      approvalNotes: 'تمت مراجعة الملخص السريري وتعديل التشخيص وتأكيد عدم الحاجة لمضاد حيوي.'
    });

    assert.equal(approvedDraft.status, scribeService.DRAFT_STATUS.DOCTOR_APPROVED);
    assert.equal(approvedDraft.isDoctorApproved, true);
    assert.equal(approvedDraft.approvedBy.licenseNumber, approvedDoctor.licenseNumber);
    assert.equal(approvedDraft.digitalSignature.algorithm, 'HMAC-SHA256');
    assert.ok(approvedDraft.digitalSignature.signatureHash.length === 64);
    assert.equal(approvedDraft.structuredSummary.assessment.clinicalImpression, 'Acute Viral Bronchitis (Confirmed and Reviewed)');

    console.log('  ✓ Doctor Review Gate confirmed: Draft edited and cryptographically stamped with HMAC-SHA256.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Dual Presentation Modes (Doctor Mode vs. Simplified Patient Mode)');
  // ---------------------------------------------------------------------------
  {
    // 1. Doctor Mode
    const doctorView = scribeService.getStructuredSummary(activeDraft.draftId, { mode: 'doctor' });
    assert.equal(doctorView.presentationMode, 'DOCTOR_CLINICAL_MODE');
    assert.ok(doctorView.structuredSummary.subjective);
    assert.ok(doctorView.evidenceReferences.length > 0);
    assert.ok(doctorView.provenanceLinks.rawAudioId);
    assert.equal(doctorView.status, scribeService.DRAFT_STATUS.DOCTOR_APPROVED);

    // 2. Simplified Patient Mode (Arabic)
    const patientViewAr = scribeService.getStructuredSummary(activeDraft.draftId, { mode: 'patient', language: 'ar' });
    assert.equal(patientViewAr.presentationMode, 'SIMPLIFIED_PATIENT_MODE');
    assert.ok(patientViewAr.plainLanguageSummary.title.includes('ملخص زيارة الطبيب'));
    assert.ok(patientViewAr.plainLanguageSummary.whatTheDoctorFound);
    assert.ok(patientViewAr.plainLanguageSummary.emergencyRedFlags.length > 0);
    assert.ok(patientViewAr.plainLanguageSummary.friendlyNote);

    // 3. Simplified Patient Mode (English)
    const patientViewEn = scribeService.getStructuredSummary(activeDraft.draftId, { mode: 'patient', language: 'en' });
    assert.equal(patientViewEn.presentationMode, 'SIMPLIFIED_PATIENT_MODE');
    assert.ok(patientViewEn.plainLanguageSummary.title.includes('Doctor Visit Summary'));
    assert.ok(patientViewEn.plainLanguageSummary.emergencyRedFlags.length > 0);

    console.log('  ✓ Doctor Mode returned complete SOAP, ICD-10, and provenance metadata.');
    console.log('  ✓ Simplified Patient Mode returned plain-language, bilingual care steps and red flags.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Evidence-Based Reliable Medical References Attachment');
  // ---------------------------------------------------------------------------
  {
    assert.ok(activeDraft.evidenceReferences.length > 0);
    const ref = activeDraft.evidenceReferences[0];
    assert.ok(ref.guideline);
    assert.ok(ref.authority);
    assert.ok(ref.citation);
    assert.ok(ref.summary.includes('antibiotic'));

    console.log(`  ✓ Evidence reference attached: ${ref.guideline} (${ref.authority}).`);
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Audio Retention Policy & Auto-Purging');
  // ---------------------------------------------------------------------------
  {
    assert.equal(activeDraft.rawAudioMetadata.purged, false);

    // Fast-forward beyond 14-day retention window
    const purgeReport = scribeService.purgeExpiredAudioRecordings(0); // force purge older than 0 days
    assert.ok(purgeReport.purgedCount >= 1);

    const reloadedDraft = scribeService.getDraftById(activeDraft.draftId);
    assert.equal(reloadedDraft.rawAudioMetadata.purged, true);
    assert.ok(reloadedDraft.rawAudioMetadata.purgedAt);
    // Approved text and digital signature must remain intact after audio purging
    assert.equal(reloadedDraft.isDoctorApproved, true);
    assert.ok(reloadedDraft.digitalSignature.signatureHash);

    console.log('  ✓ Privacy retention policy enforced: Raw audio purged after retention window while preserving approved text note.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL CLINICAL SCRIBE & DOCTOR ASSISTANT TESTS PASSED (100%)!');
  console.log('==================================================================\n');
})();
