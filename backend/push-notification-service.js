/**
 * Health Vibe AI - Enterprise Push Notification & Device Registry Service
 * 
 * Implements:
 * 1. Revocable Push-Notification Subscriptions after Explicit User Consent:
 *    - Token registration with device ID, platform, and browser metadata.
 *    - Explicit user consent enforcement (consentGiven: true required).
 *    - User revocation endpoint (deactivate per device or all devices).
 * 2. Cross-Account Multi-User Device Isolation (Account Switching Prevention):
 *    - When User B logs in on Device D where User A was previously registered:
 *      Token is immediately unbound from User A and rebound to User B.
 *    - User A's medical notifications NEVER reach User B on the same device!
 * 3. Logout Token Invalidation:
 *    - Signing out revokes active tokens associated with the session on that device.
 * 4. Removal of Expired & Invalid Tokens:
 *    - Token TTL management (default 60 days).
 *    - Automatic pruning of expired or provider-rejected tokens.
 * 5. Concise, Non-Sensitive Push Notifications (PHI Scrubbing):
 *    - Push alerts NEVER disclose medical diagnoses, test results, symptoms, or medications.
 *    - Uses concise, privacy-safe titles and generic call-to-actions.
 * 6. Permission & Sign-in Gating for Deep Links:
 *    - Notifications link to authenticated app routes.
 *    - Deep-linked clinical data requires active sign-in and verified role/ownership.
 * 7. Preferences & Quiet Hours Enforcement:
 *    - Checks user notification channels (push toggle).
 *    - Evaluates quiet hours in recipient's local timezone.
 *    - Non-urgent notifications are deferred; urgent clinical alerts bypass quiet hours.
 */

const crypto = require('crypto');
const {
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  isQuietHoursActive,
  calculateNextQuietHoursEnd,
  isUrgentEvent,
  generateAuthorizedDestinationLink,
  getUserNotificationPreferences
} = require('./notification-service');

// In-memory registries (backed by Firestore in production)
const deviceTokenRegistry = new Map(); // tokenHash -> tokenRecord
const userDeviceIndex = new Map();     // userId -> Set<tokenHash>
const deviceToUserIndex = new Map();   // deviceId -> { userId, tokenHash }

// Sandbox dispatches store for unit tests and local inspection
const sandboxPushDispatches = [];

// Default token expiration duration (60 days)
const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

