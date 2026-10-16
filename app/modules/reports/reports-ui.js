/**
 * Health Vibe AI - Reports UI Module
 * 
 * Manages clinical report presentation, print layout triggers,
 * and security badge displays.
 */

(function (global) {
  "use strict";

  function triggerPrintReport() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  /**
   * Triggers bilingual PDF export matching the approved report version.
   * Configures document typography, pagination metadata, and print layout.
   * @param {object} record
   * @param {'ar'|'en'} language
   */
  function exportReportToPdf(record, language = "ar") {
    if (typeof window === "undefined" || !record) return;
    const isEn = language === "en";
    const reportService = global.HealthVibes?.ReportsService;
    const reportData = reportService ? reportService.applyApprovedReportSnapshot(record) : record;
    const previousLanguage = global.currentLanguage;

    // Apply language and direction for print rendering
    document.documentElement.lang = language;
    document.documentElement.dir = isEn ? "ltr" : "rtl";
    document.body.classList.add("printing-pdf-mode");
    if (isEn) {
      document.body.classList.add("print-lang-en");
      document.body.classList.remove("print-lang-ar");
    } else {
      document.body.classList.add("print-lang-ar");
      document.body.classList.remove("print-lang-en");
    }

    // Set page title for saved PDF file name
    const reportRef = reportData.reportRef || `HV-REP-${reportData.id.slice(-8).toUpperCase()}`;
    const originalTitle = document.title;
    document.title = `HealthVibes_Report_${reportRef}_${language.toUpperCase()}`;

    // Add print pagination indicator if not already present
    let paginationEl = document.getElementById("printPaginationIndicator");
    if (!paginationEl) {
      paginationEl = document.createElement("div");
      paginationEl.id = "printPaginationIndicator";
      paginationEl.className = "print-pagination";
      const reportArea = document.getElementById("printableReportArea") || document.body;
      reportArea.appendChild(paginationEl);
    }
    const dateFormatted = new Date().toLocaleDateString(isEn ? "en-US" : "ar-EG");
    paginationEl.innerHTML = `
      <span>Health Vibe Medical Center • ${reportRef}</span>
      <span>${isEn ? `Printed: ${dateFormatted}` : `تاريخ الطباعة: ${dateFormatted}`}</span>
      <span class="page-counter">${isEn ? "Page 1 of 1 (Approved Record)" : "صفحة 1 من 1 (نسخة معتمدة)"}</span>
    `;

    // Ensure report view is rendered in the target language
    if (typeof global.renderReportScreen === "function") {
      global.currentLanguage = language;
      global.renderReportScreen(record.id).then(() => {
        window.print();
        setTimeout(() => {
          document.body.classList.remove("printing-pdf-mode", "print-lang-en", "print-lang-ar");
          document.title = originalTitle;
          global.currentLanguage = previousLanguage;
          document.documentElement.lang = previousLanguage;
          document.documentElement.dir = previousLanguage === "en" ? "ltr" : "rtl";
          if (typeof global.renderReportScreen === "function") {
            global.renderReportScreen(record.id);
          }
        }, 1000);
      });
    } else {
      window.print();
      document.body.classList.remove("printing-pdf-mode", "print-lang-en", "print-lang-ar");
      document.title = originalTitle;
    }
  }

  function renderReportSecurityBadge(record, isEn = false) {
    const isApproved = record && (record.status === "approved" || record.reportSnapshot);
    if (!isApproved) {
      return `
        <div class="report-badge unapproved">
          <span>⚠️</span>
          <span>${isEn ? "Preliminary / Not Certified" : "تقرير مبدئي / غير معتمد"}</span>
        </div>
      `;
    }
    const isWithdrawn = record.reportWithdrawal && record.reportWithdrawal.status === "withdrawn";
    if (isWithdrawn) {
      return `
        <div class="report-badge withdrawn" style="background: rgba(239, 68, 68, 0.1); border: 1.5px solid #ef4444; color: #dc2626; border-radius: 8px; padding: 6px 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
          <span>🚫</span>
          <span>${isEn ? "Formally Withdrawn by Physician" : "تم سحب التقرير رسمياً بواسطة الطبيب"}</span>
        </div>
      `;
    }
    return `
      <div class="report-badge certified">
        <span>🔒</span>
        <span>${isEn ? "Digitally Certified by Attending Physician" : "معتمد رقمياً وموثق بواسطة الطبيب المعالج"}</span>
      </div>
    `;
  }

  /**
   * Opens the Report Sharing Modal with explicit consent and recipient constraints.
   * @param {object} record
   */
  function openShareReportModal(record) {
    if (!record || typeof document === "undefined") return;
    const isEn = (global.currentLanguage === "en");
    const reportRef = record.reportRef || `HV-REP-${record.id.slice(-8).toUpperCase()}`;

    let modal = document.getElementById("shareReportModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "shareReportModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card panel" style="width: 100%; max-width: 520px; background: var(--surface); border-radius: 16px; border: 1px solid var(--line); padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 17px; color: var(--teal); display: flex; align-items: center; gap: 8px;">
            <span>🔗</span> ${isEn ? "Secure Report Sharing" : "مشاركة التقرير الطبي الآمنة"}
          </h3>
          <button type="button" class="icon-button" onclick="document.getElementById('shareReportModal').style.display='none'" style="font-size: 18px; border: none; background: none; cursor: pointer; color: var(--muted);">&times;</button>
        </div>

        <p style="font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 16px;">
          ${isEn 
            ? `Generate a time-limited, revocable link to share report <strong>${reportRef}</strong> with a consulting physician, clinic, or specialist.`
            : `توليد رابط مشفر محدد الصلاحية وقابل للإلغاء في أي وقت لمشاركة التقرير <strong>${reportRef}</strong> مع طبيب استشاري أو عيادة خارجية.`}
        </p>

        <!-- Form fields -->
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <!-- Validity Duration -->
          <div>
            <label for="shareExpiresHours" style="display: block; font-size: 12.5px; font-weight: 700; margin-bottom: 6px; color: var(--ink);">
              ⏳ ${isEn ? "Link Validity Period" : "مدة صلاحية الرابط"}
            </label>
            <select id="shareExpiresHours" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px;">
              <option value="24">${isEn ? "24 Hours (Recommended)" : "24 ساعة (موصى به)"}</option>
              <option value="48" selected>${isEn ? "48 Hours" : "48 ساعة (يومان)"}</option>
              <option value="168">${isEn ? "7 Days" : "7 أيام (أسبوع)"}</option>
            </select>
          </div>

          <!-- Optional Recipient Restriction -->
          <div>
            <label for="shareRecipientEmail" style="display: block; font-size: 12.5px; font-weight: 700; margin-bottom: 6px; color: var(--ink);">
              👤 ${isEn ? "Restrict to Recipient Email (Optional)" : "تقييد الوصول ببريد المستلم فقط (اختياري)"}
            </label>
            <input type="email" id="shareRecipientEmail" placeholder="${isEn ? 'doctor@clinic.com' : 'doctor@clinic.com'}" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; box-sizing: border-box;" />
          </div>

          <!-- Optional Recipient PIN -->
          <div>
            <label for="shareRecipientPin" style="display: block; font-size: 12.5px; font-weight: 700; margin-bottom: 6px; color: var(--ink);">
              🔑 ${isEn ? "Access Passcode / PIN (Optional 4-6 digits)" : "رمز حماية إضافي / PIN (اختياري 4-6 أرقام)"}
            </label>
            <input type="password" id="shareRecipientPin" maxlength="6" placeholder="****" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; box-sizing: border-box;" />
          </div>

          <!-- Mandatory Explicit Consent Checkbox -->
          <div style="background: rgba(14, 165, 164, 0.08); border: 1.5px solid var(--teal); border-radius: 10px; padding: 12px;">
            <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 12.5px; color: var(--ink); cursor: pointer; user-select: none;">
              <input type="checkbox" id="shareConsentCheckbox" style="margin-top: 3px; accent-color: var(--teal); width: 16px; height: 16px;" />
              <span>
                <strong>${isEn ? "Explicit Patient Consent Required:" : "الموافقة الصريحة المطلوبة:"}</strong>
                ${isEn
                  ? "I hereby explicitly authorize Health Vibe to generate a temporary, revocable access link to my certified medical assessment record. I understand this link can be revoked at any time."
                  : "أقر بموافقتي الصريحة والتامة على قيام Health Vibe بإنشاء رابط مؤقت وقابل للإلغاء لمشاركة تقريري الطبي المعتمد، وأعلم أنه يمكنني إلغاء الرابط فوراً في أي وقت."}
              </span>
            </label>
          </div>

          <div id="shareResultBox" style="display: none; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 12px;">
            <span style="font-size: 12px; color: var(--teal); font-weight: 700; display: block; margin-bottom: 6px;">
              ✅ ${isEn ? "Active Share Link Created:" : "تم إنشاء رابط المشاركة المعتمد بنجاح:"}
            </span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="text" id="shareLinkUrlInput" readonly style="flex: 1; padding: 6px 10px; font-size: 12px; font-family: monospace; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; color: var(--ink);" />
              <button type="button" class="solid-button" id="copyShareLinkBtn" style="padding: 6px 12px; font-size: 12px;">
                ${isEn ? "Copy" : "نسخ"}
              </button>
            </div>
            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--muted);">
              <span id="shareExpiryNotice"></span>
              <button type="button" class="soft-button" id="revokeShareLinkBtn" style="color: #ef4444; border-color: rgba(239,68,68,0.3); padding: 4px 8px; font-size: 11px;">
                ${isEn ? "Revoke Link Now" : "إبطال الرابط الآن"}
              </button>
            </div>
          </div>
        </div>

        <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="outline-button" onclick="document.getElementById('shareReportModal').style.display='none'">
            ${isEn ? "Close" : "إغلاق"}
          </button>
          <button type="button" class="solid-button" id="generateShareLinkBtn" style="background: var(--teal);">
            <span>🔒</span> ${isEn ? "Generate Secure Link" : "توليد الرابط الآمن"}
          </button>
        </div>
      </div>
    `;

    modal.style.display = "flex";

    const consentBox = document.getElementById("shareConsentCheckbox");
    const generateBtn = document.getElementById("generateShareLinkBtn");
    const resultBox = document.getElementById("shareResultBox");
    const linkInput = document.getElementById("shareLinkUrlInput");
    const copyBtn = document.getElementById("copyShareLinkBtn");
    const revokeBtn = document.getElementById("revokeShareLinkBtn");
    const expiryNotice = document.getElementById("shareExpiryNotice");

    let currentShareId = null;

    generateBtn.onclick = async () => {
      if (!consentBox.checked) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Explicit consent checkbox is required." : "يرجى تحديد مربع الموافقة الصريحة للمتابعة.", "error");
        }
        return;
      }

      generateBtn.disabled = true;
      generateBtn.innerHTML = `<span>⏳</span> ${isEn ? "Creating..." : "جاري التوليد..."}`;

      try {
        const expiresInHours = parseInt(document.getElementById("shareExpiresHours").value, 10) || 48;
        const recipientEmail = document.getElementById("shareRecipientEmail").value.trim();
        const recipientPin = document.getElementById("shareRecipientPin").value.trim();

        const shareRes = await global.HealthVibes.ReportsService.createReportShareLink(record.id, {
          consent: true,
          consentText: consentBox.parentElement.innerText.trim(),
          expiresInHours,
          recipientEmail: recipientEmail || null,
          recipientPin: recipientPin || null
        });

        currentShareId = shareRes.shareId;
        const fullUrl = `${window.location.origin}${shareRes.shareUrl || `/app/index.html?shared=${shareRes.shareId}`}`;
        linkInput.value = fullUrl;
        expiryNotice.textContent = isEn ? `Expires: ${new Date(shareRes.expiresAt).toLocaleString()}` : `ينتهي في: ${new Date(shareRes.expiresAt).toLocaleString("ar-EG")}`;
        resultBox.style.display = "block";
        generateBtn.style.display = "none";

        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Share link generated successfully." : "تم إنشاء رابط المشاركة الآمن بنجاح.");
        }
      } catch (err) {
        if (typeof global.showToast === "function") {
          global.showToast(err.message || (isEn ? "Failed to create share link." : "تعذر إنشاء الرابط الآمن."), "error");
        }
      } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = `<span>🔒</span> ${isEn ? "Generate Secure Link" : "توليد الرابط الآمن"}`;
      }
    };

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(linkInput.value).then(() => {
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Link copied to clipboard!" : "تم نسخ الرابط للحافظة!");
        }
      });
    };

    revokeBtn.onclick = async () => {
      if (!currentShareId) return;
      if (!confirm(isEn ? "Are you sure you want to revoke this link immediately?" : "هل أنت متأكد من رغبتك في إبطال هذا الرابط فوراً؟")) return;

      revokeBtn.disabled = true;
      try {
        await global.HealthVibes.ReportsService.revokeReportShareLink(currentShareId);
        resultBox.innerHTML = `
          <div style="color: #ef4444; font-size: 13px; font-weight: 700; text-align: center; padding: 10px;">
            🚫 ${isEn ? "Link successfully revoked. Access has been terminated." : "تم إبطال الرابط بنجاح. تم إلغاء كافة صلاحيات الوصول."}
          </div>
        `;
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Share link revoked." : "تم إبطال الرابط بنجاح.");
        }
      } catch (err) {
        if (typeof global.showToast === "function") {
          global.showToast(err.message || "Failed to revoke link.", "error");
        }
        revokeBtn.disabled = false;
      }
    };
  }

  /**
   * Renders public authenticity verification view without exposing medical content.
   * @param {HTMLElement} container
   * @param {string} reportRef
   */
  async function renderVerificationView(container, reportRef) {
    if (!container || !reportRef) return;
    const isEn = (global.currentLanguage === "en");

    container.innerHTML = `
      <div style="padding: 40px 16px; max-width: 620px; margin: 0 auto; text-align: center;">
        <div class="spinner" style="width: 28px; height: 28px; margin: 0 auto 16px;"></div>
        <h3 style="color: var(--teal);">${isEn ? "Verifying Official Digital Authenticity..." : "جاري التحقق من التوقيع الرقمي والاعتماد الرسمي..."}</h3>
      </div>
    `;

    try {
      const data = await global.HealthVibes.ReportsService.verifyReportAuthenticity(reportRef);

      if (!data.ok || data.status === "not_found") {
        container.innerHTML = `
          <div class="panel" style="max-width: 600px; margin: 40px auto; padding: 32px 24px; text-align: center; border-radius: 16px; border: 1.5px solid #ef4444;">
            <span style="font-size: 48px; display: block; margin-bottom: 12px;">❌</span>
            <h2 style="color: #dc2626; margin: 0 0 10px;">${isEn ? "Authenticity Verification Failed" : "فشل التحقق من صحة التقرير"}</h2>
            <p style="font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 20px;">
              ${isEn
                ? `No certified clinical record was found matching reference <strong>${escapeHtml(reportRef)}</strong> in the authentic Health Vibe registry.`
                : `لم يتم العثور على أي تقرير سريري معتمد يحمل الرقم المرجعي <strong>${escapeHtml(reportRef)}</strong> في سجل الاعتماد الرسمي.`}
            </p>
            <button type="button" class="solid-button" onclick="window.location.href='/'">
              ${isEn ? "Return to Homepage" : "العودة للرئيسية"}
            </button>
          </div>
        `;
        return;
      }

      if (data.status === "withdrawn") {
        container.innerHTML = `
          <div class="panel" style="max-width: 600px; margin: 40px auto; padding: 32px 24px; text-align: center; border-radius: 16px; border: 2px solid #ef4444; background: rgba(239,68,68,0.04);">
            <span style="font-size: 48px; display: block; margin-bottom: 12px;">🚫</span>
            <div style="display: inline-block; background: #ef4444; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; margin-bottom: 12px;">
              ${isEn ? "Formally Withdrawn" : "تقرير مسحوب وملغى"}
            </div>
            <h2 style="color: #dc2626; margin: 0 0 10px;">${isEn ? "Official Report Has Been Withdrawn" : "تم سحب هذا التقرير الطبي رسمياً"}</h2>
            <p style="font-size: 14px; color: var(--ink); line-height: 1.6; margin-bottom: 16px;">
              ${isEn
                ? "This medical assessment was previously certified, but has been formally retracted and invalidated by the attending physician."
                : "هذا التقرير تم اعتماده سابقاً، ولكن قام الطبيب المعالج بسحبه رسمياً وإلغاء صلاحيته السريرية."}
            </p>

            <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; text-align: ${isEn ? 'left' : 'right'}; font-size: 13px; margin-bottom: 20px;">
              <div style="margin-bottom: 8px;">
                <span style="color: var(--muted);">${isEn ? "Report Ref:" : "الرقم المرجعي:"}</span>
                <strong style="margin-inline-start: 6px; font-family: monospace;">${escapeHtml(data.reportRef)}</strong>
              </div>
              <div style="margin-bottom: 8px;">
                <span style="color: var(--muted);">${isEn ? "Withdrawal Reason:" : "سبب السحب السريري:"}</span>
                <strong style="margin-inline-start: 6px; color: #dc2626;">${escapeHtml(data.withdrawalReason || "Clinical update required")}</strong>
              </div>
              <div style="margin-bottom: 8px;">
                <span style="color: var(--muted);">${isEn ? "Withdrawn At:" : "تاريخ السحب:"}</span>
                <strong style="margin-inline-start: 6px;">${new Date(data.withdrawnAt).toLocaleString(isEn ? "en-US" : "ar-EG")}</strong>
              </div>
              <div>
                <span style="color: var(--muted);">${isEn ? "Attending Doctor:" : "الطبيب المعتمد:"}</span>
                <strong style="margin-inline-start: 6px;">${escapeHtml(data.doctor?.name || "Verified Physician")} (${escapeHtml(data.doctor?.licenseNumber || "")})</strong>
              </div>
            </div>

            <div style="font-size: 11.5px; color: var(--muted); line-height: 1.5; border-top: 1px dashed var(--line); padding-top: 14px;">
              🛡️ ${escapeHtml(data.medicalPrivacyNotice || "")}
            </div>
          </div>
        `;
        return;
      }

      // Valid and Certified Authenticity Badge
      container.innerHTML = `
        <div class="panel" style="max-width: 600px; margin: 40px auto; padding: 32px 24px; text-align: center; border-radius: 16px; border: 2px solid #16a34a; background: rgba(22, 163, 74, 0.03);">
          <span style="font-size: 48px; display: block; margin-bottom: 12px;">✅</span>
          <div style="display: inline-block; background: #16a34a; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; margin-bottom: 12px;">
            ${isEn ? "Certified Official Report" : "تقرير طبي معتمد رسمياً"}
          </div>
          <h2 style="color: #15803d; margin: 0 0 10px;">${isEn ? "Authenticity Verified & Valid" : "تم التحقق من صحة التقرير وتوثيق الاعتماد"}</h2>
          <p style="font-size: 13.5px; color: var(--ink); line-height: 1.6; margin-bottom: 20px;">
            ${escapeHtml(data.authenticityStatement || (isEn ? "This record was digitally verified." : "تم التحقق من صحة هذا السجل."))}
          </p>

          <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; text-align: ${isEn ? 'left' : 'right'}; font-size: 13px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px;">
            <div>
              <span style="color: var(--muted);">${isEn ? "Report Reference:" : "الرقم المرجعي للتقرير:"}</span>
              <strong style="margin-inline-start: 6px; font-family: monospace;">${escapeHtml(data.reportRef)}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">${isEn ? "Attending Physician:" : "الطبيب المعتمد:"}</span>
              <strong style="margin-inline-start: 6px; color: var(--teal);">${escapeHtml(data.doctor?.name || "Verified Physician")}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">${isEn ? "Specialty & License:" : "التخصص وترخيص النقابة:"}</span>
              <strong style="margin-inline-start: 6px;">${escapeHtml(data.doctor?.specialty || "Pulmonology")} • ${escapeHtml(data.doctor?.licenseNumber || "")}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">${isEn ? "Issuing Medical Center:" : "المركز الطبي المصدر:"}</span>
              <strong style="margin-inline-start: 6px;">${escapeHtml(data.clinic || "Health Vibe Medical Center")}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">${isEn ? "Approval Timestamp:" : "تاريخ وتوقيت الاعتماد:"}</span>
              <strong style="margin-inline-start: 6px;">${data.issuedAt ? new Date(data.issuedAt).toLocaleString(isEn ? "en-US" : "ar-EG") : "N/A"}</strong>
            </div>
            <div style="font-family: monospace; font-size: 11px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; margin-top: 4px;">
              Digital Signature: ${escapeHtml(data.digitalSignature?.hash || "")}
            </div>
          </div>

          <div style="font-size: 11.5px; color: var(--muted); line-height: 1.5; border-top: 1px dashed var(--line); padding-top: 14px;">
            🛡️ ${escapeHtml(data.medicalPrivacyNotice || (isEn ? "Medical content protected." : "المحتوى السريري محمي ولا يُعرض علناً."))}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="panel" style="max-width: 500px; margin: 40px auto; padding: 24px; text-align: center;">
          <span style="font-size: 32px;">⚠️</span>
          <h4>${isEn ? "Verification Service Temporarily Unavailable" : "خدمة التحقق غير متاحة مؤقتاً"}</h4>
          <p style="font-size: 13px; color: var(--muted);">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function safeEscape(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Opens the Doctor Inbox Delivery Confirmation Modal with detailed tracking and payload breakdown.
   * @param {object} dispatchResult
   * @param {boolean} isEn
   */
  function openDoctorInboxDeliveryModal(dispatchResult, isEn = false) {
    if (!dispatchResult || typeof document === "undefined") return;

    const trackingRef = safeEscape(dispatchResult.trackingRef || `HV-DISP-${Date.now().toString(36).toUpperCase()}`);
    const reportRef = safeEscape(dispatchResult.reportRef || (dispatchResult.caseId ? `HV-REP-${dispatchResult.caseId.slice(-8).toUpperCase()}` : ""));
    const doctor = dispatchResult.recipientDoctor || {};
    const patient = dispatchResult.patientProfile || {};
    const metrics = dispatchResult.assessmentMetrics || {};
    const o2Val = metrics.oxygenLevel ?? "--";
    const dateFormatted = dispatchResult.timestamp ? new Date(dispatchResult.timestamp).toLocaleString(isEn ? "en-US" : "ar-EG") : new Date().toLocaleString(isEn ? "en-US" : "ar-EG");

    let modal = document.getElementById("doctorInboxDeliveryModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "doctorInboxDeliveryModal";
      modal.className = "modal-overlay";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card panel" style="width: 100%; max-width: 560px; background: var(--surface); border-radius: 18px; border: 1.5px solid var(--teal); padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.3); text-align: ${isEn ? 'left' : 'right'}; max-height: 90vh; overflow-y: auto;">
        
        <!-- Header Banner with Success Badge -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(16, 185, 129, 0.12); border: 2px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 22px;">
              ✓
            </div>
            <div>
              <h3 style="margin: 0; font-size: 17px; color: var(--teal); font-weight: 800;">
                ${isEn ? "Medical Report Delivered to Doctor" : "تم تسليم التقرير الطبي لصندوق وارد الطبيب بنجاح"}
              </h3>
              <span class="pill ok" style="font-size: 11px; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
                ${isEn ? "Delivered to Doctor Inbox ✓" : "تم التسليم إلى صندوق الوارد وقائمة الانتظار ✓"}
              </span>
            </div>
          </div>
          <button type="button" class="icon-button" onclick="document.getElementById('doctorInboxDeliveryModal').style.display='none'" style="font-size: 20px; border: none; background: none; cursor: pointer; color: var(--muted);">&times;</button>
        </div>

        <p style="font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 16px;">
          ${isEn
            ? "Your generated clinical report, vital metrics, and patient profile have been formatted according to clinical governance standards and placed into the attending physician's active review queue."
            : "تم تشكيل وتنسيق ملف المريض وتقرير التقييم السريري وقياسات الأكسجين وإرسالها مباشرة إلى صندوق وارد الطبيب المعالج للمراجعة والاعتماد السريري."}
        </p>

        <!-- Tracking Reference & Timestamp Bar -->
        <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 11px; color: var(--muted); display: block;">${isEn ? "Dispatch Tracking Reference:" : "الرقم المرجعي لتسليم التقرير:"}</span>
            <strong style="font-family: monospace; font-size: 13.5px; color: var(--ink);">${trackingRef}</strong>
          </div>
          <div style="text-align: ${isEn ? 'right' : 'left'};">
            <span style="font-size: 11px; color: var(--muted); display: block;">${isEn ? "Delivery Timestamp:" : "وقت وتاريخ التسليم:"}</span>
            <span style="font-size: 12px; font-weight: 600; color: var(--teal);">${dateFormatted}</span>
          </div>
        </div>

        <!-- Recipient Doctor Card -->
        <div style="background: rgba(14, 165, 164, 0.05); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
          <strong style="font-size: 12.5px; color: var(--teal); display: block; margin-bottom: 8px;">
            🩺 ${isEn ? "Recipient Attending Physician:" : "الطبيب المعالج المستلم (صندوق الوارد):"}
          </strong>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px;">
            <div>
              <strong style="color: var(--ink); font-size: 14px;">${safeEscape(doctor.name || (isEn ? "Assigned Pulmonologist" : "طبيب الرعاية المسند"))}</strong>
              <div style="color: var(--muted); font-size: 12px; margin-top: 2px;">${safeEscape(doctor.specialty || "Pulmonology & Respiratory Care")}</div>
            </div>
            <span class="pill pending" style="font-size: 11px;">${safeEscape(doctor.clinic || "Health Vibe Medical Center")}</span>
          </div>
        </div>

        <!-- Dispatched Payload Summary (Patient Profile & Assessment Metrics) -->
        <div style="border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
          <strong style="font-size: 12.5px; color: var(--ink); display: block; margin-bottom: 8px;">
            📑 ${isEn ? "Dispatched Payload Summary:" : "ملخص حزمة البيانات المرسلة للطبيب:"}
          </strong>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; font-size: 12px; margin-bottom: 10px;">
            <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
              <span style="color: var(--muted); display: block;">${isEn ? "Patient Name" : "اسم المريض"}</span>
              <strong style="color: var(--ink);">${safeEscape(patient.fullName || "Patient")}</strong>
            </div>
            <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
              <span style="color: var(--muted); display: block;">${isEn ? "Oxygen Saturation" : "نسبة الأكسجين SpO2"}</span>
              <strong style="color: #10b981; font-size: 13px;">${o2Val}%</strong>
            </div>
            <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
              <span style="color: var(--muted); display: block;">${isEn ? "Breathing Difficulty" : "ضيق التنفس"}</span>
              <strong style="color: var(--ink);">${safeEscape(metrics.breathingDifficulty || "--")}</strong>
            </div>
            <div style="background: var(--surface-2); padding: 8px 10px; border-radius: 8px;">
              <span style="color: var(--muted); display: block;">${isEn ? "Symptom Duration" : "مدة الأعراض"}</span>
              <strong style="color: var(--ink);">${safeEscape(metrics.symptomDuration || "--")}</strong>
            </div>
          </div>

          ${metrics.temperature ? `
            <div style="font-size: 11.5px; color: var(--muted); margin-bottom: 4px;">
              🌡️ ${isEn ? "Recorded Temperature:" : "درجة الحرارة المسجلة:"} <strong>${safeEscape(metrics.temperature)} ${safeEscape(metrics.temperatureUnit || '°C')}</strong>
              ${metrics.respiratoryRate ? ` • 🫁 ${isEn ? "Resp Rate:" : "معدل التنفس:"} <strong>${safeEscape(metrics.respiratoryRate)}</strong>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- 3-Stage Progress Tracker -->
        <div style="background: var(--surface-2); border-radius: 12px; padding: 12px 14px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; position: relative;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 1;">
              <div style="width: 22px; height: 22px; border-radius: 50%; background: #10b981; color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 800;">✓</div>
              <span style="font-size: 10.5px; font-weight: 700; color: var(--ink);">${isEn ? "1. Report Built" : "1. تجهيز التقرير"}</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 1;">
              <div style="width: 22px; height: 22px; border-radius: 50%; background: #10b981; color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 800;">✓</div>
              <span style="font-size: 10.5px; font-weight: 700; color: #10b981;">${isEn ? "2. In Doctor Inbox" : "2. بصندوق الوارد"}</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 1;">
              <div style="width: 22px; height: 22px; border-radius: 50%; background: #f59e0b; color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 800;">⏳</div>
              <span style="font-size: 10.5px; font-weight: 700; color: #d97706;">${isEn ? "3. Doctor Review" : "3. الفحص والاعتماد"}</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="outline-button" onclick="document.getElementById('doctorInboxDeliveryModal').style.display='none'" style="font-size: 13px; padding: 8px 18px;">
            ${isEn ? "Back to Medical Report" : "العودة للتقرير الطبي"}
          </button>
          <button type="button" class="solid-button" onclick="document.getElementById('doctorInboxDeliveryModal').style.display='none'; if(typeof showScreen==='function') showScreen('patient');" style="background: var(--teal); font-size: 13px; padding: 8px 18px;">
            <span>🏠</span> ${isEn ? "Patient Dashboard" : "لوحة متابعة الحالة"}
          </button>
        </div>

      </div>
    `;

    modal.style.display = "flex";
  }

  /**
   * Renders a live Doctor Inbox Delivery Status Badge / Banner for the report view.
   * Provides immediate visual feedback that the report is in the doctor's queue.
   * @param {object} caseData
   * @param {boolean} isEn
   * @returns {string}
   */
  function renderDoctorInboxDeliveryStatusBadge(caseData, isEn = false) {
    if (!caseData) return "";
    const delivery = (global.HealthVibes?.ReportsService?.getDoctorInboxDeliveryStatus)
      ? global.HealthVibes.ReportsService.getDoctorInboxDeliveryStatus(caseData.id, caseData)
      : (caseData.latestReportDispatch || (caseData.deliveryStatus === "delivered_to_doctor_inbox" ? caseData : null));

    if (!delivery) return "";

    const trackingRef = safeEscape(delivery.trackingRef || (caseData.doctorInboxDelivery?.trackingRef) || `HV-DISP-${caseData.id.slice(-6).toUpperCase()}`);
    const doctorName = safeEscape(delivery.recipientDoctor?.name || caseData.assignedDoctorName || caseData.approvingDoctorName || (isEn ? "Assigned Pulmonologist" : "طبيب الرعاية المعالج"));
    const dateFormatted = delivery.timestamp ? new Date(delivery.timestamp).toLocaleString(isEn ? "en-US" : "ar-EG") : "";

    return `
      <div class="doctor-inbox-delivery-banner no-print" style="margin-bottom: 20px; background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 14px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800;">
            ✓
          </div>
          <div>
            <strong style="color: #065f46; font-size: 14px; display: flex; align-items: center; gap: 6px;">
              <span>📨</span> ${isEn ? "Dispatched to Doctor Inbox — Delivered" : "تم تسليم التقرير بنجاح إلى صندوق وارد الطبيب المعالج"}
            </strong>
            <span style="font-size: 12.5px; color: var(--ink); display: block; margin-top: 2px;">
              ${isEn
                ? `Delivered to <strong>${doctorName}</strong> • Tracking Ref: <code style="font-family:monospace; background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:4px;">${trackingRef}</code>`
                : `تم التسليم إلى: <strong>${doctorName}</strong> • الرقم المرجعي: <code style="font-family:monospace; background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:4px;">${trackingRef}</code>`}
              ${dateFormatted ? ` • <small style="color:var(--muted);">${dateFormatted}</small>` : ''}
            </span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="pill ok" style="font-size: 11px;">
            ${isEn ? "In Review Queue" : "في قائمة انتظار الطبيب"}
          </span>
          <button type="button" class="soft-button" style="padding: 5px 12px; font-size: 12px;" onclick="if(window.HealthVibes?.ReportsUI?.openDoctorInboxDeliveryModal){window.HealthVibes.ReportsUI.openDoctorInboxDeliveryModal(window._currentViewingCase?.latestReportDispatch || {trackingRef:'${trackingRef}', caseId:'${caseData.id}'}, ${isEn});}">
            <span>ℹ️</span> ${isEn ? "View Delivery Details" : "تفاصيل التسليم"}
          </button>
        </div>
      </div>
    `;
  }

  const ReportsUI = {
    triggerPrintReport,
    exportReportToPdf,
    renderReportSecurityBadge,
    openShareReportModal,
    renderVerificationView,
    openDoctorInboxDeliveryModal,
    renderDoctorInboxDeliveryStatusBadge
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ReportsUI = ReportsUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReportsUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
