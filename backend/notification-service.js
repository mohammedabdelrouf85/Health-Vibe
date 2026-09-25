/**
 * Health Vibe AI - Clinical Email Notification Service
 * Handles certified clinical results and doctor more-info requests.
 */

const nodemailer = require('nodemailer');

// In-memory log for local testing and emulator inspection
const sentEmailsLog = [];

/**
 * Configure email transporter
 */
function createTransporter() {
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
      return { messageId, response: '250 OK (Simulated Transport)' };
    }
  };
}

/**
 * Build HTML and text for Result Ready notification
 */
function buildResultReadyEmail({
  patientName,
  caseId,
  reportRef,
  doctorName,
  doctorSpecialty,
  clinicalDiagnosis,
  medications,
  recommendations,
  appUrl
}) {
  const portalUrl = appUrl || process.env.APP_BASE_URL || 'https://app.healthvibe.ai';
  const reportLink = `${portalUrl}/app/index.html?screen=report&caseId=${encodeURIComponent(caseId)}`;

  const savedRecommendations = (Array.isArray(recommendations) ? recommendations : [recommendations])
    .filter(value => typeof value === 'string' && value.trim());
  const recItems = savedRecommendations.length
    ? savedRecommendations.map(r => `<li style="margin-bottom:6px;">${r}</li>`).join('')
    : '<li>غير مسجل</li>';

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>نتيجة الفحص التنفسي السريري - Health Vibes AI</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 28px 24px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibes AI 🩺</h1>
        <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 999px; font-size: 12px;">معتمد سريرياً</span>
      </div>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">تقرير الفحص السريري والاستشارة التنفسية</p>
    </div>

    <!-- Content -->
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 600; margin-top: 0;">عزيزي المريض / ${patientName || 'المحترم'}،</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        نود إعلامك بأن الطبيب المعالج قد أتم مراجعة فحصك التنفسي واعتمد التقرير الطبي السريري النهائي لحالتك.
      </p>

      <!-- Summary Box -->
      <div style="background: #f1f5f9; border-radius: 12px; padding: 18px; margin: 20px 0; border: 1px solid #cbd5e1;">
        <div style="margin-bottom: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">رقم التقرير المعتمد:</strong>
          <span style="font-family: monospace; font-weight: bold; margin-right: 6px;">${reportRef || ('HV-REP-' + caseId.slice(-8).toUpperCase())}</span>
        </div>
        <div style="margin-bottom: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">الطبيب المعتمد:</strong>
          <span style="margin-right: 6px;">${doctorName || 'غير مسجل'} (${doctorSpecialty || 'غير مسجل'})</span>
        </div>
        <div style="margin-bottom: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">التشخيص السريري:</strong>
          <p style="margin: 4px 0 0; color: #1e293b; font-weight: 600; line-height: 1.5;">${clinicalDiagnosis || 'غير مسجل'}</p>
        </div>
        <div style="margin-top: 8px; font-size: 13.5px;">
          <strong style="color: #0f766e;">الأدوية المسجلة:</strong>
          <p style="margin: 4px 0 0; color: #1e293b;">${medications || 'غير مسجل'}</p>
        </div>
      </div>

      <!-- Recommendations -->
      <div style="margin: 18px 0;">
        <strong style="font-size: 14px; color: #1e293b; display: block; margin-bottom: 8px;">توصيات الخطة العلاجية:</strong>
        <ul style="margin: 0; padding-right: 20px; font-size: 13.5px; color: #475569; line-height: 1.6;">
          ${recItems}
        </ul>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0 20px;">
        <a href="${reportLink}" target="_blank" style="background: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(13,148,136,0.3);">
          📄 عرض التقرير السريري والوصفة الطبية الكاملة
        </a>
      </div>
      <p style="text-align: center; font-size: 12px; color: #64748b; margin: 0;">أو تفضل بزيارة حسابك في التطبيق واستعراض شاشة "السجل والتقارير الطبية".</p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
      <p style="margin: 0 0 6px;">⚠️ <strong>تنبيه طبي:</strong> هذا التقرير صادر عن طبيب مرخص. في حال الشعور بضيق تنفس حاد، هبوط سريع في الأكسجين، أو ألم بالصدر، يرجى التوجه فوراً لأقرب قسم طوارئ.</p>
      <p style="margin: 0;">© Health Vibes AI - منظومة الذكاء الاصطناعي للرعاية التنفسية السريرية.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Health Vibes AI - نتيجة الفحص التنفسي السريري
==============================================
عزيزي المريض / ${patientName || 'المحترم'}،

تم اعتماد تقرير فحصك السريري من قبل ${doctorName || 'غير مسجل'} (${doctorSpecialty || 'غير مسجل'}).

رقم التقرير: ${reportRef || ('HV-REP-' + caseId.slice(-8).toUpperCase())}
التشخيص السريري: ${clinicalDiagnosis || 'غير مسجل'}
الأدوية والتوصيات: ${medications || 'غير مسجل'}

يمكنك الاطلاع على التقرير الطبي الكامل عبر الرابط:
${reportLink}

تنبيه: في حالات الطوارئ الطبية توجه فورًا إلى أقرب مستشفى.
© Health Vibes AI
  `;

  return { html, text };
}

/**
 * Build HTML and text for More Info Requested notification
 */
function buildMoreInfoEmail({
  patientName,
  caseId,
  doctorName,
  moreInfoNote,
  appUrl
}) {
  const portalUrl = appUrl || process.env.APP_BASE_URL || 'https://app.healthvibe.ai';
  const reviewLink = `${portalUrl}/app/index.html?screen=pending&caseId=${encodeURIComponent(caseId)}`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>مطلوب استكمال بيانات لفحصك الطبي - Health Vibes AI</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 28px 24px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Health Vibes AI ⚠️</h1>
        <span style="background: rgba(255,255,255,0.25); padding: 4px 12px; border-radius: 999px; font-size: 12px;">مطلوب بيانات</span>
      </div>
      <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">تحديث بخصوص فحصك السريري رقم #${caseId.slice(-6).toUpperCase()}</p>
    </div>

    <!-- Content -->
    <div style="padding: 28px 24px;">
      <p style="font-size: 16px; font-weight: 600; margin-top: 0;">عزيزي المريض / ${patientName || 'المحترم'}،</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        قام ${doctorName || 'غير مسجل'} بمراجعة بيانات فحصك التنفسي، ويطلب منك تزويده بمعلومات أو قياسات سريرية إضافية لإتمام التشخيص بدقة:
      </p>

      <!-- Note Box -->
      <div style="background: #fff7ed; border-right: 4px solid #ea580c; border-radius: 8px; padding: 18px; margin: 20px 0; border-top: 1px solid #fed7aa; border-bottom: 1px solid #fed7aa; border-left: 1px solid #fed7aa;">
        <strong style="color: #9a3412; font-size: 14px; display: block; margin-bottom: 6px;">ملاحظات الطبيب والمعلومات المطلوبة:</strong>
        <p style="margin: 0; color: #7c2d12; font-size: 14px; line-height: 1.6; font-weight: 500;">
          "${moreInfoNote || 'يرجى إعادة قياس نسبة الأكسجين SpO2 وإرفاق الروشتة السابقة أو توضيح تطور الأعراض.'}"
        </p>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        يرجى الدخول إلى صفحة المراجعة والضغط على <strong>"تزويد الطبيب بالبيانات"</strong> لإرسال الإجابة أو القياسات المطلوبة. سيستأنف الطبيب الفحص فور استلام ردك.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0 20px;">
        <a href="${reviewLink}" target="_blank" style="background: #ea580c; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(234,88,12,0.3);">
          📝 إرسال البيانات المطلوبة الآن
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
      <p style="margin: 0 0 6px;">في حال كانت لديك استفسارات طارئة، يرجى التوجه لمركز الرعاية الصحية الأقرب إليك.</p>
      <p style="margin: 0;">© Health Vibes AI - منظومة الذكاء الاصطناعي للرعاية التنفسية السريرية.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Health Vibes AI - مطلوب استكمال بيانات لفحصك الطبي
===================================================
عزيزي المريض / ${patientName || 'المحترم'}،

طلب ${doctorName || 'غير مسجل'} تزويده ببيانات إضافية لإتمام فحصك السريري #${caseId.slice(-6).toUpperCase()}:

المطلوب:
"${moreInfoNote || 'إعادة قياس نسبة الأكسجين وتوضيح تطور الأعراض.'}"

يرجى إرسال الرد عبر الرابط التالي:
${reviewLink}

© Health Vibes AI
  `;

  return { html, text };
}

