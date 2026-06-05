import config from '../config/agent.js';

class Cache {
  constructor() {
    this.store = new Map();
    this.maxSize = config.cache.maxSize;
  }

  get(key) {
    const normalizedKey = this._normalizeKey(key);
    const item = this.store.get(normalizedKey);
    if (!item) return null;

    if (item.expireAt && Date.now() > item.expireAt) {
      this.store.delete(normalizedKey);
      return null;
    }

    item.lastAccessed = Date.now();
    return item.value;
  }

  set(key, value, ttl) {
    const normalizedKey = this._normalizeKey(key);

    if (this.store.size >= this.maxSize && !this.store.has(normalizedKey)) {
      this._evictLRU();
    }

    const expireAt = ttl ? Date.now() + ttl : null;
    this.store.set(normalizedKey, {
      value,
      expireAt,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    });
  }

  has(key) {
    const normalizedKey = this._normalizeKey(key);
    const item = this.store.get(normalizedKey);
    if (!item) return false;

    if (item.expireAt && Date.now() > item.expireAt) {
      this.store.delete(normalizedKey);
      return false;
    }

    return true;
  }

  delete(key) {
    const normalizedKey = this._normalizeKey(key);
    return this.store.delete(normalizedKey);
  }

  clear() {
    this.store.clear();
  }

  getStatsCache(date) {
    return this.get(`stats:${date}`);
  }

  setStatsCache(date, data) {
    this.set(`stats:${date}`, data, config.cache.statsTTL);
  }

  getQueryCache(key) {
    return this.get(`query:${key}`);
  }

  setQueryCache(key, data) {
    this.set(`query:${key}`, data, config.cache.queryTTL);
  }

  _getStoreSize() {
    return this.store.size;
  }

  _normalizeKey(key) {
    return String(key).toLowerCase().trim();
  }

  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, item] of this.store) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.store.delete(oldestKey);
    }
  }
}

export default new Cache();
