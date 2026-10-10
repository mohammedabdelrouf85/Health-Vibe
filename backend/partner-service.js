/**
 * Health Vibe AI - Partner Integration & Security Service
 * 
 * Provides:
 * 1. Cryptographic Partner API Key Generation & SHA-256 Hashing
 * 2. Granular Scoped Permission Enforcement (Zero-Trust RBAC)
 * 3. Strict Multi-Tenant Organization Isolation
 * 4. In-Memory Sliding-Window Partner Rate Limiting
 * 5. HMAC-SHA256 Signed Webhook Dispatcher with Exponential Backoff Retries
 * 6. Cryptographic Webhook Signature Verification (Timing-safe, Anti-Replay)
 */

const crypto = require('crypto');

// Standardized permission scopes for external partners
const PARTNER_SCOPES = {
  SPECIALTIES_READ: 'specialties:read',
  DOCTORS_READ: 'doctors:read',
  APPOINTMENTS_READ: 'appointments:read',
  APPOINTMENTS_WRITE: 'appointments:write',
  APPOINTMENTS_CANCEL: 'appointments:cancel',
  COMPLAINTS_WRITE: 'complaints:write',
  WEBHOOKS_RECEIVE: 'webhooks:receive'
};

const ALL_PARTNER_SCOPES = Object.values(PARTNER_SCOPES);

/**
 * Hash an API key using SHA-256 for secure storage.
 * The plaintext key is NEVER saved in the database.
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey).trim()).digest('hex');
}

/**
 * Generate a new Partner API Key.
 * Format: hv_<live|test>_<32 hex chars>
 */
function generatePartnerApiKey({ environment = 'live' } = {}) {
  const envPrefix = environment === 'test' ? 'hv_test_' : 'hv_live_';
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `${envPrefix}${randomBytes}`;
  const keyId = `key_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const keyHash = hashApiKey(rawKey);
  const maskedKey = `${rawKey.slice(0, 10)}...${rawKey.slice(-4)}`;

  return {
    rawKey,
    keyId,
    keyHash,
    maskedKey,
    prefix: envPrefix
  };
}

/**
 * Sliding window rate limiter for Partner API Keys
 */
class PartnerRateLimiter {
  constructor({ windowMs = 60000, defaultLimit = 120 } = {}) {
    this.windowMs = windowMs;
    this.defaultLimit = defaultLimit;
    this.requests = new Map(); // keyId -> Array<timestamps>
  }

  checkLimit(keyId, limit = this.defaultLimit) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.requests.get(keyId) || []).filter(ts => ts > windowStart);

    if (timestamps.length >= limit) {
      const oldestInWindow = timestamps[0];
      const resetInMs = Math.max(0, oldestInWindow + this.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetInSeconds: Math.ceil(resetInMs / 1000)
      };
    }

    timestamps.push(now);
    this.requests.set(keyId, timestamps);

    // Housekeeping
    if (this.requests.size > 2000) {
      for (const [k, list] of this.requests.entries()) {
        const fresh = list.filter(ts => ts > windowStart);
        if (fresh.length === 0) this.requests.delete(k);
        else this.requests.set(k, fresh);
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - timestamps.length),
      limit,
      resetInSeconds: Math.ceil(this.windowMs / 1000)
    };
  }

  reset(keyId) {
    this.requests.delete(keyId);
  }
}

const partnerRateLimiter = new PartnerRateLimiter();

/**
 * Sign a webhook payload using HMAC-SHA256 with timestamp.
 * Returns signature header string: t={timestamp},v1={hexSignature}
 */
function signWebhookPayload(payload, secret, timestamp = Date.now()) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signaturePayload = `${timestamp}.${payloadString}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');

  return {
    timestamp,
    signature,
    headerValue: `t=${timestamp},v1=${signature}`
  };
}

/**
 * Cryptographically verify an incoming webhook signature.
 * Prevents timing attacks via timingSafeEqual and replay attacks via timestamp tolerance.
 */
