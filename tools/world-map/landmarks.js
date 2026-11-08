// Field Atlas landmarks: the places a field leaves on the land, each with a reason to exist. Drawn as plain shapes with clear silhouettes, so a paint model has something solid to work from.
// Each draws around its base centre (0,0), about 150 units wide, y up is negative. place: land | coast | river | high | sea.
(function (root) {
  const TAU = Math.PI * 2, INK = '#2a2015';
  const trace = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); };
  const poly = (g, pts, fill, lw = 2.2, stroke = INK) => { trace(g, pts); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  const line = (g, pts, stroke = INK, lw = 2) => { trace(g, pts); g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); };
  const circ = (g, x, y, r, fill, lw = 2, stroke = INK) => { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  const ell = (g, x, y, rx, ry, fill, lw = 2, stroke = INK) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  const bolt = (g, x, y, dy, col = '#f3d65c') => poly(g, [[x, y], [x - 8, y + dy * .45], [x + 1, y + dy * .42], [x - 6, y + dy], [x + 11, y + dy * .36], [x + 3, y + dy * .38], [x + 9, y]], col, 1.6);
  const smoke = (g, x, y, n, r) => { const ps = []; let sy = y, sx = x, rad = 6; for (let i = 0; i < n; i++) { ps.push([sx, sy, rad]); sy -= rad * 1.1; sx += (r() - .3) * 8; rad *= 1.14; } for (const [a, b, c] of ps) circ(g, a, b, c + 1.5, INK, 0, null); for (const [a, b, c] of ps) circ(g, a, b, c, '#b5afa6', 0, null); for (const [a, b, c] of ps) circ(g, a - c * .25, b - c * .25, c * .5, '#dcd6cc', 0, null); };
  const cloud = (g, x, y, s = 1) => { const ps = [[-30, 4, 16], [-8, -8, 22], [18, -5, 18], [36, 5, 12], [6, 8, 18]].map(([a, b, c]) => [x + a * s, y + b * s, c * s]); for (const [a, b, c] of ps) circ(g, a, b, c + 2, INK, 0, null); for (const [a, b, c] of ps) circ(g, a, b, c, '#5f6580', 0, null); for (const [a, b, c] of ps) circ(g, a - 3 * s, b - 5 * s, c * .55, '#8d93aa', 0, null); };
  const crystal = (g, x, y, w, h, lean, a = '#d85cc0', b = '#8f2d86') => { poly(g, [[x + lean, y - h], [x + w, y - h * .2], [x + w * .6, y], [x - w * .6, y], [x - w, y - h * .2]], a, 1.8); poly(g, [[x + lean, y - h], [x + w, y - h * .2], [x + w * .6, y], [x + w * .1, y]], b, 1.8); };

  const LANDMARKS = [
    // ---- Cold ----
    { id: 'glacier', k: 'cold', name: 'The Glacier', place: 'coast', rad: 17, why: 'Cold pushes ice down to the sea: the field at its most visible.', draw(g) {
      poly(g, [[-95, -20], [-74, -82], [-34, -116], [20, -108], [72, -72], [98, -16], [60, 2], [32, -8], [2, 8], [-34, -4], [-64, 8]], '#e4f0f5');
      poly(g, [[20, -108], [72, -72], [98, -16], [60, 2], [40, -40]], '#b4d3e2', 2);
      for (const p of [[[-50, -80], [-34, -40], [-44, -6]], [[-10, -96], [4, -50], [-6, -2]], [[34, -74], [46, -36], [36, -6]]]) line(g, p, '#5f8ca6', 3);
      for (let i = 0; i < 6; i++) poly(g, [[-82 + i * 30, 6], [-74 + i * 30, -8 - (i % 2) * 10], [-62 + i * 30, 6]], '#cfe4ec', 1.6);
    } },
    { id: 'frozen-colossus', k: 'cold', name: 'The Frozen Colossus', place: 'land', rad: 15, why: 'Something huge the ice took long ago. Every northern story starts here.', draw(g) {
      poly(g, [[-64, 0], [-74, -70], [-40, -128], [26, -138], [70, -88], [68, 0]], '#bddfec');
      poly(g, [[-40, 0], [-44, -48], [-22, -66], [-18, -92], [16, -92], [20, -66], [44, -48], [40, 0]], '#54707f');
      circ(g, -1, -108, 18, '#54707f'); poly(g, [[-22, -120], [-14, -136], [-8, -122], [0, -140], [8, -122], [14, -136], [22, -120]], '#7f99a6', 1.6);
      line(g, [[-68, -100], [-30, -80], [-14, -112]], '#eaf6fb', 3); line(g, [[58, -30], [26, -52], [46, -96]], '#eaf6fb', 3);
    } },
    { id: 'aurora-spire', k: 'cold', name: 'The Aurora Spire', place: 'high', rad: 13, why: 'A needle of ice where the Cold field surfaces and lights the sky.', draw(g) {
      for (const [c, y0] of [['rgba(120,230,170,.75)', -140], ['rgba(150,120,240,.7)', -116], ['rgba(100,200,230,.65)', -92]]) { g.beginPath(); g.moveTo(-90, y0 + 18); g.bezierCurveTo(-46, y0 - 44, -6, y0 + 40, 44, y0 - 10); g.bezierCurveTo(66, y0 - 34, 84, y0 - 10, 96, y0 - 26); g.strokeStyle = c; g.lineWidth = 15; g.stroke(); }
      poly(g, [[0, -150], [18, -36], [34, 0], [-34, 0], [-16, -40]], '#d4ebf3'); poly(g, [[0, -150], [18, -36], [34, 0], [4, 0]], '#90b9cd', 2);
    } },
    { id: 'ice-ship', k: 'cold', name: 'The Ice-Locked Ship', place: 'coast', rad: 14, why: 'The last expedition north. A place to find out how far anyone got.', draw(g) {
      poly(g, [[-86, 6], [-58, -18], [-16, -10], [28, -22], [78, -12], [90, 8], [42, 12], [-30, 12]], '#d4e7ef');
      g.save(); g.translate(-4, -16); g.rotate(-.16);
      poly(g, [[-58, -22], [-48, -36], [-30, -32], [28, -28], [52, -44], [46, -6], [26, 8], [-42, 8]], '#5b3a24');
      line(g, [[-8, -30], [-8, -110]], INK, 3.5); line(g, [[22, -32], [28, -78], [42, -98]], INK, 3);
      poly(g, [[-8, -100], [-38, -82], [-34, -44], [-8, -40]], '#d9ccb0', 1.8); poly(g, [[-8, -92], [18, -70], [14, -46], [-8, -48]], '#c6b896', 1.8);
      g.restore();
    } },
    // ---- Fire ----
    { id: 'caldera', k: 'fire', name: 'The Cauldron', place: 'high', rad: 16, why: 'A lava lake in a broken crater: the well of a fire region, seen from far off.', draw(g) {
      poly(g, [[-98, 2], [-74, -44], [-50, -30], [-30, -66], [0, -46], [32, -72], [56, -36], [76, -50], [100, 4], [50, 14], [-44, 14]], '#59443e');
      ell(g, 0, -20, 66, 24, '#2a1410'); ell(g, 0, -20, 58, 18, '#ff8a2c'); ell(g, -6, -22, 36, 10, '#ffd36b', 0, null);
      for (const [x, y] of [[-28, -20], [24, -24], [6, -14]]) ell(g, x, y, 7, 3, '#fff0b2', 0, null);
    } },
    { id: 'great-forge', k: 'fire', name: 'The Great Forge', place: 'land', rad: 16, why: 'Smiths settle on a swell of fire. This is the most famous of them.', draw(g, r) {
      poly(g, [[-96, 0], [-96, -32], [96, -32], [96, 0]], '#6a5a54'); poly(g, [[-70, -32], [-70, -66], [72, -66], [72, -32]], '#7a6962'); poly(g, [[-40, -66], [-40, -96], [44, -96], [44, -66]], '#8a7a72');
      for (const [x, y, w, h] of [[-78, -24, 18, 24], [-38, -24, 18, 24], [8, -24, 18, 24], [54, -24, 18, 24], [-50, -60, 14, 22], [-8, -60, 14, 22], [34, -60, 14, 22]]) poly(g, [[x, y + h], [x, y + 8], [x + w / 2, y], [x + w, y + 8], [x + w, y + h]], '#ff9a3c', 1.6);
      for (const x of [-26, 26]) { poly(g, [[x - 8, -96], [x - 6, -132], [x + 6, -132], [x + 8, -96]], '#4a3a36'); smoke(g, x, -138, 5, r); }
    } },
    { id: 'basalt-steps', k: 'fire', name: 'The Basalt Steps', place: 'coast', rad: 14, why: 'Cooled lava in rows of hexagons, a stair built by the field itself.', draw(g) {
      const cols = [[-74, 34, 16], [-52, 62, 18], [-28, 92, 16], [-4, 116, 18], [22, 84, 18], [46, 56, 16], [68, 30, 16]];
      for (const [x, h, w] of cols) { poly(g, [[x - w * .5, 0], [x - w * .5, -h], [x + w * .5, -h], [x + w * .5, 0]], '#4d4145'); ell(g, x, -h, w * .5, w * .24, '#7b6d70', 1.6); poly(g, [[x + w * .08, 0], [x + w * .08, -h + 3], [x + w * .5, -h + 3], [x + w * .5, 0]], '#35292e', 0, null); }
    } },
    { id: 'ember-tree', k: 'fire', name: 'The Ember Tree', place: 'land', rad: 13, why: 'A tree burning for longer than anyone remembers, and still not gone.', draw(g, r) {
      poly(g, [[-16, 0], [-10, -66], [-44, -96], [-30, -102], [-6, -82], [-4, -122], [10, -122], [10, -84], [40, -112], [50, -100], [14, -62], [18, 0]], '#2a1f1f');
      line(g, [[-2, -6], [3, -50], [-8, -84]], '#ff9038', 3); line(g, [[3, -50], [36, -96]], '#ff7a2c', 2.4); line(g, [[-6, -74], [-30, -94]], '#ffa44c', 2);
      for (let i = 0; i < 14; i++) circ(g, -46 + r() * 94, -150 + r() * 80, 1.5 + r() * 2.2, '#ffb648', 0, null);
    } },
    // ---- Water ----
    { id: 'great-falls', k: 'water', name: 'The Great Falls', place: 'river', rad: 15, why: 'Where a river breaks over the land, and the Water field runs strong.', draw(g) {
      poly(g, [[-98, 2], [-84, -66], [-44, -96], [-16, -86], [18, -92], [58, -96], [90, -60], [100, 2]], '#6e6a62');
      poly(g, [[-18, -88], [18, -90], [28, -2], [-28, -2]], '#a5d4e4');
      for (const x of [-12, 0, 12]) line(g, [[x, -86], [x * 1.3, -4]], '#eaf7fb', 2.6);
      ell(g, 0, 2, 54, 12, '#6da3b8'); for (const [x, y, c] of [[-26, -4, 8], [-8, -8, 10], [12, -8, 9], [28, -4, 7]]) circ(g, x, y, c, '#f0fafc', 1.4);
    } },
    { id: 'tide-mills', k: 'water', name: 'The Tide Mills', place: 'river', rad: 13, why: 'Mills on every channel: where Water meets people, the oldest towns grow.', draw(g) {
      ell(g, 0, 2, 92, 13, '#6da3b8');
      for (const x of [-56, 40]) { circ(g, x, -24, 26, '#7a5a38', 2.2); for (let a = 0; a < 6; a++) line(g, [[x, -24], [x + Math.cos(a * Math.PI / 3) * 26, -24 + Math.sin(a * Math.PI / 3) * 26]], INK, 2.2); circ(g, x, -24, 6, '#5b3a24', 1.6); }
      poly(g, [[-28, 0], [-28, -56], [14, -56], [14, 0]], '#e0d6bc'); poly(g, [[-36, -56], [-7, -92], [22, -56]], '#2f6f9e');
    } },
    { id: 'drowned-city', k: 'water', name: 'The Drowned City', place: 'land', rad: 15, why: 'Water took it, and the towers still stand in the fen.', draw(g) {
      ell(g, 0, 0, 96, 16, '#5d9aa8');
      for (const [x, h, lean] of [[-54, 74, .08], [-14, 118, -.05], [32, 92, .12], [70, 56, -.1]]) { g.save(); g.translate(x, 0); g.rotate(lean); poly(g, [[-12, 4], [-12, -h], [12, -h], [12, 4]], '#8a8b86'); poly(g, [[-15, -h], [0, -h - 30], [15, -h], [15, -h - 4]], '#3f6a7c'); for (let y = -h + 10; y < -8; y += 22) poly(g, [[-5, y + 10], [-5, y + 3], [5, y + 3], [5, y + 10]], '#39424a', 1.2); g.restore(); }
      ell(g, 0, 0, 96, 16, null, 2.2);
    } },
    { id: 'maelstrom', k: 'water', name: 'The Maelstrom', place: 'sea', rad: 15, why: 'The sea’s own well: ships route around it, and that’s how the routes began.', draw(g) {
      ell(g, 0, 0, 100, 30, '#2f6c82');
      for (let turn = 0; turn < 3; turn++) { g.beginPath(); for (let t = 0; t < 1; t += .02) { const a = t * TAU * 2.1 + turn * 2.09, R = t * 96; g.lineTo(Math.cos(a) * R, Math.sin(a) * R * .3); } g.strokeStyle = 'rgba(232,244,244,.85)'; g.lineWidth = 3; g.stroke(); }
      ell(g, 0, 0, 13, 5, '#163c4a');
    } },
    // ---- Lightning ----
    { id: 'rod-fields', k: 'lightning', name: 'The Rod Fields', place: 'land', rad: 15, why: 'Rows of masts catching storms: the start of rudimentary electricity.', draw(g) {
      const xs = [-82, -54, -26, 2, 30, 58, 84], hs = [74, 96, 64, 112, 80, 104, 66];
      xs.forEach((x, i) => { line(g, [[x, 0], [x, -hs[i]]], INK, 3.5); line(g, [[x - 9, -hs[i] + 14], [x + 9, -hs[i] + 14]], INK, 2.5); circ(g, x, -hs[i] - 2, 3.5, '#d9b34a', 1.4); });
      bolt(g, -40, -126, 56); bolt(g, 34, -128, 60);
      for (let i = 0; i < xs.length - 1; i += 2) line(g, [[xs[i], -hs[i]], [xs[i + 1], -hs[i + 1]]], '#e8d76a', 1.8);
    } },
    { id: 'coil-tower', k: 'lightning', name: 'The Coil Tower', place: 'high', rad: 13, why: 'The field stored and sent down a wire to the next town.', draw(g) {
      poly(g, [[-28, 0], [-10, -112], [10, -112], [28, 0]], '#6f7180');
      for (const y of [-92, -72, -52, -32, -12]) { const w = 11 + (-y) * -.09 + 22; ell(g, 0, y, Math.max(12, w), 5, '#b6894a', 1.8); }
      circ(g, 0, -126, 15, '#c9c6d6', 2.2); circ(g, -4, -130, 5, '#fff', 0, null);
      for (const [a, b] of [[-46, -146], [44, -150], [-58, -106], [56, -102]]) line(g, [[0, -126], [a * .55, (b - 126) / 2 + 2], [a, b]], '#f3d65c', 2.2);
    } },
    { id: 'storm-eye', k: 'lightning', name: 'The Storm Eye', place: 'high', rad: 16, why: 'A storm that never moves on. The heartland of the field.', draw(g) {
      poly(g, [[-92, 0], [-40, -62], [-14, -42], [12, -74], [52, -40], [92, 0]], '#6c6878');
      cloud(g, -36, -118, 1.2); cloud(g, 42, -122, 1.3); cloud(g, 2, -134, 1.45);
      g.beginPath(); for (let t = 0; t < 1; t += .02) { const a = t * TAU * 2.2, R = 8 + t * 42; g.lineTo(Math.cos(a) * R, -128 + Math.sin(a) * R * .36); } g.strokeStyle = '#c9cce0'; g.lineWidth = 2.6; g.stroke();
      bolt(g, -22, -104, 62); bolt(g, 34, -104, 68);
    } },
    { id: 'glass-scar', k: 'lightning', name: 'The Glass Scar', place: 'land', rad: 13, why: 'Where the strikes land the ground turns to glass spires.', draw(g) {
      ell(g, 0, 0, 92, 18, '#4a4560');
      for (const [x, h, w, l] of [[-54, 58, 11, 6], [-24, 92, 15, -8], [12, 116, 17, 7], [46, 76, 13, -6], [74, 40, 9, 4]]) crystal(g, x, -2, w, h, l, '#b7e3ec', '#6ba8bb');
    } },
    // ---- Earth ----
    { id: 'red-mesas', k: 'earth', name: 'The Red Mesas', place: 'land', rad: 17, why: 'Earth laid bare in bands, with the mines dug into its flanks.', draw(g) {
      const m = (x, w, h, a, b) => { poly(g, [[x - w, 0], [x - w * .68, -h], [x + w * .68, -h], [x + w, 0]], a); for (const f of [.3, .6]) line(g, [[x - w + (1 - f) * w * .32, -h * f], [x + w - (1 - f) * w * .32, -h * f]], b, 2.4); };
      m(-52, 40, 58, '#c97f4c', '#7e4422'); m(44, 56, 96, '#b96d3e', '#6e3a1e'); poly(g, [[12, -96], [16, -106], [74, -106], [78, -96]], '#dba273');
    } },
    { id: 'deep-mine', k: 'earth', name: 'The Deep Mine', place: 'land', rad: 16, why: 'A pit cut down through the strata, and the town that lives on it.', draw(g) {
      for (const [ry, rx, c] of [[34, 104, '#9c7a52'], [26, 80, '#7f5f3f'], [18, 58, '#5f4630'], [10, 32, '#3a2a1e']]) ell(g, 0, -8, rx, ry, c);
      poly(g, [[-92, -14], [-68, -94], [-58, -94], [-34, -14]], null, 3.5); line(g, [[-82, -48], [-44, -48]], INK, 3); circ(g, -63, -100, 10, '#caa26a', 2.2); line(g, [[-63, -100], [-8, -10]], INK, 1.6);
    } },
    { id: 'carved-faces', k: 'earth', name: 'The Carved Faces', place: 'high', rad: 16, why: 'Whoever carved them worked with the mountain. Nobody says who.', draw(g) {
      poly(g, [[-104, 0], [-86, -112], [-34, -132], [28, -126], [86, -112], [104, 0]], '#85817a');
      for (const x of [-42, 42]) { poly(g, [[x - 26, -18], [x - 28, -82], [x - 12, -106], [x + 12, -106], [x + 28, -82], [x + 26, -18], [x, -6]], '#a9a498'); for (const e of [-12, 12]) ell(g, x + e, -72, 6, 3.5, '#39342c', 1.2); poly(g, [[x, -70], [x - 5, -44], [x + 5, -44]], '#8f8a7e', 1.3); line(g, [[x - 12, -32], [x + 12, -32]], INK, 2.5); }
    } },
    { id: 'stone-arch', k: 'earth', name: 'The Stone Arch', place: 'coast', rad: 14, why: 'A span the sea and wind left behind, an easy mark on any chart.', draw(g) {
      g.beginPath(); g.moveTo(-90, 0); g.lineTo(-84, -86); g.quadraticCurveTo(-40, -130, 44, -120); g.quadraticCurveTo(86, -110, 92, -64); g.lineTo(94, 0); g.lineTo(58, 0); g.lineTo(52, -56); g.quadraticCurveTo(0, -94, -46, -50); g.lineTo(-54, 0); g.closePath(); g.fillStyle = '#b58d5e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
      line(g, [[-72, -40], [-56, -92], [-14, -112]], '#7e5f3a', 2.6); line(g, [[58, -40], [72, -86]], '#7e5f3a', 2.6);
    } },
    // ---- Life ----
    { id: 'elder-tree', k: 'life', name: 'The Elder Tree', place: 'land', rad: 18, why: 'One tree a whole region grew around. The heart of the Life field.', draw(g) {
      poly(g, [[-46, 2], [-22, -18], [-16, -74], [16, -74], [24, -18], [52, 2], [18, -2], [0, 4], [-20, -2]], '#6a4a2c');
      const cs = [[0, -130, 40], [-48, -112, 32], [48, -112, 32], [-26, -84, 28], [28, -86, 30], [-72, -88, 22], [70, -88, 22]];
      for (const [x, y, r] of cs) circ(g, x, y, r + 2, INK, 0, null); for (const [x, y, r] of cs) circ(g, x, y, r, '#4e8a34', 0, null); for (const [x, y, r] of cs) circ(g, x - 6, y - 8, r * .55, '#7fb84c', 0, null);
      for (const [x, y] of [[-30, -130], [24, -146], [46, -98], [-54, -96]]) circ(g, x, y, 4.5, '#f2d14e', 1.2);
    } },
    { id: 'terraces', k: 'life', name: 'The Terraces', place: 'land', rad: 16, why: 'Farms on the wet hills: where Water and Life feed everyone else.', draw(g) {
      const bands = [[-60, 96, '#b7c760'], [-42, 84, '#8fb04a'], [-24, 74, '#c7cf76'], [-6, 64, '#7fa546'], [12, 54, '#a7bd5c']];
      for (const [y, w, c] of bands) { g.beginPath(); g.moveTo(-w, y + 22); g.quadraticCurveTo(0, y - 30, w, y + 22); g.quadraticCurveTo(0, y - 2, -w, y + 22); g.closePath(); g.fillStyle = c; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); }
    } },
    { id: 'giant-blooms', k: 'life', name: 'The Giant Blooms', place: 'land', rad: 13, why: 'Plants that grow past all sense when the field is strong enough.', draw(g, r) {
      for (const [x, h, c] of [[-54, 74, '#e27aa8'], [0, 118, '#f2a64a'], [52, 88, '#a26be0']]) { line(g, [[x, 0], [x + (r() - .5) * 18, -h]], '#3f7a2f', 5); const cx = x, cy = -h - 14; for (let a = 0; a < 7; a++) { g.save(); g.translate(cx, cy); g.rotate(a * TAU / 7); ell(g, 0, -18, 10, 18, c, 1.7); g.restore(); } circ(g, cx, cy, 11, '#f5dd76', 1.8); }
      for (let i = 0; i < 8; i++) ell(g, -74 + i * 22, -3, 15, 6, '#5a8f3c', 1.6);
    } },
    { id: 'swallowed-temple', k: 'life', name: 'The Swallowed Temple', place: 'land', rad: 15, why: 'Stone doesn’t last long where Life is strong.', draw(g) {
      poly(g, [[-92, 0], [-92, -14], [92, -14], [92, 0]], '#8f9085'); for (const x of [-68, -24, 24, 68]) { poly(g, [[x - 11, -14], [x - 11, -86], [x + 11, -86], [x + 11, -14]], '#a9a99c'); line(g, [[x - 7, -80], [x + 2, -50], [x - 5, -18]], '#3f7a2f', 3.5); }
      poly(g, [[-96, -86], [-96, -102], [96, -102], [96, -86]], '#8f9085'); poly(g, [[-98, -102], [0, -148], [98, -102]], '#7f8074');
      for (const [x, y, c] of [[-74, -106, 20], [-30, -124, 18], [50, -116, 22], [84, -96, 14], [-90, -60, 14]]) { circ(g, x, y, c + 2, INK, 0, null); circ(g, x, y, c, '#5c9440', 0, null); }
    } },
    // ---- Arcane ----
    { id: 'hanging-isles', k: 'arcane', name: 'The Hanging Isles', place: 'land', rad: 17, why: 'The ground that came loose where the field tore the crust.', draw(g) {
      ell(g, 0, 0, 90, 16, '#2f1f3c'); ell(g, 0, 0, 56, 9, '#a04ec0', 0, null);
      const isle = (x, y, w, h) => { poly(g, [[x - w, y], [x + w, y], [x + w * .7, y + h * .45], [x + w * .2, y + h], [x - w * .4, y + h * .5], [x - w * .8, y + h * .3]], '#6b5a4a'); poly(g, [[x - w, y], [x - w * .9, y - 8], [x + w * .9, y - 8], [x + w, y]], '#7fa84e'); };
      isle(-46, -84, 36, 34); isle(40, -126, 42, 42); isle(30, -40, 24, 22);
      for (const [x, y, r] of [[-78, -48, 6], [-8, -116, 5], [78, -74, 7], [-18, -40, 4]]) circ(g, x, y, r, '#8a6bb0', 1.6);
    } },
    { id: 'crystal-spires', k: 'arcane', name: 'The Crystal Spires', place: 'land', rad: 14, why: 'The deep field, gone solid and pushing up through the ground.', draw(g) {
      for (const [x, w, h, l] of [[-62, 15, 76, 8], [-30, 19, 126, -8], [8, 23, 156, 8], [44, 17, 104, -6], [74, 12, 62, 5]]) crystal(g, x, 0, w, h, l);
    } },
    { id: 'unmade-tower', k: 'arcane', name: 'The Unmade Tower', place: 'land', rad: 13, why: 'A tower in pieces that never finished falling.', draw(g) {
      const seg = (y, h, w, off) => { poly(g, [[off - w, y], [off - w, y - h], [off + w, y - h], [off + w, y]], '#a8a1b2'); poly(g, [[off - 6, y - h * .3], [off - 6, y - h * .7], [off + 6, y - h * .7], [off + 6, y - h * .3]], '#3a2f48', 1.4); };
      poly(g, [[-34, 0], [-28, -42], [30, -42], [34, 0]], '#8f8799'); seg(-62, 34, 26, 8); seg(-112, 28, 23, -12); poly(g, [[-38, -152], [6, -196], [32, -150]], '#7a3a9a', 2.2);
      for (const [x, y, r] of [[-56, -86, 7], [54, -116, 8], [-52, -140, 5]]) poly(g, [[x - r, y], [x, y - r], [x + r, y], [x, y + r]], '#b9a8c8', 1.6);
    } },
    { id: 'mirror-lake', k: 'arcane', name: 'The Mirror', place: 'land', rad: 15, why: 'A perfect circle of water holding a sky that isn’t this one.', draw(g, r) {
      ell(g, 0, -4, 100, 30, '#7a7188'); ell(g, 0, -4, 86, 24, '#17102e');
      for (let i = 0; i < 26; i++) { const a = r() * TAU, d = Math.sqrt(r()) * .92; circ(g, Math.cos(a) * d * 86, -4 + Math.sin(a) * d * 24, .9 + r() * 1.5, '#f3e6ff', 0, null); }
      for (const [x, y] of [[-96, -8], [96, -8], [-54, -28], [54, -28]]) poly(g, [[x - 5, y + 6], [x - 3, y - 30], [x + 4, y - 30], [x + 6, y + 6]], '#9c94a8', 1.8);
    } },
    // ---- Where two fields meet ----
    { id: 'steam-fields', k: 'water', also: 'fire', name: 'The Steam Fields', place: 'land', rad: 15, confluence: true, why: 'Fire under Water: hot springs, geysers, and the first engines.', draw(g, r) {
      ell(g, 0, 0, 92, 15, '#6f9aa8');
      for (const [x, h] of [[-54, 30], [-2, 44], [48, 24]]) { poly(g, [[x - 26, 2], [x - 8, -h], [x + 8, -h], [x + 26, 2]], '#8c7768'); ell(g, x, -h, 8, 3.5, '#d6f0f4', 1.5); smoke(g, x, -h - 10, 6, r); }
    } },
    { id: 'storm-marsh', k: 'water', also: 'lightning', name: 'The Storm Marsh', place: 'land', rad: 15, confluence: true, why: 'Rain and lightning together, the way you said they go.', draw(g) {
      for (const [x, y, rx] of [[-52, -2, 34], [28, 4, 44], [-6, -16, 24]]) ell(g, x, y, rx, 9, '#6aa0a8', 1.8);
      for (const x of [-84, -58, -34, -10, 14, 40, 66, 86]) line(g, [[x, 2], [x + 3, -20], [x + 6, -26]], '#4f6e3a', 2.6);
      cloud(g, -22, -98, 1.15); cloud(g, 34, -104, 1.05); bolt(g, -30, -78, 66); bolt(g, 32, -84, 72);
    } },
    { id: 'arc-foundry', k: 'fire', also: 'lightning', name: 'The Arc Foundry', place: 'land', rad: 16, confluence: true, why: 'Lightning-fed furnaces: the most industrial place in the world.', draw(g, r) {
      poly(g, [[-90, 0], [-90, -40], [86, -40], [86, 0]], '#5e5560');
      for (const x of [-68, -42, -16, 12, 38, 64]) poly(g, [[x, 0], [x, -24], [x + 18, -24], [x + 18, 0]], '#ff9a3c', 1.6);
      for (const x of [-60, -24]) { poly(g, [[x - 8, -40], [x - 5, -92], [x + 7, -92], [x + 9, -40]], '#3f3840'); smoke(g, x, -98, 4, r); }
      poly(g, [[44, -40], [54, -116], [62, -116], [72, -40]], '#6f7180'); for (let y = -60; y > -112; y -= 16) ell(g, 58, y, 15, 4, '#b6894a', 1.6); circ(g, 58, -128, 12, '#c9c6d6', 2); line(g, [[58, -128], [24, -110], [-8, -128]], '#f3d65c', 2.4);
    } },
    { id: 'lantern-road', k: 'cold', also: 'water', name: 'The Lantern Road', place: 'land', rad: 15, confluence: true, why: 'A frozen river used as a highway, lit so no one walks off it.', draw(g) {
      g.beginPath(); g.moveTo(-104, 2); g.quadraticCurveTo(-30, -34, 104, -18); g.lineTo(104, -2); g.quadraticCurveTo(-26, -12, -104, 18); g.closePath(); g.fillStyle = '#cfe4ec'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      for (const [x, y] of [[-84, 2], [-40, -12], [6, -16], [52, -14], [92, -8]]) { line(g, [[x, y], [x, y - 40]], INK, 3); circ(g, x, y - 44, 6.5, '#ffd77a', 1.8); for (let i = 0; i < 3; i++) poly(g, [[x + 7 + i * 6, y + 4], [x + 11 + i * 6, y - 6 - i * 3], [x + 15 + i * 6, y + 4]], '#a8a39a', 1.2); }
    } },
  ];
  // What each one is, for the paint prompt: enough that an image model doesn't reinterpret the shape.
  const LOOKS = {
    'glacier': 'a glacier meeting the sea',
    'frozen-colossus': 'a crowned figure inside a block of ice',
    'aurora-spire': 'a needle of ice with faint aurora light behind it',
    'ice-ship': 'an abandoned ship stuck in sea ice',
    'caldera': 'a crater holding a lava lake',
    'great-forge': 'a stepped stone foundry with furnace doors and two chimneys',
    'basalt-steps': 'natural dark basalt columns, not buildings',
    'ember-tree': 'a dead tree with glowing cracks, no leaves',
    'great-falls': 'a waterfall over a cliff',
    'tide-mills': 'a mill with two waterwheels',
    'drowned-city': 'ruined towers standing in shallow water',
    'maelstrom': 'a whirlpool',
    'rod-fields': 'rows of thin iron lightning rods, not trees or crosses',
    'coil-tower': 'a metal tesla tower, not a lighthouse',
    'storm-eye': 'a spiral storm cloud over a dark peak',
    'glass-scar': 'a crater with spikes of natural glass',
    'red-mesas': 'flat-topped red rock mesas',
    'deep-mine': 'an open-pit mine with a wooden hoist',
    'carved-faces': 'two faces carved into a cliff',
    'stone-arch': 'a natural rock arch, not a building',
    'elder-tree': 'one old tree, a little taller than the forest around it',
    'terraces': 'farm terraces on a hillside, not a rainbow',
    'giant-blooms': 'three tall flowers, pink, orange and violet',
    'swallowed-temple': 'a columned temple overgrown with trees',
    'hanging-isles': 'small rocks with grass on top, floating over a glowing crater',
    'crystal-spires': 'a cluster of magenta crystals',
    'unmade-tower': 'a tower in separate floating sections, with gaps between them',
    'mirror-lake': 'a round black lake with stars in it, not a hole',
    'steam-fields': 'geysers venting white steam, no lava',
    'storm-marsh': 'a reedy marsh under a storm cloud',
    'arc-foundry': 'a factory with chimneys and a tesla tower',
    'lantern-road': 'a frozen river lined with lantern posts',
  };
  for (const l of LANDMARKS) l.looks = LOOKS[l.id];
  root.FieldLandmarks = LANDMARKS;
})(window);
