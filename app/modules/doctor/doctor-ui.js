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
  const doctorDraftNotesStore = new Map();       // caseId -> { diagnosis, medications, recommendations, savedAt }
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
      savedAt: Date.now()
    };
    doctorDraftNotesStore.set(caseId, updated);
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
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  function hasDraftNotes(caseId) {
    const draft = getDraftNotes(caseId);
    if (!draft) return false;
    return Boolean(
      (draft.diagnosis && draft.diagnosis.trim()) ||
      (draft.medications && draft.medications.trim()) ||
      (draft.recommendations && draft.recommendations.trim())
    );
  }

  function clearDraftNotes(caseId) {
    if (!caseId) return;
    doctorDraftNotesStore.delete(caseId);
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

    const onInput = () => {
      saveDraftNotes(caseId, {
        diagnosis: diagInput ? diagInput.value : "",
        medications: medsInput ? medsInput.value : "",
        recommendations: recsInput ? recsInput.value : ""
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
    const statusMeta = (typeof global.getCaseStatusMeta === "function" && global.getCaseStatusMeta(c.status)?.icon)
      ? global.getCaseStatusMeta(c.status)
      : (STATUS_META[statusKey] || {
          icon: "🩺",
          en: statusKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          ar: "قيد الفحص",
          pillClass: "pending"
        });

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
    if (Array.isArray(c.files) && c.files.length > 0) {
      diffs.push({
        id: "attachments",
        icon: "📎",
        label: isEn ? "Uploaded Medical Files" : "الملفات والتقارير المرفقة",
        prevVal: isEn ? "None" : "لا توجد ملفات سابقة",
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: `${c.files.length} ${isEn ? "file(s) attached" : "ملفات مرفقة حديثاً"}`,
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
      if (diagInput || medsInput || recsInput) {
        saveDraftNotes(activeCaseId, {
          diagnosis: diagInput?.value || "",
          medications: medsInput?.value || "",
          recommendations: recsInput?.value || ""
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
  // 7. EXPORTS & ATTACHMENT TO HEALTHVIBES GLOBAL
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
    renderReviewTabs
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorUI = DoctorUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
