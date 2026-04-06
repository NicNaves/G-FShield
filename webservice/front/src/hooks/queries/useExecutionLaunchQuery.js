import { useQuery } from "@tanstack/react-query";

import { getExecutionLaunch } from "api/grasp";
import queryKeys from "./queryKeys";

export default function useExecutionLaunchQuery(requestId, options = {}) {
  const {
    enabled = Boolean(requestId),
    includeMonitor = false,
    historyLimit,
    eventLimit,
    ...queryOptions
  } = options;

  return useQuery({
    queryKey: queryKeys.executionLaunch(requestId, {
      includeMonitor,
      historyLimit,
      eventLimit,
    }),
    queryFn: () =>
      getExecutionLaunch(requestId, {
        includeMonitor,
        historyLimit,
        eventLimit,
      }),
    enabled,
    ...queryOptions,
  });
}
