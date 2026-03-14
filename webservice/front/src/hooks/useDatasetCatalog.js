import { useEffect, useState } from "react";

import { getAvailableDatasets } from "api/grasp";

export default function useDatasetCatalog() {
  const [catalog, setCatalog] = useState({
    directory: "",
    exists: false,
    datasets: [],
    suggestedPairs: [],
    summary: {
      totalFiles: 0,
      totalSizeBytes: 0,
      totalSizeLabel: "0 B",
      totalInstances: 0,
      totalAttributes: 0,
      totalSuggestedPairs: 0,
      familyCount: 0,
      availableFormats: [],
      richestDataset: null,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const nextCatalog = await getAvailableDatasets();
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load the dataset catalog.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    catalog,
    loading,
    error,
  };
}
