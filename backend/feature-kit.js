/**
 * Health Vibe AI - Shared Feature Kit
 *
 * Small shared building blocks used by the appointment / chatbot / files feature
 * services (tasks #641-#670): typed errors, role checks, PHI redaction,
 * an append-only audit trail and a usage-analytics recorder.
 */

'use strict';

const crypto = require('crypto');

const ADMIN_ROLES = ['super_admin', 'admin', 'clinic_admin'];
const DOCTOR_ROLES = ['doctor', 'specialist', 'pulmonologist'];

class FeatureError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message ? `[${code}] ${message}` : code);
    this.name = code;
    this.code = code;
    this.statusCode = statusCode;
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function isAdmin(user) {
  return !!user && (ADMIN_ROLES.includes(user.role) || user.isOwner === true);
}

function isDoctor(user) {
  return !!user && DOCTOR_ROLES.includes(user.role);
}

function requireUser(user) {
  if (!user || !user.uid) throw new FeatureError('UNAUTHENTICATED', 'Authentication required.', 401);
}

function requireAdmin(user) {
  requireUser(user);
  if (!isAdmin(user)) throw new FeatureError('FORBIDDEN', 'Administrator access required.', 403);
}

/** Patients may only act on their own records; admins may act on any. */
function requireSelfOrAdmin(user, patientId) {
  requireUser(user);
  if (user.uid !== patientId && !isAdmin(user)) {
    throw new FeatureError('FORBIDDEN', 'You can only access your own records.', 403);
  }
}

const PHONE_RE = /(\+?2?0?1[0125][\s-]?\d{3,4}[\s-]?\d{4})|(\+?\d[\d\s-]{8,}\d)/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const NATIONAL_ID_RE = /\b[23]\d{13}\b/g; // Egyptian 14-digit national ID

/** Removes direct identifiers (phones, emails, national IDs) from free text. */
function redactPII(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(NATIONAL_ID_RE, '[ID REDACTED]')
    .replace(EMAIL_RE, '[EMAIL REDACTED]')
    .replace(PHONE_RE, '[PHONE REDACTED]');
}

function sanitizeText(text, maxLen = 1000) {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
}

/** Append-only audit trail: entries are frozen and cannot be edited. */
function createAuditTrail(feature) {
  const entries = [];
  return {
    record(type, actor, details = {}) {
      const entry = Object.freeze({
        id: newId('aud'),
        feature,
        type,
        actorUid: actor?.uid || 'system',
        actorRole: actor?.role || 'system',
        details: Object.freeze({ ...details }),
        at: new Date().toISOString()
      });
      entries.push(entry);
      return entry;
    },
    list(filter = {}) {
      return entries.filter(e => (!filter.type || e.type === filter.type));
    },
    reset() { entries.length = 0; }
  };
}

/** Usage analytics recorder with success-rate helpers for admin dashboards. */
function createAnalytics(feature) {
  const events = [];
  return {
    track(name, props = {}) {
      events.push({ feature, name, props: { ...props }, at: Date.now() });
    },
    count(name) {
      return events.filter(e => e.name === name).length;
    },
    events(name) {
      return name ? events.filter(e => e.name === name) : events.slice();
    },
    rate(numerator, denominator) {
      const d = this.count(denominator);
      return d === 0 ? 0 : Math.round((this.count(numerator) / d) * 1000) / 10;
    },
    reset() { events.length = 0; }
  };
}

module.exports = {
  ADMIN_ROLES,
  DOCTOR_ROLES,
  FeatureError,
  newId,
  isAdmin,
  isDoctor,
  requireUser,
  requireAdmin,
  requireSelfOrAdmin,
  redactPII,
  sanitizeText,
  createAuditTrail,
  createAnalytics
};
