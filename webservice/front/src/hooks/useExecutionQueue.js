import { useCallback, useEffect, useState } from "react";

import { cancelExecutionLaunch, getExecutionLaunches } from "api/grasp";

export default function useExecutionQueue(limit = 25, refreshMs = 4000) {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLaunches = useCallback(async () => {
    try {
      const nextLaunches = await getExecutionLaunches(limit);
      setLaunches(nextLaunches);
      setError("");
      return nextLaunches;
    } catch (requestError) {
      setError(requestError.message || "Unable to load the execution queue.");
      throw requestError;
    }
  }, [limit]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const nextLaunches = await getExecutionLaunches(limit);
        if (!cancelled) {
          setLaunches(nextLaunches);
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Unable to load the execution queue.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    const interval = window.setInterval(() => {
      load().catch(() => undefined);
    }, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [limit, refreshMs]);

  const cancelLaunch = useCallback(
    async (requestId) => {
      const nextLaunch = await cancelExecutionLaunch(requestId);
      setLaunches((currentLaunches) =>
        currentLaunches.map((launch) => (launch.requestId === requestId ? nextLaunch : launch))
      );
      return nextLaunch;
    },
    []
  );

  return {
    launches,
    loading,
    error,
    refresh: loadLaunches,
    cancelLaunch,
  };
}
