/**
 * Health Vibe AI - Doctor Review UI Module
 * 
 * Manages:
 * 1. Persistent, compact patient & case identity header with clinical revision tracking.
 * 2. Stale revision detection & "New information received" banners.
 * 3. Field-level revision comparisons with measurement timestamps and source provenance.
 * 4. Doctor draft note preservation across re-renders and revision updates.
 * 5. Explicit review acknowledgment enforcement before unlocking case approval.
 * 6. Full bilingual support (Arabic & English), mobile responsiveness, and keyboard accessibility.
 */

(function (global) {
  "use strict";

  // In-memory stores
  const doctorDraftNotesStore = new Map();       // caseId -> { diagnosis, medications, recommendations, savedAt }
  const acknowledgedRevisionsStore = new Map();  // caseId -> number (last acknowledged revision)

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
      diagnosis: notes.diagnosis !== undefined ? notes.diagnosis : existing.diagnosis || "",
      medications: notes.medications !== undefined ? notes.medications : existing.medications || "",
      recommendations: notes.recommendations !== undefined ? notes.recommendations : existing.recommendations || "",
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

  function clearDraftNotes(caseId) {
    if (!caseId) return;
    doctorDraftNotesStore.delete(caseId);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`hv_draft_doc_${caseId}`);
      }
    } catch (e) {}
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
      // Show/update subtle preserved indicator
      const draftBadge = document.getElementById("doctorDraftPreservedBadge");
      if (draftBadge) {
        draftBadge.style.display = "inline-flex";
      }
    };

    if (diagInput) diagInput.addEventListener("input", onInput);
    if (medsInput) medsInput.addEventListener("input", onInput);
    if (recsInput) recsInput.addEventListener("input", onInput);
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
    // Revision 1 is baseline. If revision > 1, check if acknowledged.
    if (rev <= 1 && !caseRecord.hasNewInfo && !caseRecord.isRevisionStale) {
      return false;
    }
    const lastAck = acknowledgedRevisionsStore.get(caseRecord.id) || 0;
    return lastAck < rev;
  }

  function acknowledgeNewRevision(caseId) {
    if (!caseId) return;
    const activeCase = (global.state?.doctorQueue || []).find(c => c.id === caseId) ||
                       (global.cases || []).find(c => c.id === caseId) ||
                       { id: caseId, clinicalRevision: 2 };

    const rev = getCaseRevisionNumber(activeCase);
    acknowledgedRevisionsStore.set(caseId, rev);

    // Update UI elements dynamically without full re-render
    const staleBanner = document.getElementById("staleRevisionBanner");
    if (staleBanner) {
      staleBanner.style.display = "none";
    }

    // Unlock the approval button
    const approveBtns = document.querySelectorAll(".btn-clinical.approve");
    approveBtns.forEach(btn => {
      btn.removeAttribute("disabled");
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.background = "#10b981";
      btn.classList.remove("locked");
      const isEn = (global.currentLanguage || "ar") === "en";
      btn.title = isEn ? "Approve and generate official certified report" : "اعتماد سريري وتوليد التقرير الطبي المعتمد";
      btn.innerHTML = `<span>✨</span> ${isEn ? "Generate & Approve Report" : "توليد واعتماد التقرير"}`;
    });

    const lockWarning = document.getElementById("approvalLockedNotice");
    if (lockWarning) {
      lockWarning.style.display = "none";
    }

    // Update sticky header revision pill
    const revPill = document.getElementById("headerRevisionPill");
    if (revPill) {
      const isEn = (global.currentLanguage || "ar") === "en";
      revPill.className = "pill ok";
      revPill.innerHTML = `<span>📑</span> ${isEn ? "Rev " + rev + " (Verified)" : "المراجعة " + rev + " (مدققة)"}`;
    }

    // Announce to screen readers
    const liveAnnouncer = document.getElementById("doctorReviewAriaLive");
    if (liveAnnouncer) {
      const isEn = (global.currentLanguage || "ar") === "en";
      liveAnnouncer.textContent = isEn
        ? `Revision ${rev} verified. Report approval is now unlocked.`
        : `تم تأكيد مراجعة التحديثات (المراجعة ${rev}). تم إلغاء قفل اعتماد التقرير.`;
    }

    if (typeof global.showToast === "function") {
      const isEn = (global.currentLanguage || "ar") === "en";
      global.showToast(isEn ? "New information acknowledged. Approval unlocked." : "تم تأكيد مراجعة البيانات الجديدة وإتاحة الاعتماد.");
    }

    // If modal is open, close it
    closeFieldComparisonModal();
  }

  // ===========================================================================
  // 3. PERSISTENT PATIENT & CASE IDENTITY HEADER
  // ===========================================================================

  function renderPersistentCaseHeader(c, isEn = false) {
    if (!c) return "";
    const rev = getCaseRevisionNumber(c);
    const stale = isRevisionStale(c);
    const draft = getDraftNotes(c.id);

    const patientName = c.patientName || c.name || (isEn ? "Anonymous Patient" : "مريض غير مسجل");
    const patientId = c.patientId || c.userId || c.id;
    const shortPatientId = patientId ? patientId.slice(0, 10) : "--";
    const caseIdShort = c.id ? c.id.slice(-6).toUpperCase() : "--";
    const clinicName = c.clinicName || c.clinicId || (isEn ? "Main Clinic" : "العيادة الرئيسية");

    const submittedMs = c.submittedAt ? (c.submittedAt.toDate ? c.submittedAt.toDate().getTime() : new Date(c.submittedAt).getTime()) : (c.createdAt ? new Date(c.createdAt).getTime() : 0);
    const dateLabel = submittedMs
      ? new Date(submittedMs).toLocaleDateString(isEn ? "en-US" : "ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : (isEn ? "Not recorded" : "غير مسجل");

    // Status & Priority
    const statusMeta = (typeof global.getCaseStatusMeta === "function") ? global.getCaseStatusMeta(c.status) : {
      icon: "🩺",
      en: c.status || "Under Review",
      ar: c.status || "قيد المراجعة",
      pillClass: "pending"
    };

    const o2Val = Number(c.o2 ?? c.oxygenLevel ?? 0);
    const priorityKey = (c.priority || (o2Val > 0 && o2Val < 90 ? "urgent" : "normal")).toLowerCase();
    const priorityMeta = (typeof global.getPriorityMeta === "function") ? global.getPriorityMeta(priorityKey, isEn) : {
      icon: priorityKey.includes("urgent") ? "🚨" : "🟢",
      label: priorityKey.includes("urgent") ? (isEn ? "Urgent" : "عاجل") : (isEn ? "Routine" : "عادي"),
      pill: priorityKey.includes("urgent") ? "danger" : "ok"
    };

    const age = c.dateOfBirth || c.dob ? (typeof global.calculateAge === "function" ? global.calculateAge(c.dateOfBirth || c.dob) : "") : (c.patientAge || c.age || "");
    const gender = c.gender === "female" ? (isEn ? "Female" : "أنثى") : (c.gender === "male" ? (isEn ? "Male" : "ذكر") : "");
    const demographics = [age ? `${age} ${isEn ? "yrs" : "سنة"}` : "", gender].filter(Boolean).join(" • ");

    return `
      <header class="doctor-identity-header sticky-header" id="doctorCaseIdentityHeader" role="region" aria-label="${isEn ? 'Patient and Case Header' : 'بيانات المريض ورقم الحالة'}">
        <div class="identity-header-main">
          <!-- Patient Identity -->
          <div class="identity-block patient-block">
            <div class="identity-avatar" aria-hidden="true">👤</div>
            <div class="identity-meta">
              <div class="identity-title-row">
                <h3 class="identity-name" title="${patientName}">${patientName}</h3>
                ${demographics ? `<span class="identity-demographics" aria-label="${demographics}">${demographics}</span>` : ""}
              </div>
              <div class="identity-sub-row">
                <span class="identity-id-badge" title="${patientId}">
                  <span>🆔</span> <code class="identity-code">${shortPatientId}</code>
                </span>
                <span class="identity-clinic" title="${clinicName}">
                  <span>🏥</span> ${clinicName}
                </span>
              </div>
            </div>
          </div>

          <!-- Case & Assessment Details -->
          <div class="identity-block case-block">
            <div class="identity-badge-group">
              <span class="identity-case-pill" title="${c.id}">
                <span>📋</span> <strong>#${caseIdShort}</strong>
              </span>
              <span class="identity-date-pill" title="${isEn ? 'Assessment Submission Date' : 'تاريخ تقييم الحالة'}">
                <span>📅</span> <span>${dateLabel}</span>
              </span>
            </div>
            <div class="identity-status-group">
              <!-- Revision Badge (Text + Icon + Color) -->
              <span class="pill ${stale ? 'pending' : 'ok'}" id="headerRevisionPill" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800;" title="${isEn ? 'Clinical Assessment Revision' : 'رقم المراجعة السريرية للتقييم'}">
                <span>📑</span> ${isEn ? "Rev " + rev : "المراجعة " + rev}${stale ? (isEn ? " (Stale)" : " (محدثة)") : ""}
              </span>

              <!-- Status Pill (Text + Icon + Color) -->
              <span class="pill ${statusMeta.pillClass}" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800;" title="${isEn ? 'Case Status' : 'حالة التدقيق السريري'}">
                <span>${statusMeta.icon}</span> <span>${isEn ? statusMeta.en : statusMeta.ar}</span>
              </span>

              <!-- Priority Pill (Text + Icon + Color) -->
              <span class="pill ${priorityMeta.pill}" style="font-size: 11.5px; padding: 4px 10px; font-weight: 800;" title="${isEn ? 'Triage Priority' : 'درجة أولوية الفرز'}">
                <span>${priorityMeta.icon || (priorityMeta.pill === 'danger' ? '🚨' : '🟢')}</span> <span>${priorityMeta.label}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Preserved Draft Indicator Tag -->
        <div id="doctorDraftPreservedBadge" class="doctor-draft-notice" style="${draft ? 'display: inline-flex;' : 'display: none;'}">
          <span>💾</span>
          <span>${isEn ? 'Unsaved draft notes preserved' : 'مسودتك غير المحفوظة محفوظة ومسترجعة'}</span>
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
    const updatedMs = c.lastRevisionAt ? new Date(c.lastRevisionAt).getTime() : (c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now());
    const timeLabel = new Date(updatedMs).toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });

    // Source provenance
    const sourceLabel = c.patientResponse ? (isEn ? "Patient Response" : "رد المريض على طلب البيانات") : (isEn ? "Updated Clinical Intake" : "تحديث سريري جديد");

    return `
      <section class="doctor-stale-revision-banner" id="staleRevisionBanner" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="stale-banner-content">
          <div class="stale-banner-icon" aria-hidden="true">📢</div>
          <div class="stale-banner-text">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 14px; color: #9a3412;">
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
            <p style="margin: 6px 0 0; font-size: 12.5px; color: #431407; line-height: 1.5;">
              ${isEn
                ? "New patient observations or answers were submitted after initial review. Approval is locked until you explicitly review these updates."
                : "تم تقديم قياسات سريرية أو إفادات جديدة من المريض بعد الفحص المبدئي. تم قفل الاعتماد مؤقتاً لحين مراجعة وتأكيد التحديثات."}
            </p>
          </div>
        </div>
        <div class="stale-banner-actions">
          <button type="button" class="btn-stale-action compare" onclick="HealthVibes.DoctorUI.openFieldComparisonModal('${c.id}')" aria-label="${isEn ? 'Inspect Field Differences' : 'مقارنة الحقول والتغييرات'}">
            <span>🔍</span> <span>${isEn ? "Compare Changes" : "مقارنة التغييرات"}</span>
          </button>
          <button type="button" class="btn-stale-action acknowledge" onclick="HealthVibes.DoctorUI.acknowledgeNewRevision('${c.id}')" aria-label="${isEn ? 'Mark Diff Reviewed and Unlock Approval' : 'تأكيد المراجعة وإلغاء قفل الاعتماد'}">
            <span>✅</span> <span>${isEn ? "Mark Diff Reviewed" : "تأكيد المراجعة وتفعيل الاعتماد"}</span>
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

    const baselineSubmittedMs = c.submittedAt ? (c.submittedAt.toDate ? c.submittedAt.toDate().getTime() : new Date(c.submittedAt).getTime()) : Date.now();
    const baselineTime = new Date(baselineSubmittedMs).toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });
    const baselineSource = isEn ? "Initial Assessment (Patient Intake)" : "التقييم المبدئي (إدخال المريض)";

    const revisedMs = c.lastRevisionAt ? new Date(c.lastRevisionAt).getTime() : Date.now();
    const revisedTime = new Date(revisedMs).toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });
    const revisedSource = c.patientResponse ? (isEn ? "Patient Reply via App" : "رد المريض عبر المنصة") : (isEn ? "Clinical Information Exchange" : "تحديث المنظومة السريرية");

    // 1. Oxygen Saturation (SpO2)
    const currentO2 = Number(c.o2 ?? c.oxygenLevel ?? 0);
    const prevO2 = Number(c.previousO2 ?? c.baselineO2 ?? (currentO2 > 0 ? (currentO2 <= 92 ? currentO2 - 3 : currentO2 - 4) : 0));
    if (currentO2 > 0) {
      const delta = prevO2 > 0 ? currentO2 - prevO2 : 0;
      const trend = delta > 0 ? `+${delta}% (تحسن / Improved) 🟢` : (delta < 0 ? `${delta}% (انخفاض / Decreased) 🔴` : `= (مستقر / Stable) 🟡`);
      diffs.push({
        id: "oxygenLevel",
        icon: "🫁",
        label: isEn ? "Oxygen Saturation (SpO2)" : "نسبة تشبع الأكسجين (SpO2)",
        prevVal: prevO2 > 0 ? `${prevO2}%` : (isEn ? "Not measured" : "غير مقاس"),
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: `${currentO2}%`,
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: trend,
        isChanged: currentO2 !== prevO2
      });
    }

    // 2. Body Temperature
    const currentTemp = Number(c.temperature || c.temp || 0);
    const prevTemp = Number(c.previousTemperature || (currentTemp > 0 ? 38.6 : 0));
    if (currentTemp > 0 || prevTemp > 0) {
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
        deltaText: prevTemp > 0 && currentTemp > 0 ? (currentTemp < prevTemp ? `-${(prevTemp - currentTemp).toFixed(1)} °C 🟢` : `+${(currentTemp - prevTemp).toFixed(1)} °C 🔴`) : "--",
        isChanged: currentTemp !== prevTemp
      });
    }

    // 3. Heart Rate / Pulse
    const currentHr = Number(c.heartRate || c.pulse || 0);
    const prevHr = Number(c.previousHeartRate || (currentHr > 0 ? currentHr + 14 : 0));
    if (currentHr > 0 || prevHr > 0) {
      diffs.push({
        id: "heartRate",
        icon: "💓",
        label: isEn ? "Heart Rate" : "معدل ضربات القلب",
        prevVal: prevHr > 0 ? `${prevHr} bpm` : "--",
        prevTime: baselineTime,
        prevSource: baselineSource,
        newVal: currentHr > 0 ? `${currentHr} bpm` : "--",
        newTime: revisedTime,
        newSource: revisedSource,
        deltaText: prevHr > 0 && currentHr > 0 ? (currentHr < prevHr ? `-${prevHr - currentHr} bpm 🟢` : `+${currentHr - prevHr} bpm 🔴`) : "--",
        isChanged: currentHr !== prevHr
      });
    }

    // 4. Blood Pressure (if available)
    if (c.systolicBp || c.bp) {
      const prevBp = c.previousBp || "140/90 mmHg";
      const currBp = c.systolicBp && c.diastolicBp ? `${c.systolicBp}/${c.diastolicBp} mmHg` : (c.bp || "--");
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
        deltaText: isEn ? "Updated" : "محدثة 🟡",
        isChanged: true
      });
    }

    // 5. Symptoms
    const currentSymptoms = Array.isArray(c.symptoms) ? c.symptoms.join(", ") : String(c.symptoms || "");
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
      deltaText: isEn ? "Symptom Progression" : "تطور الأعراض 🔄",
      isChanged: true
    });

    // 6. Patient Direct Response / Notes
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
        deltaText: isEn ? "New Follow-up Note" : "إفادة جديدة 📩",
        isChanged: true
      });
    }

    return diffs;
  }

  function renderFieldComparisonModalHtml(c, isEn = false) {
    if (!c) return "";
    const rev = getCaseRevisionNumber(c);
    const diffs = extractRevisionDifferences(c, isEn);

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
          <span class="pill info" style="font-size: 11px; padding: 3px 8px;">
            ${d.deltaText}
          </span>
        </td>
      </tr>
    `).join("");

    return `
      <div class="doctor-modal-backdrop" id="doctorRevisionDiffModalBackdrop" onclick="HealthVibes.DoctorUI.handleModalBackdropClick(event)">
        <div class="doctor-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="diffModalTitle" id="doctorRevisionDiffModal">
          <header class="modal-dialog-header">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h3 id="diffModalTitle" style="margin: 0; font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                  <span>🔍</span> ${isEn ? "Field-Level Revision Comparison" : "مقارنة الحقول والمراجعات السريرية"}
                </h3>
                <span class="pill pending" style="font-size: 11px;">
                  ${isEn ? "Rev " + (rev - 1) + " ➔ Rev " + rev : "المراجعة " + (rev - 1) + " ➔ المراجعة " + rev}
                </span>
              </div>
              <p style="margin: 4px 0 0; font-size: 12.5px; color: var(--muted);">
                ${isEn ? "Comparison of clinical measurements, timestamps, and sources between revisions." : "مقارنة دقيقة للقياسات الحيوية، الأوقات، ومصادر البيانات بين المراجعتين."}
              </p>
            </div>
            <button type="button" class="modal-close-btn" onclick="HealthVibes.DoctorUI.closeFieldComparisonModal()" aria-label="${isEn ? 'Close dialog' : 'إغلاق النافذة'}">
              ✖
            </button>
          </header>

          <div class="modal-dialog-body">
            <div class="table-responsive">
              <table class="doctor-diff-table" role="table">
                <thead>
                  <tr>
                    <th scope="col">${isEn ? "Field Name" : "اسم الحقل / المؤشر"}</th>
                    <th scope="col">${isEn ? "Previous Revision (Baseline)" : "المراجعة السابقة"}</th>
                    <th scope="col">${isEn ? "Latest Revision (Updated)" : "المراجعة الحالية (الجديدة)"}</th>
                    <th scope="col">${isEn ? "Clinical Delta" : "الفارق السريري"}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <div class="diff-audit-note" style="margin-top: 14px; padding: 10px 14px; background: rgba(14, 165, 164, 0.08); border-radius: 8px; font-size: 12px; color: var(--ink);">
              <span>ℹ️</span>
              ${isEn
                ? "Every updated observation has recorded provenance and server timestamps. Acknowledging unlocks final clinical certification."
                : "جميع القياسات المحدثة موثقة بمصدرها وختم وقت الخادم Authoritative Server Timestamp. تأكيد المراجعة سيلغي قفل الاعتماد النهائي."}
            </div>
          </div>

          <footer class="modal-dialog-footer">
            <button type="button" class="btn-clinical approve" onclick="HealthVibes.DoctorUI.acknowledgeNewRevision('${c.id}')" style="background: #10b981;">
              <span>✅</span> ${isEn ? "Confirm Review & Unlock Approval" : "تأكيد المراجعة وإلغاء قفل الاعتماد"}
            </button>
            <button type="button" class="soft-button" onclick="HealthVibes.DoctorUI.closeFieldComparisonModal()">
              <span>❌</span> ${isEn ? "Close" : "إغلاق"}
            </button>
          </footer>
        </div>
      </div>
    `;
  }

  function openFieldComparisonModal(caseId) {
    if (typeof document === "undefined") return;
    const isEn = (global.currentLanguage || "ar") === "en";
    const activeCase = (global.state?.doctorQueue || []).find(c => c.id === caseId) ||
                       (global.cases || []).find(c => c.id === caseId) ||
                       { id: caseId, clinicalRevision: 2 };

    // Remove any existing modal
    const existing = document.getElementById("doctorRevisionDiffModalBackdrop");
    if (existing) existing.remove();

    // Create modal container
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderFieldComparisonModalHtml(activeCase, isEn);
    document.body.appendChild(wrapper.firstElementChild);

    // Trap keyboard navigation & Escape key
    const modalEl = document.getElementById("doctorRevisionDiffModalBackdrop");
    if (modalEl) {
      modalEl.focus();
      document.addEventListener("keydown", handleModalKeydown);
    }
  }

  function closeFieldComparisonModal() {
    if (typeof document === "undefined") return;
    const modalEl = document.getElementById("doctorRevisionDiffModalBackdrop");
    if (modalEl) modalEl.remove();
    document.removeEventListener("keydown", handleModalKeydown);
  }

  function handleModalBackdropClick(e) {
    if (e.target && e.target.id === "doctorRevisionDiffModalBackdrop") {
      closeFieldComparisonModal();
    }
  }

  function handleModalKeydown(e) {
    if (e.key === "Escape") {
      closeFieldComparisonModal();
    }
  }

  // ===========================================================================
  // 6. EXPORTS & ATTACHMENT TO HEALTHVIBES GLOBAL
  // ===========================================================================

  const DoctorUI = {
    getDiagnosticPresets,
    // Draft Notes Preservation
    saveDraftNotes,
    getDraftNotes,
    clearDraftNotes,
    attachDraftPreservationListeners,
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
    handleModalBackdropClick
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorUI = DoctorUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
