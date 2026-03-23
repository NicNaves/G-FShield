import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import {
  createGraspMonitorStream,
  getMonitorEvents,
  getMonitorRuns,
  getMonitorSummary,
} from "api/grasp";
import { DEFAULT_LOCALE, translate } from "i18n";
import { pushGraspNotification } from "utils/graspNotifications";

const topicPriority = (topic) => {
  if (topic === "BEST_SOLUTION_TOPIC") {
    return 2;
  }

  if (topic === "SOLUTIONS_TOPIC") {
    return 2;
  }

  if (topic === "LOCAL_SEARCH_PROGRESS_TOPIC") {
    return 1;
  }

  return 0;
};

const shouldPreferIncomingRun = (currentRun, incomingRun) => {
  if (!currentRun) {
    return true;
  }

  const currentPriority = topicPriority(currentRun.topic);
  const incomingPriority = topicPriority(incomingRun.topic);
  if (incomingPriority !== currentPriority) {
    return incomingPriority > currentPriority;
  }

  const currentScore = Number(currentRun.bestF1Score ?? Number.NEGATIVE_INFINITY);
  const incomingScore = Number(incomingRun.bestF1Score ?? Number.NEGATIVE_INFINITY);
  if (incomingScore !== currentScore) {
    return incomingScore > currentScore;
  }

  return new Date(incomingRun.updatedAt || 0) >= new Date(currentRun.updatedAt || 0);
};

