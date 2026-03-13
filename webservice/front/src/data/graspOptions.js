export const algorithmCatalog = [
  {
    key: "IG",
    label: "Information Gain",
    shortDescription: "Selects features by information gain.",
  },
  {
    key: "GR",
    label: "Gain Ratio",
    shortDescription: "Reduces Information Gain bias on broader attributes.",
  },
  {
    key: "RF",
    label: "RelieF",
    shortDescription: "Evaluates relevance through instance neighborhoods.",
  },
  {
    key: "SU",
    label: "Symmetrical Uncertainty",
    shortDescription: "Normalizes dependency between feature and class.",
  },
];

export const classifierOptions = ["J48", "RandomForest", "NaiveBayes"];

export const neighborhoodOptions = [
  {
    key: "VND",
    label: "VND",
    shortDescription: "Sequential cycle across the selected local-search services.",
  },
  {
    key: "RVND",
    label: "RVND",
    shortDescription: "Random choice among the selected local-search services.",
  },
];

export const localSearchCatalog = [
  {
    key: "BIT_FLIP",
    label: "BitFlip",
    shortDescription: "Swaps attributes between the current solution and the RCL.",
  },
  {
    key: "IWSS",
    label: "IWSS",
    shortDescription: "Adds features sequentially based on the observed gain.",
  },
  {
    key: "IWSSR",
    label: "IWSSR",
    shortDescription: "Refines the addition step with removal and replacement.",
  },
];

export const defaultExecutionForm = {
  algorithms: algorithmCatalog.map((algorithm) => algorithm.key),
  neighborhoodStrategy: "VND",
  localSearches: localSearchCatalog.map((search) => search.key),
  maxGenerations: 10,
  rclCutoff: 20,
  sampleSize: 5,
  neighborhoodMaxIterations: 10,
  bitFlipMaxIterations: 100,
  iwssMaxIterations: 20,
  iwssrMaxIterations: 20,
  classifier: "J48",
  datasetTrainingName: "",
  datasetTestingName: "",
};
