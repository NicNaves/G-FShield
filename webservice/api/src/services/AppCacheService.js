const Redis = require("ioredis");
const logger = require("../utils/jsonLogger");

const serializeKeyPart = (value) => {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeKeyPart(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${serializeKeyPart(value[key])}`)
      .join(",")}}`;
  }

  return String(value);
};

class AppCacheService {
  constructor() {
    this.memory = new Map();
    this.redis = null;
    this.connectPromise = null;
    this.redisUrl = process.env.REDIS_URL || "";
    this.redisEnabled = String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
    this.defaultTtlMs = Math.max(Number(process.env.API_CACHE_TTL_MS || 5000), 250);
  }

  normalizeTtlMs(ttlMs) {
    const numericTtlMs = Number(ttlMs);
    if (!Number.isFinite(numericTtlMs)) {
      return this.defaultTtlMs;
    }

    return Math.max(Math.floor(numericTtlMs), 250);
  }

  buildKey(namespace, params = {}) {
    return `${namespace}:${serializeKeyPart(params)}`;
  }

  async ensureRedis() {
    if (!this.redisEnabled || !this.redisUrl) {
      return null;
    }

    if (this.redis?.status === "ready") {
      return this.redis;
    }

    if (!this.connectPromise) {
      this.redis = new Redis(this.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      this.connectPromise = this.redis.connect()
        .then(() => {
          logger.info("Cache Redis conectado", { url: this.redisUrl });
          return this.redis;
        })
        .catch((error) => {
          logger.warn("Cache Redis indisponivel; usando memoria local", {
            error: error.message,
          });
          if (this.redis) {
            this.redis.disconnect();
          }
          this.redis = null;
          return null;
        })
        .finally(() => {
          this.connectPromise = null;
        });
    }

    return this.connectPromise;
  }

  getFromMemory(key) {
    const entry = this.memory.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }

    return entry.value;
  }

  setInMemory(key, value, ttlMs) {
    const normalizedTtlMs = this.normalizeTtlMs(ttlMs);
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + normalizedTtlMs,
    });
  }

  async get(key) {
    const redis = await this.ensureRedis();
    if (redis) {
      try {
        const value = await redis.get(key);
        if (value) {
          return JSON.parse(value);
        }
      } catch (error) {
        logger.warn("Falha ao ler cache Redis; caindo para memoria", {
          key,
          error: error.message,
        });
      }
    }

    return this.getFromMemory(key);
  }

  async set(key, value, ttlMs = this.defaultTtlMs) {
    const normalizedTtlMs = this.normalizeTtlMs(ttlMs);
    this.setInMemory(key, value, normalizedTtlMs);

    const redis = await this.ensureRedis();
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(value), "PX", normalizedTtlMs);
      } catch (error) {
        logger.warn("Falha ao gravar no cache Redis", {
          key,
          error: error.message,
        });
      }
    }

    return value;
  }

  async remember(key, factory, ttlMs = this.defaultTtlMs) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  async clear() {
    this.memory.clear();

    const redis = await this.ensureRedis();
    if (redis) {
      try {
        await redis.flushdb();
      } catch (error) {
        logger.warn("Falha ao limpar cache Redis", {
          error: error.message,
        });
      }
    }
  }
}

module.exports = new AppCacheService();
