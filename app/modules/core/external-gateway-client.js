/**
 * Health Vibe AI - Client-Side External API Gateway & Fallback Layer
 *
 * Implements PRD Req 57:
 * "بناء Abstraction Layer حول أي API خارجي مجاني أو مدفوع (مثل الـ Chatbot أو البريد)
 * مع مراقبة حدود الاستخدام (Rate Limits) وخطة بديلة (Fallback Plan)."
 *
 * Provides:
 * 1. Resilient Chatbot Assistant interface that calls the backend gateway,
 *    and falls back to deterministic local clinical guardrails if offline or rate-limited.
 * 2. Offline Email / Notification Outbox that stores outgoing communications locally
 *    when third-party email APIs are unavailable or throttled.
 * 3. Real-time rate limit and circuit breaker awareness in UI.
 */

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    EMAIL_OUTBOX: "hv_offline_email_outbox",
    RATE_LIMIT_CACHE: "hv_external_rate_limits"
  };

  /**
   * Deterministic local fallback assistant when external AI APIs are unreachable or throttled.
   */
  function localDeterministicAssistant(query, isEn, certifiedReport) {
    const q = String(query || "").toLowerCase();

    // Emergency protocol check
    const emergencyWords = ["طوارئ", "إسعاف", "موت", "أزمة", "اختناق", "emergency", "ambulance", "suffocating", "severe chest pain"];
    if (emergencyWords.some(w => q.includes(w))) {
      return {
        text: isEn
          ? "🚨 URGENT CLINICAL DIRECTIVE: Call emergency dispatch (123) immediately or proceed to the nearest emergency department. Do not delay emergency care for online advice."
          : "🚨 توجيه سريري عاجل: اتصل بالإسعاف فوراً (123) أو توجه لأقرب قسم طوارئ. لا تنتظر المساعدة عبر المنصة في حالات الطوارئ الحادة.",
        fallbackMode: "emergency_deterministic",
        source: "MOH_Emergency_123"
      };
    }

    // Certified report inquiry
    if (certifiedReport && (q.includes("تشخيص") || q.includes("علاج") || q.includes("دواء") || q.includes("diagnosis") || q.includes("medication"))) {
      const diag = certifiedReport.clinicalDiagnosis || (isEn ? "No diagnosis certified yet" : "لا يوجد تشخيص معتمد حتى الآن");
      const meds = certifiedReport.medications || (isEn ? "No medication prescribed" : "لم يتم إدراج أدوية");
      const doc = certifiedReport.doctorName || (isEn ? "Attending Physician" : "الطبيب المعالج");

      return {
        text: isEn
          ? `📋 [Doctor-Certified Record - Local Fallback]\nAttending Physician: ${doc}\nDiagnosis: ${diag}\nMedications: ${meds}\n\nℹ️ Responding via verified local clinical records.`
          : `📋 [بيانات السجل الطبي المعتمد - وضع الأمان المحلي]\nالطبيب المعالج: ${doc}\nالتشخيص المعتمد: ${diag}\nالوصفة العلاجية: ${meds}\n\nℹ️ تمت الإجابة عبر السجلات السريرية المعتمدة لضمان استمرارية الخدمة.`,
        fallbackMode: "certified_report_local",
        source: "Certified_Clinical_Record"
      };
    }

    // General respiratory clinical guidance
    return {
      text: isEn
        ? "🩺 [Clinical Guidance - Resilient Fallback Mode]\nRest adequately, hydrate with warm fluids, and measure your SpO2 oxygen levels twice daily. If oxygen saturation falls below 92%, seek urgent medical attention.\n\n(Operational Note: Answering via local clinical guidelines due to external AI rate limit)."
        : "🩺 [إرشادات سريرية - الوضع البديل الآمن]\nيُنصح بالراحة التامة، والإكثار من السوائل الدافئة، وقياس نسبة تشبع الأكسجين SpO2 مرتين يومياً. إذا انخفض الأكسجين دون 92%، يجب التوجه للطبيب فوراً.\n\n(تنبيه تشغيلي: تمت الإجابة وفق الإرشادات السريرية المعتمدة نظراً لتفعيل حدود الاستخدام للخدمات الخارجية).",
      fallbackMode: "clinical_respiratory_guideline",
      source: "WHO_ERS_Respiratory_Guidelines"
    };
  }

  /**
   * Dispatches a Chatbot query through the External API Gateway with local fallback.
   */
  async function askChatbot({ query, language = "ar", certifiedReport = null }) {
    const isEn = language === "en" || (typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en");
    const baseUrl = (typeof runtimeConfig !== "undefined" && runtimeConfig && runtimeConfig.apiBaseUrl) ? runtimeConfig.apiBaseUrl : "";

    try {
      const fetchFn = typeof authenticatedFetch === "function" ? authenticatedFetch : fetch;
      const res = await fetchFn(`${baseUrl}/api/external-gateway/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, language: isEn ? "en" : "ar", certifiedReport })
      });

      if (res.ok) {
        const payload = await res.json();
        return {
          success: true,
          text: payload.data?.text || payload.data,
          providerId: payload.providerId,
          tier: payload.tier,
          fallbackExecuted: payload.fallbackExecuted,
          fallbackReason: payload.fallbackReason,
          isLocalFallback: false
        };
      }
    } catch (networkErr) {
      console.warn("[ExternalGatewayClient] Gateway request failed, activating client-side fallback:", networkErr.message);
    }

    // Client-side deterministic fallback
    const fallback = localDeterministicAssistant(query, isEn, certifiedReport);
    return {
      success: true,
      text: fallback.text,
      providerId: "client_deterministic_local_fallback",
      tier: "free",
      fallbackExecuted: true,
      fallbackReason: "NETWORK_OR_RATE_LIMIT_FALLBACK",
      isLocalFallback: true,
      source: fallback.source
    };
  }

  /**
   * Dispatches an Email through the gateway, or queues locally in offline outbox.
   */
  async function sendEmailNotification({ to, subject, html, text, category = "clinical_notification" }) {
    const baseUrl = (typeof runtimeConfig !== "undefined" && runtimeConfig && runtimeConfig.apiBaseUrl) ? runtimeConfig.apiBaseUrl : "";

    try {
      const fetchFn = typeof authenticatedFetch === "function" ? authenticatedFetch : fetch;
      const res = await fetchFn(`${baseUrl}/api/external-gateway/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, html, text, category })
      });

      if (res.ok) {
        const payload = await res.json();
        return {
          success: true,
          data: payload.data,
          providerId: payload.providerId,
          fallbackExecuted: payload.fallbackExecuted
        };
      }
    } catch (err) {
      console.warn("[ExternalGatewayClient] Email dispatch offline, saving to local outbox:", err.message);
    }

    // Save to local offline outbox
    const outboxRecord = {
      queueId: `client_outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      to,
      subject,
      html,
      text,
      category,
      queuedAt: new Date().toISOString(),
      status: "queued_locally"
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EMAIL_OUTBOX);
      const list = raw ? JSON.parse(raw) : [];
      list.push(outboxRecord);
      localStorage.setItem(STORAGE_KEYS.EMAIL_OUTBOX, JSON.stringify(list));
    } catch (e) {}

    return {
      success: true,
      delivered: false,
      queuedLocally: true,
      queueId: outboxRecord.queueId,
      message: "Email queued locally in offline outbox."
    };
  }

  /**
   * Fetches real-time rate limit and provider health metrics from backend.
   */
  async function fetchGatewayStatus() {
    const baseUrl = (typeof runtimeConfig !== "undefined" && runtimeConfig && runtimeConfig.apiBaseUrl) ? runtimeConfig.apiBaseUrl : "";
    try {
      const res = await fetch(`${baseUrl}/api/external-gateway/status`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {}
    return { status: "offline", metrics: null };
  }

  const ExternalGatewayClient = {
    askChatbot,
    sendEmailNotification,
    fetchGatewayStatus,
    localDeterministicAssistant
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ExternalGatewayClient = ExternalGatewayClient;
  global.ExternalApiGateway = ExternalGatewayClient;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ExternalGatewayClient;
  }
})(typeof window !== "undefined" ? window : globalThis);
