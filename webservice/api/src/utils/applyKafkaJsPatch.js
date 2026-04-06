let patched = false;

module.exports = function applyKafkaJsPatch() {
  if (patched) {
    return;
  }

  patched = true;

  try {
    const RequestQueue = require("kafkajs/src/network/requestQueue");
    if (!RequestQueue || RequestQueue.__gfShieldPatched) {
      return;
    }

    const CHECK_PENDING_REQUESTS_INTERVAL = 10;

    RequestQueue.prototype.scheduleCheckPendingRequests = function scheduleCheckPendingRequestsPatched() {
      let scheduleAt = Number(this.throttledUntil) - Date.now();

      if (!this.throttleCheckTimeoutId) {
        if (this.pending.length > 0) {
          scheduleAt = scheduleAt > 0 ? scheduleAt : CHECK_PENDING_REQUESTS_INTERVAL;
        } else {
          scheduleAt = scheduleAt > 0 ? scheduleAt : 1;
        }

        this.throttleCheckTimeoutId = setTimeout(() => {
          this.throttleCheckTimeoutId = null;
          this.checkPendingRequests();
        }, scheduleAt);
      }
    };

    RequestQueue.__gfShieldPatched = true;
  } catch (error) {
    console.warn("KafkaJS request queue patch skipped:", error.message);
  }
};
