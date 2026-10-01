/**
 * Health Vibe AI - Certified Clinical Email Notification & Queue Service
 *
 * Implements:
 * 1. Clinical-grade responsive templates for all 6 required categories:
 *    - Result Ready (certified clinical assessment released)
 *    - Information Requested (physician clarification & measurements)
 *    - Doctor Assigned (specialist physician assigned to patient case)
 *    - Escalation (urgent clinical findings / triage severity alert)
 *    - Appointment Changes (booked, rescheduled, cancelled, reminder)
 *    - Verification (6-digit OTP, email verification, MFA challenge)
 * 2. Production SMTP integrity:
 *    - Actual SMTP required in production (NODE_ENV === 'production' or strict mode).
 *    - Zero simulated success in production.
 * 3. Provider acceptance verification vs delivery recording:
 *    - Validates SMTP server recipient acceptance (info.accepted).
 *    - Status stamped as 'sent' upon provider acceptance.
 *    - Explicitly records 'delivered' ONLY upon verified delivery confirmation/webhook.
 * 4. Durable Notification Queue & Anti-Duplicate Retry Engine:
 *    - States: pending -> processing -> sent / delivered / failed / cancelled.
 *    - Idempotency deduplication keys to eliminate duplicate sending.
 *    - Exponential backoff retries with maxRetries guard.
 * 5. Automated Appointment Reminder Scheduler:
 *    - Schedules 24h/pre-consultation reminders.
 *    - Automatically cancels pending reminders when appointments are cancelled or rescheduled.
 */

const nodemailer = require('nodemailer');

// In-memory log for local testing and inspection
const sentEmailsLog = [];

// Scheduler timer handle
let _reminderSchedulerTimer = null;
let _isSchedulerRunning = false;

// Queue & Notification State Enums
const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',             // Provider accepted
  DELIVERED: 'delivered',   // Explicit delivery confirmation verified
  FAILED: 'failed',         // Fatal error or max retries exceeded
  CANCELLED: 'cancelled'    // Cancelled prior to dispatch (e.g. cancelled appointment)
};

