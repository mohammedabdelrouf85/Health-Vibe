/**
 * Health Vibe AI - Firebase Cloud Functions & Server-Authoritative Express Entrypoint
 *
 * Exposes:
 * 1. `api`: HTTPS onRequest Cloud Function hosting the full Express API suite:
 *    - /api/patient/*, /api/doctor/*, /api/admin/*, /api/auth/*, /api/notifications/*, /api/appointments/*
 * 2. Background Firestore & Auth Event Triggers:
 *    - `onUserCreated`: Enforces cryptographic default claims on account creation
 *    - `onDoctorApplicationUpdated`: Validates licensing and status progression
 *    - `onDoctorApplicationCreated`: Auto-provisions doctor_pending state securely
 */

const functions = require('firebase-functions');
const app = require('./server');
const cloudTriggers = require('./functions/index');

// 1. Expose Express API as HTTPS Cloud Function
exports.api = functions.https.onRequest(app);

// 2. Export background Cloud Functions triggers
exports.onUserCreated = cloudTriggers.onUserCreated;
exports.onDoctorApplicationUpdated = cloudTriggers.onDoctorApplicationUpdated;
exports.onDoctorApplicationCreated = cloudTriggers.onDoctorApplicationCreated;
