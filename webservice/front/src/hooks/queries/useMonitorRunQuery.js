import { useQuery } from "@tanstack/react-query";

import { getMonitorRun } from "api/grasp";
import queryKeys from "./queryKeys";

export default function useMonitorRunQuery(seedId, options = {}) {
  const { historyLimit, enabled = Boolean(seedId), ...queryOptions } = options;

  return useQuery({
    queryKey: queryKeys.monitorRun(seedId, { historyLimit }),
    queryFn: () => getMonitorRun(seedId, historyLimit ? { historyLimit } : {}),
    enabled,
    ...queryOptions,
  });
}
