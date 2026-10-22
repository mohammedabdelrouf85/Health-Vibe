/**
 * Health Vibe AI - UI panels for tasks #641, #646, #651, #656, #661, #666
 *
 *  - PrioritySlotPanel   (Kry)      urgent slot offer for RED triage + emergency redirect
 *  - VisitRatingPanel    (Vezeeta)  post-visit star rating sheet
 *  - LabRequestPanel     (Practo)   patient checklist of requested tests + doctor inbox
 *  - DoctorDirectoryPanel(Vezeeta)  governorate / region / specialty filter
 *  - BookingSummaryPanel (CliniDo)  fee + expected wait before confirmation
 *  - ChatHistoryPanel    (Esaal)    saved assistant conversations with disclaimer
 *
 * All renderers return HTML strings, escape every dynamic value, support Arabic
 * (RTL) and English (LTR), and use >=44px touch targets for mobile.
 */

(function (global) {
  'use strict';

  if (!global.HealthVibes) global.HealthVibes = {};

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function t(isEn, ar, en) { return isEn ? en : ar; }
  function dir(isEn) { return isEn ? 'ltr' : 'rtl'; }
  function lbl(obj, isEn) { return obj ? (isEn ? obj.en : obj.ar) : ''; }

  function fmtTime(iso, isEn) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(isEn ? 'en-GB' : 'ar-EG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return esc(iso); }
  }

  // ── #641 Kry: Priority Slot Allocation ─────────────────────────────────────
  const PrioritySlotPanel = {
    render(result, isEn = false) {
      if (!result) return '';
      if (result.route === 'emergency') {
        return `<section class="kry-priority-slot-card kry-high-risk-active" dir="${dir(isEn)}" role="alert" aria-live="assertive" id="kryEmergencyRedirect">
  <div class="kry-emergency-alert-banner">
    <p class="kry-emergency-alert-text"><strong>${t(isEn, 'أعراضك تحتاج طوارئ فوراً — لا تنتظر موعداً.', 'Your symptoms need emergency care now — do not wait for an appointment.')}</strong></p>
    <a class="kry-ambulance-call-btn" href="tel:${esc(result.emergencyNumber || '123')}" id="kryCallEmergencyBtn" style="min-height:44px">${t(isEn, 'اتصل بالإسعاف 123', 'Call ambulance 123')}</a>
  </div>
</section>`;
      }
      if (!result.offered) {
        if (result.reason === 'NO_PRIORITY_CAPACITY') {
          return `<section class="kry-priority-slot-card" dir="${dir(isEn)}" role="status" id="kryNoCapacity">
  <p>${t(isEn, 'لا توجد مواعيد عاجلة متاحة الآن. تمت إضافتك لقائمة الانتظار العاجلة وسيتواصل معك فريق العيادة.', 'No urgent slots are free right now. You were added to the urgent waiting list and the clinic team will contact you.')}</p>
</section>`;
        }
        return '';
      }
      const o = result.offer;
      const s = result.slot || {};
      return `<section class="kry-priority-slot-card kry-high-risk-active" dir="${dir(isEn)}" aria-labelledby="kryOfferTitle" id="kryPriorityOffer" data-offer-id="${esc(o.id)}">
  <div class="kry-card-header">
    <div class="kry-badge-row">
      <span class="kry-triage-red-pill"><span class="kry-radar-dot" aria-hidden="true"></span>${t(isEn, 'تقييم عالي الخطورة', 'High-risk assessment')}</span>
    </div>
    <h3 id="kryOfferTitle">${t(isEn, 'تم حجز موعد عاجل مؤقتاً لك', 'An urgent slot is being held for you')}</h3>
  </div>
  <div class="kry-slot-offer-banner">
    <div class="kry-offer-top">
      <span class="kry-countdown-chip" data-expires-at="${esc(o.expiresAt)}">${t(isEn, 'محجوز لمدة ١٥ دقيقة', 'Held for 15 minutes')}</span>
    </div>
    <div class="kry-offer-details-grid">
      <div class="kry-offer-detail-box"><span class="kry-offer-detail-label">${t(isEn, 'الطبيب', 'Doctor')}</span><span class="kry-offer-detail-value">${esc(s.doctorName)}</span></div>
      <div class="kry-offer-detail-box"><span class="kry-offer-detail-label">${t(isEn, 'الموعد', 'Time')}</span><span class="kry-offer-detail-value">${esc(fmtTime(s.startsAt, isEn))}</span></div>
    </div>
    <p class="kry-doctor-confirm-note">${t(isEn, 'سيؤكد الطبيب الحجز بعد مراجعة تقييمك. التقييم الذكي لا يغني عن رأي الطبيب.', 'The doctor will confirm after reviewing your assessment. The AI triage does not replace the doctor.')}</p>
    <div class="kry-offer-actions">
      <button type="button" class="kry-btn-accept-offer" id="kryAcceptOfferBtn" data-action="accept" style="min-height:44px">${t(isEn, 'قبول الموعد العاجل', 'Accept urgent slot')}</button>
      <button type="button" class="kry-btn-decline-offer" id="kryDeclineOfferBtn" data-action="decline" style="min-height:44px">${t(isEn, 'ليس الآن', 'Not now')}</button>
    </div>
  </div>
</section>`;
    }
  };

  // ── #646 Vezeeta: Post-visit Rating ────────────────────────────────────────
  const RATING_CRITERIA = [
    { key: 'overall', ar: 'التقييم العام', en: 'Overall' },
    { key: 'doctor', ar: 'الطبيب', en: 'Doctor' },
    { key: 'waitingTime', ar: 'وقت الانتظار', en: 'Waiting time' },
    { key: 'cleanliness', ar: 'النظافة', en: 'Cleanliness' },
    { key: 'staff', ar: 'طاقم العيادة', en: 'Clinic staff' }
  ];

  const VisitRatingPanel = {
    CRITERIA: RATING_CRITERIA,
    render(pending, isEn = false) {
      if (!pending || !pending.appointmentId) return '';
      const rows = RATING_CRITERIA.map(c => {
        const stars = [1, 2, 3, 4, 5].map(n =>
          `<label class="hv-star"><input type="radio" name="rate_${c.key}" value="${n}" ${c.key === 'overall' ? 'required' : ''}><span aria-hidden="true">★</span><span class="hv-sr-only">${n}</span></label>`
        ).join('');
        return `<fieldset class="hv-rating-row"><legend>${t(isEn, c.ar, c.en)}${c.key === 'overall' ? ' *' : ''}</legend><div class="hv-stars" role="radiogroup">${stars}</div></fieldset>`;
      }).join('');
      return `<form class="hv-panel hv-visit-rating" dir="${dir(isEn)}" id="visitRatingForm" data-appointment-id="${esc(pending.appointmentId)}" aria-labelledby="visitRatingTitle">
  <h3 id="visitRatingTitle">${t(isEn, 'كيف كانت زيارتك؟', 'How was your visit?')}</h3>
  <p class="hv-muted">${t(isEn, 'تقييمك مجهول الهوية ويساعد العيادات على تحسين الخدمة.', 'Your rating is anonymous and helps clinics improve.')}</p>
  ${rows}
  <label class="hv-field"><span>${t(isEn, 'تعليق (اختياري)', 'Comment (optional)')}</span>
    <textarea name="comment" maxlength="600" rows="3" id="visitRatingComment" placeholder="${t(isEn, 'لا تكتب رقم تليفون أو بيانات شخصية', 'Please do not include phone numbers or personal data')}"></textarea></label>
  <label class="hv-check"><input type="checkbox" name="wouldRecommend" id="visitRatingRecommend"> ${t(isEn, 'أنصح بهذا الطبيب', 'I would recommend this doctor')}</label>
  <p class="hv-muted hv-small">${t(isEn, 'إذا حدثت لك مشكلة صحية بسبب العلاج، اذكرها وسيتم تحويلها لفريق المراجعة الطبية.', 'If you experienced a health problem from the treatment, mention it and it will be sent to the clinical review team.')}</p>
  <button type="submit" class="hv-btn hv-btn-primary" id="visitRatingSubmitBtn">${t(isEn, 'إرسال التقييم', 'Submit rating')}</button>
</form>`;
    },
    collect(formEl) {
      const scores = {};
      RATING_CRITERIA.forEach(c => {
        const checked = formEl.querySelector(`input[name="rate_${c.key}"]:checked`);
        if (checked) scores[c.key] = parseInt(checked.value, 10);
      });
      return {
        scores,
        comment: (formEl.querySelector('[name="comment"]') || {}).value || '',
        wouldRecommend: !!(formEl.querySelector('[name="wouldRecommend"]') || {}).checked
      };
    },
    renderSummary(summary, isEn = false) {
      if (!summary) return '';
      if (summary.hidden) {
        return `<p class="hv-muted" dir="${dir(isEn)}">${t(isEn, 'لا توجد تقييمات كافية بعد.', 'Not enough ratings yet.')}</p>`;
      }
      return `<div class="hv-rating-summary" dir="${dir(isEn)}"><strong>★ ${esc(summary.averages.overall)}</strong> · ${esc(summary.count)} ${t(isEn, 'تقييم', 'ratings')} · ${esc(summary.recommendPct)}% ${t(isEn, 'ينصحون به', 'recommend')}</div>`;
    }
  };

  // ── #651 Practo: Requested Lab Results ─────────────────────────────────────
  const ITEM_LABELS = {
    awaiting_upload: { ar: 'مطلوب الرفع', en: 'Upload needed', cls: 'hv-chip-warn' },
    uploaded: { ar: 'تم الرفع — بانتظار الطبيب', en: 'Uploaded — awaiting doctor', cls: 'hv-chip-info' },
    reviewed: { ar: 'راجعه الطبيب', en: 'Reviewed by doctor', cls: 'hv-chip-ok' }
  };

  const LabRequestPanel = {
    renderPatientChecklist(requests, labTests, isEn = false) {
      if (!requests || requests.length === 0) return '';
      return requests.map(r => `<section class="hv-panel hv-lab-request" dir="${dir(isEn)}" data-request-id="${esc(r.id)}" aria-label="${t(isEn, 'فحوصات طلبها الطبيب', 'Tests requested by your doctor')}">
  <h3>${t(isEn, 'فحوصات طلبها', 'Tests requested by')} ${esc(r.doctorName)}</h3>
  <ul class="hv-list">${r.items.map(i => {
        const st = ITEM_LABELS[i.status] || ITEM_LABELS.awaiting_upload;
        return `<li class="hv-list-row"><span>${esc(lbl(labTests[i.code], isEn))}</span>
      <span class="hv-chip ${st.cls}">${t(isEn, st.ar, st.en)}</span>
      ${i.status === 'awaiting_upload' ? `<button type="button" class="hv-btn hv-btn-sm" data-action="upload" data-test="${esc(i.code)}" id="labUpload_${esc(r.id)}_${esc(i.code)}">${t(isEn, 'رفع النتيجة', 'Upload result')}</button>` : ''}</li>`;
      }).join('')}</ul>
  <p class="hv-muted hv-small">${t(isEn, 'سيصل تنبيه لطبيبك فور الرفع. النتيجة يفسرها الطبيب فقط.', 'Your doctor is notified as soon as you upload. Only your doctor interprets the result.')}</p>
</section>`).join('');
    },
    renderDoctorInbox(notifications, isEn = false) {
      const unread = (notifications || []).filter(n => !n.read);
      return `<section class="hv-panel hv-lab-inbox" dir="${dir(isEn)}" id="doctorLabInbox" aria-live="polite">
  <h3>${t(isEn, 'نتائج فحوصات جديدة', 'New requested results')} <span class="hv-badge">${unread.length}</span></h3>
  ${unread.length === 0 ? `<p class="hv-muted">${t(isEn, 'لا توجد نتائج جديدة.', 'No new results.')}</p>` :
    `<ul class="hv-list">${unread.map(n => `<li class="hv-list-row ${n.kind === 'review_overdue' ? 'hv-row-alert' : ''}">
      <span>${esc(isEn ? n.titleEn : n.titleAr)} — ${esc(isEn ? n.bodyEn : n.bodyAr)}</span>
      <a class="hv-btn hv-btn-sm" href="${esc(n.deepLink)}">${t(isEn, 'مراجعة', 'Review')}</a></li>`).join('')}</ul>`}
</section>`;
    }
  };

  // ── #656 Vezeeta: Doctor Directory filter ──────────────────────────────────
  const DoctorDirectoryPanel = {
    renderFilters(catalog, selected = {}, isEn = false) {
      if (!catalog) return '';
      const regionChips = [{ key: '', ar: 'كل مصر', en: 'All Egypt' }].concat(catalog.regions).map(r =>
        `<button type="button" class="hv-chip-btn ${(selected.region || '') === r.key ? 'is-active' : ''}" data-region="${esc(r.key)}" aria-pressed="${(selected.region || '') === r.key}" id="dirRegion_${esc(r.key || 'all')}">${esc(isEn ? r.en : r.ar)}</button>`
      ).join('');
      const region = catalog.regions.find(r => r.key === selected.region);
      const govOptions = region && region.governorates.length > 1
        ? `<label class="hv-field"><span>${t(isEn, 'المحافظة', 'Governorate')}</span><select id="dirGovernorateSelect" name="governorate">
            <option value="">${t(isEn, 'كل المحافظات', 'All governorates')}</option>
            ${region.governorates.map(g => `<option value="${esc(g.key)}" ${selected.governorate === g.key ? 'selected' : ''}>${esc(isEn ? g.en : g.ar)}</option>`).join('')}
          </select></label>` : '';
      const specOptions = catalog.specialties.map(s =>
        `<option value="${esc(s.key)}" ${selected.specialty === s.key ? 'selected' : ''}>${esc(isEn ? s.en : s.ar)}</option>`).join('');
      return `<form class="hv-panel hv-dir-filters" dir="${dir(isEn)}" id="doctorDirectoryFilters" role="search">
  <div class="hv-chip-row" role="group" aria-label="${t(isEn, 'المنطقة', 'Region')}">${regionChips}</div>
  ${govOptions}
  <label class="hv-field"><span>${t(isEn, 'التخصص', 'Specialty')}</span><select id="dirSpecialtySelect" name="specialty">
    <option value="">${t(isEn, 'صدر وباطنة', 'Chest & Internal Medicine')}</option>${specOptions}</select></label>
  <label class="hv-field"><span>${t(isEn, 'بحث بالاسم أو المنطقة', 'Search by name or area')}</span>
    <input type="search" id="dirSearchInput" name="q" value="${esc(selected.q || '')}" maxlength="60"></label>
</form>`;
    },
    renderResults(data, isEn = false) {
      if (!data) return '';
      if (data.count === 0) {
        return `<p class="hv-muted" dir="${dir(isEn)}" role="status" id="dirNoResults">${t(isEn, 'لا يوجد أطباء متاحون بهذه الفلاتر حالياً. جرّب منطقة قريبة أو كشف أونلاين.', 'No doctors match these filters yet. Try a nearby region or a video consultation.')}</p>`;
      }
      return `<ul class="hv-dir-results" dir="${dir(isEn)}" aria-label="${esc(data.count)} ${t(isEn, 'طبيب', 'doctors')}">${data.results.map(d => `<li class="hv-panel hv-doc-card" data-doctor-id="${esc(d.id)}">
    <div class="hv-doc-head"><strong>${esc(isEn ? d.nameEn : d.nameAr)}</strong>
      ${d.sponsored ? `<span class="hv-chip">${t(isEn, 'إعلان', 'Sponsored')}</span>` : ''}
      <span class="hv-chip hv-chip-ok">${t(isEn, 'ترخيص موثّق', 'Verified license')}</span></div>
    <div class="hv-muted">${esc(lbl(d.specialtyLabel, isEn))} · ${esc(lbl(d.governorateLabel, isEn))}${d.area ? ' – ' + esc(d.area) : ''}</div>
    <div class="hv-muted hv-small">${esc(d.clinicName)}${d.nextAvailable ? ' · ' + t(isEn, 'أقرب موعد', 'Next') + ': ' + esc(fmtTime(d.nextAvailable, isEn)) : ''}</div>
    <button type="button" class="hv-btn hv-btn-primary" data-action="book" id="dirBook_${esc(d.id)}">${t(isEn, 'احجز', 'Book')}</button>
  </li>`).join('')}</ul>`;
    }
  };

  // ── #661 CliniDo: Fee & Expected Wait summary ──────────────────────────────
  const MODE_LABELS = { clinic: { ar: 'كشف في العيادة', en: 'In-clinic visit' }, video: { ar: 'استشارة فيديو', en: 'Video consultation' }, followup: { ar: 'متابعة نتائج', en: 'Results follow-up' } };

  const BookingSummaryPanel = {
    formatWait(wait, isEn = false) {
      if (!wait || wait.source === 'unknown' || wait.minMinutes === null) return t(isEn, 'غير متاح حالياً', 'Not available yet');
      return t(isEn, `من ${wait.minMinutes} إلى ${wait.maxMinutes} دقيقة تقريباً`, `About ${wait.minMinutes}–${wait.maxMinutes} min`);
    },
    formatFee(fee, isEn = false) {
      return isEn ? `${Number(fee).toLocaleString('en-US')} EGP` : `${Number(fee).toLocaleString('ar-EG')} جنيه`;
    },
    render(quote, isEn = false) {
      if (!quote) return '';
      const sourceNote = {
        recent_visits: t(isEn, 'محسوب من آخر الزيارات الفعلية', 'Based on recent actual visits'),
        doctor_declared: t(isEn, 'تقدير الطبيب', 'Doctor\'s estimate'),
        virtual_queue: t(isEn, 'غرفة انتظار افتراضية', 'Virtual waiting room'),
        unknown: ''
      }[quote.wait?.source] || '';
      return `<section class="hv-panel hv-booking-summary" dir="${dir(isEn)}" id="bookingSummary" data-quote-id="${esc(quote.id)}" aria-labelledby="bookingSummaryTitle">
  <h3 id="bookingSummaryTitle">${t(isEn, 'راجع تفاصيل الحجز قبل التأكيد', 'Review before you confirm')}</h3>
  ${quote.urgentNotice ? `<p class="hv-row-alert" role="alert">${t(isEn, 'تقييمك عالي الخطورة: لا تنتظر موعداً عادياً — اختر موعداً عاجلاً أو اتصل بـ 123.', 'Your assessment is high-risk: do not wait for a routine slot — choose an urgent slot or call 123.')}</p>` : ''}
  <dl class="hv-summary-grid">
    <div><dt>${t(isEn, 'نوع الكشف', 'Consultation')}</dt><dd>${esc(lbl(MODE_LABELS[quote.mode], isEn))}</dd></div>
    <div><dt>${t(isEn, 'سعر الكشف', 'Fee')}</dt><dd class="hv-fee" id="bookingFeeValue">${esc(this.formatFee(quote.feeEgp, isEn))}</dd></div>
    <div><dt>${t(isEn, 'مدة الانتظار المتوقعة', 'Expected wait')}</dt><dd id="bookingWaitValue">${esc(this.formatWait(quote.wait, isEn))}</dd></div>
    ${quote.slotStartsAt ? `<div><dt>${t(isEn, 'الموعد', 'Time')}</dt><dd>${esc(fmtTime(quote.slotStartsAt, isEn))}</dd></div>` : ''}
  </dl>
  <p class="hv-muted hv-small">${esc(sourceNote)}${sourceNote ? ' · ' : ''}${t(isEn, 'مدة الانتظار تقديرية. السعر ثابت لمدة ١٥ دقيقة.', 'Wait time is an estimate. Price is locked for 15 minutes.')}</p>
  <div class="hv-actions">
    <button type="button" class="hv-btn hv-btn-primary" data-action="confirm" id="bookingConfirmBtn">${t(isEn, 'تأكيد الحجز', 'Confirm booking')}</button>
    <button type="button" class="hv-btn" data-action="back" id="bookingBackBtn">${t(isEn, 'رجوع', 'Back')}</button>
  </div>
</section>`;
    }
  };

  // ── #666 Esaal: Saved chat history ─────────────────────────────────────────
  const ChatHistoryPanel = {
    renderList(data, isEn = false) {
      if (!data) return '';
      const items = data.conversations || [];
      return `<section class="hv-panel hv-chat-history" dir="${dir(isEn)}" id="chatHistoryList" aria-labelledby="chatHistoryTitle">
  <h3 id="chatHistoryTitle">${t(isEn, 'محادثاتي مع المساعد', 'My assistant conversations')}</h3>
  <p class="hv-disclaimer" role="note">${esc(lbl(data.disclaimer, isEn))}</p>
  <input type="search" id="chatHistorySearch" class="hv-input" placeholder="${t(isEn, 'ابحث في محادثاتك', 'Search your conversations')}" aria-label="${t(isEn, 'بحث', 'Search')}">
  ${items.length === 0 ? `<p class="hv-muted">${t(isEn, 'لا توجد محادثات محفوظة.', 'No saved conversations.')}</p>` :
    `<ul class="hv-list">${items.map(c => `<li class="hv-list-row">
      <button type="button" class="hv-link-btn" data-action="open" data-conversation-id="${esc(c.id)}" id="chatOpen_${esc(c.id)}">
        ${c.hasEmergencyFlag ? '<span class="hv-chip hv-chip-warn">!</span> ' : ''}${esc(c.title)}</button>
      <span class="hv-muted hv-small">${esc(fmtTime(c.updatedAt, isEn))}</span></li>`).join('')}</ul>`}
  <button type="button" class="hv-btn hv-btn-sm" data-action="export" id="chatHistoryExportBtn">${t(isEn, 'تصدير محادثاتي', 'Export my history')}</button>
</section>`;
    },
    renderConversation(convo, isEn = false) {
      if (!convo) return '';
      return `<section class="hv-panel hv-chat-thread" dir="${dir(isEn)}" id="chatHistoryThread" data-conversation-id="${esc(convo.id)}">
  ${convo.emergencyBanner ? `<p class="hv-row-alert" role="alert">${esc(lbl(convo.emergencyBanner, isEn))}</p>` : ''}
  <ol class="hv-thread">${convo.messages.map(m => `<li class="hv-msg hv-msg-${esc(m.role)}">
    <div class="hv-msg-text">${esc(m.text)}</div>
    ${m.role === 'assistant' ? `<div class="hv-disclaimer hv-small" role="note">${esc(lbl(m.disclaimer, isEn))}</div>` : ''}
  </li>`).join('')}</ol>
  <div class="hv-actions">
    <button type="button" class="hv-btn" data-action="share" id="chatShareBtn">${t(isEn, 'مشاركة مع طبيبي', 'Share with my doctor')}</button>
    <button type="button" class="hv-btn hv-btn-danger" data-action="delete" id="chatDeleteBtn">${t(isEn, 'حذف المحادثة', 'Delete conversation')}</button>
  </div>
</section>`;
    }
  };

  const FeaturePanels641to670 = {
    escapeHtml: esc,
    PrioritySlotPanel,
    VisitRatingPanel,
    LabRequestPanel,
    DoctorDirectoryPanel,
    BookingSummaryPanel,
    ChatHistoryPanel
  };

  global.HealthVibes.FeaturePanels641to670 = FeaturePanels641to670;
  if (typeof module !== 'undefined' && module.exports) module.exports = FeaturePanels641to670;
})(typeof window !== 'undefined' ? window : global);