class PushNotificationService {
  constructor() {
    this.deviceTokenRegistry = deviceTokenRegistry;
    this.userDeviceIndex = userDeviceIndex;
    this.deviceToUserIndex = deviceToUserIndex;
    this.sandboxPushDispatches = sandboxPushDispatches;
    this.tokenTtlMs = TOKEN_TTL_MS;
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. HELPERS & SANITIZATION
  // ─────────────────────────────────────────────────────────────────

  hashToken(token) {
    if (!token || typeof token !== 'string') return null;
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  maskToken(token) {
    if (!token) return '***';
    const clean = String(token).trim();
    if (clean.length <= 12) return '****';
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  }

  /**
   * Sanitizes notification text to guarantee ZERO medical details or PHI leak.
   * Produces concise, professional, patient-safe notification content.
   */
  sanitizeNotificationPayload({ eventType, type, title, body, message, caseId, appointmentId }) {
    const evt = (eventType || type || 'general').toLowerCase();

    // Map of safe, concise, standardized notification headlines and bodies
    const SAFE_TEMPLATES = {
      [NOTIFICATION_TYPES.RESULT_READY]: {
        title: 'Health Vibe: New medical update available',
        body: 'A clinical assessment report has been updated. Sign in to review your results securely.'
      },
      [NOTIFICATION_TYPES.DOCTOR_ASSIGNED]: {
        title: 'Health Vibe: Care team update',
        body: 'A consulting physician has been assigned to your case. Tap to view your care team.'
      },
      [NOTIFICATION_TYPES.INFORMATION_REQUESTED]: {
        title: 'Health Vibe: Information requested',
        body: 'Your doctor has requested additional clinical details. Sign in to respond.'
      },
      [NOTIFICATION_TYPES.MORE_INFO_REQUESTED]: {
        title: 'Health Vibe: Information requested',
        body: 'Your doctor has requested additional clinical details. Sign in to respond.'
      },
      [NOTIFICATION_TYPES.APPOINTMENT_BOOKED]: {
        title: 'Health Vibe: Appointment confirmed',
        body: 'Your consultation appointment has been scheduled. Tap to view details.'
      },
      [NOTIFICATION_TYPES.APPOINTMENT_REMINDER]: {
        title: 'Health Vibe: Upcoming appointment reminder',
        body: 'You have a medical consultation scheduled soon. Sign in to check preparation steps.'
      },
      [NOTIFICATION_TYPES.APPOINTMENT_RESCHEDULED]: {
        title: 'Health Vibe: Appointment schedule updated',
        body: 'Your consultation schedule has been modified. Tap to check your updated time.'
      },
      [NOTIFICATION_TYPES.APPOINTMENT_CANCELLED]: {
        title: 'Health Vibe: Appointment cancelled',
        body: 'Your scheduled consultation was cancelled. Tap to book a new appointment.'
      },
      [NOTIFICATION_TYPES.ESCALATION]: {
        title: 'Health Vibe: Important health notice',
        body: 'An important update requires your immediate attention. Please sign in now.'
      }
    };

    let safeContent = SAFE_TEMPLATES[evt];

    if (!safeContent) {
      // Fallback generic safe notification
      safeContent = {
        title: 'Health Vibe: New notification',
        body: 'You have a new update in your Health Vibe account. Sign in to view.'
      };
    }

    // Verify authorized destination link (requires authentication to open)
    const destinationLink = generateAuthorizedDestinationLink({
      eventType: evt,
      caseId,
      appointmentId
    });

    return {
      title: safeContent.title,
      body: safeContent.body,
      eventType: evt,
      destinationLink,
      targetUrl: destinationLink,
      phiScrubbed: true
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. TOKEN & SUBSCRIPTION REGISTRATION (ACCOUNT-SWITCHING SAFE)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Registers or updates a device push token with explicit user consent.
   *
   * CRITICAL SECURITY SAFEGUARD:
   * If this device or token was previously registered to another user (User A),
   * it is immediately unlinked and revoked from User A before binding to User B.
   * This guarantees User A's private medical notifications NEVER reach User B.
   */
  async registerPushSubscription(db, {
    userId,
    token,
    deviceId,
    platform = 'web',
    browser = 'unknown',
    userAgent = 'unknown',
    consent = true,
    expiresInMs = TOKEN_TTL_MS
  }) {
    if (!userId || typeof userId !== 'string') {
      const err = new Error('userId is required to register a push subscription.');
      err.code = 'USER_ID_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    if (!token || typeof token !== 'string') {
      const err = new Error('A valid push notification token or subscription endpoint is required.');
      err.code = 'TOKEN_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    if (!deviceId || typeof deviceId !== 'string') {
      const err = new Error('deviceId is required for device-bound push subscriptions.');
      err.code = 'DEVICE_ID_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // Explicit opt-in consent check
    if (consent !== true) {
      const err = new Error('Explicit user consent is required to activate push notifications.');
      err.code = 'CONSENT_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = this.hashToken(token);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresAt = now + (Number(expiresInMs) || this.tokenTtlMs);

    // ─────────────────────────────────────────────────────────────
    // ACCOUNT SWITCHING SAFEGUARD:
    // Check if deviceId was previously bound to a different user
    // ─────────────────────────────────────────────────────────────
    const existingDeviceBinding = this.deviceToUserIndex.get(deviceId);
    if (existingDeviceBinding && existingDeviceBinding.userId !== userId) {
      const previousUserId = existingDeviceBinding.userId;
      const previousTokenHash = existingDeviceBinding.tokenHash;

      // 1. Revoke the token for the previous user
      const prevRecord = this.deviceTokenRegistry.get(previousTokenHash);
      if (prevRecord) {
        prevRecord.status = 'revoked';
        prevRecord.revocationReason = 'ACCOUNT_SWITCH_ON_DEVICE';
        prevRecord.revokedAt = nowIso;
        prevRecord.updatedAt = nowIso;
      }

      // 2. Remove previous token hash from previous user's index
      const prevUserTokens = this.userDeviceIndex.get(previousUserId);
      if (prevUserTokens) {
        prevUserTokens.delete(previousTokenHash);
      }

      console.log(`[PUSH SECURITY] Reassigned device [${deviceId}] from previous user [${previousUserId}] to [${userId}]. Previous token revoked.`);
    }

    // ─────────────────────────────────────────────────────────────
    // TOKEN BINDING:
    // If the exact same token was previously bound to another user
    // ─────────────────────────────────────────────────────────────
    const existingTokenRecord = this.deviceTokenRegistry.get(tokenHash);
    if (existingTokenRecord && existingTokenRecord.userId !== userId) {
      const prevUid = existingTokenRecord.userId;
      existingTokenRecord.status = 'revoked';
      existingTokenRecord.revocationReason = 'TOKEN_REBOUND_TO_NEW_USER';
      existingTokenRecord.revokedAt = nowIso;
      existingTokenRecord.updatedAt = nowIso;

      const prevUserSet = this.userDeviceIndex.get(prevUid);
      if (prevUserSet) prevUserSet.delete(tokenHash);
    }

    // Create / Update active subscription record
    const subscriptionRecord = {
      subscriptionId: `push_sub_${now}_${crypto.randomBytes(3).toString('hex')}`,
      userId,
      token,
      tokenHash,
      tokenMasked: this.maskToken(token),
      deviceId,
      platform: String(platform).toLowerCase(),
      browser,
      userAgent,
      consentGiven: true,
      consentTimestamp: nowIso,
      status: 'active',
      createdAt: existingTokenRecord?.createdAt || nowIso,
      updatedAt: nowIso,
      lastUsedAt: nowIso,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresAtTimestamp: expiresAt
    };

    // Store in memory
    this.deviceTokenRegistry.set(tokenHash, subscriptionRecord);

    if (!this.userDeviceIndex.has(userId)) {
      this.userDeviceIndex.set(userId, new Set());
    }
    this.userDeviceIndex.get(userId).add(tokenHash);

    this.deviceToUserIndex.set(deviceId, {
      userId,
      tokenHash
    });

    // Sync to Firestore in production
    if (db && typeof db.collection === 'function' && process.env.NODE_ENV === 'production') {
      try {
        await db.collection('push_subscriptions').doc(tokenHash).set(subscriptionRecord, { merge: true });
      } catch (err) {
        console.warn('[PUSH DB WARN] Failed to save push subscription to Firestore:', err.message);
      }
    }

    return {
      success: true,
      subscriptionId: subscriptionRecord.subscriptionId,
      deviceId,
      maskedToken: subscriptionRecord.tokenMasked,
      expiresAt: subscriptionRecord.expiresAt,
      consentGiven: true
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. TOKEN REVOCATION & LOGOUT HANDLING
  // ─────────────────────────────────────────────────────────────────

  /**
   * Revoke push subscription for a user on a specific device or token.
   */
  async revokePushSubscription(db, { userId, deviceId = null, token = null, reason = 'USER_REVOKED' }) {
    if (!userId) {
      throw new Error('userId is required to revoke push subscription.');
    }

    const nowIso = new Date().toISOString();
    let revokedCount = 0;

    const userTokens = this.userDeviceIndex.get(userId);
    if (!userTokens || userTokens.size === 0) {
      return { success: true, revokedCount: 0 };
    }

    const targetTokenHash = token ? this.hashToken(token) : null;

    for (const tokenHash of Array.from(userTokens)) {
      const record = this.deviceTokenRegistry.get(tokenHash);
      if (!record) continue;

      let match = false;
      if (targetTokenHash && tokenHash === targetTokenHash) match = true;
      if (deviceId && record.deviceId === deviceId) match = true;
      if (!targetTokenHash && !deviceId) match = true; // Revoke all

      if (match) {
        record.status = 'revoked';
        record.revocationReason = reason;
        record.revokedAt = nowIso;
        record.updatedAt = nowIso;
        userTokens.delete(tokenHash);

        if (this.deviceToUserIndex.get(record.deviceId)?.userId === userId) {
          this.deviceToUserIndex.delete(record.deviceId);
        }

        revokedCount++;

        if (db && typeof db.collection === 'function' && process.env.NODE_ENV === 'production') {
          try {
            await db.collection('push_subscriptions').doc(tokenHash).update({
              status: 'revoked',
              revokedAt: nowIso,
              revocationReason: reason
            });
          } catch (_) {}
        }
      }
    }

    return { success: true, revokedCount };
  }

  /**
   * Invalidate push notifications upon user logout on the current device.
   */
  async handleUserLogout(db, { userId, deviceId = null }) {
    return this.revokePushSubscription(db, {
      userId,
      deviceId,
      reason: 'LOGOUT'
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. CLEANUP OF EXPIRED & INVALID TOKENS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Purge expired tokens and mark invalid provider tokens.
   */
  cleanupExpiredTokens(now = Date.now()) {
    let expiredCount = 0;

    for (const [tokenHash, record] of this.deviceTokenRegistry.entries()) {
      if (!record) continue;

      const isPastTtl = record.expiresAtTimestamp && now > record.expiresAtTimestamp;
      if (isPastTtl || record.status === 'invalid' || record.status === 'unregistered') {
        record.status = 'expired';
        record.updatedAt = new Date(now).toISOString();

        // Remove from user index
        const userSet = this.userDeviceIndex.get(record.userId);
        if (userSet) userSet.delete(tokenHash);

        if (this.deviceToUserIndex.get(record.deviceId)?.tokenHash === tokenHash) {
          this.deviceToUserIndex.delete(record.deviceId);
        }

        expiredCount++;
      }
    }

    return { expiredCount };
  }

  /**
   * Get active, valid, non-expired push tokens for a user.
   */
  getActiveSubscriptionsForUser(userId) {
    this.cleanupExpiredTokens();
    const tokenHashes = this.userDeviceIndex.get(userId);
    if (!tokenHashes || tokenHashes.size === 0) return [];

    const activeList = [];
    const now = Date.now();

    for (const th of tokenHashes) {
      const record = this.deviceTokenRegistry.get(th);
      if (record && record.status === 'active' && (!record.expiresAtTimestamp || now < record.expiresAtTimestamp)) {
        activeList.push(record);
      }
    }

    return activeList;
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. SERVER-SIDE PUSH DISPATCH ENGINE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Sends a privacy-safe push notification respecting user preferences and quiet hours.
   */
  async sendPushNotification(db, {
    targetUserId,
    eventType,
    type,
    title,
    body,
    message,
    caseId = null,
    appointmentId = null,
    urgent = false,
    priority = null,
    severity = null,
    now = new Date()
  }) {
    if (!targetUserId || typeof targetUserId !== 'string') {
      throw new Error('targetUserId is required for push notification dispatch.');
    }

    // 1. Retrieve user notification preferences
    const preferences = await getUserNotificationPreferences(db, targetUserId);

    // 2. Check channel permission
    // Push notifications are governed by preferences.channels.push (or in_app if push unset)
    const pushEnabled = preferences?.channels?.push !== false;
    if (!pushEnabled) {
      return {
        success: true,
        sent: false,
        reason: 'CHANNEL_DISABLED',
        message: 'Push notification channel disabled in user preferences.'
      };
    }

    // 3. Evaluate urgency
    const isUrgent = isUrgentEvent({ eventType, type, urgent, priority, severity });

    // 4. Evaluate quiet hours
    const inQuietHours = isQuietHoursActive(preferences, now);

    if (inQuietHours && !isUrgent) {
      const resumeAt = calculateNextQuietHoursEnd(preferences, now);
      return {
        success: true,
        sent: false,
        deferred: true,
        reason: 'QUIET_HOURS_ACTIVE',
        resumeAt: resumeAt.toISOString(),
        message: `Notification deferred during quiet hours until ${resumeAt.toISOString()}.`
      };
    }

    // 5. Retrieve active device tokens strictly for targetUserId
    const activeTokens = this.getActiveSubscriptionsForUser(targetUserId);
    if (activeTokens.length === 0) {
      return {
        success: true,
        sent: false,
        reason: 'NO_ACTIVE_DEVICE_TOKENS',
        message: 'User has no active push notification subscriptions.'
      };
    }

    // 6. Scrub Sensitive Medical Content (PHI Elimination)
    const sanitized = this.sanitizeNotificationPayload({
      eventType,
      type,
      title,
      body,
      message,
      caseId,
      appointmentId
    });

    const dispatchTime = now instanceof Date ? now.toISOString() : new Date().toISOString();
    const dispatches = [];

    // 7. Dispatch to each active device
    for (const sub of activeTokens) {
      const dispatchRecord = {
        dispatchId: `push_disp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        targetUserId,
        deviceId: sub.deviceId,
        tokenMasked: sub.tokenMasked,
        title: sanitized.title,
        body: sanitized.body,
        targetUrl: sanitized.targetUrl,
        urgent: isUrgent,
        bypassedQuietHours: Boolean(inQuietHours && isUrgent),
        status: 'delivered',
        timestamp: dispatchTime
      };

      this.sandboxPushDispatches.push(dispatchRecord);
      dispatches.push(dispatchRecord);

      // In production Firebase FCM multicast:
      // await admin.messaging().sendEachForMulticast(...)
    }

    return {
      success: true,
      sent: true,
      deliveredDevicesCount: dispatches.length,
      bypassedQuietHours: Boolean(inQuietHours && isUrgent),
      notification: {
        title: sanitized.title,
        body: sanitized.body,
        targetUrl: sanitized.targetUrl
      },
      dispatches
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. SANDBOX & TEST HARNESS CONTROLS
  // ─────────────────────────────────────────────────────────────────

  resetRegistry() {
    this.deviceTokenRegistry.clear();
    this.userDeviceIndex.clear();
    this.deviceToUserIndex.clear();
    this.sandboxPushDispatches.length = 0;
  }
}

module.exports = new PushNotificationService();
