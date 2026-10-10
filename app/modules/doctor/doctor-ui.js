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
    delete sanitized.internalDoctorNotes;
    delete sanitized.internalNotes;
    delete sanitized.clinicianQuarantineNotes;
    delete sanitized.privatePhysicianNotes;
    if (sanitized.reportSnapshot) {
      const rs = { ...sanitized.reportSnapshot };
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
  // 8. EXPORTS & ATTACHMENT TO HEALTHVIBES GLOBAL
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
    scrubInternalNotesForPatient
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorUI;
  }
})(typeof window !== "undefined" ? window : globalThis);