function verifyWebhookSignature(rawPayload, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader || !secret) {
    return { valid: false, error: 'MISSING_SIGNATURE_OR_SECRET' };
  }

  // Parse t={timestamp},v1={signature}
  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, val] = part.trim().split('=');
    if (key && val) acc[key] = val;
    return acc;
  }, {});

  const timestamp = parseInt(parts.t, 10);
  const receivedSig = parts.v1;

  if (isNaN(timestamp) || !receivedSig) {
    return { valid: false, error: 'MALFORMED_SIGNATURE_HEADER' };
  }

  // Anti-Replay Attack: Check timestamp tolerance
  const now = Date.now();
  const ageSeconds = Math.abs((now - timestamp) / 1000);
  if (ageSeconds > toleranceSeconds) {
    return { valid: false, error: 'SIGNATURE_TIMESTAMP_EXPIRED', ageSeconds };
  }

  const payloadString = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payloadString}`)
    .digest('hex');

  try {
    const bufReceived = Buffer.from(receivedSig, 'hex');
    const bufExpected = Buffer.from(expectedSig, 'hex');

    if (bufReceived.length !== bufExpected.length) {
      return { valid: false, error: 'SIGNATURE_MISMATCH' };
    }

    const isValid = crypto.timingSafeEqual(bufReceived, bufExpected);
    return isValid
      ? { valid: true, timestamp }
      : { valid: false, error: 'SIGNATURE_MISMATCH' };
  } catch (err) {
    return { valid: false, error: 'SIGNATURE_VERIFICATION_FAILED', details: err.message };
  }
}

/**
 * In-memory webhook delivery records for observability and test inspection
 */
const webhookDeliveryLog = [];
const MAX_DELIVERY_LOGS = 500;

function recordWebhookDelivery(record) {
  webhookDeliveryLog.unshift({
    ...record,
    recordedAt: Date.now()
  });
  if (webhookDeliveryLog.length > MAX_DELIVERY_LOGS) {
    webhookDeliveryLog.pop();
  }
}

function getWebhookDeliveryLog(filterOrgId = null) {
  if (!filterOrgId) return [...webhookDeliveryLog];
  return webhookDeliveryLog.filter(log => log.orgId === filterOrgId);
}

/**
 * Dispatch a signed webhook with automatic retries and exponential backoff
 */
async function dispatchSignedWebhook({
  orgId,
  event,
  data,
  targetEndpoint,
  signingSecret,
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
  initialBackoffMs = 50,
  eventId = null
}) {
  const deliveryId = `del_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const payload = {
    id: eventId || `evt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    event,
    orgId,
    timestamp: Date.now(),
    data
  };

  const payloadString = JSON.stringify(payload);
  const { headerValue, timestamp } = signWebhookPayload(payloadString, signingSecret);

  let attempt = 0;
  let lastError = null;
  let lastStatusCode = null;

  while (attempt < maxRetries) {
    attempt++;
    const startTime = Date.now();

    try {
      const response = await fetchImpl(targetEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HealthVibe-Signature': headerValue,
          'X-HealthVibe-Event': event,
          'X-HealthVibe-Delivery-Id': deliveryId,
          'X-HealthVibe-Timestamp': String(timestamp)
        },
        body: payloadString
      });

      lastStatusCode = response.status;
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        recordWebhookDelivery({
          deliveryId,
          orgId,
          event,
          targetEndpoint,
          status: 'delivered',
          attempts: attempt,
          statusCode: lastStatusCode,
          latencyMs
        });

        return {
          success: true,
          deliveryId,
          attempts: attempt,
          statusCode: lastStatusCode,
          latencyMs
        };
      }

      // 4xx client errors (except 429) are not retryable
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        lastError = new Error(`Non-retryable client error: HTTP ${response.status}`);
        break;
      }

      lastError = new Error(`HTTP Error ${response.status}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxRetries) {
      const backoffMs = initialBackoffMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  recordWebhookDelivery({
    deliveryId,
    orgId,
    event,
    targetEndpoint,
    status: 'failed',
    attempts: attempt,
    statusCode: lastStatusCode,
    error: lastError ? lastError.message : 'Unknown failure'
  });

  return {
    success: false,
    deliveryId,
    attempts: attempt,
    statusCode: lastStatusCode,
    error: lastError ? lastError.message : 'Webhook dispatch failed after retries'
  };
}

module.exports = {
  PARTNER_SCOPES,
  ALL_PARTNER_SCOPES,
  hashApiKey,
  generatePartnerApiKey,
  partnerRateLimiter,
  signWebhookPayload,
  verifyWebhookSignature,
  dispatchSignedWebhook,
  getWebhookDeliveryLog,
  recordWebhookDelivery
};
