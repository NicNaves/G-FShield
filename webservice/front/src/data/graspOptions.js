export const algorithmCatalog = [
  {
    key: "IG",
    label: "Information Gain",
    shortDescription: "Seleciona features pelo ganho de informacao.",
  },
  {
    key: "GR",
    label: "Gain Ratio",
    shortDescription: "Reduz o vies do Information Gain em atributos amplos.",
  },
  {
    key: "RF",
    label: "RelieF",
    shortDescription: "Avalia relevancia pela vizinhanca das instancias.",
  },
  {
    key: "SU",
    label: "Symmetrical Uncertainty",
    shortDescription: "Normaliza dependencia entre feature e classe.",
  },
];

export const classifierOptions = ["J48", "RandomForest", "NaiveBayes"];

export const neighborhoodOptions = [
  {
    key: "VND",
    label: "VND",
    shortDescription: "Ciclo sequencial entre as buscas locais selecionadas.",
  },
  {
    key: "RVND",
    label: "RVND",
    shortDescription: "Escolha aleatoria entre as buscas locais selecionadas.",
  },
];

export const localSearchCatalog = [
  {
    key: "BIT_FLIP",
    label: "BitFlip",
    shortDescription: "Troca atributos entre a solucao corrente e a RCL.",
  },
  {
    key: "IWSS",
    label: "IWSS",
    shortDescription: "Adiciona features sequencialmente pela melhora observada.",
  },
  {
    key: "IWSSR",
    label: "IWSSR",
    shortDescription: "Refina a adicao com remocao e substituicao.",
  },
];

export const defaultExecutionForm = {
  algorithms: algorithmCatalog.map((algorithm) => algorithm.key),
  neighborhoodStrategy: "VND",
  localSearches: localSearchCatalog.map((search) => search.key),
  maxGenerations: 10,
  rclCutoff: 20,
  sampleSize: 5,
  classifier: "J48",
  datasetTrainingName: "",
  datasetTestingName: "",
};