const NOTIFICATION_TYPES = {
  RESULT_READY: 'result_ready',
  INFORMATION_REQUESTED: 'information_requested',
  MORE_INFO_REQUESTED: 'more_info_requested',
  DOCTOR_ASSIGNED: 'doctor_assigned',
  ESCALATION: 'escalation',
  APPOINTMENT_CHANGES: 'appointment_changes',
  APPOINTMENT_BOOKED: 'appointment_booked',
  APPOINTMENT_RESCHEDULED: 'appointment_rescheduled',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  VERIFICATION: 'verification'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAppBaseUrl(value) {
  const fallback = 'https://app.healthvibe.ai';
  try {
    const url = new URL(value || fallback);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : fallback;
  } catch (error) {
    return fallback;
  }
}

/**
 * Configure email transporter with production SMTP enforcement.
 * In production or strict mode, simulated success is strictly forbidden.
 */
function createTransporter(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const strictSmtp = Boolean(options.strictSmtp || process.env.STRICT_SMTP === 'true' || isProduction);

  if (process.env.SIMULATE_EMAIL_FAILURE === 'true') {
    return {
      isMock: true,
      sendMail: async () => {
        throw new Error('Simulated email transport failure.');
      }
    };
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  // Prevent simulated success in production
  if (strictSmtp) {
    const error = new Error('Production email dispatch requires valid SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS). Simulated success is strictly forbidden in production.');
    error.code = 'SMTP_CONFIGURATION_REQUIRED';
    throw error;
  }

  // Fallback: Test/Development Simulated Transporter
  return {
    isMock: true,
    sendMail: async (mailOptions) => {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@healthvibe.ai`;
      const record = {
        messageId,
        to: mailOptions.to,
        from: mailOptions.from,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        sentAt: new Date().toISOString(),
        isMock: true
      };
      sentEmailsLog.push(record);
      return {
        messageId,
        response: '250 OK (Simulated Transport Acceptance)',
        accepted: [mailOptions.to],
        rejected: []
      };
    }
  };
}

// ============================================================================
// 📑 EMAIL TEMPLATE BUILDERS
// ============================================================================

/**
 * 1. Result Ready Email Template
 */
function buildResultReadyEmail({
  patientName,
  caseId = '',
  reportRef,
  doctorName,
  doctorSpecialty,
  clinicalDiagnosis,
  medications,
  recommendations,
  appUrl
}) {
  const portalUrl = normalizeAppBaseUrl(appUrl || process.env.APP_BASE_URL);
  const reportLink = `${portalUrl}/app/index.html?screen=report&caseId=${encodeURIComponent(caseId)}`;
  const safePatientName = escapeHtml(patientName || 'المحترم');
  const safeReportRef = escapeHtml(reportRef || ('HV-REP-' + caseId.slice(-8).toUpperCase()));
  const safeDoctorName = escapeHtml(doctorName || 'غير مسجل');
  const safeDoctorSpecialty = escapeHtml(doctorSpecialty || 'استشاري أمراض صدرية');
  const safeClinicalDiagnosis = escapeHtml(clinicalDiagnosis || 'غير مسجل');
  const safeMedications = escapeHtml(medications || 'غير مسجل');

  const savedRecommendations = (Array.isArray(recommendations) ? recommendations : [recommendations])
    .filter(value => typeof value === 'string' && value.trim());
  const recItems = savedRecommendations.length
    ? savedRecommendations.map(r => `<li style="margin-bottom:6px;">${escapeHtml(r)}</li>`).join('')
    : '<li>المتابعة الدورية والالتزام بإرشادات الوقاية.</li>';

  const subject = `🩺 نتيجة فحصك التنفسي جاهزة ومعتمدة - Health Vibe AI (${safeReportRef})`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 28px 24px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibe AI 🩺</h1>
        <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 999px; font-size: 12px;">معتمد سريرياً</span>
      </div>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">تقرير الفحص السريري والاستشارة التنفسية</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 600; margin-top: 0;">عزيزي المريض / ${safePatientName}،</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        نود إعلامك بأن الطبيب المعالج قد أتم مراجعة فحصك التنفسي واعتمد التقرير الطبي السريري النهائي لحالتك.
      </p>
      <div style="background: #f1f5f9; border-radius: 12px; padding: 18px; margin: 20px 0; border: 1px solid #cbd5e1;">
        <div style="margin-bottom: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">رقم التقرير المعتمد:</strong>
          <span style="font-family: monospace; font-weight: bold; margin-right: 6px;">${safeReportRef}</span>
        </div>
        <div style="margin-bottom: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">الطبيب المعتمد:</strong>
          <span style="margin-right: 6px;">${safeDoctorName} (${safeDoctorSpecialty})</span>
        </div>
        <div style="margin-bottom: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">التشخيص السريري:</strong>
          <p style="margin: 4px 0 0; color: #1e293b; font-weight: 600; line-height: 1.5;">${safeClinicalDiagnosis}</p>
        </div>
        <div style="margin-top: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">الأدوية المسجلة:</strong>
          <p style="margin: 4px 0 0; color: #1e293b;">${safeMedications}</p>
        </div>
      </div>
      <div style="margin: 18px 0;">
        <strong style="font-size: 14px; color: #1e293b; display: block; margin-bottom: 8px;">توصيات الخطة العلاجية:</strong>
        <ul style="margin: 0; padding-right: 20px; font-size: 13.5px; color: #475569; line-height: 1.6;">
          ${recItems}
        </ul>
      </div>
      <div style="text-align: center; margin: 32px 0 20px;">
        <a href="${escapeHtml(reportLink)}" target="_blank" rel="noopener noreferrer" style="background: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(13,148,136,0.3);">
          📄 عرض التقرير السريري والوصفة الطبية الكاملة
        </a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
      <p style="margin: 0 0 6px;">⚠️ <strong>تنبيه طبي:</strong> في حال الشعور بضيق تنفس حاد، هبوط سريع في الأكسجين، أو ألم بالصدر، يرجى التوجه فوراً لأقرب قسم طوارئ.</p>
      <p style="margin: 0;">© Health Vibe AI - منظومة الذكاء الاصطناعي للرعاية التنفسية السريرية.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Health Vibe AI - نتيجة الفحص التنفسي السريري
==============================================
عزيزي المريض / ${patientName || 'المحترم'}،
تم اعتماد تقرير فحصك السريري من قبل ${doctorName || 'غير مسجل'} (${doctorSpecialty || 'غير مسجل'}).
رقم التقرير: ${safeReportRef}
التشخيص السريري: ${clinicalDiagnosis || 'غير مسجل'}
الأدوية والتوصيات: ${medications || 'غير مسجل'}

التقرير الكامل:
${reportLink}

تنبيه: في حالات الطوارئ الطبية توجه فورًا إلى أقرب مستشفى.
© Health Vibe AI`;

  return { subject, html, text };
}

/**
 * 2. Information Requested Email Template
 */
function buildMoreInfoEmail({
  patientName,
  caseId = '',
  doctorName,
  moreInfoNote,
  appUrl
}) {
  const portalUrl = normalizeAppBaseUrl(appUrl || process.env.APP_BASE_URL);
  const reviewLink = `${portalUrl}/app/index.html?screen=pending&caseId=${encodeURIComponent(caseId)}`;
  const safePatientName = escapeHtml(patientName || 'المحترم');
  const safeDoctorName = escapeHtml(doctorName || 'غير مسجل');
  const safeMoreInfoNote = escapeHtml(moreInfoNote || 'يرجى إعادة قياس نسبة الأكسجين SpO2 وإرفاق الروشتة السابقة أو توضيح تطور الأعراض.');
  const safeCaseRef = escapeHtml(caseId.slice(-6).toUpperCase());

  const subject = `⚠️ مطلوب استكمال بيانات لفحصك الطبي - Health Vibe AI (#${safeCaseRef})`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 28px 24px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibe AI ⚠️</h1>
        <span style="background: rgba(255,255,255,0.25); padding: 4px 12px; border-radius: 999px; font-size: 12px;">مطلوب بيانات</span>
      </div>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">تحديث بخصوص فحصك السريري رقم #${safeCaseRef}</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 600; margin-top: 0;">عزيزي المريض / ${safePatientName}،</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        قام ${safeDoctorName} بمراجعة بيانات فحصك التنفسي، ويطلب منك تزويده بمعلومات أو قياسات سريرية إضافية لإتمام التشخيص بدقة:
      </p>
      <div style="background: #fff7ed; border-right: 4px solid #ea580c; border-radius: 8px; padding: 18px; margin: 20px 0; border-top: 1px solid #fed7aa; border-bottom: 1px solid #fed7aa; border-left: 1px solid #fed7aa;">
        <strong style="color: #9a3412; font-size: 14px; display: block; margin-bottom: 6px;">ملاحظات الطبيب والمعلومات المطلوبة:</strong>
        <p style="margin: 0; color: #7c2d12; font-size: 14px; line-height: 1.6; font-weight: 500;">
          "${safeMoreInfoNote}"
        </p>
      </div>
      <div style="text-align: center; margin: 32px 0 20px;">
        <a href="${escapeHtml(reviewLink)}" target="_blank" rel="noopener noreferrer" style="background: #ea580c; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(234,88,12,0.3);">
          📝 إرسال البيانات المطلوبة الآن
        </a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
      <p style="margin: 0;">© Health Vibe AI - منظومة الذكاء الاصطناعي للرعاية التنفسية السريرية.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Health Vibe AI - مطلوب استكمال بيانات لفحصك الطبي
===================================================
عزيزي المريض / ${patientName || 'المحترم'}،
طلب ${doctorName || 'غير مسجل'} تزويده ببيانات إضافية لإتمام فحصك السريري #${safeCaseRef}:
المطلوب:
"${moreInfoNote || 'إعادة قياس نسبة الأكسجين وتوضيح تطور الأعراض.'}"

إرسال الرد عبر الرابط:
${reviewLink}
© Health Vibe AI`;

  return { subject, html, text };
}

/**
 * 3. Doctor Assigned Email Template
 */
function buildDoctorAssignedEmail({
  patientName,
  doctorName,
  doctorSpecialty,
  clinicName,
  caseId = '',
  estimatedTime = 'خلال ساعتين',
  appUrl
}) {
  const portalUrl = normalizeAppBaseUrl(appUrl || process.env.APP_BASE_URL);
  const caseLink = `${portalUrl}/app/index.html?screen=pending&caseId=${encodeURIComponent(caseId)}`;
  const safePatient = escapeHtml(patientName || 'المحترم');
  const safeDoctor = escapeHtml(doctorName || 'طبيب استشاري');
  const safeSpec = escapeHtml(doctorSpecialty || 'أمراض الصدر والجهاز التنفسي');
  const safeClinic = escapeHtml(clinicName || 'عيادة الصدر المتخصصة');
  const safeEst = escapeHtml(estimatedTime);

  const subject = `👨‍⚕️ تم تعيين الطبيب لمراجعة حالتك السريرية - Health Vibe AI`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 28px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibe AI 👨‍⚕️</h1>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">إسناد الحالة إلى طبيب استشاري معتمد</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 600; margin-top: 0;">مرحباً / ${safePatient}،</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        يسعدنا إبلاغك بأنه تم تعيين طبيب استشاري مرخص لمراجعة حالتك الطبية وتقييم نتائج الفحص التنفسي:
      </p>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px; margin: 20px 0;">
        <div style="margin-bottom: 8px; font-size: 14px;"><strong>الطبيب المعالج:</strong> ${safeDoctor}</div>
        <div style="margin-bottom: 8px; font-size: 14px;"><strong>التخصص:</strong> ${safeSpec}</div>
        <div style="margin-bottom: 8px; font-size: 14px;"><strong>المركز / العيادة:</strong> ${safeClinic}</div>
        <div style="font-size: 14px; color: #1d4ed8;"><strong>الوقت المتوقع للرد:</strong> ${safeEst}</div>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(caseLink)}" target="_blank" rel="noopener noreferrer" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 10px; font-weight: 700; font-size: 14.5px; display: inline-block;">
          🔍 متابعة حالة الفحص مباشرة
        </a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; font-size: 12px; color: #64748b; text-align: center;">
      © Health Vibe AI - رعاية تنفسية ذكية وموثوقة
    </div>
  </div>
</body>
</html>`;

  const text = `Health Vibe AI - تم تعيين الطبيب لمراجعة حالتك
=============================================
مرحباً / ${patientName || 'المحترم'}،
تم إسناد حالتك الطبية إلى ${doctorName || 'طبيب استشاري'} (${doctorSpecialty || 'أمراض صدرية'}).
العيادة: ${clinicName || 'عيادة الصدر'}
الوقت المتوقع للاعتماد: ${estimatedTime}

المتابعة عبر الرابط: ${caseLink}
© Health Vibe AI`;

  return { subject, html, text };
}

/**
 * 4. Escalation Email Template (Urgent Clinical Alert)
 */
function buildEscalationEmail({
  patientName,
  caseId = '',
  severityLevel = 'عالي الخطورة',
  vitalSigns = '',
  criticalFindings = '',
  instructions = '',
  appUrl
}) {
  const portalUrl = normalizeAppBaseUrl(appUrl || process.env.APP_BASE_URL);
  const emergencyLink = `${portalUrl}/app/index.html?screen=emergency&caseId=${encodeURIComponent(caseId)}`;
  const safePatient = escapeHtml(patientName || 'المحترم');
  const safeSeverity = escapeHtml(severityLevel);
  const safeVitals = escapeHtml(vitalSigns || 'انخفاض حاد في الأكسجين أو تسارع ضربات القلب');
  const safeFindings = escapeHtml(criticalFindings || 'علامات استغاثة تنفسية تتطلب تقييماً فورياً');
  const safeInstructions = escapeHtml(instructions || 'يرجى التوجه فوراً لأقرب قسم طوارئ ومستشفى لتقييم مجرى الهواء ونسبة الأكسجين.');

  const subject = `🚨 تنبيه طبي عاجل: تصعيد الحالة السريرية - Health Vibe AI`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fef2f2; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 2px solid #ef4444; overflow: hidden; box-shadow: 0 6px 16px rgba(239,68,68,0.15);">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 28px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 21px; font-weight: 800;">🚨 تنبيه طبي عاجل: تصعيد الحالة</h1>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">إشعار استشاري ذو أولوية سريرية قصوى</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 700; color: #991b1b; margin-top: 0;">عناية المريض / ${safePatient}،</p>
      <div style="background: #fee2e2; border-right: 4px solid #ef4444; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <div style="font-weight: 700; color: #b91c1c; font-size: 15px; margin-bottom: 6px;">تصنيف الخطورة: ${safeSeverity}</div>
        <div style="font-size: 13.5px; color: #7f1d1d;"><strong>المؤشرات الحيوية المقلقة:</strong> ${safeVitals}</div>
        <div style="font-size: 13.5px; color: #7f1d1d; margin-top: 4px;"><strong>الملاحظات السريرية:</strong> ${safeFindings}</div>
      </div>
      <div style="background: #fff; border: 1px solid #fecaca; border-radius: 10px; padding: 16px; margin: 20px 0;">
        <h4 style="margin: 0 0 8px; color: #991b1b;">التوجيه الطبي المباشر:</h4>
        <p style="margin: 0; font-size: 14.5px; line-height: 1.6; color: #1e293b; font-weight: 600;">
          ${safeInstructions}
        </p>
      </div>
      <div style="text-align: center; margin: 28px 0 16px;">
        <a href="${escapeHtml(emergencyLink)}" target="_blank" rel="noopener noreferrer" style="background: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(220,38,38,0.35);">
          🏥 إرشادات الطوارئ وتحديد موقع أقرب مستشفى
        </a>
      </div>
      <p style="text-align: center; font-size: 13px; color: #64748b; margin: 0;">خط الطوارئ الإسعافي: اتصل برقم <strong>123</strong> فوراً.</p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #fee2e2; padding: 14px; font-size: 12px; color: #7f1d1d; text-align: center;">
      تم إصدار هذا التنبيه آلياً وبمراجعة استشارية عاجلة. لا تتأخر في طلب الرعاية الطبية الطارئة.
    </div>
  </div>
</body>
</html>`;

  const text = `🚨 تنبيه طبي عاجل - Health Vibe AI
=================================
عناية المريض / ${patientName || 'المحترم'}،
تم رصد مؤشرات سريرية تستدعي تصعيد الحالة فوراً:
تصنيف الخطورة: ${severityLevel}
المؤشرات الحيوية: ${vitalSigns}
التعليمات العاجلة: ${instructions || 'التوجه فوراً لأقرب قسم طوارئ.'}

رابط الطوارئ: ${emergencyLink}
© Health Vibe AI`;

  return { subject, html, text };
}

/**
 * 5. Appointment Changes Email Template (Booked, Rescheduled, Cancelled, Reminder)
 */
function buildAppointmentEmail({
  action,
  changeType, // backwards-compatible alias
  patientName,
  doctorName,
  doctorSpecialty,
  clinicName,
  date,
  timeSlot,
  previousDate,
  previousTimeSlot,
  reason,
  cancellationReason,
  meetUrl,
  appUrl
}) {
  const portalUrl = normalizeAppBaseUrl(appUrl || process.env.APP_BASE_URL);
  const apptLink = `${portalUrl}/app/index.html?screen=appointments`;
  const safePatient = escapeHtml(patientName || 'المحترم');
  const safeDoctor = escapeHtml(doctorName || 'الطبيب المعالج');
  const safeSpec = escapeHtml(doctorSpecialty || 'أمراض الصدر');
  const safeClinic = escapeHtml(clinicName || 'عيادة الصدر المتخصصة');
  const safeDate = escapeHtml(date || '');
  const safeTime = escapeHtml(timeSlot || '');
  const safeReason = escapeHtml(reason || cancellationReason || '');
  const effectiveAction = (action || changeType || 'booked').toLowerCase();

  let title = '';
  let badge = '';
  let bannerColor = '#0d9488';
  let subject = '';

  if (effectiveAction === 'booked') {
    title = 'تأكيد حجز الموعد الطبي';
    badge = 'مؤكد ✓';
    bannerColor = 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)';
    subject = `🗓️ تأكيد حجز موعدك الطبي - Health Vibe AI (${safeDate} ${safeTime})`.trim();
  } else if (effectiveAction === 'rescheduled') {
    title = 'تعديل موعد الاستشارة الطبية';
    badge = 'تمت الجدولة 🔄';
    bannerColor = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
    subject = `🔄 تم تعديل موعدك الطبي بنجاح - Health Vibe AI (${safeDate} ${safeTime})`.trim();
  } else if (effectiveAction === 'cancelled') {
    title = 'إلغاء الموعد الطبي';
    badge = 'ملغي ✕';
    bannerColor = 'linear-gradient(135deg, #64748b 0%, #475569 100%)';
    subject = `❌ إشعار بإلغاء موعدك الطبي - Health Vibe AI (${safeDate})`.trim();
  } else if (effectiveAction === 'reminder') {
    title = 'تذكير بموعد استشارتك القادمة';
    badge = 'تذكير ⏰';
    bannerColor = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
    subject = `⏰ تذكير: موعد استشارتك الطبية القادمة - Health Vibe AI (${safeDate} ${safeTime})`.trim();
  }

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: ${bannerColor}; padding: 28px 24px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibe AI</h1>
        <span style="background: rgba(255,255,255,0.25); padding: 4px 12px; border-radius: 999px; font-size: 12px;">${badge}</span>
      </div>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">${title}</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 600; margin-top: 0;">عزيزي المريض / ${safePatient}،</p>
      
      ${action === 'rescheduled' && previousDate ? `
        <div style="background: #eff6ff; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13.5px; color: #1e40af;">
          <strong>الموعد السابق:</strong> ${escapeHtml(previousDate)} (${escapeHtml(previousTimeSlot || '')})<br>
          <strong>الموعد الجديد:</strong> ${safeDate} في تمام ${safeTime}
        </div>
      ` : ''}

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 18px 0;">
        <div style="margin-bottom: 8px; font-size: 14px;"><strong>الطبيب:</strong> ${safeDoctor} (${safeSpec})</div>
        <div style="margin-bottom: 8px; font-size: 14px;"><strong>المركز الطبي / العيادة:</strong> ${safeClinic}</div>
        <div style="margin-bottom: 8px; font-size: 14px;"><strong>التاريخ:</strong> ${safeDate}</div>
        <div style="font-size: 14px;"><strong>الوقت:</strong> ${safeTime}</div>
        ${safeReason ? `<div style="margin-top: 8px; font-size: 13px; color: #64748b;"><strong>السبب / الملاحظات:</strong> ${safeReason}</div>` : ''}
      </div>

      ${meetUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${escapeHtml(meetUrl)}" target="_blank" rel="noopener noreferrer" style="background: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block;">
            📹 رابط الانضمام للاستشارة المرئية
          </a>
        </div>
      ` : ''}

      <div style="text-align: center; margin: 24px 0 10px;">
        <a href="${escapeHtml(apptLink)}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; text-decoration: underline; font-size: 14px;">
          إدارة مواعيدي واستعراض تفاصيل الحجز
        </a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; font-size: 12px; color: #64748b; text-align: center;">
      © Health Vibe AI - حجز وإدارة المواعيد الطبية الآمنة
    </div>
  </div>
</body>
</html>`;

  const text = `Health Vibe AI - ${title}
====================================
عزيزي المريض / ${patientName || 'المحترم'}،
حالة الموعد: ${badge}
الطبيب: ${doctorName || 'غير مسجل'} (${doctorSpecialty || ''})
العيادة: ${clinicName || ''}
التاريخ: ${date || ''} - الوقت: ${timeSlot || ''}
${reason ? `الملاحظات: ${reason}\n` : ''}
رابط المواعيد: ${apptLink}
© Health Vibe AI`;

  return { subject, html, text };
}

/**
 * 6. Verification Email Template (OTP / Code)
 */
function buildVerificationEmail({
  recipientName,
  code,
  purpose = 'تسجيل الدخول والتحقق من الحساب',
  expiresMinutes = 10,
  appUrl
}) {
  const safeName = escapeHtml(recipientName || 'المستخدم');
  const safeCode = escapeHtml(code || '000000');
  const safePurpose = escapeHtml(purpose);
  const safeExp = escapeHtml(expiresMinutes);

  const subject = `🔐 رمز التحقق الخاص بك: ${safeCode} - Health Vibe AI`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); padding: 24px; color: #ffffff; text-align: center;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibe AI 🔐</h1>
      <p style="margin: 6px 0 0; font-size: 13.5px; opacity: 0.9;">رمز الأمان والتحقق الرقمي</p>
    </div>
    <div style="padding: 28px 24px; text-align: center;">
      <p style="font-size: 15px; margin-top: 0; text-align: right;">مرحباً / ${safeName}،</p>
      <p style="font-size: 14px; color: #475569; text-align: right; line-height: 1.6;">
        لقد تم طلب رمز تحقق لإتمام <strong>${safePurpose}</strong>. يرجى إدخال الرمز التالي:
      </p>
      <div style="background: #f0fdfa; border: 2px dashed #0d9488; border-radius: 12px; padding: 18px; margin: 24px auto; max-width: 280px;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f766e; display: block;">
          ${safeCode}
        </span>
      </div>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 4px;">
        صلاحية هذا الرمز تنتهي خلال <strong>${safeExp} دقائق</strong>.
      </p>
      <p style="font-size: 12px; color: #ef4444; margin-top: 14px;">
        ⚠️ لا تشارك هذا الرمز مع أي شخص. فريق الدعم لن يطلب منك هذا الرمز أبداً.
      </p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; font-size: 12px; color: #94a3b8; text-align: center;">
      © Health Vibe AI - منظومة الأمان والتحقق المعتمدة
    </div>
  </div>
</body>
</html>`;

  const text = `Health Vibe AI - رمز التحقق
============================
مرحباً / ${recipientName || 'المستخدم'}،
رمز التحقق الخاص بك لإتمام ${purpose} هو:

${code}

ينتهي هذا الرمز خلال ${expiresMinutes} دقائق.
لا تشارك هذا الرمز مع أي شخص.
© Health Vibe AI`;

  return { subject, html, text };
}

/**
 * Universal template resolver supporting all 6 categories
 */
function buildNotificationEmailTemplate(type, payload = {}) {
  const normType = String(type || '').toLowerCase();

  switch (normType) {
    case NOTIFICATION_TYPES.RESULT_READY:
      return buildResultReadyEmail(payload);

    case NOTIFICATION_TYPES.INFORMATION_REQUESTED:
    case NOTIFICATION_TYPES.MORE_INFO_REQUESTED:
      return buildMoreInfoEmail(payload);

    case NOTIFICATION_TYPES.DOCTOR_ASSIGNED:
      return buildDoctorAssignedEmail(payload);

    case NOTIFICATION_TYPES.ESCALATION:
      return buildEscalationEmail(payload);

    case NOTIFICATION_TYPES.APPOINTMENT_CHANGES:
    case NOTIFICATION_TYPES.APPOINTMENT_BOOKED:
      return buildAppointmentEmail({ ...payload, action: 'booked' });

    case NOTIFICATION_TYPES.APPOINTMENT_RESCHEDULED:
      return buildAppointmentEmail({ ...payload, action: 'rescheduled' });

    case NOTIFICATION_TYPES.APPOINTMENT_CANCELLED:
      return buildAppointmentEmail({ ...payload, action: 'cancelled' });

    case NOTIFICATION_TYPES.APPOINTMENT_REMINDER:
      return buildAppointmentEmail({ ...payload, action: 'reminder' });

    case NOTIFICATION_TYPES.VERIFICATION:
      return buildVerificationEmail(payload);

    default:
      // Fallback
      if (normType.includes('appointment')) {
        const action = normType.includes('cancel') ? 'cancelled' : (normType.includes('resched') ? 'rescheduled' : (normType.includes('remind') ? 'reminder' : 'booked'));
        return buildAppointmentEmail({ ...payload, action });
      }
      throw new Error(`Unsupported notification template type: '${type}'.`);
  }
}

// ============================================================================
// 📤 EMAIL DISPATCH ENGINE (ACTUAL SMTP & PROVIDER ACCEPTANCE)
// ============================================================================

/**
 * Send notification email, strictly verifying provider acceptance.
 * In production, requires real SMTP and forbids simulated success.
 * Records state as 'sent' with provider acceptance, never falsely claiming 'delivered'.
 */
async function sendClinicalNotificationEmail(options = {}) {
  const {
    type,
    patientEmail,
    recipient,
    strictSmtp,
    db = null,
    queueId = null,
    ...payload
  } = options;

  const targetEmail = (recipient || patientEmail || payload.email || '').trim();
  if (!targetEmail || !targetEmail.includes('@')) {
    console.warn(`[NOTIFICATION] Skipping email: invalid or missing recipient (${targetEmail})`);
    return { success: false, reason: 'INVALID_RECIPIENT' };
  }

  // Generate template
  const template = buildNotificationEmailTemplate(type, {
    patientEmail: targetEmail,
    recipient: targetEmail,
    ...payload
  });

  const transporter = createTransporter({ strictSmtp });
  const fromAddress = process.env.SMTP_FROM || 'Health Vibe AI <notifications@healthvibe.ai>';

  const mailOptions = {
    from: fromAddress,
    to: targetEmail,
    subject: template.subject,
    text: template.text,
    html: template.html
  };

  const nowIso = new Date().toISOString();

  try {
    const info = await transporter.sendMail(mailOptions);

    // Verify provider acceptance
    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    const isAccepted = Boolean(
      (accepted.length > 0 && !rejected.some(r => r.toLowerCase() === targetEmail.toLowerCase())) ||
      transporter.isMock
    );

    if (!isAccepted) {
      const rejError = new Error(`SMTP provider rejected delivery to recipient (${targetEmail}). Server response: ${info.response || 'Rejected'}`);
      rejError.code = 'PROVIDER_REJECTED';
      throw rejError;
    }

    console.log(`[EMAIL NOTIFICATION SENT] Type: ${type} | To: ${targetEmail} | ID: ${info.messageId}`);

    let notificationDocId = null;

    // Persist to email_notifications collection if db instance provided
    if (db && typeof db.collection === 'function') {
      try {
        const notifDoc = {
          queueId: queueId || null,
          caseId: payload.caseId || null,
          appointmentId: payload.appointmentId || null,
          type: type.toLowerCase(),
          recipient: targetEmail,
          patientName: payload.patientName || payload.name || null,
          doctorName: payload.doctorName || null,
          subject: template.subject,
          status: NOTIFICATION_STATUS.SENT, // Stamped sent, NOT delivered
          providerAccepted: true,
          providerResponse: info.response || '250 OK',
          messageId: info.messageId,
          sentAt: nowIso,
          delivered: false,
          deliveredAt: null, // Distinct from sent; populated only upon verified receipt
          isSimulated: Boolean(transporter.isMock)
        };

        const col = db.collection('email_notifications');
        if (typeof col.add === 'function') {
          const docRef = await col.add(notifDoc);
          notificationDocId = docRef?.id || null;
        } else if (typeof col.doc === 'function') {
          notificationDocId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await col.doc(notificationDocId).set(notifDoc);
        }
      } catch (dbErr) {
        console.warn('[NOTIFICATION WARNING] Failed to persist email_notification:', dbErr.message);
      }
    }

    return {
      success: true,
      status: NOTIFICATION_STATUS.SENT,
      notificationId: notificationDocId,
      messageId: info.messageId,
      type,
      recipient: targetEmail,
      providerAccepted: true,
      delivered: false, // Explicitly not claiming delivery merely because it was sent
      isSimulated: Boolean(transporter.isMock)
    };
  } catch (err) {
    console.error(`[NOTIFICATION ERROR] Failed to send ${type} email to ${targetEmail}:`, err.message);
    return {
      success: false,
      status: NOTIFICATION_STATUS.FAILED,
      error: err.message,
      code: err.code || 'TRANSPORT_ERROR'
    };
  }
}

// ============================================================================
// 📦 NOTIFICATION QUEUE & RETRY ENGINE
// ============================================================================

/**
 * Enqueue a notification with idempotency protection against duplicate sending.
 */
async function enqueueNotification(db, {
  type,
  recipient,
  payload = {},
  idempotencyKey = null,
  scheduledAt = null,
  priority = 'normal',
  maxRetries = 3,
  backoffMs = 1000
}) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('Database instance is required to enqueue notifications.');
  }

  const nowIso = new Date().toISOString();
  const queueCol = db.collection('notification_queue');

  // Idempotency guard: prevent duplicate queuing of same pending or sent message
  if (idempotencyKey) {
    try {
      const existingSnap = await queueCol
        .where('idempotencyKey', '==', idempotencyKey)
        .where('status', 'in', [
          NOTIFICATION_STATUS.PENDING,
          NOTIFICATION_STATUS.PROCESSING,
          NOTIFICATION_STATUS.SENT,
          NOTIFICATION_STATUS.DELIVERED
        ])
        .get();

      if (!existingSnap.empty) {
        const existing = existingSnap.docs[0].data();
        return {
          success: true,
          queued: false,
          duplicatePrevented: true,
          status: existing.status,
          idempotencyKey: existing.idempotencyKey,
          item: existing,
          queueId: existingSnap.docs[0].id
        };
      }
    } catch (e) {
      // If composite query fails in mock or missing index, continue safely
    }
  }

  const queueId = `qmsg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const item = {
    id: queueId,
    idempotencyKey: idempotencyKey || null,
    type,
    recipient,
    payload,
    status: NOTIFICATION_STATUS.PENDING,
    priority,
    retryCount: 0,
    maxRetries,
    backoffMs,
    scheduledAt: scheduledAt || nowIso,
    createdAt: nowIso,
    lockedAt: null,
    lockedBy: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    lastError: null,
    messageId: null
  };

  await queueCol.doc(queueId).set(item);

  return {
    success: true,
    queued: true,
    duplicatePrevented: false,
    queueId,
    status: item.status,
    idempotencyKey: item.idempotencyKey,
    scheduledAt: item.scheduledAt,
    item
  };
}

/**
 * Process pending items in notification_queue with retry exponential backoff.
 */
async function processNotificationQueue(db, options = {}) {
  if (!db || typeof db.collection !== 'function') {
    return { processedCount: 0, sentCount: 0, failedCount: 0, retryCount: 0 };
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const batchSize = options.batchSize || 10;
  const workerId = options.workerId || `worker_${process.pid}`;
  const strictSmtp = Boolean(options.strictSmtp);

  const queueCol = db.collection('notification_queue');
  const snap = await queueCol
    .where('status', '==', NOTIFICATION_STATUS.PENDING)
    .get();

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let retryCount = 0;
  let cancelledCount = 0;

  for (const doc of snap.docs) {
    if (processedCount >= batchSize) break;

    const item = doc.data() || {};
    // Check if scheduled time has arrived
    if (item.scheduledAt && item.scheduledAt > nowIso) {
      continue;
    }

    // Lease lock to prevent duplicate worker execution
    const docRef = queueCol.doc(doc.id);
    await docRef.update({
      status: NOTIFICATION_STATUS.PROCESSING,
      lockedAt: nowIso,
      lockedBy: workerId
    });

    processedCount++;

    // Guard: Check if linked appointment is cancelled before sending appointment reminder
    if (item.type === NOTIFICATION_TYPES.APPOINTMENT_REMINDER && item.payload?.appointmentId) {
      try {
        const apptDoc = await db.collection('appointments').doc(item.payload.appointmentId).get();
        if (apptDoc.exists && apptDoc.data()?.status === 'cancelled') {
          await docRef.update({
            status: NOTIFICATION_STATUS.CANCELLED,
            cancelledAt: nowIso,
            cancelledReason: 'appointment_was_cancelled'
          });
          cancelledCount++;
          continue;
        }
      } catch (e) {
        // Continue if appointments collection is not present
      }
    }

    // Dispatch notification
    const result = await sendClinicalNotificationEmail({
      type: item.type,
      recipient: item.recipient,
      queueId: doc.id,
      strictSmtp,
      db,
      ...item.payload
    });

    if (result.success) {
      await docRef.update({
        status: NOTIFICATION_STATUS.SENT,
        messageId: result.messageId,
        providerAccepted: true,
        sentAt: nowIso,
        isSimulated: Boolean(result.isSimulated),
        lockedAt: null,
        lockedBy: null
      });
      sentCount++;
    } else {
      const nextRetryCount = (item.retryCount || 0) + 1;
      const maxRetries = item.maxRetries || 3;

      if (nextRetryCount < maxRetries) {
        const backoffDelay = (item.backoffMs || 1000) * Math.pow(2, nextRetryCount);
        const nextAttemptAt = new Date(Date.now() + backoffDelay).toISOString();

        await docRef.update({
          status: NOTIFICATION_STATUS.PENDING,
          retryCount: nextRetryCount,
          scheduledAt: nextAttemptAt,
          lastError: result.error || 'Transport failed',
          lockedAt: null,
          lockedBy: null
        });
        retryCount++;
      } else {
        await docRef.update({
          status: NOTIFICATION_STATUS.FAILED,
          retryCount: nextRetryCount,
          failedAt: nowIso,
          lastError: result.error || 'Max retries exceeded',
          lockedAt: null,
          lockedBy: null
        });
        failedCount++;
      }
    }
  }

  return {
    processedCount,
    sentCount,
    failedCount,
    retryCount,
    cancelledCount,
    processed: processedCount,
    sent: sentCount,
    failed: failedCount,
    retried: retryCount,
    cancelled: cancelledCount
  };
}

/**
 * Record actual delivery confirmation when verified receipt/webhook is received.
 * Does not falsely claim delivery merely because message was accepted by SMTP.
 */
async function recordDeliveryConfirmation(db, {
  messageId,
  notificationId,
  recipient,
  deliveredAt = null,
  providerMetadata = {}
}) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('Database required to record delivery confirmation.');
  }

  const nowIso = deliveredAt || new Date().toISOString();
  let updatedCount = 0;

  // 1. Update in notification_queue (if present)
  if (messageId || notificationId) {
    try {
      const queueCol = db.collection('notification_queue');
      const targetQueueRefs = [];

      if (notificationId) {
        const directQueue = await queueCol.doc(notificationId).get();
        if (directQueue.exists) {
          targetQueueRefs.push(queueCol.doc(notificationId));
        }
      }
      if (messageId) {
        const snap = await queueCol.where('messageId', '==', messageId).get();
        if (!snap.empty) {
          snap.docs.forEach(d => targetQueueRefs.push(queueCol.doc(d.id)));
        }
      }

      for (const qRef of targetQueueRefs) {
        await qRef.update({
          status: NOTIFICATION_STATUS.DELIVERED,
          delivered: true,
          deliveredAt: nowIso,
          providerMetadata,
          deliveryMetadata: providerMetadata
        });
        updatedCount++;
      }
    } catch (e) {
      console.warn('[DELIVERY CONFIRMATION WARNING] Could not update queue:', e.message);
    }
  }

  // 2. Update in email_notifications
  if (messageId || notificationId) {
    try {
      const emailCol = db.collection('email_notifications');
      const targetDocRefs = [];

      if (notificationId) {
        const directDoc = await emailCol.doc(notificationId).get();
        if (directDoc.exists) {
          targetDocRefs.push(emailCol.doc(notificationId));
        }
      }
      if (messageId && targetDocRefs.length === 0) {
        const snap = await emailCol.where('messageId', '==', messageId).get();
        if (!snap.empty) {
          snap.docs.forEach(d => targetDocRefs.push(emailCol.doc(d.id)));
        }
      }
      if (notificationId && targetDocRefs.length === 0) {
        const snap = await emailCol.where('queueId', '==', notificationId).get();
        if (!snap.empty) {
          snap.docs.forEach(d => targetDocRefs.push(emailCol.doc(d.id)));
        }
      }

      for (const ref of targetDocRefs) {
        await ref.update({
          status: NOTIFICATION_STATUS.DELIVERED,
          delivered: true,
          deliveredAt: nowIso,
          providerMetadata,
          deliveryMetadata: providerMetadata
        });
        updatedCount++;
      }
    } catch (e) {
      console.warn('[DELIVERY CONFIRMATION WARNING] Could not update email_notifications:', e.message);
    }
  }

  // 3. Register delivery audit receipt in delivery_receipts
  try {
    const receiptCol = db.collection('delivery_receipts');
    if (receiptCol) {
      const receiptData = {
        messageId: messageId || null,
        notificationId: notificationId || null,
        recipient: recipient || null,
        deliveredAt: nowIso,
        providerMetadata,
        recordedAt: new Date().toISOString()
      };
      if (typeof receiptCol.add === 'function') {
        await receiptCol.add(receiptData);
      } else if (typeof receiptCol.doc === 'function') {
        const rId = `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await receiptCol.doc(rId).set(receiptData);
      }
    }
  } catch (receiptErr) {
    console.warn('[DELIVERY CONFIRMATION WARNING] Could not log receipt:', receiptErr.message);
  }

  return {
    success: true,
    status: NOTIFICATION_STATUS.DELIVERED,
    updatedCount,
    deliveredAt: nowIso
  };
}

