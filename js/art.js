// Csendes éj: TV art library. Every function returns an HTML/SVG string (inline SVG + divs, no images,
// no libraries), styled and animated by css/art.css. Works from file:// and GitHub Pages.
//
// window.CE.art:
//   background(key)            full-bleed scene background (.art-bg), keys in CE.art.BACKGROUNDS
//   character(id, opts)        one standing silhouette (<svg class="art-char">), ids in CE.art.CHARACTERS
//   characters(ids)            up to 3 figures in edge slots (.art-chars), ready to drop into #tv
//   patronus(animal)           silver glowing patronus (.art-patronus), ids in CE.art.PATRONUSES
//   effect(name, opts)         overlay effect (.art-fx), names in CE.art.EFFECTS, durations in CE.art.FX_DURATION
//   play(el, name, opts)       appends an effect to el and removes it when it has finished (DOM helper)
//   player(name, opts)         round player token (<svg class="art-token">), opts.status: el|dermedt|haldoklik|szellem|bezarva
//   forScene(id) / forEnding(key) / forEvent(id)   art entry { bg, chars, fx, patronus? }
//   scene(id)                  background + characters + effects of a scene, as one string
//   setVariant(seed)           per-game look (mood, snowfall, moon, decorations, alternative backgrounds);
//                              integer seed → always the same look, null/undefined → default look.
//                              Affects everything drawn after the call (redraw the TV once after it).
//   getVariant()               the current variant as a plain object (null when none)
// CE.SCENE_ART / CE.EVENT_ART / CE.ENDING_ART hold the mapping.
//
// Typical TV use (#tv is position: relative, 16:9, container-type: inline-size):
//   tv.querySelectorAll('.art-bg, .art-chars, .art-fx, .art-patronus').forEach((n) => n.remove());
//   tv.insertAdjacentHTML('afterbegin', CE.art.scene(sceneId));   // first children = behind the text
//   CE.art.play(tv, 'death');                                     // one-shot effect, removes itself
//   chip.innerHTML = CE.art.player(p.name, { status: p.status, index: p.id }) + name;
// Remove the old art nodes on every scene change: each background keeps a few GPU layers alive.
(function (CE) {
  'use strict';

  // ---------- small helpers ----------
  let uidCounter = 0;
  // Every SVG gets its own id prefix, so gradients never collide when many SVGs share a page.
  const uid = () => `ca${(uidCounter++).toString(36)}`;
  const n1 = (v) => Math.round(v * 10) / 10;

  function prng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }

  // Per-game look (see setVariant near the public API). null = the default look, exactly as before.
  let VAR = null;
  // Great Hall tree styles (Prisoner of Azkaban: some trees glitter with tiny icicles, some with candles).
  const TREE_STYLES = {
    gold: { bauble: '#d6b261', light: '#ffe7a8', glow: 'gw' },
    icicle: { bauble: '#cfdde8', light: '#e6f4ff', glow: 'gc' },
    red: { bauble: '#c43a34', light: '#ffd890', glow: 'gw' }
  };

  const stops = (list) => list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');
  const lin = (id, list, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
  const rad = (id, list, cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(list)}</radialGradient>`;

  // Shared glow gradients (warm candle, cold moon, curse green, ember, white-gold).
  function glowDefs(p) {
    return rad(`${p}gw`, [[0, '#ffe2a0', 0.9], [0.28, '#ffbe5c', 0.36], [1, '#ff9a3a', 0]])
      + rad(`${p}gc`, [[0, '#dcebf6', 0.5], [0.4, '#a9c4d6', 0.16], [1, '#a9c4d6', 0]])
      + rad(`${p}gg`, [[0, '#8dffbc', 0.75], [0.35, '#3fd27a', 0.25], [1, '#1f8a4a', 0]])
      + rad(`${p}ge`, [[0, '#ffc070', 0.85], [0.35, '#ff6a2a', 0.36], [1, '#b02a0a', 0]])
      + rad(`${p}gs`, [[0, '#ffffff', 0.85], [0.3, '#e6f0f8', 0.3], [1, '#c8dcea', 0]]);
  }
  const glow = (p, kind, x, y, rx, ry = rx, op = 1) => `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="url(#${p}${kind})"${op < 1 ? ` opacity="${op}"` : ''}/>`;

  const VB = 'viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"';
  // One full-bleed SVG layer. All layers share the viewBox, so they line up exactly.
  const layer = (inner, cls = '', style = '') => `<svg class="art-l${cls ? ` ${cls}` : ''}" ${VB}${style ? ` style="${style}"` : ''} aria-hidden="true" focusable="false">${inner}</svg>`;
  // A wrapper div that moves several layers together (e.g. candles bob while their glow flickers).
  const group = (cls, inner) => `<div class="art-l ${cls}">${inner}</div>`;

  // Ambient HTML layers (CSS particles and fog, compositor-animated).
  const flakes = (...kinds) => kinds.map((k) => `<i class="art-flakes art-flakes--${k}"></i>`).join('');
  const AMB = {
    snow: `<div class="art-amb art-snow">${flakes('b', 'a')}</div>`,
    snowLight: `<div class="art-amb art-snow art-snow--light">${flakes('b', 'a')}</div>`,
    ceiling: `<div class="art-amb art-snow art-snow--ceiling">${flakes('b', 'a')}</div>`,
    window: (mx, my) => `<div class="art-amb art-snow art-snow--window" style="--mx:${mx}%;--my:${my}%">${flakes('b', 'a')}</div>`,
    stream: (mx, my) => `<div class="art-amb art-snow art-snow--stream" style="--mx:${mx}%;--my:${my}%">${flakes('b', 'a')}</div>`,
    ash: `<div class="art-amb art-ash">${flakes('ash')}</div>`,
    embers: `<div class="art-amb art-embers">${flakes('emb', 'emb2')}</div>`,
    dust: `<div class="art-amb art-snow" style="opacity:.14">${flakes('b')}</div>`,
    fog: '<div class="art-amb art-fog"><i></i><i></i></div>',
    fogHigh: '<div class="art-amb art-fog art-fog--high"><i></i><i></i></div>',
    fogGreen: '<div class="art-amb art-fog art-fog--green"><i></i><i></i></div>',
    smoke: '<div class="art-amb art-fog art-fog--smoke"><i></i><i></i></div>'
  };

  // ---------- drawing primitives (viewBox 0 0 1600 900) ----------
  const P = {};

  // Stars as zero-length round-capped strokes: three size classes, one path each (very compact).
  P.stars = (rnd, n, x0, y0, x1, y1, maxR = 1.8, op = 1) => {
    const d = ['', '', ''];
    for (let i = 0; i < n; i++) {
      const k = rnd() < 0.62 ? 0 : rnd() < 0.75 ? 1 : 2;
      d[k] += `M${Math.round(x0 + rnd() * (x1 - x0))} ${Math.round(y0 + rnd() * (y1 - y0))}h0`;
    }
    return d.map((p, k) => (p ? `<path d="${p}" stroke="#eef4fa" stroke-linecap="round" stroke-width="${n1(maxR * (0.7 + k * 0.75))}" opacity="${n1(op * (0.45 + k * 0.25))}"/>` : '')).join('');
  };

  // Moon in a night sky (needs glowDefs(p)). keep = the background always had a moon: without a variant
  // the original crescent is drawn; with one, phase / position / side come from the variant.
  // Without keep, the moon only appears in variants that show it. The phase is cut with a mask, so it
  // works on any sky colour.
  P.moon = (p, keep = false) => {
    const m = VAR ? VAR.moon : null;
    if (!m) return keep ? `${glow(p, 'gc', 1290, 130, 170)}<circle cx="1290" cy="130" r="34" fill="#eef2f4"/><circle cx="1305" cy="121" r="31" fill="#0a1424"/>` : '';
    if (!keep && !m.show) return '';
    const x = n1(m.x);
    const y = n1(m.y);
    const full = m.phase === 'full';
    let s = glow(p, 'gc', x, y, full ? 210 : 170, full ? 210 : 170, full ? 1 : 0.9);
    if (full) return `${s}<circle cx="${x}" cy="${y}" r="34" fill="#eef2f4"/><g fill="#c6d0d8" opacity=".55"><circle cx="${n1(x - 9)}" cy="${n1(y - 7)}" r="9"/><circle cx="${n1(x + 11)}" cy="${n1(y + 9)}" r="7"/><circle cx="${n1(x + 6)}" cy="${n1(y - 14)}" r="4"/></g>`;
    const d = m.phase === 'thin' ? 11 : 19;
    s += `<mask id="${p}mm"><rect x="${n1(x - 40)}" y="${n1(y - 40)}" width="80" height="80" fill="#fff"/><circle cx="${n1(x + m.side * d * 0.86)}" cy="${n1(y - d * 0.5)}" r="32" fill="#000"/></mask>`;
    return `${s}<circle cx="${x}" cy="${y}" r="34" fill="#eef2f4" mask="url(#${p}mm)"/>`;
  };

  // Soft cloud banks made of radial-gradient ellipses (needs cloudDef with the same id).
  P.cloudDef = (id, col, op) => rad(id, [[0, col, op], [0.6, col, op * 0.45], [1, col, 0]]);
  P.clouds = (id, list) => list.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`).join('');

  // Pointed (equilateral) gothic arch: apex at (x + w/2, y), sides down to y + h.
  P.arch = (x, y, w, h) => {
    const a = w * 0.866;
    return `M${n1(x)} ${n1(y + h)}V${n1(y + a)}A${n1(w)} ${n1(w)} 0 0 1 ${n1(x + w / 2)} ${n1(y)}A${n1(w)} ${n1(w)} 0 0 1 ${n1(x + w)} ${n1(y + a)}V${n1(y + h)}Z`;
  };
  // Round-topped arch.
  P.rarch = (x, y, w, h) => `M${n1(x)} ${n1(y + h)}V${n1(y + w / 2)}A${n1(w / 2)} ${n1(w / 2)} 0 0 1 ${n1(x + w)} ${n1(y + w / 2)}V${n1(y + h)}Z`;

  P.window = (x, y, w, h, glass, frame, tracery = true) => {
    const fw = Math.max(1.5, w * 0.05);
    return `<path d="${P.arch(x, y, w, h)}" fill="${glass}"/>`
      + (tracery ? `<path d="M${n1(x + w / 2)} ${n1(y + w * 0.62)}V${n1(y + h)}M${n1(x)} ${n1(y + h * 0.64)}H${n1(x + w)}M${n1(x)} ${n1(y + h * 0.84)}H${n1(x + w)}" stroke="${frame}" stroke-width="${n1(fw)}"/>`
        + `<circle cx="${n1(x + w / 2)}" cy="${n1(y + w * 0.5)}" r="${n1(w * 0.17)}" fill="none" stroke="${frame}" stroke-width="${n1(fw * 0.8)}"/>` : '')
      + `<path d="${P.arch(x, y, w, h)}" fill="none" stroke="${frame}" stroke-width="${n1(fw * 1.6)}"/>`;
  };

  // Conifer silhouette with drooping branch tiers; snow = opacity of the snow on the branches.
  P.pine = (rnd, x, base, h, fill, snow = 0) => {
    const w = h * 0.34;
    const L = [];
    const R = [];
    const tiers = Math.max(4, Math.min(9, Math.round(h / 34)));
    let sd = '';
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers;
      const y = base - h * 0.06 - (h * 0.94) * (1 - t);
      const hw = w * (0.15 + 0.85 * t) * (0.86 + rnd() * 0.28);
      const up = h * 0.05;
      L.push(`${Math.round(x - hw)} ${Math.round(y)}`, `${Math.round(x - hw * 0.4)} ${Math.round(y - up)}`);
      R.push(`${Math.round(x + hw * 0.4)} ${Math.round(y - up)}`, `${Math.round(x + hw)} ${Math.round(y)}`);
      if (snow && rnd() < 0.6) sd += `M${Math.round(x - hw * 0.95)} ${Math.round(y - 2)}L${Math.round(x - hw * 0.7)} ${Math.round(y - up * 0.55)}M${Math.round(x + hw * 0.72)} ${Math.round(y - up * 0.55)}L${Math.round(x + hw * 0.94)} ${Math.round(y - 3)}`;
    }
    let s = `<path d="M${Math.round(x)} ${Math.round(base - h)}L${L.join('L')}L${Math.round(x - w * 0.06)} ${Math.round(base)}H${Math.round(x + w * 0.06)}L${R.reverse().join('L')}Z" fill="${fill}"/>`;
    if (sd) s += `<path d="${sd}" stroke="#dfe9f1" stroke-opacity="${snow}" stroke-width="${n1(Math.max(1.5, h / 90))}" fill="none" stroke-linecap="round"/>`;
    return s;
  };

  // Gnarled bare tree: recursive tapering branches.
  P.bare = (rnd, x, base, h, color, spread = 1, depthMax = 5) => {
    let s = '';
    const branch = (x0, y0, ang, len, w, depth) => {
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      const bend = (rnd() - 0.5) * len * 0.4;
      const mx = (x0 + x1) / 2 + Math.cos(ang + Math.PI / 2) * bend;
      const my = (y0 + y1) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      s += `<path d="M${n1(x0)} ${n1(y0)}Q${n1(mx)} ${n1(my)} ${n1(x1)} ${n1(y1)}" stroke-width="${n1(w)}"/>`;
      if (depth >= depthMax || len < 8) return;
      const k = 2 + (rnd() < 0.35 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const da = (rnd() - 0.5) * 1.3 * spread + (i - (k - 1) / 2) * 0.45 * spread;
        branch(x1, y1, ang + da, len * (0.62 + rnd() * 0.18), w * 0.62, depth + 1);
      }
    };
    branch(x, base, -Math.PI / 2 + (rnd() - 0.5) * 0.2, h * 0.38, h * 0.07, 0);
    return `<g stroke="${color}" stroke-linecap="round" fill="none">${s}</g>`;
  };

  // Spider web: radial threads and sagging rings.
  P.web = (x, y, r, op = 0.35, a0 = 0, a1 = Math.PI * 2) => {
    const spokes = 9;
    let d = '';
    const pts = [];
    for (let i = 0; i <= spokes; i++) {
      const a = a0 + (a1 - a0) * (i / spokes);
      pts.push(a);
      d += `M${n1(x)} ${n1(y)}L${n1(x + Math.cos(a) * r)} ${n1(y + Math.sin(a) * r)}`;
    }
    for (let k = 1; k <= 5; k++) {
      const rr = (r * k) / 5.4;
      pts.forEach((a, i) => {
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) { d += `M${n1(px)} ${n1(py)}`; return; }
        const am = (a + pts[i - 1]) / 2;
        d += `Q${n1(x + Math.cos(am) * rr * 0.86)} ${n1(y + Math.sin(am) * rr * 0.86)} ${n1(px)} ${n1(py)}`;
      });
    }
    return `<path d="${d}" fill="none" stroke="#cfdbe4" stroke-opacity="${op}" stroke-width="1.1"/>`;
  };

  // Hanging chain: two interleaved dash rows give a link look.
  P.chain = (x1, y1, x2, y2, sag = 30, w = 5, col = '#8d969a') => {
    const d = `M${n1(x1)} ${n1(y1)}Q${n1((x1 + x2) / 2)} ${n1((y1 + y2) / 2 + sag)} ${n1(x2)} ${n1(y2)}`;
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${n1(w * 1.6)} ${n1(w * 0.9)}" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#111" stroke-width="${n1(w * 0.45)}" stroke-dasharray="${n1(w * 1.2)} ${n1(w * 1.3)}" stroke-dashoffset="${n1(w * 0.4)}" opacity=".7"/>`;
  };

  // Wall torch: iron bracket; the flame and glow go to a flicker layer (torchFlame).
  P.torch = (x, y, s = 1) => `<path d="M${n1(x - 4 * s)} ${n1(y + 30 * s)}L${n1(x - 9 * s)} ${n1(y)}H${n1(x + 9 * s)}L${n1(x + 4 * s)} ${n1(y + 30 * s)}Z" fill="#2a2420"/><path d="M${n1(x)} ${n1(y + 30 * s)}V${n1(y + 48 * s)}M${n1(x - 8 * s)} ${n1(y + 44 * s)}H${n1(x + 8 * s)}" stroke="#1a1614" stroke-width="${n1(4 * s)}"/>`;
  P.torchFlame = (p, x, y, s = 1, op = 1) => glow(p, 'gw', x, y - 8 * s, 150 * s, 170 * s, 0.85 * op)
    + `<path d="M${n1(x)} ${n1(y - 30 * s)}C${n1(x + 10 * s)} ${n1(y - 16 * s)} ${n1(x + 10 * s)} ${n1(y - 2 * s)} ${n1(x)} ${n1(y + 2 * s)}C${n1(x - 10 * s)} ${n1(y - 2 * s)} ${n1(x - 9 * s)} ${n1(y - 14 * s)} ${n1(x)} ${n1(y - 30 * s)}Z" fill="#ffb24d"/>`
    + `<path d="M${n1(x)} ${n1(y - 18 * s)}C${n1(x + 5 * s)} ${n1(y - 9 * s)} ${n1(x + 4 * s)} ${n1(y - 2 * s)} ${n1(x)} ${n1(y)}C${n1(x - 4 * s)} ${n1(y - 2 * s)} ${n1(x - 5 * s)} ${n1(y - 9 * s)} ${n1(x)} ${n1(y - 18 * s)}Z" fill="#fff0c0"/>`;

  // Small candle flame (no body).
  P.flame = (x, y, s = 1, col = '#ffe7a8') => `<path d="M${n1(x)} ${n1(y - 13 * s)}Q${n1(x + 4.5 * s)} ${n1(y - 5 * s)} ${n1(x)} ${n1(y)}Q${n1(x - 4.5 * s)} ${n1(y - 5 * s)} ${n1(x)} ${n1(y - 13 * s)}Z" fill="${col}"/>`;

  // Suit of armour with a halberd, standing on a plinth. (x, base) = bottom centre.
  // Drawn in a local frame (origin = bottom centre, y up is negative), then placed with a transform.
  const ARMOUR = '<rect x="-36" y="-20" width="72" height="20" fill="#121715"/>'
    + '<path d="M50 -20V-326" stroke="#3a3128" stroke-width="4"/>'
    + '<g fill="url(#G)">'
    + '<path d="M50 -334l-5 20h10zM50 -300q24 2 26 24q-6 14 -26 10zM50 -296q-12 4 -14 14q8 -2 14 2z"/>'
    + '<path d="M-24 -20h16l2 -52l-2 -58h-14l-3 58zM24 -20h-16l-2 -52l2 -58h14l3 58z"/>'
    + '<ellipse cx="-17" cy="-22" rx="13" ry="6"/><ellipse cx="17" cy="-22" rx="13" ry="6"/>'
    + '<path d="M-27 -128h54l-4 -34h-46z"/>'
    + '<path d="M-26 -160q-6 -40 0 -68q26 -12 52 0q6 28 0 68q-26 8 -52 0z"/>'
    + '<path d="M-40 -222h11v50l-4 30h-10l2 -32zM30 -222h10l5 42l9 18l-9 7l-11 -24z"/>'
    + '<ellipse cx="-30" cy="-224" rx="15" ry="10"/><ellipse cx="30" cy="-224" rx="15" ry="10"/>'
    + '<ellipse cx="-38" cy="-138" rx="6" ry="7"/><ellipse cx="50" cy="-158" rx="7" ry="6"/>'
    + '<path d="M-11 -236h22v8h-22z"/>'
    + '<path d="M-15 -238q-2 -26 15 -30q17 4 15 30q-15 6 -30 0z"/>'
    + '</g>'
    + '<path d="M-10 -252h20" stroke="#050706" stroke-width="3"/>'
    + '<path d="M-6 -222v-56M-17 -36v-80M15 -36v-80" stroke="#e6ecee" stroke-width="2" opacity=".35"/>'
    + '<path d="M0 -268v-14" stroke="#7a2a24" stroke-width="5" stroke-linecap="round"/>';
  P.armour = (p, x, base, s = 1) => `<g transform="translate(${n1(x)} ${n1(base)}) scale(${s})">${ARMOUR.replace(/url\(#G\)/g, `url(#${p}arm)`)}</g>`;
  P.armourDefs = (p, warm = true) => lin(`${p}arm`, warm
    ? [[0, '#8e8a7c'], [0.35, '#4a4a46'], [0.7, '#2a2d2c'], [1, '#6a604a']]
    : [[0, '#a9b8c2'], [0.35, '#4c5860'], [0.7, '#262e33'], [1, '#56646c']], 0, 0, 1, 0);

  // Gilded portrait frame with a dim bust; mood = background tint.
  P.portrait = (x, y, w, h, bg = '#2a2a22', figure = '#141412', frame = '#8a6c2e', oval = false) => {
    const fx = x + w / 2;
    const bust = `<path d="M${n1(fx - w * 0.3)} ${n1(y + h)}q${n1(w * 0.02)} -${n1(h * 0.28)} ${n1(w * 0.2)} -${n1(h * 0.32)}q-${n1(w * 0.1)} -${n1(h * 0.1)} -${n1(w * 0.08)} -${n1(h * 0.24)}a${n1(w * 0.12)} ${n1(h * 0.13)} 0 1 1 ${n1(w * 0.36)} 0q${n1(w * 0.02)} ${n1(h * 0.14)} -${n1(w * 0.08)} ${n1(h * 0.24)}q${n1(w * 0.18)} ${n1(h * 0.04)} ${n1(w * 0.2)} ${n1(h * 0.32)}z" fill="${figure}"/>`;
    const shape = oval ? `<ellipse cx="${n1(fx)}" cy="${n1(y + h / 2)}" rx="${n1(w / 2)}" ry="${n1(h / 2)}"` : `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}"`;
    const fw = Math.max(2, w * 0.07);
    return `${shape} fill="${bg}"/>${bust}${shape} fill="none" stroke="${frame}" stroke-width="${n1(fw)}"/>`
      + `${shape} fill="none" stroke="#e8cf8a" stroke-opacity=".25" stroke-width="${n1(fw * 0.25)}"/>`;
  };

  // Hogsmeade cottage: snowy steep roof, chimney, lit windows. (x = left, base = ground y)
  P.cottage = (x, base, w, h, opts = {}) => {
    const wall = opts.wall || '#1d1a1c';
    const roof = opts.roof || '#121216';
    const lit = opts.lit || '#f2b45c';
    const rh = h * 0.75;
    const r = opts.rnd || Math.random;
    let s = `<rect x="${n1(x)}" y="${n1(base - h)}" width="${n1(w)}" height="${n1(h)}" fill="${wall}"/>`;
    s += `<rect x="${n1(x + w * 0.72)}" y="${n1(base - h - rh * 0.9)}" width="${n1(w * 0.1)}" height="${n1(rh * 0.6)}" fill="${roof}"/>`;
    s += `<path d="M${n1(x - w * 0.08)} ${n1(base - h)}L${n1(x + w / 2)} ${n1(base - h - rh)}L${n1(x + w * 1.08)} ${n1(base - h)}Z" fill="${roof}"/>`;
    s += `<path d="M${n1(x - w * 0.09)} ${n1(base - h + 2)}L${n1(x + w / 2)} ${n1(base - h - rh - 3)}L${n1(x + w * 1.09)} ${n1(base - h + 2)}L${n1(x + w * 0.9)} ${n1(base - h - rh * 0.22)}L${n1(x + w * 0.5)} ${n1(base - h - rh * 0.8)}L${n1(x + w * 0.1)} ${n1(base - h - rh * 0.2)}Z" fill="#cfdde8" opacity=".75"/>`;
    const wins = opts.wins || 2;
    for (let i = 0; i < wins; i++) {
      const ww = w * (opts.shop && i === 0 ? 0.42 : 0.18);
      const wh = h * (opts.shop && i === 0 ? 0.42 : 0.26);
      const wx = x + w * (wins === 1 ? 0.41 : (opts.shop && i === 0 ? 0.08 : 0.16 + i * 0.5));
      const wy = base - h * (opts.shop && i === 0 ? 0.62 : 0.72);
      if (r() < (opts.litChance === undefined ? 0.85 : opts.litChance)) s += `<rect x="${n1(wx - ww * 0.6)}" y="${n1(wy - wh * 0.6)}" width="${n1(ww * 2.2)}" height="${n1(wh * 2.2)}" fill="${lit}" opacity=".12"/>`;
      s += `<rect x="${n1(wx)}" y="${n1(wy)}" width="${n1(ww)}" height="${n1(wh)}" fill="${lit}" opacity=".88"/>`
        + `<path d="M${n1(wx + ww / 2)} ${n1(wy)}v${n1(wh)}M${n1(wx)} ${n1(wy + wh / 2)}h${n1(ww)}" stroke="${wall}" stroke-width="${n1(Math.max(1.5, ww * 0.08))}"/>`
        + `<path d="M${n1(wx)} ${n1(wy + wh)}h${n1(ww)}" stroke="#dfe9f1" stroke-width="${n1(Math.max(2, wh * 0.12))}" opacity=".6"/>`;
    }
    if (opts.door) s += `<path d="${P.rarch(x + w * 0.62, base - h * 0.5, w * 0.16, h * 0.5)}" fill="#0c0a0a"/>`;
    return s;
  };

  // Castle silhouette on a crag. ox = centre x, oy = ground y, s = scale.
  const TOWERS = [[-300, 36, 150, 64], [-262, 54, 205, 0], [-210, 32, 250, 92], [-178, 96, 140, 0], [-92, 150, 118, -44], [52, 34, 330, 120], [-28, 46, 190, 72], [86, 82, 158, 0], [160, 30, 236, 86], [190, 58, 168, 62], [248, 26, 192, 74], [276, 76, 110, 0], [342, 30, 140, 56]];
  P.castle = (rnd, ox, oy, s, fill, win, winOp = 0.9) => {
    let body = '';
    let wins = '';
    TOWERS.forEach(([dx, w, h, roof]) => {
      const x = ox + dx * s;
      const W = w * s;
      const H = h * s;
      body += `<rect x="${n1(x)}" y="${n1(oy - H)}" width="${n1(W)}" height="${n1(H + 2)}"/>`;
      if (roof > 0) body += `<path d="M${n1(x - W * 0.12)} ${n1(oy - H)}L${n1(x + W / 2)} ${n1(oy - H - roof * s)}L${n1(x + W * 1.12)} ${n1(oy - H)}Z"/>`;
      else if (roof < 0) body += `<path d="M${n1(x)} ${n1(oy - H)}L${n1(x + W / 2)} ${n1(oy - H + roof * s)}L${n1(x + W)} ${n1(oy - H)}Z"/>`;
      else {
        const m = Math.max(3, Math.round(W / (9 * s)));
        for (let i = 0; i < m; i += 2) body += `<rect x="${n1(x + (i * W) / m)}" y="${n1(oy - H - 7 * s)}" width="${n1(W / m)}" height="${n1(7 * s + 1)}"/>`;
      }
      const rows = Math.floor(H / (26 * s));
      for (let j = 1; j < rows; j++) {
        for (let i = 0; i < Math.max(1, Math.floor(W / (22 * s))); i++) {
          if (rnd() < 0.42) wins += `<rect x="${n1(x + 6 * s + i * 22 * s)}" y="${n1(oy - H + j * 26 * s)}" width="${n1(4.5 * s)}" height="${n1(8 * s)}" rx="${n1(2 * s)}"/>`;
        }
      }
    });
    const crag = `<path d="M${n1(ox - 420 * s)} ${n1(oy + 60 * s)}Q${n1(ox - 330 * s)} ${n1(oy - 6 * s)} ${n1(ox - 300 * s)} ${n1(oy)}H${n1(ox + 380 * s)}Q${n1(ox + 430 * s)} ${n1(oy + 20 * s)} ${n1(ox + 470 * s)} ${n1(oy + 70 * s)}Z"/>`;
    return `<g fill="${fill}">${body}${crag}</g><g fill="${win}" opacity="${winOp}">${wins}</g>`;
  };

  // Gentle snowy slopes: long smooth waves, optional moonlit rim.
  P.hills = (y, amp, fill, seed, rim = '') => {
    const rnd = prng(seed);
    let d = `M-60 900V${y}`;
    let x = -60;
    let yy = y;
    while (x < 1660) {
      const dx = 300 + rnd() * 260;
      const ny = y + (rnd() - 0.5) * amp;
      d += `C${Math.round(x + dx * 0.4)} ${Math.round(yy)} ${Math.round(x + dx * 0.6)} ${Math.round(ny)} ${Math.round(x + dx)} ${Math.round(ny)}`;
      x += dx;
      yy = ny;
    }
    const top = d.replace(/^M-60 900V/, 'M-60 ');
    return `<path d="${d}V900Z" fill="${fill}"/>${rim ? `<path d="${top}" fill="none" stroke="${rim}" stroke-width="2.5" opacity=".5"/>` : ''}`;
  };

  // Mountain ridge by midpoint displacement (natural, irregular peaks).
  P.ridge = (y, amp, fill, seed, step = 400) => {
    const rnd = prng(seed);
    let pts = [];
    for (let x = -100; x <= 1700; x += step) pts.push([x, y - rnd() * amp]);
    let disp = amp * 0.55;
    for (let k = 0; k < 4; k++) {
      const np = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        np.push([ax, ay], [(ax + bx) / 2, (ay + by) / 2 + (rnd() - 0.55) * disp]);
      }
      np.push(pts[pts.length - 1]);
      pts = np;
      disp *= 0.55;
    }
    return `<path d="M-100 900${pts.map(([px, py]) => `L${Math.round(px)} ${Math.round(Math.min(py, y + amp * 0.2))}`).join('')}L1700 900Z" fill="${fill}"/>`;
  };

  // Christmas tree (Great Hall). burn: 0 normal, 1 burning (dark, fire-rimmed), 2 burnt stump.
  P.xtree = (rnd, x, base, h, burn = 0) => {
    const w = h * 0.4;
    const r = Math.round;
    if (burn === 2) {
      let br = '';
      for (let i = 0; i < 6; i++) {
        const y = base - h * (0.2 + i * 0.13);
        const l = w * (0.9 - i * 0.14);
        br += `M${r(x)} ${r(y)}l${r(-l * (0.6 + rnd() * 0.4))} ${r(l * 0.32)}M${r(x)} ${r(y - 4)}l${r(l * (0.6 + rnd() * 0.4))} ${r(l * 0.28)}`;
      }
      return `<path d="M${r(x)} ${r(base - h * 0.95)}V${r(base)}" stroke="#0b0908" stroke-width="${n1(h * 0.04)}"/><path d="${br}" stroke="#0b0908" stroke-width="${n1(Math.max(1.5, h * 0.012))}" stroke-linecap="round"/>`
        + `<ellipse cx="${r(x)}" cy="${r(base)}" rx="${r(w * 0.9)}" ry="${r(h * 0.035)}" fill="#3a3432" opacity=".6"/>`;
    }
    let d = '';
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const t0 = i / tiers;
      const t1 = Math.min(1, (i + 1.35) / tiers);
      const yTop = base - h + h * t0 * 0.92;
      const yBot = base - h * 0.08 - (h * 0.92) * (1 - t1);
      const half = w * (0.18 + 0.82 * t1);
      d += `M${r(x)} ${r(yTop)}L${r(x - half)} ${r(yBot)}Q${r(x - half * 0.5)} ${r(yBot - h * 0.035)} ${r(x)} ${r(yBot + h * 0.012)}Q${r(x + half * 0.5)} ${r(yBot - h * 0.035)} ${r(x + half)} ${r(yBot)}Z`;
    }
    let s = `<rect x="${r(x - h * 0.03)}" y="${r(base - h * 0.1)}" width="${r(h * 0.06)}" height="${r(h * 0.1)}" fill="#1a120c"/>`;
    if (burn) return `${s}<path d="${d}" fill="#0a0605"/><path d="${d}" fill="none" stroke="#ff8a3a" stroke-width="${n1(Math.max(1.2, h * 0.008))}" opacity=".55"/>`;
    s += `<path d="${d}" fill="#0f2a1f"/><path d="${d}" fill="none" stroke="#2f6046" stroke-width="${n1(Math.max(1, h * 0.006))}" opacity=".75"/>`;
    let balls = '';
    for (let i = 0; i < Math.round(h / 14); i++) {
      const t = 0.15 + rnd() * 0.8;
      balls += `M${r(x + (rnd() * 2 - 1) * w * t * 0.75)} ${r(base - h + h * t * 0.9)}h0`;
    }
    s += `<path d="${balls}" stroke="${VAR ? TREE_STYLES[VAR.trees].bauble : '#d6b261'}" stroke-width="${n1(Math.max(2.6, h * 0.024))}" stroke-linecap="round" opacity=".9"/>`;
    const k = h * 0.012;
    s += `<path d="M${r(x)} ${n1(base - h - k * 5)}l${n1(k)} ${n1(k * 3)} ${n1(k * 3)} ${n1(k)} ${n1(-k * 3)} ${n1(k)} ${n1(-k)} ${n1(k * 3)} ${n1(-k)} ${n1(-k * 3)} ${n1(-k * 3)} ${n1(-k)} ${n1(k * 3)} ${n1(-k)}z" fill="#f0d68a"/>`;
    return s;
  };
  // Tree candle lights (normal) or tree flames (burning) for a flicker layer.
  P.xtreeLights = (p, rnd, x, base, h, burn = 0) => {
    const w = h * 0.4;
    const r = Math.round;
    if (burn === 1) {
      let d = '';
      for (let i = 0; i < 5; i++) {
        const t = 0.2 + i * 0.18;
        const yy = base - h + h * t * 0.95;
        const hw = w * t * 0.9;
        for (let j = 0; j < 3; j++) {
          const fx = x + (j - 1) * hw * 0.7 + (rnd() - 0.5) * hw * 0.3;
          const fh = h * (0.1 + rnd() * 0.12) * (1.2 - t * 0.4);
          const fw = fh * 0.32;
          d += `M${r(fx - fw)} ${r(yy)}C${r(fx - fw)} ${r(yy - fh * 0.5)} ${r(fx - fw * 0.2)} ${r(yy - fh * 0.6)} ${r(fx + fw * 0.2)} ${r(yy - fh)}C${r(fx + fw * 0.3)} ${r(yy - fh * 0.55)} ${r(fx + fw)} ${r(yy - fh * 0.4)} ${r(fx + fw)} ${r(yy)}Z`;
        }
      }
      return glow(p, 'ge', x, base - h * 0.5, w * 1.5, h * 0.7, 0.85)
        + `<path d="${d}" fill="#ff7a28" opacity=".92"/><path d="${d}" fill="#ffd27a" opacity=".6" transform="translate(${r(x * 0.06)} ${r(h * 0.03)}) scale(.94 1)"/>`;
    }
    let c = '';
    for (let i = 0; i < Math.round(h / 10); i++) {
      const t = 0.12 + rnd() * 0.85;
      c += `M${r(x + (rnd() * 2 - 1) * w * t * 0.8)} ${r(base - h + h * t * 0.9)}h0`;
    }
    return glow(p, VAR ? TREE_STYLES[VAR.trees].glow : 'gw', x, base - h * 0.5, w * 1.2, h * 0.62, 0.32)
      + `<path d="${c}" stroke="${VAR ? TREE_STYLES[VAR.trees].light : '#ffe7a8'}" stroke-width="${n1(Math.max(2, h * 0.016))}" stroke-linecap="round"/>`;
  };


  // ---------- backgrounds: each returns a list of layer strings ----------
  const BG = {};

  // Great Hall. state: 0 = Christmas Eve, 1 = burning (siege), 2 = dawn after the fire.
  function greatHall(state) {
    const p = uid();
    const rnd = prng(12);
    const fire = state === 1;
    const burnt = state === 2;
    const sky = fire ? [[0, '#1a0d08'], [0.5, '#3a170a'], [1, '#6e2a0c']]
      : burnt ? [[0, '#3a3a4e'], [0.55, '#76687a'], [1, '#b89488']]
        : [[0, '#050b14'], [0.6, '#0d1a2b'], [1, '#18283b']];
    const glass = fire ? [[0, '#ffb25a', 0.85], [1, '#6a1e08', 0.95]]
      : burnt ? [[0, '#fff0da', 0.95], [1, '#d8a890', 0.95]]
        : [[0, '#3c5a78', 0.9], [1, '#0e1a26', 0.95]];
    const wallA = burnt ? '#1b1c22' : fire ? '#0c0a09' : '#0a0f0d';
    const wallB = burnt ? '#3a3a42' : fire ? '#2a1a12' : '#1c2522';
    const cloudCol = fire ? '#1a0e0a' : burnt ? '#f4e2dc' : '#a8bccf';
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, sky)}${lin(`${p}gl`, glass)}${P.cloudDef(`${p}cl`, cloudCol, fire ? 0.8 : burnt ? 0.35 : 0.13)}`
      + `${lin(`${p}wl`, [[0, wallA], [1, wallB]], 0, 0, 1, 0)}${lin(`${p}wr`, [[0, wallB], [1, wallA]], 0, 0, 1, 0)}`
      + `${lin(`${p}fl`, fire ? [[0, '#2a140a'], [1, '#0a0605']] : burnt ? [[0, '#2a2a30'], [1, '#0c0c0e']] : [[0, '#121815'], [1, '#050807']])}</defs>`;
    d += `<rect width="1600" height="620" fill="url(#${p}sky)"/>`;
    if (!fire) d += P.stars(rnd, burnt ? 24 : 120, 0, 0, 1600, 440, 1.6, burnt ? 0.3 : 1);
    const yTop = (x) => 40 + (160 / 590) * x;
    const yBot = (x) => 960 - (380 / 590) * x;
    // back wall with the great window and the staff table
    d += `<rect x="586" y="196" width="428" height="390" fill="${burnt ? '#24252c' : fire ? '#140c08' : '#111815'}"/>`;
    if (!fire && !burnt) d += glow(p, 'gw', 800, 470, 260, 120, 0.35);
    d += P.window(736, 222, 128, 250, `url(#${p}gl)`, '#0a0f0d');
    d += P.window(646, 300, 52, 150, `url(#${p}gl)`, '#0a0f0d', false) + P.window(902, 300, 52, 150, `url(#${p}gl)`, '#0a0f0d', false);
    let chairs = '';
    for (let i = 0; i < 9; i++) {
      const x = 634 + i * 41;
      const big = i === 4;
      chairs += `<path d="${P.rarch(x - (big ? 3 : 0), big ? 474 : 492, big ? 22 : 16, big ? 50 : 32)}"/>`;
    }
    d += `<g fill="#0b0f0e">${chairs}</g><rect x="606" y="520" width="388" height="28" fill="#0b0e0d"/><path d="M606 521h388" stroke="#d6b261" stroke-opacity=".4" stroke-width="2"/>`;
    // side walls with pillars and tall windows
    d += `<path d="M0 40L590 200V584L0 960Z" fill="url(#${p}wl)"/><path d="M1600 40L1010 200V584L1600 960Z" fill="url(#${p}wr)"/>`;
    const cols = [0, 150, 282, 382, 456, 514, 558, 590];
    let wins = '';
    let pillars = '';
    for (let i = 0; i < cols.length - 1; i++) {
      const m = (cols[i] + cols[i + 1]) / 2;
      const H = yBot(m) - yTop(m);
      const ww = (cols[i + 1] - cols[i]) * 0.42;
      const wy = yTop(m) + H * 0.1;
      const wh = H * 0.46;
      [m - ww / 2, 1600 - m - ww / 2].forEach((wx) => {
        if (burnt) wins += glow(p, 'gw', wx + ww / 2, wy + wh / 2, ww * 1.6, wh * 0.8, 0.35);
        wins += P.window(wx, wy, ww, wh, `url(#${p}gl)`, '#0a0f0d', ww > 30);
      });
    }
    cols.slice(1, -1).forEach((x) => {
      const H = yBot(x) - yTop(x);
      const pw = 34 * (H / 920);
      [x, 1600 - x].forEach((cx) => {
        pillars += `<rect x="${n1(cx - pw / 2)}" y="${n1(yTop(x) - 10)}" width="${n1(pw)}" height="${n1(H + 10)}" fill="${burnt ? '#34343c' : '#1f2925'}"/>`
          + `<rect x="${n1(cx - pw / 2)}" y="${n1(yTop(x) - 10)}" width="${n1(pw * 0.22)}" height="${n1(H + 10)}" fill="${burnt ? '#5a5560' : fire ? '#5a3020' : '#33413b'}" opacity=".6"/>`;
      });
    });
    d += wins + pillars;
    if (!burnt) {
      // holly garlands along the top of the walls
      let gd = '';
      let berries = '';
      for (let i = 1; i < cols.length - 2; i++) {
        const a = cols[i];
        const b = cols[i + 1];
        const y1 = yTop(a) + 16;
        const y2 = yTop(b) + 16;
        const sag = (yBot(a) - yTop(a)) * 0.05;
        [[a, b], [1600 - a, 1600 - b]].forEach(([x1, x2]) => {
          gd += `M${n1(x1)} ${n1(y1)}Q${n1((x1 + x2) / 2)} ${n1((y1 + y2) / 2 + sag)} ${n1(x2)} ${n1(y2)}`;
          berries += `M${n1((x1 + x2) / 2)} ${n1((y1 + y2) / 2 + sag / 2)}h0`;
        });
      }
      d += `<path d="${gd}" fill="none" stroke="${fire ? '#1a120c' : '#1d4634'}" stroke-width="7" stroke-linecap="round"/><path d="${berries}" stroke="#b03030" stroke-width="7" stroke-linecap="round"/>`;
    }
    // floor and the four long tables
    d += `<path d="M0 960L590 584H1010L1600 960Z" fill="url(#${p}fl)"/>`;
    let tables = '';
    [[150, 690], [560, 760], [1040, 840], [1450, 910]].forEach(([nx, fx]) => { tables += `<path d="M${nx - 60} 900L${fx - 7} 588H${fx + 7}L${nx + 60} 900Z"/>`; });
    d += `<g fill="${burnt ? '#14100e' : '#191510'}" opacity="${fire ? 0.7 : 0.85}">${tables}</g>`;
    // the twelve trees (far ones first)
    const trees = [[78, 300], [222, 236], [336, 186], [424, 150], [488, 122], [538, 100]];
    let tr = '';
    let lights = '';
    const kind = fire ? 1 : burnt ? 2 : 0;
    d = d.replace('</defs>', `<g id="${p}t">${P.xtree(rnd, 0, 0, 100, kind)}</g></defs>`);
    trees.slice().reverse().forEach(([x, h]) => {
      [x, 1600 - x].forEach((tx, side) => {
        const base = yBot(x) - 12;
        const tf = `translate(${n1(tx)} ${n1(base)}) scale(${side ? -h / 100 : h / 100} ${h / 100})`;
        if (fire) tr += glow(p, 'ge', tx, base - h * 0.45, h * 0.7, h * 0.75, 0.9);
        tr += `<use href="#${p}t" transform="${tf}"/>`;
        if (!burnt) lights += `<use href="#${p}tl" transform="${tf}"/>`;
      });
    });
    if (lights) lights = `<defs><g id="${p}tl">${P.xtreeLights(p, prng(77), 0, 0, 100, kind)}</g></defs>${lights}`;
    d += tr;
    if (burnt) d += '<path d="M120 170L430 900H760L300 150Z" fill="#ffe2c0" opacity=".09"/><path d="M1480 170L1170 900H840L1300 150Z" fill="#ffe2c0" opacity=".09"/>';
    if (!fire && !burnt) d += glow(p, 'gw', 800, 160, 900, 200, 0.12);
    const out = [layer(d)];
    // enchanted ceiling clouds (or smoke)
    const cl = P.clouds(`${p}cl`, fire ? [[300, 80, 420, 110], [900, 40, 520, 120], [1350, 120, 380, 100], [700, 200, 380, 70]]
      : [[300, 90, 300, 60], [900, 60, 380, 70], [1350, 130, 300, 56], [620, 180, 260, 40]]);
    out.push(layer(cl, 'art-drift-x'));
    if (lights) out.push(layer(lights, fire ? 'art-flicker2' : 'art-flicker'));
    if (!burnt) {
      // floating candles in two independently bobbing layers
      const rc = prng(5);
      const cand = [];
      const count = fire ? 16 : 48;
      for (let i = 0; i < count; i++) {
        const t = rc();
        const u = rc() * 2 - 1;
        cand.push({ t, x: 800 + u * (780 - 520 * t), y: 110 + 220 * t + (rc() - 0.5) * 110 * (1 - t), s: 1.3 - 0.9 * t });
      }
      cand.sort((a, b) => b.t - a.t);
      [0, 1].forEach((k) => {
        const q = uid();
        let bodies = `<defs>${glowDefs(q)}<g id="${q}c"><rect x="-3" y="0" width="6" height="26" rx="1.5" fill="#e9dfc6" opacity=".92"/>${P.flame(0, -1, 0.9)}</g><ellipse id="${q}g" cx="0" cy="-6" rx="26" ry="30" fill="url(#${q}gw)" opacity=".8"/></defs>`;
        let glows = '';
        cand.filter((c, i) => i % 2 === k).forEach((c) => {
          const tf = `translate(${n1(c.x)} ${n1(c.y)}) scale(${n1(c.s * 100) / 100})`;
          bodies += `<use href="#${q}c" transform="${tf}"/>`;
          glows += `<use href="#${q}g" transform="${tf}"/>`;
        });
        out.push(group(k ? 'art-bob2' : 'art-bob', layer(bodies) + layer(glows, k ? 'art-flicker2' : 'art-flicker')));
      });
    }
    if (fire) out.push(AMB.smoke, AMB.embers, AMB.ash);
    else out.push(AMB.ceiling);
    if (burnt) {
      let sm = '';
      trees.forEach(([x, h]) => [x, 1600 - x].forEach((tx) => { sm += `<path d="M${tx} ${n1(yBot(x) - h)}q-12 -40 6 -80q16 -40 -4 -90" stroke="#d8d0ca" stroke-width="${n1(h / 16)}" fill="none" opacity=".2" stroke-linecap="round"/>`; }));
      out.push(layer(sm, 'art-rise-slow'));
    }
    return out;
  }
  BG.nagyterem = () => greatHall(0);
  BG['nagyterem-ego'] = () => greatHall(1);
  BG['nagyterem-hajnal'] = () => greatHall(2);

  // The castle seen from the grounds. mode: 0 snowy night, 1 storm, 2 dawn.
  function castleView(mode) {
    const p = uid();
    const rnd = prng(31);
    const dawn = mode === 2;
    const sky = dawn ? [[0, '#1b2036'], [0.42, '#5d4a66'], [0.72, '#c7826a'], [1, '#f0bd88']]
      : mode === 1 ? [[0, '#06080b'], [0.55, '#131a21'], [1, '#2b3540']]
        : [[0, '#040810'], [0.5, '#0c1828'], [1, '#26384e']];
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, sky)}${lin(`${p}lake`, dawn ? [[0, '#d09080'], [1, '#3a2c3a']] : [[0, '#22344a'], [1, '#070b10']])}`
      + `${lin(`${p}snow`, dawn ? [[0, '#f0d0c0'], [1, '#7a6070']] : [[0, '#4a6078'], [1, '#141e28']])}${P.cloudDef(`${p}cl`, dawn ? '#ffd8c0' : '#8fa2b4', dawn ? 0.35 : 0.14)}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>`;
    if (mode === 0) d += P.stars(rnd, 160, 0, 0, 1600, 520, 1.7);
    if (dawn) d += P.stars(rnd, 30, 0, 0, 1600, 200, 1.3, 0.5) + glow(p, 'gw', 640, 590, 620, 300, 0.95);
    if (mode === 0) d += P.moon(p, true);
    // haze behind the castle so the silhouette reads
    d += glow(p, dawn ? 'gw' : 'gc', 1040, 470, 560, 230, dawn ? 0.5 : 0.75);
    d += P.ridge(560, 130, dawn ? '#5a4862' : '#121c2a', 4);
    d += P.ridge(590, 60, dawn ? '#433650' : '#0c141f', 9);
    d += `<rect y="596" width="1600" height="130" fill="url(#${p}lake)"/>`;
    d += P.castle(rnd, 1040, 528, 0.95, dawn ? '#2a2030' : '#03060a', dawn ? '#ffd79a' : '#ffbf66', dawn ? 0.6 : 1);
    d += `<g stroke="${dawn ? '#ffe0b0' : '#ffbf66'}" stroke-width="2.5" opacity=".3"><path d="M900 640h40M1010 662h28M1120 650h50M960 692h22M1200 676h30M1060 700h18"/></g>`;
    d += P.hills(730, 60, `url(#${p}snow)`, 3, dawn ? '#fff0e0' : '#9db6cc');
    d += P.hills(815, 40, dawn ? '#94767e' : '#1c2834', 8, dawn ? '#ffe8d8' : '#5a7088');
    let pines = '';
    [[60, 910, 380], [160, 915, 270], [250, 920, 200], [1430, 912, 310], [1530, 905, 400], [1350, 920, 210]].forEach(([x, b, h]) => { pines += P.pine(rnd, x, b, h, dawn ? '#1f1822' : '#04070a', dawn ? 0.45 : 0.35); });
    d += pines;
    const out = [layer(d)];
    if (mode === 1) {
      out.push(layer(`<defs>${P.cloudDef(`${p}sc`, '#2a3440', 0.9)}</defs>${P.clouds(`${p}sc`, [[300, 80, 520, 130], [1000, 50, 620, 140], [1450, 170, 380, 110], [700, 210, 420, 80]])}`, 'art-drift-x'));
      out.push(layer('<rect width="1600" height="900" fill="#dbe8f4" opacity=".22"/><path d="M1180 0l-30 120 40 10 -50 150 30 8 -60 170" fill="none" stroke="#f4faff" stroke-width="4"/>', 'art-flash'));
      out.push(AMB.snow, AMB.fogHigh);
    } else if (dawn) {
      out.push(layer(P.clouds(`${p}cl`, [[320, 200, 360, 26], [1100, 150, 460, 22], [760, 290, 320, 16], [1450, 260, 240, 18]]), 'art-drift-x'));
      out.push(AMB.fog);
    } else {
      out.push(layer(P.clouds(`${p}cl`, [[300, 120, 380, 50], [900, 80, 420, 50], [1400, 220, 300, 40]]), 'art-drift-x'));
      out.push(AMB.snow, AMB.fog);
    }
    return out;
  }
  BG.roxfort = () => castleView(0);
  BG['roxfort-vihar'] = () => castleView(1);
  BG.hajnal = () => castleView(2);

  // Hagrid's hut in a local frame (0,0 = bottom left).
  const HUT = (p) => '<path d="M0 0V-130H240V0Z" fill="#2a2019"/>'
    + '<path d="M20 0V-130M44 0V-130M68 0V-130M92 0V-130M116 0V-130M140 0V-130M164 0V-130M188 0V-130M212 0V-130" stroke="#1a130e" stroke-width="3"/>'
    + '<rect x="166" y="-238" width="26" height="80" fill="#221a15"/><rect x="162" y="-244" width="34" height="10" fill="#d6e2ec"/>'
    + '<path d="M-24 -118Q120 -262 264 -118Z" fill="#1c1712"/><path d="M-26 -116Q120 -268 266 -116Q120 -236 -26 -116Z" fill="#dbe6ef" opacity=".85"/>'
    + '<rect x="28" y="-104" width="56" height="104" fill="#120d0a"/>'
    + `${glow(p, 'gw', 160, -74, 110, 80, 0.9)}<rect x="132" y="-98" width="58" height="46" fill="#ffbd60"/>`
    + '<path d="M161 -98v46M132 -75h58" stroke="#2a2019" stroke-width="4"/><path d="M128 -50h66" stroke="#dbe6ef" stroke-width="6" opacity=".7"/>';

  BG.park = () => {
    const p = uid();
    const rnd = prng(44);
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, [[0, '#050a14'], [0.55, '#122236'], [1, '#2c405a']])}${lin(`${p}sn`, [[0, '#55708a'], [1, '#16212c']])}${P.cloudDef(`${p}cl`, '#9fb4c8', 0.12)}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>${P.stars(rnd, 130, 0, 0, 1600, 460, 1.6)}${P.moon(p)}`;
    d += glow(p, 'gc', 470, 330, 380, 160, 0.7);
    d += P.ridge(470, 90, '#101a28', 12);
    d += P.castle(rnd, 470, 384, 0.5, '#04070b', '#ffbf66');
    d += P.hills(560, 50, '#24364a', 21, '#7d98b2');
    d += P.hills(650, 70, `url(#${p}sn)`, 5, '#a9c4da');
    let pines = '';
    for (let i = 0; i < 15; i++) {
      const x = 980 + i * 46 + rnd() * 30;
      pines += P.pine(rnd, x, 712 + rnd() * 20, 220 + rnd() * 270, i % 3 ? '#03070a' : '#071018', 0.3);
    }
    d += pines;
    d += P.hills(800, 36, '#3a5068', 17, '#b8cee0');
    d += `<g transform="translate(120 786) scale(1.08)">${HUT(p)}</g>`;
    let fp = '';
    for (let i = 0; i < 11; i++) fp += `M${Math.round(420 + i * 52 + (i % 2) * 6)} ${Math.round(812 - i * 9 + (i % 2) * 8)}h0`;
    d += `<path d="${fp}" stroke="#1a2836" stroke-width="7" stroke-linecap="round" opacity=".7"/>`;
    return [layer(d),
      layer(P.clouds(`${p}cl`, [[300, 100, 380, 46], [1000, 70, 460, 50], [1400, 200, 300, 36]]), 'art-drift-x'),
      layer('<g fill="#aab4bc" opacity=".16"><circle cx="319" cy="520" r="16"/><circle cx="312" cy="480" r="22"/><circle cx="324" cy="430" r="28"/></g>', 'art-rise-slow'),
      AMB.snow, AMB.fog];
  };

  BG.rengeteg = () => {
    const p = uid();
    const rnd = prng(57);
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, [[0, '#0a121c'], [0.55, '#1a2a38'], [1, '#0c141a']])}${lin(`${p}tr`, [[0, '#020406'], [0.5, '#0a1016'], [1, '#020406']], 0, 0, 1, 0)}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>${glow(p, 'gc', 1150, 120, 420, 300, 0.8)}`;
    d += '<path d="M1180 0L860 900H1060L1320 0Z" fill="#c8dcea" opacity=".07"/><path d="M1400 0L1180 900H1270L1470 0Z" fill="#c8dcea" opacity=".05"/>';
    let far = '';
    for (let i = 0; i < 20; i++) {
      const x = rnd() * 1600;
      const w = 14 + rnd() * 26;
      far += `<path d="M${Math.round(x)} 0h${Math.round(w)}l${Math.round(w * 0.2)} 720h${Math.round(-w * 1.4)}z"/>`;
    }
    d += `<g fill="#2c3e4e" opacity=".5">${far}</g>`;
    let mid = '';
    for (let i = 0; i < 9; i++) {
      const x = 140 + i * 165 + rnd() * 80;
      const w = 34 + rnd() * 30;
      mid += `<path d="M${Math.round(x)} 0h${Math.round(w)}l${Math.round(w * 0.3)} 760q${Math.round(w * 0.5)} 10 ${Math.round(w * 0.8)} 30h${Math.round(-w * 2.6)}q${Math.round(w * 0.3)} -20 ${Math.round(w * 0.7)} -30z"/>`;
    }
    d += `<g fill="#0a1218">${mid}</g>`;
    d += P.web(270, 150, 160, 0.4, 0, Math.PI) + P.web(1320, 230, 130, 0.36, Math.PI * 0.1, Math.PI * 1.1) + P.web(800, 50, 110, 0.26, 0, Math.PI);
    d += '<path d="M0 770Q400 730 800 780T1600 760V900H0Z" fill="#0b1218"/>';
    d += '<g fill="#5a7286" opacity=".45"><ellipse cx="300" cy="808" rx="170" ry="14"/><ellipse cx="880" cy="838" rx="230" ry="16"/><ellipse cx="1350" cy="800" rx="150" ry="12"/></g>';
    // two huge trunks framing the view, with roots and low branches
    d += `<path d="M-40 0H150Q130 300 160 600Q180 760 270 900H-40Z" fill="url(#${p}tr)"/><path d="M1640 0H1450Q1480 320 1440 600Q1420 760 1330 900H1640Z" fill="url(#${p}tr)"/>`;
    d += '<g stroke="#020406" stroke-linecap="round" fill="none"><path d="M140 160Q320 120 520 40" stroke-width="18"/><path d="M1460 120Q1240 90 1060 20" stroke-width="18"/><path d="M150 380Q260 360 330 300" stroke-width="12"/><path d="M1450 420Q1360 400 1300 340" stroke-width="12"/></g>';
    d += P.web(152, 610, 100, 0.38, -Math.PI / 2, Math.PI / 2) + P.web(1448, 560, 90, 0.34, Math.PI / 2, Math.PI * 1.5);
    // eyes in the dark: an acromantula's eight, and a few pairs
    const eyes = '<g fill="#e4f6ea"><circle cx="352" cy="604" r="3.4"/><circle cx="368" cy="599" r="4.2"/><circle cx="384" cy="599" r="4.2"/><circle cx="400" cy="604" r="3.4"/><circle cx="346" cy="617" r="2.4"/><circle cx="406" cy="617" r="2.4"/><circle cx="369" cy="612" r="2.2"/><circle cx="383" cy="612" r="2.2"/></g>'
      + '<g fill="#f0dc80"><circle cx="1188" cy="652" r="3"/><circle cx="1208" cy="652" r="3"/><circle cx="1262" cy="560" r="2.4"/><circle cx="1278" cy="561" r="2.4"/></g>';
    return [layer(d), layer(`${glow(p, 'gs', 376, 606, 40, 26, 0.35)}${eyes}`, 'art-pulse'), AMB.fog, AMB.snowLight];
  };

  BG.fuz = () => {
    const p = uid();
    const rnd = prng(63);
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, [[0, '#0a0e14'], [0.5, '#24303c'], [1, '#3e4c5a']])}${lin(`${p}tr`, [[0, '#050505'], [0.6, '#16140f'], [1, '#050505']], 0, 0, 1, 0)}${P.cloudDef(`${p}cl`, '#5a6a7a', 0.7)}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>${glow(p, 'gc', 1180, 300, 520, 300, 0.9)}`;
    d += P.ridge(560, 90, '#141c26', 7);
    d += P.castle(rnd, 330, 476, 0.42, '#06090c', '#ffbf66');
    d += P.hills(640, 60, '#36485a', 14, '#9db6cc') + P.hills(745, 46, '#1e2a36', 2, '#6a8298');
    // trunk with knots and the tunnel gap between the roots
    d += `<path d="M1060 780Q1120 740 1130 640Q1140 520 1110 450Q1150 420 1180 380Q1220 420 1250 450Q1230 540 1240 640Q1252 740 1320 780Q1250 800 1190 790Q1120 800 1060 780Z" fill="url(#${p}tr)"/>`;
    d += '<path d="M1140 600q20 -10 30 10M1200 520q16 -8 26 8" stroke="#2c2924" stroke-width="5" fill="none"/><path d="M1166 790q24 -44 48 0z" fill="#000"/>';
    d += '<path d="M1060 780q-60 10 -90 30M1320 780q60 6 100 30M1130 790q-30 30 -40 50" stroke="#0a0908" stroke-width="16" stroke-linecap="round"/>';
    const out = [layer(d)];
    out.push(layer(P.clouds(`${p}cl`, [[300, 60, 520, 120], [1100, 30, 600, 120], [800, 200, 380, 60]]), 'art-drift-x'));
    // whipping branches, pivoting on the crown of the tree
    let br = '';
    [[-1, 0.0], [-1, 0.22], [-1, 0.48], [1, 0.0], [1, 0.25], [1, 0.52], [-1, 0.75], [1, 0.8]].forEach(([dir, k]) => {
      const ex = 1180 + dir * (250 + k * 250);
      const ey = 430 + k * 250;
      const cx = 1180 + dir * (110 + k * 120);
      const cy = 150 - k * 60;
      br += `<path d="M1180 400Q${Math.round(cx)} ${Math.round(cy)} ${Math.round(ex)} ${Math.round(ey)}" stroke-width="${n1(15 - k * 9)}"/>`
        + `<path d="M${Math.round((1180 + ex) / 2 + dir * 40)} ${Math.round(cy + 70)}q${dir * 60} 20 ${dir * 92} 124" stroke-width="4"/>`
        + `<path d="M${Math.round(ex)} ${Math.round(ey)}q${dir * 14} 30 ${dir * 4} 60" stroke-width="3"/>`;
    });
    out.push(layer(`<g stroke="#070706" fill="none" stroke-linecap="round">${br}</g>`, 'art-whip', '--ox:73.75%;--oy:44.4%;--sw:3deg'));
    out.push(layer('<rect width="1600" height="900" fill="#dbe8f4" opacity=".2"/><path d="M520 0l-24 110 34 8 -40 140 26 6 -48 150" fill="none" stroke="#f4faff" stroke-width="3"/>', 'art-flash'));
    out.push(AMB.snow);
    return out;
  };
  BG.roxmorts = () => {
    const p = uid();
    const rnd = prng(71);
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, [[0, '#04070c'], [0.6, '#0e1824'], [1, '#1e2c3c']])}${lin(`${p}rd`, [[0, '#26323e'], [1, '#4a5a68']])}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>${P.stars(rnd, 70, 0, 0, 1600, 300, 1.3, 0.7)}${P.moon(p)}`;
    d += P.ridge(470, 160, '#0c141e', 3) + P.ridge(540, 70, '#0a1018', 6);
    d += `<path d="M260 900L770 560H830L1340 900Z" fill="url(#${p}rd)"/>`;
    // cottages receding along both sides of the street
    const left = [[690, 60, 34], [640, 74, 46], [560, 110, 70], [440, 150, 104], [270, 210, 150], [-30, 330, 250]];
    let houses = '';
    left.forEach(([x, w, h], i) => {
      const base = 560 + (770 - x - w) * 0.62 + (i > 3 ? 30 : 0);
      houses += P.cottage(x, base, w, h, { rnd, wins: 2, shop: i >= 4, door: i >= 3, roof: '#0e0e12', wall: i % 2 ? '#1a181c' : '#201b1a' });
      const rx = 1600 - x - w;
      houses += P.cottage(rx, base, w, h, { rnd, wins: 2, shop: i === 5, door: i >= 3, roof: '#0e0e12', wall: i % 2 ? '#1d1a18' : '#1a1a1e' });
    });
    d += houses;
    // a blank inn sign hanging over the street
    d += '<path d="M1290 470h-70M1240 470v18M1278 470v18" stroke="#16120f" stroke-width="5"/><rect x="1228" y="488" width="62" height="44" rx="4" fill="#2a1f16" stroke="#6a5030" stroke-width="3"/>';
    let fp = '';
    for (let i = 0; i < 12; i++) fp += `<ellipse cx="${n1(800 + (i % 2 ? 10 : -10) * (1 - i / 14))}" cy="${n1(890 - i * 28)}" rx="${n1(8 - i * 0.45)}" ry="${n1(3.4 - i * 0.18)}"/>`;
    d += `<g fill="#1a2430" opacity=".7">${fp}</g>`;
    return [layer(d), AMB.fog, AMB.snow];
  };

  BG.allomas = () => {
    const p = uid();
    const rnd = prng(83);
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, [[0, '#060a12'], [0.55, '#18263a'], [1, '#34465c']])}${lin(`${p}eng`, [[0, '#8a2220'], [1, '#2e0a0a']])}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>${P.stars(rnd, 60, 0, 0, 1600, 240, 1.3, 0.6)}${P.moon(p)}`;
    d += P.ridge(430, 170, '#1a2636', 15) + P.ridge(470, 70, '#121c28', 16);
    d += P.pine(rnd, 80, 610, 280, '#04070a', 0.35) + P.pine(rnd, 190, 610, 200, '#04070a', 0.35) + P.pine(rnd, 1540, 610, 300, '#04070a', 0.35);
    // carriages with lit windows, the engine leaving to the right
    let car = '';
    for (let i = 0; i < 4; i++) {
      const x = -80 + i * 300;
      car += `<rect x="${x}" y="470" width="284" height="110" rx="8" fill="url(#${p}eng)"/><rect x="${x}" y="462" width="284" height="14" rx="6" fill="#1a0c0c"/>`;
      for (let j = 0; j < 5; j++) car += `<rect x="${x + 18 + j * 54}" y="494" width="34" height="34" rx="4" fill="#ffc070" opacity="${rnd() < 0.7 ? 0.9 : 0.25}"/>`;
      car += `<circle cx="${x + 50}" cy="590" r="18" fill="#0a0808"/><circle cx="${x + 234}" cy="590" r="18" fill="#0a0808"/>`;
    }
    d += car;
    d += `<path d="M1120 580V450H1200V400H1260V450H1440Q1480 450 1480 500V580Z" fill="url(#${p}eng)"/><rect x="1380" y="395" width="34" height="58" fill="#120808"/><rect x="1372" y="388" width="50" height="12" fill="#0c0606"/>`;
    d += '<g fill="#0a0808"><circle cx="1180" cy="590" r="26"/><circle cx="1260" cy="590" r="26"/><circle cx="1340" cy="590" r="26"/><circle cx="1430" cy="596" r="18"/></g><path d="M1160 590H1360" stroke="#8a7a5a" stroke-width="4"/>';
    d += `<rect x="1206" y="470" width="40" height="40" fill="#ffc070" opacity=".85"/>${glow(p, 'gw', 1500, 520, 90, 50, 0.9)}<circle cx="1480" cy="520" r="9" fill="#fff0c0"/>`;
    // platform with snow and a lamp post
    d += '<rect y="612" width="1600" height="20" fill="#4a5866"/><rect y="630" width="1600" height="270" fill="#18222a"/><path d="M0 640H1600" stroke="#dbe6ef" stroke-width="6" opacity=".6"/>';
    d += `<path d="M300 900V640" stroke="#07090b" stroke-width="9"/><path d="M286 640h28l-4 -34h-20z" fill="#07090b"/>${glow(p, 'gw', 300, 624, 110, 90, 0.9)}<rect x="292" y="610" width="16" height="24" fill="#ffd890"/>`;
    return [layer(d),
      layer('<g fill="#c8d0d6" opacity=".24"><circle cx="1400" cy="360" r="40"/><circle cx="1350" cy="300" r="60"/><circle cx="1260" cy="230" r="80"/><circle cx="1120" cy="170" r="100"/></g>', 'art-rise-slow'),
      AMB.snow, AMB.fog];
  };

  BG['sotet-jegy'] = () => {
    const p = uid();
    const rnd = prng(91);
    let d = `<defs>${glowDefs(p)}${lin(`${p}sky`, [[0, '#040a08'], [0.5, '#0c1c18'], [1, '#1a2c30']])}${P.cloudDef(`${p}cl`, '#2e8a5a', 0.4)}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}sky)"/>${P.stars(rnd, 80, 0, 0, 1600, 500, 1.4, 0.6)}`;
    d += P.clouds(`${p}cl`, [[620, 330, 520, 80], [1180, 260, 420, 60], [300, 220, 300, 50]]);
    d += P.ridge(650, 120, '#0e1a18', 23);
    let lights = '';
    for (let i = 0; i < 30; i++) lights += `M${Math.round(480 + rnd() * 460)} ${Math.round(672 + rnd() * 36)}h0`;
    d += `<path d="${lights}" stroke="#ffbf66" stroke-width="5" stroke-linecap="round" opacity=".75"/>`;
    let pines = '';
    for (let i = 0; i < 34; i++) pines += P.pine(rnd, i * 50 + rnd() * 30, 905, 150 + rnd() * 180 + (i < 6 || i > 28 ? 140 : 0), '#020504');
    d += pines;
    // the Dark Mark: a skull of emerald stars with a serpent for a tongue
    const skull = 'M-70 -10C-78 -80 -30 -105 0 -105C30 -105 78 -80 70 -10C68 15 55 25 50 40L-50 40C-55 25 -68 15 -70 -10Z'
      + 'M-46 -12a18 20 0 1 0 36 0a18 20 0 1 0 -36 0M10 -12a18 20 0 1 0 36 0a18 20 0 1 0 -36 0M0 8L-9 28H9Z'
      + 'M-42 40L-34 70H34L42 40M-24 42V62M-12 42V64M0 42V64M12 42V64M24 42V62';
    const snake = 'M0 58C-14 110 64 118 52 168C42 216 -62 206 -50 254C-44 284 4 296 26 280';
    const mark = '<g transform="translate(640 190) scale(1.05)">'
      + `<path d="${skull}${snake}" fill="none" stroke="#3fd27a" stroke-width="5" opacity=".55"/>`
      + `<path d="${skull}${snake}" fill="none" stroke="#c8ffdc" stroke-width="7" stroke-linecap="round" stroke-dasharray="0 12"/>`
      + '<path d="M26 280l16 -12M26 280l18 3" stroke="#c8ffdc" stroke-width="3"/><ellipse cx="22" cy="280" rx="11" ry="8" fill="#5ae890"/></g>';
    const q = uid();
    return [layer(d), layer(`<defs>${glowDefs(q)}</defs>${glow(q, 'gg', 640, 250, 420, 330, 0.95)}${mark}`, 'art-pulse'), AMB.snowLight, AMB.fogGreen];
  };
  // @@END-A

  // ---------- interiors ----------
  const R = Math.round;

  // One-point perspective corridor. World coords are near-plane screen coords; z = depth (0 near).
  // f(z) = 1 / (1 + z); the far wall sits at z = zEnd.
  function corridor(p, o) {
    const vx = 800;
    const vy = o.vy || 440;
    const zEnd = o.zEnd || 2.85;
    const f = (z) => 1 / (1 + z);
    const pr = (X, Y, z) => [R(vx + (X - vx) * f(z)), R(vy + (Y - vy) * f(z))];
    const wallTop = o.wallTop === undefined ? 200 : o.wallTop;
    const [fx0, fy0] = pr(0, wallTop, zEnd);
    const [fx1, fy1] = pr(1600, 900, zEnd);
    const pal = o.pal;
    let d = `<defs>${glowDefs(p)}${lin(`${p}lw`, [[0, pal.wallNear], [1, pal.wallFar]], 0, 0, 1, 0)}${lin(`${p}rw`, [[0, pal.wallFar], [1, pal.wallNear]], 0, 0, 1, 0)}`
      + `${lin(`${p}fl`, [[0, pal.floorFar], [1, pal.floorNear]])}${lin(`${p}cl`, [[0, pal.ceilNear], [1, pal.ceilFar]])}${o.defs || ''}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}cl)"/>`;
    // end wall
    d += `<rect x="${fx0}" y="${fy0 - 60}" width="${fx1 - fx0}" height="${fy1 - fy0 + 60}" fill="${pal.end}"/>`;
    if (o.end) d += o.end(fx0, fy0, fx1, fy1);
    // side walls and floor
    const L0 = pr(0, wallTop, 0);
    d += `<path d="M0 ${L0[1]}L${fx0} ${fy0}V${fy1}L0 900Z" fill="url(#${p}lw)"/><path d="M1600 ${L0[1]}L${fx1} ${fy0}V${fy1}L1600 900Z" fill="url(#${p}rw)"/>`;
    d += `<path d="M0 900L${fx0} ${fy1}H${fx1}L1600 900Z" fill="url(#${p}fl)"/>`;
    // stone courses on the walls and flagstone joints on the floor
    let lines = '';
    for (let Y = wallTop + 70; Y < 900; Y += 78) {
      const a = pr(0, Y, 0);
      const b = pr(0, Y, zEnd);
      lines += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${1600 - a[0]} ${a[1]}L${1600 - b[0]} ${b[1]}`;
    }
    for (let X = -800; X <= 2400; X += 200) {
      const b = pr(X, 900, zEnd);
      lines += `M${X} 900L${b[0]} ${b[1]}`;
    }
    [0.25, 0.6, 1.05, 1.6, 2.2].forEach((z) => {
      const a = pr(0, 900, z);
      lines += `M${a[0]} ${a[1]}H${1600 - a[0]}`;
    });
    d += `<path d="${lines}" stroke="${pal.line}" stroke-width="2" opacity=".55"/>`;
    // vault ribs and pillars at a few depths
    let ribs = '';
    let pillars = '';
    (o.ribs || [0.35, 0.9, 1.6, 2.4]).forEach((z) => {
      const a = pr(0, wallTop, z);
      const b = pr(1600, wallTop, z);
      const c = pr(800, -380, z);
      ribs += `<path d="M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}" stroke-width="${n1(26 * f(z))}"/>`;
      const bot = pr(0, 900, z);
      const w = R(46 * f(z));
      pillars += `<rect x="${a[0] - w}" y="${a[1]}" width="${w * 2}" height="${bot[1] - a[1]}"/><rect x="${1600 - a[0] - w}" y="${a[1]}" width="${w * 2}" height="${bot[1] - a[1]}"/>`;
    });
    d += `<g fill="none" stroke="${pal.rib}">${ribs}</g><g fill="${pal.pillar}">${pillars}</g>`;
    // torches (bracket in the base, flame on a flicker layer)
    let fl = '';
    (o.torches || []).forEach(([side, z]) => {
      const [x, y] = pr(side < 0 ? 40 : 1560, 380, z);
      const s = f(z) * 1.5;
      d += P.torch(x, y, s);
      if (!o.torchesOut) {
        fl += glow(p, 'gw', x, y + 40 * s, 300 * s, 360 * s, 0.4 * (o.torchGlow || 1)) + P.torchFlame(p, x, y, s, o.torchGlow || 1);
        const [gx, gy] = pr(side < 0 ? 200 : 1400, 900, z);
        fl += glow(p, 'gw', gx, gy, 260 * s, 50 * s, 0.35 * (o.torchGlow || 1));
      }
      else fl += `<path d="M${x} ${R(y - 4 * s)}q${R(-10 * s)} ${R(-30 * s)} ${R(4 * s)} ${R(-60 * s)}q${R(12 * s)} ${R(-30 * s)} ${R(-4 * s)} ${R(-70 * s)}" stroke="#aab4bc" stroke-width="${n1(5 * s)}" fill="none" opacity=".25" stroke-linecap="round"/>`;
    });
    (o.armour || []).forEach(([side, z]) => {
      const [x, y] = pr(side < 0 ? 150 : 1450, 900, z);
      d += P.armour(p, x, y - R(10 * f(z)), f(z) * 1.25);
    });
    if (o.extra) d += o.extra(pr, f);
    return { d, fl, pr, f };
  }

  // Box room: back wall [x0, y0, x1, y1], slanted side walls, floor and ceiling.
  function room(p, o) {
    const [x0, y0, x1, y1] = o.back || [220, 110, 1380, 690];
    let d = `<defs>${glowDefs(p)}${lin(`${p}bw`, o.backCol)}${lin(`${p}lw`, [[0, o.side[0]], [1, o.side[1]]], 0, 0, 1, 0)}${lin(`${p}rw`, [[0, o.side[1]], [1, o.side[0]]], 0, 0, 1, 0)}${lin(`${p}fl`, o.floor)}${o.defs || ''}</defs>`;
    d += `<rect width="1600" height="900" fill="${o.ceil || '#070a09'}"/>`;
    d += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#${p}bw)"/>`;
    d += `<path d="M0 0L${x0} ${y0}V${y1}L0 900Z" fill="url(#${p}lw)"/><path d="M1600 0L${x1} ${y0}V${y1}L1600 900Z" fill="url(#${p}rw)"/>`;
    d += `<path d="M0 900L${x0} ${y1}H${x1}L1600 900Z" fill="url(#${p}fl)"/>`;
    if (o.boards) {
      let b = '';
      for (let i = -6; i <= 22; i++) {
        const bx = x0 + ((x1 - x0) * i) / 16;
        b += `M${R(bx)} ${y1}L${R(800 + (bx - 800) * 2.2)} 900`;
      }
      d += `<path d="${b}" stroke="${o.boards}" stroke-width="2" opacity=".6"/>`;
    }
    if (o.stones) {
      let s = '';
      for (let y = y0 + 46; y < y1; y += 46) s += `M${x0} ${y}H${x1}`;
      d += `<path d="${s}" stroke="${o.stones}" stroke-width="2" opacity=".5"/>`;
    }
    if (o.planks) {
      let s = '';
      for (let x = x0 + 40; x < x1; x += 40) s += `M${x} ${y0}V${y1}`;
      d += `<path d="${s}" stroke="${o.planks}" stroke-width="3" opacity=".7"/>`;
    }
    if (o.beams) {
      let s = '';
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        s += `<path d="M${R(x0 + (x1 - x0) * t)} ${y0}L${R(800 + (x0 + (x1 - x0) * t - 800) * 2.6)} -10" stroke="${o.beams}" stroke-width="${R(16 + 14 * Math.abs(t - 0.5))}"/>`;
      }
      d += s + `<path d="M${x0} ${y0}H${x1}" stroke="${o.beams}" stroke-width="18"/>`;
    }
    return d;
  }

  // Fire in a hearth: logs in the base, flames + glow for a flicker layer.
  const hearthFlames = (p, cx, by, w, h) => {
    let d = '';
    [[-0.32, 0.55], [-0.12, 0.9], [0.08, 1], [0.28, 0.7], [0.4, 0.45]].forEach(([dx, k]) => {
      const x = cx + dx * w;
      const fh = h * k;
      const fw = w * 0.13;
      d += `M${R(x - fw)} ${by}C${R(x - fw)} ${R(by - fh * 0.5)} ${R(x - fw * 0.1)} ${R(by - fh * 0.6)} ${R(x + fw * 0.15)} ${R(by - fh)}C${R(x + fw * 0.4)} ${R(by - fh * 0.5)} ${R(x + fw)} ${R(by - fh * 0.4)} ${R(x + fw)} ${by}Z`;
    });
    return glow(p, 'gw', cx, by - h * 0.4, w * 2.2, h * 1.8, 0.85) + glow(p, 'ge', cx, by - h * 0.3, w * 0.9, h * 0.9, 0.9)
      + `<path d="${d}" fill="#ff8a30"/><path d="${d}" fill="#ffd27a" opacity=".7" transform="translate(${R(cx * 0.25)} ${R(by * 0.25)}) scale(.75)"/>`;
  };

  BG.folyoso = () => {
    const p = uid();
    const c = corridor(p, {
      pal: { wallNear: '#24261f', wallFar: '#4a4a3e', floorNear: '#1a1a15', floorFar: '#46443a', ceilNear: '#0e0f0c', ceilFar: '#2c2c24', end: '#3a3a30', line: '#121310', rib: '#1a1b16', pillar: '#3a3a30' },
      torches: [[-1, 0.5], [1, 0.5], [-1, 1.5], [1, 1.5], [-1, 2.5], [1, 2.5]],
      armour: [[-1, 0.95], [1, 0.95], [-1, 2.0], [1, 2.0]],
      defs: lin(`${p}gl`, [[0, '#30465a'], [1, '#0e1824']]),
      end: (x0, y0, x1) => P.window(R((x0 + x1) / 2 - 60), y0 - 30, 120, 220, `url(#${p}gl)`, '#0a0c0b')
    });
    return [layer(c.d), layer(c.fl, 'art-flicker'), AMB.window(50, 38)];
  };

  BG['folyoso-sotet'] = () => {
    const p = uid();
    const c = corridor(p, {
      pal: { wallNear: '#0e141a', wallFar: '#2c3a4a', floorNear: '#0b1015', floorFar: '#2c3a48', ceilNear: '#06090d', ceilFar: '#18222e', end: '#22303e', line: '#080c10', rib: '#0c1218', pillar: '#202c38' },
      torches: [[-1, 0.5], [1, 0.5], [-1, 1.5], [1, 1.5]],
      torchesOut: true,
      armour: [[-1, 0.95], [1, 2.0]],
      defs: lin(`${p}gl`, [[0, '#6a88a4'], [1, '#1c2c3c']]),
      end: (x0, y0, x1) => P.window(R((x0 + x1) / 2 - 60), y0 - 30, 120, 220, `url(#${p}gl)`, '#06090c'),
      extra: (pr) => {
        // moonlight through the tall windows of the right wall falls across the floor
        let s = '';
        [0.4, 1.2].forEach((z) => {
          const a = pr(1600, 260, z);
          const b = pr(1600, 640, z + 0.35);
          s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${a[1] + 20}V${b[1]}L${a[0]} ${b[1] + 40}Z" fill="#9dbcd0" opacity=".28"/>`;
          const fa = pr(1600, 900, z);
          const fb = pr(1600, 900, z + 0.35);
          s += `<path d="M${fa[0]} ${fa[1]}L${fb[0]} ${fb[1]}L${R(fb[0] - 260 / (1 + z))} ${fb[1]}L${R(fa[0] - 420 / (1 + z))} ${fa[1]}Z" fill="#9dbcd0" opacity=".1"/>`;
        });
        return s + `${glow(p, 'gc', 800, 360, 300, 200, 0.6)}`;
      }
    });
    return [layer(c.d), layer(c.fl, 'art-rise-slow'), AMB.window(50, 38), AMB.fog];
  };

  // The humpbacked one-eyed witch (stone statue), local frame: origin = bottom centre, facing left.
  const WITCH = (g) => `<rect x="-78" y="-64" width="156" height="64" fill="#2a2f34"/><rect x="-86" y="-74" width="172" height="14" fill="#3a4148"/>`
    + `<path d="M-60 -74C-66 -150 -56 -232 -24 -276C-2 -306 44 -316 58 -280C76 -236 72 -150 66 -74Z" fill="url(#${g})"/>`
    + `<path d="M-74 -258Q-64 -306 -26 -306Q6 -302 6 -272Q-8 -246 -46 -240Z" fill="url(#${g})"/>`
    + '<path d="M-74 -270q-22 8 -10 22" stroke="#5a6068" stroke-width="7" fill="none" stroke-linecap="round"/>'
    + '<circle cx="-50" cy="-276" r="5" fill="#0a0c0e"/><path d="M-30 -280q4 4 0 8" stroke="#1a1e22" stroke-width="3" fill="none"/>'
    + '<path d="M-62 -196L-92 -74" stroke="#4a5058" stroke-width="7" stroke-linecap="round"/><ellipse cx="-62" cy="-196" rx="12" ry="9" fill="#5a6068"/>'
    + '<path d="M40 -290q24 30 22 110" stroke="#9aa4ac" stroke-width="4" fill="none" opacity=".35"/>';

  BG['harmadik-emelet'] = () => {
    const p = uid();
    const c = corridor(p, {
      pal: { wallNear: '#11171d', wallFar: '#33404c', floorNear: '#0e1318', floorFar: '#34404a', ceilNear: '#080b0e', ceilFar: '#1c242c', end: '#26303a', line: '#0a0e12', rib: '#10151a', pillar: '#28323c' },
      torches: [[-1, 0.6], [-1, 1.8], [1, 1.8]],
      torchGlow: 0.7,
      armour: [[-1, 1.2]],
      defs: lin(`${p}st`, [[0, '#8a949e'], [0.5, '#4a525a'], [1, '#2a3036']], 0, 0, 1, 0),
      extra: (pr, f) => {
        const [x, y] = pr(1380, 900, 0.32);
        const s = f(0.32) * 1.45;
        // the gap behind the shifted statue, snow drift and footprints leading inwards
        let fp = '';
        for (let i = 0; i < 9; i++) fp += `M${R(x - 120 * s - i * 46)} ${R(y + 10 - i * 14 + (i % 2) * 10)}h0`;
        return `<path d="M${R(x + 10 * s)} ${R(y - 330 * s)}h${R(70 * s)}v${R(260 * s)}h${R(-70 * s)}z" fill="#020304"/>`
          + `<ellipse cx="${R(x - 30 * s)}" cy="${R(y + 4)}" rx="${R(200 * s)}" ry="${R(22 * s)}" fill="#c8d8e4" opacity=".7"/>`
          + `<g transform="translate(${x} ${y}) scale(${n1(s)})">${WITCH(`${p}st`)}</g>`
          + `<path d="${fp}" stroke="#d8e4ee" stroke-width="9" stroke-linecap="round" opacity=".5"/>`
          + glow(p, 'gc', x + 40 * s, y - 200 * s, 160 * s, 220 * s, 0.6);
      }
    });
    return [layer(c.d), layer(c.fl, 'art-flicker'), AMB.stream(74, 58), AMB.fog];
  };

  BG.alagut = () => {
    const p = uid();
    let d = `<defs>${glowDefs(p)}${rad(`${p}rg`, [[0, '#3a2a1c'], [0.6, '#1a120c'], [1, '#050302']])}</defs>`;
    d += `<rect width="1600" height="900" fill="#030202"/>`;
    // earthy rings of the tunnel, far to near
    const rings = [0, 0.22, 0.5, 0.85, 1.3, 1.9, 2.6, 3.4];
    rings.forEach((z, i) => {
      const k = 1 / (1 + z);
      const w = 1500 * k;
      const h = 1050 * k;
      const x = 800 - w / 2;
      const y = 470 - h * 0.55;
      const col = ['#120c08', '#1e150e', '#2a1e14', '#36271a', '#43311f', '#4e3a26', '#58422c', '#604832'][i];
      d += `<path d="${P.rarch(x, y, w, h)}" fill="${col}"/>`;
      if (i < rings.length - 1) {
        const k2 = 1 / (1 + rings[i + 1]);
        const w2 = 1500 * k2;
        d += `<path d="${P.rarch(800 - w2 / 2 + 24 * k2, 470 - 1050 * k2 * 0.55 + 24 * k2, w2 - 48 * k2, 1050 * k2 - 24 * k2)}" fill="none" stroke="#0a0705" stroke-width="${n1(10 * k2)}" opacity=".7"/>`;
      }
    });
    // far end: stone steps up to the trapdoor, faint light above
    d += `${glow(p, 'gw', 800, 380, 120, 90, 0.7)}<path d="M770 470h60v-10h-50v-10h40v-10h-30z" fill="#4a3826"/><rect x="772" y="388" width="56" height="8" fill="#ffcf8a" opacity=".55"/>`;
    // roots hanging from the ceiling and puddles on the floor
    const rr = prng(101);
    let roots = '';
    for (let i = 0; i < 16; i++) {
      const x = 260 + rr() * 1080;
      const y = 60 + Math.abs(x - 800) * 0.28 + rr() * 30;
      const l = 40 + rr() * 90;
      roots += `M${R(x)} ${R(y)}q${R((rr() - 0.5) * 30)} ${R(l * 0.5)} ${R((rr() - 0.5) * 20)} ${R(l)}`;
    }
    d += `<path d="${roots}" stroke="#1a120a" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    d += '<g fill="#6a5a48" opacity=".22"><ellipse cx="640" cy="780" rx="140" ry="12"/><ellipse cx="980" cy="720" rx="90" ry="8"/><ellipse cx="820" cy="610" rx="50" ry="5"/></g>';
    const drips = '<g fill="#9ab0bc"><ellipse class="art-drip" style="--dy:420px" cx="520" cy="210" rx="2.5" ry="5"/><ellipse class="art-drip2" style="--dy:300px" cx="1090" cy="260" rx="2.5" ry="5"/></g>';
    return [layer(d), layer(drips), AMB.dust];
  };

  BG.torony = () => {
    const p = uid();
    let d = `<defs>${glowDefs(p)}${lin(`${p}w`, [[0, '#0c1218'], [0.5, '#1c2834'], [1, '#0a0e12']], 0, 0, 1, 0)}${lin(`${p}c`, [[0, '#06090c'], [0.6, '#16202a'], [1, '#06090c']], 0, 0, 1, 0)}`
      + `${lin(`${p}sk`, [[0, '#0c1016'], [1, '#2a3440']])}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}w)"/>`;
    // tall broken window with the storm outside
    d += `<path d="${P.arch(1080, 60, 300, 420)}" fill="url(#${p}sk)"/>`;
    d += '<g fill="#3a4654" opacity=".8"><ellipse cx="1180" cy="200" rx="160" ry="40"/><ellipse cx="1300" cy="320" rx="120" ry="30"/></g>';
    d += '<path d="M1080 480V320l60 40 30 -60 40 70 50 -40 30 60 50 -30 40 50V480Z" fill="#0b0f13"/>';
    d += '<path d="M1080 320l60 40 30 -60 40 70 50 -40 30 60 50 -30 40 50" fill="none" stroke="#c8dcea" stroke-width="3" opacity=".7"/>';
    d += `<path d="${P.arch(1080, 60, 300, 420)}" fill="none" stroke="#06080a" stroke-width="22"/><path d="M1230 60V480M1080 300H1380" stroke="#06080a" stroke-width="10"/>`;
    // the central column and the spiral steps climbing up to the right
    d += `<rect x="0" y="0" width="230" height="900" fill="url(#${p}c)"/>`;
    let steps = '';
    let frost = '';
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = 160 + t * 980;
      const y = 900 - t * 520 - Math.sin(t * Math.PI) * 60;
      const w = 220 - t * 90;
      const h = 34 - t * 12;
      steps += `<path d="M${R(x)} ${R(y)}h${R(w)}l${R(-30 + t * 10)} ${R(h)}h${R(-w)}z" fill="#2a3440"/><path d="M${R(x - 30 + t * 10)} ${R(y + h)}h${R(w)}v${R(h * 1.4)}h${R(-w)}z" fill="#141c24"/>`;
      frost += `M${R(x + 6)} ${R(y + 2)}h${R(w - 12)}`;
    }
    d += steps + `<path d="${frost}" stroke="#e4f0f8" stroke-width="4" opacity=".75" stroke-linecap="round"/>`;
    d += '<path d="M1040 900Q1300 760 1600 720V900Z" fill="#0a0e12"/>';
    const out = [layer(d)];
    out.push(layer('<rect x="1080" y="60" width="300" height="420" fill="#dbe8f4" opacity=".55"/><path d="M1250 70l-20 90 26 6 -30 100 20 4 -34 110" fill="none" stroke="#fff" stroke-width="3"/>', 'art-flash'));
    // ragged shapes circling outside, seen through the window
    out.push(layer('<g fill="#05070a" opacity=".85"><path d="M1150 170q14 -30 30 0l6 40 -10 -10 -6 16 -8 -14 -10 12z"/><path d="M1300 250q10 -22 22 0l4 28 -7 -7 -5 12 -6 -10 -7 8z"/></g>', 'art-drift-x'));
    out.push(AMB.window(77, 30));
    return out;
  };

  BG.frics = () => {
    const p = uid();
    let d = room(p, { back: [240, 120, 1360, 690], backCol: [[0, '#332e26'], [1, '#1e1b16']], side: ['#0e0d0b', '#2e2a22'], floor: [[0, '#2a241c'], [1, '#0e0c0a']], stones: '#16140f', ceil: '#0a0908' });
    // filing cabinets with many small drawers on the left
    let cab = '';
    for (let c = 0; c < 3; c++) {
      const x = 270 + c * 130;
      cab += `<rect x="${x}" y="230" width="120" height="460" fill="#2a2016"/>`;
      for (let r = 0; r < 9; r++) cab += `<rect x="${x + 8}" y="${240 + r * 50}" width="104" height="42" fill="#3a2c1e"/><rect x="${x + 52}" y="${256 + r * 50}" width="16" height="6" fill="#a08850" opacity=".7"/>`;
    }
    d += cab;
    // polished chains and manacles on the right wall
    d += '<path d="M1040 230h0M1250 230h0M1120 300h0M1320 300h0" stroke="#0a0908" stroke-width="16" stroke-linecap="round"/>';
    d += P.chain(1040, 230, 1250, 230, 90, 7, '#c8ced2') + P.chain(1120, 300, 1320, 300, 110, 6, '#aab2b8') + P.chain(1250, 230, 1262, 470, 0, 6, '#b8bec2');
    d += '<g fill="none" stroke="#d4dade" stroke-width="7"><path d="M1244 470a18 22 0 1 0 36 0a18 22 0 1 0 -36 0"/><path d="M1200 410a14 18 0 1 0 28 0a14 18 0 1 0 -28 0"/></g>';
    // the desk with the oil lamp and a pile of parchment
    d += `<path d="M900 690h460v24H900z" fill="#21170f"/><path d="M920 714v120M1340 714v120" stroke="#160f0a" stroke-width="18"/>`;
    d += '<g fill="#d8cdb0" opacity=".75"><rect x="960" y="676" width="90" height="14" transform="rotate(-4 1000 680)"/><rect x="970" y="664" width="80" height="12"/></g>';
    d += '<path d="M1220 690h40l-6 -16h-28z" fill="#5a4426"/><path d="M1226 674q14 -60 28 0z" fill="#e8d8a8" opacity=".5"/>';
    // melting snow and muddy footprints on the floor
    d += '<ellipse cx="700" cy="800" rx="210" ry="22" fill="#6a7c88" opacity=".28"/>';
    let fp = '';
    for (let i = 0; i < 8; i++) fp += `M${R(380 + i * 70)} ${R(870 - i * 18 + (i % 2) * 12)}h0`;
    d += `<path d="${fp}" stroke="#2a2016" stroke-width="12" stroke-linecap="round" opacity=".8"/>`;
    const fl = `${glow(p, 'gw', 1240, 640, 700, 520, 0.6)}${glow(p, 'gw', 1240, 652, 200, 160, 0.9)}<path d="M1240 676q-8 -14 0 -26q8 12 0 26z" fill="#ffe0a0"/>`;
    return [layer(d), layer(fl, 'art-flicker'), AMB.dust];
  };

  BG.klubhelyiseg = () => {
    const p = uid();
    let d = room(p, { back: [200, 100, 1400, 680], backCol: [[0, '#3e2219'], [1, '#24130f']], side: ['#120a08', '#38201a'], floor: [[0, '#2e1c14'], [1, '#0e0806']], ceil: '#0c0605', beams: '#1a0e0a' });
    // round window with the snowy night on the right
    d += `<circle cx="1180" cy="300" r="120" fill="#1a2c40"/>${P.stars(prng(5), 18, 1080, 200, 1280, 400, 1.2)}<path d="M1180 180V420M1060 300H1300" stroke="#120a08" stroke-width="10"/><circle cx="1180" cy="300" r="120" fill="none" stroke="#120a08" stroke-width="16"/><path d="M1076 360q104 30 208 0" stroke="#dbe6ef" stroke-width="8" opacity=".6" fill="none"/>`;
    // the stone fireplace on the left, holly on the mantel
    d += '<rect x="250" y="300" width="420" height="390" fill="#3a302a"/><rect x="230" y="290" width="460" height="30" fill="#4a3e36"/><path d="M300 690V430Q460 360 620 430V690Z" fill="#0a0504"/>';
    d += '<path d="M240 286q110 30 220 0t220 0" stroke="#1d4634" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M300 296h0M380 300h0M460 290h0M540 300h0M620 296h0" stroke="#c03030" stroke-width="10" stroke-linecap="round"/>';
    d += '<path d="M380 680l90 -16 90 16" stroke="#2a1a10" stroke-width="16" stroke-linecap="round"/>';
    // squashy armchairs
    d += '<g fill="#140a08"><path d="M60 900V700q0 -60 70 -60h120q60 0 60 60v40h40v160z"/><path d="M1540 900V680q0 -60 -70 -60h-140q-60 0 -60 60v40h-40v180z"/></g>';
    d += '<g fill="none" stroke="#7a2a20" stroke-width="3" opacity=".6"><path d="M70 700q0 -50 60 -50h120q50 0 50 50"/><path d="M1530 680q0 -50 -60 -50h-140q-50 0 -50 50"/></g>';
    const fl = hearthFlames(p, 460, 676, 280, 180);
    return [layer(d), layer(fl, 'art-flicker'), `<div class="art-amb art-embers" style="-webkit-mask-image:radial-gradient(ellipse 16% 40% at 29% 70%,#000 30%,transparent 100%);mask-image:radial-gradient(ellipse 16% 40% at 29% 70%,#000 30%,transparent 100%)">${flakes('emb')}</div>`];
  };

  BG.halo = () => {
    const p = uid();
    let d = room(p, { back: [260, 90, 1340, 650], backCol: [[0, '#2a2c3a'], [1, '#181a22']], side: ['#0c0c10', '#2a2c38'], floor: [[0, '#2a2018'], [1, '#0c0a08']], boards: '#120e0a', ceil: '#08080c' });
    // tall window with frost flowers and snow outside
    d += `<path d="${P.arch(680, 110, 240, 400)}" fill="#22364a"/>`;
    const rf = prng(9);
    let ice = '';
    for (let i = 0; i < 26; i++) {
      const x = 690 + rf() * 220;
      const y = 300 + rf() * 210;
      const l = 14 + rf() * 30;
      const a = rf() * Math.PI * 2;
      ice += `M${R(x)} ${R(y)}l${R(Math.cos(a) * l)} ${R(Math.sin(a) * l)}m${R(-Math.cos(a) * l * 0.5)} ${R(-Math.sin(a) * l * 0.5)}l${R(Math.cos(a + 0.8) * l * 0.4)} ${R(Math.sin(a + 0.8) * l * 0.4)}`;
    }
    d += `<path d="${ice}" stroke="#e8f2fa" stroke-width="2" opacity=".55"/><path d="M800 110V510M680 330H920" stroke="#0c0d12" stroke-width="10"/><path d="${P.arch(680, 110, 240, 400)}" fill="none" stroke="#0c0d12" stroke-width="16"/>`;
    // four-poster beds with drawn red curtains, presents at their feet
    const bed = (x, flip) => {
      const s = flip ? -1 : 1;
      return `<g transform="translate(${x} 0) scale(${s} 1)"><rect x="0" y="120" width="16" height="720" fill="#1a0f0a"/><rect x="300" y="200" width="14" height="620" fill="#1a0f0a"/>`
        + '<path d="M0 120H330L314 200H16Z" fill="#4a1414"/><path d="M0 132H330" stroke="#c9a24a" stroke-width="5"/>'
        + '<path d="M16 140Q60 480 30 830H120Q150 480 110 140Z" fill="#5a1616"/><path d="M200 200Q240 480 210 800H300Q320 480 300 200Z" fill="#4a1212"/>'
        + '<path d="M40 160q30 300 10 650M240 220q24 280 6 560" stroke="#7a2a24" stroke-width="5" fill="none" opacity=".6"/>'
        + '<rect x="0" y="640" width="330" height="80" fill="#2a1a12"/><rect x="10" y="610" width="310" height="40" fill="#3a2a40" opacity=".8"/></g>';
    };
    d += bed(10, false) + bed(1590, true);
    const gift = (x, y, w, h, col, rib) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}"/><path d="M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}" stroke="${rib}" stroke-width="5"/><path d="M${x + w / 2} ${y}q-14 -14 -20 0q10 6 20 0q14 -14 20 0q-10 6 -20 0" fill="none" stroke="${rib}" stroke-width="4"/>`;
    d += gift(120, 780, 90, 70, '#1d4634', '#d6b261') + gift(220, 800, 70, 50, '#6a1a1a', '#e8d8b0') + gift(1360, 790, 100, 60, '#2a3a6a', '#d6b261') + gift(1290, 815, 60, 40, '#5a3a14', '#c03030');
    d += '<rect x="400" y="600" width="70" height="90" fill="#1a120c"/><rect x="430" y="560" width="10" height="40" fill="#e9dfc6"/>';
    const fl = `${glow(p, 'gw', 435, 556, 120, 100, 0.8)}${P.flame(435, 560, 1.2)}${glow(p, 'gc', 800, 330, 260, 240, 0.5)}`;
    return [layer(d), layer(fl, 'art-flicker'), AMB.window(50, 33)];
  };

  BG.szellemszallas = () => {
    const p = uid();
    let d = room(p, { back: [220, 130, 1380, 680], backCol: [[0, '#302c28'], [1, '#1a1816']], side: ['#0a0908', '#2a2622'], floor: [[0, '#26201a'], [1, '#0a0908']], planks: '#141210', boards: '#120e0a', ceil: '#080706' });
    // boarded window with storm light leaking through
    d += '<rect x="330" y="220" width="220" height="250" fill="#5a6a7a" opacity=".55"/>';
    d += '<g fill="#1a1612"><rect x="310" y="236" width="260" height="34" transform="rotate(-6 440 253)"/><rect x="310" y="320" width="260" height="30" transform="rotate(5 440 335)"/><rect x="310" y="400" width="260" height="36" transform="rotate(-3 440 418)"/></g>';
    d += '<path d="M330 270L120 900H260L420 280ZM340 360L300 900H420L450 370Z" fill="#b8d0e0" opacity=".12"/>';
    // torn wallpaper strips, claw marks, a broken chair, the stair to the upper floor
    d += '<g fill="#2a2420" opacity=".8"><path d="M640 130l30 0 -6 120 -18 30z"/><path d="M880 130h40l-10 90 -22 -20z"/><path d="M1100 130h26l-4 160 -14 -40z"/></g>';
    d += '<g stroke="#000" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="M720 760l80 -60M740 776l84 -62M762 790l82 -60M784 802l78 -58"/><path d="M1000 320l40 80M1016 314l40 80M1032 308l40 80"/></g>';
    d += '<g fill="#0e0b09"><path d="M520 820l70 -110h80l-10 20h-60l-50 90z"/><path d="M600 710v-110h14v110z"/><path d="M660 730l40 90h-14l-40 -86z"/></g>';
    d += '<path d="M1600 300L1260 680H1600Z" fill="#0c0a09"/>';
    let st = '';
    for (let i = 0; i < 8; i++) st += `M${1300 + i * 40} ${R(660 - i * 46)}h${60}`;
    d += `<path d="${st}" stroke="#2a241e" stroke-width="10"/><path d="M1280 600L1600 240" stroke="#1a1612" stroke-width="8"/><path d="M1320 560v-40M1400 470v-40M1480 380v-40" stroke="#1a1612" stroke-width="6"/>`;
    return [layer(d), layer('<rect x="330" y="220" width="220" height="250" fill="#e4eef6" opacity=".5"/>', 'art-flash2'), AMB.dust];
  };

  BG.szukseg = () => {
    const p = uid();
    const c = corridor(p, {
      pal: { wallNear: '#22241e', wallFar: '#46483c', floorNear: '#191a15', floorFar: '#424238', ceilNear: '#0e0f0c', ceilFar: '#2a2b23', end: '#383a30', line: '#121310', rib: '#1a1b16', pillar: '#383a30' },
      torches: [[-1, 1.8], [1, 2.4]],
      ribs: [1.2, 2.2],
      extra: (pr) => {
        // the tapestry of Barnabas the Barmy and the dancing trolls (left wall)
        const a = pr(0, 180, 0.15);
        const b = pr(0, 180, 0.95);
        const c2 = pr(0, 720, 0.95);
        const d2 = pr(0, 720, 0.15);
        let t = `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c2[0]} ${c2[1]}L${d2[0]} ${d2[1]}Z" fill="#3a2a1a"/><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c2[0]} ${c2[1]}L${d2[0]} ${d2[1]}Z" fill="none" stroke="#8a6a3a" stroke-width="8"/>`;
        [[0.3, 1], [0.5, 0.9], [0.7, 1.1]].forEach(([z, k]) => {
          const [x, y] = pr(0, 640, z);
          const s = (1 / (1 + z)) * 0.9 * k;
          t += `<g transform="translate(${x + R(20 * s)} ${y}) scale(${n1(s)})" fill="#1a120a"><ellipse cx="0" cy="-150" rx="34" ry="44"/><circle cx="4" cy="-212" r="22"/><path d="M-50 -110q50 30 100 0l14 30q-64 20 -128 0z" fill="#6a5a7a"/><path d="M-20 -100l-30 100M20 -100l40 90" stroke="#1a120a" stroke-width="16"/><path d="M-30 -170l-50 -40M30 -170l50 -50" stroke="#1a120a" stroke-width="12"/></g>`;
        });
        // a door drawing itself on the blank right wall
        const e = pr(1600, 330, 0.8);
        const g = pr(1600, 900, 1.25);
        return t + `<path d="M${e[0]} ${g[1]}V${e[1] + 40}Q${e[0]} ${e[1]} ${R((e[0] + g[0]) / 2)} ${e[1] + 4}Q${g[0]} ${e[1] + 10} ${g[0]} ${e[1] + 50}V${g[1]}" fill="#0a0c0b" opacity=".6"/>`;
      }
    });
    const e = c.pr(1600, 330, 0.8);
    const g = c.pr(1600, 900, 1.25);
    const door = `${glow(p, 'gw', (e[0] + g[0]) / 2, (e[1] + g[1]) / 2, 140, 260, 0.6)}<path d="M${e[0]} ${g[1]}V${e[1] + 40}Q${e[0]} ${e[1]} ${R((e[0] + g[0]) / 2)} ${e[1] + 4}Q${g[0]} ${e[1] + 10} ${g[0]} ${e[1] + 50}V${g[1]}" fill="none" stroke="#ffd890" stroke-width="5"/>`;
    return [layer(c.d), layer(c.fl, 'art-flicker'), layer(door, 'art-door')];
  };

  BG.vadkan = () => {
    const p = uid();
    let d = room(p, { back: [240, 130, 1360, 660], backCol: [[0, '#38332a'], [1, '#201d16']], side: ['#0c0a08', '#2e2a20'], floor: [[0, '#2c261c'], [1, '#0c0a08']], boards: '#15120c', beams: '#16130e', ceil: '#0a0908' });
    // grimy windows
    d += '<g fill="#4a5a4a" opacity=".55"><rect x="300" y="220" width="130" height="170"/><rect x="460" y="220" width="130" height="170"/></g><g stroke="#151209" stroke-width="8"><path d="M365 220v170M300 305h130M525 220v170M460 305h130"/></g><g fill="#1a1a12" opacity=".45"><ellipse cx="340" cy="360" rx="50" ry="30"/><ellipse cx="560" cy="250" rx="40" ry="30"/></g>';
    // Ariana's portrait over the mantelpiece
    d += '<rect x="680" y="420" width="280" height="240" fill="#1a140c"/><rect x="660" y="404" width="320" height="22" fill="#2a2014"/><path d="M720 660v-100q100 -40 200 0v100z" fill="#080604"/>';
    d += P.portrait(730, 170, 180, 220, '#2a3a2e', '#3a3020', '#8a6c2e');
    d += '<path d="M780 360q40 -90 80 0" fill="#c8b890" opacity=".35"/>';
    // the bar with bottles on the right
    d += '<rect x="1080" y="560" width="520" height="340" fill="#1a120a"/><rect x="1060" y="548" width="540" height="20" fill="#2a1e12"/>';
    let bt = '';
    for (let i = 0; i < 12; i++) bt += `<rect x="${1110 + i * 38}" y="${R(300 + (i % 3) * 6)}" width="16" height="${R(56 - (i % 3) * 6)}" rx="5" fill="${['#2a3a22', '#3a2412', '#1a2a2a'][i % 3]}"/>`;
    d += `<rect x="1090" y="360" width="480" height="10" fill="#2a1e12"/>${bt}`;
    d += '<g fill="#1a120a"><rect x="380" y="700" width="200" height="16"/><path d="M400 716v120M560 716v120" stroke="#1a120a" stroke-width="12"/></g><rect x="460" y="672" width="12" height="28" fill="#d8cdb0"/>';
    const fl = `${glow(p, 'gw', 466, 668, 140, 110, 0.8)}${P.flame(466, 672, 1.1)}${glow(p, 'gw', 820, 640, 240, 90, 0.6)}${hearthFlames(p, 820, 652, 160, 70)}`;
    return [layer(d), layer(fl, 'art-flicker'), AMB.smoke];
  };

  // Gargoyle (stone), local frame: origin = bottom centre, crouching, facing left, bat wings half spread.
  const GARGOYLE = (g) => '<rect x="-96" y="-72" width="192" height="72" fill="#1e2126"/><rect x="-106" y="-84" width="212" height="16" fill="#2e3238"/>'
    + `<g fill="url(#${g})">`
    + '<path d="M30 -196C64 -262 118 -326 166 -338C154 -306 160 -284 176 -264C146 -264 132 -248 136 -226C110 -232 92 -220 90 -198C72 -208 54 -204 44 -186Z"/>'
    + '<path d="M120 -96q60 -10 50 -60q-6 -26 14 -36q-2 30 -8 50q-10 52 -56 58z"/>'
    + '<path d="M-44 -84C-62 -126 -62 -172 -32 -208C-2 -238 50 -228 62 -192C74 -160 72 -112 58 -84Z"/>'
    + '<ellipse cx="44" cy="-118" rx="38" ry="42"/>'
    + '<path d="M-52 -190l-12 106h26l4 -96zM-20 -196l-6 112h24l2 -104z"/>'
    + '<path d="M-28 -212C-50 -252 -92 -258 -114 -238C-124 -224 -118 -208 -100 -204L-84 -198C-68 -194 -46 -196 -28 -202Z"/>'
    + '<path d="M-62 -246q-10 -28 8 -44q-2 22 8 38zM-44 -240q0 -30 22 -40q-8 22 -6 38z"/>'
    + '</g>'
    + '<path d="M-106 -206l5 12 5 -12zM-92 -203l5 11 5 -11z" fill="#9aa0a6"/><circle cx="-76" cy="-232" r="4" fill="#050607"/>'
    + '<path d="M44 -186C80 -250 120 -300 160 -326M90 -198L150 -290M136 -226L166 -276" stroke="#1a1d22" stroke-width="3" fill="none"/>'
    + '<path d="M-32 -208C-2 -236 48 -228 60 -194" stroke="#8a929a" stroke-width="3" fill="none" opacity=".5"/>';
  BG.vizkopo = () => {
    const p = uid();
    const c = corridor(p, {
      pal: { wallNear: '#16171c', wallFar: '#3a3c48', floorNear: '#121317', floorFar: '#363842', ceilNear: '#0a0b0d', ceilFar: '#22242a', end: '#2c2e36', line: '#0c0d10', rib: '#131418', pillar: '#2e3038' },
      torches: [[-1, 0.5], [-1, 1.6], [1, 1.6]],
      defs: lin(`${p}st`, [[0, '#6a7078'], [0.45, '#3a3f46'], [1, '#1e2126']], 0, 0, 1, 0),
      extra: (pr, f) => {
        const [x, y] = pr(1330, 900, 0.3);
        const s = f(0.3) * 1.3;
        const [dx, dy] = pr(1600, 280, 0.65);
        const [ex, ey] = pr(1600, 900, 0.95);
        return `<path d="M${dx} ${ey}V${dy + 60}Q${R((dx + ex) / 2)} ${dy - 20} ${ex} ${dy + 70}V${ey}Z" fill="#030304"/>`
          + `<path d="M${dx + 10} ${ey - 10}q30 -40 ${R((ex - dx) * 0.6)} -60" stroke="#2a2c34" stroke-width="8" fill="none"/>`
          + `<g transform="translate(${x} ${y}) scale(${n1(s)})">${GARGOYLE(`${p}st`)}</g>`;
      }
    });
    return [layer(c.d), layer(c.fl, 'art-flicker')];
  };

  BG.iroda = () => {
    const p = uid();
    const rr = prng(121);
    let d = `<defs>${glowDefs(p)}${rad(`${p}bg`, [[0, '#3a2418'], [0.7, '#1a100c'], [1, '#0a0605']], 0.5, 0.45, 0.7)}${lin(`${p}gl`, [[0, '#e8f4ff', 0.22], [1, '#a9c4d6', 0.06]], 0, 0, 1, 0)}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}bg)"/>`;
    // curved wall lined with sleeping headmasters' portraits
    let pt = '';
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 9; i++) {
        const x = 40 + i * 175 + (row ? 80 : 0);
        if (row && i > 7) continue;
        const y = 40 + row * 190 + Math.abs(x - 800) * -0.04;
        const w = 110 + rr() * 30;
        const h = 140 + rr() * 20;
        pt += P.portrait(x, y, w, h, ['#2a2418', '#1e2a22', '#2a1c1c', '#1c2230'][R(rr() * 3)], '#14100c', '#8a6c2e', rr() < 0.25);
      }
    }
    d += pt;
    // shelves left with the Sorting Hat, spindly tables with silver instruments
    d += '<rect x="0" y="420" width="300" height="16" fill="#2a1a10"/><rect x="0" y="560" width="260" height="16" fill="#2a1a10"/>';
    d += '<path d="M90 420c10 -40 30 -70 40 -110c6 30 4 50 30 70c16 10 30 30 40 40z" fill="#3a2a1a"/><path d="M80 420q70 -14 140 0" stroke="#2a1c10" stroke-width="10"/><path d="M120 380q20 8 36 0" stroke="#0a0604" stroke-width="5" fill="none"/>';
    d += '<g fill="#2a1a10"><rect x="330" y="640" width="150" height="10"/><path d="M340 650l-20 200M470 650l20 200M405 650v200" stroke="#2a1a10" stroke-width="5"/></g>';
    d += '<g fill="#b8c4cc"><path d="M380 640v-40h50v40z" opacity=".7"/><circle cx="405" cy="590" r="26" fill="none" stroke="#c8d4dc" stroke-width="4"/></g>';
    // the glass case with Gryffindor's sword
    d += `<rect x="1180" y="300" width="140" height="440" fill="url(#${p}gl)" stroke="#d6b261" stroke-width="5"/><rect x="1170" y="740" width="160" height="30" fill="#2a1a10"/>`;
    d += '<path d="M1250 360l10 20v300h-20v-300z" fill="#c8d4dc"/><path d="M1220 690h60v12h-60z" fill="#c9a24a"/><path d="M1244 702h12v40h-12z" fill="#5a3a1a"/><circle cx="1250" cy="696" r="7" fill="#c02a2a"/><circle cx="1250" cy="750" r="8" fill="#c9a24a"/>';
    d += '<path d="M1196 320l30 400" stroke="#fff" stroke-width="4" opacity=".25"/>';
    // Fawkes's golden perch (empty), the claw-footed desk
    d += '<path d="M1440 500v330M1400 830h80M1400 500h80" stroke="#c9a24a" stroke-width="8" stroke-linecap="round"/>';
    d += '<path d="M520 900l30 -140h500l30 140z" fill="#1a0f0a"/><rect x="500" y="740" width="600" height="30" fill="#2a1a10"/><path d="M500 740h600" stroke="#c9a24a" stroke-width="3" opacity=".5"/>';
    const inst = '<g fill="none" stroke="#dce6ec" stroke-width="3"><g class="art-spin"><circle cx="405" cy="590" r="20"/><path d="M385 590h40M405 570v40"/></g><g class="art-spin-r"><circle cx="560" cy="700" r="16"/><path d="M548 688l24 24M548 712l24 -24"/></g></g><path d="M560 716v24" stroke="#b8c4cc" stroke-width="4"/>';
    const fl = `${glow(p, 'gw', 300, 120, 300, 200, 0.4)}${glow(p, 'gw', 1300, 140, 300, 200, 0.4)}${glow(p, 'gs', 1250, 520, 120, 260, 0.35)}`;
    return [layer(d), layer(inst), layer(fl, 'art-pulse')];
  };

  // A straight flight of stairs as a slanted band with steps and a rail.
  const stairFlight = (x1, y1, x2, y2, w, col, edge) => {
    const n = Math.max(6, R(Math.hypot(x2 - x1, y2 - y1) / 28));
    let st = '';
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      st += `M${R(x)} ${R(y)}l0 ${R(w)}`;
    }
    return `<path d="M${x1} ${y1}L${x2} ${y2}l0 ${w}L${x1} ${y1 + w}Z" fill="${col}"/><path d="${st}" stroke="${edge}" stroke-width="3" opacity=".7"/>`
      + `<path d="M${x1} ${y1 - 40}L${x2} ${y2 - 40}" stroke="${edge}" stroke-width="4"/><path d="M${x1} ${y1}v-40M${R((x1 + x2) / 2)} ${R((y1 + y2) / 2)}v-40M${x2} ${y2}v-40" stroke="${edge}" stroke-width="3"/>`;
  };

  BG.lepcso = () => {
    const p = uid();
    const rr = prng(131);
    let d = `<defs>${glowDefs(p)}${lin(`${p}bg`, [[0, '#0e0d0c'], [0.45, '#3a342c'], [1, '#0a0908']])}</defs>`;
    d += `<rect width="1600" height="900" fill="url(#${p}bg)"/>`;
    // walls full of portraits
    let pt = '';
    for (let i = 0; i < 26; i++) {
      const x = rr() * 1560;
      const y = 40 + rr() * 560;
      const w = 50 + rr() * 60;
      pt += P.portrait(x, y, w, w * 1.25, ['#2a2418', '#1e2a22', '#2a1c1c'][i % 3], '#100c08', '#6a5228');
    }
    d += `<g opacity=".7">${pt}</g>`;
    // landings and static flights at different heights
    d += '<g fill="#1a1612"><rect x="0" y="300" width="300" height="26"/><rect x="1300" y="210" width="300" height="26"/><rect x="0" y="640" width="380" height="30"/><rect x="1220" y="560" width="380" height="30"/></g>';
    d += '<g fill="#050505"><path d="M60 300V200q50 -50 100 0v100z"/><path d="M1440 210V110q50 -50 100 0v100z"/><path d="M80 640V530q60 -60 120 0v110z"/></g>';
    d += stairFlight(300, 300, 620, 120, 30, '#24201a', '#5a4a34') + stairFlight(980, 120, 1300, 210, 30, '#24201a', '#5a4a34') + stairFlight(380, 640, 760, 860, 34, '#2a241c', '#6a5638');
    d += '<path d="M0 900V820q800 -60 1600 0V900Z" fill="#030303"/>';
    let fl = '';
    [[150, 420], [1450, 330], [700, 60]].forEach(([x, y]) => { d += P.torch(x, y, 1.1); fl += P.torchFlame(p, x, y, 1.1); });
    // one staircase swings slowly to a new landing
    const swing = stairFlight(1220, 560, 820, 360, 32, '#2e281e', '#7a6440');
    return [layer(d), layer(fl, 'art-flicker'), layer(swing, 'art-swing', '--ox:76%;--oy:64%;--sw:-7deg'), AMB.fogHigh];
  };

  BG.kapu = () => {
    const p = uid();
    let d = room(p, { back: [200, 60, 1400, 700], backCol: [[0, '#363842'], [1, '#22242a']], side: ['#0e0f12', '#2e3038'], floor: [[0, '#32343c'], [1, '#101114']], stones: '#16171c', ceil: '#0a0a0c' });
    // flagstones
    let fs = '';
    for (let i = 0; i < 9; i++) fs += `M${R(800 + (i - 4) * 300)} 700L${R(800 + (i - 4) * 300 * 2.4)} 900`;
    d += `<path d="${fs}M140 760H1460M60 830H1540" stroke="#0a0b0d" stroke-width="3"/>`;
    // the great oak doors, iron-banded, cold light at the seam
    d += `${glow(p, 'gc', 800, 420, 360, 340, 0.5)}<path d="${P.rarch(560, 110, 480, 590)}" fill="#0a0806"/>`;
    d += `<path d="${P.rarch(580, 130, 440, 570)}" fill="#3a2614"/>`;
    let bands = '';
    [260, 420, 580].forEach((y) => { bands += `M580 ${y}H1020`; });
    d += `<path d="${bands}" stroke="#141010" stroke-width="16"/><path d="M800 130V700" stroke="#c8dcea" stroke-width="5" opacity=".8"/>`;
    let studs = '';
    for (let y = 300; y < 700; y += 40) for (let x = 610; x < 1000; x += 60) studs += `M${x} ${y}h0`;
    d += `<path d="${studs}" stroke="#1a1414" stroke-width="9" stroke-linecap="round"/><g fill="none" stroke="#141010" stroke-width="8"><circle cx="760" cy="470" r="20"/><circle cx="840" cy="470" r="20"/></g>`;
    // the house-point hourglasses on the left wall
    const gems = ['#c0302a', '#2a8a4a', '#2a4ac0', '#d6b02a'];
    let hg = '';
    gems.forEach((g, i) => {
      const x = 40 + i * 42;
      const y = 250 + i * 18;
      hg += `<path d="M${x} ${y}h30l-12 60 12 60h-30l12 -60z" fill="#a9c4d6" opacity=".18" stroke="#c9a24a" stroke-width="3"/><path d="M${x + 4} ${y + 120}l11 -${30 + i * 8} 11 ${30 + i * 8}z" fill="${g}" opacity=".9"/>`;
    });
    d += hg;
    // the marble staircase climbing away on the right
    let st = '';
    for (let i = 0; i < 9; i++) st += `<rect x="${1260 + i * 30}" y="${700 - i * 50}" width="${340 - i * 30}" height="20" fill="#3a3c42"/><rect x="${1260 + i * 30}" y="${720 - i * 50}" width="${340 - i * 30}" height="30" fill="#24262c"/>`;
    d += st;
    let fl = '';
    [[440, 300], [1160, 300]].forEach(([x, y]) => { d += P.torch(x, y, 1.3); fl += P.torchFlame(p, x, y, 1.3); });
    return [layer(d), layer(fl, 'art-flicker'), AMB.stream(50, 62)];
  };

  BG.mosdo = () => {
    const p = uid();
    let d = room(p, { back: [220, 110, 1380, 650], backCol: [[0, '#2c3a34'], [1, '#1a2420']], side: ['#0a0e0c', '#26342e'], floor: [[0, '#2a3832'], [1, '#0c100e']], stones: '#141c18', ceil: '#080a09' });
    // cubicles along the left
    let cub = '';
    for (let i = 0; i < 4; i++) {
      const x = 250 + i * 120;
      cub += `<rect x="${x}" y="300" width="110" height="350" fill="#1e2a26"/><rect x="${x + 6}" y="320" width="98" height="320" fill="#26342e"/><circle cx="${x + 90}" cy="480" r="4" fill="#8a9a92"/>`;
    }
    d += cub;
    // the big cracked mirror above the ring of sinks
    d += `<rect x="900" y="170" width="380" height="260" fill="#3a4a46" opacity=".8"/><rect x="900" y="170" width="380" height="260" fill="none" stroke="#5a6a62" stroke-width="10"/>`;
    d += '<path d="M1020 170l40 90 -50 60 70 110M1060 260l90 -30 40 80" stroke="#c8d8d0" stroke-width="2" fill="none" opacity=".6"/>';
    d += '<rect x="1030" y="470" width="120" height="230" fill="#26302c"/>';
    let sinks = '';
    [[940, 560], [1010, 590], [1170, 590], [1240, 560]].forEach(([x, y]) => { sinks += `<path d="M${x - 40} ${y}h80l-12 34h-56z" fill="#3a4844"/><path d="M${x - 40} ${y}h80" stroke="#8a9a92" stroke-width="5"/><path d="M${x} ${y}v-20h12" stroke="#a08a5a" stroke-width="5" fill="none"/>`; });
    d += sinks;
    // flooded floor with reflections
    d += '<g fill="#8aa49a" opacity=".16"><ellipse cx="760" cy="760" rx="320" ry="30"/><ellipse cx="1200" cy="820" rx="260" ry="26"/><ellipse cx="420" cy="840" rx="200" ry="20"/></g>';
    d += '<g stroke="#c8d8d0" stroke-width="2" opacity=".25"><path d="M600 760h120M1100 820h90M380 840h60"/></g>';
    const drips = '<ellipse class="art-drip" style="--dy:150px" cx="1022" cy="574" rx="2.5" ry="5" fill="#b8ccc4"/>';
    return [layer(d), layer(`${glow(p, 'gc', 1090, 300, 300, 200, 0.5)}${drips}`), layer(`${glow(p, 'gs', 760, 760, 260, 40, 0.3)}`, 'art-pulse')];
  };

  BG.kopogtato = () => {
    const p = uid();
    let d = room(p, { back: [220, 80, 1380, 720], backCol: [[0, '#2a3246'], [1, '#181e2a']], side: ['#0a0c12', '#262e40'], floor: [[0, '#2a3040'], [1, '#0c0e14']], stones: '#141824', ceil: '#08090e' });
    // narrow window with a starry sky
    d += `<path d="${P.arch(1080, 170, 110, 300)}" fill="#14223a"/>${P.stars(prng(17), 20, 1085, 220, 1185, 460, 1.3)}<path d="${P.arch(1080, 170, 110, 300)}" fill="none" stroke="#06070a" stroke-width="10"/>`;
    // the plain door at the top of the spiral stair (no handle, no keyhole)
    d += `<path d="${P.rarch(420, 200, 300, 520)}" fill="#2a1c12"/><path d="M470 260V720M520 240V720M570 236V720M620 240V720M670 260V720" stroke="#1a110a" stroke-width="4"/>`;
    d += `<path d="${P.rarch(420, 200, 300, 520)}" fill="none" stroke="#3a3c46" stroke-width="14"/>`;
    d += '<g transform="translate(570 420) scale(.22)"><path d="M0 -60L-24 -20L-110 -40L-60 10L-20 0L-30 50L0 30L30 50L20 0L60 10L110 -40L24 -20Z" fill="#a9763a"/><circle cx="0" cy="-60" r="18" fill="#c08a46"/><circle cx="0" cy="90" r="40" fill="none" stroke="#a9763a" stroke-width="12"/></g>';
    // stone steps of the spiral stair below the door
    d += '<path d="M380 720h380l-30 40H400zM360 760h420l-30 50H380zM340 810h460l-30 60H360z" fill="#22262e"/><path d="M380 720h380M360 760h420M340 810h460" stroke="#3a4050" stroke-width="4"/>';
    let fl = '';
    d += P.torch(900, 300, 1.2);
    fl += P.torchFlame(p, 900, 300, 1.2);
    return [layer(d), layer(fl, 'art-flicker'), layer(`${glow(p, 'gw', 570, 420, 40, 40, 0.5)}`, 'art-pulse')];
  };

  BG.tanterem = () => {
    const p = uid();
    let d = room(p, { back: [240, 100, 1360, 640], backCol: [[0, '#2e333c'], [1, '#1a1e24']], side: ['#0c0d10', '#2a2e36'], floor: [[0, '#30281e'], [1, '#0e0c0a']], boards: '#16120e', ceil: '#0a0a0c', beams: '#15171c' });
    // tall windows on the left wall with the snowy light
    d += '<path d="M60 200L170 220V560L60 600Z" fill="#3a5470" opacity=".7"/><path d="M110 210V580M60 400L170 390" stroke="#0a0c0e" stroke-width="8"/>';
    d += '<path d="M60 200L170 220L520 900H160Z" fill="#c8dcea" opacity=".05"/>';
    // the old wardrobe in the corner and bookshelves
    d += '<rect x="1180" y="260" width="180" height="380" fill="#2a1a10"/><path d="M1270 270V630" stroke="#140c08" stroke-width="5"/><circle cx="1258" cy="450" r="5" fill="#a08850"/><circle cx="1282" cy="450" r="5" fill="#a08850"/><rect x="1170" y="248" width="200" height="16" fill="#3a2414"/>';
    let bk = '';
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 12; i++) bk += `<rect x="${R(300 + i * 26 + (i % 3) * 2)}" y="${R(180 + r * 120 + (i % 4) * 4)}" width="20" height="${R(90 - (i % 4) * 4)}" fill="${['#4a1c18', '#1c3a2a', '#2a2a4a', '#5a4220'][i % 4]}"/>`;
      bk += `<rect x="290" y="${272 + r * 120}" width="340" height="10" fill="#2a1a10"/>`;
    }
    d += bk;
    // raised platform with the teacher's desk, rows of desks below
    d += '<rect x="520" y="560" width="560" height="80" fill="#1a140e"/><rect x="640" y="510" width="320" height="50" fill="#2a1c12"/>';
    d += '<g fill="#140f0a"><path d="M40 820h420l40 80H0z"/><path d="M1140 820h420l40 80H1100z"/><path d="M200 700h300l20 50H170z"/><path d="M1100 700h300l30 50H1080z"/></g>';
    // a few silver lights left over from patronus practice
    const orbs = `${glow(p, 'gs', 470, 300, 30, 30, 0.8)}${glow(p, 'gs', 1080, 220, 24, 24, 0.7)}${glow(p, 'gs', 900, 380, 18, 18, 0.6)}${glow(p, 'gs', 640, 180, 14, 14, 0.6)}`;
    return [layer(d), layer(orbs, 'art-pulse'), AMB.window(7, 45)];
  };

  BG.kunyho = () => {
    const p = uid();
    let d = room(p, { back: [200, 110, 1400, 680], backCol: [[0, '#44301e'], [1, '#2a1c10']], side: ['#100a06', '#3a2818'], floor: [[0, '#3a2818'], [1, '#100a06']], planks: '#1e140a', boards: '#170f08', beams: '#1c1208', ceil: '#0e0805' });
    // hams and pheasants hanging from the beams
    d += '<g fill="#3a2010"><path d="M420 110v40"/><ellipse cx="420" cy="190" rx="30" ry="46"/><ellipse cx="560" cy="180" rx="22" ry="36"/><ellipse cx="1060" cy="190" rx="28" ry="44"/></g><path d="M420 110v100M560 110v80M1060 110v100M1180 110v70" stroke="#2a1a0c" stroke-width="4"/><path d="M1170 180l20 50 -10 30 -20 -40z" fill="#4a3018"/>';
    // the crossbow on the wall
    d += '<g stroke="#1a0f08" stroke-width="10" stroke-linecap="round" fill="none"><path d="M700 260h200"/><path d="M760 210q40 50 0 100"/></g><path d="M760 210q40 50 0 100" stroke="#6a4a2a" stroke-width="3" fill="none"/>';
    // fireplace with the copper kettle
    d += '<rect x="960" y="360" width="360" height="320" fill="#3a2c22"/><path d="M1000 680V470Q1140 400 1280 470V680Z" fill="#080402"/><rect x="940" y="350" width="400" height="24" fill="#4a3628"/>';
    d += '<path d="M1140 470v60" stroke="#2a2018" stroke-width="4"/><path d="M1100 560q40 -40 80 0v30h-80z" fill="#a0602a"/><path d="M1180 570l30 -10" stroke="#a0602a" stroke-width="8"/>';
    // the giant bed with a patchwork quilt, the huge table
    d += '<path d="M0 520h330v200H0z" fill="#2a1a10"/>';
    const q = ['#5a2a1a', '#2a4a3a', '#6a5a2a', '#3a2a4a'];
    let pw = '';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) pw += `<rect x="${i * 40}" y="${560 + j * 50}" width="40" height="50" fill="${q[(i + j) % 4]}"/>`;
    d += pw + '<path d="M0 560h320" stroke="#1a0f08" stroke-width="3"/>';
    d += '<rect x="460" y="700" width="560" height="30" fill="#3a2414"/><path d="M490 730v170M990 730v170" stroke="#2a1a0c" stroke-width="26"/><g fill="#5a3a20"><rect x="560" y="640" width="60" height="60" rx="8"/><rect x="820" y="650" width="54" height="50" rx="8"/></g>';
    // a small window with snow, Fang's basket
    d += '<rect x="420" y="300" width="130" height="110" fill="#22364a"/><path d="M485 300v110M420 355h130" stroke="#140c06" stroke-width="8"/><path d="M420 400h130" stroke="#dbe6ef" stroke-width="6" opacity=".6"/>';
    d += '<ellipse cx="1420" cy="830" rx="150" ry="40" fill="#3a2614"/><ellipse cx="1420" cy="815" rx="120" ry="24" fill="#1a0f08"/>';
    const fl = hearthFlames(p, 1140, 676, 220, 130);
    return [layer(d), layer(fl, 'art-flicker'), AMB.window(30, 39)];
  };

  // ---------- characters (viewBox 0 0 w 400, standing on y = 396, drawn facing left or front) ----------
  const linU = (id, list, y1 = 0, y2 = 400, x1 = 0, x2 = 0) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;

  // Tufty blob (hair, beard, mane): control points pushed outwards make tufts.
  const shag = (cx, cy, rx, ry, n, amp, seed, a0 = 0, a1 = Math.PI * 2) => {
    const rnd = prng(seed);
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const r = 1 + (rnd() - 0.4) * amp;
      const x = cx + Math.cos(a) * rx * r;
      const y = cy + Math.sin(a) * ry * r;
      if (!i) { d += `M${n1(x)} ${n1(y)}`; continue; }
      const am = a - (a1 - a0) / n / 2;
      const r2 = 1 + amp * (0.6 + rnd() * 0.6);
      d += `Q${n1(cx + Math.cos(am) * rx * r2)} ${n1(cy + Math.sin(am) * ry * r2)} ${n1(x)} ${n1(y)}`;
    }
    return `<path d="${d}Z"/>`;
  };
  // Curly mass: circles around an ellipse (Bellatrix's hair).
  const curls = (cx, cy, rx, ry, n, rMin, rMax, seed) => {
    const rnd = prng(seed);
    let s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      s += `<circle cx="${n1(cx + Math.cos(a) * rx)}" cy="${n1(cy + Math.sin(a) * ry)}" r="${n1(rMin + rnd() * (rMax - rMin))}"/>`;
    }
    return s;
  };

  // Silhouette: a rim-light pass and a fill pass of the same parts, then lit details on top.
  function fig(p, o) {
    const w = o.w || 200;
    const rim = o.rim || '#d6b261';
    const [top, bot] = o.tint || ['#1c2420', '#050706'];
    const fade = o.fade ? 0 : 1;
    const body = o.ghost ? [[0, '#e8f2fa', 0.4], [0.65, '#c8dcea', 0.18], [1, '#a9c4d6', 0]] : [[0, top], [0.85, bot], [1, bot, fade]];
    const rimS = o.ghost ? [[0, '#f4f9fd', 0.95], [0.7, '#d8e6f0', 0.55], [1, '#c8dcea', 0]] : [[0, rim, 0.95], [0.5, rim, 0.62], [1, rim, o.fade ? 0 : 0.2]];
    const defs = glowDefs(p) + linU(`${p}b`, body) + linU(`${p}r`, rimS)
      + rad(`${p}h`, [[0, o.haloCol || rim, o.ghost ? 0.26 : 0.13], [1, o.haloCol || rim, 0]]) + (o.defs || '');
    const halo = `<ellipse cx="${o.hx || w / 2}" cy="${o.hy || 240}" rx="${o.hrx || w * 0.5}" ry="${o.hry || 170}" fill="url(#${p}h)"/>`;
    // Key light: the side facing the middle of the screen is lit, so the figure reads against dark rooms.
    const key = o.ghost ? '' : `<linearGradient id="${p}k" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0">${stops([[0, rim, 0.34], [0.45, rim, 0.12], [0.75, rim, 0]])}</linearGradient>`;
    return `<defs>${defs}${key}<g id="${p}s">${o.parts}</g></defs>${halo}${o.before || ''}`
      + `<use href="#${p}s" fill="none" stroke="url(#${p}r)" stroke-width="${o.rimW || 7}" stroke-linejoin="round"/>`
      + `<use href="#${p}s" fill="url(#${p}b)"/>${key ? `<use href="#${p}s" fill="url(#${p}k)"/>` : ''}${o.after || ''}`;
  }

  const CH = {};
  const GOLD = '#d6b261';
  const SILVER = '#dde8f0';
  const COLD = '#a9c4d6';

  CH.mcgonagall = {
    eyes: [[95, 134], [107, 134]], eyeR: 1.5, eyeCol: '#eef4f6',
    draw: (p) => fig(p, {
      tint: ['#1d3c30', '#04080a'], rim: GOLD,
      parts: '<path d="M80 118Q92 96 96 68Q99 46 112 36Q107 56 108 74Q112 100 122 118Z"/><ellipse cx="101" cy="120" rx="38" ry="7"/>'
        + '<ellipse cx="101" cy="137" rx="12" ry="15"/><path d="M92 147h18v8H92z"/>'
        + '<path d="M88 152Q101 148 114 152Q130 158 132 178L138 262Q146 330 156 396H46Q56 330 64 262L70 178Q72 158 88 152Z"/>'
        + '<path d="M70 176Q58 214 66 252Q80 262 98 256L100 246Q84 240 80 214ZM132 176Q144 214 136 252Q122 262 104 256L102 246Q118 240 122 214Z"/>'
        + '<ellipse cx="101" cy="253" rx="9" ry="7"/>',
      after: `<path d="M91 131h8v6h-8zM103 131h8v6h-8zM99 134h4" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`
        + '<path d="M106 256L130 302" stroke="#c8b088" stroke-width="2.6" stroke-linecap="round"/><circle cx="101" cy="156" r="2.4" fill="#e8c86a"/>'
        + `<path d="M118 120q4 -40 -8 -76" stroke="${GOLD}" stroke-width="1.5" fill="none" opacity=".35"/>`
    })
  };

  CH.dumbledore = {
    eyes: [[95.5, 120], [106.5, 120]], eyeR: 1.5, eyeCol: '#dfeaf6',
    draw: (p) => fig(p, {
      tint: ['#2e2046', '#06050c'], rim: '#e8dcc0',
      defs: linU(`${p}bd`, [[0, '#eef2f4'], [1, '#8a949c']], 110, 280),
      parts: '<path d="M74 104Q90 80 94 50Q96 24 114 10Q108 34 110 56Q114 84 128 104Z"/><ellipse cx="101" cy="106" rx="40" ry="8"/>'
        + '<ellipse cx="101" cy="123" rx="13" ry="16"/>'
        + '<path d="M84 140Q101 134 118 140Q140 150 144 176L150 262Q158 330 168 396H34Q44 330 52 262L58 176Q62 150 84 140Z"/>'
        + '<path d="M58 176Q40 230 46 272Q64 284 90 274L92 262Q72 252 70 220ZM144 176Q162 230 156 272Q138 284 112 274L110 262Q130 252 132 220Z"/>',
      after: `<path d="M87 116Q82 150 78 182Q90 172 92 146ZM115 116Q120 150 124 182Q112 172 110 146Z" fill="url(#${p}bd)" opacity=".85"/>`
        + `<path d="M89 128Q101 137 113 128Q118 172 111 222Q106 254 101 278Q96 254 91 222Q84 172 89 128Z" fill="url(#${p}bd)"/>`
        + '<path d="M95 150q6 40 4 90M106 150q-4 44 -3 92" stroke="#7a848c" stroke-width="1.2" fill="none" opacity=".6"/>'
        + `<path d="M91 122a5 5 0 0 0 9 0M102 122a5 5 0 0 0 9 0" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`
        + '<g fill="#e8dcc0" opacity=".6"><circle cx="100" cy="70" r="1.6"/><circle cx="108" cy="46" r="1.3"/><circle cx="92" cy="92" r="1.4"/><circle cx="70" cy="330" r="1.6"/><circle cx="132" cy="300" r="1.4"/><circle cx="96" cy="360" r="1.5"/></g>'
    })
  };

  CH.hagrid = {
    eyes: [[93, 64], [107, 64]], eyeR: 2.0, eyeCol: '#f2e4c4',
    draw: (p) => fig(p, {
      tint: ['#3e2c1c', '#0a0705'], rim: GOLD, hy: 220, hry: 200,
      parts: `${shag(100, 70, 50, 60, 22, 0.28, 3)}`
        + '<path d="M40 118Q100 98 160 118Q192 134 194 182L198 300Q200 340 192 372H8Q0 340 2 300L6 182Q8 134 40 118Z"/>'
        + '<path d="M6 182Q-6 250 4 316Q20 330 38 316L42 250ZM194 182Q206 250 196 316Q180 330 162 316L158 250Z"/>'
        + '<path d="M48 370h42v26H44zM110 370h42l4 26h-46z"/>',
      after: `${shag(100, 96, 34, 34, 14, 0.25, 8, 0.15, Math.PI - 0.15).replace('<path', '<path fill="#2a1e14" opacity=".9"')}`
        + '<ellipse cx="100" cy="66" rx="18" ry="14" fill="#140e0a"/><circle cx="92" cy="64" r="2" fill="#f4ecd8"/><circle cx="108" cy="64" r="2" fill="#f4ecd8"/>'
        + '<path d="M100 140V368M58 232h32M110 232h32M58 300h32M110 300h32" stroke="#6a5038" stroke-width="2" opacity=".55"/>'
        + `<path d="M60 40q-14 30 -6 60M140 40q14 30 6 60" stroke="${GOLD}" stroke-width="1.5" fill="none" opacity=".3"/>`
    })
  };

  CH.piton = {
    eyes: [[93, 74], [102, 74]], eyeR: 1.4, eyeCol: '#e4e8ea',
    draw: (p) => fig(p, {
      tint: ['#16161a', '#030304'], rim: COLD,
      parts: '<path d="M76 104Q40 180 30 260Q22 320 6 396H70L72 140Z"/>'
        + '<path d="M120 104Q172 158 188 240Q200 300 196 344L186 372L176 360L172 396H130L126 140Z"/>'
        + '<path d="M84 100Q98 94 112 100Q124 108 126 130L130 230Q134 300 138 396H62Q64 300 68 230L70 130Q72 108 84 100Z"/>'
        + '<ellipse cx="98" cy="76" rx="12" ry="15"/><path d="M84 72Q85 52 98 51Q113 51 114 70L117 106Q109 99 108 86L106 72Q98 66 90 72L88 88Q86 100 79 106Z"/>',
      after: `<path d="M98 72q5 7 0 12" stroke="${COLD}" stroke-width="1.4" fill="none" opacity=".6"/><path d="M92 112h14" stroke="#2a2a30" stroke-width="2"/>`
        + `<path d="M124 120Q176 170 190 250" stroke="${COLD}" stroke-width="1.4" fill="none" opacity=".35"/>`
    })
  };

  CH.frics = {
    eyes: [[67, 130], [76, 130]], eyeR: 1.5, eyeCol: '#efe2c8',
    draw: (p) => fig(p, {
      tint: ['#2e2a22', '#070605'], rim: '#ffcf8a', hx: 70, hy: 250,
      parts: '<ellipse cx="72" cy="132" rx="13" ry="15"/>'
        + '<path d="M84 140Q120 126 138 150Q152 182 146 240L150 330Q152 362 156 396H76Q78 362 80 330L82 250Q70 212 66 170Q66 150 84 140Z"/>'
        + '<path d="M78 170Q56 196 40 214L47 222Q66 207 90 190Z"/><ellipse cx="42" cy="216" rx="6" ry="5"/>'
        + '<path d="M40 396Q36 370 44 356Q40 344 46 336L51 345H57L62 336Q66 346 61 356Q70 372 68 396Z"/>',
      after: '<path d="M60 126q-6 -14 6 -18M84 124q8 -12 0 -18" stroke="#8a8478" stroke-width="2" fill="none"/>'
        + '<path d="M68 392q20 4 22 -16" stroke="#3a342c" stroke-width="4" fill="none" stroke-linecap="round"/>'
        + `${glow(p, 'gw', 41, 248, 70, 70, 0.9)}<path d="M41 216v8" stroke="#2a2018" stroke-width="2"/><path d="M30 226h22l-3 34H33z" fill="#2a2018"/><rect x="34" y="230" width="14" height="26" fill="#ffd27a"/><path d="M28 260h26" stroke="#2a2018" stroke-width="4"/>`
        + '<circle cx="49" cy="350" r="2.4" fill="#ffd040"/><circle cx="57" cy="350" r="2.4" fill="#ffd040"/>'
    })
  };

  CH.flitwick = {
    eyes: [[94, 211], [105, 211]], eyeR: 1.6, eyeCol: '#eef4f6',
    draw: (p) => fig(p, {
      tint: ['#232842', '#06070c'], rim: GOLD, hy: 260, hry: 120,
      parts: '<ellipse cx="100" cy="214" rx="15" ry="17"/><path d="M88 230Q100 226 112 230Q124 238 126 260L130 322H70L74 260Q76 238 88 230Z"/>'
        + '<path d="M112 240Q130 226 136 206L142 210Q136 236 116 252Z"/><path d="M88 240Q76 260 80 290L88 290Q86 266 96 250Z"/>',
      before: '<rect x="50" y="322" width="96" height="24" fill="#4a1c18"/><rect x="58" y="346" width="86" height="24" fill="#1c3a2a"/><rect x="52" y="370" width="98" height="26" fill="#22284a"/>'
        + '<path d="M50 334h96M58 358h86M52 383h98" stroke="#c9a24a" stroke-width="2" opacity=".7"/>',
      after: '<path d="M85 212q-6 -12 3 -17q1 -10 11 -9q7 -7 14 1q10 1 7 15q4 6 0 10" stroke="#d4d8dc" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M93 226q7 5 14 0" stroke="#d4d8dc" stroke-width="3" fill="none" stroke-linecap="round"/>'
        + '<path d="M140 208L162 176" stroke="#c8b088" stroke-width="2.4" stroke-linecap="round"/>'
        + `${glow(p, 'gw', 163, 174, 18, 18, 0.9)}<path d="M163 166l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill="#fff0c0"/>`
    })
  };

  CH.pomfrey = {
    eyes: [[95, 90], [104, 90]], eyeR: 1.4, eyeCol: '#eef4f6',
    draw: (p) => fig(p, {
      tint: ['#2a2444', '#07060c'], rim: '#e8dcc0',
      parts: '<ellipse cx="100" cy="92" rx="13" ry="16"/>'
        + '<path d="M86 110Q100 104 114 110Q130 118 132 140L136 230Q144 310 152 396H48Q56 310 64 230L68 140Q70 118 86 110Z"/>'
        + '<path d="M68 140Q58 180 70 210L96 214V202L80 198Q74 178 80 150ZM132 140Q144 190 136 240L128 240Q130 190 122 150Z"/>',
      after: '<path d="M82 84Q100 64 118 84L122 74Q100 52 78 74Z" fill="#e8eef2"/><path d="M90 76h20" stroke="#c03030" stroke-width="2.4"/>'
        + '<path d="M80 150H120L128 330Q100 342 72 330Z" fill="#d8e2ea" opacity=".2"/><path d="M80 150Q100 160 120 150" stroke="#d8e2ea" stroke-width="2" fill="none" opacity=".5"/>'
        + `${glow(p, 'gs', 98, 200, 22, 22, 0.6)}<path d="M94 186h8v6l4 6v16h-16v-16l4 -6z" fill="#7a5ac8" opacity=".9"/><rect x="94" y="182" width="8" height="5" fill="#c8b088"/>`
    })
  };

  CH.bellatrix = {
    eyes: [[93, 85], [102, 85]], eyeR: 1.5, eyeCol: '#f6dada',
    draw: (p) => fig(p, {
      tint: ['#1a141e', '#030204'], rim: '#d89a9a',
      parts: `${curls(98, 84, 30, 34, 16, 10, 17, 21)}${curls(84, 132, 12, 18, 5, 7, 11, 23)}${curls(114, 130, 10, 16, 5, 7, 10, 29)}`
        + '<ellipse cx="98" cy="88" rx="11" ry="16"/>'
        + '<path d="M86 112Q98 106 110 112Q122 118 120 140L114 190Q130 260 146 330Q152 360 162 396L150 384L144 396L132 386L124 396L112 386L102 396L92 386L80 396L70 386L60 396L52 384L40 396Q52 350 62 300Q74 240 84 190L78 140Q76 118 86 112Z"/>'
        + '<path d="M80 130Q64 170 60 212L68 214Q74 178 90 148Z"/><path d="M112 124Q138 100 150 64L158 68Q148 108 120 140Z"/><ellipse cx="154" cy="62" rx="6" ry="5"/>',
      after: '<path d="M80 76q-8 6 -4 14q8 0 6 -8M118 70q8 4 6 12q-8 2 -6 -6M74 120q-8 8 -2 16M124 118q8 8 2 16M92 52q-2 -8 6 -10" stroke="#5a4a5a" stroke-width="2" fill="none"/>'
        + '<path d="M92 86h5M101 86h5" stroke="#3a2a30" stroke-width="2"/><path d="M98 90q2 6 0 10" stroke="#5a4a50" stroke-width="1" fill="none"/>'
        + '<path d="M90 118L106 118L102 186L94 186Z" fill="#2a1e28" opacity=".8"/><path d="M90 126h16M91 140h14M92 154h12M93 168h10" stroke="#5a3a4a" stroke-width="1.4"/>'
        + `<path d="M156 60L178 20" stroke="#2a2018" stroke-width="3" stroke-linecap="round"/>${glow(p, 'gg', 179, 18, 22, 22, 0.9)}<circle cx="179" cy="18" r="3" fill="#c8ffdc"/>`
        + '<path d="M60 212l-6 10M64 214l-2 12M68 214l4 10" stroke="#8a7a80" stroke-width="1.6"/>'
    })
  };

  CH.fenrir = {
    draw: (p) => fig(p, {
      tint: ['#2e2a24', '#070605'], rim: '#cfc6a2', hy: 230,
      parts: `${shag(100, 96, 40, 44, 24, 0.3, 41)}`
        + '<path d="M28 150Q60 112 100 118Q140 112 172 150Q188 192 178 242L168 300Q162 342 164 396L150 380L140 396L128 382L116 396L104 382L92 396L80 382L68 396L56 382L38 396Q40 342 34 300L22 242Q12 192 28 150Z"/>'
        + '<path d="M22 160Q0 222 6 294L22 302Q24 242 42 192ZM178 160Q200 222 194 294L178 302Q176 242 158 192Z"/>',
      after: '<path d="M80 100q20 14 40 0q-4 30 -20 36q-16 -6 -20 -36z" fill="#1a1612"/>'
        + '<ellipse cx="90" cy="96" rx="3.4" ry="2.2" fill="#ffd040"/><ellipse cx="110" cy="96" rx="3.4" ry="2.2" fill="#ffd040"/>'
        + '<path d="M94 122l2 6 2 -6M104 122l2 6 2 -6" fill="#e8e0c8" stroke="#e8e0c8" stroke-width="1"/>'
        + '<path d="M4 294l-4 14M10 298l-2 16M16 300l2 14M196 294l4 14M190 298l2 16M184 300l-2 14" stroke="#d8d0b0" stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M70 70q-10 20 -6 40M130 70q10 20 6 40M80 140q-4 30 2 60M120 140q4 30 -2 60" stroke="#6a6458" stroke-width="2" fill="none" opacity=".7"/>'
    })
  };

  CH.aberforth = {
    eyes: [[75, 94], [84, 94]], eyeR: 1.5, eyeCol: '#dfeaf6',
    draw: (p) => fig(p, {
      tint: ['#2c2c28', '#070706'], rim: GOLD, hx: 92,
      defs: linU(`${p}bd`, [[0, '#c8ccd0'], [1, '#6a7076']], 90, 240),
      parts: '<ellipse cx="80" cy="96" rx="13" ry="16"/>'
        + '<path d="M64 114Q80 108 96 114Q112 122 114 146L118 240Q122 320 126 396H34Q38 320 42 240L46 146Q48 122 64 114Z"/>'
        + '<path d="M46 146Q34 200 42 248L52 248Q48 202 56 160ZM114 146Q126 196 120 236L110 232Q114 196 106 160Z"/>'
        + '<path d="M120 330Q124 304 150 302Q176 300 182 318L186 300L192 304L188 324Q196 340 186 354L188 396H178L176 360L164 362L162 396H152L150 360Q128 356 124 344L126 396H116Z"/>'
        + '<path d="M182 318Q188 296 178 284L174 290Q182 300 176 314Z"/>',
      after: `<path d="M66 92Q62 120 60 140Q72 130 72 112ZM94 92Q98 120 100 140Q88 130 88 112Z" fill="url(#${p}bd)"/>`
        + `<path d="M70 104Q80 112 90 104Q94 150 86 196Q82 210 80 220Q76 206 74 192Q66 150 70 104Z" fill="url(#${p}bd)"/>`
        + '<circle cx="75" cy="95" r="4.5" fill="none" stroke="#c8ccd0" stroke-width="1.2"/><circle cx="86" cy="95" r="4.5" fill="none" stroke="#c8ccd0" stroke-width="1.2"/><circle cx="75" cy="95" r="1.4" fill="#6ab8ff"/><circle cx="86" cy="95" r="1.4" fill="#6ab8ff"/>'
        + '<path d="M60 160h40V300H60z" fill="#4a4436" opacity=".35"/>'
        + '<path d="M184 296q10 -14 4 -28M178 300q-4 -16 -14 -22" stroke="#8a7a60" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M188 330q4 10 0 18" stroke="#c8c0a8" stroke-width="3" fill="none"/><circle cx="183" cy="314" r="1.8" fill="#e8d070"/>'
    })
  };

  // Ghosts: translucent silver.
  CH.myrtle = {
    anim: 'art-c--float', halo: 'rgba(200,225,245,.28)',
    draw: (p) => fig(p, {
      ghost: true, hy: 220,
      parts: '<circle cx="100" cy="150" r="20"/><path d="M80 146q-16 12 -12 44l9 -2q-2 -26 9 -34zM120 146q16 12 12 44l-9 -2q2 -26 -9 -34z"/>'
        + '<path d="M84 170Q100 164 116 170Q132 178 134 200L140 300Q130 330 100 342Q70 330 60 300L66 200Q68 178 84 170Z"/>'
        + '<path d="M70 190Q60 220 84 236L100 222Q84 214 82 196ZM130 190Q140 220 116 236L100 222Q116 214 118 196Z"/>',
      after: '<g fill="none" stroke="#f4f9fd" stroke-width="2.6" opacity=".9"><circle cx="92" cy="150" r="7"/><circle cx="108" cy="150" r="7"/><path d="M99 150h2"/></g>'
        + '<path d="M90 134q10 -8 20 0" stroke="#f4f9fd" stroke-width="1.6" fill="none" opacity=".6"/><path d="M94 166q6 -4 12 0" stroke="#f4f9fd" stroke-width="1.4" fill="none" opacity=".6"/>'
        + '<path d="M92 158q-1 6 0 10" stroke="#d8ecfa" stroke-width="1.4" opacity=".7"/>'
    })
  };

  CH.nick = {
    eyes: [[103, 126], [112, 126]], eyeR: 1.4, eyeCol: '#f4f9fd',
    anim: 'art-c--float', halo: 'rgba(200,225,245,.28)',
    draw: (p) => fig(p, {
      ghost: true, hy: 220,
      parts: '<path d="M86 300L84 372H95L97 300ZM104 300L106 372H117L115 300Z"/><path d="M80 372h18v8H78zM104 372h18l2 8h-20z"/>'
        + '<path d="M78 258Q100 248 122 258Q132 288 118 304Q100 312 82 304Q68 288 78 258Z"/>'
        + '<path d="M82 160Q100 154 118 160Q126 200 124 262H76Q74 200 82 160Z"/>'
        + '<path d="M82 162Q62 168 62 196Q64 214 76 214Q78 190 84 176ZM118 162Q138 168 138 196Q136 214 124 214Q122 190 116 176Z"/>'
        + '<ellipse cx="100" cy="155" rx="32" ry="10"/>'
        + '<g transform="rotate(24 108 128)"><ellipse cx="108" cy="128" rx="12" ry="15"/><path d="M92 114q16 -14 34 -2l-4 8q-14 -6 -30 0z"/></g>',
      after: '<g fill="none" stroke="#f4f9fd" stroke-width="1.6" opacity=".8"><path d="M70 152q4 8 8 0q4 8 8 0q4 8 8 0q4 8 8 0q4 8 8 0q4 8 8 0q4 8 8 0"/><path d="M100 164V258M90 180h20M90 200h20M90 220h20"/></g>'
        + '<path d="M96 146l18 -4" stroke="#e8f2fa" stroke-width="2" stroke-dasharray="3 3" opacity=".9"/>'
        + '<path d="M118 104q20 -18 34 -6q-14 0 -26 12" fill="#e8f2fa" opacity=".55"/>'
    })
  };

  CH.hoborc = {
    anim: 'art-c--float',
    draw: (p) => fig(p, {
      tint: ['#2e2234', '#0c090e'], rim: '#f0b860', hy: 200, hry: 120,
      parts: '<circle cx="100" cy="150" r="21"/><path d="M78 140Q74 108 60 96Q86 98 98 126Q104 96 132 86Q118 110 122 140Z"/>'
        + '<path d="M84 172Q100 166 116 172L122 230H78Z"/><path d="M66 228Q100 250 134 228Q156 248 124 264Q100 256 76 264Q44 248 66 228Z"/>'
        + '<path d="M84 180Q66 170 56 146L64 140Q74 160 90 168ZM116 182Q134 196 146 186L150 194Q134 210 112 196Z"/>',
      after: '<path d="M86 156q14 13 28 0" stroke="#f0e8d0" stroke-width="3" fill="none" stroke-linecap="round"/>'
        + '<path d="M90 145h4M106 145h4" stroke="#0a080c" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="144" r="1" fill="#fff"/><circle cx="108" cy="144" r="1" fill="#fff"/>'
        + '<path d="M90 172l10 5 10 -5v10l-10 -5 -10 5z" fill="#e8862a"/>'
        + `<circle cx="60" cy="97" r="5" fill="${GOLD}"/><circle cx="132" cy="87" r="5" fill="${GOLD}"/><circle cx="96" cy="124" r="3.5" fill="${GOLD}"/>`
    })
  };

  CH.dementor = {
    anim: 'art-c--hover',
    draw: (p) => fig(p, {
      tint: ['#101216', '#020203'], rim: '#8fa2b4', fade: true, hy: 200,
      parts: '<path d="M100 30Q132 30 141 70Q150 120 160 180Q170 240 176 300L168 330L160 300L154 352L144 310L136 372L126 320L116 384L104 330L94 378L84 324L74 368L66 316L56 350L50 300L40 322L38 280Q44 220 52 170Q60 110 64 70Q72 30 100 30Z"/>'
        + '<path d="M60 128Q30 150 16 172L22 180Q42 166 66 158Z"/><path d="M140 128Q160 150 166 186L158 190Q150 160 134 150Z"/>',
      after: '<ellipse cx="100" cy="80" rx="18" ry="25" fill="#000"/><path d="M84 62Q100 50 116 62" stroke="#3a4048" stroke-width="2" fill="none"/>'
        + '<path d="M18 172q-6 -6 -16 -6M18 175q-8 0 -16 6M20 178q-6 6 -8 14M22 170q-2 -8 -10 -12" stroke="#7a7e78" stroke-width="3.4" stroke-linecap="round"/><ellipse cx="20" cy="174" rx="6" ry="5" fill="#6a6e68"/>'
        + '<path d="M60 220l-6 40M80 240l-4 50M120 230l4 60M140 240l6 40" stroke="#1e2228" stroke-width="2" opacity=".8"/>'
    })
  };

  CH.halalfalo = {
    draw: (p) => fig(p, {
      tint: ['#151517', '#030303'], rim: COLD,
      defs: linU(`${p}m`, [[0, '#f0f4f6'], [1, '#8a949a']], 62, 110),
      parts: '<path d="M100 40Q128 40 134 76Q138 100 130 118H70Q62 100 66 76Q72 40 100 40Z"/>'
        + '<path d="M70 110Q100 100 130 110Q150 124 152 160L156 250Q162 320 170 396H30Q38 320 44 250L48 160Q50 124 70 110Z"/>'
        + '<path d="M130 124Q156 110 168 84L176 90Q166 120 140 146Z"/><path d="M50 150Q38 200 46 246L56 246Q52 202 62 166Z"/>',
      after: `<path d="M87 70Q100 61 113 70Q117 91 108 105Q100 111 92 105Q83 91 87 70Z" fill="url(#${p}m)"/>`
        + '<path d="M91 80h7M102 80h7" stroke="#050505" stroke-width="3" stroke-linecap="round"/><path d="M92 92q8 4 16 0M100 64v10M90 72q-2 8 2 14M110 72q2 8 -2 14" stroke="#6a747a" stroke-width="1.2" fill="none"/>'
        + `<path d="M172 86L188 50" stroke="#2a2018" stroke-width="3" stroke-linecap="round"/>${glow(p, 'gg', 189, 48, 18, 18, 0.85)}<circle cx="189" cy="48" r="2.6" fill="#c8ffdc"/>`
    })
  };

  CH.fawkes = {
    anim: 'art-c--fly', halo: 'rgba(255,190,90,.34)', facing: 'front',
    draw: (p) => {
      const defs = glowDefs(p) + linU(`${p}w`, [[0, '#f04a2a'], [1, '#7a1410']], 40, 220) + linU(`${p}t`, [[0, '#f0c040'], [0.7, '#e0782a', 0.8], [1, '#c03018', 0]], 200, 396);
      let tail = '';
      [[-26, 8], [-12, 10], [0, 11], [12, 10], [26, 8]].forEach(([dx, wd], i) => { tail += `<path d="M100 206Q${100 + dx * 0.5} 300 ${100 + dx} ${380 - Math.abs(dx)}" stroke="url(#${p}t)" stroke-width="${wd}" fill="none" stroke-linecap="round"/><ellipse cx="${100 + dx}" cy="${374 - Math.abs(dx)}" rx="${5 + (i % 2) * 2}" ry="10" fill="#f0c040" opacity=".8"/>`; });
      const wing = 'M92 140Q60 122 40 82Q30 62 12 50Q30 86 26 100Q16 96 4 100Q24 112 30 128Q18 130 10 140Q38 150 60 156Q80 160 92 158Z';
      return `<defs>${defs}</defs>${glow(p, 'gw', 100, 160, 110, 120, 0.7)}${tail}`
        + `<path d="${wing}" fill="url(#${p}w)"/><path d="${wing}" fill="url(#${p}w)" transform="translate(200 0) scale(-1 1)"/>`
        + '<path d="M40 82q20 30 50 60M26 100q30 20 64 46M30 128q30 10 60 22" stroke="#f0c040" stroke-width="1.6" fill="none" opacity=".7"/>'
        + '<path d="M160 82q-20 30 -50 60M174 100q-30 20 -64 46M170 128q-30 10 -60 22" stroke="#f0c040" stroke-width="1.6" fill="none" opacity=".7"/>'
        + `<path d="M100 120Q118 130 116 170Q112 200 100 216Q88 200 84 170Q82 130 100 120Z" fill="url(#${p}w)"/><circle cx="100" cy="108" r="12" fill="#e04028"/>`
        + '<path d="M96 98q-6 -20 -2 -30M100 96q0 -22 6 -32M104 98q8 -16 14 -22" stroke="#f0c040" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
        + '<path d="M100 111l-7 9 9 -2z" fill="#f0c040"/><circle cx="95" cy="106" r="1.8" fill="#1a0a04"/>'
        + '<path d="M94 214l-4 12M106 214l4 12" stroke="#f0c040" stroke-width="2.6" stroke-linecap="round"/>';
    }
  };

  CH.akromantula = {
    w: 340, facing: 'front',
    draw: (p) => {
      let legs = '';
      const L = [[78, 190, 66, 396], [120, 168, 132, 396], [150, 192, 168, 378], [164, 236, 172, 330]];
      L.forEach(([kx, ky, fx, fy], i) => {
        [-1, 1].forEach((s) => {
          const bx = 170 + s * (20 + i * 7);
          const by = 300 - i * 7;
          legs += `M${bx} ${by}Q${170 + s * kx * 0.55} ${ky - 34} ${170 + s * kx} ${ky}L${170 + s * fx} ${fy}`;
        });
      });
      const defs = glowDefs(p) + linU(`${p}b`, [[0, '#2a2a30'], [1, '#060607']], 150, 396) + linU(`${p}r`, [[0, '#c4ccd2', 0.9], [1, '#8a949c', 0.35]], 150, 396);
      const body = `${shag(170, 222, 84, 64, 34, 0.07, 61)}<ellipse cx="170" cy="304" rx="48" ry="36"/>`;
      return `<defs>${defs}<g id="${p}s">${body}</g></defs>${glow(p, 'gc', 170, 290, 170, 120, 0.25)}`
        + `<path d="${legs}" fill="none" stroke="url(#${p}r)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="${legs}" fill="none" stroke="#0c0c0e" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="${legs}" fill="none" stroke="#7a8086" stroke-width="13" stroke-dasharray="1.2 9" stroke-linecap="round" opacity=".5"/>`
        + `<use href="#${p}s" fill="none" stroke="url(#${p}r)" stroke-width="5"/><use href="#${p}s" fill="url(#${p}b)"/>`
        + '<path d="M112 200q58 -34 116 0M106 232q64 -30 128 0" stroke="#3e4046" stroke-width="2" fill="none"/>'
        + '<path d="M154 330q-14 22 2 40l6 -4q-10 -16 0 -32zM186 330q14 22 -2 40l-6 -4q10 -16 0 -32z" fill="#1a1a1e" stroke="#9aa2a8" stroke-width="1.5"/>'
        + '<g fill="#e8f4ec"><circle cx="160" cy="292" r="4.4"/><circle cx="180" cy="292" r="4.4"/><circle cx="148" cy="298" r="3.4"/><circle cx="192" cy="298" r="3.4"/><circle cx="164" cy="304" r="2.6"/><circle cx="176" cy="304" r="2.6"/><circle cx="140" cy="306" r="2.4"/><circle cx="200" cy="306" r="2.4"/></g>';
    }
  };

  CH.thesztral = {
    w: 360,
    draw: (p) => fig(p, {
      w: 360, tint: ['#18181c', '#040405'], rim: '#c0ccd4', hx: 190, hy: 230, hrx: 190, hry: 160,
      parts: '<path d="M200 238Q188 160 228 82Q260 32 334 10Q312 58 322 90Q292 92 282 122Q258 122 252 152Q232 162 234 192Q220 204 222 240Z"/>'
        + '<path d="M120 252Q160 230 230 232Q282 236 292 262Q294 292 272 302Q222 314 160 306Q124 300 118 278Z"/>'
        + '<path d="M136 258Q112 222 98 182Q88 158 72 148Q54 142 36 150Q24 158 30 170Q44 172 58 174Q74 180 84 198Q96 228 120 272Z"/>'
        + '<path d="M138 300L132 350L128 392H138L144 352L150 304ZM160 304L164 352L168 392H178L174 350L170 304ZM256 300Q272 330 258 356L254 392H264L268 358Q284 326 268 298ZM276 296Q296 326 284 356L282 392H292L294 358Q308 322 290 294Z"/>'
        + '<path d="M290 262Q322 272 332 322L326 324Q316 282 288 272Z"/>',
      after: '<path d="M170 242q-6 30 0 60M190 238q-6 34 0 66M210 236q-6 34 0 66M230 238q-6 32 0 62" stroke="#6a727a" stroke-width="2.2" fill="none" opacity=".75"/>'
        + '<path d="M228 84L300 30M240 120L320 88M246 150L282 122" stroke="#5a626a" stroke-width="2" opacity=".8"/>'
        + `${glow(p, 'gs', 52, 158, 16, 16, 0.9)}<ellipse cx="52" cy="158" rx="4.6" ry="3.6" fill="#ffffff"/>`
        + '<path d="M32 166l-6 4" stroke="#8a929a" stroke-width="2"/>'
    })
  };

  CH.pancel = {
    draw: (p) => `<defs>${glowDefs(p)}${P.armourDefs(p, true)}</defs>${glow(p, 'gw', 100, 220, 110, 190, 0.18)}`
      + `${P.armour(p, 92, 396, 1.12)}<path d="M80 113h22" stroke="#ffcf8a" stroke-width="2" opacity=".55"/>`
  };

  CH.sas = {
    facing: 'front',
    draw: (p) => {
      const defs = glowDefs(p) + linU(`${p}br`, [[0, '#f0c070'], [0.45, '#b0742e'], [1, '#5a3410']], 150, 330) + linU(`${p}wd`, [[0, '#3a2818'], [1, '#160e08']], 100, 400);
      return `<defs>${defs}</defs><rect x="22" y="100" width="156" height="300" rx="14" fill="url(#${p}wd)" stroke="#5a5048" stroke-width="5"/>`
        + '<path d="M54 100V400M100 100V400M146 100V400" stroke="#120b06" stroke-width="3"/>'
        + `${glow(p, 'gw', 100, 230, 90, 90, 0.35)}<g fill="url(#${p}br)" stroke="#3a2008" stroke-width="1.5">`
        + '<path d="M100 172L84 196L40 168L52 200L34 206L64 222L52 236L84 234L92 262H108L116 234L148 236L136 222L166 206L148 200L160 168L116 196Z"/>'
        + '<path d="M90 176Q92 156 104 152Q116 152 116 166L126 170L114 176Q110 184 100 186Z"/>'
        + '</g><circle cx="106" cy="162" r="2.2" fill="#1a0a00"/>'
        + `<circle cx="100" cy="300" r="34" fill="none" stroke="url(#${p}br)" stroke-width="10"/><path d="M92 262L96 268H104L108 262" fill="url(#${p}br)"/>`
        + '<path d="M60 186q20 14 34 24M140 186q-20 14 -34 24" stroke="#f8d890" stroke-width="1.6" fill="none" opacity=".7"/>';
    }
  };

  CH.suveg = {
    facing: 'front',
    draw: (p) => fig(p, {
      tint: ['#5a4632', '#1e150c'], rim: GOLD, hy: 250,
      parts: '<path d="M50 306Q60 232 80 182Q90 142 110 112Q122 96 142 92Q128 110 126 132Q122 172 130 222Q140 272 152 306Z"/>'
        + '<path d="M24 312Q100 288 176 312Q164 330 100 326Q36 330 24 312Z"/>',
      before: '<ellipse cx="100" cy="330" rx="62" ry="12" fill="#2a1a10"/><path d="M60 334L48 396M140 334L152 396M100 340V396" stroke="#2a1a10" stroke-width="9" stroke-linecap="round"/>',
      after: '<path d="M78 232q12 -10 24 0M110 228q12 -10 24 0" stroke="#140c06" stroke-width="5" fill="none" stroke-linecap="round"/>'
        + '<path d="M74 272q32 18 62 0" stroke="#0c0704" stroke-width="7" fill="none" stroke-linecap="round"/>'
        + '<path d="M96 150l20 -6 6 22 -20 6z" fill="#6a5640" opacity=".8"/><path d="M60 290l24 -4 4 16 -24 4z" fill="#4a3826" opacity=".8"/>'
        + '<path d="M96 150l20 -6 6 22 -20 6zM60 290l24 -4 4 16 -24 4z" fill="none" stroke="#c8b088" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>'
        + '<path d="M90 190q16 20 8 50M118 120q-6 30 4 60" stroke="#2a1e12" stroke-width="2" fill="none"/>'
    })
  };

  CH.kard = {
    facing: 'front', halo: 'rgba(221,232,240,.22)',
    draw: (p) => {
      const defs = glowDefs(p) + lin(`${p}bl`, [[0, '#8a96a0'], [0.45, '#f4f8fa'], [0.55, '#c8d2da'], [1, '#6a747c']], 0, 0, 1, 0) + linU(`${p}au`, [[0, '#f8dc90'], [1, '#8a6420']], 40, 130);
      return `<defs>${defs}</defs>${glow(p, 'gs', 100, 240, 70, 170, 0.35)}`
        + `<path d="M92 124H108L106 360L100 392L94 360Z" fill="url(#${p}bl)"/><path d="M100 128V380" stroke="#8a949c" stroke-width="1.4"/>`
        + `<path d="M58 112Q100 100 142 112L146 122Q100 114 54 122Z" fill="url(#${p}au)"/>`
        + `<rect x="94" y="62" width="12" height="50" rx="3" fill="#5a3a1a"/><path d="M94 70h12M94 80h12M94 90h12M94 100h12" stroke="#c9a24a" stroke-width="1.6"/>`
        + `<circle cx="100" cy="52" r="12" fill="url(#${p}au)"/>`
        + '<ellipse cx="100" cy="114" rx="8" ry="6" fill="#c0181e"/><circle cx="100" cy="52" r="6" fill="#c0181e"/><ellipse cx="64" cy="116" rx="4" ry="3.4" fill="#c0181e"/><ellipse cx="136" cy="116" rx="4" ry="3.4" fill="#c0181e"/>'
        + '<g fill="#ffd0d0" opacity=".85"><circle cx="97" cy="112" r="1.8"/><circle cx="98" cy="50" r="1.6"/></g>'
        + '<path class="art-sheen" d="M97 140L99 340" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>';
    }
  };

  CH['kover-dama'] = {
    eyes: [[112, 162], [128, 162]], eyeR: 2.0, eyeCol: '#3a2418',
    w: 240, facing: 'front',
    draw: (p) => {
      const defs = glowDefs(p) + linU(`${p}fr`, [[0, '#f0d080'], [0.5, '#a07a30'], [1, '#5a4018']], 40, 370) + linU(`${p}dr`, [[0, '#d88aa8'], [1, '#7a3050']], 150, 340);
      return `<defs>${defs}</defs>${glow(p, 'gw', 120, 210, 150, 190, 0.3)}`
        + `<rect x="18" y="44" width="204" height="320" rx="6" fill="url(#${p}fr)"/><rect x="34" y="60" width="172" height="288" fill="#1c2a22"/>`
        + `${glow(p, 'gw', 120, 150, 90, 90, 0.35)}`
        + `<path d="M48 348Q50 250 82 214Q100 196 120 196Q140 196 158 214Q190 250 192 348Z" fill="url(#${p}dr)"/>`
        + '<path d="M90 214q30 22 60 0" stroke="#f0b8c8" stroke-width="3" fill="none" opacity=".7"/>'
        + '<ellipse cx="120" cy="166" rx="22" ry="26" fill="#d8b498"/><path d="M96 158Q98 124 120 122Q144 124 146 158Q140 140 120 140Q102 140 96 158Z" fill="#5a3a22"/>'
        + '<path d="M158 230q18 -8 22 -30" stroke="#d8b498" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M174 186h14l-4 14h-6zM181 200v12" stroke="#e8f0f4" stroke-width="2" fill="#a02040" opacity=".9"/>'
        + `<rect x="18" y="44" width="204" height="320" rx="6" fill="none" stroke="#3a2808" stroke-width="2"/><rect x="30" y="56" width="180" height="296" fill="none" stroke="#f8e0a0" stroke-width="2" opacity=".6"/>`
        + '<g fill="#f8e0a0" opacity=".8"><circle cx="18" cy="44" r="8"/><circle cx="222" cy="44" r="8"/><circle cx="18" cy="364" r="8"/><circle cx="222" cy="364" r="8"/></g>';
    }
  };

  CH.agyar = {
    draw: (p) => fig(p, {
      tint: ['#24201c', '#060505'], rim: GOLD, hy: 290, hry: 120,
      parts: '<path d="M24 206Q24 196 34 194L60 190Q66 176 84 174Q104 172 112 188Q120 204 112 222L104 236Q94 244 84 238L76 244Q60 252 46 246Q34 242 30 232Q22 226 24 206Z"/>'
        + '<path d="M70 232Q58 268 64 300L62 396H80L84 316Q100 330 120 340Q140 360 150 396H188Q188 350 172 310Q160 270 138 242Q122 222 106 220Z"/>'
        + '<path d="M86 312L84 396H98L100 322Z"/>',
      after: '<path d="M86 178Q106 180 108 200Q106 224 94 234Q84 216 82 196Z" fill="#100d0b"/>'
        + '<ellipse cx="27" cy="203" rx="5" ry="4" fill="#050404"/><circle cx="66" cy="196" r="2.3" fill="#f4ecd8"/>'
        + '<path d="M42 246q-2 8 1 16" stroke="#c8d8e0" stroke-width="2" fill="none" opacity=".75" stroke-linecap="round"/>'
        + '<path d="M150 392q26 4 40 -8" stroke="#24201c" stroke-width="7" fill="none" stroke-linecap="round"/>'
        + '<path d="M72 250q-6 20 -4 44M110 232q30 20 50 70" stroke="#4a4038" stroke-width="2" fill="none" opacity=".6"/>'
    })
  };

  CH['mrs-norris'] = {
    draw: (p) => fig(p, {
      tint: ['#4a4236', '#14120e'], rim: '#e8d8a8', hy: 340, hry: 70, hrx: 70,
      parts: '<path d="M70 396Q64 362 72 336Q64 318 68 302L64 282L80 296Q88 292 96 296L106 282L104 304Q110 322 104 336Q126 356 128 396Z"/>',
      after: '<path d="M128 392Q152 392 154 372Q156 356 142 352" stroke="#3a342a" stroke-width="7" fill="none" stroke-linecap="round"/>'
        + `${glow(p, 'gw', 86, 312, 26, 14, 0.6)}<ellipse cx="80" cy="312" rx="4" ry="3.6" fill="#ffd040"/><ellipse cx="94" cy="312" rx="4" ry="3.6" fill="#ffd040"/>`
        + '<path d="M80 310v4M94 310v4" stroke="#1a1408" stroke-width="1.6"/><path d="M72 330l-14 -2M72 333l-14 4M100 330l14 -2" stroke="#c8c0a8" stroke-width="1" opacity=".7"/>'
    })
  };

  // ---------- patronuses (viewBox 0 0 400 300, silver light; most face left) ----------
  // The blur is rasterised once: the patronus only moves as a whole layer (transform / opacity).
  function patronusSvg(p, shape, detail = '', strokes = '') {
    const rnd = prng(shape.length);
    let sp = '';
    for (let i = 0; i < 16; i++) sp += `M${R(30 + rnd() * 340)} ${R(20 + rnd() * 260)}h0`;
    return `<svg viewBox="0 0 400 300" aria-hidden="true" focusable="false"><defs>`
      + `${lin(`${p}pf`, [[0, '#ffffff', 0.96], [0.55, '#dcecf8', 0.78], [1, '#a9c4d6', 0.5]])}`
      + `<filter id="${p}bl" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="9"/></filter></defs>`
      + `<g filter="url(#${p}bl)" opacity=".9"><path d="${shape}" fill="#bcd8f0"/>${strokes.replace(/STROKE/g, '#bcd8f0')}</g>`
      + `<path d="${shape}" fill="url(#${p}pf)"/>${strokes.replace(/STROKE/g, '#eef6fc')}`
      + `<path d="${shape}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".85"/>`
      + `<g fill="none" stroke="#9cbad0" stroke-width="2" stroke-linecap="round" opacity=".75">${detail}</g>`
      + `<path d="${sp}" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" opacity=".7"/></svg>`;
  }
  const PAT = {};
  PAT.szarvas = (p) => patronusSvg(p,
    'M62 92C66 84 80 72 96 64C104 60 112 62 116 70L126 74L122 82C126 100 134 124 140 138C170 132 220 128 262 130C292 132 306 146 304 168C304 186 296 200 290 206L292 248L300 284H288L282 252L276 214H270L272 250L278 284H266L258 248L256 210C230 214 190 214 168 210L164 250L166 284H154L150 248L146 210H140L140 248L144 284H132L128 248L126 200C120 186 118 166 122 150C114 130 104 112 96 100C88 98 76 98 68 98C64 98 60 96 62 92Z',
    '<path d="M140 150q40 20 110 10M180 170q30 10 70 0"/><circle cx="92" cy="78" r="2"/>',
    '<path d="M108 64C100 40 92 26 84 8M100 44L82 38M94 30L76 20M88 18L98 2M116 64C126 40 138 26 150 10M124 44L140 34M132 30L150 24M142 18L136 2" stroke="STROKE" stroke-width="6" fill="none" stroke-linecap="round"/>');
  PAT['ló'] = (p) => patronusSvg(p,
    'M64 108C60 100 62 92 70 86L100 52L104 34L112 50C130 60 150 78 170 100C210 96 260 98 292 106C318 112 330 132 326 156C322 176 312 188 300 192L330 232L346 262L336 268L316 238L292 208H280L286 248L282 286H270L272 250L262 214C230 220 200 220 180 214L160 246L120 262L114 252L148 232L160 208L152 206L140 236L150 270L140 276L126 240L136 198C126 184 120 166 112 148C104 132 92 118 80 116C74 114 68 112 64 108Z',
    '<path d="M180 150q50 20 110 0M100 60q14 30 30 56"/><circle cx="90" cy="76" r="2.2"/>',
    '<path d="M326 140C356 150 374 182 368 224C358 204 346 194 330 190M110 50q20 6 30 24q12 16 30 26M118 60q14 10 24 24" stroke="STROKE" stroke-width="7" fill="none" stroke-linecap="round"/>');
  PAT.farkas = (p) => patronusSvg(p,
    'M50 118L74 104L92 96L100 78L108 94L114 78L120 96C134 104 142 118 150 128C190 122 240 120 276 126C292 128 300 136 302 146C324 148 352 166 366 204C344 200 318 186 300 172C298 190 292 200 290 210L294 250L298 282H286L280 252L276 216H268L270 252L272 282H260L256 250L252 214C220 216 190 214 168 212L166 250L168 282H156L152 250L148 214H142L140 250L142 282H130L126 250L124 206C118 190 114 168 112 150C100 140 88 132 72 130C62 128 52 126 50 118Z',
    '<path d="M150 150q60 16 110 4M310 160q20 10 40 30"/><circle cx="96" cy="108" r="2"/>');
  PAT['róka'] = (p) => patronusSvg(p,
    'M54 130L80 114L96 108L102 84L112 104L120 86L126 108C138 116 146 126 154 134C190 128 232 128 262 134C278 136 288 144 292 154C312 136 348 124 380 136C366 156 344 172 320 178C306 182 296 180 290 178C288 194 282 202 278 208L282 246L286 282H274L268 248L264 214H256L258 250L260 282H248L244 248L240 212C214 214 190 214 172 212L168 250L170 282H158L154 250L150 214H144L142 250L144 282H132L128 250L126 206C120 190 118 172 118 158C104 150 90 142 76 140C66 138 56 136 54 130Z',
    '<path d="M300 160q30 -14 70 -20M150 160q50 14 100 4"/><circle cx="100" cy="114" r="2"/>');
  PAT.kutya = (p) => patronusSvg(p,
    'M96 96C96 88 104 80 116 76L124 70C126 58 134 50 142 48L148 30L158 52C168 58 172 72 170 86C178 100 186 114 194 128C220 140 242 170 250 200C262 210 272 232 270 256C268 270 260 280 246 282H152V270L158 266V204H150L148 266L154 270V282H128V270L136 266V196C130 176 128 150 124 130C116 122 104 116 100 110C94 106 94 100 96 96Z',
    '<path d="M200 170q30 30 40 80M150 110q10 30 6 60"/><circle cx="132" cy="70" r="2.4"/>',
    '<path d="M266 248C292 242 304 222 306 204" stroke="STROKE" stroke-width="10" fill="none" stroke-linecap="round"/>');
  PAT.macska = (p) => patronusSvg(p,
    'M150 70L156 42L170 62C176 60 182 60 188 62L200 42L202 72C208 82 208 96 200 106C216 120 228 150 232 180C242 200 252 230 252 258C252 274 246 282 234 284H150C142 284 140 276 144 270L152 268L154 210C150 190 150 160 156 132C146 124 140 110 142 96C142 86 146 78 150 70Z',
    '<path d="M168 150q30 40 40 110M160 90q8 6 16 0"/><circle cx="162" cy="84" r="2"/><circle cx="184" cy="84" r="2"/>',
    '<path d="M248 272C292 272 304 242 292 220C284 206 268 212 272 226" stroke="STROKE" stroke-width="12" fill="none" stroke-linecap="round"/>');
  PAT['nyúl'] = (p) => patronusSvg(p,
    'M120 128C118 112 128 100 142 98L150 96C148 70 150 40 160 20C168 34 168 70 162 98C170 72 180 48 192 34C196 52 186 80 172 104C182 112 186 124 186 134C210 140 236 160 248 190C258 214 258 246 244 266C236 278 222 284 206 284H150C140 284 138 276 144 272L156 270L160 236C150 226 140 212 134 196C126 178 120 160 120 148Z',
    '<path d="M190 170q40 30 40 90M158 40q4 30 2 56M184 48q-6 26 -16 50"/><circle cx="140" cy="116" r="2.2"/>',
    '<circle cx="252" cy="246" r="14" fill="STROKE"/>');
  PAT.vidra = (p) => patronusSvg(p,
    'M60 150C60 138 72 128 86 128C100 126 112 132 120 140C160 120 220 116 270 136C300 148 330 170 372 198C340 200 300 190 280 188L276 214H264L262 196C230 198 190 198 160 192L156 216H144L144 188C130 182 118 174 110 170C98 172 84 172 72 168C64 164 60 158 60 150Z',
    '<path d="M130 156q70 -20 140 0M60 152l-16 -4M60 156l-16 4"/><circle cx="78" cy="144" r="2.2"/><path d="M84 130l4 -8 6 8"/>');
  PAT.bagoly = (p) => patronusSvg(p,
    'M172 130C140 100 90 80 30 90C50 104 60 110 66 118C46 120 32 128 24 140C50 140 70 144 84 150C66 158 54 168 48 182C80 176 120 170 172 170ZM228 130C260 100 310 80 370 90C350 104 340 110 334 118C354 120 368 128 376 140C350 140 330 144 316 150C334 158 346 168 352 182C320 176 280 170 228 170ZM200 64C222 64 232 82 230 102C238 128 238 170 226 194L214 232H186L174 194C162 170 162 128 170 102C168 82 178 64 200 64Z',
    '<circle cx="188" cy="96" r="11"/><circle cx="212" cy="96" r="11"/><path d="M196 110l4 8 4 -8M60 110q50 10 100 30M340 110q-50 10 -100 30M80 160q40 0 90 -6M320 160q-40 0 -90 -6"/>');
  PAT['hattyú'] = (p) => patronusSvg(p,
    'M120 200C130 180 170 170 220 172C270 174 320 180 350 196C340 214 300 230 240 232C190 234 140 226 120 200ZM200 176C210 130 250 100 300 90C320 88 340 92 352 100C330 110 320 120 316 132C330 132 340 136 346 144C320 150 300 160 290 176ZM140 196C120 170 110 140 120 110C126 90 120 74 104 72C92 72 82 78 80 86L66 90C74 96 84 98 92 94C100 92 104 98 102 110C96 140 104 170 124 200Z',
    '<path d="M230 150q30 -30 80 -46M240 200q50 10 100 -4"/><circle cx="98" cy="82" r="2"/>',
    '<path d="M110 248q40 -8 80 0t80 0t80 0" stroke="STROKE" stroke-width="3" fill="none" opacity=".7"/>');
  PAT['főnix'] = (p) => patronusSvg(p,
    'M188 112C160 84 120 56 70 40L84 58L54 54L74 72L40 74L66 90L34 98L66 108L44 122L80 124L64 138L104 134L96 148L150 140L184 150ZM212 112C240 84 280 56 330 40L316 58L346 54L326 72L360 74L334 90L366 98L334 108L356 122L320 124L336 138L296 134L304 148L250 140L216 150ZM200 92C214 92 222 104 220 118C224 136 220 160 210 176H190C180 160 176 136 180 118C178 104 186 92 200 92ZM200 72C210 72 214 82 212 92L200 96L188 92C186 82 190 72 200 72ZM188 80L176 88L188 88Z',
    '<path d="M90 70q50 30 96 64M310 70q-50 30 -96 64M70 110q60 14 112 30M330 110q-60 14 -112 30"/><circle cx="194" cy="80" r="2"/>',
    '<path d="M200 176C194 220 170 252 140 284M200 176C206 222 230 254 262 284M200 176V294M196 72q-6 -18 0 -30M204 72q4 -16 14 -22M190 74q-12 -10 -12 -24" stroke="STROKE" stroke-width="6" fill="none" stroke-linecap="round"/>');

  // ---------- effects ----------
  const FX_DURATION = { curse: 1300, 'curse-red': 1300, 'silver-wave': 2700, death: 3300, phoenix: 3100 };
  const FX = {};
  FX.snow = () => `<div class="art-fx art-fx--snow">${AMB.snowLight}</div>`;
  FX.blizzard = () => `<div class="art-fx art-fx--blizzard"><div class="bz-tint"></div><div class="bz-wind">${flakes('streak', 'b', 'a', 'c')}</div><div class="art-amb art-fog bz-gust"><i></i><i></i></div></div>`;

  let frostCache = '';
  // Frost: three fern-like ice crystals drawn once, then placed along the edges with <use> (small markup).
  function frostSvg() {
    if (frostCache) return frostCache;
    const rnd = prng(203);
    const fern = (len, depth) => {
      let d = '';
      const branch = (x, y, a, l, dep) => {
        const x2 = x + Math.cos(a) * l;
        const y2 = y + Math.sin(a) * l;
        d += `M${R(x)} ${R(y)}L${R(x2)} ${R(y2)}`;
        const ticks = Math.floor(l / 10);
        for (let i = 1; i < ticks; i++) {
          const t = i / ticks;
          const tx = x + (x2 - x) * t;
          const ty = y + (y2 - y) * t;
          const tl = l * 0.24 * (1 - t) + 3;
          d += `M${R(tx)} ${R(ty)}l${R(Math.cos(a + 1.05) * tl)} ${R(Math.sin(a + 1.05) * tl)}M${R(tx)} ${R(ty)}l${R(Math.cos(a - 1.05) * tl)} ${R(Math.sin(a - 1.05) * tl)}`;
        }
        if (dep <= 0) return;
        branch(x2, y2, a + 0.5, l * 0.5, dep - 1);
        branch(x2, y2, a - 0.5, l * 0.5, dep - 1);
        branch(x + (x2 - x) * 0.5, y + (y2 - y) * 0.5, a + 0.7, l * 0.4, dep - 1);
      };
      branch(0, 0, 0, len, depth);
      return d;
    };
    const p = uid();
    const defs = `<path id="${p}f0" d="${fern(100, 1)}"/><path id="${p}f1" d="${fern(70, 1)}"/><path id="${p}f2" d="${fern(130, 2)}"/>`;
    let uses = '';
    const put = (x, y, a, k, s) => { uses += `<use href="#${p}f${k}" transform="translate(${R(x)} ${R(y)}) rotate(${R(a)}) scale(${n1(s)})"/>`; };
    const j = () => (rnd() - 0.5) * 50;
    for (let x = 40; x < 1600; x += 120) { put(x, 0, 90 + j(), R(rnd()), 0.5 + rnd() * 0.6); put(x + 50, 900, -90 + j(), R(rnd()), 0.5 + rnd() * 0.6); }
    for (let y = 70; y < 900; y += 120) { put(0, y, j(), R(rnd()), 0.5 + rnd() * 0.7); put(1600, y + 40, 180 + j(), R(rnd()), 0.5 + rnd() * 0.7); }
    [[0, 0, 45], [1600, 0, 135], [0, 900, -45], [1600, 900, -135]].forEach(([x, y, a]) => { put(x, y, a, 2, 1.6); put(x, y, a + 25, 0, 1.1); put(x, y, a - 25, 0, 1.1); });
    frostCache = `<svg class="art-l fr-ice" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>${defs}</defs>`
      + `<g fill="none" stroke-linecap="round"><g stroke="#a9c4d6" stroke-width="6" opacity=".2">${uses}</g><g stroke="#eef7fd" stroke-width="1.8" opacity=".8">${uses}</g></g></svg>`;
    return frostCache;
  }
  FX.frost = () => `<div class="art-fx art-fx--frost art-fx--hold"><div class="fr-glow"></div>${frostSvg()}</div>`;

  const WRAITH = '<svg viewBox="0 0 120 200" aria-hidden="true" focusable="false"><path d="M60 6Q78 6 84 28Q92 62 96 100Q100 140 104 176L98 160L96 196L88 166L82 200L76 168L68 198L62 166L54 194L48 164L40 190L36 158L28 178L26 146Q28 110 32 80Q36 44 38 26Q44 6 60 6Z" fill="#04060a" stroke="#5a6a7a" stroke-width="1.4" stroke-opacity=".55"/><ellipse cx="60" cy="34" rx="12" ry="16" fill="#000"/><path d="M36 70Q18 84 6 104M84 70Q102 86 110 106" stroke="#04060a" stroke-width="7" stroke-linecap="round"/><path d="M6 104l-5 4M6 104l-2 7M110 106l5 3M110 106l2 7" stroke="#5a5e5a" stroke-width="2" stroke-linecap="round"/></svg>';
  FX['dementor-cold'] = () => `<div class="art-fx art-fx--dementor-cold art-fx--hold"><div class="dm-dark"></div>${AMB.fog}<div class="dm-wraith dm-w1">${WRAITH}</div><div class="dm-wraith dm-w2">${WRAITH}</div><div class="dm-wraith dm-w3">${WRAITH}</div></div>`;

  const BOLT = 'M-40 640C300 600 560 560 820 500S1300 380 1660 300';
  FX.curse = (opts = {}) => `<div class="art-fx art-fx--curse art-fx--over${opts.color === 'red' ? ' cu-red' : ''}"><div class="cu-flash"></div>`
    + `<svg class="art-l cu-bolt" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="b1" d="${BOLT}" stroke-width="44" fill="none" stroke-linecap="round"/><path class="b2" d="${BOLT}" stroke-width="16" fill="none" stroke-linecap="round"/><path class="b3" d="${BOLT}" stroke-width="5" fill="none" stroke-linecap="round"/></svg></div>`;
  FX['curse-red'] = () => FX.curse({ color: 'red' });
  FX.fire = () => `<div class="art-fx art-fx--fire"><div class="fi-glow"></div>${AMB.embers}</div>`;
  FX['silver-wave'] = () => '<div class="art-fx art-fx--silver-wave art-fx--over"><div class="sw-flash"></div><i class="sw-ring"></i><i class="sw-ring"></i><i class="sw-ring"></i></div>';

  FX.death = () => {
    const p = uid();
    return '<div class="art-fx art-fx--death"><div class="de-dim"></div><div class="de-stage"><div class="de-glow"></div>'
      + `<svg class="de-candle" viewBox="0 0 80 120" aria-hidden="true" focusable="false"><defs>${lin(`${p}c`, [[0, '#b8ac90'], [0.4, '#f4ecd8'], [1, '#a89c80']], 0, 0, 1, 0)}</defs>`
      + `<ellipse cx="40" cy="114" rx="34" ry="6" fill="#3a2e22"/><rect x="26" y="22" width="28" height="94" rx="3" fill="url(#${p}c)"/>`
      + '<path d="M30 22q2 14 0 22q-3 -10 -2 -22zM48 22q3 10 1 16q-3 -6 -3 -16z" fill="#f8f2e4"/><path d="M40 22v-12" stroke="#2a2018" stroke-width="2.4" stroke-linecap="round"/></svg>'
      + '<svg class="de-flame" viewBox="0 0 22 40" aria-hidden="true" focusable="false"><path d="M11 0C18 12 20 22 18 30C16 36 6 36 4 30C2 22 4 12 11 0Z" fill="#ffb24d"/><path d="M11 12C15 20 15 26 14 30C12 34 10 34 8 30C7 26 7 20 11 12Z" fill="#fff4cc"/></svg>'
      + '<svg class="de-smoke" viewBox="0 0 30 80" aria-hidden="true" focusable="false"><path d="M15 80C10 66 22 56 14 44C8 34 20 24 14 10" stroke="#9a9a9a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'
      + '<svg class="de-wisp" viewBox="0 0 60 120" aria-hidden="true" focusable="false"><path d="M30 10C42 26 46 44 40 58C36 68 24 68 20 58C14 44 18 26 30 10Z" fill="#e8f2fa" opacity=".85"/><path d="M30 64C22 80 38 92 28 110" stroke="#dde8f0" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/></svg>'
      + '</div></div>';
  };

  const PHOENIX = '<svg class="ph-bird" viewBox="0 0 400 300" aria-hidden="true" focusable="false"><path d="M188 112C160 84 120 56 70 40L84 58L54 54L74 72L40 74L66 90L34 98L66 108L44 122L80 124L64 138L104 134L96 148L150 140L184 150ZM212 112C240 84 280 56 330 40L316 58L346 54L326 72L360 74L334 90L366 98L334 108L356 122L320 124L336 138L296 134L304 148L250 140L216 150Z" fill="#ffd27a"/><path d="M200 92C214 92 222 104 220 118C224 136 220 160 210 176H190C180 160 176 136 180 118C178 104 186 92 200 92ZM200 72C210 72 214 82 212 92L200 96L188 92C186 82 190 72 200 72Z" fill="#ff7a30"/><path d="M188 80L174 88L188 89Z" fill="#ffd27a"/><path d="M200 176C194 220 170 252 140 284M200 176C206 222 230 254 262 284M200 176V294M196 72q-6 -18 0 -30M204 72q4 -16 14 -22" stroke="#ffcf6a" stroke-width="7" fill="none" stroke-linecap="round"/></svg>';
  FX.phoenix = () => `<div class="art-fx art-fx--phoenix art-fx--over"><div class="ph-burst"></div><div class="ph-rays"></div>${PHOENIX}<div class="art-amb art-embers ph-sparks">${flakes('emb', 'emb2')}</div></div>`;
  FX.dawn = () => '<div class="art-fx art-fx--dawn art-fx--hold"><div class="da-light"></div><div class="da-sun"></div></div>';

  // ---------- player tokens ----------
  const TOKEN_COLS = ['#8a2a2a', '#1e6a4a', '#2a4a8a', '#9a7a2a', '#6a2a6a', '#1e6a7a', '#a0562a', '#4a5a6a', '#9a3a5a', '#4a6a2a'];
  const escXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hashStr = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };

  function player(name, opts = {}) {
    const st = ['el', 'dermedt', 'haldoklik', 'szellem', 'bezarva'].includes(opts.status) ? opts.status : 'el';
    const p = uid();
    const letter = escXml(([...String(name || '?').trim()][0] || '?').toUpperCase());
    const col = opts.color || TOKEN_COLS[(opts.index === undefined ? hashStr(name) : opts.index) % TOKEN_COLS.length];
    const ghost = st === 'szellem';
    const frozen = st === 'dermedt';
    const fill = ghost ? 'rgba(221,232,240,.16)' : frozen ? '#4a6274' : col;
    const ring = ghost ? '#dde8f0' : frozen ? '#cfe6f6' : st === 'haldoklik' ? '#e07070' : '#d6b261';
    const ink = ghost ? '#eef6fc' : frozen ? '#eaf6fe' : '#f6f0e2';
    let s = `<defs>${rad(`${p}hi`, [[0, '#ffffff', ghost ? 0.12 : 0.32], [1, '#ffffff', 0]], 0.35, 0.3, 0.7)}</defs>`;
    s += `<circle cx="32" cy="32" r="28" fill="${fill}"${st === 'bezarva' ? ' opacity=".55"' : ''}/><circle cx="32" cy="32" r="28" fill="url(#${p}hi)"/>`;
    s += `<circle cx="32" cy="32" r="29.5" fill="none" stroke="${ring}" stroke-width="2.4"${ghost ? ' stroke-dasharray="4 3"' : ''}/>`;
    s += `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-size="29" fill="${ink}"${st === 'bezarva' ? ' opacity=".6"' : ''} style="font-family:var(--f-display,Georgia,serif)">${letter}</text>`;
    if (frozen) s += '<path d="M10 22l8 4M14 14l4 8M54 42l-8 -3M50 50l-4 -7M22 54l3 -7M44 12l-2 7" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>';
    if (st === 'haldoklik') s += '<circle class="tk-pulse" cx="32" cy="32" r="31" fill="none" stroke="#ff5a5a" stroke-width="4"/><circle cx="32" cy="32" r="28" fill="#7a0a0a" opacity=".25"/>';
    if (st === 'bezarva') s += '<path d="M18 6V58M32 4V60M46 6V58" stroke="#1a1a1a" stroke-width="5"/><path d="M18 6V58M32 4V60M46 6V58" stroke="#8a8a8a" stroke-width="1.4" opacity=".7"/><path d="M8 32H56" stroke="#1a1a1a" stroke-width="4"/>';
    return `<svg class="art-token art-token--${st}" viewBox="0 0 64 64" role="img" aria-label="${escXml(name)}">${s}</svg>`;
  }

  // ---------- scene mapping ----------
  // bg = background key, chars = up to 3 character ids (first one on the left when there are two or more),
  // fx = effects to start with the scene, patronus = optional patronus to show.
  const S = (bg, chars = [], fx = [], extra = {}) => Object.assign({ bg, chars, fx }, extra);
  CE.SCENE_ART = {
    // Prologue
    P0: S('roxfort', [], ['snow']),
    P1: S('roxfort', ['mcgonagall'], ['snow']),
    P2: S('tanterem', [], ['silver-wave']),
    P3: S('nagyterem', []),
    P4a: S('allomas', ['hagrid']),
    P4b: S('nagyterem', []),
    P4c: S('nagyterem', ['hagrid', 'flitwick']),
    P5: S('halo', []),
    // Act I: Christmas Eve
    'I-0': S('nagyterem', [], ['silver-wave'], { patronus: 'főnix' }),
    'I-A1': S('harmadik-emelet', []),
    'I-A2': S('alagut', []),
    'I-A2b': S('roxmorts', ['bellatrix', 'dementor'], ['dementor-cold']),
    'I-A3': S('harmadik-emelet', []),
    'I-B1': S('torony', [], ['frost']),
    'I-B2': S('torony', ['dementor'], ['dementor-cold', 'frost']),
    'I-B3': S('sotet-jegy', []),
    'I-C1': S('frics', ['frics']),
    'I-C2': S('frics', ['mrs-norris']),
    'I-C3': S('folyoso', ['hoborc']),
    'I-S': S('kopogtato', ['sas']),
    'I-X1': S('nagyterem', ['hagrid', 'mcgonagall', 'piton']),
    'I-X2': S('folyoso-sotet', ['dementor'], ['dementor-cold']),
    'I-X3': S('klubhelyiseg', []),
    'I-END': S('hajnal', [], ['dawn']),
    'DEMO-END': S('hajnal', []),
    // Act II: Christmas Day
    'II-0': S('halo', []),
    'II-1': S('nagyterem', ['hagrid', 'flitwick', 'piton']),
    'II-2': S('lepcso', []),
    'II-2t': S('folyoso', ['dementor'], ['dementor-cold']),
    'II-3': S('vizkopo', ['mcgonagall', 'pomfrey']),
    'II-S': S('kopogtato', ['sas']),
    'II-4': S('nagyterem', ['mcgonagall', 'hagrid']),
    'II-SPLIT': S('folyoso', []),
    'II-F1': S('fuz', [], ['blizzard']),
    'II-F2': S('szellemszallas', ['fenrir']),
    'II-V1': S('szukseg', []),
    'II-V2': S('vadkan', ['aberforth']),
    'II-H1': S('kunyho', ['agyar', 'hagrid', 'thesztral']),
    'II-H2': S('rengeteg', ['hagrid', 'akromantula'], ['snow']),
    'II-5': S('nagyterem', ['mcgonagall', 'pomfrey', 'pancel']),
    'II-6': S('klubhelyiseg', []),
    'II-END': S('roxfort-vihar', ['pancel'], ['blizzard']),
    // Act III: the siege
    'III-0': S('nagyterem', ['mcgonagall', 'pancel']),
    'III-1': S('kapu', ['hagrid', 'halalfalo', 'dementor'], ['dementor-cold']),
    'III-2': S('lepcso', ['halalfalo', 'bellatrix'], ['curse']),
    'III-3': S('nagyterem-ego', ['bellatrix'], ['fire']),
    'III-4': S('iroda', ['suveg', 'fawkes', 'bellatrix'], ['phoenix']),
    'III-5': S('lepcso', ['dementor', 'bellatrix'], ['fire', 'dementor-cold']),
    'III-6': S('hajnal', ['fawkes'], ['dawn']),
    // Epilogue
    E1: S('nagyterem-hajnal', [], ['dawn']),
    E2: S('nagyterem-hajnal', []),
    E3: S('nagyterem-hajnal', []),
    E4: S('hajnal', []),
    E5: S('iroda', [])
  };
  // Random events keep the current background (bg: null) and only bring a figure in.
  CE.EVENT_ART = {
    S1: S(null, ['hoborc']),
    S2: S(null, ['kover-dama']),
    S3: S(null, ['nick']),
    S4: S(null, ['piton']),
    S5: S(null, ['hoborc']),
    S6: S('mosdo', ['myrtle']),
    S7: S(null, ['piton']),
    S8: S(null, ['pancel'])
  };
  // Endings (ending keys of story-act3.js).
  CE.ENDING_ART = {
    aragog: S('rengeteg', ['akromantula']),
    myrtle: S('mosdo', ['myrtle']),
    ostrom: S('nagyterem-ego', ['halalfalo'], ['fire']),
    csendes_ej: S('nagyterem-hajnal', ['hagrid', 'dumbledore'], ['dawn']),
    megtort_atok: S('hajnal', [], ['silver-wave']),
    ezust_hajnal: S('hajnal', [], ['dawn', 'silver-wave']),
    fawkes_dala: S('nagyterem-hajnal', ['fawkes'], ['phoenix']),
    hamvas: S('nagyterem-hajnal', [], ['snow']),
    rossz_ember: S('frics', ['frics']),
    bellatrix: S('roxfort-vihar', ['bellatrix', 'kard'], ['blizzard'])
  };
  const DEFAULT_ART = S('nagyterem', []);

  // ---------- per-game variation ----------
  // setVariant(seed) picks one look per game: a mood tint, the snowfall, the moon, the Great Hall tree
  // style, a few Christmas decorations, an alternative (equally fitting) background for some scenes and
  // an optional canonical background figure in some empty scenes. Same seed → same look.

  // Scenes where another existing background fits the place in the story equally well (first = default).
  const ALT_BG = {
    P1: ['roxfort', 'park'], // "Roxfort, december"
    'II-0': ['halo', 'nagyterem'], // "Hálóterem, majd a Nagy Terem"
    'II-2': ['lepcso', 'folyoso'], // "A kastély"
    'II-2t': ['folyoso', 'folyoso-sotet'], // "Valahol a kastélyban" (dementor)
    E2: ['nagyterem-hajnal', 'hajnal'],
    E3: ['nagyterem-hajnal', 'hajnal'],
    E4: ['hajnal', 'nagyterem-hajnal']
  };
  // Optional background figure (null = nobody). Only canonical castle residents, only in scenes that have
  // no figure of their own: Nearly Headless Nick (Gryffindor ghost, at the feasts), Mrs Norris on patrol.
  const EXTRA_CHARS = {
    P3: [null, null, 'nick'],
    P4b: [null, 'nick'],
    'I-X3': [null, null, 'nick'],
    'II-6': [null, null, 'nick'],
    'II-SPLIT': [null, 'mrs-norris', 'nick']
  };
  const MOODS = ['night', 'moon', 'dusk', 'candle'];
  // Backgrounds with a strong colour story of their own get no mood tint.
  const NO_MOOD = ['nagyterem-ego', 'nagyterem-hajnal', 'hajnal', 'sotet-jegy'];

  // 32-bit hash finaliser, so neighbouring seeds (1, 2, 3…) give unrelated looks.
  const mix32 = (v) => {
    let h = v >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  };

  function setVariant(seed) {
    const n = Number(seed);
    if (seed === null || seed === undefined || seed === '' || !Number.isFinite(n)) {
      VAR = null;
      return null;
    }
    const rnd = prng(mix32(Math.floor(n) ^ 0x2545f491));
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const v = {
      seed: Math.floor(n),
      mood: pick(MOODS),
      weather: pick(['light', 'normal', 'normal', 'heavy']),
      moon: { phase: pick(['thin', 'crescent', 'crescent', 'full']), x: 1160 + rnd() * 250, y: 96 + rnd() * 64, side: rnd() < 0.5 ? -1 : 1, show: rnd() < 0.6 },
      trees: pick(Object.keys(TREE_STYLES)),
      decor: { wreath: rnd() < 0.65, garland: rnd() < 0.6, stockings: rnd() < 0.6, candles: rnd() < 0.6, sill: rnd() < 0.7 },
      bg: {},
      extra: {}
    };
    Object.keys(ALT_BG).forEach((id) => { v.bg[id] = pick(ALT_BG[id]); });
    Object.keys(EXTRA_CHARS).forEach((id) => { v.extra[id] = pick(EXTRA_CHARS[id]); });
    VAR = v;
    return getVariant();
  }
  // A copy of the current variant (null when none), for debugging and the gallery page.
  const getVariant = () => (VAR ? JSON.parse(JSON.stringify(VAR)) : null);

  // Decoration pieces (viewBox 0 0 1600 900).
  const HOLLY = '#1d4634';
  const BERRY = '#b83030';
  const wreath = (x, y, r) => {
    const w = r * 0.44;
    let berries = '';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3 + 0.3;
      berries += `M${n1(x + Math.cos(a) * r)} ${n1(y + Math.sin(a) * r)}h0`;
    }
    return `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="none" stroke="#12301f" stroke-width="${n1(w)}"/>`
      + `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="none" stroke="#2e6a48" stroke-width="${n1(w * 0.55)}" stroke-dasharray="${n1(r * 0.34)} ${n1(r * 0.22)}" opacity=".8"/>`
      + `<path d="${berries}" stroke="${BERRY}" stroke-width="${n1(r * 0.17)}" stroke-linecap="round"/>`
      + `<path d="M${n1(x)} ${n1(y + r)}l${n1(-r * 0.42)} ${n1(-r * 0.22)}v${n1(r * 0.44)}zM${n1(x)} ${n1(y + r)}l${n1(r * 0.42)} ${n1(-r * 0.22)}v${n1(r * 0.44)}z" fill="#a82a2a"/>`
      + `<path d="M${n1(x - r * 0.06)} ${n1(y + r)}l${n1(-r * 0.2)} ${n1(r * 0.62)}M${n1(x + r * 0.06)} ${n1(y + r)}l${n1(r * 0.2)} ${n1(r * 0.62)}" stroke="#a82a2a" stroke-width="${n1(r * 0.12)}" stroke-linecap="round"/>`;
  };
  // Holly rope between two points, sagging in the middle, a berry cluster at the lowest point.
  const garland = (x1, y1, x2, y2, sag, w) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + sag;
    const d = `M${n1(x1)} ${n1(y1)}Q${n1(mx)} ${n1(my + sag)} ${n1(x2)} ${n1(y2)}`;
    return `<path d="${d}" fill="none" stroke="${HOLLY}" stroke-width="${n1(w)}" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#2e6a48" stroke-width="${n1(w * 0.45)}" stroke-dasharray="${n1(w * 0.9)} ${n1(w * 0.8)}" opacity=".7"/>`
      + `<path d="M${n1(mx - w * 0.5)} ${n1(my)}h0M${n1(mx + w * 0.5)} ${n1(my)}h0M${n1(mx)} ${n1(my + w * 0.5)}h0" stroke="${BERRY}" stroke-width="${n1(w * 0.75)}" stroke-linecap="round"/>`;
  };
  // Christmas stocking hanging from (x, y), toe to the right.
  const stocking = (x, y, s, col) => `<g transform="translate(${n1(x)} ${n1(y)}) scale(${s})"><path d="M-11 0h22v42q0 8 8 12l12 6q8 5 2 12q-6 5 -15 1l-24 -11q-9 -5 -9 -14z" fill="${col}"/><rect x="-13" y="-2" width="26" height="11" rx="3" fill="#e8e2d4"/></g>`;
  // Candle standing on y: [body, flame + glow for a flicker layer].
  const candle = (p, x, y, h) => [
    `<rect x="${n1(x - 5)}" y="${n1(y - h)}" width="10" height="${n1(h)}" rx="2" fill="#e9dfc6"/>`,
    `${glow(p, 'gw', x, y - h - 6, 70, 70, 0.75)}${P.flame(x, y - h - 1, 1.3)}`
  ];
  // Snow drift on a window sill.
  const sill = (x, y, w) => `<path d="M${n1(x - 6)} ${n1(y + 2)}q${n1(w * 0.25)} -14 ${n1(w * 0.5 + 6)} -12q${n1(w * 0.3)} -2 ${n1(w * 0.5 + 6)} 12z" fill="#dbe6ef" opacity=".75"/>`;

  // Corridor helper: the same projection as corridor() (vanishing point 800, 440).
  const cpr = (X, Y, z) => [800 + (X - 800) / (1 + z), 440 + (Y - 440) / (1 + z)];
  function corridorDecor(o) {
    const dc = VAR.decor;
    let s = '';
    if (dc.garland) {
      const ribs = o.ribs || [0.35, 0.9, 1.6, 2.4];
      for (let i = 0; i < ribs.length - 1; i++) {
        [0, 1600].forEach((X) => {
          const a = cpr(X, 222, ribs[i]);
          const b = cpr(X, 222, ribs[i + 1]);
          s += garland(a[0], a[1], b[0], b[1], 26 / (1 + ribs[i]), 16 / (1 + ribs[i]));
        });
      }
    }
    if (dc.wreath) {
      (o.wreathSides || [0, 1600]).forEach((X) => {
        const z = o.wreathZ || 0.9;
        const [x, y] = cpr(X, 440, z);
        s += wreath(x, y, 44 / (1 + z));
      });
    }
    return [s, ''];
  }

  // Decorations per background: (p) => [static svg, flickering svg]. Only drawn with a variant.
  const DECOR = {
    nagyterem: () => [VAR.decor.wreath ? wreath(800, 288, 30) : '', ''],
    folyoso: () => corridorDecor({}),
    'harmadik-emelet': () => corridorDecor({ wreathSides: [0] }),
    vizkopo: () => corridorDecor({ wreathSides: [0] }),
    szukseg: () => corridorDecor({ ribs: [1.2, 2.2], wreathSides: [] }),
    lepcso: () => {
      if (!VAR.decor.garland) return ['', ''];
      let s = '';
      // swags hanging from the hand rails of the three fixed flights
      [[300, 260, 620, 80], [980, 80, 1300, 170], [380, 600, 760, 820]].forEach(([x1, y1, x2, y2]) => {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        s += garland(x1, y1, mx, my, 12, 9) + garland(mx, my, x2, y2, 12, 9);
      });
      return [s, ''];
    },
    kapu: () => [VAR.decor.wreath ? wreath(690, 340, 42) + wreath(910, 340, 42) : '', ''],
    klubhelyiseg: (p) => {
      const dc = VAR.decor;
      let s = '';
      let fl = '';
      if (dc.stockings) {
        [[312, '#8a1e1e'], [404, '#1d5a3a'], [516, '#8a1e1e'], [608, '#9a7a2a']].forEach(([x, col]) => { s += stocking(x, 318, 0.95, col); });
      }
      if (dc.candles) {
        [252, 668].forEach((x) => { const c = candle(p, x, 290, 34); s += c[0]; fl += c[1]; });
      }
      return [s, fl];
    },
    halo: () => [(VAR.decor.sill ? sill(680, 510, 240) : '') + (VAR.decor.wreath ? wreath(800, 330, 26) : ''), ''],
    tanterem: () => [VAR.decor.sill ? '<path d="M56 602q60 -16 118 -42v8q-58 28 -118 42z" fill="#dbe6ef" opacity=".6"/>' : '', ''],
    kunyho: (p) => {
      const dc = VAR.decor;
      let s = '';
      let fl = '';
      if (dc.garland) s += garland(944, 352, 1140, 352, 10, 12) + garland(1140, 352, 1336, 352, 10, 12);
      if (dc.candles) { const c = candle(p, 700, 700, 30); s += c[0]; fl += c[1]; }
      return [s, fl];
    }
  };

  // Variant pass over a background's layer list: decorations, mood tint, snowfall.
  function variantLayers(k, list) {
    if (!VAR) return { list, cls: '' };
    let out = list.slice();
    const q = uid();
    const dec = DECOR[k] ? DECOR[k](q) : null;
    if (dec && (dec[0] || dec[1])) {
      // static decorations sit right on the base picture, flames go to their own flickering layer
      const add = [];
      if (dec[0]) add.push(layer(dec[0]));
      if (dec[1]) add.push(layer(`<defs>${glowDefs(q)}</defs>${dec[1]}`, 'art-flicker'));
      out.splice(1, 0, ...add);
    }
    let cls = '';
    if (VAR.weather === 'heavy') {
      // a third, large-flake layer on every snowfall of the background (not on dust, ash or embers)
      out = out.map((l) => (/\bart-snow\b/.test(l) && !/art-flakes--c/.test(l) && /art-flakes--a/.test(l)
        ? l.replace(/(<i class="art-flakes art-flakes--a"><\/i>)<\/div>$/, '$1<i class="art-flakes art-flakes--c"></i></div>') : l));
      cls += ' art-wx--heavy';
    } else if (VAR.weather === 'light') cls += ' art-wx--light';
    if (VAR.mood !== 'night' && !NO_MOOD.includes(k)) out.push(`<div class="art-mood art-mood--${VAR.mood}"></div>`);
    return { list: out, cls };
  }

  // Applies the per-game background swap and background figure to a scene's art entry.
  function varied(id, a) {
    if (!VAR || !a) return a;
    const bg = VAR.bg[id];
    const extra = VAR.extra[id];
    if (!(bg && bg !== a.bg) && !extra) return a;
    const out = Object.assign({}, a);
    if (bg) out.bg = bg;
    const chars = a.chars || [];
    if (extra && CH[extra] && chars.length < 3 && !chars.includes(extra)) out.chars = chars.concat(extra);
    return out;
  }

  // ---------- public API ----------
  // Effects that tint the whole picture go under the figures; particles and flashes go over them.
  const FX_UNDER = ['dementor-cold', 'dawn'];

  function background(key) {
    const k = BG[key] ? key : 'nagyterem';
    const v = variantLayers(k, BG[k]());
    return `<div class="art-bg art-bg--${k}${v.cls}" data-bg="${k}">${v.list.join('')}<div class="art-scrim"></div></div>`;
  }

  function character(id, opts = {}) {
    const c = CH[id];
    if (!c) return '';
    const p = uid();
    const w = c.w || 200;
    // Blinking eye glints, each figure on its own rhythm.
    const rnd = prng(hashStr(`${id}:${p}`));
    const eyes = c.eyes ? `<g class="art-eyes" style="animation-duration:${(4.5 + rnd() * 3).toFixed(2)}s;animation-delay:-${(rnd() * 5).toFixed(2)}s" fill="${c.eyeCol || '#eef4f6'}">${c.eyes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${c.eyeR || 1.5}"/>`).join('')}</g>` : '';
    const inner = c.draw(p, opts) + eyes;
    const body = opts.flip ? `<g transform="translate(${w} 0) scale(-1 1)">${inner}</g>` : inner;
    const timing = `animation-duration:${(4.6 + rnd() * 2.4).toFixed(2)}s;animation-delay:-${(rnd() * 4).toFixed(2)}s`;
    return `<svg style="${timing}" class="art-char art-char--${id} ${c.anim || 'art-c--breathe'}" viewBox="0 0 ${w} 400" width="${w}" height="400" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  // Up to three figures: one → right edge; two → left + right; three → left, right, inner right.
  // Figures drawn facing left are mirrored on the left edge, so everyone faces the middle.
  function characters(ids = []) {
    const list = (ids || []).filter((id) => CH[id]).slice(0, 3);
    const slots = list.length === 1 ? ['r'] : list.length === 2 ? ['l', 'r'] : ['l', 'r', 'r2'];
    return `<div class="art-chars">${list.map((id, i) => {
      const c = CH[id];
      const cls = `art-slot art-slot--${slots[i]}${c.halo ? ' art-slot--glow' : ''}`;
      const style = c.halo ? ` style="--halo:${c.halo}"` : '';
      return `<div class="${cls}" data-char="${id}"${style}>${character(id, { flip: slots[i] === 'l' && c.facing !== 'front' })}</div>`;
    }).join('')}</div>`;
  }

  const NAMES = {
    mcgonagall: /McGonagall/, dumbledore: /Dumbledore(?! irod)/, hagrid: /Hagrid/, piton: /Piton/, frics: /Frics/,
    flitwick: /Flitwick/, pomfrey: /Pomfrey/, bellatrix: /Bellatrix/, fenrir: /Fenrir|Greyback/, aberforth: /Aberforth/,
    myrtle: /Myrtle/, nick: /Nick\b/, hoborc: /Hóborc/, dementor: /dementor|rongyos alak/i, fawkes: /Fawkes|főnix/i,
    'mrs-norris': /Mrs\. Norris/, 'kover-dama': /Kövér Dáma/, halalfalo: /halálfaló/i, thesztral: /thesztrál/i, agyar: /Agyar/,
    akromantula: /akromantula|pók/i, pancel: /páncél/i, sas: /sas\b/i, suveg: /Teszlek Süveg|süveg/i, kard: /kard/i
  };

  // Highlights the figures the given text mentions (they light up and lean in); the others dim a little.
  function spotlight(root, text) {
    if (!root || typeof document === 'undefined') return [];
    const slots = [...root.querySelectorAll('.art-slot[data-char]')];
    const hit = slots.filter((s) => NAMES[s.dataset.char] && NAMES[s.dataset.char].test(text || ''));
    slots.forEach((s) => {
      s.classList.toggle('art-speaking', hit.includes(s));
      s.classList.toggle('art-quiet', hit.length > 0 && !hit.includes(s));
    });
    return hit.map((s) => s.dataset.char);
  }

  function patronus(animal, opts = {}) {
    const f = PAT[animal];
    if (!f) return '';
    const p = uid();
    return `<div class="art-patronus${opts.small ? ' art-patronus--small' : ''}" data-patronus="${animal}">${f(p)}</div>`;
  }

  function effect(name, opts = {}) {
    const f = FX[name];
    return f ? f(opts) : '';
  }

  // DOM helper: adds the effect to el and removes it after it has played (looping / holding effects stay).
  // Under-text effects are inserted right after the existing art nodes (so the narration stays on top),
  // tinting effects right after the background (under the figures), flashes (.art-fx--over) at the end.
  function play(el, name, opts = {}) {
    if (!el || !FX[name] || typeof document === 'undefined') return null;
    const tpl = document.createElement('template');
    tpl.innerHTML = effect(name, opts).trim();
    const node = tpl.content.firstElementChild;
    if (!node) return null;
    const kids = Array.prototype.slice.call(el.children);
    const bgs = kids.filter((k) => k.classList.contains('art-bg'));
    const arts = kids.filter((k) => /\bart-(bg|chars|fx)\b/.test(k.className) && !k.classList.contains('art-fx--over'));
    if (node.classList.contains('art-fx--over')) el.appendChild(node);
    else if (FX_UNDER.includes(name) && bgs.length) el.insertBefore(node, bgs[bgs.length - 1].nextSibling);
    else if (arts.length) el.insertBefore(node, arts[arts.length - 1].nextSibling);
    else el.insertBefore(node, el.firstChild);
    const ms = FX_DURATION[name];
    if (ms) setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, ms + 150);
    return node;
  }

  const forScene = (id) => varied(id, CE.SCENE_ART[id] || CE.EVENT_ART[id] || DEFAULT_ART);
  const forEnding = (key) => CE.ENDING_ART[key] || S('hajnal', []);
  const forEvent = (id) => CE.EVENT_ART[id] || S(null, []);

  // Everything a scene needs, in paint order: background, tinting effects, figures, other effects, patronus.
  function scene(id, opts = {}) {
    const a = forScene(id);
    const bg = a.bg || opts.fallbackBg || 'nagyterem';
    const fx = a.fx || [];
    const under = fx.filter((n) => FX_UNDER.includes(n)).map((n) => effect(n)).join('');
    const over = fx.filter((n) => !FX_UNDER.includes(n)).map((n) => effect(n)).join('');
    return background(bg) + under + characters(a.chars) + over + (a.patronus ? patronus(a.patronus, { small: true }) : '');
  }

  CE.art = {
    background, character, characters, patronus, effect, play, player, forScene, forEnding, forEvent, scene, spotlight, NAMES,
    setVariant, getVariant,
    BACKGROUNDS: Object.keys(BG),
    CHARACTERS: Object.keys(CH),
    PATRONUSES: Object.keys(PAT),
    EFFECTS: Object.keys(FX),
    FX_DURATION,
    FX_UNDER
  };
})(window.CE = window.CE || {});
