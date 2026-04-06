import { useQuery } from "@tanstack/react-query";

import { getMonitorRun } from "api/grasp";
import queryKeys from "./queryKeys";

export default function useMonitorRunQuery(seedId, options = {}) {
  const {
    historyLimit,
    includeInsights,
    page,
    pageSize,
    start,
    end,
    timelineBucketMs,
    timelineBucketLimit,
    enabled = Boolean(seedId),
    ...queryOptions
  } = options;
  const requestOptions = {
    ...(historyLimit ? { historyLimit } : {}),
    ...(includeInsights ? { includeInsights: true } : {}),
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(timelineBucketMs ? { timelineBucketMs } : {}),
    ...(timelineBucketLimit ? { timelineBucketLimit } : {}),
  };

  return useQuery({
    queryKey: queryKeys.monitorRun(seedId, {
      historyLimit,
      includeInsights,
      page,
      pageSize,
      start,
      end,
      timelineBucketMs,
      timelineBucketLimit,
    }),
    queryFn: () => getMonitorRun(seedId, requestOptions),
    enabled,
    ...queryOptions,
  });
}