// ============================================================================
// ⏰ APPOINTMENT REMINDER SCHEDULER & CANCELLATION
// ============================================================================

/**
 * Schedule an appointment reminder (e.g. 24 hours prior to appointment).
 */
async function scheduleAppointmentReminder(db, appointment, { hoursBefore = 24 } = {}) {
  if (!db || !appointment || !appointment.id) return { success: false, reason: 'INVALID_APPOINTMENT' };

  const patientEmail = appointment.patientEmail || appointment.recipient;
  if (!patientEmail) return { success: false, reason: 'NO_PATIENT_EMAIL' };

  const apptDate = appointment.date || (appointment.slotStart ? appointment.slotStart.slice(0, 10) : null);
  if (!apptDate && !appointment.slotStart) return { success: false, reason: 'MISSING_DATE' };

  // Calculate reminder time
  let targetDateTime;
  if (appointment.slotStart) {
    targetDateTime = new Date(appointment.slotStart);
  } else {
    const timeStr = appointment.timeSlot ? appointment.timeSlot.split(' ')[0] : '09:00';
    targetDateTime = new Date(`${apptDate}T${timeStr.includes(':') ? timeStr : '09:00'}:00`);
  }
  
  let scheduledReminder = new Date(targetDateTime.getTime() - hoursBefore * 3600 * 1000);
  const now = new Date();

  // If appointment is less than hoursBefore away, schedule reminder 1 hour before or immediately
  if (scheduledReminder <= now) {
    scheduledReminder = new Date(now.getTime() + 60 * 1000); // 1 minute from now
  }

  const idempotencyKey = appointment.reminderIdempotencyKey || `appt_reminder_${appointment.id}`;

  return enqueueNotification(db, {
    type: NOTIFICATION_TYPES.APPOINTMENT_REMINDER,
    recipient: patientEmail,
    idempotencyKey,
    scheduledAt: scheduledReminder.toISOString(),
    priority: 'normal',
    payload: {
      appointmentId: appointment.id,
      patientName: appointment.patientName,
      doctorName: appointment.doctorName,
      doctorSpecialty: appointment.doctorSpecialty,
      clinicName: appointment.clinicName,
      date: apptDate,
      timeSlot: appointment.timeSlot || (appointment.slotStart ? appointment.slotStart.slice(11, 16) : null),
      slotStart: appointment.slotStart || null,
      slotEnd: appointment.slotEnd || null,
      meetUrl: appointment.meetUrl || null
    }
  });
}

