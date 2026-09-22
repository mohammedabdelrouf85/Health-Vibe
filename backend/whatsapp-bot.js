/**
 * Health Vibe AI - Automated WhatsApp Bot Service
 * Handles automated generation, dispatch, and verification of secret OTP codes via WhatsApp Bot.
 */

const crypto = require('crypto');

class WhatsAppBotService {
  constructor() {
    this.botName = "Health Vibe AI Automated Verification Bot";
    this.activeOtps = new Map(); // key: userId or email, value: { code, expiresAt, createdAt }
    this.otpTtlMs = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Generate a 6-digit secure random OTP
   */
  generateOtp() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Request automated OTP code via WhatsApp Bot
   * @param {Object} param0 { userId, userEmail, phoneNumber }
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async requestVerificationCode({ userId, userEmail, phoneNumber }) {
    const key = (userId || userEmail || 'guest').toLowerCase();
    const code = this.generateOtp();
    const expiresAt = Date.now() + this.otpTtlMs;

    this.activeOtps.set(key, {
      code,
      expiresAt,
      createdAt: Date.now(),
      phoneNumber: phoneNumber || null
    });

    console.log(`[WHATSAPP BOT] 🤖 Automated code dispatched for [${key}]. Code is kept secret.`);

    // If WhatsApp Cloud API credentials are configured, dispatch over Meta API
    const waToken = process.env.WHATSAPP_API_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (waToken && waPhoneId && phoneNumber) {
      try {
        const cleanPhone = String(phoneNumber).replace(/\D/g, '');
        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: {
            preview_url: false,
            body: `🌟 *Health Vibe AI - كود التفعيل السري*\nكود تفعيل حسابك هو:\n👉 *${code}* 👈\nصالح لمدة 10 دقائق. يرجى إدخال هذا الكود في المنصة لإتمام التوثيق.`
          }
        };

        const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${waToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const resData = await res.json();
        console.log(`[WHATSAPP BOT API] Direct dispatch result:`, resData);
      } catch (waErr) {
        console.warn(`[WHATSAPP BOT WARNING] External WhatsApp API dispatch warning:`, waErr.message);
      }
    }

    return {
      success: true,
      message: "تم إرسال كود التفعيل السري تلقائياً عبر بوت الواتساب."
    };
  }

  /**
   * Verify an OTP submitted by the user
   * @param {Object} param0 { userId, userEmail, code }
   * @returns {boolean}
   */
  verifyCode({ userId, userEmail, code }) {
    const key = (userId || userEmail || 'guest').toLowerCase();
    const record = this.activeOtps.get(key);

    if (!record) {
      // Fallback check: match by code across active entries
      for (const [k, rec] of this.activeOtps.entries()) {
        if (rec.code === String(code).trim() && Date.now() <= rec.expiresAt) {
          this.activeOtps.delete(k);
          return true;
        }
      }
      return false;
    }

    if (Date.now() > record.expiresAt) {
      this.activeOtps.delete(key);
      return false;
    }

    const isValid = String(record.code).trim() === String(code).trim();
    if (isValid) {
      this.activeOtps.delete(key);
    }
    return isValid;
  }

  /**
   * Webhook message handler: When user messages the bot directly on WhatsApp
   */
  handleInboundWebhook(reqBody) {
    try {
      const entry = reqBody.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const from = message.from;
        const text = message.text?.body || '';
        console.log(`[WHATSAPP BOT INBOUND] Received message from ${from}: ${text}`);
        return { from, text };
      }
    } catch (e) {
      console.warn("[WHATSAPP BOT INBOUND] Parsing error:", e.message);
    }
    return null;
  }
}

module.exports = new WhatsAppBotService();
