// Headless batch runner: plays many games with bots only and collects balance statistics.
(function (CE) {
  'use strict';

  function makeBatchIO(errors) {
    let vt = 0;
    const io = {
      game: null,
      now: () => vt,
      ms: (sec) => sec * 1000,
      sleep: (ms) => { vt += ms; return Promise.resolve(); },
      narrate: async () => {},
      result: async () => {},
      prompt: (p, pr) => Promise.resolve(CE.Bot.answer(io.game, p, pr)),
      clear() {}, progress() {}, secret() {}, vibrate() {}, notice() {}, update() {}, log() {}, patronus() {},
      debate: async () => {}, answers: async () => {}, tally: async () => {}, info: async () => {}, reveal: async () => {},
      ending: async () => {}, tree: async () => {},
      missing(id) { errors.push({ kind: 'missing', id }); },
      error(e, scene) { errors.push({ kind: 'error', scene, message: String(e && e.message || e), stack: e && e.stack }); }
    };
    return io;
  }

  CE.runBatch = async function (opts, onProgress) {
    const n = opts.runs || 200;
    const counts = opts.counts || [4, 5, 6, 7, 8, 9, 10];
    const errors = [];
    const stats = {
      runs: 0, byCount: {}, cmd: {}, suspicion: { correct: 0, wrong: 0, none: 0 }, deaths: 0, frozen: 0, dying: 0,
      spotted: 0, sneaks: 0, visited: {}, cross: {}, visions: 0, goals: {}, extensions: 0, traitorCmdOk: 0, defense: 0, ostrom: 0,
      endings: {}, evilWins: 0, finished: 0, secondTouch: 0
    };
    for (let i = 0; i < n; i++) {
      const count = counts[i % counts.length];
      const io = makeBatchIO(errors);
      const settings = Object.assign({}, opts.settings || {}, { count, humans: [] });
      const g = new CE.Game({ settings, io, seed: (opts.seed || 1000) + i });
      io.game = g;
      g.setup();
      const res = await g.run('P1');
      stats.runs += 1;
      const bc = (stats.byCount[count] = stats.byCount[count] || { runs: 0, cmdOk: 0, caught: 0, deaths: 0, evilWins: 0, finished: 0 });
      bc.runs += 1;
      const end = g.s.ending;
      if (end) {
        stats.finished += 1; bc.finished += 1;
        stats.endings[end.name || end.id] = (stats.endings[end.name || end.id] || 0) + 1;
        if (!(end.winners || []).includes('csapat')) { stats.evilWins += 1; bc.evilWins += 1; }
      }
      if (g.players.some((p) => p.traitor2)) stats.secondTouch += 1;
      Object.values(g.s.cmdResults).forEach((r) => {
        const c = (stats.cmd[r.code] = stats.cmd[r.code] || { ok: 0, n: 0 });
        c.n += 1; if (r.ok) { c.ok += 1; stats.traitorCmdOk += 1; bc.cmdOk += 1; }
      });
      (g.s.suspicionResults || []).forEach((r) => { if (r.correct) { stats.suspicion.correct += 1; bc.caught += 1; } else stats.suspicion.wrong += 1; });
      if (!(g.s.suspicionResults || []).length) stats.suspicion.none += 1;
      stats.deaths += g.s.deaths.length; bc.deaths += g.s.deaths.length;
      g.players.forEach((p) => {
        stats.frozen += p.stats.frozen;
        stats.spotted += p.spottedBy.length ? 1 : 0;
        if (p.goal) { const gs = (stats.goals[p.goal.id] = stats.goals[p.goal.id] || { ok: 0, n: 0, later: 0 }); const v = g.goalStatus(p); gs.n += 1; if (v === true) gs.ok += 1; if (v === null) gs.later += 1; }
      });
      Object.values(g.s.sceneLog).forEach((arr) => arr.forEach((a) => { if (a.kind === 'sneak') stats.sneaks += 1; }));
      g.s.history.forEach((id) => { stats.visited[id] = (stats.visited[id] || 0) + 1; });
      g.s.log.filter((e) => e.kind === 'útkereszteződés').forEach((e) => { const id = (/: (U\d+)/.exec(e.text) || [])[1]; if (id) stats.cross[id] = (stats.cross[id] || 0) + 1; });
      stats.visions += g.s.visionsSeen.length;
      stats.extensions += g.s.extensions;
      stats.defense += g.s.defense;
      stats.ostrom += g.f.ostrom;
      if (res.end === 'error') { /* already recorded */ }
      if (onProgress && i % 5 === 0) { onProgress(i + 1, n); await new Promise((r) => setTimeout(r, 0)); }
    }
    stats.unvisited = Object.keys(CE.SCENES).filter((id) => !stats.visited[id]);
    stats.errors = errors;
    return stats;
  };
})(window.CE = window.CE || {});
