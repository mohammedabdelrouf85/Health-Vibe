/**
 * Health Vibe AI - REST routes for tasks #641-#670
 * (Priority slots, visit ratings, lab result alerts, doctor directory,
 *  booking fee/wait transparency, saved assistant chat history.)
 *
 * Mounted from server.js via: require('./feature-routes-641-670')(app, requireAuth)
 */

'use strict';

const { prioritySlotService } = require('./priority-slot-service');
const { visitRatingService } = require('./visit-rating-service');
const { labResultAlertService } = require('./lab-result-alert-service');
const { doctorDirectoryService } = require('./doctor-directory-service');
const { bookingTransparencyService } = require('./booking-transparency-service');
const { chatHistoryService } = require('./chat-history-service');

/** Wraps a handler: maps FeatureError -> HTTP status + {error, message}. */
function handle(fn, successStatus = 200) {
  return async (req, res) => {
    try {
      const result = await fn(req);
      res.status(successStatus).json({ success: true, data: result });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.code || 'INTERNAL_ERROR', message: err.message });
    }
  };
}

module.exports = function mountFeatureRoutes641to670(app, requireAuth) {
  const auth = requireAuth;

  // ── #641-#645 Kry: Priority Slot Allocation ────────────────────────────────
  app.post('/api/priority-slots/reserve', auth, handle(req => prioritySlotService.reservePrioritySlot(req.body || {}, req.user), 201));
  app.get('/api/priority-slots/available', auth, handle(() => prioritySlotService.listAvailablePrioritySlots()));
  app.post('/api/priority-slots/offer', auth, handle(req =>
    prioritySlotService.offerPrioritySlot(req.body?.patientId || req.user.uid, req.body?.assessment, req.user)));
  app.post('/api/priority-slots/offers/:offerId/respond', auth, handle(req =>
    prioritySlotService.respondToOffer(req.params.offerId, req.body?.accept === true, req.user)));
  app.post('/api/priority-slots/offers/:offerId/confirm', auth, handle(req => prioritySlotService.doctorConfirm(req.params.offerId, req.user)));
  app.post('/api/priority-slots/offers/:offerId/downgrade', auth, handle(req =>
    prioritySlotService.doctorDowngrade(req.params.offerId, req.body?.reason, req.user)));
  app.get('/api/priority-slots/patient/:patientId', auth, handle(req => prioritySlotService.getPatientOffers(req.params.patientId, req.user)));
  app.get('/api/admin/analytics/priority-slots', auth, handle(req => prioritySlotService.getAnalytics(req.user)));

  // ── #646-#650 Vezeeta: Post-visit Rating ───────────────────────────────────
  app.get('/api/visit-ratings/pending/:patientId', auth, handle(req => visitRatingService.getPendingRatings(req.params.patientId, req.user)));
  app.post('/api/visit-ratings/:appointmentId', auth, handle(req => visitRatingService.submitRating(req.params.appointmentId, req.body || {}, req.user), 201));
  app.put('/api/visit-ratings/:appointmentId', auth, handle(req => visitRatingService.updateRating(req.params.appointmentId, req.body, req.user)));
  app.get('/api/visit-ratings/doctor/:doctorId/summary', auth, handle(req => visitRatingService.getDoctorSummary(req.params.doctorId, req.user)));
  app.get('/api/admin/visit-ratings/governance', auth, handle(req => visitRatingService.getGovernanceQueue(req.user)));
  app.get('/api/admin/analytics/visit-ratings', auth, handle(req => visitRatingService.getAnalytics(req.user)));

  // ── #651-#655 Practo: Requested Lab Result Doctor Alerts ───────────────────
  app.post('/api/lab-requests', auth, handle(req => labResultAlertService.createLabRequest(req.body || {}, req.user), 201));
  app.get('/api/lab-requests/patient/:patientId', auth, handle(req => labResultAlertService.getPatientRequests(req.params.patientId, req.user)));
  app.post('/api/lab-requests/:requestId/attach', auth, handle(req =>
    labResultAlertService.attachUploadToRequest(req.params.requestId, req.body?.testCode, req.body?.uploadId, req.user)));
  app.get('/api/lab-requests/doctor/:doctorId/inbox', auth, handle(req => labResultAlertService.getDoctorInbox(req.params.doctorId, req.user)));
  app.post('/api/lab-requests/:requestId/acknowledge', auth, handle(req =>
    labResultAlertService.acknowledgeResult(req.params.requestId, req.body?.testCode, req.user)));
  app.get('/api/admin/analytics/lab-result-alerts', auth, handle(req => labResultAlertService.getAnalytics(req.user)));

  // ── #656-#660 Vezeeta: Doctor Directory by Governorate ─────────────────────
  app.get('/api/doctor-directory/filters', handle(() => doctorDirectoryService.getFilterCatalog()));
  app.get('/api/doctor-directory/search', handle(req => doctorDirectoryService.search(req.query || {})));
  app.put('/api/admin/doctor-directory/listing', auth, handle(req => doctorDirectoryService.upsertDoctorListing(req.body || {}, req.user)));
  app.get('/api/admin/analytics/doctor-directory', auth, handle(req => doctorDirectoryService.getAnalytics(req.user)));

  // ── #661-#665 CliniDo: Fee & Expected Wait ─────────────────────────────────
  app.put('/api/booking-transparency/doctor/:doctorId/fees', auth, handle(req =>
    bookingTransparencyService.setDoctorFees(req.params.doctorId, req.body || {}, req.user)));
  app.post('/api/booking-transparency/quote', auth, handle(req =>
    bookingTransparencyService.createQuote({ ...(req.body || {}), patientId: req.body?.patientId || req.user.uid }, req.user), 201));
  app.post('/api/booking-transparency/quote/:quoteId/confirm', auth, handle(req => bookingTransparencyService.confirmQuote(req.params.quoteId, req.user)));
  app.post('/api/booking-transparency/quote/:quoteId/abandon', auth, handle(req =>
    bookingTransparencyService.abandonQuote(req.params.quoteId, req.body?.reason, req.user)));
  app.get('/api/admin/analytics/booking-transparency', auth, handle(req => bookingTransparencyService.getAnalytics(req.user)));

  // ── #666-#670 Esaal: Saved Assistant Chat History ──────────────────────────
  app.get('/api/chat-history/:patientId', auth, handle(req => chatHistoryService.listConversations(req.params.patientId, req.user, { q: req.query?.q })));
  app.get('/api/chat-history/conversation/:conversationId', auth, handle(req => chatHistoryService.getConversation(req.params.conversationId, req.user)));
  app.post('/api/chat-history/conversation/:conversationId/share', auth, handle(req =>
    chatHistoryService.shareWithDoctor(req.params.conversationId, req.body?.doctorId, req.user)));
  app.delete('/api/chat-history/conversation/:conversationId/share/:doctorId', auth, handle(req =>
    chatHistoryService.revokeShare(req.params.conversationId, req.params.doctorId, req.user)));
  app.delete('/api/chat-history/conversation/:conversationId', auth, handle(req => chatHistoryService.deleteConversation(req.params.conversationId, req.user)));
  app.get('/api/chat-history/:patientId/export', auth, handle(req => chatHistoryService.exportHistory(req.params.patientId, req.user)));
  app.get('/api/admin/analytics/chat-history', auth, handle(req => chatHistoryService.getAnalytics(req.user)));
};

module.exports.handle = handle;
