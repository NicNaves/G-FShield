import {
  GRASP_NOTIFICATION_STORAGE_KEY,
  clearGraspNotifications,
  pushGraspNotification,
  readGraspNotifications,
} from "./graspNotifications";

describe("graspNotifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and reads notifications", () => {
    pushGraspNotification({
      id: "seed-1",
      title: "IG improved to 100% via VND",
      timestamp: "2026-03-13T18:00:00.000Z",
    });

    expect(readGraspNotifications()).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(GRASP_NOTIFICATION_STORAGE_KEY))).toHaveLength(1);
  });

  it("clears stored notifications", () => {
    pushGraspNotification({
      id: "seed-1",
      title: "IG improved to 100% via VND",
      timestamp: "2026-03-13T18:00:00.000Z",
    });

    clearGraspNotifications();

    expect(readGraspNotifications()).toEqual([]);
  });
});