/**
 * Dispatch clinical email notification
 */
async function sendClinicalNotificationEmail({
  type, // 'result_ready' | 'more_info_requested'
  patientEmail,
  patientName,
  caseId,
  reportRef,
  doctorName,
  doctorSpecialty,
  clinicalDiagnosis,
  medications,
  recommendations,
  moreInfoNote,
  appUrl,
  db = null
}) {
  if (!patientEmail || !patientEmail.includes('@')) {
    console.warn(`[NOTIFICATION] Skipping email: invalid or missing recipient (${patientEmail})`);
    return { success: false, reason: 'INVALID_RECIPIENT' };
  }

  let subject = '';
  let emailContent = { html: '', text: '' };

  if (type === 'result_ready') {
    const ref = reportRef || `HV-REP-${caseId.slice(-8).toUpperCase()}`;
    subject = `🩺 نتيجة فحصك التنفسي جاهزة ومعتمدة - Health Vibes AI (${ref})`;
    emailContent = buildResultReadyEmail({
      patientName,
      caseId,
      reportRef: ref,
      doctorName,
      doctorSpecialty,
      clinicalDiagnosis,
      medications,
      recommendations,
      appUrl
    });
  } else if (type === 'more_info_requested') {
    subject = `⚠️ مطلوب استكمال بيانات لفحصك الطبي - Health Vibes AI (#${caseId.slice(-6).toUpperCase()})`;
    emailContent = buildMoreInfoEmail({
      patientName,
      caseId,
      doctorName,
      moreInfoNote,
      appUrl
    });
  } else {
    throw new Error(`Unknown notification type: ${type}`);
  }

  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || 'Health Vibes AI <notifications@healthvibe.ai>';

  const mailOptions = {
    from: fromAddress,
    to: patientEmail,
    subject: subject,
    text: emailContent.text,
    html: emailContent.html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL NOTIFICATION SENT] Type: ${type} | To: ${patientEmail} | ID: ${info.messageId}`);

    // If Firestore instance provided, persist notification record
    if (db) {
      try {
        await db.collection('email_notifications').add({
          caseId,
          type,
          recipient: patientEmail,
          patientName: patientName || null,
          subject,
          doctorName: doctorName || null,
          status: 'sent',
          messageId: info.messageId,
          isSimulated: Boolean(transporter.isMock),
          sentAt: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn('[NOTIFICATION] Could not record email to Firestore:', dbErr.message);
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      type,
      recipient: patientEmail,
      isSimulated: Boolean(transporter.isMock)
    };
  } catch (err) {
    console.error(`[NOTIFICATION ERROR] Failed to send ${type} email to ${patientEmail}:`, err);
    return { success: false, error: err.message };
  }
}

function getSentEmailsLog() {
  return [...sentEmailsLog];
}

function clearSentEmailsLog() {
  sentEmailsLog.length = 0;
}

module.exports = {
  sendClinicalNotificationEmail,
  buildResultReadyEmail,
  buildMoreInfoEmail,
  getSentEmailsLog,
  clearSentEmailsLog
};
