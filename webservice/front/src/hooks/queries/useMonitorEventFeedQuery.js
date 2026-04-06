import { useQuery } from "@tanstack/react-query";

import { getMonitorEventFeed } from "api/grasp";
import queryKeys from "./queryKeys";

export default function useMonitorEventFeedQuery(options = {}) {
  const {
    enabled = true,
    page = 1,
    pageSize = 25,
    topics = [],
    algorithm,
    datasetKey,
    status,
    searchLabel,
    requestId,
    seedId,
    start,
    end,
    query,
    ...queryOptions
  } = options;

  const requestOptions = {
    page,
    pageSize,
    topics,
    algorithm,
    datasetKey,
    status,
    searchLabel,
    requestId,
    seedId,
    start,
    end,
    query,
  };

  return useQuery({
    queryKey: queryKeys.monitorEventFeed(requestOptions),
    queryFn: () => getMonitorEventFeed(requestOptions),
    placeholderData: (previousData) => previousData,
    enabled,
    ...queryOptions,
  });
}
