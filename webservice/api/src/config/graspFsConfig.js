const buildUrl = (envKey, fallback) => process.env[envKey] || fallback;

const graspServices = {
  IG: {
    key: "IG",
    label: "Information Gain",
    baseUrl: buildUrl("GRASP_FS_IG_URL", "http://localhost:8089"),
    path: "/ig",
  },
  GR: {
    key: "GR",
    label: "Gain Ratio",
    baseUrl: buildUrl("GRASP_FS_GR_URL", "http://localhost:8088"),
    path: "/gr",
  },
  RF: {
    key: "RF",
    label: "RelieF",
    baseUrl: buildUrl("GRASP_FS_RF_URL", "http://localhost:8086"),
    path: "/rf",
  },
  SU: {
    key: "SU",
    label: "Symmetrical Uncertainty",
    baseUrl: buildUrl("GRASP_FS_SU_URL", "http://localhost:8087"),
    path: "/su",
  },
};

const kafkaBrokers = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

const monitorTopics = [
  "INITIAL_SOLUTION_TOPIC",
  "NEIGHBORHOOD_RESTART_TOPIC",
  "LOCAL_SEARCH_PROGRESS_TOPIC",
  "SOLUTIONS_TOPIC",
  "BEST_SOLUTION_TOPIC",
];

module.exports = {
  graspServices,
  kafkaBrokers,
  monitorTopics,
};