/**
 * Cancel pending reminders for a given appointment (e.g. upon cancellation or reschedule).
 */
async function cancelAppointmentReminders(db, appointmentId, reason = 'appointment_cancelled') {
  if (!db || !appointmentId) return { cancelledCount: 0 };

  const nowIso = new Date().toISOString();
  let cancelledCount = 0;

  try {
    const queueCol = db.collection('notification_queue');
    const snap = await queueCol
      .where('status', 'in', [NOTIFICATION_STATUS.PENDING, NOTIFICATION_STATUS.PROCESSING])
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const linkedApptId = data.payload?.appointmentId || data.appointmentId;
      if (linkedApptId === appointmentId) {
        await queueCol.doc(doc.id).update({
          status: NOTIFICATION_STATUS.CANCELLED,
          cancelledAt: nowIso,
          cancelledReason: reason,
          cancellationReason: reason
        });
        cancelledCount++;
      }
    }
  } catch (err) {
    console.warn('[CANCEL REMINDERS WARNING]:', err.message);
  }

  return { cancelledCount };
}

/**
 * Start automated background reminder scheduler polling interval.
 */
function startReminderScheduler(db, { intervalMs = 60000, strictSmtp = false } = {}) {
  if (_reminderSchedulerTimer) {
    clearInterval(_reminderSchedulerTimer);
  }

  _isSchedulerRunning = true;
  _reminderSchedulerTimer = setInterval(async () => {
    try {
      await processNotificationQueue(db, { strictSmtp });
    } catch (err) {
      console.warn('[SCHEDULER RUNNER ERROR]:', err.message);
    }
  }, intervalMs);

  return _reminderSchedulerTimer;
}

