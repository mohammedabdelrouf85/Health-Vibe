/**
 * Health Vibe AI - Enterprise Multi-Factor Authentication (MFA) Engine
 * 
 * Compliant with:
 * - RFC 6238 (TOTP: Time-Based One-Time Password Algorithm)
 * - RFC 4648 (Base32 Alphabet)
 * - HIPAA § 164.312(a)(2)(i) Unique User Identification & Secondary Factor Verification
 * 
 * Zero-Vendor Lock-in Architecture:
 * Functions reliably on any Firebase tier (Free/Spark or Paid/Blaze) without Google Cloud
 * Identity Platform phone quota limits, third-party SMS billing, or carrier drops.
 * Supports Google Authenticator, Microsoft Authenticator, 1Password, and single-use emergency backup codes.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const MFA_TICKET_TTL_SECONDS = 600; // 10 minutes ticket validity for sensitive operations
const AUDIT_SALT = process.env.AUDIT_SALT || 'health-vibes-mfa-integrity-salt-2026';

// In-memory MFA store (mirrors and caches Firestore user_mfa collection)
const mfaRegistry = new Map(); // userId -> { enabled, secret, backupCodes: [{ hash, used, usedAt }], enrolledAt }

/**
 * Encode a buffer to RFC 4648 Base32 string
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode RFC 4648 Base32 string to Buffer
 */
function base32Decode(base32Str) {
  const cleanStr = String(base32Str || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanStr[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random 160-bit Base32 secret for TOTP (20 bytes = 32 base32 chars)
 */
function generateTotpSecret() {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

/**
 * Generate RFC 6238 TOTP 6-digit code for a given timestamp and secret
 */
function generateTotp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const secretBuffer = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

/**
 * Verify a 6-digit code against a secret with window drift tolerance (±1 step = 30s)
 */
function verifyTotp(token, secret, window = 1) {
  if (!token || !secret) return false;
  const cleanToken = String(token).trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;

  const now = Date.now();
  for (let errorStep = -window; errorStep <= window; errorStep++) {
    const checkTime = now + (errorStep * TOTP_STEP_SECONDS * 1000);
    const expected = generateTotp(secret, checkTime);
    if (expected === cleanToken) {
      return true;
    }
  }

  return false;
}

/**
 * Generate standard otpauth URI for QR codes and authenticator apps
 */
function generateOtpAuthUri({ email, secret, issuer = 'Health Vibe AI' }) {
  const cleanEmail = encodeURIComponent(String(email || 'user').trim());
  const cleanIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

/**
 * Hash a backup recovery code using salted HMAC-SHA256
 */
function hashBackupCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHmac('sha256', AUDIT_SALT).update(normalized).digest('hex');
}

/**
 * Generate a set of 8 cryptographically secure single-use recovery backup codes
 */
function generateBackupCodes(count = 8) {
  const codes = [];
  const hashedRecords = [];

  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.substring(0, 4)}-${raw.substring(4, 8)}`;
    codes.push(formatted);
    hashedRecords.push({
      hash: hashBackupCode(formatted),
      used: false,
      usedAt: null
    });
  }

  return { plainCodes: codes, hashedRecords };
}

/**
 * Issue a cryptographically signed MFA Verification Ticket
 */
function issueMfaTicket(userId) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${userId}:${issuedAt}:${nonce}`;
  const signature = crypto.createHmac('sha256', AUDIT_SALT).update(payload).digest('hex').substring(0, 32);
  return `mfa_ticket_${Buffer.from(payload).toString('base64url')}_${signature}`;
}

/**
 * Verify an MFA Verification Ticket
 */
function verifyMfaTicket(ticket, userId) {
  if (!ticket || typeof ticket !== 'string' || !ticket.startsWith('mfa_ticket_')) {
    return false;
  }

  const parts = ticket.split('_');
  if (parts.length !== 4) return false;

  const encodedPayload = parts[2];
  const signature = parts[3];

  let payload = '';
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch (_) {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', AUDIT_SALT).update(payload).digest('hex').substring(0, 32);
  if (expectedSignature !== signature) {
    return false;
  }

  const [ticketUid, issuedAtStr] = payload.split(':');
  if (ticketUid !== userId) {
    return false;
  }

  const issuedAt = parseInt(issuedAtStr, 10);
  if (isNaN(issuedAt)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - issuedAt > MFA_TICKET_TTL_SECONDS) {
    return false; // Expired
  }

  return true;
}

/**
 * Get MFA record for a user
 */
function getUserMfaRecord(userId) {
  return mfaRegistry.get(userId) || null;
}

/**
 * Set MFA record in memory
 */
function setUserMfaRecord(userId, record) {
  mfaRegistry.set(userId, record);
}

/**
 * Check if MFA is enabled for a user
 */
function isMfaEnabled(userId) {
  const rec = getUserMfaRecord(userId);
  return Boolean(rec && rec.enabled);
}

/**
 * Verify and consume a single-use backup code
 */
function consumeBackupCode(userId, code) {
  const rec = getUserMfaRecord(userId);
  if (!rec || !rec.enabled || !Array.isArray(rec.backupCodes)) {
    return false;
  }

  const codeHash = hashBackupCode(code);
  const target = rec.backupCodes.find(b => b.hash === codeHash && !b.used);
  if (!target) {
    return false;
  }

  target.used = true;
  target.usedAt = new Date().toISOString();
  setUserMfaRecord(userId, rec);
  return true;
}

module.exports = {
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  generateOtpAuthUri,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
  issueMfaTicket,
  verifyMfaTicket,
  getUserMfaRecord,
  setUserMfaRecord,
  isMfaEnabled,
  mfaRegistry,
  MFA_TICKET_TTL_SECONDS
};
