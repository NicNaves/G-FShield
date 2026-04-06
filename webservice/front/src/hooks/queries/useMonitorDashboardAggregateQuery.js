import { useQuery } from "@tanstack/react-query";

import { getMonitorDashboardAggregate } from "api/grasp";
import queryKeys from "./queryKeys";

export default function useMonitorDashboardAggregateQuery(options = {}) {
  const { bucketLimit, enabled = true, ...queryOptions } = options;

  return useQuery({
    queryKey: queryKeys.monitorDashboardAggregate({ bucketLimit }),
    queryFn: () => getMonitorDashboardAggregate(bucketLimit),
    enabled,
    ...queryOptions,
  });
}
