/**
 * Health Vibe AI - Automated WhatsApp Bot Service
 * Handles automated generation, dispatch, and verification of secret OTP codes via WhatsApp Bot.
 */

const crypto = require('crypto');

class WhatsAppBotService {
  constructor() {
    this.botName = "Health Vibe AI Automated Verification Bot";
    this.activeOtps = new Map(); // key: userId or email, value: { codeHash, expiresAt, createdAt, phoneNumber, attempts }
    this.otpTtlMs = 5 * 60 * 1000; // 5 minutes
    this.requestCooldownMs = 45 * 1000;
    this.maxVerifyAttempts = 5;
  }

  /**
   * Generate a 6-digit secure random OTP
   */
  generateOtp() {
    return crypto.randomInt(100000, 999999).toString();
  }

  normalizePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return null;
    }
    return digits;
  }

  hashOtp({ key, code, phoneNumber }) {
    const secret = process.env.OTP_HASH_SECRET || process.env.SESSION_SECRET || 'health-vibe-local-otp-secret';
    return crypto
      .createHmac('sha256', secret)
      .update(`${key}:${phoneNumber}:${String(code).trim()}`)
      .digest('hex');
  }

  cleanupExpiredOtps() {
    const now = Date.now();
    for (const [key, record] of this.activeOtps.entries()) {
      if (!record || now > record.expiresAt) {
        this.activeOtps.delete(key);
      }
    }
  }

  /**
   * Request automated OTP code via WhatsApp Bot
   * @param {Object} param0 { userId, userEmail, phoneNumber }
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async requestVerificationCode({ userId, userEmail, phoneNumber }) {
    this.cleanupExpiredOtps();
    const key = (userId || userEmail || 'guest').toLowerCase();
    const cleanPhone = this.normalizePhoneNumber(phoneNumber);
    if (!cleanPhone) {
      const err = new Error('A valid WhatsApp phone number with country code is required.');
      err.statusCode = 400;
      err.code = 'PHONE_REQUIRED';
      throw err;
    }

    const existing = this.activeOtps.get(key);
    if (existing && Date.now() - existing.createdAt < this.requestCooldownMs) {
      const waitSeconds = Math.ceil((this.requestCooldownMs - (Date.now() - existing.createdAt)) / 1000);
      const err = new Error(`Please wait ${waitSeconds}s before requesting a new code.`);
      err.statusCode = 429;
      err.code = 'OTP_RATE_LIMITED';
      err.retryAfterSeconds = waitSeconds;
      throw err;
    }

    const code = this.generateOtp();
    const expiresAt = Date.now() + this.otpTtlMs;
    const codeHash = this.hashOtp({ key, code, phoneNumber: cleanPhone });

    this.activeOtps.set(key, {
      codeHash,
      expiresAt,
      createdAt: Date.now(),
      attempts: 0,
      phoneNumber: cleanPhone
    });

    console.log(`[WHATSAPP BOT] Automated OTP dispatched for [${key}] to phone ending ${cleanPhone.slice(-4)}.`);

    // If WhatsApp Cloud API credentials are configured, dispatch over Meta API
    const waToken = process.env.WHATSAPP_API_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!waToken || !waPhoneId) {
      this.activeOtps.delete(key);
      const err = new Error('WhatsApp Bot is not configured. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
      err.statusCode = 503;
      err.code = 'BOT_NOT_CONFIGURED';
      throw err;
    }

    try {
      const imageUrl = process.env.WHATSAPP_BOT_IMAGE_URL;
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: imageUrl ? "image" : "text",
        ...(imageUrl
          ? {
              image: {
                link: imageUrl,
                caption: `Health Vibe verification code: ${code}\nValid for 5 minutes. Do not share this code with anyone.`
              }
            }
          : {
              text: {
                preview_url: false,
                body: `Health Vibe verification code: ${code}\nValid for 5 minutes. Do not share this code with anyone.`
              }
            })
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error?.message || `WhatsApp API returned ${res.status}`);
      }
      console.log(`[WHATSAPP BOT API] Direct dispatch accepted.`);
    } catch (waErr) {
      console.warn(`[WHATSAPP BOT WARNING] External WhatsApp API dispatch warning:`, waErr.message);
      this.activeOtps.delete(key);
      throw waErr;
    }

    return {
      success: true,
      expiresInSeconds: Math.floor(this.otpTtlMs / 1000),
      message: "تم إرسال كود التفعيل السري عبر بوت الواتساب."
    };
  }

  /**
   * Verify an OTP submitted by the user
   * @param {Object} param0 { userId, userEmail, code }
   * @returns {boolean}
   */
  verifyCode({ userId, userEmail, code, phoneNumber }) {
    const key = (userId || userEmail || 'guest').toLowerCase();
    const cleanPhone = this.normalizePhoneNumber(phoneNumber);
    const record = this.activeOtps.get(key);

    if (!record) {
      return false;
    }

    if (Date.now() > record.expiresAt) {
      this.activeOtps.delete(key);
      return false;
    }

    if (!cleanPhone || cleanPhone !== record.phoneNumber) {
      return false;
    }

    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > this.maxVerifyAttempts) {
      this.activeOtps.delete(key);
      return false;
    }

    const submittedHash = this.hashOtp({ key, code, phoneNumber: cleanPhone });
    const isValid = crypto.timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(submittedHash));
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