/**
 * Stop background reminder scheduler polling interval.
 */
function stopReminderScheduler() {
  if (_reminderSchedulerTimer) {
    clearInterval(_reminderSchedulerTimer);
    _reminderSchedulerTimer = null;
  }
  _isSchedulerRunning = false;
}

function getSentEmailsLog() {
  return [...sentEmailsLog];
}

function clearSentEmailsLog() {
  sentEmailsLog.length = 0;
}

// ============================================================================
// 🔔 USER NOTIFICATION HISTORY, PREFERENCES & SERVER-SIDE SENDER ENFORCEMENT
// ============================================================================

const inMemoryNotificationHistory = new Map();
const inMemoryUserPreferences = new Map();

const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  channels: {
    in_app: true,
    email: true,
    sms: false,
    whatsapp: false,
    push: true
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  },
  timeZone: 'Africa/Cairo',
  urgentPolicy: 'ALWAYS_DELIVER_IMMEDIATELY'
});

/**
 * Checks whether an event qualifies as urgent/critical clinical event.
 * Urgent clinical events bypass quiet hours and channel muting.
 */
function isUrgentEvent(params = {}) {
  const { eventType, type, urgent, priority, severity } = params;
  const evt = (eventType || type || '').toLowerCase();
  const prio = (priority || '').toLowerCase();
  const sev = (severity || '').toUpperCase();

  if (urgent === true) return true;
  if (evt === NOTIFICATION_TYPES.ESCALATION || evt === 'escalation' || evt === 'emergency') return true;
  if (prio === 'critical' || prio === 'urgent') return true;
  if (sev === 'CRITICAL' || sev === 'HIGH_RISK' || sev === 'عالي الخطورة') return true;
  return false;
}

