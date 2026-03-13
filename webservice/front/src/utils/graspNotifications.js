export const GRASP_NOTIFICATION_STORAGE_KEY = "grasp-monitor-notifications";
export const GRASP_NOTIFICATION_EVENT_NAME = "grasp-monitor-notifications-updated";

const readRawNotifications = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(GRASP_NOTIFICATION_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

export const readGraspNotifications = () => readRawNotifications();

export const pushGraspNotification = (notification, limit = 12) => {
  if (typeof window === "undefined" || !notification) {
    return [];
  }

  const nextNotifications = [notification, ...readRawNotifications()]
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
