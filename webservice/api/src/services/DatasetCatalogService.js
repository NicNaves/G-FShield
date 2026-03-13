const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

class DatasetCatalogService {
  constructor() {
    this.supportedExtensions = new Set([".arff", ".csv", ".data", ".txt"]);
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
          });
        });
      });
    }

    return pairs.sort((a, b) => a.label.localeCompare(b.label));
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
            return {
              name: entry.name,
              extension,
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

    return {
      directory,
      exists: true,
      datasets,
      suggestedPairs: this.buildSuggestedPairs(datasets),
    };
  }
}

module.exports = new DatasetCatalogService();
