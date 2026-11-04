// Bot players for test mode and batch runs. They answer any prompt the engine sends.
(function (CE) {
  'use strict';

  const evil = (g, p) => g.isEvil(p);
  // Bots draw from their own generator in test mode, so UI timing does not change the game's dice.
  const R = (g) => g.botRng || g.rng;

  function weightedOption(g, p, prompt) {
    const dec = prompt.meta && prompt.meta.dec;
    const opts = prompt.options;
    if (p.personality === 'veletlen' && R(g).chance(50)) return R(g).pick(opts).k;
    const items = opts.map((o) => {
      const src = dec && dec.options ? dec.options.find((x) => x.k === o.k) : null;
      const w = src && src.w ? (evil(g, p) ? src.w.traitor : src.w.loyal) : 1;
      let bias = 1;
      if (p.personality === 'ovatos' && /Hátrál|Hasra|Futok|Nem/.test(o.t)) bias = 1.6;
      if (p.personality === 'bator' && /Patronum|Stupor|Vállal/.test(o.t)) bias = 1.6;
      return [o.k, (w == null ? 1 : w) * bias];
    });
    return R(g).weighted(items);
  }

  // What this bot believes about who is suspicious, from its own secret pages.
  function suspects(g, p) {
    const score = {};
    p.inbox.forEach((page) => {
      const m = /^Láttad, hogy (\S+)/.exec(page.text);
      if (m) { const t = g.players.find((x) => x.name === m[1]); if (t) score[t.id] = (score[t.id] || 0) + 3; }
      const v = /^Veritaszérum: (\S+) Bellatrix/.exec(page.text);
      if (v) { const t = g.players.find((x) => x.name === v[1]); if (t) score[t.id] = (score[t.id] || 0) + 6; }
    });
    return score;
  }

  function suspicionVote(g, p, prompt) {
    const opts = prompt.options;
    if (evil(g, p)) {
      const innocents = opts.filter((o) => o.k !== 'none' && !g.isEvil(g.players[+o.k]));
      return R(g).chance(70) && innocents.length ? R(g).pick(innocents).k : 'none';
    }
    const score = suspects(g, p);
    const best = opts.filter((o) => o.k !== 'none').sort((a, b) => (score[b.k] || 0) - (score[a.k] || 0))[0];
    if (best && score[best.k]) return best.k;
    return R(g).chance(45) ? 'none' : R(g).pick(opts).k;
  }

  function kozben(g, p, prompt) {
    const has = (k) => prompt.options.find((o) => o.k === k || o.k.startsWith(k));
    const sab = prompt.options.find((o) => o.k.startsWith('sab:'));
    if (p.traitor || p.traitor2) {
      if (has('stealwand') && R(g).chance(60)) return { k: 'stealwand' };
      if (has('fake') && R(g).chance(12)) {
        const t = R(g).pick(prompt.targets);
        return { k: 'fake', to: t ? t.id : null };
      }
      if (sab && R(g).chance(55)) return { k: sab.k };
      if (has('sneak') && R(g).chance(40)) return { k: 'sneak' };
      return { k: R(g).chance(70) ? 'help' : 'watch' };
    }
    if (p.heir && sab && R(g).chance(40)) return { k: sab.k };
    if (has('mapwatch') && R(g).chance(25)) return { k: 'mapwatch' };
    if (has('give') && prompt.items.length && R(g).chance(8)) {
      const t = R(g).pick(prompt.targets);
      return { k: 'give', item: R(g).pick(prompt.items).id, to: t ? t.id : null };
    }
    const watchPct = p.personality === 'ovatos' ? 50 : 35;
    return { k: R(g).chance(watchPct) ? 'watch' : 'help' };
  }

  CE.Bot = {
    answer(g, p, prompt) {
      const meta = prompt.meta || {};
      switch (prompt.kind) {
        case 'ack': return { k: 'ok' };
        case 'memory': return { text: R(g).chance(70) ? 'egy havas reggel otthon' : null };
        case 'text': {
          const q = CE.QUESTIONS[meta.qi] || CE.QUESTIONS[0];
          return { text: R(g).pick((p.traitor || p.traitor2) ? q.ta : q.a) };
        }
        case 'volunteer': {
          const b = (meta.dec && meta.dec.bot) || {};
          const pct = evil(g, p) ? (b.traitor != null ? b.traitor : 25) : (b.loyal != null ? b.loyal : 25);
          return { k: R(g).chance(pct) ? 'yes' : 'no' };
        }
        case 'kozben': return kozben(g, p, prompt);
        case 'choice': {
          const toggles = [];
          (prompt.toggles || []).forEach((t) => {
            if (t.id === 'felix' && R(g).chance(30)) toggles.push('felix');
            if (t.id === 'kiteres' && R(g).chance(p.personality === 'bator' ? 60 : 30)) toggles.push('kiteres');
            if (t.id === 'big' && R(g).chance(35)) toggles.push('big');
          });
          if (meta.type === 'suspicion') return { k: suspicionVote(g, p, prompt), toggles };
          if (meta.type === 'whisper') {
            if (!R(g).chance(55) || !prompt.targets.length) return { k: 'none' };
            const sus = suspects(g, p);
            const t = R(g).pick(prompt.targets);
            const word = sus[t.id] ? 'w:Ne bízz' : R(g).pick(prompt.options.filter((o) => o.k !== 'none')).k;
            return { k: word, to: t.id };
          }
          if (meta.type === 'trust') {
            const hold = evil(g, p) ? 60 : 82;
            return { k: R(g).chance(hold) ? 'hold' : 'let' };
          }
          if (meta.type === 'rescue') {
            const yes = prompt.options.filter((o) => o.k !== 'no');
            const pct = evil(g, p) ? 40 : 75;
            const pref = yes.find((o) => o.k !== 'escort') || yes[0];
            if (!pref || !R(g).chance(pct)) return { k: 'no' };
            if (pref.k === 'escort' && R(g).chance(50)) return { k: 'no' };
            return { k: pref.k };
          }
          if (meta.type === 'vote' || meta.type === 'spotlight' || meta.type === 'reflex') return { k: weightedOption(g, p, prompt), toggles };
          return { k: R(g).pick(prompt.options).k, toggles };
        }
        default: return { k: 'ok' };
      }
    },

    // A bot sometimes asks for more time (R10); traitors more often.
    wantsTime(g, p) { return R(g).chance(evil(g, p) ? 12 : 3); }
  };
})(window.CE = window.CE || {});
