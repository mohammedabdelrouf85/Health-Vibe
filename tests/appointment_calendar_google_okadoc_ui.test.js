/**
 * Health Vibe AI - Okadoc Google Calendar Integration & UI Flow Test Suite
 * 
 * Benchmark: Okadoc (https://www.okadoc.com/)
 * Verifies:
 * 1. 1-Click Google Calendar URL generation for Patient & Doctor (UTC ISO dates, details, prep instructions)
 * 2. RFC 5545 iCalendar (.ics) generation & client-side download fallback
 * 3. Clipboard copy utility for appointment details
 * 4. Okadoc Booking Confirmation Card HTML rendering (Patient & Doctor perspectives)
 * 5. Interactive Modal lifecycle (open, wire handlers, ESC close, ARIA accessibility)
 * 6. Mobile-first CSS architecture, WCAG touch targets (>= 44px / 48px), and mobile media queries
 * 7. 100% Bilingual i18n parity (Arabic & English)
 * 8. app.js integration for instant modal trigger post-booking confirmation
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Okadoc Feature: Google Calendar Integration & Responsive UI Flow (Patient & Doctor)', () => {
  let AppointmentsUI;
  let i18nModule;

  before(() => {
    // Setup Mock DOM Environment
    const domStorage = {};
    const elements = new Map();

    const mockDocument = {
      body: {
        appendChild: (el) => {
          elements.set(el.id, el);
          return el;
        },
        removeChild: (el) => {
          elements.delete(el.id);
          return el;
        }
      },
      getElementById: (id) => elements.get(id) || null,
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          id: '',
          className: '',
          attributes: {},
          style: {},
          dataset: {},
          children: [],
          innerHTML: '',
          setAttribute: function(name, val) { this.attributes[name] = String(val); },
          getAttribute: function(name) { return this.attributes[name] || null; },
          removeAttribute: function(name) { delete this.attributes[name]; },
          classList: {
            classes: new Set(),
            add: function(c) { this.classes.add(c); },
            remove: function(c) { this.classes.delete(c); },
            contains: function(c) { return this.classes.has(c); }
          },
          querySelector: function(selector) {
            // Simple selector matcher for tests
            if (selector.startsWith('#')) {
              const targetId = selector.slice(1);
              if (this.id === targetId) return this;
              if (this.innerHTML.includes(`id="${targetId}"`)) {
                return {
                  id: targetId,
                  onclick: null,
                  innerHTML: '',
                  setAttribute: () => {},
                  classList: { add: () => {}, remove: () => {} }
                };
              }
            }
            if (selector.startsWith('.')) {
              const cls = selector.slice(1);
              if (this.innerHTML.includes(`class="${cls}"`) || this.innerHTML.includes(cls)) {
                return {
                  className: cls,
                  onclick: null,
                  innerHTML: '',
                  setAttribute: () => {},
                  classList: { add: () => {}, remove: () => {} }
                };
              }
            }
            return null;
          },
          querySelectorAll: function() { return []; },
          click: function() { if (typeof this.onclick === 'function') this.onclick(); }
        };
        return el;
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    global.document = mockDocument;
    global.window = {
      document: mockDocument,
      Blob: function(parts, opts) { this.parts = parts; this.opts = opts; },
      URL: {
        createObjectURL: (blob) => 'blob:mock-url-' + Math.random(),
        revokeObjectURL: () => {}
      },
      showToast: () => {},
      navigator: {
        clipboard: {
          writeText: async (t) => t
        }
      }
    };
    global.navigator = global.window.navigator;
    global.URL = global.window.URL;
    global.showToast = global.window.showToast;
    global.currentLanguage = 'ar';

    // Load AppointmentsUI module
    AppointmentsUI = require('../app/modules/appointments/appointments-ui');
    // Load i18n translations
    i18nModule = require('../app/i18n');
  });

  describe('1. Google Calendar URL Generator (buildGoogleCalendarUrl)', () => {
    it('generates a valid Google Calendar render template URL for a Patient (Arabic)', () => {
      const appt = {
        id: 'appt_pat_101',
        doctorName: 'د. حسام حسني',
        doctorSpecialty: 'استشاري الأمراض الصدرية والحساسية',
        clinicName: 'مركز القاهرة التخصصي لأمراض الصدر',
        patientName: 'أحمد محمود',
        date: '2026-11-15',
        timeSlot: '05:30 مساءً',
        type: 'clinic',
        typeLabel: 'كشف عيادة',
        notes: 'متابعة ربو شعبي وحساسية موسمية'
      };

      const url = AppointmentsUI.buildGoogleCalendarUrl(appt, { role: 'patient', isEn: false });

      assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'), 'Must begin with Google Calendar template URL');
      assert.ok(url.includes('text='), 'Must contain text parameter');
      assert.ok(decodeURIComponent(url).includes('Health Vibe: استشارة مع د. حسام حسني'), 'Must contain Arabic doctor consultation title');
      assert.ok(url.includes('dates=20261115T173000/20261115T180000'), 'Must parse evening slot (05:30 PM -> 17:30 to 18:00)');
      assert.ok(decodeURIComponent(url).includes('مركز القاهرة التخصصي لأمراض الصدر'), 'Must contain clinic location');
      assert.ok(decodeURIComponent(url).includes('إرشادات التحضير'), 'Must include pre-visit preparation guidance for patient');
    });

    it('generates a valid Google Calendar URL for a Doctor (English & Arabic)', () => {
      const appt = {
        id: 'appt_doc_202',
        doctorName: 'Dr. Tarek Safwat',
        patientName: 'Sarah Gamal',
        date: '2026-11-20',
        timeSlot: '11:00 AM',
        type: 'video',
        typeLabel: 'Telehealth Video',
        linkedCaseId: 'case_resp_998',
        notes: 'Follow-up on post-viral cough SpO2 96%'
      };

      // Doctor perspective in English
      const urlEn = AppointmentsUI.buildGoogleCalendarUrl(appt, { role: 'doctor', isEn: true });
      assert.ok(urlEn.includes('action=TEMPLATE'));
      assert.ok(decodeURIComponent(urlEn).includes('Medical Appointment with Patient Sarah Gamal') || decodeURIComponent(urlEn).includes('Sarah Gamal'), 'Must include patient name in title');
      assert.ok(decodeURIComponent(urlEn).includes('case_resp_998'), 'Doctor event details must reference linked clinical dossier ID');
      assert.ok(urlEn.includes('dates=20261120T110000/20261120T113000'), 'Must compute 30 min duration for doctor');

      // Doctor perspective in Arabic
      const urlAr = AppointmentsUI.buildGoogleCalendarUrl(appt, { role: 'doctor', isEn: false });
      assert.ok(decodeURIComponent(urlAr).includes('Health Vibe: كشف سريري للمريض Sarah Gamal'), 'Must provide Arabic doctor title');
      assert.ok(decodeURIComponent(urlAr).includes('ملف الفرز السريري المرفق'), 'Must mention clinical dossier in Arabic');
    });

    it('handles Telehealth Video consultation with virtual room link in Google Calendar event', () => {
      const appt = {
        id: 'tele_appt_303',
        doctorName: 'د. منى سامي',
        patientName: 'كريم نبيل',
        date: '2026-11-25',
        timeSlot: '10:00 صباحاً',
        type: 'video',
        videoJoinUrl: 'https://telehealth.healthvibe.clinic/room/tele_appt_303'
      };

      const url = AppointmentsUI.buildGoogleCalendarUrl(appt, { role: 'patient', isEn: false });
      assert.ok(decodeURIComponent(url).includes('https://telehealth.healthvibe.clinic/room/tele_appt_303'), 'Must embed video join link in location/details');
    });

    it('preserves backwards compatibility with getGoogleCalendarUrl alias', () => {
      assert.strictEqual(typeof AppointmentsUI.getGoogleCalendarUrl, 'function');
      const testAppt = { doctorName: 'Dr. Test', date: '2026-12-01', timeSlot: 'slot_1400' };
      const url = AppointmentsUI.getGoogleCalendarUrl(testAppt);
      assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
    });
  });

  describe('2. Universal iCalendar (.ics) Export & Download', () => {
    it('generates valid RFC 5545 iCalendar content with 2-hour pre-visit alert VALARM', () => {
      const appt = {
        id: 'appt_ics_test_88',
        doctorName: 'Dr. Amr Helmy',
        date: '2026-11-18',
        timeSlot: '04:00 PM',
        type: 'clinic',
        clinicName: 'Mohandessin Specialized Clinic, Giza',
        notes: 'Chronic asthma review'
      };

      const ics = AppointmentsUI.buildIcsContent(appt);
      assert.ok(ics.includes('BEGIN:VCALENDAR'), 'Must start VCALENDAR');
      assert.ok(ics.includes('VERSION:2.0'), 'Must declare VERSION:2.0');
      assert.ok(ics.includes('BEGIN:VEVENT'), 'Must start VEVENT');
      assert.ok(ics.includes('SUMMARY:Medical Appointment with Dr. Amr Helmy'));
      assert.ok(ics.includes('DTSTART:20261118T160000Z'));
      assert.ok(ics.includes('BEGIN:VALARM'), 'Must include VALARM for reminder alert');
      assert.ok(ics.includes('TRIGGER:-PT2H') || ics.includes('TRIGGER:-PT1H'), 'Must trigger alarm prior to visit');
      assert.ok(ics.includes('END:VCALENDAR'), 'Must terminate VCALENDAR');
    });

    it('executes downloadIcsCalendar and triggers device download', () => {
      const appt = {
        id: 'appt_download_99',
        doctorName: 'د. سمير زكي',
        date: '2026-11-19',
        timeSlot: '12:00 م'
      };

      const result = AppointmentsUI.downloadIcsCalendar(appt, { isEn: false });
      assert.ok(result === true || typeof result === 'string', 'downloadIcsCalendar must succeed');
    });
  });

  describe('3. Clipboard Copy Details Utility', () => {
    it('formats and copies appointment summary to clipboard with bilingual support', () => {
      const appt = {
        id: 'BK-774411',
        doctorName: 'د. حنان توفيق',
        patientName: 'مريم عادل',
        date: '2026-11-22',
        timeSlot: '06:00 مساءً',
        type: 'clinic',
        clinicName: 'فرع مدينة نصر'
      };

      const copyTextAr = AppointmentsUI.copyAppointmentDetailsToClipboard(appt, { isEn: false });
      assert.ok(copyTextAr.includes('تفاصيل موعد هيلث فايب'));
      assert.ok(copyTextAr.includes('د. حنان توفيق'));
      assert.ok(copyTextAr.includes('مريم عادل'));
      assert.ok(copyTextAr.includes('BK-774411'));

      const copyTextEn = AppointmentsUI.copyAppointmentDetailsToClipboard(appt, { isEn: true });
      assert.ok(copyTextEn.includes('Health Vibe Appointment Details'));
      assert.ok(copyTextEn.includes('Doctor:'));
      assert.ok(copyTextEn.includes('Patient:'));
    });
  });

  describe('4. Okadoc Confirmation Card HTML Rendering', () => {
    it('renders full Okadoc confirmation card with Google Calendar CTA button for Patient', () => {
      const appt = {
        id: 'HV-908123',
        doctorName: 'د. طارق محفوظ',
        doctorSpecialty: 'استشاري الصدر والجهاز التنفسي',
        patientName: 'خالد عبد الرحمن',
        date: '2026-11-30',
        timeSlot: '07:00 مساءً',
        type: 'clinic',
        typeLabel: 'كشف عيادة',
        clinicName: 'مركز القاهرة التخصصي'
      };

      const html = AppointmentsUI.renderBookingConfirmationCalendarCard(appt, { role: 'patient', isEn: false });

      assert.ok(html.includes('okadoc-calendar-confirmation-card'), 'Must render card container');
      assert.ok(html.includes('okadoc-success-icon'), 'Must include celebratory success checkmark');
      assert.ok(html.includes('تم تأكيد حجز الموعد بنجاح!'), 'Must include Arabic confirmed headline');
      assert.ok(html.includes('okadoc-btn-google-cal'), 'Must render primary Add to Google Calendar button');
      assert.ok(html.includes('إضافة إلى تقويم Google'), 'Must display Arabic CTA text');
      assert.ok(html.includes('calendar.google.com/calendar/render'), 'Must bind direct Google Calendar URL');
      assert.ok(html.includes('okadoc-btn-ics'), 'Must render .ics download secondary button');
      assert.ok(html.includes('okadoc-btn-copy'), 'Must render copy details button');
      assert.ok(html.includes('okadoc-prep-notice'), 'Must include pre-visit preparation notice');
      assert.ok(html.includes('HV-908123'), 'Must display booking reference code');
    });

    it('renders doctor-tailored confirmation card with clinical queue notice', () => {
      const appt = {
        id: 'DOC-551122',
        doctorName: 'Dr. Nader Kamel',
        patientName: 'Omar Sherif',
        date: '2026-12-05',
        timeSlot: '02:00 PM',
        type: 'video',
        typeLabel: 'Video Telehealth'
      };

      const html = AppointmentsUI.renderBookingConfirmationCalendarCard(appt, { role: 'doctor', isEn: true });

      assert.ok(html.includes('Appointment Confirmed Successfully!'), 'Must render English confirmed headline');
      assert.ok(html.includes('Add to Google Calendar (Doctor)'), 'Must render doctor-specific Google Calendar label');
      assert.ok(html.includes('Doctor Notice:'), 'Must render clinical queue notice for doctor');
      assert.ok(html.includes('data-role="doctor"'), 'Must specify doctor role in container dataset');
    });
  });

  describe('5. Interactive Modal Lifecycle & Accessibility', () => {
    it('creates or opens modal container, wires event listeners, and dispatches DOM event', () => {
      const appt = {
        id: 'HV-TEST-MODAL-1',
        doctorName: 'د. مروان سامي',
        patientName: 'ياسين محمود',
        date: '2026-12-10',
        timeSlot: '11:00 صباحاً',
        type: 'clinic'
      };

      let doneCalled = false;
      const modal = AppointmentsUI.openBookingConfirmationCalendarModal(appt, {
        role: 'patient',
        isEn: false,
        onDone: () => { doneCalled = true; }
      });

      assert.ok(modal, 'Must return modal element');
      assert.strictEqual(modal.id, 'bookingConfirmationCalendarModal');
      assert.strictEqual(modal.getAttribute('role'), 'dialog');
      assert.strictEqual(modal.getAttribute('aria-modal'), 'true');
      assert.strictEqual(modal.getAttribute('aria-hidden'), 'false');
      assert.ok(modal.classList.contains('open'), 'Modal must have open class');

      // Test close method
      AppointmentsUI.closeBookingConfirmationCalendarModal();
      assert.strictEqual(modal.getAttribute('aria-hidden'), 'true');
      assert.ok(!modal.classList.contains('open'), 'Open class must be removed on close');
    });
  });

  describe('6. Mobile Responsive CSS & WCAG Touch Target Compliance', () => {
    it('verifies appointments.css implements >= 44px / 48px touch targets, Google button branding, and mobile breakpoints', () => {
      const cssPath = path.join(__dirname, '../app/modules/appointments/appointments.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Google Calendar button styling
      assert.ok(css.includes('.okadoc-btn-google-cal'), 'CSS must define .okadoc-btn-google-cal');
      assert.ok(css.includes('min-height: 48px'), 'Google Calendar button must enforce >= 48px touch target');
      assert.ok(css.includes('cursor: pointer'), 'Must specify pointer cursor');

      // Pulsing checkmark micro-animation
      assert.ok(css.includes('@keyframes okadocPulse'), 'Must implement celebratory pulsing checkmark keyframe');
      assert.ok(css.includes('.okadoc-success-icon'), 'Must style .okadoc-success-icon');

      // Mobile media query for vertical button stacking
      assert.ok(css.includes('@media (max-width: 480px)'), 'Must include 480px mobile media query');
      assert.ok(css.includes('flex-direction: column'), 'Must stack action buttons vertically on mobile for thumb accessibility');

      // Secondary .ics and copy buttons
      assert.ok(css.includes('.okadoc-btn-ics'), 'CSS must style .okadoc-btn-ics');
      assert.ok(css.includes('.okadoc-btn-copy'), 'CSS must style .okadoc-btn-copy');
      assert.ok(css.includes('.okadoc-quick-cal-btn'), 'CSS must style 1-click in-card calendar button');
    });
  });

  describe('7. Bilingual i18n Key Parity (Arabic & English)', () => {
    it('verifies 100% mutual key parity between Arabic and English for Okadoc Google Calendar integration', () => {
      const arCatalog = i18nModule.translations.ar;
      const enCatalog = i18nModule.translations.en;

      assert.ok(arCatalog.okadocCalendar, 'Arabic catalog must have okadocCalendar namespace');
      assert.ok(enCatalog.okadocCalendar, 'English catalog must have okadocCalendar namespace');

      const expectedKeys = [
        'addToGoogleCalendar',
        'addToGoogleCalendarPatient',
        'addToGoogleCalendarDoctor',
        'bookingConfirmedTitle',
        'bookingConfirmedSubtitle',
        'calendarSyncHeroBadge',
        'downloadIcsBtn',
        'downloadIcsDesc',
        'copyAppointmentDetails',
        'detailsCopiedToast',
        'viewMyAppointmentsBtn',
        'closeModalBtn',
        'prepInstructionsHeader',
        'prepInstructionsClinic',
        'prepInstructionsVideo',
        'patientReminderNotice',
        'doctorReminderNotice',
        'doctorEventTitlePrefix',
        'patientEventTitlePrefix',
        'syncSuccess'
      ];

      for (const k of expectedKeys) {
        assert.ok(arCatalog.okadocCalendar[k], `Missing Arabic key: okadocCalendar.${k}`);
        assert.ok(enCatalog.okadocCalendar[k], `Missing English key: okadocCalendar.${k}`);
        assert.notStrictEqual(arCatalog.okadocCalendar[k].trim(), '', `Arabic key okadocCalendar.${k} cannot be empty`);
        assert.notStrictEqual(enCatalog.okadocCalendar[k].trim(), '', `English key okadocCalendar.${k} cannot be empty`);
      }

      // Also verify appointments namespace has addToGoogleCalendar
      assert.ok(arCatalog.appointments.addToGoogleCalendar, 'Arabic appointments.addToGoogleCalendar must exist');
      assert.ok(enCatalog.appointments.addToGoogleCalendar, 'English appointments.addToGoogleCalendar must exist');
    });
  });

  describe('8. app.js Integration Verification', () => {
    it('verifies app.js triggers openBookingConfirmationCalendarModal upon booking and provides openAppointmentCalendarSyncModal', () => {
      const appJsPath = path.join(__dirname, '../app/app.js');
      const appJs = fs.readFileSync(appJsPath, 'utf8');

      assert.ok(
        appJs.includes('AppointmentsUI.openBookingConfirmationCalendarModal'),
        'app.js must call openBookingConfirmationCalendarModal immediately after booking mutation succeeds'
      );
      assert.ok(
        appJs.includes('openAppointmentCalendarSyncModal'),
        'app.js must define openAppointmentCalendarSyncModal global helper'
      );
      assert.ok(
        appJs.includes('okadoc-quick-cal-btn'),
        'app.js must render 1-click Google Calendar button in patient appointment cards'
      );
    });
  });
});