/**
 * Generates an authorized, role-safe destination link for the given event type.
 */
function generateAuthorizedDestinationLink({
  eventType,
  type,
  caseId = null,
  appointmentId = null,
  ticketId = null,
  appUrl = null,
  customPath = null
} = {}) {
  if (customPath && typeof customPath === 'string' && customPath.startsWith('/')) {
    return customPath;
  }
  const portalUrl = normalizeAppBaseUrl(appUrl || process.env.APP_BASE_URL);
  const evt = (eventType || type || '').toLowerCase();

  if (evt === NOTIFICATION_TYPES.ESCALATION || evt === 'escalation') {
    return caseId
      ? `${portalUrl}/app/index.html?screen=emergency&caseId=${encodeURIComponent(caseId)}`
      : `${portalUrl}/app/index.html?screen=emergency`;
  }
  if (evt === NOTIFICATION_TYPES.RESULT_READY || evt === 'result_ready') {
    return caseId
      ? `${portalUrl}/app/index.html?screen=report&caseId=${encodeURIComponent(caseId)}`
      : `${portalUrl}/app/index.html?screen=report`;
  }
  if (evt === NOTIFICATION_TYPES.INFORMATION_REQUESTED || evt === NOTIFICATION_TYPES.MORE_INFO_REQUESTED) {
    return caseId
      ? `${portalUrl}/app/index.html?screen=chat&caseId=${encodeURIComponent(caseId)}`
      : `${portalUrl}/app/index.html?screen=chat`;
  }
  if (evt === NOTIFICATION_TYPES.DOCTOR_ASSIGNED || evt === 'doctor_assigned') {
    return caseId
      ? `${portalUrl}/app/index.html?screen=report&caseId=${encodeURIComponent(caseId)}`
      : `${portalUrl}/app/index.html?screen=report`;
  }
  if (evt.startsWith('appointment_') || evt === 'appointment_changes') {
    return appointmentId
      ? `${portalUrl}/app/index.html?screen=appointments&id=${encodeURIComponent(appointmentId)}`
      : `${portalUrl}/app/index.html?screen=appointments`;
  }
  if (evt === 'feedback_update' || evt === 'ticket_update') {
    return ticketId
      ? `${portalUrl}/app/index.html?screen=support&ticketId=${encodeURIComponent(ticketId)}`
      : `${portalUrl}/app/index.html?screen=support`;
  }
  return `${portalUrl}/app/index.html`;
}