const mergeRuns = (currentRuns, incomingRun) => {
  const next = new Map(currentRuns.map((run) => [run.seedId, run]));
  const current = next.get(incomingRun.seedId) || {};
  const preferredRun = shouldPreferIncomingRun(current.seedId ? current : null, incomingRun)
    ? incomingRun
    : current;

  next.set(incomingRun.seedId, {
    ...current,
    ...preferredRun,
    history:
      (incomingRun.history?.length || 0) >= (current.history?.length || 0)
        ? incomingRun.history || []
        : current.history || [],
  });

  return [...next.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
};

const mergeRunList = (currentRuns, incomingRuns = []) =>
  incomingRuns.reduce((nextRuns, incomingRun) => mergeRuns(nextRuns, incomingRun), currentRuns);

const buildEventKey = (event) =>
  event?.fingerprint
  || event?.requestId
  || `${event?.type || "event"}:${event?.topic || "topic"}:${event?.seedId || "seed"}:${event?.timestamp || "time"}`;

const mergeEvents = (currentEvents, incomingEvents = [], limit = 100) => {
  const next = new Map();

  [...incomingEvents, ...currentEvents].forEach((event) => {
    if (!event) {
      return;
    }

    const key = buildEventKey(event);
    if (!next.has(key)) {
      next.set(key, event);
    }
  });

  return [...next.values()]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

export default function useGraspMonitor(limit = 100, options = {}) {
  const safeLimit = Math.max(Number(limit) || 100, 1);
  const configuredHistoryLimit = Math.max(
    Number(options.historyLimit ?? process.env.REACT_APP_GRASP_MONITOR_HISTORY_LIMIT ?? 40) || 40,
    1
  );
  const configuredSummaryEventLimit = Math.max(
    Number(options.summaryEventLimit ?? Math.min(safeLimit, 300)) || Math.min(safeLimit, 300),
    1
  );
  const [runs, setRuns] = useState([]);
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const bestScoreBySeedRef = useRef(new Map());

  const registerCurrentRuns = (nextRuns = []) => {
    const nextScores = new Map();

    nextRuns.forEach((run) => {
      if (!run?.seedId) {
        return;
      }

      nextScores.set(run.seedId, Number(run.bestF1Score ?? Number.NEGATIVE_INFINITY));
    });

    bestScoreBySeedRef.current = nextScores;
  };

  const rememberObservedScore = (incomingRun) => {
    if (!incomingRun?.seedId) {
      return;
    }

    const observedScore = Number(
      incomingRun.bestF1Score ?? incomingRun.currentF1Score ?? Number.NEGATIVE_INFINITY
    );

    if (!Number.isFinite(observedScore)) {
      return;
    }

    const previousScore = bestScoreBySeedRef.current.get(incomingRun.seedId);
    bestScoreBySeedRef.current.set(
      incomingRun.seedId,
      Math.max(previousScore ?? Number.NEGATIVE_INFINITY, observedScore)
    );
  };

  const notifyIfImproved = (incomingRun) => {
    if (!incomingRun?.seedId) {
      return;
    }

    if (!["INITIAL_SOLUTION_TOPIC", "NEIGHBORHOOD_RESTART_TOPIC", "LOCAL_SEARCH_PROGRESS_TOPIC", "SOLUTIONS_TOPIC", "BEST_SOLUTION_TOPIC"].includes(incomingRun.topic)) {
      return;
    }

    const incomingScore = Number(incomingRun.bestF1Score ?? incomingRun.currentF1Score ?? Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(incomingScore)) {
      return;
    }

    const previousScore = bestScoreBySeedRef.current.get(incomingRun.seedId);
    if (previousScore === undefined || incomingScore <= previousScore) {
      bestScoreBySeedRef.current.set(incomingRun.seedId, Math.max(previousScore ?? Number.NEGATIVE_INFINITY, incomingScore));
      return;
    }

    bestScoreBySeedRef.current.set(incomingRun.seedId, incomingScore);

    const searchLabel = incomingRun.localSearch || incomingRun.neighborhood || incomingRun.stage || "pipeline";
    const algorithmLabel = incomingRun.rclAlgorithm || "Unknown";
    const locale = window.localStorage.getItem("locale") || DEFAULT_LOCALE;
    const message = translate(locale, "dashboard.improvementToast", {
      algorithm: algorithmLabel,
      score: incomingScore,
      search: searchLabel,
    });

    pushGraspNotification({
      id: `${incomingRun.seedId}:${incomingRun.updatedAt || incomingRun.topic}:${incomingScore}`,
      timestamp: incomingRun.updatedAt || new Date().toISOString(),
      title: message,
      seedId: incomingRun.seedId,
      score: incomingScore,
      algorithm: algorithmLabel,
      search: searchLabel,
      topic: incomingRun.topic,
    });

    toast.success(message, {
      toastId: `grasp-improvement:${incomingRun.seedId}:${incomingScore}`,
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const historyWindow = Math.min(configuredHistoryLimit, 120);

        const [runsResponse, eventsResponse, summaryResponse] = await Promise.all([
          getMonitorRuns(safeLimit, historyWindow),
          getMonitorEvents(safeLimit),
          getMonitorSummary(safeLimit, configuredSummaryEventLimit),
        ]);

        if (cancelled) {
          return;
        }

        setRuns(runsResponse);
        setEvents(eventsResponse);
        setSummary(summaryResponse);
        registerCurrentRuns(runsResponse);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load monitor data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    const stream = createGraspMonitorStream();

    stream.onopen = () => {
      if (!cancelled) {
        setConnected(true);
      }
    };

    stream.onmessage = (messageEvent) => {
      try {
        const payload = JSON.parse(messageEvent.data);

        if (payload.type === "snapshot") {
          if (!cancelled) {
            setRuns((currentRuns) => {
              const nextRuns = mergeRunList(currentRuns, payload.runs || []);
              registerCurrentRuns(nextRuns);
              return nextRuns;
            });
            setEvents((currentEvents) => mergeEvents(currentEvents, payload.events || [], safeLimit));
            if (payload.summary) {
              setSummary(payload.summary);
            }
            setConnected(true);
          }
          return;
        }

        if (!cancelled) {
          setEvents((currentEvents) => mergeEvents(currentEvents, [payload], safeLimit));
        }

        if ((payload.type === "kafka.update" || payload.type === "kafka.progress")
          && payload.payload?.seedId
          && !cancelled) {
          if (["INITIAL_SOLUTION_TOPIC", "NEIGHBORHOOD_RESTART_TOPIC", "LOCAL_SEARCH_PROGRESS_TOPIC", "SOLUTIONS_TOPIC", "BEST_SOLUTION_TOPIC"].includes(payload.payload.topic)) {
            notifyIfImproved(payload.payload);
          } else {
            rememberObservedScore(payload.payload);
          }
          setRuns((currentRuns) => mergeRuns(currentRuns, payload.payload));
        }
      } catch (streamError) {
        if (!cancelled) {
          setError(streamError.message || "Unable to read the realtime stream.");
        }
      }
    };

    stream.onerror = () => {
      if (!cancelled) {
        setConnected(false);
      }
    };

    return () => {
      cancelled = true;
      stream.close();
    };
  }, [configuredHistoryLimit, configuredSummaryEventLimit, safeLimit]);

  return {
    runs,
    events,
    summary,
    loading,
    error,
    connected,
  };
}
