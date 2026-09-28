/**
 * Health Vibe AI - Notifications Data Service
 * 
 * Manages notification queues, unread counters, reminder scheduling,
 * and persistence.
 */

(function (global) {
  "use strict";

  const notificationsQueue = [];

  function enqueueNotification(notification) {
    if (!notification) return null;
    const item = {
      id: notification.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: notification.type || "info",
      title: notification.title || "",
      message: notification.message || "",
      timestamp: notification.timestamp || new Date().toISOString(),
      read: Boolean(notification.read)
    };
    notificationsQueue.unshift(item);
    return item;
  }

  function getUnreadNotifications() {
    return notificationsQueue.filter(n => !n.read);
  }

  function markAsRead(id) {
    const item = notificationsQueue.find(n => n.id === id);
    if (item) item.read = true;
  }

  function markAllAsRead() {
    notificationsQueue.forEach(n => { n.read = true; });
  }

  const NotificationsService = {
    enqueueNotification,
    getUnreadNotifications,
    markAsRead,
    markAllAsRead,
    getAll: () => [...notificationsQueue]
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.NotificationsService = NotificationsService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = NotificationsService;
  }
})(typeof window !== "undefined" ? window : globalThis);