/**
 * Returns current hour, minute and total minutes in specified IANA timezone.
 */
function getLocalTimeInTimeZone(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'Africa/Cairo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return { hour, minute, totalMinutes: hour * 60 + minute };
  } catch (e) {
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    return { hour, minute, totalMinutes: hour * 60 + minute };
  }
}

/**
 * Evaluates whether quiet hours are currently active for the given preferences.
 */
function isQuietHoursActive(preferences = {}, now = new Date()) {
  const quietHours = preferences.quietHours;
  if (!quietHours || !quietHours.enabled) return false;

  const startStr = quietHours.start || '22:00';
  const endStr = quietHours.end || '08:00';
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  const startMinutes = (isNaN(startH) ? 22 : startH) * 60 + (isNaN(startM) ? 0 : startM);
  const endMinutes = (isNaN(endH) ? 8 : endH) * 60 + (isNaN(endM) ? 0 : endM);

  const { totalMinutes } = getLocalTimeInTimeZone(now, preferences.timeZone || 'Africa/Cairo');

  if (startMinutes > endMinutes) {
    // Crosses midnight: e.g. 22:00 to 08:00
    return totalMinutes >= startMinutes || totalMinutes < endMinutes;
  } else if (startMinutes < endMinutes) {
    // Same day window: e.g. 13:00 to 15:00
    return totalMinutes >= startMinutes && totalMinutes < endMinutes;
  }
  return false;
}

/**
 * Calculates the exact timestamp when quiet hours end.
 */
function calculateNextQuietHoursEnd(preferences = {}, now = new Date()) {
  const quietHours = preferences.quietHours;
  const startStr = quietHours?.start || '22:00';
  const endStr = quietHours?.end || '08:00';
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  const startMinutes = (isNaN(startH) ? 22 : startH) * 60 + (isNaN(startM) ? 0 : startM);
  const endMinutes = (isNaN(endH) ? 8 : endH) * 60 + (isNaN(endM) ? 0 : endM);

  const { totalMinutes } = getLocalTimeInTimeZone(now, preferences.timeZone || 'Africa/Cairo');

  let minutesRemaining = 0;
  if (startMinutes > endMinutes) {
    if (totalMinutes >= startMinutes) {
      minutesRemaining = (1440 - totalMinutes) + endMinutes;
    } else if (totalMinutes < endMinutes) {
      minutesRemaining = endMinutes - totalMinutes;
    }
  } else if (startMinutes < endMinutes) {
    if (totalMinutes >= startMinutes && totalMinutes < endMinutes) {
      minutesRemaining = endMinutes - totalMinutes;
    }
  }

  const durationMs = Math.max(minutesRemaining, 1) * 60 * 1000;
  return new Date(now.getTime() + durationMs);
}

/**
 * Records an in-app notification in history with read/unread state.
 */
