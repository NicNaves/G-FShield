export const GRASP_NOTIFICATION_STORAGE_KEY = "grasp-monitor-notifications";
export const GRASP_NOTIFICATION_EVENT_NAME = "grasp-monitor-notifications-updated";
const GRASP_NOTIFICATION_STORAGE_VERSION_KEY = "grasp-monitor-notifications-version";
const GRASP_NOTIFICATION_STORAGE_VERSION = "2";

const isLegacyNotification = (notification) => {
  if (!notification) {
    return true;
  }

  const title = String(notification.title || "");
  return title.includes("melhorou para");
};

const readRawNotifications = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedVersion = window.localStorage.getItem(GRASP_NOTIFICATION_STORAGE_VERSION_KEY);
    if (storedVersion !== GRASP_NOTIFICATION_STORAGE_VERSION) {
      window.localStorage.removeItem(GRASP_NOTIFICATION_STORAGE_KEY);
      window.localStorage.setItem(
        GRASP_NOTIFICATION_STORAGE_VERSION_KEY,
        GRASP_NOTIFICATION_STORAGE_VERSION
      );
      return [];
    }

    const value = window.localStorage.getItem(GRASP_NOTIFICATION_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    const normalized = Array.isArray(parsed)
      ? parsed.filter((notification) => !isLegacyNotification(notification))
      : [];

    if (normalized.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      window.localStorage.setItem(
        GRASP_NOTIFICATION_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    }

    return normalized;
  } catch (error) {
    return [];
  }
};

export const readGraspNotifications = () => readRawNotifications();

export const pushGraspNotification = (notification, limit = 12) => {
  if (typeof window === "undefined" || !notification) {
    return [];
  }

  const nextNotifications = [
    notification,
    ...readRawNotifications().filter(
      (entry) => entry?.id !== notification.id && entry?.seedId !== notification.seedId
    ),
  ]
    .filter(Boolean)
    .slice(0, limit);

  try {
    window.localStorage.setItem(
      GRASP_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(nextNotifications)
    );
    window.dispatchEvent(
      new CustomEvent(GRASP_NOTIFICATION_EVENT_NAME, {
        detail: nextNotifications,
      })
    );
  } catch (error) {
    return nextNotifications;
  }

  return nextNotifications;
};

export const clearGraspNotifications = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    window.localStorage.removeItem(GRASP_NOTIFICATION_STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent(GRASP_NOTIFICATION_EVENT_NAME, {
        detail: [],
      })
    );
  } catch (error) {
    return [];
  }

  return [];
};
