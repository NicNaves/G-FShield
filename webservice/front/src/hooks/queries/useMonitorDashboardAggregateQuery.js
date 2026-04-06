import { useQuery } from "@tanstack/react-query";

import { getMonitorDashboardAggregate } from "api/grasp";
import queryKeys from "./queryKeys";

export default function useMonitorDashboardAggregateQuery(options = {}) {
  const { bucketLimit, timelineBucketLimit, enabled = true, ...queryOptions } = options;

  return useQuery({
    queryKey: queryKeys.monitorDashboardAggregate({ bucketLimit, timelineBucketLimit }),
    queryFn: () => getMonitorDashboardAggregate({ bucketLimit, timelineBucketLimit }),
    enabled,
    ...queryOptions,
  });
}
