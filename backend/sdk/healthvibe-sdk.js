/**
 * Health Vibe AI - Official B2B Partner SDK (v1 Stable Client)
 * 
 * Provides:
 * - Scoped Partner Authentication via X-API-Key
 * - Automatic Exponential Backoff Retries on 429 & 5xx responses
 * - Concurrency-safe Clinical Booking & Cancellation
 * - Specialty & Doctor Marketplace Discovery
 * - Clinical & Service Complaint Ingestion
 * - Cryptographic HMAC-SHA256 Webhook Signature Verification (Anti-Replay)
 */

const crypto = require('crypto');

class HealthVibeApiError extends Error {
  constructor(message, { statusCode, errorCode, details = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'HealthVibeApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

class HealthVibeAuthError extends HealthVibeApiError {
  constructor(message, options = {}) {
    super(message, { ...options, statusCode: 401 });
    this.name = 'HealthVibeAuthError';
  }
}

class HealthVibeForbiddenError extends HealthVibeApiError {
  constructor(message, options = {}) {
    super(message, { ...options, statusCode: 403 });
    this.name = 'HealthVibeForbiddenError';
  }
}

class HealthVibeRateLimitError extends HealthVibeApiError {
  constructor(message, options = {}) {
    super(message, { ...options, statusCode: 429 });
    this.name = 'HealthVibeRateLimitError';
  }
}

class HealthVibePartnerClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - Partner API Key (format: hv_live_... or hv_test_...)
   * @param {string} options.baseUrl - Base URL of the Health Vibe API (e.g. https://api.healthvibe.ai or http://localhost:4000)
   * @param {number} [options.timeout=10000] - Request timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum retry attempts on transient network or 5xx/429 errors
   * @param {number} [options.initialRetryDelayMs=100] - Initial backoff delay for retries
   * @param {Function} [options.fetchImpl] - Custom fetch implementation (defaults to globalThis.fetch)
   */
  constructor({
    apiKey,
    baseUrl = 'http://localhost:4000',
    timeout = 10000,
    maxRetries = 3,
    initialRetryDelayMs = 100,
    fetchImpl = globalThis.fetch
  } = {}) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('HealthVibePartnerClient: apiKey is required and must be a string.');
    }

    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeout = timeout;
    this.maxRetries = Math.max(0, maxRetries);
    this.initialRetryDelayMs = initialRetryDelayMs;
    this.fetch = fetchImpl;
  }

  /**
   * Low-level HTTP request dispatcher with retry and error normalization
   */
  async request(method, path, { body = null, query = null, headers = {} } = {}) {
    let url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    if (query && typeof query === 'object') {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) searchParams.append(k, String(v));
      }
      const qs = searchParams.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    let attempt = 0;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const reqHeaders = {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...headers
        };

        const res = await this.fetch(url, {
          method,
          headers: reqHeaders,
          ...(body ? { body: JSON.stringify(body) } : {})
        });

        const contentType = res.headers.get('content-type') || '';
        const parsed = contentType.includes('application/json')
          ? await res.json().catch(() => null)
          : await res.text().catch(() => null);

        if (res.ok) {
          return parsed;
        }

        const errorCode = parsed?.error || `HTTP_${res.status}`;
        const errorMessage = parsed?.message || `Request failed with HTTP ${res.status}`;

        if (res.status === 401) {
          throw new HealthVibeAuthError(errorMessage, { errorCode, details: parsed });
        }
        if (res.status === 403) {
          throw new HealthVibeForbiddenError(errorMessage, { errorCode, details: parsed });
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after') || parsed?.retryAfter || 1;
          const rateErr = new HealthVibeRateLimitError(errorMessage, {
            errorCode,
            details: parsed,
            retryAfter: Number(retryAfter)
          });

          if (attempt <= this.maxRetries) {
            const delay = Math.max(100, Number(retryAfter) * 1000);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw rateErr;
        }

        // Retry on 5xx server errors
        if (res.status >= 500 && attempt <= this.maxRetries) {
          const backoff = this.initialRetryDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }

        throw new HealthVibeApiError(errorMessage, {
          statusCode: res.status,
          errorCode,
          details: parsed
        });
      } catch (err) {
        lastError = err;
        // If it's a known non-retryable API error (like 400, 401, 403, 409), rethrow immediately
        if (err instanceof HealthVibeAuthError || err instanceof HealthVibeForbiddenError) {
          throw err;
        }
        if (err instanceof HealthVibeApiError && err.statusCode < 500 && err.statusCode !== 429) {
          throw err;
        }

        if (attempt <= this.maxRetries) {
          const backoff = this.initialRetryDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after maximum retries');
  }

  // ---------------------------------------------------------------------------
  // 1. SPECIALTIES & DOCTOR MARKETPLACE DISCOVERY
  // ---------------------------------------------------------------------------

  /**
   * List standardized clinical specialties
   */
  async getSpecialties() {
    return this.request('GET', '/api/v1/marketplace/specialties');
  }

  /**
   * Search and filter verified doctors in the marketplace
   */
  async getDoctors(options = {}) {
    return this.request('GET', '/api/v1/marketplace/doctors', { query: options });
  }

  /**
   * Retrieve current clinical verification policy standards
   */
  async getVerificationPolicy() {
    return this.request('GET', '/api/v1/verification/policy');
  }

  // ---------------------------------------------------------------------------
  // 2. CLINICAL APPOINTMENT BOOKING & CANCELLATION
  // ---------------------------------------------------------------------------

  /**
   * Book a clinical appointment with anti-double-booking protection
   */
  async bookAppointment(appointmentData) {
    return this.request('POST', '/api/v1/appointments/book', { body: appointmentData });
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId, reason = 'Partner requested cancellation') {
    return this.request('POST', `/api/v1/appointments/${appointmentId}/cancel`, {
      body: { reason }
    });
  }

  /**
   * Retrieve appointment details by ID
   */
  async getAppointment(appointmentId) {
    return this.request('GET', `/api/v1/appointments/${appointmentId}`);
  }

  // ---------------------------------------------------------------------------
  // 3. COMPLAINTS & GRIEVANCE MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Submit a clinical or service complaint
   */
  async submitComplaint(complaintData) {
    return this.request('POST', '/api/v1/complaints/submit', { body: complaintData });
  }

  /**
   * Retrieve complaint status and resolution
   */
  async getComplaint(complaintId) {
    return this.request('GET', `/api/v1/complaints/${complaintId}`);
  }

  // ---------------------------------------------------------------------------
  // 4. SIGNED WEBHOOK SIGNATURE VERIFICATION (Static & Instance Method)
  // ---------------------------------------------------------------------------

  /**
   * Cryptographically verify an incoming Health Vibe webhook
   * Protects against replay attacks (5-minute timestamp tolerance) and timing attacks.
   * 
   * @param {string|Object} rawPayload - Raw JSON payload received
   * @param {string} signatureHeader - Value of X-HealthVibe-Signature header (t=...,v1=...)
   * @param {string} signingSecret - Partner webhook signing secret
   * @param {number} [toleranceSeconds=300] - Maximum allowable age of the webhook timestamp
   * @returns {{ valid: boolean, error?: string, timestamp?: number }}
   */
  static verifyWebhookSignature(rawPayload, signatureHeader, signingSecret, toleranceSeconds = 300) {
    if (!signatureHeader || !signingSecret) {
      return { valid: false, error: 'MISSING_SIGNATURE_OR_SECRET' };
    }

    const parts = signatureHeader.split(',').reduce((acc, part) => {
      const [k, v] = part.trim().split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});

    const timestamp = parseInt(parts.t, 10);
    const signature = parts.v1;

    if (isNaN(timestamp) || !signature) {
      return { valid: false, error: 'MALFORMED_SIGNATURE_HEADER' };
    }

    // Anti-Replay check
    const ageSeconds = Math.abs((Date.now() - timestamp) / 1000);
    if (ageSeconds > toleranceSeconds) {
      return { valid: false, error: 'SIGNATURE_TIMESTAMP_EXPIRED', ageSeconds };
    }

    const payloadString = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const expected = crypto
      .createHmac('sha256', signingSecret)
      .update(`${timestamp}.${payloadString}`)
      .digest('hex');

    try {
      const bufExpected = Buffer.from(expected, 'hex');
      const bufReceived = Buffer.from(signature, 'hex');

      if (bufExpected.length !== bufReceived.length) {
        return { valid: false, error: 'SIGNATURE_MISMATCH' };
      }

      const match = crypto.timingSafeEqual(bufExpected, bufReceived);
      return match
        ? { valid: true, timestamp }
        : { valid: false, error: 'SIGNATURE_MISMATCH' };
    } catch (e) {
      return { valid: false, error: 'VERIFICATION_EXCEPTION', details: e.message };
    }
  }

  verifyWebhookSignature(rawPayload, signatureHeader, signingSecret, toleranceSeconds = 300) {
    return HealthVibePartnerClient.verifyWebhookSignature(rawPayload, signatureHeader, signingSecret, toleranceSeconds);
  }
}

module.exports = {
  HealthVibePartnerClient,
  HealthVibeApiError,
  HealthVibeAuthError,
  HealthVibeForbiddenError,
  HealthVibeRateLimitError
};
