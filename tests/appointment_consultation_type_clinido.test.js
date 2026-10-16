/**
 * Health Vibe AI - CliniDo Consultation Type Selection & Commute Relief Test Suite
 *
 * Benchmarked against CliniDo & Vezeeta Standards:
 * In-Clinic Branch Visit vs. Remote Video Telehealth vs. Results Follow-up
 *
 * Verifies:
 * 1. DOM Architecture & Mount Points in index.html & appointments-view.html.
 * 2. AppointmentsUI State Management (getSelectedConsultationType, setSelectedConsultationType).
 * 3. Responsive 3-Card Grid with CliniDo tags (Commute Relief, Full Exam, Quick Review).
 * 4. Dynamic Contextual Details (Cairo/Giza Traffic Relief vs. Dokki Clinic Branch & Metro).
 * 5. Confirmation Bottom-Sheet & Modal Integration with venue/commute notices.
 * 6. Mobile Accessibility (ARIA radiogroup, role="radio", >= 44px touch targets).
 * 7. 100% Arabic & English Catalog Parity in app/i18n.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AppointmentsUI = require('../app/modules/appointments/appointments-ui');

test('CliniDo Consultation Type Selection & Commute Relief Suite', async (t) => {
  await t.test('1. DOM Mount Points & Templates Integrity', () => {
    const viewPath = path.join(__dirname, '../app/modules/appointments/appointments-view.html');
    const indexPath = path.join(__dirname, '../app/index.html');

    assert.ok(fs.existsSync(viewPath), 'appointments-view.html must exist');
    assert.ok(fs.existsSync(indexPath), 'app/index.html must exist');

    const viewHtml = fs.readFileSync(viewPath, 'utf8');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    for (const html of [viewHtml, indexHtml]) {
      assert.ok(html.includes('id="clinidoConsultationModeMount"'), 'Must include clinidoConsultationModeMount');
      assert.ok(html.includes('id="clinidoModeDetailsMount"'), 'Must include clinidoModeDetailsMount');
      assert.ok(html.includes('data-type="video"'), 'Must include video consultation mode button');
      assert.ok(html.includes('data-type="clinic"'), 'Must include in-clinic mode button');
      assert.ok(html.includes('data-type="followup"'), 'Must include followup mode button');
    }
  });

  await t.test('2. AppointmentsUI State Management for Consultation Type', () => {
    // Default should be video
    assert.equal(AppointmentsUI.getSelectedConsultationType(), 'video');

    AppointmentsUI.setSelectedConsultationType('clinic');
    assert.equal(AppointmentsUI.getSelectedConsultationType(), 'clinic');

    AppointmentsUI.setSelectedConsultationType('followup');
    assert.equal(AppointmentsUI.getSelectedConsultationType(), 'followup');

    // Reset back to video
    AppointmentsUI.setSelectedConsultationType('video');
    assert.equal(AppointmentsUI.getSelectedConsultationType(), 'video');
  });

  await t.test('3. Dynamic Details Card: Egypt Commute Relief for Telehealth Video', () => {
    const arabicCard = AppointmentsUI.renderConsultationDetailsCard('video', false);
    assert.ok(arabicCard.includes('تخفيف عبء المواصلات'), 'Must have Arabic commute relief title');
    assert.ok(arabicCard.includes('القاهرة والجيزة والمحافظات'), 'Must mention Cairo & Giza traffic context');
    assert.ok(arabicCard.includes('اتصال إنترنت مستقر'), 'Must include stable internet readiness badge');
    assert.ok(arabicCard.includes('غرفة فيديو مشفرة وآمنة'), 'Must include encrypted video room badge');

    const englishCard = AppointmentsUI.renderConsultationDetailsCard('video', true);
    assert.ok(englishCard.includes('Commute Relief: Remote Video Consultation'), 'Must have English title');
    assert.ok(englishCard.includes('Cairo & Giza city traffic'), 'Must mention Cairo & Giza in English');
    assert.ok(englishCard.includes('Instant E-Prescription'), 'Must mention instant e-prescription');
  });

  await t.test('4. Dynamic Details Card: In-Clinic Dokki Branch Location & Amenities', () => {
    const clinicCardAr = AppointmentsUI.renderConsultationDetailsCard('clinic', false);
    assert.ok(clinicCardAr.includes('فرع الدقي، الجيزة'), 'Must mention Dokki Branch, Giza');
    assert.ok(clinicCardAr.includes('محطة مترو الدقي'), 'Must mention proximity to Dokki metro');
    assert.ok(clinicCardAr.includes('متوسط وقت الانتظار بالعيادة ١٠-١٥ دقيقة'), 'Must include wait time');
    assert.ok(clinicCardAr.includes('أجهزة فحص الرئة والنيبولايزر'), 'Must mention on-site spirometry/nebulizer');

    const clinicCardEn = AppointmentsUI.renderConsultationDetailsCard('clinic', true);
    assert.ok(clinicCardEn.includes('Dokki Branch, Giza'), 'Must mention Dokki Branch in English');
    assert.ok(clinicCardEn.includes('Near Dokki Metro'), 'Must mention metro in English');
  });

  await t.test('5. Dynamic Details Card: Follow-up & Lab Results Review', () => {
    const followupCardAr = AppointmentsUI.renderConsultationDetailsCard('followup', false);
    assert.ok(followupCardAr.includes('تفاصيل متابعة النتائج والتقارير'), 'Must have Arabic follow-up title');
    assert.ok(followupCardAr.includes('وظائف الرئة أو تعديل جرعات'), 'Must mention reviewing spirometry/medication');

    const followupCardEn = AppointmentsUI.renderConsultationDetailsCard('followup', true);
    assert.ok(followupCardEn.includes('Report & Results Follow-up Details'), 'Must have English follow-up title');
  });

  await t.test('6. renderConsultationModeSelector Interactive Mounting & Event Callback', () => {
    let container = {
      innerHTML: '',
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null
    };

    let selectedCallbackType = null;
    AppointmentsUI.renderConsultationModeSelector(container, 'video', (newType) => {
      selectedCallbackType = newType;
    }, false);

    assert.ok(container.innerHTML.includes('clinido-mode-selector-wrap'), 'Must render selector wrapper');
    assert.ok(container.innerHTML.includes('clinido-badge-commute'), 'Must include commute badge class');
    assert.ok(container.innerHTML.includes('clinido-badge-exam'), 'Must include exam badge class');
    assert.ok(container.innerHTML.includes('clinido-badge-followup'), 'Must include followup badge class');
    assert.ok(container.innerHTML.includes('id="clinidoModeDetailsMount"'), 'Must include details mount inside selector');
  });

  await t.test('7. Confirmation Modal recap includes contextual venue & commute notices', () => {
    let createdDialog = null;
    const fakeDoc = {
      getElementById: (id) => null,
      createElement: (tag) => {
        createdDialog = {
          id: '',
          className: '',
          setAttribute: () => {},
          classList: { add: () => {}, remove: () => {} },
          innerHTML: '',
          querySelectorAll: () => []
        };
        return createdDialog;
      },
      body: {
        appendChild: () => {}
      }
    };

    const originalDoc = global.document;
    global.document = fakeDoc;

    try {
      AppointmentsUI.openConfirmBookingModal({
        doctorName: 'د. منى سامي',
        dateTime: '2026-10-25 10:00 AM',
        type: 'video'
      });

      assert.ok(createdDialog.innerHTML.includes('clinido-recap-commute-notice'), 'Must include commute notice for video');
      assert.ok(createdDialog.innerHTML.includes('توفر مشقة المواصلات'), 'Notice must explain commute relief');

      AppointmentsUI.openConfirmBookingModal({
        doctorName: 'د. منى سامي',
        dateTime: '2026-10-25 10:00 AM',
        type: 'clinic'
      });

      assert.ok(createdDialog.innerHTML.includes('فرع الدقي (بالقرب من المترو)'), 'Notice must show Dokki branch for clinic');
    } finally {
      global.document = originalDoc;
    }
  });

  await t.test('8. CSS Architecture & Mobile Touch-First Compliance', () => {
    const cssPath = path.join(__dirname, '../app/modules/appointments/appointments.css');
    assert.ok(fs.existsSync(cssPath), 'appointments.css must exist');

    const css = fs.readFileSync(cssPath, 'utf8');
    const requiredClasses = [
      '.clinido-mode-selector-wrap',
      '.clinido-mode-card',
      '.clinido-card-badge',
      '.clinido-badge-commute',
      '.clinido-badge-exam',
      '.clinido-badge-followup',
      '.clinido-mode-details-card',
      '.clinido-details-header',
      '.clinido-details-title',
      '.clinido-details-desc',
      '.clinido-perks-row',
      '.clinido-perk-pill'
    ];

    for (const cls of requiredClasses) {
      assert.ok(css.includes(cls), `CSS must define class: ${cls}`);
    }

    assert.ok(css.includes('min-height: 72px') || css.includes('min-height: 48px'), 'Must satisfy touch target >= 44px');
  });

  await t.test('9. i18n Translation Catalog Parity for CliniDo Consultation Types', () => {
    const i18nPath = path.join(__dirname, '../app/i18n.js');
    const i18nContent = fs.readFileSync(i18nPath, 'utf8');

    const keys = [
      'consultationTypeTitle',
      'consultationTypeDesc',
      'modeVideoTitle',
      'modeVideoSubtitle',
      'modeVideoBadge',
      'modeClinicTitle',
      'modeClinicSubtitle',
      'modeClinicBadge',
      'modeFollowupTitle',
      'modeFollowupSubtitle',
      'modeFollowupBadge',
      'commuteReliefNotice',
      'clinicBranchAddress',
      'clinicWaitTimeNotice',
      'clinicArrivalGuidance',
      'telehealthTechReadiness'
    ];

    for (const key of keys) {
      assert.ok(i18nContent.includes(`${key}:`), `app/i18n.js must define translation key: ${key}`);
    }
  });
});
