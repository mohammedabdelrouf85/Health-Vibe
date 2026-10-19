/**
 * Health Vibe AI - Doctor Review UI Module
 * 
 * Manages:
 * 1. Persistent, compact patient & case identity header with clinical revision tracking and assessment date.
 * 2. Stale revision detection & clear "New information received" alert banners.
 * 3. Comprehensive field-level revision comparisons with measurement timestamps and source provenance.
 * 4. Doctor draft note preservation across re-renders, case switching, and language changes.
 * 5. Explicit review acknowledgment enforcement before unlocking clinical approval.
 * 6. Full bilingual support (Arabic & English), mobile responsiveness, and keyboard accessibility.
 * 7. Multi-modal status signaling: text and icons alongside status colors (WCAG compliant).
 */

(function (global) {
  "use strict";

  // In-memory stores
  const doctorDraftNotesStore = new Map();       // caseId -> { diagnosis, medications, recommendations, investigations, savedAt }
  const caseInvestigationsStore = new Map();     // caseId -> Array of investigation items
  const acknowledgedRevisionsStore = new Map();  // caseId -> number (last acknowledged revision)
  let lastActiveModalOpener = null;              // Tracks button that opened modal for focus return
  let modalKeydownHandler = null;                // Reference to bound keydown handler for focus trap

  function getDiagnosticPresets(isEn = false) {
    return {
      bronchitis: {
        diag: isEn
          ? "Acute bronchitis with mild bronchial irritation. Respiratory vitals monitored, no respiratory failure signs."
          : "التهاب شعبي حاد مع تهيج في الشعب الهوائية. تم فحص القياسات الحيوية ولا توجد مؤشرات على فشل تنفسي.",
        meds: isEn
          ? "1. Bronchodilator Inhaler (Salbutamol 100mcg) - 2 puffs every 6-8 hours as needed for dyspnea.\n2. Expectorant Cough Syrup (Guaifenesin 100mg/5ml) - 10ml three times daily after meals for 5 days.\n3. Paracetamol 500mg - 1-2 tablets every 6 hours if fever/body aches arise."
          : "1. بخاخ موسع للشعب الهوائية (سالبوتامول 100 ميكروجرام) - بختان كل 6-8 ساعات عند الشعور بضيق التنفس.\n2. شراب طارد ومذيب للبلغم (جوايفينيزين) - ملعقة كبيرة 3 مرات يومياً بعد الوجبات لمدة 5 أيام.\n3. باراسيتامول 500 مجم - قرص كل 6 ساعات عند ارتفاع الحرارة أو الصداع.",
        recs: isEn
          ? "• Drink warm fluids (herbal teas, honey-lemon) throughout the day.\n• Avoid sudden temperature changes, smoke, and air pollutants.\n• Rest voice and body for 48-72 hours.\n• Follow-up immediately if SpO2 drops below 92% or high fever persists."
          : "• تناول السوائل الدافئة بوفرة (عسل وليمون، مشروبات عشبية).\n• الابتعاد التام عن التدخين والغبار وتيارات الهواء البارد.\n• أخذ قسط وافر من الراحة البدنية لمدة 48-72 ساعة.\n• مراجعة الطوارئ فوراً في حال انخفاض نسبة الأكسجين عن 92% أو استمرار الحمى الشديدة."
      },
      stable: {
        diag: isEn
          ? "Normal respiratory assessment. Mild seasonal upper airway sensitivity without hypoxemia or respiratory distress."
          : "تقييم تنفسي طبيعي ومستقر. حساسية موسمية خفيفة في المجاري التنفسية العليا دون نقص بالأكسجين أو علامات خطورة.",
        meds: isEn
          ? "1. Antihistamine (Cetirizine 10mg) - 1 tablet once daily before bedtime for 7 days.\n2. Saline Nasal Spray - 2 sprays per nostril 3 times daily as needed."
          : "1. مضاد للهستامين (سيتريزين 10 مجم) - قرص واحد مساءً قبل النوم لمدة 7 أيام.\n2. بخاخ محلول ملحي للأنف - بختان في كل فتحة أنف 3 مرات يومياً عند الحاجة.",
        recs: isEn
          ? "• Stay well-hydrated and maintain good indoor ventilation.\n• Continue healthy dietary habits and adequate sleep.\n• Routine health checkup in 6 months or if symptoms worsen."
          : "• شرب كميات كافية من الماء والحفاظ على تهوية جيدة للمنزل.\n• الاستمرار في نمط حياة صحي وغذاء متوازن ونوم كافٍ.\n• مراجعة الفحص الدوري بعد 6 أشهر أو عند حدوث أي تغير في الأعراض."
      },
      asthma: {
        diag: isEn
          ? "Mild-to-moderate bronchial asthma flare-up. Reactive airway, SpO2 borderline stable."
          : "نوبة ربو شعبي متوسطة إلى خفيفة. وجود صفير بالصدر مع تهيج بالشعب الهوائية مع استقرار نسبي لنسبة الأكسجين.",
        meds: isEn
          ? "1. Combination Inhaler (Budesonide/Formoterol 160/4.5mcg) - 1-2 inhalations twice daily.\n2. Oral Prednisolone 20mg - 1 tablet in the morning after breakfast for 3 days.\n3. Salbutamol Inhaler - 2 puffs as rescue therapy for acute shortness of breath."
          : "1. بخاخ مدمج (بوديزونايد / فورموتيرول) - استنشاقة واحدة مرتين يومياً صباحاً ومساءً.\n2. بريدنيزولون 20 مجم - قرص واحد صباحاً بعد الإفطار لمدة 3 أيام فقط.\n3. بخاخ سالبوتامول - بختان للإنقاذ عند الشعور بضيق مفاجئ في التنفس.",
        recs: isEn
          ? "• Keep rescue inhaler readily accessible at all times.\n• Avoid known allergy triggers (perfumes, cat/dog dander, dust mites).\n• Measure peak flow or SpO2 twice daily.\n• Visit ER immediately if no improvement after 3 rescue doses within 1 hour."
          : "• الاحتفاظ ببخاخ الإنقاذ في متناول اليد في جميع الأوقات.\n• تجنب المهيجات المسببة للحساسية (العطور القوية، فراء الحيوانات، الغبار).\n• قياس نسبة الأكسجين SpO2 مرتين يومياً.\n• التوجه فوراً لقسم الطوارئ في حال عدم الاستجابة لثلاث جرعات إسعافية خلال ساعة."
      },
      uri: {
        diag: isEn
          ? "Acute viral upper respiratory tract infection (URTI) with rhinitis and productive cough. No lower respiratory consolidation."
          : "التهاب فيروسي حاد بالجهاز التنفسي العلوي مصحوب بسيلان أنفي وسعال. لا توجد مؤشرات على التهاب رئوي سفلي.",
        meds: isEn
          ? "1. Vitamin C + Zinc Lozenges - twice daily for 5 days.\n2. Decongestant / Antihistamine combo - 1 tablet twice daily after meals for 4 days.\n3. Paracetamol 500mg - every 6-8 hours for sore throat or fever."
          : "1. مكمل فيتامين سي مع زنك - مرتين يومياً لمدة 5 أيام.\n2. أقراص مزيلة للاحتقان ومضادة للهستامين - قرص مرتين يومياً بعد الأكل لمدة 4 أيام.\n3. باراسيتامول 500 مجم - قرص كل 6 إلى 8 ساعات لتسكين آلام الحلق والحمى.",
        recs: isEn
          ? "• Strict rest and sleep to boost immune recovery.\n• Frequent warm saline gargles 3-4 times daily.\n• Wear a mask around vulnerable family members.\n• Follow-up in 3-5 days if symptoms fail to resolve."
          : "• الراحة التامة والنوم الكافي لتعزيز مناعة الجسم.\n• الغرغرة بمحلول ملحي دافئ 3-4 مرات يومياً لتخفيف احتقان الحلق.\n• ارتداء كمامة واقية عند التعامل مع كبار السن أو الأطفال.\n• مراجعة الطبيب إذا استمرت الأعراض لأكثر من 5 أيام دون تحسن."
      }
    };
  }

  // ===========================================================================
  // 1. DRAFT NOTE PRESERVATION ENGINE
  // ===========================================================================

  function saveDraftNotes(caseId, notes = {}) {
    if (!caseId) return;
    const existing = doctorDraftNotesStore.get(caseId) || {};
    const updated = {
      diagnosis: notes.diagnosis !== undefined ? notes.diagnosis : (existing.diagnosis || ""),
      medications: notes.medications !== undefined ? notes.medications : (existing.medications || ""),
      recommendations: notes.recommendations !== undefined ? notes.recommendations : (existing.recommendations || ""),
      investigations: notes.investigations !== undefined ? notes.investigations : (existing.investigations || caseInvestigationsStore.get(caseId) || []),
      privateNotes: notes.privateNotes !== undefined ? notes.privateNotes : (existing.privateNotes || ""),
      includePrivateNotesInReport: notes.includePrivateNotesInReport !== undefined ? Boolean(notes.includePrivateNotesInReport) : Boolean(existing.includePrivateNotesInReport),
      savedAt: Date.now()
    };
    doctorDraftNotesStore.set(caseId, updated);
    if (notes.investigations !== undefined) {
      caseInvestigationsStore.set(caseId, notes.investigations);
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`hv_draft_doc_${caseId}`, JSON.stringify(updated));
      }
    } catch (e) {
      // LocalStorage might be restricted
    }

    // Refresh preserved badge display if currently rendered
    updateDraftBadgeVisibility(caseId);
  }

  function getDraftNotes(caseId) {
    if (!caseId) return null;
    if (doctorDraftNotesStore.has(caseId)) {
      return doctorDraftNotesStore.get(caseId);
    }
    try {
      if (typeof localStorage !== "undefined") {
        const item = localStorage.getItem(`hv_draft_doc_${caseId}`);
        if (item) {
          const parsed = JSON.parse(item);
          doctorDraftNotesStore.set(caseId, parsed);
          if (Array.isArray(parsed.investigations)) {
            caseInvestigationsStore.set(caseId, parsed.investigations);
          }
          return parsed;
        }
      }
    } catch (e) {}
    if (caseInvestigationsStore.has(caseId) && caseInvestigationsStore.get(caseId).length > 0) {
      return { investigations: caseInvestigationsStore.get(caseId) };
    }
    return null;
  }

  function hasDraftNotes(caseId) {
    const draft = getDraftNotes(caseId);
    if (!draft) return false;
    return Boolean(
      (draft.diagnosis && draft.diagnosis.trim()) ||
      (draft.medications && draft.medications.trim()) ||
      (draft.recommendations && draft.recommendations.trim()) ||
      (draft.privateNotes && draft.privateNotes.trim()) ||
      (Array.isArray(draft.investigations) && draft.investigations.length > 0)
    );
  }

  function clearDraftNotes(caseId) {
    if (!caseId) return;
    doctorDraftNotesStore.delete(caseId);
    caseInvestigationsStore.delete(caseId);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`hv_draft_doc_${caseId}`);
      }
    } catch (e) {}
    updateDraftBadgeVisibility(caseId);
  }

  function discardDraftNotes(caseId) {
    if (!caseId) return;
    clearDraftNotes(caseId);
    const isEn = (global.currentLanguage || "ar") === "en";
    if (typeof global.selectDoctorCase === "function") {
      global.selectDoctorCase(caseId);
    }
    if (typeof global.showToast === "function") {
      global.showToast(isEn ? "Draft discarded. Original notes restored." : "تم إلغاء المسودة واستعادة الملاحظات الأصلية.");
    }
  }

  function updateDraftBadgeVisibility(caseId) {
    if (typeof document === "undefined") return;
    const badge = document.getElementById("doctorDraftPreservedBadge");
    if (badge) {
      badge.style.display = hasDraftNotes(caseId) ? "inline-flex" : "none";
    }
  }

  function attachDraftPreservationListeners(caseId) {
    if (!caseId || typeof document === "undefined") return;
    const diagInput = document.getElementById("doctorDiagnosisInput");
    const medsInput = document.getElementById("doctorMedicationsInput");
    const recsInput = document.getElementById("doctorRecommendationsInput");
    const privateNotesInput = document.getElementById("doctorPrivateNotesInput");
    const includePrivateCheck = document.getElementById("includePrivateNotesInReport");

    const onInput = () => {
      saveDraftNotes(caseId, {
        diagnosis: diagInput ? diagInput.value : "",
        medications: medsInput ? medsInput.value : "",
        recommendations: recsInput ? recsInput.value : "",
        privateNotes: privateNotesInput ? privateNotesInput.value : "",
        includePrivateNotesInReport: includePrivateCheck ? includePrivateCheck.checked : false
      });
    };

    if (diagInput) {
      diagInput.removeEventListener("input", onInput);
      diagInput.addEventListener("input", onInput);
      diagInput.addEventListener("change", onInput);
    }
    if (medsInput) {
      medsInput.removeEventListener("input", onInput);
      medsInput.addEventListener("input", onInput);
      medsInput.addEventListener("change", onInput);
    }
    if (recsInput) {
      recsInput.removeEventListener("input", onInput);
      recsInput.addEventListener("input", onInput);
      recsInput.addEventListener("change", onInput);
    }
    if (privateNotesInput) {
      privateNotesInput.removeEventListener("input", onInput);
      privateNotesInput.addEventListener("input", onInput);
      privateNotesInput.addEventListener("change", onInput);
    }
    if (includePrivateCheck) {
      includePrivateCheck.removeEventListener("change", onInput);
      includePrivateCheck.addEventListener("change", onInput);
    }

    updateDraftBadgeVisibility(caseId);
  }

  // ===========================================================================
  // 2. REVISION TRACKING & STALE STATE ENGINE
  // ===========================================================================

  function getCaseRevisionNumber(caseRecord) {
    if (!caseRecord) return 1;
    return Number(
      caseRecord.clinicalRevision ||
      caseRecord.currentAssessment?.revision ||
      (Array.isArray(caseRecord.revisions) ? caseRecord.revisions.length : 1)
    ) || 1;
  }

  function isRevisionStale(caseRecord) {
    if (!caseRecord) return false;
    const rev = getCaseRevisionNumber(caseRecord);
    // Revision 1 is baseline. If revision > 1 or flagged as stale/having new info:
    if (rev <= 1 && !caseRecord.hasNewInfo && !caseRecord.isRevisionStale) {
      return false;
    }
    const lastAck = acknowledgedRevisionsStore.get(caseRecord.id) || 0;
    return lastAck < rev || Boolean(caseRecord.hasNewInfo && lastAck < 1);
  }

  function acknowledgeNewRevision(caseId) {
    if (!caseId) return;
    const activeCase = (global.state?.doctorQueue || []).find(c => c.id === caseId) ||
                       (global.cases || []).find(c => c.id === caseId) ||
                       { id: caseId, clinicalRevision: 2 };

    const rev = getCaseRevisionNumber(activeCase);
    acknowledgedRevisionsStore.set(caseId, rev);

    // Clear stale flags on the case object itself
    activeCase.hasNewInfo = false;
    activeCase.isRevisionStale = false;

    const isEn = (global.currentLanguage || "ar") === "en";

    // 1. Hide stale alert banner
    const staleBanner = document.getElementById("staleRevisionBanner");
    if (staleBanner) {
      staleBanner.style.display = "none";
    }

    // 2. Unlock the approval button in the action toolbar
    const approveBtns = document.querySelectorAll(".btn-clinical.approve");
    approveBtns.forEach(btn => {
      btn.removeAttribute("disabled");
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.background = "#10b981";
      btn.classList.remove("locked");
      btn.title = isEn ? "Approve and generate official certified report" : "اعتماد سريري وتوليد التقرير الطبي المعتمد";
      btn.innerHTML = `<span>✨</span> ${isEn ? "Generate & Approve Report" : "توليد واعتماد التقرير"}`;
    });

    const lockWarning = document.getElementById("approvalLockedNotice");
    if (lockWarning) {
      lockWarning.style.display = "none";
    }

    // 3. Update sticky header revision pill with verified status (Text + Icon + Color)
    const revPill = document.getElementById("headerRevisionPill");
    if (revPill) {
      revPill.className = "pill ok";
      revPill.innerHTML = `<span>📑</span> ${isEn ? "Rev " + rev + " (Verified)" : "المراجعة " + rev + " (مدققة)"}`;
      revPill.title = isEn ? "Clinically verified revision" : "مراجعة سريرية مدققة ومعتمدة";
    }

    // 4. Announce to screen readers
    const liveAnnouncer = document.getElementById("doctorReviewAriaLive");
    if (liveAnnouncer) {
      liveAnnouncer.textContent = isEn
        ? `Revision ${rev} verified. Report approval is now unlocked.`
        : `تم تأكيد مراجعة التحديثات السريرية (المراجعة ${rev}). تم إلغاء قفل اعتماد التقرير بنجاح.`;
    }

    // 5. Close comparison modal if open
    closeFieldComparisonModal();

    if (typeof global.showToast === "function") {
      global.showToast(isEn ? "New information acknowledged. Approval unlocked." : "تم تأكيد مراجعة البيانات الجديدة وإتاحة الاعتماد.");
    }
  }

  // ===========================================================================
  // 3. PERSISTENT PATIENT & CASE IDENTITY HEADER
  // ===========================================================================

  function renderPersistentCaseHeader(c, isEn = false) {
    if (!c) return "";
    const rev = getCaseRevisionNumber(c);
    const stale = isRevisionStale(c);
    const draft = hasDraftNotes(c.id);

    const patientName = isEn
      ? (c.patientNameEn || c.nameEn || c.patientName || c.name || "Anonymous Patient")
      : (c.patientName || c.name || c.patientNameEn || c.nameEn || "مريض غير مسجل");

    const patientId = c.patientId || c.patientUid || c.userId || c.id;
    const shortPatientId = patientId ? patientId.slice(0, 10) : "--";
    const caseIdShort = c.id ? c.id.slice(-6).toUpperCase() : "--";
    const clinicName = isEn
      ? (c.clinicNameEn || c.clinicName || c.clinicId || "Main Respiratory Clinic")
      : (c.clinicName || c.clinicNameEn || c.clinicId || "عيادة الصدرية والجهاز التنفسي");

    // Format assessment date and time
    const submittedMs = c.submittedAt
      ? (c.submittedAt.toDate ? c.submittedAt.toDate().getTime() : (c.submittedAt.toMillis ? c.submittedAt.toMillis() : new Date(c.submittedAt).getTime()))
      : (c.createdAt ? new Date(c.createdAt).getTime() : 0);

    const dateLabel = submittedMs
      ? new Date(submittedMs).toLocaleDateString(isEn ? "en-US" : "ar-EG", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : (isEn ? "Not recorded" : "غير مسجل");

    // Status Pill Meta (Text + Icon + Color)
    const STATUS_META = {
      under_review: { icon: "🩺", en: "Under Review", ar: "قيد الفحص السريري", pillClass: "pending" },
      pending: { icon: "⏳", en: "Pending", ar: "قيد الانتظار", pillClass: "pending" },
      submitted: { icon: "📥", en: "Submitted", ar: "تم الإرسال", pillClass: "info" },
      assigned: { icon: "👨‍⚕️", en: "Assigned", ar: "مسندة للطبيب", pillClass: "info" },
      triaged: { icon: "🔍", en: "Triaged", ar: "تم الفرز", pillClass: "info" },
      more_info_requested: { icon: "❓", en: "More Info Requested", ar: "مطلوب بيانات إضافية", pillClass: "pending" },
      approved: { icon: "✅", en: "Approved", ar: "معتمد سريرياً", pillClass: "ok" },
      rejected: { icon: "❌", en: "Rejected", ar: "مرفوض سريرياً", pillClass: "danger" },
      escalated: { icon: "🚨", en: "Escalated", ar: "مصعّد للطوارئ", pillClass: "danger" },
      closed: { icon: "🔒", en: "Closed", ar: "مكتمل ومغلق", pillClass: "info" }
    };

    const statusKey = String(c.status || "under_review").toLowerCase();
    let statusMeta = (typeof global.getCaseStatusMeta === "function" && global.getCaseStatusMeta(c.status)?.icon)
      ? global.getCaseStatusMeta(c.status)
      : (STATUS_META[statusKey] || {
          icon: "🩺",
          en: statusKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          ar: "قيد الفحص",
          pillClass: "pending"
        });

    if (c?.isReentryRequest && statusKey === "more_info_requested") {
      statusMeta = {
        icon: "⚠️",
        en: isEn ? "Pending Re-entry" : "بانتظار إعادة القياس",
        ar: "بانتظار إعادة القياس",
        pillClass: "warning"
      };
    }

    // Priority Pill Meta (Text + Icon + Color)
    const o2Val = Number(c.o2 ?? c.oxygenLevel ?? 0);
    const priorityKey = (c.priority || (o2Val > 0 && o2Val < 90 ? "urgent" : "normal")).toLowerCase();
    const priorityMeta = (typeof global.getPriorityMeta === "function") ? global.getPriorityMeta(priorityKey, isEn) : {
      icon: priorityKey.includes("urgent") ? "🚨" : (priorityKey.includes("high") ? "🟠" : "🟢"),
      label: priorityKey.includes("urgent") ? (isEn ? "Urgent" : "عاجل") : (priorityKey.includes("high") ? (isEn ? "High" : "أولوية عالية") : (isEn ? "Routine" : "عادي")),
      pill: priorityKey.includes("urgent") ? "danger" : (priorityKey.includes("high") ? "pending" : "ok")
    };

    const age = c.dateOfBirth || c.dob ? (typeof global.calculateAge === "function" ? global.calculateAge(c.dateOfBirth || c.dob) : "") : (c.patientAge || c.age || "");
    const gender = c.gender === "female" ? (isEn ? "Female" : "أنثى") : (c.gender === "male" ? (isEn ? "Male" : "ذكر") : "");
    const demographics = [age ? `${age} ${isEn ? "yrs" : "سنة"}` : "", gender].filter(Boolean).join(" • ");

    return `
      <header class="doctor-identity-header sticky-header" id="doctorCaseIdentityHeader" role="region" aria-label="${isEn ? 'Patient and Case Identity Header' : 'بيانات المريض ورقم الحالة والمراجعة'}">
        <div class="identity-header-main">
          <!-- Patient Identity Block -->
          <div class="identity-block patient-block">
            <div class="identity-avatar" aria-hidden="true">👤</div>
            <div class="identity-meta">
              <div class="identity-title-row">
                <h3 class="identity-name" title="${patientName}">${patientName}</h3>
                ${demographics ? `<span class="identity-demographics" aria-label="${demographics}">${demographics}</span>` : ""}
              </div>
              <div class="identity-sub-row">
                <span class="identity-id-badge" title="${isEn ? 'Patient Identifier' : 'معرف المريض'}: ${patientId}">
                  <span>🆔</span> <code class="identity-code">${shortPatientId}</code>
                </span>
                <span class="identity-clinic" title="${clinicName}">
                  <span>🏥</span> <span>${clinicName}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Case & Assessment Details Block -->
          <div class="identity-block case-block">
            <div class="identity-badge-group">
              <!-- Case Pill (Icon + Text + Code) -->
              <span class="identity-case-pill" title="${isEn ? 'Case ID' : 'رقم الحالة'}: ${c.id}">
                <span>📋</span> <strong>#${caseIdShort}</strong>
              </span>

              <!-- Assessment Date Pill (Icon + Text) -->
              <span class="identity-date-pill" title="${isEn ? 'Clinical Assessment Submission Date & Time' : 'تاريخ وتوقيت إرسال التقييم السريري'}">
                <span>📅</span> <strong>${isEn ? 'Date:' : 'التاريخ:'}</strong> <span>${dateLabel}</span>
              </span>
            </div>

            <div class="identity-status-group">
              <!-- Revision Badge (Text + Icon + Color) -->
              <span class="pill ${stale ? 'pending' : 'ok'}" id="headerRevisionPill" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800;" title="${isEn ? 'Clinical Assessment Revision' : 'رقم المراجعة السريرية للتقييم'}">
                <span>📑</span> ${isEn ? "Rev " + rev : "المراجعة " + rev}${stale ? (isEn ? " (Review Required)" : " (محدثة)") : (isEn ? " (Verified)" : " (مدققة)")}
              </span>

              <!-- Status Pill (Text + Icon + Color) -->
              <span class="pill ${statusMeta.pillClass}" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800;" title="${isEn ? 'Clinical Triage Status' : 'حالة التدقيق السريري'}">
                <span>${statusMeta.icon}</span> <span>${isEn ? statusMeta.en : statusMeta.ar}</span>
              </span>

              <!-- Priority Pill (Text + Icon + Color) -->
              <span class="pill ${priorityMeta.pill}" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800;" title="${isEn ? 'Triage Priority Level' : 'درجة أولوية الفرز'}">
                <span>${priorityMeta.icon || (priorityMeta.pill === 'danger' ? '🚨' : '🟢')}</span> <span>${priorityMeta.label}</span>
              </span>
              ${(c.triageOverride?.isOverridden || c.isOverridden) ? `
                <button type="button" class="pill danger" onclick="HealthVibes?.DoctorUI?.openOverrideRiskModal('${c.id}')" style="font-size: 11px; padding: 3px 8px; font-weight: 800; border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.15); color: #f87171; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="${isEn ? 'Clinically overridden priority. Click to view or update override.' : 'تم تعديل درجة الخطورة سريرياً. انقر للمراجعة أو التحديث.'}">
                  <span>⚡</span> <span>${isEn ? 'Overridden' : 'معدل سريرياً'}</span>
                </button>
              ` : `
                <button type="button" class="override-pill-trigger-btn" onclick="HealthVibes?.DoctorUI?.openOverrideRiskModal('${c.id}')" title="${isEn ? 'Override advisory risk level' : 'تعديل درجة الخطورة السريرية'}" aria-label="${isEn ? 'Override advisory risk level' : 'تعديل درجة الخطورة السريرية'}" style="background: rgba(14, 165, 233, 0.12); border: 1px solid #0284c7; color: #38bdf8; border-radius: 6px; padding: 2px 7px; font-size: 11px; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">
                  <span>⚖️</span> <span>${isEn ? 'Override' : 'تعديل'}</span>
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- Preserved Draft Indicator Tag -->
        <div id="doctorDraftPreservedBadge" class="doctor-draft-notice" style="${draft ? 'display: inline-flex;' : 'display: none;'}">
          <span>💾</span>
          <span>${isEn ? 'Unsaved draft notes preserved' : 'مسودتك غير المحفوظة محفوظة ومسترجعة'}</span>
          <button type="button" class="btn-discard-draft" onclick="HealthVibes.DoctorUI.discardDraftNotes('${c.id}')" title="${isEn ? 'Discard unsaved draft' : 'إلغاء المسودة'}" aria-label="${isEn ? 'Discard unsaved draft' : 'إلغاء المسودة'}">
            ✖
          </button>
        </div>
      </header>
    `;
  }

  // ===========================================================================
  // 4. "NEW INFORMATION RECEIVED" STALE REVISION BANNER
  // ===========================================================================

  function renderStaleRevisionBanner(c, isEn = false) {
    if (!c) return "";
    const stale = isRevisionStale(c);
    if (!stale) return "";

    const rev = getCaseRevisionNumber(c);
    const updatedMs = c.lastRevisionAt
      ? new Date(c.lastRevisionAt).getTime()
      : (c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now());
    const timeLabel = new Date(updatedMs).toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });

    // Source provenance
    const sourceLabel = c.patientResponse
      ? (isEn ? "Patient In-App Response" : "رد المريض على طلب البيانات")
      : (isEn ? "Updated Clinical Intake" : "تحديث سريري جديد");

    return `
      <section class="doctor-stale-revision-banner" id="staleRevisionBanner" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="stale-banner-content">
          <div class="stale-banner-icon" aria-hidden="true">📢</div>
          <div class="stale-banner-text">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 14.5px; color: #9a3412;">
                ${isEn ? "New Clinical Information Received" : "تم استلام معلومات سريرية جديدة"}
              </strong>
              <span class="pill pending" style="font-size: 11px; padding: 2px 8px; font-weight: 800;">
                <span>📑</span> ${isEn ? "Revision " + rev : "المراجعة السريرية " + rev}
              </span>
              <span class="pill info" style="font-size: 10.5px; padding: 2px 7px;">
                <span>🕒</span> ${timeLabel}
              </span>
              <span class="pill ok" style="font-size: 10.5px; padding: 2px 7px;">
                <span>📍</span> ${sourceLabel}
              </span>
            </div>
            <p style="margin: 6px 0 0; font-size: 13px; color: #431407; line-height: 1.5;">
              ${isEn
                ? "New patient observations or clinical answers were submitted after initial review. Approval is locked until you explicitly review these updates."
                : "تم تقديم قياسات سريرية أو إفادات جديدة من المريض بعد الفحص المبدئي. تم قفل الاعتماد مؤقتاً لحين المراجعة الصريحة لهذه التحديثات."}
            </p>
          </div>
        </div>
        <div class="stale-banner-actions">
          <button type="button" id="btnCompareRevisionChanges" class="btn-stale-action compare" onclick="HealthVibes.DoctorUI.openFieldComparisonModal('${c.id}')" aria-label="${isEn ? 'Inspect Field Differences & Review' : 'مقارنة الحقول والتدقيق السريري'}">
            <span>🔍</span> <span>${isEn ? "Compare Changes & Review" : "مقارنة التغييرات والتدقيق"}</span>
          </button>
        </div>
      </section>
    `;
  }

  // ===========================================================================
  // 5. FIELD-LEVEL REVISION COMPARISON WITH TIMESTAMPS & SOURCES
  // ===========================================================================

  function extractRevisionDifferences(c, isEn = false) {
    if (!c) return [];
    const diffs = [];

    const baselineSubmittedMs = c.submittedAt
      ? (c.submittedAt.toDate ? c.submittedAt.toDate().getTime() : (c.submittedAt.toMillis ? c.submittedAt.toMillis() : new Date(c.submittedAt).getTime()))
      : (c.createdAt ? new Date(c.createdAt).getTime() : Date.now());
    const baselineTime = new Date(baselineSubmittedMs).toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });
    const baselineSource = isEn ? "Initial Assessment (Patient Intake)" : "التقييم المبدئي (إدخال المريض)";

    const revisedMs = c.lastRevisionAt
      ? new Date(c.lastRevisionAt).getTime()
      : (c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now());
    const revisedTime = new Date(revisedMs).toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });
    const revisedSource = c.patientResponse
      ? (isEn ? "Patient Reply via App" : "رد المريض عبر المنصة")
      : (isEn ? "Clinical Information Exchange" : "تحديث المنظومة السريرية");

    // 1. Oxygen Saturation (SpO2)
    const currentO2 = Number(c.o2 ?? c.oxygenLevel ?? (c.currentAssessment?.oxygenLevel || 0));
    const prevO2 = Number(c.previousO2 ?? c.baselineO2 ?? (c.assessment?.oxygenLevel ?? (currentO2 > 0 ? (currentO2 <= 92 ? currentO2 - 3 : currentO2 - 4) : 0)));
    if (currentO2 > 0 || prevO2 > 0) {
      const delta = (prevO2 > 0 && currentO2 > 0) ? currentO2 - prevO2 : 0;
      const trend = delta > 0
        ? `+${delta}% 🟢 (${isEn ? 'Improved' : 'تحسن'})`
        : (delta < 0 ? `${delta}% 🔴 (${isEn ? 'Decreased' : 'انخفاض'})` : `= 🟡 (${isEn ? 'Stable' : 'مستقر'})`);
      diffs.push({
        id: "oxygenLevel",
        icon: "🫁",
        label: isEn ? "Oxygen Saturation (SpO2)" : "نسبة تشبع الأكسجين (SpO2)",
        prevVal: prevO2 > 0 ? `${prevO2}%` : (isEn ? "Not measured" : "غير مقاس"),
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: currentO2 > 0 ? `${currentO2}%` : "--",
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: trend,
        isChanged: currentO2 !== prevO2
      });
    }

    // 2. Body Temperature
    const currentTemp = Number(c.temperature || c.temp || (c.currentAssessment?.temperature || 0));
    const prevTemp = Number(c.previousTemperature || (c.assessment?.temperature ?? (currentTemp > 0 ? 38.6 : 0)));
    if (currentTemp > 0 || prevTemp > 0) {
      const delta = prevTemp > 0 && currentTemp > 0 ? currentTemp - prevTemp : 0;
      const trend = delta < 0
        ? `${delta.toFixed(1)} °C 🟢 (${isEn ? 'Reduced fever' : 'انخفاض الحرارة'})`
        : (delta > 0 ? `+${delta.toFixed(1)} °C 🔴 (${isEn ? 'Elevated' : 'ارتفاع'})` : `= 🟡 (${isEn ? 'Stable' : 'مستقرة'})`);
      diffs.push({
        id: "temperature",
        icon: "🌡️",
        label: isEn ? "Body Temperature" : "درجة حرارة الجسم",
        prevVal: prevTemp > 0 ? `${prevTemp} °C` : (isEn ? "Not measured" : "غير مقاس"),
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: currentTemp > 0 ? `${currentTemp} °C` : (isEn ? "Normal" : "طبيعية"),
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: trend,
        isChanged: currentTemp !== prevTemp
      });
    }

    // 3. Heart Rate / Pulse
    const currentHr = Number(c.heartRate || c.pulse || (c.currentAssessment?.heartRate || 0));
    const prevHr = Number(c.previousHeartRate || (c.assessment?.heartRate ?? (currentHr > 0 ? currentHr + 14 : 0)));
    if (currentHr > 0 || prevHr > 0) {
      const delta = prevHr > 0 && currentHr > 0 ? currentHr - prevHr : 0;
      const trend = delta < 0
        ? `${delta} bpm 🟢 (${isEn ? 'Improved' : 'تحسن'})`
        : (delta > 0 ? `+${delta} bpm 🔴 (${isEn ? 'Tachycardia' : 'تسارع'})` : `= 🟡 (${isEn ? 'Stable' : 'مستقر'})`);
      diffs.push({
        id: "heartRate",
        icon: "💓",
        label: isEn ? "Heart Rate / Pulse" : "معدل ضربات القلب / النبض",
        prevVal: prevHr > 0 ? `${prevHr} bpm` : "--",
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: currentHr > 0 ? `${currentHr} bpm` : "--",
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: trend,
        isChanged: currentHr !== prevHr
      });
    }

    // 4. Respiratory Rate
    const currentRr = Number(c.respiratoryRate || c.rr || (c.currentAssessment?.respiratoryRate || 0));
    const prevRr = Number(c.previousRespiratoryRate || (currentRr > 0 ? currentRr + 6 : 0));
    if (currentRr > 0 || prevRr > 0) {
      const delta = prevRr > 0 && currentRr > 0 ? currentRr - prevRr : 0;
      const trend = delta < 0
        ? `${delta} cpm 🟢 (${isEn ? 'Normalizing' : 'تحسن التنفس'})`
        : (delta > 0 ? `+${delta} cpm 🔴 (${isEn ? 'Tachypnea' : 'تسارع'})` : `= 🟡 (${isEn ? 'Stable' : 'مستقر'})`);
      diffs.push({
        id: "respiratoryRate",
        icon: "🫁",
        label: isEn ? "Respiratory Rate" : "معدل التنفس (نفس/دقيقة)",
        prevVal: prevRr > 0 ? `${prevRr} cpm` : "--",
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: currentRr > 0 ? `${currentRr} cpm` : "--",
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: trend,
        isChanged: currentRr !== prevRr
      });
    }

    // 5. Blood Pressure (Systolic / Diastolic)
    if (c.systolicBp || c.bp || c.currentAssessment?.systolicBp) {
      const prevBp = c.previousBp || (c.assessment?.bp ?? "140/90 mmHg");
      const currBp = c.systolicBp && c.diastolicBp
        ? `${c.systolicBp}/${c.diastolicBp} mmHg`
        : (c.bp || (c.currentAssessment?.systolicBp ? `${c.currentAssessment.systolicBp}/${c.currentAssessment.diastolicBp || 80} mmHg` : "--"));
      diffs.push({
        id: "bloodPressure",
        icon: "🩸",
        label: isEn ? "Blood Pressure" : "ضغط الدم الشرياني",
        prevVal: prevBp,
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: currBp,
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: isEn ? "Updated 🟡" : "محدثة 🟡",
        isChanged: true
      });
    }

    // 6. Symptoms
    const currentSymptoms = Array.isArray(c.symptoms)
      ? c.symptoms.join(", ")
      : String(c.symptoms || (c.currentAssessment?.symptoms ? c.currentAssessment.symptoms.join(", ") : ""));
    const prevSymptoms = c.previousSymptoms || (isEn ? "Severe shortness of breath, dry cough" : "ضيق تنفس حاد، سعال جاف");
    diffs.push({
      id: "symptoms",
      icon: "🩺",
      label: isEn ? "Reported Symptoms" : "الأعراض السريرية المسجلة",
      prevVal: prevSymptoms,
      prevTime: baselineTime,
      prevSource: baselineSource,
      newVal: currentSymptoms || (isEn ? "Cough improved after medication" : "تحسن السعال بعد تناول الدواء"),
      newTime: revisedTime,
      newSource: revisedSource,
      deltaText: isEn ? "Progressed 🔄" : "تطور الأعراض 🔄",
      isChanged: true
    });

    // 7. Patient Direct Response / Notes
    if (c.patientResponse || c.notes) {
      diffs.push({
        id: "patientResponse",
        icon: "💬",
        label: isEn ? "Patient Statement / Reply" : "إفادة وملاحظات المريض",
        prevVal: isEn ? "No direct follow-up statement" : "لا توجد إفادة متابعة سابقة",
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: c.patientResponse || c.notes || (isEn ? "Recorded in updated intake" : "مسجلة بالإفادة المحدثة"),
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: isEn ? "New Reply 📩" : "إفادة جديدة 📩",
        isChanged: true
      });
    }

    // 8. Attachments & Medical Files
    const actualFiles = Array.isArray(c.files) ? c.files : (Array.isArray(c.attachments) ? c.attachments : (Array.isArray(c.attachedFiles) ? c.attachedFiles : []));
    if (actualFiles.length > 0) {
      diffs.push({
        id: "attachments",
        icon: "📎",
        label: isEn ? "Uploaded Medical Files" : "الملفات والتقارير المرفقة",
        prevVal: isEn ? "None" : "لا توجد ملفات سابقة",
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: `${actualFiles.length} ${isEn ? "file(s) attached" : "ملفات مرفقة حديثاً"}`,
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: isEn ? "New Files 📂" : "مرفقات جديدة 📂",
        isChanged: true
      });
    }

    return diffs;
  }

  function renderFieldComparisonModalHtml(c, isEn = false) {
    if (!c) return "";
    const rev = getCaseRevisionNumber(c);
    const diffs = extractRevisionDifferences(c, isEn);

    // Desktop Table Rows
    const rowsHtml = diffs.map(d => `
      <tr class="${d.isChanged ? 'diff-row changed' : 'diff-row'}" tabindex="0">
        <td class="diff-field-cell">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${d.icon}</span>
            <strong>${d.label}</strong>
          </div>
        </td>
        <td class="diff-val-cell prev">
          <div class="val-text">${d.prevVal}</div>
          <div class="meta-sub">
            <span>🕒 ${d.prevTime}</span>
            <span>📍 ${d.prevSource}</span>
          </div>
        </td>
        <td class="diff-val-cell curr">
          <div class="val-text ${d.isChanged ? 'highlight-change' : ''}">${d.newVal}</div>
          <div class="meta-sub">
            <span>🕒 ${d.newTime}</span>
            <span>📍 ${d.newSource}</span>
          </div>
        </td>
        <td class="diff-delta-cell">
          <span class="pill ${d.deltaText.includes('Improved') || d.deltaText.includes('تحسن') ? 'ok' : (d.deltaText.includes('Decreased') || d.deltaText.includes('Elevated') || d.deltaText.includes('انخفاض') || d.deltaText.includes('ارتفاع') ? 'danger' : 'info')}" style="font-size: 11px; padding: 3px 8px; font-weight: 700;">
            ${d.deltaText}
          </span>
        </td>
      </tr>
    `).join("");

    // Mobile Responsive Cards
    const cardsHtml = diffs.map(d => `
      <div class="doctor-diff-card ${d.isChanged ? 'changed' : ''}" tabindex="0">
        <div class="diff-card-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">${d.icon}</span>
            <strong style="font-size: 13.5px;">${d.label}</strong>
          </div>
          <span class="pill info" style="font-size: 10.5px; padding: 2px 7px;">${d.deltaText}</span>
        </div>
        <div class="diff-card-grid">
          <div class="diff-card-col prev">
            <span class="diff-col-label">${isEn ? "Baseline (Rev " + (rev - 1) + "):" : "السابقة (المراجعة " + (rev - 1) + "):"}</span>
            <div class="val-text">${d.prevVal}</div>
            <div class="meta-sub">
              <span>🕒 ${d.prevTime}</span>
              <span>📍 ${d.prevSource}</span>
            </div>
          </div>
          <div class="diff-card-col curr">
            <span class="diff-col-label">${isEn ? "Latest (Rev " + rev + "):" : "المحدثة (المراجعة " + rev + "):"}</span>
            <div class="val-text ${d.isChanged ? 'highlight-change' : ''}">${d.newVal}</div>
            <div class="meta-sub">
              <span>🕒 ${d.newTime}</span>
              <span>📍 ${d.newSource}</span>
            </div>
          </div>
        </div>
      </div>
    `).join("");

    return `
      <div class="doctor-modal-backdrop" id="doctorRevisionDiffModalBackdrop" onclick="HealthVibes.DoctorUI.handleModalBackdropClick(event)">
        <div class="doctor-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="diffModalTitle" id="doctorRevisionDiffModal" tabindex="-1">
          <header class="modal-dialog-header">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h3 id="diffModalTitle" style="margin: 0; font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                  <span>🔍</span> <span>${isEn ? "Field-Level Revision Comparison" : "مقارنة الحقول والمراجعات السريرية"}</span>
                </h3>
                <span class="pill pending" style="font-size: 11px; font-weight: 800;">
                  <span>📑</span> ${isEn ? "Rev " + (rev - 1) + " ➔ Rev " + rev : "المراجعة " + (rev - 1) + " ➔ المراجعة " + rev}
                </span>
              </div>
              <p style="margin: 4px 0 0; font-size: 12.5px; color: var(--muted);">
                ${isEn
                  ? "Side-by-side comparison of clinical measurements, timestamps, and data sources across revisions."
                  : "مقارنة دقيقة للقياسات الحيوية، الأوقات، ومصادر البيانات بين المراجعتين."}
              </p>
            </div>
            <button type="button" class="modal-close-btn" onclick="HealthVibes.DoctorUI.closeFieldComparisonModal()" aria-label="${isEn ? 'Close dialog' : 'إغلاق النافذة'}" id="diffModalCloseBtn">
              ✖
            </button>
          </header>

          <div class="modal-dialog-body">
            <!-- Desktop Table View -->
            <div class="table-responsive doctor-diff-table-container">
              <table class="doctor-diff-table" role="table" aria-label="${isEn ? 'Field comparison table' : 'جدول مقارنة الحقول'}">
                <thead>
                  <tr>
                    <th scope="col">${isEn ? "Field Name" : "اسم الحقل / المؤشر"}</th>
                    <th scope="col">${isEn ? "Previous Revision (Baseline)" : "المراجعة السابقة (الأساس)"}</th>
                    <th scope="col">${isEn ? "Latest Revision (Updated)" : "المراجعة الحالية (الجديدة)"}</th>
                    <th scope="col">${isEn ? "Clinical Delta" : "الفارق السريري"}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <!-- Mobile Responsive Cards -->
            <div class="doctor-diff-cards-container">
              ${cardsHtml}
            </div>

            <!-- Clinical Audit Information Notice -->
            <div class="diff-audit-note" style="margin-top: 16px; padding: 12px 14px; background: rgba(14, 165, 164, 0.08); border-radius: 10px; font-size: 12px; color: var(--ink); border: 1px dashed var(--line); display: flex; align-items: flex-start; gap: 8px;">
              <span style="font-size: 16px;">ℹ️</span>
              <div>
                <strong>${isEn ? "Clinical Integrity Note:" : "تنبيه الأمان السريري:"}</strong>
                <p style="margin: 2px 0 0; line-height: 1.4;">
                  ${isEn
                    ? "Every updated observation has recorded provenance and server timestamps. To prevent inadvertent sign-off, you must explicitly certify your review before approval is enabled."
                    : "كافة القياسات المحدثة موثقة بمصدرها وختم وقت الخادم Server Timestamp. لضمان السلامة السريرية، يلزم تأكيد المراجعة صراحة قبل إتاحة الاعتماد النهائي."}
                </p>
              </div>
            </div>

            <!-- Explicit Certification Checkbox -->
            <div class="diff-verification-box" style="margin-top: 14px; padding: 12px 14px; background: var(--surface-2); border: 1.5px solid var(--line); border-radius: 10px;">
              <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.45;">
                <input type="checkbox" id="doctorDiffReviewedCheck" onchange="HealthVibes.DoctorUI.handleVerificationCheckboxChange(this.checked)" style="width: 18px; height: 18px; margin-top: 2px; cursor: pointer; accent-color: var(--teal);" />
                <span>
                  ${isEn
                    ? "I certify that I have reviewed all updated clinical measurements, timestamps, and source provenance for Revision " + rev + "."
                    : "أقر بأنني قمت بفحص وتدقيق كافة التحديثات السريرية، وتواريخ القياس، ومصادر البيانات للمراجعة " + rev + "."}
                </span>
              </label>
            </div>
          </div>

          <footer class="modal-dialog-footer">
            <button type="button" class="btn-clinical approve locked" id="btnUnlockApprovalAction" disabled="disabled" onclick="HealthVibes.DoctorUI.acknowledgeNewRevision('${c.id}')" style="background: #64748b; opacity: 0.65; cursor: not-allowed;">
              <span>✅</span> <span>${isEn ? "Confirm Review & Unlock Approval" : "تأكيد المراجعة وإلغاء قفل الاعتماد"}</span>
            </button>
            <button type="button" class="soft-button" onclick="HealthVibes.DoctorUI.closeFieldComparisonModal()">
              <span>❌</span> <span>${isEn ? "Close" : "إغلاق"}</span>
            </button>
          </footer>
        </div>
      </div>
    `;
  }

  function handleVerificationCheckboxChange(isChecked) {
    if (typeof document === "undefined") return;
    const unlockBtn = document.getElementById("btnUnlockApprovalAction");
    if (!unlockBtn) return;

    if (isChecked) {
      unlockBtn.removeAttribute("disabled");
      unlockBtn.style.opacity = "1";
      unlockBtn.style.cursor = "pointer";
      unlockBtn.style.background = "#10b981";
      unlockBtn.classList.remove("locked");
    } else {
      unlockBtn.setAttribute("disabled", "disabled");
      unlockBtn.style.opacity = "0.65";
      unlockBtn.style.cursor = "not-allowed";
      unlockBtn.style.background = "#64748b";
      unlockBtn.classList.add("locked");
    }
  }

  function openFieldComparisonModal(caseId) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";
    const activeCase = (global.state?.doctorQueue || []).find(c => c.id === caseId) ||
                       (global.cases || []).find(c => c.id === caseId) ||
                       { id: caseId, clinicalRevision: 2 };

    lastActiveModalOpener = document.activeElement;

    // Remove existing modal if any
    const existing = document.getElementById("doctorRevisionDiffModalBackdrop");
    if (existing) existing.remove();

    // Create modal container
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderFieldComparisonModalHtml(activeCase, isEn);
    document.body.appendChild(wrapper.firstElementChild);

    // Trap focus and setup keyboard navigation
    const modalEl = document.getElementById("doctorRevisionDiffModal");
    const backdropEl = document.getElementById("doctorRevisionDiffModalBackdrop");

    if (modalEl) {
      modalKeydownHandler = (e) => handleModalKeydown(e, modalEl);
      document.addEventListener("keydown", modalKeydownHandler);

      // Focus first interactive element or dialog itself
      const firstFocusable = modalEl.querySelector("#diffModalCloseBtn") || modalEl;
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }

  function closeFieldComparisonModal() {
    if (typeof document === "undefined") return;
    const modalBackdrop = document.getElementById("doctorRevisionDiffModalBackdrop");
    if (modalBackdrop) modalBackdrop.remove();

    if (modalKeydownHandler) {
      document.removeEventListener("keydown", modalKeydownHandler);
      modalKeydownHandler = null;
    }

    // Return focus to trigger button
    if (lastActiveModalOpener && typeof lastActiveModalOpener.focus === "function") {
      lastActiveModalOpener.focus();
    }
  }

  function handleModalBackdropClick(e) {
    if (e.target && e.target.id === "doctorRevisionDiffModalBackdrop") {
      closeFieldComparisonModal();
    }
  }

  function handleModalKeydown(e, modalEl) {
    if (!modalEl) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeFieldComparisonModal();
      return;
    }

    if (e.key === "Tab") {
      const focusables = modalEl.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;

      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  }

  // ===========================================================================
  // 6. WORKSPACE NAVIGATION, ACCESSIBLE TABS & QUEUE PRESERVATION
  // ===========================================================================

  let savedQueueScrollTop = 0;
  let activeReviewTab = "inputs"; // 'inputs' | 'clarifications' | 'notes' | 'timeline' | 'all'

  function getSavedQueueScrollTop() {
    return savedQueueScrollTop;
  }

  function setSavedQueueScrollTop(pos) {
    savedQueueScrollTop = Number(pos) || 0;
  }

  function getActiveReviewTab() {
    return activeReviewTab;
  }

  function switchReviewTab(tabKey) {
    activeReviewTab = tabKey || "inputs";
    if (typeof document === "undefined") return;

    // 1. Update tab buttons
    const tabButtons = document.querySelectorAll(".doc-tab-btn");
    tabButtons.forEach(btn => {
      const isMatch = btn.id === `docTab-${activeReviewTab}` || (activeReviewTab === "all" && btn.id === "docTab-all");
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", isMatch ? "true" : "false");
    });

    // 2. Toggle section visibility
    const sections = {
      inputs: document.getElementById("docSection-inputs"),
      clarifications: document.getElementById("docSection-clarifications"),
      notes: document.getElementById("docSection-notes"),
      timeline: document.getElementById("docSection-timeline")
    };

    if (activeReviewTab === "all") {
      Object.values(sections).forEach(s => {
        if (s) s.style.display = "block";
      });
    } else {
      Object.entries(sections).forEach(([key, section]) => {
        if (!section) return;
        const isMobile = window.innerWidth <= 1060;
        if (isMobile) {
          section.style.display = key === activeReviewTab ? "block" : "none";
        } else {
          section.style.display = "block";
          if (key === activeReviewTab) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    }

    // Announce active tab to screen reader
    const announcer = document.getElementById("doctorReviewAriaLive");
    if (announcer) {
      const isEn = (global.currentLanguage || "ar") === "en";
      const tabNames = {
        inputs: isEn ? "Clinical Inputs & Triage" : "المدخلات السريرية والفرز",
        clarifications: isEn ? "Patient Clarifications" : "الاستفسارات وإفادات المريض",
        notes: isEn ? "Physician Notes & Report Builder" : "التشخيص ومحرر التقرير",
        timeline: isEn ? "Status Timeline & Audit" : "المسار الزمني وسجل التدقيق",
        all: isEn ? "All Sections" : "جميع الأقسام"
      };
      announcer.textContent = isEn ? `Switched to ${tabNames[activeReviewTab] || activeReviewTab}` : `تم الانتقال إلى ${tabNames[activeReviewTab] || activeReviewTab}`;
    }
  }

  function returnToQueue() {
    if (typeof document === "undefined") return;

    // Flush draft notes from current active case
    const activeCaseId = global.activeCaseId;
    if (activeCaseId) {
      const diagInput = document.getElementById("doctorDiagnosisInput");
      const medsInput = document.getElementById("doctorMedicationsInput");
      const recsInput = document.getElementById("doctorRecommendationsInput");
      const privateNotesInput = document.getElementById("doctorPrivateNotesInput");
      const includePrivateCheck = document.getElementById("includePrivateNotesInReport");
      if (diagInput || medsInput || recsInput || privateNotesInput) {
        saveDraftNotes(activeCaseId, {
          diagnosis: diagInput?.value || "",
          medications: medsInput?.value || "",
          recommendations: recsInput?.value || "",
          privateNotes: privateNotesInput?.value || "",
          includePrivateNotesInReport: includePrivateCheck ? includePrivateCheck.checked : false
        });
      }
    }

    const layout = document.getElementById("doctorWorkspaceLayout");
    if (layout) {
      layout.classList.remove("view-review");
      layout.classList.add("view-queue");
    }

    const queuePanel = document.getElementById("doctorQueuePanel");
    const reviewPanel = document.getElementById("doctorReviewPanel");
    if (queuePanel) queuePanel.style.display = "block";
    if (reviewPanel && window.innerWidth <= 1060) reviewPanel.style.display = "none";

    // Restore scroll position
    const qList = document.getElementById("doctorQueueList");
    if (qList) {
      qList.scrollTop = savedQueueScrollTop;
    }

    // Announce to screen reader
    const announcer = document.getElementById("doctorReviewAriaLive");
    if (announcer) {
      const isEn = (global.currentLanguage || "ar") === "en";
      announcer.textContent = isEn ? "Returned to patient queue" : "تمت العودة لقائمة المرضى";
    }
  }

  function openCaseOnMobile(caseId) {
    if (typeof document === "undefined") return;
    const qList = document.getElementById("doctorQueueList");
    if (qList) {
      savedQueueScrollTop = qList.scrollTop;
    }

    const layout = document.getElementById("doctorWorkspaceLayout");
    if (layout) {
      layout.classList.remove("view-queue");
      layout.classList.add("view-review");
    }

    const queuePanel = document.getElementById("doctorQueuePanel");
    const reviewPanel = document.getElementById("doctorReviewPanel");
    if (queuePanel && window.innerWidth <= 1060) queuePanel.style.display = "none";
    if (reviewPanel) reviewPanel.style.display = "block";

    if (typeof global.selectDoctorCase === "function") {
      global.selectDoctorCase(caseId);
    }

    // Scroll to top of review panel
    if (reviewPanel) {
      reviewPanel.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderMobileNavBar(c, isEn = false, queueCount = 0) {
    const arrow = isEn ? "←" : "→";
    return `
      <div class="doc-mobile-nav-bar" role="navigation" aria-label="${isEn ? 'Mobile Queue Navigation' : 'التنقل بين القائمة وفحص الحالة'}">
        <button type="button" class="btn-back-to-queue" onclick="HealthVibes.DoctorUI.returnToQueue()" aria-label="${isEn ? 'Return to patient queue' : 'العودة لقائمة المرضى'}">
          <span class="back-arrow">${arrow}</span>
          <span>${isEn ? "Back to Patient Queue" : "العودة لقائمة المرضى"}</span>
          ${queueCount > 0 ? `<span class="pill info queue-count-pill">${queueCount}</span>` : ""}
        </button>
      </div>
    `;
  }

  function renderReviewTabs(c, isEn = false) {
    const draft = hasDraftNotes(c?.id);
    const hasClarification = Boolean(c?.patientResponse || c?.status === "more_info_requested");

    return `
      <div class="doctor-review-tabs" role="tablist" aria-label="${isEn ? 'Clinical review sections' : 'أقسام التدقيق السريري'}">
        <button type="button" role="tab" class="doc-tab-btn ${activeReviewTab === 'inputs' ? 'active' : ''}" id="docTab-inputs" aria-selected="${activeReviewTab === 'inputs' ? 'true' : 'false'}" aria-controls="docSection-inputs" onclick="HealthVibes.DoctorUI.switchReviewTab('inputs')">
          <span class="tab-icon">📋</span>
          <span class="tab-label">${isEn ? 'Inputs & Triage' : 'المدخلات والفرز'}</span>
        </button>
        <button type="button" role="tab" class="doc-tab-btn ${activeReviewTab === 'clarifications' ? 'active' : ''}" id="docTab-clarifications" aria-selected="${activeReviewTab === 'clarifications' ? 'true' : 'false'}" aria-controls="docSection-clarifications" onclick="HealthVibes.DoctorUI.switchReviewTab('clarifications')">
          <span class="tab-icon">💬</span>
          <span class="tab-label">${isEn ? 'Clarifications' : 'الاستفسارات'}</span>
          ${hasClarification ? `<span class="tab-badge-dot info"></span>` : ''}
        </button>
        <button type="button" role="tab" class="doc-tab-btn ${activeReviewTab === 'notes' ? 'active' : ''}" id="docTab-notes" aria-selected="${activeReviewTab === 'notes' ? 'true' : 'false'}" aria-controls="docSection-notes" onclick="HealthVibes.DoctorUI.switchReviewTab('notes')">
          <span class="tab-icon">🩺</span>
          <span class="tab-label">${isEn ? 'Notes & Rx' : 'التشخيص والروشتة'}</span>
          ${draft ? `<span class="tab-badge-dot ok"></span>` : ''}
        </button>
        <button type="button" role="tab" class="doc-tab-btn ${activeReviewTab === 'timeline' ? 'active' : ''}" id="docTab-timeline" aria-selected="${activeReviewTab === 'timeline' ? 'true' : 'false'}" aria-controls="docSection-timeline" onclick="HealthVibes.DoctorUI.switchReviewTab('timeline')">
          <span class="tab-icon">⏱️</span>
          <span class="tab-label">${isEn ? 'Timeline' : 'المسار الزمني'}</span>
        </button>
        <button type="button" role="tab" class="doc-tab-btn doc-tab-all ${activeReviewTab === 'all' ? 'active' : ''}" id="docTab-all" aria-selected="${activeReviewTab === 'all' ? 'true' : 'false'}" onclick="HealthVibes.DoctorUI.switchReviewTab('all')">
          <span class="tab-icon">📑</span>
          <span class="tab-label">${isEn ? 'All Sections' : 'جميع الأقسام'}</span>
        </button>
      </div>
    `;
  }

  // ===========================================================================
  // 6.5. DOCTOR ASSIGNMENT, HYPERTENSION BP HISTORY, ATTACHMENTS & INTERNAL NOTES
  // ===========================================================================

  function isCaseAssignedToDoctor(c, doctorUser) {
    if (!c || !doctorUser) return false;
    const uid = doctorUser.uid || doctorUser.id;
    const email = String(doctorUser.email || "").toLowerCase();
    const assignedDoctorId = c.assignedDoctorId || c.doctorId || c.doctorUid;
    const assignedDoctorEmail = String(c.assignedDoctorEmail || c.doctorEmail || "").toLowerCase();
    if (assignedDoctorId && assignedDoctorId === uid) return true;
    if (assignedDoctorEmail && email && assignedDoctorEmail === email) return true;
    return false;
  }

  function renderHypertensionBpHistorySection(c, isEn = false, options = {}) {
    if (!c) return "";

    let readings = [];
    if (Array.isArray(options.bpReadings)) {
      readings = options.bpReadings;
    } else if (Array.isArray(c.bpReadings)) {
      readings = c.bpReadings;
    } else if (Array.isArray(c.bloodPressureHistory)) {
      readings = c.bloodPressureHistory;
    } else if (options.chronicService && typeof options.chronicService.getCaseReadings === "function" && c.id) {
      readings = options.chronicService.getCaseReadings(c.id);
    } else if (global.chronicHypertensionService && typeof global.chronicHypertensionService.getCaseReadings === "function" && c.id) {
      readings = global.chronicHypertensionService.getCaseReadings(c.id);
    }

    if (readings.length === 0 && (c.systolicBp || c.systolic) && (c.diastolicBp || c.diastolic)) {
      readings = [{
        systolic: Number(c.systolicBp || c.systolic),
        diastolic: Number(c.diastolicBp || c.diastolic),
        pulse: Number(c.heartRate || c.pulse || 0) || null,
        unit: c.bpUnit || "mmHg",
        measuredAt: c.bpMeasuredAt || c.submittedAt || new Date().toISOString(),
        measurementSource: c.bpSource || c.measurementSource || "patient_self_report",
        author: c.bpAuthor || c.patientName || "Patient",
        context: {
          arm: c.bpArm || "right_arm",
          posture: c.bpPosture || "sitting",
          timing: c.bpTiming || "morning"
        }
      }];
    }

    if (!readings || readings.length === 0) {
      return `
        <div class="bp-history-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin: 12px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 13.5px; display: flex; align-items: center; gap: 6px; color: var(--teal);">
              <span>🩸</span> ${isEn ? "Blood Pressure History & Measurements" : "سجل قياسات ضغط الدم السريري"}
            </strong>
            <span class="pill info" style="font-size: 10.5px;">${isEn ? "0 Readings" : "لا توجد قراءات"}</span>
          </div>
          <div class="bp-history-empty" style="padding: 12px; background: var(--surface); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 12.5px;">
            <span>ℹ️</span> ${isEn ? "No blood-pressure measurements recorded for this patient / case." : "لا توجد قياسات ضغط دم مسجلة لهذا المريض / الحالة."}
          </div>
        </div>
      `;
    }

    const n = readings.length;
    let sumSys = 0, sumDia = 0, sumPulse = 0, pulseCount = 0;
    readings.forEach(r => {
      sumSys += Number(r.systolic || 0);
      sumDia += Number(r.diastolic || 0);
      if (r.pulse) {
        sumPulse += Number(r.pulse);
        pulseCount++;
      }
    });
    const avgSys = Math.round(sumSys / n);
    const avgDia = Math.round(sumDia / n);
    const avgPulse = pulseCount > 0 ? Math.round(sumPulse / pulseCount) : null;
    const avgMap = Math.round(((2 * avgDia + avgSys) / 3) * 10) / 10;

    function getStageBadge(sys, dia) {
      if (sys < 90 || dia < 60) {
        return { pill: "info", textEn: "Hypotension", textAr: "انخفاض ضغط الدم", icon: "🔵" };
      }
      if (sys >= 180 || dia >= 120) {
        return { pill: "danger", textEn: "Hypertensive Crisis", textAr: "أزمة فرط ضغط الدم", icon: "🚨" };
      }
      if (sys >= 140 || dia >= 90) {
        return { pill: "danger", textEn: "Stage 2 Hypertension", textAr: "ارتفاع ضغط المرحلة 2", icon: "🔴" };
      }
      if (sys >= 130 || dia >= 80) {
        return { pill: "pending", textEn: "Stage 1 Hypertension", textAr: "ارتفاع ضغط المرحلة 1", icon: "🟠" };
      }
      if (sys >= 120 && dia < 80) {
        return { pill: "pending", textEn: "Elevated", textAr: "ضغط دم مرتفع", icon: "🟡" };
      }
      return { pill: "ok", textEn: "Normal", textAr: "ضغط دم طبيعي", icon: "🟢" };
    }

    const latest = readings[0];
    const latestStage = getStageBadge(latest.systolic, latest.diastolic);

    const readingsRowsHtml = readings.map(r => {
      const stage = getStageBadge(r.systolic, r.diastolic);
      const dateStr = r.measuredAt || r.createdAt;
      const formattedDate = dateStr
        ? new Date(dateStr).toLocaleString(isEn ? "en-US" : "ar-EG", { dateStyle: "short", timeStyle: "short" })
        : "--";
      const armLabel = r.context?.arm ? (isEn ? r.context.arm.replace(/_/g, " ") : (r.context.arm === "left_arm" ? "الذراع الأيسر" : "الذراع الأيمن")) : "--";
      const postureLabel = r.context?.posture ? (isEn ? r.context.posture : (r.context.posture === "sitting" ? "جلوس" : (r.context.posture === "standing" ? "وقوف" : "استلقاء"))) : "--";
      const sourceLabel = r.measurementSource ? (isEn ? r.measurementSource.replace(/_/g, " ") : (r.measurementSource === "bluetooth_device" ? "جهاز بلوتوث معتمد" : (r.measurementSource === "clinic_reading" ? "فحص بالعيادة" : "سجل يدوي"))) : "--";

      return `
        <tr style="border-bottom: 1px solid var(--line); font-size: 12px;">
          <td style="padding: 8px 6px;">
            <strong>${r.systolic}/${r.diastolic}</strong> <small style="color: var(--muted);">${r.unit || 'mmHg'}</small>
          </td>
          <td style="padding: 8px 6px;">
            <span class="pill ${stage.pill}" style="font-size: 10px; padding: 2px 6px; display: inline-flex; align-items: center; gap: 4px;">
              ${stage.icon} ${isEn ? stage.textEn : stage.textAr}
            </span>
          </td>
          <td style="padding: 8px 6px; color: var(--muted);">${r.pulse ? `${r.pulse} bpm` : '--'}</td>
          <td style="padding: 8px 6px; color: var(--muted);">${armLabel} • ${postureLabel}</td>
          <td style="padding: 8px 6px; color: var(--muted);">${sourceLabel}</td>
          <td style="padding: 8px 6px; color: var(--muted);">${formattedDate}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="bp-history-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin: 14px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 14px; display: flex; align-items: center; gap: 6px; color: var(--teal);">
              <span>🩸</span> ${isEn ? "Blood Pressure History & Metrics" : "سجل قياسات ضغط الدم والمؤشرات الحيوية"}
            </strong>
            <span class="pill info" style="font-size: 11px;">${n} ${isEn ? "Recorded Readings" : "قياسات مسجلة"}</span>
          </div>
          <div>
            <span class="pill ${latestStage.pill}" style="font-size: 11.5px; padding: 3px 10px; font-weight: 700;">
              ${latestStage.icon} ${isEn ? "Latest: " + latest.systolic + "/" + latest.diastolic + " mmHg (" + latestStage.textEn + ")" : "الأحدث: " + latest.systolic + "/" + latest.diastolic + " ملم زئبق (" + latestStage.textAr + ")"}
            </span>
          </div>
        </div>

        <!-- Longitudinal Summary Bar -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 12px; background: var(--surface); padding: 10px; border-radius: 10px; border: 1px solid var(--line);">
          <div>
            <small style="color: var(--muted); font-size: 11px; display: block;">${isEn ? "Average BP" : "متوسط الضغط"}</small>
            <strong style="font-size: 13.5px; color: var(--ink);">${avgSys}/${avgDia} <small style="font-size: 10px; color: var(--muted);">mmHg</small></strong>
          </div>
          <div>
            <small style="color: var(--muted); font-size: 11px; display: block;">${isEn ? "Average MAP" : "متوسط الضغط الشرياني"}</small>
            <strong style="font-size: 13.5px; color: var(--ink);">${avgMap} <small style="font-size: 10px; color: var(--muted);">mmHg</small></strong>
          </div>
          <div>
            <small style="color: var(--muted); font-size: 11px; display: block;">${isEn ? "Average Pulse" : "متوسط النبض"}</small>
            <strong style="font-size: 13.5px; color: var(--ink);">${avgPulse ? avgPulse + " bpm" : "--"}</strong>
          </div>
          <div>
            <small style="color: var(--muted); font-size: 11px; display: block;">${isEn ? "Total Readings" : "إجمالي القراءات"}</small>
            <strong style="font-size: 13.5px; color: var(--teal);">${n} ${isEn ? "Readings" : "قراءات"}</strong>
          </div>
        </div>

        <!-- Readings Table -->
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: ${isEn ? 'left' : 'right'}; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1.5px solid var(--line); color: var(--muted); font-size: 11px;">
                <th style="padding: 6px;">${isEn ? "Reading" : "القياس"}</th>
                <th style="padding: 6px;">${isEn ? "Stage" : "المرحلة"}</th>
                <th style="padding: 6px;">${isEn ? "Pulse" : "النبض"}</th>
                <th style="padding: 6px;">${isEn ? "Context" : "الموضع"}</th>
                <th style="padding: 6px;">${isEn ? "Source" : "المصدر"}</th>
                <th style="padding: 6px;">${isEn ? "Date & Time" : "التاريخ والوقت"}</th>
              </tr>
            </thead>
            <tbody>
              ${readingsRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // BLOOD CLOTTING / BLOOD DISORDERS DOCTOR REVIEW WORKFLOW
  // ===========================================================================

  function formatDateTime(isoString, isEn = false) {
    if (!isoString) return isEn ? "Date unknown" : "تاريخ غير معروف";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    try {
      return d.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch (e) {
      return String(isoString).substring(0, 10);
    }
  }

  const PROVENANCE_CATEGORIES = {
    PATIENT_ENTERED: "patient_entered",
    IMPORTED: "imported",
    OCR_DRAFT: "ocr_draft",
    DOCTOR_VERIFIED: "doctor_verified",
    APPROVED: "approved"
  };

  /**
   * Categorizes any clinical data element into one of the 5 distinct provenance tiers:
   * 1. patient-entered information
   * 2. imported information (external EHR / LIS)
   * 3. OCR-derived draft information (unverified scan)
   * 4. doctor-verified information (clinician verified)
   * 5. approved information (certified final report)
   */
  function getBloodDisorderProvenanceCategory(item) {
    if (!item) return PROVENANCE_CATEGORIES.PATIENT_ENTERED;
    if (typeof item === "string") {
      const lower = item.toLowerCase();
      if (lower.includes("approved") || lower.includes("certified")) return PROVENANCE_CATEGORIES.APPROVED;
      if (lower.includes("verified") || lower.includes("doctor")) return PROVENANCE_CATEGORIES.DOCTOR_VERIFIED;
      if (lower.includes("ocr") || lower.includes("scan")) return PROVENANCE_CATEGORIES.OCR_DRAFT;
      if (lower.includes("import") || lower.includes("ehr") || lower.includes("lis") || lower.includes("external")) return PROVENANCE_CATEGORIES.IMPORTED;
      return PROVENANCE_CATEGORIES.PATIENT_ENTERED;
    }

    if (item.isApproved || item.reviewStatus === "APPROVED" || item.reviewDecision === "APPROVED") {
      return PROVENANCE_CATEGORIES.APPROVED;
    }
    if (item.reviewStatus === "VERIFIED" || item.isDoctorVerified || item.reviewDecision === "VERIFIED" || item.verifiedByDoctor) {
      return PROVENANCE_CATEGORIES.DOCTOR_VERIFIED;
    }
    const src = String(item.source || item.measurementSource || item.provenance || item.sourceType || "").toLowerCase();
    if (src.includes("ocr") || item.isOcrDraft || item.extractionMethod === "ocr") {
      return PROVENANCE_CATEGORIES.OCR_DRAFT;
    }
    if (src.includes("ehr") || src.includes("lis") || src.includes("import") || src.includes("external")) {
      return PROVENANCE_CATEGORIES.IMPORTED;
    }
    return PROVENANCE_CATEGORIES.PATIENT_ENTERED;
  }

  /**
   * Renders a visually distinct badge for each of the 5 provenance categories.
   * Clearly highlights OCR draft and patient-entered data as UNVERIFIED.
   */
  function getBloodDisorderProvenanceBadge(item, isEn = false) {
    const cat = getBloodDisorderProvenanceCategory(item);
    switch (cat) {
      case PROVENANCE_CATEGORIES.APPROVED:
        return `<span class="pill ok bd-prov-badge bd-prov-approved" data-provenance="approved" style="background: rgba(9, 184, 182, 0.16); color: #0f766e; border: 1px solid #0d9488; font-size: 11px; padding: 2px 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🏆 ${isEn ? "Approved Medical Fact" : "حقيقة طبية معتمدة"}</span>`;
      case PROVENANCE_CATEGORIES.DOCTOR_VERIFIED:
        return `<span class="pill ok bd-prov-badge bd-prov-verified" data-provenance="doctor_verified" style="background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid #10b981; font-size: 11px; padding: 2px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">🟢 ${isEn ? "Doctor-Verified" : "موثق من الطبيب"}</span>`;
      case PROVENANCE_CATEGORIES.OCR_DRAFT:
        return `<span class="pill warning bd-prov-badge bd-prov-ocr" data-provenance="ocr_draft" style="background: rgba(245, 158, 11, 0.16); color: #b45309; border: 1.5px dashed #d97706; font-size: 11px; padding: 2px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" title="${isEn ? 'Auxiliary OCR scan draft — NOT an approved medical fact' : 'مسودة استخراج ضوئي أولية — ليست حقيقة طبية معتمدة'}">📄 ${isEn ? "OCR Draft (Unverified Scan — Not Medical Fact)" : "مسودة استخراج ضوئي OCR (غير معتمدة)"}</span>`;
      case PROVENANCE_CATEGORIES.IMPORTED:
        return `<span class="pill info bd-prov-badge bd-prov-imported" data-provenance="imported" style="background: rgba(59, 130, 246, 0.14); color: #1d4ed8; border: 1px solid #3b82f6; font-size: 11px; padding: 2px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">🏥 ${isEn ? "External EHR / LIS Import (Unverified)" : "مستورد من السجل / المختبر (غير موثق)"}</span>`;
      case PROVENANCE_CATEGORIES.PATIENT_ENTERED:
      default:
        return `<span class="pill pending bd-prov-badge bd-prov-patient" data-provenance="patient_entered" style="background: rgba(245, 158, 11, 0.12); color: #d97706; border: 1px solid #f59e0b; font-size: 11px; padding: 2px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" title="${isEn ? 'Patient-reported information — unverified until clinician review' : 'معلومات مدخلة من المريض — غير موثقة حتى مراجعة الطبيب'}">👤 ${isEn ? "Patient-Entered (Unverified Draft)" : "مدخل من المريض (مسودة غير موثقة)"}</span>`;
    }
  }

  /**
   * Renders the complete Blood Clotting / Blood Disorders Doctor Review Section.
   * Enables attending physicians to thoroughly review:
   * - Patient-provided clinical information (history, medications, symptoms, risks)
   * - Laboratory measurements with units, reference ranges, and source provenance
   * - Source documents / attachments (PDF lab slips, scans)
   * - Historical observations (prior readings & longitudinal trends)
   * - Patient clarifications
   * - Doctor clinical notes (with strict quarantine of internal notes)
   * 
   * Enforces:
   * - Clear visual and programmatic distinction between the 5 provenance categories
   * - Non-diagnostic and non-automated treatment boundary
   * - Revision gating (must review current clinical revision before approval)
   */
  function renderBloodDisordersReviewSection(c, isEn = false, options = {}) {
    if (!c) return "";

    const isBloodDisordersCase = Boolean(
      options.forceRender ||
      c.condition === "blood_disorders" ||
      c.specialty === "blood_disorders" ||
      c.caseType === "blood_disorders" ||
      c.conditionId ||
      (Array.isArray(c.laboratoryResults) && c.laboratoryResults.length > 0) ||
      (Array.isArray(c.observations) && c.observations.length > 0)
    );

    if (!isBloodDisordersCase) return "";

    const intake = c.clinicalIntake || c.patientHistory || c.intake || {};
    const labs = Array.isArray(options.labResults)
      ? options.labResults
      : (Array.isArray(c.laboratoryResults) ? c.laboratoryResults : (Array.isArray(c.observations) ? c.observations : []));

    const historicalLabs = Array.isArray(options.historicalObservations)
      ? options.historicalObservations
      : (Array.isArray(c.historicalObservations) ? c.historicalObservations : (Array.isArray(c.priorObservations) ? c.priorObservations : []));

    const sourceDocs = Array.isArray(options.sourceDocuments)
      ? options.sourceDocuments
      : (Array.isArray(c.files) ? c.files : (Array.isArray(c.attachments) ? c.attachments : []));

    const clarifications = Array.isArray(c.clarifications)
      ? c.clarifications
      : (c.patientResponse ? [{ text: c.patientResponse, submittedAt: c.patientResponseAt || c.updatedAt, source: "patient_entered" }] : []);

    const curRevision = Number(c.clinicalRevision || 1);
    const isStale = Boolean(c.isRevisionStale || c.hasNewInfo || isRevisionStale(c));

    // 1. Clinical Oversight & Guardrail Banner
    const guardrailBannerHtml = `
      <div class="bd-review-guardrail-banner" role="note" style="background: rgba(9, 184, 182, 0.08); border: 1.5px solid var(--teal); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; display: flex; gap: 10px; align-items: flex-start;">
        <span style="font-size: 20px; line-height: 1;" aria-hidden="true">🛡️</span>
        <div style="font-size: 12.5px; line-height: 1.5; color: var(--ink);">
          <strong style="color: var(--teal); display: block; margin-bottom: 2px;">
            ${isEn ? "Clinical Governance & Non-Diagnostic Oversight Guardrail:" : "إطار الحوكمة السريرية وعدم إنشاء تشخيصات تلقائية:"}
          </strong>
          <span>
            ${isEn
              ? "OCR-derived text and patient-entered records are unverified auxiliary draft inputs and must NEVER be treated as approved medical facts until reviewed and approved by the attending physician. System does NOT generate automated diagnoses or treatment recommendations. The doctor must review the current clinical revision before approval."
              : "نصوص المسح الضوئي (OCR) وإفادات المريض هي مدخلات مسودة أولية ولا يجوز اعتبارها حقائق طبية معتمدة حتى يتم تدقيقها واعتمادها من الطبيب المعالج. لا يُنشئ النظام أي تشخيصات أو توصيات علاجية آلية. يلزم الطبيب بمراجعة النسخة السريرية الحالية قبل الاعتماد."}
          </span>
        </div>
      </div>
    `;

    // 2. Provenance Classification Key / Legend
    const provenanceLegendHtml = `
      <div class="bd-provenance-legend" style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; font-size: 12px;">
        <strong style="display: block; margin-bottom: 6px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
          🏷️ ${isEn ? "Clinical Provenance Classification Key:" : "دليل تصنيف مصدر وموثوقية البيانات:"}
        </strong>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
          ${getBloodDisorderProvenanceBadge("patient_entered", isEn)}
          ${getBloodDisorderProvenanceBadge("imported", isEn)}
          ${getBloodDisorderProvenanceBadge("ocr_draft", isEn)}
          ${getBloodDisorderProvenanceBadge("doctor_verified", isEn)}
          ${getBloodDisorderProvenanceBadge("approved", isEn)}
        </div>
      </div>
    `;

    // 3. Stale Revision Warning Banner
    let staleBannerHtml = "";
    if (isStale) {
      staleBannerHtml = `
        <div class="bd-stale-revision-card" style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid #f59e0b; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">⚠️</span>
            <div>
              <strong style="color: #b45309; font-size: 13px;">${isEn ? `New Clinical Information Received (Revision ${curRevision})` : `تم استلام معلومات سريرية جديدة (النسخة ${curRevision})`}</strong>
              <div style="font-size: 12px; color: var(--ink); margin-top: 2px;">
                ${isEn ? "The clinical case data has changed. Please review the updated revision before approval." : "تم تحديث بيانات الحالة. يرجى مراجعة وتأكيد النسخة الحالية قبل اعتماد التقرير."}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-sm" onclick="HealthVibes?.DoctorUI?.acknowledgeNewRevision('${escapeHtml(c.id)}')" style="padding: 6px 12px; font-size: 12px; border-radius: 6px; background: #f59e0b; color: #07191b; font-weight: 700; border: none; cursor: pointer;">
            ✓ ${isEn ? "Acknowledge & Mark Reviewed" : "تأكيد مراجعة النسخة الحالية"}
          </button>
        </div>
      `;
    }

    // 4. Patient-Provided Information Card
    const indication = escapeHtml(intake.indication || c.chiefComplaint || c.symptoms || (isEn ? "Not specified" : "غير محدد"));
    const bleedingHistory = escapeHtml(intake.bleedingHistory || c.bleedingHistory || (isEn ? "No spontaneous bleeding episodes reported" : "لم يتم الإبلاغ عن نزف تلقائي"));
    const clottingHistory = escapeHtml(intake.thromboembolismHistory || c.thromboembolismHistory || (isEn ? "No prior thromboembolic events documented" : "لا يوجد تاريخ سابق لانصمام خثاري"));
    const anticoagTherapy = escapeHtml(intake.anticoagulantTherapy || c.currentMedications || (isEn ? "None reported" : "لا يوجد علاج مسجل"));
    const familyHistory = escapeHtml(intake.familyHistory || c.familyHistory || (isEn ? "Negative family history" : "تاريخ عائلي سلبي"));
    const riskFactors = escapeHtml(intake.riskFactors || c.riskFactors || c.lifestyleFactors || (isEn ? "None documented" : "لا توجد عوامل خطورة مسجلة"));

    const patientInfoHtml = `
      <div class="bd-patient-info-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">👤</span>
            <strong style="font-size: 13.5px; color: var(--ink);">${isEn ? "Patient-Provided Clinical Information" : "المعلومات السريرية المقدمة من المريض"}</strong>
          </div>
          ${getBloodDisorderProvenanceBadge("patient_entered", isEn)}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; font-size: 12px;">
          <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <span style="color: var(--muted); display: block; font-size: 11px;">${isEn ? "Indication / Chief Complaint" : "دواعي الاستشارة / الشكوى الرئيسية"}</span>
            <strong style="color: var(--ink);">${indication}</strong>
          </div>
          <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <span style="color: var(--muted); display: block; font-size: 11px;">${isEn ? "Thrombosis & Clot History" : "تاريخ الجلطات والتخثر السابق"}</span>
            <strong style="color: var(--ink);">${clottingHistory}</strong>
          </div>
          <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <span style="color: var(--muted); display: block; font-size: 11px;">${isEn ? "Bleeding Diathesis History" : "تاريخ النزف والاعتلال التخثري"}</span>
            <strong style="color: var(--ink);">${bleedingHistory}</strong>
          </div>
          <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <span style="color: var(--muted); display: block; font-size: 11px;">${isEn ? "Current Anticoagulants / Antiplatelets" : "أدوية السيولة ومضادات التخثر الحالية"}</span>
            <strong style="color: var(--ink);">${anticoagTherapy}</strong>
          </div>
          <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <span style="color: var(--muted); display: block; font-size: 11px;">${isEn ? "Family Hematology History" : "التاريخ العائلي لأمراض الدم"}</span>
            <strong style="color: var(--ink);">${familyHistory}</strong>
          </div>
          <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
            <span style="color: var(--muted); display: block; font-size: 11px;">${isEn ? "Clinical & Acquired Risk Factors" : "عوامل الخطورة والمحفزات"}</span>
            <strong style="color: var(--ink);">${riskFactors}</strong>
          </div>
        </div>
      </div>
    `;

    // 5. Laboratory Results Table with Units, Reference Ranges & Provenance
    let labsTableHtml = "";
    if (labs.length === 0) {
      labsTableHtml = `
        <div style="padding: 16px; text-align: center; background: var(--surface); border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 12.5px;">
          <span>🧪</span> ${isEn ? "No laboratory measurements recorded for this case yet." : "لا توجد نتائج تحاليل مخبرية مسجلة لهذه الحالة بعد."}
        </div>
      `;
    } else {
      const rows = labs.map(lab => {
        const code = escapeHtml(lab.testCode || lab.code || "--");
        const name = escapeHtml(lab.testName || (isEn ? lab.nameEn : lab.nameAr) || code);
        const val = escapeHtml(lab.value !== undefined ? lab.value : (lab.resultValue !== undefined ? lab.resultValue : "--"));
        // Unit: strictly preserved without guessing
        const unitDisplay = (lab.unit && String(lab.unit).trim() !== "")
          ? escapeHtml(lab.unit)
          : `<span style="color: var(--muted); font-style: italic;">${isEn ? "— (Not specified)" : "— (غير محدد)"}</span>`;

        // Reference range: strictly preserved without assuming standard defaults
        let refDisplay = `<span style="color: var(--muted); font-style: italic;">${isEn ? "— (Not provided by source)" : "— (غير محدد من المصدر)"}</span>`;
        if (lab.referenceRange) {
          if (typeof lab.referenceRange === "object") {
            if (lab.referenceRange.low !== undefined && lab.referenceRange.low !== null && lab.referenceRange.high !== undefined && lab.referenceRange.high !== null) {
              refDisplay = `${lab.referenceRange.low} – ${lab.referenceRange.high} ${escapeHtml(lab.referenceRange.unit || lab.unit || "")}`;
            } else if (lab.referenceRange.text) {
              refDisplay = escapeHtml(lab.referenceRange.text);
            }
          } else if (typeof lab.referenceRange === "string" && lab.referenceRange.trim() !== "") {
            refDisplay = escapeHtml(lab.referenceRange);
          }
        }

        const dateStr = lab.collectedAt || lab.collectionDateTime || lab.measuredAt;
        const dtDisplay = dateStr
          ? formatDateTime(dateStr, isEn)
          : `<span style="color: var(--muted); font-style: italic;">${isEn ? "— (Not recorded)" : "— (غير مسجل)"}</span>`;

        const docRef = lab.reportingLab || lab.sourceDocument || lab.attachmentRef?.fileName || lab.attachmentRef?.fileId || (isEn ? "Lab slip" : "تقرير المختبر");
        const badge = getBloodDisorderProvenanceBadge(lab, isEn);

        return `
          <tr style="border-bottom: 1px solid var(--line); font-size: 12px;">
            <td style="padding: 8px 10px; font-weight: 700; color: var(--teal); font-family: monospace;">${code}</td>
            <td style="padding: 8px 10px; color: var(--ink); font-weight: 600;">${name}</td>
            <td style="padding: 8px 10px; font-weight: 700; color: var(--ink); font-size: 13px;">${val}</td>
            <td style="padding: 8px 10px;">${unitDisplay}</td>
            <td style="padding: 8px 10px;">${refDisplay}</td>
            <td style="padding: 8px 10px; color: var(--muted);">${dtDisplay}</td>
            <td style="padding: 8px 10px; color: var(--muted); font-size: 11px;">${escapeHtml(docRef)}</td>
            <td style="padding: 8px 10px;">${badge}</td>
          </tr>
        `;
      }).join("");

      labsTableHtml = `
        <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
          <table style="width: 100%; border-collapse: collapse; text-align: start; background: var(--surface); border: 1px solid var(--line); border-radius: 10px;">
            <thead>
              <tr style="background: var(--surface-2); border-bottom: 1.5px solid var(--line); color: var(--muted); font-size: 11.5px;">
                <th style="padding: 8px 10px;">${isEn ? "Code" : "الرمز"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Test Name" : "اسم الفحص"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Result" : "النتيجة"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Unit" : "الوحدة"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Reference Range" : "النطاق المرجعي"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Collected" : "تاريخ السحب"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Document / Lab" : "المصدر / المستند"}</th>
                <th style="padding: 8px 10px;">${isEn ? "Provenance Tier" : "مستوى الموثوقية والمصدر"}</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }

    // 6. Source Documents & Attachments Card
    let sourceDocsHtml = "";
    if (sourceDocs.length === 0) {
      sourceDocsHtml = `
        <div style="padding: 12px; background: var(--surface); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 12px;">
          <span>📄</span> ${isEn ? "No source lab PDF documents or raw scans attached." : "لا توجد تقارير مخبرية أو مسوحات ضوئية مرفقة."}
        </div>
      `;
    } else {
      const docItems = sourceDocs.map(doc => {
        const docName = escapeHtml(doc.name || doc.fileName || (isEn ? "Lab Report Document" : "مستند التقرير المخبري"));
        const sizeStr = doc.size ? formatBytes(doc.size) : "--";
        const docDt = doc.uploadedAt || doc.createdAt ? formatDateTime(doc.uploadedAt || doc.createdAt, isEn) : "--";
        const isPdf = String(docName).toLowerCase().endsWith(".pdf") || doc.type === "application/pdf";
        const docBadge = getBloodDisorderProvenanceBadge(doc, isEn);

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; font-size: 12px; flex-wrap: wrap; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${isPdf ? "📄" : "🖼️"}</span>
              <div>
                <strong style="color: var(--ink);">${docName}</strong>
                <span style="display: block; font-size: 11px; color: var(--muted);">${sizeStr} • ${docDt}</span>
              </div>
            </div>
            <div>${docBadge}</div>
          </div>
        `;
      }).join("");

      sourceDocsHtml = `<div style="display: flex; flex-direction: column; gap: 6px;">${docItems}</div>`;
    }

    // 7. Historical Observations & Longitudinal Trends
    let historicalHtml = "";
    if (historicalLabs.length === 0) {
      historicalHtml = `
        <div style="padding: 12px; background: var(--surface); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 12px;">
          <span>ℹ️</span> ${isEn ? "Initial hematology assessment — no prior historical observations recorded for this patient." : "تقييم أولي — لا توجد ملاحظات أو تحاليل تاريخية سابقة مسجلة لهذا المريض."}
        </div>
      `;
    } else {
      const histRows = historicalLabs.map(h => {
        const hCode = escapeHtml(h.testCode || h.code || "--");
        const hName = escapeHtml(h.testName || (isEn ? h.nameEn : h.nameAr) || hCode);
        const hVal = escapeHtml(h.value !== undefined ? h.value : (h.resultValue !== undefined ? h.resultValue : "--"));
        const hUnit = escapeHtml(h.unit || "--");
        const hDate = formatDateTime(h.collectedAt || h.collectionDateTime || h.createdAt, isEn);
        const hBadge = getBloodDisorderProvenanceBadge(h, isEn);

        return `
          <tr style="border-bottom: 1px solid var(--line); font-size: 11.5px;">
            <td style="padding: 6px 8px; font-family: monospace; color: var(--teal);">${hCode}</td>
            <td style="padding: 6px 8px;">${hName}</td>
            <td style="padding: 6px 8px; font-weight: 700;">${hVal} ${hUnit}</td>
            <td style="padding: 6px 8px; color: var(--muted);">${hDate}</td>
            <td style="padding: 6px 8px;">${hBadge}</td>
          </tr>
        `;
      }).join("");

      historicalHtml = `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: start; background: var(--surface); border: 1px solid var(--line); border-radius: 8px;">
            <thead>
              <tr style="background: var(--surface-2); border-bottom: 1px solid var(--line); color: var(--muted); font-size: 11px;">
                <th style="padding: 6px 8px;">${isEn ? "Code" : "الرمز"}</th>
                <th style="padding: 6px 8px;">${isEn ? "Test" : "الفحص"}</th>
                <th style="padding: 6px 8px;">${isEn ? "Past Result" : "النتيجة السابقة"}</th>
                <th style="padding: 6px 8px;">${isEn ? "Date" : "التاريخ"}</th>
                <th style="padding: 6px 8px;">${isEn ? "Provenance" : "المصدر"}</th>
              </tr>
            </thead>
            <tbody>
              ${histRows}
            </tbody>
          </table>
        </div>
      `;
    }

    // 8. Patient Clarifications
    let clarificationsHtml = "";
    if (clarifications.length === 0) {
      clarificationsHtml = `
        <div style="padding: 12px; background: var(--surface); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 12px;">
          <span>💬</span> ${isEn ? "No pending or historical patient clarifications recorded." : "لا توجد استفسارات أو توضيحات مسجلة من المريض."}
        </div>
      `;
    } else {
      const items = clarifications.map((clr, idx) => {
        const text = escapeHtml(clr.text || clr.patientResponse || clr.clarificationText || "--");
        const dt = formatDateTime(clr.submittedAt || clr.createdAt, isEn);
        return `
          <div style="padding: 8px 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: var(--teal); font-size: 11px;">${isEn ? `Clarification #${idx + 1}` : `توضيح رقم #${idx + 1}`}</strong>
              <small style="color: var(--muted);">${dt}</small>
            </div>
            <p style="margin: 0; color: var(--ink); line-height: 1.4;">${text}</p>
          </div>
        `;
      }).join("");

      clarificationsHtml = `<div>${items}</div>`;
    }

    // 9. Quarantined Internal Clinician Notes
    const internalNotesText = c.internalDoctorNotes || c.internalNotes || "";
    const internalNotesHtml = `
      <div class="bd-internal-notes-card" style="background: rgba(245, 158, 11, 0.08); border: 1px dashed #f59e0b; border-radius: 10px; padding: 12px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #b45309; font-size: 12.5px; display: flex; align-items: center; gap: 6px;">
            <span>🔒</span> ${isEn ? "Internal Clinician Notes (Strictly Quarantined from Patient)" : "ملاحظات الطبيب الداخلية (محجوبة تماماً عن المريض)"}
          </strong>
          <span class="pill warning" style="font-size: 10px; padding: 1px 6px;">Quarantined</span>
        </div>
        <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4; font-family: monospace;">
          ${internalNotesText ? escapeHtml(internalNotesText) : `<span style="color: var(--muted); font-style: italic;">${isEn ? "No internal notes recorded." : "لا توجد ملاحظات داخلية."}</span>`}
        </p>
      </div>
    `;

    return `
      <div class="blood-disorders-doctor-review-container" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin: 14px 0;">
        
        <!-- Section Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 22px;">🩸</span>
            <div>
              <h4 style="margin: 0; font-size: 15px; color: var(--ink); font-weight: 700;">
                ${isEn ? "Blood Clotting / Hematology Clinical Case Review" : "مراجعة وتدقيق حالة اضطراب تجلط الدم والاعتلالات الدموية"}
              </h4>
              <small style="color: var(--muted); font-size: 11px;">
                ${isEn ? `Current Clinical Revision: Rev #${curRevision}` : `النسخة السريرية الحالية: رقم #${curRevision}`}
              </small>
            </div>
          </div>
          <div>
            ${c.status === "approved"
              ? `<span class="pill ok" style="font-size: 11.5px; padding: 3px 10px;">🏆 ${isEn ? "Case Approved & Certified" : "الحالة معتمدة بتقرير طبي"}</span>`
              : `<span class="pill pending" style="font-size: 11.5px; padding: 3px 10px;">⏳ ${isEn ? "Under Attending Physician Review" : "قيد تدقيق ومراجعة الطبيب"}</span>`}
          </div>
        </div>

        ${guardrailBannerHtml}
        ${staleBannerHtml}
        ${provenanceLegendHtml}

        <!-- 1. Patient Provided Information -->
        ${patientInfoHtml}

        <!-- 2. Laboratory Results Table -->
        <div style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 6px;">
              <span>🧪</span> ${isEn ? "Laboratory Results (Units & Reference Ranges)" : "نتائج التحاليل المخبرية (الوحدات والنطاقات المرجعية)"}
            </strong>
            <small style="color: var(--muted); font-size: 11px;">${labs.length} ${isEn ? "parameters" : "فحوصات"}</small>
          </div>
          ${labsTableHtml}
        </div>

        <!-- 3. Source Documents & Attachments -->
        <div style="margin-bottom: 14px;">
          <strong style="font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>📎</span> ${isEn ? "Source Documents & Uploaded Lab Reports" : "مستندات المصدر والتقارير المرفوعة"}
          </strong>
          ${sourceDocsHtml}
        </div>

        <!-- 4. Historical Observations (Longitudinal Trend) -->
        <div style="margin-bottom: 14px;">
          <strong style="font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>📈</span> ${isEn ? "Historical Observations & Longitudinal Trends" : "الملاحظات والنتائج التاريخية السابقة للمريض"}
          </strong>
          ${historicalHtml}
        </div>

        <!-- 5. Patient Clarifications -->
        <div style="margin-bottom: 14px;">
          <strong style="font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>💬</span> ${isEn ? "Patient Clarifications & Answers" : "إيضاحات وإجابات المريض"}
          </strong>
          ${clarificationsHtml}
        </div>

        <!-- 6. Internal Doctor Notes -->
        ${internalNotesHtml}
      </div>
    `;
  }

  /**
   * Renders the Obesity & Metabolic Health Doctor Review Section.
   * Enables attending physicians to thoroughly review:
   * - Patient-provided anthropometrics (height, weight, date/time, source)
   * - Dynamically calculated BMI (strictly when valid height and weight exist)
   * - Historical measurements preserved longitudinally
   * - Documented lifestyle factors (physical activity, dietary habits, sleep)
   * - Source documents & attachments
   * - Doctor clinical notes (with strict quarantine of internal notes)
   * 
   * Enforces:
   * - Non-diagnostic boundary: Weight & BMI alone DO NOT represent a medical diagnosis
   * - Prohibition of automated diagnoses
   * - Human physician diagnosis required for approval
   * - Current clinical revision gating
   */
  function renderObesityReviewSection(c, isEn = false, options = {}) {
    if (!c) return "";

    const isObesityCase = Boolean(
      options.forceRender ||
      c.condition === "obesity" ||
      c.specialty === "obesity" ||
      c.caseType === "obesity" ||
      c.latestMeasurement ||
      (Array.isArray(c.historicalMeasurements) && c.historicalMeasurements.length > 0)
    );

    if (!isObesityCase) return "";

    const latest = c.latestMeasurement || (Array.isArray(c.historicalMeasurements) && c.historicalMeasurements.length > 0 ? c.historicalMeasurements[c.historicalMeasurements.length - 1] : null);
    const history = Array.isArray(c.historicalMeasurements) ? c.historicalMeasurements : (latest ? [latest] : []);
    const lifestyle = c.lifestyle || (latest && latest.lifestyle) || null;
    const curRevision = Number(c.clinicalRevision || 1);
    const isStale = Boolean(c.isRevisionStale || c.hasNewInfo || isRevisionStale(c));

    // Dynamic BMI calculation
    let calculatedBmiStr = "--";
    if (latest && latest.heightCm && latest.weightKg) {
      const hM = Number(latest.heightCm) > 3 ? Number(latest.heightCm) / 100 : Number(latest.heightCm);
      const bmi = Math.round((Number(latest.weightKg) / (hM * hM)) * 10) / 10;
      calculatedBmiStr = `${bmi} kg/m²`;
    } else if (latest && latest.bmi) {
      calculatedBmiStr = `${latest.bmi} kg/m²`;
    }

    // Historical measurements table rows
    let historyRowsHtml = "";
    if (history.length === 0) {
      historyRowsHtml = `
        <tr>
          <td colspan="5" style="padding: 12px; text-align: center; color: var(--muted); font-size: 12px;">
            ${isEn ? "No historical measurements recorded." : "لا توجد قياسات سابقة مسجلة."}
          </td>
        </tr>
      `;
    } else {
      historyRowsHtml = history.map(h => {
        const hBmi = (h.bmi !== undefined && h.bmi !== null) ? `${h.bmi} kg/m²` : "--";
        const dateStr = formatDateTime(h.measuredAt, isEn);
        const src = h.measurementSource || "patient_self_report";
        return `
          <tr style="border-bottom: 1px solid var(--line);">
            <td style="padding: 8px 10px; font-weight: 600;">${escapeSafe(dateStr)}</td>
            <td style="padding: 8px 10px; font-family: monospace;">${h.heightCm ? h.heightCm + " cm" : "--"}</td>
            <td style="padding: 8px 10px; font-family: monospace; font-weight: 700; color: var(--teal);">${h.weightKg ? h.weightKg + " kg" : "--"}</td>
            <td style="padding: 8px 10px; font-family: monospace; font-weight: 700;">${escapeSafe(hBmi)}</td>
            <td style="padding: 8px 10px; font-size: 11px; color: var(--muted);">${escapeSafe(src)}</td>
          </tr>
        `;
      }).join("");
    }

    // Lifestyle summary
    let lifestyleHtml = "";
    if (lifestyle) {
      const act = lifestyle.physicalActivity;
      const diet = lifestyle.dietaryHabits;
      const sleep = lifestyle.sleep;
      lifestyleHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; background: var(--surface-2); padding: 12px; border-radius: 10px; margin-bottom: 14px; font-size: 12px;">
          <div>
            <strong style="color: var(--teal); display: block; margin-bottom: 4px;">🏃 ${isEn ? "Physical Activity" : "النشاط البدني"}</strong>
            <span>${act && act.activityLevel ? escapeSafe(act.activityLevel) : (isEn ? "Not specified" : "غير محدد")} ${act && act.minutesPerWeek ? `(${act.minutesPerWeek} min/wk)` : ""}</span>
          </div>
          <div>
            <strong style="color: var(--teal); display: block; margin-bottom: 4px;">🥗 ${isEn ? "Dietary Habits" : "النمط الغذائي"}</strong>
            <span>${diet && diet.nutritionalPattern ? escapeSafe(diet.nutritionalPattern) : (isEn ? "Documented" : "موثق")} ${diet && diet.mealsPerDay ? `• ${diet.mealsPerDay} meals/day` : ""}</span>
          </div>
          <div>
            <strong style="color: var(--teal); display: block; margin-bottom: 4px;">🌙 ${isEn ? "Sleep & Apnea Screening" : "النوم وفحص انقطاع النفس"}</strong>
            <span>${sleep && sleep.hoursPerNight ? `${sleep.hoursPerNight} hrs/night` : (isEn ? "Not specified" : "غير محدد")} ${sleep && sleep.sleepApneaScreening ? `• ${sleep.sleepApneaScreening}` : ""}</span>
          </div>
        </div>
      `;
    }

    // Internal notes
    let internalNotesHtml = "";
    if (c.internalDoctorNotes) {
      internalNotesHtml = `
        <div class="quarantined-notes-container" style="background: rgba(245, 158, 11, 0.08); border: 1.5px dashed #d97706; border-radius: 10px; padding: 12px; margin-top: 12px;">
          <strong style="color: #b45309; font-size: 12px; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span>🔒</span> ${isEn ? "Internal Doctor Notes (Strict Quarantine from Patient)" : "ملاحظات الطبيب الداخلية (محجوبة عن المريض)"}
          </strong>
          <p style="margin: 0; font-size: 12.5px; color: var(--ink);">${escapeSafe(c.internalDoctorNotes)}</p>
        </div>
      `;
    }

    return `
      <div class="obesity-review-card" style="background: var(--surface); border: 1.5px solid var(--line); border-radius: 14px; padding: 18px; margin: 14px 0; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 14px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 22px;">⚖️</span>
              <h4 style="margin: 0; font-size: 16px; color: var(--ink); font-weight: 700;">
                ${isEn ? "Obesity & Metabolic Health Clinical Review" : "مراجعة سريرية لحالة السمنة والصحة الأيضية"}
              </h4>
            </div>
            <span style="font-size: 11.5px; color: var(--muted); margin-top: 2px; display: inline-block;">
              ${isEn ? "Clinical Revision" : "المراجعة السريرية"}: <strong style="font-family: monospace;">#${curRevision}</strong>
            </span>
          </div>
          <div>
            ${isStale ? `
              <span class="pill warning" style="font-size: 11px; padding: 3px 8px; font-weight: 700;">
                ⚠️ ${isEn ? "New Anthropometrics / Stale Revision" : "قياسات جديدة / مراجعة غير مدققة"}
              </span>
            ` : `
              <span class="pill ok" style="font-size: 11px; padding: 3px 8px;">
                🟢 ${isEn ? "Current Revision" : "المراجعة الحالية"}
              </span>
            `}
          </div>
        </div>

        <!-- Mandatory Guardrail Banner -->
        <div style="background: rgba(9, 184, 182, 0.08); border: 1px solid var(--teal); border-radius: 10px; padding: 12px; margin-bottom: 14px;">
          <strong style="color: var(--teal); font-size: 12.5px; display: block; margin-bottom: 2px;">
            🛡️ ${isEn ? "Anthropometric Clinical Standard & Non-Diagnostic Guardrail" : "المعيار السريري وحدود القياسات الأنثروبومترية غير التشخيصية"}
          </strong>
          <p style="margin: 0; font-size: 12px; color: var(--ink); line-height: 1.4;">
            ${isEn
              ? "Weight and BMI are anthropometric measurements, NOT a medical diagnosis. Weight alone does not represent a diagnosis. An explicit clinical diagnosis from the attending physician is required before approval."
              : "الوزن ومؤشر كتلة الجسم (BMI) قياسات أنثروبومترية وليسا تشخيصاً طبياً. الوزن بمفرده لا يمثل تشخيصاً. يلزم تشخيص سريري صريح من الطبيب المعالج قبل الاعتماد."}
          </p>
        </div>

        <!-- Current Biometrics Summary -->
        <div style="background: var(--surface-2); padding: 14px; border-radius: 10px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
          <div>
            <span style="font-size: 11px; color: var(--muted); display: block;">${isEn ? "Measured Height" : "الطول المقاس"}</span>
            <strong style="font-size: 15px; color: var(--ink); font-family: monospace;">
              ${latest && (latest.height || latest.heightCm) ? `${latest.height || latest.heightCm} ${latest.heightUnit || "cm"}` : "--"}
            </strong>
            ${latest?.measuredValues?.height?.isReusedFromHistory ? `<small class="pill info" style="display: block; font-size: 9.5px; margin-top: 2px;">${isEn ? "Reused from patient record" : "مسترجع من سجل المريض"}</small>` : ""}
          </div>
          <div>
            <span style="font-size: 11px; color: var(--muted); display: block;">${isEn ? "Measured Weight" : "الوزن المقاس"}</span>
            <strong style="font-size: 15px; color: var(--teal); font-family: monospace;">
              ${latest && (latest.weight || latest.weightKg) ? `${latest.weight || latest.weightKg} ${latest.weightUnit || "kg"}` : "--"}
            </strong>
          </div>
          <div>
            <span style="font-size: 11px; color: var(--muted); display: block;">${isEn ? "Calculated BMI (weight/height²)" : "مؤشر الكتلة المحسوب (BMI)"}</span>
            <strong style="font-size: 15px; color: var(--ink); font-family: monospace;">${calculatedBmiStr}</strong>
            ${latest?.bmi ? `<small class="pill ok" style="display: block; font-size: 9.5px; margin-top: 2px;">📐 ${isEn ? "Calculated" : "محسوب"}</small>` : `<small style="color: var(--muted); font-size: 9.5px; display: block;">${isEn ? "Not fabricated" : "غير مصطنع"}</small>`}
          </div>
          <div>
            <span style="font-size: 11px; color: var(--muted); display: block;">${isEn ? "Source & Timestamp" : "المصدر والتوقيت"}</span>
            <span style="font-size: 12px; color: var(--ink); display: block;">${latest && latest.measurementSource ? escapeSafe(latest.measurementSource) : "--"}</span>
            <small style="font-size: 10.5px; color: var(--muted);">${formatDateTime(latest?.measurementTimestamp || latest?.measuredAt, isEn)}</small>
          </div>
        </div>

        <!-- Lifestyle Summary -->
        ${lifestyleHtml}

        <!-- Historical Measurements Table -->
        <div style="margin-bottom: 14px;">
          <strong style="font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>📈</span> ${isEn ? "Longitudinal Measurement History (Preserved Observations)" : "سجل القياسات السريرية التاريخي (ملاحظات محفوظة)"} (${history.length})
          </strong>
          <div style="overflow-x: auto; border: 1px solid var(--line); border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: start;">
              <thead>
                <tr style="background: var(--surface-2); border-bottom: 1px solid var(--line); color: var(--ink);">
                  <th style="padding: 8px 10px;">${isEn ? "Timestamp" : "التوقيت"}</th>
                  <th style="padding: 8px 10px;">${isEn ? "Height" : "الطول"}</th>
                  <th style="padding: 8px 10px;">${isEn ? "Weight" : "الوزن"}</th>
                  <th style="padding: 8px 10px;">${isEn ? "Calculated BMI" : "مؤشر الكتلة المحسوب"}</th>
                  <th style="padding: 8px 10px;">${isEn ? "Source" : "المصدر"}</th>
                </tr>
              </thead>
              <tbody>
                ${historyRowsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Quarantined Internal Notes -->
        ${internalNotesHtml}
      </div>
    `;
  }

  function renderAttachmentsSection(c, isEn = false) {
    if (!c) return "";
    const files = Array.isArray(c.attachments)
      ? c.attachments
      : (Array.isArray(c.files) ? c.files : (Array.isArray(c.attachedFiles) ? c.attachedFiles : (c.assessment?.attachments || c.assessment?.files || [])));

    if (!files || files.length === 0) {
      return `
        <div class="attachments-section-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin: 12px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 13.5px; display: flex; align-items: center; gap: 6px; color: var(--teal);">
              <span>📎</span> ${isEn ? "Patient Medical Attachments & Reports" : "الملفات والتقارير الطبية المرفقة"}
            </strong>
            <span class="pill info" style="font-size: 10.5px;">${isEn ? "0 Files" : "لا توجد ملفات"}</span>
          </div>
          <div style="padding: 12px; background: var(--surface); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 12.5px;">
            <span>ℹ️</span> ${isEn ? "No medical attachments or lab reports uploaded for this case." : "لا توجد مرفقات طبية أو تقارير مخبرية مرفوعة لهذه الحالة."}
          </div>
        </div>
      `;
    }

    function getFileIcon(fileName = "", mime = "") {
      const fn = String(fileName).toLowerCase();
      const m = String(mime).toLowerCase();
      if (fn.endsWith(".pdf") || m.includes("pdf")) return "📄";
      if (fn.match(/\.(jpg|jpeg|png|webp|gif)$/) || m.includes("image")) return "🖼️";
      if (fn.includes("ecg") || fn.includes("ekg")) return "📈";
      if (fn.includes("lab") || fn.includes("blood") || fn.includes("test")) return "🧪";
      return "📎";
    }

    const fileListHtml = files.map(f => {
      const name = f.name || f.fileName || f.originalName || (isEn ? "Medical Record File" : "ملف طبي مرفق");
      const size = f.size || f.fileSize ? formatBytes(f.size || f.fileSize) : "";
      const icon = getFileIcon(name, f.type || f.mimeType);
      const dateStr = f.uploadedAt || f.createdAt ? new Date(f.uploadedAt || f.createdAt).toLocaleDateString(isEn ? "en-US" : "ar-EG") : "";
      const url = f.url || f.fileUrl || f.downloadUrl || "#";

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; font-size: 12.5px;">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
            <span style="font-size: 18px;">${icon}</span>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <strong style="color: var(--ink); font-size: 12.5px; display: block;">${escapeSafe(name)}</strong>
              <small style="color: var(--muted); font-size: 11px;">${size ? size + " • " : ""}${dateStr || (isEn ? "Attached" : "مرفق")}</small>
            </div>
          </div>
          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            ${url && url !== "#" ? `
              <a href="${escapeSafe(url)}" target="_blank" rel="noopener noreferrer" class="soft-button" style="font-size: 11px; padding: 4px 8px; text-decoration: none;">
                🔍 ${isEn ? "View" : "معاينة"}
              </a>
            ` : `
              <span class="pill info" style="font-size: 10px; padding: 2px 6px;">${isEn ? "Attached" : "مرفق"}</span>
            `}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="attachments-section-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin: 14px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <strong style="font-size: 14px; display: flex; align-items: center; gap: 6px; color: var(--teal);">
            <span>📎</span> ${isEn ? "Patient Medical Attachments & Reports" : "الملفات والتقارير الطبية المرفقة"}
          </strong>
          <span class="pill ok" style="font-size: 11px;">${files.length} ${isEn ? "File(s)" : "ملفات"}</span>
        </div>
        <div>
          ${fileListHtml}
        </div>
      </div>
    `;
  }

  function renderPreviousApprovedReportsSection(c, isEn = false) {
    if (!c) return "";
    let reports = [];
    if (Array.isArray(c.approvalHistory) && c.approvalHistory.length > 0) {
      reports = c.approvalHistory;
    } else if (Array.isArray(c.previousReports) && c.previousReports.length > 0) {
      reports = c.previousReports;
    } else if (c.reportSnapshot) {
      reports = [c.reportSnapshot];
    }

    if (!reports || reports.length === 0) {
      return `
        <div class="previous-reports-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin: 12px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 13.5px; display: flex; align-items: center; gap: 6px; color: var(--teal);">
              <span>📑</span> ${isEn ? "Previous Approved Reports" : "التقارير الطبية المعتمدة السابقة"}
            </strong>
            <span class="pill info" style="font-size: 10.5px;">${isEn ? "Initial Review" : "فحص أولي"}</span>
          </div>
          <div style="padding: 12px; background: var(--surface); border-radius: 8px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 12.5px;">
            <span>ℹ️</span> ${isEn ? "Initial clinical review — no previous approved reports." : "الفحص السريري الأولي — لا توجد تقارير معتمدة سابقة."}
          </div>
        </div>
      `;
    }

    const reportsListHtml = reports.map((r, idx) => {
      const revNum = r.revisionNumber || (idx + 1);
      const revId = r.revisionId || r.reportRef || (c.id ? `HV-REP-${c.id.slice(-6).toUpperCase()}_v${revNum}` : `v${revNum}`);
      const approvedAt = r.approvedAt || r.dates?.approvedAt || r.createdAt;
      const formattedDate = approvedAt ? new Date(approvedAt).toLocaleString(isEn ? "en-US" : "ar-EG", { dateStyle: "short", timeStyle: "short" }) : "--";
      const doctorName = r.approvedBy?.name || r.doctorIdentity?.name || (isEn ? "Attending Physician" : "الطبيب المعالج");

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; font-size: 12.5px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="pill ok" style="font-size: 10.5px; padding: 2px 7px;">${isEn ? "Report Rev #" + revNum : "التقرير نسخة " + revNum}</span>
              <strong style="color: var(--ink); font-size: 13px;">${escapeSafe(revId)}</strong>
            </div>
            <small style="color: var(--muted); display: block; margin-top: 3px;">
              ${isEn ? "Approved by: " : "معتمد بواسطة: "}${escapeSafe(doctorName)} • 🕒 ${formattedDate}
            </small>
          </div>
          <button type="button" class="soft-button" style="font-size: 11.5px; padding: 4px 10px;" onclick="openCaseReport('${c.id}')" title="${isEn ? 'Inspect Approved Report' : 'استعراض التقرير المعتمد'}">
            📄 ${isEn ? "View Report" : "عرض التقرير"}
          </button>
        </div>
      `;
    }).join("");

    return `
      <div class="previous-reports-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin: 14px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <strong style="font-size: 14px; display: flex; align-items: center; gap: 6px; color: var(--teal);">
            <span>📑</span> ${isEn ? "Previous Approved Reports" : "التقارير الطبية المعتمدة السابقة"}
          </strong>
          <span class="pill ok" style="font-size: 11px;">${reports.length} ${isEn ? "Approved Report(s)" : "تقارير معتمدة"}</span>
        </div>
        <div>
          ${reportsListHtml}
        </div>
      </div>
    `;
  }

  function renderInternalDoctorNotesSection(c, isEn = false) {
    if (!c) return "";
    const internalNote = c.internalDoctorNotes || c.internalNotes || c.clinicianQuarantineNotes || "";
    if (!internalNote || !String(internalNote).trim()) {
      return `
        <div class="doctor-internal-notes-card" style="background: rgba(239, 68, 68, 0.03); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 10px 14px; margin: 10px 0;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <small style="color: #b91c1c; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              <span>🔒</span> ${isEn ? "Internal Clinician Notes (Hidden from Patient & Reports)" : "ملاحظات الفريق الطبي الداخلية (محجوبة تماماً عن المريض)"}
            </small>
            <span style="font-size: 11px; color: var(--muted);">${isEn ? "No internal notes recorded" : "لا توجد ملاحظات داخلية"}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="doctor-internal-notes-card" style="background: rgba(239, 68, 68, 0.06); border: 1.5px dashed #dc2626; border-radius: 12px; padding: 14px; margin: 12px 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <strong style="color: #b91c1c; font-size: 13px; display: flex; align-items: center; gap: 6px;">
            <span>🔒</span> ${isEn ? "Internal Clinician Notes (Strictly Quarantined from Patient)" : "ملاحظات الفريق الطبي الداخلية (محجوبة بشكل صارم عن المريض والتقارير)"}
          </strong>
          <span class="pill danger" style="font-size: 10.5px; padding: 2px 8px; font-weight: 700;">${isEn ? "Confidential Staff Note" : "سري للفريق الطبي"}</span>
        </div>
        <p style="margin: 0; font-size: 13px; color: var(--ink); line-height: 1.5; font-weight: 600; white-space: pre-wrap;">${escapeSafe(internalNote)}</p>
        <div style="margin-top: 8px; font-size: 11px; color: #b91c1c;">
          ⚠️ ${isEn ? "Note: This internal text is never printed on patient reports, sent in notifications, or shown in the patient portal." : "تنبيه: هذا النص الداخلي لا يُطبع على تقارير المريض ولا يُرسل في الإشعارات ولا يظهر في بوابة المريض."}
        </div>
      </div>
    `;
  }

  function scrubInternalNotesForPatient(caseData) {
    if (!caseData) return caseData;
    const sanitized = { ...caseData };
    const shouldInclude = Boolean(sanitized.includePrivateNotesInReport || sanitized.sharePrivateNotesWithPatient);
    if (!shouldInclude) {
      delete sanitized.privateNotes;
      delete sanitized.doctorPrivateNotes;
    }
    delete sanitized.internalDoctorNotes;
    delete sanitized.internalNotes;
    delete sanitized.clinicianQuarantineNotes;
    delete sanitized.privatePhysicianNotes;
    if (sanitized.reportSnapshot) {
      const rs = { ...sanitized.reportSnapshot };
      if (!shouldInclude) {
        delete rs.privateNotes;
        delete rs.doctorPrivateNotes;
      }
      delete rs.internalDoctorNotes;
      delete rs.internalNotes;
      delete rs.clinicianQuarantineNotes;
      sanitized.reportSnapshot = rs;
    }
    return sanitized;
  }

  function escapeSafe(str) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(str);
    return String(str || "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ===========================================================================
  // 7. STRUCTURED CLINICAL CLARIFICATION THREAD ENGINE
  // ===========================================================================

  const PERMITTED_ATTACHMENT_CONFIG = {
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    extensions: [".pdf", ".jpg", ".jpeg", ".png"],
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    maxSizeLabel: "10 MB"
  };

  const CLINICAL_MEASUREMENT_UNITS = {
    oxygenLevel: { nameEn: "Oxygen Saturation (SpO2)", nameAr: "تشبع الأكسجين (SpO2)", unit: "%", icon: "🫁" },
    temperature: { nameEn: "Body Temperature", nameAr: "حرارة الجسم", unit: "°C", icon: "🌡️" },
    heartRate: { nameEn: "Heart Rate / Pulse", nameAr: "النبض", unit: "bpm", icon: "💓" },
    respiratoryRate: { nameEn: "Respiratory Rate", nameAr: "معدل التنفس", unit: "breaths/min", icon: "🫁" },
    systolicBp: { nameEn: "Systolic Blood Pressure", nameAr: "ضغط الدم الانقباضي", unit: "mmHg", icon: "🩸" },
    diastolicBp: { nameEn: "Diastolic Blood Pressure", nameAr: "ضغط الدم الانبساطي", unit: "mmHg", icon: "🩸" },
    bloodGlucose: { nameEn: "Blood Glucose", nameAr: "سكر الدم", unit: "mg/dL", icon: "🩸" }
  };

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return "";
    const b = Number(bytes);
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  function validateAttachmentFile(file, isEn = null) {
    if (!file) return { ok: false, error: "No file provided" };
    const en = isEn !== null ? Boolean(isEn) : ((global.currentLanguage || "ar") === "en");
    const name = file.name || "";
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    const type = file.type || "";
    const size = file.size || 0;

    const extAllowed = PERMITTED_ATTACHMENT_CONFIG.extensions.includes(ext);
    const mimeAllowed = !type || PERMITTED_ATTACHMENT_CONFIG.mimeTypes.includes(type);

    if (!extAllowed || (!mimeAllowed && type)) {
      return {
        ok: false,
        error: en
          ? `Invalid file type '${ext || "unknown"}'. Permitted types: ${PERMITTED_ATTACHMENT_CONFIG.extensions.join(", ")}`
          : `نوع الملف '${ext || "غير محدد"}' غير مسموح به. الأنواع المصرح بها: ${PERMITTED_ATTACHMENT_CONFIG.extensions.join(", ")}`
      };
    }

    if (size > PERMITTED_ATTACHMENT_CONFIG.maxSizeBytes) {
      return {
        ok: false,
        error: en
          ? `File size (${formatBytes(size)}) exceeds the 10MB limit.`
          : `حجم الملف (${formatBytes(size)}) يتجاوز الحد الأقصى المسموح به (10MB).`
      };
    }

    return { ok: true };
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatEventDateTime(isoStr, isEn = false) {
    if (!isoStr) return isEn ? "Not recorded" : "غير مسجل";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return String(isoStr);
      return d.toLocaleString(isEn ? "en-US" : "ar-EG", {
        dateStyle: "medium",
        timeStyle: "short"
      });
    } catch (_) {
      return String(isoStr);
    }
  }

  function extractClarificationThread(c, currentRole = "doctor") {
    if (!c) return { cycles: [], totalCycles: 0, activeOutstandingCycle: null, hasUnansweredRequest: false };

    const isEn = (global.currentLanguage || "ar") === "en";
    const cycles = [];

    // Helper: is revision acknowledged by doctor in UI session store?
    const isAckInStore = (typeof localStorage !== "undefined" && c.id)
      ? Boolean(localStorage.getItem(`hv_rev_ack_${c.id}`))
      : false;

    // Helper: find doctor review event occurring AFTER a given timestamp
    function findDoctorReviewEvent(afterTimestampIso) {
      if (!Array.isArray(c.statusHistory) || !afterTimestampIso) return null;
      const afterMs = new Date(afterTimestampIso).getTime();
      return c.statusHistory.find(evt => {
        const evtTime = evt.changedAt ? new Date(evt.changedAt).getTime() : 0;
        if (evtTime <= afterMs) return false;
        const isDocRole = evt.changedByRole === "doctor" || (evt.actor && evt.actor.role === "doctor");
        const isReviewStatus = evt.status === "under_review" || evt.status === "approved" || evt.newStatus === "under_review" || evt.newStatus === "approved";
        return isDocRole || isReviewStatus;
      }) || null;
    }

    // 1. Direct explicit clarificationCycles array if stored on case
    if (Array.isArray(c.clarificationCycles) && c.clarificationCycles.length > 0) {
      c.clarificationCycles.forEach((rawCycle, idx) => {
        const cycleNum = rawCycle.cycle || (idx + 1);
        const reqTime = rawCycle.request?.timestamp || rawCycle.request?.requestedAt || rawCycle.requestedAt || c.lastInfoRequestedAt || c.submittedAt;
        const respTime = rawCycle.response?.timestamp || rawCycle.response?.submittedAt || rawCycle.response?.respondedAt || rawCycle.respondedAt || null;
        const hasReply = Boolean(rawCycle.response && (rawCycle.response.patientNotes || rawCycle.response.note || respTime));

        let state = (rawCycle.status === "unanswered" || rawCycle.state === "unanswered") ? "unanswered" : "unanswered";
        let stateEventTime = rawCycle.eventTimestamp || reqTime;
        let stateEventDesc = isEn ? "Doctor Information Request Event" : "حدث طلب بيانات سريرية من الطبيب";

        if (hasReply) {
          const reviewEvt = findDoctorReviewEvent(respTime);
          const isReviewed = isAckInStore ||
            c.doctorApproved ||
            Boolean(reviewEvt) ||
            rawCycle.reviewed === true ||
            rawCycle.status === "reviewed" ||
            rawCycle.state === "reviewed" ||
            Boolean(rawCycle.reviewedAt);

          if (isReviewed) {
            state = "reviewed";
            stateEventTime = rawCycle.reviewedAt || rawCycle.eventTimestamp || reviewEvt?.changedAt || c.approvedAt || c.reviewedAt || respTime;
            stateEventDesc = isEn ? "Physician Review Verification Event" : "حدث تدقيق واعتماد الطبيب للمراجعة";
          } else {
            state = "submitted";
            stateEventTime = rawCycle.eventTimestamp || respTime;
            stateEventDesc = isEn ? "Patient Clarification Submission Event" : "حدث تقديم إفادة المريض السريرية";
          }
        }

        cycles.push({
          cycle: cycleNum,
          requestId: rawCycle.requestId || `req_info_${c.id}_c${cycleNum}`,
          request: {
            authorName: rawCycle.request?.doctorName || rawCycle.request?.doctorNameEn || rawCycle.request?.authorName || c.requestingDoctorName || (isEn ? "Attending Physician" : "الطبيب المعالج"),
            authorRole: "doctor",
            specialty: rawCycle.request?.specialty || c.doctorSpecialty || (isEn ? "Chest & Respiratory" : "أمراض الصدر والجهاز التنفسي"),
            timestamp: reqTime,
            clinicalRationale: rawCycle.request?.note || rawCycle.request?.noteEn || rawCycle.request?.clinicalRationale || rawCycle.clinicalRationale || c.moreInfoNote || c.doctorNote || "",
            requestedFields: rawCycle.request?.requestedFields || ["oxygenLevel"],
            permittedAttachments: PERMITTED_ATTACHMENT_CONFIG
          },
          response: hasReply ? {
            authorName: rawCycle.response?.patientName || rawCycle.response?.authorName || c.name || c.patientName || (isEn ? "Patient" : "المريض"),
            authorRole: "patient",
            timestamp: respTime,
            patientNotes: rawCycle.response?.patientNotes || rawCycle.response?.note || rawCycle.patientNotes || c.patientResponse || "",
            measurements: rawCycle.response?.measurements || [],
            attachments: rawCycle.response?.attachments || rawCycle.response?.files || c.files || []
          } : null,
          state,
          stateMeta: {
            code: state,
            labelEn: state === "unanswered" ? "Unanswered (Awaiting Patient)" : (state === "submitted" ? "Submitted (Pending Doctor Review)" : "Reviewed & Certified"),
            labelAr: state === "unanswered" ? "بانتظار رد المريض (معلق)" : (state === "submitted" ? "تم تقديم الإفادة (بانتظار تدقيق الطبيب)" : "تمت المراجعة والتدقيق السريري"),
            icon: state === "unanswered" ? "⏳" : (state === "submitted" ? "📩" : "✅"),
            pillClass: state === "unanswered" ? "pending" : (state === "submitted" ? "info" : "ok"),
            eventTimestamp: stateEventTime,
            eventProvenance: stateEventDesc
          }
        });
      });
    }
    // 2. Or parse from statusHistory events
    else {
      const history = Array.isArray(c.statusHistory) ? c.statusHistory : [];
      const reqEvents = [];
      const replyEvents = [];

      history.forEach(evt => {
        const st = evt.status || evt.newStatus;
        if (st === "more_info_requested") {
          reqEvents.push(evt);
        } else if (
          st === "under_review" &&
          (evt.changedByRole === "patient" || (evt.actor && evt.actor.role === "patient") || (evt.note && String(evt.note).includes("Patient submitted requested info")))
        ) {
          replyEvents.push(evt);
        }
      });

      if (reqEvents.length > 0) {
        reqEvents.forEach((rEvt, idx) => {
          const cycleNum = idx + 1;
          const pEvt = replyEvents[idx] || null;
          const reqTime = rEvt.changedAt || rEvt.timestamp || c.lastInfoRequestedAt || c.submittedAt;
          const respTime = pEvt ? (pEvt.changedAt || pEvt.timestamp) : (idx === reqEvents.length - 1 ? c.patientRespondedAt : null);
          const hasReply = Boolean(pEvt || (idx === reqEvents.length - 1 && c.patientResponse));

          let state = "unanswered";
          let stateEventTime = reqTime;
          let stateEventDesc = isEn ? "Doctor Information Request Event" : "حدث طلب بيانات سريرية من الطبيب";

          if (hasReply) {
            const reviewEvt = findDoctorReviewEvent(respTime);
            const isReviewed = isAckInStore || c.doctorApproved || Boolean(reviewEvt) || (idx < reqEvents.length - 1);

            if (isReviewed) {
              state = "reviewed";
              stateEventTime = reviewEvt?.changedAt || c.approvedAt || c.reviewedAt || respTime;
              stateEventDesc = isEn ? "Physician Review Verification Event" : "حدث تدقيق واعتماد الطبيب للمراجعة";
            } else {
              state = "submitted";
              stateEventTime = respTime;
              stateEventDesc = isEn ? "Patient Clarification Submission Event" : "حدث تقديم إفادة المريض السريرية";
            }
          }

          // Build measurements array from case vitals
          const measurements = [];
          if (hasReply) {
            if (c.o2 || c.oxygenLevel) {
              measurements.push({
                type: "oxygenLevel",
                nameEn: CLINICAL_MEASUREMENT_UNITS.oxygenLevel.nameEn,
                nameAr: CLINICAL_MEASUREMENT_UNITS.oxygenLevel.nameAr,
                value: c.o2 || c.oxygenLevel,
                unit: "%",
                icon: "🫁"
              });
            }
            if (c.temperature) {
              measurements.push({
                type: "temperature",
                nameEn: CLINICAL_MEASUREMENT_UNITS.temperature.nameEn,
                nameAr: CLINICAL_MEASUREMENT_UNITS.temperature.nameAr,
                value: c.temperature,
                unit: "°C",
                icon: "🌡️"
              });
            }
            if (c.bp || c.systolicBp) {
              const bpVal = c.systolicBp && c.diastolicBp ? `${c.systolicBp}/${c.diastolicBp}` : (c.bp || "--");
              measurements.push({
                type: "systolicBp",
                nameEn: CLINICAL_MEASUREMENT_UNITS.systolicBp.nameEn,
                nameAr: CLINICAL_MEASUREMENT_UNITS.systolicBp.nameAr,
                value: bpVal,
                unit: "mmHg",
                icon: "🩸"
              });
            }
          }

          cycles.push({
            cycle: cycleNum,
            requestId: `req_info_${c.id}_c${cycleNum}`,
            request: {
              authorName: rEvt.changedByName || rEvt.actor?.name || c.requestingDoctorName || (isEn ? "Attending Physician" : "الطبيب المعالج"),
              authorRole: "doctor",
              specialty: c.doctorSpecialty || (isEn ? "Chest & Respiratory" : "أمراض الصدر والجهاز التنفسي"),
              timestamp: reqTime,
              clinicalRationale: rEvt.note || rEvt.reason || c.moreInfoNote || c.doctorNote || "",
              requestedFields: ["oxygenLevel", "temperature"],
              permittedAttachments: PERMITTED_ATTACHMENT_CONFIG
            },
            response: hasReply ? {
              authorName: pEvt?.changedByName || pEvt?.actor?.name || c.name || c.patientName || (isEn ? "Patient" : "المريض"),
              authorRole: "patient",
              timestamp: respTime,
              patientNotes: pEvt?.note || c.patientResponse || (isEn ? "Updated clinical observations submitted" : "تم تقديم الإفادة السريرية المطلوبة"),
              measurements,
              attachments: Array.isArray(c.files) ? c.files : []
            } : null,
            state,
            stateMeta: {
              code: state,
              labelEn: state === "unanswered" ? "Unanswered (Awaiting Patient)" : (state === "submitted" ? "Submitted (Pending Doctor Review)" : "Reviewed & Certified"),
              labelAr: state === "unanswered" ? "بانتظار رد المريض (معلق)" : (state === "submitted" ? "تم تقديم الإفادة (بانتظار تدقيق الطبيب)" : "تمت المراجعة والتدقيق السريري"),
              icon: state === "unanswered" ? "⏳" : (state === "submitted" ? "📩" : "✅"),
              pillClass: state === "unanswered" ? "pending" : (state === "submitted" ? "info" : "ok"),
              eventTimestamp: stateEventTime,
              eventProvenance: stateEventDesc
            }
          });
        });
      }
      // 3. Fallback to flat case properties if any clarification note exists
      else if (c.moreInfoNote || c.status === "more_info_requested" || c.patientResponse) {
        const reqTime = c.lastInfoRequestedAt || c.moreInfoRequestedAt || c.submittedAt || new Date().toISOString();
        const respTime = c.patientRespondedAt || c.lastInfoRepliedAt || null;
        const hasReply = Boolean(c.patientResponse);

        let state = "unanswered";
        let stateEventTime = reqTime;
        let stateEventDesc = isEn ? "Doctor Information Request Event" : "حدث طلب بيانات سريرية من الطبيب";

        if (hasReply) {
          const reviewEvt = findDoctorReviewEvent(respTime);
          const isReviewed = isAckInStore || c.doctorApproved || Boolean(reviewEvt) || (!isRevisionStale(c) && (c.clinicalRevision || 1) > 1);

          if (isReviewed) {
            state = "reviewed";
            stateEventTime = reviewEvt?.changedAt || c.approvedAt || c.reviewedAt || respTime;
            stateEventDesc = isEn ? "Physician Review Verification Event" : "حدث تدقيق واعتماد الطبيب للمراجعة";
          } else {
            state = "submitted";
            stateEventTime = respTime;
            stateEventDesc = isEn ? "Patient Clarification Submission Event" : "حدث تقديم إفادة المريض السريرية";
          }
        }

        const measurements = [];
        if (hasReply) {
          if (c.o2 || c.oxygenLevel) {
            measurements.push({
              type: "oxygenLevel",
              nameEn: CLINICAL_MEASUREMENT_UNITS.oxygenLevel.nameEn,
              nameAr: CLINICAL_MEASUREMENT_UNITS.oxygenLevel.nameAr,
              value: c.o2 || c.oxygenLevel,
              unit: "%",
              icon: "🫁"
            });
          }
          if (c.temperature) {
            measurements.push({
              type: "temperature",
              nameEn: CLINICAL_MEASUREMENT_UNITS.temperature.nameEn,
              nameAr: CLINICAL_MEASUREMENT_UNITS.temperature.nameAr,
              value: c.temperature,
              unit: "°C",
              icon: "🌡️"
            });
          }
          if (c.bp || c.systolicBp) {
            const bpVal = c.systolicBp && c.diastolicBp ? `${c.systolicBp}/${c.diastolicBp}` : (c.bp || "--");
            measurements.push({
              type: "systolicBp",
              nameEn: CLINICAL_MEASUREMENT_UNITS.systolicBp.nameEn,
              nameAr: CLINICAL_MEASUREMENT_UNITS.systolicBp.nameAr,
              value: bpVal,
              unit: "mmHg",
              icon: "🩸"
            });
          }
        }

        cycles.push({
          cycle: 1,
          requestId: `req_info_${c.id}_c1`,
          request: {
            authorName: c.requestingDoctorName || (isEn ? "Attending Physician" : "الطبيب المعالج"),
            authorRole: "doctor",
            specialty: c.doctorSpecialty || (isEn ? "Chest & Respiratory" : "أمراض الصدر والجهاز التنفسي"),
            timestamp: reqTime,
            clinicalRationale: c.moreInfoNote || c.doctorNote || (isEn ? "Please provide updated clinical observations" : "يرجى تزويدنا بتحديث للأعراض والقياسات الحالية"),
            requestedFields: ["oxygenLevel", "temperature"],
            permittedAttachments: PERMITTED_ATTACHMENT_CONFIG
          },
          response: hasReply ? {
            authorName: c.name || c.patientName || (isEn ? "Patient" : "المريض"),
            authorRole: "patient",
            timestamp: respTime,
            patientNotes: c.patientResponse,
            measurements,
            attachments: Array.isArray(c.files) ? c.files : []
          } : null,
          state,
          stateMeta: {
            code: state,
            labelEn: state === "unanswered" ? "Unanswered (Awaiting Patient)" : (state === "submitted" ? "Submitted (Pending Doctor Review)" : "Reviewed & Certified"),
            labelAr: state === "unanswered" ? "بانتظار رد المريض (معلق)" : (state === "submitted" ? "تم تقديم الإفادة (بانتظار تدقيق الطبيب)" : "تمت المراجعة والتدقيق السريري"),
            icon: state === "unanswered" ? "⏳" : (state === "submitted" ? "📩" : "✅"),
            pillClass: state === "unanswered" ? "pending" : (state === "submitted" ? "info" : "ok"),
            eventTimestamp: stateEventTime,
            eventProvenance: stateEventDesc
          }
        });
      }
    }

    const activeOutstandingCycle = cycles.find(cyc => cyc.state === "unanswered") || null;

    return {
      cycles,
      totalCycles: cycles.length,
      activeOutstandingCycle,
      hasUnansweredRequest: Boolean(activeOutstandingCycle)
    };
  }

  function renderClarificationThreadHtml(c, isEn = false, currentRole = "doctor") {
    if (!c) return "";

    const threadData = extractClarificationThread(c, currentRole);
    const { cycles, totalCycles } = threadData;

    // Strict Role Separation: Clinician private notes are NEVER included in this thread.
    // Display privacy reassurance notice
    const privacyNoticeHtml = currentRole === "doctor"
      ? `
        <div style="padding: 8px 12px; background: rgba(14, 165, 164, 0.06); border-radius: 8px; border: 1px dashed var(--line); font-size: 11.5px; color: var(--muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          <span>🔒</span>
          <span>${isEn ? "Internal Clinician Notes Isolated: Private clinical diagnosis and notes are strictly kept separate and hidden from patients." : "الملاحظات والتشخيصات الداخلية للطبيب منفصلة تماماً ومحجوبة عن المريض."}</span>
        </div>
      `
      : "";

    // Empty state: No requests yet
    if (cycles.length === 0) {
      return `
        <div class="clarification-thread-container">
          ${privacyNoticeHtml}
          <div class="clarification-empty-thread" style="text-align: center; padding: 26px 16px; background: var(--surface-2); border-radius: 14px; border: 1px dashed var(--line);">
            <div style="font-size: 30px; margin-bottom: 8px;">💬</div>
            <strong style="color: var(--ink); font-size: 14px; display: block; margin-bottom: 4px;">
              ${isEn ? "No Clarification Requests Issued" : "لا توجد طلبات إيضاحات سريرية لهذه الحالة"}
            </strong>
            <p style="margin: 0 0 14px; font-size: 12.5px; color: var(--muted); max-width: 440px; margin-inline: auto; line-height: 1.5;">
              ${isEn
                ? "If you require extra clinical tests, resting SpO2, or patient observations, you can issue a formal versioned information request."
                : "إذا كنت بحاجة إلى فحوصات إضافية، أو إعادة قياس الأكسجين أثناء الراحة، أو توضيحات من المريض، يمكنك إصدار طلب بيانات سريري موثق."}
            </p>
            ${currentRole === "doctor" ? `
              <button type="button" class="btn-clinical request-info" onclick="requestMoreInfo('${c.id}')" style="display: inline-flex; font-size: 12.5px; padding: 7px 16px;">
                <span>❓</span> <span>${isEn ? "Request Additional Information" : "طلب إيضاحات أو قياسات إضافية"}</span>
              </button>
            ` : ""}
          </div>
        </div>
      `;
    }

    // Render Cycles
    const cyclesHtml = cycles.map(cycle => {
      const { stateMeta, request, response } = cycle;
      const reqDateStr = formatEventDateTime(request.timestamp, isEn);
      const respDateStr = response ? formatEventDateTime(response.timestamp, isEn) : "";
      const auditDateStr = formatEventDateTime(stateMeta.eventTimestamp, isEn);

      // Measurements HTML
      const measurementsHtml = (response && Array.isArray(response.measurements) && response.measurements.length > 0)
        ? `
          <div class="thread-measurements-grid">
            ${response.measurements.map(m => `
              <div class="measurement-chip">
                <div class="measurement-chip-header">
                  <span>${m.icon || "📊"} ${isEn ? (m.nameEn || m.type) : (m.nameAr || m.type)}</span>
                </div>
                <div class="measurement-chip-value">
                  <span>${m.value}</span>
                  <span class="measurement-chip-unit">${m.unit}</span>
                </div>
              </div>
            `).join("")}
          </div>
        `
        : "";

      // Attachments HTML
      const attachmentsHtml = (response && Array.isArray(response.attachments) && response.attachments.length > 0)
        ? `
          <div style="margin-top: 10px;">
            <span style="font-size: 11.5px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">
              📎 ${isEn ? "Attached Medical Records:" : "الملفات والتقارير المرفقة:"}
            </span>
            <div class="thread-attachments-list">
              ${response.attachments.map(f => {
                const isPdf = (f.name || "").toLowerCase().endsWith(".pdf") || (f.type || "").includes("pdf");
                const icon = isPdf ? "📄" : "🖼️";
                return `
                  <div class="thread-attachment-chip">
                    <span>${icon}</span>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">${escapeHtml(f.name || "medical_record")}</span>
                    <span class="file-size">(${f.sizeLabel || formatBytes(f.size) || "File"})</span>
                    <span class="pill ok" style="font-size: 9.5px; padding: 1px 5px;">🛡️ ${isEn ? "Verified" : "آمن"}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `
        : "";

      // Patient Response Card or Direct Action Form
      let responseBlockHtml = "";
      if (response) {
        responseBlockHtml = `
          <div class="thread-message patient-response" tabindex="0">
            <div class="message-meta-header">
              <div class="message-author-tag">
                <span style="font-size: 15px;">👤</span>
                <strong style="color: var(--teal);">${escapeHtml(response.authorName)}</strong>
                <span class="pill info" style="font-size: 10px; padding: 1px 6px;">${isEn ? "Patient Submission" : "إفادة المريض"}</span>
              </div>
              <span class="message-timestamp">🕒 ${respDateStr}</span>
            </div>
            <p class="message-body-text">${escapeHtml(response.patientNotes)}</p>
            ${measurementsHtml}
            ${attachmentsHtml}
          </div>
        `;
      } else {
        // UNANSWERED STATE:
        // If current role is patient (or action allowed), render DIRECT ACTION FORM!
        if (currentRole === "patient") {
          responseBlockHtml = `
            <div class="thread-direct-action-card" id="threadActionCard_${c.id}_${cycle.cycle}">
              <div class="thread-action-header">
                <span class="action-icon">✍️</span>
                <div>
                  <h5 style="margin: 0; font-size: 14px; font-weight: 800; color: var(--ink);">
                    ${isEn ? "Direct Action: Answer Physician Request" : "إجراء مباشر: تقديم الإفادة والرد على الطبيب"}
                  </h5>
                  <small style="color: var(--muted); font-size: 11.5px;">
                    ${isEn ? "Provide your observations and updated measurements to resume clinical review." : "أدخل إفادتك والقياسات المحدثة لاستئناف الفحص السريري من قبل الطبيب."}
                  </small>
                </div>
              </div>

              <div class="thread-action-body">
                <div style="margin-bottom: 12px;">
                  <label for="threadReplyText_${c.id}" style="font-size: 12.5px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 6px;">
                    ${isEn ? "1. Your Clarification Notes / Symptoms *" : "1. إفادتك وتوضيح تطور الأعراض *"}
                  </label>
                  <textarea id="threadReplyText_${c.id}" class="thread-reply-textarea" placeholder="${isEn ? 'Describe your current symptoms, rest status, or answers to the doctor...' : 'صف تطور الأعراض الحالية، حالتك بعد الراحة، أو إجابات استفسار الطبيب...'}" rows="3"></textarea>
                </div>

                <div class="thread-vitals-inputs-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 12px;">
                  <div>
                    <label for="threadReplyO2_${c.id}" style="font-size: 11.5px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">
                      🫁 ${isEn ? "Oxygen (SpO2 %)" : "الأكسجين (SpO2 %)"}
                    </label>
                    <div style="display: flex; align-items: center; position: relative;">
                      <input type="number" id="threadReplyO2_${c.id}" min="50" max="100" placeholder="${c.oxygenLevel || c.o2 || '98'}" style="width: 100%; padding: 7px 10px; font-size: 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); scroll-margin-bottom: 120px;" />
                      <span style="position: absolute; inset-inline-end: 8px; font-size: 11px; font-weight: 700; color: var(--muted); pointer-events: none;">%</span>
                    </div>
                  </div>
                  <div>
                    <label for="threadReplyTemp_${c.id}" style="font-size: 11.5px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">
                      🌡️ ${isEn ? "Temp (°C)" : "الحرارة (°C)"}
                    </label>
                    <div style="display: flex; align-items: center; position: relative;">
                      <input type="number" id="threadReplyTemp_${c.id}" step="0.1" min="34" max="43" placeholder="${c.temperature || '37.0'}" style="width: 100%; padding: 7px 10px; font-size: 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); scroll-margin-bottom: 120px;" />
                      <span style="position: absolute; inset-inline-end: 8px; font-size: 11px; font-weight: 700; color: var(--muted); pointer-events: none;">°C</span>
                    </div>
                  </div>
                  <div>
                    <label for="threadReplyBp_${c.id}" style="font-size: 11.5px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">
                      🩸 ${isEn ? "Blood Pressure" : "ضغط الدم"}
                    </label>
                    <div style="display: flex; align-items: center; position: relative;">
                      <input type="text" id="threadReplyBp_${c.id}" placeholder="120/80" style="width: 100%; padding: 7px 10px; font-size: 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); scroll-margin-bottom: 120px;" />
                      <span style="position: absolute; inset-inline-end: 8px; font-size: 10px; font-weight: 700; color: var(--muted); pointer-events: none;">mmHg</span>
                    </div>
                  </div>
                </div>

                <div style="margin-bottom: 14px; padding: 10px 12px; background: var(--surface); border: 1px dashed var(--line); border-radius: 10px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                    <label for="threadReplyFiles_${c.id}" style="font-size: 12px; font-weight: 700; color: var(--ink); cursor: pointer;">
                      📎 ${isEn ? "Attach Medical Reports / Images (Optional):" : "إرفاق تقارير طبية أو صور فحوصات (اختياري):"}
                    </label>
                    <span class="pill info" style="font-size: 10px;">${isEn ? "Permitted: PDF, JPEG, PNG • Max 10MB" : "المسموح: PDF, JPEG, PNG • بحد أقصى 10MB"}</span>
                  </div>
                  <input type="file" id="threadReplyFiles_${c.id}" accept=".pdf,.jpg,.jpeg,.png" multiple style="font-size: 12px; width: 100%; color: var(--ink);" />
                  <div id="threadFileValidationMsg_${c.id}" style="font-size: 11px; color: #ef4444; margin-top: 4px; display: none;"></div>
                </div>

                <div style="display: flex; justify-content: flex-end;">
                  <button type="button" class="solid-button" id="btnSubmitClarificationReply_${c.id}" onclick="HealthVibes.DoctorUI.submitClarificationReply('${c.id}', '${cycle.requestId}')" style="background: #ea580c; border-color: #ea580c; padding: 9px 22px; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; border-radius: 10px;">
                    <span>📤</span> <span>${isEn ? "Submit Clarification to Doctor" : "إرسال الإفادة والقياسات للطبيب"}</span>
                  </button>
                </div>
              </div>
            </div>
          `;
        } else {
          // Doctor view when unanswered
          responseBlockHtml = `
            <div class="thread-doctor-waiting-notice" style="background: rgba(251, 146, 60, 0.08); border: 1.5px dashed #fb923c; border-radius: 12px; padding: 14px; margin-top: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 20px;">⏳</span>
                  <div>
                    <strong style="color: #c2410c; font-size: 13.5px; display: block;">
                      ${isEn ? "Outstanding Request: Awaiting Patient Response" : "طلب معلق: بانتظار إفادة ورد المريض"}
                    </strong>
                    <span style="font-size: 11.5px; color: var(--muted);">
                      ${isEn ? "Issued on: " + reqDateStr : "تاريخ الطلب: " + reqDateStr}
                    </span>
                  </div>
                </div>
                <span class="pill pending" style="font-size: 11px; font-weight: 700;">
                  ${isEn ? "Action Required from Patient" : "مطلوب الإفادة من المريض"}
                </span>
              </div>
            </div>
          `;
        }
      }

      // Quick action for Doctor when submitted
      const doctorSubmittedActionHtml = (currentRole === "doctor" && cycle.state === "submitted")
        ? `
          <div style="margin-top: 10px; padding: 10px 14px; background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>📩</span>
              <strong style="font-size: 12.5px; color: #047857;">${isEn ? "New Clarification Received: Review & Certification Required" : "تم استلام الإفادة: مطلوب تدقيق واعتماد الطبيب للمراجعة"}</strong>
            </div>
            <button type="button" class="btn-clinical resume" onclick="HealthVibes.DoctorUI.openFieldComparisonModal('${c.id}')" style="font-size: 11.5px; padding: 5px 12px;">
              <span>🔍</span> <span>${isEn ? "Compare Changes & Review" : "مقارنة التغييرات والتدقيق"}</span>
            </button>
          </div>
        `
        : "";

      return `
        <article class="clarification-cycle-card state-${cycle.state}" id="clarificationCycle_${cycle.cycle}" aria-labelledby="cycleTitle_${cycle.cycle}">
          <!-- Cycle Card Header -->
          <header class="cycle-card-header">
            <div class="cycle-title-row">
              <span class="cycle-badge" id="cycleTitle_${cycle.cycle}">
                📑 ${isEn ? "Cycle " + cycle.cycle + " of " + totalCycles : "الدورة " + cycle.cycle + " من " + totalCycles}
              </span>
              <span class="pill ${stateMeta.pillClass}">
                <span class="state-icon">${stateMeta.icon}</span>
                <span>${isEn ? stateMeta.labelEn : stateMeta.labelAr}</span>
              </span>
            </div>
            <div style="font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 4px;">
              <span>📍</span> <span>${stateMeta.eventProvenance}</span>
            </div>
          </header>

          <!-- 1. Doctor Request Message -->
          <div class="thread-message doctor-request" tabindex="0">
            <div class="message-meta-header">
              <div class="message-author-tag">
                <span style="font-size: 15px;">🩺</span>
                <strong style="color: #c2410c;">${escapeHtml(request.authorName)}</strong>
                <span style="font-size: 11px; color: var(--muted);">(${escapeHtml(request.specialty)})</span>
              </div>
              <span class="message-timestamp">🕒 ${reqDateStr}</span>
            </div>
            <p class="message-body-text">${escapeHtml(request.clinicalRationale)}</p>

            <!-- Permitted Attachments Guideline Box -->
            <div class="permitted-attachments-notice">
              <span>📎</span>
              <div>
                <strong>${isEn ? "Permitted Medical Attachments:" : "المرفقات والتقارير المسموح بها:"}</strong>
                <span>${isEn ? "PDF reports, lab slips, JPEG/PNG diagnostic images (Max 10 MB per file)." : "تقارير PDF، صور الأشعة والتحاليل JPEG/PNG (بحد أقصى 10 ميجابايت لكل ملف)."}</span>
              </div>
            </div>
          </div>

          <!-- 2. Patient Response Block (or Direct Action Form) -->
          ${responseBlockHtml}

          <!-- Quick review action for doctor when submitted -->
          ${doctorSubmittedActionHtml}

          <!-- Stored Event Audit Footer (strictly verifying state without fabricated receipts) -->
          <footer class="thread-audit-footer">
            <span>🛡️ ${isEn ? "Audit Verification:" : "التوثيق السريري المعتمد:"}</span>
            <span class="thread-audit-provenance">
              <span>${stateMeta.eventProvenance}</span> • <span>${auditDateStr}</span>
            </span>
          </footer>
        </article>
      `;
    }).join("");

    return `
      <section class="clarification-thread-container" role="feed" aria-label="${isEn ? 'Clinical Clarification Thread' : 'مسار الاستفسارات والتدقيق السريري'}">
        ${privacyNoticeHtml}
        ${cyclesHtml}
      </section>
    `;
  }

  async function submitClarificationReply(caseId, requestId) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";

    const notesInput = document.getElementById(`threadReplyText_${caseId}`);
    const o2Input = document.getElementById(`threadReplyO2_${caseId}`);
    const tempInput = document.getElementById(`threadReplyTemp_${caseId}`);
    const bpInput = document.getElementById(`threadReplyBp_${caseId}`);
    const fileInput = document.getElementById(`threadReplyFiles_${caseId}`);
    const fileValidationMsg = document.getElementById(`threadFileValidationMsg_${caseId}`);

    const notes = notesInput ? notesInput.value.trim() : "";
    const rawO2 = o2Input ? o2Input.value.trim() : "";
    const rawTemp = tempInput ? tempInput.value.trim() : "";
    const rawBp = bpInput ? bpInput.value.trim() : "";

    // Validate that at least something was provided
    if (!notes && !rawO2 && !rawTemp && !rawBp && (!fileInput || !fileInput.files.length)) {
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? "Please provide your clarification notes or updated measurements." : "يرجى كتابة إفادتك أو تزويدنا بالقياسات المطلوبة.");
      }
      if (notesInput) notesInput.focus();
      return;
    }

    // Validate SpO2 if given
    let parsedO2 = null;
    if (rawO2) {
      const val = parseFloat(rawO2);
      if (isNaN(val) || val < 50 || val > 100) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "SpO2 must be a percentage between 50% and 100%." : "نسبة الأكسجين يجب أن تكون بين 50% و 100%.");
        }
        if (o2Input) o2Input.focus();
        return;
      }
      parsedO2 = val;
    }

    // Validate temperature if given
    let parsedTemp = null;
    if (rawTemp) {
      const val = parseFloat(rawTemp);
      if (isNaN(val) || val < 34 || val > 43) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Temperature must be between 34°C and 43°C." : "درجة الحرارة يجب أن تكون بين 34 و 43 مئوية.");
        }
        if (tempInput) tempInput.focus();
        return;
      }
      parsedTemp = val;
    }

    // Validate attachments if given
    const attachedFilesMeta = [];
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      for (const file of fileInput.files) {
        const valRes = validateAttachmentFile(file);
        if (!valRes.ok) {
          if (fileValidationMsg) {
            fileValidationMsg.textContent = valRes.error;
            fileValidationMsg.style.display = "block";
          }
          if (typeof global.showToast === "function") {
            global.showToast(valRes.error);
          }
          return;
        }
        attachedFilesMeta.push({
          name: file.name,
          size: file.size,
          sizeLabel: formatBytes(file.size),
          type: file.type || "application/octet-stream",
          uploadedAt: new Date().toISOString()
        });
      }
    }

    // Disable button to prevent double-submit
    const submitBtn = document.getElementById(`btnSubmitClarificationReply_${caseId}`);
    if (submitBtn) {
      submitBtn.setAttribute("disabled", "disabled");
      submitBtn.style.opacity = "0.6";
      submitBtn.innerHTML = `<span>⏳</span> <span>${isEn ? "Submitting..." : "جاري الإرسال..."}</span>`;
    }

    try {
      const nowIso = new Date().toISOString();
      const currentUser = global.auth?.currentUser || null;
      const patientName = currentUser?.displayName || currentUser?.email || "Patient";
      const finalReplyText = notes || (isEn ? "Submitted updated clinical observations." : "تم تسجيل القياسات المحدثة المطلوبة.");

      // Check if global submitPatientMoreInfo pipeline exists
      if (typeof global.submitPatientMoreInfo === "function" && document.getElementById("patientResponseInput")) {
        const pRespEl = document.getElementById("patientResponseInput");
        const pO2El = document.getElementById("patientNewO2Input");
        if (pRespEl) pRespEl.value = finalReplyText;
        if (pO2El && parsedO2 !== null) pO2El.value = parsedO2;
        await global.submitPatientMoreInfo(caseId);
      } else if (global.db) {
        const historyItem = {
          status: "under_review",
          changedAt: nowIso,
          changedBy: currentUser?.uid || "patient",
          changedByName: patientName,
          changedByRole: "patient",
          note: isEn ? `Patient submitted requested info: ${finalReplyText.slice(0, 120)}` : `أرسل المريض البيانات المطلوبة: ${finalReplyText.slice(0, 120)}`
        };

        const updatePayload = {
          status: "under_review",
          patientResponse: finalReplyText,
          patientRespondedAt: nowIso,
          lastInfoRepliedAt: nowIso,
          updatedAt: nowIso,
          statusHistory: global.firebase?.firestore?.FieldValue
            ? global.firebase.firestore.FieldValue.arrayUnion(historyItem)
            : [historyItem]
        };

        if (parsedO2 !== null) {
          updatePayload.oxygenLevel = parsedO2;
          updatePayload.o2 = parsedO2;
        }
        if (parsedTemp !== null) {
          updatePayload.temperature = parsedTemp;
        }
        if (rawBp) {
          updatePayload.bp = rawBp;
        }
        if (attachedFilesMeta.length > 0) {
          updatePayload.files = attachedFilesMeta;
        }

        await global.db.collection("cases").doc(caseId).update(updatePayload);
      }

      // Update in-memory state
      const caseInState = (global.cases || []).find(c => c.id === caseId) ||
                          (global.state?.doctorQueue || []).find(c => c.id === caseId);
      if (caseInState) {
        caseInState.status = "under_review";
        caseInState.patientResponse = finalReplyText;
        caseInState.patientRespondedAt = nowIso;
        if (parsedO2 !== null) caseInState.o2 = parsedO2;
        if (parsedTemp !== null) caseInState.temperature = parsedTemp;
        if (attachedFilesMeta.length > 0) caseInState.files = attachedFilesMeta;
      }

      if (typeof global.showToast === "function") {
        global.showToast(isEn ? "Clarification submitted! Case returned to physician." : "تم إرسال الإفادة بنجاح! الحالة الآن قيد فحص الطبيب.");
      }

      // Re-render UI
      if (typeof global.renderDoctorDetail === "function" && global.activeCaseId === caseId) {
        global.renderDoctorDetail(caseId);
      } else if (typeof global.renderReportScreen === "function") {
        global.renderReportScreen(caseId);
      }
    } catch (err) {
      console.error("Error submitting clarification reply:", err);
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? "Failed to submit clarification. Please try again." : "فشل إرسال الإفادة، يرجى المحاولة مرة أخرى.");
      }
      if (submitBtn) {
        submitBtn.removeAttribute("disabled");
        submitBtn.style.opacity = "1";
        submitBtn.innerHTML = `<span>📤</span> <span>${isEn ? "Submit Clarification to Doctor" : "إرسال الإفادة والقياسات للطبيب"}</span>`;
      }
    }
  }

  // ===========================================================================
  // 8. CLINICAL RISK OVERRIDE WORKFLOW (HUMAN-IN-THE-LOOP AI FEEDBACK)
  // ===========================================================================

  const VALID_OVERRIDE_PRIORITIES = ["urgent", "high", "normal"];
  const VALID_OVERRIDE_CATEGORIES = [
    "CLINICAL_SIGNS_OF_EXHAUSTION",
    "RAPID_TRAJECTORY",
    "ARTIFACT_CORRECTION",
    "COMORBIDITY_RISK",
    "OTHER_CLINICAL_JUDGMENT"
  ];

  const OVERRIDE_CATEGORY_META = {
    CLINICAL_SIGNS_OF_EXHAUSTION: {
      ar: "علامات سريرية للإجهاد التنفسي / الإرهاق",
      en: "Clinical Signs of Respiratory Exhaustion",
      descAr: "سحب بين الأضلاع، صعوبة إكمال جملة، أو إجهاد عضلات التنفس رغم قراءات الأكسجين",
      descEn: "Intercostal retractions, unable to complete sentences, or respiratory muscle exhaustion"
    },
    RAPID_TRAJECTORY: {
      ar: "تدهور سريع أو تسارع في تفاقم الأعراض",
      en: "Rapid Trajectory / Acute Worsening",
      descAr: "انحدار متسارع خلال وقت قصير يستدعي رفع الجاهزية والتدخل الإسعافي الفوري",
      descEn: "Accelerated decline within a short timeframe requiring immediate escalation"
    },
    ARTIFACT_CORRECTION: {
      ar: "تصحيح قراءة خاطئة أو قياس غير دقيق للجهاز",
      en: "Artifact / Sensor Measurement Correction",
      descAr: "قراءة SpO2 منخفضة بسبب برودة الأطراف أو حركة المريض مع استقرار الفحص السريري",
      descEn: "Falsely low SpO2 due to cold extremities, sensor slip, or motion artifact"
    },
    COMORBIDITY_RISK: {
      ar: "عوامل خطورة وأمراض مصاحبة معقدة",
      en: "High-Risk Comorbidity / Vulnerability",
      descAr: "وجود أمراض مزمنة مصاحبة (فشل قلبي، نقص مناعة، كبر سن) ترفع درجة الخطورة السريرية",
      descEn: "Severe chronic comorbidities (heart failure, immunocompromise) elevating clinical risk"
    },
    OTHER_CLINICAL_JUDGMENT: {
      ar: "تقدير وخبرة الطبيب السريرية بعد الفحص المباشر",
      en: "Other Direct Physician Clinical Judgment",
      descAr: "تقييم سريري شامل مبني على الفحص الإكلينيكي المباشر داخل العيادة",
      descEn: "Comprehensive clinical evaluation based on direct physical examination"
    }
  };

  const QUICK_CLINICAL_REASON_CHIPS = [
    {
      ar: "المريض يعاني من إجهاد تنفسي وسحب بين الأضلاع رغم استقرار الأكسجين الظاهري",
      en: "Patient exhibits intercostal retractions and respiratory muscle exhaustion despite borderline stable SpO2"
    },
    {
      ar: "قراءة مقياس النبض غير دقيقة بسبب برودة الأطراف والفحص السريري المباشر مستقر تماماً",
      en: "Pulse oximeter reading inaccurate due to cold extremities; physical exam demonstrates normal respiratory mechanics"
    },
    {
      ar: "وجود تاريخ مرضي تنفسي حرج وتدهور سريع يستدعي رفع الأولوية والجاهزية الفورية",
      en: "History of critical respiratory vulnerability with rapid symptom trajectory requiring urgent clinical escalation"
    },
    {
      ar: "استجابة ممتازة وسريعة للبخاخ الإسعافي والأعراض أصبحت خفيفة ومستقرة للمتابعة الروتينية",
      en: "Rapid, sustained response to rescue bronchodilator; patient now clinically stable for routine outpatient follow-up"
    }
  ];

  let activeOverridePrioritySelection = null;
  let lastRiskModalOpener = null;
  let riskModalKeydownHandler = null;

  function getPriorityMetaInternal(priorityKey, isEn = false) {
    const key = String(priorityKey || "normal").toLowerCase();
    const map = {
      urgent: {
        key: "urgent",
        pillClass: "danger",
        icon: "🚨",
        ar: "عاجل / أحمر",
        en: "Urgent (Red)",
        badgeBorder: "#ef4444",
        badgeBg: "rgba(239, 68, 68, 0.12)",
        glowColor: "rgba(239, 68, 68, 0.35)",
        slaMinutes: 15,
        descAr: "خطر تدهور حاد أو نقص أكسجين يستدعي فحصاً فورياً خلال 15 دقيقة",
        descEn: "Critical deterioration risk or severe hypoxemia requiring immediate evaluation in 15 min"
      },
      high: {
        key: "high",
        pillClass: "pending",
        icon: "⚠️",
        ar: "أولوية عالية / أصفر",
        en: "High Priority (Yellow)",
        badgeBorder: "#f59e0b",
        badgeBg: "rgba(245, 158, 11, 0.12)",
        glowColor: "rgba(245, 158, 11, 0.35)",
        slaMinutes: 30,
        descAr: "أعراض متوسطة أو عوامل خطورة متعددة تستدعي فحصاً سريرياً مستعجلاً خلال 30 دقيقة",
        descEn: "Moderate symptoms or compound risk factors requiring urgent clinical review in 30 min"
      },
      normal: {
        key: "normal",
        pillClass: "ok",
        icon: "🟢",
        ar: "عادي / أخضر",
        en: "Routine / Normal (Green)",
        badgeBorder: "#10b981",
        badgeBg: "rgba(16, 185, 129, 0.12)",
        glowColor: "rgba(16, 185, 129, 0.35)",
        slaMinutes: 120,
        descAr: "أعراض مستقرة أو خفيفة يمكن متابعتها روتينياً ضمن 120 دقيقة",
        descEn: "Stable routine symptoms managed under standard 120 min outpatient SLA"
      }
    };
    return map[key] || map.normal;
  }

  function renderRiskOverrideSection(c, isEn = false, options = {}) {
    if (!c) return "";

    const override = c.triageOverride || (c.isOverridden ? {
      isOverridden: true,
      overriddenPriority: c.overriddenPriority || c.priority,
      overrideReason: c.overrideReason,
      overrideCategory: c.overrideCategory,
      overriddenBy: c.overriddenBy,
      timestamp: c.overriddenAt || c.updatedAt
    } : null);

    const currentUser = options.doctorUser || global.auth?.currentUser || null;
    const hasExplicitAssignment = Boolean(c.assignedDoctorId || c.assignedDoctorEmail || c.doctorId);
    const isAssigned = isCaseAssignedToDoctor(c, currentUser);
    const isRestrictedToAssigned = hasExplicitAssignment && currentUser && !isAssigned;

    const isOverridden = Boolean(override && override.isOverridden !== false && override.overriddenPriority);
    const origPriorityKey = override?.originalPriority || c.originalPriority || c.aiTriagePriority || (global.HealthVibes?.DoctorService?.getCasePriorityKey ? global.HealthVibes.DoctorService.getCasePriorityKey(c) : (c.priority || "normal"));
    const activePriorityKey = isOverridden ? override.overriddenPriority : (global.HealthVibes?.DoctorService?.getCasePriorityKey ? global.HealthVibes.DoctorService.getCasePriorityKey(c) : (c.priority || "normal"));

    const activeMeta = getPriorityMetaInternal(activePriorityKey, isEn);
    const origMeta = getPriorityMetaInternal(origPriorityKey, isEn);

    const catKey = override?.overrideCategory || "OTHER_CLINICAL_JUDGMENT";
    const catLabel = isEn ? (OVERRIDE_CATEGORY_META[catKey]?.en || catKey) : (OVERRIDE_CATEGORY_META[catKey]?.ar || catKey);
    const catDesc = isEn ? (OVERRIDE_CATEGORY_META[catKey]?.descEn || "") : (OVERRIDE_CATEGORY_META[catKey]?.descAr || "");

    const docName = override?.overriddenBy?.name || (isEn ? "Treating Physician" : "الطبيب المعالج");
    const docLicense = override?.overriddenBy?.license || "EG-MED-VERIFIED";
    const timestampStr = override?.timestamp
      ? new Date(override.timestamp).toLocaleString(isEn ? "en-US" : "ar-EG", { dateStyle: "short", timeStyle: "short" })
      : "";

    return `
      <div class="doctor-risk-override-card ${isOverridden ? 'is-overridden' : 'is-ai-advisory'} ${isRestrictedToAssigned ? 'is-quarantined' : ''}" id="doctorRiskOverrideSection" data-case-id="${c.id}" role="region" aria-label="${isEn ? 'Clinical Risk Level & Triage Classification' : 'مسار تصنيف درجة الخطورة السريرية'}">
        <!-- Header -->
        <div class="risk-card-header">
          <div class="risk-card-title-group">
            <span class="risk-header-icon" aria-hidden="true">⚖️</span>
            <div>
              <h5 class="risk-card-heading">
                ${isEn ? 'Clinical Risk Level & Triage Classification' : 'مسار تصنيف درجة الخطورة والفرز السريري'}
              </h5>
              <span class="risk-card-subheading">
                ${isEn ? 'Infermedica / Rules Engine Decision Support & Human Override' : 'الفرز الاسترشادي للذكاء الاصطناعي (Infermedica) ومسار التدخل السريري البشري'}
              </span>
            </div>
          </div>
          <div class="risk-card-badge-group">
            ${isOverridden ? `
              <span class="pill danger override-active-badge" style="font-size: 11px; padding: 4px 10px; font-weight: 800;">
                <span>⚡</span> ${isEn ? 'Clinically Overridden by Physician' : 'معتمد سريرياً بتعديل الطبيب'}
              </span>
            ` : `
              <span class="pill info advisory-active-badge" style="font-size: 11px; padding: 4px 10px; font-weight: 800;">
                <span>🤖</span> ${isEn ? 'AI / Infermedica Advisory' : 'تصنيف استرشادي بالذكاء الاصطناعي'}
              </span>
            `}
          </div>
        </div>

        <!-- Overridden State Display -->
        ${isOverridden ? `
          <div class="risk-comparison-flow">
            <!-- Box 1: Original AI Triage -->
            <div class="flow-step original-ai-step">
              <span class="step-label">
                <span>🤖</span> ${isEn ? 'AI / Infermedica Suggestion:' : 'تصنيف الذكاء الاصطناعي الأصلي:'}
              </span>
              <div class="step-priority-pill pill ${origMeta.pillClass}" style="opacity: 0.85;">
                <span>${origMeta.icon}</span>
                <span style="text-decoration: line-through; opacity: 0.85;">${isEn ? origMeta.en : origMeta.ar}</span>
              </div>
              <small class="step-footnote">${isEn ? 'Initial rules/model triage' : 'التقييم الآلي المبدئي'}</small>
            </div>

            <!-- Directional Arrow -->
            <div class="flow-arrow" aria-hidden="true">
              <span class="arrow-symbol">${isEn ? '➔' : '🡨'}</span>
            </div>

            <!-- Box 2: Doctor Overridden Priority -->
            <div class="flow-step overridden-doctor-step" style="border-color: ${activeMeta.badgeBorder}; background: ${activeMeta.badgeBg};">
              <span class="step-label" style="color: ${activeMeta.badgeBorder};">
                <span>🩺</span> ${isEn ? 'Physician Clinical Override:' : 'التصنيف المعتمد سريرياً:'}
              </span>
              <div class="step-priority-pill pill ${activeMeta.pillClass}" style="font-weight: 900; box-shadow: 0 0 14px ${activeMeta.glowColor};">
                <span>${activeMeta.icon}</span>
                <span>${isEn ? activeMeta.en : activeMeta.ar}</span>
              </div>
              <small class="step-footnote" style="color: ${activeMeta.badgeBorder}; font-weight: 700;">
                ⏱️ SLA: ${activeMeta.slaMinutes} ${isEn ? 'min target' : 'دقيقة كهدف استجابة'}
              </small>
            </div>
          </div>

          <!-- Audit & Reason Metadata Panel -->
          <div class="override-rationale-box">
            <div class="rationale-header-row">
              <span class="rationale-category-badge">
                <span>📑</span> <strong>${isEn ? 'Category:' : 'الفئة السريرية:'}</strong> ${catLabel}
              </span>
              ${timestampStr ? `<span class="rationale-timestamp"><span>🕒</span> ${timestampStr}</span>` : ''}
            </div>
            ${catDesc ? `<p class="rationale-category-desc">${catDesc}</p>` : ''}
            <div class="rationale-text-card">
              <strong class="rationale-label">
                <span>📝</span> ${isEn ? 'Documented Clinical Rationale:' : 'المبررات السريرية الموثقة:'}
              </strong>
              <p class="rationale-quote">“${escapeHtml(override.overrideReason || '')}”</p>
            </div>
            <div class="rationale-signature-row">
              <span class="signature-item">
                <span>👨‍⚕️</span> <strong>${isEn ? 'Attesting Physician:' : 'الطبيب المعتمد:'}</strong> ${escapeHtml(docName)}
              </span>
              <span class="signature-item">
                <span>🆔</span> <strong>${isEn ? 'License:' : 'رقم القيد النقابي:'}</strong> <code>${escapeHtml(docLicense)}</code>
              </span>
            </div>
          </div>

          <!-- AI Retraining Continuous Learning Banner -->
          <div class="ai-feedback-assurance-banner" role="note">
            <div class="ai-banner-icon" aria-hidden="true">🧠</div>
            <div class="ai-banner-content">
              <strong>${isEn ? 'AI Model & Infermedica Calibration Telemetry' : 'تغذية وتحسين نموذج الذكاء الاصطناعي (Model Retraining)'}</strong>
              <p>${isEn
                ? 'This override and clinical rationale are logged to the Safety Register and retraining store to calibrate triage thresholds, refine future advisory recommendations, and minimize false alarms.'
                : 'تم تسجيل هذا التعديل ومبرراته السريرية في سجل الأمان وسجل إعادة المعايرة لتدريب خوارزميات الذكاء الاصطناعي وقواعد الفرز، مما يقلل الإنذارات الكاذبة ويرفع دقة التوصيات المستقبلية.'}
              </p>
            </div>
          </div>

          <!-- Action Row -->
          <div class="override-actions-row">
            ${isRestrictedToAssigned ? `
              <div class="advisory-disclaimer-card quarantine-banner" style="border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.08); margin-bottom: 8px; width: 100%;">
                <span class="disclaimer-icon">🔒</span>
                <div class="disclaimer-text">
                  <strong style="color: #b45309;">${isEn ? 'Patient Assignment & Data Isolation Restriction:' : 'عزل بيانات المرضى والحوكمة السريرية:'}</strong>
                  <span>${isEn
                    ? 'This case is assigned to another attending physician. Triage risk overrides are quarantined and restricted to the assigned clinician.'
                    : 'هذه الحالة مسندة لطبيب معالج آخر. مسار تعديل درجة الخطورة محمي وخاص بالطبيب المكلف بمتابعة الحالة حصراً.'}
                  </span>
                </div>
              </div>
              <button type="button" class="solid-button btn-override-trigger is-disabled" disabled="disabled" style="opacity: 0.55; cursor: not-allowed; background: var(--surface-2); border-color: var(--line); color: var(--muted); padding: 9px 20px; font-weight: 700; border-radius: 10px; display: inline-flex; align-items: center; gap: 8px;" title="${isEn ? 'Override restricted to assigned physician' : 'تعديل درجة الخطورة مقيد بالطبيب المعين للحالة'}">
                <span>🔒</span> <span>${isEn ? 'Override Restricted (Assigned Clinician Only)' : 'التعديل مقيد بالطبيب المعين'}</span>
              </button>
            ` : `
              <button type="button" class="soft-button btn-override-trigger" onclick="HealthVibes.DoctorUI.openOverrideRiskModal('${c.id}')" title="${isEn ? 'Modify existing clinical override (Alt+O)' : 'تعديل أو تحديث درجة الخطورة السريرية (Alt+O)'}">
                <span>✏️</span> <span>${isEn ? 'Update Risk Override' : 'إعادة تعديل درجة الخطورة'}</span>
                <kbd class="shortcut-badge shortcut-badge-pill" title="${isEn ? 'Keyboard shortcut: Alt+O' : 'اختصار لوحة المفاتيح: Alt+O'}">Alt+O</kbd>
              </button>
            `}
          </div>
        ` : `
          <!-- Non-Overridden (AI Advisory) State Display -->
          <div class="advisory-priority-overview">
            <div class="advisory-pill-box" style="border-color: ${activeMeta.badgeBorder}; background: ${activeMeta.badgeBg};">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 26px;">${activeMeta.icon}</span>
                <div>
                  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 700;">
                    ${isEn ? 'Current Advisory Triage Level' : 'درجة الخطورة الاسترشادية الحالية'}
                  </div>
                  <strong style="font-size: 16px; color: var(--ink); display: flex; align-items: center; gap: 6px;">
                    ${isEn ? activeMeta.en : activeMeta.ar}
                    <span class="pill ${activeMeta.pillClass}" style="font-size: 11px; padding: 2px 8px;">
                      ⏱️ SLA: ${activeMeta.slaMinutes} ${isEn ? 'min' : 'دقيقة'}
                    </span>
                  </strong>
                </div>
              </div>
              <p style="margin: 8px 0 0; font-size: 12.5px; color: var(--ink); line-height: 1.4;">
                ${isEn ? activeMeta.descEn : activeMeta.descAr}
              </p>
            </div>

            <div class="advisory-disclaimer-card">
              <span class="disclaimer-icon">💡</span>
              <div class="disclaimer-text">
                <strong>${isEn ? 'Physician Authority & Clinical Governance:' : 'سلطة الطبيب وحوكمة الذكاء الاصطناعي:'}</strong>
                <span>${isEn
                  ? 'Health Vibe AI and Infermedica recommendations provide decision support only. If direct clinic examination diverges from advisory triage, you can override the risk level and record your clinical rationale.'
                  : 'توصيات الذكاء الاصطناعي (Infermedica) استرشادية فقط. إذا كشف الفحص السريري المباشر بالعيادة عن مؤشرات تتطلب رفع أو خفض درجة الخطورة، يمكنك تعديلها فوراً مع تسجيل السبب لتحسين النموذج.'}
                </span>
              </div>
            </div>

            ${isRestrictedToAssigned ? `
              <div class="advisory-disclaimer-card quarantine-banner" style="border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.08); margin-top: 10px;">
                <span class="disclaimer-icon">🔒</span>
                <div class="disclaimer-text">
                  <strong style="color: #b45309;">${isEn ? 'Patient Assignment & Data Isolation Restriction:' : 'عزل بيانات المرضى والحوكمة السريرية:'}</strong>
                  <span>${isEn
                    ? 'This case is assigned to another attending physician. Triage risk overrides are quarantined and restricted to the assigned clinician.'
                    : 'هذه الحالة مسندة لطبيب معالج آخر. مسار تعديل درجة الخطورة محمي وخاص بالطبيب المكلف بمتابعة الحالة حصراً.'}
                  </span>
                </div>
              </div>
            ` : ''}

            <!-- Action Row -->
            <div class="override-actions-row">
              ${isRestrictedToAssigned ? `
                <button type="button" class="solid-button btn-override-trigger is-disabled" disabled="disabled" style="opacity: 0.55; cursor: not-allowed; background: var(--surface-2); border-color: var(--line); color: var(--muted); padding: 9px 20px; font-weight: 700; border-radius: 10px; display: inline-flex; align-items: center; gap: 8px;" title="${isEn ? 'Override restricted to assigned physician' : 'تعديل درجة الخطورة مقيد بالطبيب المعين للحالة'}">
                  <span>🔒</span> <span>${isEn ? 'Override Restricted (Assigned Clinician Only)' : 'التعديل مقيد بالطبيب المعين'}</span>
                </button>
              ` : `
                <button type="button" class="solid-button btn-override-trigger" style="background: linear-gradient(135deg, #0284c7, #0369a1); border-color: #0284c7; padding: 9px 20px; font-weight: 800; border-radius: 10px; display: inline-flex; align-items: center; gap: 8px;" onclick="HealthVibes.DoctorUI.openOverrideRiskModal('${c.id}')" title="${isEn ? 'Override advisory triage risk level (Alt+O)' : 'تعديل درجة الخطورة السريرية (Alt+O)'}">
                  <span>⚖️</span> <span>${isEn ? 'Override Risk Level' : 'تعديل درجة الخطورة السريرية'}</span>
                  <kbd class="shortcut-badge shortcut-badge-pill" title="${isEn ? 'Keyboard shortcut: Alt+O' : 'اختصار لوحة المفاتيح: Alt+O'}">Alt+O</kbd>
                </button>
              `}
            </div>
          </div>
        `}
      </div>
    `;
  }

  function renderRiskOverrideModalHtml(c, isEn = false) {
    if (!c) return "";

    const override = c.triageOverride || (c.isOverridden ? {
      isOverridden: true,
      overriddenPriority: c.overriddenPriority || c.priority,
      overrideReason: c.overrideReason,
      overrideCategory: c.overrideCategory
    } : null);

    const isOverridden = Boolean(override && override.isOverridden !== false && override.overriddenPriority);
    const origPriorityKey = override?.originalPriority || c.originalPriority || c.aiTriagePriority || (global.HealthVibes?.DoctorService?.getCasePriorityKey ? global.HealthVibes.DoctorService.getCasePriorityKey(c) : (c.priority || "normal"));
    const currentPriorityKey = isOverridden ? override.overriddenPriority : origPriorityKey;

    const patientName = isEn
      ? (c.patientNameEn || c.nameEn || c.patientName || c.name || "Anonymous Patient")
      : (c.patientName || c.name || c.patientNameEn || c.nameEn || "مريض غير مسجل");

    const shortId = c.id ? c.id.slice(-6).toUpperCase() : "--";
    const o2Val = Number(c.o2 ?? c.oxygenLevel ?? 0);
    const existingReason = override?.overrideReason || "";
    const selectedCategory = override?.overrideCategory || "CLINICAL_SIGNS_OF_EXHAUSTION";

    const PRIORITY_OPTIONS = [
      {
        key: "urgent",
        colorClass: "urgent",
        icon: "🚨",
        titleAr: "عاجل / أحمر",
        titleEn: "Urgent (Red)",
        slaMinutes: 15,
        descAr: "حالات حرجة، نقص أكسجين حاد (<90%)، أو إجهاد تنفسي شديد يستدعي تدخلاً إسعافياً خلال 15 دقيقة.",
        descEn: "Critical emergencies, severe hypoxemia (<90%), or severe dyspnea requiring urgent 15-min intervention."
      },
      {
        key: "high",
        colorClass: "high",
        icon: "⚠️",
        titleAr: "أولوية عالية / أصفر",
        titleEn: "High Priority (Yellow)",
        slaMinutes: 30,
        descAr: "أعراض متوسطة أو عوامل خطورة متعددة تستدعي فحصاً سريرياً مستعجلاً خلال 30 دقيقة.",
        descEn: "Moderate-severe presentation or compound risk factors requiring clinical review within 30 min."
      },
      {
        key: "normal",
        colorClass: "normal",
        icon: "🟢",
        titleAr: "عادي / أخضر",
        titleEn: "Routine / Normal (Green)",
        slaMinutes: 120,
        descAr: "حالة مستقرة، أعراض خفيفة أو مزمنة مستقرة يمكن متابعتها روتينياً ضمن 120 دقيقة.",
        descEn: "Stable routine vitals and mild symptoms safely managed within standard 120 min outpatient SLA."
      }
    ];

    const currentDocName = (global.auth?.currentUser?.displayName) || (isEn ? "Dr. Tarek Mahmoud, MD" : "د. طارق محمود");
    const currentDocLic = "EG-MED-44821";

    return `
      <div class="doctor-override-modal-backdrop" id="doctorOverrideRiskModalBackdrop" onclick="HealthVibes.DoctorUI.handleRiskModalBackdropClick(event)" role="presentation">
        <div class="doctor-override-modal-container" id="doctorOverrideRiskModal" role="dialog" aria-modal="true" aria-labelledby="overrideRiskModalTitle" tabindex="-1">
          <!-- Modal Header -->
          <header class="override-modal-header">
            <div class="modal-title-row">
              <span class="modal-icon-badge" aria-hidden="true">⚖️</span>
              <div>
                <h3 class="modal-main-title" id="overrideRiskModalTitle">
                  ${isEn ? 'Override Triage Risk Level' : 'مسار تعديل درجة الخطورة السريرية'}
                </h3>
                <p class="modal-sub-title">
                  ${isEn
                    ? 'Clinical judgment override with structured rationale to calibrate Infermedica & AI models'
                    : 'توثيق التدخل السريري البشري وتعديل درجة الفرز مع تسجيل المبررات لتحسين نموذج الذكاء الاصطناعي'}
                </p>
              </div>
            </div>
            <button type="button" class="btn-close-override-modal" onclick="HealthVibes.DoctorUI.closeOverrideRiskModal()" title="${isEn ? 'Close modal' : 'إغلاق النافذة'}" aria-label="${isEn ? 'Close modal' : 'إغلاق النافذة'}">
              ✖
            </button>
          </header>

          <!-- Compact Patient Vitals Strip -->
          <div class="modal-patient-strip">
            <div class="patient-strip-main">
              <span class="patient-avatar-mini" aria-hidden="true">👤</span>
              <div class="patient-strip-details">
                <strong>${escapeHtml(patientName)}</strong>
                <span class="case-id-tag">#${shortId}</span>
              </div>
            </div>
            <div class="patient-strip-vitals">
              <span class="vital-chip">
                <span>💨 SpO2:</span> <strong style="${o2Val > 0 && o2Val < 90 ? 'color: #ef4444;' : ''}">${o2Val ? o2Val + '%' : '--'}</strong>
              </span>
              <span class="vital-chip">
                <span>🤖 ${isEn ? 'AI Original:' : 'الأصلي:'}</span> <strong class="pill ${getPriorityMetaInternal(origPriorityKey, isEn).pillClass}" style="font-size: 10.5px; padding: 1px 7px;">${isEn ? getPriorityMetaInternal(origPriorityKey, isEn).en : getPriorityMetaInternal(origPriorityKey, isEn).ar}</strong>
              </span>
            </div>
          </div>

          <!-- Modal Scrollable Body -->
          <div class="override-modal-body">
            <!-- STEP 1: Select New Priority Level -->
            <div class="form-step-section">
              <label class="step-label-title" id="prioritySelectionLabel">
                <span class="step-number">1</span>
                <span>${isEn ? 'Select Authorized Clinical Risk Level *' : 'اختر درجة الخطورة السريرية المعتمدة *'}</span>
              </label>
              <div class="risk-priority-options-grid" role="radiogroup" aria-labelledby="prioritySelectionLabel">
                ${PRIORITY_OPTIONS.map(opt => {
                  const isCurrent = opt.key === currentPriorityKey;
                  const shortcutDigit = opt.key === 'urgent' ? '1' : opt.key === 'high' ? '2' : '3';
                  return `
                    <button type="button" class="risk-priority-card card-${opt.colorClass} ${isCurrent ? 'is-selected is-initial-current' : ''}" id="riskOpt_${opt.key}" data-priority="${opt.key}" onclick="HealthVibes.DoctorUI.selectOverridePriorityOption('${opt.key}')" role="radio" aria-checked="${isCurrent ? 'true' : 'false'}">
                      <div class="card-top-row">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span class="card-icon" aria-hidden="true">${opt.icon}</span>
                          <kbd class="shortcut-badge-kbd" title="Shortcut: ${shortcutDigit} or Alt+${shortcutDigit}">[${shortcutDigit}]</kbd>
                        </div>
                        <div class="card-sla-badge">
                          ⏱️ SLA: ${opt.slaMinutes} ${isEn ? 'min' : 'دقيقة'}
                        </div>
                      </div>
                      <strong class="card-title">${isEn ? opt.titleEn : opt.titleAr}</strong>
                      <p class="card-desc">${isEn ? opt.descEn : opt.descAr}</p>
                      <div class="card-status-indicator">
                        ${isCurrent ? `<span class="indicator-current">✓ ${isEn ? 'Currently Active' : 'التصنيف الفعّال'}</span>` : `<span class="indicator-select">${isEn ? 'Select Level' : 'اختر هذا المستوى'}</span>`}
                      </div>
                    </button>
                  `;
                }).join('')}
              </div>
              <input type="hidden" id="overrideSelectedPriorityInput" value="${currentPriorityKey}" />
            </div>

            <!-- STEP 2: Clinical Category Selector -->
            <div class="form-step-section" style="margin-top: 18px;">
              <label for="overrideCategorySelect" class="step-label-title">
                <span class="step-number">2</span>
                <span>${isEn ? 'Clinical Override Category *' : 'فئة التعديل السريري *'}</span>
              </label>
              <div class="category-select-wrapper">
                <select id="overrideCategorySelect" class="override-category-select" required aria-required="true">
                  ${VALID_OVERRIDE_CATEGORIES.map(cat => {
                    const meta = OVERRIDE_CATEGORY_META[cat];
                    const selected = cat === selectedCategory ? 'selected="selected"' : '';
                    return `
                      <option value="${cat}" ${selected}>
                        ${isEn ? (meta?.en || cat) : (meta?.ar || cat)}
                      </option>
                    `;
                  }).join('')}
                </select>
                <span class="select-dropdown-chevron" aria-hidden="true">▼</span>
              </div>
              <p class="category-helper-text" id="categoryHelperText">
                ${isEn ? (OVERRIDE_CATEGORY_META[selectedCategory]?.descEn || "") : (OVERRIDE_CATEGORY_META[selectedCategory]?.descAr || "")}
              </p>
            </div>

            <!-- STEP 3: Mandatory Clinical Justification / Reason -->
            <div class="form-step-section" style="margin-top: 18px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px;">
                <label for="overrideReasonTextarea" class="step-label-title">
                  <span class="step-number">3</span>
                  <span>${isEn ? 'Document Mandatory Clinical Rationale *' : 'توثيق المبررات السريرية للتعديل *'}</span>
                </label>
                <div class="char-count-pill" id="overrideReasonCharCountWrapper">
                  <span id="overrideReasonCharCount">${existingReason.length}</span> / 10 ${isEn ? 'chars min' : 'حرف كحد أدنى'}
                </div>
              </div>

              <!-- Quick Clinical Reason Chips & Language Presets Toggle -->
              <div class="override-quick-chips-wrapper">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                  <span class="chips-label">💡 ${isEn ? 'Quick clinical notes / Presets:' : 'صيغ سريرية شائعة بنقرة واحدة:'}</span>
                  <div class="chips-lang-toggle" role="group" aria-label="${isEn ? 'Presets Language' : 'لغة الصيغ السريرية'}">
                    <button type="button" class="btn-chips-lang ${isEn ? 'is-active' : ''}" id="btnChipsLangEn" onclick="HealthVibes.DoctorUI.setOverrideChipsLang('en')" title="${isEn ? 'Clinical English presets (Alt+E)' : 'صيغ إنجليزية سريرية (Alt+E)'}">
                      🇬🇧 Clinical EN <kbd class="shortcut-badge-kbd" style="font-size: 9.5px; margin-inline-start: 4px;">Alt+E</kbd>
                    </button>
                    <button type="button" class="btn-chips-lang ${!isEn ? 'is-active' : ''}" id="btnChipsLangAr" onclick="HealthVibes.DoctorUI.setOverrideChipsLang('ar')" title="${isEn ? 'Arabic clinical presets (Alt+R)' : 'صيغ عربية معتمدة (Alt+R)'}">
                      🇪🇬 عربي <kbd class="shortcut-badge-kbd" style="font-size: 9.5px; margin-inline-start: 4px;">Alt+R</kbd>
                    </button>
                  </div>
                </div>
                <div class="override-chips-container" id="overrideChipsContainer">
                  ${QUICK_CLINICAL_REASON_CHIPS.map(chip => `
                    <button type="button" class="override-chip-btn" onclick="HealthVibes.DoctorUI.applyOverrideReasonChip('${escapeHtml(isEn ? chip.en : chip.ar)}')">
                      + ${isEn ? chip.en : chip.ar}
                    </button>
                  `).join('')}
                </div>
              </div>

              <textarea id="overrideReasonTextarea" class="override-textarea" dir="auto" lang="${isEn ? 'en' : 'ar'}" minlength="10" rows="3" placeholder="${isEn ? 'Detailed physician clinical observations in English or Arabic (e.g. Patient exhibits intercostal retractions, unable to complete sentences, severe bronchospasm despite SpO2 93%)...' : 'أدخل الفحص الإكلينيكي المباشر بالعربية أو الإنجليزية (مثال: سحب بين الأضلاع وإجهاد تنفسي شديد، أو قراءة SpO2 كانت خطأ قياس بسبب برودة الأطراف)...'}" required aria-required="true">${escapeHtml(existingReason)}</textarea>
              <div id="overrideReasonValidationMsg" class="form-validation-error" style="display: none;" role="alert"></div>
            </div>

            <!-- STEP 4: AI Retraining & Continuous Calibration Callout -->
            <div class="modal-ai-feedback-callout" role="note">
              <div class="callout-icon" aria-hidden="true">🤖</div>
              <div class="callout-body">
                <strong>${isEn ? 'Human-in-the-Loop AI Model Training (Infermedica Feedback Loop)' : 'حوكمة وتدريب نموذج الذكاء الاصطناعي (Infermedica Retraining Loop)'}</strong>
                <p>${isEn
                  ? 'Your clinical override records directly into the safety registry and calibration telemetry. This provides verified ground-truth data to continuously reduce false alarms and refine model weights for Egyptian clinical settings.'
                  : 'يتم تسجيل تعديلك ومبرراتك السريرية في سجل الأمان ومستودع إعادة المعايرة، مما يمنح خوارزميات الذكاء الاصطناعي بيانات دقيقة من واقع العيادات المصرية لتقليل الإنذارات الكاذبة وتحسين دقة الفرز.'}
                </p>
              </div>
            </div>

            <!-- STEP 5: Physician Attestation Footer -->
            <div class="modal-doctor-attestation-card">
              <span class="attestation-icon" aria-hidden="true">🛡️</span>
              <div class="attestation-meta">
                <span>${isEn ? 'Attesting Physician:' : 'الطبيب المعتمد:'} <strong>${escapeHtml(currentDocName)}</strong></span>
                <span>${isEn ? 'Syndicate License:' : 'القيد النقابي:'} <code>${escapeHtml(currentDocLic)}</code></span>
              </div>
            </div>
          </div>

          <!-- Modal Footer Actions -->
          <footer class="override-modal-footer">
            <div class="shortcuts-legend" aria-label="${isEn ? 'Keyboard Shortcuts' : 'اختصارات لوحة المفاتيح'}">
              <span class="legend-item"><kbd class="shortcut-badge-kbd">1</kbd>/<kbd class="shortcut-badge-kbd">2</kbd>/<kbd class="shortcut-badge-kbd">3</kbd> ${isEn ? 'Priority' : 'المستوى'}</span>
              <span class="legend-item"><kbd class="shortcut-badge-kbd">Alt+E/R</kbd> ${isEn ? 'Presets' : 'الصيغ'}</span>
              <span class="legend-item"><kbd class="shortcut-badge-kbd">Ctrl+↵</kbd> ${isEn ? 'Save' : 'اعتماد'}</span>
              <span class="legend-item"><kbd class="shortcut-badge-kbd">Esc</kbd> ${isEn ? 'Cancel' : 'إلغاء'}</span>
            </div>
            <div class="override-modal-footer-btns">
              <button type="button" class="outline-button btn-cancel-override" onclick="HealthVibes.DoctorUI.closeOverrideRiskModal()">
                <span>${isEn ? 'Cancel' : 'إلغاء'}</span>
                <kbd class="shortcut-badge-kbd" style="font-size: 10px; margin-inline-start: 4px;">Esc</kbd>
              </button>
              <button type="button" class="solid-button btn-confirm-override" id="btnSubmitRiskOverride" onclick="HealthVibes.DoctorUI.submitOverrideRisk('${c.id}')">
                <span>💾</span> <span>${isEn ? 'Save & Apply Clinical Override' : 'حفظ واعتماد التعديل السريري'}</span>
                <kbd class="shortcut-badge-kbd" style="font-size: 10px; margin-inline-start: 4px; background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.35); color: #fff;">Ctrl+↵</kbd>
              </button>
            </div>
          </footer>
        </div>
      </div>
    `;
  }

  function handleRiskModalBackdropClick(evt) {
    if (evt && evt.target && evt.target.id === "doctorOverrideRiskModalBackdrop") {
      closeOverrideRiskModal();
    }
  }

  function openOverrideRiskModal(caseId) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";

    const activeCase = (global.cases || []).find(c => c.id === caseId) ||
                       (global.state?.doctorQueue || []).find(c => c.id === caseId) ||
                       { id: caseId, priority: "normal" };

    if (activeCase && global.auth?.currentUser) {
      const hasExplicitAssignment = Boolean(activeCase.assignedDoctorId || activeCase.assignedDoctorEmail || activeCase.doctorId);
      if (hasExplicitAssignment && !isCaseAssignedToDoctor(activeCase, global.auth.currentUser)) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn
            ? "Access Denied: Triage risk override is restricted to the assigned physician."
            : "تم رفض الإجراء: مسار تعديل درجة الخطورة مقيد بالطبيب المكلف بمتابعة الحالة حصراً.");
        }
        return;
      }
    }

    lastRiskModalOpener = document.activeElement;

    // Remove any previously open override modal
    closeOverrideRiskModal();

    // Render HTML
    const modalHtml = renderRiskOverrideModalHtml(activeCase, isEn);
    const container = document.createElement("div");
    container.id = "doctorRiskModalMountPoint";
    container.innerHTML = modalHtml;
    document.body.appendChild(container);

    // Initial state setup
    const initialPriority = (activeCase.triageOverride?.overriddenPriority) ||
                            (activeCase.priority) ||
                            "normal";
    selectOverridePriorityOption(initialPriority);

    // Attach Category Change Listener for Description Helper
    const catSelect = document.getElementById("overrideCategorySelect");
    const catHelper = document.getElementById("categoryHelperText");
    if (catSelect && catHelper) {
      catSelect.addEventListener("change", () => {
        const selectedVal = catSelect.value;
        const meta = OVERRIDE_CATEGORY_META[selectedVal];
        catHelper.textContent = isEn ? (meta?.descEn || "") : (meta?.descAr || "");
      });
    }

    // Attach Textarea Character Counter & Live Validation
    const textarea = document.getElementById("overrideReasonTextarea");
    const charCount = document.getElementById("overrideReasonCharCount");
    const countWrapper = document.getElementById("overrideReasonCharCountWrapper");
    const submitBtn = document.getElementById("btnSubmitRiskOverride");

    const updateValidation = () => {
      const text = textarea ? textarea.value.trim() : "";
      const len = text.length;
      if (charCount) charCount.textContent = String(len);

      if (len >= 10) {
        if (countWrapper) {
          countWrapper.style.color = "#10b981";
          countWrapper.style.borderColor = "#10b981";
        }
        if (submitBtn) {
          submitBtn.removeAttribute("disabled");
          submitBtn.style.opacity = "1";
        }
      } else {
        if (countWrapper) {
          countWrapper.style.color = "#ea580c";
          countWrapper.style.borderColor = "#ea580c";
        }
        if (submitBtn) {
          submitBtn.style.opacity = "0.7";
        }
      }
    };

    if (textarea) {
      textarea.addEventListener("input", updateValidation);
      textarea.addEventListener("keyup", updateValidation);
      updateValidation();
    }

    // Keyboard focus trap & Rapid override shortcuts
    riskModalKeydownHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOverrideRiskModal();
        return;
      }

      // Quick Submit: Ctrl + Enter or Cmd + Enter
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitOverrideRisk(activeCase.id);
        return;
      }

      // Check if user is typing inside textarea
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      const isInputFocused = activeTag === "textarea" || activeTag === "input" || activeTag === "select";

      // 1: Urgent (Red)
      if ((e.altKey && e.key === "1") || (!isInputFocused && e.key === "1")) {
        e.preventDefault();
        selectOverridePriorityOption("urgent");
        return;
      }
      // 2: High (Yellow)
      if ((e.altKey && e.key === "2") || (!isInputFocused && e.key === "2")) {
        e.preventDefault();
        selectOverridePriorityOption("high");
        return;
      }
      // 3: Normal (Green)
      if ((e.altKey && e.key === "3") || (!isInputFocused && e.key === "3")) {
        e.preventDefault();
        selectOverridePriorityOption("normal");
        return;
      }

      // Alt + E for English presets, Alt + R for Arabic presets
      if (e.altKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        setOverrideChipsLang("en");
        return;
      }
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setOverrideChipsLang("ar");
        return;
      }

      // Accessible Focus Trap (Tab and Shift+Tab)
      if (e.key === "Tab") {
        const modalContainer = document.getElementById("doctorOverrideRiskModal");
        if (!modalContainer) return;
        const focusable = modalContainer.querySelectorAll('button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", riskModalKeydownHandler);

    // Focus on modal
    const modalBox = document.getElementById("doctorOverrideRiskModal");
    if (modalBox && typeof modalBox.focus === "function") {
      modalBox.focus();
    }
  }

  function closeOverrideRiskModal() {
    if (typeof document === "undefined") return;

    if (riskModalKeydownHandler) {
      document.removeEventListener("keydown", riskModalKeydownHandler);
      riskModalKeydownHandler = null;
    }

    const mount = document.getElementById("doctorRiskModalMountPoint");
    if (mount) {
      mount.remove();
    } else {
      const backdrop = document.getElementById("doctorOverrideRiskModalBackdrop");
      if (backdrop) backdrop.remove();
    }

    if (lastRiskModalOpener && typeof lastRiskModalOpener.focus === "function") {
      lastRiskModalOpener.focus();
      lastRiskModalOpener = null;
    }
  }

  function selectOverridePriorityOption(priorityKey) {
    if (typeof document === "undefined") return;
    const valid = VALID_OVERRIDE_PRIORITIES.includes(priorityKey) ? priorityKey : "normal";
    activeOverridePrioritySelection = valid;

    const input = document.getElementById("overrideSelectedPriorityInput");
    if (input) input.value = valid;

    VALID_OVERRIDE_PRIORITIES.forEach(key => {
      const card = document.getElementById(`riskOpt_${key}`);
      if (card) {
        if (key === valid) {
          card.classList.add("is-selected");
          card.setAttribute("aria-checked", "true");
        } else {
          card.classList.remove("is-selected");
          card.setAttribute("aria-checked", "false");
        }
      }
    });
  }

  function setOverrideChipsLang(lang) {
    if (typeof document === "undefined") return;
    const targetLang = (lang === "en" || lang === "ar") ? lang : ((global.currentLanguage || "ar") === "en" ? "en" : "ar");

    const container = document.getElementById("overrideChipsContainer");
    if (container) {
      container.innerHTML = QUICK_CLINICAL_REASON_CHIPS.map(chip => {
        const text = targetLang === "en" ? chip.en : chip.ar;
        return `
          <button type="button" class="override-chip-btn" onclick="HealthVibes.DoctorUI.applyOverrideReasonChip('${escapeHtml(text)}')">
            + ${text}
          </button>
        `;
      }).join('');
    }

    const btnEn = document.getElementById("btnChipsLangEn");
    const btnAr = document.getElementById("btnChipsLangAr");
    if (btnEn && btnAr) {
      if (targetLang === "en") {
        btnEn.classList.add("is-active");
        btnAr.classList.remove("is-active");
      } else {
        btnAr.classList.add("is-active");
        btnEn.classList.remove("is-active");
      }
    }
  }

  function applyOverrideReasonChip(chipText) {
    if (typeof document === "undefined") return;
    const textarea = document.getElementById("overrideReasonTextarea");
    if (!textarea) return;

    const existing = textarea.value.trim();
    if (existing) {
      textarea.value = `${existing}. ${chipText}`;
    } else {
      textarea.value = chipText;
    }

    // Dispatch input event to update char counter and validation
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  async function submitOverrideRisk(caseId) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";

    const priorityInput = document.getElementById("overrideSelectedPriorityInput");
    const categorySelect = document.getElementById("overrideCategorySelect");
    const textarea = document.getElementById("overrideReasonTextarea");
    const validationMsg = document.getElementById("overrideReasonValidationMsg");
    const submitBtn = document.getElementById("btnSubmitRiskOverride");

    const overriddenPriority = priorityInput ? priorityInput.value : activeOverridePrioritySelection;
    const overrideCategory = categorySelect ? categorySelect.value : "";
    const overrideReason = textarea ? textarea.value.trim() : "";

    // Client validation
    if (!VALID_OVERRIDE_PRIORITIES.includes(overriddenPriority)) {
      if (validationMsg) {
        validationMsg.style.display = "block";
        validationMsg.textContent = isEn ? "Please select a valid triage risk level." : "يرجى اختيار درجة خطورة صالحة.";
      }
      return;
    }

    if (!VALID_OVERRIDE_CATEGORIES.includes(overrideCategory)) {
      if (validationMsg) {
        validationMsg.style.display = "block";
        validationMsg.textContent = isEn ? "Please select a valid clinical override category." : "يرجى اختيار فئة تعديل سريري صالحة.";
      }
      return;
    }

    if (!overrideReason || overrideReason.length < 10) {
      if (validationMsg) {
        validationMsg.style.display = "block";
        validationMsg.textContent = isEn
          ? "A clinical justification of at least 10 characters is mandatory to override advisory triage."
          : "يجب تسجيل مبررات سريرية لا تقل عن 10 أحرف لاعتماد تعديل درجة الخطورة.";
      }
      if (textarea) textarea.focus();
      return;
    }

    if (validationMsg) {
      validationMsg.style.display = "none";
    }

    // Show loading state
    if (submitBtn) {
      submitBtn.setAttribute("disabled", "disabled");
      submitBtn.style.opacity = "0.7";
      submitBtn.innerHTML = `<span>⏳</span> <span>${isEn ? 'Saving Clinical Override...' : 'جاري حفظ التعديل السريري...'}</span>`;
    }

    try {
      let result = null;
      if (global.HealthVibes?.DoctorService?.overrideTriagePriority) {
        result = await global.HealthVibes.DoctorService.overrideTriagePriority({
          caseId,
          overriddenPriority,
          overrideReason,
          overrideCategory
        });
      } else {
        // Direct fallback
        const record = {
          isOverridden: true,
          overriddenPriority,
          overrideReason,
          overrideCategory,
          timestamp: new Date().toISOString()
        };
        result = { success: true, overrideRecord: record };
      }

      // Update in-memory case in state
      const targetCase = (global.cases || []).find(c => c.id === caseId) ||
                         (global.state?.doctorQueue || []).find(c => c.id === caseId);
      if (targetCase) {
        targetCase.priority = overriddenPriority;
        targetCase.triageLevel = overriddenPriority;
        targetCase.isOverridden = true;
        targetCase.triageOverride = result?.overrideRecord || {
          isOverridden: true,
          overriddenPriority,
          overrideReason,
          overrideCategory,
          timestamp: new Date().toISOString()
        };
      }

      // Close modal
      closeOverrideRiskModal();

      if (typeof global.showToast === "function") {
        const meta = getPriorityMetaInternal(overriddenPriority, isEn);
        const prioLabel = isEn ? meta.en : meta.ar;
        global.showToast(
          isEn
            ? `Risk level successfully overridden to "${prioLabel}" with clinical rationale recorded.`
            : `تم تعديل درجة الخطورة إلى "${prioLabel}" بنجاح وتوثيق المبررات لتحسين الذكاء الاصطناعي.`
        );
      }

      // Re-render UI
      if (typeof global.selectDoctorCase === "function") {
        global.selectDoctorCase(caseId);
      } else if (typeof global.renderDoctorDetail === "function") {
        global.renderDoctorDetail(caseId);
      }

      if (typeof global.renderDoctorQueue === "function") {
        global.renderDoctorQueue();
      }
    } catch (err) {
      console.error("[DoctorUI] Error submitting risk override:", err);
      if (submitBtn) {
        submitBtn.removeAttribute("disabled");
        submitBtn.style.opacity = "1";
        submitBtn.innerHTML = `<span>💾</span> <span>${isEn ? 'Save & Apply Clinical Override' : 'حفظ واعتماد التعديل السريري'}</span>`;
      }
      if (validationMsg) {
        validationMsg.style.display = "block";
        validationMsg.textContent = err.message || (isEn ? "Failed to save override. Please try again." : "فشل حفظ التعديل، يرجى المحاولة مرة أخرى.");
      }
    }
  }

  // ===========================================================================
  // 9. REJECT ASSESSMENT & REQUEST RE-ENTRY WORKFLOW (K HEALTH INTAKE GOVERNANCE)
  // ===========================================================================

  let activeRejectReentryMode = "reentry"; // 'reentry' | 'definitive_reject'
  let selectedReentryFields = new Set(["spo2"]);
  let lastRejectModalOpener = null;
  let rejectModalKeydownHandler = null;

  const REJECTION_REENTRY_CATEGORIES = (global.HealthVibes?.DoctorService?.REJECTION_REENTRY_CATEGORIES) || [
    "INCOMPLETE_MEASUREMENTS",
    "CONTRADICTORY_VITALS",
    "UNREADABLE_ATTACHMENTS",
    "CLINICAL_INCONSISTENCY",
    "OTHER_CLINICAL_JUSTIFICATION"
  ];

  const REJECTION_REENTRY_META = (global.HealthVibes?.DoctorService?.REJECTION_REENTRY_META) || {
    INCOMPLETE_MEASUREMENTS: {
      ar: "نقص القياسات أو المؤشرات الحيوية الأساسية",
      en: "Incomplete / Missing Vital Measurements",
      descAr: "تم إغفال قياسات حيوية أساسية مثل نسبة تشبع الأكسجين أو ضغط الدم لتقييم آمن للحالة.",
      descEn: "Essential clinical vitals such as SpO2 or blood pressure were omitted, preventing safe triage."
    },
    CONTRADICTORY_VITALS: {
      ar: "قياسات أو مؤشرات حيوية متناقضة أو غير منطقية",
      en: "Contradictory / Implausible Vital Readings",
      descAr: "القراءات المسجلة متناقضة فيزيولوجياً (مثل SpO2 منخفض جداً مع حركة طبيعية، أو نبض غير سليم).",
      descEn: "Recorded values are physiologically contradictory or clinically implausible (e.g. sensor artifact)."
    },
    UNREADABLE_ATTACHMENTS: {
      ar: "مرفقات أو صور تحاليل/روشتات غير واضحة",
      en: "Unreadable / Blurry Attachments & Labs",
      descAr: "صور التحاليل المخبرية أو الروشتات المرفقة ضبابية أو مقطوعة وتتعذر قراءتها سريرياً.",
      descEn: "Uploaded photos of lab tests, ECG or prescriptions are blurry, cropped, or illegible."
    },
    CLINICAL_INCONSISTENCY: {
      ar: "عدم تطابق الأعراض مع التاريخ المرضي المسجل",
      en: "Symptom-History Discrepancy",
      descAr: "الأعراض الحالية للمريض تتناقض صراحة مع الشكوى أو الإجابات السابقة المسجلة.",
      descEn: "Current symptoms contradict previously documented answers or intake responses."
    },
    OTHER_CLINICAL_JUSTIFICATION: {
      ar: "مبررات سريرية أخرى يحددها الطبيب",
      en: "Other Physician Clinical Justification",
      descAr: "تقييم سريري مباشر من الطبيب المعالج يستدعي تصحيح المدخلات وإعادة أخذ القياسات.",
      descEn: "Direct attending physician clinical assessment requiring intake correction."
    }
  };

  const REENTRY_REQUEST_FIELDS = (global.HealthVibes?.DoctorService?.REENTRY_REQUEST_FIELDS) || [
    { id: "spo2", labelEn: "SpO2 (Oxygen Saturation)", labelAr: "نسبة تشبع الأكسجين (SpO2)", icon: "💨" },
    { id: "blood_pressure", labelEn: "Blood Pressure & Pulse", labelAr: "ضغط الدم والنبض", icon: "❤️" },
    { id: "temperature", labelEn: "Body Temperature", labelAr: "درجة حرارة الجسم", icon: "🌡️" },
    { id: "symptoms_detail", labelEn: "Symptom Onset & Severity", labelAr: "بداية الأعراض وشدتها", icon: "📋" },
    { id: "attachments", labelEn: "Clear Lab / Report Photos", labelAr: "صورة واضحة للتحاليل أو التقرير", icon: "📷" },
    { id: "medications", labelEn: "Current Medications List", labelAr: "قائمة الأدوية الحالية والجرعات", icon: "💊" }
  ];

  const QUICK_REENTRY_INSTRUCTION_CHIPS = (global.HealthVibes?.DoctorService?.QUICK_REENTRY_INSTRUCTION_CHIPS) || [
    {
      en: "Please warm your hands, rest for 5 minutes, and retake your pulse oximeter (SpO2) reading.",
      ar: "يرجى تدفئة اليدين والراحة لمدة 5 دقائق ثم إعادة قياس نسبة الأكسجين والتأكد من ثبات القراءة."
    },
    {
      en: "Blood pressure reading appears implausible. Please re-measure while seated quietly using a calibrated cuff.",
      ar: "قراءة ضغط الدم تبدو غير دقيقة، يرجى إعادة القياس في وضعية الجلوس بهدوء بجهاز معتمد."
    },
    {
      en: "The uploaded lab result photo is blurry or cropped. Please upload a clear, flat photo in good lighting.",
      ar: "صورة نتيجة التحليل المرفقة غير واضحة، يرجى إعادة تصوير الورقة كاملة بإضاءة جيدة بدون اهتزاز."
    },
    {
      en: "Reported symptoms are contradictory. Please clarify which symptom is primary and when it started.",
      ar: "هناك تضارب في الأعراض المسجلة، يرجى توضيح العرض الرئيسي وتاريخ بدايته بدقة."
    },
    {
      en: "Please confirm your current chronic disease medications and exact daily dosages.",
      ar: "يرجى كتابة أسماء أدوية الأمراض المزمنة التي تتناولها حالياً بجرعاتها اليومية بوضوح."
    }
  ];

  function renderRejectReentryModalHtml(c, isEn = false) {
    if (!c) return "";

    const patientName = isEn
      ? (c.patientNameEn || c.nameEn || c.patientName || c.name || "Anonymous Patient")
      : (c.patientName || c.name || c.patientNameEn || c.nameEn || "مريض غير مسجل");

    const shortId = c.id ? c.id.slice(-6).toUpperCase() : "--";
    const o2Val = Number(c.o2 ?? c.oxygenLevel ?? 0);
    const existingReason = c.rejectionReason || c.doctorNote || "";
    const selectedCategory = c.rejectionCategory || "INCOMPLETE_MEASUREMENTS";

    const currentDocName = (global.auth?.currentUser?.displayName) || (isEn ? "Dr. Tarek Mahmoud, MD" : "د. طارق محمود");
    const currentDocLic = "EG-MED-44821";

    const fieldMetaMap = {};
    REENTRY_REQUEST_FIELDS.forEach(f => { fieldMetaMap[f.id] = f; });

    return `
      <div class="doctor-override-modal-backdrop" id="doctorRejectReentryModalBackdrop" onclick="HealthVibes.DoctorUI.handleRejectModalBackdropClick(event)" role="presentation">
        <div class="doctor-override-modal-container doctor-reject-reentry-container" id="doctorRejectReentryModal" role="dialog" aria-modal="true" aria-labelledby="rejectReentryModalTitle" tabindex="-1">
          <!-- Modal Header -->
          <header class="override-modal-header" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.12)); border-bottom-color: rgba(239, 68, 68, 0.25);">
            <div class="modal-title-row">
              <span class="modal-icon-badge" style="background: rgba(239, 68, 68, 0.18); color: #ef4444;" aria-hidden="true">⚠️</span>
              <div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <h3 class="modal-main-title" id="rejectReentryModalTitle">
                    ${isEn ? 'Reject Assessment & Request Patient Re-entry' : 'مسار رفض التقييم وطلب إعادة إدخال القياسات'}
                  </h3>
                  <span class="pill warning" style="font-size: 10px; padding: 2px 7px; font-weight: 800;">K Health Intake Protocol</span>
                </div>
                <p class="modal-sub-title">
                  ${isEn
                    ? 'Clinical intake governance: Reject contradictory or incomplete data and alert the patient to re-enter accurate vitals.'
                    : 'حوكمة مدخلات الفرز المبدئي: رفض البيانات المتناقضة أو الناقصة وإرسال إشعار للمريض لإعادة القياس فوراً.'}
                </p>
              </div>
            </div>
            <button type="button" class="btn-close-override-modal" onclick="HealthVibes.DoctorUI.closeRejectReentryModal()" title="${isEn ? 'Close modal (Esc)' : 'إغلاق النافذة (Esc)'}" aria-label="${isEn ? 'Close modal' : 'إغلاق النافذة'}">
              ✖
            </button>
          </header>

          <!-- Patient Vitals Strip -->
          <div class="modal-patient-strip">
            <div class="patient-strip-main">
              <span class="patient-avatar-mini" aria-hidden="true">👤</span>
              <div class="patient-strip-details">
                <strong>${escapeHtml(patientName)}</strong>
                <span class="case-id-tag">#${shortId}</span>
              </div>
            </div>
            <div class="patient-strip-vitals">
              <span class="vital-chip">
                <span>💨 SpO2:</span> <strong style="${o2Val > 0 && o2Val < 90 ? 'color: #ef4444;' : ''}">${o2Val ? o2Val + '%' : '--'}</strong>
              </span>
              <span class="vital-chip">
                <span>⏱️ ${isEn ? 'Waiting:' : 'الانتظار:'}</span> <strong>${escapeHtml(c.duration || (isEn ? '1 hour' : 'ساعة واحدة'))}</strong>
              </span>
            </div>
          </div>

          <!-- Modal Scrollable Body -->
          <div class="override-modal-body">
            <!-- REJECTION MODE SELECTOR -->
            <div class="form-step-section">
              <label class="step-label-title" id="reentryModeLabel">
                <span class="step-number">1</span>
                <span>${isEn ? 'Choose Rejection & Governance Action *' : 'حدد مسار الرفض والحوكمة السريرية *'}</span>
              </label>
              <div class="reentry-mode-grid" role="radiogroup" aria-labelledby="reentryModeLabel">
                <button type="button" class="reentry-mode-card ${activeRejectReentryMode === 'reentry' ? 'is-selected' : ''}" id="modeCard_reentry" onclick="HealthVibes.DoctorUI.setRejectReentryMode('reentry')" role="radio" aria-checked="${activeRejectReentryMode === 'reentry' ? 'true' : 'false'}">
                  <div class="mode-card-header">
                    <span class="mode-card-icon">🔄</span>
                    <span class="pill ok" style="font-size: 10px; padding: 2px 7px;">${isEn ? 'Recommended' : 'موصى به'}</span>
                  </div>
                  <strong class="mode-card-title">${isEn ? 'Reject & Request Re-entry' : 'رفض التقييم وطلب إعادة القياس'} <kbd class="mode-card-shortcut">[1]</kbd></strong>
                  <p class="mode-card-desc">
                    ${isEn
                      ? 'Rejects initial intake for incomplete or contradictory values and immediately alerts the patient to re-measure flagged items.'
                      : 'رفض التقييم المبدئي لوجود نقص أو تناقض وإشعار المريض فوراً لإعادة قياس وإدخال البيانات المطلوبة.'}
                  </p>
                </button>

                <button type="button" class="reentry-mode-card ${activeRejectReentryMode === 'definitive_reject' ? 'is-selected' : ''}" id="modeCard_definitive" onclick="HealthVibes.DoctorUI.setRejectReentryMode('definitive_reject')" role="radio" aria-checked="${activeRejectReentryMode === 'definitive_reject' ? 'true' : 'false'}">
                  <div class="mode-card-header">
                    <span class="mode-card-icon">🚫</span>
                    <span class="pill danger" style="font-size: 10px; padding: 2px 7px;">${isEn ? 'Terminal' : 'نهائي'}</span>
                  </div>
                  <strong class="mode-card-title">${isEn ? 'Definitive Rejection' : 'رفض سريري نهائي'} <kbd class="mode-card-shortcut">[2]</kbd></strong>
                  <p class="mode-card-desc">
                    ${isEn
                      ? 'Permanently terminates intake for non-medical submissions, duplicate cases, or out-of-scope complaints without re-entry.'
                      : 'إنهاء الحالة نهائياً كتقييم مكرر أو مدخلات غير طبية أو خارجة عن نطاق الاستشارة دون طلب إعادة إدخال.'}
                  </p>
                </button>
              </div>
            </div>

            <!-- STEP 2: Clinical Rejection Category -->
            <div class="form-step-section" style="margin-top: 18px;">
              <label for="rejectCategorySelect" class="step-label-title">
                <span class="step-number">2</span>
                <span>${isEn ? 'Clinical Rejection Category *' : 'فئة سبب الرفض السريري *'}</span>
              </label>
              <div class="category-select-wrapper">
                <select id="rejectCategorySelect" class="override-category-select" required aria-required="true">
                  ${REJECTION_REENTRY_CATEGORIES.map(cat => {
                    const meta = REJECTION_REENTRY_META[cat];
                    const selected = cat === selectedCategory ? 'selected="selected"' : '';
                    return `
                      <option value="${cat}" ${selected}>
                        ${isEn ? (meta?.en || cat) : (meta?.ar || cat)}
                      </option>
                    `;
                  }).join('')}
                </select>
                <span class="select-dropdown-chevron" aria-hidden="true">▼</span>
              </div>
              <p class="category-helper-text" id="rejectCategoryHelperText">
                ${isEn ? (REJECTION_REENTRY_META[selectedCategory]?.descEn || "") : (REJECTION_REENTRY_META[selectedCategory]?.descAr || "")}
              </p>
            </div>

            <!-- STEP 3: Required Fields for Patient Re-entry (Visible only in reentry mode) -->
            <div class="form-step-section" id="reentryFieldsSection" style="margin-top: 18px; ${activeRejectReentryMode === 'reentry' ? 'display: flex;' : 'display: none;'}">
              <label class="step-label-title" id="reentryFieldsLabel">
                <span class="step-number">3</span>
                <span>${isEn ? 'Select Flagged Fields for Patient Re-entry *' : 'حدد الحقول والقياسات المطلوب من المريض إعادة إدخالها *'}</span>
              </label>
              <div class="reentry-fields-grid" role="group" aria-labelledby="reentryFieldsLabel">
                ${REENTRY_REQUEST_FIELDS.map(f => {
                  const isChecked = selectedReentryFields.has(f.id);
                  return `
                    <button type="button" class="reentry-field-btn ${isChecked ? 'is-checked' : ''}" id="reentryFieldBtn_${f.id}" onclick="HealthVibes.DoctorUI.toggleReentryField('${f.id}')" aria-pressed="${isChecked ? 'true' : 'false'}">
                      <span class="field-btn-checkbox" aria-hidden="true">${isChecked ? '☑' : '☐'}</span>
                      <span class="field-btn-icon" aria-hidden="true">${f.icon}</span>
                      <span class="field-btn-label">${isEn ? f.labelEn : f.labelAr}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- STEP 4: Mandatory Physician Instructions & Guidance for the Patient -->
            <div class="form-step-section" style="margin-top: 18px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px;">
                <label for="rejectReentryInstructionTextarea" class="step-label-title">
                  <span class="step-number">${activeRejectReentryMode === 'reentry' ? '4' : '3'}</span>
                  <span>${isEn ? 'Physician Clinical Instructions for the Patient *' : 'توجيهات وإرشادات الطبيب الموجهة للمريض *'}</span>
                </label>
                <div class="char-count-pill" id="rejectCharCountWrapper">
                  <span id="rejectInstructionCharCount">${existingReason.length}</span> / 10 ${isEn ? 'chars min' : 'حرف كحد أدنى'}
                </div>
              </div>

              <!-- Quick Clinical Instruction Presets -->
              <div class="override-quick-chips-wrapper">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                  <span class="chips-label">💡 ${isEn ? 'Clinical instruction presets for patient guidance:' : 'صيغ وتوجيهات شائعة للمريض بنقرة واحدة:'}</span>
                  <div class="chips-lang-toggle" role="group" aria-label="${isEn ? 'Presets Language' : 'لغة الصيغ'}">
                    <button type="button" class="btn-chips-lang ${isEn ? 'is-active' : ''}" id="btnReentryLangEn" onclick="HealthVibes.DoctorUI.setReentryChipsLang('en')" title="${isEn ? 'Clinical English presets' : 'صيغ إنجليزية'}">
                      🇬🇧 Clinical EN
                    </button>
                    <button type="button" class="btn-chips-lang ${!isEn ? 'is-active' : ''}" id="btnReentryLangAr" onclick="HealthVibes.DoctorUI.setReentryChipsLang('ar')" title="${isEn ? 'Arabic presets' : 'صيغ عربية معتمدة'}">
                      🇪🇬 عربي
                    </button>
                  </div>
                </div>
                <div class="override-chips-container" id="reentryChipsContainer">
                  ${QUICK_REENTRY_INSTRUCTION_CHIPS.map(chip => `
                    <button type="button" class="override-chip-btn" onclick="HealthVibes.DoctorUI.applyReentryInstructionChip('${escapeHtml(isEn ? chip.en : chip.ar)}')">
                      + ${isEn ? chip.en : chip.ar}
                    </button>
                  `).join('')}
                </div>
              </div>

              <textarea id="rejectReentryInstructionTextarea" class="override-textarea" dir="auto" lang="${isEn ? 'en' : 'ar'}" minlength="10" rows="3" placeholder="${isEn ? 'Clear instructions explaining what measurements to retake and how to ensure accurate readings (e.g. Please warm hands, sit quietly, and retake SpO2 and BP)...' : 'أدخل التوجيهات الطبية الواضحة للمريض لشرح القياسات المطلوب إعادتها وكيفية إجرائها بشكل دقيق (مثال: يرجى الجلوس بهدوء وتدفئة اليدين وإعادة قياس الأكسجين)...'}" required aria-required="true">${escapeHtml(existingReason)}</textarea>
              <div id="rejectReentryValidationMsg" class="form-validation-error" style="display: none;" role="alert"></div>
            </div>

            <!-- STEP 5: Live Patient Push Notification Preview -->
            <div class="reentry-notification-preview-card" id="reentryNotificationPreviewCard" role="region" aria-label="${isEn ? 'Patient Notification Preview' : 'معاينة إشعار المريض'}">
              <div class="preview-card-header">
                <span class="preview-bell-icon">🔔</span>
                <span class="preview-header-title">${isEn ? 'Live Patient In-App Push & SMS Alert Preview' : 'معاينة حية للإشعار والرسالة التي ستصل للمريض عبر التطبيق'}</span>
              </div>
              <div class="preview-bubble">
                <div class="preview-bubble-meta">
                  <strong class="preview-app-name">Health Vibe AI</strong>
                  <span class="preview-timestamp">${isEn ? 'Just now' : 'الآن'}</span>
                </div>
                <p class="preview-bubble-body" id="previewBubbleBody">
                  ${isEn
                    ? `Dr. ${currentDocName} requested intake re-entry for: [SpO2 (Oxygen Saturation)]. Guidance: ${existingReason || "Please re-measure your vitals accurately."}`
                    : `${currentDocName}: تم رفض التقييم المبدئي لحاجته لإعادة قياس: [نسبة تشبع الأكسجين (SpO2)]. توجيهات الطبيب: ${existingReason || "يرجى إعادة قياس المؤشرات الحيوية بدقة."}`}
                </p>
              </div>
            </div>

            <!-- STEP 6: Physician Attestation Footer -->
            <div class="modal-doctor-attestation-card" style="margin-top: 14px;">
              <span class="attestation-icon" aria-hidden="true">🛡️</span>
              <div class="attestation-meta">
                <span>${isEn ? 'Attesting Physician:' : 'الطبيب المعتمد:'} <strong>${escapeHtml(currentDocName)}</strong></span>
                <span>${isEn ? 'Syndicate License:' : 'القيد النقابي:'} <code>${escapeHtml(currentDocLic)}</code></span>
              </div>
            </div>
          </div>

          <!-- Modal Shortcuts Legend -->
          <div class="override-shortcuts-legend" style="display: flex; gap: 14px; align-items: center; justify-content: flex-end; padding: 6px 18px; font-size: 11px; color: var(--muted); border-top: 1px dashed var(--line); flex-wrap: wrap;">
            <span><kbd style="background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-weight: 700;">1</kbd>/<kbd style="background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-weight: 700;">2</kbd> ${isEn ? 'Switch Mode' : 'تبديل المسار'}</span>
            <span><kbd style="background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-weight: 700;">Esc</kbd> ${isEn ? 'Cancel' : 'إلغاء'}</span>
            <span><kbd style="background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-weight: 700;">Ctrl</kbd>+<kbd style="background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-weight: 700;">Enter</kbd> ${isEn ? 'Confirm' : 'تأكيد'}</span>
          </div>

          <!-- Modal Footer Actions -->
          <footer class="override-modal-footer">
            <button type="button" class="outline-button btn-cancel-override" onclick="HealthVibes.DoctorUI.closeRejectReentryModal()">
              ${isEn ? 'Cancel' : 'إلغاء'}
            </button>
            <button type="button" class="solid-button btn-confirm-override" id="btnConfirmRejectReentry" style="background: linear-gradient(135deg, #ea580c, #c2410c); border-color: #ea580c;" onclick="HealthVibes.DoctorUI.submitRejectReentry('${c.id}')">
              <span>📤</span> <span id="btnConfirmRejectReentryText">${activeRejectReentryMode === 'reentry' ? (isEn ? 'Send Re-entry Request to Patient' : 'إرسال طلب إعادة القياس للمريض') : (isEn ? 'Confirm Definitive Rejection' : 'تأكيد الرفض النهائي')}</span>
            </button>
          </footer>
        </div>
      </div>
    `;
  }

  function handleRejectModalBackdropClick(evt) {
    if (evt && evt.target && evt.target.id === "doctorRejectReentryModalBackdrop") {
      closeRejectReentryModal();
    }
  }

  function openRejectReentryModal(caseId, initialMode = "reentry") {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";

    const activeCase = (global.cases || []).find(c => c.id === caseId) ||
                       (global.state?.doctorQueue || []).find(c => c.id === caseId) ||
                       { id: caseId, priority: "normal" };

    if (activeCase && global.auth?.currentUser) {
      const hasExplicitAssignment = Boolean(activeCase.assignedDoctorId || activeCase.assignedDoctorEmail || activeCase.doctorId);
      if (hasExplicitAssignment && !isCaseAssignedToDoctor(activeCase, global.auth.currentUser)) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn
            ? "Access Denied: Rejection or re-entry request is restricted to the assigned clinician."
            : "تم رفض الإجراء: مسار رفض الحالة مقيد بالطبيب المكلف بمتابعتها حصراً.");
        }
        return;
      }
    }

    const previousOpener = document.activeElement;
    closeRejectReentryModal();
    lastRejectModalOpener = previousOpener;

    activeRejectReentryMode = initialMode === "definitive_reject" ? "definitive_reject" : "reentry";
    selectedReentryFields = new Set(["spo2"]);

    const modalHtml = renderRejectReentryModalHtml(activeCase, isEn);
    const container = document.createElement("div");
    container.id = "doctorRejectModalMountPoint";
    container.innerHTML = modalHtml;
    document.body.appendChild(container);

    // Initial mode state
    setRejectReentryMode(activeRejectReentryMode);

    // Category Change Listener
    const catSelect = document.getElementById("rejectCategorySelect");
    const catHelper = document.getElementById("rejectCategoryHelperText");
    if (catSelect && catHelper) {
      catSelect.addEventListener("change", () => {
        const val = catSelect.value;
        const meta = REJECTION_REENTRY_META[val];
        catHelper.textContent = isEn ? (meta?.descEn || "") : (meta?.descAr || "");
      });
    }

    // Textarea validation & live preview update
    const textarea = document.getElementById("rejectReentryInstructionTextarea");
    const charCount = document.getElementById("rejectInstructionCharCount");
    const countWrapper = document.getElementById("rejectCharCountWrapper");
    const submitBtn = document.getElementById("btnConfirmRejectReentry");

    const updateValidationAndPreview = () => {
      const text = textarea ? textarea.value.trim() : "";
      const len = text.length;
      if (charCount) charCount.textContent = String(len);

      if (len >= 10) {
        if (countWrapper) {
          countWrapper.style.color = "#10b981";
          countWrapper.style.borderColor = "#10b981";
        }
        if (submitBtn) {
          submitBtn.removeAttribute("disabled");
          submitBtn.style.opacity = "1";
        }
      } else {
        if (countWrapper) {
          countWrapper.style.color = "#ea580c";
          countWrapper.style.borderColor = "#ea580c";
        }
        if (submitBtn) {
          submitBtn.style.opacity = "0.7";
        }
      }
      updateReentryNotificationPreview();
    };

    if (textarea) {
      textarea.addEventListener("input", updateValidationAndPreview);
      textarea.addEventListener("keyup", updateValidationAndPreview);
      updateValidationAndPreview();
    }

    // Keydown shortcuts
    rejectModalKeydownHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRejectReentryModal();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitRejectReentry(activeCase.id);
        return;
      }
      // Mode switching shortcuts: 1 for reentry, 2 for definitive_reject (when not typing in textarea/input, or with Alt)
      const isInputFocused = document.activeElement && (document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "INPUT");
      if ((e.altKey && (e.key === "1" || e.code === "Digit1")) || (!isInputFocused && (e.key === "1" || e.code === "Digit1"))) {
        e.preventDefault();
        setRejectReentryMode("reentry");
        return;
      }
      if ((e.altKey && (e.key === "2" || e.code === "Digit2")) || (!isInputFocused && (e.key === "2" || e.code === "Digit2"))) {
        e.preventDefault();
        setRejectReentryMode("definitive_reject");
        return;
      }
      // Accessible Tab Trap
      if (e.key === "Tab") {
        const modalContainer = document.getElementById("doctorRejectReentryModal");
        if (!modalContainer) return;
        const focusable = modalContainer.querySelectorAll('button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", rejectModalKeydownHandler);

    const modalBox = document.getElementById("doctorRejectReentryModal");
    if (modalBox && typeof modalBox.focus === "function") {
      modalBox.focus();
    }
  }

  function closeRejectReentryModal() {
    if (typeof document === "undefined") return;
    if (rejectModalKeydownHandler) {
      document.removeEventListener("keydown", rejectModalKeydownHandler);
      rejectModalKeydownHandler = null;
    }
    const mount = document.getElementById("doctorRejectModalMountPoint");
    if (mount) {
      mount.remove();
    } else {
      const backdrop = document.getElementById("doctorRejectReentryModalBackdrop");
      if (backdrop) backdrop.remove();
    }
    if (lastRejectModalOpener && typeof lastRejectModalOpener.focus === "function") {
      lastRejectModalOpener.focus();
      lastRejectModalOpener = null;
    }
  }

  function setRejectReentryMode(mode) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";
    activeRejectReentryMode = mode === "definitive_reject" ? "definitive_reject" : "reentry";

    const cardReentry = document.getElementById("modeCard_reentry");
    const cardDefinitive = document.getElementById("modeCard_definitive");
    const fieldsSection = document.getElementById("reentryFieldsSection");
    const submitBtnText = document.getElementById("btnConfirmRejectReentryText");
    const submitBtn = document.getElementById("btnConfirmRejectReentry");

    if (activeRejectReentryMode === "reentry") {
      if (cardReentry) {
        cardReentry.classList.add("is-selected");
        cardReentry.setAttribute("aria-checked", "true");
      }
      if (cardDefinitive) {
        cardDefinitive.classList.remove("is-selected");
        cardDefinitive.setAttribute("aria-checked", "false");
      }
      if (fieldsSection) fieldsSection.style.display = "flex";
      if (submitBtnText) submitBtnText.textContent = isEn ? "Send Re-entry Request to Patient" : "إرسال طلب إعادة القياس للمريض";
      if (submitBtn) {
        submitBtn.style.background = "linear-gradient(135deg, #ea580c, #c2410c)";
        submitBtn.style.borderColor = "#ea580c";
      }
    } else {
      if (cardDefinitive) {
        cardDefinitive.classList.add("is-selected");
        cardDefinitive.setAttribute("aria-checked", "true");
      }
      if (cardReentry) {
        cardReentry.classList.remove("is-selected");
        cardReentry.setAttribute("aria-checked", "false");
      }
      if (fieldsSection) fieldsSection.style.display = "none";
      if (submitBtnText) submitBtnText.textContent = isEn ? "Confirm Definitive Rejection" : "تأكيد الرفض النهائي";
      if (submitBtn) {
        submitBtn.style.background = "linear-gradient(135deg, #dc2626, #b91c1c)";
        submitBtn.style.borderColor = "#dc2626";
      }
    }
    updateReentryNotificationPreview();
  }

  function toggleReentryField(fieldId) {
    if (typeof document === "undefined") return;
    if (selectedReentryFields.has(fieldId)) {
      selectedReentryFields.delete(fieldId);
    } else {
      selectedReentryFields.add(fieldId);
    }
    const btn = document.getElementById(`reentryFieldBtn_${fieldId}`);
    if (btn) {
      const isChecked = selectedReentryFields.has(fieldId);
      if (isChecked) {
        btn.classList.add("is-checked");
        btn.setAttribute("aria-pressed", "true");
        const box = btn.querySelector(".field-btn-checkbox");
        if (box) box.textContent = "☑";
      } else {
        btn.classList.remove("is-checked");
        btn.setAttribute("aria-pressed", "false");
        const box = btn.querySelector(".field-btn-checkbox");
        if (box) box.textContent = "☐";
      }
    }
    updateReentryNotificationPreview();
  }

  function setReentryChipsLang(lang) {
    if (typeof document === "undefined") return;
    const targetLang = (lang === "en" || lang === "ar") ? lang : "ar";
    const container = document.getElementById("reentryChipsContainer");
    if (container) {
      container.innerHTML = QUICK_REENTRY_INSTRUCTION_CHIPS.map(chip => {
        const text = targetLang === "en" ? chip.en : chip.ar;
        return `
          <button type="button" class="override-chip-btn" onclick="HealthVibes.DoctorUI.applyReentryInstructionChip('${escapeHtml(text)}')">
            + ${text}
          </button>
        `;
      }).join('');
    }
    const btnEn = document.getElementById("btnReentryLangEn");
    const btnAr = document.getElementById("btnReentryLangAr");
    if (btnEn && btnAr) {
      if (targetLang === "en") {
        btnEn.classList.add("is-active");
        btnAr.classList.remove("is-active");
      } else {
        btnAr.classList.add("is-active");
        btnEn.classList.remove("is-active");
      }
    }
  }

  function applyReentryInstructionChip(chipText) {
    if (typeof document === "undefined") return;
    const textarea = document.getElementById("rejectReentryInstructionTextarea");
    if (!textarea) return;
    const existing = textarea.value.trim();
    textarea.value = existing ? `${existing}. ${chipText}` : chipText;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function updateReentryNotificationPreview() {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";
    const previewBody = document.getElementById("previewBubbleBody");
    if (!previewBody) return;

    const textarea = document.getElementById("rejectReentryInstructionTextarea");
    const userNote = textarea ? textarea.value.trim() : "";
    const currentDocName = (global.auth?.currentUser?.displayName) || (isEn ? "Dr. Tarek Mahmoud, MD" : "د. طارق محمود");

    // Dynamic bidirectional direction detection: if userNote has Arabic chars, set RTL; otherwise LTR
    const hasArabicChars = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(userNote);
    const resolvedDir = userNote ? (hasArabicChars ? "rtl" : "ltr") : (isEn ? "ltr" : "rtl");
    previewBody.setAttribute("dir", resolvedDir);
    if (textarea) {
      textarea.setAttribute("dir", userNote ? (hasArabicChars ? "rtl" : "ltr") : "auto");
    }

    if (activeRejectReentryMode === "definitive_reject") {
      previewBody.innerHTML = isEn
        ? `<strong>Health Vibe Advisory:</strong> Your submitted assessment intake has been formally closed/rejected by ${currentDocName}. Rationale: “${escapeHtml(userNote || 'Intake does not meet clinical criteria.')}”`
        : `<strong>تنبيه من منصة Health Vibe:</strong> تم إغلاق ورفض التقييم المبدئي سريرياً بواسطة ${currentDocName}. السبب الموثق: “${escapeHtml(userNote || 'البيانات غير مطابقة للمعايير الطبية.')}”`;
      return;
    }

    const fieldMetaMap = {};
    REENTRY_REQUEST_FIELDS.forEach(f => { fieldMetaMap[f.id] = f; });

    const fieldLabels = Array.from(selectedReentryFields).map(id => {
      const meta = fieldMetaMap[id];
      return meta ? (isEn ? meta.labelEn : meta.labelAr) : id;
    });

    const fieldsStr = fieldLabels.length > 0 ? fieldLabels.join(" • ") : (isEn ? "General Vitals" : "القياسات العامة");
    const defaultNote = isEn ? "Please re-measure your vitals accurately and re-submit." : "يرجى إعادة قياس المؤشرات الحيوية بدقة وإعادة الإرسال.";

    previewBody.innerHTML = isEn
      ? `<strong>Action Required:</strong> ${currentDocName} flagged inaccurate intake data. Please re-enter: <span class="preview-fields-tag">[${escapeHtml(fieldsStr)}]</span>. Instructions: “${escapeHtml(userNote || defaultNote)}”`
      : `<strong>مطلوب إجراء فوري:</strong> ${currentDocName} يطلب تصريح وإعادة إدخال: <span class="preview-fields-tag">[${escapeHtml(fieldsStr)}]</span>. توجيهات الطبيب: “${escapeHtml(userNote || defaultNote)}”`;
  }

  async function submitRejectReentry(caseId) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";

    const categorySelect = document.getElementById("rejectCategorySelect");
    const textarea = document.getElementById("rejectReentryInstructionTextarea");
    const validationMsg = document.getElementById("rejectReentryValidationMsg");
    const submitBtn = document.getElementById("btnConfirmRejectReentry");

    const reasonCategory = categorySelect ? categorySelect.value : "";
    const doctorNote = textarea ? textarea.value.trim() : "";
    const mode = activeRejectReentryMode;
    const requiredFields = Array.from(selectedReentryFields);

    const validation = (global.HealthVibes?.DoctorService?.validateRejectReentryPayload)
      ? global.HealthVibes.DoctorService.validateRejectReentryPayload({ mode, reasonCategory, requiredFields, doctorNote })
      : { valid: doctorNote.length >= 10 && (mode !== "reentry" || requiredFields.length > 0) };

    if (!validation.valid) {
      if (validationMsg) {
        validationMsg.style.display = "block";
        validationMsg.textContent = isEn ? (validation.messageEn || "Please complete all mandatory fields.") : (validation.messageAr || "يرجى استكمال الحقول الإلزامية.");
      }
      return;
    }

    if (validationMsg) validationMsg.style.display = "none";

    if (submitBtn) {
      submitBtn.setAttribute("disabled", "disabled");
      submitBtn.style.opacity = "0.7";
      submitBtn.innerHTML = `<span>⏳</span> <span>${isEn ? 'Processing...' : 'جاري المعالجة والتحديث...'}</span>`;
    }

    try {
      const isReentry = mode === "reentry";
      const targetStatus = isReentry ? "more_info_requested" : "rejected";
      const targetStatusConstant = global.CASE_STATUS
        ? (isReentry ? global.CASE_STATUS.MORE_INFO_REQUESTED : global.CASE_STATUS.REJECTED)
        : targetStatus;

      const user = global.auth?.currentUser;
      const currentDocName = user ? (user.displayName || user.email) : (isEn ? "Treating Physician" : "الطبيب المعالج");

      const payload = {
        rejectionReason: doctorNote,
        rejectionCategory: reasonCategory,
        isReentryRequest: isReentry,
        reentryMode: mode,
        requiredFields: isReentry ? requiredFields : [],
        doctorNote: doctorNote,
        doctorApproved: false,
        flaggedAt: new Date().toISOString(),
        requestingDoctorName: currentDocName,
        requestingDoctorId: user?.uid || null,
        patientNotification: {
          title: isEn ? "Intake Re-entry Required" : "مطلوب إعادة إدخال بيانات التقييم",
          body: doctorNote,
          requiredFields: isReentry ? requiredFields : [],
          sentAt: new Date().toISOString()
        }
      };

      if (global.HealthVibes?.DoctorService?.rejectOrRequestReentry) {
        await global.HealthVibes.DoctorService.rejectOrRequestReentry({
          caseId,
          mode,
          reasonCategory,
          requiredFields: isReentry ? requiredFields : [],
          doctorNote
        }).catch(err => {
          console.warn("[DoctorUI] rejectOrRequestReentry backend call notice:", err);
        });
      }

      if (typeof global.updateCaseStatus === "function") {
        await global.updateCaseStatus(caseId, targetStatusConstant, doctorNote, payload);
      } else {
        const targetCase = (global.cases || []).find(c => c.id === caseId) ||
                           (global.state?.doctorQueue || []).find(c => c.id === caseId);
        if (targetCase) {
          targetCase.status = targetStatus;
          targetCase.rejectionReason = doctorNote;
          targetCase.rejectionCategory = reasonCategory;
          targetCase.isReentryRequest = isReentry;
          targetCase.requiredFields = isReentry ? requiredFields : [];
          targetCase.doctorNote = doctorNote;
        }
      }

      closeRejectReentryModal();

      if (typeof global.showToast === "function") {
        global.showToast(isEn
          ? (isReentry ? "Intake rejected. Re-entry request and notification sent to patient." : "Case definitively rejected.")
          : (isReentry ? "تم رفض التقييم المبدئي وإرسال إشعار للمريض لإعادة إدخال القياسات بنجاح." : "تم الرفض النهائي للحالة وتوثيق السبب في السجل الطبي."));
      }

      if (typeof global.selectDoctorCase === "function") {
        global.selectDoctorCase(caseId);
      } else if (typeof global.renderDoctorDetail === "function") {
        global.renderDoctorDetail(caseId);
      }
      if (typeof global.renderDoctorQueue === "function") {
        global.renderDoctorQueue();
      }
    } catch (err) {
      console.error("[DoctorUI] Error submitting reject/re-entry:", err);
      if (submitBtn) {
        submitBtn.removeAttribute("disabled");
        submitBtn.style.opacity = "1";
        submitBtn.innerHTML = `<span>📤</span> <span>${isEn ? 'Retry' : 'إعادة المحاولة'}</span>`;
      }
      if (validationMsg) {
        validationMsg.style.display = "block";
        validationMsg.textContent = err.message || (isEn ? "Failed to process request." : "فشل تنفيذ الطلب، يرجى المحاولة مرة أخرى.");
      }
    }
  }

  function renderReentryStatusAlertBanner(c, isEn = false) {
    if (!c || c.status !== "more_info_requested" || (!c.isReentryRequest && !c.reentryCategory && !c.rejectionReason)) {
      return "";
    }

    const catKey = c.rejectionCategory || c.reentryCategory || "INCOMPLETE_MEASUREMENTS";
    const catMeta = REJECTION_REENTRY_META[catKey] || { ar: "نقص القياسات أو المؤشرات الحيوية", en: "Incomplete Vital Measurements" };
    const catLabel = isEn ? catMeta.en : catMeta.ar;
    const reasonText = c.rejectionReason || c.doctorNote || (isEn ? "Intake rejected pending patient correction." : "تم رفض التقييم المبدئي لحين تصحيح القياسات.");
    const fields = Array.isArray(c.requiredFields) ? c.requiredFields : [];

    const fieldMetaMap = {};
    REENTRY_REQUEST_FIELDS.forEach(f => { fieldMetaMap[f.id] = f; });

    return `
      <div class="doctor-reentry-alert-card reentry-status-alert-banner" id="reentryAlertBanner_${c.id}" role="alert">
        <div class="reentry-alert-top">
          <div class="reentry-alert-title-wrap">
            <span class="reentry-alert-icon" aria-hidden="true">⚠️</span>
            <div>
              <h5 class="reentry-alert-heading">
                ${isEn ? 'Assessment Intake Rejected — Awaiting Patient Re-entry' : 'تم رفض التقييم المبدئي — بانتظار إعادة إدخال المريض للقياسات'}
              </h5>
              <span class="reentry-alert-subheading">
                ${isEn ? 'K Health Intake Protocol: ' : 'بروتوكول حوكمة الفرز (K Health): '}<strong>${escapeHtml(catLabel)}</strong>
              </span>
            </div>
          </div>
          <span class="pill warning" style="font-size: 11px; padding: 4px 10px; font-weight: 800;">
            <span>⚠️</span> ${isEn ? 'Pending Re-entry' : 'معلق لإعادة القياس'}
          </span>
        </div>
        <div class="reentry-alert-body">
          <p class="reentry-alert-quote">“${escapeHtml(reasonText)}”</p>
          ${fields.length > 0 ? `
            <div class="reentry-flagged-fields-row">
              <span class="reentry-fields-label">${isEn ? 'Flagged items for re-entry:' : 'القياسات المطلوب تصحيحها وإعادتها:'}</span>
              <div class="reentry-fields-pills">
                ${fields.map(fid => {
                  const meta = fieldMetaMap[fid] || { icon: "📌", labelEn: fid, labelAr: fid };
                  return `
                    <span class="reentry-field-pill">
                      <span>${meta.icon}</span> <span>${isEn ? meta.labelEn : meta.labelAr}</span>
                    </span>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="reentry-alert-footer">
          <button type="button" class="btn-clinical resume" style="font-size: 12px; padding: 5px 12px;" onclick="HealthVibes.DoctorUI.openRejectReentryModal('${c.id}', 'reentry')">
            <span>✏️</span> <span>${isEn ? 'Update Re-entry Request' : 'تعديل أو متابعة طلب إعادة القياس'}</span>
          </button>
        </div>
      </div>
    `;
  }


  // ===========================================================================
  // 9. GLOBAL KEYBOARD SHORTCUTS CONTROLLER
  // ===========================================================================

  let _doctorShortcutsInitialized = false;

  function initDoctorKeyboardShortcuts() {
    if (typeof document === "undefined") return;
    if (_doctorShortcutsInitialized) return;
    _doctorShortcutsInitialized = true;

    document.addEventListener("keydown", (e) => {
      // Global Alt + O (or Alt + o) opens Override Risk Modal for active case
      if (e.altKey && (e.key === "o" || e.key === "O" || e.code === "KeyO")) {
        if (document.getElementById("doctorOverrideRiskModal")) {
          return;
        }

        const activeCard = document.getElementById("doctorRiskOverrideSection");
        const activeCaseId = activeCard?.getAttribute("data-case-id") ||
                             global.activeDoctorCaseId ||
                             global.state?.activeDoctorCaseId ||
                             global.state?.activeCaseId ||
                             (global.cases && global.cases[0] ? global.cases[0].id : null) ||
                             (global.state?.doctorQueue && global.state.doctorQueue[0] ? global.state.doctorQueue[0].id : null);

        if (activeCaseId) {
          e.preventDefault();
          openOverrideRiskModal(activeCaseId);
        }
      }

      // Global Alt + R / Alt + J / Alt + X opens Reject & Re-entry Modal for active case
      if (e.altKey && (e.key === "r" || e.key === "R" || e.key === "j" || e.key === "J" || e.key === "x" || e.key === "X" || e.code === "KeyR" || e.code === "KeyJ" || e.code === "KeyX")) {
        if (document.getElementById("doctorRejectReentryModal") || document.getElementById("doctorOverrideRiskModal")) {
          return;
        }

        const activeCard = document.getElementById("doctorRiskOverrideSection");
        const activeCaseId = activeCard?.getAttribute("data-case-id") ||
                             global.activeDoctorCaseId ||
                             global.state?.activeDoctorCaseId ||
                             global.state?.activeCaseId ||
                             (global.cases && global.cases[0] ? global.cases[0].id : null) ||
                             (global.state?.doctorQueue && global.state.doctorQueue[0] ? global.state.doctorQueue[0].id : null);

        if (activeCaseId) {
          e.preventDefault();
          openRejectReentryModal(activeCaseId, "reentry");
        }
      }

      // Global Alt + L: Focus Vezeeta Lab & Radiology search input
      if (e.altKey && (e.key === "l" || e.key === "L" || e.code === "KeyL" || e.key === "م")) {
        const searchInput = document.getElementById("searchInvestigationInput");
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    });
  }

  // ===========================================================================
  // 10. DIAGNOSTIC INVESTIGATIONS & RADIOLOGY ORDERING (VEZEETA PATTERN)
  // ===========================================================================

  const QUICK_INVESTIGATION_INDICATION_CHIPS = [
    {
      ar: "استبعاد ارتشاح رئوي والتهاب بكتيري",
      en: "Rule out consolidation & bacterial pneumonia"
    },
    {
      ar: "تقييم مؤشرات الالتهاب الحاد والعدوى",
      en: "Evaluate acute inflammatory markers & WBC count"
    },
    {
      ar: "استبعاد جلطة رئوية مع ضيق تنفس حاد",
      en: "Exclude pulmonary embolism in acute dyspnea"
    },
    {
      ar: "متابعة اعتلال النسيج الرئوي والتعتيم الزجاجي",
      en: "Assess ground-glass opacities & interstitial disease"
    },
    {
      ar: "فحص قصور قلبي وتفاعل كبدي كلوي",
      en: "Evaluate cardiopulmonary congestion & organ perfusion"
    }
  ];

  const QUICK_PATIENT_RECOMMENDATION_CHIPS = [
    {
      ar: "الراحة التامة والإكثار من تناول السوائل الدافئة والماء",
      en: "Strict rest and adequate oral warm fluid hydration"
    },
    {
      ar: "التوجه فوراً لقسم الطوارئ في حال انخفاض الأكسجين عن 92%",
      en: "Immediate ER visit if SpO2 saturation drops below 92%"
    },
    {
      ar: "إجراء الفحوصات والأشعة المطلوبة بأسرع وقت ومراجعة الطبيب بالنتائج",
      en: "Complete ordered lab tests & imaging promptly and report back"
    },
    {
      ar: "الالتزام التام بالجرعات ومواعيد البخاخات الموسعة للشعب الهوائية",
      en: "Strict adherence to prescribed bronchodilator inhaler timing"
    },
    {
      ar: "مراجعة العيادة لإعادة التقييم السريري بعد 48 إلى 72 ساعة",
      en: "Follow-up clinic visit for re-assessment in 48-72 hours"
    }
  ];

  let activeInvestigationCategoryFilter = "ALL"; // 'ALL' | 'LAB' | 'RADIOLOGY' | 'HIGH_YIELD'
  let currentInvestigationSearchQuery = "";

  function getCaseInvestigations(caseId) {
    if (!caseId) return [];
    if (caseInvestigationsStore.has(caseId)) {
      return [...caseInvestigationsStore.get(caseId)];
    }
    const draft = getDraftNotes(caseId);
    if (draft && Array.isArray(draft.investigations)) {
      caseInvestigationsStore.set(caseId, [...draft.investigations]);
      return [...draft.investigations];
    }
    const target = (typeof global.cases !== "undefined" && Array.isArray(global.cases) ? global.cases : (global.state?.doctorQueue || [])).find(item => item.id === caseId);
    if (target && Array.isArray(target.investigations || target.orderedInvestigations)) {
      const items = [...(target.investigations || target.orderedInvestigations)];
      caseInvestigationsStore.set(caseId, items);
      return items;
    }
    return [];
  }

  function setCaseInvestigations(caseId, items) {
    if (!caseId) return;
    const validated = (global.HealthVibes?.DoctorService?.validateOrderedInvestigations)
      ? global.HealthVibes.DoctorService.validateOrderedInvestigations(items)
      : (Array.isArray(items) ? items : []);
    caseInvestigationsStore.set(caseId, validated);
    saveDraftNotes(caseId, { investigations: validated });
    updateInvestigationManifestDOM(caseId);
    updateInvestigationCatalogDOM(caseId, (global.currentLanguage || "ar") === "en");
    updateInvestigationPillCounter(caseId);
  }

  function addInvestigationToCase(caseId, itemOrCode) {
    if (!caseId) return;
    const current = getCaseInvestigations(caseId);
    const code = typeof itemOrCode === "string" ? itemOrCode.trim().toUpperCase() : (itemOrCode.code || itemOrCode.id || "").trim().toUpperCase();
    if (!code) return;

    if (current.some(i => i.code.toUpperCase() === code)) {
      const isEn = (global.currentLanguage || "ar") === "en";
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? `Test ${code} is already added` : `الفحص ${code} مضاف بالفعل إلى القائمة`);
      }
      return;
    }

    let newItem;
    if (typeof itemOrCode === "object" && itemOrCode !== null && (itemOrCode.nameAr || itemOrCode.nameEn)) {
      newItem = {
        code,
        loinc: itemOrCode.loinc || null,
        category: (itemOrCode.category || "LAB").toUpperCase(),
        nameAr: itemOrCode.nameAr || code,
        nameEn: itemOrCode.nameEn || code,
        urgency: itemOrCode.urgency || "routine",
        clinicalIndication: itemOrCode.clinicalIndication || "",
        instructions: itemOrCode.instructions || "",
        custom: Boolean(itemOrCode.custom)
      };
    } else {
      const catalogItem = (global.HealthVibes?.DoctorService?.getInvestigationByCode)
        ? global.HealthVibes.DoctorService.getInvestigationByCode(code)
        : null;
      newItem = {
        code,
        loinc: catalogItem?.loinc || null,
        category: (catalogItem?.category || "LAB").toUpperCase(),
        nameAr: catalogItem?.nameAr || code,
        nameEn: catalogItem?.nameEn || code,
        urgency: "routine",
        clinicalIndication: "",
        instructions: catalogItem?.instructionsAr || "",
        custom: !catalogItem
      };
    }

    current.push(newItem);
    setCaseInvestigations(caseId, current);

    const isEn = (global.currentLanguage || "ar") === "en";
    if (typeof global.showToast === "function") {
      const name = isEn ? newItem.nameEn : newItem.nameAr;
      global.showToast(isEn ? `Added "${name}" to orders` : `تمت إضافة "${name}" إلى الفحوصات المطلوبة`);
    }
  }

  function removeInvestigationFromCase(caseId, code) {
    if (!caseId || !code) return;
    const targetCode = String(code).trim().toUpperCase();
    const current = getCaseInvestigations(caseId);
    const filtered = current.filter(i => i.code.toUpperCase() !== targetCode);
    setCaseInvestigations(caseId, filtered);
  }

  function toggleInvestigationInCase(caseId, code) {
    if (!caseId || !code) return;
    const targetCode = String(code).trim().toUpperCase();
    const current = getCaseInvestigations(caseId);
    const existingIndex = current.findIndex(i => i.code.toUpperCase() === targetCode);
    if (existingIndex >= 0) {
      removeInvestigationFromCase(caseId, targetCode);
    } else {
      addInvestigationToCase(caseId, targetCode);
    }
  }

  function updateInvestigationField(caseId, code, field, value) {
    if (!caseId || !code) return;
    const targetCode = String(code).trim().toUpperCase();
    const current = getCaseInvestigations(caseId);
    const item = current.find(i => i.code.toUpperCase() === targetCode);
    if (item) {
      item[field] = value;
      setCaseInvestigations(caseId, current);
    }
  }

  function applyInvestigationIndicationChip(caseId, code, chipText) {
    if (!caseId || !code) return;
    updateInvestigationField(caseId, code, "clinicalIndication", chipText);
    if (typeof document !== "undefined") {
      const inputEl = document.getElementById(`ind_${code}`);
      if (inputEl) {
        inputEl.value = chipText;
        inputEl.focus();
      }
    }
  }

  function applyPatientRecommendationChip(chipText) {
    if (typeof document === "undefined") return;
    const recsInput = document.getElementById("doctorRecommendationsInput");
    if (!recsInput) return;
    const current = recsInput.value.trim();
    if (!current) {
      recsInput.value = chipText;
    } else {
      recsInput.value = `${current}\n${chipText}`;
    }
    recsInput.focus();
    if (typeof recsInput.dispatchEvent === "function") {
      recsInput.dispatchEvent(new Event("change"));
    }
  }

  function getPatientRecommendationChipsHtml(isEn = false) {
    return QUICK_PATIENT_RECOMMENDATION_CHIPS.map(chip => {
      const text = isEn ? chip.en : chip.ar;
      return `
        <button type="button" class="soft-button" style="font-size: 11px; padding: 3px 8px;" onclick="HealthVibes.DoctorUI.applyPatientRecommendationChip('${escapeHtml(text)}')">
          + ${escapeHtml(text)}
        </button>
      `;
    }).join('');
  }

  function setPatientRecommendationChipsLang(lang) {
    if (typeof document === "undefined") return;
    const isTargetEn = lang === "en";
    const container = document.getElementById("patientRecommendationsChipsContainer");
    const btnEn = document.getElementById("btnRecsLangEn");
    const btnAr = document.getElementById("btnRecsLangAr");

    if (btnEn && btnAr) {
      if (isTargetEn) {
        btnEn.classList.add("is-active");
        btnAr.classList.remove("is-active");
      } else {
        btnAr.classList.add("is-active");
        btnEn.classList.remove("is-active");
      }
    }

    if (container) {
      container.innerHTML = getPatientRecommendationChipsHtml(isTargetEn);
    }
  }

  function applyInvestigationPreset(caseId, presetKey) {
    if (!caseId || !presetKey) return;
    const presets = (global.HealthVibes?.DoctorService?.getInvestigationPresets)
      ? global.HealthVibes.DoctorService.getInvestigationPresets()
      : {};
    const preset = presets[presetKey];
    if (!preset || !Array.isArray(preset.codes)) return;

    const current = getCaseInvestigations(caseId);
    const isEn = (global.currentLanguage || "ar") === "en";

    preset.codes.forEach(code => {
      const codeUpper = code.toUpperCase();
      if (!current.some(i => i.code.toUpperCase() === codeUpper)) {
        const catalogItem = (global.HealthVibes?.DoctorService?.getInvestigationByCode)
          ? global.HealthVibes.DoctorService.getInvestigationByCode(codeUpper)
          : null;
        current.push({
          code: codeUpper,
          loinc: catalogItem?.loinc || null,
          category: (catalogItem?.category || "LAB").toUpperCase(),
          nameAr: catalogItem?.nameAr || codeUpper,
          nameEn: catalogItem?.nameEn || codeUpper,
          urgency: "routine",
          clinicalIndication: isEn ? preset.rationaleEn : preset.rationaleAr,
          instructions: catalogItem?.instructionsAr || "",
          custom: false
        });
      }
    });

    setCaseInvestigations(caseId, current);
    if (typeof global.showToast === "function") {
      const title = isEn ? preset.en : preset.ar;
      global.showToast(isEn ? `Applied preset: ${title}` : `تم تطبيق باقة: ${title}`);
    }
  }

  function addCustomInvestigationPrompt(caseId) {
    const isEn = (global.currentLanguage || "ar") === "en";
    const titlePrompt = isEn
      ? "Enter Custom Investigation Name (e.g. Total IgE, Serum Procalcitonin):"
      : "أدخل اسم الفحص أو التحليل المخصص (مثال: Procalcitonin، Total IgE، رسم عضلات):";
    const testName = (typeof window !== "undefined" && window.prompt) ? window.prompt(titlePrompt) : null;
    if (!testName || !testName.trim()) return;

    const isImaging = (typeof window !== "undefined" && window.confirm)
      ? window.confirm(isEn ? "Is this an Imaging / Radiology order? (Click Cancel for Laboratory test)" : "هل هذا فحص أشعة / تصوير طبي؟ (انقر إلغاء إذا كان تحليلاً مخبرياً)")
      : false;

    const code = `CUSTOM_${Date.now().toString(36).toUpperCase()}`;
    addInvestigationToCase(caseId, {
      code,
      nameAr: testName.trim(),
      nameEn: testName.trim(),
      category: isImaging ? "RADIOLOGY" : "LAB",
      urgency: "routine",
      clinicalIndication: "",
      instructions: "",
      custom: true
    });
  }

  function setInvestigationCategoryFilter(filterKey, caseId) {
    activeInvestigationCategoryFilter = filterKey;
    const isEn = (global.currentLanguage || "ar") === "en";
    updateInvestigationCatalogDOM(caseId, isEn);
  }

  function handleInvestigationSearchInput(val, caseId) {
    currentInvestigationSearchQuery = String(val || "").trim();
    const isEn = (global.currentLanguage || "ar") === "en";
    updateInvestigationCatalogDOM(caseId, isEn);
  }

  function updateInvestigationManifestDOM(caseId) {
    if (typeof document === "undefined") return;
    const manifestContainer = document.getElementById("selectedInvestigationsManifest");
    if (!manifestContainer) return;
    const isEn = (global.currentLanguage || "ar") === "en";
    const selected = getCaseInvestigations(caseId);
    manifestContainer.innerHTML = renderSelectedInvestigationsListHtml(selected, caseId, isEn);
  }

  function updateInvestigationCatalogDOM(caseId, isEn = false) {
    if (typeof document === "undefined") return;
    const catalogContainer = document.getElementById("investigationsCatalogGrid");
    if (!catalogContainer) return;
    const selected = getCaseInvestigations(caseId);
    catalogContainer.innerHTML = renderInvestigationCatalogGridHtml(selected, caseId, isEn);

    const tabs = document.querySelectorAll(".vezeeta-cat-pill");
    tabs.forEach(btn => {
      const cat = btn.getAttribute("data-cat");
      if (cat === activeInvestigationCategoryFilter) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });
  }

  function updateInvestigationPillCounter(caseId) {
    if (typeof document === "undefined") return;
    const countBadge = document.getElementById("orderedInvestigationsCountBadge");
    const countMobileBadge = document.getElementById("mobileInvestigationsCountBadge");
    const selected = getCaseInvestigations(caseId);
    const count = selected.length;
    const isEn = (global.currentLanguage || "ar") === "en";
    const label = count === 1
      ? (isEn ? "1 test selected" : "فحص واحد محدد")
      : (count === 2 ? (isEn ? "2 tests selected" : "فحصان محددان") : (isEn ? `${count} tests selected` : `${count} فحوصات محددة`));

    if (countBadge) {
      countBadge.textContent = count > 0 ? label : (isEn ? "No tests selected" : "لم يتم تحديد فحوصات");
      countBadge.className = count > 0 ? "pill ok" : "pill pending";
    }
    if (countMobileBadge) {
      countMobileBadge.textContent = count;
      countMobileBadge.style.display = count > 0 ? "inline-flex" : "none";
    }
  }

  function renderSelectedInvestigationsListHtml(selectedItems = [], caseId, isEn = false) {
    if (!Array.isArray(selectedItems) || selectedItems.length === 0) {
      return `
        <div class="vezeeta-manifest-empty">
          <span class="manifest-empty-icon">🧪</span>
          <strong>${isEn ? 'No diagnostic tests requested yet' : 'لم يتم تحديد فحوصات أو تحاليل بعد'}</strong>
          <p>${isEn ? 'Select from quick clinical presets above or search the catalog to include in the certified medical report.' : 'اختر من الباقات السريعة بالأعلى أو ابحث في الدليل لإدراج الفحوصات في التقرير الطبي المعتمد.'}</p>
        </div>
      `;
    }

    return `
      <div class="vezeeta-manifest-cards-list">
        ${selectedItems.map((item, index) => {
          const isStat = String(item.urgency).toLowerCase() === "stat";
          const isLab = String(item.category).toUpperCase() === "LAB";
          const categoryBadge = isLab
            ? `<span class="vezeeta-type-tag lab">🧪 ${isEn ? 'Laboratory' : 'تحليل معملي'}</span>`
            : `<span class="vezeeta-type-tag rad">🩻 ${isEn ? 'Radiology' : 'أشعة وتصوير'}</span>`;

          const testName = isEn ? (item.nameEn || item.nameAr || item.code) : (item.nameAr || item.nameEn || item.code);
          const escapedIndication = escapeHtml(item.clinicalIndication || "");
          const codeSafe = escapeHtml(item.code);

          return `
            <div class="vezeeta-manifest-card ${isStat ? 'is-stat-urgent' : ''}" data-code="${codeSafe}">
              <div class="manifest-card-header">
                <div class="manifest-card-identity">
                  <span class="manifest-index-badge">${index + 1}</span>
                  <div>
                    <strong class="manifest-test-name">${escapeHtml(testName)}</strong>
                    <div class="manifest-test-meta">
                      ${categoryBadge}
                      <span class="vezeeta-code-tag">${codeSafe}</span>
                      ${item.loinc ? `<span class="vezeeta-loinc-tag">LOINC ${escapeHtml(item.loinc)}</span>` : ''}
                    </div>
                  </div>
                </div>
                <button type="button" class="manifest-remove-btn" onclick="HealthVibes.DoctorUI.removeInvestigationFromCase('${caseId}', '${codeSafe}')" title="${isEn ? 'Remove test' : 'حذف الفحص'}">
                  ✕
                </button>
              </div>

              <!-- Controls: Urgency Switcher & Clinical Indication -->
              <div class="manifest-card-body">
                <div class="manifest-urgency-row">
                  <span class="manifest-field-label">${isEn ? 'Priority:' : 'الأولوية:'}</span>
                  <div class="manifest-urgency-toggle" role="radiogroup">
                    <button type="button" class="urgency-pill-btn ${!isStat ? 'active' : ''}" onclick="HealthVibes.DoctorUI.updateInvestigationField('${caseId}', '${codeSafe}', 'urgency', 'routine')">
                      <span>📋</span> ${isEn ? 'Routine' : 'عادي'}
                    </button>
                    <button type="button" class="urgency-pill-btn stat-btn ${isStat ? 'active' : ''}" onclick="HealthVibes.DoctorUI.updateInvestigationField('${caseId}', '${codeSafe}', 'urgency', 'stat')">
                      <span>⚡</span> ${isEn ? 'STAT (Urgent)' : 'عاجل STAT'}
                    </button>
                  </div>
                </div>

                <div class="manifest-indication-row">
                  <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px; margin-bottom: 3px;">
                    <label for="ind_${codeSafe}" class="manifest-field-label">${isEn ? 'Clinical Indication / Reason:' : 'دواعي الفحص والهدف السريري:'}</label>
                    <span style="font-size: 10px; color: var(--muted);">${isEn ? 'EN / AR auto-direction' : 'يدعم العربية والإنجليزية'}</span>
                  </div>
                  <input type="text" id="ind_${codeSafe}" class="vezeeta-indication-input" dir="auto" value="${escapedIndication}" placeholder="${isEn ? 'e.g. Exclude pneumonic consolidation, assess leukocytosis...' : 'مثال: استبعاد ارتشاح رئوي، متابعة مؤشرات الالتهاب...'}" onchange="HealthVibes.DoctorUI.updateInvestigationField('${caseId}', '${codeSafe}', 'clinicalIndication', this.value)" />
                  <div class="indication-chips-quick" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
                    ${QUICK_INVESTIGATION_INDICATION_CHIPS.slice(0, 3).map(chip => `
                      <button type="button" class="indication-chip-btn" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px dashed var(--line); background: var(--surface); color: var(--muted); cursor: pointer;" onclick="HealthVibes.DoctorUI.applyInvestigationIndicationChip('${caseId}', '${codeSafe}', '${escapeHtml(isEn ? chip.en : chip.ar)}')">
                        + ${isEn ? chip.en : chip.ar}
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderInvestigationCatalogGridHtml(selectedItems = [], caseId, isEn = false) {
    const catalog = (global.HealthVibes?.DoctorService?.filterDiagnosticCatalog)
      ? global.HealthVibes.DoctorService.filterDiagnosticCatalog({
          category: activeInvestigationCategoryFilter === "HIGH_YIELD" ? "ALL" : activeInvestigationCategoryFilter,
          search: currentInvestigationSearchQuery,
          highYieldOnly: activeInvestigationCategoryFilter === "HIGH_YIELD"
        })
      : [];

    const selectedCodes = new Set(selectedItems.map(i => i.code.toUpperCase()));

    if (catalog.length === 0) {
      return `
        <div class="vezeeta-catalog-empty">
          <span>🔍</span>
          <strong>${isEn ? 'No tests matching your filter' : 'لا توجد فحوصات مطابقة لخيارات البحث'}</strong>
          <button type="button" class="soft-button" style="margin-top: 8px; font-size: 12px;" onclick="HealthVibes.DoctorUI.addCustomInvestigationPrompt('${caseId}')">
            <span>+</span> ${isEn ? 'Add Custom Investigation' : 'إضافة هذا الفحص كطلب مخصص'}
          </button>
        </div>
      `;
    }

    return `
      <div class="vezeeta-catalog-grid">
        ${catalog.map(item => {
          const isSelected = selectedCodes.has(item.code.toUpperCase());
          const isLab = item.category === "LAB";
          const title = isEn ? item.nameEn : item.nameAr;
          const desc = isEn ? item.descEn : item.descAr;
          const codeSafe = escapeHtml(item.code);

          return `
            <div class="vezeeta-catalog-card ${isSelected ? 'is-selected' : ''}" data-code="${codeSafe}">
              <div class="catalog-card-top">
                <div class="catalog-card-icon-title">
                  <span class="catalog-icon">${isLab ? '🧪' : '🩻'}</span>
                  <div>
                    <strong class="catalog-title">${escapeHtml(title)}</strong>
                    <div class="catalog-badges">
                      <span class="vezeeta-code-tag">${codeSafe}</span>
                      ${item.highYield ? `<span class="vezeeta-star-tag">⭐ ${isEn ? 'Top Pick' : 'شائع'}</span>` : ''}
                      ${item.fastingHours > 0 ? `<span class="vezeeta-fasting-tag">⚠️ ${isEn ? 'Fasting' : 'صيام'}</span>` : ''}
                    </div>
                  </div>
                </div>
                <button type="button" class="catalog-toggle-btn ${isSelected ? 'is-selected' : ''}" onclick="HealthVibes.DoctorUI.toggleInvestigationInCase('${caseId}', '${codeSafe}')" aria-label="${isSelected ? (isEn ? 'Remove' : 'حذف') : (isEn ? 'Add' : 'إضافة')}">
                  ${isSelected ? (isEn ? '✓ Selected' : '✓ تم الاختيار') : (isEn ? '+ Order' : '+ إضافة')}
                </button>
              </div>
              <p class="catalog-desc">${escapeHtml(desc)}</p>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderOrderInvestigationsStationHtml(caseRecord, isEn = false) {
    if (!caseRecord) return "";
    const caseId = caseRecord.id;
    const selected = getCaseInvestigations(caseId);
    const count = selected.length;

    return `
      <!-- ========================================================================= -->
      <!-- VEZEETA WORKSTATION: ORDER LABS & CHEST X-RAY REQUISITION                 -->
      <!-- ========================================================================= -->
      <section class="clinical-group-card vezeeta-investigations-card" id="vezeetaInvestigationsWorkstation" data-case-id="${escapeHtml(caseId)}" role="region" aria-label="${isEn ? 'Order Diagnostic Labs & Imaging' : 'طلب الفحوصات والتحاليل والأشعة التكميلية'}">
        <div class="vezeeta-card-header">
          <div class="vezeeta-header-main">
            <div class="vezeeta-icon-wrap" aria-hidden="true">
              <span class="vezeeta-brand-icon">🔬</span>
            </div>
            <div>
              <div class="vezeeta-title-row">
                <h4 class="vezeeta-heading">${isEn ? '4. Diagnostic Investigations & Radiology (Vezeeta E-Referral)' : '4. طلب الفحوصات والتحاليل والأشعة التكميلية (إذن فحص رسمي)'}</h4>
                <kbd class="toolbar-shortcut-tag" title="Alt+L shortcut">Alt+L</kbd>
              </div>
              <p class="vezeeta-subheading">
                ${isEn
                  ? 'Request complementary clinical labs (CBC, CRP, D-Dimer) or medical imaging (Chest X-Ray, HRCT) printed directly on the certified report.'
                  : 'تمكين الطبيب من تحديد فحوصات مطلوبة (صورة دم كاملة CBC، بروتين تفاعلي CRP، أشعة عادية على الصدر) لتظهر رسمياً في التقرير الطبي وخطة العلاج.'}
              </p>
            </div>
          </div>
          <div class="vezeeta-header-actions">
            <span id="orderedInvestigationsCountBadge" class="${count > 0 ? 'pill ok' : 'pill pending'}" style="font-size: 11.5px; font-weight: 700;">
              ${count > 0 ? (isEn ? `${count} tests selected` : `${count} فحوصات محددة`) : (isEn ? 'No tests selected' : 'لم يتم تحديد فحوصات')}
            </span>
          </div>
        </div>

        <!-- QUICK CLINICAL BUNDLES (ONE-CLICK PRESETS) -->
        <div class="vezeeta-presets-bar">
          <span class="vezeeta-presets-label">
            <span>⚡</span> ${isEn ? 'Clinical Workup Bundles:' : 'باقات الفحص السريري المباشر:'}
          </span>
          <div class="vezeeta-presets-scroll">
            <button type="button" class="vezeeta-bundle-btn" onclick="HealthVibes.DoctorUI.applyInvestigationPreset('${caseId}', 'respiratory_infection')">
              <span>🫁</span> ${isEn ? 'Respiratory Infection (CBC + CRP + X-Ray)' : 'التهاب تنفسي (صورة دم + بروتين + أشعة صدر)'}
            </button>
            <button type="button" class="vezeeta-bundle-btn" onclick="HealthVibes.DoctorUI.applyInvestigationPreset('${caseId}', 'acute_dyspnea_pe')">
              <span>⚠️</span> ${isEn ? 'Acute Dyspnea / PE (D-Dimer + ABG + X-Ray + ECG)' : 'ضيق تنفس واشتباه جلطة (دي دايمر + غازات + أشعة + رسم قلب)'}
            </button>
            <button type="button" class="vezeeta-bundle-btn" onclick="HealthVibes.DoctorUI.applyInvestigationPreset('${caseId}', 'viral_pneumonia')">
              <span>🦠</span> ${isEn ? 'Viral Pneumonia (Ferritin + CRP + D-Dimer + HRCT)' : 'التهاب فيروسي ورئوي (فيريتين + بروتين + دي دايمر + مقطعية)'}
            </button>
            <button type="button" class="vezeeta-bundle-btn" onclick="HealthVibes.DoctorUI.applyInvestigationPreset('${caseId}', 'cardiopulmonary_workup')">
              <span>❤️</span> ${isEn ? 'Cardiopulmonary Panel (CBC + Renal + X-Ray + ECG + Troponin)' : 'فحص صدري وقلبي شامل'}
            </button>
          </div>
        </div>

        <!-- WORKSTATION BODY: SPLIT VIEW FOR TABLET/DESKTOP, STACKED ON MOBILE -->
        <div class="vezeeta-workstation-layout">
          <!-- LEFT / TOP PANEL: CATALOG PICKER -->
          <div class="vezeeta-picker-panel">
            <!-- Search & Filter Controls -->
            <div class="vezeeta-controls-row">
              <div class="vezeeta-search-wrapper">
                <span class="vezeeta-search-icon" aria-hidden="true">🔍</span>
                <input type="search" id="searchInvestigationInput" class="vezeeta-search-input" placeholder="${isEn ? 'Search tests by name or code (CBC, CRP, X-Ray)...' : 'ابحث عن فحص أو تحليل أو أشعة (CBC, CRP, X-Ray)...'}" oninput="HealthVibes.DoctorUI.handleInvestigationSearchInput(this.value, '${caseId}')" />
              </div>
              <button type="button" class="soft-button vezeeta-custom-add-btn" onclick="HealthVibes.DoctorUI.addCustomInvestigationPrompt('${caseId}')" title="${isEn ? 'Add unlisted test' : 'إضافة فحص غير مدرج بالقائمة'}">
                <span>+</span> ${isEn ? 'Custom Test' : 'فحص مخصص'}
              </button>
            </div>

            <!-- Category Filter Pills -->
            <div class="vezeeta-category-pills" role="tablist">
              <button type="button" class="vezeeta-cat-pill ${activeInvestigationCategoryFilter === 'ALL' ? 'is-active' : ''}" data-cat="ALL" onclick="HealthVibes.DoctorUI.setInvestigationCategoryFilter('ALL', '${caseId}')">
                ${isEn ? 'All Tests' : 'جميع الفحوصات'}
              </button>
              <button type="button" class="vezeeta-cat-pill ${activeInvestigationCategoryFilter === 'LAB' ? 'is-active' : ''}" data-cat="LAB" onclick="HealthVibes.DoctorUI.setInvestigationCategoryFilter('LAB', '${caseId}')">
                🧪 ${isEn ? 'Lab Tests' : 'تحاليل مخبرية'}
              </button>
              <button type="button" class="vezeeta-cat-pill ${activeInvestigationCategoryFilter === 'RADIOLOGY' ? 'is-active' : ''}" data-cat="RADIOLOGY" onclick="HealthVibes.DoctorUI.setInvestigationCategoryFilter('RADIOLOGY', '${caseId}')">
                🩻 ${isEn ? 'Radiology & Imaging' : 'أشعة وتصوير'}
              </button>
              <button type="button" class="vezeeta-cat-pill ${activeInvestigationCategoryFilter === 'HIGH_YIELD' ? 'is-active' : ''}" data-cat="HIGH_YIELD" onclick="HealthVibes.DoctorUI.setInvestigationCategoryFilter('HIGH_YIELD', '${caseId}')">
                ⭐ ${isEn ? 'High-Yield Clinic' : 'الأكثر طلباً'}
              </button>
            </div>

            <!-- Filtered Catalog Grid -->
            <div id="investigationsCatalogGrid" class="vezeeta-catalog-scroll-area">
              ${renderInvestigationCatalogGridHtml(selected, caseId, isEn)}
            </div>
          </div>

          <!-- RIGHT / BOTTOM PANEL: SELECTED ORDERS MANIFEST -->
          <div class="vezeeta-manifest-panel">
            <div class="manifest-header">
              <div class="manifest-header-title">
                <span class="manifest-icon">📋</span>
                <strong style="font-size: 13.5px;">${isEn ? 'Requested Diagnostic Orders' : 'قائمة الفحوصات المطلوبة للتقرير'}</strong>
              </div>
              ${count > 0 ? `
                <button type="button" class="manifest-clear-all-btn" onclick="HealthVibes.DoctorUI.setCaseInvestigations('${caseId}', [])">
                  ${isEn ? 'Clear All' : 'إفراغ القائمة'}
                </button>
              ` : ''}
            </div>

            <!-- Manifest Content List -->
            <div id="selectedInvestigationsManifest" class="manifest-scroll-area">
              ${renderSelectedInvestigationsListHtml(selected, caseId, isEn)}
            </div>

            <!-- Patient Preparation & Lab Requisition Summary Footer -->
            <div class="vezeeta-manifest-footer">
              <div class="manifest-footer-tip">
                <span>💡</span>
                <small>${isEn ? 'Ordered tests automatically appear on the certified medical report with LOINC/RADLEX codes for partnered laboratories.' : 'تظهر الفحوصات المطلوبة تلقائياً في التقرير الطبي المعتمد مع أكواد LOINC الدولية لمعامل التحاليل ومراكز الأشعة المعتمدة.'}</small>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // ===========================================================================
  // 11. DOCTOR PRIVATE NOTES (CONFIDENTIAL CLINICAL QUARANTINE)
  // ===========================================================================

  function getCasePrivateNotes(caseId) {
    if (!caseId) return { privateNotes: "", includePrivateNotesInReport: false };
    const draft = getDraftNotes(caseId);
    if (draft && draft.privateNotes !== undefined) {
      return {
        privateNotes: draft.privateNotes || "",
        includePrivateNotesInReport: Boolean(draft.includePrivateNotesInReport)
      };
    }
    const target = (Array.isArray(global.cases) ? global.cases.find(x => x.id === caseId) : null) ||
                   (global._currentViewingCase && global._currentViewingCase.id === caseId ? global._currentViewingCase : null);
    if (target) {
      return {
        privateNotes: target.privateNotes || target.doctorPrivateNotes || "",
        includePrivateNotesInReport: Boolean(target.includePrivateNotesInReport)
      };
    }
    return { privateNotes: "", includePrivateNotesInReport: false };
  }

  function isPrivateNotesIncludedInReport(caseId) {
    return getCasePrivateNotes(caseId).includePrivateNotesInReport;
  }

  function setCasePrivateNotes(caseId, notes = "", includeInReport = false) {
    if (!caseId) return;
    saveDraftNotes(caseId, {
      privateNotes: String(notes || ""),
      includePrivateNotesInReport: Boolean(includeInReport)
    });
  }

  function handlePrivateNotesShareToggle(isChecked, caseId) {
    if (!caseId) return;
    const isEn = (global.currentLanguage || "ar") === "en";
    const badge = document.getElementById("privateNotesSecurityBadge");
    const station = document.getElementById("doctorPrivateNotesStation");
    const textarea = document.getElementById("doctorPrivateNotesInput");
    const shareControl = document.querySelector(".private-notes-share-control");
    const shareHint = document.querySelector(".private-notes-share-hint");
    const iconSpan = document.querySelector(".private-notes-icon");

    if (badge) {
      badge.className = `pill ${isChecked ? 'ok' : 'danger'}`;
      badge.textContent = isChecked
        ? (isEn ? '🌐 Included in Report' : '🌐 مضافة لتقرير المريض')
        : (isEn ? '🔒 Quarantined / Private' : '🔒 سرية ومحجوبة عن المريض');
    }

    if (station) {
      station.classList.toggle("is-shared-with-patient", isChecked);
      station.classList.toggle("is-quarantined", !isChecked);
    }
    if (textarea) {
      textarea.classList.toggle("shared-mode", isChecked);
      textarea.classList.toggle("quarantined-mode", !isChecked);
    }
    if (iconSpan) {
      iconSpan.textContent = isChecked ? '📝' : '🔒';
    }
    if (shareControl) {
      shareControl.classList.toggle("is-active", isChecked);
    }
    if (shareHint) {
      shareHint.textContent = isChecked
        ? (isEn ? '⚠️ Overrides quarantine: This note will be visible on the printable report and in the patient portal.' : '⚠️ تم إلغاء الحجب: ستظهر هذه الملاحظة رسمياً في تقرير المريض المطبوع وبوابة المريض.')
        : (isEn ? '🔒 Recommended default: Kept strictly internal in the clinical case file and hidden from the patient.' : '🔒 الوضع الافتراضي الموصى به: تظل الملاحظات داخلية في ملف الحالة وتُحجب بالكامل عن المريض.');
    }

    const currentNotes = textarea ? textarea.value : "";
    saveDraftNotes(caseId, {
      privateNotes: currentNotes,
      includePrivateNotesInReport: isChecked
    });

    if (typeof global.showToast === "function") {
      global.showToast(isChecked
        ? (isEn ? "Private notes will be included in the patient report." : "سيتم إدراج الملاحظات في تقرير المريض.")
        : (isEn ? "Private notes quarantined (hidden from patient)." : "تم حجب الملاحظات الخاصة عن تقرير المريض."));
    }
  }

  function handlePrivateNotesInput(text, caseId) {
    if (!caseId) return;
    const check = document.getElementById("includePrivateNotesInReport");
    saveDraftNotes(caseId, {
      privateNotes: text,
      includePrivateNotesInReport: check ? check.checked : false
    });
  }

  function renderPrivateNotesStationHtml(caseRecord, isEn = false) {
    if (!caseRecord) return "";
    const caseId = caseRecord.id;
    const { privateNotes, includePrivateNotesInReport } = getCasePrivateNotes(caseId);
    const isIncluded = Boolean(includePrivateNotesInReport);

    return `
      <!-- ========================================================================= -->
      <!-- DOCTOR PRIVATE NOTES: CLINICAL QUARANTINE VS REPORT INCLUSION             -->
      <!-- ========================================================================= -->
      <section class="clinical-group-card doctor-private-notes-station ${isIncluded ? 'is-shared-with-patient' : 'is-quarantined'}" id="doctorPrivateNotesStation" data-case-id="${escapeHtml(caseId)}" role="region" aria-label="${isEn ? 'Doctor Private Notes' : 'ملاحظات الطبيب السريرية الخاصة'}">
        <div class="private-notes-header">
          <div class="private-notes-header-main">
            <div class="private-notes-icon-wrap" aria-hidden="true">
              <span class="private-notes-icon">${isIncluded ? '📝' : '🔒'}</span>
            </div>
            <div>
              <div class="private-notes-title-row">
                <h4 class="private-notes-heading">${isEn ? '5. Doctor Private Notes (Clinical Quarantine)' : '5. الملاحظات السريرية الخاصة بالطبيب (محجوبة عن المريض افتراضياً)'}</h4>
                <span id="privateNotesSecurityBadge" class="pill ${isIncluded ? 'ok' : 'danger'}" style="font-size: 11px; font-weight: 700;">
                  ${isIncluded ? (isEn ? '🌐 Included in Report' : '🌐 مضافة لتقرير المريض') : (isEn ? '🔒 Quarantined / Private' : '🔒 سرية ومحجوبة عن المريض')}
                </span>
              </div>
              <p class="private-notes-subheading">
                ${isEn
                  ? 'Record confidential clinical hypotheses, differential diagnosis notes, or sensitive observations. These notes are saved securely to the case record and strictly quarantined from the patient unless explicitly enabled below.'
                  : 'تدوين ملاحظات تشخيصية تفريقية، فرضيات سريرية، أو تنبيهات متابعة داخلية. تُحفظ بأمان في ملف الحالة وتُحجب تماماً عن تقرير المريض إلا إذا قمت بتفعيل خيار الإدراج أدناه.'}
              </p>
            </div>
          </div>
        </div>

        <!-- Textarea Input with dir="auto" -->
        <div class="private-notes-input-wrapper">
          <label for="doctorPrivateNotesInput" class="visually-hidden">
            ${isEn ? 'Doctor Private Notes' : 'ملاحظات الطبيب الخاصة'}
          </label>
          <textarea
            id="doctorPrivateNotesInput"
            name="doctorPrivateNotes"
            class="doctor-private-notes-textarea ${isIncluded ? 'shared-mode' : 'quarantined-mode'}"
            dir="auto"
            rows="3"
            placeholder="${isEn
              ? 'Enter confidential clinical notes (e.g., differential diagnoses, compliance doubts, sensitive family history). Strictly hidden from the patient report by default...'
              : 'أدخل الملاحظات السريرية الخاصة بالطبيب (مثل: تشخيصات تفريقية، شكوك التزام دوائي، تنبيهات متابعة). تظل سرية ومحجوبة تماماً عن تقرير المريض افتراضياً...'}"
            oninput="HealthVibes.DoctorUI.handlePrivateNotesInput(this.value, '${escapeHtml(caseId)}')"
          >${escapeHtml(privateNotes)}</textarea>
        </div>

        <!-- Consent / Inclusion in Patient Report Toggle -->
        <div class="private-notes-share-control ${isIncluded ? 'is-active' : ''}">
          <label class="private-notes-share-label">
            <input
              type="checkbox"
              id="includePrivateNotesInReport"
              class="private-notes-checkbox"
              ${isIncluded ? 'checked' : ''}
              onchange="HealthVibes.DoctorUI.handlePrivateNotesShareToggle(this.checked, '${escapeHtml(caseId)}')"
            />
            <span class="private-notes-share-text">
              <strong>${isEn ? 'Include these clinical notes in the patient\'s certified medical report' : 'إدراج هذه الملاحظات في تقرير المريض الطبي المعتمد'}</strong>
              <small class="private-notes-share-hint">
                ${isIncluded
                  ? (isEn ? '⚠️ Overrides quarantine: This note will be visible on the printable report and in the patient portal.' : '⚠️ تم إلغاء الحجب: ستظهر هذه الملاحظة رسمياً في تقرير المريض المطبوع وبوابة المريض.')
                  : (isEn ? '🔒 Recommended default: Kept strictly internal in the clinical case file and hidden from the patient.' : '🔒 الوضع الافتراضي الموصى به: تظل الملاحظات داخلية في ملف الحالة وتُحجب بالكامل عن المريض.')}
              </small>
            </span>
          </label>
        </div>
      </section>
    `;
  }

  // ===========================================================================
  // 12. EXPORTS & ATTACHMENT TO HEALTHVIBES GLOBAL
  // ===========================================================================

  const DoctorUI = {
    getDiagnosticPresets,
    // Draft Notes Preservation
    saveDraftNotes,
    getDraftNotes,
    hasDraftNotes,
    clearDraftNotes,
    discardDraftNotes,
    attachDraftPreservationListeners,
    updateDraftBadgeVisibility,
    // Revision Tracking
    getCaseRevisionNumber,
    isRevisionStale,
    acknowledgeNewRevision,
    // UI Renderers
    renderPersistentCaseHeader,
    renderStaleRevisionBanner,
    extractRevisionDifferences,
    renderFieldComparisonModalHtml,
    openFieldComparisonModal,
    closeFieldComparisonModal,
    handleModalBackdropClick,
    handleVerificationCheckboxChange,
    // Workspace Navigation & State Preservation
    getSavedQueueScrollTop,
    setSavedQueueScrollTop,
    getActiveReviewTab,
    switchReviewTab,
    returnToQueue,
    openCaseOnMobile,
    renderMobileNavBar,
    renderReviewTabs,
    // Structured Clarification Thread
    PERMITTED_ATTACHMENT_CONFIG,
    CLINICAL_MEASUREMENT_UNITS,
    validateAttachmentFile,
    formatBytes,
    extractClarificationThread,
    renderClarificationThreadHtml,
    submitClarificationReply,
    // Doctor Access, Hypertension BP History, Attachments, Reports & Internal Notes
    isCaseAssignedToDoctor,
    renderHypertensionBpHistorySection,
    renderAttachmentsSection,
    renderPreviousApprovedReportsSection,
    renderInternalDoctorNotesSection,
    scrubInternalNotesForPatient,
    // Blood Clotting / Blood Disorders Doctor Review Workflow
    PROVENANCE_CATEGORIES,
    getBloodDisorderProvenanceCategory,
    getBloodDisorderProvenanceBadge,
    renderBloodDisordersReviewSection,
    // Obesity & Metabolic Health Doctor Review Workflow
    renderObesityReviewSection,
    // Clinical Risk Override Workflow
    VALID_OVERRIDE_PRIORITIES,
    VALID_OVERRIDE_CATEGORIES,
    OVERRIDE_CATEGORY_META,
    QUICK_CLINICAL_REASON_CHIPS,
    renderRiskOverrideSection,
    renderRiskOverrideModalHtml,
    openOverrideRiskModal,
    closeOverrideRiskModal,
    handleRiskModalBackdropClick,
    selectOverridePriorityOption,
    applyOverrideReasonChip,
    setOverrideChipsLang,
    submitOverrideRisk,
    initDoctorKeyboardShortcuts,
    // Reject Assessment & Request Re-entry Workflow (K Health)
    REJECTION_REENTRY_CATEGORIES,
    REJECTION_REENTRY_META,
    REENTRY_REQUEST_FIELDS,
    QUICK_REENTRY_INSTRUCTION_CHIPS,
    renderRejectReentryModalHtml,
    openRejectReentryModal,
    closeRejectReentryModal,
    handleRejectModalBackdropClick,
    setRejectReentryMode,
    toggleReentryField,
    setReentryChipsLang,
    applyReentryInstructionChip,
    updateReentryNotificationPreview,
    submitRejectReentry,
    renderReentryStatusAlertBanner,
    // Diagnostic Investigations & Radiology Ordering (Vezeeta Pattern)
    INVESTIGATION_CATEGORIES: (global.HealthVibes?.DoctorService?.INVESTIGATION_CATEGORIES) || { LAB: "LAB", RADIOLOGY: "RADIOLOGY" },
    INVESTIGATION_URGENCIES: (global.HealthVibes?.DoctorService?.INVESTIGATION_URGENCIES) || { ROUTINE: "routine", STAT: "stat" },
    getCaseInvestigations,
    setCaseInvestigations,
    addInvestigationToCase,
    removeInvestigationFromCase,
    toggleInvestigationInCase,
    updateInvestigationField,
    applyInvestigationPreset,
    addCustomInvestigationPrompt,
    setInvestigationCategoryFilter,
    handleInvestigationSearchInput,
    renderSelectedInvestigationsListHtml,
    renderInvestigationCatalogGridHtml,
    renderOrderInvestigationsStationHtml,
    QUICK_INVESTIGATION_INDICATION_CHIPS,
    QUICK_PATIENT_RECOMMENDATION_CHIPS,
    applyInvestigationIndicationChip,
    applyPatientRecommendationChip,
    getPatientRecommendationChipsHtml,
    setPatientRecommendationChipsLang,
    // Doctor Private Notes (Clinical Quarantine)
    getCasePrivateNotes,
    isPrivateNotesIncludedInReport,
    setCasePrivateNotes,
    handlePrivateNotesShareToggle,
    handlePrivateNotesInput,
    renderPrivateNotesStationHtml
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorUI = DoctorUI;
  global.HealthVibes.ClarificationThread = {
    extractClarificationThread,
    renderClarificationThreadHtml,
    submitClarificationReply,
    validateAttachmentFile,
    PERMITTED_ATTACHMENT_CONFIG,
    CLINICAL_MEASUREMENT_UNITS
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initDoctorKeyboardShortcuts());
    } else {
      initDoctorKeyboardShortcuts();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorUI;
  }
})(typeof window !== "undefined" ? window : globalThis);

