// In-process TTL cache used as the L1 layer in front of MongoDB.
// Keeps the scraper responsive when the same query is repeated.
class MemoryCache {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this.map = new Map();
  }
  _now() {
    return Date.now();
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt < this._now()) {
      this.map.delete(key);
      return null;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  set(key, value, ttlSeconds) {
    if (this.map.size >= this.maxEntries) {
      // evict oldest
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: this._now() + ttlSeconds * 1000 });
  }
  clear() {
    this.map.clear();
  }
  stats() {
    return { size: this.map.size, maxEntries: this.maxEntries };
  }
}

module.exports = new MemoryCache();
