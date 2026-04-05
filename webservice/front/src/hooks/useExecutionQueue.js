import { useCallback, useEffect, useRef, useState } from "react";

import { cancelExecutionLaunch, getExecutionLaunches } from "api/grasp";

const HIDDEN_TAB_REFRESH_MULTIPLIER = 3;
const MAX_HIDDEN_TAB_REFRESH_MS = 30_000;

const normalizeLaunches = (launches = [], limit = 25) => {
  const byRequestId = new Map();

  launches.forEach((launch) => {
    if (!launch?.requestId || byRequestId.has(launch.requestId)) {
      return;
    }

    byRequestId.set(launch.requestId, launch);
  });

  return [...byRequestId.values()].slice(0, Math.max(Number(limit) || 1, 1));
};

const buildLaunchesFingerprint = (launches = []) =>
  JSON.stringify(
    launches.map((launch) => [
      launch.requestId,
      launch.queueState,
      launch.status,
      launch.canCancel,
      launch.dispatchCount,
      launch.completedSeedCount,
      launch.expectedSeedCount,
      launch.observedSeedCount,
      launch.lastResultAt,
      launch.completedAt,
      launch.updatedAt,
      launch.params?.datasetTrainingName,
      launch.params?.datasetTestingName,
      Array.isArray(launch.algorithms) ? launch.algorithms.join(",") : "",
    ])
  );

export default function useExecutionQueue(limit = 25, refreshMs = 4000) {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const inFlightRef = useRef(false);
  const timerRef = useRef(null);
  const launchesRef = useRef([]);
  const launchesFingerprintRef = useRef("");

  const updateLaunchesIfNeeded = useCallback(
    (incomingLaunches = []) => {
      const normalizedLaunches = normalizeLaunches(incomingLaunches, limit);
      const nextFingerprint = buildLaunchesFingerprint(normalizedLaunches);

      launchesRef.current = normalizedLaunches;

      if (nextFingerprint !== launchesFingerprintRef.current) {
        launchesFingerprintRef.current = nextFingerprint;
        setLaunches(normalizedLaunches);
      }

      return normalizedLaunches;
    },
    [limit]
  );

  const loadLaunches = useCallback(
    async ({ showLoading = false, force = false } = {}) => {
      if (inFlightRef.current && !force) {
        return launchesRef.current;
      }

      if (showLoading) {
        setLoading(true);
      }

      inFlightRef.current = true;

      try {
        const nextLaunches = await getExecutionLaunches(limit);
        const normalizedLaunches = updateLaunchesIfNeeded(nextLaunches);
        setError("");
        return normalizedLaunches;
      } catch (requestError) {
        setError(requestError.message || "Unable to load the execution queue.");
        throw requestError;
      } finally {
        inFlightRef.current = false;

        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [limit, updateLaunchesIfNeeded]
  );

  useEffect(() => {
    let cancelled = false;

    const clearScheduledRefresh = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const resolveRefreshDelay = () => {
      if (!document.hidden) {
        return refreshMs;
      }

      return Math.min(refreshMs * HIDDEN_TAB_REFRESH_MULTIPLIER, MAX_HIDDEN_TAB_REFRESH_MS);
    };

    const tick = async () => {
      try {
        await loadLaunches();
      } catch {
        // handled in state
      } finally {
        if (!cancelled) {
          scheduleNextRefresh();
        }
      }
    };

    const scheduleNextRefresh = () => {
      clearScheduledRefresh();

      if (cancelled) {
        return;
      }

      timerRef.current = window.setTimeout(tick, resolveRefreshDelay());
    };

    const handleVisibilityChange = () => {
      if (cancelled) {
        return;
      }

      if (!document.hidden) {
        loadLaunches({ force: true }).catch(() => undefined);
      }

      scheduleNextRefresh();
    };

    loadLaunches({ showLoading: true, force: true })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          scheduleNextRefresh();
        }
      });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadLaunches, refreshMs]);

  const refresh = useCallback(
    () => loadLaunches({ showLoading: true, force: true }),
    [loadLaunches]
  );

  const cancelLaunch = useCallback(
    async (requestId) => {
      const nextLaunch = await cancelExecutionLaunch(requestId);

      setLaunches((currentLaunches) => {
        const mergedLaunches = normalizeLaunches(
          currentLaunches.map((launch) => (launch.requestId === requestId ? nextLaunch : launch)),
          limit
        );

        launchesRef.current = mergedLaunches;
        launchesFingerprintRef.current = buildLaunchesFingerprint(mergedLaunches);

        return mergedLaunches;
      });

      return nextLaunch;
    },
    [limit]
  );

  return {
    launches,
    loading,
    error,
    refresh,
    cancelLaunch,
  };
}
