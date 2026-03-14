const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const readline = require("readline");

class DatasetCatalogService {
  constructor() {
    this.supportedExtensions = new Set([".arff", ".csv", ".data", ".txt"]);
    this.analysisCache = new Map();
  }

  resolveConfiguredPath(configuredPath) {
    if (!configuredPath) {
      return null;
    }

    if (path.isAbsolute(configuredPath)) {
      return configuredPath;
    }

    return path.resolve(process.cwd(), configuredPath);
  }

  resolveDatasetsDir() {
    const candidates = [
      this.resolveConfiguredPath(process.env.GRASP_DATASETS_DIR),
      "/datasets",
      path.resolve(process.cwd(), "datasets"),
      path.resolve(process.cwd(), "..", "..", "datasets"),
      path.resolve(__dirname, "..", "..", "..", "..", "datasets"),
    ].filter(Boolean);

    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
  }

  formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) {
      return `${bytes || 0} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  detectRole(name) {
    if (/train(?:ing)?/i.test(name)) {
      return "training";
    }

    if (/test(?:ing)?/i.test(name)) {
      return "testing";
    }

    return "either";
  }

  buildFamilyKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/train(?:ing)?|test(?:ing)?/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  buildDatasetLabel(dataset) {
    const details = [];

    if (dataset.attributeCount !== null) {
      details.push(`${dataset.attributeCount} attrs`);
    }

    if (dataset.instanceCount !== null) {
      details.push(`${dataset.instanceCount} rows`);
    }

    return details.join(" | ");
  }

  buildSuggestedPairs(datasets) {
    const groups = new Map();

    datasets.forEach((dataset) => {
      const familyKey = this.buildFamilyKey(dataset.name);
      if (!familyKey) {
        return;
      }

      if (!groups.has(familyKey)) {
        groups.set(familyKey, []);
      }

      groups.get(familyKey).push(dataset);
    });

    const pairs = [];

    for (const [familyKey, files] of groups.entries()) {
      const trainingCandidates = files.filter((file) => file.roleSuggestion === "training");
      const testingCandidates = files.filter((file) => file.roleSuggestion === "testing");

      if (trainingCandidates.length === 0 || testingCandidates.length === 0) {
        continue;
      }

      trainingCandidates.forEach((training) => {
        testingCandidates.forEach((testing) => {
          pairs.push({
            id: `${training.name}|${testing.name}`,
            familyKey,
            label: `${training.name} -> ${testing.name}`,
            trainingName: training.name,
            testingName: testing.name,
            trainingSummary: this.buildDatasetLabel(training),
            testingSummary: this.buildDatasetLabel(testing),
            attributeDelta:
              training.attributeCount !== null && testing.attributeCount !== null
                ? Math.abs(training.attributeCount - testing.attributeCount)
                : null,
            instanceDelta:
              training.instanceCount !== null && testing.instanceCount !== null
                ? Math.abs(training.instanceCount - testing.instanceCount)
                : null,
          });
        });
      });
    }

    return pairs.sort((a, b) => a.label.localeCompare(b.label));
  }

  async analyzeArffDataset(fullPath) {
    const stream = fs.createReadStream(fullPath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let relationName = null;
    let attributeCount = 0;
    let instanceCount = 0;
    let classAttribute = null;
    let classValues = [];
    let inDataSection = false;

    try {
      for await (const rawLine of rl) {
        const line = rawLine.trim();

        if (!line || line.startsWith("%")) {
          continue;
        }

        if (!inDataSection) {
          const relationMatch = line.match(/^@relation\s+(.+)$/i);
          if (relationMatch) {
            relationName = relationMatch[1].trim().replace(/^['"]|['"]$/g, "");
            continue;
          }

          const attributeMatch = line.match(/^@attribute\s+((?:'[^']+'|"[^"]+"|\S+))\s+(.+)$/i);
          if (attributeMatch) {
            attributeCount += 1;
            classAttribute = attributeMatch[1].trim().replace(/^['"]|['"]$/g, "");

            const attributeDefinition = attributeMatch[2].trim();
            const nominalMatch = attributeDefinition.match(/^\{(.+)\}$/);
            if (nominalMatch) {
              classValues = nominalMatch[1]
                .split(",")
                .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
                .filter(Boolean)
                .slice(0, 12);
            }

            continue;
          }

          if (/^@data$/i.test(line)) {
            inDataSection = true;
          }

          continue;
        }

        if (!line.startsWith("%")) {
          instanceCount += 1;
        }
      }
    } finally {
      rl.close();
      stream.destroy();
    }

    return {
      datasetFormat: "ARFF",
      relationName,
      attributeCount,
      instanceCount,
      classAttribute,
      classValues,
    };
  }

  async analyzeDelimitedDataset(fullPath, extension) {
    const stream = fs.createReadStream(fullPath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    const delimiter = extension === ".csv" ? "," : null;
    let instanceCount = 0;
    let attributeCount = null;
    let header = null;

    try {
      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith("%")) {
          continue;
        }

        const values = delimiter ? line.split(delimiter) : line.split(/\s*,\s*|\s+/);
        if (attributeCount === null) {
          attributeCount = values.length;
          header = values.slice(0, 8).join(", ");
        }

        instanceCount += 1;
      }
    } finally {
      rl.close();
      stream.destroy();
    }

    return {
      datasetFormat: extension === ".csv" ? "CSV" : "TEXT",
      relationName: path.basename(fullPath, path.extname(fullPath)),
      attributeCount,
      instanceCount,
      classAttribute: attributeCount ? `column_${attributeCount}` : null,
      classValues: [],
      headerPreview: header,
    };
  }

  async analyzeDataset(fullPath, extension, stats) {
    const cacheKey = fullPath;
    const cached = this.analysisCache.get(cacheKey);

    if (
      cached
      && cached.size === stats.size
      && cached.mtimeMs === stats.mtimeMs
    ) {
      return cached.analysis;
    }

    let analysis = {
      datasetFormat: extension.replace(".", "").toUpperCase() || "FILE",
      relationName: path.basename(fullPath, extension),
      attributeCount: null,
      instanceCount: null,
      classAttribute: null,
      classValues: [],
      headerPreview: null,
    };

    try {
      if (extension === ".arff") {
        analysis = await this.analyzeArffDataset(fullPath);
      } else {
        analysis = await this.analyzeDelimitedDataset(fullPath, extension);
      }
    } catch (error) {
      analysis = {
        ...analysis,
        analysisError: error.message,
      };
    }

    this.analysisCache.set(cacheKey, {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      analysis,
    });

    return analysis;
  }

  buildSummary(datasets, suggestedPairs) {
    const totalSizeBytes = datasets.reduce((sum, dataset) => sum + Number(dataset.sizeBytes || 0), 0);
    const totalInstances = datasets.reduce(
      (sum, dataset) => sum + (Number.isFinite(dataset.instanceCount) ? dataset.instanceCount : 0),
      0
    );
    const totalAttributes = datasets.reduce(
      (sum, dataset) => sum + (Number.isFinite(dataset.attributeCount) ? dataset.attributeCount : 0),
      0
    );
    const formats = [...new Set(datasets.map((dataset) => dataset.datasetFormat).filter(Boolean))];
    const familyCount = new Set(datasets.map((dataset) => dataset.familyKey).filter(Boolean)).size;
    const richestDataset = [...datasets]
      .filter((dataset) => Number.isFinite(dataset.attributeCount))
      .sort((left, right) => right.attributeCount - left.attributeCount)[0] || null;

    return {
      totalFiles: datasets.length,
      totalSizeBytes,
      totalSizeLabel: this.formatSize(totalSizeBytes),
      totalInstances,
      totalAttributes,
      totalSuggestedPairs: suggestedPairs.length,
      familyCount,
      availableFormats: formats,
      richestDataset: richestDataset
        ? {
            name: richestDataset.name,
            attributeCount: richestDataset.attributeCount,
          }
        : null,
    };
  }

  async getCatalog() {
    const directory = this.resolveDatasetsDir();
    const exists = directory ? fs.existsSync(directory) : false;

    if (!exists) {
      return {
        directory,
        exists: false,
        datasets: [],
        suggestedPairs: [],
        summary: this.buildSummary([], []),
      };
    }

    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const datasets = (
      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const fullPath = path.join(directory, entry.name);
            const extension = path.extname(entry.name).toLowerCase();

            if (this.supportedExtensions.size > 0 && !this.supportedExtensions.has(extension)) {
              return null;
            }

            const stats = await fsp.stat(fullPath);
            const analysis = await this.analyzeDataset(fullPath, extension, stats);

            return {
              name: entry.name,
              extension,
              datasetFormat: analysis.datasetFormat,
              relationName: analysis.relationName,
              attributeCount: analysis.attributeCount,
              instanceCount: analysis.instanceCount,
              classAttribute: analysis.classAttribute,
              classValues: analysis.classValues || [],
              headerPreview: analysis.headerPreview || null,
              analysisError: analysis.analysisError || null,
              sizeBytes: stats.size,
              sizeLabel: this.formatSize(stats.size),
              modifiedAt: stats.mtime.toISOString(),
              roleSuggestion: this.detectRole(entry.name),
              familyKey: this.buildFamilyKey(entry.name),
            };
          })
      )
    )
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    const suggestedPairs = this.buildSuggestedPairs(datasets);

    return {
      directory,
      exists: true,
      datasets,
      suggestedPairs,
      summary: this.buildSummary(datasets, suggestedPairs),
    };
  }
}

module.exports = new DatasetCatalogService();
