// Seeded random number generator (mulberry32) so a test run can be replayed with the same seed.
(function (CE) {
  'use strict';

  class Rng {
    constructor(seed) {
      this.state = (seed >>> 0) || 1;
    }

    next() {
      let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(n) {
      return Math.floor(this.next() * n);
    }

    pick(arr) {
      return arr.length ? arr[this.int(arr.length)] : undefined;
    }

    // Percent chance, e.g. chance(35) is true 35% of the time.
    chance(pct) {
      return this.next() * 100 < pct;
    }

    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // Weighted pick: items is [[value, weight], ...].
    weighted(items) {
      const total = items.reduce((s, it) => s + Math.max(0, it[1]), 0);
      if (total <= 0) return this.pick(items.map((it) => it[0]));
      let r = this.next() * total;
      for (const [v, w] of items) {
        r -= Math.max(0, w);
        if (r < 0) return v;
      }
      return items[items.length - 1][0];
    }
  }

  CE.Rng = Rng;
})(window.CE = window.CE || {});