async function recordNotificationHistory(db, {
  userId,
  eventType,
  type,
  title,
  message,
  body,
  authorizedDestinationLink,
  destinationLink,
  urgent = false,
  metadata = {}
}) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required to record user notification history.');
  }

  const id = `notif_hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date().toISOString();
  const resolvedType = eventType || type || 'system_alert';
  const link = authorizedDestinationLink || destinationLink || generateAuthorizedDestinationLink({
    eventType: resolvedType,
    caseId: metadata.caseId,
    appointmentId: metadata.appointmentId,
    ticketId: metadata.ticketId
  });

  const record = {
    id,
    userId,
    eventType: resolvedType,
    title: String(title || 'Notification').trim(),
    body: String(message || body || '').trim(),
    message: String(message || body || '').trim(),
    read: false,
    readAt: null,
    urgent: Boolean(urgent),
    authorizedDestinationLink: link,
    destinationLink: link,
    metadata: metadata || {},
    createdAt: nowIso
  };

  inMemoryNotificationHistory.set(id, record);

  if (db && typeof db.collection === 'function') {
    try {
      const col = db.collection('user_notifications');
      if (typeof col.doc === 'function') {
        await col.doc(id).set(record);
      }
    } catch (err) {
      console.warn('[NOTIFICATION WARNING] Failed to persist user_notification to Firestore:', err.message);
    }
  }

  return record;
}

/**
 * Retrieves in-app notification history strictly for the authorized user.
 */
async function getUserNotificationHistory(db, userId, options = {}) {
  if (!userId || typeof userId !== 'string') {
    return { notifications: [], unreadCount: 0, totalCount: 0 };
  }

  const { unreadOnly = false, eventType = null, limit = 50, offset = 0 } = options;

  const items = [];
  for (const item of inMemoryNotificationHistory.values()) {
    if (item.userId === userId) {
      if (unreadOnly && item.read) continue;
      if (eventType && item.eventType !== eventType) continue;
      items.push({ ...item });
    }
  }

  if (db && typeof db.collection === 'function') {
    try {
      const col = db.collection('user_notifications');
      let q = col.where('userId', '==', userId);
      if (unreadOnly) {
        q = q.where('read', '==', false);
      }
      const snap = await q.get();
      if (snap && snap.docs) {
        for (const doc of snap.docs) {
          const d = doc.data();
          if (d && d.id && !inMemoryNotificationHistory.has(d.id)) {
            if (eventType && d.eventType !== eventType) continue;
            items.push(d);
          }
        }
      }
    } catch (e) {
      // Fallback to memory
    }
  }

  items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const totalCount = items.length;
  const unreadCount = items.filter(i => !i.read).length;
  const paginated = items.slice(offset, offset + limit);

  return {
    notifications: paginated,
    unreadCount,
    totalCount
  };
}

/**
 * Marks a notification as read with strict user isolation.
 */
async function markNotificationAsRead(db, notificationId, userId) {
  if (!notificationId || !userId) {
    const err = new Error('notificationId and userId are required.');
    err.code = 'INVALID_PARAMETERS';
    throw err;
  }

  let item = inMemoryNotificationHistory.get(notificationId);

  if (!item && db && typeof db.collection === 'function') {
    try {
      const docSnap = await db.collection('user_notifications').doc(notificationId).get();
      if (docSnap.exists) {
        item = docSnap.data();
      }
    } catch (e) {}
  }

  if (!item) {
    const err = new Error(`Notification '${notificationId}' not found.`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (item.userId !== userId) {
    const err = new Error('Access denied. You can only update your own notifications.');
    err.code = 'ACCESS_DENIED';
    throw err;
  }

  const nowIso = new Date().toISOString();
  item.read = true;
  item.readAt = nowIso;
  inMemoryNotificationHistory.set(notificationId, item);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('user_notifications').doc(notificationId).update({
        read: true,
        readAt: nowIso
      });
    } catch (e) {}
  }

  return { ...item };
}

/**
 * Marks all notifications for a specific user as read.
 */
async function markAllNotificationsAsRead(db, userId) {
  if (!userId) return { success: false, updatedCount: 0 };

  const nowIso = new Date().toISOString();
  let updatedCount = 0;

  for (const item of inMemoryNotificationHistory.values()) {
    if (item.userId === userId && !item.read) {
      item.read = true;
      item.readAt = nowIso;
      updatedCount++;
    }
  }

  if (db && typeof db.collection === 'function') {
    try {
      const col = db.collection('user_notifications');
      const snap = await col.where('userId', '==', userId).where('read', '==', false).get();
      if (snap && snap.docs) {
        for (const doc of snap.docs) {
          await col.doc(doc.id).update({
            read: true,
            readAt: nowIso
          });
        }
      }
    } catch (e) {}
  }

  return { success: true, updatedCount };
}

/**
 * Retrieves a single notification strictly owned by userId.
 */
async function getNotificationById(db, notificationId, userId) {
  if (!notificationId) return null;
  let item = inMemoryNotificationHistory.get(notificationId);

  if (!item && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('user_notifications').doc(notificationId).get();
      if (snap.exists) {
        item = snap.data();
      }
    } catch (e) {}
  }

  if (!item) return null;
  if (userId && item.userId !== userId) {
    const err = new Error('Access denied to notification.');
    err.code = 'ACCESS_DENIED';
    throw err;
  }

  return { ...item };
}

/**
 * Retrieves user notification preferences with fallback to defaults.
 */
async function getUserNotificationPreferences(db, userId) {
  if (!userId) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  let prefs = inMemoryUserPreferences.get(userId);

  if (!prefs && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('user_notification_preferences').doc(userId).get();
      if (snap.exists) {
        prefs = snap.data();
        inMemoryUserPreferences.set(userId, prefs);
      }
    } catch (e) {}
  }

  if (!prefs) {
    return {
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels },
      quietHours: { ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours }
    };
  }

  return {
    userId,
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...(prefs.channels || {})
    },
    quietHours: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours,
      ...(prefs.quietHours || {})
    },
    timeZone: prefs.timeZone || DEFAULT_NOTIFICATION_PREFERENCES.timeZone,
    urgentPolicy: DEFAULT_NOTIFICATION_PREFERENCES.urgentPolicy,
    updatedAt: prefs.updatedAt || null
  };
}

/**
 * Updates user notification preferences (channels, quiet hours, time zone).
 */
async function updateUserNotificationPreferences(db, userId, updates = {}) {
  if (!userId) {
    const err = new Error('userId is required to update notification preferences.');
    err.code = 'INVALID_PARAMETERS';
    throw err;
  }

  const current = await getUserNotificationPreferences(db, userId);

  if (updates.quietHours) {
    const qh = updates.quietHours;
    if (qh.start && !/^\d{1,2}:\d{2}$/.test(qh.start)) {
      const err = new Error('Invalid quietHours.start format. Expected HH:MM.');
      err.code = 'INVALID_TIME_FORMAT';
      throw err;
    }
    if (qh.end && !/^\d{1,2}:\d{2}$/.test(qh.end)) {
      const err = new Error('Invalid quietHours.end format. Expected HH:MM.');
      err.code = 'INVALID_TIME_FORMAT';
      throw err;
    }
  }

  if (updates.timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: updates.timeZone });
    } catch (e) {
      const err = new Error(`Invalid IANA timeZone: '${updates.timeZone}'`);
      err.code = 'INVALID_TIMEZONE';
      throw err;
    }
  }

  const merged = {
    userId,
    channels: {
      ...current.channels,
      ...(updates.channels || {})
    },
    quietHours: {
      ...current.quietHours,
      ...(updates.quietHours || {})
    },
    timeZone: updates.timeZone || current.timeZone,
    urgentPolicy: DEFAULT_NOTIFICATION_PREFERENCES.urgentPolicy,
    updatedAt: new Date().toISOString()
  };

  inMemoryUserPreferences.set(userId, merged);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('user_notification_preferences').doc(userId).set(merged, { merge: true });
    } catch (e) {
      console.warn('[PREFERENCES WARNING] Could not persist to Firestore:', e.message);
    }
  }

  return merged;
}

/**
 * Dispatches a notification enforcing server-side channel preferences, quiet hours,
 * and urgent clinical bypass policies.
 */
async function dispatchNotificationWithPreferences(db, {
  userId,
  recipientEmail,
  eventType,
  type,
  title,
  message,
  body,
  authorizedDestinationLink,
  destinationLink,
  urgent = false,
  priority = 'normal',
  severity = null,
  payload = {},
  appointmentId = null,
  caseId = null,
  forceEmail = false,
  strictSmtp = false
}) {
  const resolvedType = eventType || type || 'system_alert';
  const isUrgent = isUrgentEvent({ eventType: resolvedType, urgent, priority, severity });

  const prefs = await getUserNotificationPreferences(db, userId);
  const quietHoursActive = isQuietHoursActive(prefs);

  const link = authorizedDestinationLink || destinationLink || generateAuthorizedDestinationLink({
    eventType: resolvedType,
    caseId: caseId || payload.caseId,
    appointmentId: appointmentId || payload.appointmentId,
    ticketId: payload.ticketId
  });

  let inAppNotification = null;
  let emailResult = null;
  let queuedItem = null;

  // 1. In-App Notification:
  // Recorded in user history if in_app channel is enabled or if urgent
  if (userId && (prefs.channels.in_app !== false || isUrgent)) {
    inAppNotification = await recordNotificationHistory(db, {
      userId,
      eventType: resolvedType,
      title: title || 'Health Vibe Notification',
      message: message || body || '',
      authorizedDestinationLink: link,
      urgent: isUrgent,
      metadata: {
        ...payload,
        caseId,
        appointmentId
      }
    });
  }

  // 2. External Delivery (Email):
  const shouldDeliverEmail = Boolean(recipientEmail) && (prefs.channels.email !== false || isUrgent || forceEmail);

  if (shouldDeliverEmail) {
    if (quietHoursActive && !isUrgent) {
      // Quiet hours active & non-urgent: DEFER in queue so notification is never lost!
      const scheduledAt = calculateNextQuietHoursEnd(prefs);
      queuedItem = await enqueueNotification(db, {
        type: resolvedType,
        recipient: recipientEmail,
        idempotencyKey: payload.idempotencyKey || `defer_${userId}_${resolvedType}_${Date.now()}`,
        scheduledAt: scheduledAt.toISOString(),
        priority: 'deferred',
        payload: {
          ...payload,
          userId,
          title,
          message: message || body,
          appointmentId,
          caseId,
          deferredDueToQuietHours: true
        }
      });

      return {
        success: true,
        deliveredImmediately: false,
        deferred: true,
        quietHoursActive: true,
        scheduledAt: scheduledAt.toISOString(),
        inAppNotification,
        queuedItem,
        urgentBypass: false,
        channels: {
          in_app: Boolean(inAppNotification),
          email: 'deferred'
        }
      };
    } else {
      // Outside quiet hours OR urgent event (urgent bypasses quiet hours and channel muting)
      emailResult = await sendClinicalNotificationEmail({
        type: resolvedType,
        recipient: recipientEmail,
        strictSmtp,
        db,
        ...payload,
        caseId: caseId || payload.caseId,
        appointmentId: appointmentId || payload.appointmentId
      });

      return {
        success: true,
        deliveredImmediately: true,
        deferred: false,
        quietHoursActive,
        urgentBypass: isUrgent && quietHoursActive,
        inAppNotification,
        emailResult,
        channels: {
          in_app: Boolean(inAppNotification),
          email: emailResult?.status || 'sent'
        }
      };
    }
  }

  return {
    success: true,
    deliveredImmediately: Boolean(inAppNotification),
    deferred: false,
    quietHoursActive,
    urgentBypass: false,
    inAppNotification,
    channels: {
      in_app: Boolean(inAppNotification),
      email: 'disabled'
    }
  };
}

/**
 * Reschedules appointment reminders: cancels previous pending reminder entries
 * and schedules the new reminder with the updated slotStart.
 */
async function rescheduleAppointmentReminders(db, appointment, newSlotStart, reason = 'appointment_rescheduled') {
  if (!db || !appointment || !appointment.id) {
    return { success: false, reason: 'INVALID_APPOINTMENT' };
  }

  const cancelResult = await cancelAppointmentReminders(db, appointment.id, reason);

  const updatedAppt = {
    ...appointment,
    slotStart: newSlotStart || appointment.slotStart,
    reminderIdempotencyKey: `appt_reminder_${appointment.id}_${Date.now()}`
  };

  const scheduleResult = await scheduleAppointmentReminder(db, updatedAppt);

  return {
    success: true,
    cancelledPreviousCount: cancelResult.cancelledCount,
    newReminder: scheduleResult
  };
}

function clearNotificationHistoryLog() {
  inMemoryNotificationHistory.clear();
}

function clearPreferencesLog() {
  inMemoryUserPreferences.clear();
}

module.exports = {
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  createTransporter,
  sendClinicalNotificationEmail,
  buildResultReadyEmail,
  buildMoreInfoEmail,
  buildDoctorAssignedEmail,
  buildEscalationEmail,
  buildAppointmentEmail,
  buildVerificationEmail,
  buildNotificationEmailTemplate,
  enqueueNotification,
  processNotificationQueue,
  recordDeliveryConfirmation,
  scheduleAppointmentReminder,
  cancelAppointmentReminders,
  rescheduleAppointmentReminders,
  startReminderScheduler,
  stopReminderScheduler,
  getSentEmailsLog,
  clearSentEmailsLog,
  recordNotificationHistory,
  getUserNotificationHistory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationById,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  isQuietHoursActive,
  calculateNextQuietHoursEnd,
  isUrgentEvent,
  generateAuthorizedDestinationLink,
  dispatchNotificationWithPreferences,
  clearNotificationHistoryLog,
  clearPreferencesLog
};

